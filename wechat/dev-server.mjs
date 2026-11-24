import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createMapServer} from '../core/server.mjs';
import {configuredKey} from '../core/lib/key-config.mjs';

let key=configuredKey(process.env.AMAP_WEB_SERVICE_KEY);
if(!key && process.platform==='win32' && process.env.APPDATA){
  try{
    const settings=JSON.parse(await readFile(path.join(process.env.APPDATA,'HangzhouMeetUp','settings.json'),'utf8'));
    key=configuredKey(settings.amapKey);
  }catch(error){
    if(error.code!=='ENOENT')console.warn('桌面设置无法读取，可在服务环境变量中配置高德 Key。');
  }
}
const service=createMapServer({env:{AMAP_WEB_SERVICE_KEY:key}});
service.on('error',error=>{
  console.error(error.code==='EADDRINUSE'?'8080 端口已被占用。若已有杭城同行服务，可直接导入小程序；否则请先释放此端口。':'本地服务启动失败。');
  process.exitCode=1;
});
service.listen(8080,'127.0.0.1',()=>{
  console.log('微信开发者工具联调地址 http://127.0.0.1:8080');
  console.log(key?'已启用高德接驳。':'可查询地铁站间路线。校门及任意选点接驳需要服务端高德 Web 服务 Key。');
});
