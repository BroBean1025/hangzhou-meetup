// Real packaged Electron, isolated profile, offline releases injected through the debugger.
// No test endpoint or arbitrary-code IPC is included in the application.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {sha256} from '../desktop/hot-updates.mjs';

const root=process.cwd(),profile=path.join(root,'test-artifacts','hot-profile-'+Date.now());await mkdir(profile,{recursive:true});
const fixtureKey=sha256('offline test credential').slice(0,32);await writeFile(path.join(profile,'settings.json'),JSON.stringify({amapKey:fixtureKey,preferences:{'hangzhou-trip-buffer-v1':'{"travel":17,"meeting":3}'}}));
const runtime=JSON.parse(await readFile('desktop/runtime.json','utf8'));
const base=JSON.parse(gunzipSync(await readFile(`desktop-output/HangzhouMeetUp-UI-${runtime.version}.json.gz`)));
function patch(version,broken=false){
  const data=structuredClone(base);data.version=version;
  const script=Buffer.from(broken?'throw Error("test broken UI");':'document.documentElement.dataset.patch="'+version+'";');
  const name='assets/patch-probe.'+sha256(script).slice(0,12)+'.js';data.files.push({name,data:script.toString('base64')});
  const index=data.files.find(f=>f.name==='index.html');index.data=Buffer.from(Buffer.from(index.data,'base64').toString().replace('</body>',`<script src="/${name}"></script></body>`)).toString('base64');
  const bytes=gzipSync(JSON.stringify(data));const manifest={schema:1,mode:'hot',version,minimumShellVersion:runtime.version,fingerprint:runtime.fingerprint,size:bytes.length,sha256:sha256(bytes)};
  return {manifest,bytes:bytes.toString('base64')};
}
const parts=runtime.version.split('.').map(Number),next=n=>`${parts[0]}.${parts[1]}.${parts[2]+n}`;
const env={...process.env,MEETUP_TEST:'1',MEETUP_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const executablePath=process.env.MEETUP_EXECUTABLE||path.join(root,'desktop-output/win-unpacked/HangzhouMeetUp.exe');
let application;
async function launch(){application=await electron.launch({executablePath,args:[],cwd:root,env,timeout:60000});const page=await application.firstWindow();await page.waitForSelector('#desktop-updates');await page.waitForSelector('.leaflet-pane',{state:'attached'});return page;}
async function feed(payload){
  await application.evaluate(async({app},payload)=>{
    const {join}=process.getBuiltinModule('path');const appRequire=process.getBuiltinModule('module').createRequire(join(app.getAppPath(),'package.json'));
    const {HotUpdates}=appRequire('./desktop/hot-updates.mjs');
    appRequire('electron-updater').autoUpdater.checkForUpdates=async()=>({updateInfo:{version:payload.manifest.version,releaseNotes:'Offline UI integration fixture'}});
    HotUpdates.prototype.request=async function(url){return url.endsWith('.json')?Buffer.from(JSON.stringify(payload.manifest)):Buffer.from(payload.bytes,'base64');};
  },payload);
}
async function settle(page,phase){
  const deadline=Date.now()+25000;while(Date.now()<deadline){const state=await page.evaluate(()=>window.desktop.updateStatus()).catch(()=>null);if(state?.phase===phase)return state;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Update did not reach '+phase);
}
try{
  let page=await launch();const pid=application.process().pid,origin=new URL(page.url()).origin;
  await page.locator('#trip-planner').evaluate(el=>el.open=true);await page.locator('#travel-buffer').fill('17');await page.locator('#travel-buffer').dispatchEvent('change');
  await feed(patch(next(1)));assert.equal((await page.evaluate(()=>window.desktop.checkUpdates())).kind,'hot');
  await page.locator('#desktop-updates').click();await page.locator('#update-download').click();await settle(page,'downloaded');assert.match(await page.locator('#update-install').textContent(),/刷新/);
  await page.locator('#update-install').click();await settle(page,'current');assert.equal(await page.evaluate(()=>document.documentElement.dataset.patch),next(1));assert.equal(application.process().pid,pid);assert.equal(new URL(page.url()).origin,origin);assert.equal(await page.locator('#travel-buffer').inputValue(),'17');
  await application.close();page=await launch();assert.equal((await page.evaluate(()=>window.desktop.updateStatus())).currentVersion,next(1));assert.equal(await page.evaluate(()=>document.documentElement.dataset.patch),next(1));
  await feed(patch(next(2),true));await page.evaluate(()=>window.desktop.checkUpdates());await page.evaluate(()=>window.desktop.downloadUpdate());
  // Navigation destroys the calling JS context; observe the resulting state separately.
  page.evaluate(()=>window.desktop.installUpdate()).catch(()=>{});await settle(page,'error');assert.equal(await page.evaluate(()=>document.documentElement.dataset.patch),next(1));
  const saved=JSON.parse(await readFile(path.join(profile,'settings.json'),'utf8'));assert.equal(saved.amapKey,fixtureKey);assert.ok(saved.preferences['hangzhou-trip-buffer-v1'].includes('17'));
  page.evaluate(()=>window.desktop.resetUI()).catch(()=>{});await settle(page,'idle');assert.equal(await page.evaluate(()=>document.documentElement.dataset.patch),undefined);
  console.log('Packaged Electron: hot download/apply, unchanged process and origin, restart persistence, failed-patch rollback, manual recovery, private settings preserved.');
}finally{await application?.close();}
