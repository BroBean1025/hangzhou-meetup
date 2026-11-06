// Progressive disclosure keeps summaries at a readable font throughout a drag.
(() => {
 const key='hangzhou-panel-layout-v1', q=s=>document.querySelector(s);
 let saved={};try{saved=JSON.parse(localStorage.getItem(key))??{};}catch{}
 const state={top:Number.isFinite(saved.top)?Math.max(0,Math.min(1,saved.top)):1,side:Number.isFinite(saved.side)?Math.max(0,Math.min(1,saved.side)):0.68};
 const top=document.createElement('section');top.id='settings-panel';top.setAttribute('aria-label','出行设置');
 const header=q('header');header.before(top);top.append(header);
 const content=document.createElement('div');content.id='settings-content';top.append(content);
 for(const selector of ['#origin-panel','.destination-bar','.route-preferences','#trip-planner'])content.append(q(selector));
 const overview=document.createElement('div');overview.className='panel-overview';header.querySelector('.brand').after(overview);
 const topHandle=document.createElement('div');topHandle.className='panel-handle top-handle';topHandle.innerHTML='<span class="grip" aria-hidden="true"></span><span class="handle-caption">拖动调整设置区</span><button type="button" aria-controls="settings-content">收起设置</button>';top.append(topHandle);
 const side=q('#comparison'), stage=q('.stage'), body=document.createElement('div');body.className='comparison-body';
 while(side.firstChild)body.append(side.firstChild);side.append(body);
 const mini=document.createElement('div');mini.className='comparison-mini';side.prepend(mini);
 const sideHandle=document.createElement('div');sideHandle.className='panel-handle side-handle';sideHandle.innerHTML='<span class="grip" aria-hidden="true"></span><button type="button" aria-controls="comparison">收起路线</button>';side.prepend(sideHandle);
 const narrow=()=>matchMedia('(max-width:1000px)').matches;
 const topRange=()=>Math.max(180,Math.min(innerHeight*0.58,narrow()?Infinity:innerHeight-320,content.scrollHeight));
 function summary(){
  const origins=q('#origin-summary').textContent||'选择出发点',dest=q('#destination-search').value||'选择目的地';
  overview.replaceChildren();const strong=document.createElement('strong');strong.textContent=dest;const small=document.createElement('span');small.textContent=origins;overview.append(small,strong);overview.title=origins+' → '+dest;
  const results=typeof lastResults==='undefined'?[]:lastResults.filter(r=>Number.isFinite(r.total_seconds)&&!r.error&&!r.preview),max=results.length?Math.max(...results.map(r=>Math.ceil(r.total_seconds/60))):null;
  const title=document.createElement('strong');title.className='mini-destination';title.textContent=dest;
  const brief=document.createElement('div');brief.className='mini-brief';brief.innerHTML=results.length?'<span>'+results.length+' 人</span><span class="mini-duration"><span>最长</span> <b>'+max+'</b> <span>分钟</span></span>':'正在查询';
  const list=document.createElement('div');list.className='mini-routes';
  for(const r of results){const row=document.createElement('div');row.className='mini-route';const name=document.createElement('strong');name.textContent=byCampus.get(r.origin_id)?.short_name??'出发点';const metric=document.createElement('span');metric.textContent=Math.ceil(r.total_seconds/60)+' 分钟';const detail=document.createElement('small');detail.textContent='换乘 '+(r.transfers??0)+' 次'+(r.fare!=null?' · 约 '+r.fare+' 元':'');row.append(name,metric,detail);if(r.fare_note){const note=document.createElement('small');note.textContent=r.fare_note;row.append(note);}list.append(row);}
  mini.replaceChildren(title,brief,list);
 }
 function render(){
  const full=state.top>0.72,compact=state.top>0.25;
  top.dataset.level=full?'full':compact?'compact':state.top>0?'summary':'collapsed';
  const natural=topRange();
  content.style.height=state.top===1?'auto':Math.round(state.top*natural)+'px';
  content.inert=state.top===0;content.setAttribute('aria-hidden',String(state.top===0));
  topHandle.setAttribute('aria-valuenow',Math.round(state.top*100));topHandle.querySelector('button').textContent=state.top===0?'展开设置':'收起设置';topHandle.querySelector('button').setAttribute('aria-expanded',String(state.top>0));
  const maxWidth=Math.min(650,innerWidth*0.52),width=64+state.side*(maxWidth-64);
  const level=narrow()?(state.side<0.12?'collapsed':state.side<0.3?'summary':state.side<0.65?'compact':'full'):width<210?'collapsed':width<300?'summary':width<400?'compact':'full';side.dataset.level=level;
  stage.style.setProperty('--comparison-width',Math.round(width)+'px');
  const sideHeight=Math.round(70+state.side*Math.max(260,innerHeight*0.65));side.style.setProperty('--comparison-height',sideHeight+'px');
  stage.style.setProperty('--collapsed-result-height',narrow()&&level==='collapsed'?sideHeight+'px':'0px');
  sideHandle.setAttribute('aria-orientation',narrow()?'horizontal':'vertical');sideHandle.setAttribute('aria-valuenow',Math.round(state.side*100));
  sideHandle.querySelector('button').textContent=level==='collapsed'?'展开路线':'收起路线';sideHandle.querySelector('button').setAttribute('aria-expanded',String(level!=='collapsed'));
  body.inert=level==='collapsed'||level==='summary';
 }
 function persist(){try{localStorage.setItem(key,JSON.stringify(state));}catch{}document.dispatchEvent(new Event('change',{bubbles:true}));}
 function bind(handle,field){
  handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-label',field==='top'?'调整顶部设置区大小':'调整路线结果区大小');handle.setAttribute('aria-valuemin','0');handle.setAttribute('aria-valuemax','100');handle.setAttribute('aria-orientation',field==='top'?'horizontal':'vertical');
  handle.querySelector('button').onclick=()=>{state[field]=(field==='side'?side.dataset.level==='collapsed':state.top===0)?1:0;render();persist();};
  handle.onkeydown=e=>{if(e.target!==handle)return;const v={Home:0,End:1},arrows=field==='top'?{ArrowUp:-1,ArrowDown:1}:narrow()?{ArrowUp:1,ArrowDown:-1}:{ArrowLeft:1,ArrowRight:-1};if(e.key in v)state[field]=v[e.key];else if(e.key in arrows)state[field]=Math.max(0,Math.min(1,state[field]+arrows[e.key]*0.08));else return;e.preventDefault();render();persist();};
  handle.onpointerdown=e=>{
   if(e.target.closest('button')||e.button!==0)return;e.preventDefault();handle.setPointerCapture(e.pointerId);
   const initial=state[field],vertical=field==='top'||narrow(),start=vertical?e.clientY:e.clientX;
   const range=field==='top'?topRange():narrow()?Math.max(260,innerHeight*0.65):Math.min(650,innerWidth*0.52)-64;
   document.body.classList.add('resizing-panels');q('#destination-results-close').click();
   const move=event=>{const delta=((vertical?event.clientY:event.clientX)-start)*(field==='side'?-1:1);state[field]=Math.max(0,Math.min(1,initial+delta/range));if(state[field]<0.025)state[field]=0;render();};
   const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);document.body.classList.remove('resizing-panels');persist();};
   handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  };
 }
 bind(topHandle,'top');bind(sideHandle,'side');
 new MutationObserver(summary).observe(body,{childList:true,subtree:true,characterData:true});
 new MutationObserver(summary).observe(q('#origin-summary'),{childList:true,subtree:true,characterData:true});
 q('#destination-search').addEventListener('input',summary);window.addEventListener('resize',render);
 new ResizeObserver(()=>stage.style.setProperty('--settings-height',top.getBoundingClientRect().height+'px')).observe(top);
 content.addEventListener('toggle',()=>{if(state.top>0.72)state.top=1;render();},true);
 summary();render();
})();
