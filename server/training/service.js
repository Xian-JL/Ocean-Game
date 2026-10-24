'use strict';
const {randomBytes,randomUUID,createHash}=require('node:crypto');
const R=require('../game/rules');
const {catalog,makeScenario,intentFor,runAction,chooseTarget,layout,ids}=require('./scenarios');
const {FixedWindowRateLimiter}=require('../operations/rate-limiter');
const {playerCatalog,findLesson,lessonView,freeRoom}=require('./course');
const {createBotActionIntent,chooseBotFinalSalvo}=require('../game/bot-strategy');
const clone=x=>structuredClone(x);
function operationFingerprint(event,payload){const {expectedVersion,trainingGeneration,trainingEvidence,...meaning}=payload;return createHash('sha256').update(JSON.stringify([event,meaning])).digest('hex');}
function fail(code,message){const e=new Error(message);e.code=code;throw e;}
class TrainingService{
 constructor(options={}){this.sessions=new Map();this.now=options.now??Date.now;this.max=options.max??100;this.ttl=options.ttl??1800000;}
 prune(){for(const [id,s]of this.sessions)if(this.now()-s.touched>=this.ttl)this.sessions.delete(id);}
 create(scenarioId,preset={}){
  this.prune();if(this.sessions.size>=this.max)fail('TRAINING_CAPACITY','训练营暂满，请稍后再试。');
  let scene=catalog.find(c=>c.id===scenarioId);
  if(scenarioId==='free-practice'){
   if(!Object.values(R.ACTION_TYPES).includes(preset.action))fail('INVALID_PRESET','请选择现有行动。');
   if(!['unit','surface','underwater','carrier','empty','decoy','old','wreck','destroyed-decoy','positive','negative'].includes(preset.targetKind))fail('INVALID_PRESET','目标预设无效。');
   if(!['normal','sunk','paralyzed','exhausted'].includes(preset.sourceState))fail('INVALID_PRESET','来源状态无效。');
   scene={id:'LAB:'+preset.action+':'+preset.targetKind+':'+preset.sourceState,parentId:'LAB',code:'LAB',variant:preset.targetKind,
    group:'L',groupName:'自由演练',title:R.getActionDefinition(preset.action).name+' · 自由试验',
    objective:'在合法合成局面中比较选择的目标与来源状态；所有结算使用正式规则内核。',action:preset.action,kind:'battle',players:preset.players===3?3:2,version:'1.5.0',maps:[10,12,15]};
  }
  if(!scene)fail('SCENARIO_NOT_FOUND','训练场景不存在。');
  const s=makeScenario(scene,preset);s.id=randomUUID();s.token=randomBytes(32).toString('base64url');s.generation=randomUUID();
  s.touched=this.now();s.operations=new Map();s.revealed=false;s.preset=preset;s.transport={};s.notes=[];
  s.initial=clone(s.room);s.initialViewer=s.viewer;s.running=false;s.tickAt=this.now();s.entryErrors=new Set();s.entryValidated=false;s.joinRejected=false;s.simulatedExpiry=false;s.clientEvidence=[];s.clientSettings={};s.taskEvents=[];
  this.sessions.set(s.id,s);return this.response(s,true);
 }
 createPlayer(mode,lessonId){
  if(!['course','weapon','free'].includes(mode))fail('INVALID_TRAINING_MODE','请选择一种练习方式。');
  const lesson=findLesson(mode,lessonId);if(!lesson)fail('LESSON_NOT_FOUND','这项练习不存在。');
  const created=this.create(lesson.scene??'CAMP-W01',{mapSize:12,players:2}),s=this.get(created.id,created.token);
  s.playerMode=mode;s.playerLesson=lesson;this.preparePlayer(s);return this.response(s,true);
 }
 preparePlayer(s){
  if(s.playerMode==='free'){s.room=freeRoom();s.action=null;s.target=null;s.completed=false;}
  for(const seat of s.room.seats){seat.nickname=seat.playerId===s.viewer?'你':'陪练舰队';}
  s.initial=clone(s.room);s.running=false;s.revealed=false;
 }
 advancePlayer(s){
  if(!s.playerMode)return;
  if(s.playerMode!=='free'&&s.completed)return;
  for(let step=0;step<8;step++){
   if(s.room.roomPhase==='FINAL_SALVO'){
    const actor=s.room.seats.find(x=>x.playerId!==s.viewer).playerId;
    const view=R.createRoomView(s.room,actor,s.now),f=view.battle?.match?.finalSalvo;
    if(f?.status==='selecting'&&!f.ownSubmitted){
     const decoy=chooseBotFinalSalvo(view,{difficulty:'beginner'});
     if(decoy)s.room=R.submitFinalSalvoSelection(s.room,actor,decoy,s.now);
    }
    break;
   }
   if(s.room.roomPhase!=='PLAYING')break;
   if(s.room.turnPhase==='AUTO_SKIPPING'){s.room=R.completeAutomaticTurnSkip(s.room,s.now);continue;}
   if(s.room.turnPhase==='RESOLVING'){s.room=R.completePlayerAction(s.room,s.now);continue;}
   if(s.room.currentPlayerId===s.viewer)break;
   const actor=s.room.currentPlayerId,view=R.createRoomView(s.room,actor,s.now);
   const intent=createBotActionIntent(view,{difficulty:'beginner',actionId:randomUUID()});
   s.room=R.completePlayerAction(R.beginPlayerAction(s.room,actor,intent,s.now),s.now+1);
  }
 }
 get(id,token){
  this.prune();const s=this.sessions.get(id);
  if(!s||!token||s.token!==token)fail('TRAINING_EXPIRED','训练已过期或凭证不匹配，请重新进入。');
  s.touched=this.now();
  if(s.running){s.now+=Math.max(0,this.now()-s.tickAt);s.tickAt=this.now();this.timers(s);}
  return s;
 }
 response(s,credential=false){
  const view=R.createRoomView(s.room,s.viewer,s.now);
  // Freeze training time while retaining formal 180/90/120 second thresholds.
  const phaseDeadline=view.deadlines?.actionDeadlineAt??view.deadlines?.deploymentDeadlineAt;
  const data={id:s.id,generation:s.generation,scene:s.scene,view,task:{hint:s.hint,action:s.action,target:s.target,
    restriction:s.restriction,rejected:s.rejected,completed:s.completed,steps:s.steps,notes:s.notes.slice(-12),
    clock:s.now,running:s.running,remaining:phaseDeadline?Math.max(0,Math.ceil((phaseDeadline-s.now)/1000)):null,
    revealed:s.revealed,events:s.taskEvents.slice(-16)},roles:s.room.seats.map(x=>({id:x.playerId,name:x.nickname})),
    replayEffect:s.replayEffect??false,award:s.award??null,expiresIn:1800};
  s.replayEffect=false;s.award=null;
  if(s.playerMode){
   data.playerMode=s.playerMode;data.lesson=lessonView(s.playerMode,s.playerLesson);
   data.scene={id:s.playerMode+':'+s.playerLesson.id,title:s.playerLesson.title,version:'core-1'};
   data.task={completed:s.completed,clock:s.now,running:false,remaining:null,revealed:false};
   data.roles=[];
  }
  if(credential)data.token=s.token;
  return data;
 }
 saveCheckpoint(s){s.history.push(Object.fromEntries(['room','viewer','now','completed','steps','notes','taskEvents','transport','paralysisSeen','markerVerified','rejected','hint','target','action','restriction','running','revealed','entryErrors','entryValidated','joinRejected','clientEvidence','clientSettings'].map(k=>[k,clone(s[k])])));
  if(s.history.length>16)s.history.shift();}
 timers(s){
   const before=s.room.stateVersion;
   if(s.room.connectionPhase!=='CONNECTED'){
    if(R.isDisconnectResolutionDue(s.room,s.now))s.room=R.processDisconnectTimeout(s.room,s.now);
   }else if(s.room.roomPhase==='DEPLOYING'&&s.now>=s.room.deploymentDeadlineAt)
    s.room=R.completeDeploymentTimeout(s.room,s.now,(_id,rules)=>layout(rules.mapSize));
   else if(s.room.roomPhase==='PLAYING'&&s.room.turnPhase==='ACTIVE'&&s.now>=s.room.actionDeadlineAt)
    s.room=R.processActionTimeout(s.room,s.now);
   if(s.room.stateVersion!==before){s.taskEvents??=[];s.taskEvents.push('timer-fired');}
 }
 script(s){
   if(s.room.roomPhase==='DEPLOYING'){
    for(const seat of s.room.seats){
     if(seat.playerId===s.viewer||seat.ready)continue;
     if(!seat.deployment)s.room=R.submitDeployment(s.room,seat.playerId,layout(s.room.mapSize),s.now);
     s.room=R.setPlayerReady(s.room,seat.playerId,s.now);
    }
    return;
   }
   if(s.room.roomPhase==='FINAL_SALVO'){
    for(const seat of s.room.seats){
     if(seat.playerId===s.viewer)continue;
     const f=s.room.battleState.match.finalSalvo;
     if(f?.status!=='selecting')break;
     if(f.selectionsByPlayer[seat.playerId]===null){
      const used=f.usedDecoyIdsByPlayer[seat.playerId]??[];
      const d=s.room.battleState.players[seat.playerId].decoys.find(d=>!d.destroyed&&!used.includes(d.id));
      if(d)s.room=R.submitFinalSalvoSelection(s.room,seat.playerId,d.id,s.now);
     }
    }
    return;
   }
   for(let step=0;step<6;step++){
    if(s.room.roomPhase!=='PLAYING'||s.room.connectionPhase!=='CONNECTED'||s.room.currentPlayerId===s.viewer)break;
    if(s.room.turnPhase==='AUTO_SKIPPING'){s.room=R.completeAutomaticTurnSkip(s.room,s.now);continue;}
    if(s.room.turnPhase==='RESOLVING'){s.room=R.completePlayerAction(s.room,s.now);continue;}
    const actor=s.room.currentPlayerId,p=s.room.battleState.players[actor];
    const statuses=R.listActionAvailability(p);const available=statuses.find(x=>x.available && x.actionType==='radar_scan')??statuses.find(x=>x.available);
    const type=available?.type??available?.actionType;
    if(!type)break;
    const targets=R.getActionTargetOptions(p,type);if(!targets.length)break;
    // Prefer empty cells: deterministic environment action, not a secret-reading bot.
    const target=targets[0];
    try{s.room=runAction(s.room,actor,type,target,s.now);}catch(_){break;}
   }
 }
 command(id,token,event,payload={},operationId){
  const s=this.get(id,token);
  if(typeof operationId!=='string'||operationId.length>100||operationId.length<1)fail('INVALID_ACTION_ID','训练操作需要稳定编号。');
  if(s.operations.has(operationId)){
    const cached=s.operations.get(operationId);
    if(cached.fingerprint && cached.fingerprint!==operationFingerprint(event,payload))fail('ACTION_ID_REUSED','操作编号不能用于另一条指令。');
    if(cached.error)fail(cached.error.code,cached.error.message);return clone(cached.data);
  }
  const fingerprint=operationFingerprint(event,payload);
  const controls=event==='training:control';
  if(s.playerMode&&controls&&payload.control!=='reset')fail('TRAINING_EVENT_NOT_ALLOWED','这项操作不属于战斗练习。');
  if(s.transport.missing&&!controls)fail('ROOM_NOT_FOUND','训练模拟：原房间不存在，请重置场景。');
  if(payload.trainingGeneration && payload.trainingGeneration!==s.generation)fail('STATE_VERSION_CONFLICT','这是旧训练检查点，请先同步。');
  if(event!=='room:sync'&&!(controls&&payload.control==='reset')&&payload.expectedVersion!==undefined&&payload.expectedVersion!==s.room.stateVersion)
    fail('STATE_VERSION_CONFLICT','训练状态已更新，请先同步。');
  try{
   s.clientEvidence=Array.isArray(payload.trainingEvidence)?payload.trainingEvidence:[];s.clientSettings=payload.trainingSettings??{};
   if(event!=='room:sync'&&(!controls||!['undo','role','reveal','conceal','replay'].includes(payload.control)))this.saveCheckpoint(s);s.steps++;
   if(event==='room:sync'){
     s.taskEvents.push('synced');if(s.transport.needsSync){s.transport.needsSync=false;s.completed=true;s.notes.push('同步确认了已接受的指令，没有重复结算。');}
   }else if(event==='training:advance'&&s.playerMode){this.advancePlayer(s);
   }else if(event==='deployment:submit'){
     s.room=R.submitDeployment(s.room,s.viewer,payload.deployment,s.now);s.taskEvents.push('deployed');
   }else if(event==='deployment:ready'){
     s.room=R.setPlayerReady(s.room,s.viewer,s.now);s.completed=true;s.taskEvents.push('ready');
     const evidence=Array.isArray(payload.trainingEvidence)?payload.trainingEvidence:[];
     s.deploymentEvidence=evidence;
     const wrong=evidence.filter(e=>e.action==='deployment-rejected').map(e=>e.code);
     const needed={D06:'INVALID_SHAPE',D07:'OUT_OF_BOUNDS',D08:'CELL_OVERLAP'}[s.scene.code];
     if(needed&&!wrong.includes(needed)){s.completed=false;s.notes.push('部署已合法准备；本例还需亲自尝试不合法条件。重置后先按任务体验拒绝，再完成部署。');}
     if(s.scene.code==='D04'&&!['destroyer-i','destroyer-ii','submarine','pirate','motorboat','motorboat-2','nuclear','carrier'].every(id=>evidence.some(e=>e.action==='select-placement'&&e.unitId===id))){s.completed=false;s.notes.push('请亲自选择过全部八个实例后再准备，包含两艘摩托艇。');}
     if(s.scene.code==='D05'){
      const cells=s.room.seats.find(x=>x.playerId===s.viewer).deployment.find(x=>x.id==='carrier').cells;
      const points=cells.map(c=>R.parseCoordinate(c,s.room.mapRules));
      if(new Set(points.map(p=>p.row)).size===1||new Set(points.map(p=>p.column)).size===1){s.completed=false;s.notes.push('本例需要四向连通的弯折航母，而不是直线。');}
     }
     if(s.scene.code==='D10'&&(!evidence.some(e=>e.action==='random-deployment')||!evidence.slice(evidence.findLastIndex(e=>e.action==='random-deployment')+1).some(e=>e.action==='placement-changed'))){s.completed=false;s.notes.push('本例需使用随机部署后亲手调整。');}
   }else if(event==='deployment:cancel-ready'){
     s.room=R.cancelPlayerReady(s.room,s.viewer,s.now);s.taskEvents.push('cancel-ready');
   }else if(event==='match:roll-die'){
     const round=s.room.rolling?.currentRound??1;
     const tie=s.scene.code==='D12'&&round===1;
     s.room=R.submitPlayerRoll(s.room,s.viewer,()=>tie?.5:.99);
     for(const seat of s.room.seats)if(seat.playerId!==s.viewer&&!s.room.rolling?.firstPlayerId)
      s.room=R.submitPlayerRoll(s.room,seat.playerId,()=>tie?.5:.1);
     if(s.room.rolling?.firstPlayerId){s.completed=true;s.notes.push('服务器已确定先手，可继续练习首回合雷达。');}
   }else if(event==='action:submit'){
     if(s.transport.needsSync)fail('STATE_VERSION_CONFLICT','先同步上次指令的结果。');
     const intent=payload.intent;
     if(s.scene.code==='X05'&&!s.transport.stale){
       s.transport.stale=true;s.room.stateVersion++;s.notes.push('模拟旧版本冲突：请同步并重新选择目标。');
       fail('STATE_VERSION_CONFLICT','训练模拟：旧版本指令已拒绝，未消耗资源。');
     }
     s.room=R.beginPlayerAction(s.room,s.viewer,intent,s.now);
     s.room=R.completePlayerAction(s.room,s.now+1);s.taskEvents.push('action');
     const matched=(!s.action||intent.actionType===s.action)&&(!s.target||JSON.stringify(intent.target)===JSON.stringify(s.target));
     if(matched&&(!s.restriction||s.rejected)){s.completed=true;s.notes.push('已通过正式规则完成目标行动。点击解析比较各角色能知道的信息。');}
     if(s.scene.code==='X04'&&!s.transport.dropped){
       s.transport.dropped=true;s.transport.needsSync=true;s.completed=false;
       const error={code:'REQUEST_TIMEOUT',message:'训练模拟：指令已接受，但应答丢失。请先同步。'};
       s.operations.set(operationId,{error});throw Object.assign(new Error(error.message),error);
     }
   }else if(event==='final-salvo:submit'){
     s.room=R.submitFinalSalvoSelection(s.room,s.viewer,payload.decoyId,s.now);if(s.scene.code!=='E07')this.script(s);
     s.taskEvents.push('salvo');
     s.completed=['E06','E07','E08'].includes(s.scene.code)||s.room.battleState.match.status==='finished';
   }else if(event==='match:surrender'){
     s.room=R.surrenderMatch(s.room,s.viewer,s.now);s.completed=true;s.taskEvents.push('surrender');
   }else if(event==='rematch:request'){
     s.room=R.requestRematch(s.room,s.viewer);
     s.taskEvents.push('rematch-request');s.notes.push('你已申请；可先取消，再重新申请并推进合成席位确认。');
   }else if(event==='rematch:cancel'){s.room=R.cancelRematch(s.room,s.viewer);s.taskEvents.push('rematch-cancel');}
   else if(controls)this.control(s,payload);
   else fail('TRAINING_EVENT_NOT_ALLOWED','训练营不支持此操作。');
   if(s.room.roomPhase==='FINAL_SALVO'&&s.room.battleState.match.status==='finished')s.room=R.completeFinalSalvo(s.room,s.now);
   this.evaluate(s);
   if(s.playerMode){
    if(s.playerMode==='free')s.completed=s.room.roomPhase==='FINISHED';
    else if(event==='action:submit'&&payload.intent?.actionType===s.playerLesson.action)s.completed=true;
    else if(event==='final-salvo:submit')s.completed=true;
   }
   R.assertMatchRoomState(s.room);
   const data=this.response(s);
   if(s.simulatedExpiry)this.sessions.delete(s.id);
   s.operations.set(operationId,{data:clone(data),fingerprint});while(s.operations.size>128)s.operations.delete(s.operations.keys().next().value);
   return data;
  }catch(error){
   if(!s.operations.has(operationId))s.operations.set(operationId,{error:{code:error.code??'TRAINING_ERROR',message:error.message},fingerprint});
   throw error;
  }
 }
 control(s,p){
  const control=p.control;
  if(control==='reset'){
    const recovered=Boolean(s.transport.missing);const fresh=makeScenario(s.scene,s.preset);Object.assign(s,fresh);
    s.award=recovered?{id:s.scene.id,version:s.scene.version}:null;
    s.generation=randomUUID();s.initial=clone(s.room);s.history=[];s.operations.clear();s.revealed=false;s.transport={};s.taskEvents=[];s.notes=[];s.paralysisSeen=false;s.markerVerified=new Set();s.running=false;s.tickAt=this.now();s.entryErrors=new Set();s.entryValidated=false;s.joinRejected=false;s.simulatedExpiry=false;s.clientEvidence=[];s.clientSettings={};
    if(s.playerMode)this.preparePlayer(s);
  }else if(control==='undo'){
    const last=s.history.pop();if(!last)fail('NO_CHECKPOINT','没有可重来的步骤。');
    Object.assign(s,last);s.generation=randomUUID();
  }else if(control==='role'){
    if(!s.room.seats.some(x=>x.playerId===p.role))fail('INVALID_ROLE','角色不属于本训练局面。');
    s.viewer=p.role;s.revealed=false;s.generation=randomUUID();
  }else if(control==='reveal'){
    s.revealed=true;s.taskEvents.push('revealed');
  }else if(control==='conceal'){s.revealed=false;
  }else if(control==='replay'){s.replayEffect=true;
  }else if(control==='script'){
    if(s.room.roomPhase==='FINISHED'&&s.room.rematchRequestedByPlayer[s.viewer]){
      for(const seat of s.room.seats)if(seat.playerId!==s.viewer&&!s.room.rematchRequestedByPlayer[seat.playerId])s.room=R.requestRematch(s.room,seat.playerId);
      s.room=R.startRematch(s.room,s.now);s.taskEvents.push('rematch');
    }
    if(s.room.roomPhase==='ROLLING'&&s.room.rolling?.firstPlayerId)s.room=R.startPlaying(s.room,s.now);
    if(s.room.turnPhase==='RESOLVING')s.room=R.completePlayerAction(s.room,s.now);
    if(s.room.turnPhase==='AUTO_SKIPPING')s.room=R.completeAutomaticTurnSkip(s.room,s.now);
    this.script(s);
    if(['F05','F06','E12'].includes(s.scene.code)){s.completed=true;s.notes.push('已观察并推进此分支的合法生命周期。');}
  }else if(control==='clock'){
    const deadline=s.room.deploymentDeadlineAt??s.room.actionDeadlineAt??Math.min(...s.room.seats.filter(x=>x.reconnectDeadlineAt).map(x=>x.reconnectDeadlineAt));
    s.now=Number.isFinite(deadline)?Math.max(s.now,deadline+(p.before?-5000:1)):s.now+90001;
    this.timers(s);s.taskEvents.push('clock');if(!p.before){s.notes.push('虚拟时钟经过正式阈值，已由生命周期处理。');}
  }else if(control==='join-seat'){
    const playerId=ids.find(id=>!s.room.seats.some(x=>x.playerId===id))??'cadet-extra';
    try{s.room=R.joinRoomState(s.room,{playerId,nickname:'合成新席位'},s.now);s.taskEvents.push('seat-joined');}
    catch(e){s.joinRejected=true;s.notes.push('合成加入已拒绝：'+e.message);if(s.scene.code!=='R02')throw e;}
  }else if(control==='leave-other'){
    const other=s.room.seats.find(x=>x.playerId!==s.viewer);
    s.room=R.leaveFinishedRoom(s.room,other.playerId,s.now);s.taskEvents.push('other-left');
  }else if(control==='validate-entry'){
    try{
      R.normalizeNickname(p.nickname);R.normalizeRoomCode(p.roomCode);s.entryValidated=true;
      s.notes.push('昵称与房间码格式通过；格式正确不代表真实房间存在，此处没有创建或加入正式房间。');
    }catch(e){s.entryErrors??=new Set();s.entryErrors.add(e.code);s.notes.push(e.message);throw e;}
  }else if(control==='expire'){s.simulatedExpiry=true;s.notes.push('正在模拟训练服务重启；请同步观察会话过期，然后返回场景库重新进入。');
  }else if(control==='foreground'){s.taskEvents.push('foreground');s.notes.push('模拟回到前台，请同步校准状态，不补播旧动作。');
  }else if(control==='replay-inspect'){if(s.room.roomPhase!=='FINISHED')fail('REPLAY_NOT_AVAILABLE','只有终局可查看复盘。');s.taskEvents.push('replay-inspected');
  }else if(control==='run-clock'){s.running=!s.running;s.tickAt=this.now();
  }else if(control==='disconnect'){
    const subject=s.scene.code==='X07'?s.room.seats.find(x=>x.playerId!==s.viewer).playerId:s.viewer;
    if(s.room.seats.find(x=>x.playerId===subject)?.online)s.room=R.disconnectPlayer(s.room,subject,s.now);
    if(s.scene.variant==='both'||s.scene.code==='E11')for(const seat of s.room.seats)if(seat.online)s.room=R.disconnectPlayer(s.room,seat.playerId,s.now);
    s.taskEvents.push('disconnected');s.notes.push('正在模拟断线；真实网络未改变。');
  }else if(control==='resume'){
    if(s.simulateMissing){s.transport.missing=true;s.taskEvents.push('missing-room');fail('ROOM_NOT_FOUND','训练模拟：服务重启，原房间不存在。请重置场景。');}
    const subject=s.scene.code==='X07'?s.room.seats.find(x=>x.playerId!==s.viewer).playerId:s.viewer;
    s.room=R.reconnectPlayer(s.room,subject,s.now);s.taskEvents.push('resumed');
    s.completed=s.taskEvents.includes('disconnected');s.notes.push('按现有连接规则恢复原合成座位。');
  }else if(control==='restriction'){
    let result;
    if(s.scene.kind==='deployment'){
      result=R.validateDeployment(p.deployment??[],s.room.mapRules);
      s.notes.push(result.valid?'部署合法。':result.errors.map(e=>e.message??e.code??e).join('；'));
      s.rejected=!result.valid;
    }else{
      const action=s.action??s.scene.action,own=s.room.battleState.players[s.viewer];
      const target=s.restrictedTarget??(s.restriction==='TARGET_OUT_OF_RANGE'?{kind:'cell',coordinate:s.room.mapRules.coordinateMaximum}:s.target??{kind:'cell',coordinate:'A1'});
      const intent=intentFor(s.room,s.viewer,action,target);
      result=R.validateActionIntent(own,intent);
      s.rejected=!result.valid;
      s.notes.push(result.valid?'该指令当前合法，请调整到任务所需条件。':result.errors.map(x=>x.message).join('；'));
      if(!result.valid)s.taskEvents.push('rejected');
    }
  }else if(control==='recover-checkpoint'){
    if(!s.rejected)fail('CHECK_RESTRICTION_FIRST','先验证本例的受限条件。');
    const fresh=makeScenario({...s.scene,code:'RECOVER',kind:'battle',variant:'default',action:s.action??s.scene.action},s.preset);
    s.room=fresh.room;s.target=fresh.target;s.hint=fresh.hint;s.generation=randomUUID();
    s.notes.push('已重建可操作检查点；不会给正式对局添加复活或弹药。');
  }else if(control==='markers'){
    if(!Array.isArray(p.markers)||p.markers.some(x=>!R.parseCoordinate(x[0],s.room.mapRules)||!['occupied','surface_yes','surface_no','underwater_yes','underwater_no'].includes(x[1])))
      fail('MARKER_REQUIRED','请先在海图实际添加本机标记。');
    const required=s.scene.code==='I14'?s.scene.variant:null;
    if(p.markers.length){
      if(required&&!p.markers.some(x=>x[1]===required))fail('WRONG_MARKER','请先使用本例指定的标记：'+required);
      s.markerVerified??=new Set();s.markerVerified.add(p.targetPlayerId??'default');s.taskEvents.push('markers');
      s.notes.push('已记录本机标记；请删除后再次验证。三人隔离请分别切敌图验证。');
      s.hint='现在删除该标记，再次验证。三人练习请切换另一张敌图添加并验证，检查注记彼此隔离。';
    }else{
      if(!s.markerVerified?.size)fail('MARKER_REQUIRED','先实际添加并验证标记，再练习删除。');
      s.taskEvents.push('marker-erased');
    }
    s.completed=s.scene.code==='I15'?s.markerVerified.size>=2:s.scene.code==='I16'?s.revealed:s.taskEvents.includes('marker-erased');
  }else fail('INVALID_TRAINING_CONTROL','未知训练控制。');
 }
 evaluate(s){
  const c=s.scene.code,b=s.room.battleState,events=new Set(s.taskEvents);
  if(c==='R01')s.completed=events.has('seat-joined')&&s.room.roomPhase==='DEPLOYING';
  if(c==='R02')s.completed=Boolean(s.joinRejected);
  if(c==='R03')s.completed=events.has('ready')&&events.has('cancel-ready')&&!s.room.seats.find(x=>x.playerId===s.viewer).ready;
  if(c==='R04')s.completed=s.room.roomPhase==='CLOSED';
  if(c==='R05')s.completed=Boolean(s.entryValidated&&s.entryErrors?.size>=2);
  if(c==='R06')s.completed=events.has('other-left')&&s.room.roomPhase==='WAITING';
  if(c==='D11')s.completed=s.room.roomPhase!=='DEPLOYING';
  if(c==='D14')s.completed=Boolean(b&&b.playerIds.every(id=>b.players[id].remainingUses.radar_scan===0));
  if(c==='F06')s.completed=(s.room.turnEvents??[]).some(e=>e.kind==='automatic_skip');
  if(c==='E10')s.completed=b?.match.result?.reason===({surrender:'surrender','three-timeouts':'three_consecutive_timeouts',disconnect:'disconnect_timeout'}[s.scene.variant]);
  if(c==='E11')s.completed=b?.match.result?.reason==='both_disconnected';
  if(c==='E12')s.completed=events.has('replay-inspected')&&events.has('rematch-cancel')&&events.has('rematch');
  if(c==='E07')s.completed=events.has('salvo')&&Boolean(b.match.finalSalvo?.shots?.length);
  if(c==='E08'){
    const f=b.match.finalSalvo,shots=(f?.shots??[]).filter(x=>x.sourcePlayerId==='cadet-1');
    const predicates={hit:x=>x.result==='hit'&&x.freshUnitCell,miss:x=>x.result==='miss'&&x.actualTargetKind==='empty',old:x=>x.result==='hit'&&!x.freshUnitCell,wreck:x=>x.actualTargetKind==='wreck'};
    s.completed=s.scene.variant==='no-decoy'?Boolean(f?.shots?.length)&&!(f.usedDecoyIdsByPlayer['cadet-1']??[]).length:shots.some(predicates[s.scene.variant]??(()=>false));
  }
  if(c==='X06'||c==='X07')s.completed=s.scene.variant==='resume'?events.has('disconnected')&&events.has('resumed'):
    s.scene.variant==='missing-room'?events.has('missing-room'):Boolean(b?.match.result||s.room.roomPhase==='CLOSED');
  if(c==='X08')s.completed=events.has('timer-fired');
  if(c==='X09')s.completed=events.has('synced')&&events.has('foreground');
  if(c==='I07'||c==='I09'){
    const units=b.players['cadet-2'].units;
    if(units.some(u=>u.paralyzed)){s.paralysisSeen=true;s.hint='切换到防守方，观察瘫痪的水下单位；执行一个可用行动，检查瘫痪随后解除。';}
    s.completed=Boolean(s.paralysisSeen&&units.every(u=>!u.paralyzed));
  }
  if(c==='I16')s.completed=events.has('markers')&&s.revealed;
  if(c==='X03')s.completed=events.has('action')&&(s.clientEvidence??[]).some(e=>e.action==='cancel-action-selection')&&new Set((s.clientEvidence??[]).filter(e=>e.action==='enemy-cell').map(e=>e.coordinate)).size>=2;
  if(c==='X10')s.completed=events.has('action')&&(s.clientEvidence??[]).some(e=>e.action==='keyboard')&&((s.clientSettings?.viewport??1280)>=767||(s.clientEvidence??[]).some(e=>e.action==='map-scrolled'));
  if(c==='X11'){
    const v=s.scene.variant,p=s.clientSettings??{};
    s.completed=events.has('action')&&(v==='muted'?p.muted:v==='reduced'?p.reduced:p.quality===v);
  }
 }
 reveal(id,token){
  const s=this.get(id,token);if(s.playerMode)fail('REVEAL_NOT_AVAILABLE','战斗练习不提供敌方部署解析。');if(!s.revealed)fail('REVEAL_REQUIRED','请先主动查看教官解析。');
  const b=s.room.battleState;
  const lessons=[];
  for(const record of (b?.actionLog??[]).slice(-8)){
    const definition=R.getActionDefinition(record.action.actionType);
    const owner=s.room.seats.find(x=>x.playerId===record.actorId)?.nickname??record.actorId;
    lessons.push(owner+' 使用'+definition.name+'，目标 '+(record.action.target.coordinate??record.action.target.row??record.action.target.column));
    const outcomes=record.outcome.outcomesByDefender?Object.entries(record.outcome.outcomesByDefender):[[record.defenderId,record.outcome]];
    const seenDamage=new Set();
    for(const [defender,o]of outcomes){
      const name=s.room.seats.find(x=>x.playerId===defender)?.nickname??defender;
      if(o.actualResult)lessons.push(name+'：实际'+(o.actualResult==='hit'?'命中':'未命中')+(o.cellResult?.freshUnitCell?'（新受击格）':'（不新增受击资格）'));
      if(typeof o.detected==='boolean')lessons.push(name+'：区域'+(o.detected?'存在信号':'没有信号')+'；玩家只收到布尔结论，不收到具体格位。');
      if(o.affectedUnitIds)lessons.push(name+'：实际影响 '+o.affectedUnitIds.length+' 个水下单位；攻击者仍不获知成功与否。');
      for(const e of o.damageEvents??[]){
        const k=JSON.stringify(e);if(seenDamage.has(k))continue;seenDamage.add(k);
        lessons.push((s.room.seats.find(x=>x.playerId===e.playerId)?.nickname??e.playerId)+'的'+R.getDeployableDefinition(e.unitType,s.room.mapRules).name+'：'+e.beforeHp+' → '+e.afterHp+'，实际伤害 '+e.appliedDamage+(e.sunk?'，已沉没':''));
      }
      for(const d of o.decoyEvents??[])lessons.push('诱饵鱼雷 '+(d.cell??d.decoyId??'')+' 已按规则处理。');
    }
    if(['submarine_missile','nuclear_bomb','shock_bomb'].includes(record.action.actionType))lessons.push('实战攻击方只能确认执行，不能从爆炸、声音或文字得知隐藏结果。');
  }
  if(b?.match.result)lessons.push('终局：'+b.match.result.reason+'；胜者 '+(b.match.result.winnerId??'无，按实际结果判断平局或取消'));
  return {label:'教官视角 · 合成训练局面，已揭示',objective:s.scene.objective,
   provenance:s.provenance,notes:s.notes,players:b?Object.fromEntries(b.playerIds.map(id=>[id,R.createPlayerView(b,id).own])):{},
   lessons,actionLog:b?.actionLog??[],phase:s.room.roomPhase,version:'1.8',
   explanation:'上方玩家界面遵守实战权限；本解析仅展示本例合成数据。命中不等于扣血；同格不重复伤害；未知结果不因教官揭示变成玩家情报。'};
 }
 destroy(id,token){this.get(id,token);this.sessions.delete(id);}
}
function mountTraining(app,options={}){
 const service=new TrainingService(options),limiter=new FixedWindowRateLimiter();
 app.use('/api/training',(req,res,next)=>{
  res.setHeader('Cache-Control','no-store');
  try{limiter.pruneExpired();limiter.consume(req.ip,{limit:240,windowMs:60000});next();}
  catch(e){res.status(429).json({ok:false,error:{code:e.code,message:e.message}});}
 });
 const wrap=fn=>(req,res)=>{try{res.json({ok:true,data:fn(req)});}catch(e){res.status(e.code==='TRAINING_EXPIRED'?401:400).json({ok:false,error:{code:e.code??'TRAINING_ERROR',message:e.message,details:e.details??{}}});}};
 app.get('/api/training/course',wrap(()=>playerCatalog()));
 if(options.debug===true)app.get('/api/training/catalog',wrap(()=>({version:'1.5.0',ruleVersion:'1.8',scenarios:catalog})));
 app.post('/api/training/sessions',wrap(req=>{if(req.body.mode)return service.createPlayer(req.body.mode,req.body.lessonId);if(options.debug!==true)fail('LESSON_REQUIRED','请选择快速上手、武器体验或自由练习。');return service.create(req.body.scenarioId,{mapSize:req.body.mapSize,players:req.body.players,action:req.body.action,targetKind:req.body.targetKind,sourceState:req.body.sourceState});}));
 const token=req=>req.headers['x-training-token'];
 app.get('/api/training/sessions/:id',wrap(req=>service.response(service.get(req.params.id,token(req)))));
 app.post('/api/training/sessions/:id/commands',wrap(req=>{
  if(req.body.event!=='room:sync'&&(!Number.isInteger(req.body.payload?.expectedVersion)||req.body.payload.expectedVersion<1))fail('STATE_VERSION_CONFLICT','训练操作需要当前状态版本。');
  if(typeof req.body.payload?.trainingGeneration!=='string')fail('STATE_VERSION_CONFLICT','请使用当前训练检查点。');
  return service.command(req.params.id,token(req),req.body.event,req.body.payload,req.body.operationId);
 }));
 if(options.debug===true)app.get('/api/training/sessions/:id/reveal',wrap(req=>service.reveal(req.params.id,token(req))));
 app.delete('/api/training/sessions/:id',wrap(req=>{service.destroy(req.params.id,token(req));return {destroyed:true};}));
 const sweep=setInterval(()=>service.prune(),60000);sweep.unref();
 return {service,close:()=>clearInterval(sweep)};
}
module.exports={TrainingService,mountTraining};
