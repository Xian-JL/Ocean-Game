"use strict";
(() => {
 const defs=window.OCEAN_LAB_MOTION;
 const icons=['destroyer-i','destroyer-ii','pirate','motorboat','missile','nuclear','shock','detection','radar','helicopter'];
 const order=['destroyer_i_ram','destroyer_ii_ram','pirate_attack','motorboat_ram','submarine_missile','nuclear_bomb','shock_bomb','detection_bomb','radar_scan','helicopter_strafe'];
 const names=['驱逐舰Ⅰ冲撞','驱逐舰Ⅱ冲撞','海盗船攻击','摩托艇冲撞','潜射导弹','核弹','震爆弹','探测弹','雷达扫描','直升机扫射'];
 const art=['vfx_small_water_splash','vfx_large_water_splash','vfx_debris_sparks','vfx_torpedo_trail','vfx_missile_launch','vfx_nuclear_shock_ring','vfx_emp_pulse','vfx_sonar_ping','vfx_radar_sweep','vfx_helicopter_trace'];
 const host=document.querySelector('#lab-effect'),status=document.querySelector('#lab-status');let timer;
 document.querySelector('#lab-grid').replaceChildren(...Array.from({length:144},()=>document.createElement('i')));
 order.forEach((type,index)=>{const button=document.createElement('button');button.type='button';button.dataset.type=type;button.innerHTML=`<svg class="ui-svg-icon" aria-hidden="true"><use href="/assets/icons/ocean-ui.svg#action-${icons[index]}"></use></svg><span>${(index+1)%10} · ${names[index]}</span>`;button.addEventListener('click',()=>play(type,index));document.querySelector('#lab-weapons').append(button);});
 function cancel(){clearTimeout(timer);host.replaceChildren();}
 function play(type,index){cancel();const quality=document.querySelector('#lab-quality').value;status.textContent=names[index]+' · 合成中性样例';if(quality==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches){status.textContent+=' · 静态事实（无短效）';return;}
  const d=defs[type],el=document.createElement('span');el.className='battle-effect-art';el.dataset.effectAction=type;el.dataset.effectScope=['radar_scan','detection_bomb','shock_bomb'].includes(type)?'area':type==='helicopter_strafe'?'line':'cell';const duration=quality==='smooth'?d.smooth:d.duration;el.style.setProperty('--effect-duration',duration+'ms');el.style.setProperty('--impact-size',quality==='smooth'?'100px':'112px');el.style.setProperty('--travel-start','0ms');el.style.setProperty('--travel-duration',Math.round(duration*.6)+'ms');el.style.setProperty('--release-start',Math.round(duration*.4)+'ms');el.style.setProperty('--release-duration',Math.round(duration*.6)+'ms');el.innerHTML='<img src="/assets/images/ocean-2.5d/feedback/vfx/'+art[index]+'.webp" alt=""><span class="motion-glyph motion-'+d.shape+'"><i class="motion-ring"></i><i class="motion-ring motion-ring--second"></i><i class="motion-ray"></i><i class="motion-ray motion-ray--second"></i><i class="motion-core"></i><i class="motion-scan"></i></span>';host.append(el);timer=setTimeout(cancel,Math.min(1800,duration+80));
 }
 document.querySelector('#lab-theme').addEventListener('change',event=>{cancel();document.documentElement.dataset.theme=event.target.value;});
 document.querySelector('#lab-quality').addEventListener('change',event=>{cancel();document.documentElement.dataset.quality=event.target.value==='smooth'?'smooth':'high';document.documentElement.dataset.reduceMotion=String(event.target.value==='reduced');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});window.addEventListener('pagehide',cancel);
})();
