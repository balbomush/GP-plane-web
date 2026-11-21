import {ApiClient} from '../api-client.js';import {SessionController} from '../session-controller.js';import {gpClient} from '../transport/gp-client';import {GpSession} from '@gp-plane/gp-ui/api2';
export class Shell {
 token=$state('');ready=$state(false);error=$state('');loginBusy=$state(false);tab=$state('search');
 private readonly accessKey:string|null;
 readonly api:ApiClient;readonly auth:SessionController;readonly client;gp=$state<GpSession>(null!);
 constructor(){
  const target=document.querySelector<HTMLMetaElement>('meta[name=gp-core-target]')?.content;
  this.accessKey=target&&/^[0-9a-f]{64}$/.test(target)?'gp-tab-access:'+target:null;
  this.api=new ApiClient({getToken:()=>this.token,getEpoch:()=>this.auth.epoch(),isEpochCurrent:e=>this.auth.isCurrent(e),getSignal:()=>this.auth.signal(),onUnauthorized:()=>this.auth.logout('Сессия завершена. Войдите снова.')});this.client=gpClient(this.api);this.gp=new GpSession(this.client);
  this.auth=new SessionController({api:this.api,token:{store:data=>this.storeAccess(data),clear:()=>this.clearAccess()},ui:{begin:()=>{this.gp.dispose();this.gp=new GpSession(this.client);this.ready=false;this.error='';},boot:state=>{if(state==='failed')this.error='Не удалось прочитать Core. Повторите попытку.';},ready:()=>{this.ready=true;this.gp.start();},login:message=>{this.gp.dispose();this.ready=false;this.error=message||'';this.tab='search';},load:signal=>this.client.getCoreStatus({}, {signal}),apply:data=>{this.gp.status=data;this.gp.statusFresh=true;}}});
 }
 private storeAccess(data:{bearer_token:string;expires_at:string}){
  this.token=data.bearer_token;
  if(this.accessKey)try{
   sessionStorage.setItem(this.accessKey,JSON.stringify({token:data.bearer_token,expiresAt:data.expires_at}));
  }catch{/* Storage can be unavailable; the in-memory session still works. */}
 }
 private clearAccess(){
  this.token='';
  if(this.accessKey)try{sessionStorage.removeItem(this.accessKey);}catch{/* See storeAccess. */}
 }
 async restore(){
  if(!this.accessKey||this.loginBusy)return;
  let access:{token?:unknown;expiresAt?:unknown}|null=null;
  try{access=JSON.parse(sessionStorage.getItem(this.accessKey)||'null');}catch{/* Invalid storage is unauthenticated. */}
  if(!access||typeof access.token!=='string'||!access.token||
     typeof access.expiresAt!=='string'||!(Date.parse(access.expiresAt)>Date.now())){
   this.clearAccess();
   return;
  }
  this.token=access.token;
  this.loginBusy=true;
  try{
   await this.auth.bootstrap(signal=>this.client.getCoreStatus({}, {signal}),status=>{
    this.gp.status=status;
    this.gp.statusFresh=true;
   });
  }finally{this.loginBusy=false;}
 }
 async login(username:string,password:string){if(this.loginBusy)return;this.error=[!username?'Введите логин':'',!password?'Введите пароль':''].filter(Boolean).join(' · ');if(this.error)return;this.loginBusy=true;try{await this.auth.login({username,password},e=>this.error=e.message);}finally{this.loginBusy=false;}}
 dispose(){this.auth.dispose();this.gp.dispose();}
}
