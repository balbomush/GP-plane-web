const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const cases=[];function add(id,requirements,assertion,run,options={}){cases.push({id:'N-'+id,name:assertion,requirements:requirements.split(' '),assertion,run,testSource:(new Error().stack.split('\n').find(x=>/spec[\\/].*\.cjs/.test(x)&&!x.includes('common.cjs'))||'unknown').trim(),...options});}
const until=async(fn)=>{const deadline=Date.now()+4000;let error;do{try{return await fn();}catch(e){error=e;await new Promise(r=>setTimeout(r,20));}}while(Date.now()<deadline);throw error;};
const visible=async(c,locator)=>{await locator.waitFor({state:'visible'});assert(await locator.isVisible());};
const text=async(c,value)=>{await c.text(value);};
const confirm=async(c,trigger)=>{await c.button(trigger).click();await c.page.getByRole('dialog').getByRole('button',{name:'Подтвердить',exact:true}).click();};
const launch=async c=>{await c.label('Домены').fill('one.example');await c.button('Начать поиск').click();await c.text('120 / 500');};
const catalog=async c=>{await c.nav('Результаты');await c.visible(c.page.locator('[data-strategy]').first());};
const service=async(c,tab)=>{await c.nav('Обслуживание');if(tab)await c.button(tab).click();};
const archive=(name)=>fs.readFileSync(path.join(__dirname,'../archives',name+'.zip'));
const hash=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
const params={include_quic:true,enable_http:false,enable_tls12:true,enable_tls13:false,enable_ipv6:false,scan_level:'standard',repeats:1,repeat_parallel:false,skip_dnscheck:true,skip_ipblock:true,curl_max_time:2,curl_max_time_quic:2,curl_max_time_doh:2,debug_stdout:false,curl_parallelism:4};
const getError=(code,message,details)=>({error:{code,message,...(details?{details}:{})}});
module.exports={cases,add,until,visible,text,confirm,launch,catalog,service,archive,hash,params,getError,assert,fs,path};
