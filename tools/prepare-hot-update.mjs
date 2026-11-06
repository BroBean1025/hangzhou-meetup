import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import semver from 'semver';
import {sha256,decodeBundle,MAX_BUNDLE} from '../desktop/hot-updates.mjs';

export function classifyChanges(changes){
  let lines=0,uiFiles=0;
  for(const {name,added,removed} of changes){
    if(/^core\/src\/[^/]+\.(js|css|html)$/.test(name)&&!/^core\/src\/desktop-/.test(name)){uiFiles++;if(!Number.isFinite(added+removed))return 'cold';lines+=added+removed;}
    else if(!/^(?:core\/public\/|docs\/|README\.md$|tools\/tests\/)/.test(name))return 'cold';
  }
  return uiFiles>0&&uiFiles<=5&&lines<=80?'hot':'cold';
}
export async function fingerprint(root){
  const entries=[];
  async function walk(relative){
    for(const e of (await readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
      const name=relative+'/'+e.name;if(e.isSymbolicLink())throw Error('No symlinks in shell inputs');
      if(e.isDirectory())await walk(name);
      else if(!name.endsWith('.md')&&name!=='desktop/runtime.json')entries.push(name);
    }
  }
  for(const dir of ['desktop','core/lib','core/config','core/data','core/src/vendor'])await walk(dir);
  entries.push('core/server.mjs','core/src/desktop-settings.js','core/src/desktop-updates.js','tools/build.mjs','tools/prepare-hot-update.mjs','pnpm-lock.yaml');
  const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8'));pkg.version=pkg.version.split('.').slice(0,2).join('.');
  const records=[JSON.stringify(pkg)];
  for(const name of entries.sort()){
    let data=await readFile(path.join(root,name));if(/\.(?:mjs|cjs|js|css|json|yaml|svg)$/.test(name))data=Buffer.from(data.toString().replaceAll('\r\n','\n'));
    records.push(name+':'+sha256(data));
  }
  return sha256(records.join('\n'));
}
export async function prepare({root=process.cwd(),base=process.env.UPDATE_BASE,previousFile=process.env.UPDATE_PREVIOUS,requested=process.env.UPDATE_MODE||'auto'}={}){
  const pkg=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')),version=pkg.version,hash=await fingerprint(root);
  let mode='cold';
  if(base){
    const diff=execFileSync('git',['diff','--numstat','--no-renames',base,'HEAD','--'],{cwd:root,encoding:'utf8'});
    mode=classifyChanges(diff.trim().split('\n').filter(Boolean).map(line=>{const [a,r,name]=line.split('\t');return {name,added:Number(a),removed:Number(r)};}));
  }
  let previous;try{if(previousFile)previous=JSON.parse(await readFile(previousFile,'utf8'));}catch{}
  // A skipped cold release must never be silently crossed by a later hot patch.
  if(!previous||previous.version!==base?.replace(/^v/,'')||previous.fingerprint!==hash||!semver.valid(previous.minimumShellVersion))mode='cold';
  if(requested==='cold')mode='cold';
  if(requested==='hot'&&mode!=='hot')throw Error('Hot release rejected: changes exceed the compatible UI patch boundary');
  await writeFile(path.join(root,'desktop/runtime.json'),JSON.stringify({schema:1,version,fingerprint:hash})+'\n');
  const out=path.join(root,'desktop-output');await mkdir(out,{recursive:true});
  const files=[];
  for(const name of ['index.html',...(await readdir(path.join(root,'core/public/assets'))).sort().map(n=>'assets/'+n)])files.push({name,data:(await readFile(path.join(root,'core/public',name))).toString('base64')});
  const bundle=gzipSync(JSON.stringify({schema:1,version,fingerprint:hash,files}),{level:9});
  if(bundle.length>MAX_BUNDLE)mode='cold';
  const manifest={schema:1,version,mode,minimumShellVersion:mode==='hot'?previous.minimumShellVersion:version,fingerprint:hash,size:bundle.length,sha256:sha256(bundle)};
  decodeBundle(bundle,manifest);
  await writeFile(path.join(out,`HangzhouMeetUp-UI-${version}.json.gz`),bundle);
  await writeFile(path.join(out,'hot-update.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Update ${version}: ${mode}, UI ${(bundle.length/1024/1024).toFixed(2)} MiB, shell ${hash.slice(0,12)}`);
  return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepare();
