const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktop',{
  status:()=>ipcRenderer.invoke('desktop:status'),
  saveKey:key=>ipcRenderer.invoke('desktop:save-key',key),
  onSettings:callback=>ipcRenderer.on('desktop:settings',()=>callback()),
  updateStatus:()=>ipcRenderer.invoke('desktop:update-status'),
  checkUpdates:()=>ipcRenderer.invoke('desktop:check-updates'),
  downloadUpdate:()=>ipcRenderer.invoke('desktop:download-update'),
  installUpdate:()=>ipcRenderer.invoke('desktop:install-update'),
  resetUI:()=>ipcRenderer.invoke('desktop:reset-ui'),
  releasePage:()=>ipcRenderer.invoke('desktop:release-page'),
  onUpdateState:callback=>ipcRenderer.on('desktop:update-state',(_event,state)=>callback(state)),
  onShowUpdates:callback=>ipcRenderer.on('desktop:show-updates',()=>callback())
});
const keys=['hangzhou-origins-v2','hangzhou-trip-buffer-v1','hangzhou-route-preferences-v1','hangzhou-panel-layout-v1'];
function persist(){
  const value={};for(const key of keys){const item=localStorage.getItem(key);if(item!==null)value[key]=item;}
  ipcRenderer.send('desktop:write-preferences',value);
}
window.addEventListener('DOMContentLoaded',async()=>{
  try{
    const saved=await ipcRenderer.invoke('desktop:read-preferences');let seeded=false;
    for(const key of keys)if(typeof saved[key]==='string'&&localStorage.getItem(key)===null){localStorage.setItem(key,saved[key]);seeded=true;}
    // A new loopback origin gets the saved state before the next render; normal launches do not reload.
    if(seeded){location.reload();return;}
  }catch{}
  document.addEventListener('change',()=>setTimeout(persist,0));document.addEventListener('click',()=>setTimeout(persist,0));
});
window.addEventListener('beforeunload',persist);
