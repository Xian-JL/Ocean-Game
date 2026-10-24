  // Input is the existing role-filtered effect model, never raw outcomes.
  const motionDefinitions = Object.freeze({
    destroyer_i_ram:{shape:'ram-one',duration:850,smooth:440,lockEnd:160,travelEnd:420},
    destroyer_ii_ram:{shape:'ram-two',duration:1000,smooth:440,lockEnd:180,travelEnd:480},
    pirate_attack:{shape:'cross',duration:900,smooth:440,lockEnd:180,travelEnd:450},
    motorboat_ram:{shape:'wake',duration:750,smooth:440,lockEnd:140,travelEnd:340},
    submarine_missile:{shape:'missile',duration:1000,smooth:440,lockEnd:160,travelEnd:520},
    nuclear_bomb:{shape:'nuclear',duration:1400,smooth:520,lockEnd:220,travelEnd:620},
    shock_bomb:{shape:'emp',duration:1000,smooth:440,lockEnd:160,travelEnd:600},
    detection_bomb:{shape:'sonar',duration:1200,smooth:440,lockEnd:160,travelEnd:850},
    radar_scan:{shape:'radar',duration:1300,smooth:520,lockEnd:160,travelEnd:1000},
    helicopter_strafe:{shape:'strafe',duration:1400,smooth:520,lockEnd:180,travelEnd:900}
  });
  const motionRuntime={key:null,started:0,map:null,context:null,consumed:new Map(),timer:null,
    hidden:false,animations:new Set(),raf:0,slow:0,samples:[],sampleAt:0,autoDegraded:false,previousFrame:0,watermark:-1,micro:new Map(),uiFacts:[],lastTarget:null,activeUi:new Map(),uiAnimations:new Set(),uiPage:null,localSignatures:new Map(),localContext:null,localSequence:0};
  function cancelMotion(preserveQueued=false) {
    if(!preserveQueued)motionRuntime.uiFacts=[];
    clearTimeout(motionRuntime.timer); motionRuntime.timer=null;
    for(const a of motionRuntime.animations) a.cancel?.();
    motionRuntime.animations.clear();
    for(const a of motionRuntime.uiAnimations)a.cancel?.();motionRuntime.uiAnimations.clear();motionRuntime.activeUi.clear();
    cancelAnimationFrame(motionRuntime.raf);motionRuntime.raf=0;
    if(motionRuntime.key)Sound?.cancelTransientEffects?.();
    motionRuntime.key=null;
    state.battle.resolutionEffectVisible=false;
    document.querySelectorAll('.battle-effect-layer').forEach(n=>n.remove());
  }
  function startMotion(key) {
    cancelMotion(true);
    if(state.reduceMotion || document.hidden || motionRuntime.hidden) return false;
    const context=[state.training?.session?.generation ?? 'live',state.room?.roomCode,
      state.room?.matchSummary?.startedAt,state.room?.own?.playerId].join(':');
    if(motionRuntime.context!==context){motionRuntime.consumed.clear();motionRuntime.watermark=-1;motionRuntime.context=context;}
    const seq=state.room?.latestResolution?.feedback?.sequence;
    if(Number.isFinite(seq)&&seq<=motionRuntime.watermark)return false;
    if(Number.isFinite(seq))motionRuntime.watermark=seq;
    const full=context+':'+key;
    if(motionRuntime.consumed.has(full)) return false;
    motionRuntime.consumed.set(full,true);
    while(motionRuntime.consumed.size>128)motionRuntime.consumed.delete(motionRuntime.consumed.keys().next().value);
    motionRuntime.key=key;motionRuntime.started=performance.now();motionRuntime.map=state.battle.mobileMap;
    motionRuntime.timer=setTimeout(()=>{cancelMotion();},1800);
    return true;
  }
  function renderMotionArt(model) {
    const def=motionDefinitions[model.actionType];
    if(!def || state.reduceMotion) return '';
    const shapes='<i class="motion-ring"></i><i class="motion-ring motion-ring--second"></i><i class="motion-ray"></i><i class="motion-ray motion-ray--second"></i><i class="motion-core"></i><i class="motion-scan"></i>';
    return '<span class="motion-glyph motion-'+def.shape+'" data-motion-duration="'+(state.effectiveQuality==='smooth'?def.smooth:def.duration)+'">'+shapes+'</span>';
  }
  function reconcileMotion() {
    const active=state.renderedPage==='P05';
    if(!active || state.reduceMotion || document.hidden || (motionRuntime.key&&motionRuntime.map!==state.battle.mobileMap)){
      if(motionRuntime.key||state.reduceMotion||document.hidden)cancelMotion();reconcileUiMotion();monitorAmbientMotion();return;
    }
    const elapsed=performance.now()-motionRuntime.started;
    for(const old of motionRuntime.animations)old.cancel?.();motionRuntime.animations.clear();
    document.querySelectorAll('.battle-effect-art').forEach(node=>{
      const def=motionDefinitions[node.dataset.effectAction];
      const duration=state.effectiveQuality==='smooth'?def?.smooth:def?.duration;
      if(!def || !motionRuntime.key || elapsed>=duration){node.closest('.battle-effect-layer')?.remove();return;}
      node.style.setProperty('--effect-duration',duration+'ms');
      const smooth=state.effectiveQuality==='smooth';
      node.style.setProperty('--lock-duration',(smooth?Math.min(duration,100):def.lockEnd)+'ms');
      node.style.setProperty('--travel-start',(smooth?0:def.lockEnd)+'ms');
      node.style.setProperty('--travel-duration',(smooth?duration:def.travelEnd-def.lockEnd)+'ms');
      node.style.setProperty('--release-start',(smooth?0:def.travelEnd)+'ms');
      node.style.setProperty('--release-duration',(smooth?duration:def.duration-def.travelEnd)+'ms');
      if(typeof node.getAnimations==='function')for(const a of node.getAnimations({subtree:true})){
        a.currentTime=elapsed;motionRuntime.animations.add(a);
      }
    });
    reconcileUiMotion();
    monitorAmbientMotion();
  }
  function monitorAmbientMotion(){
    const enabled=state.qualityMode==='auto'&&state.effectiveQuality==='high'&&!motionRuntime.autoDegraded
      &&!state.reduceMotion&&!document.hidden&&state.renderedPage==='P05';
    if(!enabled){cancelAnimationFrame(motionRuntime.raf);motionRuntime.raf=0;return;}
    if(motionRuntime.raf)return;
    motionRuntime.previousFrame=performance.now();motionRuntime.sampleAt=performance.now();motionRuntime.samples=[];
    const sample=now=>{
      if(document.hidden||state.reduceMotion||state.renderedPage!=='P05'||state.effectiveQuality!=='high'){motionRuntime.raf=0;return;}
      motionRuntime.samples.push(now-motionRuntime.previousFrame);motionRuntime.previousFrame=now;
      if(now-motionRuntime.sampleAt>=3000){
        const avg=motionRuntime.samples.reduce((a,b)=>a+b,0)/Math.max(1,motionRuntime.samples.length);
        motionRuntime.slow=avg>35?motionRuntime.slow+1:0;motionRuntime.samples=[];motionRuntime.sampleAt=now;
        if(motionRuntime.slow>=2){motionRuntime.autoDegraded=true;state.effectiveQuality='smooth';document.documentElement.dataset.quality='smooth';syncPersonalizeControls();motionRuntime.raf=0;return;}
      }
      motionRuntime.raf=requestAnimationFrame(sample);
    };
    motionRuntime.raf=requestAnimationFrame(sample);
  }
  function queueUiMotion(previous,next,fresh){
    if(!fresh||state.reduceMotion)return;
    const key=[next.roomCode,next.matchSummary?.startedAt,next.own.playerId,next.stateVersion].join(':');
    if(previous?.turn?.currentPlayerId!==next.turn?.currentPlayerId)motionRuntime.uiFacts.push({key:key+':turn',selector:'.battle-header__turn',duration:320,smooth:160,kind:'turn'});
    for(const u of next.battle?.own?.units??[]){
      const old=previous?.battle?.own?.units.find(x=>x.id===u.id);
      if(!old)continue;
      const row='.fleet-unit[data-unit-id='+JSON.stringify(u.id)+']';
      if(old.hp!==u.hp)motionRuntime.uiFacts.push({key:key+':hp:'+u.id,selector:row+' .hp-track',duration:320,smooth:160,kind:'hp'});
      if(old.hp>0&&u.hp<=0)motionRuntime.uiFacts.push({key:key+':sunk:'+u.id,selector:'.battle-map-card--own [data-art-unit-id='+JSON.stringify(u.id)+']',duration:500,smooth:160,kind:'sunk'});
      if(old.paralyzed!==u.paralyzed)motionRuntime.uiFacts.push({key:key+':paralysis:'+u.id,selector:row,duration:280,smooth:120,kind:u.paralyzed?'paralysis':'restore'});
      for(const cell of (u.hitCells??[]).filter(c=>!(old.hitCells??[]).includes(c)).slice(0,4))
        motionRuntime.uiFacts.push({key:key+':hit:'+cell,selector:'.battle-map-card--own [data-coordinate='+JSON.stringify(cell)+']',duration:300,smooth:120,kind:'own-hit'});
    }
    for(const d of next.battle?.own?.decoys??[]){
      const old=previous?.battle?.own?.decoys?.find(x=>x.id===d.id);
      if(old&&!old.destroyed&&d.destroyed)motionRuntime.uiFacts.push({key:key+':decoy:'+d.id,selector:'.battle-map-card--own [data-art-unit-id='+JSON.stringify(d.id)+']',duration:320,smooth:120,kind:'decoy'});
    }
    if(previous?.battle?.own)for(const [action,count]of Object.entries(next.battle?.own?.remainingUses??{}))
      if(previous.battle.own.remainingUses?.[action]!==count)motionRuntime.uiFacts.push({key:key+':resource:'+action,selector:'.action-card[data-action-type='+JSON.stringify(action)+'] small',duration:200,smooth:120,kind:'resource'});
    for(let i=0;i<(next.seats?.length??0);i++){
      const seat=next.seats[i],old=previous?.seats?.[i];
      if(old&&JSON.stringify([seat.playerId,seat.online,seat.ready])!==JSON.stringify([old.playerId,old.online,old.ready]))
        motionRuntime.uiFacts.push({key:key+':seat:'+i,selector:'.seat-card:nth-child('+(i+1)+')',duration:180,smooth:120,kind:'seat'});
    }
    const prevSalvo=previous?.battle?.match?.finalSalvo,nextSalvo=next.battle?.match?.finalSalvo;
    if(next.roomPhase==='FINAL_SALVO'&&(nextSalvo?.completedShots??0)>(prevSalvo?.completedShots??0))
      motionRuntime.uiFacts.push({key:key+':salvo',selector:'.final-salvo-stage__emblem',duration:1100,kind:'salvo',sound:'final_salvo'});
    if(next.roomPhase==='FINISHED'&&previous?.roomPhase!=='FINISHED')motionRuntime.uiFacts.push({key:key+':result',selector:'.result-emblem',duration:1100,smooth:320,kind:'result',sound:next.battle?.match?.result?.winnerId===next.own.playerId?'victory':['draw','canceled'].includes(next.battle?.match?.result?.outcome)?'unknown':'defeat'});
    if(next.roomPhase==='ROLLING'&&JSON.stringify(previous?.rolling)!==JSON.stringify(next.rolling))motionRuntime.uiFacts.push({key:key+':dice',selector:'.die--revealed',duration:420,smooth:160,kind:'dice'});
  }
  // Observe semantic local changes, never hover coordinates or repeated DOM renders.
  function observeLocalUiMotion(){
    const context=[state.renderedPage,state.training?.session?.generation??'live',state.room?.roomCode,state.room?.own?.playerId].join(':');
    if(motionRuntime.localContext!==context){motionRuntime.localSignatures.clear();motionRuntime.localContext=context;}
    const d=state.deployment??{},b=state.battle??{},t=state.tutorial?.session;
    const cues=[
      ['deploy-select',d.selectedId,'.fleet-item--selected',200,120,'lock'],
      ['deploy-place',JSON.stringify(d.placements??[]),'.deployment-map-card .tactical-unit-art-layer',200,120,'deploy'],
      ['action',b.selectedAction,'.action-card--selected .action-card__icon',140,100,'control'],
      ['markers',JSON.stringify([...(b.markers??new Map())]),'.battle-map-card--enemy .board-cell--marker',110,80,'marker'],
      ['map',JSON.stringify([b.mobileMap,b.targetPlayerId]),'.battle-maps',140,100,'map'],
      ['layer',b.tacticalLayer,'.battle-map-card--own .tactical-environment-layer',420,120,'layer'],
      ['drawer',JSON.stringify([b.actionDrawerOpen,b.fleetOpen,b.logOpen]),'.action-rail--open, .fleet-panel--open, .public-log',200,140,'panel'],
      ['request',state.pendingRequest,'.command-summary, .deployment-progress-strip',120,80,'control'],
      ['notice',b.commandNotice,'.command-notice',110,80,'error'],
      ['tutorial',JSON.stringify([t?.lessonIndex,t?.step,t?.messageKind,t?.message]),'.tutorial-task-message',180,120,'tutorial'],
      ['connection',JSON.stringify([state.connected,state.connection?.phase]),'.battle-header__connection, .connection-status-chip',150,100,'connection'],
      ['salvo-choice',b.finalDecoyId,'.final-salvo-stage__emblem',160,120,'lock']
    ];
    for(const [id,value,selector,duration,smooth,kind]of cues){
      const known=motionRuntime.localSignatures.has(id),old=motionRuntime.localSignatures.get(id);
      motionRuntime.localSignatures.set(id,value);
      if(known&&value!==old&&!state.reduceMotion&&!document.hidden){
        let target=selector;
        if(id==='markers'){
          if(motionRuntime.localSignatures.get('map')!==JSON.stringify([b.mobileMap,b.targetPlayerId]))continue;
          const before=new Map(JSON.parse(old)),after=new Map(JSON.parse(value));
          const cell=[...new Set([...before.keys(),...after.keys()])].find(c=>before.get(c)!==after.get(c));
          if(!cell)continue;target='.battle-map-card--enemy [data-coordinate='+JSON.stringify(cell)+']';
        }
        motionRuntime.uiFacts.push({key:'local:'+id+':'+(++motionRuntime.localSequence),selector:target,duration,smooth,kind});
      }
    }
  }
  function reconcileUiMotion(){
    observeLocalUiMotion();
    if(state.reduceMotion||document.hidden)return;
    if(motionRuntime.uiPage!==state.renderedPage){
      for(const a of motionRuntime.uiAnimations)a.cancel?.();motionRuntime.uiAnimations.clear();motionRuntime.activeUi.clear();
      motionRuntime.uiPage=state.renderedPage;Sound?.cancelTransientEffects?.();
    }
    const selection=state.battle.target?JSON.stringify([state.battle.mobileMap,state.battle.selectedAction,state.battle.target]):null;
    if(selection&&selection!==motionRuntime.lastTarget){
      for(const [key,cue]of motionRuntime.activeUi)if(cue.kind==='lock')motionRuntime.activeUi.delete(key);
      motionRuntime.uiFacts.push({key:'target:'+selection+':'+performance.now(),selector:'.board-cell--target-preview',duration:200,kind:'lock'});
    }
    motionRuntime.lastTarget=selection;
    for(const cue of motionRuntime.uiFacts.splice(0)){
      if(!motionRuntime.micro.has(cue.key)){
        if(cue.sound)Sound?.playEffect?.(cue.sound);
        motionRuntime.micro.set(cue.key,true);motionRuntime.activeUi.set(cue.key,{...cue,start:performance.now()});
      }
    }
    while(motionRuntime.micro.size>128)motionRuntime.micro.delete(motionRuntime.micro.keys().next().value);
    for(const a of motionRuntime.uiAnimations)a.cancel?.();motionRuntime.uiAnimations.clear();
    for(const [key,cue]of motionRuntime.activeUi){
      const node=document.querySelector(cue.selector),duration=state.effectiveQuality==='smooth'?(cue.smooth??Math.min(cue.duration,240)):cue.duration;
      const elapsed=performance.now()-cue.start;
      if(!node||typeof node.animate!=='function'||elapsed>=duration){motionRuntime.activeUi.delete(key);continue;}
      const frames=cue.kind==='salvo'?[{opacity:.3,transform:'scale(.75)'},{opacity:1,transform:'scale(1)'},{opacity:1,transform:'scale(1)'}]
        :cue.kind==='result'?[{opacity:0,transform:'scale(1.12)',filter:'brightness(1.5)'},{opacity:1,transform:'scale(1)',filter:'brightness(1)'}]
        :cue.kind==='dice'?[{transform:'rotate(-14deg)',opacity:.5},{transform:'rotate(0deg)',opacity:1}]
        :cue.kind==='sunk'?[{opacity:.75},{opacity:.42}]
        :['paralysis','restore','own-hit','decoy','lock'].includes(cue.kind)?[{boxShadow:'inset 0 0 0 2px var(--accent-primary)',opacity:.65},{boxShadow:'inset 0 0 0 0px transparent',opacity:1}]
        :[{opacity:.5},{opacity:1}];
      const a=node.animate(frames,{duration,easing:'ease-out'});a.currentTime=elapsed;
      if(cue.kind==='salvo')node.classList.add('motion-salvo-neutral');
      motionRuntime.uiAnimations.add(a);
      a.onfinish=()=>{a.cancel();motionRuntime.uiAnimations.delete(a);motionRuntime.activeUi.delete(key);node.classList.remove('motion-salvo-neutral');};
    }
  }

  document.addEventListener('visibilitychange',()=>{
    document.documentElement.dataset.motionHidden=String(document.hidden);
    motionRuntime.hidden=document.hidden;if(!document.hidden)state.suppressNextSync=true;
    if(document.hidden){cancelMotion(); Sound?.cancelTransientEffects?.();}
  });

  document.documentElement.dataset.motionHidden=String(document.hidden);
