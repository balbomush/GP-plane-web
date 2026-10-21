/* Targeted S3 browser fixtures. Real HTTP/Core and hardware proof are separate. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.GP_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(process.env.GP_WEB_STATIC_ROOT||path.join(__dirname,'../src/gp_control_plane_web/static'));
const baseUrl=process.env.GP_TEST_WEB_URL||'http://127.0.0.1:18971';
const golden=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/v044-populated.json'),'utf8'));

async function createUi({before,login=true}={}){
  let browser,server;
  const requests=[],errors=[];
  const close=async()=>{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
  try{

  if(!process.env.GP_TEST_WEB_URL){server=http.createServer((req,res)=>{const name=new URL(req.url,'http://127.0.0.1').pathname;const file=path.join(root,name==='/'?'index.html':name);if(!file.startsWith(root+path.sep)){res.writeHead(400).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(resolve=>server.listen(18971,'127.0.0.1',resolve));}
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  let current=null,runStatus='success',candidatePage=golden,failBootstrap=false;
  let settings={enable_ipv6:false,curl_parallelism_max:10,curl_parallelism_default:4,curl_max_time:2,curl_max_time_quic:2,curl_max_time_doh:2};
  let presets={custom:{finder:{mine:['example.com']},common:{mine:['example.com','video.example.net']}},metadata:{finder:{mine:{count:1}},common:{mine:{count:2}}},system:{finder:{required:['example.com']},common:{}},system_metadata:{finder:{required:{count:1}}},domain_sets:{critical:['example.com']}};
  const history=()=>({runs:[{id:'history-1',run_id:'history-1',timestamp:'2026-10-20',status:'success',kind:'multi-domain-discovery',domains:['example.com','video.example.net'],discovery_options:{enable_tls12:true,enable_quic:false,repeats:3},timeout_seconds:3600},...(current||runStatus==='stopped'?[{id:'new-run',run_id:'new-run',timestamp:'2026-10-21',status:runStatus,domains:['example.com']}]:[])],offset:0,total:2,has_more:false});
  await page.route('**/api/**',async route=>{
    const req=route.request(),u=new URL(req.url()),body=req.postDataJSON?.bind(req);
    requests.push({path:u.pathname,query:Object.fromEntries(u.searchParams),method:req.method(),body:req.headers()['content-type']==='application/json'?body():null});
    let data={};
    if(u.pathname.endsWith('/events/stream'))return route.abort();
    if(u.pathname.endsWith('/auth/login'))data={access_token:'synthetic-test-token'};
    else if(u.pathname==='/api/web/status'){if(failBootstrap)return route.fulfill({status:503,body:'fixture Core unavailable'});data={version:'0.4.4',zapret2:{nfqws2_found:true,blockcheck_found:true,root_helper_ready:true},current_run:current,run_preferences:{domains:['example.com'],enable_tls12:true,include_quic:false}};}
    else if(u.pathname.endsWith('/history-page'))data=history();
    else if(u.pathname.endsWith('/latest-log'))data={run_id:u.searchParams.get('run_id')||'new-run',stdout_log:'stdout.log',stdout_tail:'Live stdout α',stderr_tail:'Live stderr',status:runStatus,progress:{attempted:3,attempt_total:10,percent:30}};
    else if(u.pathname==='/api/core/run-settings')data=settings;
    else if(u.pathname.endsWith('/strategy-candidates-page'))data=candidatePage;
    else if(u.pathname.endsWith('/candidate-domain-index-page'))data={domains:[{domain:'example.com',strategy_count:2},{domain:'video.example.net',strategy_count:2}],total:2,has_more:false};
    else if(u.pathname.endsWith('/presets/domains'))data={domains:(presets[u.searchParams.get('kind')==='system'?'system':'custom'][u.searchParams.get('scope')]?.[u.searchParams.get('name')]||[]).map(domain=>({domain})),has_more:false};
    else if(u.pathname.endsWith('/presets/save')){const p=body();presets.custom[p.scope][p.name]=p.domains;data=presets;}
    else if(u.pathname.endsWith('/delete-user-lists')){const p=body();delete presets.custom[p.scope][p.name];data=presets;}
    else if(u.pathname==='/api/web/presets')data=presets;
    else if(u.pathname.endsWith('/start-run')){current={run_id:'new-run',status:'running'};runStatus='running';data={run_id:'new-run'};}
    else if(u.pathname.endsWith('/stop-current-run')){current=null;runStatus='stopped';data={stopped:true};}
    else if(u.pathname.endsWith('/backups/list'))data={snapshots:[{snapshot_id:'fixture-backup',size_bytes:42,checksum:'ok'}]};
    else if(u.pathname.endsWith('/run-settings/save')){settings=body().settings;data=settings;}
    else if(u.pathname.endsWith('/v2fly/categories'))data={categories:['category-a'],storage:{source:'fixture'}};
    else if(u.pathname.endsWith('/v2fly/category-domains'))data={domains:['one.example','two.example']};
    else if(u.pathname.endsWith('/releases/available'))data={current:{version:'0.4.4'},releases:[{channel:'stable',version:'0.4.4',url:'https://github.com/balbomush/GP-plane/releases'}]};
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const tab=async name=>page.getByRole('tablist').getByRole('tab',{name,exact:true}).click();
  const button=name=>page.getByRole('button',{name,exact:true});
  if(before)await page.addInitScript(before);
  await page.goto(baseUrl);
  const signIn=async()=>{await page.getByLabel('Логин',{exact:true}).fill('admin');await page.getByLabel('Пароль',{exact:true}).fill('test-only');await button('Войти').click();};
  if(login){await signIn();await page.getByRole('tablist').waitFor();}

    return {page,context,browser,requests,errors,tab,button,signIn,close,url:baseUrl};
  }catch(error){await close();throw error;}
}
module.exports={createUi};
