'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function harness(){
 let now=0,next=0;const timers=new Map(),raf=new Map(),handlers={};
 const state={battle:{mobileMap:'own'},room:{roomCode:'ABCDEF',own:{playerId:'p'},matchSummary:{startedAt:1},latestResolution:{feedback:{sequence:1}}},reduceMotion:false,effectiveQuality:'high',qualityMode:'high',renderedPage:'P05'};
 const document={hidden:false,documentElement:{dataset:{}},addEventListener:(k,f)=>{handlers[k]=f;},querySelectorAll:()=>[],querySelector:()=>null};
 const ctx={state,document,Sound:{cancelTransientEffects(){}},performance:{now:()=>now},setTimeout:(f,ms)=>{timers.set(++next,{f,ms});return next;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:f=>{raf.set(++next,f);return next;},cancelAnimationFrame:id=>raf.delete(id),syncPersonalizeControls(){}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../client/motion.js'),'utf8')+'\nthis.api={motionDefinitions,motionRuntime,startMotion,cancelMotion,renderMotionArt,reconcileMotion,queueUiMotion,observeLocalUiMotion};',ctx);
 return {state,document,timers,raf,handlers,api:ctx.api,time:n=>{now=n;}};
}
test('十行动具备独立形态和预算，保密附加信息不改变输出',()=>{
 const {api,state}=harness();assert.equal(Object.keys(api.motionDefinitions).length,10);
 assert.equal(new Set(Object.values(api.motionDefinitions).map(x=>x.shape)).size,10);
 for(const [type,d]of Object.entries(api.motionDefinitions)){assert.ok(d.duration<=1400);assert.ok(d.smooth>=360&&d.smooth<=550);assert.ok(api.renderMotionArt({actionType:type}));}
 for(const actionType of ['submarine_missile','nuclear_bomb','shock_bomb'])
  assert.equal(api.renderMotionArt({actionType,actualResult:'hit',hiddenCells:['A1']}),api.renderMotionArt({actionType,actualResult:'miss',hiddenCells:['L12']}));
 state.reduceMotion=true;assert.equal(api.renderMotionArt({actionType:'nuclear_bomb'}),'');
});
test('动效单主、序号去重、有限缓存、替换与统一清理',()=>{
 const {api,state,timers}=harness();
 assert.equal(api.startMotion('one'),true);assert.equal(timers.size,1);
 assert.equal(api.startMotion('one'),false);assert.equal(timers.size,0);
 for(let i=2;i<=150;i++){state.room.latestResolution.feedback.sequence=i;assert.equal(api.startMotion('key'+i),true);assert.equal(timers.size,1);}
 assert.ok(api.motionRuntime.consumed.size<=128);
 state.room.latestResolution.feedback.sequence=1;assert.equal(api.startMotion('old-again'),false);
 api.cancelMotion();assert.equal(api.motionRuntime.animations.size,0);assert.equal(api.motionRuntime.activeUi.size,0);assert.equal(timers.size,0);
 state.training={session:{generation:'new'}};assert.equal(api.startMotion('new-match-one'),true);
});
test('后台、减少动画与关闭后不补播，切图取消旧空间效果',()=>{
 const {api,state,document,handlers,timers}=harness();api.startMotion('one');
 document.hidden=true;handlers.visibilitychange();assert.equal(timers.size,0);assert.equal(api.startMotion('hidden'),false);
 document.hidden=false;handlers.visibilitychange();assert.equal(state.suppressNextSync,true);
 state.reduceMotion=true;assert.equal(api.startMotion('reduce'),false);assert.equal(api.motionRuntime.uiFacts.length,0);
 state.reduceMotion=false;state.room.latestResolution.feedback.sequence=2;api.startMotion('two');
 state.battle.mobileMap='enemy';api.reconcileMotion();assert.equal(api.motionRuntime.key,null);
});
test('安全齐射提示仅依据已完成轮次，私密选点不启动齐射效果',()=>{
 const {api,state}=harness();
 const room={roomCode:'ABCDEF',stateVersion:1,own:{playerId:'p'},matchSummary:{startedAt:1},roomPhase:'FINAL_SALVO',battle:{own:{units:[]},match:{finalSalvo:{round:1,completedShots:0,ownSubmitted:false}}}};
 const chosen=structuredClone(room);chosen.battle.match.finalSalvo.ownSubmitted=true;
 api.queueUiMotion(room,chosen,true);assert.equal(api.motionRuntime.uiFacts.length,0);
 const resolved=structuredClone(chosen);resolved.battle.match.finalSalvo.completedShots=2;
 api.queueUiMotion(chosen,resolved,true);assert.equal(api.motionRuntime.uiFacts.length,1);assert.equal(api.motionRuntime.uiFacts[0].kind,'salvo');
 state.reduceMotion=true;api.queueUiMotion(chosen,resolved,true);assert.equal(api.motionRuntime.uiFacts.length,1);
});


test('己方状态短反馈仅由同身份安全差分产生，数字不由动画改写',()=>{
 const {api}=harness();
 const before={roomCode:'ABCDEF',stateVersion:1,own:{playerId:'p'},battle:{own:{units:[{id:'submarine',hp:1,paralyzed:false,hitCells:[]}],decoys:[{id:'d',cell:'A1',destroyed:false}],remainingUses:{submarine_missile:2}}}};
 const after=structuredClone(before);after.stateVersion=2;
 Object.assign(after.battle.own.units[0],{hp:0,paralyzed:true,hitCells:['B1']});
 after.battle.own.decoys[0].destroyed=true;after.battle.own.remainingUses.submarine_missile=1;
 const frozen=JSON.stringify(after);api.queueUiMotion(before,after,true);
 const kinds=api.motionRuntime.uiFacts.map(x=>x.kind);
 for(const k of ['hp','sunk','paralysis','own-hit','decoy','resource'])assert.ok(kinds.includes(k),k);
 assert.equal(JSON.stringify(after),frozen);
 api.motionRuntime.uiFacts=[];api.queueUiMotion(before,after,false);assert.equal(api.motionRuntime.uiFacts.length,0);
});

test('部署选择与落位独立于hover，重复渲染不重播，本地身份切换只建立基线',()=>{
 const {api,state}=harness();state.renderedPage='P03';state.deployment={selectedId:'destroyer-i',placements:[]};
 api.observeLocalUiMotion();assert.equal(api.motionRuntime.uiFacts.length,0);
 state.deployment.hoverCoordinate='B1';api.observeLocalUiMotion();assert.equal(api.motionRuntime.uiFacts.length,0);
 state.deployment.selectedId='carrier';api.observeLocalUiMotion();assert.equal(api.motionRuntime.uiFacts.length,1);
 api.motionRuntime.uiFacts=[];api.observeLocalUiMotion();assert.equal(api.motionRuntime.uiFacts.length,0);
 state.deployment.placements=[{id:'carrier',cells:['A1']}];api.observeLocalUiMotion();assert.equal(api.motionRuntime.uiFacts[0].kind,'deploy');
 api.motionRuntime.uiFacts=[];state.training={session:{generation:'new'}};state.deployment.selectedId='submarine';api.observeLocalUiMotion();assert.equal(api.motionRuntime.uiFacts.length,0);
 state.reduceMotion=true;state.deployment.selectedId='carrier';api.observeLocalUiMotion();assert.equal(api.motionRuntime.uiFacts.length,0);
});
