import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {UpdateController,localDay,updateMessage} from '../../desktop/update-controller.mjs';

function fixture({saved={},version='0.2.0',portable=false,enabled=true}={}){
  const updater=new EventEmitter();let count=0,downloads=0,installed=0,prepared=0,opened='';
  let date=new Date(2026,10,6,9),info={version:'0.2.1',releaseNotes:'A new version'},failure=null;
  updater.checkForUpdates=async()=>{count++;if(failure)throw failure;return {updateInfo:info};};
  updater.downloadUpdate=async()=>{downloads++;updater.emit('download-progress',{percent:50});updater.emit('update-downloaded');};
  updater.quitAndInstall=()=>{installed++;};
  const controller=new UpdateController({updater,version,portable,enabled,read:()=>saved,write:async patch=>Object.assign(saved,patch),now:()=>date,beforeInstall:async()=>{prepared++;},openExternal:async url=>{opened=url;}});
  return {controller,updater,saved,setDate:d=>{date=d;},setInfo:i=>{info=i;},setFailure:e=>{failure=e;},counts:()=>({count,downloads,installed,prepared,opened})};
}
test('daily check is persisted across restarts; manual checking bypasses the daily gate',async()=>{
  const f=fixture();await Promise.all([f.controller.check(),f.controller.check()]);assert.equal(f.counts().count,1);
  const restarted=fixture({saved:f.saved});assert.equal(restarted.controller.snapshot().phase,'available');await restarted.controller.check();assert.equal(restarted.counts().count,0);
  await restarted.controller.check({manual:true});assert.equal(restarted.counts().count,1);
  restarted.setDate(new Date(2026,10,7,0,1));await restarted.controller.check();assert.equal(restarted.counts().count,2);
});
test('failed automatic attempts remain quiet for that day and allow manual retries',async()=>{
  const f=fixture();f.setFailure(new Error('offline'));await f.controller.check();assert.equal(f.controller.snapshot().phase,'error');await f.controller.check();assert.equal(f.counts().count,1);
  f.setFailure(null);await f.controller.check({manual:true});assert.equal(f.controller.snapshot().phase,'available');assert.equal(f.counts().count,2);
});
test('versions use semantic ordering, reject prereleases and never downgrade',async()=>{
  const f=fixture({version:'0.2.9'});f.setInfo({version:'0.2.10'});await f.controller.check();assert.equal(f.controller.snapshot().phase,'available');
  for(const version of ['0.2.8','0.2.9','0.3.0-beta.1']){f.setInfo({version});await f.controller.check({manual:true});assert.equal(f.controller.snapshot().phase,'current');}
});
test('a cached update cannot download until its online metadata has been refreshed',async()=>{
  const f=fixture({saved:{availableVersion:'0.2.1'}});f.setFailure(new Error('offline'));
  await f.controller.download();assert.equal(f.counts().downloads,0);assert.equal(f.controller.snapshot().phase,'error');
  f.setFailure(null);await f.controller.download();assert.equal(f.counts().downloads,1);assert.equal(f.controller.snapshot().phase,'downloaded');
});
test('check does not download or install, and installation requires a verified download',async()=>{
  const f=fixture();await f.controller.install();await f.controller.check();assert.equal(f.counts().downloads,0);assert.equal(f.counts().installed,0);
  assert.equal(f.updater.autoDownload,false);assert.equal(f.updater.autoInstallOnAppQuit,false);
  await f.controller.download();assert.equal(f.controller.snapshot().phase,'downloaded');await f.controller.check({manual:true});assert.equal(f.controller.snapshot().phase,'downloaded');
  await f.controller.install();assert.equal(f.counts().installed,1);assert.equal(f.counts().prepared,1);
});
test('portable build checks the same feed and only opens its own versioned asset',async()=>{
  const f=fixture({portable:true});await f.controller.check();await f.controller.download();assert.match(f.counts().opened,/^https:\/\/github\.com\/BroBean1025\/hangzhou-meetup\/releases\/download\/v0\.2\.1\/HangzhouMeetUp-Portable-0\.2\.1\.exe$/);assert.equal(f.counts().downloads,0);await f.controller.install();assert.equal(f.counts().installed,0);
});
test('local calendar day, new app versions and development runs are handled explicitly',async()=>{
  assert.equal(localDay(new Date(2026,0,2,0,1)),'2026-01-02');const f=fixture({saved:{lastAutoCheckDay:'2026-11-06',lastAutoCheckVersion:'0.1.1'}});await f.controller.check();assert.equal(f.counts().count,1);
  const dev=fixture({enabled:false});await dev.controller.check({manual:true});assert.equal(dev.counts().count,0);assert.equal(dev.controller.snapshot().phase,'disabled');
  assert.match(updateMessage({code:'ERR_UPDATER_CHECKSUM_MISMATCH'}),/校验失败/);
});
