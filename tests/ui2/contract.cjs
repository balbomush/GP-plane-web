const assert=require('node:assert/strict');
const Ajv=require('ajv/dist/2020').default;
const formats=require('ajv-formats');
const spec=require('./openapi.json');
const ajv=new Ajv({strict:false,allErrors:true});formats(ajv);ajv.addFormat('password',true);ajv.addFormat('binary',true);
ajv.addSchema({$id:'core',components:spec.components});
const compiled=new Map();
function check(schema,value,label){
 const key=JSON.stringify(schema);let validate=compiled.get(key);
 if(!validate){validate=ajv.compile({components:spec.components,...schema});compiled.set(key,validate);}
 assert(validate(value),label+': '+JSON.stringify(validate.errors));
}
const operations=Object.entries(spec.paths).flatMap(([path,item])=>Object.entries(item).filter(([m])=>['get','post','put','delete'].includes(m)).map(([method,op])=>({path,method,op,pattern:new RegExp('^'+path.replace(/\{[^}]+\}/g,'([^/]+)')+'$')})));
function request(method,raw,body,contentType=''){
 const url=new URL(raw,'http://127.0.0.1'),path=url.pathname.replace(/^\/api\/v2/,'');
 const found=operations.find(x=>x.method===method.toLowerCase()&&x.pattern.test(path));assert(found,'Unknown operation '+method+' '+path);
 const params=found.op.parameters||[],known=params.filter(p=>p.in==='query').map(p=>p.name);
 for(const key of url.searchParams.keys())assert(known.includes(key),'Unknown query parameter '+key);
 for(const p of params){let value;
  if(p.in==='path'){const names=[...found.path.matchAll(/\{([^}]+)\}/g)].map(x=>x[1]);value=decodeURIComponent(path.match(found.pattern)[names.indexOf(p.name)+1]);}
  else if(p.in==='query'){value=url.searchParams.get(p.name);if(value===null)value=undefined;}
  else continue;
  assert(!p.required||value!==undefined,'Missing '+p.name);
  if(value!==undefined){if(p.schema.type==='integer')value=Number(value);if(p.schema.type==='array')value=p.in==='query'?url.searchParams.getAll(p.name):[value];check(p.schema,value,'parameter '+p.name);}
 }
 if(found.op.requestBody){const media=Object.keys(found.op.requestBody.content).find(x=>contentType.startsWith(x));assert(media,'Wrong request content-type '+contentType);if(media==='application/json')check(found.op.requestBody.content[media].schema,body,'body '+found.op.operationId);}
 else assert(body===undefined||body===null||body.length===0,'Unexpected body '+found.op.operationId);
 return found;
}
function response(found,status,value,media='application/json'){
 let res=found.op.responses[String(status)]||found.op.responses.default;if(res?.$ref)res=res.$ref.slice(2).split('/').reduce((v,k)=>v[k],spec);assert(res,'Undeclared status '+status+' '+found.op.operationId);
 if(status===204){assert(value===undefined);return;}
 assert(res.content?.[media],'Wrong response media '+media);
 if(media==='application/json')check(res.content[media].schema,value,'response '+found.op.operationId);
}
module.exports={spec,operations,check,request,response};
