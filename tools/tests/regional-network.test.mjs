import test from 'node:test';
import assert from 'node:assert/strict';
import {RegionalRouter,mergeCatalog} from '../../core/lib/regional-network.mjs';
const graph={nodes:[{id:'a1',station_id:'a',line_id:'core'},{id:'b1',station_id:'b',line_id:'core'}],edges:[{from:'a1',to:'b1',kind:'ride',line_id:'core',seconds:120}]};
const regional={stations:[{id:'b',lines:['regional']}],lines:[],nodes:[{id:'b2',station_id:'b',line_id:'regional'},{id:'c2',station_id:'c',line_id:'regional'}],edges:[{from:'b1',to:'b2',kind:'transfer',line_id:'regional',seconds:39},{from:'b2',to:'b1',kind:'transfer',line_id:'core',seconds:49},{from:'b2',to:'c2',kind:'ride',line_id:'regional',seconds:600},{from:'c2',to:'b2',kind:'ride',line_id:'regional',seconds:540}],timing_note:'fixture'};
const segments=[{from_stop_id:'a1',to_stop_id:'b1',direction:'both'}];
test('OpenMetro serialized rides honor segment direction; transfers remain directional',()=>{
 const r=new RegionalRouter(graph,regional,new Set(['a','b','c']),segments);
 assert.equal(r.route('b','a').total_seconds,120);
 assert.equal(r.route('a','c').total_seconds,759);
 assert.equal(r.route('c','a').total_seconds,709);
 assert.equal(r.route('a','c').transfers,1);
 assert.equal(r.route('b','c').total_seconds,600); // Station origin may choose its platform.
 assert.equal(r.times('a').find(t=>t.station_id==='c').seconds,r.route('a','c').total_seconds);
 const one=new RegionalRouter(graph,regional,new Set(['a','b','c']),[{...segments[0],direction:'forward'}]);assert.throws(()=>one.route('b','a'));
});
test('unknown direction cannot silently create a reversible core rail edge',()=>assert.throws(()=>new RegionalRouter(graph,regional,new Set(['a','b','c']),[])));
test('a named shared station retains core coordinates and both line memberships',()=>{
 const core=[{id:'b',name:'B',location:{lon:120,lat:30},lines:['core']}];const merged=mergeCatalog(core,[],regional);
 assert.deepEqual(merged.stations[0].lines,['core','regional']);assert.equal(merged.stations[0].location.lon,120);assert.deepEqual(core[0].lines,['core']);
});
