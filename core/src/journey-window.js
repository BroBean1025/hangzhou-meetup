(() => {
 const panel=document.getElementById('journey-key'),canvas=document.getElementById('map');
 const heading=panel.querySelector('.journey-key-heading'),list=document.getElementById('journey-list');
 const key='hangzhou-panel-layout-v1',margin=8;
 const read=()=>{try{return JSON.parse(localStorage.getItem(key))??{};}catch{return {};}};
 let preferred=read().journey;
 if(!preferred||!['width','height','rx','ry'].every(k=>Number.isFinite(preferred[k])))preferred=null;
 const footer=document.createElement('div');footer.className='journey-window-footer';
 footer.innerHTML='<small>拖标题移动 · 右下角调大小</small><button type="button" class="journey-window-reset" title="恢复默认位置和大小" aria-label="恢复路线浮窗位置和大小">↺</button>';
 const grip=document.createElement('div');grip.className='journey-window-resize';grip.tabIndex=0;grip.role='slider';grip.setAttribute('aria-label','调整路线浮窗大小，方向键调整，Home 恢复默认');
 panel.append(footer,grip);panel.classList.add('journey-window');
 heading.tabIndex=0;heading.setAttribute('aria-label','移动路线浮窗，方向键移动，Home 恢复默认');heading.title='拖动移动；方向键微调，Home 恢复默认';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));let current=null,dragging=false,frame;
 function limits(){
  const width=canvas.clientWidth,height=canvas.clientHeight,c=document.querySelector('.controls'),style=getComputedStyle(c);
  const controls={x:width-parseFloat(style.right)-c.offsetWidth,y:parseFloat(style.top),w:c.offsetWidth,h:c.offsetHeight};
  const minH=Math.min(190,height-margin*2),minW=Math.min(220,width-margin*2);
  let maxW=Math.min(420,width-margin*2);
  // In a shallow map there is no room below the zoom controls. Reserve their column.
  if(height-controls.y-controls.h-margin*2<minH)maxW=Math.min(maxW,Math.max(minW,controls.x-margin*2));
  return {width,height,controls,minW,minH,maxW,maxH:Math.min(420,height-margin*2)};
 }
 function fit(rect,avoid=true){
  const b=limits();let w=clamp(rect.w,b.minW,b.maxW),h=clamp(rect.h,b.minH,b.maxH);
  const below=b.height-b.controls.y-b.controls.h-margin*2;
  if(w>b.controls.x-margin*2&&below>=b.minH)h=Math.min(h,below);
  if(w/h>1.8)w=h*1.8;if(w/h<0.8)h=w/0.8;
  const bound=(x,y)=>({x:clamp(x,margin,b.width-w-margin),y:clamp(y,margin,b.height-h-margin),w,h});
  let r=bound(rect.x,rect.y);const c=b.controls;
  const overlaps=a=>a.x<c.x+c.w+6&&a.x+a.w>c.x-6&&a.y<c.y+c.h+6&&a.y+a.h>c.y-6;
  if(avoid&&overlaps(r)){
   const options=[bound(c.x-w-8,r.y),bound(r.x,c.y+c.h+8),bound(c.x+c.w+8,r.y),bound(r.x,c.y-h-8)].filter(a=>!overlaps(a));
   options.sort((a,b)=>(a.x-r.x)**2+(a.y-r.y)**2-(b.x-r.x)**2-(b.y-r.y)**2);if(options.length)r=options[0];
  }
  return r;
 }
 function apply(rect){
  current=rect;panel.dataset.compact=String(rect.h<240);for(const [css,k] of [['left','x'],['top','y'],['width','w'],['height','h']])panel.style[css]=Math.round(rect[k])+'px';
  const b=limits();grip.setAttribute('aria-valuemin',String(b.minW));grip.setAttribute('aria-valuemax',String(b.maxW));grip.setAttribute('aria-valuenow',String(Math.round(rect.w)));grip.setAttribute('aria-valuetext',Math.round(rect.w)+' × '+Math.round(rect.h));
  scheduleLabels();
 }
 function remember(){
  const b=limits();preferred={width:current.w,height:current.h,rx:(current.x-margin)/Math.max(1,b.width-current.w-margin*2),ry:(current.y-margin)/Math.max(1,b.height-current.h-margin*2)};
 }
 function persist(){const saved=read();if(preferred)saved.journey=preferred;else delete saved.journey;try{localStorage.setItem(key,JSON.stringify(saved));}catch{}document.dispatchEvent(new Event('change',{bubbles:true}));}
 function layout(){
  if(dragging||panel.hidden||!panel.getClientRects().length||canvas.clientWidth<32||canvas.clientHeight<32)return;
  const b=limits(),w=preferred?.width??(b.width<450?240:300),h=preferred?.height??Math.min(382,142+list.children.length*48);
  const size=fit({x:margin,y:margin,w,h},false);
  apply(fit({...size,x:margin+clamp(preferred?.rx??0,0,1)*Math.max(0,b.width-size.w-margin*2),y:margin+clamp(preferred?.ry??0,0,1)*Math.max(0,b.height-size.h-margin*2)}));
 }
 function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(layout);}
 function finish(){apply(fit(current));remember();persist();renderRouteOverlay();renderMeetingMarkers();}
 function reset(){preferred=null;layout();persist();renderRouteOverlay();renderMeetingMarkers();}
 footer.querySelector('button').onclick=reset;
 function bind(handle,resizing){
  handle.onpointerdown=e=>{
   if(e.button!==0||e.target.closest('button'))return;e.preventDefault();e.stopPropagation();if(!current)return;
   handle.setPointerCapture(e.pointerId);dragging=true;panel.classList.add('is-moving');const initial={...current},x=e.clientX,y=e.clientY;
   const move=event=>{const dx=event.clientX-x,dy=event.clientY-y;
    const rect=resizing?{...initial,w:Math.min(initial.w+dx,canvas.clientWidth-initial.x-margin),h:Math.min(initial.h+dy,canvas.clientHeight-initial.y-margin)}:{...initial,x:initial.x+dx,y:initial.y+dy};apply(fit(rect,false));
   };
   const end=()=>{if(!dragging)return;dragging=false;panel.classList.remove('is-moving');handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);handle.removeEventListener('lostpointercapture',end);finish();};
   handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
  };
  handle.onkeydown=e=>{
   if(e.target!==handle||!current)return;if(e.key==='Home'){e.preventDefault();reset();return;}
   const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!delta)return;e.preventDefault();e.stopPropagation();const step=e.shiftKey?32:8;
   const r={...current};r[resizing?'w':'x']+=delta[0]*step;r[resizing?'h':'y']+=delta[1]*step;apply(fit(r));finish();
  };
 }
 bind(heading,false);bind(grip,true);
 new ResizeObserver(schedule).observe(canvas);
 new MutationObserver(schedule).observe(panel,{attributes:true,attributeFilter:['hidden']});
 new MutationObserver(schedule).observe(list,{childList:true});
 window.addEventListener('resize',schedule);schedule();
})();
