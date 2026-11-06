import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root=process.cwd(),out=path.join(root,'test-artifacts');
await fs.mkdir(out,{recursive:true});
const userData=path.join(out,'profile-'+Date.now());
const env={...process.env,MEETUP_TEST:'1',MEETUP_USER_DATA:userData};
delete env.ELECTRON_RUN_AS_NODE;
const executablePath=process.env.MEETUP_EXECUTABLE;
const application=await electron.launch({...(executablePath?{executablePath,args:[]}:{args:['.']}),cwd:root,env,timeout:60000});
application.process().stderr.on('data',data=>process.stderr.write(data));
const report={sizes:[],errors:[],liveQuery:null};
try{
  const page=await application.firstWindow();
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.waitForSelector('#desktop-settings');
  await page.waitForSelector('.leaflet-pane',{state:'attached'});
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  const status=await page.evaluate(()=>window.desktop.status());
  report.configured=status.configured;
  const fixturesPath=path.join(out,'route-responses.json');
  let fixtures={};try{fixtures=JSON.parse(await fs.readFile(fixturesPath,'utf8'));}catch{}
  if(Object.keys(fixtures).length)await page.route('**/api/query',async route=>{
    const body=route.request().postDataJSON(),fixture=fixtures[JSON.stringify(body)];
    if(fixture)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)});
    return route.continue();
  });
  page.on('response',async response=>{if(response.url().endsWith('/api/query')&&response.ok()){try{fixtures[JSON.stringify(response.request().postDataJSON())]=await response.json();await fs.writeFile(fixturesPath,JSON.stringify(fixtures));}catch{}}});
  // One real UI query. All subsequent layout checks reuse its result.
  if(process.env.MEETUP_LIVE_TEST==='1'||Object.keys(fixtures).length){
    await page.locator('#destination-search').fill('龙翔桥');
    await page.locator('.destination-station').first().click();
    await page.waitForFunction(()=>!document.querySelector('#comparison-summary')?.textContent.includes('正在'),null,{timeout:150000});
    await page.waitForFunction(()=>typeof lastQueryState!=='undefined'&&lastQueryState!=='loading',null,{timeout:150000});
    report.liveQuery=await page.evaluate(()=>({state:lastQueryState,summary:document.querySelector('#comparison-summary').textContent,results:lastResults.map(r=>({id:r.origin_id,seconds:r.total_seconds,error:r.error,preview:r.preview}))}));
    await fs.writeFile(path.join(out,'live-routes.json'),JSON.stringify(report.liveQuery,null,2));
    assert.ok(report.liveQuery.results.some(r=>r.seconds>0&&!r.preview&&!r.error),'At least one complete live route is required');
  }else{
    // Exercise the result layout without pretending to have fetched live routes.
    await page.evaluate(()=>{document.querySelector('#comparison').hidden=false;document.querySelector('#destination-title').textContent='窗口适配检查';});
  }
  async function viewport(width,height,zoom=1,expanded=false){
    await application.evaluate(({BrowserWindow},{width,height,zoom})=>{const win=BrowserWindow.getAllWindows()[0];win.setMinimumSize(320,400);win.setContentSize(width,height);win.webContents.setZoomFactor(zoom);},{width,height,zoom});
    await page.evaluate(expanded=>{document.querySelector('#origin-panel').open=expanded;document.querySelector('#trip-planner').open=expanded;window.scrollTo(0,0);},expanded);
    await page.waitForFunction(()=>Math.abs(map.getSize().x-document.querySelector('#map').clientWidth)<2&&Math.abs(map.getSize().y-document.querySelector('#map').clientHeight)<2,null,{timeout:10000,polling:100});
    await page.waitForTimeout(200);
    await page.waitForFunction(()=>{const m=document.querySelector('#map').getBoundingClientRect(),h=document.querySelector('.map-hud').getBoundingClientRect();return Math.abs(m.x-h.x)<2&&Math.abs(m.y-h.y)<2;},null,{timeout:5000,polling:100});
    const metrics=await page.evaluate(()=>{
      const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
      return {viewport:{width:innerWidth,height:innerHeight},scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,map:rect('#map'),comparison:rect('#comparison'),search:rect('#destination-search'),leaflet:{width:map.getSize().x,height:map.getSize().y}};
    });
    report.sizes.push({width,height,zoom,expanded,...metrics});
    assert.ok(metrics.scrollWidth<=metrics.viewport.width+1,'No horizontal page overflow');
    assert.ok(metrics.map.height>=210&&metrics.map.width>=250,'Map remains usable');
    assert.ok(Math.abs(metrics.map.width-metrics.leaflet.width)<2&&Math.abs(metrics.map.height-metrics.leaflet.height)<2,'Leaflet follows actual container size');
    const separate=metrics.comparison.x>=metrics.map.right-1||metrics.comparison.y>=metrics.map.bottom-1;
    assert.ok(separate,'Results must not overlap the map');
    const name=`${width}x${height}-${zoom*100}${expanded?'-expanded':''}`;
    async function capture(suffix=''){
      const png=await application.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
      await fs.writeFile(path.join(out,name+suffix+'.png'),Buffer.from(png,'base64'));
    }
    await capture();
    if(metrics.viewport.width<=1000&&!expanded){await page.locator('#comparison').scrollIntoViewIfNeeded();await capture('-results');await page.evaluate(()=>window.scrollTo(0,0));}
  }
  for(const size of [[1440,900],[1280,720],[1060,600],[1001,600],[960,640],[720,560],[480,640],[390,844]])await viewport(...size);
  await viewport(1280,800,1.25);await viewport(1280,800,1.5);await viewport(1060,600,1,true);
  await viewport(480,640,1,true);
  await page.locator('#desktop-updates').click();
  assert.ok(await page.locator('#desktop-update-dialog').isVisible());
  const updateRect=await page.locator('#desktop-update-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight};});
  assert.ok(updateRect.x>=0&&updateRect.y>=0&&updateRect.right<=updateRect.width&&updateRect.bottom<=updateRect.height,'Update dialog fits the narrow window');
  assert.match(await page.locator('.update-version').textContent(),new RegExp(status.version.replaceAll('.','\\.')));
  if(!executablePath){await page.locator('#update-check').click();await page.waitForFunction(()=>document.querySelector('#update-message').textContent.includes('开发运行'));}
  await page.screenshot({path:path.join(out,'updates.png'),fullPage:true});
  await page.locator('#desktop-update-dialog .settings-close').click();
  await page.locator('#desktop-settings').click();
  assert.ok(await page.locator('#desktop-settings-dialog').isVisible());
  await page.locator('#desktop-key').fill('bad');await page.locator('#desktop-save-key').click();
  assert.match(await page.locator('#desktop-settings-message').textContent(),/32/);
  await page.screenshot({path:path.join(out,'settings.png'),fullPage:true});
  await page.locator('#desktop-settings-dialog .settings-close').click();
  await page.locator('#about').click();assert.ok(await page.locator('#information').isVisible());await page.locator('#info-close').click();
  await page.locator('#trip-planner').evaluate(el=>{el.open=true;});
  await page.locator('#travel-buffer').fill('17');await page.locator('#travel-buffer').dispatchEvent('change');
  await page.waitForTimeout(250);
  await page.reload();await page.waitForSelector('#travel-buffer',{state:'attached'});assert.equal(await page.locator('#travel-buffer').inputValue(),'17');
  assert.deepEqual(report.errors,[]);
}finally{
  await application.close();
  await fs.writeFile(path.join(out,'desktop-report.json'),JSON.stringify(report,null,2));
}
const saved=JSON.parse(await fs.readFile(path.join(userData,'settings.json'),'utf8'));
assert.equal(JSON.parse(saved.preferences['hangzhou-trip-buffer-v1']).buffer,'17');
console.log(JSON.stringify({passed:true,layouts:report.sizes.length,errors:report.errors,configured:report.configured,routeSummary:report.liveQuery?.summary}));
