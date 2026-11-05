import test from 'node:test';
import assert from 'node:assert/strict';
import {MetroService} from '../lib/metro-service.mjs';

const main='cn-hangzhou-east-railway-station',square=main+'-east-square';
function fixture(){
 const m=new MetroService('');m.version='fixture';
 m.stations=new Map([[main,'火车东站'],[square,'火车东站（东广场）'],['west','火车西站'],['center','龙翔桥']].map(([id,name])=>[id,{id,name,location:{lon:120.2,lat:30.3}}]));
 const durations={ [main]:{[main]:0,[square]:500,west:1500,center:600},[square]:{[main]:500,[square]:0,west:900,center:1000},west:{[main]:1500,[square]:900,west:0,center:1500},center:{[main]:600,[square]:1000,west:1500,center:0}};
 m.engine=async(d,gate)=>({start:m.stations.get(gate),errors:[],options:[{station:m.stations.get(gate),walk:{seconds:0,mode:'station'}}],reached:Object.fromEntries(Object.entries(durations[gate]).map(([id,seconds])=>[id,{seconds,access_seconds:0,metro_seconds:seconds,via_id:gate}]))});
 m.metroResult=async(engine,base,end,egress)=>({total_seconds:base.seconds+egress.seconds,origin_station_id:engine.start.id,destination_station_id:end.id,warnings:[]});
 return m;
}
test('both old station IDs normalize to one four-line hub origin',()=>{
 const m=fixture(),a=m.normalize({kind:'station',station_id:main}),b=m.normalize({kind:'station',station_id:square});
 assert.deepEqual(a,b);assert.deepEqual(a.gates,[main,square]);
 assert.deepEqual(m.expandStations([main,square]),[main,square]);
 assert.deepEqual(m.expandStations(['center']),['center']);
});
test('hub origin chooses a different station area for each destination',async()=>{
 const m=fixture();
 for(const [dest,origin,seconds] of [['west',square,900],['center',main,600]]){
  const r=(await m.query({origin:{kind:'station',station_id:main},station_id:dest})).results[0];
  assert.equal(r.origin_station_id,origin);assert.equal(r.total_seconds,seconds);assert.equal(r.origin_name,'杭州东站');
  assert.ok(r.warnings.some(s=>s.includes('跨站区')));
 }
 const summary=await m.describe({kind:'station',station_id:square});
 assert.equal(summary.times.west.seconds,900);assert.equal(summary.times.center.seconds,600);
 assert.equal(summary.times.west.gate_key,square);assert.equal(summary.times.center.gate_key,main);
});
test('destination expands even when an old client sends just one child station',async()=>{
 const m=fixture();
 for(const [origin,target,seconds] of [['west',square,900],['center',main,600]]){
  for(const id of [main,square]){
   const r=(await m.query({origin:{kind:'station',station_id:origin},station_ids:[id]})).results[0];
   assert.equal(r.destination_station_id,target);assert.equal(r.total_seconds,seconds);assert.equal(r.destination.name,'杭州东站');
  }
 }
});
test('one unavailable station area preserves the valid option and warns',async()=>{
 const m=fixture(),engine=m.engine;m.engine=(d,g)=>g===square?Promise.reject(new Error('unavailable')):engine(d,g);
 const r=(await m.query({origin:{kind:'station',station_id:main},station_id:'west'})).results[0];
 assert.equal(r.total_seconds,1500);assert.equal(r.gate_errors.length,1);assert.ok(r.warnings.some(s=>s.includes('部分候选')));
});
test('grouping endpoints does not create a zero-cost transfer in the rail graph',async()=>{
 const m=fixture(),engine=await m.engine({},main);assert.equal(engine.reached[square].seconds,500);
 // A map point uses the physically reached station and its own egress walking.
 m.nearest=async()=>[{station:m.stations.get(main)}];m.access=async()=>({seconds:120});
 const r=(await m.query({origin:{kind:'station',station_id:'west'},lon:120.25,lat:30.35})).results[0];
 assert.equal(r.destination_station_id,main);assert.equal(r.destination_group,undefined);assert.equal(r.total_seconds,1620);
});
