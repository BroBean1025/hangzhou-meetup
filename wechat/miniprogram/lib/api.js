const config = require('../config');
const cache = new Map();
const pending = new Map();
const queue = [];
let active = 0;
function pump() {
  while (active < 4 && queue.length) {
    active++;
    const run = queue.shift();
    run().finally(() => {active--; pump();});
  }
}
function request(path, data) {
  return new Promise((resolve,reject) => {
    const options = {path, method:'POST', data, header:{'content-type':'application/json'}, timeout:60000,
      success(reply) {
        const body = reply.data;
        if (reply.statusCode !== 200 || !body || typeof body !== 'object') {
          reject(Error(body?.error || '查询服务未返回有效结果，请检查服务地址。'));
        } else resolve(body);
      },
      fail() { reject(Error('连接查询服务失败，请检查网络与服务配置。')); }
    };
    if (config.cloudService || config.cloudEnv) {
      if (!config.cloudService || !config.cloudEnv || !wx.cloud) return reject(Error('请配置云环境和云托管服务名。'));
      options.header['X-WX-SERVICE'] = config.cloudService;
      const {success,fail,...call}=options;
      wx.cloud.callContainer({...call,config:{env:config.cloudEnv}}).then(success,fail);
    } else {
      if (!config.apiBase) return reject(Error('此版本尚未接入手机查询后端，可先浏览地图。'));
      const {path:route,...rest}=options;
      wx.request({...rest,url:config.apiBase.replace(/\/$/,'')+route});
    }
  });
}
function post(path, data) {
  const key = JSON.stringify([path,data]), saved = cache.get(key);
  if (saved && saved.until > Date.now()) return Promise.resolve(saved.value);
  if (pending.has(key)) return pending.get(key);
  const job = new Promise((resolve,reject) => queue.push(async () => {
    try {
      const value = await request(path,data);
      if (value.complete !== false && !value.errors?.length && !value.results?.some(r=>r.gate_errors?.length||r.preference_warning)) {
        if (cache.size >= 64) cache.delete(cache.keys().next().value);
        cache.set(key,{value,until:Date.now()+Math.min(300,value.valid_for_seconds||300)*1000});
      }
      resolve(value);
    } catch(e) { reject(e); } finally {pending.delete(key);}
  }));
  pending.set(key,job); pump(); return job;
}
module.exports = {post};
