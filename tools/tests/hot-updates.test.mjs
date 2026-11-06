import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {EventEmitter} from 'node:events';
import {HotUpdates,sha256,decodeBundle,validateManifest,MAX_BUNDLE} from '../../desktop/hot-updates.mjs';
import {UpdateController} from '../../desktop/update-controller.mjs';
import {classifyChanges,fingerprint} from '../prepare-hot-update.mjs';
import {createMapServer} from '../../core/server.mjs';

const hash=sha256('compatible shell');
function bundle(version='0.3.2',extra=[]){
  const data=Buffer.from('window.testPatch=true;'),name='assets/test.'+sha256(data).slice(0,12)+'.js';
  const files=[{name:'index.html',data:Buffer.from(`<script src="/${name}"></script>`).toString('base64')},{name,data:data.toString('base64')},...extra];
  const bytes=gzipSync(JSON.stringify({schema:1,version,fingerprint:hash,files}));
  return {bytes,manifest:{schema:1,mode:'hot',version,minimumShellVersion:'0.3.1',fingerprint:hash,size:bytes.length,sha256:sha256(bytes)}};
}
async function fixture(t,{reload=async()=>{},version='0.3.1'}={}){
  const dir=await mkdtemp(path.join(os.tmpdir(),'meetup-hot-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  let payload=bundle(),calls=[];
  const options={directory:path.join(dir,'ui'),bundledRoot:path.join(dir,'built'),version,fingerprint:hash,reload,fetch:async url=>{calls.push(url);return new Response(url.endsWith('.json')?JSON.stringify(payload.manifest):payload.bytes);}};
  const hot=new HotUpdates(options);await hot.initialize();
  return {hot,options,dir,calls,setPayload:value=>{payload=value;},stage:async()=>{const m=await hot.find(payload.manifest.version);assert.ok(m);await hot.download(m);}};
}
test('only small compatible UI changes are classified hot',()=>{
  const ui={name:'core/src/commute-map.js',added:4,removed:3};
  assert.equal(classifyChanges([ui,{name:'core/public/assets/test.js',added:4,removed:3}]),'hot');
  for(const name of ['core/server.mjs','desktop/main.mjs','core/src/vendor/leaflet.js','core/src/desktop-updates.js','package.json','core/config/campuses.json','.github/workflows/desktop-release.yml'])assert.equal(classifyChanges([ui,{name,added:1,removed:0}]),'cold',name);
  assert.equal(classifyChanges([{...ui,added:81}]),'cold');
  assert.equal(classifyChanges([{name:'README.md',added:2,removed:1}]),'cold');
  assert.equal(classifyChanges(Array.from({length:6},(_,i)=>({...ui,name:`core/src/test${i}.js`}))),'cold');
});
test('manifests enforce version, shell, stable semver and bounded size',()=>{
  const {manifest}=bundle();assert.equal(validateManifest(manifest,{version:'0.3.2',fingerprint:hash,shellVersion:'0.3.1'}),manifest);
  for(const patch of [{minimumShellVersion:'0.3.2'},{fingerprint:sha256('other')},{version:'../bad'},{version:'0.3.3'},{version:'0.3.2-beta.1'},{mode:'cold'},{size:MAX_BUNDLE+1},{sha256:'bad'}])assert.throws(()=>validateManifest({...manifest,...patch},{version:'0.3.2',fingerprint:hash,shellVersion:'0.3.1'}));
});
test('bundles reject tampering, traversal, duplicate files and cache hash mismatch',()=>{
  const good=bundle();assert.equal(decodeBundle(good.bytes,good.manifest).size,2);
  assert.throws(()=>decodeBundle(Buffer.from('bad'),good.manifest));
  for(const name of ['../settings.json','C:/settings.json','assets/../../main.js','index.html','assets/fake.000000000000.js']){const bad=bundle('0.3.2',[{name,data:Buffer.from('evil').toString('base64')}]);assert.throws(()=>decodeBundle(bad.bytes,bad.manifest),name);}
});
test('compatible patches activate, survive restart, skip releases and reject old patches',async t=>{
  let loads=0;const f=await fixture(t,{reload:async()=>{loads++;}});
  await f.stage();assert.equal(f.hot.currentVersion,'0.3.1');await f.hot.apply();assert.equal(f.hot.currentVersion,'0.3.2');assert.equal(loads,1);
  const restarted=new HotUpdates(f.options);await restarted.initialize();assert.equal(restarted.currentVersion,'0.3.2');
  assert.equal(await restarted.find('0.3.2'),null);
  f.setPayload(bundle('0.3.9'));await f.stage();await f.hot.apply();assert.equal(f.hot.currentVersion,'0.3.9');
  assert.ok(f.calls.every(url=>url.startsWith('https://github.com/BroBean1025/hangzhou-meetup/releases/download/v0.3.')));
});
test('failed activation rolls back and interrupted activation rolls back at next launch',async t=>{
  let fail=false;const f=await fixture(t,{reload:async()=>{if(fail){fail=false;throw Error('broken renderer');}}});
  await f.stage();await f.hot.apply();f.setPayload(bundle('0.3.3'));await f.stage();fail=true;
  await assert.rejects(f.hot.apply());assert.equal(f.hot.currentVersion,'0.3.2');assert.equal(await f.hot.find('0.3.3'),null);
  await writeFile(f.hot.pointer,JSON.stringify({current:'0.3.3',previous:'0.3.2',pending:true}));
  const restarted=new HotUpdates(f.options);await restarted.initialize();assert.equal(restarted.currentVersion,'0.3.2');assert.equal(await restarted.find('0.3.3'),null);
});
test('tampered cache or new shell uses the bundled UI, without altering settings',async t=>{
  const f=await fixture(t);const keyfile=path.join(f.dir,'settings.json');await writeFile(keyfile,'private settings fixture');
  await f.stage();await f.hot.apply();
  const other=await fixture(t);await other.stage();await other.hot.apply();
  const upgraded=new HotUpdates({...other.options,fingerprint:sha256('new shell')});await upgraded.initialize();assert.equal(upgraded.currentVersion,'0.3.1');
  await writeFile(f.hot.pointer,JSON.stringify({current:'0.3.2'}));await writeFile(path.join(f.hot.root,'index.html'),'tampered');
  const restarted=new HotUpdates(f.options);await restarted.initialize();assert.equal(restarted.currentVersion,'0.3.1');assert.equal(await readFile(keyfile,'utf8'),'private settings fixture');
});
test('controller chooses hot updates for portable too and compares the active UI version',async t=>{
  const f=await fixture(t);let fullDownloads=0,restarts=0,opened=0;
  const updater=new EventEmitter();updater.checkForUpdates=async()=>({updateInfo:{version:'0.3.2'}});updater.downloadUpdate=async()=>{fullDownloads++;};updater.quitAndInstall=()=>{restarts++;};
  const controller=new UpdateController({updater,version:'0.3.1',hot:f.hot,portable:true,openExternal:async()=>{opened++;}});
  await controller.check({manual:true});assert.equal(controller.snapshot().kind,'hot');await controller.download();await controller.install();
  assert.equal(controller.snapshot().currentVersion,'0.3.2');assert.equal(fullDownloads+restarts+opened,0);
  await controller.check({manual:true});assert.equal(controller.snapshot().phase,'current');
  f.setPayload({...bundle('0.3.3'),manifest:{...bundle('0.3.3').manifest,fingerprint:sha256('other')}});updater.checkForUpdates=async()=>({updateInfo:{version:'0.3.3'}});
  await controller.check({manual:true});assert.equal(controller.snapshot().kind,'cold');await controller.download();assert.equal(opened,1);
  await controller.resetHot();assert.equal(controller.snapshot().currentVersion,'0.3.1');
});
test('server switches static roots on the same origin without stale cached index',async t=>{
  const f=await fixture(t);await mkdir(f.options.bundledRoot,{recursive:true});await writeFile(path.join(f.options.bundledRoot,'index.html'),'original');
  const server=createMapServer({env:{},root:()=>f.hot.root});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>{server.closeAllConnections();server.close();});
  const url='http://127.0.0.1:'+server.address().port;
  assert.equal(await (await fetch(url)).text(),'original');await f.stage();await f.hot.apply();assert.match(await (await fetch(url)).text(),/test\./);await f.hot.reset();assert.equal(await (await fetch(url)).text(),'original');
});
test('fingerprint permits patch numbers and line endings but rejects backend and minor version changes',async t=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'meetup-fingerprint-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  for(const folder of ['desktop','core/lib','core/config','core/data','core/src/vendor','tools'])await mkdir(path.join(dir,folder),{recursive:true});
  const files=['core/server.mjs','core/src/desktop-settings.js','core/src/desktop-updates.js','tools/build.mjs','tools/prepare-hot-update.mjs','pnpm-lock.yaml'];
  for(const file of files)await writeFile(path.join(dir,file),'a\nb\n');
  const pkg=path.join(dir,'package.json');await writeFile(pkg,'{"version":"0.3.1"}');const first=await fingerprint(dir);
  await writeFile(pkg,'{"version":"0.3.9"}');await writeFile(path.join(dir,'core/server.mjs'),'a\r\nb\r\n');assert.equal(await fingerprint(dir),first);
  await writeFile(path.join(dir,'core/src/commute-map.js'),'UI patch');assert.equal(await fingerprint(dir),first);
  await writeFile(pkg,'{"version":"0.4.0"}');assert.notEqual(await fingerprint(dir),first);
  await writeFile(pkg,'{"version":"0.3.1"}');await writeFile(path.join(dir,'core/server.mjs'),'changed backend');assert.notEqual(await fingerprint(dir),first);
});
test('oversized response and incompatible required cold version never stage a patch',async t=>{
  const f=await fixture(t);f.setPayload({...bundle(),manifest:{...bundle().manifest,minimumShellVersion:'0.3.2'}});assert.equal(await f.hot.find('0.3.2'),null);
  f.hot.fetch=async()=>new Response('too large',{headers:{'content-length':String(MAX_BUNDLE+1)}});
  await assert.rejects(f.hot.download(bundle().manifest));assert.equal(f.hot.staged,undefined);assert.equal(f.hot.currentVersion,'0.3.1');
});
