import {readFile,access} from 'node:fs/promises';
import {configuredKey} from '../core/lib/key-config.mjs';
const base=new URL('../core/',import.meta.url);
const version=process.versions.node.split('.').map(Number);
let ok=version[0]>22||version[0]===22&&version[1]>=13;
console.log('Node.js '+process.versions.node+(ok?'：可用':'：需要 22.13 或更新版本'));
for(const name of ['public/index.html','config/settings.json','config/regional-network.json','config/walking-snapshot.json']){
  try{await access(new URL(name,base));console.log(name+'：存在');}catch{ok=false;console.log(name+'：缺失');}
}
const html=await readFile(new URL('public/index.html',base),'utf8');
for(const [,file] of html.matchAll(/(?:src|href)="\/(assets\/[^\"]+)"/g))try{await access(new URL('public/'+file,base));}catch{ok=false;console.log('缺少页面资源：'+file);}
console.log(configuredKey(process.env.AMAP_WEB_SERVICE_KEY)?'高德 Key：已填写（只检查配置，不验证账户或配额）':'高德 Key：未填写；学校接驳和地图任意选点通常需要它。');
console.log('诊断不会输出 Key，也不会请求高德。');
if(!ok)process.exitCode=1;
