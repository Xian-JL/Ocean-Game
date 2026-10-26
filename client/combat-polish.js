  // Viewport geometry and presentation only; no combat facts or commands are derived here.
  const combatViewportRuntime={frame:null,observer:null,raf:0,update:null,drafts:new Map()};
  function viewportMetrics({left,top,width,height,cellWidth,cellHeight,axisX,axisY,size}){
    const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
    const firstColumn=clamp(Math.floor(left/cellWidth),0,size-1),firstRow=clamp(Math.floor(top/cellHeight),0,size-1);
    const lastColumn=clamp(Math.ceil((left+width-axisX)/cellWidth)-1,firstColumn,size-1),lastRow=clamp(Math.ceil((top+height-axisY)/cellHeight)-1,firstRow,size-1);
    return {firstColumn,firstRow,lastColumn,lastRow,centerColumn:(left+(width-axisX)/2)/cellWidth,centerRow:(top+(height-axisY)/2)/cellHeight};
  }
  function currentViewportGeometry(frame){
    const board=frame?.querySelector('.ocean-board'),cell=board?.querySelector('[data-coordinate]');
    const axisColumn=board?.querySelector('.board-axis--column'),axisRow=board?.querySelector('.board-axis--row');
    if(!board||!cell)return null;
    const rect=cell.getBoundingClientRect();if(!rect.width||!rect.height)return null;
    return {left:frame.scrollLeft,top:frame.scrollTop,width:frame.clientWidth,height:frame.clientHeight,cellWidth:rect.width,cellHeight:rect.height,axisX:(axisRow?.getBoundingClientRect().width??26)+board.clientLeft,axisY:(axisColumn?.getBoundingClientRect().height??26)+board.clientTop,size:Number(board.dataset.boardSize)};
  }
  function disposeCombatViewport(){
    if(combatViewportRuntime.frame&&combatViewportRuntime.update)combatViewportRuntime.frame.removeEventListener('scroll',combatViewportRuntime.update);
    combatViewportRuntime.observer?.disconnect();cancelAnimationFrame(combatViewportRuntime.raf);
    Object.assign(combatViewportRuntime,{frame:null,observer:null,raf:0,update:null});
  }
  function hydrateCombatViewport(){
    disposeCombatViewport();if(state.renderedPage!=='P05')return;
    const frame=battleMapPanel()?.querySelector('.board-frame--tactical-sea');if(!frame)return;
    const paint=()=>{
      combatViewportRuntime.raf=0;if(!frame.isConnected)return;
      const geometry=currentViewportGeometry(frame);if(!geometry)return;
      const m=viewportMetrics(geometry),label=document.querySelector('[data-visible-range]');
      if(label)label.textContent=Data.formatCoordinate(m.firstRow,m.firstColumn)+'–'+Data.formatCoordinate(m.lastRow,m.lastColumn)+' · '+Math.round(geometry.cellWidth)+'px格';
      const overview=document.querySelector('[data-map-window]');
      if(overview){overview.style.left=(100*m.firstColumn/geometry.size)+'%';overview.style.top=(100*m.firstRow/geometry.size)+'%';overview.style.width=(100*(m.lastColumn-m.firstColumn+1)/geometry.size)+'%';overview.style.height=(100*(m.lastRow-m.firstRow+1)/geometry.size)+'%';}
      frame.dataset.panX=String(frame.scrollWidth>frame.clientWidth+2);frame.dataset.panY=String(frame.scrollHeight>frame.clientHeight+2);
      const hint=document.querySelector('[data-map-pan-hint]');if(hint)hint.textContent=frame.dataset.panX==='true'||frame.dataset.panY==='true'?'拖动查看海域':'完整海域';
    };
    const update=()=>{if(!combatViewportRuntime.raf)combatViewportRuntime.raf=requestAnimationFrame(paint);};
    Object.assign(combatViewportRuntime,{frame,update});frame.addEventListener('scroll',update,{passive:true});
    if(typeof ResizeObserver==='function'){combatViewportRuntime.observer=new ResizeObserver(update);combatViewportRuntime.observer.observe(frame);}paint();
  }
  function changeMapZoom(){
    const frame=battleMapPanel()?.querySelector('.board-frame--tactical-sea'),geometry=currentViewportGeometry(frame);
    const anchor=geometry?viewportMetrics(geometry):null;
    rememberBattleMapView();cancelMotion();state.battle.mapZoom=!state.battle.mapZoom;render();
    requestAnimationFrame(()=>{
      const next=battleMapPanel()?.querySelector('.board-frame--tactical-sea'),g=currentViewportGeometry(next);if(!anchor||!g)return;
      next.scrollLeft=Math.max(0,anchor.centerColumn*g.cellWidth-(g.width-g.axisX)/2);
      next.scrollTop=Math.max(0,anchor.centerRow*g.cellHeight-(g.height-g.axisY)/2);rememberBattleMapView();combatViewportRuntime.update?.();
    });
  }
  function locatorDraftKey(){return [state.training?.session?.generation??"live",state.room?.roomCode,state.room?.own?.playerId,state.battle.mobileMap].join(":");}
  function renderMapNavigator(){
    return `<div class="map-context" aria-label="海图视窗"><div class="map-overview" aria-hidden="true"><i data-map-window></i></div><span><strong data-visible-range>正在定位海域</strong><small data-map-pan-hint>坐标与海图同步</small></span><form id="map-locate-form" class="map-locate" aria-label="定位海图坐标"><label class="sr-only" for="map-coordinate-input">定位坐标，例如A1；仅移动视窗</label><input id="map-coordinate-input" name="coordinate" value="${escapeHtml(combatViewportRuntime.drafts.get(locatorDraftKey())??'')}" maxlength="3" autocomplete="off" spellcheck="false" placeholder="如 A1" inputmode="text"><button type="submit">定位</button></form><button type="button" data-action="focus-selected-target" ${state.battle.target?'':'disabled'}>回到目标</button></div>`;
  }
  function showWeaponDetails(type){
    const definition=Data.getActionDefinition(type??state.battle.selectedAction);if(!definition||!state.room?.battle)return;
    const status=Model.deriveActionStatus(state.room,definition),dialog=document.querySelector('#weapon-details-dialog');if(!dialog)return;
    document.querySelector('#weapon-details-title').textContent=definition.name;
    document.querySelector('#weapon-details-body').innerHTML=`<p class="weapon-status">${escapeHtml(status.label)} · ${escapeHtml(Model.actionResourceLabel(state.room,definition))}</p><p>${escapeHtml(definition.warning??'按海图合法范围选择目标，确认后执行。')}</p><p>${definition.rangeMode==='radar'?`选择扫描区域的左上起始格；当前为${state.room.mapRules.radarSize}×${state.room.mapRules.radarSize}。`:definition.targetMode==='area'?'选择完整区域的中心格。':definition.targetMode==='line'?'选择行或列，再指定目标。':'选择一个合法目标坐标。'}${HIDDEN_RESULT_ACTIONS.includes(definition.type)?'投放结果保持保密，视觉与声音不暗示是否命中。':''}</p><small>查看说明不改变当前武器、来源、目标或资源。键盘1–0仅选择武器，海图Enter仅瞄准，执行仍需确认。</small>`;
    dialog.showModal();dialog.querySelector('[data-action="close-weapon-details"]')?.focus();
  }
  document.addEventListener('input',event=>{
    if(event.target.id!=='map-coordinate-input')return;
    const value=event.target.value.toUpperCase();event.target.value=value;combatViewportRuntime.drafts.set(locatorDraftKey(),value);
    while(combatViewportRuntime.drafts.size>24)combatViewportRuntime.drafts.delete(combatViewportRuntime.drafts.keys().next().value);
  });
  document.addEventListener('submit',event=>{
    if(event.target.id!=='map-locate-form')return;event.preventDefault();
    const input=event.target.elements.coordinate,value=input.value.trim().toUpperCase(),parsed=Data.parseCoordinate(value);
    if(!parsed){input.setAttribute('aria-invalid','true');showToast('请输入当前海图范围内的坐标，例如 A1。','warning');return;}
    input.removeAttribute('aria-invalid');centerBattleMap(value);
    requestAnimationFrame(()=>{const cell=battleMapPanel()?.querySelector('[data-coordinate="'+value+'"]');if(cell&&!cell.disabled){cell.closest('[role=grid]')?.querySelectorAll('[role=gridcell]').forEach(c=>c.tabIndex=-1);cell.tabIndex=0;cell.focus({preventScroll:true});}});
  });
  document.addEventListener('keydown',event=>{
    if(state.renderedPage!=='P05'||event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.('input,textarea,select,[contenteditable="true"],dialog')||document.querySelector('dialog[open]')||activeInterfaceOverlay())return;
    const index='1234567890'.indexOf(event.key);if(index<0||event.key.length!==1)return;
    event.preventDefault();selectAction(ARMORY_ORDER[index]);
  });
  window.addEventListener('resize',()=>{if(state.renderedPage==='P05')cancelMotion();});
  window.addEventListener('pagehide',disposeCombatViewport);

  document.addEventListener('error',event=>{
    const image=event.target,unit=image.closest?.('.tactical-unit-art');
    if(!unit||unit.classList.contains('art-fallback')||!(image.matches?.('.tactical-hull-viewport image')||(image.parentElement===unit&&image.tagName==='IMG'&&!image.classList.contains('tactical-prop')&&!image.classList.contains('tactical-status-art'))))return;
    const label=document.createElement('span');label.className='hull-fallback';label.setAttribute('aria-hidden','true');
    label.textContent=Data.getUnitDefinitionById(unit.dataset.artUnitId)?.shortName??'舰';unit.classList.add('art-fallback');unit.append(label);
  },true);
