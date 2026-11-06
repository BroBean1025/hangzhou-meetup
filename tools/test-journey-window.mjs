import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {MetroService} from '../core/lib/metro-service.mjs';
const profile=path.resolve('test-artifacts/journey-window-profile-'+Date.now()),env={...process.env,MEETUP_TEST:'1',MEETUP_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const service=await new MetroService('').init(),executablePath=process.env.MEETUP_EXECUTABLE;
const app=await electron.launch({...(executablePath?{executablePath:path.resolve(executablePath),args:[]}:{args:['.']}),cwd:process.cwd(),env,timeout:60000});
const errors=[],checks=[];
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.journey-window-resize',{state:'attached'});
 await page.route('**/api/query',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await service.query(route.request().postDataJSON()))}));
 await page.evaluate(()=>{for(const c of campuses){c.revision++;c.prepareController?.abort();}enabled.clear();for(const id of ['cn-hangzhou-gudang','cn-hangzhou-qianjiang-century-city','cn-hangzhou-west-railway-station']){const c=makeStation(id);c.ready=true;enabled.add(c.id);primary=c.id;}refreshCampuses(false);});
 const query=async()=>{await page.locator('#destination-search').fill('杭州东');await page.locator('.destination-station').first().click();await page.waitForFunction(()=>lastQueryState==='complete');};await query();
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hangzhou-panel-layout-v1')??'{}'));
 async function check(label){
  const m=await page.evaluate(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};};return {panel:rect(document.querySelector('#journey-key')),map:rect(document.querySelector('#map')),controls:rect(document.querySelector('.controls')),footer:rect(document.querySelector('.journey-window-reset')),overview:rect(document.querySelector('#journey-all')),grip:rect(document.querySelector('.journey-window-resize')),listHeight:document.querySelector('#journey-list').clientHeight,font:parseFloat(getComputedStyle(document.querySelector('.journey-chip')).fontSize)};});
  const p=m.panel,b=m.map;assert.ok(p.x>=b.x+6&&p.y>=b.y+6&&p.right<=b.right-6&&p.bottom<=b.bottom-6,label+JSON.stringify(m));assert.ok(p.w<=421&&p.h<=421&&p.w>=219&&p.h>=189,label+JSON.stringify(m));assert.ok(p.w/p.h>=0.79&&p.w/p.h<=1.81);assert.ok(m.font>=14&&m.listHeight>=30);
  for(const c of [m.footer,m.overview,m.grip])assert.ok(c.x>=p.x&&c.y>=p.y&&c.right<=p.right+1&&c.bottom<=p.bottom+1,label+JSON.stringify(m));
  const c=m.controls;assert.ok(!(p.x<c.right&&p.right>c.x&&p.y<c.bottom&&p.bottom>c.y),label+' covers zoom controls');checks.push(label);
 }
 async function drag(selector,dx,dy){const el=page.locator(selector);await el.scrollIntoViewIfNeeded();const b=await el.boundingBox(),x=b.x+Math.min(16,b.width/2),y=b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:8});await page.mouse.up();}
 for(const [width,height,zoom] of [[1440,900,1],[1060,600,1],[390,844,1],[1280,800,1.5]]){
  await app.evaluate(({BrowserWindow},v)=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(320,400);w.setContentSize(v.width,v.height);w.webContents.setZoomFactor(v.zoom);},{width,height,zoom});
  await page.waitForFunction(v=>Math.abs(innerWidth-v.width/v.zoom)<20,{width,zoom});await page.locator('.journey-window-reset').click();
  await check(width+' default');const center=await page.evaluate(()=>map.getCenter());
  await drag('.journey-key-heading',-1200,-1200);await check(width+' top-left');
  await drag('.journey-window-resize',1200,1200);await check(width+' maximum');
  await drag('.journey-window-resize',-1200,-1200);await check(width+' minimum');
  await drag('.journey-key-heading',1200,1200);await check(width+' bottom-right');
  assert.deepEqual(await page.evaluate(()=>map.getCenter()),center,'Moving the window must not pan the map');
  await page.locator('.journey-key-heading').focus();await page.keyboard.press('ArrowLeft');await page.locator('.journey-window-resize').focus();await page.keyboard.press('ArrowRight');await check(width+' keyboard');
  const before=(await state()).journey;await page.locator('.top-handle').focus();await page.keyboard.press('Home');assert.deepEqual((await state()).journey,before,'Panel collapse preserves floating geometry');
  await check(width+' collapsed settings');await page.locator('.top-handle button').click();
  const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await fs.writeFile('test-artifacts/journey-window-'+width+'.png',Buffer.from(png,'base64'));
 }
 await page.locator('.journey-window-reset').click();assert.equal((await state()).journey,undefined);
 await drag('.journey-key-heading',35,45);const saved=(await state()).journey;await page.reload();await page.waitForSelector('.journey-window-resize',{state:'attached'});assert.deepEqual((await state()).journey,saved);
 await query();await check('after reload');const querySeq=await page.evaluate(()=>requestSeq);
 await page.locator('.journey-chip').first().click();assert.equal(await page.locator('.journey-chip').first().getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>requestSeq),querySeq,'Route selection must not query a new map destination');
 await page.locator('#journey-all').click();assert.equal(await page.locator('#journey-all').getAttribute('aria-pressed'),'true');
 await page.locator('#meeting-entry').click();assert.equal(await page.locator('#meeting-panel').getAttribute('open'),'');assert.deepEqual(errors,[]);
}finally{await app.close();}
const settings=JSON.parse(await fs.readFile(path.join(profile,'settings.json'),'utf8'));assert.ok(JSON.parse(settings.preferences['hangzhou-panel-layout-v1']).journey);
await fs.writeFile('test-artifacts/journey-window-report.json',JSON.stringify({checks,errors,persisted:true},null,2));console.log(JSON.stringify({passed:true,checks:checks.length,persisted:true,errors}));
