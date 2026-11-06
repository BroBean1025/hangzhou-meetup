// Captured public route responses exercise the UI without a real service key.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'test-artifacts'),profile=path.join(out,'preferences-profile-'+Date.now());
await fs.mkdir(out,{recursive:true});
const fixtures=JSON.parse(await fs.readFile('tools/tests/fixtures/route-preferences.json','utf8'));
const env={...process.env,MEETUP_TEST:'1',MEETUP_USER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const executablePath=process.env.MEETUP_EXECUTABLE;
const app=await electron.launch({...(executablePath?{executablePath:path.resolve(executablePath),args:[]}:{args:['.']}),cwd:root,env,timeout:60000});
const errors=[],requests=[];let report;
try{
 const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.waitForSelector('.route-preferences');await page.waitForSelector('.leaflet-pane',{state:'attached'});
 await page.route('**/api/query',async route=>{
  const body=route.request().postDataJSON();requests.push(body);
  const fixture=fixtures.find(f=>f.request.origin.kind===body.origin.kind&&f.request.origin.id===body.origin.id&&f.request.origin.station_id===body.origin.station_id&&f.request.station_ids.join('|')===body.station_ids?.join('|')&&f.request.preferences.strategy===body.preferences?.strategy&&f.request.preferences.east_station===body.preferences?.east_station);
  return route.fulfill({status:fixture?200:500,contentType:'application/json',body:JSON.stringify(fixture?.response??{error:'Missing test fixture'})});
 });
 await page.evaluate(()=>{
  for(const c of campuses){c.revision++;c.prepareController?.abort();c.prepareController=null;}
  const c=makeStation('cn-hangzhou-qianjiang-century-city');c.ready=true;
  enabled.clear();enabled.add(c.id);primary=c.id;refreshCampuses(false);
 });
 const done=()=>page.waitForFunction(()=>lastQueryState==='complete');
 await page.locator('#destination-search').fill('杭州东');await page.locator('.destination-station').first().click();await done();
 assert.equal(await page.locator('#east-preference').isVisible(),true);
 assert.equal(await page.locator('#east-preference').isChecked(),false);
 assert.equal(await page.evaluate(()=>lastResults[0].total_seconds),840);
 assert.equal(await page.locator('.route-choices button').count(),2);
 await page.locator('#east-preference').check();await done();
 assert.equal(await page.evaluate(()=>lastResults[0].destination_station_id),'cn-hangzhou-east-railway-station');
 assert.equal(await page.evaluate(()=>lastResults[0].total_seconds),902);
 await page.evaluate(()=>{document.querySelector('#trip-planner').open=true;});
 await page.locator('#arrival-time').fill(await page.evaluate(()=>tripTime.localValue(Date.now()+86400000)));await page.locator('#arrival-time').dispatchEvent('input');
 const selected=await page.evaluate(()=>({departure:[...tripPlan.schedules.values()][0].departure,lines:[...usedRouteLines]}));
 const beforeRequests=requests.length;
 await page.locator('[data-choice="absolute_fastest"]').click();
 assert.equal(await page.evaluate(()=>lastResults[0].total_seconds),840);
 assert.equal(requests.length,beforeRequests,'Manual alternative selection uses the cached route');
 const manual=await page.evaluate(()=>({departure:[...tripPlan.schedules.values()][0].departure,lines:[...usedRouteLines]}));
 assert.notEqual(manual.departure,selected.departure,'Departure plan follows the selected duration');
 assert.notDeepEqual(manual.lines,selected.lines,'Rendered map follows the selected route');
 await page.locator('[data-choice="time"]').click();
 await page.evaluate(()=>{document.querySelector('#trip-planner').open=false;});
 const layouts=[];
 for(const [width,height,zoom] of [[1440,900,1],[1280,720,1],[1060,600,1],[390,844,1],[1280,800,1.5]]){
  await app.evaluate(({BrowserWindow},{width,height,zoom})=>{const w=BrowserWindow.getAllWindows()[0];w.setMinimumSize(320,400);w.setContentSize(width,height);w.webContents.setZoomFactor(zoom);},{width,height,zoom});
  await page.waitForFunction(()=>Math.abs(map.getSize().x-document.querySelector('#map').clientWidth)<2);
  await page.waitForFunction(()=>{const m=document.querySelector('#map').getBoundingClientRect(),h=document.querySelector('.map-hud').getBoundingClientRect();return Math.abs(m.x-h.x)<2&&Math.abs(m.y-h.y)<2;});
  const metrics=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('.route-choices button,.route-preferences,.route-meta')].filter(e=>e.scrollWidth>e.clientWidth+1).length,controlsRight:Math.max(...[...document.querySelectorAll('#desktop-updates,#current-clock,.route-choices button')].map(e=>e.getBoundingClientRect().right))}));
  assert.ok(metrics.scrollWidth<=metrics.width+1,JSON.stringify(metrics));assert.equal(metrics.clipped,0);layouts.push({width,height,zoom});
  assert.ok(metrics.controlsRight<=metrics.width,JSON.stringify(metrics));
  await page.locator('body').screenshot({path:path.join(out,`preferences-${width}-${zoom}.png`),scale:'css'});
 }
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(1440,900);w.webContents.setZoomFactor(1);});
 await page.locator('#east-preference').uncheck();await done();
 await page.locator('#destination-search').fill('八百里');await page.locator('.destination-station').first().click();await done();
 assert.equal(await page.locator('#east-preference').isVisible(),false);
 assert.equal(await page.evaluate(()=>lastResults[0].transfers),3);
 await page.locator('[data-strategy="transfers"]').click();await done();
 assert.equal(await page.evaluate(()=>lastResults[0].transfers),2);
 assert.equal(await page.evaluate(()=>lastResults[0].total_seconds),4761);
 assert.match(await page.locator('.route-metric.fare').textContent(),/票价约 10 元/);
 await page.screenshot({path:path.join(out,'preferences-fewer-transfers.png'),fullPage:true});
 await page.evaluate(()=>{lastTarget=null;enabled.clear();enabled.add('yuquan');primary='yuquan';const c=byCampus.get('yuquan');c.descriptor={kind:'campus',id:'yuquan',gates:['north'],mode:'walk'};c.ready=true;refreshCampuses(false);});
 await page.locator('#destination-search').fill('杭州东');await page.locator('.destination-station').first().click();await done();
 assert.equal(await page.evaluate(()=>lastResults[0].origin_station_id),'cn-hangzhou-gudang');
 assert.ok(await page.evaluate(()=>lastResults[0].alternatives.every(r=>r.access_seconds<600)));
 assert.match(await page.locator('.route-metric.fare').textContent(),/票价约 4 元/);
 await page.locator('#east-preference').check();await done();
 await page.screenshot({path:path.join(out,'practical-yuquan.png'),fullPage:true});
 await page.reload();await page.waitForSelector('.route-preferences');
 assert.equal(await page.locator('[data-strategy="transfers"]').getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);report={passed:true,layouts,requests:requests.length,manualChoiceUpdatesMapAndDeparture:true,errors};
}finally{await app.close();}
const settings=JSON.parse(await fs.readFile(path.join(profile,'settings.json'),'utf8'));
assert.equal(JSON.parse(settings.preferences['hangzhou-route-preferences-v1']).strategy,'transfers');
await fs.writeFile(path.join(out,'preferences-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
