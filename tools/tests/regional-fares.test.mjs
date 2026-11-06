import test from 'node:test';
import assert from 'node:assert/strict';
import {stationFare,quoteFare,fareStationIds} from '../../core/lib/fares.mjs';
import {MetroService} from '../../core/lib/metro-service.mjs';
import regional from '../../core/config/regional-network.json' with {type:'json'};
import snapshot from '../../core/config/rail-snapshot.json' with {type:'json'};
const id=name=>regional.stations.find(s=>s.name===name)?.id??snapshot.stations.find(s=>s.name===name)?.id;
test('every supported station pair has a symmetric local fare, including both regional boundaries',()=>{
 const ids=[...new Set([...snapshot.stations,...regional.stations].map(s=>s.id))];
 assert.deepEqual(new Set(fareStationIds),new Set(ids));
 for(const a of ids)for(const b of ids){const fare=stationFare(a,b);assert.ok(Number.isInteger(fare),a+' → '+b);assert.equal(fare,stationFare(b,a));assert.ok(a===b?fare===0:fare>=2&&fare<=30);}
 assert.equal(stationFare(id('临平南高铁站'),id('浙大国际校区')),9);
 assert.equal(stationFare(id('浙大国际校区'),id('皮革城')),3);
 assert.equal(stationFare(id('皮革城'),id('海宁高铁西站')),7);
 assert.equal(stationFare(id('临平南高铁站'),id('许村')),2);
 assert.equal(stationFare(id('姑娘桥'),id('芳泉')),9);
 const cross=stationFare(id('浙大国际校区'),id('芳泉'));
 assert.equal(cross,9+stationFare(id('临平南高铁站'),id('姑娘桥'))+9);
 assert.equal(stationFare('unknown','unknown'),null);
});
test('East virtual transfer quotes continuous and separately purchased fares; terminal walks do not add a ticket',()=>{
 const square='cn-hangzhou-east-railway-station-east-square',main='cn-hangzhou-east-railway-station',west='cn-hangzhou-west-railway-station',wulin='cn-hangzhou-wulin-square';
 const ride=(a,b)=>({kind:'ride',from_station_id:a,to_station_id:b}),walk={kind:'walk_transfer',from_station_id:square,to_station_id:main,seconds:541};
 const r=quoteFare({legs:[ride(west,square),walk,ride(main,wulin)]});
 assert.equal(r.fare,stationFare(west,wulin));assert.equal(r.fare_separate,stationFare(west,square)+stationFare(main,wulin));assert.match(r.fare_note,/30 分钟/);
 assert.equal(quoteFare({legs:[ride(west,square),{...walk,seconds:1801},ride(main,wulin)]}).fare,r.fare_separate);
 assert.equal(quoteFare({legs:[ride(west,square),walk]}).fare,7);
 assert.equal(quoteFare({legs:[{...walk,from_station_id:main,to_station_id:square},ride(square,west)]}).fare,7);
 assert.equal(quoteFare({legs:[walk]}).fare,0);
});
test('cross-regional route responses include fare without external requests',async()=>{
 const fetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Network must not be needed');};
 try{const service=await new MetroService('').init();for(const [a,b] of [['浙大国际校区','芳泉'],['绍兴北站','檀渎'],['许村','人民医院总院']]){
  const response=await service.query({origin:{kind:'station',station_id:id(a)},station_id:id(b)});const r=response.results[0];assert.ok(!r.error,r.error);assert.equal(r.fare,stationFare(id(a),id(b)));assert.ok(Number.isInteger(r.fare));
 }}finally{globalThis.fetch=fetch;}
});
