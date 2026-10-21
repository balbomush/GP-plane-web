import type {AppModel} from '../app/model.svelte';
import {Lifetime} from '../transport/lifetime';
import {endpoints as E,url} from '../transport/endpoints';
import {domains} from '../domain/finder';

/** Preset identities retain scope, kind and name; all pages are read before editing. */
export class ListsModel {
  scope=$state('finder'); selection=$state(''); name=$state(''); text=$state(''); query=$state('');
  busy=$state(false); loading=$state(false); catalog=$state<any[]>([]); categoryQuery=$state(''); categories=$state<string[]>([]);
  preview=$state<string[]>([]); source=$state(''); categoryBusy=$state(false); previewBusy=$state(false); original=$state<string[]>([]);
  readonly life:Lifetime;
  private revision=0;
  constructor(readonly app:AppModel){this.life=new Lifetime(app.session);app.register(()=>this.reset());}
  reset(){this.life.dispose();this.revision++;this.scope='finder';this.selection='';this.name='';this.text='';this.query='';this.original=[];this.catalog=[];this.categories=[];this.categoryQuery='';this.preview=[];this.source='';this.busy=false;this.loading=false;this.categoryBusy=false;this.previewBusy=false;}
  edit(){this.revision++;this.life.cancel('file');}
  choiceChanged(){this.life.cancel('preview');this.preview=[];this.previewBusy=false;}
  get sourceBusy(){return this.categoryBusy||this.previewBusy;}
  ownCustom(scope:string,key:string){const name=key.slice(7);return key.startsWith('custom:')&&Boolean(this.app.presets.custom?.[scope]?.[name]||this.app.presets.metadata?.[scope]?.[name]);}
  sourceScope(scope:string,name:string){return this.ownCustom(scope,'custom:'+name)?scope:this.ownCustom(scope==='finder'?'common':'finder','custom:'+name)?scope==='finder'?'common':'finder':scope;}
  entries(scope=this.scope,includeFallback=false) {
    const p=this.app.presets, entries:any[]=[];
    for(const [kind,data,meta] of [['system',p.system,p.system_metadata],['custom',p.custom,p.metadata]] as any[]) {
      const names=new Set([...Object.keys(data?.[scope]||{}),...Object.keys(meta?.[scope]||{})]);
      for(const name of names)entries.push({key:`${kind}:${name}`,name,kind:kind==='custom'?'user':kind,scope,label:meta?.[scope]?.[name]?.label||name});
    }
    for(const name of Object.keys(p.domain_sets||{}))entries.push({key:`builtin:${name}`,name,kind:'builtin',scope,label:name});
    if(includeFallback)for(const item of this.entries(scope==='finder'?'common':'finder').filter(item=>item.kind==='user'))if(!entries.some(entry=>entry.key===item.key))entries.push({...item});
    if(!entries.some(entry=>entry.key==='builtin:all'))entries.push({key:'builtin:all',name:'all',kind:'builtin',scope,label:'Все встроенные'});
    return entries;
  }
  async read(key:string,scope:string,signal:AbortSignal) {
    const split=key.indexOf(':'),kind=key.slice(0,split),name=key.slice(split+1);
    if(kind==='builtin')return domains(name==='all'?Object.values(this.app.presets.domain_sets||{}).flat() as string[]:this.app.presets.domain_sets?.[name]||[]);
    const actualKind=kind==='custom'?'user':kind;
    if(actualKind==='user')scope=this.sourceScope(scope,name);
    let offset=0, values:string[]=[];
    for(let guard=0;guard<1000;guard++){
      const page=await this.app.api.getJson(url(E.web.presetDomains,{scope,name,kind:actualKind,include_disabled:0,limit:500,offset}),{signal});
      const rows=page.domains||[];values.push(...rows.map(row=>row.domain));
      if(!page.has_more)return domains(values);
      if(!rows.length)throw new Error('Core вернул пустую незавершённую страницу списка');
      offset+=rows.length;
    }
    throw new Error('Список превышает предел загрузки; сохранение усечённых данных запрещено');
  }
  async load() {
    const key=this.selection,scope=this.scope;if(!key)return;
    const revision=++this.revision;this.loading=true;
    await this.life.run('editor',signal=>this.read(key,scope,signal),values=>{this.loading=false;if(revision!==this.revision)return;this.name=key.slice(key.indexOf(':')+1);this.original=values;this.text=values.join('\n');},e=>{this.app.notice=e.message;this.loading=false;});
  }
  async useFinder(key:string) {
    if(key==='custom')return;
    await this.life.run('finder-preset',signal=>this.read(key,'finder',signal),values=>{
      if(this.app.preferences.domain_preset===key)this.app.domainText=values.join('\n');
    },e=>{this.app.notice=e.message;});
  }
  async saveCurrent(scope:string,name:string,text:string){
    if(!this.app.canMutate)return;
    name=name.trim();const values=domains(text);
    if(!name||!values.length){this.app.notice='Укажите название и хотя бы один домен';return;}
    await this.life.run('save-current:'+scope,signal=>this.app.api.postJson(E.web.presetSave,{scope,name,domains:values},{signal}),data=>{
      this.app.presets=data;this.app.notice='Список сохранён';
      if(scope==='finder'&&this.app.domainText===text)this.app.preferences.domain_preset='custom:'+name;
    },e=>{this.app.notice=e.message;});
  }
  async deleteCurrent(scope:string,key:string){
    if(!this.app.canMutate||!this.ownCustom(scope,key))return;
    const name=key.slice(7);
    if(!confirm(`Удалить пользовательский список «${name}»?`))return;
    await this.life.run('delete-current:'+scope,signal=>this.app.api.postJson(E.web.presetDeleteUserLists,{scope,name},{signal}),data=>{
      this.app.presets=data;this.app.notice='Список удалён';
      if(scope==='finder'&&this.app.preferences.domain_preset===key)this.app.preferences.domain_preset='custom';
    },e=>{this.app.notice=e.message;});
  }
  newList(){this.revision++;this.life.cancel('editor');this.life.cancel('file');this.selection='';this.name='';this.text='';this.original=[];this.loading=false;}
  get changes(){const next=domains(this.text),before=new Set(this.original);return {total:next.length,added:next.filter(x=>!before.has(x)).length,removed:this.original.filter(x=>!next.includes(x)).length,unchanged:next.filter(x=>before.has(x)).length};}
  async save() {
    if(this.busy||!this.app.canMutate)return;
    const name=this.name.trim();if(!name){this.app.notice='Укажите название списка';return;}
    const kind=this.selection.startsWith('system:')&&name===this.selection.slice(7)?'system':'user';
    if(kind==='user'&&!domains(this.text).length){this.app.notice='Оставьте хотя бы один домен';return;}
    this.busy=true;
    const scope=this.scope,values=domains(this.text),revision=this.revision;
    await this.life.run('mutation',signal=>this.app.api.postJson(E.web.presetSave,{scope,name,kind,domains:values},{signal}),data=>{
      this.app.presets=data;if(revision===this.revision){this.selection=`${kind==='system'?'system':'custom'}:${name}`;this.original=values;}this.busy=false;this.app.notice='Список сохранён';
    },e=>{this.app.notice=e.message;this.busy=false;});
  }
  async remove() {
    if(this.busy||!this.app.canMutate||!this.selection.startsWith('custom:'))return;
    const name=this.selection.slice(7),scope=this.scope,revision=this.revision;
    if(!confirm(`Удалить пользовательский список «${name}»?`))return;
    this.busy=true;
    await this.life.run('mutation',signal=>this.app.api.postJson(E.web.presetDeleteUserLists,{scope,name},{signal}),data=>{
      this.app.presets=data;this.busy=false;if(revision===this.revision)this.newList();this.app.notice='Список удалён';
    },e=>{this.app.notice=e.message;this.busy=false;});
  }
  async loadCatalog(update=false) {
    this.categoryBusy=true;
    await this.life.run('catalog',async signal=>{
      if(update)await this.app.api.postJson(E.service.v2flyUpdateLocalStorage,{},{signal});
      return this.app.api.getJson(url(E.core.v2flyCategories,{limit:5000}),{signal});
    },data=>{this.catalog=data.categories||[];this.source=data.storage?.source||'';this.categoryBusy=false;},e=>{this.app.notice=e.message;this.categoryBusy=false;});
  }
  async previewCategories() {
    const categories=[...this.categories],query=this.categoryQuery;this.previewBusy=true;
    await this.life.run('preview',async signal=>{
      const values:string[]=[];for(const category of categories){const data=await this.app.api.getJson(url(E.core.v2flyCategoryDomains,{category}),{signal});values.push(...(data.domains||[]));}return domains(values);
    },values=>{this.previewBusy=false;if(query===this.categoryQuery&&JSON.stringify(categories)===JSON.stringify(this.categories))this.preview=values;},e=>{this.app.notice=e.message;this.previewBusy=false;});
  }
  importPreview(replace=false){this.edit();this.text=domains(replace?this.preview:[...domains(this.text),...this.preview]).join('\n');this.app.notice='Предпросмотр перенесён в редактор. Для сохранения нажмите «Сохранить».';}
}
