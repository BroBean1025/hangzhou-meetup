(() => {
 const key='hangzhou-route-preferences-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(key))??{};}catch{}
 const preferences={strategy:saved.strategy==='transfers'?'transfers':'time',east_station:saved.east_station==='main_within_10'?'main_within_10':'fastest'};
 const panel=document.createElement('section');panel.className='route-preferences';panel.setAttribute('aria-label','路线偏好');
 panel.innerHTML='<div class="preference-main"><strong>路线偏好</strong><div class="preference-switch" role="group" aria-label="路线排序"><button type="button" data-strategy="time">时间优先</button><button type="button" data-strategy="transfers" title="优先就近上车；少换乘最多多花10分钟，不明显增加站外步行">少换乘</button></div><span class="preference-hint">就近上车 · 少换乘最多多花10分钟</span></div><label class="east-preference" hidden><input id="east-preference" type="checkbox"><span>杭州东进站偏好：最多多花 10 分钟，优先 1/4 号线站区<small>避开东广场 6/19 号线站区；高铁安检、候车时间另留。</small></span></label>';
 document.querySelector('.destination-bar').after(panel);
 function render(){for(const b of panel.querySelectorAll('[data-strategy]'))b.setAttribute('aria-pressed',String(b.dataset.strategy===preferences.strategy));panel.querySelector('input').checked=preferences.east_station==='main_within_10';}
 function change(){try{localStorage.setItem(key,JSON.stringify(preferences));}catch{}render();if(lastTarget)queryPoint(lastTarget.latlng,lastTarget.stationIds,lastTarget.name);}
 panel.querySelectorAll('[data-strategy]').forEach(b=>b.onclick=()=>{if(b.dataset.strategy!==preferences.strategy){preferences.strategy=b.dataset.strategy;change();}});
 panel.querySelector('input').onchange=e=>{preferences.east_station=e.target.checked?'main_within_10':'fastest';change();};
 window.getRoutePreferences=()=>({...preferences});
 window.syncDestinationPreferences=()=>{panel.querySelector('.east-preference').hidden=!(lastTarget?.stationIds??[]).some(id=>id==='cn-hangzhou-east-railway-station'||id==='cn-hangzhou-east-railway-station-east-square');};
 window.routeAlternativesHTML=r=>{
  const choices=r.alternatives??[];let html='';
  if(choices.length>1)html='<div class="route-choices" role="group" aria-label="'+esc(byCampus.get(r.origin_id).short_name)+'的备选路线">'+choices.map(a=>'<button type="button" data-choice-origin="'+esc(r.origin_id)+'" data-choice="'+esc(a.choice_id)+'" aria-pressed="'+String(a.choice_id===r.choice_id)+'"><strong>'+esc(a.tags.join(' · '))+'</strong><span>'+Math.ceil(a.total_seconds/60)+' 分钟 · 换乘 '+a.transfers+' 次</span><small class="choice-access">'+(a.mode==='walk'?'直接步行':esc(a.origin_station??'地铁站')+'上车'+(a.access_seconds?' · '+esc(modeNames[a.access_mode]??'接驳')+minute(a.access_seconds)+'分':''))+'</small><small>'+(a.fare!=null?'票价约 '+a.fare+' 元 · ':'')+(a.extra_seconds>0?'多 '+Math.ceil(a.extra_seconds/60)+' 分钟':'最快到达')+'</small></button>').join('')+'</div>';
  else if(choices.length)html='<p class="preference-note">'+(r.origin_kind==='campus'&&r.access_mode==='walk'?'就近上车后，两种偏好为同一方案':'时间优先与少换乘为同一方案')+'</p>';
  if(r.destination_group==='杭州东站')html+='<p class="station-arrival">到达站区：<strong>'+(r.destination_station_id==='cn-hangzhou-east-railway-station'?'火车东站 · 1/4号线':'东广场 · 6/19号线')+'</strong></p>';
  if(r.preference_note)html+='<p class="preference-note">'+esc(r.preference_note)+'</p>';
  if(r.preference_warning)html+='<p class="preference-note">'+esc(r.preference_warning)+'</p>';
  return html;
 };
 window.bindRouteAlternatives=()=>document.querySelectorAll('[data-choice]').forEach(b=>{b.disabled=lastQueryState==='loading';b.onclick=()=>{
  const old=lastResults.find(r=>r.origin_id===b.dataset.choiceOrigin),choice=old?.alternatives?.find(a=>a.choice_id===b.dataset.choice);if(!choice)return;
  leaveAccessDetail(false);const results=lastResults.map(r=>r===old?{...choice,alternatives:old.alternatives,preferences:old.preferences,preference_warning:old.preference_warning,preference_note:'已手动选择此起点的路线。'}:r),valid=results.filter(r=>Number.isFinite(r.total_seconds)&&!r.error&&!r.preview);
  showResults({results,complete:valid.length===results.length,longest_seconds:Math.max(...valid.map(r=>r.total_seconds)),spread_seconds:Math.max(...valid.map(r=>r.total_seconds))-Math.min(...valid.map(r=>r.total_seconds))});updateLabels();
  document.querySelector('[data-choice-origin="'+CSS.escape(old.origin_id)+'"][data-choice="'+CSS.escape(choice.choice_id)+'"]')?.focus({preventScroll:true});
 };});
 render();window.syncDestinationPreferences();
})();
