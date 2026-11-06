import test from 'node:test';
import assert from 'node:assert/strict';
import {MetroService} from '../../core/lib/metro-service.mjs';
import {stationFare,quoteFare} from '../../core/lib/fares.mjs';
import {practicalAccess} from '../../core/lib/routing-policy.mjs';
import {selectPreferred} from '../../core/lib/route-preferences.mjs';
import snapshot from '../../core/config/rail-snapshot.json' with {type:'json'};
import walking from '../../core/config/walking-snapshot.json' with {type:'json'};
const id=name=>'cn-hangzhou-'+name,main=id('east-railway-station'),square=main+'-east-square';
const option=(station,seconds,distance_m)=>({station:{id:station},walk:{seconds,distance_m}});
test('nearby boarding uses actual walking access, retains a far campus fallback, and respects chosen transport',()=>{
 const options=[option('near',240,264),option('other-near',420,600),option('distant-express',1500,1800)];
 assert.deepEqual(practicalAccess(options,'walk').map(o=>o.station.id),['near','other-near']);
 assert.equal(practicalAccess(options,'bike').length,3);assert.equal(practicalAccess(options,'taxi').length,3);
 assert.equal(practicalAccess([option('far',1800,2000),option('farther',2700,3000)],'walk')[0].station.id,'far');
 assert.deepEqual(practicalAccess([{walk:{seconds:null}}],'walk'),[]);
});
test('fewer transfers cannot turn into a long walk or excessive detour',()=>{
 const fast={total_seconds:1400,transfers:1,access_mode:'walk',access_seconds:240,origin_station_id:'near',destination_station_id:'end',legs:[]};
 const remote={...fast,total_seconds:1980,transfers:0,access_seconds:1200,origin_station_id:'far'};
 const detour={...fast,total_seconds:2200,transfers:0,origin_station_id:'detour'};
 const reasonable={...fast,total_seconds:1700,transfers:0,access_seconds:300,origin_station_id:'reasonable'};
 const prefs={strategy:'transfers',east_station:'fastest'};
 assert.equal(selectPreferred([fast,remote,detour],prefs).origin_station_id,'near');
 assert.equal(selectPreferred([fast,remote,reasonable],prefs).origin_station_id,'reasonable');
});
test('embedded fares cover every Hangzhou OD and repair official-name mismatches',()=>{
 const n=snapshot.fares.station_ids.length;assert.ok(n>=261);
 for(let a=0;a<n;a++)for(let b=0;b<n;b++){const fare=snapshot.fares.fares[a][b];assert.equal(fare,snapshot.fares.fares[b][a]);assert.ok(Number.isInteger(fare));assert.ok(a===b?fare===0:fare>=2&&fare<=30);}
 assert.equal(stationFare(id('west-railway-station'),square),7);
 assert.equal(stationFare(square,id('xiaoshan-international-airport')),7);
 assert.equal(stationFare(id('xueyuan-road'),id('xiaoshan-international-airport')),8);
 assert.equal(stationFare(id('dongxinyuan'),id('xiaoshan-international-airport')),7);
 assert.equal(stationFare(id('gudang'),main),4);
 assert.equal(stationFare('unknown',main),null);
 const ride={kind:'ride',from_station_id:id('west-railway-station'),to_station_id:square};
 assert.equal(quoteFare({legs:[ride,{kind:'walk_transfer',from_station_id:square,to_station_id:main}]},ride.from_station_id,main).fare,7);
 assert.equal(quoteFare({legs:[ride,{kind:'walk_transfer'},ride]},ride.from_station_id,main).fare,14);
});
test('station routes, alternate fares and Yuquan nearby boarding work with all external requests disabled',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected external request');};
 try{
  const service=await new MetroService('').init();
  const routes=[];
  for(const strategy of ['time','transfers'])routes.push((await service.query({origin:{kind:'station',station_id:id('qianjiang-century-city')},station_id:id('babaili'),preferences:{strategy}})).results[0]);
  assert.equal(routes[0].transfers,3);assert.equal(routes[1].transfers,2);assert.ok(routes.every(r=>r.fare===stationFare(r.origin_station_id,r.destination_station_id)));
  service.access=async(mode,a,b)=>{
   const key=`${a.lon.toFixed(6)},${a.lat.toFixed(6)}|${b.lon.toFixed(6)},${b.lat.toFixed(6)}`,saved=walking.routes[key];
   if(mode!=='walk'||!saved)throw Error('No captured walking route');return {...saved.value,mode:'walk',notes:[]};
  };
  for(const strategy of ['time','transfers']){
   const r=(await service.query({origin:{kind:'campus',id:'yuquan',gates:['north'],mode:'walk'},station_ids:[main,square],preferences:{strategy,east_station:'main_within_10'}})).results[0];
   assert.ok(!r.error,r.error);assert.equal(r.origin_station_id,id('gudang'));assert.equal(r.fare,4);
   assert.ok(r.alternatives.every(a=>a.access_seconds<600));assert.ok(r.alternatives.every(a=>a.origin_station_id!==id('wensan-road')));
   assert.equal(r.total_seconds,r.access_seconds+r.ride_seconds+r.transfer_seconds+r.egress_seconds);
  }
 }finally{globalThis.fetch=original;}
});
