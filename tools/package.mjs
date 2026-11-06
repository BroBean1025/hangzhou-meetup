import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {root,releaseFiles,audit} from './release-files.mjs';
const files=await releaseFiles(),issues=await audit(files);
if(issues.length)throw new Error(issues.join('\n'));
const output=path.join(root,'releases');await mkdir(output,{recursive:true});
const archive=path.join(output,'hangzhou-meetup-source.tar.gz'),blocks=[];
// Small deterministic ustar writer: regular files only, UTF-8 paths, no shell,
// symlinks or platform tar dependency. Current allowlisted names fit 100 bytes.
for(const file of files){
 const name=Buffer.from('hangzhou-meetup/'+file,'utf8');
 if(name.length>100)throw new Error('归档路径过长：'+file);
 const raw=await readFile(path.join(root,file)),h=Buffer.alloc(512);
 name.copy(h);const octal=(n,start,width)=>h.write(n.toString(8).padStart(width-1,'0')+'\0',start,width,'ascii');
 octal(0o644,100,8);octal(0,108,8);octal(0,116,8);octal(raw.length,124,12);octal(0,136,12);
 h.fill(32,148,156);h[156]=48;h.write('ustar\0',257,'ascii');h.write('00',263,'ascii');
 const sum=h.reduce((n,b)=>n+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');
 blocks.push(h,raw,Buffer.alloc((512-raw.length%512)%512));
}
blocks.push(Buffer.alloc(1024));await writeFile(archive,gzipSync(Buffer.concat(blocks),{level:9}));
console.log('已打包：'+archive);
