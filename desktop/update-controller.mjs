import semver from 'semver';

export const RELEASES_URL='https://github.com/BroBean1025/hangzhou-meetup/releases';
export function localDay(date){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
export function updateMessage(error){
  const code=String(error?.code??'');
  if(code==='ERR_UPDATER_NO_PUBLISHED_VERSIONS')return '仓库尚未发布桌面版本。发布完成后可以再次检查。';
  if(/CHANNEL_FILE_NOT_FOUND|LATEST_VERSION_NOT_FOUND/.test(code))return '仓库中的桌面更新文件尚未准备好，请稍后再试。';
  if(/CHECKSUM|SIGNATURE/.test(code))return '更新包校验失败，已停止安装。请重新下载或查看发布页面。';
  return '暂时无法完成更新，请确认网络能够访问 GitHub 后重试。地图仍可正常使用。';
}
function notes(info){
  const text=Array.isArray(info?.releaseNotes)?info.releaseNotes.map(n=>n.note??'').join('\n'):info?.releaseNotes??'';
  return String(text).replace(/<[^>]*>/g,'').slice(0,6000);
}

// No Electron globals: the daily gate and state transitions are tested offline.
export class UpdateController {
  constructor({updater,version,shellVersion=version,hot=null,read=()=>({}),write=async()=>{},notify=()=>{},now=()=>new Date(),portable=false,enabled=true,beforeInstall=async()=>{},openExternal=async()=>{}}){
    Object.assign(this,{updater,version,hot,read,write,notify,now,portable,enabled,beforeInstall,openExternal});
    const saved=read(),newer=semver.valid(saved.availableVersion)&&semver.gt(saved.availableVersion,version);
    this.state={phase:newer?'available':'idle',currentVersion:version,shellVersion,kind:'cold',size:null,availableVersion:newer?saved.availableVersion:null,releaseNotes:newer?saved.releaseNotes??'':'',progress:0,lastCheckedAt:saved.lastCheckedAt??null,portable,message:newer?'发现新版 '+saved.availableVersion:'每天首次打开时自动检查，也可以随时手动检查。'};
    updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowDowngrade=false;updater.allowPrerelease=false;updater.disableWebInstaller=true;
    updater.on('download-progress',progress=>this.set({phase:'downloading',progress:Math.min(100,Math.max(0,Number(progress.percent)||0)),message:'正在下载更新…'}));
    updater.on('update-downloaded',()=>this.set({phase:'downloaded',progress:100,message:'更新已下载并校验。点击“重启并安装”完成更新。'}));
    updater.on('error',error=>this.set({phase:'error',message:updateMessage(error)}));
  }
  snapshot(){return {...this.state};}
  set(patch){Object.assign(this.state,patch);this.notify(this.snapshot());return this.snapshot();}
  async check({manual=false}={}){
    if(this.checkPromise)return this.checkPromise;
    if(['downloading','downloaded','installing'].includes(this.state.phase))return this.snapshot();
    if(!this.enabled)return this.set({phase:'disabled',message:'开发运行不检查线上更新；请在安装后的应用中使用。'});
    const now=this.now(),day=localDay(now),saved=this.read();
    if(!manual&&saved.lastAutoCheckDay===day&&saved.lastAutoCheckVersion===this.version)return this.snapshot();
    // Reserve the attempt before awaiting I/O, including concurrent focus/start events.
    this.checkPromise=this.performCheck({now,day});
    try{return await this.checkPromise;}finally{this.checkPromise=null;}
  }
  async performCheck({now,day}){
    this.checked=false;
    this.set({phase:'checking',message:'正在检查 GitHub 上的新版本…'});
    try{
      await this.write({lastAutoCheckDay:day,lastAutoCheckVersion:this.version});
      const result=await this.updater.checkForUpdates(),info=result?.updateInfo;
      if(!info||!semver.valid(info.version))throw Error('Invalid update manifest');
      this.checked=true;
      const available=semver.gt(info.version,this.version)&&semver.prerelease(info.version)===null;
      this.manifest=available?await this.hot?.find(info.version):null;
      const patch={lastCheckedAt:now.toISOString(),availableVersion:available?info.version:null,releaseNotes:available?notes(info):''};
      await this.write(patch);
      return this.set({...patch,kind:this.manifest?'hot':'cold',size:this.manifest?.size??null,progress:0,phase:available?'available':'current',message:available?'发现新版 '+info.version+(this.manifest?' · 轻量界面补丁':' · 完整程序更新'):'当前已是最新版本。'});
    }catch(error){return this.set({phase:'error',message:updateMessage(error)});}
  }
  async download(){
    if(this.downloadPromise||['downloading','downloaded','installing'].includes(this.state.phase))return this.downloadPromise??this.snapshot();
    this.downloadPromise=this.performDownload();
    try{return await this.downloadPromise;}finally{this.downloadPromise=null;}
  }
  async performDownload(){
    if(!this.checked)await this.check({manual:true});
    if(!this.checked||!this.state.availableVersion||!['available','error'].includes(this.state.phase))return this.snapshot();
    if(this.manifest){
      this.set({phase:'downloading',progress:0,message:'正在下载界面补丁…'});
      try{
        await this.hot.download(this.manifest,progress=>this.set({progress}));
        return this.set({phase:'downloaded',progress:100,message:'补丁已下载并校验。点击“应用补丁并刷新”后生效，当前路线会重新加载。'});
      }catch{return this.set({phase:'error',message:'界面补丁下载或校验失败，尚未应用。请重试或从发布页面下载完整版本。'});}
    }
    if(this.portable){
      await this.openExternal(`${RELEASES_URL}/download/v${this.state.availableVersion}/HangzhouMeetUp-Portable-${this.state.availableVersion}.exe`);
      return this.set({message:'已打开新版免安装包的下载地址。下载完成后关闭当前程序，替换旧 EXE 即可。'});
    }
    this.set({phase:'downloading',progress:0,message:'正在下载更新…'});
    try{await this.updater.downloadUpdate();return this.snapshot();}
    catch(error){return this.set({phase:'error',message:updateMessage(error)});}
  }
  async install(){
    if(this.state.phase!=='downloaded')return this.snapshot();
    if(this.manifest){
      this.set({phase:'installing',message:'正在刷新界面并检查补丁…'});
      try{
        await this.beforeInstall();this.version=await this.hot.apply();this.checked=false;this.manifest=null;
        await this.write({availableVersion:null,releaseNotes:''});
        return this.set({phase:'current',currentVersion:this.version,availableVersion:null,releaseNotes:'',progress:0,message:'界面补丁已生效，客户端无需重启。'});
      }catch{this.manifest=null;this.checked=false;return this.set({phase:'error',kind:'cold',message:'补丁未能正常加载，已恢复之前的界面。可重新检查并下载完整版本。'});}
    }
    if(this.portable)return this.snapshot();
    this.set({phase:'installing',message:'正在保存设置并重启安装…'});
    try{await this.beforeInstall();this.updater.quitAndInstall(true,true);}
    catch(error){this.set({phase:'error',message:updateMessage(error)});}
    return this.snapshot();
  }
  async resetHot(){
    if(!this.hot||['checking','downloading','installing'].includes(this.state.phase))return this.snapshot();
    this.set({phase:'installing',message:'正在恢复随程序安装的界面…'});
    try{
      this.version=await this.hot.reset();this.manifest=null;this.checked=false;
      await this.write({availableVersion:null,releaseNotes:''});
      return this.set({phase:'idle',kind:'cold',currentVersion:this.version,availableVersion:null,releaseNotes:'',message:'已恢复随程序安装的界面，个人设置已保留。'});
    }catch{return this.set({phase:'error',message:'界面恢复未完成，请关闭程序后重新打开。'});}
  }
}
