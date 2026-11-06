import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const data=JSON.parse(fs.readFileSync('core/data/map.json','utf8')),snapshot=JSON.stringify(data);
const context=vm.createContext({});vm.runInContext(fs.readFileSync('core/src/rail-display.js','utf8'),context);
const display=context.createRailDisplay(data),points=new Map(data.points.map(p=>[p.id,p]));
test('label collision catches crossings between distant vertices and leaves clear space',()=>{
 const box={x:20,y:20,w:60,h:18},cross=context.railCrossesLabel;
 assert.equal(cross({x:0,y:25},{x:120,y:25},box),true);
 assert.equal(cross({x:40,y:0},{x:40,y:80},box),true);
 assert.equal(cross({x:0,y:0},{x:120,y:0},box),false);
 assert.equal(cross({x:0,y:0},{x:0,y:80},box),false);
});
test('every segment meets its unified station at overview zoom; detailed geometry is unchanged',()=>{
 for(const s of data.segments){const low=display.coordinates(s,13),high=display.coordinates(s,16),a=points.get(s.from),b=points.get(s.to);
  for(const [actual,expected] of [[low[0],[a.lat,a.lon]],[low.at(-1),[b.lat,b.lon]]])assert.ok(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<1e-10,s.line);
  assert.equal(JSON.stringify(high),JSON.stringify(s.coordinates.map(c=>[c[1],c[0]])));
 }assert.equal(JSON.stringify(data),snapshot,'Rendering must never change routing data');
});
test('Wulinmen and Huanglong merge when small and split onto each source line at detail zoom',()=>{
 for(const name of ['武林门','黄龙体育中心']){const p=data.points.find(p=>p.name===name);assert.equal(display.nodes(p,14.25).length,1);assert.equal(display.nodes(p,14.5).length,2);
  for(const node of display.nodes(p,16))for(const line of node.lines){const s=data.segments.find(s=>s.line===line&&(s.from===p.id||s.to===p.id)),c=s.from===p.id?s.coordinates[0]:s.coordinates.at(-1);assert.ok(Math.hypot(node.lon-c[0],node.lat-c[1])<0.00015);}
 }
});
