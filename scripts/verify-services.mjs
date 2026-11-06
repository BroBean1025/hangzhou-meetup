// One small live request per provider. Never print credentials or full request URLs.
import fs from 'node:fs/promises';
process.loadEnvFile('.env');
const output={checkedAt:new Date().toISOString()};
for(const [name,url] of [
  ['openmetro','https://openmetro.dev/api/networks/cn-hangzhou'],
  ['amap','https://restapi.amap.com/v3/direction/walking?'+new URLSearchParams({key:process.env.AMAP_WEB_SERVICE_KEY,origin:'120.129000,30.267000',destination:'120.136000,30.269000'})]
]){
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(25000)}),data=await response.json();
    output[name]=name==='amap'?{http:response.status,status:data.status,info:data.info,infocode:data.infocode,paths:data.route?.paths?.length??0}:{http:response.status,coordinateSystem:data.coordinate_system,syncedAt:data.synced_at};
  }catch(error){output[name]={error:error.name};}
}
await fs.mkdir('test-artifacts',{recursive:true});await fs.writeFile('test-artifacts/services.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output));
