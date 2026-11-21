import type {AppModel} from '../app/model.svelte';
import {Lifetime} from '../transport/lifetime';
import {api2,backupUploadMedia,type Schemas} from '../transport/api2';
import {download} from '../transport/download';
export class BackupsModel {
 rows=$state<any[]>([]);busy=$state(false);readonly life:Lifetime;
 constructor(readonly app:AppModel){this.life=new Lifetime(app.session);app.register(()=>{this.life.dispose();this.rows=[];this.busy=false;});}
 async load(){await this.life.run('list',signal=>this.app.api.service({signal}),data=>{this.app.service=data;this.rows=data.backup_exists?[{id:'saved'}]:[];},e=>this.app.notice=e.message);}
 async mutate(action:'create'|'restore'|'delete',id='saved'){
  if(this.busy||!this.app.canMutate)return;
  if(action==='restore'&&!confirm('Заменить пользовательские данные сохранённой копией? Пароль и настройки установки сохраняются.'))return;
  if(action==='delete'&&!confirm('Удалить сохранённую резервную копию?'))return;
  this.busy=true;
  const path=api2+'/backup'+(action==='restore'?'/restore':'');
  await this.life.run('mutation',signal=>this.app.api.sendJson(action==='delete'?'DELETE':'POST',path,undefined,{signal}),data=>{
   this.busy=false;this.app.notice=action==='create'?'Резервная копия создана':'Операция выполнена';this.rows=action==='delete'?[]:[{id:'saved',...(action==='create'?data:{})}];this.app.refresh();
   if(action==='restore'){for(const cb of this.app.candidateListeners)cb();this.app.refreshPresets();this.app.history();}
  },e=>{this.busy=false;this.app.notice=e.message;});
 }
 async download(id='saved'){await this.life.run('download',signal=>this.app.api.blob(api2+'/backup/file',{signal}),({blob})=>download(blob,'gp-backup.zip'),e=>this.app.notice=e.message);}
 async upload(file:File|undefined){if(!file||this.busy||!this.app.canMutate)return;if(file.size>64*1024*1024){this.app.notice='Архив превышает64МиБ';return;}if(!confirm('Восстановить пользовательские данные из выбранного файла? Пароль сохраняется.'))return;this.busy=true;
  await this.life.run('mutation',async signal=>{
   const response=await this.app.api.request(api2+'/backup/restore-file',{method:'POST',headers:{'Content-Type':backupUploadMedia},body:file,signal,keepSessionSignal:true});
   try{const data=await response.json();this.app.api.assertResponseCurrent(response);if(!response.ok)throw this.app.api.jsonError(response,data);return data;}finally{this.app.api.releaseResponse(response);}
  },()=>{this.busy=false;this.app.notice='Данные восстановлены из файла';this.load();this.app.refreshPresets();this.app.history();for(const cb of this.app.candidateListeners)cb();},e=>{this.busy=false;this.app.notice=e.message;});
 }
}
