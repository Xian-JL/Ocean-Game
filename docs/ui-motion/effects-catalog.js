'use strict';
const state={effectiveQuality:'high',qualityMode:'high',reduceMotion:false,renderedPage:'P05',battle:{mobileMap:'own',target:null},room:null};
const Sound=null;
function syncPersonalizeControls(){}
addEventListener('DOMContentLoaded',()=>{
 const labels={destroyer_i_ram:'驱逐舰Ⅰ冲撞',destroyer_ii_ram:'驱逐舰Ⅱ冲撞',pirate_attack:'海盗船攻击',motorboat_ram:'摩托艇冲撞',submarine_missile:'潜射导弹',nuclear_bomb:'核弹',shock_bomb:'震爆弹',detection_bomb:'探测弹',helicopter_strafe:'直升机扫射',radar_scan:'雷达扫描'};
 const select=document.querySelector('#demo-action'),layer=document.querySelector('#demo-layer'),quality=document.querySelector('#demo-quality'),result=document.querySelector('#demo-result'),status=document.querySelector('#demo-status');
 let cleanup=null;
 function metrics(){document.querySelector('#demo-metrics').textContent='主效果'+layer.children.length+' / 1 · 装饰节点'+layer.querySelectorAll('*').length+' / 80 · 粒子0 · 排队0';}
 for(const [id,name]of Object.entries(labels)){const option=document.createElement('option');option.value=id;option.textContent=name;select.append(option);}
 function allowedResults(){const hidden=['submarine_missile','nuclear_bomb','shock_bomb'].includes(select.value),scan=['radar_scan','detection_bomb'].includes(select.value);const allowed=hidden?['unknown']:scan?['private-positive','private-negative']:['hit','miss'];for(const option of result.options)option.disabled=!allowed.includes(option.value);if(!allowed.includes(result.value))result.value=allowed[0];}
 select.addEventListener('change',allowedResults);allowedResults();
 function stop(){clearTimeout(cleanup);layer.replaceChildren();cancelMotion();metrics();status.textContent='示例已停止；无业务请求或历史效果队列。';}
 function configure(){
  stop();state.reduceMotion=quality.value==='reduced';state.effectiveQuality=quality.value==='smooth'?'smooth':'high';
  document.documentElement.dataset.quality=state.effectiveQuality;document.documentElement.dataset.reduceMotion=String(state.reduceMotion);
 }
 quality.addEventListener('change',configure);document.querySelector('#demo-cancel').onclick=stop;
 document.querySelector('#demo-play').onclick=()=>{
  configure();const type=select.value,def=motionDefinitions[type];
  const hidden=['submarine_missile','nuclear_bomb','shock_bomb'].includes(type),value=hidden?'unknown':result.value;
  status.textContent=labels[type]+' · '+(hidden?'攻击方结果保密，所有隐藏结果同形。':result.selectedOptions[0].textContent)+(state.reduceMotion?' · 静态回退':' · 单次播放');
  if(state.reduceMotion)return;
  const node=document.createElement('span');node.className='battle-effect-art battle-effect-art--'+value;node.dataset.effectAction=type;
  node.innerHTML=renderMotionArt({actionType:type,visualState:value});layer.append(node);
  const duration=state.effectiveQuality==='smooth'?def.smooth:def.duration;
  for(const [name,value]of Object.entries({'effect-duration':duration,'lock-duration':state.effectiveQuality==='smooth'?Math.min(duration,100):def.lockEnd,'travel-start':state.effectiveQuality==='smooth'?0:def.lockEnd,'travel-duration':state.effectiveQuality==='smooth'?duration:def.travelEnd-def.lockEnd,'release-start':state.effectiveQuality==='smooth'?0:def.travelEnd,'release-duration':state.effectiveQuality==='smooth'?duration:def.duration-def.travelEnd}))node.style.setProperty('--'+name,value+'ms');
  metrics();cleanup=setTimeout(()=>{layer.replaceChildren();metrics();},duration+200);
 };
 document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>{
  configure();const type=b.dataset.example;
  motionRuntime.uiFacts.push({key:'demo:'+performance.now(),selector:'#demo-badge',duration:({result:900,salvo:1100,hp:320,turn:320,marker:110,connection:150,dice:420,layer:420,sunk:500,paralysis:280,decoy:320}[type]??200),kind:type});
  reconcileUiMotion();status.textContent='合成示例：'+b.textContent;
 });
 document.querySelector('#demo-dialog-open').onclick=()=>document.querySelector('#demo-dialog').showModal();
 document.querySelector('#demo-dialog-close').onclick=()=>document.querySelector('#demo-dialog').close();
});
