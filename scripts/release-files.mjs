import {readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=fileURLToPath(new URL('../',import.meta.url));
const top=new Set(['package.json','README.md','LICENSE','DISCLAIMER.md','THIRD_PARTY_NOTICES.md','SECURITY.md','CONTRIBUTING.md','.env.example','.gitignore','.gitattributes','.dockerignore','Dockerfile','compose.yaml','server.mjs','启动地图.cmd']);
const folders=new Set(['lib','config','tests','src','data','public','scripts','docs','licenses','.github']);
export async function releaseFiles(){
 const files=[];
 async function walk(dir,relative=''){
  for(const e of await readdir(dir,{withFileTypes:true})){
   const name=relative?relative+'/'+e.name:e.name;
   if(!relative&&!top.has(e.name)&&!folders.has(e.name))continue;
   if(e.isSymbolicLink())throw new Error('发布目录不能包含符号链接：'+name);
   if(e.isDirectory())await walk(path.join(dir,e.name),name);
   else if(e.isFile())files.push(name);
  }
 }
 await walk(root);return files.sort();
}
export async function audit(files){
 const issues=[],known=process.env.AMAP_WEB_SERVICE_KEY?.trim();
 for(const file of files){
  if(/(^|\/)(?:\.env(?!\.example$)|\.dev\.vars|\.git(?:\/|$)|node_modules|\.openai|\.wrangler|\.codex|\.agents|cache|logs)(?:\/|$|\.)|\.(?:log|pem|key)$/.test(file))issues.push(file+'：不应发布的本地文件');
  const raw=await readFile(path.join(root,file));
  if(known&&known.length>12&&raw.includes(Buffer.from(known)))issues.push(file+'：包含当前环境的高德 Key');
  if(/\.(png|jpg|jpeg|webp|ico)$/.test(file))continue;
  const text=raw.toString('utf8');
  if(/(?:AMAP_WEB_SERVICE_KEY\s*=|[?&]key=|["'](?:api_key|apikey|token)["']\s*:\s*["'])\s*[a-f0-9]{32,}/i.test(text))issues.push(file+'：疑似硬编码密钥');
  if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text))issues.push(file+'：疑似访问令牌或私钥');
  if(/appgprj_[a-f0-9]{20,}|appgdep_[a-f0-9]{20,}|appgver_[a-f0-9]{20,}|C:[\\/]+Users[\\/]+[^\\/\s]+/i.test(text))issues.push(file+'：包含原部署或个人电脑标识');
 }
 return issues;
}
