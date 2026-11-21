import assert from 'node:assert/strict';
import {test} from 'node:test';
import {build} from 'esbuild';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const temp=await mkdtemp(join(tmpdir(),'gp-api2-model-'));
globalThis.$state=x=>x;globalThis.confirm=()=>true;
let AppModel,ListsModel,CandidatesModel;
try{
 await build({stdin:{contents:"export {AppModel} from './src/app/model.svelte.ts';export {ListsModel} from './src/features/lists-model.svelte.ts';export {CandidatesModel} from './src/features/candidates-model.svelte.ts';",resolveDir:import.meta.dirname,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:join(temp,'models.mjs')});
 ({AppModel,ListsModel,CandidatesModel}=await import(pathToFileURL(join(temp,'models.mjs')).href));
}finally{await rm(temp,{recursive:true,force:true});}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const row=id=>({id,status:'completed',engine:{code:'blockcheck2-gp'},parameters:{},domains:[]});
const page=(ids,offset=0,total=ids.length)=>({items:ids.map(row),offset,total});
test('late DELETE preserves another edited list and resets session-owned filters',async()=>{
 const app=new AppModel(),model=new ListsModel(app),reply=deferred();
 app.service={storage:'ready',busy:false};app.presets=[{id:1,kind:'user',name:'A'},{id:2,kind:'user',name:'B'}];
 app.api.sendJson=()=>reply.promise;let refreshed=0;app.refreshPresets=()=>{refreshed++;};
 model.selection='custom:1';const removing=model.remove();model.newList();model.selection='custom:2';model.name='B edited';model.text='unsaved.example';model.edit();reply.resolve();await removing;
 assert.equal(model.selection,'custom:2');assert.equal(model.name,'B edited');assert.equal(model.text,'unsaved.example');assert.equal(refreshed,1);
 model.query='private';model.categoryQuery='category';model.source='v2fly';app.notice='old-session diagnostic';app.reset();
 assert.equal(app.notice,'Готово');assert.equal(model.query,'');assert.equal(model.categoryQuery,'');assert.equal(model.source,'');
});
test('background refresh preserves loaded history during overlapping more page',async()=>{
 const app=new AppModel();app.ready=true;app.refreshLog=()=>{};
 app.mergeHistory(page(['A','B'],0,5),false);
 const fresh=deferred();app.api.service=async()=>({storage:'ready'});app.api.current=async()=>({active:false,run:null});
 app.api.runs=(offset)=>offset===0?fresh.promise:Promise.resolve(page(['B','C'],2,5));
 const refreshing=app.refresh();await app.history(true);fresh.resolve(page(['N','A'],0,5));await refreshing;
 assert.deepEqual(app.view.finderRuns.map(r=>r.id),['N','A','B','C']);assert.equal(app.view.finderRunOffset,4);assert.equal(app.view.finderRunHasMore,true);
});
test('log adapter retains empty and nonempty truncated tails and public progress',async()=>{
 const app=new AppModel();app.search={active:true,run:{id:'R',progress:{checked:5,total:10,current_args:'--foo'}}};app.api.run=async()=>row('R');
 app.api.getJson=async()=>({entries:[],truncated:true,next_after:null});await app.refreshLog();assert.equal(app.view.finderLog.truncated,true);assert.equal(app.view.finderLog.text,'');assert.equal(app.view.finderLog.progress.checked,5);assert.equal(app.view.finderLog.progress.total,10);
 app.search.run.progress.total=null;app.api.getJson=async()=>({entries:[{message:'tail'}],truncated:true,next_after:11});await app.refreshLog();assert.equal(app.view.finderLog.text,'tail');assert.equal(app.view.finderLog.progress.total,null);assert.equal(app.view.finderLog.next_after,11);
});
import {compile} from 'svelte/compiler';
import {render} from 'svelte/server';
async function component(name){
 const dir=await mkdtemp(join(tmpdir(),'gp-api2-ui-'));
 try{
  await build({entryPoints:[join(import.meta.dirname,'src/features',name+'.svelte')],bundle:true,platform:'node',format:'esm',conditions:['node'],outfile:join(dir,'ui.mjs'),plugins:[{name:'svelte-server',setup(b){b.onLoad({filter:/\.svelte$/},async a=>({contents:compile(await readFile(a.path,'utf8'),{filename:a.path,generate:'server'}).js.code,loader:'js'}));}}]});
  return (await import(pathToFileURL(join(dir,'ui.mjs')).href)).default;
 }finally{await rm(dir,{recursive:true,force:true});}
}
test('Terminal renders public known/unknown progress and lost/tail warning',async()=>{
 const Terminal=await component('Terminal');
 for(const total of [10,null]){
  const app={view:{finderRuns:[],finderLog:{progress:{checked:5,total,current_args:'--foo'},truncated:true,text:''}},search:null,busy:false,historical:false};
  const {body}=render(Terminal,{props:{app}});assert.ok(body.includes(total===10?'5 / 10':'5 / неизвестно'));assert.ok(body.includes('Журнал неполный'));assert.ok(body.includes('--foo'));assert.ok(!body.includes('5 / 0'));
  if(total===null)assert.ok(!/<progress[^>]+value=/.test(body));else assert.match(body,/<progress[^>]+max="10"[^>]+value="5"/);
 }
});
test('Status labels lazy zero as loaded results, never global tested',async()=>{
 const Status=await component('Status');const {body}=render(Status,{props:{app:{view:{status:{}},candidateDomainCount:0,systemKnown:true,systemReady:true,diagnostics:[]}}});assert.ok(body.includes('в загруженных результатах'));assert.ok(!body.includes('протестировано'));
});

test('source categories/domain pagination and import use all public pages',async()=>{
 const app=new AppModel(),model=new ListsModel(app);app.service={storage:'ready',busy:false};
 const categories=Array.from({length:201},(_,n)=>({name:'category'+n}));const values=Array.from({length:201},(_,n)=>'domain'+n+'.example');const calls=[];
 app.api.getJson=async url=>{const u=new URL(url,'http://fixture');calls.push(u);const offset=Number(u.searchParams.get('offset'));const items=u.pathname.endsWith('/domains')?values:categories;return {items:items.slice(offset,offset+200),total:items.length,offset};};
 await model.loadCatalog();assert.equal(model.catalog.length,201);model.categories=['category0'];await model.previewCategories();assert.equal(model.preview.length,201);model.importPreview(true);assert.equal(model.text.split('\n').length,201);assert.equal(calls.filter(u=>u.searchParams.get('offset')==='200').length,2);
});
test('common query retains explicitly entered unknown domain and partial index stays partial',async()=>{
 const app=new AppModel(),model=new CandidatesModel(app);let request;
 app.api.getJson=async url=>{request=new URL(url,'http://fixture');if(request.searchParams.get('limit')==='200')return {items:[{results:[{domain:'known.example'}]}],total:201,offset:0};return {items:[],total:0,offset:0};};
 await model.loadIndex();assert.equal(model.indexMore,true);assert.deepEqual(model.tested,['known.example']);model.mode='common';model.common='known.example\nunknown.example';await model.load();assert.deepEqual(request.searchParams.getAll('domains'),['known.example','unknown.example']);
});
