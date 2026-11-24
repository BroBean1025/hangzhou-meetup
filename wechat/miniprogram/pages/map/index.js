const M=require('../../lib/map');
const api=require('../../lib/api');
const {MeetUpTime:T}=M;
const time=ms=>T.clock(ms);
const storage='meetup-origins-v1';
const toast=title=>wx.showToast({title,icon:'none'});
const idOf=e=>e.currentTarget.dataset.id;
const initial=M.position(M.data.campuses[0]);
function stationOrigin(id) {
  const p=M.catalog.resolve(id);
  return {id:'station:'+p.id,station_id:p.id,kind:'station',short_name:p.name,enabled:true};
}
function descriptor(o) {
  return o.station_id?{kind:'station',station_id:o.station_id}:{kind:'campus',id:o.id,gates:o.selected,mode:o.mode};
}
function restore(saved) {
  const origins=M.data.campuses.map(c=>{
    const pref=saved.campuses?.[c.id]||{}, gates=c.gates.filter(g=>pref.gates?.includes(g.key)).map(g=>g.key);
    return {...c,enabled:typeof pref.enabled==='boolean'?pref.enabled:c.default_enabled,selected:gates.length?gates:[c.origin_key],
      mode:['walk','bike','bus','taxi'].includes(pref.mode)?pref.mode:'walk'};
  });
  for(const row of saved.stations||[])if(M.points.has(row.id)){
    const o=stationOrigin(row.id);
    if(!origins.some(other=>other.id===o.id))origins.push({...o,enabled:row.enabled!==false});
  }
  if(!origins.some(o=>o.enabled))origins[0].enabled=true;
  return origins;
}
function viewCard(r,i,expanded) {
  const summary={id:r.origin_id,number:i+1,color:M.colors[i%M.colors.length],time:M.minutes(r.total_seconds),error:r.error||'',gate:r.gate_label||'',
    transfers:r.transfers??0,fare:r.fare==null?'票价未知':'约 ¥'+r.fare,station:r.destination_group?r.destination_station:''};
  if(!expanded)return summary;
  const breakdown=r.mode==='walk'?[['直接步行',r.total_seconds]]:[[M.modes[r.access_mode]+'接驳',r.access_seconds],['地铁乘车',r.ride_seconds],
    ['站内换乘',r.transfer_seconds==null?null:r.transfer_seconds-(r.cross_station_seconds||0)],...(r.cross_station_seconds?[['跨站区步行',r.cross_station_seconds]]:[]),['下车后步行',r.egress_seconds]];
  return {...summary,
    bits:breakdown.map(([title,n])=>title+' '+M.minutes(n)).join(' · '),
    legs:(r.legs||[]).map((l,index)=>({index,name:l.line_name||l.label||(l.kind==='ride'?'地铁':'换乘步行'),color:M.lines.get(l.line_id)?.color||'#697970',
      stops:(l.station_names||[]).join(' → '),time:M.minutes(l.seconds)})),
    walks:M.accessPaths(r).map(({paths,...w},index)=>({...w,index,hasPath:paths.length>0})),
    alternatives:(r.alternatives||[]).map(a=>({id:a.choice_id,title:a.tags.join(' / ')+' · '+M.minutes(a.total_seconds),active:a.choice_id===r.choice_id})),
    note:[r.preference_note,r.preference_warning,...(r.warnings||[]),...(r.access_details?.notes||[])].filter(Boolean).join(' '),
    version:r.synced_at||''};
}
Page({
  data:{...initial,scale:11,markers:[],polyline:[],polygons:[],tab:'hubs',folded:false,targetName:'',isEast:false,
    primaryName:'',selectedCount:0,schools:[],custom:[],hubRows:[],hubNote:'',hubError:false,cards:[],focus:'',current:'',status:'',
    picking:'',search:'',lineId:'',lineFilters:M.data.lines,choices:[],strategy:'time',east:false,busy:false,
    planning:false,date:'',arrival:'',buffer:'10',meetingBuffer:'3',schedules:[],meetingRows:[],planError:'',detail:'',gateEditor:'',
    modeList:Object.entries(M.modes).filter(([id])=>id!=='station').map(([id,label])=>({id,label})),
    sharedIds:[],updated:M.data.synced_at,regionalDate:M.data.regional_data_at},
  onLoad(){
    let saved;try{saved=wx.getStorageSync(storage);}catch{}
    saved=saved && typeof saved==='object'?saved:{};
    this.origins=restore(saved);
    this.primary=this.origins.find(o=>o.enabled&&o.id===saved.primary)?.id||this.enabled()[0].id;
    this.expanded={};this.results=[];this.candidates=[];this.queryNo=0;this.hubNo=0;this.zoom=11;
    const defaultArrival=T.localValue(Date.now()+3600000);
    this.setData({date:defaultArrival.slice(0,10),arrival:defaultArrival.slice(11),current:time(Date.now()),
      strategy:saved.strategy==='transfers'?'transfers':'time',east:saved.east===true,
      buffer:Number.isInteger(saved.buffer)&&saved.buffer>=0&&saved.buffer<=180?String(saved.buffer):'10',
      meetingBuffer:Number.isInteger(saved.meetingBuffer)&&saved.meetingBuffer>=0&&saved.meetingBuffer<=60?String(saved.meetingBuffer):'3'});
    this.originViews();this.draw();this.loadHubs();
  },
  onShow(){this.tick=()=>{this.setData({current:time(Date.now())});if(this.data.planning)this.plan();};this.tick();this.timer=setInterval(this.tick,30000);},
  onHide(){clearInterval(this.timer);},
  onUnload(){clearInterval(this.timer);clearTimeout(this.regionTimer);this.queryNo++;this.hubNo++;this.gone=true;},
  onReady(){this.map=wx.createMapContext('metro',this);this.readRegion();},
  enabled(){return this.origins.filter(o=>o.enabled);},
  save(){
    const campuses={},stations=[];
    for(const o of this.origins){if(o.station_id)stations.push({id:o.station_id,enabled:o.enabled});else campuses[o.id]={enabled:o.enabled,gates:o.selected,mode:o.mode};}
    try{wx.setStorageSync(storage,{campuses,stations,primary:this.primary,strategy:this.data.strategy,east:this.data.east,buffer:parseInt(this.data.buffer,10),meetingBuffer:parseInt(this.data.meetingBuffer,10)});}catch{}
  },
  originViews(){
    const enabled=this.enabled();
    const views=this.origins.map(o=>({...o,primary:o.id===this.primary,num:enabled.indexOf(o)+1,
      gateText:o.gates?.filter(g=>o.selected.includes(g.key)).map(g=>g.label).join('、'),gates:o.gates?.map(g=>({...g,on:o.selected.includes(g.key)}))||[]}));
    const schools=[...new Set(M.data.campuses.map(c=>c.school_id))].map(id=>{
      const rows=views.filter(o=>o.school_id===id);
      return {id,name:rows[0].school_name,rows,open:!!this.expanded[id],count:rows.filter(o=>o.enabled).length};
    });
    this.setData({schools,custom:views.filter(o=>o.station_id),primaryName:enabled.find(o=>o.id===this.primary)?.short_name||'',selectedCount:enabled.length});
  },
  async loadHubs(){
    const o=this.enabled().find(o=>o.id===this.primary),no=++this.hubNo;
    if(!o)return;
    const initial=o.mode==='walk'&&o.selected.length===1&&o.selected[0]===o.origin_key?o.hubs:null;
    const rows=values=>M.data.hubs.map((h,i)=>({id:h.id,name:h.name,icon:'/icons/'+h.kind+'.png',time:M.minutes(values?.[i])}));
    this.setData({hubRows:rows(initial),hubNote:initial?'内置快照 · 正在更新':'正在查询',hubError:false});
    try{
      const reply=await api.post('/api/origin',{origin:descriptor(o)});
      if(no!==this.hubNo)return;
      const values=M.data.hubs.map(h=>{
        const times=h.member_ids.map(id=>reply.times[id]?.seconds).filter(Number.isFinite);
        return times.length?Math.min(...times):null;
      });
      this.setData({hubRows:rows(values),hubNote:[reply.long_access?'步行接驳约 '+M.minutes(reply.access_hint)+'，可在出发点切换方式。':'',...(reply.errors||[])].filter(Boolean).join(' ')});
    }catch(e){if(no===this.hubNo)this.setData({hubError:true,hubNote:(initial?'显示内置快照。':'')+e.message});}
  },
  draw(markersOnly=false){
    const layer=M.layers({origins:this.enabled(),results:this.results,candidates:this.candidates,target:this.target,focus:this.data.focus,scale:this.zoom,region:this.region,markersOnly,journeys:markersOnly?this.journeys:null});
    this.journeys=layer.journeys;
    this.actions=layer.actions;
    this.setData(markersOnly?{markers:layer.markers}:{markers:layer.markers,polyline:layer.polyline,polygons:layer.polygons});
  },
  regionChanged(e){
    if(e.type!=='end'&&e.detail.type!=='end')return;
    clearTimeout(this.regionTimer);this.regionTimer=setTimeout(()=>this.readRegion(),120);
  },
  readRegion(){
    if(!this.map||this.gone)return;
    const seq=this.regionNo=(this.regionNo||0)+1;
    this.map.getRegion({success:region=>this.map.getScale({success:({scale})=>{
      if(this.gone||seq!==this.regionNo)return;
      const previous=this.region;
      if(previous&&Math.abs(this.zoom-scale)<.1&&['southwest','northeast'].every(k=>Math.abs(previous[k].latitude-region[k].latitude)<.00005&&Math.abs(previous[k].longitude-region[k].longitude)<.00005))return;
      const sameTracks=(this.zoom>=14.5)===(scale>=14.5);
      this.region=region;this.zoom=scale;this.draw(sameTracks);
    }})});
  },
  toggleSchool(e){const id=idOf(e);this.expanded[id]=!this.expanded[id];this.originViews();},
  toggleFold(){this.setData({folded:!this.data.folded});},
  switchTab(e){this.setData({tab:idOf(e),folded:false,picking:''});},
  toggleGates(e){const id=idOf(e);this.setData({gateEditor:this.data.gateEditor===id?'':id});},
  changeOrigin(e){
    const {id,action,value}=e.currentTarget.dataset,o=this.origins.find(o=>o.id===id);
    if(!o)return;
    const affectsHubs=o.id===this.primary||action==='main';
    if(action==='toggle'||action==='remove'){
      if(o.enabled&&this.enabled().length===1)return toast('请保留至少一个出发点');
      if(action==='remove')this.origins=this.origins.filter(x=>x!==o);else o.enabled=!o.enabled;
      if(!this.enabled().some(x=>x.id===this.primary))this.primary=this.enabled()[0].id;
    }else if(action==='main'){o.enabled=true;this.primary=id;}
    else if(action==='gate'){
      if(o.selected.includes(value)&&o.selected.length===1)return toast('请保留至少一个校门');
      o.selected=o.selected.includes(value)?o.selected.filter(k=>k!==value):[...o.selected,value];
    }else if(action==='mode')o.mode=value;
    this.originViews();this.save();if(affectsHubs)this.loadHubs();
    if(this.target)this.query(false);else this.draw();
  },
  openPicker(e){this.setData({picking:idOf(e),search:'',lineId:'',folded:false});this.searchChoices();},
  cancelPicker(){this.setData({picking:''});},
  searchInput(e){this.setData({search:e.detail.value});this.searchChoices();},
  chooseLine(e){const id=idOf(e);this.setData({lineId:this.data.lineId===id?'':id});this.searchChoices();},
  searchChoices(){
    const matches=M.catalog.search(this.data.search).filter(p=>!this.data.lineId||p.lines.includes(this.data.lineId));
    this.setData({choices:matches.map(p=>({id:p.id,name:p.name,lines:M.lineText(p)}))});
  },
  choose(e){
    const p=M.catalog.resolve(idOf(e));if(!p)return;
    if(this.data.picking==='origin'){
      let o=this.origins.find(o=>o.id==='station:'+p.id);
      if(!o){o=stationOrigin(p.id);this.origins.push(o);}else o.enabled=true;
      this.setData({picking:'',tab:'origins'});this.originViews();this.save();if(this.target)this.query(false);else this.draw();return;
    }
    this.toStation(p.id);
  },
  toStation(id){
    const p=M.catalog.resolve(id);
    this.select({name:p.name,ids:p.member_ids||[p.id],coord:M.position(p)});
  },
  mapTap(e){
    const {longitude,latitude}=e.detail;
    if(!Number.isFinite(longitude)||!Number.isFinite(latitude))return;
    this.select({name:e.detail.name||'地图选点',coord:{longitude,latitude}});
  },
  markerTap(e){
    const a=this.actions.get(e.detail.markerId);if(!a)return;
    if(a.station)return this.toStation(a.station);
    if(a.gate)return this.select({name:a.gate.label,coord:M.position(a.gate)});
    if(a.meeting){this.setData({tab:'time',folded:false,picking:''});return;}
    if(a.routes){
      const choices=a.routes.map(i=>this.data.cards[i]).filter(Boolean);
      if(choices.length===1){this.focusFromBadge(choices[0]);return;}
      this.setData({tab:'results',folded:false,picking:'',sharedIds:choices.map(c=>({id:c.id,label:c.number+' '+c.name}))});return;
    }
    if(a.target){this.setData({tab:'results',folded:false,picking:''});return;}
    const o=this.origins.find(o=>o.id===a.origin);
    if(o&&this.target){this.focusFromBadge(o);}
    else if(o?.station_id)this.toStation(o.station_id);
    else if(o){const g=o.gates.find(g=>o.selected.includes(g.key));this.select({name:o.short_name+' · '+g.label,coord:M.position(g)});}
  },
  focusFromBadge(c){this.setData({tab:'results',picking:'',folded:false,detail:c.id,focus:c.id,sharedIds:[]});this.updateCards();this.draw();},
  pickShared(e){const card=this.data.cards.find(c=>c.id===idOf(e));if(card)this.focusFromBadge(card);},
  locateMeeting(e){const p=M.points.get(idOf(e));if(p)this.setData({...M.position(p),scale:16,folded:true});},
  select(target){this.target=target;this.setData({picking:'',folded:false,tab:'results',targetName:target.name,isEast:target.ids?.includes('cn-hangzhou-east-railway-station')||false});this.query(true);},
  clear(){
    this.queryNo++;this.target=null;this.results=[];this.candidates=[];
    this.setData({targetName:'',isEast:false,cards:[],sharedIds:[],detail:'',focus:'',status:'',busy:false,meetingRows:[],schedules:[],planError:'',tab:'hubs',picking:''});this.draw();
  },
  pref(e){const id=idOf(e);if(id==='east')this.setData({east:!this.data.east});else this.setData({strategy:id});this.save();if(this.target)this.query(false);},
  retry(){if(this.target)this.query(false);},
  async query(fit){
    const no=++this.queryNo,origins=this.enabled(),target=this.target;
    const endpoint=target.ids?{station_ids:target.ids}:(()=>{const [lon,lat]=M.gcjToWgs(target.coord.longitude,target.coord.latitude);return {lon,lat};})();
    const preferences={strategy:this.data.strategy,east_station:this.data.east?'main_within_10':'fastest'};
    this.results=[];this.candidates=[];
    this.setData({busy:true,cards:[],sharedIds:[],meetingRows:[],schedules:[],detail:'',focus:'',planError:'',status:'正在比较 '+origins.length+' 个出发点…'});this.draw();
    const results=new Array(origins.length);let cursor=0;
    const worker=async()=>{
      while(no===this.queryNo && cursor<origins.length){
        const i=cursor++,o=origins[i];
        try {
          const reply=await api.post('/api/query',{origin:descriptor(o),...endpoint,preferences});
          if(!reply.results?.length)throw Error('查询服务未返回路线');
          results[i]=reply.results[0];
        } catch(e) {results[i]={origin_id:o.id,error:e.message,total_seconds:null};}
      }
    };
    await Promise.all(origins.slice(0,3).map(worker));
    if(no!==this.queryNo)return;
    this.results=results;const count=results.filter(M.valid).length;
    this.setData({busy:false,status:count+' / '+origins.length+' 条行程已取得'});
    this.renderResults();
    if(fit&&count)this.fitJourney();
  },
  renderResults(){
    this.candidates=M.meetings(this.results,this.enabled(),this.target);
    this.updateCards();this.plan();this.draw();
  },
  updateCards(){
    const cards=this.results.map((r,i)=>({...viewCard(r,i,r.origin_id===this.data.detail),name:this.origins.find(o=>o.id===r.origin_id)?.short_name||'出发点'}));
    this.setData({cards});
  },
  focusRoute(e){
    const id=idOf(e),focus=this.data.focus===id?'':id;
    this.setData({focus,detail:focus});this.updateCards();this.draw();this.fitJourney();
  },
  details(e){const id=idOf(e);this.setData({detail:this.data.detail===id?'':id});this.updateCards();},
  alternative(e){
    const {id,choice}=e.currentTarget.dataset,r=this.results.find(r=>r.origin_id===id);
    const a=r?.alternatives?.find(a=>a.choice_id===choice);if(!a)return;
    this.results=this.results.map(old=>old===r?{...a,alternatives:r.alternatives,preference_warning:r.preference_warning}:old);
    this.renderResults();
  },
  overview(){this.setData({focus:'',sharedIds:[]});this.draw();this.fitJourney();},
  fitJourney(){
    if(!this.target||!this.map)return;
    const coords=[this.target.coord];
    for(const r of this.results.filter(r=>M.valid(r)&&(!this.data.focus||r.origin_id===this.data.focus))){
      if(r.origin_location)coords.push(M.position(r.origin_location));
      for(const leg of r.legs||[])for(const id of leg.station_ids||[])if(M.points.has(id))coords.push(M.position(M.points.get(id)));
      for(const w of M.accessPaths(r))for(const path of w.paths)coords.push(path[0],path[path.length-1]);
    }
    this.map.includePoints({points:coords,padding:[26,28,30,28]});
  },
  fitWalk(e){
    const {id,index}=e.currentTarget.dataset,r=this.results.find(r=>r.origin_id===id);
    const walk=r&&M.accessPaths(r)[index];if(!walk?.paths.length)return;
    this.setData({focus:id,folded:true});this.draw();this.map?.includePoints({points:walk.paths.flat(),padding:[34,26,34,26]});
  },
  togglePlan(){this.setData({planning:!this.data.planning});this.plan();},
  planInput(e){const id=idOf(e);this.setData({[id]:e.detail.value});if(id==='buffer'||id==='meetingBuffer')this.save();this.plan();},
  arrivalAfter(e){const value=T.localValue(Math.ceil(Date.now()/60000)*60000+Number(idOf(e))*60000);this.setData({date:value.slice(0,10),arrival:value.slice(11)});this.plan();},
  plan(){
    const candidates=this.candidates,results=this.results;
    let plan=null;
    if(this.data.planning)plan=T.plan({results,candidates,target:T.parseLocal(this.data.date+'T'+this.data.arrival),
      buffer:this.data.buffer===''?NaN:Number(this.data.buffer),meetingBuffer:this.data.meetingBuffer===''?NaN:Number(this.data.meetingBuffer)});
    const name=id=>this.origins.find(o=>o.id===id)?.short_name||id;
    const meetingRows=candidates.map(c=>{
      const m=plan?.meetings?.get(T.candidateKey(c));
      return {key:T.candidateKey(c),sid:c.sid,name:M.points.get(c.sid).name,group:c.incomingGroups.map(group=>group.map(name).join('、')).join(' ＋ '),
        trunk:M.lines.get(c.line).name+' → '+M.points.get(c.next).name,at:m?time(m.meetAt)+' 碰面 · '+time(m.continueAt)+' 继续出发':'',
        entries:c.members.map(i=>name(i.id)+' · '+M.minutes(i.seconds)).join('，')};
    });
    const schedules=plan?.schedules?[...plan.schedules].map(([id,s])=>({id,name:name(id),depart:time(s.departure),arrival:time(s.arrival),late:s.late})):[];
    this.setData({schedules,meetingRows,planError:plan?.error||(plan?.partial?'部分行程缺少完整时间，仅排列已取得的路线。':plan?.unknownMeetings?'部分汇合站缺少分段时间。':'')});
  }
});
