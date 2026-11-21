/* One loopback server, compiled product assets, isolated browser context per case. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');const contract=require('./contract.cjs');const {seed,reply,error}=require('./fixtures.cjs');
const scenarios=[...require('./scenarios.cjs'),...require('./spec-scenarios.cjs')];assert.equal(new Set(scenarios.map(x=>x.id)).size,scenarios.length,'Duplicate test IDs');
 const requested=new Set();
async function main(){
 const cfg=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));assert(cfg.output,'Evidence directory required');
 if(cfg.url)return require('./installed-browser.cjs').run(cfg);
 if(cfg.ids)for(const id of cfg.ids){assert(scenarios.some(s=>s.id===id),'Unknown scenario '+id);requested.add(id);}
 const output=path.resolve(cfg.output);fs.mkdirSync(output,{recursive:true});
 const root=path.resolve(process.env.GP_WEB_STATIC_ROOT||path.resolve(__dirname,'../../src/gp_control_plane_web/static'));let state;
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(u.pathname.startsWith('/api/')){
   const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);let body;
   if(raw.length)body=(req.headers['content-type']||'').startsWith('application/json')?JSON.parse(raw):raw;
   const call={method:req.method,path:u.pathname,query:Object.fromEntries(u.searchParams),queryEntries:[...u.searchParams.entries()],contentType:req.headers['content-type'],body:Buffer.isBuffer(body)?{bytes:body.length,sha256:require('node:crypto').createHash('sha256').update(body).digest('hex')}:body};state.requests.push(call);
   let found;try{found=contract.request(req.method,u.href,body,req.headers['content-type']||'');}catch(e){state.badRequests.push(e.message);res.writeHead(400,{'content-type':'application/json'}).end(JSON.stringify(error('invalid_parameters',e.message,[{field:'query',code:'unknown',message:e.message}])));return;}
   call.operation=found.op.operationId;
   if(found.op.operationId==='watchCurrentSearch'){
    const fault=state.faults.watchCurrentSearch;
    if(fault){
      call.status=fault.status;
      contract.response(found,fault.status,fault.data);
      res.writeHead(fault.status,{'content-type':'application/json'}).end(JSON.stringify(fault.data));
      return;
    }
    call.status=200;
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});res.write(': connected\n\n');state.streams.add(res);res.on('close',()=>state.streams.delete(res));return;
   }
   const result=await reply(state,found,u,body),status=result.status||200;call.status=status;if(result.data!==undefined)call.response=JSON.parse(JSON.stringify(result.data));
   if(result.abort){res.writeHead(200,{'content-type':'application/json','content-length':'4096'});res.write('{');setImmediate(()=>res.destroy());return;}
   if(result.binary){contract.response(found,status,result.binary,result.media);res.writeHead(status,{'content-type':result.media,'content-disposition':'attachment; filename="'+result.name+'"'}).end(result.binary);return;}
   contract.response(found,status,result.data);res.writeHead(status,status===204?{}:{'content-type':'application/json'}).end(result.data===undefined?undefined:JSON.stringify(result.data));return;
  }
  const consumer=u.pathname.startsWith('/consumer/');const servedRoot=consumer?path.resolve(__dirname,'consumer/dist'):root;
  const pathname=consumer?u.pathname.slice('/consumer'.length):u.pathname;
  const relative=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));const file=path.resolve(servedRoot,relative);
  assert(file.startsWith(servedRoot+path.sep));let bytes=fs.readFileSync(file);if(!consumer&&relative==='index.html')bytes=Buffer.from(bytes.toString('utf8').replace('</head>','<meta name="gp-core-target" content="'+(state.targetKey||'a'.repeat(64))+'"></head>'));res.writeHead(200,{'content-type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'}).end(bytes);
 }catch(e){state?.badRequests.push('FIXTURE: '+e.message);res.writeHead(500,{'content-type':'text/plain'}).end(e.stack);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const sha=bytes=>require('node:crypto').createHash('sha256').update(bytes).digest('hex');
 fs.writeFileSync(path.join(output,'run-source.json'),JSON.stringify({platform:process.platform,node:process.version,config:cfg,compiledRoot:root,compiledFiles:fs.readdirSync(root,{recursive:true}).filter(n=>fs.statSync(path.join(root,n)).isFile()).map(n=>({path:n,sha256:sha(fs.readFileSync(path.join(root,n)))})),tests:scenarios.map(s=>({id:s.id,sha256:sha(s.run.toString()),requirements:s.requirements||[]})),fixtureSha256:sha(fs.readFileSync(path.join(__dirname,'fixtures.cjs'))),contractSha256:sha(fs.readFileSync(path.join(__dirname,'openapi.json')))},null,2));
 const browser=await chromium.launch({headless:true,args:['--host-resolver-rules=MAP gp-web.test 127.0.0.1','--proxy-bypass-list=gp-web.test']});const results=[];
 try{for(const scenario of scenarios){if(cfg.group&&!scenario.id.startsWith(cfg.group))continue;if(requested.size&&!requested.has(scenario.id))continue;
  state=seed();scenario.prepare?.(state);const origin=scenario.insecure?url.replace('127.0.0.1','gp-web.test'):url;let context,page;const errors=[];const checks=[];const clientRequests=[];
  try{
   context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});page=await context.newPage();page.setDefaultTimeout(process.platform==='win32'?2500:15000);page.setDefaultNavigationTimeout(15000);
   page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/'))clientRequests.push({method:r.method(),path:u.pathname,query:[...u.searchParams]});});page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',route=>[url,origin].includes(new URL(route.request().url()).origin)?route.continue():route.abort());
   await page.goto(origin);await page.getByRole('button',{name:'Войти',exact:true}).waitFor();assert.deepEqual(errors,[],'Initial product JS error');
   const ctx={page,context,state,output,url:origin,loopbackUrl:url,assert,contract,errors,clientRequests,
    check:async(id,assertion,fn)=>{try{await fn();checks.push({requirement:id,assertion,status:'PASS'});}catch(e){checks.push({requirement:id,assertion,status:'FAIL',error:e.message});}},
    button:name=>page.getByRole('button',{name,exact:true}),label:name=>page.getByLabel(name,{exact:true}),
    openCatalogFilters:async()=>{
     const button=page.getByRole('button',{name:/^Фильтры(?: · \d+)?$/});
     if(await button.getAttribute('aria-expanded')==='false')await button.click();
    },
    login:async()=>{await page.getByLabel('Логин',{exact:true}).fill('admin');await page.getByLabel('Пароль',{exact:true}).fill('synthetic');await page.getByRole('button',{name:'Войти',exact:true}).click();await page.getByRole('button',{name:'Выйти',exact:true}).waitFor();},
    nav:async name=>{const b=page.getByRole('navigation',{name:'Разделы GP Plane'}).getByRole('button',{name,exact:true});assert(await b.count(),'Required navigation missing: '+name);await b.click();},
    call:op=>state.requests.filter(x=>x.operation===op),
    event:async()=>{contract.check({$ref:'core#/components/schemas/CurrentSearch'},state.current,'SSE fixture');for(const r of state.streams)r.write('event: search\ndata: '+JSON.stringify(state.current)+'\n\n');},
    text:async value=>{await page.getByText(value,{exact:false}).first().waitFor();},
    fault:(op,status,code,message,details)=>state.faults[op]={status,data:error(code,message,details||(code==='busy'?[{operation:'backup_restore'}]:undefined))},
    visible:async locator=>{await locator.first().waitFor({state:'visible'});},
   };
   if(!scenario.anonymous)await ctx.login();await scenario.run(ctx);
   assert.deepEqual(errors,[],'Product JS errors');assert(checks.every(x=>x.status==='PASS'),checks.filter(x=>x.status!=='PASS').map(x=>x.requirement+': '+x.error).join('\n'));assert.deepEqual(state.badRequests,[],'Invalid HTTP exchange');
   results.push({id:scenario.id,name:scenario.name,status:'PASS',checks});
  }catch(e){results.push({id:scenario.id,name:scenario.name,status:state.badRequests.some(x=>x.startsWith('FIXTURE:'))?'BLOCKED':e.message.startsWith('page.goto: Timeout')?'BLOCKED':'FAIL',error:e.message,jsErrors:errors,contractErrors:state.badRequests,checks});}
  finally{
   if(page){await page.screenshot({path:path.join(output,scenario.id+'.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(output,scenario.id+'-dom.txt'),await page.locator('body').innerText().catch(()=>''));}
   fs.writeFileSync(path.join(output,scenario.id+'-browser-requests.json'),JSON.stringify(clientRequests,null,2));
   fs.writeFileSync(path.join(output,scenario.id+'-checks.json'),JSON.stringify(checks,null,2));
   fs.writeFileSync(path.join(output,scenario.id+'-requests.json'),JSON.stringify(state.requests,(key,value)=>['password','old_password','new_password'].includes(key)?'<synthetic credential redacted>':value,2));
   if(context)await context.close();for(const r of state.streams)r.end();
  }
  console.log(scenario.id,results.at(-1).status,results.at(-1).error||'');fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
 }}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
 process.exitCode=results.every(x=>x.status==='PASS')?0:1;
}
main().catch(e=>{console.error(e);process.exitCode=2;});
