import {copyFile} from 'node:fs/promises';
import {constants} from 'node:fs';
const root=new URL('../',import.meta.url);
try{await copyFile(new URL('.env.example',root),new URL('.env',root),constants.COPYFILE_EXCL);console.log('已创建 .env。请在本机编辑 AMAP_WEB_SERVICE_KEY，填写自己的 Web 服务 Key。');}
catch(e){if(e.code==='EEXIST')console.log('.env 已存在，保留当前配置。');else throw e;}
console.log('填写后运行 npm run doctor，然后 npm start。不要把 Key 发到聊天、Issue 或 GitHub。');
