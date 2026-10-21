import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialPreferences,normalizePreferences,discoveryPayload,domains} from './src/domain/finder.ts';
import {createCandidateSelectionModel} from './src/domain/candidate-selection.js';
import {mergeLogPayload} from './src/domain/log.js';
import {latestById} from './src/domain/history.ts';

test('v0.4.4 launch contract keeps protocol/options/mode and numeric bounds',()=>{
  const preferences=initialPreferences();preferences.include_quic=false;
  preferences.repeats=15;preferences.curl_parallelism=23;preferences.curl_max_time=-1;
  preferences.run_mode='multi';preferences.limit_time_enabled=true;preferences.timeout_hours=0;
  const p=discoveryPayload(normalizePreferences(preferences,10),'a.example, a.example\nb.example');
  assert.equal(p.mode,'multi_domain');assert.deepEqual(p.domains,['a.example','b.example']);
  assert.deepEqual(p.protocols,['tcp']);assert.equal(p.curl_parallelism,10);assert.equal(p.timeout_seconds,60);
  assert.equal(p.settings.repeats,10);assert.equal(p.settings.curl_max_time,1);assert.equal(p.settings.skip_dnscheck,true);
  assert(!Object.hasOwn(p.settings,'debug_stdout'));
  const standard=discoveryPayload(normalizePreferences({...initialPreferences(),run_mode:'standard'}),'a.example');
  assert(!Object.hasOwn(standard,'curl_parallelism'));assert(!Object.hasOwn(standard,'timeout_seconds'));
  assert.throws(()=>discoveryPayload({...initialPreferences(),enable_tls12:false,include_quic:false},'a.example'),/протокол/);
  assert.throws(()=>discoveryPayload(initialPreferences(),''),/домен/);
});
test('existing balance prioritizes required, does not substitute launch domains or mutate inputs',()=>{
  const model=createCandidateSelectionModel({uniqueDomains:domains});
  const rows=[{id:'desired',args:' --desired  x ',seen:[{domain:'optional.example'}]},
    {id:'required',args:' --required  y ',seen:[{domain:'required.example'}]}];
  const before=JSON.stringify(rows);
  for(const mode of ['coverage','minimal','balance']){
    const result=model.buildCandidateResult(mode,{required:['required.example','missing.example'],desired:['optional.example']},rows);
    assert.deepEqual(result.uncovered_required,['missing.example']);assert.equal(result.required_coverage.covered,1);
    assert.equal(result.desired_coverage.covered,1);assert.equal(result.strategy_set.length,2);
    if(mode==='balance')assert.equal(result.strategy_set[0].args,'--required  y');
    assert(model.candidateResultText(result).includes('  '));
  }
  assert.equal(JSON.stringify(rows),before);
  assert.equal(model.buildCandidateResult('balance',{required:[],desired:[]},rows).strategy_set.length,0);
});
test('incremental log reconciliation retains exact Unicode and bounded 200-line stream tails',()=>{
  const previous={run_id:'one',stdout_log:'out',stderr_log:'err',stdout_tail:'ёж',stderr_tail:'first'};
  const next={run_id:'one',stdout_log:'out',stderr_log:'err',stdout_append:'α\n'+Array.from({length:250},(_,i)=>String(i)).join('\n'),stderr_append:'second'};
  const merged=mergeLogPayload(previous,next);
  assert.equal(merged.stdout_tail.split('\n').length,200);assert(merged.stdout_tail.endsWith('249'));
  assert.equal(merged.stderr_tail,'first\nsecond');
  const replacement=mergeLogPayload(previous,{run_id:'two',stdout_log:'new',stdout_tail:'different'});
  assert.equal(replacement.stdout_tail,'different');
});
test('overlapping public history pages deduplicate by run_id without legacy id',()=>{
  const newer={run_id:'same-run',timestamp:'2026-10-20',status:'stopped'};
  const rows=latestById([{run_id:'same-run',timestamp:'2026-10-20',status:'running'},
    {run_id:'older-run',timestamp:'2026-10-19',status:'success'},newer]);
  assert.equal(rows.length,2);assert.equal(rows[1],newer);assert.equal(rows[0].run_id,'older-run');
});
