'use strict';
let tripPlan=null;
const tripTime=MeetUpTime,tripInput=$('arrival-time'),tripBuffer=$('travel-buffer'),tripMeetingBuffer=$('meeting-buffer');
const tripDateFormatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',weekday:'short'});
const tripClockFormatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
function tripSettings(){return {target:tripTime.parseLocal(tripInput.value),buffer:tripBuffer.value===''?NaN:Number(tripBuffer.value),meetingBuffer:tripMeetingBuffer.value===''?NaN:Number(tripMeetingBuffer.value)};}
function renderDeparturePlans(){
 for(const box of document.querySelectorAll('[data-departure-for]')){
  const schedule=tripPlan?.schedules?.get(box.dataset.departureFor);
  box.hidden=!schedule;
  if(!schedule){box.innerHTML='';continue;}
  box.className='departure-plan'+(schedule.late?' is-late':'');
  box.innerHTML='<span>建议出发<b>'+esc(tripTime.clock(schedule.departure))+'</b></span><span>预计到达<b>'+esc(tripTime.clock(schedule.arrival))+'</b></span><small>含途中缓冲 '+schedule.buffer+' 分钟'+(schedule.stops.length?' · 汇合及等候 '+schedule.waiting+' 分钟':'')+(schedule.late?' · 建议出发时间已过，请调整到达时间。':'')+'</small>';
 }
}
window.refreshTripPlan=function(){
 tripPlan=null;const settings=tripSettings(),message=$('trip-plan-status');message.classList.remove('time-error');
 const summary=$('trip-plan-summary');summary.textContent=tripInput.value?'希望 '+tripInput.value.replace('T',' ')+' 到达':'设定到达时间，倒推几点出发';
 if(!tripInput.value){message.textContent='选定目的地和出发点后，可安排各自出发及途中会合的时间。';renderDeparturePlans();return;}
 const proposed=tripTime.plan({results:lastResults,candidates:meetingCandidates,...settings});
 if(proposed.error){message.textContent=proposed.error;message.classList.add('time-error');renderDeparturePlans();return;}
 if(!routeSelectionActive||!lastTarget){message.textContent='时间已设置，请选择目的地和参与出发点。';renderDeparturePlans();return;}
 if(!lastResults.length||lastResults.some(r=>r.preview)){message.textContent='正在查询路线，完整耗时返回后生成时间安排。';renderDeparturePlans();return;}
 tripPlan=proposed;renderDeparturePlans();
 const late=[...tripPlan.schedules.values()].filter(s=>s.late).length;
 message.textContent='按 '+tripTime.clock(settings.target)+' 前到达安排 · 每人途中缓冲 '+settings.buffer+' 分钟'+(tripPlan.meetings.size?' · 每处汇合预留 '+settings.meetingBuffer+' 分钟':'')+(tripPlan.partial?'。部分起点路线缺失，当前不是全员计划。':'')+(tripPlan.unknownMeetings?' 部分汇合点缺少当前路线逐站时间，暂不安排钟点。':'')+(late?' 有 '+late+' 个起点已过建议出发时间，请调整计划。':'');
 if(late)message.classList.add('time-error');
};
window.meetingScheduleHTML=function(candidate){
 const scheduled=tripPlan?.meetings?.get(tripTime.candidateKey(candidate));
 if(scheduled)return '<div class="meeting-schedule">建议 <b>'+esc(tripTime.clock(scheduled.meetAt))+'</b> 碰面<br>预留 '+tripPlan.meetingBuffer+' 分钟，<b>'+esc(tripTime.clock(scheduled.continueAt))+'</b> 继续出发</div>';
 return '';
};
window.meetingMemberTime=function(candidate,member){
 const schedule=tripPlan?.meetings?.get(tripTime.candidateKey(candidate))?.members.find(m=>m.id===member.id);
 return schedule?'<b class="scheduled-arrival">'+esc(tripTime.clock(schedule.arrival))+' 到站'+(schedule.wait?' · 等约 '+schedule.wait+' 分钟':'')+'</b>':'<b>'+(member.seconds===null?'逐站时间未知':minute(member.seconds)+'分')+'</b>';
};
window.meetingTimingSummary=function(candidate){
 if(tripPlan?.meetings?.has(tripTime.candidateKey(candidate)))return '到站时间含途中缓冲；到齐后按上方时间继续同行。';
 return candidate.known?'若同时出发，最晚约 '+minute(candidate.longest)+' 分钟到站 · 时间差约 '+minute(candidate.spread)+' 分钟':'当前行程缺少部分逐站时间，暂不安排该点碰面钟点。';
};
function changeTripSettings(){
 try{localStorage.setItem('hangzhou-trip-buffer-v1',JSON.stringify({buffer:tripBuffer.value,meetingBuffer:tripMeetingBuffer.value}));}catch{}
 renderMeetings(); // Updates the plan and both sets of cards, without provider calls.
}
for(const input of [tripInput,tripBuffer,tripMeetingBuffer])input.addEventListener('input',changeTripSettings);
for(const button of document.querySelectorAll('[data-arrival-after]'))button.onclick=()=>{tripInput.value=tripTime.localValue(Math.ceil(Date.now()/60000)*60000+Number(button.dataset.arrivalAfter)*60000);changeTripSettings();};
$('clear-arrival').onclick=()=>{tripInput.value='';changeTripSettings();};
try{const saved=JSON.parse(localStorage.getItem('hangzhou-trip-buffer-v1')??'null');if(saved){for(const [key,input,max] of [['buffer',tripBuffer,180],['meetingBuffer',tripMeetingBuffer,60]]){const n=Number(saved[key]);if(saved[key]!==''&&Number.isInteger(n)&&n>=0&&n<=max)input.value=String(n);}}}catch{}
let lastClockMinute=-1;
function tickTripClock(){
 const now=Date.now();$('current-clock').dateTime=new Date(now).toISOString();$('current-clock').textContent=tripClockFormatter.format(now);$('current-date').textContent=tripDateFormatter.format(now)+' · 北京时间';
 const minute=Math.floor(now/60000);if(minute!==lastClockMinute){lastClockMinute=minute;if(tripInput.value)renderMeetings();}
}
$('trip-planner').addEventListener('toggle',()=>{map.invalidateSize({pan:false});updateLabels();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)tickTripClock();});
refreshTripPlan();tickTripClock();setInterval(tickTripClock,1000);
