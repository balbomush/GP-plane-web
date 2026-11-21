import {Requests,allPages,type GpClient,type Dto} from './client';
export class GpSession {
 status=$state<Dto['CoreStatus']|null>(null);current=$state<Dto['CurrentSearch']>({active:false,run:null});
 terminal=$state<Dto['RunDetail']|null>(null);connected=$state(false);statusFresh=$state(false);currentFresh=$state(false);
 statusError=$state('');currentError=$state('');error=$state('');message=$state('');
 lists=$state<Dto['DomainList'][]>([]);milestones=$state<Dto['Milestone'][]>([]);milestone=$state(1);listsPartial=$state(false);
 pending=$state('');knownRun=$state('');form=$state<any>(null);formVersion=$state(0);catalogContext=$state<any>(null);
 private requests=new Requests();private close:(()=>void)|null=null;private generation=0;private revision=0;
 constructor(public readonly client:GpClient){}
 get canWriteData(){return this.status?.storage==='ready'&&this.status.operation!=='backup_restore';}
 get canDeleteBackup(){return this.status?.storage==='ready'&&!['backup_create','backup_restore','archive_download'].includes(this.status.operation||'');}
 get canCreateMilestone(){return this.canWriteData&&!this.current.active&&this.status?.operation!=='search';}
 get canMutate(){return this.status?.storage==='ready'&&!this.status.busy&&!this.current.active&&!this.pending;}
 get canStart(){return this.statusFresh&&this.currentFresh&&this.canMutate;}
 start(){
  if(this.close)return;
  const generation=++this.generation;
  const refreshCurrent=()=>{if(generation===this.generation)void this.refresh();};
  this.close=this.client.watchCurrentSearch(value=>{
   if(generation===this.generation){this.revision++;this.apply(value);}
  },connected=>{
   if(generation!==this.generation || connected===this.connected)return;
   this.connected=connected;
   refreshCurrent();
  },refreshCurrent);
  this.refresh();this.loadLists();this.loadMilestones();
 }
 dispose(){this.generation++;this.close?.();this.close=null;this.requests.dispose();this.connected=false;this.statusFresh=false;this.currentFresh=false;}
 apply(value:Dto['CurrentSearch']){const wasActive=this.current.active;const before=this.current.run?.id||this.knownRun;this.current=value;if(value.run){this.knownRun=value.run.id;this.terminal=null;}else if(before)this.readTerminal(before);if(wasActive&&!value.active)this.refresh();}
 async refresh(){
  const rev=this.revision;
  await Promise.all([
   this.requests.run('status',signal=>this.client.getCoreStatus({}, {signal}),status=>{
    this.status=status;this.statusFresh=true;this.statusError='';
   },e=>{this.statusFresh=false;this.statusError=e.message;}),
   this.requests.run('current',signal=>this.client.getCurrentSearch({}, {signal}),current=>{
    this.currentFresh=true;this.currentError='';if(rev===this.revision)this.apply(current);
   },e=>{this.currentFresh=false;this.currentError=e.message;}),
  ]);
 }
 async readTerminal(id:string){await this.requests.run('terminal',signal=>this.client.getRun({path:{run_id:id}},{signal}),row=>{if(id===this.knownRun&&!this.current.active){this.terminal=row;if(row.error)this.message=row.error.message;}},e=>this.error=e.message);}
 async loadLists(){const rows:Dto['DomainList'][]=[];await this.requests.run('lists',async signal=>{for(let offset=0;;){const p=await this.client.listDomainLists({query:{offset,limit:200}},{signal});rows.push(...p.items);offset+=p.items.length;if(offset>=p.total)break;if(!p.items.length)throw new Error('Неполный перечень списков');}return rows;},items=>{this.lists=items;this.listsPartial=false;},e=>{this.lists=rows;this.listsPartial=true;this.error=e.message;});}
 async loadMilestones(){await this.requests.run('milestones',async signal=>{let current=1;const items=await allPages(async offset=>{const p=await this.client.listMilestones({query:{offset,limit:200}},{signal});current=p.current_id;return p;});return{items,current};},({items,current})=>{this.milestones=items;this.milestone=current;},e=>this.error=e.message);}
 async startSearch(engine:'blockcheck2'|'blockcheck2-gp',body:Dto['BlockcheckGpStartRequest']|Dto['BlockcheckStockStartRequest']){if(!this.canStart)return;this.pending='start';this.message='';await this.requests.run('command',signal=>engine==='blockcheck2-gp'?this.client.blockcheck2GpStart({body:body as Dto['BlockcheckGpStartRequest']},{signal}):this.client.blockcheck2Start({body},{signal}),value=>{this.pending='';this.knownRun=value.id;this.terminal=null;this.refresh();},e=>{this.pending='';this.message=e.message;});}
 async stop(){if(this.pending)return;this.pending='stop';this.message='';await this.requests.run('command',signal=>this.client.stopCurrentSearch({}, {signal}),value=>{this.pending='';this.message=value.run?statusName(value.run.status):'Активного поиска нет';if(value.run)this.knownRun=value.run.id;this.refresh();},e=>{this.pending='';this.message='Итог остановки неизвестен. '+e.message;});}
 async resume(row:Dto['RunDetail']){if(!this.canMutate||!row.resume_available||row.engine?.code!=='blockcheck2-gp')return;this.pending='resume';await this.requests.run('command',signal=>this.client.blockcheck2GpResume({path:{run_id:row.id}},{signal}),value=>{this.pending='';this.knownRun=value.id;this.terminal=null;this.refresh();},e=>{this.pending='';this.message=e.message;});}
 newSearch(row?:Dto['RunDetail']){if(row?.parameters&&row.domains)this.form={engine:row.engine?.code||'blockcheck2-gp',parameters:row.parameters,domains:row.domains};this.formVersion++;this.terminal=null;this.knownRun='';this.message='';}
}
import {statusName} from './client';
