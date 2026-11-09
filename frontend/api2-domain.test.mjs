import assert from 'node:assert/strict';
import {discoveryPayload,initialPreferences} from './src/domain/finder.ts';
const p={...initialPreferences(),run_mode:'multi',limit_time_enabled:true};
const body=discoveryPayload(p,'example.com');
assert.deepEqual(body.domains,['example.com']);
assert.equal(body.parameters.curl_parallelism,4);
assert.ok(!('timeout_seconds' in body));assert.ok(!('mode' in body));assert.ok(!('settings' in body));
assert.equal(discoveryPayload({...p,run_mode:'standard'},'example.com').parameters.curl_parallelism,undefined);
console.log('API2 finder wire PASS');
