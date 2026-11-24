// Invoked by the manual WeChat workflow. Only the temporary project is changed.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createRequire} = require('node:module');
const source = path.resolve(__dirname, '../wechat');

async function run(ci, env) {
  const {WECHAT_TASK:task, WECHAT_APPID:appid, WECHAT_UPLOAD_KEY:privateKey, RUNNER_TEMP:temp} = env;
  const version = env.WECHAT_VERSION?.trim();
  if (!['upload','preview'].includes(task)) throw Error('请选择 preview 或 upload。');
  if (!/^wx[0-9a-f]{16}$/i.test(appid || '')) throw Error('请检查仓库变量 WECHAT_APPID。');
  if (!privateKey?.trim()) throw Error('请设置仓库 Secret WECHAT_UPLOAD_KEY。');
  if (!version) throw Error('请填写开发版本号。');

  const local = require(path.join(source,'miniprogram/config.js'));
  const override = env.WECHAT_API_BASE || env.WECHAT_CLOUD_ENV || env.WECHAT_CLOUD_SERVICE;
  const backend = override ? {
    apiBase:(env.WECHAT_API_BASE || '').trim(), cloudEnv:(env.WECHAT_CLOUD_ENV || '').trim(),
    cloudService:(env.WECHAT_CLOUD_SERVICE || '').trim()
  } : {...local};
  if (backend.cloudEnv || backend.cloudService) {
    if (!backend.cloudEnv || !backend.cloudService) throw Error('微信云托管需要同时填写环境 ID 和服务名。');
    if (override && backend.apiBase) throw Error('请选择云托管或 HTTPS 后端中的一种。');
    backend.apiBase='';
  } else if (!override && backend.apiBase === 'http://127.0.0.1:8080') {
    backend.apiBase='';
  } else if (backend.apiBase) {
    const url = new URL(backend.apiBase);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
      throw Error('WECHAT_API_BASE 需要填写后端的 HTTPS 服务地址。');
  }
  if (!backend.apiBase && !backend.cloudEnv) {
    console.warn('::warning::本次构建可浏览地图；启用手机实时查询需要配置云托管或 HTTPS 后端，并重新构建。');
  }

  const projectPath = await fs.mkdtemp(path.join(temp,'wechat-project-'));
  try {
    const config = JSON.parse(await fs.readFile(path.join(source,'project.config.json'),'utf8'));
    config.appid=appid;
    await fs.cp(path.join(source,'miniprogram'),path.join(projectPath,'miniprogram'),{recursive:true});
    await fs.writeFile(path.join(projectPath,'project.config.json'),JSON.stringify(config));
    await fs.writeFile(path.join(projectPath,'miniprogram/config.js'),'module.exports = '+JSON.stringify(backend)+';\n');
    if (env.WECHAT_CI_PROXY) ci.proxy(env.WECHAT_CI_PROXY);
    const project = new ci.Project({appid,type:'miniProgram',projectPath,privateKey});
    const options = {project,version,robot:1,desc:'杭城同行 '+version+' · '+(env.GITHUB_SHA || '').slice(0,7),setting:{useProjectConfig:true}};
    if (task === 'upload') {
      await ci.upload(options);
      console.log('上传成功。可在微信公众平台的版本管理中查看开发版本。');
    } else {
      await ci.preview({...options,qrcodeFormat:'image',qrcodeOutputDest:path.join(temp,'wechat-preview.jpg')});
      console.log('预览二维码已生成。');
    }
  } finally {
    await fs.rm(projectPath,{recursive:true,force:true});
  }
}

if (require.main === module) {
  const env = process.env;
  const sdk = createRequire(path.join(env.RUNNER_TEMP,'wechat-sdk','package.json'))('miniprogram-ci');
  run(sdk,env).catch(error => {
    console.error('微信 CI 失败：', error.message || '请检查微信公众平台上传配置。');
    process.exitCode=1;
  });
}
module.exports = {run};
