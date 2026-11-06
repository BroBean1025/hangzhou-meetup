import {app,BrowserWindow,Menu,ipcMain,dialog,shell,screen,session} from 'electron';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createMapServer} from '../server.mjs';
import {configuredKey} from '../lib/key-config.mjs';
import electronUpdater from 'electron-updater';
import {UpdateController,RELEASES_URL} from './update-controller.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const testing=process.env.MEETUP_TEST==='1';
app.setName('杭城同行');
app.setAppUserModelId('com.hangzhou.meetup');
app.setPath('userData',process.env.MEETUP_USER_DATA||path.join(app.getPath('appData'),'HangzhouMeetUp'));
const profile=app.getPath('userData'),settingsPath=path.join(profile,'settings.json');
let settings={},mainWindow,server,origin,updates;
const runtimeEnv={};
let writeQueue=Promise.resolve();
function saveSettings(){
  const content=JSON.stringify(settings,null,2);
  writeQueue=writeQueue.catch(()=>{}).then(async()=>{await mkdir(profile,{recursive:true});await writeFile(settingsPath,content,'utf8');});
  return writeQueue;
}
function trusted(event){return event.sender===mainWindow?.webContents&&event.senderFrame===mainWindow.webContents.mainFrame&&new URL(event.senderFrame.url).origin===origin;}
async function openExternal(url){try{if(new URL(url).protocol==='https:')await shell.openExternal(url);}catch{}}
function settingsDialog(){mainWindow?.webContents.send('desktop:settings');}
function updateDialog(){mainWindow?.webContents.send('desktop:show-updates');}
function dailyUpdateCheck(){if(!testing)updates?.check().catch(()=>{});}
async function startServer(port){
  const candidate=createMapServer({env:runtimeEnv});
  await new Promise((resolve,reject)=>{candidate.once('error',reject);candidate.listen(port,'127.0.0.1',resolve);});
  return candidate;
}
function createWindow(){
  const work=screen.getPrimaryDisplay().workArea;
  const previous=settings.window??{};
  const width=Math.min(work.width,Math.max(480,previous.width||Math.round(Math.min(1440,work.width*.93))));
  const height=Math.min(work.height,Math.max(480,previous.height||Math.round(Math.min(940,work.height*.93))));
  const onScreen=Number.isFinite(previous.x)&&Number.isFinite(previous.y)&&screen.getAllDisplays().some(({workArea:r})=>previous.x>=r.x&&previous.y>=r.y&&previous.x+width<=r.x+r.width&&previous.y+height<=r.y+r.height);
  mainWindow=new BrowserWindow({
    width,height,minWidth:Math.min(480,work.width),minHeight:Math.min(480,work.height),
    ...(onScreen?{x:previous.x,y:previous.y}:{}),
    show:false,title:'杭城同行 · Hangzhou MeetUp',backgroundColor:'#f5f0e5',
    icon:path.join(here,'icon.ico'),autoHideMenuBar:true,
    webPreferences:{preload:path.join(here,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:!testing,zoomFactor:Math.min(1.5,Math.max(.75,settings.zoom||1))}
  });
  mainWindow.webContents.setWindowOpenHandler(({url})=>{openExternal(url);return {action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin){event.preventDefault();openExternal(url);}});
  mainWindow.webContents.on('will-attach-webview',event=>event.preventDefault());
  mainWindow.once('ready-to-show',()=>{if(previous.maximized)mainWindow.maximize();if(!testing)mainWindow.show();});
  mainWindow.on('close',()=>{
    settings.window={...mainWindow.getNormalBounds(),maximized:mainWindow.isMaximized()};
    settings.zoom=mainWindow.webContents.getZoomFactor();
    saveSettings();
  });
  mainWindow.on('closed',()=>{mainWindow=null;});
  mainWindow.on('focus',dailyUpdateCheck);
  mainWindow.loadURL(origin).catch(error=>{console.error('Window load failed:',error.message);if(!testing)dialog.showErrorBox('地图加载失败',error.message);});
}

if(!app.requestSingleInstanceLock())app.quit();
else{
  app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();dailyUpdateCheck();}});
  app.whenReady().then(async()=>{
    await mkdir(profile,{recursive:true});
    try{settings=JSON.parse(await readFile(settingsPath,'utf8'));}catch{}
    if(!app.isPackaged){try{process.loadEnvFile(path.join(here,'../.env'));}catch{}}
    runtimeEnv.AMAP_WEB_SERVICE_KEY=configuredKey(settings.amapKey)||configuredKey(process.env.AMAP_WEB_SERVICE_KEY);
    // Reuse the origin so browser preferences survive launches; recover if the port is occupied.
    try{server=await startServer(Number.isInteger(settings.port)?settings.port:17823);}catch(error){if(error.code!=='EADDRINUSE')throw error;server=await startServer(0);}
    settings.port=server.address().port;origin='http://127.0.0.1:'+settings.port;
    await saveSettings();
    session.defaultSession.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
    session.defaultSession.setPermissionCheckHandler(()=>false);
    const {autoUpdater}=electronUpdater;
    autoUpdater.logger={info(){},warn(){},error(){},debug(){}};
    updates=new UpdateController({
      updater:autoUpdater,version:app.getVersion(),enabled:app.isPackaged,
      portable:!!process.env.PORTABLE_EXECUTABLE_FILE,
      read:()=>settings.updates??{},
      write:async patch=>{settings.updates={...settings.updates,...patch};await saveSettings();},
      notify:state=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('desktop:update-state',state);},
      beforeInstall:async()=>{
        if(mainWindow){settings.window={...mainWindow.getNormalBounds(),maximized:mainWindow.isMaximized()};settings.zoom=mainWindow.webContents.getZoomFactor();}
        await saveSettings();
      },openExternal
    });
    for(const [channel,handler] of Object.entries({
      'desktop:update-status':()=>updates.snapshot(),
      'desktop:check-updates':()=>updates.check({manual:true}),
      'desktop:download-update':()=>updates.download(),
      'desktop:install-update':()=>updates.install(),
      'desktop:release-page':()=>openExternal(RELEASES_URL)
    }))ipcMain.handle(channel,(event)=>{if(!trusted(event))throw Error('不支持此请求');return handler();});
    ipcMain.handle('desktop:status',event=>{
      if(!trusted(event))throw Error('不支持此请求');
      const key=runtimeEnv.AMAP_WEB_SERVICE_KEY;
      return {configured:!!key,keyHint:key?'•••• '+key.slice(-4):'',version:app.getVersion()};
    });
    ipcMain.handle('desktop:save-key',async(event,value)=>{
      if(!trusted(event)||typeof value!=='string'||!/^[a-f\d]{32}$/i.test(value.trim()))throw Error('请填写 32 位高德 Web 服务 Key');
      settings.amapKey=value.trim();await saveSettings();runtimeEnv.AMAP_WEB_SERVICE_KEY=settings.amapKey;return true;
    });
    // Persist only app preferences, independently of the loopback port.
    ipcMain.handle('desktop:read-preferences',event=>trusted(event)?settings.preferences??{}:{});
    ipcMain.on('desktop:write-preferences',(event,value)=>{
      if(!trusted(event)||!value||typeof value!=='object')return;
      settings.preferences=Object.fromEntries(Object.entries(value).filter(([key,v])=>['hangzhou-origins-v2','hangzhou-trip-buffer-v1'].includes(key)&&typeof v==='string'&&v.length<100000));saveSettings();
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'应用',submenu:[{label:'高德服务设置…',click:settingsDialog},{type:'separator'},{label:'退出',role:'quit'}]},
      {label:'编辑',submenu:[{label:'撤销',role:'undo'},{label:'重做',role:'redo'},{type:'separator'},{label:'剪切',role:'cut'},{label:'复制',role:'copy'},{label:'粘贴',role:'paste'},{label:'全选',role:'selectAll'}]},
      {label:'视图',submenu:[{label:'刷新地图',role:'reload'},{type:'separator'},{label:'放大界面',role:'zoomIn'},{label:'缩小界面',role:'zoomOut'},{label:'恢复默认大小',role:'resetZoom'},{type:'separator'},{label:'全屏',role:'togglefullscreen'}]},
      {label:'帮助',submenu:[{label:'检查更新…',click:()=>{updateDialog();updates.check({manual:true}).catch(()=>{});}},{label:'GitHub 发布页面',click:()=>openExternal(RELEASES_URL)},{type:'separator'},{label:'关于杭城同行',click:()=>dialog.showMessageBox(mainWindow,{type:'info',title:'杭城同行',message:'杭城同行 · Hangzhou MeetUp',detail:`桌面版 ${app.getVersion()}\n地图资源在本机；路线与接驳查询需要联网。\n每天首次打开时自动检查 GitHub 更新。\nCtrl + / − 调整界面大小，Ctrl + 0 恢复，F11 全屏。\n按 Alt 显示菜单。`})}]}
    ]));
    createWindow();
    if(!testing)setTimeout(dailyUpdateCheck,2500).unref();
  }).catch(error=>{console.error('Startup failed:',error);if(!testing)dialog.showErrorBox('杭城同行启动失败',error.message);app.exit(1);});
  app.on('window-all-closed',()=>app.quit());
  let quitting=false;
  app.on('before-quit',event=>{
    if(quitting)return;
    event.preventDefault();quitting=true;
    if(mainWindow&&!mainWindow.isDestroyed())mainWindow.close();
    server?.closeAllConnections();server?.close();
    writeQueue.finally(()=>app.quit());
  });
}
