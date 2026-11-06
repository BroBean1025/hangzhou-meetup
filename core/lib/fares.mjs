import snapshot from '../config/rail-snapshot.json' with {type:'json'};
import regional from '../config/regional-fares.json' with {type:'json'};
const index=new Map(snapshot.fares.station_ids.map((id,i)=>[id,i]));
const groups=regional.groups.map(g=>({...g,index:new Map(g.station_ids.map((id,i)=>[id,i]))}));
const membership=new Map(groups.flatMap(g=>g.station_ids.filter(id=>id!==g.boundary).map(id=>[id,g])));
export const fareStationIds=[...new Set([...index.keys(),...membership.keys()])];
export const fareVerifiedAt=regional.verified_at;
function local(g,a,b){return a===b?0:g.fares[g.index.get(a)]?.[g.index.get(b)]??null;}
function hangzhou(a,b){return a===b&&index.has(a)?0:snapshot.fares.fares[index.get(a)]?.[index.get(b)]??null;}
export function stationFare(from,to){
 const a=membership.get(from),b=membership.get(to);
 if(a&&a===b)return local(a,from,to);
 const middle=hangzhou(a?.boundary??from,b?.boundary??to);if(middle===null)return null;
 return middle+(a?local(a,from,a.boundary):0)+(b?local(b,b.boundary,to):0);
}
const east=new Set(['cn-hangzhou-east-railway-station','cn-hangzhou-east-railway-station-east-square']);
export function quoteFare(plan){
 const rides=plan.legs.filter(l=>l.kind==='ride');if(!rides.length)return {fare:0,fare_source:'无需乘坐地铁'};
 // Only actual rail travel is billed. Walking at either end is outside the paid journey.
 const from=rides[0].from_station_id,to=rides.at(-1).to_station_id,blocks=[];let block=null;const crossings=[];
 for(let i=0;i<plan.legs.length;i++){
  const leg=plan.legs[i];
  if(leg.kind==='ride'){if(!block)block={from:leg.from_station_id,to:leg.to_station_id};else block.to=leg.to_station_id;}
  if(leg.kind==='walk_transfer'&&block&&plan.legs.slice(i+1).some(l=>l.kind==='ride')){blocks.push(block);block=null;crossings.push(leg);}
 }
 if(block)blocks.push(block);
 const separatePrices=blocks.map(b=>stationFare(b.from,b.to)),separate=separatePrices.includes(null)?null:separatePrices.reduce((a,b)=>a+b,0);
 const through=stationFare(from,to),knownVirtual=crossings.length>0&&crossings.every(l=>east.has(l.from_station_id)&&east.has(l.to_station_id)&&l.from_station_id!==l.to_station_id&&Number.isFinite(l.seconds)&&l.seconds<=1800);
 const fare=crossings.length&&!knownVirtual?separate:through;
 const result={fare,fare_source:'内置站间普通票价 · 跨区域分段相加',fare_verified_at:fareVerifiedAt};
 if(knownVirtual){result.fare_separate=separate;result.fare_condition='same_payment_within_30_minutes';result.fare_note='杭州东跨站区：同一交通卡、银联卡或同一账户乘车码，出闸后 30 分钟内进另一站区，按连续计费约 '+fare+' 元；实体单程票或超时分开计费约 '+separate+' 元。';}
 else if(crossings.length)result.fare_note='含出站后再次乘车，按各次进出站分开计费。';
 if(fare===null)result.fare_note='该站尚未收入当前票价数据。';
 return result;
}
