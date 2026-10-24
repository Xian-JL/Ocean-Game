  const TRAINING_PROGRESS='ocean.training-progress.v1',TRAINING_SESSION='ocean.core-training-session.v1';
  function readTrainingProgress(){try{const p=JSON.parse(localStorage.getItem(TRAINING_PROGRESS));return p&&p.completed&&typeof p.completed==='object'?p:{completed:{},revealed:{}};}catch(_){return {completed:{},revealed:{}};}}
  state.training={active:false,session:null,task:null,lesson:null,mode:null,course:[],weapons:[],applying:false,busy:false,loading:false,error:'',notice:'',progress:readTrainingProgress(),operation:0,opponentTimer:null,advancing:null};
  async function trainingHttp(path,options={}){
    const headers={'Content-Type':'application/json',...(state.training.session?.token?{'X-Training-Token':state.training.session.token}:{}),...options.headers};
    const response=await fetch('/api/training/'+path,{...options,headers,cache:'no-store'}),result=await response.json();
    if(!result.ok)throw result.error??{message:'练习暂时无法连接，请重试。'};return result.data;
  }
  function rememberTraining(){try{localStorage.setItem(TRAINING_PROGRESS,JSON.stringify(state.training.progress));if(state.training.session)sessionStorage.setItem(TRAINING_SESSION,JSON.stringify(state.training.session));else sessionStorage.removeItem(TRAINING_SESSION);}catch(_){}}
  function clearTrainingAutomation(){clearTimeout(state.training.opponentTimer);state.training.opponentTimer=null;state.training.advancing=null;}
  function sameTrainingOrigin(origin){return Boolean(state.training.active&&state.training.session?.id===origin.id&&state.training.session?.generation===origin.generation);}
  function applyTraining(data){
    const t=state.training,changed=t.session?.generation!==data.generation||state.room?.own?.playerId!==data.view.own.playerId;
    if(changed){clearTrainingAutomation();cancelMotion();state.room=null;state.pendingRequest=null;state.replayPlayerId=null;clearBattleDraft();Object.assign(state.battle,{mobileMap:'own',targetPlayerId:null,fleetOpen:false,actionDrawerOpen:false,logOpen:false,ownMapAlert:false,finalDecoyId:null,mapViewPositions:new Map()});t.markerStore=new Map();}
    t.session={id:data.id,token:data.token??t.session?.token,generation:data.generation};t.mode=data.playerMode;t.lesson=data.lesson;t.task=data.task;t.scene=data.scene;t.syncedAt=Date.now();t.error='';
    if(data.task.completed)t.progress.completed[data.scene.id]=data.scene.version;
    t.progress.recent={mode:t.mode,id:t.lesson.id};t.progress.ruleVersion='1.8';
    t.applying=true;state.connected=true;setConnectionPhase('online','练习已就绪','online','练习在线');acceptRoomState(data.view);t.applying=false;
    if(changed&&state.room.roomPhase==='PLAYING'){const opponent=activeBattleOpponentIds(state.room)[0];if(opponent){state.battle.targetPlayerId=opponent;state.battle.mobileMap=opponent;}}
    rememberTraining();scheduleTrainingOpponent();
  }
  async function enterTraining(){
    if(state.pendingRequest||state.restoring){showToast('当前操作尚未结束，请稍后进入训练营。','warning');return;}
    if(state.room&&!state.training.active){showToast('请先完成或离开正式房间，再进入训练营。','warning');return;}
    if(readStoredSession()){showToast('本机有正式对局恢复记录，请先检查或返回该房间。','warning');return;}
    const t=state.training;t.active=true;t.loading=true;t.error='';state.tutorial.active=false;history.replaceState(null,'','/training');render();
    try{
      const data=await trainingHttp('course');t.course=data.course;t.weapons=data.weapons;
      let stored=null;try{stored=JSON.parse(sessionStorage.getItem(TRAINING_SESSION));}catch(_){}
      if(stored?.id){t.session=stored;try{const resumed=await trainingHttp('sessions/'+stored.id);if(!resumed.playerMode)throw Error('旧练习');applyTraining(resumed);}catch(_){t.session=null;t.notice='上次练习已结束，可以重新开始；已完成的学习进度仍保留。';sessionStorage.removeItem(TRAINING_SESSION);}}
    }catch(e){t.error=e.message;}finally{t.loading=false;render();}
  }
  async function startTrainingScenario(id='fire',preset={}){
    const t=state.training;if(t.busy)return;const operation=++t.operation,mode=preset.mode??'course';t.busy=true;t.error='';clearTrainingAutomation();render();
    try{
      if(t.session)await trainingHttp('sessions/'+t.session.id,{method:'DELETE'}).catch(()=>{});
      t.session=null;state.room=null;t.lesson=null;t.localEvents=[];cancelMotion();
      const data=await trainingHttp('sessions',{method:'POST',body:JSON.stringify({mode,lessonId:id})});
      if(operation===t.operation){applyTraining(data);history.replaceState(null,'','/training');}
    }catch(e){if(operation===t.operation)t.error=e.message;}finally{if(operation===t.operation){t.busy=false;render();}}
  }
  async function trainingEmit(event,payload={}){
    const t=state.training;if(event==='room:leave'){await exitTrainingSession();return {stateVersion:0};}
    if(!t.session)throw {message:'练习尚未准备好。'};const origin={...t.session};
    const data=await trainingHttp('sessions/'+origin.id+'/commands',{method:'POST',body:JSON.stringify({event,payload:{...payload,expectedVersion:payload.expectedVersion??state.room?.stateVersion,trainingGeneration:origin.generation},operationId:payload.intent?.actionId??createActionId()})});
    if(!sameTrainingOrigin(origin))throw {code:'STALE_TRAINING_RESPONSE',message:'练习已切换。'};
    state.suppressNextSync=event==='room:sync';applyTraining(data);return {stateVersion:data.view.stateVersion,view:data.view,training:data};
  }
  async function trainingControl(control){
    if(control!=='reset')return;const t=state.training;if(t.busy)return;const operation=++t.operation;t.busy=true;clearTrainingAutomation();
    try{await trainingEmit('training:control',{control:'reset'});}catch(e){if(operation===t.operation)t.error=e.message;}finally{if(operation===t.operation){t.busy=false;render();}}
  }
  async function exitTrainingSession(){
    const t=state.training;++t.operation;clearTrainingAutomation();cancelMotion();const session=t.session;
    t.session=null;t.task=null;t.lesson=null;t.mode=null;t.busy=false;t.error='';state.room=null;state.pendingRequest=null;rememberTraining();render();history.replaceState(null,'','/training');
    if(session)await trainingHttp('sessions/'+session.id,{method:'DELETE',headers:{'X-Training-Token':session.token}}).catch(()=>{});
  }
  function trainingButton(action,label,extra=''){return '<button type="button" data-action="'+action+'" '+extra+((state.training.busy||state.training.loading)?' disabled':'')+'>'+label+'</button>';}
  function renderTrainingCatalog(){
    const t=state.training,done=t.course.filter(x=>t.progress.completed['course:'+x.id]==='core-1').length;
    return '<section class="training-catalog page-enter"><header><span class="eyebrow">OCEAN · TRAINING</span><h1>上手海战，从开火开始。</h1><p>舰队已经就位。练习瞄准、侦察和武器运用，陪练会自动回应。</p>'+trainingButton('training-home','返回首页')+'</header>'+
      (t.notice?'<p class="training-notice" role="status">'+escapeHtml(t.notice)+'</p>':'')+(t.error?'<p class="form-error" role="alert">'+escapeHtml(t.error)+' '+trainingButton('training-open','重新连接')+'</p>':'')+
      '<div class="training-modes"><article><span class="eyebrow">4 步上手</span><h2>快速上手</h2><p>开火、雷达、潜射导弹、最终齐射。跟随四个简短练习，熟悉战斗操作。</p><small>'+done+' / 4 步已完成</small>'+trainingButton('training-start','开始训练','class="button button--primary" data-mode="course" data-lesson="fire"')+'</article>'+
      '<article><span class="eyebrow">不计时 · 随时重来</span><h2>自由练习</h2><p>直接与陪练交战，自己选择行动和目标。无需部署，也没有倒计时压力。</p><small>12×12 海域 · 自动陪练</small>'+trainingButton('training-start','进入练习','class="button button--secondary" data-mode="free" data-lesson="free"')+'</article></div>'+
      '<section class="training-weapons" aria-labelledby="training-weapons-title"><h2 id="training-weapons-title">试试不同武器</h2><p>选择一种行动，立即进入对应的战斗练习。</p>'+(t.loading?'<p role="status">正在准备训练营…</p>':'<div class="training-weapon-grid">'+t.weapons.map(w=>trainingButton('training-start',uiIcon(actionVisualMeta(Data.getActionDefinition(w.action)).icon)+'<span>'+escapeHtml(w.title)+'</span>','data-mode="weapon" data-lesson="'+escapeHtml(w.id)+'"')).join('')+'</div>')+'</section></section>';
  }
  function renderTrainingTask(){
    const t=state.training;if(!t.session||!t.lesson)return '';const lesson=t.lesson,complete=t.task?.completed;
    const label=t.mode==='course'?'快速上手 · '+(lesson.index+1)+' / '+lesson.total:t.mode==='weapon'?'武器体验':'自由练习',text=complete&&t.mode!=='free'?lesson.explanation:lesson.description;
    const next=complete&&t.mode!=='free'?(lesson.next?trainingButton('training-next','下一步','class="button button--primary"'):trainingButton('training-start',t.mode==='course'?'完成训练 · 自由练习':'进入自由练习','class="button button--primary" data-mode="free" data-lesson="free"')):'';
    return '<aside class="training-task" aria-label="战斗练习"><div><span class="eyebrow">'+label+(complete&&t.mode!=='free'?' · 已完成':'')+'</span><h2>'+escapeHtml(lesson.title)+'</h2><p class="training-current" role="status">'+escapeHtml(text)+'</p>'+(t.error?'<p class="form-error" role="alert">'+escapeHtml(t.error)+' '+trainingButton('training-retry','重试')+'</p>':'')+'</div><nav aria-label="练习操作">'+next+trainingButton('training-restart','重来')+trainingButton('training-exit-session','退出练习')+'</nav></aside>';
  }
  function renderTrainingFinishActions(){return '<section class="training-finish"><h2>本次练习结束</h2><p>可以重新开局，再试一种战术。</p>'+trainingButton('training-restart','再练一次','class="button button--primary"')+trainingButton('training-exit-session','返回训练营')+'</section>';}
  async function handleTrainingAction(action,control){
    if(action==='training-open'){await enterTraining();return;}
    if(action==='training-start'){await startTrainingScenario(control.dataset.lesson,{mode:control.dataset.mode});return;}
    if(action==='training-next'){if(state.training.task?.completed&&state.training.lesson?.next)await startTrainingScenario(state.training.lesson.next,{mode:'course'});return;}
    if(action==='training-restart'){await trainingControl('reset');return;}
    if(action==='training-retry'){try{await trainingEmit('room:sync',{});}catch(e){state.training.error=e.message;render();}return;}
    if(action==='training-exit-session'){await exitTrainingSession();return;}
    if(action==='training-home'){await exitTrainingSession();state.training.active=false;history.replaceState(null,'','/');render();}
  }
  function scheduleTrainingOpponent(){
    const t=state.training,r=state.room,needed=t.active&&t.session&&!t.error&&!document.hidden&&r&&((r.roomPhase==='PLAYING'&&(!r.turn?.canAct||r.turnPhase==='AUTO_SKIPPING'))||(r.roomPhase==='FINAL_SALVO'&&r.battle?.match?.finalSalvo?.ownSubmitted));
    if(!needed||(t.mode!=='free'&&t.task?.completed)){clearTimeout(t.opponentTimer);t.opponentTimer=null;return;}
    if(t.opponentTimer||t.advancing)return;const origin={...t.session,version:r.stateVersion};
    t.opponentTimer=setTimeout(async()=>{
      t.opponentTimer=null;if(!sameTrainingOrigin(origin)||document.hidden)return;
      if(t.busy||state.pendingRequest||state.room?.stateVersion!==origin.version){scheduleTrainingOpponent();return;}
      t.advancing=origin;
      try{await trainingEmit('training:advance');}catch(e){if(sameTrainingOrigin(origin)){t.error='陪练暂时没有回应，请重试。';render();}}
      finally{if(t.advancing===origin){t.advancing=null;scheduleTrainingOpponent();}}
    },1500);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(state.training.opponentTimer);state.training.opponentTimer=null;}else scheduleTrainingOpponent();});
  function recordTrainingLocal(){}
  let trainingSizeObserver=null;
  function hydrateTrainingHeight(){
    trainingSizeObserver?.disconnect();trainingSizeObserver=null;const task=document.querySelector('.training-task');
    if(!state.training?.session||!task){document.body.style.removeProperty('--training-height');return;}
    const measure=()=>document.body.style.setProperty('--training-height',(Math.ceil(task.getBoundingClientRect().height))+'px');measure();
    if(typeof ResizeObserver==='function'){trainingSizeObserver=new ResizeObserver(measure);trainingSizeObserver.observe(task);}
  }
