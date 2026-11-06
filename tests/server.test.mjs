import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createMapServer} from '../server.mjs';

test('desktop server serves built UI, keeps secrets private, rejects foreign sites and rebound hosts',async()=>{
  const key='a'.repeat(32),server=createMapServer({env:{AMAP_WEB_SERVICE_KEY:key}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const page=await fetch(base);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    const html=await page.text();assert.match(html,/window-layout/);assert.ok(!html.includes(key));
    const health=await fetch(base+'/api/health');const body=await health.text();assert.equal(JSON.parse(body).walking_available,true);assert.ok(!body.includes(key));
    for(const file of ['/.env','/desktop/main.mjs','/assets/%2e%2e%2f%2e%2e%2f.env'])assert.equal((await fetch(base+file)).status,404);
    assert.equal((await fetch(base+'/api/query',{method:'POST',headers:{Origin:'https://example.org','Content-Type':'application/json'},body:'{}'})).status,403);
    const foreignHost=await new Promise((resolve,reject)=>{http.get(base,{headers:{Host:'example.org'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
    assert.equal(foreignHost,403);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
