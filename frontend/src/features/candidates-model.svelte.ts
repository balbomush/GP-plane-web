import type {AppModel} from '../app/model.svelte';
import {Lifetime} from '../transport/lifetime';
import {api2,id,type Schemas} from '../transport/api2';
import {download} from '../transport/download';
import {domains} from '../domain/finder';
import {createCandidateSelectionModel} from '../domain/candidate-selection.js';
import {validCandidates} from '@gp-plane/gp-ui/format';
import {candidateVersionKey} from '../domain/settings';

export class CandidatesModel {
  mode=$state('domain'); domain=$state(''); common=$state(''); query=$state(''); family=$state('');
  rows=$state<any[]>([]); total=$state(0); more=$state(false); busy=$state(false); error=$state('');
  index=$state<any[]>([]); indexMore=$state(false); indexTotal=$state(0); indexBusy=$state(false);
  resultMode=$state('balance'); required=$state(''); desired=$state(''); result=$state<any>(null); manual=$state('');
  tested=$state<string[]>([]); addition=$state(''); resultBusy=$state(false); private version='';private pendingVersion='';
  private active=false; private revision=0;
  expanded=$state<Record<string,boolean>>({});
  readonly life:Lifetime; readonly selection=createCandidateSelectionModel({uniqueDomains:domains});
  constructor(readonly app:AppModel){this.life=new Lifetime(app.session);app.register(()=>this.reset());app.candidateListeners.add(version=>{
    if(!this.active)return;const key=candidateVersionKey(version);
    if(version&&key===this.version)return;
    if(this.busy){this.pendingVersion=key;return;}
    this.loadIndex();this.load();
  });}
  reset(){this.life.dispose();this.mode='domain';this.rows=[];this.index=[];this.total=0;this.more=false;this.indexMore=false;this.indexTotal=0;this.busy=false;this.indexBusy=false;this.error='';this.result=null;this.manual='';this.domain='';this.common='';this.query='';this.family='';this.required='';this.desired='';this.tested=[];this.addition='';this.resultMode='balance';this.resultBusy=false;this.version='';this.pendingVersion='';this.expanded={};this.revision++;}
  mount(){this.active=true;this.loadIndex();this.load();return()=>{this.active=false;this.life.dispose();this.busy=false;this.indexBusy=false;};}
  get selectedCommon(){return domains(this.common);}
  key(){return JSON.stringify([this.mode,this.domain,this.selectedCommon]);}
  async load(more=false) {
    this.life.cancel('page');
    const key=this.key(),offset=more?this.rows.length:0;
    this.busy=true;this.error='';if(!more){this.rows=[];this.result=null;this.total=0;this.more=false;}
    if(this.mode==='common'&&this.selectedCommon.length<2){this.busy=false;return;}
    const params=new URLSearchParams({limit:'50',offset:String(offset),match:this.mode==='common'?'all':'any'});
    for(const domain of this.mode==='common'?this.selectedCommon:this.domain?[this.domain]:[])params.append('domains',domain);
    await this.life.run('page',signal=>this.app.api.getJson(api2+'/data/strategies?'+params,{signal}),data=>{
      this.busy=false;if(key!==this.key())return;
      const rows=data.items.map((row:Schemas['Strategy'])=>({...row,seen:row.results.map(r=>({domain:r.domain})),common_seen:[]}));
      if(!validCandidates(rows)){this.error='Неверный ответ Core';return;}
      this.rows=more?[...this.rows,...rows]:rows;this.total=data.total;this.more=data.offset+data.items.length<data.total;
      const pending=this.pendingVersion;this.pendingVersion='';if(pending)this.load();
    },e=>{this.error=e.message;this.busy=false;});
  }
  async applyPreset(key:string,lists:any){
    this.life.cancel('common-preset');
    if(key==='tested'){this.common=this.tested.join('\n');this.load();return;}
    if(!key)return;
    await this.life.run('common-preset',signal=>lists.read(key,'common',signal),values=>{this.common=values.join('\n');this.load();},e=>{this.error=e.message;});
  }
  editCommon(){this.life.cancel('common-preset');this.life.cancel('page');this.busy=false;}
  private indexOffset=0;
  async loadIndex(more=false){this.indexBusy=true;const offset=more?this.indexOffset:0;await this.life.run('index',signal=>this.app.api.getJson(api2+'/data/strategies?limit=200&offset='+offset,{signal}),data=>{
    const names=new Set<string>(more?this.tested:[]);for(const row of data.items)for(const result of row.results)names.add(result.domain);
    this.tested=[...names].sort();this.index=this.tested.map(domain=>({domain}));this.indexOffset=offset+data.items.length;this.indexMore=this.indexOffset<data.total;this.indexTotal=this.index.length;this.indexBusy=false;this.app.candidateDomainCount=this.index.length;
   },e=>{this.indexBusy=false;this.error=e.message;});}
  async archive(row:any){if(!row.archive_available)return;await this.life.run('archive',signal=>this.app.api.blob(api2+'/data/strategies/'+id(row.id)+'/archive',{signal}),({blob})=>download(blob,'gp-strategy-'+row.id+'.zip'),e=>this.error=e.message);}
  get filtered(){return this.rows.filter(row=>(!this.family||row.family===this.family)&&(!this.query||String(row.args).includes(this.query)));}
  get strategyLists(){
    const lists=new Map<string,{key:string;domain:string;protocol:string;rows:any[]}>();
    for(const row of this.filtered){
      const names=this.mode==='common'?['']:this.domain?[this.domain]:this.selection.candidateAllDomains(row);
      for(const domain of names.length?names:['']){
        const key=JSON.stringify([this.mode,this.mode==='common'?this.selectedCommon:domain,row.protocol]);
        if(!lists.has(key))lists.set(key,{key,domain,protocol:row.protocol,rows:[]});
        lists.get(key)!.rows.push(row);
      }
    }
    return [...lists.values()].map(list=>{
      const rows=this.selection.strategyFamilyGroups(list.rows).flatMap(group=>group.rows);
      return {...list,rows,visible:this.expanded[list.key]?rows:rows.slice(0,200),expanded:Boolean(this.expanded[list.key])};
    });
  }
  toggleList(key:string){this.expanded={...this.expanded,[key]:!this.expanded[key]};}
  moreForList(list:{key:string;domain:string}){
    this.expanded={...this.expanded,[list.key]:true};
    // An all-domain cursor cannot promise another page of one particular
    // domain. Explicitly scope the selection before requesting that domain.
    if(this.mode==='domain'&&!this.domain&&list.domain){this.domain=list.domain;this.load();}
    else this.load(true);
  }
  get families(){return [...new Set(this.rows.map(row=>String(row.family||'')))].filter(Boolean);}
  addDomain(value=this.addition){const domain=value.trim();if(!domain)return;this.editCommon();this.common=domains([...domains(this.common),domain]).join('\n');this.addition='';this.load();}
  removeDomain(value:string){this.editCommon();this.common=domains(this.common).filter(x=>x!==value).join('\n');this.load();}
  async calculate(lists:any){
    if(this.selectedCommon.length<2){this.error='Для итогового набора нужны минимум два протестированных домена';return;}
    this.resultBusy=true;const key=this.key();
    await this.life.run('result',async()=>({required:this.selectedCommon,desired:[] as string[]}),({required,desired})=>{
      this.resultBusy=false;if(key!==this.key())return;this.required=required.join('\n');this.desired='';
      this.result=this.selection.buildCandidateResult(this.resultMode,{required,desired},this.selection.uniqueStrategyRows(this.rows));this.manual=this.selection.candidateResultText(this.result);
    },e=>{this.resultBusy=false;this.error=e.message;});
  }
  useDomains(){this.app.domainText=domains(this.common||this.required).join('\n');this.app.preferences.domain_preset='custom';this.app.tab='finder';}
}
