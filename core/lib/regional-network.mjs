// Primary rail weights come from OpenMetro; regional estimates are frozen inputs.
export function mergeCatalog(stations,lines,regional){
 const byId=new Map(stations.map(s=>[s.id,{...s}]));
 for(const e of regional.stations??[]){const s=byId.get(e.id);if(s){s.lines=[...new Set([...(s.lines??[]),...e.lines])];s.is_interchange=s.lines.length>1;}else byId.set(e.id,e);}
 return {stations:[...byId.values()],lines:[...lines,...(regional.lines??[])]};
}
export class RegionalRouter{
 constructor(graph,regional,operating,segments){
  this.regional=regional;this.nodes=new Map([...graph.nodes,...regional.nodes].filter(n=>operating.has(n.station_id)).map(n=>[n.id,n]));this.at=new Map();this.adj=new Map();this.memo=new Map();
  for(const n of this.nodes.values()){if(!this.at.has(n.station_id))this.at.set(n.station_id,[]);this.at.get(n.station_id).push(n.id);this.adj.set(n.id,[]);}
  const directions=new Map(segments.map(s=>[s.from_stop_id+'|'+s.to_stop_id,s.direction])),coreEdges=[];
  for(const e of graph.edges){if(e.kind==='transfer'){coreEdges.push(e);continue;}const d=directions.get(e.from+'|'+e.to);if(!['both','forward','backward'].includes(d))throw Error('Missing OpenMetro segment direction');if(d!=='backward')coreEdges.push(e);if(d!=='forward')coreEdges.push({...e,from:e.to,to:e.from});}
  for(const e of [...coreEdges,...regional.edges]){if(!this.nodes.has(e.from)||!this.nodes.has(e.to))continue;if(!Number.isFinite(e.seconds)||e.seconds<0||e.seconds===0&&e.kind==='ride')throw Error('Invalid rail weight');this.adj.get(e.from).push(e);}
 }
 paths(origin,strategy='time'){
  const cacheKey=origin+'|'+strategy;
  if(this.memo.has(cacheKey))return this.memo.get(cacheKey);
  // Small graph (<500 platform states); O(V²+E) avoids a new heap dependency.
  const distance=new Map(this.at.get(origin).map(n=>[n,0])),changes=new Map(this.at.get(origin).map(n=>[n,0])),previous=new Map(),pending=new Set(this.nodes.keys());
  const better=(t,c,oldT,oldC)=>strategy==='transfers'?(c<oldC||c===oldC&&t<oldT):t<oldT;
  while(pending.size){let node=null,cost=Infinity,count=Infinity;for(const n of pending){const d=distance.get(n)??Infinity,c=changes.get(n)??Infinity;if(better(d,c,cost,count)){node=n;cost=d;count=c;}}if(node===null)break;pending.delete(node);
   for(const e of this.adj.get(node)){const next=cost+e.seconds,c=count+(e.kind==='transfer'&&!e.same_line_direction_change?1:0);if(pending.has(e.to)&&better(next,c,distance.get(e.to)??Infinity,changes.get(e.to)??Infinity)){distance.set(e.to,next);changes.set(e.to,c);previous.set(e.to,e);}}
  }
  const best=new Map();for(const [sid,ns]of this.at){const available=ns.filter(n=>distance.has(n));if(available.length)best.set(sid,available.reduce((a,b)=>better(distance.get(b),changes.get(b),distance.get(a),changes.get(a))?b:a));}
  const value={distance,previous,best};this.memo.set(cacheKey,value);return value;
 }
 times(origin,within=10800){const {distance,best}=this.paths(origin);return [...best].filter(([,n])=>distance.get(n)<=within).map(([station_id,n])=>({station_id,seconds:distance.get(n)}));}
 timedLeg(leg){
  if(leg.kind!=='ride'||leg.station_offsets_seconds)return leg;
  const ids=leg.station_ids??[],offsets=[0];let elapsed=0;
  for(let i=1;i<ids.length;i++){
   const choices=(this.at.get(ids[i-1])??[]).flatMap(id=>this.adj.get(id)??[]).filter(e=>e.kind==='ride'&&e.line_id===leg.line_id&&this.nodes.get(e.to)?.station_id===ids[i]&&(!e.station_ids||e.station_ids.length===2));
   const weights=[...new Set(choices.map(e=>e.seconds))];
   if(weights.length!==1)return leg; // Ambiguous or aggregate regional edge: no interpolation.
   elapsed+=weights[0];offsets.push(elapsed);
  }
  return ids.length>=2&&Math.abs(elapsed-leg.seconds)<.01?{...leg,station_offsets_seconds:offsets}:leg;
 }
 route(origin,destination,strategy='time'){
  const {distance,previous,best}=this.paths(origin,strategy);if(!best.has(destination))throw Error('Unreachable regional station');let node=best.get(destination);const edges=[];
  while(previous.has(node)){const e=previous.get(node);edges.push(e);node=e.from;}
  const legs=[];
  for(const e of edges.reverse()){const a=this.nodes.get(e.from),b=this.nodes.get(e.to),{from,to,weight,...rest}=e;const leg={...rest,from_station_id:a.station_id,to_station_id:b.station_id,station_ids:e.station_ids??[a.station_id,b.station_id]},last=legs.at(-1);
   if(leg.kind==='ride')leg.station_offsets_seconds=leg.station_ids.map((_,i)=>i===0?0:i===leg.station_ids.length-1?leg.seconds:null);
   if(leg.kind==='ride'&&last?.kind==='ride'&&last.line_id===leg.line_id){last.station_offsets_seconds.push(...leg.station_offsets_seconds.slice(1).map(s=>s===null?null:last.seconds+s));last.seconds+=leg.seconds;last.to_station_id=leg.to_station_id;last.station_ids=[...last.station_ids,...leg.station_ids.slice(1)];}else legs.push(leg);
  }
  return {from_station_id:origin,to_station_id:destination,total_seconds:distance.get(best.get(destination)),legs,transfers:legs.filter(l=>l.kind==='transfer'&&!l.same_line_direction_change).length,fare:null,currency:'CNY',warnings:[this.regional.timing_note].filter(Boolean),regional_data_at:this.regional.verified_on};
 }
}
