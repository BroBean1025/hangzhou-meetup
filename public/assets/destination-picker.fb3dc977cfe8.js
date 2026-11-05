/* Destination selection uses the same verified operating-station catalog as the map. */
(() => {
 const input=$('destination-search'),panel=$('destination-results'),choices=$('destination-choices'),browse=$('destination-browse');
 const sortedLines=[...lines.values()].sort(lineOrder);
 let mode='search',chosenName='';
 const lineText=p=>sortedLines.filter(l=>p.lines.includes(l.id)).map(l=>l.name).join(' / ');
 function sizePanel(){if(panel.hidden)return;const available=innerHeight-panel.getBoundingClientRect().top-12;choices.style.maxHeight=Math.max(48,Math.min(440,available-panel.firstElementChild.offsetHeight-8))+'px';}
 function open(){panel.hidden=false;choices.scrollTop=0;input.setAttribute('aria-expanded','true');browse.setAttribute('aria-expanded',String(mode==='lines'));sizePanel();}
 function close(){panel.hidden=true;input.setAttribute('aria-expanded','false');browse.setAttribute('aria-expanded','false');}
 function stationButton(p){
  const b=document.createElement('button');b.type='button';b.className='destination-station';b.dataset.stationId=p.id;
  b.innerHTML='<span class="destination-station-name">'+esc(p.name)+'</span><span class="destination-station-lines">'+esc(lineText(p))+'</span>';
  b.onclick=()=>{close();input.value=p.name;selectStation(p);requestAnimationFrame(()=>map.panInside([p.lat,p.lon],{paddingTopLeft:[40,40],paddingBottomRight:[40,40],animate:false}));};return b;
 }
 function search(){
  mode='search';const raw=input.value.trim(),results=stationChoices.search(raw);
  choices.replaceChildren();$('destination-results-title').textContent=raw?'找到 '+results.length+' 个地铁站':'输入站名，或按线路展开';
  if(!raw){const hint=document.createElement('p');hint.className='destination-empty';hint.textContent='例如：龙翔桥、武林广场、杭州东。请选择具体站点以查询。';choices.append(hint);}
  else if(!results.length){const hint=document.createElement('p');hint.className='destination-empty';hint.textContent='没有匹配的运营站，试试更短的站名或按线路浏览。';choices.append(hint);}
  else for(const p of results)choices.append(stationButton(p));open();
 }
 // The station list follows adjacent-station links. Branches remain in the same group.
 function lineStations(line){
  const catalog=D.points.filter(p=>p.lines.includes(line.id)),ids=new Set(catalog.map(p=>p.id)),neighbors=new Map(catalog.map(p=>[p.id,new Set()]));
  for(const s of D.segments)if(s.line===line.id&&ids.has(s.from)&&ids.has(s.to)){neighbors.get(s.from).add(s.to);neighbors.get(s.to).add(s.from);}
  const seeds=[...catalog].sort((a,b)=>(neighbors.get(a.id).size===1?0:1)-(neighbors.get(b.id).size===1?0:1)||a.lon-b.lon||a.lat-b.lat),seen=new Set(),order=[];
  function visit(id){if(seen.has(id))return;seen.add(id);order.push(points.get(id));for(const next of neighbors.get(id))visit(next);}
  for(const p of seeds)visit(p.id);return [...new Map(order.map(p=>{const choice=stationChoices.resolve(p.id);return [choice.id,choice];})).values()];
 }
 function showLines(){
  mode='lines';choices.replaceChildren();$('destination-results-title').textContent='按地铁线路选择目的地';
  for(const line of sortedLines){const stations=lineStations(line),group=document.createElement('details');group.className='destination-line';
   const summary=document.createElement('summary');summary.innerHTML='<i style="background:'+esc(line.color)+'"></i><span>'+esc(line.name)+'</span><small>'+stations.length+' 站</small>';group.append(summary);
   const list=document.createElement('div');list.className='destination-line-stations';for(const p of stations)list.append(stationButton(p));group.append(list);choices.append(group);
  }open();
 }
 input.addEventListener('input',search);input.addEventListener('focus',search);
 input.addEventListener('keydown',e=>{if(e.isComposing)return;if(e.key==='ArrowDown'||e.key==='Enter'){if(panel.hidden)search();const first=choices.querySelector('.destination-station');if(first){e.preventDefault();if(e.key==='Enter')first.click();else first.focus();}}});
 choices.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;const buttons=[...choices.querySelectorAll('.destination-station,summary')].filter(b=>b.getClientRects().length),index=buttons.indexOf(document.activeElement),next=index+(e.key==='ArrowDown'?1:-1);if(next>=0&&next<buttons.length){e.preventDefault();buttons[next].focus();}});
 input.closest('.destination-picker').addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();input.value=chosenName;input.focus();close();}});
 window.addEventListener('resize',sizePanel);document.addEventListener('scroll',sizePanel,{passive:true});
 browse.onclick=()=>panel.hidden||mode!=='lines'?showLines():close();$('destination-results-close').onclick=close;
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.destination-picker'))close();});
 $('destination-clear').onclick=()=>$('comparison-close').click();
 window.setDestinationUI=(target)=>{
  close();const ids=target?.stationIds??[],first=stationChoices.resolve(ids[0]),station=first&&ids.every(id=>stationChoices.resolve(id)?.id===first.id)?first:null;chosenName=target?(station?.name??target.name):'';input.value=chosenName;
  $('destination-clear').hidden=!target;$('destination-selection').textContent=station?lineText(station):target?(ids.length?'枢纽地铁站 · 比较可用站台':'地图选点 · 含末段步行'):'也可以直接点地图';
 };
})();
