import {directedConnectors,connectPlans} from './walk-connectors.mjs';
import {practicalTransferChoices} from './routing-policy.mjs';
export const EAST_MAIN='cn-hangzhou-east-railway-station',EAST_SQUARE=EAST_MAIN+'-east-square';
export const byTime=(a,b)=>a.total_seconds-b.total_seconds||(a.transfers??0)-(b.transfers??0);
export const byTransfers=(a,b)=>(a.transfers??0)-(b.transfers??0)||byTime(a,b);
export function normalizePreferences(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||!['time','transfers',undefined].includes(value.strategy)||!['fastest','main_within_10',undefined].includes(value.east_station))throw Error('路线偏好无效');
 return {strategy:value.strategy??'time',east_station:value.east_station??'fastest'};
}
export function selectPreferred(candidates,preferences){
 if(!candidates.length)throw Error('没有可用路线');
 const fastest=[...candidates].sort(byTime)[0],east=candidates.some(r=>[EAST_MAIN,EAST_SQUARE].includes(r.destination_station_id));
 // Walking from East Square to the main area does not avoid the long station approach.
 const main=candidates.filter(r=>r.destination_station_id===EAST_MAIN&&r.legs?.at(-1)?.kind!=='walk_transfer'&&r.total_seconds<=fastest.total_seconds+600);
 const apply=preferences.east_station==='main_within_10'&&east&&main.length>0,pool=apply?main:candidates;
 const time=[...pool].sort(byTime)[0],transfers=practicalTransferChoices(pool,time).sort(byTransfers)[0];
 const picks=[['time','时间优先',time],['transfers','少换乘',transfers]];
 if(east&&!apply&&main.length)picks.push(['east_main','杭州东 · 1/4站区',[...main].sort(byTime)[0]]);
 if(apply&&fastest!==time)picks.push(['absolute_fastest','最快到站',fastest]);
 const signature=r=>JSON.stringify([r.gate_key,r.origin_station_id,r.destination_station_id,r.mode,r.legs?.map(l=>[l.kind,l.line_id,l.from_station_id,l.to_station_id,l.station_ids])]);
 const alternatives=[];
 for(const [key,label,route] of picks){const prior=alternatives.find(a=>signature(a)===signature(route));if(prior){prior.tags.push(label);continue;}alternatives.push({...route,choice_id:key,tags:[label],extra_seconds:route.total_seconds-fastest.total_seconds});}
 const chosen=preferences.strategy==='transfers'?transfers:time,selected=alternatives.find(r=>signature(r)===signature(chosen));
 const extra=Math.ceil((selected.total_seconds-fastest.total_seconds)/60);
 const note=!east?null:apply?'已优先杭州东1/4号线站区；'+(extra>0?'比最快方案多 '+extra+' 分钟。':'无需增加行程时间。'):preferences.east_station==='main_within_10'?'1/4号线站区暂无多花10分钟以内的可用方案，保留当前路线。':'可开启杭州东进站偏好，在多花10分钟以内优先1/4号线站区。';
 return {...selected,alternatives,preference_note:note,preferences};
}
export async function fewestPlan(service,from,to){
 const router=await service.railRouter(),plans=[];
 try{plans.push(router.route(from,to,'transfers'));}catch{}
 for(const c of directedConnectors(service.connectorConfig,service.stations))try{plans.push(connectPlans(from,to,router.route(from,c.from_station_id,'transfers'),c,router.route(c.to_station_id,to,'transfers')));}catch{}
 if(!plans.length)throw Error('暂无少换乘方案');return plans.sort(byTransfers)[0];
}
export async function queryPreferred(service,payload,geo){
 const preferences=normalizePreferences(payload.preferences),d=service.normalize(payload.origin),candidates=[],errors=[];
 const ids=payload.station_ids??(payload.station_id?[payload.station_id]:null);
 if(ids!==null&&(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||!service.stations.has(id))))throw Error('目的地不是有效运营地铁站');
 const endIds=ids===null?null:service.expandStations(ids);
 let destination;
 if(!endIds){const lon=payload.lon,lat=payload.lat;if(!Number.isFinite(lon)||!Number.isFinite(lat)||lon<118.2||lon>121||lat<29||lat>30.7)throw Error('选点不在杭州及地铁周边范围');const [x,y]=geo.wgsToGcj(lon,lat);destination={lon:x,lat:y};}
 for(const gate of d.gates)try{
  const engine=await service.engine(d,gate),startGroup=d.kind==='station'?service.group(d.station_id):null;
  if(destination&&geo.distance(engine.start.location,destination)>100)throw Error('选点距离出发点超过100公里');
  let ends=[];try{ends=endIds?endIds.map(id=>({station:service.stations.get(id)})):await service.nearest(destination,3);}catch(e){errors.push(e.message);}
  const add=(result,end)=>{
   const group=endIds?service.group(end.id):null,coords=endIds?geo.gcjToWgs(end.location.lon,end.location.lat):[payload.lon,payload.lat];
   candidates.push({...result,origin_id:d.id,origin_name:startGroup?.name??engine.start.name??d.id,origin_kind:d.kind,gate_key:gate,gate_label:service.gateLabel(d,gate),requested_access_mode:d.mode,origin_location:Object.fromEntries(['lon','lat'].map((k,i)=>[k,geo.gcjToWgs(engine.start.location.lon,engine.start.location.lat)[i]])),origin_group:startGroup?.name,destination_group:group?.name,destination:{name:endIds?(group?.name??end.name):'地图选点',lon:coords[0],lat:coords[1],crs:'wgs84'},scope:(d.kind==='station'?'station':'gate')+(endIds?'_to_station':'_to_point'),warnings:[...(result.warnings??[]),...engine.errors,'静态规划；到站不等于高铁进站完成，安检、候车另计。'],synced_at:service.version});
  };
  if(destination&&geo.distance(engine.start.location,destination)<=3)try{const walk=geo.distance(engine.start.location,destination)<.001?{seconds:0,distance_m:0}:await service.access('walk',engine.start.location,destination);add({mode:'walk',total_seconds:walk.seconds,access_seconds:0,egress_seconds:walk.seconds,ride_seconds:0,transfer_seconds:0,transfers:0,fare:0,direct_walk:walk,legs:[]},{id:null});}catch(e){errors.push(e.message);}
  for(const {station:end} of ends)try{
   const egress=endIds?{seconds:0,source:'终点为地铁站参考点'}:await service.access('walk',end.location,destination);
   const base=engine.reached[end.id];let fast;
   if(base)try{fast=await service.metroResult(engine,base,end,egress);add(fast,end);}catch(e){errors.push(e.message);}
   // At Hangzhou East also retain both rail-only alternatives: an easy-entry
   // preference must not be satisfied by arriving at East Square then walking.
   for(const strategy of end.id===EAST_MAIN?['time','transfers']:['transfers']){
   const choices=[];
   for(const o of engine.options.filter(o=>Number.isFinite(o.walk.seconds)))try{const plan=end.id===EAST_MAIN?(await service.railRouter()).route(o.station.id,end.id,strategy):await fewestPlan(service,o.station.id,end.id);choices.push({o,plan,total_seconds:o.walk.seconds+plan.total_seconds+egress.seconds,transfers:plan.transfers});}catch(e){errors.push(e.message);}
   const choice=choices.sort(strategy==='time'?byTime:byTransfers)[0];if(choice){let {o,plan}=choice;
    if(strategy==='time'&&service.rawRoute)try{const verified=await service.rawRoute(o.station.id,end.id);if(Math.abs(verified.total_seconds-plan.total_seconds)<1)plan=verified;}catch{}
    const same=fast&&fast.origin_station_id===o.station.id&&JSON.stringify(fast.legs.map(l=>[l.kind,l.line_id,l.from_station_id,l.to_station_id,l.seconds]))===JSON.stringify(plan.legs.map(l=>[l.kind,l.line_id,l.from_station_id,l.to_station_id,l.seconds]));
    if(!same)add(await service.metroResult(engine,{via_id:o.station.id,seconds:o.walk.seconds+plan.total_seconds,access_seconds:o.walk.seconds,metro_seconds:plan.total_seconds},end,egress,[],plan),end);
   }
   }
  }catch(e){errors.push(e.message);}
 }catch(e){errors.push(service.gateLabel(d,gate)+'：'+e.message);}
 if(!candidates.length)return {results:[{origin_id:d.id,total_seconds:null,error:[...new Set(errors)].join('；')||'暂无可用路线'}],complete:false,longest_seconds:null,spread_seconds:null};
 const selected=selectPreferred(candidates,preferences);if(errors.length){selected.preference_warning='部分候选未取得，当前偏好仅在已取得的方案中比较。';selected.gate_errors=[...new Set(errors)];}
 return {results:[selected],complete:true,longest_seconds:selected.total_seconds,spread_seconds:0};
}
