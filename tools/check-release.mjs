import {audit,releaseFiles} from './release-files.mjs';
const files=await releaseFiles(),issues=await audit(files);
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
else console.log(`发布检查通过：${files.length} 个白名单文件；真实 .env、Git 历史和部署凭据不在发布范围。`);
console.log('扫描只检查文件与常见密钥特征，不代替第三方数据/素材的再分发授权确认。');
