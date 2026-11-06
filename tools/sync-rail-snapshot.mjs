// Release-time public-data refresh. Never uses or stores an AMap key.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
const base='https://openmetro.dev/api/networks/cn-hangzhou';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function json(url,options={}){
 for(let attempt=0;attempt<3;attempt++)try{const r=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);return await r.json();}catch(e){if(attempt===2)throw e;await delay(1000*(attempt+1));}
}
const names=['network','stations','lines','graph','segments','fares'];
const values=await Promise.all(names.map(n=>json(n==='network'?base:base+'/'+n)));
const data=Object.fromEntries(names.map((n,i)=>[n,values[i]]));
const {station_ids,fares}=data.fares,n=station_ids.length;
if(n<200||new Set(station_ids).size!==n||fares.length!==n||fares.some(r=>r.length!==n))throw Error('Unexpected fare matrix');
const stationById=new Map(data.stations.map(s=>[s.id,s]));
const aliases={'cn-hangzhou-xueyuan-road':'学院路','cn-hangzhou-dongxinyuan':'东新园','cn-hangzhou-east-railway-station-east-square':'火车东站(东广场)'};
const fareName=id=>aliases[id]??stationById.get(id).name;
// The upstream table has historically stored minimum-fare placeholders for
// unmatched names. Re-query suspicious rows and the fullwidth-parenthesis alias.
const repair=station_ids.filter((id,i)=>/[（）]/.test(stationById.get(id)?.name??'')||Math.max(...fares[i].filter(Number.isFinite))<=2);
const repaired=new Set(repair),pairs=[];
for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)if(repaired.has(station_ids[i])||repaired.has(station_ids[j]))pairs.push([i,j]);
await mkdir('test-artifacts',{recursive:true});
const cachePath='test-artifacts/fare-repair-cache.json',cacheVersion=data.network.synced_at+'|'+new Date().toISOString().slice(0,10);
let cache={};try{const saved=JSON.parse(await readFile(cachePath,'utf8'));if(saved.version===cacheVersion)cache=saved.pairs;}catch{}
let next=0,complete=0,failed,saveQueue=Promise.resolve();
const save=()=>{const contents=JSON.stringify({version:cacheVersion,pairs:cache});saveQueue=saveQueue.then(()=>writeFile(cachePath,contents));return saveQueue;};
await Promise.all(Array.from({length:2},async()=>{
 while(next<pairs.length&&!failed)try{const [i,j]=pairs[next++],from=fareName(station_ids[i]),to=fareName(station_ids[j]),key=from+'|'+to;
  if(Number.isInteger(cache[key])){fares[i][j]=fares[j][i]=cache[key];complete++;continue;}
  const r=await json('https://www.hzmetro.com/api/operation/fare',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:'https://www.hzmetro.com/'},body:new URLSearchParams({startStationName:from,endStationName:to})});
  const price=Number(r.data);if(!r.ok||!Number.isInteger(price)||price<2||price>30)throw Error('Invalid official fare: '+from+' → '+to);
  fares[i][j]=fares[j][i]=price;cache[key]=price;complete++;if(complete%20===0)await save();if(complete%100===0)console.log('Official fare checks: '+complete+'/'+pairs.length);await delay(250);
 }catch(e){failed=e;}
}));
await save();if(failed)throw failed;
for(let i=0;i<n;i++)for(let j=0;j<n;j++){const p=fares[i][j];if(!Number.isInteger(p)||p<0||p>30||i===j&&p!==0||i!==j&&p<2||p!==fares[j][i])throw Error('Invalid/asymmetric fare matrix');}
for(let i=0;i<n;i++)if(Math.max(...fares[i])<=2)throw Error('Unresolved minimum-fare placeholder row');
const snapshot={schema:1,verified_at:new Date().toISOString(),sources:[base,'https://www.hzmetro.com/api/operation/fare'],fare_repairs:repair,fare_aliases:aliases,...data};
await writeFile('core/config/rail-snapshot.json.tmp',JSON.stringify(snapshot)+'\n');
await rename('core/config/rail-snapshot.json.tmp','core/config/rail-snapshot.json');
console.log(JSON.stringify({stations:data.stations.length,farePairs:n*(n-1)/2,officialPairsRechecked:pairs.length,bytes:Buffer.byteLength(JSON.stringify(snapshot))}));
