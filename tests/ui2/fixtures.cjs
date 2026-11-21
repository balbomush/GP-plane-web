const fs=require('node:fs'),path=require('node:path');
const engine={id:1,code:'blockcheck2-gp',name:'blockcheck2-gp'};
const args='--lua-init=@assets/α.lua --payload="hello world"\n--new';
const domains=Array.from({length:67},(_,i)=>'d'+i+'.example');
const page=(items,u,extra={})=>{const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||50);return{items:items.slice(offset,offset+limit),total:items.length,offset,limit,...extra};};
const error=(code,message,details)=>({error:{code,message,...(details?{details}:{})}});
const filterDomains=(rows,u)=>{const selected=u.searchParams.getAll('domains');if(!selected.length)return rows;return rows.filter(row=>{const found=new Set(row.results.map(x=>x.domain));return u.searchParams.get('match')==='all'?selected.every(x=>found.has(x)):selected.some(x=>found.has(x));});};
function seed(){return{
 status:{core_version:'0.5.0',api_version:'2',storage:'ready',busy:false,operation:null,backup_exists:true},
 current:{active:false,run:null},milestone:3,
 runs:[{id:'r-fixture',engine,milestone_id:3,status:'stopped',error:null,started_at:'2026-11-15T09:00:00Z',finished_at:'2026-11-15T09:03:00Z',domains:['one.example'],domain_list_id:null,parameters:{include_quic:true,enable_tls12:true},resume_available:true}],
 lists:Array.from({length:207},(_,i)=>({id:i+1,name:i===206?'Дальний список':'Список '+(i+1),kind:i===0?'builtin':'user',source:i===0?{code:'v2fly',categories:['video']}:null})),
 strategies:Array.from({length:305},(_,i)=>({id:'s-'+i,protocol:i%2?'tls':'http',args:i<2?args:'--new --dpi-desync=multisplit '+i,family:'multisplit',family_rank:1,family_reason:'Разделение потока',archive_available:i!==2,milestone_id:3,results:[{id:i+1,domain:'one.example',engines:i===2?[]:[engine]}]})),
 bundles:[{id:1,name:null,sources:[{source:'fixture',name:null,reference:null},{source:'other',name:'Автор',reference:'https://example.org/source'}],archive_available:true,milestone_id:3,results:[{id:1,domain:'one.example'}]},{id:2,name:'Неподтверждённый комплект',sources:[],archive_available:false,milestone_id:3,results:[]}],
 categories:Array.from({length:207},(_,i)=>({id:'cat'+i,name:i===206?'Дальняя категория':'Категория '+i})),
 source:{source:'v2fly',state:'ready',installed_revision:'fixture',error:null},
 log:[{position:'p1',time:null,level:'info',message:'Первая строка'},{position:'p2',time:'2026-11-15T09:01:00Z',level:'debug',message:'Вторая строка'}],
 update:null,faults:{},requests:[],streams:new Set(),badRequests:[],delay:{},
};}
function scopedRows(state,kind,milestone){return state[kind].map(row=>({...row,milestone_id:milestone,results:(state[kind+'ByMilestone']?.[milestone]?.[row.id]??(row.milestone_id===milestone?row.results:[])).map(x=>({...x}))}));}
function catalogRows(state,kind,u){const milestone=Number(u.searchParams.get('milestone_id')??state.milestone),selected=u.searchParams.getAll('domains'),engine=u.searchParams.get('engine_code');let rows=scopedRows(state,kind,milestone).map(row=>({...row,results:row.results.filter(r=>(!selected.length||selected.includes(r.domain))&&(!engine||r.engines?.some(e=>e.code===engine)))}));rows=rows.filter(row=>{const found=new Set(row.results.map(x=>x.domain));return(kind==='bundles'&&u.searchParams.get('view')==='all'&&!selected.length)||!!row.results.length&&(!selected.length||u.searchParams.get('match')!=='all'||selected.every(d=>found.has(d)));});if(kind==='strategies'){for(const k of ['protocol','family'])if(u.searchParams.has(k))rows=rows.filter(x=>x[k]===u.searchParams.get(k));if(u.searchParams.has('q'))rows=rows.filter(x=>x.args.toLowerCase().includes(u.searchParams.get('q').toLowerCase()));const cmp=(a,b)=>a===b?0:a<b?-1:1;rows.sort((a,b)=>u.searchParams.get('sort')==='id'?cmp(a.id,b.id):cmp(a.protocol,b.protocol)||cmp(a.family_rank??Infinity,b.family_rank??Infinity)||cmp(a.family,b.family)||cmp(a.id,b.id));}return rows;}
async function reply(state,found,u,body){
 const op=found.op.operationId;
 if(state.delay[op])await state.delay[op]();
 if(state.faults[op])return typeof state.faults[op]==='function'?state.faults[op](body,u):state.faults[op];
 const id=decodeURIComponent(u.pathname.split('/').at(-1)),rid=u.pathname.split('/').at(-2);
 switch(op){
 case'authentication':return body.password==='wrong'?{status:401,data:error('invalid_credentials','Неверный логин или пароль')}:{data:{bearer_token:'synthetic-token',expires_at:'2099-01-01T00:00:00Z'}};
 case'change_password':return{status:204};
 case'getCoreStatus':return{data:state.status};case'getCurrentSearch':return{data:state.current};
 case'listMilestones':return{data:page([0,1,state.milestone].map(id=>({id})),u,{current_id:state.milestone})};
 case'createMilestone':state.milestone++;return{status:201,data:{id:state.milestone}};
 case'listDomainLists':return{data:page(state.lists.filter(x=>!u.searchParams.get('kind')||x.kind===u.searchParams.get('kind')),u)};
 case'getDomainList':return{data:state.lists.find(x=>x.id===Number(id))};
 case'getDomainListEntries':return{data:page((state.entries?.[rid]||domains).map(domain=>({domain})),u)};
 case'createDomainList':{const row={id:300+(state.createdCount=(state.createdCount||0)+1),name:body.name,kind:'user',source:null};state.lists.push(row);(state.entries??={})[row.id]=body.domains.map(x=>x.domain);return{status:201,data:row};}
 case'replaceDomainList':{const row=state.lists.find(x=>x.id===Number(id));row.name=body.name;(state.entries??={})[id]=body.domains.map(x=>x.domain);return{data:row};}
 case'deleteDomainList':state.lists=state.lists.filter(x=>x.id!==Number(id));return{status:204};
 case'getSource':return{data:state.source};case'listCategories':return{data:page(state.categories,u)};
 case'listCategoryDomains':return{data:page(domains,u)};
 case'checkSourceUpdate':return{data:{source:'v2fly',installed_revision:'fixture',available_revision:'fixture2',update_available:true}};
 case'updateSource':return{data:state.source};
 case'listStrategies':return{data:page(catalogRows(state,'strategies',u),u,{milestone_id:Number(u.searchParams.get('milestone_id')??state.milestone)})};
 case'getStrategy':return{data:scopedRows(state,'strategies',Number(u.searchParams.get('milestone_id')??state.milestone)).find(x=>x.id===id)};
 case'listBundles':return{data:page(catalogRows(state,'bundles',u),u,{milestone_id:Number(u.searchParams.get('milestone_id')??state.milestone)})};
 case'getBundle':return{data:scopedRows(state,'bundles',Number(u.searchParams.get('milestone_id')??state.milestone)).find(x=>x.id===Number(id))};
 case'listRuns':return{data:page(state.runs.filter(x=>(!u.searchParams.has('milestone_id')||x.milestone_id===Number(u.searchParams.get('milestone_id')))&&(!u.searchParams.has('status')||x.status===u.searchParams.get('status'))&&(!u.searchParams.has('engine_code')||x.engine?.code===u.searchParams.get('engine_code'))),u)};
 case'getRun':return{data:state.runs.find(x=>x.id===id)};
 case'deleteRunHistory':state.runs=state.runs.filter(x=>x.id!==id);return{status:204};
 case'readRunLog':return{data:{entries:u.searchParams.has('after')?state.log.slice(1):state.log.slice(0,1),next_after:u.searchParams.has('after')?'p2':'p1',truncated:false}};
 case'blockcheck2Start':case'blockcheck2GpStart':case'blockcheck2GpResume':{const code=op==='blockcheck2Start'?'blockcheck2':'blockcheck2-gp';const run={...state.runs[0],id:op==='blockcheck2GpResume'?rid:'r-new-'+(state.startedCount=(state.startedCount||0)+1),engine:{...engine,code,name:code},status:'starting',error:null,domains:body?.domains||['one.example'],parameters:body?.parameters||state.runs.find(x=>x.id===rid)?.parameters||{},resume_available:false,finished_at:null};if(op==='blockcheck2GpResume')state.runs[state.runs.findIndex(x=>x.id===rid)]=run;else state.runs.unshift(run);state.status.busy=true;state.status.operation='search';state.current={active:true,run:{id:run.id,engine:run.engine,milestone_id:3,status:'starting',error:null,started_at:run.started_at,progress:{checked:120,total:500,current_args:args}}};return{data:{id:run.id,status:'starting'}};}
 case'stopCurrentSearch':{const run=state.runs.find(x=>x.id===state.current.run?.id)||state.runs[0];run.status='stopped';state.status.busy=false;state.status.operation=null;state.current={active:false,run:null};return{data:{run:{...run,progress:{checked:120,total:500,current_args:args}}}};}
 case'listReleases':return{data:{items:[{version:'0.5.0',tag:u.searchParams.get('tag')||'stable'}]}};
 case'downloadCore':return{data:{...body,size_bytes:12345}};
 case'startCoreUpdate':state.update={update_id:body.update_id,target_version:body.version,tag:body.tag,state:'running',error:null};return{status:202,data:state.update};
 case'getCoreUpdate':return state.update?{data:state.update}:{status:404,data:error('not_found','Отчёт не найден')};
 case'createBackup':state.status.backup_exists=true;return{data:{created_at:'2026-11-15T09:00:00Z',size_bytes:400,sha256:'a'.repeat(64)}};
 case'deleteBackup':state.status.backup_exists=false;return{status:204};
 case'restoreSavedBackup':case'restoreBackupFile':return{data:{restored:true,warnings:[]}};
 case'downloadStrategy':case'downloadBundle':case'downloadBackup':{const kind=op==='downloadStrategy'?'strategy':op==='downloadBundle'?'bundle':'backup';return{binary:fs.readFileSync(path.join(__dirname,'archives',kind+'.zip')),media:kind==='backup'?'application/octet-stream':'application/zip',name:kind+'.zip'};}
 default:throw new Error('No explicit fixture for '+op);
 }
}
module.exports={seed,reply,page,error,args,domains,engine,catalogRows,scopedRows};
