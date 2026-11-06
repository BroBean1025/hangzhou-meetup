import {readFile,writeFile,appendFile} from 'node:fs/promises';
import semver from 'semver';
const pkg=JSON.parse(await readFile('package.json','utf8'));
const run=Number(process.env.GITHUB_RUN_NUMBER);
if(!Number.isSafeInteger(run)||run<1||run>65535)throw Error('GitHub run number must fit a Windows version component');
const base=semver.parse(pkg.version);if(!base)throw Error('Invalid base version');
// Run numbers are monotonic for this workflow; no commit-back or recursive workflow trigger.
pkg.version=`${base.major}.${base.minor}.${run}`;
await writeFile('package.json',JSON.stringify(pkg,null,2)+'\n');
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`version=${pkg.version}\ntag=v${pkg.version}\n`);
console.log(`Desktop release: v${pkg.version}`);
