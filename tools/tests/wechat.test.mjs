import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {createMapServer} from '../../core/server.mjs';
import {MetroService} from '../../core/lib/metro-service.mjs';
import M from '../../wechat/miniprogram/lib/map.js';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url);
test('manual CI stages only client files and routes preview and upload independently',async t=>{
  const {run}=require('../wechat-ci.cjs');
  const tmp=await mkdtemp(path.join(os.tmpdir(),'meetup-ci-test-'));
  t.after(()=>rm(tmp,{recursive:true,force:true}));
  const base={RUNNER_TEMP:tmp,WECHAT_APPID:'wx0123456789abcdef',WECHAT_UPLOAD_KEY:'test-only',WECHAT_VERSION:'0.1.0'};
  const calls=[];
  class Project {constructor(settings){Object.assign(this,settings);}}
  async function inspect({project,version}){
    assert.equal(project.privateKey,base.WECHAT_UPLOAD_KEY);
    assert.equal(version,base.WECHAT_VERSION);
    assert.deepEqual((await readdir(project.projectPath)).sort(),['miniprogram','project.config.json']);
    const config=JSON.parse(await readFile(path.join(project.projectPath,'project.config.json'),'utf8'));
    assert.equal(config.appid,base.WECHAT_APPID);
    return require(path.join(project.projectPath,'miniprogram','config.js'));
  }
  const sdk={Project,preview:async options=>{
    const config=await inspect(options);assert.equal(config.apiBase,'');
    await writeFile(options.qrcodeOutputDest,'test preview');calls.push('preview');
  },upload:async options=>{
    const config=await inspect(options);assert.equal(config.apiBase,'https://example.org');calls.push('upload');
  }};
  await run(sdk,{...base,WECHAT_TASK:'preview'});
  await run(sdk,{...base,WECHAT_TASK:'upload',WECHAT_API_BASE:'https://example.org'});
  await assert.rejects(run(sdk,{...base,WECHAT_TASK:'upload',WECHAT_CLOUD_ENV:'test'}),/云托管/);
  await assert.rejects(run(sdk,{...base,WECHAT_TASK:'upload',WECHAT_UPLOAD_KEY:''}),/WECHAT_UPLOAD_KEY/);
  assert.deepEqual(calls,['preview','upload']);assert.deepEqual(await readdir(tmp),['wechat-preview.jpg']);
});
const asOrigin=name=>{
  const p=M.catalog.search(name)[0];
  return {id:'station:'+p.id,kind:'station',station_id:p.id,short_name:p.name};
};
const next=()=>new Promise(resolve=>setTimeout(resolve,5));
async function until(predicate){
  for(let i=0;i<400;i++){if(predicate())return;await next();}
  assert.fail('Timed out waiting for page state');
}

test('native layers have all campuses, zoom levels, station groups and reversible map coordinates',()=>{
  const origins=M.data.campuses.map(c=>({...c,selected:[c.origin_key]}));
  const layers=scale=>M.layers({origins,candidates:[],results:[],scale});
  const small=layers(10),medium=layers(12),large=layers(16);
  assert.equal(origins.length,10);
  assert.equal(small.markers.length,15);
  assert.ok(large.markers.length>medium.markers.length && medium.markers.length>small.markers.length);
  assert.ok(small.polygons.length>=10);
  assert.equal(small.polyline.length,M.data.segments.length);
  assert.ok(small.polyline.some(l=>l.points.length>10));
  const east=M.catalog.search('杭州东站')[0];
  assert.equal(east.member_ids.length,2);assert.equal(east.lines.length,4);
  const [lon,lat]=M.gcjToWgs(...Object.values(M.position(east)));
  assert.ok(Math.abs(lon-east.lon)<.000002 && Math.abs(lat-east.lat)<.000002);
  assert.ok(Buffer.byteLength(JSON.stringify(large.markers))+Buffer.byteLength(JSON.stringify(large.polyline))<1024*1024);
});

test('selected gate and last-mile geometry use the same shared service and WGS84 data',async t=>{
  // Replay inside the dated bundled walk snapshot validity window. No provider credentials.
  const snapshot=JSON.parse(await readFile(new URL('../../core/config/walking-snapshot.json',import.meta.url)));
  const row=Object.values(snapshot.routes)[0];
  t.mock.method(Date,'now',()=>row.expires_epoch*1000-86400000);
  const service=await new MetroService('').init(), east=M.catalog.search('杭州东站')[0];
  const origin={id:'yuquan',gates:['east','north'],mode:'walk'};
  const [result]=(await service.query({origin,station_ids:east.member_ids,preferences:{strategy:'time'}})).results;
  assert.ok(M.valid(result));assert.equal(result.destination_group,'杭州东站');
  assert.ok(result.total_seconds>=result.ride_seconds);assert.ok(origin.gates.includes(result.gate_key));
  assert.ok(M.accessPaths(result).some(w=>w.paths.length && w.time!=='未知'));
  const p=M.data.campuses[0].gates.find(g=>g.key==='east');
  const profile=await service.query({origin:{id:'yuquan',gates:['east'],mode:'walk'},lon:p.lon,lat:p.lat,preferences:{strategy:'time'}});
  assert.equal(profile.complete,true);
  assert.equal(profile.results[0].mode,'walk');
});

test('cloud hosting transport sends the same API payload and reuses identical pending requests',async t=>{
  const config=require('../../wechat/miniprogram/config.js'),api=require('../../wechat/miniprogram/lib/api.js');
  const previous={...config};Object.assign(config,{cloudEnv:'local-test',cloudService:'metro'});
  t.after(()=>{Object.assign(config,previous);delete globalThis.wx;});
  let count=0;
  globalThis.wx={cloud:{callContainer:async args=>{
    count++;assert.equal(args.header['X-WX-SERVICE'],'metro');assert.equal(args.config.env,'local-test');
    assert.equal(args.path,'/api/origin');assert.equal(args.method,'POST');
    assert.deepEqual(args.data,{origin:{id:'xixi'}});
    return {statusCode:200,data:{times:{stop:{seconds:321}}}};
  }}};
  const request=()=>api.post('/api/origin',{origin:{id:'xixi'}});
  const [a,b]=await Promise.all([request(),request()]);
  assert.deepEqual(a,b);assert.equal((await request()).times.stop.seconds,321);assert.equal(count,1);
});
test('native page queries a real HTTP service, groups shared tracks and plans departures',async t=>{
  const origins=['古荡','文三路','武林门'].map(asOrigin);
  const server=createMapServer({env:{}});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port, sent=[];
  let definition;
  globalThis.Page=def=>{definition=def;};
  const saved={campuses:Object.fromEntries(M.data.campuses.map(c=>[c.id,{enabled:false}])),stations:origins.map(o=>({id:o.station_id,enabled:true}))};
  globalThis.wx={getStorageSync:()=>saved,setStorageSync(){},showToast(){},request:async params=>{
    sent.push({path:params.url,data:params.data});
    try{const res=await fetch(base+new URL(params.url).pathname,{method:params.method,headers:params.header,body:JSON.stringify(params.data)});
      params.success({statusCode:res.status,data:await res.json()});}catch{params.fail();}
  }};
  t.after(()=>{delete globalThis.Page;delete globalThis.wx;});
  require('../../wechat/miniprogram/pages/map/index.js');
  const page={...definition,data:structuredClone(definition.data),setData(part){Object.assign(this.data,part);}};
  page.onLoad();
  await until(()=>page.data.hubRows.every(h=>h.time!=='未知'));
  const destination=M.catalog.search('钱江路')[0];
  page.toStation(destination.id);
  await until(()=>!page.data.busy);
  assert.equal(page.data.cards.length,3);assert.ok(page.results.every(M.valid));
  assert.deepEqual(page.results.map(r=>r.total_seconds),[1553,1633,900]);
  assert.ok(page.data.meetingRows.some(m=>m.name==='武林门'));
  assert.ok(page.data.polyline.some(p=>p.color==='#465c57'&&p.arrowLine));
  page.togglePlan();assert.equal(page.data.schedules.length,3);assert.match(page.data.meetingRows[0].at,/碰面/);
  page.focusRoute({currentTarget:{dataset:{id:origins[0].id}}});
  assert.ok(!page.data.polyline.some(p=>p.color==='#465c57'));
  assert.ok(page.data.cards[0].legs.length>0);assert.equal(page.data.cards[1].legs,undefined);
  page.openPicker({currentTarget:{dataset:{id:'destination'}}});
  page.searchInput({detail:{value:'杭州东站'}});
  assert.equal(page.data.choices[0].lines.split('/').length,4);
  page.toStation(page.data.choices[0].id);
  page.clear();await until(()=>sent.some(req=>req.data.station_ids?.length===2));
  assert.equal(page.target,null);assert.equal(page.data.cards.length,0);
  // A campus with no valid provider result must not report a door-to-door total.
  page.origins=page.origins.map(o=>({...o,enabled:o.id==='yuquan',mode:o.id==='yuquan'?'taxi':o.mode}));
  page.mapTap({detail:{longitude:120.16,latitude:30.27}});
  await until(()=>!page.data.busy);assert.match(page.data.cards[0].error,/接驳|Key/);
  assert.equal(page.data.cards[0].time,'未知');assert.equal(page.data.schedules.length,0);
  page.onUnload();
});
