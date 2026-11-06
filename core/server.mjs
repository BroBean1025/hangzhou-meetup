// Portable Node 22+ server. No ChatGPT, Python, npm packages or local API proxy.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {handleApi} from './lib/metro-service.mjs';
import {configuredKey} from './lib/key-config.mjs';

const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.ico':'image/x-icon'};

// Desktop and CLI share the same service; importing this module never opens a port.
export function createMapServer({env=process.env,root=fileURLToPath(new URL('./public/',import.meta.url))}={}){
const staticCache=new Map();
let cachedRoot;
return http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://'+(req.headers.host||'localhost'));
    // Prevent a foreign website from rebinding its hostname onto the local service.
    if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!env.ALLOW_REMOTE_HOST){res.writeHead(403);res.end('Forbidden host');return;}
    if(url.pathname.startsWith('/api/')){
      const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
      // Use the transport peer for local throttling; never trust a caller-supplied IP.
      headers.set('cf-connecting-ip',req.socket.remoteAddress||'local');
      const options={method:req.method,headers};if(!['GET','HEAD'].includes(req.method)){options.body=req;options.duplex='half';}
      const response=await handleApi(new Request(url,options),{AMAP_WEB_SERVICE_KEY:configuredKey(env.AMAP_WEB_SERVICE_KEY)});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
    const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const activeRoot=path.resolve(typeof root==='function'?root():root),file=path.resolve(activeRoot,relative);
    if(activeRoot!==cachedRoot){staticCache.clear();cachedRoot=activeRoot;}
    if(!file.startsWith(activeRoot+path.sep)||!['index.html'].includes(relative)&&!relative.startsWith('assets/')){res.writeHead(404);res.end('Not found');return;}
    let asset=staticCache.get(file);if(!asset){const raw=await readFile(file);const compressed=/\.(html|css|js)$/.test(file)?gzipSync(raw):null;asset={raw,compressed};staticCache.set(file,asset);}
    const zipped=asset.compressed&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':relative==='index.html'?'no-cache':'public, max-age=31536000, immutable','Vary':'Accept-Encoding','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",...(zipped?{'Content-Encoding':'gzip'}:{})});
    res.end(req.method==='HEAD'?undefined:zipped?asset.compressed:asset.raw);
  }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('页面暂不可用');}
});
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8080);
  if(!configuredKey(process.env.AMAP_WEB_SERVICE_KEY))console.log('尚未配置高德 Key：请在 .env 填写 AMAP_WEB_SERVICE_KEY 后重启。');
  createMapServer({env:{...process.env,ALLOW_REMOTE_HOST:host==='0.0.0.0'}}).listen(port,host,()=>console.log('Hangzhou MeetUp · 杭城同行已启动：http://'+(host==='0.0.0.0'?'localhost':host)+':'+port));
}
