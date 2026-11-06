// Rebuild from editable sources with Node built-ins only. No provider requests.
import {readFile,writeFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../core/',import.meta.url)),out=path.join(root,'public/assets');
await mkdir(out,{recursive:true});
const keep=new Set(),refs=new Map();
async function asset(label,raw,ext){
  if(ext==='.js'||ext==='.css')raw=raw.toString().replaceAll('\r\n','\n');
  const hash=createHash('sha256').update(raw).digest('hex').slice(0,12);
  const name=label.replaceAll('/','-')+'.'+hash+ext;keep.add(name);
  await writeFile(path.join(out,name),raw);return '/assets/'+name;
}
const data=JSON.parse(await readFile(path.join(root,'data/map.json'),'utf8'));
for(const c of data.campuses){
  if(!c.logo?.startsWith('local-logo:'))continue;
  const name=c.logo.slice('local-logo:'.length);
  if(!/^school-\d+\.png$/.test(name))throw new Error('Invalid local logo filename');
  c.logo=await asset(name.slice(0,-4),await readFile(path.join(root,'data',name)),'.png');
}
const geo=JSON.parse(await readFile(path.join(root,'data/geography.json'),'utf8'));
const safeJson=x=>JSON.stringify(x).replaceAll('<','\\u003c');
refs.set('map-data.js',await asset('map-data',`document.getElementById('dataset').textContent=${JSON.stringify(safeJson(data))};\ndocument.getElementById('geography').textContent=${JSON.stringify(safeJson(geo))};`,'.js'));
const names=['vendor/leaflet.js','vendor/leaflet.css','commute-map.js','commute-map.css','destination-layout.css','destination-picker.js','map-icons.js','station-catalog.js','trip-time.js','trip-time.css','trip-planner-ui.js','window-layout.css','desktop-settings.js','desktop-updates.js'];
for(const name of names)refs.set(name,await asset(name.slice(0,name.lastIndexOf('.')),await readFile(path.join(root,'src',name)),path.extname(name)));
let html=await readFile(path.join(root,'src/index.html'),'utf8');
html=html.replaceAll('\r\n','\n');
html=html.replace(/@@([^@]+)@@/g,(_,name)=>{if(!refs.has(name))throw new Error('Missing source: '+name);return refs.get(name);});
await writeFile(path.join(root,'public/index.html'),html);
// Only our exact hash-named build outputs can be pruned, inside public/assets.
for(const name of await readdir(out))if(!keep.has(name)&&/^[\w-]+\.[a-f0-9]{12}\.(js|css|png)$/.test(name))await unlink(path.join(out,name));
console.log(`Built ${keep.size} assets; provider requests: 0.`);
