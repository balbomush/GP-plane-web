import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {strategyText,strategiesText,candidateDomains,validCandidates} from '@gp-plane/gp-ui/format';
const golden=JSON.parse(fs.readFileSync(new URL('../tests/fixtures/v044-populated.json',import.meta.url)));
test('golden order/arguments/domains preserved, no shell/file interpretation',()=>{
  assert(validCandidates(golden.candidates));
  for(const row of golden.candidates){
    assert.equal(strategyText(row),row.args.trim());
    assert.deepEqual(candidateDomains(row),['example.com','video.example.net']);
  }
  assert.equal(strategiesText(golden.candidates),golden.candidates.map(c=>c.args.trim()).join('\n'));
  assert(strategiesText(golden.candidates).includes('  --lua-desync='));
  assert(strategiesText(golden.candidates).includes('@/opt/zapret2/files/fake.bin'));
});
test('empty and invalid payloads',()=>{
  assert.equal(strategiesText([]),'');
  for(const bad of [null,{},[null],[{id:'x',protocol:'tls',args:42}], [{id:'x',protocol:'tls',args:'x',seen:[null]}]])
    assert.equal(validCandidates(bad),false);
});
