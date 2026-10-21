import type {AppModel} from '../app/model.svelte';
import {Lifetime} from '../transport/lifetime';
import {endpoints as E,url} from '../transport/endpoints';
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
  get selectedCommon(){const tested=new Set(this.tested);return domains(this.common).filter(value=>tested.has(value));}
  key(){return JSON.stringify([this.mode,this.domain,this.selectedCommon]);}
  async load(more=false) {
    this.life.cancel('page');
    const key=this.key(),offset=more?this.rows.length:0;
    this.busy=true;this.error='';if(!more){this.rows=[];this.result=null;this.total=0;this.more=false;}
    if(this.mode==='common'&&this.selectedCommon.length<2){this.busy=false;return;}
    await this.life.run('page',signal=>this.app.api.getJson(url(E.web.strategyCandidatesPage,{view:this.mode,domain:this.mode==='domain'?this.domain||undefined:undefined,domains:this.mode==='common'?this.selectedCommon.join(','):undefined,limit:50,offset}),{signal}),data=>{
      // Lifetime admits only this request's callback; release its busy flag
      // even when an unsent textarea edit changed the query in the meantime.
      this.busy=false;if(key!==this.key())return;
      if(!validCandidates(data.candidates)||typeof data.has_more!=='boolean'||!Number.isSafeInteger(data.total)||data.total<0){this.error='Неверный ответ Core';this.busy=false;return;}
      const version=candidateVersionKey(data.version);
      if(more&&this.version&&this.version!==version){this.load();return;}
      if(this.version&&this.version!==version)this.expanded={};
      this.version=version;this.rows=more?[...this.rows,...data.candidates]:data.candidates;this.total=data.total;this.more=data.has_more;this.busy=false;
      if(Array.isArray(data.tested_domains))this.tested=domains(data.tested_domains);
      const pending=this.pendingVersion;this.pendingVersion='';if(pending&&pending!==version)this.load();
    },e=>{this.error=e.message;this.busy=false;});
  }
  async applyPreset(key:string,lists:any){
    this.life.cancel('common-preset');
    if(key==='tested'){this.common=this.tested.join('\n');this.load();return;}
    if(!key)return;
    await this.life.run('common-preset',signal=>lists.read(key,'common',signal),values=>{this.common=values.join('\n');this.load();},e=>{this.error=e.message;});
  }
  editCommon(){this.life.cancel('common-preset');this.life.cancel('page');this.busy=false;}
  async loadIndex(more=false) {
    this.indexBusy=true;
    await this.life.run('index',signal=>this.app.api.getJson(url(E.web.candidateDomainIndexPage,{limit:50,offset:more?this.index.length:0}),{signal}),data=>{
      this.index=more?[...this.index,...data.domains]:data.domains||[];this.indexMore=Boolean(data.has_more);this.indexTotal=data.total||0;this.app.candidateDomainCount=this.indexTotal;this.indexBusy=false;
      this.tested=domains(data.tested_domains||this.index.map(item=>typeof item==='string'?item:item.domain));
    },e=>{this.error=e.message;this.indexBusy=false;});
  }
  get filtered(){return this.rows.filter(row=>(!this.family||row.family===this.family)&&(!this.query||String(row.args).includes(this.query)));}
  get strategyLists(){
    const lists=new Map<string,{key:string;domain:string;protocol:string;rows:any[]}>();
    for(const row of this.filtered){
      const names=this.mode==='common'?['']:this.selection.candidateAllDomains(row);
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
  addDomain(value=this.addition){const domain=value.trim();if(!this.tested.includes(domain)){this.error='Выберите протестированный домен';return;}this.editCommon();this.common=domains([...domains(this.common),domain]).join('\n');this.addition='';this.load();}
  removeDomain(value:string){this.editCommon();this.common=domains(this.common).filter(x=>x!==value).join('\n');this.load();}
  async calculate(lists:any){
    if(this.selectedCommon.length<2){this.error='Для итогового набора нужны минимум два протестированных домена';return;}
    this.resultBusy=true;const key=this.key();
    await this.life.run('result',async signal=>{
      const required=await lists.read('system:required','finder',signal),desired=await lists.read('system:desired','finder',signal);
      return {required,desired};
    },({required,desired})=>{
      this.resultBusy=false;if(key!==this.key())return;this.required=required.join('\n');this.desired=desired.join('\n');
      this.result=this.selection.buildCandidateResult(this.resultMode,{required,desired:desired.filter(x=>!required.includes(x))},this.selection.uniqueStrategyRows(this.rows));
      this.manual=this.selection.candidateResultText(this.result);
    },e=>{this.resultBusy=false;this.error=e.message;});
  }
  useDomains(){this.app.domainText=domains(this.common||this.required).join('\n');this.app.preferences.domain_preset='custom';this.app.tab='finder';}
}
