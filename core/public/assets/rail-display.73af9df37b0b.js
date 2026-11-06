// Display coordinates only. Never merge graph nodes or alter travel/transfer times.
function createRailDisplay(data){
 const splitZoom=14.5,points=new Map(data.points.map(p=>[p.id,p])),positions=new Map();
 const distance=(a,b)=>Math.hypot((a[0]-b[0])*111320*Math.cos((a[1]+b[1])*Math.PI/360),(a[1]-b[1])*111320);
 for(const s of data.segments){if(!s.coordinates?.length)continue;for(const [id,c] of [[s.from,s.coordinates[0]],[s.to,s.coordinates.at(-1)]]){const key=id+'|'+s.line;if(!positions.has(key))positions.set(key,c);}}
 function nodes(p,zoom){
  if(zoom<splitZoom)return [{lat:p.lat,lon:p.lon,lines:p.lines}];
  const groups=[];for(const line of p.lines){const c=positions.get(p.id+'|'+line)??[p.lon,p.lat];let group=groups.find(g=>distance([g.lon,g.lat],c)<12);if(!group){group={lon:c[0],lat:c[1],lines:[]};groups.push(group);}group.lines.push(line);}return groups;
 }
 function coordinates(s,zoom){
  const a=points.get(s.from),b=points.get(s.to),source=s.coordinates?.length>=2?s.coordinates:[[a.lon,a.lat],[b.lon,b.lat]];
  if(zoom>=splitZoom)return source.map(c=>[c[1],c[0]]);
  const length=[0];for(let i=1;i<source.length;i++)length.push(length[i-1]+distance(source[i-1],source[i]));
  const total=length.at(-1),reach=Math.min(400,total/2)||1;
  return source.map((c,i)=>{const start=Math.max(0,1-length[i]/reach),end=Math.max(0,1-(total-length[i])/reach);return [c[1]+start*(a.lat-source[0][1])+end*(b.lat-source.at(-1)[1]),c[0]+start*(a.lon-source[0][0])+end*(b.lon-source.at(-1)[0])];});
 }
 function connections(p,zoom){
  const all=nodes(p,zoom),used=new Set([0]),links=[];
  while(used.size<all.length){let best;for(const a of used)for(let b=0;b<all.length;b++)if(!used.has(b)){const d=distance([all[a].lon,all[a].lat],[all[b].lon,all[b].lat]);if(!best||d<best.distance)best={a,b,distance:d};}links.push([all[best.a],all[best.b]]);used.add(best.b);}return links;
 }
 function transfers(result,zoom){
  if(zoom<splitZoom)return [];
  const out=[],legs=result.legs??[];
  for(let i=0;i<legs.length;i++){
   const leg=legs[i],before=legs[i-1],after=legs[i+1];
   if(leg.kind!=='transfer'||before?.kind!=='ride'||after?.kind!=='ride'||before.line_id===after.line_id||leg.from_station_id!==leg.to_station_id)continue;
   const id=leg.from_station_id,a=positions.get(id+'|'+before.line_id),b=positions.get(id+'|'+after.line_id);
   if(!a||!b||distance(a,b)<12)continue;
   out.push({station_id:id,from_line:before.line_id,to_line:after.line_id,seconds:Number.isFinite(leg.seconds)&&leg.seconds>=0?leg.seconds:null,coordinates:[[a[1],a[0]],[b[1],b[0]]]});
  }return out;
 }
 return {splitZoom,nodes,coordinates,connections,transfers};
}

// Exact segment/rectangle intersection, including lines crossing between vertices.
function railCrossesLabel(a,b,r){
 const left=r.x-4,right=r.x+r.w+4,top=r.y-4,bottom=r.y+r.h+4;
 let lo=0,hi=1;const dx=b.x-a.x,dy=b.y-a.y;
 for(const [p,q] of [[-dx,a.x-left],[dx,right-a.x],[-dy,a.y-top],[dy,bottom-a.y]]){
  if(p===0){if(q<0)return false;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;
 }return true;
}
