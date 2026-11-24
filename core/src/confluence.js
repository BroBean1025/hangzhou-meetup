// A confluence is a directed shared departure reached through different incoming
// branches. Sharing a station alone, or staying together on a trunk, is not a merge.
function rankMeetingCandidates(results,targetIds,{points,byCampus,routeIdentity,completeRoute,MeetUpTime}){
 const departures=new Map(),excluded=new Set(targetIds);
 for(const r of results){
  if(!completeRoute(r))continue;excluded.add(r.destination_station_id);let previous=null;
  for(const leg of r.legs??[]){
   if(leg.kind==='walk_transfer'){previous={to:leg.to_station_id,key:JSON.stringify(['walk',leg.from_station_id,leg.to_station_id])};continue;}
   if(leg.kind!=='ride')continue;
   const ids=leg.station_ids??[];
   for(let i=1;i<ids.length;i++){
    const from=ids[i-1],to=ids[i];if(from===to)continue;
    const key=JSON.stringify([leg.line_id,from,to]),incoming=previous?.to===from?previous.key:'access:'+r.origin_id+':'+from;
    if(!departures.has(key))departures.set(key,{sid:from,next:to,line:leg.line_id,incoming:new Map()});
    departures.get(key).incoming.set(r.origin_id,incoming);previous={to,key};
   }
  }
 }
 const candidates=[];
 for(const departure of departures.values()){
  const {sid,next,line,incoming}=departure;if(incoming.size<2||excluded.has(sid)||!points.has(sid))continue;
  const branches=new Map();for(const [id,edge] of incoming){if(!branches.has(edge))branches.set(edge,[]);branches.get(edge).push(id);}
  if(branches.size<2)continue; // They were already together before this station.
  const incomingGroups=[...branches.values()].map(ids=>ids.sort((a,b)=>routeIdentity(a).number-routeIdentity(b).number)).sort((a,b)=>routeIdentity(a[0]).number-routeIdentity(b[0]).number);
  const members=[...incoming.keys()].sort((a,b)=>routeIdentity(a).number-routeIdentity(b).number).map(id=>{
   const c=byCampus.get(id),result=results.find(r=>r.origin_id===id);
   return {id,seconds:MeetUpTime.prefix(result,{sid,line,next}),gate:result.gate_label??c.gate_label};
  });
  const known=members.every(m=>m.seconds!==null),times=members.map(m=>m.seconds);
  candidates.push({sid,next,line,incomingGroups,members,known,spread:known?Math.max(...times)-Math.min(...times):Infinity,longest:known?Math.max(...times):Infinity});
 }
 return candidates.sort((a,b)=>b.members.length-a.members.length||Number(b.known)-Number(a.known)||a.spread-b.spread||a.longest-b.longest||a.sid.localeCompare(b.sid)).slice(0,3);
}
