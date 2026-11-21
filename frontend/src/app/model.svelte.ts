import {SessionController} from '../session-controller.js';
import {RealtimeController} from '../transport/realtime-controller.js';
import {Lifetime} from '../transport/lifetime';
import {CoreApi,api2,id,runView,type Schemas} from '../transport/api2';
import {initialPreferences,discoveryPayload,normalizePreferences} from '../domain/finder';

export class AppModel {
 token=$state('');ready=$state(false);boot=$state('idle');error=$state('');notice=$state('Готово');
 tab=$state('finder');connected=$state(false);loginBusy=$state(false);refreshBusy=$state(false);
 runStarting=$state(false);stopBusy=$state(false);historyBusy=$state(false);logBusy=$state(false);historical=$state(false);
 candidateDomainCount=$state(0);preferences=$state(initialPreferences());domainText=$state('');settings=$state<any>({});
 presets=$state<Schemas['DomainList'][]>([]);
 view=$state<any>({status:null,finderRuns:[],finderRunTotal:0,finderRunOffset:0,finderRunHasMore:false,finderLog:null,acknowledgedRun:null});
 service=$state<Schemas['CoreStatus']|null>(null);search=$state<Schemas['CurrentSearch']|null>(null);
 private searchRevision=0;private refreshAgain=false;
 private disposers=new Set<()=>void>();candidateListeners=new Set<(version?:any)=>void>();
 readonly api:CoreApi;readonly session:SessionController;readonly realtime:RealtimeController;readonly life:Lifetime;
 constructor(){
  this.api=new CoreApi({getToken:()=>this.token,getEpoch:()=>this.session.epoch(),isEpochCurrent:e=>this.session.isCurrent(e),getSignal:()=>this.session.signal(),onUnauthorized:()=>this.session.logout('Сессия завершена. Войдите снова.')});
  this.realtime=new RealtimeController({api:this.api,url:()=>api2+'/search/events',onEvent:(event,data)=>this.event(event,data),onConnection:v=>this.connected=v,fallback:()=>this.refresh(),isActive:()=>this.ready&&Boolean(this.token)});
  this.session=new SessionController({api:this.api,realtime:this.realtime,token:{store:data=>this.token=data.bearer_token,clear:()=>this.token=''},ui:{
   begin:()=>{this.ready=false;this.reset();this.boot='loading';this.error='';},boot:state=>{this.boot=state;if(state==='failed')this.error='Не удалось загрузить Core. Повторите запрос.';},ready:()=>{this.ready=true;this.boot='ready';},
   login:message=>{this.ready=false;this.boot='idle';this.error=message||'';this.reset();},load:signal=>this.bootstrap(signal),apply:data=>this.applyBootstrap(data)}});
  this.life=new Lifetime(this.session);
 }
 register(dispose:()=>void){this.disposers.add(dispose);return()=>this.disposers.delete(dispose);}
 reset(){this.life?.dispose();for(const f of this.disposers)f();this.tab='finder';this.notice='Готово';this.searchRevision++;this.refreshAgain=false;this.service=null;this.search=null;this.view={status:null,finderRuns:[],finderRunTotal:0,finderRunOffset:0,finderRunHasMore:false,finderLog:null,acknowledgedRun:null};this.presets=[];this.settings={};this.domainText='';this.preferences=initialPreferences();this.historical=false;this.runStarting=false;this.stopBusy=false;this.historyBusy=false;this.logBusy=false;this.refreshBusy=false;this.candidateDomainCount=0;}
 dispose(){this.session.logout();this.realtime.dispose();this.life.dispose();this.disposers.clear();}
 async lists(signal?:AbortSignal){let items:Schemas['DomainList'][]=[];for(let offset=0;offset<200000;){const p=await this.api.domainLists(offset,{signal});items.push(...p.items);offset+=p.items.length;if(offset>=p.total)return items;if(!p.items.length)throw new Error('Незавершённая страница списков');}throw new Error('Слишком много списков');}
 async bootstrap(signal:AbortSignal){return Promise.all([this.api.service({signal}),this.api.current({signal}),this.api.runs(0,{signal}),this.lists(signal)]);}
 applyBootstrap([service,search,history,lists]){this.service=service;this.mergeStatus(search);this.mergeHistory(history,false);this.presets=lists;if(search.run)this.refreshLog();}
 get busy(){return Boolean(this.search?.active||this.view.acknowledgedRun||this.runStarting);}
 get current(){return this.view.acknowledgedRun||this.view.status?.current_run||null;}
 get systemKnown(){return this.service!==null;}
 get systemReady(){return this.service?.storage==='ready';}
 get diagnostics(){return [{label:'Хранилище Core',ok:this.systemReady,message:this.service?.storage||''}];}
 get canMutate(){return this.systemReady&&!this.service?.busy&&!this.busy;}
 applyPreferences(saved:any){this.preferences={...initialPreferences(),...saved};this.domainText=Array.isArray(saved.domains)?saved.domains.join('\n'):'';}
 async login(username:string,password:string){if(this.loginBusy)return;this.loginBusy=true;this.error='';try{await this.session.login({username,password},e=>this.error=e.message);}finally{this.loginBusy=false;}}
 async retry(){await this.session.bootstrap(signal=>this.bootstrap(signal),data=>this.applyBootstrap(data));}
 async copy(text:string){await this.life.run('copy',()=>navigator.clipboard.writeText(text),()=>this.notice='Скопировано',e=>this.notice=e.message);}
 mergeStatus(value:Schemas['CurrentSearch']){this.search=value;const r=value.run;this.view.status={current_run:value.active&&r?{...r,run_id:r.id}:null,storage:this.service?.storage};if(r&&this.view.acknowledgedRun?.run_id===r.id)this.view.acknowledgedRun=null;}
 mergeHistory(data:Schemas['RunPage'],more:boolean,background=false){const rows=data.items.map(runView);const accepted=this.view.acknowledgedRun?.run_id;if(accepted&&rows.some(r=>r.id===accepted&&['stopped','completed','failed'].includes(r.status)))this.view.acknowledgedRun=null;const merged=more?[...this.view.finderRuns,...rows]:background?[...rows,...this.view.finderRuns]:rows;this.view.finderRuns=merged.filter((row,index)=>merged.findIndex(other=>other.id===row.id)===index);this.view.finderRunTotal=data.total;this.view.finderRunOffset=background?Math.max(this.view.finderRunOffset,data.offset+data.items.length):data.offset+data.items.length;this.view.finderRunHasMore=this.view.finderRunOffset<data.total;}
 async refresh(){if(!this.ready)return;if(this.refreshBusy){this.refreshAgain=true;return;}const revision=this.searchRevision;this.refreshBusy=true;await this.life.run('refresh',signal=>Promise.all([this.api.service({signal}),this.api.current({signal}),this.api.runs(0,{signal})]),([service,search,history])=>{if(revision===this.searchRevision){this.service=service;this.mergeStatus(search);}else this.refreshAgain=true;this.mergeHistory(history,false,true);this.refreshBusy=false;this.error='';if(!this.historical)this.refreshLog();if(this.refreshAgain){this.refreshAgain=false;this.refresh();}},e=>{this.error=e.message;this.refreshBusy=false;});}
 async refreshPresets(){await this.life.run('presets',signal=>this.lists(signal),data=>this.presets=data,e=>this.notice=e.message);}
 async history(more=false){this.historyBusy=true;await this.life.run('history',signal=>this.api.runs(more?this.view.finderRunOffset:0,{signal}),data=>{this.mergeHistory(data,more);this.historyBusy=false;},e=>{this.notice=e.message;this.historyBusy=false;});}
 async refreshLog(runId?:string){const rid=runId||this.search?.run?.id||this.view.finderRuns[0]?.id;if(!rid){this.view.finderLog=null;return;}this.logBusy=true;this.historical=Boolean(runId);await this.life.run('log',async signal=>{const [run,page]=await Promise.all([this.api.run(rid,{signal}),this.api.getJson(api2+'/data/runs/'+id(rid)+'/log?limit=200',{signal})]);return {run,page};},({run,page})=>{const progress=this.search?.run?.id===rid?this.search?.run?.progress:null;this.view.finderLog={...run,run_id:run.id,text:page.entries.map(e=>e.message).join('\n'),log_tail:page.entries.map(e=>e.message).join('\n'),truncated:page.truncated,next_after:page.next_after,progress:progress||{},run_settings:run.parameters,error:run.error};this.logBusy=false;},e=>{this.logBusy=false;this.notice=e.message;});}
 async start(){if(this.busy)return;let body;try{body=discoveryPayload(normalizePreferences(this.preferences),this.domainText);}catch(e){this.notice=(e as Error).message;return;}const selected=this.presets.find(p=>String(p.id)===this.preferences.domain_preset.split(':')[1]);if(selected)(body as any).domain_list_id=selected.id;this.runStarting=true;const path=this.preferences.run_mode==='multi'?'blockcheck2-gp':'blockcheck2';await this.life.run('start',signal=>this.api.postJson(api2+'/engines/'+path+'/start',body,{signal}),data=>{this.runStarting=false;this.view.acknowledgedRun={run_id:data.id,status:data.status};this.historical=false;this.notice='Запуск подтверждён: '+data.id;this.refresh();},e=>{this.runStarting=false;this.notice=e.message;});}
 async stop(){if(this.stopBusy)return;this.stopBusy=true;await this.life.run('stop',signal=>this.api.postJson(api2+'/search/stop',undefined,{signal}),data=>{this.stopBusy=false;this.view.acknowledgedRun=null;this.notice=data.run?'Подбор остановлен':'Активного подбора нет';this.refresh();},e=>{this.stopBusy=false;this.notice=e.message;});}
 async resume(row:any){if(this.busy||!row.resume_available||row.engine?.code!=='blockcheck2-gp')return;this.runStarting=true;await this.life.run('start',signal=>this.api.postJson(api2+'/engines/blockcheck2-gp/runs/'+id(row.id)+'/resume',undefined,{signal}),data=>{this.runStarting=false;this.view.acknowledgedRun={run_id:data.id,status:data.status};this.historical=false;this.notice='Продолжение подтверждено';this.refresh();},e=>{this.runStarting=false;this.notice=e.message;});}
 repeat(row:any){if(!row.parameters||!row.domains){this.notice='Полные параметры исторического запуска неизвестны';return;}this.applyPreferences({...row.parameters,domains:row.domains,domain_preset:'custom',run_mode:row.engine?.code==='blockcheck2-gp'?'multi':'standard'});this.tab='finder';this.notice='Параметры перенесены. Запустите вручную.';}
 event(event:string,raw:string){if(event!=='search')return;let data;try{data=JSON.parse(raw);}catch{return;}this.searchRevision++;this.mergeStatus(data);if(!this.historical)this.refreshLog();if(!data.active){this.refresh();for(const f of this.candidateListeners)f();}}
}
