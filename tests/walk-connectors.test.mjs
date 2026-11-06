import test from 'node:test';
import assert from 'node:assert/strict';
import {directedConnectors,supplementTimes,connectPlans} from '../lib/walk-connectors.mjs';
import {MetroService} from '../lib/metro-service.mjs';
const stations=new Map(['origin','a','b','target'].map(id=>[id,{id,name:id,location:{lon:120.2,lat:30.3}}]));
const edge={id:'a-b',from_station_id:'a',to_station_id:'b',seconds:420,label:'跨站区步行',geometry:{crs:'wgs84',status:'complete',parts:[{mode:'walk',coordinates:[[120,30],[120.1,30.1]]}]}};
const data=rows=>({weight:'seconds',stations:Object.entries(rows).map(([station_id,seconds])=>({station_id,seconds}))});
test('walking links are positive, directed and retain geometry direction',()=>{
 assert.equal(directedConnectors([edge],stations).length,1);
 const pair=directedConnectors([{...edge,bidirectional:true}],stations);
 assert.equal(pair[1].from_station_id,'b');assert.deepEqual(pair[1].geometry.parts[0].coordinates,[[120.1,30.1],[120,30]]);
 assert.deepEqual(edge.geometry.parts[0].coordinates,[[120,30],[120.1,30.1]]);
 assert.throws(()=>directedConnectors([{...edge,seconds:0}],stations));
});
test('walk time is included exactly once; unchanged rail routes remain optimal',()=>{
 const base=data({origin:0,a:100,b:1500,target:2000}),exit=data({a:500,b:0,target:200});
 const r=supplementTimes(base,[edge],new Map([['b',exit]]));
 assert.equal(r.stations.find(s=>s.station_id==='target').seconds,720);
 assert.equal(r.stations.find(s=>s.station_id==='a').seconds,100);
 assert.equal(base.stations.find(s=>s.station_id==='target').seconds,2000);
 const plan=connectPlans('origin','target',{total_seconds:100,transfers:0,legs:[{kind:'ride',seconds:100}]},edge,{total_seconds:200,transfers:0,legs:[{kind:'ride',seconds:200}]});
 assert.equal(plan.total_seconds,720);assert.equal(plan.legs.reduce((n,l)=>n+l.seconds,0),720);assert.equal(plan.cross_station_seconds,420);assert.equal(plan.fare,null);
 assert.equal(plan.transfers,1);
 const walkOnly=connectPlans('a','b',{total_seconds:0,transfers:0,legs:[]},edge,{total_seconds:0,transfers:0,legs:[]});
 assert.equal(walkOnly.transfers,0);assert.equal(walkOnly.total_seconds,420);
});
test('service uses the same walking plan for reachability and final time breakdown',async()=>{
 const m=new MetroService('');m.stations=stations;m.lines=new Map([['line','线路']]);m.version='walk-unit-1';m.connectorConfig=[edge];
 m.rawTravelTimes=async from=>({...data(from==='origin'?{origin:0,a:100,b:1500,target:2000}:{b:0,target:200}),from_station_id:from});
 m.rawRoute=async(from,to)=>({total_seconds:from==='origin'?100:200,transfers:0,fare:2,legs:[{kind:'ride',seconds:from==='origin'?100:200,line_id:'line',station_ids:[from,to]}]});
 m.railRouter=async()=>({timedLeg:leg=>leg});
 const r=await m.route('origin','target');assert.equal(r.total_seconds,720);assert.equal(r.legs[1].kind,'walk_transfer');
 const result=await m.metroResult({options:[{station:stations.get('origin'),walk:{mode:'station',seconds:0}}]},{seconds:720,metro_seconds:720,access_seconds:0,via_id:'origin'},stations.get('target'),{seconds:120});
 assert.equal(result.total_seconds,840);assert.equal(result.transfer_seconds,420);assert.equal(result.cross_station_seconds,420);assert.equal(result.ride_seconds,300);
 assert.equal(result.access_seconds+result.ride_seconds+result.transfer_seconds+result.egress_seconds,result.total_seconds);
 assert.deepEqual(result.station_departures.map(s=>[s.station_id,s.elapsed_seconds]),[['origin',0],['b',520]]);
});
