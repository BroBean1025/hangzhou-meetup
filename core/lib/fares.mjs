import snapshot from '../config/rail-snapshot.json' with {type:'json'};
const index=new Map(snapshot.fares.station_ids.map((id,i)=>[id,i]));
export const fareVerifiedAt=snapshot.verified_at;
export function stationFare(from,to){
 const a=index.get(from),b=index.get(to);if(a===undefined||b===undefined)return null;
 return snapshot.fares.fares[a][b];
}
export function quoteFare(plan,from,to){
 const rides=plan.legs.filter(l=>l.kind==='ride');if(!rides.length)return {fare:0,fare_source:'无需乘坐地铁'};
 const walks=plan.legs.map((l,i)=>l.kind==='walk_transfer'?i:-1).filter(i=>i>=0);
 if(walks.some(i=>plan.legs.slice(0,i).some(l=>l.kind==='ride')&&plan.legs.slice(i+1).some(l=>l.kind==='ride')))return {fare:null,fare_note:'含出站后再次乘车，连续计费及优惠以实际支付规则为准。'};
 // Walking at either end is outside the paid ride, so price the actual rail OD.
 const fare=stationFare(walks.length?rides[0].from_station_id:from,walks.length?rides.at(-1).to_station_id:to);
 return fare===null?{fare:null,fare_note:'当前票价表尚未覆盖此跨区域区间。'}:{fare,fare_source:'内置站间普通单程票价',fare_verified_at:fareVerifiedAt};
}
