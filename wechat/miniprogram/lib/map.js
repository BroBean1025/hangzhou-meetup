const data = require('../generated/network');
const catalog = require('../generated/station-catalog')(data);
const rail = require('../generated/rail-display')(data);
const {wgsToGcj,gcjToWgs} = require('../generated/coordinates');
const {MeetUpTime} = require('../generated/trip-time');
const rankMeetings = require('../generated/confluence');
const points = new Map(data.points.map(p => [p.id,p]));
const lines = new Map(data.lines.map(l => [l.id,l]));
const hubAt = new Map(data.hubs.flatMap(h => h.member_ids.map(id => [id,h])));
const colors = ['#386991','#a55235','#507948','#805a99','#977922','#396e70','#994863'];
const modes = {walk:'步行',bike:'骑行',bus:'公交',taxi:'打车',station:'站内'};
const minutes = n => Number.isFinite(n) ? Math.ceil(n/60)+' 分钟' : '未知';
const valid = r => !r.error && !r.preview && Number.isFinite(r.total_seconds);
const lineText = p => p.lines.map(id => lines.get(id)?.name || id).join(' / ');
function gcj(lon,lat) {
  const [x,y] = wgsToGcj(lon,lat);
  return {longitude:+x.toFixed(6),latitude:+y.toFixed(6)};
}
function position(p) {return gcj(p.lon,p.lat);}
function iconFor(p) {
  return '/icons/'+(hubAt.get(p.id)?.kind || (/公园|湿地/.test(p.name)?'park':/体育|奥体/.test(p.name)?'sport':p.is_interchange?'transfer':'station'))+'.png';
}
function names(results,ids) {
  return ids.map(id => String(results.findIndex(r=>r.origin_id===id)+1)).join('＋');
}
function meetings(results,origins,target) {
  const byCampus = new Map(origins.map(o=>[o.id,o]));
  return rankMeetings(results,target?.ids || [],{points,byCampus,MeetUpTime,completeRoute:valid,
    routeIdentity:id=>({number:results.findIndex(r=>r.origin_id===id)+1})});
}
const edgeKey = (line,a,b) => line+'|'+(a<b?a+'|'+b:b+'|'+a);
const tracks = new Map(data.segments.map(s=>[edgeKey(s.line,s.from,s.to),s]));
const trackCache = new Map();
function trackPoints(s,scale) {
  const key = edgeKey(s.line,s.from,s.to)+(scale>=rail.splitZoom?'H':'L');
  if (!trackCache.has(key)) trackCache.set(key,rail.coordinates(s,scale).map(([y,x])=>gcj(x,y)));
  return trackCache.get(key);
}
function geometry(data) {
  return (data?.geometry?.parts || []).filter(p=>p.coordinates.length>=2).map(p=>p.coordinates.map(([x,y])=>gcj(x,y)));
}
function accessPaths(r) {
  const items = r.mode==='walk'?[['直接步行',r.direct_walk,r.total_seconds]]:[
    [modes[r.access_mode]+'接驳',r.access_details,r.access_seconds],
    ...(r.legs || []).filter(l=>l.kind==='walk_transfer'||l.kind==='transfer'&&l.geometry).map(l=>[l.label||'换乘步行',l,l.seconds]),
    ['下车后步行',r.egress,r.egress_seconds]];
  return items.filter(([,v,sec])=>v && sec>0).map(([label,v,sec])=>({
    label, time:minutes(sec), paths:geometry(v), instructions:v.instructions || [],
    partial:v.geometry?.status==='partial'
  }));
}
// Continue along a trace only while direction, origin membership and line agree.
function journeyLines(results,focus,scale) {
  const edges=new Map(), strokes=[], links=[];
  for(const [i,r] of results.entries()) {
    if (!valid(r) || focus && r.origin_id!==focus) continue;
    const color=colors[i%colors.length];
    for(const leg of r.legs || []) {
      if(leg.kind!=='ride') continue;
      const ids=leg.station_ids || [];
      for(let j=1;j<ids.length;j++) {
        const a=ids[j-1], b=ids[j], key=leg.line_id+'|'+a+'|'+b;
        const track=tracks.get(edgeKey(leg.line_id,a,b));
        if(!track) continue;
        if(!edges.has(key)) edges.set(key,{a,b,track,line:leg.line_id,members:new Set()});
        edges.get(key).members.add(i);
      }
    }
    const walks=accessPaths(r).flatMap(p=>p.paths);
    for(const t of rail.transfers(r,scale))walks.push(t.coordinates.map(([y,x])=>gcj(x,y)));
    for(const path of walks) links.push({points:path,color,width:4,dottedLine:true});
  }
  const groups=new Map();
  for(const edge of edges.values()) {
    const key=edge.line+'|'+[...edge.members].join(',');
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(edge);
  }
  for(const group of groups.values()) {
    const next=new Map(),prev=new Map(),used=new Set();
    for(const e of group) {
      if(!next.has(e.a))next.set(e.a,[]);next.get(e.a).push(e);
      if(!prev.has(e.b))prev.set(e.b,[]);prev.get(e.b).push(e);
    }
    const first=group.filter(e=>prev.get(e.a)?.length!==1||next.get(e.a)?.length!==1);
    for(const start of [...first,...group]) {
      if(used.has(start))continue;
      const path=[];let e=start;
      while(e&&!used.has(e)) {
        used.add(e);
        const pts=trackPoints(e.track,scale);
        const directed=e.a===e.track.from?pts:pts.slice().reverse();
        path.push(...(path.length?directed.slice(1):directed));
        const out=next.get(e.b);
        e=out?.length===1 && prev.get(e.b)?.length===1 ? out[0] : null;
      }
      const members=[...start.members], shared=members.length>1;
      strokes.push({members,points:path,color:shared?'#465c57':colors[members[0]%colors.length],width:shared?6:5,arrowLine:true,borderColor:'#fffdf3',borderWidth:1});
    }
  }
  return [...strokes,...links];
}
function contains(region,coord) {
  if(!region)return true;
  return coord.longitude>=region.southwest.longitude&&coord.longitude<=region.northeast.longitude&&coord.latitude>=region.southwest.latitude&&coord.latitude<=region.northeast.latitude;
}
function layers({origins,results,candidates,target,focus,scale,region,markersOnly=false,journeys}) {
  const markers=[],actions=new Map(),polygons=[];
  function mark(coord,icon,size,label,action,always=false) {
    if(!contains(region,coord))return;
    const id=markers.length+1;
    const marker={...coord,id,iconPath:icon,width:size,height:size,anchor:{x:.5,y:.5},title:label};
    if(label)marker.callout={content:label,display:always?'ALWAYS':'BYCLICK',fontSize:scale<12?10:11,borderRadius:4,padding:3,bgColor:'#fffdf4',color:'#31463d'};
    markers.push(marker);actions.set(id,action);
  }
  const usedOrigin=new Set(origins.map(o=>o.station_id).filter(Boolean));
  for(const p of data.points) {
    const hub=hubAt.get(p.id);
    if(usedOrigin.has(p.id)||target?.ids?.includes(p.id)||candidates.some(c=>c.sid===p.id))continue;
    if(hub && p.id!==hub.id && scale<15)continue;
    if(!hub && !(scale>=14 || scale>=12 && p.is_interchange))continue;
    const nodes=rail.nodes(p,scale);
    for(const [index,n] of nodes.entries())mark(position(n),iconFor(p),hub?19:p.is_interchange?12:8,hub?.name||p.name,{station:p.id},index===0);
  }
  const polyline=markersOnly?[]:data.segments.map(s=>({points:trackPoints(s,scale),color:target?'#aeb9b580':lines.get(s.line)?.color||'#67766c',width:target?1:2}));
  if(!markersOnly && scale>=rail.splitZoom)for(const p of data.points.filter(p=>p.is_interchange)){
    for(const pair of rail.connections(p,scale))polyline.push({points:pair.map(position),color:'#707e7590',width:2,dottedLine:true});
  }
  journeys=journeys || journeyLines(results,focus,scale);
  if(!markersOnly)for(const {members,...stroke} of journeys)polyline.push(stroke);
  const marked=new Set();
  for(const stroke of journeys) {
    if(!stroke.members || focus)continue;
    const group=stroke.members.map(i=>i+1).join('＋');
    if(marked.has(group))continue;
    const coords=stroke.points.filter(p=>contains(region,p));
    if(coords.length<2)continue;
    marked.add(group);
    const label=(stroke.members.length>1?'同行 ':'路线 ')+group;
    mark(coords[Math.floor(coords.length/2)],'/icons/station.png',9,label,{routes:stroke.members},true);
  }
  for(const [i,o] of origins.entries()) {
    const p=results.find(r=>r.origin_id===o.id)?.origin_location ||
      (o.station_id?points.get(o.station_id):o.gates.find(g=>o.selected?.includes(g.key))||o);
    mark(position(p),o.icon||iconFor(p),24,(i+1)+' '+o.short_name,{origin:o.id},true);
    if(!markersOnly)for(const ring of data.boundaries[o.id] || [])polygons.push({points:ring.map(([x,y])=>gcj(x,y)),strokeColor:'#617969',fillColor:'#7e9e7629',strokeWidth:1});
    if(scale>=15)for(const g of o.gates || [])mark(position(g),'/icons/gate.png',9,g.label,{gate:g},true);
  }
  for(const c of candidates)mark(position(points.get(c.sid)),'/icons/meet.png',21,'汇合 '+names(results,c.members.map(m=>m.id)),{meeting:c.sid},true);
  if(target)mark(target.coord,'/icons/target.png',25,'终 · '+target.name,{target:true},true);
  // Keep priority labels visible first; nearby secondary labels open on tap.
  const priority=m=>{const a=actions.get(m.id);return a.target?6:a.meeting?5:a.origin?4:a.routes?3:hubAt.has(a.station)?2:1;};
  const occupied=[],world=256*Math.pow(2,scale)/360;
  for(const m of [...markers].sort((a,b)=>priority(b)-priority(a))){
    if(m.callout?.display!=='ALWAYS')continue;
    const x=m.longitude*world,y=m.latitude*world/Math.cos(m.latitude*Math.PI/180),w=m.title.length*5.8+9;
    if(occupied.some(b=>Math.abs(b.x-x)<w+b.w && Math.abs(b.y-y)<24))m.callout.display='BYCLICK';
    else occupied.push({x,y,w});
  }
  return {markers,polyline,polygons,actions,journeys};
}
module.exports={data,catalog,points,lines,colors,modes,valid,minutes,lineText,position,gcjToWgs,meetings,accessPaths,layers,MeetUpTime,iconFor};
