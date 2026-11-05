/* Selection groups share endpoints, not rail-graph nodes or transfer durations. */
function createStationCatalog(data) {
 const raw=new Map(data.points.map(p=>[p.id,p])),byMember=new Map();
 for(const group of data.station_groups??[]){
  const members=group.member_ids.map(id=>raw.get(id)).filter(Boolean);if(members.length<2)continue;
  const combined={...members[0],name:group.name,member_ids:members.map(p=>p.id),group_id:group.id,
   aliases:[...(group.aliases??[]),...members.map(p=>p.name)],lines:[...new Set(members.flatMap(p=>p.lines))],connection_note:group.connection_note};
  for(const p of members)byMember.set(p.id,combined);
 }
 const resolve=id=>byMember.get(id)??raw.get(id);
 const catalog=[...new Map(data.points.map(p=>{const selected=resolve(p.id);return [selected.id,selected];})).values()];
 const normalize=s=>String(s??'').trim().replace(/地铁站$/,'').replace(/[()（）\s]/g,'').replace(/站$/,'');
 const aliases={'杭州西':'火车西站','杭州西站':'火车西站','杭州南':'火车南站','杭州南站':'火车南站','杭州站':'城站','萧山机场':'萧山国际机场'};
 function search(text){const q=normalize(aliases[text.trim()]??text);return catalog.map(p=>{
   const names=[p.name,...(p.aliases??[])].map(normalize),score=names.some(n=>n===q)?0:names.some(n=>n.startsWith(q))?1:2;
   return {p,score,match:!q||names.some(n=>n.includes(q))};
  }).filter(x=>x.match).sort((a,b)=>a.score-b.score||a.p.name.localeCompare(b.p.name,'zh-CN')).map(x=>x.p);}
 const originId=id=>id?.startsWith('station:')&&resolve(id.slice(8))?'station:'+resolve(id.slice(8)).id:id;
 return {catalog,resolve,search,originId};
}
