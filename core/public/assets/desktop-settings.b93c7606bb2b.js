(() => {
  if(!window.desktop)return;
  document.documentElement.classList.add('desktop-app');
  const button=document.createElement('button');button.id='desktop-settings';button.textContent='设置';button.title='高德服务设置';
  document.querySelector('header').append(button);
  const dialog=document.createElement('dialog');dialog.id='desktop-settings-dialog';
  dialog.innerHTML='<form method="dialog"><button class="settings-close" aria-label="关闭设置">关闭</button><h2>高德服务设置</h2><p id="desktop-key-status"></p><label for="desktop-key">高德 Web 服务 Key</label><input id="desktop-key" type="password" autocomplete="off" spellcheck="false" placeholder="填写 32 位 Key，或保留已有配置" maxlength="32"><p>用于校门至地铁站的步行、公交、骑行和驾车接驳查询。配置只保存在这台电脑上。</p><p class="desktop-shortcuts">Ctrl + / − 调整界面大小 · Ctrl + 0 恢复<br>F11 全屏 · Alt 显示应用菜单</p><p id="desktop-settings-message" role="status"></p><button id="desktop-save-key" type="button">保存并生效</button></form>';
  document.body.append(dialog);
  const status=dialog.querySelector('#desktop-key-status'),input=dialog.querySelector('input'),message=dialog.querySelector('[role=status]');
  async function open(){
    try{const data=await window.desktop.status();status.textContent=data.configured?'当前已配置：'+data.keyHint:'尚未配置 Key';input.value='';message.textContent='';if(!dialog.open)dialog.showModal();}catch{message.textContent='暂时无法读取配置，请重新打开设置。';}
  }
  button.onclick=open;window.desktop.onSettings(open);
  dialog.querySelector('#desktop-save-key').onclick=async()=>{
    if(!/^[a-f\d]{32}$/i.test(input.value.trim())){message.textContent='请输入 32 位高德 Web 服务 Key。';input.focus();return;}
    try{await window.desktop.saveKey(input.value.trim());await open();message.textContent='已保存。现在可以重新查询路线。';}catch{message.textContent='保存失败，请检查 Key 或本机配置目录的写入权限。';}
  };
})();
