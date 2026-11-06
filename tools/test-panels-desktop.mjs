import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {MetroService} from '../core/lib/metro-service.mjs';
const out=path.resolve('test-artifacts'),profile=path.join(out,'panels-profile-'+Date.now());
const env={...process.env,MEETUP_TEST:'1',MEETUP_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const service=await new MetroService('').init();const executablePath=process.env.MEETUP_EXECUTABLE;
const app=await electron.launch({...(executablePath?{executablePath:path.resolve(executablePath),args:[]}:{args:['.']}),cwd:process.cwd(),env,timeout:60000});
const errors=[],report=[];
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.top-handle');
 const capture=async name=>{const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));await fs.writeFile(path.join(out,name),Buffer.from(png,'base64'));};
 await page.route('**/api/query',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await service.query(route.request().postDataJSON()))}));
 await page.evaluate(()=>{
  for(const c of campuses){c.revision++;c.prepareController?.abort();c.prepareController=null;}
  enabled.clear();for(const id of ['cn-hangzhou-qianjiang-century-city','cn-hangzhou-west-railway-station']){const c=makeStation(id);c.ready=true;enabled.add(c.id);primary=c.id;}refreshCampuses(false);
 });
 await page.locator('#destination-search').fill('杭州东');await page.locator('.destination-station').first().click();await page.waitForFunction(()=>lastQueryState==='complete');
 async function check(label){
  const m=await page.evaluate(()=>{
   const rect=e=>e.getBoundingClientRect(),visible=e=>e.getClientRects().length>0;
   const header=[...document.querySelectorAll('header .brand,header .panel-overview,header .current-clock,header>button')].filter(visible);
   const collisions=[];for(let i=0;i<header.length;i++)for(let j=i+1;j<header.length;j++){const a=rect(header[i]),b=rect(header[j]);if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2)collisions.push([header[i].className||header[i].id,header[j].className||header[j].id]);}
   return {width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,collisions,clock:parseFloat(getComputedStyle(document.querySelector('#current-clock')).fontSize),summary:document.querySelector('.panel-overview').textContent,top:document.querySelector('#settings-panel').dataset.level,side:document.querySelector('#comparison').dataset.level,sideWidth:rect(document.querySelector('#comparison')).width,mapWidth:rect(document.querySelector('#map')).width};
  });
  assert.ok(m.scrollWidth<=m.width+1,label+JSON.stringify(m));assert.deepEqual(m.collisions,[],label+JSON.stringify(m));assert.ok(m.clock>=24);assert.match(m.summary,/杭州东站/);assert.ok(m.mapWidth>=300,label+JSON.stringify(m));return m;
 }
 for(const [width,height,zoom] of [[1440,900,1],[1060,600,1],[820,680,1],[390,844,1],[1280,800,1.5],[320,640,1]]){
  await app.evaluate(({BrowserWindow},v)=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(320,400);w.setContentSize(v.width,v.height);w.webContents.setZoomFactor(v.zoom);},{width,height,zoom});
  await page.waitForFunction(v=>Math.abs(innerWidth-v.width/v.zoom)<20,{width,zoom});
  await page.locator('.top-handle').focus();await page.keyboard.press('End');await page.locator('.side-handle').focus();await page.keyboard.press('End');
  await check('full '+width);
  // Sweep the top slider through intermediate positions with actual pointer capture.
  await page.locator('.top-handle').scrollIntoViewIfNeeded();let box=await page.locator('.top-handle').boundingBox();
  const range=await page.evaluate(()=>Math.max(190,Math.min(innerHeight*0.58,document.querySelector('#settings-content').scrollHeight)));
  const x=box.x+Math.min(40,box.width/3),y=box.y+15;await page.mouse.move(x,y);await page.mouse.down();
  for(let i=1;i<=12;i++){await page.mouse.move(x,Math.max(0,y-range*i/12));await check('top drag '+width+' '+i);}await page.mouse.up();
  await page.locator('.top-handle').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#settings-panel').getAttribute('data-level'),'collapsed');
  await page.locator('.side-handle').scrollIntoViewIfNeeded();box=await page.locator('.side-handle').boundingBox();const mobile=await page.evaluate(()=>innerWidth<=1000);
  const sx=mobile?box.x+40:box.x+7,sy=mobile?box.y+15:box.y+box.height/2;
  const sideRange=await page.evaluate(()=>innerWidth<=1000?Math.max(260,innerHeight*.65):Math.min(650,innerWidth*.52)-64);
  await page.mouse.move(sx,sy);await page.mouse.down();
  for(let i=1;i<=12;i++){await page.mouse.move(mobile?sx:Math.min(width-1,sx+sideRange*i/12),mobile?Math.min(height-1,sy+sideRange*i/12):sy);await check('side drag '+width+' '+i);}await page.mouse.up();
  await page.locator('.side-handle').focus();await page.keyboard.press('Home');const collapsed=await check('collapsed '+width);
  await page.evaluate(()=>scrollTo(0,0));await capture(`panels-collapsed-${width}-${zoom}.png`);
  await page.locator('.top-handle button').click();await page.locator('.side-handle button').click();await check('restored '+width);
  await page.evaluate(()=>{scrollTo(0,0);document.querySelector('.comparison-body').scrollTop=0;});await capture(`panels-full-${width}-${zoom}.png`);
  report.push({width,height,zoom,collapsed});
 }
 await page.locator('.top-handle').focus();await page.keyboard.press('Home');await page.locator('.side-handle').focus();await page.keyboard.press('Home');
 await page.reload();await page.waitForSelector('.top-handle');assert.equal(await page.locator('#settings-panel').getAttribute('data-level'),'collapsed');
 assert.deepEqual(errors,[]);
}finally{await app.close();}
const settings=JSON.parse(await fs.readFile(path.join(profile,'settings.json'),'utf8'));
assert.deepEqual(JSON.parse(settings.preferences['hangzhou-panel-layout-v1']),{top:0,side:0});
await fs.writeFile(path.join(out,'panels-report.json'),JSON.stringify({report,errors,persisted:true},null,2));console.log(JSON.stringify({passed:true,layouts:report.length,dragPositions:report.length*24,persisted:true,errors}));
