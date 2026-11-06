// Cloud-hosted equivalent of the Python map service. Provider durations only.
import config from '../config/settings.json' with { type: 'json' };
import {directedConnectors,supplementTimes,connectPlans} from './walk-connectors.mjs';
import regional from '../config/regional-network.json' with { type: 'json' };
import walkingSnapshot from '../config/walking-snapshot.json' with { type: 'json' };
import {mergeCatalog,RegionalRouter} from './regional-network.mjs';
import {stationDepartures} from './route-timing.mjs';

const API = 'https://openmetro.dev/api/networks/cn-hangzhou';
const LABEL = {walk:'步行',bus:'公交',bike:'骑行',taxi:'打车'};
const TTL = {walk:604800,bus:900,bike:86400,taxi:300,station:86400};
export class QueryError extends Error {}
const obj = x => x && typeof x === 'object' && !Array.isArray(x) ? x : {};
const present = x => x !== null && x !== undefined && x !== '' && !Array.isArray(x);
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
function num(x) { if(!present(x) || !Number.isFinite(Number(x))) throw new QueryError('数据包含无效数值。'); return Number(x); }
function sec(x) { const n=num(x); if(n<0) throw new QueryError('接口返回负时间。'); return n; }
export function wgsToGcj(lon,lat) {
  const x=lon-105,y=lat-35,p=Math.PI;
  let a=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x));
  a+=(20*Math.sin(6*x*p)+20*Math.sin(2*x*p))*2/3;
  a+=(20*Math.sin(y*p)+40*Math.sin(y*p/3))*2/3;
  a+=(160*Math.sin(y*p/12)+320*Math.sin(y*p/30))*2/3;
  let b=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));
  b+=(20*Math.sin(6*x*p)+20*Math.sin(2*x*p))*2/3;
  b+=(20*Math.sin(x*p)+40*Math.sin(x*p/3))*2/3;
  b+=(150*Math.sin(x*p/12)+300*Math.sin(x*p/30))*2/3;
  const rad=lat*p/180,m=1-.00669342162296594323*Math.sin(rad)**2;
  return [lon+b*180/(6378245/Math.sqrt(m)*Math.cos(rad)*p),lat+a*180/(6378245*(1-.00669342162296594323)/(m*Math.sqrt(m))*p)];
}
export function gcjToWgs(lon,lat) {let x=lon,y=lat;for(let i=0;i<6;i++){const [gx,gy]=wgsToGcj(x,y);x+=lon-gx;y+=lat-gy;}return [x,y];}
function distance(a,b) {const r=Math.PI/180,dl=(b.lat-a.lat)*r,dn=(b.lon-a.lon)*r;return 12742*Math.asin(Math.min(1,Math.sqrt(Math.sin(dl/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dn/2)**2)));}
export function geometry(groups) {
  const parts=[];let missing=0;
  for(const [mode,label,steps] of groups){
    if(!steps?.length){missing++;continue;}
    for(const step of steps){
      if(typeof step?.polyline!=='string'||!step.polyline.trim()){if(!['0','0.0'].includes(String(step?.distance)))missing++;continue;}
      let chunk=[],count=0,invalid=false;
      const flush=()=>{if(chunk.length>=2){parts.push({mode,label,coordinates:chunk});count++;}chunk=[];};
      for(const token of step.polyline.split(';')){
        const raw=token.split(',');const [lon,lat]=raw.map(Number);
        if(raw.length!==2||raw.some(s=>!s.trim())||!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90){flush();invalid=true;continue;}
        const point=gcjToWgs(lon,lat).map(x=>+x.toFixed(7));
        if(!chunk.length||point.some((v,i)=>v!==chunk.at(-1)[i]))chunk.push(point);
      }
      flush();if(invalid||!count)missing++;
    }
  }
  return {crs:'wgs84',source:'高德路径规划 polyline',parts,status:parts.length?(missing?'partial':'complete'):'unavailable'};
}
export function parseAccess(mode,data) {
  const root=obj(data[mode==='bike'?'data':'route']);
  const plans=(root[mode==='bus'?'transits':'paths']||[]).filter(p=>{
    if(!present(p.duration))return false;
    if(mode!=='bus')return true;
    const segments=p.segments||[],buses=segments.flatMap(s=>obj(s.bus).buslines||[]);
    const meaningful=x=>Object.values(obj(x)).some(v=>Array.isArray(v)?v.length:!!v);
    return buses.length&&!buses.some(b=>/地铁|轻轨/.test(b.type||''))&&!segments.some(s=>meaningful(s.railway)||meaningful(s.taxi));
  });
  if(!plans.length)throw new QueryError('未取得可用的'+LABEL[mode]+'接驳路线，请选择其他方式或校门。');
  const p=plans.reduce((a,b)=>sec(a.duration)<=sec(b.duration)?a:b);
  const out={mode,seconds:sec(p.duration),distance_m:num(p.distance),source:'高德'+LABEL[mode]+'路径规划',instructions:[],notes:[]};
  const groups=[];
  if(mode==='bus'){
    for(const segment of p.segments||[]){
      const walking=obj(segment.walking);
      if(present(walking.duration)){out.instructions.push('步行 '+Math.round(sec(walking.duration)/60)+' 分钟');if(sec(walking.duration)>0||walking.steps?.length)groups.push(['walk','公交接驳中的步行',walking.steps||[]]);}
      const bus=(obj(segment.bus).buslines||[])[0];
      if(bus){groups.push(['bus',bus.name||'公交',[bus]]);out.instructions.push(`${obj(bus.departure_stop).name||''} → ${bus.name||''} → ${obj(bus.arrival_stop).name||''}`);}
    }
    if(typeof obj(p.emergency).ldescription==='string')out.notes.push(p.emergency.ldescription);
    out.notes.push('公交使用规划方案总时间，包含方案内步行；班次、候车及预约安排以现场为准。');
    out.fare=present(p.cost)?num(p.cost):null;
  }else{
    groups.push([mode,LABEL[mode],p.steps||[]]);
    out.instructions=(p.steps||[]).map(s=>s.instruction).filter(s=>typeof s==='string');
    if(mode!=='walk')out.notes.push(mode==='bike'?'骑行不含取还车与停车时间。':'打车按驾车行驶时间估算，不含叫车等待、上下车；不是实时网约车报价。');
    if(mode==='taxi')out.fare=present(root.taxi_cost)?num(root.taxi_cost):null;
  }
  out.geometry=geometry(groups);return out;
}

// Bounded in-memory + edge caches; keys contain only a digest, never API secrets.
const memory=new Map(),inflight=new Map();
let railMemo=null;
let amapQueue=Promise.resolve(),amapNext=0;
async function amapSlot(){const turn=amapQueue.then(async()=>{await sleep(Math.max(0,amapNext-Date.now()));amapNext=Date.now()+1100;});amapQueue=turn.catch(()=>{});await turn;}
async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),v=>v.toString(16).padStart(2,'0')).join('');}
async function cached(identity,ttl,loader){
  const now=Date.now(),saved=memory.get(identity);if(saved&&saved.expires>now)return saved.value;
  if(inflight.has(identity))return inflight.get(identity);
  const promise=(async()=>{
    let edge,key;
    if(typeof caches!=='undefined'&&caches.default){edge=caches.default;key=new Request('https://metro-cache.internal/v1/'+await digest(identity));try{const hit=await edge.match(key);if(hit){const record=await hit.json();if(record.expires>Date.now())return record.value;}}catch{}}
    const value=await loader();const record={expires:Date.now()+ttl*1000,value};
    if(memory.size>=120)memory.delete(memory.keys().next().value);memory.set(identity,record);
    if(edge)try{await edge.put(key,new Response(JSON.stringify(record),{headers:{'Cache-Control':'public, max-age='+ttl,'Content-Type':'application/json'}}));}catch{}
    return value;
  })();inflight.set(identity,promise);try{return await promise;}finally{inflight.delete(identity);}
}
async function requestJson(base,params,ttl,version=''){
  const safe={...params};delete safe.key;
  const identity=base+'?'+new URLSearchParams(Object.entries(safe).sort()).toString()+'|'+version;
  return cached(identity,ttl,async()=>{
    const isAmap=base.startsWith('https://restapi.amap.com/');
    for(let attempt=0;attempt<2;attempt++){
      try{
        if(isAmap)await amapSlot();
        const response=await fetch(base+'?'+new URLSearchParams(params),{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
        if(!response.ok){if(response.status===429&&attempt===0){await sleep(1500);continue;}throw new QueryError((isAmap?'高德':'OpenMetro')+'服务暂不可用（'+response.status+'）。');}
        const d=await response.json();
        if(String(d.status)==='0'||('errcode' in d&&String(d.errcode)!=='0')){
          const code=String(d.infocode??d.errcode);
          if(['10019','10020','10021','10003'].includes(code)&&attempt===0){await sleep(1600);continue;}
          throw new QueryError('高德未返回可用方案（'+code+'），请稍后重试或切换接驳方式。');
        }
        return d;
      }catch(e){if(e instanceof QueryError)throw e;if(attempt===1)throw new QueryError((isAmap?'高德':'OpenMetro')+'连接超时或数据异常，请稍后重试。');}
    }
  });
}
export class MetroService {
  constructor(key){this.key=key;this.connectorConfig=config.station_connectors??[];}
  async init(){
    const network=await requestJson(API,{},86400);if(network.coordinate_system!=='gcj02')throw new QueryError('地铁坐标基准需要重新核验。');
    this.network=network;this.version=network.synced_at;
    const [stations,lines]=await Promise.all(['stations','lines'].map(name=>requestJson(API+'/'+name,{},86400,this.version)));
    if(!Array.isArray(stations)||!Array.isArray(lines))throw new QueryError('地铁目录数据异常。');
    const merged=mergeCatalog(stations,lines,regional);
    this.stations=new Map(merged.stations.filter(s=>s.status==='operating'&&s.location).map(s=>[s.id,s]));
    this.lines=new Map(merged.lines.map(l=>[l.id,l.name]));return this;
  }
  async railRouter(){
    if(railMemo?.version===this.version)return railMemo.router;
    const [graph,segments]=await Promise.all([requestJson(API+'/graph',{},86400,this.version),requestJson(API+'/segments',{},86400,this.version)]);
    if(graph.weight!=='seconds'||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges))throw new QueryError('OpenMetro 网络图数据需要重新核验。');
    const router=new RegionalRouter(graph,regional,this.stations,segments);railMemo={version:this.version,router};return router;
  }
  normalize(raw){
    const d=obj(raw);
    if(d.kind==='station'){
      if(typeof d.station_id!=='string'||!this.stations.has(d.station_id))throw new QueryError('请选择具体的运营地铁站。');
      const members=this.group(d.station_id)?.member_ids??[d.station_id],sid=members[0];
      return {id:'station:'+sid,kind:'station',station_id:sid,mode:'station',gates:members};
    }
    const c=config.campuses.find(c=>c.id===d.id);if(!c)throw new QueryError('学校出发点无效。');
    const gates=d.gates??[c.origin_key],mode=d.mode??'walk';
    if(!Array.isArray(gates)||!gates.length||new Set(gates).size!==gates.length||gates.some(g=>!c.gate_options.some(o=>o.key===g)))throw new QueryError('请勾选至少一个已核实的本校校门。');
    if(!Object.hasOwn(LABEL,mode))throw new QueryError('接驳方式无效。');
    return {id:c.id,kind:'campus',gates:[...gates].sort(),mode};
  }
  group(sid){const g=config.station_groups?.find(g=>g.member_ids.includes(sid));if(!g)return null;const member_ids=g.member_ids.filter(id=>this.stations.has(id));return member_ids.length>1?{...g,member_ids}:null;}
  expandStations(ids){return [...new Set(ids.flatMap(id=>this.group(id)?.member_ids??[id]))];}
  gateLabel(d,gate){return d.kind==='station'?(d.gates.length>1?this.stations.get(gate).name:'站内出发'):config.campuses.find(c=>c.id===d.id).gate_options.find(g=>g.key===gate).label;}
  async nearest(point,count,radius=2.5){
    const rows=[...this.stations.values()].map(station=>({station,distance_km:distance(point,station.location)})).filter(r=>r.distance_km<=radius).sort((a,b)=>a.distance_km-b.distance_km).slice(0,count);
    if(!rows.length)throw new QueryError('候选范围内没有可用运营地铁站。');return rows;
  }
  async access(mode,a,b,city='杭州'){
    if(mode==='walk'){
      const saved=walkingSnapshot.routes[`${a.lon.toFixed(6)},${a.lat.toFixed(6)}|${b.lon.toFixed(6)},${b.lat.toFixed(6)}`];
      if(saved&&saved.expires_epoch*1000>Date.now())return {...saved.value,mode:'walk',notes:[],cache_source:'verified_snapshot'};
    }
    if(!this.key)throw new QueryError('接驳服务尚未配置。请在本服务的 .env 填写自己的 AMAP_WEB_SERVICE_KEY 并重启；访客请联系该服务器维护者。');
    const params={origin:`${a.lon.toFixed(6)},${a.lat.toFixed(6)}`,destination:`${b.lon.toFixed(6)},${b.lat.toFixed(6)}`,key:this.key};
    let path='https://restapi.amap.com/';
    if(mode==='bike')path+='v4/direction/bicycling';
    else {path+='v3/direction/'+({walk:'walking',bus:'transit/integrated',taxi:'driving'})[mode];if(mode!=='walk'){params.extensions='all';params.strategy=mode==='bus'?5:0;if(mode==='bus'){params.city=city;params.cityd=city;}}}
    return parseAccess(mode,await requestJson(path,params,TTL[mode]));
  }
  async engine(d,gate){
    return cached('engine-v3|'+this.version+'|'+JSON.stringify(this.connectorConfig)+'|'+gate+'|'+d.mode,Math.min(TTL[d.mode],86400),async()=>{
      const start=d.kind==='station'?this.stations.get(gate):config.origins[gate];
      const options=d.kind==='station'?[{station:start,walk:{mode:'station',seconds:0,distance_m:0,source:'指定地铁站内起算',notes:[]}}]:await this.nearest(start.location,5,start.max_station_distance_km??2.5);
      const errors=[];
      if(d.kind!=='station')await Promise.all(options.map(async o=>{try{o.walk=await this.access(d.mode,start.location,o.station.location,start.city??'杭州');}catch(e){errors.push(e.message);o.walk={seconds:null,reason:e.message};}}));
      const reached={};
      for(const o of options){
        if(o.walk.seconds===null)continue;
        try{
          const data=await this.travelTimes(o.station.id);
          errors.push(...(data.warnings??[]));
          for(const row of data.stations||[]){const total=o.walk.seconds+sec(row.seconds);if(!this.stations.has(row.station_id)||total>21600)continue;
            if(!reached[row.station_id]||total<reached[row.station_id].seconds)reached[row.station_id]={seconds:total,access_seconds:o.walk.seconds,metro_seconds:sec(row.seconds),via_station:o.station.name,via_id:o.station.id};}
        }catch(e){errors.push(e.message);}
      }
      if(!Object.keys(reached).length)throw new QueryError([...new Set(errors)].join('；')||'暂未取得完整到达时间。');
      return {reached,options,start,errors};
    });
  }
  async describe(raw){
    const d=this.normalize(raw),times={},errors=[],access=[];
    for(const gate of d.gates){try{const e=await this.engine(d,gate);for(const [sid,row] of Object.entries(e.reached)){if(!times[sid]||row.seconds<times[sid].seconds)times[sid]={...row,gate_key:gate,gate_label:this.gateLabel(d,gate)};}access.push(...e.options.filter(o=>o.walk.seconds!==null).map(o=>o.walk.seconds));errors.push(...e.errors);}catch(e){errors.push(this.gateLabel(d,gate)+'：'+e.message);}}
    if(!Object.keys(times).length)throw new QueryError(errors.join('；'));
    return {id:d.id,descriptor:d,times,errors:[...new Set(errors)],access_hint:Math.min(...access),long_access:d.mode==='walk'&&Math.min(...access)>=1200,valid_for_seconds:Math.min(TTL[d.mode],86400),synced_at:this.version};
  }
  async rawTravelTimes(from){
    return {from_station_id:from,weight:'seconds',stations:(await this.railRouter()).times(from,21600)};
  }
  async travelTimes(from){
    return cached('walking-times-v1|'+this.version+'|'+JSON.stringify(this.connectorConfig)+'|'+from,86400,async()=>{
      const base=await this.rawTravelTimes(from),connectors=directedConnectors(this.connectorConfig,this.stations),exits=new Map(),warnings=[];
      for(const exit of new Set(connectors.map(c=>c.to_station_id)))try{exits.set(exit,await this.rawTravelTimes(exit));}catch{warnings.push('跨站区步行备选路线暂不可用，仅比较已取得的地铁路线。');}
      return {...supplementTimes(base,connectors,exits),warnings};
    });
  }
  async rawRoute(from,to){
    if(from===to)return {total_seconds:0,legs:[],transfers:0,fare:0};
    if(from.startsWith('regional-')||to.startsWith('regional-'))return (await this.railRouter()).route(from,to);
    const p=await requestJson(API+'/route',{from,to,weight:'time'},86400,this.version);
    if(p.from_station_id!==from||p.to_station_id!==to||!Array.isArray(p.legs)||Math.abs(p.legs.reduce((n,l)=>n+sec(l.seconds),0)-sec(p.total_seconds))>.01||p.legs.some(l=>!['ride','transfer'].includes(l.kind)))throw new QueryError('地铁路线的端点或时间拆分异常。');
    if(p.legs.some(l=>(l.station_ids||[l.from_station_id,l.to_station_id]).some(id=>!this.stations.has(id))))throw new QueryError('路线包含未运营或未知站点。');
    return p;
  }
  async route(from,to){
    if(from===to)return this.rawRoute(from,to);
    const times=await this.travelTimes(from),row=times.stations.find(r=>r.station_id===to);
    const connector=directedConnectors(this.connectorConfig,this.stations).find(c=>c.id===row?.walk_connector_id);
    if(!connector)return this.rawRoute(from,to);
    const before=await this.rawRoute(from,connector.from_station_id),after=await this.rawRoute(connector.to_station_id,to);
    const result=connectPlans(from,to,before,connector,after);
    if(Math.abs(result.total_seconds-row.seconds)>1)throw new QueryError('步行换乘路线与可达时间不一致，请刷新后重试。');
    return result;
  }
  async metroResult(engine,base,end,egress,errors=[]){
    const origin=engine.options.find(o=>o.station.id===base.via_id);
    const plan=await this.route(origin.station.id,end.id);
    if(Math.abs(sec(plan.total_seconds)-base.metro_seconds)>1)throw new QueryError('路线与可达时间不一致，请稍后刷新查询。');
    const router=await this.railRouter();
    const legs=plan.legs.map(l=>({...router.timedLeg(l),line_name:this.lines.get(l.line_id),station_names:(l.station_ids||[l.from_station_id,l.to_station_id]).map(id=>this.stations.get(id).name)}));
    const station_departures=stationDepartures(legs,base.access_seconds);
    return {station_departures,mode:'metro',total_seconds:base.seconds+egress.seconds,access_seconds:base.access_seconds,ride_seconds:legs.filter(l=>l.kind==='ride').reduce((n,l)=>n+sec(l.seconds),0),transfer_seconds:legs.filter(l=>['transfer','walk_transfer'].includes(l.kind)).reduce((n,l)=>n+sec(l.seconds),0),cross_station_seconds:legs.filter(l=>l.kind==='walk_transfer').reduce((n,l)=>n+sec(l.seconds),0),egress_seconds:egress.seconds,origin_station:origin.station.name,destination_station:end.name,origin_station_id:origin.station.id,destination_station_id:end.id,egress,access_mode:origin.walk.mode,access_details:origin.walk,line_names:legs.filter(l=>l.kind==='ride').map(l=>l.line_name),legs,transfers:plan.transfers,fare:plan.fare,warnings:['在指定候选上车站、目的地附近候选站中择优。',...(plan.warnings??[]),...(errors.length?['部分候选未取得完整路线，仅比较成功结果。']:[])]};
  }
  async queryGate(d,gate,payload){
    const engine=await this.engine(d,gate);let result,dest,lon,lat,sid;
    let ids=payload.station_ids??(payload.station_id?[payload.station_id]:null);
    if(ids!==null){
      if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!this.stations.has(id)))throw new QueryError('目的地不是有效运营地铁站。');
      ids=this.expandStations(ids);
      const valid=ids.filter(id=>engine.reached[id]);if(!valid.length)throw new QueryError('该站尚无完整时间。');
      sid=valid.reduce((a,b)=>engine.reached[a].seconds<=engine.reached[b].seconds?a:b);
      const end=this.stations.get(sid);dest=end.location;[lon,lat]=gcjToWgs(dest.lon,dest.lat);
      result=await this.metroResult(engine,engine.reached[sid],end,{seconds:0,source:'终点为地铁站参考点'});
    }else{
      lon=num(payload.lon);lat=num(payload.lat);
      if(lon<118.2||lon>121||lat<29||lat>30.7)throw new QueryError('选点不在杭州及地铁周边范围。');
      const [x,y]=wgsToGcj(lon,lat);dest={lon:+x.toFixed(6),lat:+y.toFixed(6)};
      const km=distance(engine.start.location,dest);if(km>100)throw new QueryError('选点距离出发点超过100公里。');
      let direct=null;const errors=[];
      if(km<.001)direct={seconds:0,distance_m:0,source:'选点与出发参考点重合'};
      else if(km<=3)try{direct=await this.access('walk',engine.start.location,dest);}catch(e){errors.push(e.message);}
      let ends=[];try{ends=await this.nearest(dest,3);}catch(e){errors.push(e.message);}
      const choices=[];
      for(const o of ends){const base=engine.reached[o.station.id];if(!base||(direct&&direct.seconds<=base.seconds))continue;try{const walk=await this.access('walk',o.station.location,dest);choices.push({base,end:o.station,walk,total:base.seconds+walk.seconds});}catch(e){errors.push(e.message);}}
      choices.sort((a,b)=>a.total-b.total);const best=choices[0];
      if(direct&&(!best||direct.seconds<=best.total))result={mode:'walk',total_seconds:direct.seconds,access_seconds:0,ride_seconds:0,transfer_seconds:0,egress_seconds:direct.seconds,direct_walk:direct,line_names:[],legs:[],transfers:0,warnings:['近距离同时比较直接步行；本次直接步行所需时间更短。']};
      else if(best)result=await this.metroResult(engine,best.base,best.end,best.walk,errors);
      else throw new QueryError('无法取得完整到达时间：'+[...new Set(errors)].join('；'));
    }
    const [ox,oy]=gcjToWgs(engine.start.location.lon,engine.start.location.lat);
    const startGroup=d.kind==='station'?this.group(d.station_id):null,endGroup=sid?this.group(sid):null;
    return {...result,origin_group:startGroup?.name,destination_group:endGroup?.name,destination:{name:sid?(endGroup?.name??this.stations.get(sid).name):'地图选点',lon,lat,crs:'wgs84'},origin_location:{lon:ox,lat:oy,crs:'wgs84'},scope:(d.kind==='station'?'station':'gate')+(sid?'_to_station':'_to_point'),cached:false,synced_at:this.version,warnings:[...result.warnings,...engine.errors,...[startGroup,endGroup].filter(Boolean).map(g=>g.connection_note),'静态网络时间估算，不是实时列车时间；不判断首末班、停运或当前能否乘车。',d.kind==='station'?'从指定地铁站内起算，不含前往该站的接驳。':'从所选校门起算，不含校内步行。','杭州段不含候车；跨城段含供应商固定预留。进出站及安检另计，站点参考坐标未逐出入口核验。']};
  }
  async query(payload){
    const d=this.normalize(payload.origin),name=d.kind==='station'?(this.group(d.station_id)?.name??this.stations.get(d.station_id).name):config.campuses.find(c=>c.id===d.id).name;
    const options=[],errors=[];
    for(const gate of d.gates)try{options.push({...await this.queryGate(d,gate,payload),origin_id:d.id,origin_name:name,gate_key:gate,gate_label:this.gateLabel(d,gate),origin_kind:d.kind,requested_access_mode:d.mode});}catch(e){errors.push(this.gateLabel(d,gate)+'：'+e.message);}
    options.sort((a,b)=>a.total_seconds-b.total_seconds);
    const best=options[0]||{origin_id:d.id,origin_name:name,total_seconds:null,error:errors.join('；')};
    if(options.length){best.gate_errors=errors;if(errors.length)best.warnings.push('部分候选出发位置未取得完整路线：'+errors.join('；'));}
    return {results:[best],complete:!!options.length,longest_seconds:best.total_seconds,spread_seconds:options.length?0:null};
  }
}

const rates=new Map();
export async function handleApi(request,env){
  const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  const path=new URL(request.url).pathname;
  if(path==='/api/health')return json({ready:true,walking_available:!!env.AMAP_WEB_SERVICE_KEY,campus_ids:config.campuses.map(c=>c.id)});
  if(!['/api/origin','/api/query'].includes(path))return json({error:'接口不存在。'},404);
  if(request.method!=='POST')return json({error:'请使用地图页面查询。'},405);
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)return json({error:'请从本站地图发起查询。'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'请求格式无效。'},400);
  const ip=request.headers.get('cf-connecting-ip')||'local',now=Date.now();
  const rate=rates.get(ip);if(rate&&rate.until>now&&rate.count>=120)return json({error:'查询较频繁，请一分钟后重试。'},429);
  if(rate&&rate.until>now)rate.count++;else {if(rates.size>2000)rates.clear();rates.set(ip,{count:1,until:now+60000});}
  try{
    if(Number(request.headers.get('content-length'))>262144)return json({error:'请求过大。'},413);
    const reader=request.body?.getReader();if(!reader)return json({error:'请求内容为空。'},400);
    const chunks=[];let length=0;while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>262144){await reader.cancel();return json({error:'请求过大。'},413);}chunks.push(r.value);}
    const bytes=new Uint8Array(length);let offset=0;for(const b of chunks){bytes.set(b,offset);offset+=b.length;}
    let payload;try{payload=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'请求不是有效 JSON。'},400);}
    if(!payload||typeof payload!=='object'||Array.isArray(payload))return json({error:'请求格式无效。'},400);
    const service=await new MetroService(env.AMAP_WEB_SERVICE_KEY).init();
    return json(path==='/api/origin'?await service.describe(payload.origin):await service.query(payload));
  }catch(e){return json({error:e instanceof QueryError?e.message:'查询服务暂时不可用，请稍后重试。'},e instanceof QueryError?422:500);}
}
