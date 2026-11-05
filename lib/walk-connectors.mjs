// Confirmed walk links supplement provider rail routes without merging platforms.
export function directedConnectors(configured,stations){
 const out=[];
 for(const c of configured??[]){
  if(c.enabled===false)continue;
  if(!stations.has(c.from_station_id)||!stations.has(c.to_station_id))continue;
  if(!Number.isFinite(c.seconds)||c.seconds<=0||c.from_station_id===c.to_station_id)throw Error('Invalid walking connection');
  out.push({...c});
  if(c.bidirectional){const reverse=structuredClone(c);reverse.id=c.id+'-reverse';reverse.from_station_id=c.to_station_id;reverse.to_station_id=c.from_station_id;
   if(reverse.geometry?.parts)reverse.geometry.parts.reverse().forEach(p=>p.coordinates.reverse());out.push(reverse);}
 }
 return out;
}

export function supplementTimes(base,connectors,exits){
 // With one connected pair, a shortest route needs at most one positive walk edge.
 const original=new Map(base.stations.map(s=>[s.station_id,s]));
 const best=new Map(base.stations.map(s=>[s.station_id,{...s}]));
 for(const c of connectors){const before=original.get(c.from_station_id),after=exits.get(c.to_station_id);if(!before||!after)continue;
  for(const row of after.stations){const seconds=before.seconds+c.seconds+row.seconds,previous=best.get(row.station_id);
   if(!previous||seconds<previous.seconds)best.set(row.station_id,{station_id:row.station_id,seconds,walk_connector_id:c.id});}
 }
 return {...base,stations:[...best.values()]};
}

export function connectPlans(from,to,before,connector,after){
 const walk={kind:'walk_transfer',from_station_id:connector.from_station_id,to_station_id:connector.to_station_id,
  station_ids:[connector.from_station_id,connector.to_station_id],seconds:connector.seconds,label:connector.label,
  distance_m:connector.distance_m,geometry:connector.geometry,source:connector.source,note:connector.note,connector_id:connector.id};
 return {from_station_id:from,to_station_id:to,total_seconds:before.total_seconds+connector.seconds+after.total_seconds,
  legs:[...before.legs,walk,...after.legs],transfers:(before.transfers??0)+(after.transfers??0)+(before.legs.some(l=>l.kind==='ride')&&after.legs.some(l=>l.kind==='ride')?1:0),fare:null,
  cross_station_seconds:connector.seconds,warnings:[...(before.warnings??[]),...(after.warnings??[]),connector.note,'含出站步行换乘；票价需按实际支付方式及连续计费规则确认。']};
}
