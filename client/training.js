  const TRAINING_PROGRESS='ocean.training-progress.v1',TRAINING_SESSION='ocean.training-session.v1';
  function readTrainingProgress(){try{const p=JSON.parse(localStorage.getItem(TRAINING_PROGRESS));return p&&typeof p.completed==='object'&&p.completed&&typeof p.revealed==='object'&&p.revealed?p:{completed:{},revealed:{}};}catch(_){return {completed:{},revealed:{}};}}
  state.training={active:false,catalog:[],session:null,task:null,roles:[],applying:false,busy:false,error:'',group:'',query:'',actionFilter:'',kindFilter:'',mapFilter:0,playersFilter:0,map:12,players:2,coach:null,taskOpen:false,progress:readTrainingProgress()};
  async function trainingHttp(path,options={}){
    const headers={'Content-Type':'application/json',...(state.training.session?.token?{'X-Training-Token':state.training.session.token}:{}),...options.headers};
    const res=await fetch('/api/training/'+path,{...options,headers,cache:'no-store'});
    const result=await res.json();if(!result.ok){
      if(result.error?.code==='TRAINING_EXPIRED'){
        const recent=state.training.scene??state.training.catalog.find(c=>c.id===state.training.progress.recent);
        if(recent?.code==='X12')state.training.expiredTraining={id:recent.id,version:recent.version};
      }
      throw result.error??{message:'训练服务没有返回有效结果。'};}
    return result.data;
  }
  function rememberTraining(){
    try{
      localStorage.setItem(TRAINING_PROGRESS,JSON.stringify(state.training.progress));
      if(state.training.session)sessionStorage.setItem(TRAINING_SESSION,JSON.stringify(state.training.session));
      else sessionStorage.removeItem(TRAINING_SESSION);
    }catch(_){}
  }
  function applyTraining(data){
    const t=state.training,changed=t.session?.generation!==data.generation||state.room?.own?.playerId!==data.view.own.playerId;
    if(changed){cancelMotion();state.room=null;state.pendingRequest=null;state.replayPlayerId=null;clearBattleDraft();Object.assign(state.battle,{mobileMap:'own',targetPlayerId:null,fleetOpen:false,actionDrawerOpen:false,logOpen:false,ownMapAlert:false,finalDecoyId:null,mapViewPositions:new Map()});t.coach=null;t.markerStore=new Map();}
    t.session={id:data.id,token:data.token??t.session?.token,generation:data.generation};t.task=data.task;t.syncedAt=Date.now();t.scene=data.scene;t.roles=data.roles;t.error='';
    if(data.award)t.progress.completed[data.award.id]=data.award.version;
    if(t.expiredTraining?.id===data.scene.id){t.progress.completed[data.scene.id]=data.scene.version;t.expiredTraining=null;}
    if(data.task.completed)t.progress.completed[data.scene.id]=data.scene.version;
    if(data.task.revealed)t.progress.revealed[data.scene.id]=true;
    t.progress.recent=data.scene.id;t.progress.ruleVersion='1.8';t.progress.tutorialCompleted=readTutorialProgress();
    t.applying=true;state.connected=true;setConnectionPhase('online','训练会话已同步','online','训练服务在线');
    if(data.replayEffect){
      state.battle.lastResolutionKey=null;motionRuntime.consumed.clear();motionRuntime.watermark=-1;
    }
    acceptRoomState(data.view);t.applying=false;rememberTraining();scheduleTrainingClock();
  }
  async function enterTraining(){
    if(state.pendingRequest||state.restoring){showToast('当前操作尚未结束，请稍后进入训练营。','warning');return;}
    if(state.room&&!state.training.active){showToast('请先完成或离开正式房间，再进入训练营。','warning');return;}
    if(readStoredSession()){showToast('本机有正式对局恢复记录，请先检查或返回该房间。','warning');return;}
    state.training.active=true;state.training.error='';state.tutorial.active=false;
    history.replaceState(null,'','/training');render();
    try{
      const data=await trainingHttp('catalog');state.training.catalog=data.scenarios;
      let stored=null;try{stored=JSON.parse(sessionStorage.getItem(TRAINING_SESSION));}catch(_){}
      if(stored?.id){state.training.session=stored;try{applyTraining(await trainingHttp('sessions/'+stored.id));}catch(_){state.training.session=null;state.training.notice='上次训练会话已过期，将从初始检查点重新练习；已体验进度仍保留。';sessionStorage.removeItem(TRAINING_SESSION);}}
      if(!state.training.session){
        const id=location.pathname.startsWith('/training/scenarios/')?decodeURIComponent(location.pathname.slice('/training/scenarios/'.length)):null;
        if(id&&state.training.catalog.some(c=>c.id===id))await startTrainingScenario(id);
      }
      render();
    }catch(e){state.training.error=e.message;render();}
  }
  async function startTrainingScenario(id,preset={}){
    if(id.startsWith('LAB:')){const parts=id.split(':');preset={action:parts[1],targetKind:parts[2],sourceState:parts[3]};id='free-practice';}
    const t=state.training;if(t.busy)return;t.busy=true;t.error='';render();
    try{
      if(t.session)await trainingHttp('sessions/'+t.session.id,{method:'DELETE'}).catch(()=>{});
      t.session=null;state.room=null;t.coach=null;t.taskOpen=false;t.localEvents=[];cancelMotion();
      const data=await trainingHttp('sessions',{method:'POST',body:JSON.stringify({scenarioId:id,mapSize:t.map,players:t.players===3?3:undefined,...preset})});
      applyTraining(data);history.replaceState(null,'','/training/scenarios/'+encodeURIComponent(id));
    }catch(e){t.error=e.message;}finally{t.busy=false;render();}
  }
  async function trainingEmit(event,payload={}){
    const t=state.training;
    if(event==='room:leave'){await exitTrainingSession();return {stateVersion:0};}
    if(!t.session)throw {message:'训练会话尚未载入。'};
    const origin={...t.session};
    const data=await trainingHttp('sessions/'+t.session.id+'/commands',{method:'POST',
      body:JSON.stringify({event,payload:{...payload,expectedVersion:payload.expectedVersion??state.room?.stateVersion,trainingGeneration:t.session.generation,trainingEvidence:t.localEvents??[],trainingSettings:{quality:state.effectiveQuality,reduced:state.reduceMotion,muted:!state.audio.effectsEnabled,theme:state.theme,viewport:window.innerWidth}},operationId:payload.intent?.actionId??createActionId()})});
    if(t.session?.id!==origin.id||t.session?.generation!==origin.generation)throw {code:'STALE_TRAINING_RESPONSE',message:'旧训练应答已忽略，请以当前场景为准。'};
    state.suppressNextSync=event==='room:sync';applyTraining(data);
    return {stateVersion:data.view.stateVersion,view:data.view,training:data};
  }
  async function trainingControl(control,extra={}){
    const t=state.training;if(t.busy)return;t.busy=true;
    if(control==='reveal')cancelMotion();
    try{
      const markers=control==='markers'?[...(state.battle.markers??new Map()).entries()]:undefined;
      await trainingEmit('training:control',{control,markers,targetPlayerId:state.battle.targetPlayerId,...extra});
      if(control==='reveal'){t.coach=await trainingHttp('sessions/'+t.session.id+'/reveal');t.taskOpen=true;}
      if(control==='conceal')t.coach=null;
    }catch(e){t.error=e.message;}finally{t.busy=false;render();}
  }
  async function exitTrainingSession(){
    const t=state.training;cancelMotion();clearTimeout(t.clockTimer);t.clockTimer=null;
    if(t.session)await trainingHttp('sessions/'+t.session.id,{method:'DELETE'}).catch(()=>{});
    t.session=null;t.task=null;t.coach=null;state.room=null;state.pendingRequest=null;rememberTraining();render();
    history.replaceState(null,'','/training');
  }
  function trainingButton(action,label,extra=''){
    return '<button type="button" data-action="'+action+'" '+extra+(state.training.busy?' disabled':'')+'>'+label+'</button>';
  }
  function renderTrainingCatalog(){
    const t=state.training,query=t.query.toLowerCase();
    const visible=t.catalog.filter(c=>(!t.group||c.group===t.group)&&(!t.actionFilter||c.action===t.actionFilter)&&(!t.kindFilter||c.kind===t.kindFilter)&&(!t.mapFilter||c.maps.includes(t.mapFilter))&&(!t.playersFilter||c.players===t.playersFilter)&&(!query||(c.title+c.objective+c.id+c.groupName).toLowerCase().includes(query)));
    const done=Object.keys(t.progress.completed??{}).filter(id=>t.catalog.some(c=>c.id===id&&c.version===t.progress.completed[id])).length;
    return '<section class="training-catalog page-enter"><header><span class="eyebrow">OCEAN · 训练营</span><h1>每一种局面，都可以练习。</h1><p>在隔离的合成局面中亲手操作，比较实战可见信息与教官解析。需训练服务在线；进度仅保存在本机。</p><p>'+done+' / '+t.catalog.length+' 个变体已体验 · '+new Set(t.catalog.map(c=>c.parentId)).size+'个主题场景</p></header>'+
      '<nav class="training-top">'+trainingButton('training-home','返回首页')+trainingButton('start-tutorial','五章本地入门')+trainingButton('training-clear-progress','重置训练进度')+
      (t.progress.recent?trainingButton('training-start','继续最近练习','data-scenario="'+escapeHtml(t.progress.recent)+'"'):'')+'</nav>'+
      '<form id="training-filter" class="training-filters"><label>查找场景<input name="query" value="'+escapeHtml(t.query)+'" placeholder="例如：摩托艇、断线、保密"></label><label>主题<select name="group"><option value="">全部主题</option>'+
      [['D','部署与开局'],['W','伤害与资源'],['I','侦察与标记'],['F','三人模式'],['E','齐射与终局'],['X','限制与恢复'],['R','房间与阶段']].map(([id,name])=>'<option value="'+id+'" '+(t.group===id?'selected':'')+'>'+name+'</option>').join('')+
      '</select></label><details class="training-filter-extra"><summary>按行动、阶段、地图、人数筛选</summary><div><label>行动<select name="actionFilter"><option value="">全部行动</option>'+Data.ACTION_DEFINITIONS.map(d=>'<option value="'+d.type+'" '+(t.actionFilter===d.type?'selected':'')+'>'+escapeHtml(d.name)+'</option>').join('')+'</select></label><label>阶段<select name="kindFilter"><option value="">全部阶段</option>'+[['lobby','等待房间'],['deployment','部署'],['rolling','掷骰'],['opening','首回合'],['battle','对战'],['markers','私人标记'],['salvo','最终齐射'],['recovery','异常恢复']].map(([v,n])=>'<option value="'+v+'" '+(t.kindFilter===v?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label>地图筛选<select name="mapFilter"><option value="0">全部地图</option>'+[10,12,15].map(v=>'<option '+(t.mapFilter===v?'selected':'')+'>'+v+'</option>').join('')+'</select></label><label>人数筛选<select name="playersFilter">'+[[0,'全部人数'],[2,'2人'],[3,'3人']].map(([v,n])=>'<option value="'+v+'" '+(t.playersFilter===v?'selected':'')+'>'+n+'</option>').join('')+'</select></label></div></details><label>自由试验 · 地图<select name="map">'+[10,12,15].map(n=>'<option '+(t.map===n?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label>合成席位<select name="players"><option value="2">按场景默认</option><option value="3" '+(t.players===3?'selected':'')+'>3人试验</option></select></label><button type="submit">应用筛选</button>'+trainingButton('training-filter-clear','清空筛选')+'</form>'+
      (t.error?'<p role="alert" class="form-error">'+escapeHtml(t.error)+' '+trainingButton('training-open','重试连接')+'</p>':'')+
      '<details class="training-lab"><summary>自由演练 · 自选行动、目标与来源状态</summary><form id="training-lab"><label>行动<select name="action">'+Data.ACTION_DEFINITIONS.map(d=>'<option value="'+d.type+'">'+escapeHtml(d.name)+'</option>').join('')+'</select></label><label>目标<select name="targetKind">'+[['unit','完整单位'],['surface','水面单位'],['underwater','水下单位'],['carrier','航母'],['empty','空海域'],['decoy','有效鱼雷'],['old','已受击格'],['wreck','残骸'],['destroyed-decoy','已毁鱼雷'],['positive','区域有信号'],['negative','区域无信号']].map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join('')+'</select></label><label>来源<select name="sourceState">'+[['normal','正常'],['sunk','已沉没'],['paralyzed','瘫痪'],['exhausted','资源耗尽']].map(([v,n])=>'<option value="'+v+'">'+n+'</option>').join('')+'</select></label><button type="submit">创建自由局面</button><p>地图与席位沿用上方选择。无效组合会解释原因；不会修改正式房间。</p></form></details>'+
      (!t.catalog.length?'<p role="status">正在获取训练目录…</p>':'<div class="training-cards">'+visible.map(c=>'<article><small>'+escapeHtml(c.groupName)+' · '+escapeHtml(c.id)+'</small><h2>'+escapeHtml(c.title)+'</h2><p>'+escapeHtml(c.objective)+'</p><span>'+((t.progress.completed??{})[c.id]===c.version?'已体验':((t.progress.completed??{})[c.id]?'旧版已体验 · 当前版本待练':'未练习'))+((t.progress.revealed??{})[c.id]?' · 已看解析':'')+'</span>'+trainingButton('training-start','进入练习','data-scenario="'+escapeHtml(c.id)+'"')+'</article>').join('')+'</div>')+'</section>';
  }
  function renderTrainingTask(){
    const t=state.training;if(!t.session)return '';
    const task=t.task??{};
    const buttons=trainingButton('training-control','重置场景','data-control="reset"')+
      trainingButton('training-control','重来上一步','data-control="undo"')+
      trainingButton('training-exit-session','场景库')+
      trainingButton('training-control','查看教官解析','data-control="reveal"')+
      trainingButton('training-control','重播本例效果','data-control="replay"')+trainingButton('training-next','下一场景')+
      '<details class="training-advanced"><summary>训练环境与时间控制</summary>'+trainingButton('training-control','推进合成席位','data-control="script"')+
      trainingButton('training-control','推进至截止前5秒','data-control="clock-before"')+
      trainingButton('training-control','推进至截止之后','data-control="clock"')+
      trainingButton('training-control',task.running?'暂停计时':'继续计时','data-control="run-clock"')+
      trainingButton('training-control','模拟断线','data-control="disconnect"')+trainingButton('training-control','模拟席位加入','data-control="join-seat"')+trainingButton('training-control','模拟另一方赛后离开','data-control="leave-other"')+
      trainingButton('training-control','恢复合成座位','data-control="resume"')+trainingButton('training-control','模拟回到前台','data-control="foreground"')+trainingButton('training-control','同步训练状态','data-control="sync"')+trainingButton('training-control','模拟训练服务重启','data-control="expire"')+
      (task.restriction?trainingButton('training-control','验证受限条件','data-control="restriction"')+trainingButton('training-control','重建可操作检查点','data-control="recover-checkpoint"'):'')+
      (t.scene?.kind==='markers'?trainingButton('training-control','验证本机标记','data-control="markers"'):'')+'</details>';
    return '<aside class="training-task" aria-label="训练任务"><p class="training-current">'+escapeHtml(task.hint??'')+'</p>'+(t.notice?'<p class="training-current" role="status">'+escapeHtml(t.notice)+'</p>':'')+(!t.taskOpen?'<div class="training-quick">'+trainingButton('training-exit-session','场景库')+trainingButton('training-control','重来','data-control="reset"')+trainingButton('training-next','下一场景')+trainingButton('training-control','教官解析','data-control="reveal"')+'</div>':'')+'<details '+(t.taskOpen?'open':'')+'><summary>训练营 · 合成局面 · 任务与控制 <strong>'+(task.completed?'本例已体验':'当前任务')+'</strong> '+escapeHtml(t.scene?.id??'')+'</summary>'+
      '<div class="training-task-body"><h2>'+escapeHtml(t.scene?.title??'')+'</h2>'+(t.scene?.code==='R05'?'<form id="training-entry"><label>训练昵称<input id="training-nickname-input" name="nickname" value="'+escapeHtml(t.entryDraft?.nickname??'')+'" autocomplete="off"></label><label>训练房间码<input id="training-room-code-input" name="roomCode" value="'+escapeHtml(t.entryDraft?.roomCode??'')+'" placeholder="例如 ABCDEF" autocomplete="off"></label><button type="submit">验证训练字段</button></form>':'')+'<p>'+escapeHtml(task.hint??'')+'</p><p>'+escapeHtml(t.scene?.objective??'')+'</p><p role="status">'+(task.completed?'已体验；可以重来比较其他选择。':'尚未完成目标。')+' · '+(task.running?'虚拟时钟运行中':'虚拟时钟已暂停')+(task.remaining!==null?' · 剩余 '+task.remaining+' 秒':'')+'</p><div class="training-controls">'+buttons+'</div><div class="training-roles">'+t.roles.map(role=>trainingButton('training-role',escapeHtml(role.name),'data-role="'+escapeHtml(role.id)+'"')).join('')+'</div>'+
      (t.error?'<p class="form-error" role="alert">'+escapeHtml(t.error)+'</p>':'')+'<ul>'+ (task.notes??[]).map(n=>'<li>'+escapeHtml(n)+'</li>').join('')+'</ul>'+
      (t.coach?'<section class="training-coach"><h3>教官视角 · 已揭示</h3><p>'+escapeHtml(t.coach.explanation)+'</p>'+trainingButton('training-control','收起教官解析','data-control="conceal"')+(t.coach.lessons??[]).map(line=>'<p>'+escapeHtml(line)+'</p>').join('')+Object.entries(t.coach.players).map(([id,p])=>'<h4>'+escapeHtml(id)+'</h4><p>'+p.units.map(u=>escapeHtml((Data.getUnitDefinitionById(u.id)??{}).name??u.id)+' '+u.hp+'HP ['+u.cells.map(escapeHtml).join('、')+']').join('；')+'</p>').join('')+'<p>实际记录 '+(t.coach.actionLog?.length??0)+' 次行动；这些真实部署不会写入玩家情报。</p></section>':'')+'</div></details></aside>';
  }
  document.addEventListener('toggle',e=>{if(e.target.isConnected&&e.target.matches?.('.training-task > details'))state.training.taskOpen=e.target.open;},true);
  async function handleTrainingAction(action,control){
    if(action==='training-open'){await enterTraining();return;}
    if(action==='training-next'){const i=state.training.catalog.findIndex(c=>c.id===state.training.scene.id);await startTrainingScenario(state.training.catalog[(i+1)%state.training.catalog.length].id);return;}
    if(action==='training-start'){await startTrainingScenario(control.dataset.scenario);return;}
    if(action==='training-exit-session'){await exitTrainingSession();return;}
    if(action==='training-home'){await exitTrainingSession();state.training.active=false;history.replaceState(null,'','/');render();return;}
    if(action==='training-filter-clear'){Object.assign(state.training,{group:'',query:'',actionFilter:'',kindFilter:'',mapFilter:0,playersFilter:0});render();return;}
    if(action==='training-control'){
      let c=control.dataset.control;const extra={};
      if(c==='clock-before'){c='clock';extra.before=true;}
      if(c==='sync'){try{await trainingEmit('room:sync',{});}catch(e){state.training.error=e.message;render();}return;}
      await trainingControl(c,extra);return;
    }
    if(action==='training-role'){await trainingControl('role',{role:control.dataset.role});return;}
    if(action==='training-clear-progress')openConfirm({title:'重置训练进度？',paragraphs:['只清除此设备的训练营体验记录，不影响正式房间、五章入门或个性化设置。'],onConfirm:()=>{state.training.progress={completed:{},revealed:{}};rememberTraining();render();}});
  }
  document.addEventListener('submit',e=>{
    if(e.target.id==='training-entry'){e.preventDefault();const f=new FormData(e.target);state.training.entryDraft={nickname:String(f.get('nickname')??''),roomCode:String(f.get('roomCode')??'')};void trainingControl('validate-entry',state.training.entryDraft);return;}
    if(e.target.id==='training-lab'){
      e.preventDefault();const form=new FormData(e.target);
      void startTrainingScenario('free-practice',{action:form.get('action'),targetKind:form.get('targetKind'),sourceState:form.get('sourceState')});return;
    }
    if(e.target.id!=='training-filter')return;e.preventDefault();
    const form=new FormData(e.target),t=state.training;
    t.query=String(form.get('query')??'');t.group=String(form.get('group')??'');t.map=Number(form.get('map'));t.players=Number(form.get('players'));t.actionFilter=String(form.get('actionFilter')??'');t.kindFilter=String(form.get('kindFilter')??'');t.mapFilter=Number(form.get('mapFilter'));t.playersFilter=Number(form.get('playersFilter'));render();
  });

  document.addEventListener('click',e=>{
    if(!state.training.session)return;
    const c=e.target.closest('[data-action]');if(!c||c.disabled)return;
    const local={action:c.dataset.action,unitId:c.dataset.unitId??c.dataset.placementId??c.dataset.id??null,coordinate:c.dataset.coordinate??null};
    state.training.localEvents??=[];state.training.localEvents.push(local);
    if(state.training.localEvents.length>128)state.training.localEvents.shift();
  },true);

  function scheduleTrainingClock(){
    const t=state.training;
    if(!t.task?.running||!t.session||!t.active){clearTimeout(t.clockTimer);t.clockTimer=null;return;}
    if(t.clockTimer)return;
    t.clockTimer=setTimeout(async()=>{
      t.clockTimer=null;
      if(t.task?.running&&t.session&&!t.busy&&!state.pendingRequest){
        try{await trainingEmit('room:sync',{});}catch(e){t.error=e.message;t.task.running=false;render();}
      }
      scheduleTrainingClock();
    },1000);
  }

  function recordTrainingLocal(event){
    if(!state.training?.session)return;
    state.training.localEvents??=[];state.training.localEvents.push(event);
    if(state.training.localEvents.length>128)state.training.localEvents.shift();
  }
  document.addEventListener('keydown',e=>{
    if(state.training?.session&&e.target.closest?.('.ocean-board')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter','Delete'].includes(e.key))recordTrainingLocal({action:'keyboard',key:e.key});
  });
  document.addEventListener('scroll',e=>{
    if(state.training?.session&&e.target.matches?.('.board-frame'))recordTrainingLocal({action:'map-scrolled'});
  },true);

  let trainingSizeObserver=null;
  function hydrateTrainingHeight(){
    trainingSizeObserver?.disconnect();trainingSizeObserver=null;
    const task=document.querySelector('.training-task');
    if(!state.training?.session||!task){document.body.style.removeProperty('--training-height');return;}
    const measure=()=>document.body.style.setProperty('--training-height',(Math.ceil(task.getBoundingClientRect().height)+16)+'px');
    measure();
    if(typeof ResizeObserver==='function'){trainingSizeObserver=new ResizeObserver(measure);trainingSizeObserver.observe(task);}
  }
