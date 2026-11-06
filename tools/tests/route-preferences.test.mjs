import test from 'node:test';
import assert from 'node:assert/strict';
import {RegionalRouter} from '../../core/lib/regional-network.mjs';
import {EAST_MAIN,EAST_SQUARE,selectPreferred,normalizePreferences,queryPreferred} from '../../core/lib/route-preferences.mjs';
import {stationDepartures} from '../../core/lib/route-timing.mjs';
const prefs={strategy:'time',east_station:'main_within_10'};
const row=(id,total,transfers=0,line=id)=>({gate_key:'gate',origin_station_id:'origin',destination_station_id:id,total_seconds:total,transfers,legs:[{kind:'ride',line_id:line,from_station_id:'origin',to_station_id:id,seconds:total}],fare:null});
test('Hangzhou East preference is opt-in and includes exactly the ten-minute boundary',()=>{
 const fast=row(EAST_SQUARE,1000),main=row(EAST_MAIN,1600);
 assert.equal(selectPreferred([fast,main],{...prefs,east_station:'fastest'}).destination_station_id,EAST_SQUARE);
 assert.equal(selectPreferred([fast,main],prefs).destination_station_id,EAST_MAIN);
 assert.equal(selectPreferred([fast,{...main,total_seconds:1601}],prefs).destination_station_id,EAST_SQUARE);
 assert.equal(selectPreferred([fast],prefs).destination_station_id,EAST_SQUARE);
 const walked={...main,total_seconds:1541,legs:[{kind:'walk_transfer',from_station_id:EAST_SQUARE,to_station_id:EAST_MAIN,seconds:541}]};
 assert.equal(selectPreferred([fast,walked],prefs).destination_station_id,EAST_SQUARE,'walking over from East Square is not an easy-entry alternative');
 assert.equal(selectPreferred([row('unrelated',1000),row('other',1200)],prefs).destination_station_id,'unrelated');
});
test('time and transfer choices expose the tradeoff without fabricated fares',()=>{
 const fast=row('end',600,2,'a'),few=row('end',900,0,'b');const time=selectPreferred([fast,few],{strategy:'time',east_station:'fastest'}),less=selectPreferred([fast,few],{strategy:'transfers',east_station:'fastest'});
 assert.equal(time.total_seconds,600);assert.equal(less.total_seconds,900);assert.equal(less.transfers,0);assert.equal(less.extra_seconds,300);assert.equal(less.fare,null);assert.equal(time.alternatives.length,2);
 assert.equal(selectPreferred([fast],prefs).alternatives.length,1);
 assert.throws(()=>normalizePreferences({strategy:'unsupported'}));assert.throws(()=>normalizePreferences(null));
});
test('lexicographic router minimizes transfers before duration and keeps time queries independent',()=>{
 const nodes=[{id:'a1',station_id:'a',line_id:'one'},{id:'b1',station_id:'b',line_id:'one'},{id:'b2',station_id:'b',line_id:'two'},{id:'c1',station_id:'c',line_id:'one'},{id:'c2',station_id:'c',line_id:'two'}];
 const edges=[{from:'a1',to:'b1',kind:'ride',line_id:'one',seconds:100},{from:'b1',to:'b2',kind:'transfer',line_id:'two',seconds:60},{from:'b2',to:'c2',kind:'ride',line_id:'two',seconds:100},{from:'a1',to:'c1',kind:'ride',line_id:'one',seconds:500}];
 const router=new RegionalRouter({nodes,edges},{nodes:[],edges:[]},new Map(['a','b','c'].map(id=>[id,{}])),edges.filter(e=>e.kind==='ride').map(e=>({from_stop_id:e.from,to_stop_id:e.to,direction:'forward'})));
 assert.equal(router.route('a','c').total_seconds,260);const few=router.route('a','c','transfers');assert.equal(few.total_seconds,500);assert.equal(few.transfers,0);assert.equal(router.route('a','c').total_seconds,260);
 assert.equal(stationDepartures(router.route('a','c').legs,0).find(s=>s.line_id==='two').elapsed_seconds,160);
});
test('preferred endpoint query considers both station areas, rejects invalid input, and handles partial failures',async()=>{
 const stations=new Map(['origin',EAST_MAIN,EAST_SQUARE].map(id=>[id,{id,name:id,location:{lon:120.2,lat:30.3}}]));
 const duration=id=>id===EAST_MAIN?1500:1000;
 const service={version:'fixture',stations,connectorConfig:[],normalize:()=>({id:'station:origin',kind:'station',station_id:'origin',gates:['origin'],mode:'station'}),group:id=>id===EAST_MAIN||id===EAST_SQUARE?{name:'杭州东站'}:null,expandStations:()=>[EAST_MAIN,EAST_SQUARE],gateLabel:()=> '站内出发',engine:async()=>({start:stations.get('origin'),options:[{station:stations.get('origin'),walk:{seconds:0}}],errors:[],reached:{[EAST_MAIN]:{seconds:1500},[EAST_SQUARE]:{seconds:1000}}}),metroResult:async(_e,_b,end)=>({...row(end.id,duration(end.id)),mode:'metro',warnings:[]}),railRouter:async()=>({route:(_from,to)=>({total_seconds:duration(to),transfers:0,legs:[{kind:'ride',line_id:to,from_station_id:'origin',to_station_id:to,seconds:duration(to)}]})})};
 const geo={gcjToWgs:(x,y)=>[x,y]};
 const payload={origin:{},station_ids:[EAST_MAIN],preferences:prefs};
 const result=await queryPreferred(service,payload,geo);assert.equal(result.results[0].destination_station_id,EAST_MAIN);assert.equal(result.results[0].total_seconds,1500);
 await assert.rejects(queryPreferred(service,{...payload,station_ids:[]},geo));await assert.rejects(queryPreferred(service,{...payload,preferences:{strategy:'bad'}},geo));
 const original=service.metroResult;service.metroResult=async(...args)=>{if(args[2].id===EAST_MAIN)throw Error('unavailable');return original(...args);};
 const partial=(await queryPreferred(service,payload,geo)).results[0];assert.equal(partial.destination_station_id,EAST_SQUARE);assert.match(partial.preference_warning,/部分候选/);
});
