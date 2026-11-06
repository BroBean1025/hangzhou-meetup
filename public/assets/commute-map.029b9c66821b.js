'use strict';
const D=JSON.parse(document.getElementById('dataset').textContent),G=JSON.parse(document.getElementById('geography').textContent);
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const minute=s=>s===null||s===undefined?'未知':String(Math.round(s/60));
const stationTime=p=>p.seconds===null?'时间未知':'约 '+minute(p.seconds)+' 分钟';
const points=new Map(D.points.map(p=>[p.id,p])),lines=new Map(D.lines.map(l=>[l.id,l]));
const stationChoices=createStationCatalog(D);
const lineOrder=(a,b)=>(a.id.startsWith('regional-')?1:0)-(b.id.startsWith('regional-')?1:0)||a.name.localeCompare(b.name,'zh-CN',{numeric:true});
const stationLineText=p=>p.lines.map(id=>lines.get(id)).filter(Boolean).sort(lineOrder).map(l=>l.name).join(' / ');
const transferZoom=11.75,localZoom=13.25,gateZoom=14.25;
const campuses=D.campuses.length?D.campuses:[{id:'yuquan',name:D.origin.name,short_name:'浙大玉泉',origin_key:D.origin.gate,gate_options:[{key:D.origin.gate,label:D.origin.gate==='north'?'北门':'东门',lon:D.origin.lon,lat:D.origin.lat}],gate_label:D.origin.gate==='north'?'北门':'东门',lon:D.origin.lon,lat:D.origin.lat,logo:null,times:Object.fromEntries(D.points.map(p=>[p.id,{seconds:p.seconds,via_station:p.via,access_seconds:p.access_seconds,metro_seconds:p.metro_seconds}]))}];
const byCampus=new Map(campuses.map(c=>[c.id,c])),enabled=new Set(campuses.filter(c=>c.default_enabled!==false).map(c=>c.id));
if(!enabled.size)enabled.add(campuses[0].id);
let primary=[...enabled][0],lastTarget=null,lastResults=[],selectorOpen=false;
const schoolExpanded={};
const currentOrigin=()=>byCampus.get(primary);
const modeNames={walk:'步行',bus:'公交',bike:'骑行',taxi:'打车',station:'站内'};
const storageKey='hangzhou-origins-v2';
for(const c of campuses){c.kind='campus';c.descriptor={id:c.id,kind:'campus',gates:[c.origin_key],mode:'walk'};c.times??={};c.ready=Object.keys(c.times).length>0;c.revision=0;c.summaryExpires=c.ready?Date.now()+86400000:0;}
function stationSymbol(p){if(hubIds.has(p.id)){const h=D.hubs.find(h=>h.member_ids.includes(p.id));return trainIcon('#536e65',h.kind==='air');}const name=p.name;let shape=/体育|奥体/.test(name)?'<path d="M10 7h20v8q0 9-10 10Q10 24 10 15ZM20 25v8M13 34h14M10 10H5v5q0 7 9 7M30 10h5v5q0 7-9 7"/>':/湿地|公园|花园/.test(name)?'<path d="M20 5 9 18h6L7 28h11v8h4v-8h11L25 18h6Z"/>':'<rect x="7" y="5" width="26" height="28" rx="8"/><path d="M13 25V13l7 8 7-8v12M11 36l4-4M29 36l-4-4"/>';
 return '<svg viewBox="0 0 40 40" fill="none" stroke="#53766c" stroke-width="2" aria-hidden="true">'+shape+'</svg>';}
function persistOrigins(){try{localStorage.setItem(storageKey,JSON.stringify({origins:campuses.map(c=>c.descriptor),enabled:[...enabled],primary,selector_open:selectorOpen,school_open:schoolExpanded}));}catch{}}

const logoHtml=c=>c.kind==='station'?'<span class="station-origin-symbol">'+stationSymbol(points.get(c.station_id))+'</span>':c.logo?'<img class="school-logo" src="'+c.logo+'" alt="'+esc(c.name)+'校徽">':originSketch;
function campusTime(c,p){return (p.member_ids??[p.id]).map(id=>({id,...c.times[id]})).filter(t=>t.seconds!=null).sort((a,b)=>a.seconds-b.seconds)[0]??{seconds:null}}

const hubIds=new Set(D.hubs.flatMap(h=>h.member_ids));
function makeStation(sid){const p=stationChoices.resolve(sid);sid=p.id;if(byCampus.has('station:'+sid))return byCampus.get('station:'+sid);const c={id:'station:'+sid,station_id:sid,kind:'station',name:p.name.endsWith('站')?p.name:p.name+'站',short_name:p.name,gate_label:p.group_id?'两站区择优':'站内出发',group_id:p.group_id,lon:p.lon,lat:p.lat,times:{},ready:false,revision:0,descriptor:{kind:'station',station_id:sid}};campuses.push(c);byCampus.set(c.id,c);return c;}
try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved){for(const d of saved.origins??[]){if(d.kind==='station'&&points.has(d.station_id)&&!byCampus.has(stationChoices.originId('station:'+d.station_id))){makeStation(d.station_id);}else if(d.kind==='campus'&&byCampus.has(d.id)){const c=byCampus.get(d.id),allowed=new Set(c.gate_options.map(g=>g.key));if(Array.isArray(d.gates)&&d.gates.length&&d.gates.every(g=>allowed.has(g))&&['walk','bus','bike','taxi'].includes(d.mode)){if(JSON.stringify(d)!==JSON.stringify(c.descriptor)){c.descriptor=d;c.ready=false;}}}}const ids=(saved.enabled??[]).map(stationChoices.originId).filter(id=>byCampus.has(id));if(ids.length){enabled.clear();ids.forEach(id=>enabled.add(id));}const savedPrimary=stationChoices.originId(saved.primary);primary=enabled.has(savedPrimary)?savedPrimary:[...enabled][0];selectorOpen=saved.selector_open===true;if(saved.school_open&&typeof saved.school_open==='object')for(const [id,open] of Object.entries(saved.school_open))schoolExpanded[id]=open===true;}}catch{}
let selected=null,requestSeq=0,requestController=null,clickedMarker=null,routeHighlight=null,lastQueryState='idle';
let routeSelectionActive=false,routeFocus=null,usedRouteLines=new Set(),activeRouteEdges=new Map(),routeArrowCount=0,journeyBadgePositions=[];
let accessLayer=null,accessDetail=null,accessLabels=[],accessPreviousView=null;
const accessStyles={walk:{color:'#75654d',dashArray:'1 6',name:'步行'},bike:{color:'#277c68',dashArray:'8 5',name:'骑行'},bus:{color:'#a34c7a',dashArray:'11 5',name:'公交'},taxi:{color:'#5268b2',dashArray:'11 4 2 4',name:'打车'}};
const map=L.map('map',{zoomControl:false,attributionControl:true,zoomSnap:.25,zoomDelta:.75,minZoom:7,maxZoom:17,preferCanvas:true,fadeAnimation:false,zoomAnimation:false}).setView([D.origin.lat,D.origin.lon],11);
map.attributionControl.setPrefix(false);map.attributionControl.addAttribution('地理 © <a href="https://www.openstreetmap.org/copyright">OSM</a> · 地铁 <a href="https://openmetro.dev">OpenMetro</a>');L.control.scale({imperial:false,maxWidth:90}).addTo(map);
// All geographic labels belong to Leaflet's stack: tracks < labels < origins
// < tooltips (650) < popups (700). A sibling outside mapPane would cover popups.
for(const [name,z] of [['terrain',210],['campusAreas',215],['roads',220],['rail',310],['geoLabels',330],['route',380],['access',390],['routeDirections',400],['stations',420],['gates',425],['routeHit',450],['labels',610],['origin',620],['hud',640]]){map.createPane(name);map.getPane(name).style.zIndex=z}
for(const name of ['terrain','campusAreas','roads','rail','geoLabels','route','routeDirections','gates','labels'])map.getPane(name).style.pointerEvents='none';
map.getPane('labels').append($('labels'));
// Caption buttons select a station without also firing an arbitrary map query.
L.DomEvent.disableClickPropagation($('labels'));
// Fixed map controls share the same stack, so a popup can cover them on a
// narrow screen. Native dialogs and the destination picker stay above the map.
const mapHud=document.createElement('div');mapHud.className='map-hud';
for(const el of document.querySelectorAll('.map-canvas > :not(#map)'))mapHud.append(el);
map.getPane('hud').append(mapHud);map.getPane('hud').style.pointerEvents='none';
L.DomEvent.disableClickPropagation(mapHud);L.DomEvent.disableScrollPropagation(mapHud);
const routeHitRenderer=L.svg({pane:'routeHit'}),meetingAnnotationRenderer=L.svg({pane:'origin'});
const roadCoords=G.features.filter(f=>f.properties.kind==='road'&&f.geometry.type==='LineString').map(f=>f.geometry.coordinates);
L.geoJSON({type:'Feature',properties:{},geometry:{type:'MultiLineString',coordinates:roadCoords}},{pane:'roads',interactive:false,smoothFactor:1.5,style:{color:'#b5b5a4',weight:1,opacity:.28}}).addTo(map);
L.geoJSON({type:'FeatureCollection',features:G.features.filter(f=>!['road','campus'].includes(f.properties.kind))},{pane:'terrain',interactive:false,smoothFactor:1.2,style:f=>f.properties.kind==='water'?{color:'#91ada6',weight:.8,opacity:.5,fillColor:'#c6dcd6',fillOpacity:.65}:{color:'#abbc99',weight:.6,opacity:.25,fillColor:'#dce4cb',fillOpacity:.5}}).addTo(map);
// Boundaries are campus areas, independent of whichever gate is used for routing.
// Keep them below roads/rail and let pointer events reach the map for destination queries.
map.getPane('campusAreas').style.pointerEvents='none';
const campusAreaRenderer=L.svg({pane:'campusAreas'}),campusAreas=new Map();
for(const f of G.features.filter(f=>f.properties.kind==='campus'&&byCampus.has(f.properties.campus_id))){
 const id=f.properties.campus_id;
 if(!campusAreas.has(id))campusAreas.set(id,L.featureGroup());
 L.geoJSON(f,{pane:'campusAreas',renderer:campusAreaRenderer,interactive:false,smoothFactor:.35,style:{className:'campus-area campus-area-'+id,color:'#677f5e',weight:1.5,opacity:.8,fillColor:'#bdcfaa',fillOpacity:.55,lineJoin:'round'}}).addTo(campusAreas.get(id));
}
function refreshCampusAreas(){
 for(const [id,area] of campusAreas){
  const on=enabled.has(id)&&byCampus.get(id)?.kind==='campus';
  if(on&&!map.hasLayer(area))area.addTo(map);
  if(!on&&map.hasLayer(area))map.removeLayer(area);
  area.setStyle({color:id===primary?'#536f4d':'#677f5e',weight:id===primary?2:1.5,fillOpacity:id===primary?.65:.5});
 }
}
for(const name of ['西湖','钱塘江']){const f=G.features.find(f=>f.properties.name===name);if(f)L.marker(L.geoJSON(f).getBounds().getCenter(),{pane:'geoLabels',interactive:false,keyboard:false,icon:L.divIcon({className:'geo-label',html:esc(name),iconSize:[80,24],iconAnchor:[40,12]})}).addTo(map)}

// Keep the source line color exactly; offset shared adjacent-station sections in screen pixels.
const railLayers=[],shared=new Map(),railByEdge=new Map();
const railKey=(line,from,to)=>line+'|'+[from,to].sort().join('|');
for(const s of D.segments){const key=[s.from,s.to].sort().join('|');if(!shared.has(key))shared.set(key,[]);shared.get(key).push(s)}
for(const group of shared.values())for(let i=0;i<group.length;i++){
 const s=group[i],a=points.get(s.from),b=points.get(s.to),color=lines.get(s.line)?.color??'#7d8977';
 const hasGeometry=Array.isArray(s.coordinates)&&s.coordinates.length>=2,coordinates=hasGeometry?s.coordinates.map(p=>[p[1],p[0]]):[[a.lat,a.lon],[b.lat,b.lon]];
 const rail=L.polyline(coordinates,{pane:'rail',color,weight:2.5,opacity:.85,interactive:false,lineCap:'round',lineJoin:'round',smoothFactor:.45,dashArray:hasGeometry?null:'5 5'}).addTo(map);
 const r={s,a,b,rail,color,coordinates,hasGeometry,offset:(i-(group.length-1)/2)*3.5};railLayers.push(r);railByEdge.set(railKey(s.line,s.from,s.to),r);
}
function railCoordinates(r){
 if(!r.offset)return r.coordinates;
 const projected=r.coordinates.map(p=>map.latLngToLayerPoint(p)),offset=r.offset*(r.s.from<r.s.to?1:-1);
 return projected.map((p,i)=>{const before=projected[Math.max(0,i-1)],after=projected[Math.min(projected.length-1,i+1)],dx=after.x-before.x,dy=after.y-before.y,length=Math.hypot(dx,dy)||1;return map.layerPointToLatLng(L.point(p.x-dy/length*offset,p.y+dx/length*offset));});
}
function samplePolyline(projected,distance){
 let remaining=distance;
 for(let i=1;i<projected.length;i++){const a=projected[i-1],b=projected[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length===0)continue;if(remaining<=length||i===projected.length-1){const t=Math.max(0,Math.min(1,remaining/length));return {x:a.x+dx*t,y:a.y+dy*t,ux:dx/length,uy:dy/length};}remaining-=length;}
 return null;
}
function renderRails(){
 for(const r of railLayers){r.rail.setLatLngs(railCoordinates(r));r.rail.setStyle({color:routeSelectionActive?'#aeb3ad':r.color,weight:routeSelectionActive?1.7:(map.getZoom()>=localZoom?3:2.3),opacity:routeSelectionActive?.38:(map.getZoom()>=transferZoom?.9:.63)});}
 for(const item of $('legend').children){const used=usedRouteLines.has(item.dataset.line);item.style.opacity=routeSelectionActive&&!used?'.48':'1';item.querySelector('i').style.background=routeSelectionActive&&!used?'#aeb3ad':lines.get(item.dataset.line).color;item.style.fontWeight=routeSelectionActive&&used?'700':'';}
 renderRouteOverlay();
}
for(const line of [...D.lines].sort(lineOrder)){const item=document.createElement('div');item.className='legend-item';item.dataset.line=line.id;item.innerHTML='<i style="background:'+esc(line.color)+'"></i>'+esc(line.name);$('legend').append(item)}

// Keep direction from the provider's ordered ride stations, never from the network edge order.
function routeIdentity(id){
 const index=Math.max(0,campuses.filter(c=>enabled.has(c.id)).findIndex(c=>c.id===id));
 const palette=['#176B9B','#B34E32','#398052','#8954A2','#A17B12','#B04779','#277D80','#5F65B0'];
 return {number:index+1,color:palette[index]??'hsl('+((index*137.508)%360).toFixed(1)+' 48% 38%)'};
}
function routeBadge(id){const identity=routeIdentity(id);return '<span class="route-number" style="--journey-color:'+identity.color+'">'+identity.number+'</span>';}
function completeRoute(r){return !r.preview&&!r.error&&r.total_seconds!=null;}
function collectRouteEdges(results,focus=null){
 const edges=new Map(),usedLines=new Set();
 for(const result of results){if(!completeRoute(result)||(focus&&result.origin_id!==focus))continue;
  for(const leg of result.legs??[]){if(leg.kind!=='ride')continue;const ids=leg.station_ids??[];
   for(let i=1;i<ids.length;i++){const from=ids[i-1],to=ids[i],key=railKey(leg.line_id,from,to);if(from===to||!points.has(from)||!points.has(to)||!railByEdge.has(key))continue;
    if(!edges.has(key))edges.set(key,{key,line:leg.line_id,directions:new Map(),riders:new Map()});
    const edge=edges.get(key);edge.directions.set(from+'>'+to,{from,to});
    // Retain every origin and ordered direction even when several journeys share a line.
    edge.riders.set(result.origin_id,{id:result.origin_id,from,to});usedLines.add(leg.line_id);
   }
  }
 }
 return {edges,usedLines};
}
function offsetJourney(coords,offset){
 if(!offset)return coords;
 const projected=coords.map(p=>map.latLngToLayerPoint(p));
 return projected.map((p,i)=>{const a=projected[Math.max(0,i-1)],b=projected[Math.min(projected.length-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy)||1;return map.layerPointToLatLng(L.point(p.x-dy/n*offset,p.y+dx/n*offset));});
}
// Join only adjacent stations with matching ownership and exact source endpoints.
// No per-edge offsets or synthesized curves: shared tracks converge on real junctions.
function buildJourneyStrokes(edges){
 const groups=new Map();
 for(const edge of edges.values()){
  const rail=railByEdge.get(edge.key);if(!rail?.hasGeometry)continue;
  const ids=[...edge.riders.keys()].sort((a,b)=>routeIdentity(a).number-routeIdentity(b).number),signature=JSON.stringify([edge.line,ids]);
  if(!groups.has(signature))groups.set(signature,{ids,line:edge.line,edges:[]});
  groups.get(signature).edges.push({edge,rail,from:rail.s.from,to:rail.s.to});
 }
 const strokes=[];
 for(const group of groups.values()){
  const adjacency=new Map(),remaining=new Set(group.edges);
  for(const edge of group.edges)for(const id of [edge.from,edge.to]){if(!adjacency.has(id))adjacency.set(id,[]);adjacency.get(id).push(edge);}
  while(remaining.size){
   let start=[...adjacency].find(([,e])=>e.length!==2&&e.some(e=>remaining.has(e)))?.[0]??[...remaining][0].from,node=start;
   const chunks=[],directions=[];let coords=[];
   while(true){
    const item=adjacency.get(node).find(e=>remaining.has(e));if(!item)break;remaining.delete(item);
    const forward=node===item.from,part=forward?item.rail.coordinates:[...item.rail.coordinates].reverse();
    const last=coords.at(-1),first=part[0];
    if(coords.length&&(Math.abs(last[0]-first[0])>1e-7||Math.abs(last[1]-first[1])>1e-7)){chunks.push(coords);coords=[];}
    coords.push(...(coords.length?part.slice(1):part));
    for(const d of item.edge.directions.values())directions.push({coords:d.from===item.from?item.rail.coordinates:[...item.rail.coordinates].reverse(),twoWay:item.edge.directions.size>1});
    node=forward?item.to:item.from;if(adjacency.get(node).length!==2||node===start)break;
   }
   if(coords.length)chunks.push(coords);
   strokes.push({ids:group.ids,id:group.ids[0],line:group.line,chunks,coords:chunks.flat(),directions,color:group.ids.length>1?'#455E61':routeIdentity(group.ids[0]).color,shared:group.ids.length>1});
  }
 }
 return strokes;
}
function renderRouteOverlay(){
 if(routeHighlight){map.removeLayer(routeHighlight);routeHighlight=null;}routeArrowCount=0;journeyBadgePositions=[];
 if(!routeSelectionActive||!activeRouteEdges.size){renderAccessRoutes();renderMeetingMarkers();return;}
 routeHighlight=L.layerGroup().addTo(map);const strokes=buildJourneyStrokes(activeRouteEdges);
 // One halo pass, then one foreground pass, so an adjacent segment never erases a bend.
 for(const stroke of strokes)L.polyline(stroke.chunks,{pane:'route',weight:7.5,color:'#fffaf0',opacity:.95,interactive:false,lineCap:'round',lineJoin:'round',smoothFactor:.2}).addTo(routeHighlight);
 const arrows=[];
 for(const stroke of strokes){
  const label=stroke.ids.map(id=>routeIdentity(id).number+' '+byCampus.get(id).short_name).join('、')+(stroke.shared?' · 共同经过':'')+' · '+lines.get(stroke.line).name;
  L.polyline(stroke.chunks,{pane:'route',weight:stroke.shared?5:4.4,color:stroke.color,opacity:1,lineCap:'round',lineJoin:'round',smoothFactor:.2,interactive:false}).addTo(routeHighlight);
  L.polyline(stroke.chunks,{pane:'routeHit',renderer:routeHitRenderer,weight:12,color:stroke.color,opacity:0,smoothFactor:.2,bubblingMouseEvents:false})
   .bindTooltip(esc(label)).on('click',e=>stroke.shared?openSharedRoute(stroke,e.latlng):showRoute(stroke.id)).addTo(routeHighlight);
  for(const direction of stroke.directions){if(direction.twoWay)continue;
   const pts=direction.coords.map(p=>map.latLngToLayerPoint(p)),length=pts.slice(1).reduce((n,p,i)=>n+p.distanceTo(pts[i]),0);if(length<45)continue;
   for(let distance=length<160?length/2:80;distance<length-15;distance+=180){
    const sample=samplePolyline(pts,distance),{ux,uy}=sample,c=L.point(sample.x,sample.y);
    if(arrows.some(p=>p.distanceTo(c)<70))continue;arrows.push(c);
    const arrow=[L.point(c.x-3.5*ux-2.6*uy,c.y-3.5*uy+2.6*ux),L.point(c.x+3*ux,c.y+3*uy),L.point(c.x-3.5*ux+2.6*uy,c.y-3.5*uy-2.6*ux)].map(p=>map.layerPointToLatLng(p));
    L.polyline(arrow,{pane:'routeDirections',color:stroke.color,weight:4.5,interactive:false,lineJoin:'round',lineCap:'round'}).addTo(routeHighlight);
    L.polyline(arrow,{pane:'routeDirections',color:'#fffdf4',weight:1.8,interactive:false,lineJoin:'round',lineCap:'round'}).addTo(routeHighlight);routeArrowCount++;
   }
  }
 }
 renderJourneyBadges(strokes);renderAccessRoutes();renderMeetingMarkers();
}
function openSharedRoute(stroke,anchor){
 for(const group of [routeHighlight,accessLayer,meetingLayer])group?.eachLayer(layer=>layer.closeTooltip?.());
 const el=document.createElement('div');el.className='shared-route-popup';el.innerHTML='<strong>共同路段 · '+esc(lines.get(stroke.line).name)+'</strong><p>选择一个起点，查看它的完整行程</p>';
 for(const id of stroke.ids){const b=document.createElement('button');b.innerHTML=routeBadge(id)+esc(byCampus.get(id).short_name);b.onclick=()=>{map.closePopup();showRoute(id);};el.append(b);}
 const part=stroke.chunks.reduce((a,b)=>a.length>b.length?a:b);L.popup({maxWidth:260,autoPanPadding:[14,18]}).setLatLng(anchor??part[Math.floor(part.length/2)]).setContent(el).openOn(map);
}
function renderJourneyBadges(strokes){
 const box=$('map').getBoundingClientRect(),size=map.getSize(),occupied=[],shown=new Set();
 for(const el of document.querySelectorAll('#journey-key,.controls,#journey-guide,#status')){if(el.hidden||!el.getClientRects().length)continue;const b=el.getBoundingClientRect();occupied.push({x:b.left-box.left-15,y:b.top-box.top-15,w:b.width+30,h:b.height+30});}
 for(const stroke of [...strokes].sort((a,b)=>Number(b.shared)-Number(a.shared))){
  const signature=stroke.ids.join('|');if(shown.has(signature))continue;
  const width=stroke.shared?Math.min(stroke.ids.length,3)*19+30:24;
  const candidates=stroke.chunks.map(chunk=>{const pts=chunk.map(p=>map.latLngToContainerPoint(p));return {pts,length:pts.slice(1).reduce((n,p,i)=>n+p.distanceTo(pts[i]),0)};}).sort((a,b)=>b.length-a.length);
  let chosen=null;
  for(const candidate of candidates){if(candidate.length<50)continue;for(const fraction of [.5,.3,.7,.15,.85]){
   const sample=samplePolyline(candidate.pts,candidate.length*fraction),p=L.point(sample.x,sample.y);
   if(p.x<width/2+10||p.y<25||p.x>size.x-width/2-10||p.y>size.y-75||occupied.some(b=>p.x+width/2>b.x&&p.x-width/2<b.x+b.w&&p.y+13>b.y&&p.y-13<b.y+b.h))continue;
   if([...points.values()].some(stop=>map.latLngToContainerPoint([stop.lat,stop.lon]).distanceTo(p)<22))continue;
   chosen=p;break;
  }if(chosen)break;}
  if(!chosen)continue;shown.add(signature);occupied.push({x:chosen.x-width/2-12,y:chosen.y-26,w:width+24,h:52});
  const latlng=map.containerPointToLatLng(chosen);latlng.badgeWidth=width;journeyBadgePositions.push(latlng);
  const badges=stroke.ids.slice(0,3).map(routeBadge).join('')+(stroke.ids.length>3?'<small>+'+(stroke.ids.length-3)+'</small>':'');
  L.marker(latlng,{pane:'origin',bubblingMouseEvents:false,title:stroke.ids.map(id=>byCampus.get(id).short_name).join('、')+(stroke.shared?'共同经过':'的路线'),icon:L.divIcon({className:stroke.shared?'journey-bundle-badge':'journey-path-badge',html:'<span data-route-badge="'+esc(signature)+'">'+badges+'</span>',iconSize:[width,24],iconAnchor:[width/2,12]})}).on('click',()=>stroke.shared?openSharedRoute(stroke,latlng):showRoute(stroke.id)).addTo(routeHighlight);
 }
}

let meetingLayer=null,meetingCandidates=[],meetingBadgePositions=[],meetingSelected=null;
// A confluence is a directed shared departure reached through different incoming
// branches. Sharing a station alone, or staying together on a trunk, is not a merge.
function findMeetingCandidates(results,targetIds=[]){
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

function meetingBadges(candidate){
 if(candidate.members.length>3)return candidate.members.slice(0,3).map(m=>routeBadge(m.id)).join('')+'<small>+'+(candidate.members.length-3)+'</small>';
 return candidate.incomingGroups.map(ids=>'<span class="meeting-branch">'+ids.map(routeBadge).join('')+'</span>').join('<span class="meeting-plus">＋</span>');
}
function meetingTrunk(candidate){return '<p class="meeting-trunk">从这里开始同行：'+esc(lines.get(candidate.line)?.name??'地铁')+' → '+esc(points.get(candidate.next)?.name??'下一站')+'</p>';}

function renderMeetings(){
 const panel=$('meeting-panel'),entry=$('meeting-entry');panel.hidden=!routeSelectionActive||enabled.size<2;entry.hidden=panel.hidden;
 meetingCandidates=[];if(panel.hidden){window.refreshTripPlan?.();renderMeetingMarkers();return;}
 const pending=lastResults.length<enabled.size||lastResults.some(r=>r.preview);
 if(!pending)meetingCandidates=findMeetingCandidates(lastResults,lastTarget?.stationIds??[]);
 window.refreshTripPlan?.();
 const ready=meetingCandidates[0];entry.innerHTML=(ready?meetingBadges(ready):'◇')+'<span>途中汇合</span>';entry.title=ready?ready.members.map(m=>byCampus.get(m.id).short_name).join(' + ')+'：查看建议汇合站':'查看不同来路汇入同向共同路段的站点';entry.setAttribute('aria-expanded',String(panel.open));
 $('meeting-count').textContent=pending?'查询中':meetingCandidates.length?' · '+meetingCandidates.length+' 个建议':' · 暂无';
 const failed=lastResults.filter(r=>r.error).length;
 $('meeting-results').innerHTML=meetingCandidates.map((candidate,i)=>{
  const p=points.get(candidate.sid),who=candidate.members.map(m=>byCampus.get(m.id).short_name).join(' ＋ ');
  return '<article class="meeting-card" data-meeting-card="'+i+'"><div class="meeting-title"><span class="meeting-members">'+meetingBadges(candidate)+'</span><strong>'+esc(p.name)+'</strong><small>'+candidate.members.length+'/'+enabled.size+' 起点</small></div><p class="meeting-who">'+esc(who)+'汇合</p>'+meetingTrunk(candidate)+(window.meetingScheduleHTML?.(candidate)??'')+'<div class="meeting-times">'+candidate.members.map(m=>'<span>'+routeBadge(m.id)+esc(byCampus.get(m.id).short_name)+'<small>'+esc(m.gate??'')+'</small>'+(window.meetingMemberTime?.(candidate,m)??'<b>'+(m.seconds===null?'逐站时间未知':minute(m.seconds)+'分')+'</b>')+'</span>').join('')+'</div><p>'+(window.meetingTimingSummary?.(candidate)??'当前路线到站时间估计')+'</p><div class="meeting-actions"><button data-meeting-locate="'+i+'">地图定位</button><button data-meeting-select="'+i+'">设为目的地</button></div></article>';
 }).join('')||(pending?'<p>等待各起点路线完成，再找开始同行的汇合站…</p>':'<p>当前行程没有中途合流点：需要从不同来路到站，随后乘同一线路、同一方向继续。仅交叉或到站后各走各的，不算合流。</p>');
 $('meeting-note').textContent=(failed?'部分起点查询失败，建议只包含成功行程。':'')+'只推荐不同来路开始共用同向区间的站，不重复推荐已同行的下游站；第三人加入可形成新的合流点。按参与人数、到站时间差、最晚到达时间排序。到站时间沿当前行程累计，包含该行程已发生的接驳和换乘；缺少逐站权重时不猜测钟点。设置到达时间后，按每人途中缓冲、每处汇合预留协调出发；请另约具体碰面位置。';
 for(const b of panel.querySelectorAll('[data-meeting-locate]'))b.onclick=()=>locateMeeting(Number(b.dataset.meetingLocate));
 for(const b of panel.querySelectorAll('[data-meeting-select]'))b.onclick=()=>selectStation(points.get(meetingCandidates[Number(b.dataset.meetingSelect)].sid));
 renderMeetingMarkers();
}
function renderMeetingMarkers(){
 if(meetingLayer){map.removeLayer(meetingLayer);meetingLayer=null;}meetingBadgePositions=[];
 if(!routeSelectionActive||!$('meeting-panel').open||accessDetail)return;
 meetingLayer=L.layerGroup().addTo(map);const size=map.getSize(),box=$('map').getBoundingClientRect(),occupied=[];
 for(const el of document.querySelectorAll('#journey-key,.controls,#journey-guide')){const b=el.getBoundingClientRect();if(el.hidden||!el.getClientRects().length)continue;occupied.push({x:b.left-box.left,y:b.top-box.top,w:b.width,h:b.height});}
 for(const c of campuses.filter(c=>enabled.has(c.id))){const p=map.latLngToContainerPoint([(c.displayOrigin??c).lat,(c.displayOrigin??c).lon]);occupied.push({x:p.x-24,y:p.y-24,w:48,h:48});}
 const candidates=meetingCandidates.map((candidate,i)=>({candidate,i})).sort((a,b)=>Number(b.candidate.sid===meetingSelected)-Number(a.candidate.sid===meetingSelected));
 for(const {candidate,i} of candidates){
  const p=points.get(candidate.sid),who=candidate.members.map(m=>byCampus.get(m.id).short_name).join(' + '),width=36+Math.min(candidate.members.length,3)*24;
  const pos=map.latLngToContainerPoint([p.lat,p.lon]);let placement=null;
  for(const [dx,dy] of [[0,0],[0,-35],[0,35],[-width/2-25,0],[width/2+25,0],[0,-62],[0,62]]){
   const rect={x:pos.x+dx-width/2-5,y:pos.y+dy-17,w:width+10,h:34};
   if(rect.x<0||rect.y<0||rect.x+rect.w>size.x||rect.y+rect.h>size.y-80||occupied.some(b=>overlap(rect,b)>0))continue;
   placement={dx,dy,rect};break;
  }
  if(!placement)continue;const {dx,dy,rect}=placement;
  if(map.getZoom()<12.5&&meetingBadgePositions.length)continue;
  const labelPoint=map.containerPointToLatLng(L.point(pos.x+dx,pos.y+dy));occupied.push(rect);meetingBadgePositions.push({lat:labelPoint.lat,lng:labelPoint.lng,badgeWidth:width});
  if(dx||dy)L.polyline([[p.lat,p.lon],labelPoint],{pane:'origin',renderer:meetingAnnotationRenderer,color:'#7a8973',weight:.8,dashArray:'2 3',interactive:false}).addTo(meetingLayer);
  L.circleMarker([p.lat,p.lon],{pane:'origin',renderer:meetingAnnotationRenderer,radius:4,color:'#526e58',weight:1.5,fillColor:'#fffceb',fillOpacity:1,interactive:false}).addTo(meetingLayer);
  L.marker([p.lat,p.lon],{pane:'origin',title:who+'在'+p.name+'汇合',icon:L.divIcon({className:'meeting-map-badge',html:'<span>'+meetingBadges(candidate)+'<b>会</b></span>',iconSize:[width,25],iconAnchor:[width/2-dx,12-dy]})})
   .bindTooltip(esc(p.name+' · '+who+'汇合')).on('click',()=>{const article=$('meeting-results').querySelector('[data-meeting-card="'+i+'"]');article?.scrollIntoView({block:'nearest',behavior:'smooth'});}).addTo(meetingLayer);
 }
 cancelAnimationFrame(labelFrame);labelFrame=requestAnimationFrame(updateLabels);
}
function locateMeeting(index){
 map.closePopup();
 const candidate=meetingCandidates[index],p=points.get(candidate.sid);if(!p)return;meetingSelected=candidate.sid;
 leaveAccessDetail(false);routeFocus=null;syncRouteFocus();map.setView([p.lat,p.lon],14,{animate:false});
 // Offset the geographic station below the map controls, without shifting its marker.
 map.panBy([0,-90],{animate:false});if(innerWidth<=1000)document.querySelector('.map-canvas').scrollIntoView({block:'start',behavior:'auto'});
}

function renderJourneyKey(){
 const key=$('journey-key');key.hidden=!routeSelectionActive;$('journey-guide').hidden=!routeSelectionActive;document.querySelector('.map-canvas').classList.toggle('has-journeys',routeSelectionActive);
 if(!routeSelectionActive)return;
 $('journey-destination').textContent='共同终点 · '+lastTarget.name;
 $('journey-all').setAttribute('aria-pressed',String(!routeFocus));
 $('journey-list').innerHTML=campuses.filter(c=>enabled.has(c.id)).map(c=>{
  const r=lastResults.find(r=>r.origin_id===c.id),ready=r&&completeRoute(r),identity=routeIdentity(c.id);
  return '<button class="journey-chip" data-journey="'+esc(c.id)+'" style="--journey-color:'+identity.color+'" aria-pressed="'+(routeFocus===c.id)+'" '+(!ready?'disabled':'')+'>'+routeBadge(c.id)+'<span>'+esc(c.short_name)+'</span><small>'+(!r||r.preview?'查询中':r.error?'暂无路线':minute(r.total_seconds)+'分')+'</small></button>';
 }).join('');
 for(const b of key.querySelectorAll('[data-journey]'))b.onclick=()=>showRoute(b.dataset.journey);
}
function syncJourneyMarkers(){
 for(const c of campuses){
  const marker=campusMarkers.get(c.id);if(!marker)continue;
  const on=routeSelectionActive&&enabled.has(c.id),identity=routeIdentity(c.id),result=on?lastResults.find(r=>r.origin_id===c.id&&completeRoute(r)):null;
  const gate=c.gate_options?.find(g=>g.key===result?.gate_key);c.displayOrigin=gate??{lat:c.lat,lon:c.lon};marker.setLatLng([c.displayOrigin.lat,c.displayOrigin.lon]);
  marker.setIcon(L.divIcon({className:'origin-icon'+(c.id===primary?' is-primary':'')+(on?' journey-origin':''),html:logoHtml(c)+(on?routeBadge(c.id):''),iconSize:[36,36],iconAnchor:[18,18]}));
  const el=marker.getElement();if(el){el.style.setProperty('--journey-color',identity.color);el.classList.toggle('journey-muted',!!routeFocus&&routeFocus!==c.id);}
  campusLabels.get(c.id)?.classList.toggle('journey-muted',!!routeFocus&&routeFocus!==c.id);
 }
}
function fitJourney(id=null){
 const coords=[];
 for(const r of lastResults){if(!completeRoute(r)||(id&&r.origin_id!==id))continue;
  for(const leg of r.legs??[])if(leg.kind==='ride')for(let i=1;i<(leg.station_ids??[]).length;i++){const rail=railByEdge.get(railKey(leg.line_id,leg.station_ids[i-1],leg.station_ids[i]));if(rail)coords.push(...rail.coordinates);}
  for(const segment of accessSegments(r))for(const part of geometryParts(segment))coords.push(...part.coordinates.map(p=>[p[1],p[0]]));
  if(!coords.length){const c=byCampus.get(r.origin_id);coords.push([c.lat,c.lon]);}
 }
 if(lastTarget)coords.push([lastTarget.latlng.lat,lastTarget.latlng.lng]);
 if(coords.length)map.fitBounds(L.latLngBounds(coords),{paddingTopLeft:[35,Math.min(180,$('journey-key').offsetHeight+30)],paddingBottomRight:[35,135],maxZoom:14,animate:false});
}

function accessSegments(r){return r.mode==='walk'?[{kind:'direct',label:'直接步行',data:r.direct_walk,seconds:r.total_seconds}]:[{kind:'access',label:'到地铁站的接驳',data:r.access_details,seconds:r.access_seconds},...(r.legs??[]).flatMap((leg,index)=>(leg.kind==='walk_transfer'||leg.kind==='transfer'&&leg.geometry?.parts?.length)?[{kind:'transfer-'+index,label:leg.label??'跨站区步行',data:leg,seconds:leg.seconds,from_station_id:leg.from_station_id,to_station_id:leg.to_station_id}]:[]),{kind:'egress',label:'下车后步行',data:r.egress,seconds:r.egress_seconds}];}
function geometryParts(segment){const g=segment.data?.geometry;return g?.crs==='wgs84'?(g.parts??[]).filter(p=>accessStyles[p.mode]&&p.coordinates?.length>=2):[];}
function accessOverview(r){return accessSegments(r).filter(s=>s.seconds>0).map(s=>{const parts=geometryParts(s),mode=s.kind==='access'?(r.access_mode??'walk'):'walk',style=accessStyles[mode]??accessStyles.walk,status=s.data?.geometry?.status;return '<div class="access-summary"><i style="--access-color:'+routeIdentity(r.origin_id).color+'" class="mode-'+mode+'"></i><span>'+esc(s.kind==='access'?style.name+'接驳':s.label)+' '+minute(s.seconds)+' 分钟'+(s.kind.startsWith('transfer-')?'（已计入总时间）':'')+(s.data?.distance_m!=null?' · '+(s.data.distance_m>=1000?(s.data.distance_m/1000).toFixed(1)+' 公里':Math.round(s.data.distance_m)+' 米'):'')+'</span>'+(parts.length?'<button class="show-access" data-access="'+esc(r.origin_id)+'" data-kind="'+s.kind+'">'+(s.kind==='access'?'放大接驳':'查看步行')+'</button>':'')+'</div>'+(!parts.length?'<div class="geometry-note">路径坐标未取得，保留时间结果。</div>':status==='schematic'?'<div class="geometry-note">站区连接示意，非逐转弯导航；请沿到达大厅指引步行。</div>':status==='partial'?'<div class="geometry-note">部分路径坐标缺失，图上仅显示已取得的路段。</div>':'');}).join('');}
function renderAccessRoutes(){
 if(accessLayer){map.removeLayer(accessLayer);accessLayer=null;}for(const item of accessLabels)item.el.remove();accessLabels=[];
 const legend=$('access-legend');legend.replaceChildren();legend.hidden=true;
 if(!routeSelectionActive)return;accessLayer=L.layerGroup().addTo(map);const modes=new Set();
 for(const r of lastResults){if(r.preview||r.error||r.total_seconds==null||(routeFocus&&r.origin_id!==routeFocus))continue;
  for(const segment of accessSegments(r)){const parts=geometryParts(segment);if(!parts.length)continue;
   const tooltip=byCampus.get(r.origin_id).short_name+' · '+segment.label+' · '+minute(segment.seconds)+' 分钟'+(segment.data?.geometry?.status==='schematic'?' · 连接示意':'');
   for(const part of parts){const style={...accessStyles[part.mode],color:routeIdentity(r.origin_id).color},coords=part.coordinates.map(p=>[p[1],p[0]]);modes.add(part.mode);
    L.polyline(coords,{pane:'access',weight:6,color:'#fffaf0',opacity:.88,interactive:false}).addTo(accessLayer);
    L.polyline(coords,{pane:'access',weight:3.4,color:style.color,dashArray:style.dashArray,opacity:1,lineCap:'round',interactive:false}).addTo(accessLayer);
    // The station canvas otherwise intercepts clicks on the lower access pane.
    L.polyline(coords,{pane:'routeHit',renderer:routeHitRenderer,weight:12,opacity:0,bubblingMouseEvents:false}).bindTooltip(esc(tooltip+' · '+part.label)).on('click',()=>showAccess(r.origin_id,segment.kind)).addTo(accessLayer);
   }
   if(accessDetail?.id===r.origin_id&&accessDetail.kind===segment.kind){
    const start=parts[0].coordinates[0],last=parts[parts.length-1].coordinates,end=last[last.length-1];
    const startName=segment.from_station_id?(points.get(segment.from_station_id)?.name??'出站步行'):segment.kind==='egress'?(r.destination_station+' 下车'):byCampus.get(r.origin_id).short_name+' · '+(r.gate_label??'起点');
    const endName=segment.to_station_id?(points.get(segment.to_station_id)?.name??'进入站区'):segment.kind==='access'?(r.origin_station+' 上车'):(lastTarget?.name??'目的地');
    for(const [p,label] of [[start,startName],[end,endName]]){L.circleMarker([p[1],p[0]],{pane:'stations',radius:5,color:'#765c3f',fillColor:'#fff9e8',fillOpacity:1,weight:2,interactive:false}).addTo(accessLayer);const el=document.createElement('div');el.className='access-caption';el.textContent=label;$('labels').append(el);accessLabels.push({lat:p[1],lon:p[0],el});}
    // A few arrows follow the returned road polyline, never a direct gate-to-station line.
    let distance=0;for(const part of parts){const pts=part.coordinates.map(p=>map.latLngToLayerPoint([p[1],p[0]]));for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy);distance+=n;if(n<9||distance<75)continue;distance=0;const ux=dx/n,uy=dy/n,c=L.point((a.x+b.x)/2,(a.y+b.y)/2),arrow=[L.point(c.x-4*ux-3*uy,c.y-4*uy+3*ux),L.point(c.x+4*ux,c.y+4*uy),L.point(c.x-4*ux+3*uy,c.y-4*uy-3*ux)].map(p=>map.layerPointToLatLng(p));L.polyline(arrow,{pane:'routeDirections',color:routeIdentity(r.origin_id).color,weight:2.5,interactive:false}).addTo(accessLayer);}}
   }
  }
 }
 const hasCrossWalk=lastResults.some(r=>!r.preview&&!r.error&&(!routeFocus||routeFocus===r.origin_id)&&r.legs?.some(l=>l.kind==='walk_transfer'));
 if(modes.size){legend.hidden=false;legend.innerHTML='<span>颜色对应起点 · 实线为地铁</span>'+[...modes].map(mode=>'<span data-mode="'+mode+'"><i class="mode-'+mode+'" style="--access-color:'+'#6c765e'+'"></i>'+accessStyles[mode].name+(mode==='walk'?'点线'+(hasCrossWalk?'（含跨站区）':''):'虚线')+'</span>').join('');}
 cancelAnimationFrame(labelFrame);labelFrame=requestAnimationFrame(updateLabels);
}
function leaveAccessDetail(restore=false){if(!accessDetail)return;accessDetail=null;document.querySelector('.map-canvas').classList.remove('is-access-detail');$('access-detail-bar').hidden=true;const previous=accessPreviousView;accessPreviousView=null;if(restore&&previous)map.setView(previous.center,previous.zoom,{animate:false});}
function showAccess(id,kind){const r=lastResults.find(r=>r.origin_id===id&&!r.error&&!r.preview),segment=r&&accessSegments(r).find(s=>s.kind===kind),parts=segment?geometryParts(segment):[];if(!parts.length)return;if(!accessDetail)accessPreviousView={center:map.getCenter(),zoom:map.getZoom()};accessDetail={id,kind};routeFocus=id;document.querySelector('.map-canvas').classList.add('is-access-detail');$('access-detail-title').textContent=byCampus.get(id).short_name+' · '+segment.label;$('access-detail-bar').hidden=false;syncRouteFocus();map.fitBounds(L.latLngBounds(parts.flatMap(p=>p.coordinates.map(c=>[c[1],c[0]]))),{paddingTopLeft:[25,145],paddingBottomRight:[25,140],maxZoom:17,animate:false});updateLabels();if(innerWidth<=1000)document.querySelector('.map-canvas').scrollIntoView({block:'start',behavior:'auto'});}
$('access-detail-back').onclick=()=>{leaveAccessDetail(true);routeFocus=null;syncRouteFocus();updateLabels();};
function syncRouteFocus(){
 if(routeFocus&&!lastResults.some(r=>r.origin_id===routeFocus&&!r.preview&&!r.error&&r.total_seconds!=null))routeFocus=null;
 renderJourneyKey();syncJourneyMarkers();renderMeetings();
 const selection=collectRouteEdges(lastResults,routeFocus);activeRouteEdges=selection.edges;usedRouteLines=selection.usedLines;renderRails();
 for(const article of document.querySelectorAll('.campus-result')){article.classList.toggle('is-route-focused',article.dataset.origin===routeFocus);article.classList.toggle('journey-muted',!!routeFocus&&article.dataset.origin!==routeFocus);}
 for(const b of document.querySelectorAll('.show-route')){const focused=b.dataset.route===routeFocus;b.setAttribute('aria-pressed',String(focused));b.textContent=focused?'恢复全部':'聚焦这条路线';}
}
const transferLayer=L.layerGroup(),localLayer=L.layerGroup(),stationLabels=new Map();
for(const p of D.points){if(hubIds.has(p.id))continue;
 const marker=L.circleMarker([p.lat,p.lon],{pane:'stations',radius:p.is_interchange?5:3.6,weight:p.is_interchange?2:1.2,color:p.is_interchange?'#445448':lines.get(p.lines[0])?.color??'#74816e',fillColor:'#fbf7e8',fillOpacity:1,bubblingMouseEvents:false});
 marker.on('click',()=>selectStation(p));marker.addTo(p.is_interchange?transferLayer:localLayer);
 const caption=document.createElement('button');caption.className='station-caption'+(p.is_interchange?' interchange':'');caption.textContent=p.name;caption.dataset.stationId=p.id;caption.hidden=true;caption.onclick=()=>selectStation(p);$('labels').append(caption);stationLabels.set(p.id,caption);
}
const campusMarkers=new Map(),campusLabels=new Map(),gateDetails=[];
map.getPane('gates').style.pointerEvents='none';
const gateRenderer=L.svg({pane:'gates'});
for(const c of campuses.filter(c=>c.kind==='campus'))for(const g of c.gate_options){
 const el=document.createElement('span');el.className='gate-caption';el.hidden=true;el.dataset.campus=c.id;el.dataset.gate=g.key;el.title=c.name+' · '+g.label;$('labels').append(el);
 const marker=L.circleMarker([g.lat,g.lon],{pane:'gates',renderer:gateRenderer,interactive:false,radius:3,weight:1,color:'#7e8c75',opacity:.75,fillColor:'#faf7ee',fillOpacity:.9,className:'campus-gate campus-gate-'+c.id});
 gateDetails.push({c,g,el,marker});
}
function syncGateDetails(z){
 for(const item of gateDetails){
  const {c,g,el,marker}=item,on=z>=gateZoom&&enabled.has(c.id),chosen=c.descriptor.gates.includes(g.key);
  // The school emblem and its gate subtitle already mark the first departure gate.
  const underEmblem=map.latLngToContainerPoint([c.lat,c.lon]).distanceTo(map.latLngToContainerPoint([g.lat,g.lon]))<23;
  item.visible=on&&!underEmblem;
  if(item.visible&&!map.hasLayer(marker))marker.addTo(map);
  if(!item.visible&&map.hasLayer(marker))map.removeLayer(marker);
  marker.setRadius(chosen?3.5:2.75);marker.setStyle({fillColor:chosen?'#698263':'#faf7ee',color:chosen?'#617b5a':'#8a9582'});
  el.textContent=g.label+(chosen?' · 已选':'');el.classList.toggle('is-selected',chosen);el.hidden=!item.visible;
 }
}
function ensureMarker(c){if(campusMarkers.has(c.id))return;
 const marker=L.marker([c.lat,c.lon],{pane:'origin',title:c.name,icon:L.divIcon({className:'origin-icon',html:logoHtml(c),iconSize:[36,36],iconAnchor:[18,18]})});marker.on('click',()=>routeSelectionActive&&lastResults.some(r=>r.origin_id===c.id&&completeRoute(r))?showRoute(c.id):c.kind==='station'?selectStation(points.get(c.station_id)):queryPoint(L.latLng(c.lat,c.lon),null,c.short_name+' · '+c.gate_label));campusMarkers.set(c.id,marker);
 const label=document.createElement('div');label.className='origin-caption';label.dataset.campus=c.id;label.innerHTML='<span class="name"></span><span class="sub"></span>';$('labels').append(label);campusLabels.set(c.id,label);
}
function campusLabel(c){return c.kind==='campus'?c.name.replace(/^(浙江工业大学|浙江大学|西湖大学)/,''):c.short_name;}
function renderOptions(){
 const panel=$('campus-options'),savedScroll=$('origin-panel').querySelector('.origin-panel-content').scrollTop,groups=new Map();
 for(const c of campuses){const id=c.kind==='station'?'stations':c.school_id??(c.name.startsWith('浙江工业大学')?'zjut':c.name.startsWith('西湖大学')?'westlake':'zju'),name=c.kind==='station'?'地铁站出发点':c.school_name??({'zju':'浙江大学','zjut':'浙江工业大学','westlake':'西湖大学'})[id]??'学校校区';if(!groups.has(id))groups.set(id,{id,name,items:[]});groups.get(id).items.push(c);}
 panel.replaceChildren();for(const group of [...groups.values()].sort((a,b)=>['zju','zjut','westlake','stations'].indexOf(a.id)-['zju','zjut','westlake','stations'].indexOf(b.id))){
 const section=document.createElement('details');section.className='school-group';section.dataset.school=group.id;section.open=schoolExpanded[group.id]===true;
 const count=group.items.filter(c=>enabled.has(c.id)).length,summary=document.createElement('summary');summary.innerHTML='<span class="school-group-logo">'+logoHtml(group.items[0])+'</span><span class="school-group-name">'+esc(group.name)+'</span><small>'+group.items.length+(group.id==='stations'?' 个站点':' 个校区')+' · 已选 '+count+'</small>';
 section.append(summary);const cards=document.createElement('div');cards.className='school-campus-grid';section.append(cards);section.ontoggle=()=>{schoolExpanded[group.id]=section.open;persistOrigins();};panel.append(section);
 for(const c of [...group.items].sort((a,b)=>Number(a.id==='haining')-Number(b.id==='haining'))){
 const on=enabled.has(c.id),mode=c.descriptor.mode??'station';const option=document.createElement('div');option.className='campus-option'+(primary===c.id?' is-primary':'');option.dataset.campus=c.id;
 option.innerHTML='<div class="origin-option-heading"><label class="campus-toggle"><input type="checkbox" '+(on?'checked':'')+' '+(on&&enabled.size===1?'disabled':'')+' aria-label="显示'+esc(c.name)+'"><span>'+esc(campusLabel(c))+'</span></label><label class="primary-toggle"><input type="radio" name="primary" value="'+c.id+'" aria-label="设'+esc(c.short_name)+'为主出发点" '+(primary===c.id?'checked':'')+'>主</label></div>'+(c.kind==='campus'?'<button class="gate-button" aria-label="选择'+esc(campusLabel(c))+'校门">'+esc(c.gate_label)+' ▾</button><div class="access-buttons">'+['walk','bus','bike','taxi'].map(m=>'<button data-mode="'+m+'" aria-pressed="'+(m===mode)+'">'+modeNames[m]+'</button>').join('')+'</div>':'<div class="station-origin-note">'+(c.group_id?'两站区择优':'站内起算')+' <button class="remove-origin" aria-label="移除'+esc(c.name)+'">移除</button></div>')+'<div class="origin-status">'+esc(c.error??(!c.ready?(on?'正在更新到达时间…':'勾选后计算到达时间'):mode==='walk'&&c.access_hint>=1200?'步行接驳约'+minute(c.access_hint)+'分，可切换方式':''))+'</div>';
 option.querySelector('input[type=checkbox]').onchange=e=>{if(e.target.checked)enabled.add(c.id);else {enabled.delete(c.id);c.revision++;c.prepareController?.abort();c.prepareController=null;}if(!enabled.has(primary))primary=[...enabled][0];refreshCampuses();if(enabled.has(c.id)&&!c.ready&&!c.prepareController)prepareOrigin(c);};
 option.querySelector('input[type=radio]').onchange=()=>{primary=c.id;enabled.add(c.id);refreshCampuses();if(!c.ready&&!c.prepareController)prepareOrigin(c);};
 if(c.kind==='campus'){option.querySelector('.gate-button').onclick=()=>openGates(c);for(const b of option.querySelectorAll('[data-mode]'))b.onclick=()=>{if(c.descriptor.mode===b.dataset.mode&&c.ready)return;c.descriptor={...c.descriptor,mode:b.dataset.mode};changeOrigin(c);};}else option.querySelector('.remove-origin').onclick=()=>removeOrigin(c);
 cards.append(option);
 }}$('origin-panel').querySelector('.origin-panel-content').scrollTop=savedScroll;
 const selectedOrigins=campuses.filter(c=>enabled.has(c.id)),names=selectedOrigins.map(c=>c.short_name).join('、');$('origin-selected-count').textContent='已选 '+selectedOrigins.length+' 个出发点';$('origin-summary').textContent=names;$('origin-summary').title=names;$('origin-primary-summary').textContent='主：'+currentOrigin().short_name;
}
$('origin-panel').open=selectorOpen;$('origin-panel').ontoggle=()=>{selectorOpen=$('origin-panel').open;persistOrigins();};
function removeOrigin(c){if(enabled.has(c.id)&&enabled.size===1){enabled.add('yuquan');}enabled.delete(c.id);if(primary===c.id)primary=[...enabled][0];c.revision++;c.prepareController?.abort();map.removeLayer(campusMarkers.get(c.id));campusMarkers.delete(c.id);campusLabels.get(c.id)?.remove();campusLabels.delete(c.id);campuses.splice(campuses.indexOf(c),1);byCampus.delete(c.id);refreshCampuses();}
let editingGate=null;
function openGates(c){editingGate=c;$('gate-picker-title').textContent=campusLabel(c)+' · 选择校门';$('gate-choices').removeAttribute('aria-invalid');$('gate-choices').innerHTML=c.gate_options.map(g=>'<label><input type="checkbox" value="'+g.key+'" '+(c.descriptor.gates.includes(g.key)?'checked':'')+'>'+esc(g.label)+'</label>').join('');$('gate-picker').showModal();}
$('gate-picker-close').onclick=()=>$('gate-picker').close();$('gate-apply').onclick=()=>{const gates=[...$('gate-choices').querySelectorAll('input:checked')].map(e=>e.value);if(!gates.length){$('gate-choices').setAttribute('aria-invalid','true');$('gate-picker-title').textContent='请至少勾选一个校门';return;}editingGate.descriptor={...editingGate.descriptor,gates};$('gate-picker').close();changeOrigin(editingGate);};
function stationSearch(){const results=stationChoices.search($('station-search').value);$('station-results').innerHTML='';for(const p of results){const b=document.createElement('button');const exists=byCampus.has('station:'+p.id);b.disabled=exists;b.innerHTML='<span class="picker-icon">'+stationSymbol(p)+'</span><span>'+esc(p.name)+'<small>'+esc(stationLineText(p))+'</small></span><span>'+(exists?'已添加':'＋')+'</span>';b.onclick=()=>{const c=makeStation(p.id);enabled.add(c.id);$('station-picker').close();changeOrigin(c);};$('station-results').append(b);}if(!$('station-results').children.length)$('station-results').textContent='没有匹配的运营地铁站，请尝试站名关键词。';}
$('add-origin').onclick=()=>{$('station-search').value='';stationSearch();$('station-picker').showModal();$('station-search').focus();};$('station-search').oninput=stationSearch;$('station-picker-close').onclick=()=>$('station-picker').close();
async function postMap(path,body,signal){const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timeout=setTimeout(abort,90000);try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});const data=await response.json();if(!response.ok||data.error)throw Error(data.error??'查询失败');return data;}finally{clearTimeout(timeout);signal?.removeEventListener('abort',abort);}}
async function prepareOrigin(c){const revision=c.revision;c.prepareController?.abort();const controller=new AbortController();c.prepareController=controller;
 try{const data=await postMap('/api/origin',{origin:c.descriptor},controller.signal);if(c.revision!==revision||!byCampus.has(c.id))return;c.times=data.times;c.access_hint=data.access_hint;c.summaryExpires=Date.now()+data.valid_for_seconds*1000;c.error=data.errors?.length?'部分出发位置暂不可用':null;c.ready=true;}
 catch(e){if(c.revision!==revision||!byCampus.has(c.id))return;c.error=e.name==='AbortError'?'更新超时，可重选方式重试':e.message;c.times={};c.ready=false;}
 finally{if(c.revision===revision){c.prepareController=null;refreshCampuses(false);}}
}
function changeOrigin(c){c.revision++;c.prepareController?.abort();c.prepareController=null;c.ready=false;c.error=null;c.times={};c.summaryExpires=0;refreshCampuses(false);if(enabled.has(c.id)){if(lastTarget)queryPoint(lastTarget.latlng,lastTarget.stationIds,lastTarget.name);prepareOrigin(c);}}
const hubLabels=new Map(),hubRows=new Map(),hubMarkers=new Map();
const hubHasOrigin=h=>h.member_ids.some(id=>enabled.has('station:'+id));
for(const p of D.hubs){
 const marker=L.marker([p.lat,p.lon],{title:p.name,icon:L.divIcon({className:'hub-icon',html:trainIcon('#576b58',p.kind==='air'),iconSize:[36,36],iconAnchor:[18,18]})}).addTo(map);marker.on('click',()=>selectStation(p));hubMarkers.set(p.name,marker);
 const caption=document.createElement('button');caption.className='hub-caption';caption.dataset.hub=p.name;caption.innerHTML='<span class="name">'+esc(p.name)+'</span><span class="time">'+stationTime(p)+'</span>';caption.onclick=()=>selectStation(p);$('labels').append(caption);hubLabels.set(p.name,caption);
 const row=document.createElement('button');row.className='hub-row';row.innerHTML='<i class="swatch"></i><span class="row-name">'+esc(p.name)+'</span><span class="row-time">'+(p.seconds===null?'未知':minute(p.seconds)+' 分钟')+'</span>';row.onclick=()=>selectStation(p);$('hub-list').append(row);hubRows.set(p.name,row);
}
function clearQuery(){map.closePopup();requestSeq++;requestController?.abort();requestController=null;leaveAccessDetail(true);if(clickedMarker){map.removeLayer(clickedMarker);clickedMarker=null}routeSelectionActive=false;routeFocus=null;meetingSelected=null;usedRouteLines.clear();activeRouteEdges.clear();renderJourneyKey();syncJourneyMarkers();renderMeetings();renderRails();}
function refreshCampuses(requery=true){
 refreshCampusAreas();
 for(const c of campuses){
  if(c.kind==='campus'){const gates=c.gate_options.filter(g=>c.descriptor.gates.includes(g.key));c.gate_label=gates.length===1?gates[0].label:gates.length+'个校门择优';c.lon=gates[0].lon;c.lat=gates[0].lat;}
  ensureMarker(c);const on=enabled.has(c.id),marker=campusMarkers.get(c.id);marker.setLatLng([c.lat,c.lon]);if(on&&!map.hasLayer(marker))marker.addTo(map);if(!on&&map.hasLayer(marker))map.removeLayer(marker);marker.getElement()?.classList.toggle('is-primary',primary===c.id);campusLabels.get(c.id).hidden=!on;
 }
 renderOptions();const c=currentOrigin();$('map').setAttribute('aria-label','以'+c.name+'为主出发点的杭州地铁到达时间地图');$('primary-name').textContent=c.short_name+' · '+(c.kind==='station'?(c.group_id?'两站区择优':'站内'):c.gate_label+' / '+modeNames[c.descriptor.mode]);$('home').textContent='回到'+c.short_name;
 for(const h of D.hubs){const marker=hubMarkers.get(h.name);if(hubHasOrigin(h)){if(map.hasLayer(marker))map.removeLayer(marker);}else if(!map.hasLayer(marker))marker.addTo(map);const t=c.ready?campusTime(c,h):{seconds:null};hubRows.get(h.name).querySelector('.row-time').textContent=t.seconds==null?(c.error?'暂无':'更新中'):minute(t.seconds)+' 分钟';hubLabels.get(h.name).querySelector('.time').textContent=stationTime(t);}
 persistOrigins();syncJourneyMarkers();renderMeetings();updateLabels();if(requery&&lastTarget)queryPoint(lastTarget.latlng,lastTarget.stationIds,lastTarget.name);
}
function selectStation(p){p=stationChoices.resolve(p.id)??p;selected=p.id;queryPoint(L.latLng(p.lat,p.lon),p.member_ids??[p.id],p.name);}
function routeDescription(r){
 if(r.mode==='walk')return '直接步行至目的地';if(!r.legs?.length)return r.access_seconds?'接驳抵达该站，无需继续乘坐地铁':'已在该站，无需乘坐地铁';
 return esc(r.origin_station)+(r.legs[0].kind==='walk_transfer'?'出发 → ':'上车 → ')+r.legs.filter(l=>l.kind==='ride'||l.kind==='walk_transfer').map(l=>l.kind==='walk_transfer'?'出站步行 '+minute(l.seconds)+' 分钟 → '+esc(points.get(l.to_station_id)?.name??l.station_names?.at(-1)??'另一站区'):esc(l.line_name)+' → '+esc(points.get(l.to_station_id)?.name??r.destination_station)).join('；')+(r.legs.at(-1).kind==='walk_transfer'?'抵达':'下车');
}
function resultCard(r){
 const c=byCampus.get(r.origin_id);let html='<article class="campus-result" style="--journey-color:'+routeIdentity(c.id).color+'" data-origin="'+c.id+'"><div class="result-heading">'+routeBadge(c.id)+logoHtml(c)+'<div><strong>'+esc(c.short_name)+'</strong><small>'+esc(r.gate_label??c.gate_label)+(c.kind==='station'?'':'出发')+'</small></div><span class="result-time">'+(r.total_seconds==null?'未知':minute(r.total_seconds)+'<small>分钟</small>')+'</span></div>';
 if(r.error)return html+'<div class="popup-error">'+esc(r.error)+'</div></article>';
 if(r.preview)return html+'<div class="popup-sub">'+(r.total_seconds==null?'正在查询完整时间和路线…':'已取得站点时间，正在查询路线…')+'</div></article>';
 html+='<div data-departure-for="'+esc(c.id)+'" hidden></div>';
 html+='<button class="journey-endpoints" data-route-heading="'+esc(c.id)+'" aria-label="聚焦'+esc(c.short_name)+'到'+esc(lastTarget?.name??'目的地')+'的路线">'+esc(c.short_name)+' <span>→</span> '+esc(lastTarget?.name??'目的地')+'</button><div class="route-line-tags">'+(r.legs??[]).filter(l=>l.kind==='ride').map(l=>'<span><i style="background:'+esc(lines.get(l.line_id)?.color??'#71816a')+'"></i>'+esc(l.line_name)+'</span>').join('')+'</div><div class="popup-route">'+routeDescription(r)+'</div>';
 html+='<div class="route-meta">'+(r.mode==='metro'?'换乘 '+r.transfers+' 次':'直接步行')+(r.fare!=null?' · 票价约 '+r.fare+' 元':'')+' <button class="show-route" data-route="'+c.id+'">在地图看路线</button></div>';
 html+=accessOverview(r);
 if(r.legs?.some(l=>l.kind==='walk_transfer'))html+='<div class="popup-footnote">跨站区步行采用高德站点参考位置规划；室内通道和出入口以现场指引为准。出站换乘票价以实际计费为准。</div>';
 const crossSeconds=r.cross_station_seconds??r.legs?.filter(l=>l.kind==='walk_transfer').reduce((n,l)=>n+l.seconds,0)??0;
 const parts=r.mode==='walk'?[['直接步行',r.total_seconds]]:[[r.access_mode==='station'?'站内起算':(modeNames[r.access_mode??'walk']+'接驳至地铁'),r.access_seconds],[r.legs?.some(l=>l.line_id?.startsWith('regional-'))?'轨道规划时间':'地铁乘车',r.ride_seconds],...(crossSeconds>0?[['站内换乘步行',r.transfer_seconds-crossSeconds],['跨站区步行',crossSeconds]]:[['换乘步行',r.transfer_seconds]]),['下车后步行',r.egress_seconds]];
 if(r.legs?.some(l=>l.line_id?.startsWith('regional-')))html+='<div class="popup-footnote">跨城段使用高德缓存规划估计（含供应商固定预留），杭州段使用 OpenMetro；均非实时列车时间。</div>';
 html+='<details><summary>时间拆分'+(r.mode==='metro'?'与经过站点':'')+'</summary><div class="popup-breakdown">'+parts.map(([n,v])=>'<span>'+n+'</span><span>'+minute(v)+' 分钟</span>').join('')+'</div>';
 if(r.mode==='metro')html+='<ol class="route-legs">'+r.legs.map(l=>'<li>'+(l.kind==='walk_transfer'?esc(l.label??'跨站区步行')+'：'+(l.station_names??[points.get(l.from_station_id)?.name,points.get(l.to_station_id)?.name]).map(esc).join(' → ')+'，约 '+minute(l.seconds)+' 分钟':l.kind==='transfer'?'在 '+esc(l.station_names[0])+' 换乘，步行约 '+minute(l.seconds)+' 分钟':esc(l.line_name)+'：'+l.station_names.map(esc).join(' → '))+'</li>').join('')+'</ol>';
 if(r.access_details?.instructions?.length)html+='<div class="access-directions"><b>到地铁站的接驳路线</b><ol>'+r.access_details.instructions.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol></div>';html+='</details>';for(const note of r.access_details?.notes??[])html+='<div class="popup-footnote">'+esc(note)+'</div>';if(r.gate_errors?.length)html+='<div class="popup-error">部分校门未取得完整结果</div>';
 if(r.warnings?.some(w=>w.startsWith('部分末段')))html+='<div class="popup-footnote">部分候选路线未取得，当前为已取得完整结果中的推荐。</div>';
 return html+'</article>';
}
function showRoute(id){
 const r=lastResults.find(r=>r.origin_id===id&&!r.preview&&!r.error&&r.total_seconds!=null);if(!r)return;
 leaveAccessDetail(true);
 routeFocus=routeFocus===id?null:id;syncRouteFocus();fitJourney(routeFocus);updateLabels();
 $('status').textContent=routeFocus?'仅显示 '+byCampus.get(id).short_name+' 的路线 · 再点按钮恢复全部':'显示所有已取得的路线 · 箭头指向目的地';
}
function showResults(data){
 const expanded=new Set([...$('comparison-results').querySelectorAll('article details[open]')].map(el=>el.closest('article').dataset.origin));
 const scrollTop=$('comparison').scrollTop,focused=document.activeElement,focusOrigin=focused?.closest('article')?.dataset.origin;
 const focusKind=focused?.matches('.show-route')?'.show-route':focused?.matches('.show-access')?'.show-access[data-kind="'+focused.dataset.kind+'"]':focused?.matches('summary')?'summary':null;
 lastResults=data.results;$('comparison-results').innerHTML=data.results.map(resultCard).join('');
 for(const article of $('comparison-results').querySelectorAll('article')){if(expanded.has(article.dataset.origin)){const details=article.querySelector('details');if(details)details.open=true;}if(focusKind&&focusOrigin===article.dataset.origin)article.querySelector(focusKind)?.focus({preventScroll:true});}
 const summary=data.complete?(data.results.length>1?'最长约 '+minute(data.longest_seconds)+' 分钟 · 相差约 '+minute(data.spread_seconds)+' 分钟':'约 '+minute(data.longest_seconds)+' 分钟到达'):'部分出发点未取得完整时间，请查看各校说明';
 $('comparison-summary').textContent=summary;for(const b of document.querySelectorAll('[data-route-heading]'))b.onclick=()=>showRoute(b.dataset.routeHeading);for(const b of document.querySelectorAll('.show-route'))b.onclick=()=>showRoute(b.dataset.route);for(const b of document.querySelectorAll('.show-access'))b.onclick=()=>showAccess(b.dataset.access,b.dataset.kind);syncRouteFocus();$('comparison').scrollTop=scrollTop;
}
async function queryPoint(latlng,stationIds=null,name='地图选点'){
 clearQuery();lastTarget={latlng,stationIds,name};window.setDestinationUI?.(lastTarget);if(!stationIds)selected=null;lastQueryState='loading';lastResults=[];routeSelectionActive=true;
 clickedMarker=L.marker(latlng,{pane:'origin',interactive:false,keyboard:false,icon:L.divIcon({className:'journey-destination-marker',html:'终',iconSize:[26,26],iconAnchor:[13,13]})}).addTo(map);$('comparison').hidden=false;$('destination-title').textContent=name;
 $('scope-note').textContent=(stationIds?'本次到地铁站为止，进入高铁大厅或航站楼另计。':'包括学校所选方式接驳和下车后步行；地铁站出发点从站内起算。')+'路线如需跨东站两个站区，已计入出站步行时间。';
 const ids=[...enabled],ticket=requestSeq,controller=new AbortController();requestController=controller;
 let completed=0;const outcomes=new Map(),initialView={center:map.getCenter(),zoom:map.getZoom()};
 function progress(){if(ticket!==requestSeq)return;const rows=ids.filter(id=>byCampus.has(id)).map(id=>outcomes.get(id)??{origin_id:id,total_seconds:stationIds&&byCampus.get(id).ready?campusTime(byCampus.get(id),{member_ids:stationIds}).seconds:null,preview:true});const all=completed===ids.length;const valid=rows.filter(r=>r.total_seconds!=null&&!r.preview);showResults({results:rows,complete:all&&valid.length===ids.length,longest_seconds:valid.length?Math.max(...valid.map(r=>r.total_seconds)):null,spread_seconds:valid.length?Math.max(...valid.map(r=>r.total_seconds))-Math.min(...valid.map(r=>r.total_seconds)):null});if(!all)$('comparison-summary').textContent='正在查询 · 已完成 '+completed+' / '+ids.length+' 个出发点';$('status').textContent=all?'已比较 '+ids.length+' 个出发点 · 颜色与编号对应起点 · 点击路线可聚焦':'正在查询各出发点 · 路线逐条显示…';if(all){lastQueryState=valid.length===ids.length?'complete':'partial';if(map.getZoom()===initialView.zoom&&map.getCenter().equals(initialView.center))fitJourney(routeFocus);}}
 progress();updateLabels();if(location.protocol==='file:'){$('comparison-summary').textContent='完整路线及自定义出发点需使用本机在线地图。';lastQueryState='offline';return;}
 let cursor=0;async function worker(){while(cursor<ids.length&&ticket===requestSeq){const id=ids[cursor++],c=byCampus.get(id);if(!c)continue;try{const body={origin:c.descriptor,...(stationIds?{station_ids:stationIds}:{lon:latlng.lng,lat:latlng.lat})};const data=await postMap('/api/query',body,controller.signal);if(ticket!==requestSeq)return;outcomes.set(id,data.results[0]);}catch(e){if(ticket!==requestSeq)return;outcomes.set(id,{origin_id:id,total_seconds:null,error:e.name==='AbortError'?'该出发点查询超时，请重试':e.message});}completed++;progress();}}
 await Promise.all(Array.from({length:Math.min(4,ids.length)},()=>worker()));if(ticket===requestSeq){requestController=null;if(lastQueryState==='partial'){const b=document.createElement('button');b.className='retry';b.textContent='重新查询';b.onclick=()=>queryPoint(latlng,stationIds,name);$('comparison-results').append(b);}}
}
$('comparison-close').onclick=()=>{clearQuery();lastTarget=null;lastResults=[];selected=null;window.setDestinationUI?.(null);$('comparison').hidden=true;lastQueryState='idle';$('status').textContent='搜索地铁站或点击地图，比较到达时间';updateLabels();};
map.on('click',e=>queryPoint(e.latlng));
function level(){return map.getZoom()<transferZoom?0:map.getZoom()<localZoom?1:2}
function homeZoom(){const center=map.project([currentOrigin().lat,currentOrigin().lon],0),size=map.getSize();let dx=0,dy=0;for(const p of [...D.hubs,...campuses.filter(c=>enabled.has(c.id))]){const q=map.project([p.lat,p.lon],0);dx=Math.max(dx,Math.abs(q.x-center.x));dy=Math.max(dy,Math.abs(q.y-center.y))}return Math.max(7,Math.min(11.25,Math.floor(Math.log2(Math.min(Math.max(40,size.x/2-(size.x<=650?35:95))/Math.max(dx,.001),Math.max(70,size.y/2-140)/Math.max(dy,.001)))*4)/4))}
function home(){if(accessDetail){leaveAccessDetail(false);routeFocus=null;syncRouteFocus();}map.setView([currentOrigin().lat,currentOrigin().lon],homeZoom());updateLabels()}
$('home').onclick=home;$('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();
function overlap(a,b){return Math.max(0,Math.min(a.x+a.w+5,b.x+b.w)-Math.max(a.x-5,b.x))*Math.max(0,Math.min(a.y+a.h+4,b.y+b.h)-Math.max(a.y-4,b.y))}
function updateLabels(){
 const size=map.getSize(),z=map.getZoom(),current=level(),scale=Math.max(0,Math.min(1,(z-9)/6));
 // Labels use viewport coordinates; cancel mapPane's pan translation while
 // keeping them in its stacking context, including after resize and auto-pan.
 for(const layer of [$('labels'),mapHud]){L.DomUtil.setPosition(layer,map.containerPointToLayerPoint([0,0]));layer.style.width=size.x+'px';layer.style.height=size.y+'px';}
 syncGateDetails(z);
 $('labels').style.setProperty('--origin-font',(10+4*scale).toFixed(1)+'px');$('labels').style.setProperty('--hub-font',(11+4*scale).toFixed(1)+'px');$('labels').style.setProperty('--station-font',(9+3*scale).toFixed(1)+'px');
 for(const [layer,on] of [[transferLayer,current>=1],[localLayer,current>=2]]){if(on&&!map.hasLayer(layer))layer.addTo(map);if(!on&&map.hasLayer(layer))map.removeLayer(layer)}
 $('mode').textContent=z>=gateZoom?'校门细节 · 点地图查询到达时间':['交通枢纽和出发点 · 放大显示换乘站','换乘站 · 再放大显示普通站','全部地铁站 · 再放大显示校门'][current];
 $('mode').style.bottom=(size.y-$('legend').offsetTop+8)+'px';
 const used=[],connectors=[],mapBox=$('map').getBoundingClientRect();
 for(const el of document.querySelectorAll('.paper-note,.controls,.line-legend,.map-mode,#status,.compass,.leaflet-control,#access-detail-bar,#journey-key,#journey-guide')){if(el.hidden||!el.getClientRects().length)continue;const box=el.getBoundingClientRect(),r={x:box.left-mapBox.left,y:box.top-mapBox.top,w:box.width,h:box.height};if(r.x+r.w>0&&r.y+r.h>0&&r.x<size.x&&r.y<size.y)used.push(r);}
 for(const ll of [...journeyBadgePositions,...meetingBadgePositions]){const p=map.latLngToContainerPoint(ll);used.push({x:p.x-(ll.badgeWidth??30)/2,y:p.y-15,w:ll.badgeWidth??30,h:30});} const icons=[];for(const h of D.hubs.filter(h=>!hubHasOrigin(h))){const p=map.latLngToContainerPoint([h.lat,h.lon]);icons.push({id:'hub:'+h.name,x:p.x-16,y:p.y-16,w:32,h:32});}for(const c of campuses.filter(c=>enabled.has(c.id))){const p=map.latLngToContainerPoint([(c.displayOrigin??c).lat,(c.displayOrigin??c).lon]);icons.push({id:c.id,x:p.x-19,y:p.y-19,w:38,h:38});}
 function place(p,el,key,gap=20,detail=false){const pos=map.latLngToContainerPoint([p.lat,p.lon]);el.hidden=pos.x<5||pos.x>size.x-5||pos.y<5||pos.y>size.y-20;if(el.hidden)return;
  const w=el.offsetWidth,h=el.offsetHeight;let chosen=null;
  for(const ring of detail?[0,7]:[0,14,28,42,60]){const g=gap+ring;for(const [dx,dy] of [[g,-h/2],[-w-g,-h/2],[-w/2,-h-g],[-w/2,g],[g,-h-g],[-w-g,g],[g,g],[-w-g,-h-g]]){const r={x:pos.x+dx,y:pos.y+dy,w,h};if(r.x<3||r.y<3||r.x+w>size.x-3||r.y+h>size.y-25)continue;if([...used,...icons].some(b=>overlap(r,b)>0))continue;chosen=r;break;}if(chosen)break;}
  if(!chosen){el.hidden=true;return;}used.push(chosen);el.style.left=chosen.x+'px';el.style.top=chosen.y+'px';if(!detail)el.setAttribute('aria-pressed',String(selected===p.id));const ex=Math.max(chosen.x,Math.min(chosen.x+w,pos.x)),ey=Math.max(chosen.y,Math.min(chosen.y+h,pos.y));if(!detail&&Math.hypot(ex-pos.x,ey-pos.y)>12)connectors.push('<path d="M'+pos.x.toFixed(1)+' '+pos.y.toFixed(1)+'L'+ex.toFixed(1)+' '+ey.toFixed(1)+'" stroke="#8c9b88" stroke-width=".5" fill="none"/>');
 }
 for(const item of accessLabels)place(item,item.el,'access',12);
 const targetLabel=$('target-caption');targetLabel.hidden=!lastTarget||!!accessDetail;if(lastTarget&&!accessDetail){targetLabel.textContent='共同终点 · '+lastTarget.name;place({lat:lastTarget.latlng.lat,lon:lastTarget.latlng.lng},targetLabel,'destination',14);}
 for(const c of [...campuses].sort((a,b)=>Number(b.id===primary)-Number(a.id===primary))){const label=campusLabels.get(c.id);label.hidden=!enabled.has(c.id)||accessDetail?.id===c.id;if(label.hidden)continue;label.querySelector('.name').innerHTML=(routeSelectionActive?routeBadge(c.id):'')+esc(z<13?c.short_name:c.name);const routeGate=routeSelectionActive?lastResults.find(r=>r.origin_id===c.id&&completeRoute(r))?.gate_label:null;label.querySelector('.sub').textContent=(routeGate??(c.kind==='station'?(c.group_id?'两站区择优':'站内'):z>=gateZoom?(c.gate_options.find(g=>c.descriptor.gates.includes(g.key))?.label??c.gate_label)+' · 已选':c.gate_label))+(c.id===primary?' · 主':'');label.querySelector('.sub').hidden=z<11;place(c.displayOrigin??c,label,c.id,22);}
 const detailedResult=accessDetail&&lastResults.find(r=>r.origin_id===accessDetail.id),detailSegment=detailedResult&&accessSegments(detailedResult).find(s=>s.kind===accessDetail.kind),detailStation=detailSegment?.to_station_id??(accessDetail?.kind==='access'?detailedResult?.origin_station_id:accessDetail?.kind==='egress'?detailedResult?.destination_station_id:null);
 for(const h of D.hubs){const el=hubLabels.get(h.name);el.querySelector('.time').hidden=z<11;if(hubHasOrigin(h)||(selected&&h.member_ids.includes(selected))||(detailStation&&h.member_ids.includes(detailStation)))el.hidden=true;else place(h,el,'hub:'+h.name,21);hubRows.get(h.name).setAttribute('aria-pressed',String(selected===h.id));}
 for(const p of [...D.points].filter(p=>!hubIds.has(p.id)).sort((a,b)=>Number(b.is_interchange)-Number(a.is_interchange))){const el=stationLabels.get(p.id);if(current===0||(current===1&&!p.is_interchange)||enabled.has('station:'+p.id)||p.id===selected||p.id===detailStation){el.hidden=true;continue;}place(p,el,p.id,7);}
 for(const {g,el,visible} of gateDetails){if(visible)place(g,el,'gate:'+g.key,6,true);}
 $('label-lines').innerHTML=connectors.join('');
}
let labelFrame;function scheduleLabels(){clearTimeout(labelFrame);labelFrame=setTimeout(updateLabels,16);}
map.on('move zoom resize',scheduleLabels);map.on('zoomend',renderRails);map.on('moveend',renderRouteOverlay);
const overlayObserver=new ResizeObserver(scheduleLabels);for(const el of document.querySelectorAll('.paper-note,.controls,.line-legend,#status'))overlayObserver.observe(el);
function resizeMapPreservingView(){
 map.closePopup();
 const center=map.getCenter(),zoom=map.getZoom();
 // Leaflet must move its pane when the viewport changes to keep geography fixed.
 map.invalidateSize({pan:true,animate:false});map.setView(center,zoom,{animate:false});
 updateLabels();renderRails();
}
// A timer also runs while a desktop window is hidden or between Chromium zoom frames.
let resizePending;function scheduleMapResize(){clearTimeout(resizePending);resizePending=setTimeout(resizeMapPreservingView,50);}
new ResizeObserver(scheduleMapResize).observe($('map'));
window.addEventListener('resize',scheduleMapResize);
$('journey-all').onclick=()=>{leaveAccessDetail(true);routeFocus=null;syncRouteFocus();fitJourney();updateLabels();};
for(const text of [
 '查询路线用起点编号与颜色区分，查询时底层地铁网统一灰显，官方线路颜色仅保留在卡片线路标签中；清除目的地后恢复彩色地铁网。共同路段合并成一条并标出参与起点编号；沿原始轨迹衔接，不生成额外的偏移轨道或人工连接。点击起点、路线、图例或结果卡可聚焦完整行程；点总览恢复全部。接驳沿用起点颜色，点线为步行，其他虚线为相应接驳方式。',
 '可添加任意数量的具体运营地铁站出发点；自定义站点从站内起算。学校可多选校门，并选择步行、公交、骑行或打车接驳。勾选出发点参与比较；主出发点只决定枢纽时间和回中位置。学校从所选校门出发，自定义地铁站从站内起算，方向均为出发点到目的地。'+campuses.map(c=>c.name+'：'+c.gate_label).join('；')+'。',
 '时间取整数分钟。站点和左侧枢纽时间包括校门至上车站步行、地铁乘车及换乘；终点是地铁站。任意地图选点另加下车后至选点的高德步行。3公里内也比较直接步行。',
 '缩小时只显示五个交通枢纽；中等缩放显示换乘站及名称，继续放大显示普通站及名称。杭州线路颜色使用OpenMetro字段；杭海、绍兴线路采用高德线路颜色。共线区段做少量视觉平移。',
 (D.segments.every(s=>s.coordinates?.length>=2)?'地铁线沿已取得的轨迹折线绘制，地图缩放时保持轨迹形状；共线部分只做少量屏幕偏移，箭头沿实际乘车方向。':'部分区间尚无轨迹坐标，仅以相邻站连线表示，不能作为精确轨道位置。')+'杭州东作为起终点时合并 1/4/6/19 号线择优，路线注明实际站区。途中需要跨站区时，单独计入出站步行，并以点线显示高德返回的步行路径；室内通道和出入口以现场指引为准。',
 '杭州地铁数据同步：'+D.synced_at+'；跨城补充数据：'+(D.regional_data_at??'未接入')+'。均为静态规划；不判断首末班及实时等待，进出站及安检另计。',
 '线路轨迹：'+(D.track_source??'当前快照未提供')+(D.track_coverage?'；已匹配 '+D.track_coverage.matched_edges+' / '+D.track_coverage.expected_edges+' 个运营区间。':'。')+(D.track_note??'')+'换乘站统一标记与各线站台位置可能不同。杭州时间与站序来自 OpenMetro；新增跨城段为高德缓存补充。地图底图来源另列。',
 '底图：OpenStreetMap真实水域、主干路、林地和校区轮廓，快照 '+G.metadata.queried_at+'，ODbL-1.0。地铁GCJ02坐标近似转换至WGS84。',
 '校区区域随勾选显示，主出发校区边界略加深；切换校门不改变校区范围。边界来源 OpenStreetMap，快照 '+(G.metadata.campus_boundaries_at??G.metadata.queried_at)+'；用于地图定位，不代表校门开放范围。',
 '打车按驾车行驶时间估算，不含等车；骑行不含取还车。公交使用提供方方案总时间，班次与预约提示见结果。接驳失败会明确报错，不会静默回退为步行或直线距离估算。',
 '底图与站点时间已内嵌。任意选点需要本机查询服务和网络；高德Key仅保存在本机服务环境中，不进入页面。',...D.warnings.filter(w=>!w.includes('可达站点'))]){const p=document.createElement('p');p.textContent=text;$('notes').append(p)}
if(D.regional_timing_note){const p=document.createElement('p');p.textContent=D.regional_timing_note;$('notes').append(p);}
for(const c of campuses){if(c.note){const p=document.createElement('p');p.textContent=c.name+'：'+c.note;$('notes').append(p);}}
const sources=document.createElement('p');sources.innerHTML='<a href="https://openmetro.dev" target="_blank" rel="noopener">OpenMetro 时间与站序</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap 底图 / ODbL</a> · <a href="https://lbs.amap.com/api/webservice/guide/api/bus-inquiry" target="_blank" rel="noopener">高德线路轨迹</a> · <a href="https://lbs.amap.com/api/webservice/guide/api/direction" target="_blank" rel="noopener">高德步行规划</a>';$('notes').append(sources);
$('about').onclick=()=>$('information').showModal();$('info-close').onclick=()=>$('information').close();

$('meeting-entry').onclick=()=>{const panel=$('meeting-panel');panel.open=!panel.open;renderMeetings();if(panel.open)panel.scrollIntoView({block:'nearest',behavior:'smooth'});};
$('meeting-panel').ontoggle=()=>{$('meeting-entry').setAttribute('aria-expanded',String($('meeting-panel').open));renderMeetingMarkers();};
function prepareEnabledOrigins(){if(location.protocol==='file:')return;for(const c of campuses)if(enabled.has(c.id)&&!c.prepareController)prepareOrigin(c);}
refreshCampuses(false);home();renderRails();prepareEnabledOrigins();
window.yuquanMapState=()=>({center:map.getCenter(),origin:D.origin,centerOffsetPixels:map.latLngToContainerPoint([currentOrigin().lat,currentOrigin().lon]).distanceTo(map.getSize().divideBy(2)),zoom:map.getZoom(),level:level(),transferVisible:map.hasLayer(transferLayer),localVisible:map.hasLayer(localLayer),visibleStationLabels:[...stationLabels].filter(([,e])=>!e.hidden).map(([id])=>id),hubNames:D.hubs.map(h=>h.name),railColors:[...new Set(railLayers.map(r=>r.rail.options.color))],routeSelectionActive,routeFocus,usedRouteLines:[...usedRouteLines],highlightedRouteEdges:[...activeRouteEdges.values()].map(e=>({line:e.line,directions:[...e.directions.values()]})),routeArrowCount,lastQueryState,primary,enabled:[...enabled],origins:campuses.map(c=>({id:c.id,ready:c.ready,descriptor:c.descriptor,error:c.error})),visibleCampuses:[...campusMarkers].filter(([,m])=>map.hasLayer(m)).map(([id])=>id),resultOrigins:lastResults.map(r=>r.origin_id)});

setInterval(()=>{for(const c of campuses)if(enabled.has(c.id)&&c.ready&&!c.prepareController&&Date.now()>c.summaryExpires){c.ready=false;prepareOrigin(c);}},30000);
