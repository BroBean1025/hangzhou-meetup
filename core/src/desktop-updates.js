(() => {
  if(!window.desktop)return;
  const button=document.createElement('button');button.id='desktop-updates';button.textContent='更新';button.title='检查应用更新';document.querySelector('header').append(button);
  const dialog=document.createElement('dialog');dialog.id='desktop-update-dialog';
  dialog.innerHTML='<form method="dialog"><button class="settings-close" aria-label="关闭更新窗口">关闭</button><h2>应用更新</h2><p class="update-version"></p><p>每天首次打开时自动检查 GitHub 上的稳定版本。</p><p id="update-message" role="status" aria-live="polite"></p><progress id="update-progress" max="100" value="0" hidden aria-label="更新下载进度"></progress><p class="update-checked"></p><details id="update-notes" hidden><summary>版本说明</summary><pre></pre></details><p class="update-mode"></p><div class="update-actions"><button type="button" id="update-check">检查更新</button><button type="button" id="update-download" hidden>下载更新</button><button type="button" id="update-install" hidden>重启并安装</button><button type="button" id="update-release-page">GitHub 发布页面 ↗</button></div></form>';
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector);
  function render(state){
    const busy=['checking','downloading','installing'].includes(state.phase);
    $('.update-version').textContent='当前界面 '+state.currentVersion+' · 外壳 '+state.shellVersion+(state.availableVersion?' · 新版本 '+state.availableVersion:'');
    $('#update-message').textContent=state.message;
    $('#update-message').classList.toggle('update-error',state.phase==='error');
    $('#update-progress').hidden=state.phase!=='downloading';$('#update-progress').value=state.progress;
    if(state.phase==='downloading')$('#update-message').textContent='正在下载更新… '+Math.round(state.progress)+'%';
    const date=state.lastCheckedAt?new Date(state.lastCheckedAt):null;
    $('.update-checked').textContent=date&&!Number.isNaN(date.getTime())?'上次成功检查：'+date.toLocaleString('zh-CN'):'尚未完成线上检查';
    $('#update-check').disabled=busy||state.phase==='downloaded';
    $('#update-download').hidden=!state.availableVersion||!['available','error'].includes(state.phase);$('#update-download').disabled=busy;
    $('#update-download').textContent=state.kind==='hot'?'下载界面补丁（'+(state.size/1024/1024).toFixed(1)+' MB）':state.portable?'下载新版免安装包':'下载完整更新';
    $('#update-install').textContent=state.kind==='hot'?'应用补丁并刷新':'重启并安装';
    $('#update-install').hidden=state.phase!=='downloaded';
    $('#update-notes').hidden=!state.releaseNotes;$('#update-notes pre').textContent=state.releaseNotes||'';
    $('.update-mode').textContent=state.kind==='hot'?'热更新：仅刷新界面，当前路线会重新加载；高德 Key 和已保存的偏好保留。加载失败会恢复上一版。':state.portable?'冷更新：下载新版免安装包，关闭程序后替换 EXE。界面小补丁可在应用内热更新。':'冷更新：下载完整程序，重启安装后生效；高德 Key、出发点和界面设置保留。界面小补丁无需重启程序。';
    const available=['available','downloaded','installing'].includes(state.phase)||state.phase==='error'&&state.availableVersion;
    button.classList.toggle('has-update',!!available);button.textContent=available?'有更新':'更新';button.setAttribute('aria-label',available?'发现新版本，打开应用更新':'检查应用更新');
  }
  async function open(){try{render(await window.desktop.updateStatus());if(!dialog.open)dialog.showModal();}catch{}}
  async function action(method){try{const state=await window.desktop[method]();if(state)render(state);}catch{$('#update-message').textContent='操作未完成，请稍后重试。';}}
  button.onclick=open;window.desktop.onShowUpdates(open);window.desktop.onUpdateState(render);
  $('#update-check').onclick=()=>action('checkUpdates');$('#update-download').onclick=()=>action('downloadUpdate');$('#update-install').onclick=()=>action('installUpdate');$('#update-release-page').onclick=()=>action('releasePage');
  window.desktop.updateStatus().then(render).catch(()=>{});
})();
