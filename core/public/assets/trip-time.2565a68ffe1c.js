/* Pure planning arithmetic shared by the browser and offline tests. Shanghai time. */
(function(root){
 'use strict';
 const MINUTE=60000,SHIFT=8*3600000;
 const localValue=ms=>new Date(ms+SHIFT).toISOString().slice(0,16);
 function parseLocal(value){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value??''))return null;
  const ms=Date.parse(value+':00+08:00');
  return Number.isFinite(ms)&&localValue(ms)===value?ms:null;
 }
 function clock(ms,reference=Date.now()){
  const value=localValue(ms),ref=localValue(reference);
  return (value.slice(0,10)===ref.slice(0,10)?'':value.slice(5,10).replace('-','月')+'日 ')+value.slice(11);
 }
 const valid=r=>!r.error&&!r.preview&&Number.isFinite(r.total_seconds)&&r.total_seconds>=0;
 const minutes=seconds=>Math.ceil(seconds/60);
 const candidateKey=c=>JSON.stringify([c.sid,c.line,c.next]);
 function prefix(result,candidate){
  const times=(result.station_departures??[]).filter(s=>s.station_id===candidate.sid&&s.next_station_id===candidate.next&&s.line_id===candidate.line).map(s=>s.elapsed_seconds);
  return times.length===1&&Number.isFinite(times[0])&&times[0]>=0&&times[0]<=result.total_seconds?times[0]:null;
 }
 function plan({results,candidates=[],target,buffer=10,meetingBuffer=3,now=Date.now()}){
  if(!Number.isFinite(target))return {error:'请选择有效的到达日期和时间。'};
  if(target<=now)return {error:'到达时间已过，请选择未来的时间。'};
  if(!Number.isInteger(buffer)||buffer<0||buffer>180||!Number.isInteger(meetingBuffer)||meetingBuffer<0||meetingBuffer>60)return {error:'途中缓冲需为 0–180 分钟，汇合预留需为 0–60 分钟的整数。'};
  const routes=results.filter(valid),byId=new Map(routes.map(r=>[r.origin_id,r]));
  const nodes=new Map();
  for(const c of candidates){
   const members=c.members.map(m=>({id:m.id,seconds:byId.has(m.id)?prefix(byId.get(m.id),c):null}));
   if(members.length>=2&&members.every(m=>m.seconds!==null))nodes.set(candidateKey(c),{key:candidateKey(c),members,latest:target});
  }
  const chains=new Map(),constraints=[];
  for(const r of routes){
   const chain=[...nodes.values()].filter(n=>n.members.some(m=>m.id===r.origin_id)).map(n=>({node:n,seconds:n.members.find(m=>m.id===r.origin_id).seconds})).sort((a,b)=>a.seconds-b.seconds);
   chains.set(r.origin_id,chain);
   if(chain.length){const last=chain.at(-1);last.node.latest=Math.min(last.node.latest,target-minutes(r.total_seconds-last.seconds)*MINUTE);}
   for(let i=1;i<chain.length;i++)constraints.push({from:chain[i-1].node,to:chain[i].node,gap:(minutes(chain[i].seconds-chain[i-1].seconds)+meetingBuffer)*MINUTE});
  }
  // Backward constraints synchronize branch arrivals. A cycle cannot be scheduled.
  for(let pass=0;pass<=nodes.size;pass++){
   let changed=false;
   for(const edge of constraints){const bound=edge.to.latest-edge.gap;if(edge.from.latest>bound){edge.from.latest=bound;changed=true;}}
   if(!changed)break;
   if(pass===nodes.size)return {error:'这些行程的汇合顺序互相冲突，请先选择一个汇合站作为目的地。'};
  }
  const schedules=new Map();
  for(const r of routes){
   const chain=chains.get(r.origin_id),first=chain[0];
   const departure=first?first.node.latest-(meetingBuffer+minutes(first.seconds)+buffer)*MINUTE:target-(minutes(r.total_seconds)+buffer)*MINUTE;
   let cursor=departure+buffer*MINUTE,elapsed=0,waiting=0;
   const stops=[];
   for(const item of chain){
    cursor+=minutes(item.seconds-elapsed)*MINUTE;
    const meetAt=item.node.latest-meetingBuffer*MINUTE;
    const wait=Math.max(0,(meetAt-cursor)/MINUTE);
    stops.push({key:item.node.key,arrival:cursor,meetAt,continueAt:item.node.latest,wait});
    waiting+=wait+meetingBuffer;cursor=item.node.latest;elapsed=item.seconds;
   }
   cursor+=minutes(r.total_seconds-elapsed)*MINUTE;
   schedules.set(r.origin_id,{departure,arrival:cursor,waiting,stops,late:departure<now,buffer});
  }
  const meetings=new Map([...nodes].map(([key,node])=>[key,{meetAt:node.latest-meetingBuffer*MINUTE,continueAt:node.latest,members:node.members.map(m=>({id:m.id,...schedules.get(m.id).stops.find(s=>s.key===key)}))}]));
  return {target,schedules,meetings,partial:routes.length!==results.length,unknownMeetings:candidates.length-nodes.size,buffer,meetingBuffer};
 }
 root.MeetUpTime=Object.freeze({localValue,parseLocal,clock,prefix,plan,candidateKey});
})(globalThis);
