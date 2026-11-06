import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/trip-time.js';
import {stationDepartures} from '../lib/route-timing.mjs';
import {RegionalRouter} from '../lib/regional-network.mjs';
const T=globalThis.MeetUpTime,minute=60000,target=T.parseLocal('2026-11-07T18:00'),now=target-4*3600000;
const candidate=(sid,ids)=>({sid,next:sid+'next',line:'L',members:ids.map(id=>({id}))});
const route=(id,total,positions={})=>({origin_id:id,total_seconds:total,station_departures:Object.entries(positions).map(([sid,seconds])=>({station_id:sid,next_station_id:sid+'next',line_id:'L',elapsed_seconds:seconds}))});
const plan=(results,candidates=[],opts={})=>T.plan({results,candidates,target,now,buffer:10,meetingBuffer:3,...opts});

test('Shanghai datetime is independent of device timezone; invalid dates are rejected',()=>{
 assert.equal(T.parseLocal('2026-11-07T18:00'),Date.parse('2026-11-07T10:00:00Z'));
 assert.equal(T.localValue(target),'2026-11-07T18:00');
 for(const value of ['','2026-02-30T18:00','2026-11-07T25:00','tomorrow','2026-11-07T18:00Z'])assert.equal(T.parseLocal(value),null);
});
test('departures round travel up and count buffer only once, including zero-duration trips',()=>{
 const p=plan([route('a',901),route('b',0)]);
 assert.equal(p.schedules.get('a').departure,target-26*minute);
 assert.equal(p.schedules.get('b').departure,target-10*minute);
 for(const s of p.schedules.values())assert.equal(s.arrival,target);
 assert.equal(plan([route('a',901)],[],{buffer:0}).schedules.get('a').departure,target-16*minute);
});
test('arrival after midnight can require departure on the previous date',()=>{
 const midnight=T.parseLocal('2026-11-08T00:10');const p=plan([route('a',3600)],[],{target:midnight});
 assert.equal(T.localValue(p.schedules.get('a').departure),'2026-11-07T23:00');
 assert.match(T.clock(p.schedules.get('a').departure,midnight),/11月07日 23:00/);
});
test('one merge gives unequal origins the same meeting and continuing times',()=>{
 const c=candidate('m',['a','b']),p=plan([route('a',3600,{m:1800}),route('b',5400,{m:3600})],[c]);
 const meeting=p.meetings.get(T.candidateKey(c));
 assert.equal(meeting.meetAt,target-33*minute);assert.equal(meeting.continueAt,target-30*minute);
 assert.equal(p.schedules.get('a').departure,target-73*minute);
 assert.equal(p.schedules.get('b').departure,target-103*minute);
 for(const s of p.schedules.values()){assert.equal(s.arrival,target);assert.equal(s.waiting,3);assert.equal(s.stops[0].arrival,meeting.meetAt);}
});
test('successive branch merges propagate backward; buffers and waits are not double-counted',()=>{
 const c1=candidate('m1',['a','b']),c2=candidate('m2',['a','b','c']);
 const p=plan([route('a',3600,{m1:600,m2:1800}),route('b',4800,{m1:1800,m2:3000}),route('c',2400,{m2:600})],[c1,c2]);
 assert.equal(p.meetings.get(T.candidateKey(c2)).meetAt,target-33*minute);
 assert.equal(p.meetings.get(T.candidateKey(c1)).meetAt,target-56*minute);
 assert.equal(p.schedules.get('a').departure,target-76*minute);
 assert.equal(p.schedules.get('a').waiting,6);assert.equal(p.schedules.get('c').waiting,3);
 for(const s of p.schedules.values())assert.equal(s.arrival,target);
});
test('different shared-destination tails use the longest remaining tail and allow early arrival',()=>{
 const c=candidate('m',['a','b']),p=plan([route('a',3600,{m:600}),route('b',3000,{m:1200})],[c]);
 assert.equal(p.schedules.get('a').arrival,target);assert.equal(p.schedules.get('b').arrival,target-20*minute);
});
test('missing prefixes, aggregate interior timings and failed results never produce invented meeting times',()=>{
 const c=candidate('m',['a','b']),p=plan([route('a',3600,{m:600}),route('b',3000)],[c]);
 assert.equal(p.meetings.size,0);assert.equal(p.unknownMeetings,1);assert.equal(p.schedules.size,2);
 const partial=plan([route('a',600),{origin_id:'b',total_seconds:null,error:'missing'}]);
 assert.equal(partial.partial,true);assert.equal(partial.schedules.size,1);
 assert.equal(T.prefix({...route('a',1000),station_departures:[...route('a',1000,{m:1}).station_departures,...route('a',1000,{m:2}).station_departures]},c),null);
});
test('past targets and invalid buffers are rejected; already-past departure is flagged',()=>{
 for(const opts of [{target:now},{buffer:-1},{buffer:NaN},{buffer:1.5},{buffer:181},{meetingBuffer:61}])assert.ok(plan([route('a',100)],[],opts).error);
 assert.equal(plan([route('a',600)],[],{now:target-5*minute}).schedules.get('a').late,true);
});
test('conflicting merge order cannot create an endless cycle',()=>{
 const p=plan([route('a',600,{m:100,n:200}),route('b',600,{m:200,n:100})],[candidate('m',['a','b']),candidate('n',['a','b'])]);
 assert.match(p.error,/顺序/);
});
test('current route prefixes include access, ordinary transfer and cross-station walk exactly once',()=>{
 const legs=[{kind:'ride',line_id:'L1',seconds:120,station_ids:['a','b'],station_offsets_seconds:[0,120]},{kind:'walk_transfer',seconds:542},{kind:'transfer',seconds:60},{kind:'ride',line_id:'L2',seconds:300,station_ids:['c','d','e'],station_offsets_seconds:[0,100,300]}];
 const points=stationDepartures(legs,180);
 assert.deepEqual(points.map(p=>p.elapsed_seconds),[180,902,1002]);
});
test('actual network edge weights annotate core rides; mismatch never gets scaled to fit',()=>{
 const nodes=['a','b','c'].map(id=>({id,station_id:id,line_id:'L'})),edges=[{from:'a',to:'b',kind:'ride',line_id:'L',seconds:120},{from:'b',to:'c',kind:'ride',line_id:'L',seconds:180}];
 const router=new RegionalRouter({nodes,edges},{nodes:[],edges:[]},new Set(['a','b','c']),edges.map(e=>({from_stop_id:e.from,to_stop_id:e.to,direction:'both'})));
 const leg={kind:'ride',line_id:'L',seconds:300,station_ids:['a','b','c']};
 assert.deepEqual(router.timedLeg(leg).station_offsets_seconds,[0,120,300]);
 assert.equal(router.timedLeg({...leg,seconds:301}).station_offsets_seconds,undefined);
 assert.deepEqual(router.route('c','a').legs[0].station_offsets_seconds,[0,180,300]);
});
test('regional aggregate edge retains unknown intermediate times and known endpoints',()=>{
 const router=new RegionalRouter({nodes:[],edges:[]},{nodes:['a','b','c','d'].map(id=>({id,station_id:id,line_id:'L'})),edges:[{from:'a',to:'c',kind:'ride',line_id:'L',seconds:600,station_ids:['a','b','c']},{from:'c',to:'d',kind:'ride',line_id:'L',seconds:120}]},new Set(['a','b','c','d']),[]);
 const r=router.route('a','d');assert.deepEqual(r.legs[0].station_offsets_seconds,[0,null,600,720]);
 assert.deepEqual(stationDepartures(r.legs,0).map(p=>[p.station_id,p.elapsed_seconds]),[['a',0],['c',600]]);
});
