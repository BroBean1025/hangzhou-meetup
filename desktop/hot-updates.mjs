import {readFile,writeFile,mkdir,rename,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import semver from 'semver';

export const RELEASE_ROOT='https://github.com/BroBean1025/hangzhou-meetup/releases/download';
export const MAX_BUNDLE=8*1024*1024,MAX_EXPANDED=32*1024*1024;
export const sha256=data=>createHash('sha256').update(data).digest('hex');
const safeVersion=v=>typeof v==='string'&&semver.valid(v)===v&&!semver.prerelease(v)&&/^\d+\.\d+\.\d+$/.test(v);
const safeFile=name=>name==='index.html'||/^assets\/[\w-]+\.[a-f0-9]{12}\.(js|css|png)$/.test(name);
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function validateManifest(m,{version,fingerprint,shellVersion}){
  if(m?.schema!==1||m.mode!=='hot'||!safeVersion(m.version)||m.version!==version||!safeVersion(m.minimumShellVersion)||!safeVersion(shellVersion)||semver.gt(m.minimumShellVersion,shellVersion)||semver.gt(m.minimumShellVersion,m.version)||m.fingerprint!==fingerprint||!validHash(m.fingerprint)||!validHash(m.sha256)||!Number.isSafeInteger(m.size)||m.size<1||m.size>MAX_BUNDLE)throw Error('Incompatible patch');
  return m;
}
export function decodeBundle(buffer,manifest){
  if(buffer.length!==manifest.size||sha256(buffer)!==manifest.sha256)throw Error('Patch checksum mismatch');
  const bundle=JSON.parse(gunzipSync(buffer,{maxOutputLength:MAX_EXPANDED}));
  if(bundle.schema!==1||bundle.version!==manifest.version||bundle.fingerprint!==manifest.fingerprint||!Array.isArray(bundle.files)||bundle.files.length<2||bundle.files.length>100)throw Error('Invalid patch bundle');
  const files=new Map();let total=0;
  for(const entry of bundle.files){
    if(!safeFile(entry.name)||files.has(entry.name)||typeof entry.data!=='string'||entry.data.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(entry.data))throw Error('Invalid patch path or encoding');
    const data=Buffer.from(entry.data,'base64');total+=data.length;if(total>MAX_EXPANDED)throw Error('Patch too large');files.set(entry.name,data);
  }
  const html=files.get('index.html')?.toString();if(!html)throw Error('Missing index');
  const assets=[...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)].map(m=>m[1].slice(1));
  if(!assets.length||assets.some(name=>!files.has(name)))throw Error('Incomplete patch assets');
  // Hash-named files must be immutable across versions, including the browser cache.
  for(const [name,data] of files)if(name!=='index.html'&&!name.includes('.'+sha256(data).slice(0,12)+'.'))throw Error('Asset hash mismatch');
  return files;
}
async function atomicJson(file,value){
  const temporary=file+'.'+randomUUID()+'.tmp';
  await writeFile(temporary,JSON.stringify(value));await rename(temporary,file);
}
async function json(file){try{return JSON.parse(await readFile(file,'utf8'));}catch{return null;}}

export class HotUpdates {
  constructor({directory,bundledRoot,version,fingerprint,fetch,reload=async()=>{}}){
    Object.assign(this,{directory,bundledRoot,version,fingerprint,fetch,reload});
    this.pointer=path.join(directory,'active.json');this.active=null;this.record={};
  }
  get root(){return this.active?path.join(this.directory,this.active):this.bundledRoot;}
  get currentVersion(){return this.active??this.version;}
  child(name){
    const root=path.resolve(this.directory),target=path.resolve(root,name);
    if(!target.startsWith(root+path.sep)||(!safeVersion(name)&&!/^staging-[a-f0-9-]{36}$/.test(name)))throw Error('Invalid cache directory');
    return target;
  }
  async prune(){
    const keep=new Set([this.active,this.record.previous,this.staged]);
    for(const e of await readdir(this.directory,{withFileTypes:true}))if(e.isDirectory()&&!keep.has(e.name)&&(safeVersion(e.name)||/^staging-[a-f0-9-]{36}$/.test(e.name)))await rm(this.child(e.name),{recursive:true,force:true});
  }
  async validStored(version){
    if(!safeVersion(version)||!semver.gt(version,this.version))return false;
    const dir=path.join(this.directory,version),record=await json(path.join(dir,'files.json'));
    if(record?.fingerprint!==this.fingerprint||!safeVersion(record.minimumShellVersion)||semver.gt(record.minimumShellVersion,this.version)||!Array.isArray(record.files)||record.files.length<2||record.files.length>100)return false;
    if(!record.files.some(f=>f.name==='index.html'))return false;
    try{for(const f of record.files)if(!safeFile(f.name)||!validHash(f.hash)||sha256(await readFile(path.join(dir,f.name)))!==f.hash)return false;}catch{return false;}
    return true;
  }
  async initialize(){
    await mkdir(this.directory,{recursive:true});this.record=await json(this.pointer)??{};
    if(this.record.pending){this.record.blocked=this.record.current;this.record.current=this.record.previous??null;this.record.pending=false;}
    if(await this.validStored(this.record.current))this.active=this.record.current;
    else if(await this.validStored(this.record.previous))this.active=this.record.previous;
    this.record.current=this.active;await atomicJson(this.pointer,this.record);await this.prune().catch(()=>{});return this.currentVersion;
  }
  async request(url,limit,onProgress=()=>{}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
    try{
      const response=await this.fetch(url,{signal:controller.signal,cache:'no-store'});
      if(!response.ok||Number(response.headers.get('content-length'))>limit)throw Error('Patch unavailable');
      const chunks=[];let length=0;
      for await(const chunk of response.body){length+=chunk.length;if(length>limit){controller.abort();throw Error('Patch too large');}chunks.push(Buffer.from(chunk));onProgress(length);}
      return Buffer.concat(chunks);
    }finally{clearTimeout(timer);}
  }
  async find(version){
    if(!safeVersion(version)||!semver.gt(version,this.currentVersion)||version===this.record.blocked)return null;
    try{
      const manifest=JSON.parse(await this.request(`${RELEASE_ROOT}/v${version}/hot-update.json`,16384));
      return validateManifest(manifest,{version,fingerprint:this.fingerprint,shellVersion:this.version});
    }catch{return null;} // Older releases and incompatible shells use the full installer.
  }
  async download(manifest,onProgress=()=>{}){
    validateManifest(manifest,{version:manifest.version,fingerprint:this.fingerprint,shellVersion:this.version});
    if(!semver.gt(manifest.version,this.currentVersion))throw Error('Patch must be newer');
    const buffer=await this.request(`${RELEASE_ROOT}/v${manifest.version}/HangzhouMeetUp-UI-${manifest.version}.json.gz`,manifest.size,bytes=>onProgress(bytes/manifest.size*100));
    const files=decodeBundle(buffer,manifest),target=this.child(manifest.version);
    const staging=this.child('staging-'+randomUUID());await mkdir(path.join(staging,'assets'),{recursive:true});
    try{
      for(const [name,data] of files)await writeFile(path.join(staging,name),data);
      await writeFile(path.join(staging,'files.json'),JSON.stringify({fingerprint:this.fingerprint,minimumShellVersion:manifest.minimumShellVersion,files:[...files].map(([name,data])=>({name,hash:sha256(data)}))}));
      // Only this validated version directory, never user settings or the active UI.
      if(manifest.version===this.active)throw Error('Cannot replace active patch');
      await rm(target,{recursive:true,force:true});await rename(staging,target);this.staged=manifest.version;
    }finally{await rm(staging,{recursive:true,force:true});}
  }
  async apply(){
    if(!this.staged||!await this.validStored(this.staged))throw Error('No verified patch');
    const previous=this.active,candidate=this.staged;this.staged=null;
    this.record={...this.record,current:candidate,previous,pending:true};await atomicJson(this.pointer,this.record);this.active=candidate;
    try{await this.reload();this.record.pending=false;await atomicJson(this.pointer,this.record);await this.prune().catch(()=>{});return this.currentVersion;}
    catch(error){
      this.active=previous;this.record={...this.record,current:previous,previous:null,pending:false,blocked:candidate};await atomicJson(this.pointer,this.record);await this.reload();throw error;
    }
  }
  async reset(){
    this.record={current:null,previous:null,pending:false,blocked:this.active??this.record.blocked};this.active=null;this.staged=null;
    await atomicJson(this.pointer,this.record);await this.reload();return this.currentVersion;
  }
}
