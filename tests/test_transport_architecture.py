"""Unchanged R2 transport/lifetime assertions, relocated to their Web owner.

Provenance: Core v0.4.4 tests/test_ui_architecture.py, first two methods.
Only ESM loading and source locations changed; no assertions removed.
"""
import os,subprocess,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NODE=Path(os.environ.get('GP_NODE',r'B:\rkn killer\Codex-workspace\runtime\bgt-001\playwright-1.62.1-node-24.19.0-official\node\node.exe'))
SCRIPTS=ROOT/'frontend/src'

class TransportArchitectureTests(unittest.TestCase):
    def test_transport_session_run_and_realtime_lifetimes(self) -> None:
        self.assertTrue(NODE.is_file(), f"pinned Node runtime is unavailable: {NODE}")
        harness = r'''
const fs = require('fs'); const vm = require('vm'); const base = process.argv[1];
function load(name, symbol) { vm.runInThisContext(fs.readFileSync(base + '/' + ({'run-state.js':'domain/run-state.js','realtime-controller.js':'transport/realtime-controller.js'}[name]||name), 'utf8').replace(/^export \{.*\};?$/gm,'').replace(/^export /gm,'') + `\nglobalThis.${symbol} = ${symbol};`, {filename:name}); }
load('api-client.js', 'ApiClient'); load('run-state.js', 'RunState'); load('realtime-controller.js', 'RealtimeController'); load('session-controller.js', 'SessionController');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
(async () => {
  let unauthorized = 0; let requests = [];
  const encoder = new TextEncoder(); const utf8 = encoder.encode('event: log\ndata: {"line":"ёж"}\n\n');
  const client = new ApiClient({getToken: () => 'token', onUnauthorized: () => { unauthorized += 1; }, fetch: async (url, init) => {
    requests.push({url, init});
    if (url === '/error') return new Response(JSON.stringify({error:{message:'bad', code:'bad_code', details:{x:1}}}), {status:400, statusText:'Bad', headers:{'Content-Type':'application/json'}});
    if (url === '/blob') return new Response('zip', {status:200, headers:{'Content-Disposition':'attachment; filename="a.zip"'}});
    if (url === '/sse') return new Response(new ReadableStream({start(c) { c.enqueue(utf8.slice(0, 29)); c.enqueue(utf8.slice(29)); c.close(); }}), {status:200});
    if (url === '/abort') throw Object.assign(new Error('aborted'), {name:'AbortError'});
    if (url === '/401') return new Response('', {status:401});
    return new Response(JSON.stringify({ok:true}), {status:200, headers:{'Content-Type':'application/json'}});
  }});
  assert((await client.getJson('/ok')).ok, 'JSON request failed');
  const multipart = new FormData(); multipart.append('file', new Blob(['zip']), 'backup.zip');
  await client.request('/multipart', {method:'POST', body:multipart});
  const multipartRequest = requests.at(-1);
  assert(multipartRequest.init.body === multipart && !Object.keys(multipartRequest.init.headers).some(key => key.toLowerCase() === 'content-type'), 'multipart body identity or boundary headers changed');
  try { await client.postJson('/error', {x:1}); assert(false, 'JSON error did not reject'); } catch (error) { assert(error.status === 400 && error.code === 'bad_code' && error.details.x === 1, 'JSON error shape changed'); }
  const binary = await client.blob('/blob'); assert((await binary.blob.text()) === 'zip', 'blob response changed');
  const events = []; await client.streamSse('/sse', {onEvent: (event, data) => events.push([event, data])});
  assert(events.length === 1 && events[0][1].includes('ёж'), 'split UTF-8 SSE frame was not decoded');
  try { await client.getJson('/abort', {signal:new AbortController().signal}); assert(false, 'abort did not propagate'); } catch (error) { assert(error.name === 'AbortError', 'abort semantics changed'); }
  await client.request('/401'); assert(unauthorized === 1, '401 did not notify session owner');
  try { await client.postJson('/401', {}); assert(false, '401 JSON error did not reject'); } catch (error) { assert(error.status === 401 && !error.staleSession, '401 JSON error contract changed after logout'); }
  assert(unauthorized === 2, '401 JSON request did not notify session owner');
  assert(requests.every(item => item.init.credentials === 'same-origin' && item.init.headers.Authorization === 'Bearer token'), 'auth/same-origin transport changed');
  let requestEpoch = 1; const sessionAbort = new AbortController();
  const guarded = new ApiClient({getToken: () => 'token', getEpoch: () => requestEpoch, isEpochCurrent: (epoch) => epoch === requestEpoch, getSignal: () => sessionAbort.signal, fetch: (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), {name:'AbortError'})), {once:true}))});
  const staleRequest = guarded.getJson('/held'); sessionAbort.abort(); requestEpoch += 1;
  try { await staleRequest; assert(false, 'session cancellation did not abort an in-flight request'); } catch (error) { assert(error.name === 'AbortError', 'session cancellation changed request semantics'); }

  // Headers are not completion: composed caller/session signals stay attached
  // while JSON and blob bodies are pending, then detach their listeners.
  const caller = new AbortController(), lifetime = new AbortController();
  const listenerCounts = signal => { let added = 0, removed = 0; const add = signal.addEventListener.bind(signal), remove = signal.removeEventListener.bind(signal); signal.addEventListener = (...args) => { if (args[0] === 'abort') added += 1; return add(...args); }; signal.removeEventListener = (...args) => { if (args[0] === 'abort') removed += 1; return remove(...args); }; return () => ({added, removed}); };
  const callerCounts = listenerCounts(caller.signal), lifetimeCounts = listenerCounts(lifetime.signal);
  let bodySignal, bodyStarted;
  const heldBody = new ApiClient({getSignal: () => lifetime.signal, fetch: async (_url, init) => {
    bodySignal = init.signal;
    return {ok:true, status:200, json: () => new Promise((_resolve, reject) => { bodyStarted = true; init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted body'), {name:'AbortError'})), {once:true}); })};
  }});
  const heldJson = heldBody.getJson('/headers-arrived', {signal:caller.signal});
  while (!bodyStarted) await tick(); caller.abort();
  try { await heldJson; assert(false, 'caller abort after JSON headers resolved'); } catch (error) { assert(error.name === 'AbortError', 'JSON body abort was converted into success'); }
  assert(bodySignal.aborted, 'composed JSON signal was released before body completion');
  assert(callerCounts().added === callerCounts().removed && lifetimeCounts().added === lifetimeCounts().removed, 'JSON combined-signal listeners leaked');
  let blobStarted, blobSignal;
  const blobCaller = new AbortController(), blobLifetime = new AbortController();
  const heldBlob = new ApiClient({getSignal: () => blobLifetime.signal, fetch: async (_url, init) => ({ok:true, status:200, blob: () => new Promise((_resolve, reject) => { blobStarted = true; blobSignal = init.signal; init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted blob'), {name:'AbortError'})), {once:true}); })})});
  const pendingBlob = heldBlob.blob('/blob-headers', {signal:blobCaller.signal}); while (!blobStarted) await tick(); blobLifetime.abort();
  try { await pendingBlob; assert(false, 'session abort after blob headers resolved'); } catch (error) { assert(error.name === 'AbortError', 'blob body abort changed semantics'); }
  assert(blobSignal.aborted, 'composed blob signal was released before body completion');
  const malformed = new ApiClient({fetch: async () => ({ok:true, status:200, json: async () => { throw new Error('malformed'); }})});
  assert(JSON.stringify(await malformed.postJson('/malformed', {})) === '{}', 'successful malformed JSON no longer used the established empty fallback');

  // Password completion belongs to its source epoch; cancelling its response
  // body after a replacement session must not log the replacement out.
  let passwordToken = 'old', passwordController, passwordBodyStarted = false, passwordErrors = 0;
  const passwordApi = new ApiClient({getToken: () => passwordToken, getEpoch: () => passwordController.epoch(), isEpochCurrent: epoch => passwordController.isCurrent(epoch), getSignal: () => passwordController.signal(), fetch: async (_url, init) => ({ok:true, status:200, json: () => new Promise((_resolve, reject) => { passwordBodyStarted = true; init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted password'), {name:'AbortError'})), {once:true}); })})});
  passwordController = new SessionController({api:passwordApi, token:{get:() => passwordToken, clear:() => {passwordToken='';}, store:() => {}}, realtime:{dispose(){},start(){}}, ui:{boot(){},ready(){},login(){}}});
  const oldPassword = passwordController.changePassword({}, () => { passwordErrors += 1; }); while (!passwordBodyStarted) await tick();
  passwordController.logout(); passwordToken = 'new'; await passwordController.bootstrap(async () => ({}), () => {}); const replacementEpoch = passwordController.epoch();
  assert((await oldPassword) === false && passwordToken === 'new' && passwordController.epoch() === replacementEpoch && passwordErrors === 0, 'old password continuation changed the replacement session');

  const view = {finderRuns: [], status: null, finderLog: null}; const runs = new RunState(view);
  const oldGeneration = runs.acknowledge('old'); const newGeneration = runs.acknowledge('new');
  assert(!runs.acceptLog({run_id:'old'}, false, (_, value) => value), 'old run log overwrote accepted run');
  runs.mergeHistory({runs:[{run_id:'old', status:'stopped'}]}, true, rows => rows);
  assert(runs.isGenerationCurrent(newGeneration) && !runs.isGenerationCurrent(oldGeneration), 'old history cleared newer run');
  runs.mergeStatus({current_run:{run_id:'old', status:'running'}});
  assert(view.status.current_run.run_id === 'new', 'old status replaced accepted run');

  const logView = {finderRuns: [], status:null, finderLog:null}; const logRuns = new RunState(logView);
  logRuns.acknowledge('new'); logRuns.acceptLog({run_id:'new',stdout_tail:'base\n'}, false, (_old, next) => next);
  const firstLogRequest = logRuns.captureLogRequest(), secondLogRequest = logRuns.captureLogRequest(); let merged = 0;
  const append = (previous, next) => { merged += 1; return {...next, stdout_tail:(previous.stdout_tail || '') + next.stdout_append}; };
  assert(logRuns.acceptLog({run_id:'new',stdout_append:'delta\n'}, true, append, firstLogRequest), 'first incremental log was rejected');
  assert(!logRuns.acceptLog({run_id:'new',stdout_append:'delta\n'}, true, append, secondLogRequest) && merged === 1 && logView.finderLog.stdout_tail === 'base\ndelta\n', 'same-offset incremental log was appended twice');
  logRuns.mergeHistory({runs:[{run_id:'new',status:'stopped'}]}, true, rows => rows);
  assert(logRuns.acceptLog({run_id:'new',status:'stopped',stdout_tail:'base\nFINAL\n'}, false, (_old, next) => next), 'valid terminal log was rejected after matching history');
  assert(!logRuns.acceptLog({run_id:'old',stdout_tail:'old'}, false, (_old, next) => next), 'late old log resurrected after terminal history');
  logRuns.mergeStatus({current_run:{run_id:'old',status:'running'}});
  assert(!logRuns.busy() && !logRuns.current(), 'late old status resurrected after terminal history');
  logRuns.mergeHistory({runs:[{run_id:'external',status:'running'}]}, true, rows => rows);
  logRuns.mergeStatus({current_run:{run_id:'external',status:'running'}});
  assert(logRuns.busy() && logRuns.current().run_id === 'external', 'history-evidenced external run remained barred after terminal history');
  const extentView = {finderRuns: [],status:null,finderLog:null}; const extentRuns = new RunState(extentView);
  extentRuns.acknowledge('extent'); extentRuns.acceptLog({run_id:'extent',stdout_log:'extent.out',stdout_size:5,stdout_tail:'base\n'}, false, (_old, next) => next);
  const extentOne = extentRuns.captureLogRequest(), extentTwo = extentRuns.captureLogRequest();
  const extentMerge = (previous, next) => ({...next, stdout_tail:next.stdout_tail || (previous.stdout_tail || '') + (next.stdout_append || '')});
  assert(extentRuns.acceptLog({run_id:'extent',stdout_log:'extent.out',stdout_size:11,stdout_append:'first\n'}, true, extentMerge, extentOne), 'first extent was rejected');
  assert(extentRuns.acceptLog({run_id:'extent',stdout_log:'extent.out',stdout_size:18,stdout_append:'first\nsecond\n'}, true, extentMerge, extentTwo) && extentView.finderLog.stdout_size === 18 && extentView.finderLog.stdout_tail === 'base\nfirst\nsecond\n', 'larger same-offset extent lost newly arrived output');

  // A status emitted before its matching runs event is a normal SSE order.  It
  // must become current once history proves it, while a retired status arriving
  // later must leave that accepted external current intact.
  const orderedView = {finderRuns: [],status:null,finderLog:null}; const ordered = new RunState(orderedView);
  ordered.acknowledge('local'); ordered.mergeHistory({runs:[{run_id:'local',status:'stopped'}]}, true, rows => rows);
  assert(!ordered.mergeStatus({current_run:{run_id:'external',status:'running'}}), 'unproven external status was accepted too early');
  ordered.mergeHistory({runs:[{run_id:'external',status:'running'}]}, true, rows => rows);
  assert(ordered.busy() && ordered.current().run_id === 'external', 'status-before-runs did not recover external current');
  ordered.mergeStatus({current_run:{run_id:'local',status:'running'}});
  assert(ordered.busy() && ordered.current().run_id === 'external', 'retired status cleared recognized external current');

  // Same-offset replies are independently reconciled per stream.  The later
  // response may grow one stream while repeating an older extent of the other.
  const overlapView = {finderRuns: [],status:null,finderLog:null}; const overlap = new RunState(overlapView);
  const productionMerge = (previous, next) => {
    const join = (left, right) => !left || !right || left.endsWith('\n') || right.startsWith('\n') ? left + right : left + '\n' + right;
    return {...next, stdout_tail:next.stdout_tail || join(previous.stdout_tail || '', next.stdout_append || ''), stderr_tail:next.stderr_tail || join(previous.stderr_tail || '', next.stderr_append || '')};
  };
  overlap.acknowledge('overlap'); overlap.acceptLog({run_id:'overlap',stdout_log:'out',stdout_size:5,stdout_tail:'base\n',stderr_log:'err',stderr_size:5,stderr_tail:'base\n'}, false, productionMerge);
  const overlapOne=overlap.captureLogRequest(), overlapTwo=overlap.captureLogRequest();
  assert(overlap.acceptLog({run_id:'overlap',stdout_log:'out',stdout_size:5,stdout_append:'',stderr_log:'err',stderr_size:11,stderr_append:'err-1\n'},true,productionMerge,overlapOne),'first stderr extent rejected');
  assert(overlap.acceptLog({run_id:'overlap',stdout_log:'out',stdout_size:11,stdout_append:'out-1\n',stderr_log:'err',stderr_size:11,stderr_append:'err-1\n'},true,productionMerge,overlapTwo) && overlapView.finderLog.stdout_tail === 'base\nout-1\n' && overlapView.finderLog.stderr_tail === 'base\nerr-1\n' && overlapView.finderLog.stderr_size === 11,'per-stream overlap duplicated or regressed stderr');
  const utfView={finderRuns:[],status:null,finderLog:null}; const utf=new RunState(utfView); utf.acknowledge('utf'); utf.acceptLog({run_id:'utf',stdout_log:'out',stdout_size:0,stdout_tail:'',stderr_log:'err',stderr_size:0,stderr_tail:''},false,productionMerge);
  const utfOne=utf.captureLogRequest(), utfTwo=utf.captureLogRequest();
  assert(utf.acceptLog({run_id:'utf',stdout_log:'out',stdout_size:1,stdout_append:'�',stderr_log:'err',stderr_size:0},true,productionMerge,utfOne),'split UTF-8 prefix rejected');
  assert(utf.acceptLog({run_id:'utf',stdout_log:'out',stdout_size:3,stdout_append:'€',stderr_log:'err',stderr_size:0},true,productionMerge,utfTwo) && utfView.finderLog.stdout_tail === '€','overlap completed UTF-8 character was corrupted');

  const incompleteEvents = []; await new ApiClient({fetch: async () => new Response('event: status\ndata: {"current_run":')}).streamSse('/eof', {onEvent: (event, data) => incompleteEvents.push([event, data])});
  assert(incompleteEvents.length === 0, 'unterminated SSE EOF frame was dispatched');

  let streamCalls = 0, fallbackCalls = 0, eventCalls = 0; const streamHandlers = [], timeouts = [], intervals = [], cleared = [];
  const realtime = new RealtimeController({api:{streamSse: async (_url, options) => { streamCalls += 1; streamHandlers.push(options); options.onOpen(); throw new Error('closed'); }}, url: () => '/events', onEvent: () => { eventCalls += 1; }, fallback: () => { fallbackCalls += 1; }, isActive: () => true, setTimeout: (fn) => { const item={fn}; timeouts.push(item); return item; }, clearTimeout: (item) => cleared.push(item), setInterval: (fn) => { const item={fn}; intervals.push(item); return item; }, clearInterval: (item) => cleared.push(item)});
  realtime.start(); await tick(); assert(timeouts.length === 1 && intervals.length === 1, 'reconnect/fallback were not scheduled once');
  timeouts[0].fn(); await tick(); assert(streamCalls === 2 && timeouts.length === 2 && intervals.length === 1, 'reconnect duplicated a stream or fallback timer');
  streamHandlers[0].onEvent('status', '{}'); assert(eventCalls === 0, 'previous connection delivered an event after reconnect');
  intervals[0].fn(); assert(fallbackCalls === 1, 'fallback polling did not run while disconnected');
  realtime.dispose(); assert(cleared.length >= 2, 'dispose left reconnect or polling timer active');
  assert(eventCalls === 0, 'unexpected stale stream event');

  let resolveFirst, resolveSecond, applied = [], clears = 0, disposed = 0;
  const session = new SessionController({api:{postJson: async () => ({access_token:'new'})}, token:{get:() => 'token', store:() => {}, clear:() => {clears += 1;}}, realtime:{dispose:() => {disposed += 1;}, start:() => {}}, ui:{boot:() => {}, ready:() => {}, login:() => {}}});
  const first = session.bootstrap(() => new Promise(resolve => {resolveFirst = resolve;}), value => applied.push(value));
  const second = session.bootstrap(() => new Promise(resolve => {resolveSecond = resolve;}), value => applied.push(value));
  resolveFirst('old'); await tick(); resolveSecond('new'); await second; await first;
  assert(applied.length === 1 && applied[0] === 'new', 'stale bootstrap applied after a newer session');
  session.logout(); assert(clears === 1 && disposed >= 3, 'logout did not cancel the session lifetime');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
'''
        completed = subprocess.run(
            [str(NODE), "-e", harness, str(SCRIPTS)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=30,
        )
        self.assertEqual(0, completed.returncode, completed.stderr or completed.stdout)

    def test_native_transport_error_and_cancellation_contracts(self) -> None:
        """Use native fetch so response-body signal semantics cannot be faked."""
        harness = r'''
const fs=require('fs'),vm=require('vm'),http=require('http'),base=process.argv[1];
vm.runInThisContext(fs.readFileSync(base+'/api-client.js','utf8').replace(/^export /gm,'')+'\nglobalThis.ApiClient=ApiClient;');
const assert=(ok,message)=>{if(!ok)throw new Error(message)}; let held500, held500Ready, held401, held401Ready;
const server=http.createServer((request,response)=>{
  if(request.url==='/401'){response.writeHead(401,{'Content-Type':'application/json'});response.end(JSON.stringify({error:{message:'session expired detail',code:'unauthorized',details:{test:1}}}));return;}
  if(request.url==='/hold401'){response.writeHead(401,{'Content-Type':'application/json'});response.write('{"error":');held401=response;held401Ready();return;}
  if(request.url==='/malformed'){response.writeHead(200,{'Content-Type':'application/json'});response.end('not json');return;}
  if(request.url==='/hold500'){response.writeHead(500,{'Content-Type':'application/json'});response.write('{"error":');held500=response;held500Ready();return;}
  response.writeHead(200,{'Content-Type':'application/json'});response.end('{"ok":true}');
});
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
try {
  for(const method of ['getJson','postJson']) { let token='old',session=new AbortController(); const api=new ApiClient({getToken:()=>token,getSignal:()=>session.signal,onUnauthorized:()=>{token='';session.abort();}}); let error; try {await (method==='getJson'?api.getJson(origin+'/401'):api.postJson(origin+'/401',{}));} catch(value){error=value;} assert(token==='',method+' did not log out after body consumption'); if(method==='getJson') assert(error.message.includes('session expired detail'), 'GET 401 text was lost'); else assert(error.status===401&&error.code==='unauthorized'&&error.details.test===1&&error.data.error.message==='session expired detail','POST 401 details were lost'); }
  assert(JSON.stringify(await new ApiClient().postJson(origin+'/malformed',{}))==='{}','malformed successful POST did not retain fallback');
  const timeout=new DOMException('Caller deadline reached','TimeoutError'),pre=new AbortController(),live=new AbortController();pre.abort(timeout); let preError; try {await new ApiClient({getSignal:()=>live.signal}).getJson(origin+'/ok',{signal:pre.signal});} catch(error){preError=error;} assert(preError===timeout&&preError.name==='TimeoutError','pre-aborted caller reason was not preserved');
  const caller=new AbortController(),session=new AbortController();const heldGate=new Promise(resolve=>held500Ready=resolve);const pending=new ApiClient({getSignal:()=>session.signal}).postJson(origin+'/hold500',{}, {signal:caller.signal});await heldGate;const reason=new DOMException('deadline','TimeoutError');caller.abort(reason);held500.end('true}');let cancel;try{await pending;}catch(error){cancel=error;}assert(cancel===reason&&cancel.name==='TimeoutError','HTTP-500 body cancellation became a synthetic HTTP error');
  // A 401 is still a pending response body.  Replacing the owning session while
  // it is held must reject it as stale, without its deferred cleanup logging
  // out the replacement token.
  for (const method of ['getJson','postJson']) { let token='old',epoch=1,current=new AbortController(),logouts=[]; const heldGate=new Promise(resolve=>held401Ready=resolve); const api=new ApiClient({getToken:()=>token,getEpoch:()=>epoch,isEpochCurrent:value=>value===epoch,getSignal:()=>current.signal,onUnauthorized:()=>{logouts.push(token);token='';current.abort();}}); const old=method==='getJson'?api.getJson(origin+'/hold401'):api.postJson(origin+'/hold401',{}); await heldGate; current.abort(new DOMException('old session','AbortError')); epoch+=1; token='replacement'; current=new AbortController(); held401.end('true}}'); let stale;try{await old;}catch(error){stale=error;} assert(stale&&stale.staleSession&&token==='replacement'&&logouts.length===0,method+' old 401 body logged out replacement session'); }
  const held401Caller=new AbortController(), held401Gate=new Promise(resolve=>held401Ready=resolve);const pending401=new ApiClient().postJson(origin+'/hold401',{}, {signal:held401Caller.signal});await held401Gate;held401Caller.abort(new DOMException('deadline','TimeoutError'));held401.end('true}}');let cancel401;try{await pending401;}catch(error){cancel401=error;}assert(cancel401&&cancel401.name==='TimeoutError'&&cancel401.status===undefined,'HTTP-401 body cancellation became synthetic Unauthorized');
  console.log('native 401 replacement/malformed/reason/500 cancellation: PASS');
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
'''
        completed = subprocess.run(
            [str(NODE), "-e", harness, str(SCRIPTS)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            timeout=30,
        )
        self.assertEqual(0, completed.returncode, completed.stderr or completed.stdout)
