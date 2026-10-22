  let commandSizeObserver=null;
  let previousOverlay=null;
  let overlayReturnFocus=null;
  function captureViewMemory() {
    const active = document.activeElement;
    return {
      page: state.renderedPage,
      focus: active && app.contains(active) ? {
        id: active.id, action: active.dataset.action, channel:active.dataset.channel,
        coordinate: active.dataset.coordinate, actionType: active.dataset.actionType,
        map: active.closest("[data-map-panel]")?.dataset.mapPanel,
      } : null,
      scrolls: [...app.querySelectorAll("[data-scroll-key]")].map(el => ({
        key: el.dataset.scrollKey, top: el.scrollTop, left: el.scrollLeft,
      })),
      details: [...app.querySelectorAll("details")].map((el,index) => ({index,open:el.open})),
    };
  }

  function hydrateInterface(memory) {
    updateChoiceSemantics();
    app.querySelectorAll("[data-hp-percent]").forEach(el => {
      el.style.width = `${Math.max(0,Math.min(100,Number(el.dataset.hpPercent)))}%`;
    });
    app.querySelectorAll("[role=grid]").forEach(grid => {
      const cells = [...grid.querySelectorAll("[role=gridcell]:not(:disabled)")];
      cells.forEach((cell,index) => { cell.tabIndex = index === 0 ? 0 : -1; });
    });
    commandSizeObserver?.disconnect();
    const dock=app.querySelector('.command-dock'), consoleRoot=app.querySelector('.ocean-console');
    if(dock && consoleRoot && typeof ResizeObserver === 'function') {
      commandSizeObserver=new ResizeObserver(()=>{
        if(dock.isConnected) consoleRoot.style.setProperty('--command-height',`${dock.getBoundingClientRect().height}px`);
      });
      commandSizeObserver.observe(dock);
    }
    if (memory) {
      for (const item of memory.scrolls) {
        const el = [...app.querySelectorAll("[data-scroll-key]")].find(el => el.dataset.scrollKey === item.key);
        if (el) {el.scrollTop=item.top;el.scrollLeft=item.left;}
      }
      const details = app.querySelectorAll("details");
      for (const item of memory.details) if (details[item.index] && !details[item.index].matches(".training-task > details")) details[item.index].open=item.open;
      const f=memory.focus;
      if(f) {
        const target = f.id ? document.getElementById(f.id) : [...app.querySelectorAll("[data-action]")].find(el =>
          el.dataset.action===f.action && el.dataset.coordinate===f.coordinate &&
          el.dataset.actionType===f.actionType &&
          el.closest("[data-map-panel]")?.dataset.mapPanel===f.map
        );
        if(target && !target.disabled && target.getClientRects().length) {
          if(target.matches("[role=gridcell]")) {
            target.closest("[role=grid]")?.querySelectorAll("[role=gridcell]").forEach(el=>el.tabIndex=-1);
            target.tabIndex=0;
          }
          target.focus({preventScroll:true});
        }
      }
    }
    app.querySelectorAll(".deployment-progress-track > i, .tutorial-progress i").forEach(el => {
      const raw=el.getAttribute("style")?.match(/width:\s*([\d.]+)%/);
      if(raw) el.style.width=raw[1]+"%";
    });
    app.querySelectorAll(".marker-palette").forEach(palette => {
      if (palette.querySelector('[data-action="erase-marker-tool"]')) return;
      const button=document.createElement("button");
      button.type="button";button.dataset.action="erase-marker-tool";
      button.textContent="删除标记";button.setAttribute("aria-pressed",String(state.battle.eraseMarker));
      palette.append(button);
    });
    // Legacy progress bars are assigned as properties, compatible with strict CSP.
    app.querySelectorAll(".hp-track > i[style]").forEach(el => {
      const raw=el.getAttribute("style")?.match(/--hp-percent:\s*([\d.]+)%/);
      if(raw) el.style.width=`${raw[1]}%`;
    });
  }

  document.addEventListener("keydown", event => {
    if(document.querySelector("dialog[open]")) return;
    const cell=event.target.closest?.("[role=gridcell]");
    if(!cell) return;
    const grid=cell.closest("[role=grid]");
    const cells=[...grid.querySelectorAll("[role=gridcell]")];
    const index=cells.indexOf(cell), size=Number(grid.dataset.boardSize ?? Data.BOARD_SIZE);
    const row=Math.floor(index/size), col=index%size;
    const next={
      ArrowLeft:row*size+Math.max(0,col-1),
      ArrowRight:row*size+Math.min(size-1,col+1),
      ArrowUp:Math.max(0,row-1)*size+col,
      ArrowDown:Math.min(size-1,row+1)*size+col,
      Home:row*size, End:row*size+size-1,
    }[event.key];
    if(next !== undefined && !cells[next]?.disabled) {
      event.preventDefault();cells.forEach(el=>el.tabIndex=-1);
      cells[next].tabIndex=0;cells[next].focus();
    }
    if(event.key==="Delete" && cell.dataset.cellState==="private-marker") {
      event.preventDefault();removePrivateMarker(cell);
    }
  });

  let lastDialogTrigger=null;
  document.addEventListener("click",event=>{
    const control=event.target.closest?.("button");
    if(control && !control.closest("dialog")) lastDialogTrigger=control;
  },true);
  document.querySelectorAll("dialog").forEach(dialog=>{
    dialog.addEventListener("close",()=>{
      if(lastDialogTrigger?.isConnected) lastDialogTrigger.focus({preventScroll:true});
      else app.focus({preventScroll:true});
    });
  });
  const motionPreference=window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if(motionPreference?.matches) setReduceMotion(readBooleanPreference(MOTION_STORAGE_KEY), false);
  motionPreference?.addEventListener?.("change",event=>{
    setReduceMotion(readBooleanPreference(MOTION_STORAGE_KEY), false);
  });

  function activeInterfaceOverlay() {
    if(!blockingOverlay.hidden) return blockingOverlay;
    const consoleRoot=app.querySelector('.ocean-console');
    const drawer=consoleRoot?.dataset.drawerOpen;
    return drawer==='messages' ? app.querySelector('.log-panel--open') :
      drawer==='actions' ? app.querySelector('.action-rail--open') :
      drawer==='fleet' ? app.querySelector('.fleet-panel--open') : null;
  }

  function synchronizeOverlayFocus(memory) {
    const overlay=activeInterfaceOverlay();
    if(overlay && !previousOverlay) overlayReturnFocus=memory?.focus;
    if(!overlay && previousOverlay && overlayReturnFocus) {
      const f=overlayReturnFocus;
      const candidates=[...app.querySelectorAll('.mobile-console-nav button,.fleet-links button,[data-action]')];
      const target=candidates.find(el=>el.dataset.action===f.action && el.dataset.channel===f.channel && !el.disabled && el.getClientRects().length);
      target?.focus({preventScroll:true});overlayReturnFocus=null;
    }
    previousOverlay=overlay;
    document.querySelector('.site-shell').inert=!blockingOverlay.hidden;
    for(const panel of app.querySelectorAll('.battle-header,.battle-main-column,.fleet-panel,.action-rail,.command-dock,.mobile-console-nav')) {
      panel.inert=Boolean(overlay && panel!==overlay && !panel.contains(overlay));
    }
    for(const panel of app.querySelectorAll('.log-panel,.fleet-panel,.action-rail')) {
      if(panel===overlay) {panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');}
      else {panel.removeAttribute('role');panel.removeAttribute('aria-modal');}
    }
    if(overlay && !overlay.contains(document.activeElement)) {
      const target=overlay.querySelector('button:not(:disabled),[tabindex="0"]');
      if(target) target.focus({preventScroll:true});
      else {overlay.tabIndex=-1;overlay.focus({preventScroll:true});}
    }
  }

  document.addEventListener('keydown',event=>{
    if(event.key!=='Tab' || document.querySelector('dialog[open]')) return;
    const overlay=activeInterfaceOverlay();
    if(!overlay) return;
    const controls=[...overlay.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"],summary')]
      .filter(el=>el.getClientRects().length);
    if(!controls.length) {event.preventDefault();return;}
    const index=controls.indexOf(document.activeElement);
    if(event.shiftKey && index<=0) {event.preventDefault();controls.at(-1).focus();}
    else if(!event.shiftKey && (index<0 || index===controls.length-1)) {event.preventDefault();controls[0].focus();}
  });

  function updateChoiceSemantics() {
    document.querySelectorAll('[role="radiogroup"] [aria-checked]').forEach(control=>{
      control.setAttribute('role','radio');
      control.tabIndex=control.getAttribute('aria-checked')==='true' ? 0 : -1;
    });
  }

  document.addEventListener('keydown',event=>{
    const control=event.target.closest?.('[role="radio"]');
    const group=control?.closest('[role="radiogroup"]');
    if(!group || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const controls=[...group.querySelectorAll('[role="radio"]')].filter(el=>!el.disabled);
    const index=controls.indexOf(control);
    const next=event.key==='Home'?0:event.key==='End'?controls.length-1:
      (index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+controls.length)%controls.length;
    if(!controls[next]) return;
    event.preventDefault();
    const label=group.getAttribute('aria-label');controls[next].click();updateChoiceSemantics();
    const current=[...document.querySelectorAll('[role="radiogroup"]')].find(el=>el.getAttribute('aria-label')===label);
    current?.querySelector('[aria-checked="true"]')?.focus({preventScroll:true});
  });
