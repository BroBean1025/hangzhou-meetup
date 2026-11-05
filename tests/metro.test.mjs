import test from 'node:test';
import assert from 'node:assert/strict';
import {geometry,parseAccess,gcjToWgs,wgsToGcj,MetroService,handleApi} from '../lib/metro-service.mjs';

test('coordinate round trip is reversible within sub-meter tolerance',()=>{
  const point=[120.125521,30.261332],w=gcjToWgs(...point),r=wgsToGcj(...w);
  assert.ok(Math.abs(r[0]-point[0])<1e-7&&Math.abs(r[1]-point[1])<1e-7);
});
test('missing geometry is never replaced by a straight line',()=>{
  assert.equal(geometry([['walk','步行',[]]]).status,'unavailable');
  const r=geometry([['walk','步行',[{polyline:'120,30;120.1,30.1;bad;120.2,30.2;120.3,30.3'}]]]);
  assert.equal(r.status,'partial');assert.equal(r.parts.length,2);
});
test('zero duration is allowed but missing/negative values cannot become zero',()=>{
  assert.equal(parseAccess('walk',{route:{paths:[{duration:'0',distance:'0'}]}}).seconds,0);
  assert.throws(()=>parseAccess('walk',{route:{paths:[{duration:[],distance:'0'}]}}));
  assert.throws(()=>parseAccess('walk',{route:{paths:[{duration:'-1',distance:'0'}]}}));
});
test('bus excludes metro and selects one alternative per segment',()=>{
  const p={duration:'600',distance:'1000',segments:[{railway:{alters:[],via_stops:[]},bus:{buslines:[{name:'公交1',type:'普通公交',polyline:'120,30;120.1,30.1'},{name:'公交2',type:'普通公交',polyline:'120,30;120.2,30.2'}]}}]};
  const r=parseAccess('bus',{route:{transits:[p]}});assert.equal(r.geometry.parts.length,1);assert.equal(r.geometry.parts[0].label,'公交1');
  p.segments[0].bus.buslines[0].type='地铁线路';assert.throws(()=>parseAccess('bus',{route:{transits:[p]}}));
});
test('origins cannot invent school gates, modes or station IDs',()=>{
  const m=new MetroService('');m.stations=new Map([['s',{id:'s'}]]);
  assert.equal(m.normalize({kind:'station',station_id:'s'}).id,'station:s');
  for(const d of [{kind:'station',station_id:'x'},{id:'yuquan',gates:['no']},{id:'yuquan',gates:[]},{id:'yuquan',mode:'fly'}])assert.throws(()=>m.normalize(d));
});
test('public API rejects cross-origin and malformed payloads without provider calls',async()=>{
  let r=await handleApi(new Request('https://example.com/api/query',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}),{});assert.equal(r.status,403);
  r=await handleApi(new Request('https://example.com/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:'[]'}),{});assert.equal(r.status,400);
  r=await handleApi(new Request('https://example.com/api/query',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(262145)}),{});assert.equal(r.status,413);
});
