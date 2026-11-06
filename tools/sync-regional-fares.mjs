// Public fare data only. Fail closed on missing/contradictory station pairs.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import regional from '../core/config/regional-network.json' with {type:'json'};
const hhNames=['临平南高铁站','许村','海宁高铁西站','长安(东方学院)','长安东','周王庙','盐官','桐九公路','斜桥','皮革城','海昌路','浙大国际校区'];
// Transcribed from the operator's published single-ticket chart, reproduced by
// Hangzhou Daily on opening day. Diagonal is 0 here because a route with no ride
// does not purchase a ticket; the chart's same-station entry/exit charge is 2.
const hhFares=[
 [0,2,4,5,6,6,7,8,8,9,9,9],
 [2,0,2,4,5,5,6,7,7,8,8,8],
 [4,2,0,2,3,5,5,6,7,7,8,8],
 [5,4,2,0,2,3,4,5,6,6,7,7],
 [6,5,3,2,0,2,4,5,5,6,7,7],
 [6,5,5,3,2,0,2,4,5,5,6,6],
 [7,6,5,4,4,2,0,2,4,5,5,6],
 [8,7,6,5,5,4,2,0,2,3,4,5],
 [8,7,7,6,5,5,4,2,0,2,3,4],
 [9,8,7,6,6,5,5,3,2,0,2,3],
 [9,8,8,7,7,6,5,4,3,2,0,2],
 [9,8,8,7,7,6,6,5,4,3,2,0]
];
const origin='https://www.sxsmtr.com/';
async function fetchText(url){const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Fetch failed: '+r.status);return r.text();}
const home=await fetchText(origin),entry=home.match(/src="(\.\/assets\/index-[^"]+\.js)"/)?.[1];assert.ok(entry,'Official site entry');
const bundle=await fetchText(new URL(entry,origin)),subway=bundle.match(/\.\/subway-[\w-]+\.js/)?.[0];assert.ok(subway,'Official fare module');
const url=new URL(subway,new URL(entry,origin)).href,source=await fetchText(url);
// Extract data literals, never execute downloaded JavaScript.
const stationsLiteral=source.match(/\[\{key:"1号线-[\s\S]+?\}\]/)?.[0];assert.ok(stationsLiteral);
const stations=JSON.parse(stationsLiteral.replace(/([{,])(key|line|station|latLong):/g,'$1"$2":'));
const faresLiteral=source.match(/\{"1号线-芳泉站":\{[\s\S]+?\}\}/)?.[0];assert.ok(faresLiteral);const fares=JSON.parse(faresLiteral);
const norm=s=>s.replace(/\*/g,'').replace('（绍兴）','');
const aliases={'人民医院总院':'镜湖医院'};
const sxStations=regional.stations.filter(s=>s.id.startsWith('regional-sx-')||s.id==='cn-hangzhou-guniangqiao');
const keys=s=>stations.filter(x=>[norm(aliases[s.name]??s.name),norm(aliases[s.name]??s.name)+'站'].includes(norm(x.station))).map(x=>x.key);
const sxFares=sxStations.map(a=>sxStations.map(b=>{
 if(a.id===b.id)return 0;
 const values=keys(a).flatMap(x=>keys(b).flatMap(y=>[fares[x]?.[y],fares[y]?.[x]])).filter(Number.isFinite);
 assert.ok(values.length,`Missing fare ${a.name} → ${b.name}`);
 assert.equal(new Set(values).size,1,`Conflicting fares ${a.name} → ${b.name}`);return values[0];
}));
const groups=[{id:'hh',boundary:'cn-hangzhou-linpingnan-railway-station',station_ids:hhNames.map(n=>regional.stations.find(s=>s.name===n).id),fares:hhFares},{id:'sx',boundary:'cn-hangzhou-guniangqiao',station_ids:sxStations.map(s=>s.id),fares:sxFares}];
for(const g of groups)for(let i=0;i<g.station_ids.length;i++)for(let j=0;j<g.station_ids.length;j++){const value=g.fares[i][j];assert.equal(value,g.fares[j][i]);assert.ok(Number.isInteger(value)&&value>=(i===j?0:2)&&value<=10);}
const output={schema:1,verified_at:new Date().toISOString(),currency:'CNY',unit:'yuan',groups,sources:[{name:'杭海城际运营票价表（杭州日报现场报道）',url:'https://apiv4.cst123.cn/cst/news/shareDetail?id=594189804262916096',chart:'https://img-hbcst.oss-cn-hangzhou.aliyuncs.com/hbcst/20210628/20210628152013651.png'},{name:'绍兴市轨道交通集团官方站间票价',url,sha256:createHash('sha256').update(source).digest('hex')},{name:'绍兴发布：跨区域分段计价',url:'https://m.thepaper.cn/newsDetail_forward_13286049'},{name:'杭州东虚拟换乘（杭州日报）',url:'https://hznews.hangzhou.com.cn/chengshi/content/2022-09/19/content_8356690_4.htm'}],aliases};
const target=new URL('../core/config/regional-fares.json',import.meta.url);await fs.writeFile(new URL(target.href+'.tmp'),JSON.stringify(output)+'\n');await fs.rename(new URL(target.href+'.tmp'),target);
console.log(JSON.stringify({groups:groups.map(g=>({id:g.id,stations:g.station_ids.length})),source:url}));
