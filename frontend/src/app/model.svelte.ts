import {mergeLogPayload} from '../domain/log.js';
import {ApiClient} from '../api-client.js';
import {SessionController} from '../session-controller.js';
import {RealtimeController} from '../transport/realtime-controller.js';
import {RunState} from '../domain/run-state.js';
import {Lifetime} from '../transport/lifetime';
import {endpoints as E, url} from '../transport/endpoints';
import {initialPreferences, discoveryPayload, normalizePreferences, domains} from '../domain/finder';
import {runSettings} from '../domain/settings';
import {latestById} from '../domain/history';

export class AppModel {
  token = $state(''); ready = $state(false); boot = $state('idle'); error = $state(''); notice = $state('Готово');
  candidateDomainCount=$state(0);
  tab = $state('finder'); connected = $state(false); refreshBusy = $state(false); loginBusy=$state(false);
  view = $state<any>({status: null, finderRuns: [], finderRunTotal: 0, finderRunOffset: 0, finderRunHasMore: false,
    finderLog: null, acknowledgedRun: null, startRequestInFlight: false});
  preferences = $state(initialPreferences()); domainText = $state(''); settings = $state<any>({}); presets = $state<any>({});
  runStarting = $state(false); stopBusy = $state(false); historyBusy = $state(false); logBusy = $state(false);
  historical = $state(false); private disposers = new Set<() => void>();
  private statusRetry:ReturnType<typeof setTimeout>|undefined; private statusRetries=0;
  readonly api: any; readonly session: any; readonly realtime: any; readonly run: any; readonly life: Lifetime;
  constructor() {
    this.api = new ApiClient({getToken:()=>this.token, getEpoch:()=>this.session.epoch(),
      isEpochCurrent:e=>this.session.isCurrent(e),getSignal:()=>this.session.signal(),
      onUnauthorized:()=>this.session.logout('Сессия завершена. Войдите снова.')});
    this.realtime = new RealtimeController({api:this.api,url:()=>E.web.eventsStream,
      onEvent:(event,data)=>this.event(event,data),onConnection:v=>{this.connected=v;},
      fallback:()=>this.refresh(),isActive:()=>this.ready && Boolean(this.token)});
    this.session = new SessionController({api:this.api,realtime:this.realtime,
      token:{store:data=>{this.token=data.access_token;},clear:()=>{this.token='';}},
      ui:{begin:()=>{this.ready=false;this.reset();this.boot='loading';this.error='';},boot:state=>{this.boot=state;if(state==='failed')this.error='Не удалось загрузить Core. Повторите запрос.';},
        ready:()=>{this.ready=true;this.boot='ready';},login:message=>{this.ready=false;this.boot='idle';this.error=message||'';this.reset();},
        load:signal=>this.bootstrap(signal),apply:data=>this.applyBootstrap(data)}});
    this.run = new RunState(this.view); this.life = new Lifetime(this.session);
  }
  register(dispose: () => void) { this.disposers.add(dispose); return () => this.disposers.delete(dispose); }
  reset() {
    clearTimeout(this.statusRetry);this.statusRetry=undefined;this.statusRetries=0;
    this.life?.dispose(); this.run?.resetForSession(); for(const dispose of this.disposers)dispose();
    this.tab='finder';this.notice='Готово';this.candidateDomainCount=0;this.view.status=null;this.view.finderRuns=[];this.view.finderRunTotal=0;this.view.finderRunOffset=0;this.view.finderRunHasMore=false;this.settings={};this.presets={};this.domainText='';this.preferences=initialPreferences();this.historical=false;
    this.runStarting=false;this.stopBusy=false;this.refreshBusy=false;this.historyBusy=false;this.logBusy=false;this.loginBusy=false;
  }
  dispose() { this.session.logout(); this.realtime.dispose(); this.life.dispose(); this.disposers.clear(); }
  async bootstrap(signal: AbortSignal) {
    let timeout:ReturnType<typeof setTimeout>;
    try{return await Promise.race([Promise.all([this.api.getJson(E.web.status,{signal}),this.api.getJson(url(E.web.runHistoryPage,{limit:50,offset:0}),{signal}),
      this.api.getJson(E.core.latestLog,{signal}),this.api.getJson(E.web.presets,{signal}),this.api.getJson(E.core.runSettings,{signal})]),
      new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Bootstrap timed out')),15000);})]);}
    finally{clearTimeout(timeout!);}
  }
  applyBootstrap([status,history,log,presets,settings]) {
    this.run.mergeHistory(history,true,latestById); this.run.mergeStatus(status);this.mergeLog(log,false);
    this.presets=presets;this.settings=settings.settings||settings; this.applyPreferences(status.run_preferences||{});
    this.scheduleStatusRetry();
  }
  applyPreferences(saved: any) {
    this.preferences={...initialPreferences(),enable_ipv6:Boolean(this.settings.enable_ipv6),
      debug_stdout:Boolean(this.settings.debug_stdout),curl_max_time:this.settings.curl_max_time||2,curl_max_time_quic:this.settings.curl_max_time_quic||2,curl_max_time_doh:this.settings.curl_max_time_doh||2,curl_parallelism:this.settings.curl_parallelism_default||4,...saved};
    this.domainText=Array.isArray(saved.domains)?saved.domains.join('\n'):'';
  }
  get busy() { return Boolean(this.view.acknowledgedRun || this.view.status?.current_run || this.view.startRequestInFlight); }
  get current() { return this.view.acknowledgedRun || this.view.status?.current_run || null; }
  get systemKnown(){return Boolean(this.view.status?.zapret2 && typeof this.view.status.zapret2==='object');}
  get diagnostics(){const z=this.view.status?.zapret2||{};return z.diagnostics?.length?z.diagnostics:[{label:'движок применения стратегии',ok:Boolean(z.nfqws2_found)},{label:'проверка стратегий',ok:Boolean(z.blockcheck_found)},{label:'служба с повышенными правами',ok:Boolean(z.root_helper_ready),message:z.root_helper_error||''}];}
  get systemReady(){return this.systemKnown&&this.diagnostics.every(item=>item.ok);}
  get canMutate(){return this.systemKnown&&!this.busy;}
  scheduleStatusRetry(){
    if(this.systemKnown){clearTimeout(this.statusRetry);this.statusRetry=undefined;this.statusRetries=0;return;}
    if(this.statusRetry||this.statusRetries>=3)return;
    this.statusRetries++;this.statusRetry=setTimeout(()=>{this.statusRetry=undefined;if(this.ready)this.refresh();},750);
  }
  async login(username: string,password: string) { if(this.loginBusy)return;this.loginBusy=true;this.error='';try{await this.session.login({username,password},e=>{this.error=e.message;});}finally{this.loginBusy=false;} }
  async copy(text:string){await this.life.run('copy',()=>navigator.clipboard.writeText(text),()=>{this.notice='Скопировано';},e=>{this.notice=`Не удалось скопировать: ${e.message}`;});}
  async retry() { await this.session.bootstrap(signal=>this.bootstrap(signal),data=>this.applyBootstrap(data)); }
  mergeLog(log: any, incremental = false, request?: any) {
    return this.run.acceptLog(log,incremental,mergeLogPayload,request);
  }
  async refresh() {
    if(this.refreshBusy || !this.ready)return;
    this.refreshBusy=true;
    await this.life.run('refresh',signal=>Promise.all([this.api.getJson(E.web.status,{signal}),
      this.api.getJson(url(E.web.runHistoryPage,{limit:50,offset:0}),{signal})]),([status,history])=>{
      this.run.mergeHistory(history,true,latestById);this.run.mergeStatus(status);this.refreshBusy=false;
      this.error='';this.scheduleStatusRetry();if(!this.historical)this.refreshLog();
    },e=>{this.error=e.message;this.refreshBusy=false;});
  }
  async refreshPresets() { await this.life.run('presets',signal=>this.api.getJson(E.web.presets,{signal}),data=>{this.presets=data;},e=>{this.notice=e.message;}); }
  async refreshSettings(){await this.life.run('settings',signal=>this.api.getJson(E.core.runSettings,{signal}),data=>{this.settings=runSettings(data.settings||data);},e=>{this.notice=e.message;});}
  async history(more=false) {
    this.historyBusy=true;
    await this.life.run('history',signal=>this.api.getJson(url(E.web.runHistoryPage,{limit:50,offset:more?this.view.finderRunOffset:0}),{signal}),data=>{
      this.run.mergeHistory(data,!more,latestById);this.historyBusy=false;
    },e=>{this.notice=e.message;this.historyBusy=false;});
  }
  async refreshLog(runId?: string) {
    this.logBusy=true;this.historical=Boolean(runId);
    const request=this.run.captureLogRequest();
    await this.life.run('log',signal=>this.api.getJson(url(E.core.latestLog,{run_id:runId||request.runId||undefined}),{signal}),data=>{
      if(runId)this.view.finderLog=data;else this.mergeLog(data,false,request);
      this.logBusy=false;
    },e=>{this.notice=e.message;this.logBusy=false;});
  }
  async start() {
    if(this.runStarting || this.busy)return;
    if(!this.systemReady){this.notice=this.systemKnown?'Требуется настройка системы':'Состояние системы ещё не получено';return;}
    let payload;const preferences=normalizePreferences({...this.preferences},this.settings.curl_parallelism_max||10);
    try { payload=discoveryPayload(preferences,this.domainText); } catch(e) {this.notice=(e as Error).message;return;}
    this.runStarting=true;this.run.setStartInFlight(true);
    await this.life.run('start',async signal=>{
      const p=preferences;
      try{await this.api.postJson(E.core.saveRunSettings,{settings:{curl_max_time:p.curl_max_time,curl_max_time_quic:p.curl_max_time_quic,curl_max_time_doh:p.curl_max_time_doh}},{signal});}catch(e){if(signal.aborted)throw e;}
      try{await this.api.postJson(E.web.runPreferences,{run_preferences:{...p,domains:payload.domains}},{signal});}catch(e){if(signal.aborted)throw e;}
      return this.api.postJson(E.core.startStrategyDiscoveryRun,payload,{signal});
    },data=>{
      this.runStarting=false;this.run.setStartInFlight(false);
      if(!data.run_id){this.notice='Сервер не вернул идентификатор принятого запуска';return;}
      this.run.acknowledge(data.run_id);this.historical=false;this.notice=`Запуск подтверждён: ${data.run_id}`;
      this.refresh();this.refreshLog();
    },e=>{this.runStarting=false;this.run.setStartInFlight(false);this.notice=e.message;});
  }
  async stop() {
    if(this.stopBusy)return;this.stopBusy=true;
    await this.life.run('stop',signal=>this.api.postJson(E.core.stopCurrentStrategyDiscoveryRun,{},{signal}),()=>{
      this.stopBusy=false;this.notice='Остановка подбора запрошена';this.refresh();
    },e=>{this.stopBusy=false;this.notice=e.message;});
  }
  repeat(row:any) {
    const o=row.discovery_options||{},old=(key,fallback)=>o[key]??row[key]??fallback;
    this.applyPreferences({domains:row.domains||[],domain_preset:'custom',run_mode:row.kind==='multi-domain-discovery'?'multi':'standard',
      enable_http:Boolean(old('enable_http',false)),enable_tls12:Boolean(old('enable_tls12',row.enable_tls)),enable_tls13:Boolean(old('enable_tls13',false)),
      include_quic:Boolean(o.enable_quic??row.include_quic??row.enable_quic),enable_ipv6:Boolean(old('enable_ipv6',false)),
      scan_level:old('scan_level','standard'),discovery_profile:old('scan_level','standard'),repeats:old('repeats',1),repeat_parallel:Boolean(old('repeat_parallel',false)),
      skip_dnscheck:Boolean(old('skip_dnscheck',false)),skip_ipblock:Boolean(old('skip_ipblock',false)),debug_stdout:Boolean(row.debug_stdout),
      curl_max_time:old('curl_max_time',this.settings.curl_max_time||2),curl_max_time_quic:old('curl_max_time_quic',this.settings.curl_max_time_quic||2),
      curl_max_time_doh:old('curl_max_time_doh',this.settings.curl_max_time_doh||2),curl_parallelism:row.curl_parallelism||4,
      limit_time_enabled:Number(row.timeout_seconds)>0,timeout_hours:Math.max(.1,Math.round(Number(row.timeout_seconds||0)/360)/10)});
    this.tab='finder';this.notice='Параметры прошлого подбора перенесены. Проверьте их и запустите вручную.';
  }
  event(event: string,raw: string) {
    let data:any;try{data=JSON.parse(raw||'{}');}catch{return;}
    if(event==='status'){this.run.mergeStatus(data);if(data.settings)this.settings=runSettings(data.settings);this.scheduleStatusRetry();}
    if(event==='runs')this.history();
    if(event==='log' && !this.historical && (this.busy || this.tab==='terminal'))this.refreshLog();
    if(event==='presets')this.refreshPresets();
    if(event==='settings')this.refreshSettings();
    if(event==='candidates')for(const callback of this.candidateListeners)callback(data.version);
  }
  candidateListeners = new Set<(version?:any) => void>();
}
