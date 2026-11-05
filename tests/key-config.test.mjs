import test from 'node:test';
import assert from 'node:assert/strict';
import {configuredKey} from '../lib/key-config.mjs';
import {handleApi} from '../lib/metro-service.mjs';

test('blank and example keys are not presented as configured',()=>{
 for(const raw of [undefined,'','  ','replace_with_your_amap_web_service_key','请填写自己的Key'])assert.equal(configuredKey(raw),'');
 assert.equal(configuredKey('  local-test-value  '),'local-test-value');
});
test('health reports availability without exposing the supplied credential',async()=>{
 const secret='test-only-credential-never-a-real-api-key';
 const response=await handleApi(new Request('http://localhost/api/health'),{AMAP_WEB_SERVICE_KEY:secret});
 const text=await response.text();assert.equal(JSON.parse(text).walking_available,true);assert.equal(text.includes(secret),false);
 const missing=await handleApi(new Request('http://localhost/api/health'),{});assert.equal((await missing.json()).walking_available,false);
});
