const {test}=require('node:test'),assert=require('node:assert/strict');
const {seed,reply}=require('./fixtures.cjs'),contract=require('./contract.cjs');
test('all seeded operation responses satisfy pinned draft.34 before browser use',async()=>{
 const bodies={authentication:{username:'admin',password:'synthetic'},change_password:{username:'admin',old_password:'old',new_password:'new'},createDomainList:{name:'New',domains:[{domain:'one.example'}]},replaceDomainList:{name:'Replaced',domains:[{domain:'one.example'}]},blockcheck2Start:{domains:['one.example']},blockcheck2GpStart:{domains:['one.example']},downloadCore:{version:'0.5.0',tag:'alpha'},startCoreUpdate:{version:'0.5.0',tag:'alpha',update_id:'00000000-0000-4000-8000-000000000001'},restoreBackupFile:Buffer.from('synthetic')};
 for(const found of contract.operations){if(found.op.operationId==='watchCurrentSearch')continue;const state=seed();
  const p=found.path.replace('{strategy_id}','s-0').replace('{bundle_id}','1').replace('{domain_list_id}','1').replace('{source}','v2fly').replace('{category}','cat206').replace('{run_id}','r-fixture').replace('{update_id}','00000000-0000-4000-8000-000000000001');
  const body=bodies[found.op.operationId],media=Buffer.isBuffer(body)?'application/octet-stream':'application/json';
  const request=contract.request(found.method,p,body,media);const out=await reply(state,request,new URL('http://127.0.0.1'+p),body);contract.response(found,out.status||200,out.binary||out.data,out.binary?out.media:'application/json');
 }
});
test('unknown query and legacy release shape are actually rejected; future response fields allowed',()=>{
 assert.throws(()=>contract.request('GET','/service/releases?channel=stable'),/Unknown query/);const found=contract.request('GET','/service/releases?tag=alpha');
 assert.throws(()=>contract.response(found,200,{items:[{version:'0.5.0',tag:'v0.5.0-alpha.4'}]}));contract.response(found,200,{items:[{version:'0.5.0',tag:'alpha',future:1}],future:true});
});
test('consumer contract, route metadata and shared generated DTOs stay pinned together',()=>{
 const fs=require('node:fs'),path=require('node:path');const root=path.resolve(__dirname,'../..');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'src/gp_control_plane_web/openapi.json'),'utf8')),contract.spec);
 assert.deepEqual(require('../../frontend/src/transport/operations.json'),Object.fromEntries(contract.operations.map(x=>[x.op.operationId,{method:x.method.toUpperCase(),path:x.path}])));
 assert.deepEqual(fs.readFileSync(path.join(root,'packages/gp-ui/src/api2/core-api.d.ts')),fs.readFileSync(path.join(root,'frontend/src/transport/core-api.d.ts')));
});
