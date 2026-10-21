import type {AppModel} from '../app/model.svelte';
import {Lifetime} from '../transport/lifetime';
import {endpoints as E,url} from '../transport/endpoints';
import {download} from '../transport/download';

export class BackupsModel {
  rows=$state<any[]>([]);busy=$state(false);readonly life:Lifetime;
  constructor(readonly app:AppModel){this.life=new Lifetime(app.session);app.register(()=>{this.life.dispose();this.rows=[];this.busy=false;});}
  async load(){await this.life.run('list',signal=>this.app.api.getJson(E.core.backupsList,{signal}),data=>{this.rows=(data.snapshots||data.backups||[]).map(item=>({...item,id:String(item.id||item.snapshot_id||'')}));},e=>{this.app.notice=e.message;});}
  async mutate(action:'create'|'restore'|'delete',id=''){
    if(this.busy)return;
    if(action==='restore'&&!confirm(`Восстановить данные из бекапа ${id}? Будут заменены найденные стратегии и связи стратегия-домен. Пользовательские пресеты не меняются.`))return;
    if(action==='delete'&&!confirm(`Удалить бекап ${id}? Архив и файлы бекапа будут удалены.`))return;
    this.busy=true;
    const endpoint={create:E.core.backupsCreate,restore:E.core.backupsRestore,delete:E.core.backupsDelete}[action];
    await this.life.run('mutation',signal=>this.app.api.postJson(endpoint,id?{snapshot_id:id}:{},{signal}),data=>{
      this.busy=false;this.app.notice=data.queued?'Операция ожидает завершения подбора':'Операция с бекапом выполнена';this.load();
      if(action==='restore'){for(const callback of this.app.candidateListeners)callback();this.app.refresh();}
    },e=>{this.busy=false;this.app.notice=e.code==='runtime_busy'?'Подбор идёт. Операция доступна после остановки или завершения.':e.message;});
  }
  async download(id:string){await this.life.run('download',signal=>this.app.api.blob(url(E.core.backupsDownloadArchive,{snapshot_id:id}),{signal}),({blob,response})=>{
    const match=/filename="?([^";]+)"?/i.exec(response.headers.get('Content-Disposition')||'');download(blob,match?.[1]||`gp-backup-${id}.zip`);
  },e=>{this.app.notice=e.message;});}
  async upload(file:File|undefined){
    if(!file||this.busy)return;if(file.size>64*1024*1024){this.app.notice='Архив превышает 64 МиБ';return;}
    this.busy=true;
    await this.life.run('mutation',async signal=>{
      const response=await this.app.api.request(E.core.backupsUpload,{method:'POST',headers:{'Content-Type':'application/zip'},body:file,signal,keepSessionSignal:true});
      try {let data;try{data=await response.json();}catch(error){throw this.app.api.bodyError(response,error);}this.app.api.assertResponseCurrent(response);if(!response.ok)throw this.app.api.jsonError(response,data);return data;}
      finally{this.app.api.releaseResponse(response);}
    },()=>{this.busy=false;this.app.notice='Архив загружен';this.load();},e=>{this.busy=false;this.app.notice=e.message;});
  }
}
