export const ACCESS_EXTRA_SECONDS=300,ACCESS_EXTRA_METERS=500,TRANSFER_EXTRA_SECONDS=600;
export function practicalAccess(options,mode){
 const valid=options.filter(o=>Number.isFinite(o.walk?.seconds));if(mode!=='walk'||valid.length<2)return valid;
 const nearest=valid.reduce((a,b)=>a.walk.seconds<=b.walk.seconds?a:b);
 // Compare actual walking routes, not straight-line station distances. If all
 // stations are far away, retain the closest feasible one rather than fail.
 return valid.filter(o=>o.walk.seconds<=nearest.walk.seconds+ACCESS_EXTRA_SECONDS&&(!Number.isFinite(nearest.walk.distance_m)||!Number.isFinite(o.walk.distance_m)||o.walk.distance_m<=nearest.walk.distance_m+ACCESS_EXTRA_METERS));
}
export function outdoorWalking(route){
 return (route.access_mode==='walk'?route.access_seconds??0:0)+(route.egress_seconds??0)+(route.cross_station_seconds??0);
}
export function practicalTransferChoices(routes,fastest){
 return routes.filter(r=>r.total_seconds<=fastest.total_seconds+TRANSFER_EXTRA_SECONDS&&outdoorWalking(r)<=outdoorWalking(fastest)+ACCESS_EXTRA_SECONDS);
}
