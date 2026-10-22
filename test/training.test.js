'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {TrainingService}=require('../server/training/service');
const S=require('../server/training/scenarios'),R=require('../server/game/rules');
function context(id,preset={}){
 const t=new TrainingService(),v=t.create(id,preset),s=t.sessions.get(v.id);
 let counter=0;
 const send=(event,payload={},op)=>t.command(s.id,s.token,event,{expectedVersion:s.room.stateVersion,trainingGeneration:s.generation,...payload},op??'step-'+(++counter));
 const control=(control,extra={})=>send('training:control',{control,...extra});
 const act=()=>{const intent=S.intentFor(s.room,s.viewer,s.action,s.target);return send('action:submit',{intent},intent.actionId);};
 return {t,v,s,send,control,act};
}
test('训练目录覆盖原84与6个补充主场景，变体稳定且元数据不超过预算',()=>{
 assert.equal(new Set(S.catalog.map(c=>c.parentId)).size,90);
 assert.equal(new Set(S.catalog.map(c=>c.id)).size,S.catalog.length);
 assert.ok(Buffer.byteLength(JSON.stringify(S.catalog))<=256*1024);
});
for(const scene of S.catalog)test('训练检查点可用：'+scene.id,()=>{
 for(const size of [10,12,15]){
  const s=S.makeScenario(scene,{mapSize:size});
  R.assertMatchRoomState(s.room);
  const view=R.createRoomView(s.room,s.viewer,s.now);
  assert.equal(view.own.playerId,scene.viewer??'cadet-1');
  assert.equal(view.maxPlayers,scene.players);
  if(s.target&&s.action&&!s.restriction){
   const intent=S.intentFor(s.room,s.viewer,s.action,s.target);
   assert.equal(R.validateActionIntent(s.room.battleState.players[s.viewer],intent).valid,true);
  }
 }
});
const cases={
 'CAMP-W01':{source:.5,target:1},'CAMP-W02':{source:.5,target:1},
 'CAMP-W03:destroyer-i':{source:0,target:0,result:'miss'},'CAMP-W03:destroyer-ii':{source:0,target:0,result:'miss'},
 'CAMP-W04:destroyer-i':{source:1,target:0,result:'hit'},'CAMP-W04:destroyer-ii':{source:1,target:0,result:'hit'},
 'CAMP-W05':{source:.5,target:1},'CAMP-W08':{source:1,target:2,link:.5},
 'CAMP-W09':{source:1,target:2,link:.5},
 'CAMP-W10:empty':{source:0,target:0,result:'miss'},'CAMP-W10:decoy':{source:1,target:0},'CAMP-W10:old':{source:0,target:0},
 'CAMP-W11:motorboat':{source:1,target:1},'CAMP-W11:motorboat-2':{source:1,target:1},
 'CAMP-W12':{source:1,target:0,result:'hit'},'CAMP-W13':{source:0,target:0,result:'miss'},
 'CAMP-W14:decoy':{source:1,target:0},'CAMP-W14:empty':{source:0,target:0},'CAMP-W14:old':{source:0,target:0},
 'CAMP-W15:unit':{source:0,target:1,secret:true},'CAMP-W15:empty':{source:0,target:0,secret:true},
 'CAMP-W17:carrier':{source:0,target:2,secret:true},'CAMP-W17:surface':{source:0,target:1,secret:true},
 'CAMP-W20:fraction':{source:.5,target:.5},'CAMP-W20:sunk':{source:.5,target:1}
};
for(const [id,expected]of Object.entries(cases))test('训练伤害分支实际结算：'+id,()=>{
 const {s,act}=context(id);const before=structuredClone(s.room.battleState);
 const source=R.getUnitByType(before.players[s.viewer],R.getActionDefinition(s.action).sourceType);
 const result=act(),record=s.room.battleState.actionLog.at(-1),o=record.outcome;
 const sourceAfter=s.room.battleState.players[s.viewer].units.find(u=>u.id===source.id);
 assert.equal(source.hp-sourceAfter.hp,expected.source);
 assert.equal(o.damageEvents.filter(e=>e.side==='defender'&&e.unitId!=='carrier'||e.side==='defender'&&['nuclear_bomb','motorboat_ram'].includes(s.action)).reduce((n,e)=>n+e.appliedDamage,0),expected.target);
 if(expected.link)assert.equal(before.players[s.viewer].units.find(u=>u.id==='carrier').hp-s.room.battleState.players[s.viewer].units.find(u=>u.id==='carrier').hp,expected.link);
 if(expected.result)assert.equal(o.actualResult,expected.result);
 if(expected.secret){assert.equal(result.view.latestResolution.feedback.result,null);assert.ok(!('actualResult'in result.view.latestResolution.feedback));}
 assert.equal(result.task.completed,true);
});
for(const c of S.catalog.filter(c=>c.code==='W16'||c.code==='W18'||c.code==='W21'))test('训练特殊目标：'+c.id,()=>{
 const {s,act}=context(c.id);act();
 const o=s.room.battleState.actionLog.at(-1).outcome;
 assert.equal(o.cellResult.actualTargetKind,c.variant==='decoy'?'decoy':c.variant==='destroyed-decoy'?'destroyed_decoy':c.variant==='old'?'unit':c.variant);
 if(['old','wreck','empty','destroyed-decoy'].includes(c.variant))assert.equal(o.damageEvents.length,0);
});
for(const [id,detected]of Object.entries({'CAMP-I01:positive':true,'CAMP-I01:negative':false,'CAMP-I04:positive':true,'CAMP-I04:negative':false,'CAMP-I05:decoy':true,'CAMP-I05:destroyed-decoy':false,'CAMP-I05:old':false,'CAMP-I05:surface':false,'CAMP-I05:wreck':false}))test('训练侦察布尔分支：'+id,()=>{
 const {s,act}=context(id);act();assert.equal(s.room.battleState.actionLog.at(-1).outcome.detected,detected);
});
for(const c of S.catalog.filter(c=>['W06','W07','W22','W23','I10','I02','I06','X02'].includes(c.code)))test('训练限制与恢复：'+c.id,()=>{
 const {s,control,act}=context(c.id);if(!s.restriction)return;
 control('restriction');assert.equal(s.rejected,true);
 control('recover-checkpoint');act();assert.equal(s.completed,true);
});
test('三人分支：甲命中乙未中，行动方自损一次',()=>{
 const {s,act}=context('CAMP-F01');act();const o=s.room.battleState.actionLog.at(-1).outcome;
 assert.deepEqual(Object.values(o.outcomesByDefender).map(x=>x.actualResult),['hit','miss']);
 assert.equal(s.room.battleState.players['cadet-1'].units.find(u=>u.id==='pirate').hp,1);
});
test('震爆多目标并在实际回合后解除，不以第一帧通过任务',()=>{
 const {s,act,control,send}=context('CAMP-I09');act();
 assert.equal(s.completed,false);assert.equal(s.room.battleState.players['cadet-2'].units.filter(u=>u.paralyzed).length,2);
 control('role',{role:'cadet-2'});
 const p=s.room.battleState.players[s.viewer],action=R.listLegalActions(p)[0].actionType,target=R.getActionTargetOptions(p,action)[0];
 send('action:submit',{intent:S.intentFor(s.room,s.viewer,action,target)});assert.equal(s.completed,true);
});
for(const [id,reason,winner]of [
 ['CAMP-E01','aircraft_carrier_sunk','cadet-1'],['CAMP-E02','pirate_enemy_carrier_sunk','cadet-1'],
 ['CAMP-E03','pirate_own_carrier_sunk','cadet-2'],['CAMP-E04','pirate_simultaneous_carrier_sink','cadet-1']])
test('训练特殊终局：'+id,()=>{const {s,act}=context(id);act();assert.equal(s.room.battleState.match.result.reason,reason);assert.equal(s.room.battleState.match.result.winnerId,winner);});
for(const c of S.catalog.filter(c=>c.code==='E08'))test('训练齐射分支：'+c.id,()=>{
 const {s,send,control}=context(c.id);
 if(c.variant==='no-decoy')control('script');else send('final-salvo:submit',{decoyId:'decoy-1'});
 assert.equal(s.completed,true);
});
test('齐射平局需要实际完成全部轮次',()=>{
 const {s,send}=context('CAMP-E09:tie');
 for(let i=0;i<5&&s.room.roomPhase==='FINAL_SALVO';i++){
  const f=s.room.battleState.match.finalSalvo;
  const d=s.room.battleState.players[s.viewer].decoys.find(d=>!d.destroyed&&!f.usedDecoyIdsByPlayer[s.viewer].includes(d.id));
  send('final-salvo:submit',{decoyId:d.id});
 }
 assert.equal(s.room.roomPhase,'FINISHED');assert.equal(s.room.battleState.match.result.outcome,'draw');assert.equal(s.completed,true);
});
test('训练时钟不改真实时间，截止前不处理、到期按正式部署规则补齐',()=>{
 const {s,control}=context('CAMP-D11');const before=Date.now();control('clock',{before:true});
 assert.equal(s.room.roomPhase,'DEPLOYING');assert.equal(s.completed,false);control('clock');
 assert.equal(s.room.roomPhase,'ROLLING');assert.equal(s.completed,true);assert.ok(Date.now()-before<1000);
});
test('未知应答先同步，不再次扣弹或结算',()=>{
 const {s,act,send}=context('CAMP-X04');
 assert.throws(act,e=>e.code==='REQUEST_TIMEOUT');const count=s.room.battleState.actionLog.length;
 assert.equal(s.completed,false);send('room:sync');assert.equal(s.completed,true);assert.equal(s.room.battleState.actionLog.length,count);
});
test('训练隔离、教官按需、幂等、版本和TTL',()=>{
 let now=1;const t=new TrainingService({now:()=>now,ttl:10}),a=t.create('CAMP-W01'),b=t.create('CAMP-W01');
 assert.throws(()=>t.get(a.id,b.token));assert.throws(()=>t.reveal(a.id,a.token),e=>e.code==='REVEAL_REQUIRED');
 const pa={control:'reveal',trainingGeneration:a.generation,expectedVersion:a.view.stateVersion};
 const x=t.command(a.id,a.token,'training:control',pa,'op');
 assert.deepEqual(t.command(a.id,a.token,'training:control',pa,'op'),x);
 assert.throws(()=>t.command(a.id,a.token,'training:control',{...pa,control:'reset'},'op'),e=>e.code==='ACTION_ID_REUSED');
 assert.ok(t.reveal(a.id,a.token).players['cadet-2']);
 const old=t.sessions.get(a.id).generation;t.command(a.id,a.token,'training:control',{control:'reset'},'reset');
 assert.throws(()=>t.command(a.id,a.token,'training:control',{control:'reveal',trainingGeneration:old},'stale'),e=>e.code==='STATE_VERSION_CONFLICT');
 now=20;assert.throws(()=>t.get(a.id,a.token),e=>e.code==='TRAINING_EXPIRED');assert.equal(t.sessions.size,0);
});

test('训练骰同点重投后保留服务器点数，显式推进才开局',()=>{
 const {s,send,control}=context('CAMP-D12');
 send('match:roll-die');assert.equal(s.room.rolling.currentRound,2);assert.equal(s.completed,false);
 send('match:roll-die');assert.ok(s.room.rolling.firstPlayerId);assert.equal(s.room.roomPhase,'ROLLING');assert.equal(s.completed,true);
 control('script');assert.equal(s.room.roomPhase,'PLAYING');
});
test('三人每个玩家的首次雷达都执行后才完成',()=>{
 const {s,act,control}=context('CAMP-D14');act();assert.equal(s.completed,false);
 control('script');assert.equal(s.completed,true);
});
test('齐射等待不能在本方秘密提交后直接跳过',()=>{
 const {s,send,control}=context('CAMP-E07');send('final-salvo:submit',{decoyId:'decoy-1'});
 assert.equal(s.completed,false);assert.equal(s.room.battleState.match.finalSalvo.selectionsByPlayer[s.viewer],'decoy-1');
 control('script');assert.equal(s.completed,true);
});
for(const [variant,reason]of [['three-timeouts','three_consecutive_timeouts'],['disconnect','disconnect_timeout']])test('虚拟时钟真实触发弃权：'+variant,()=>{
 const {s,control}=context('CAMP-E10:'+variant);
 if(variant==='disconnect'){control('disconnect');control('clock');}
 else for(let i=0;i<3;i++){control('clock');if(i<2){assert.equal(s.completed,false);control('script');}}
 assert.equal(s.room.battleState.match.result.reason,reason);assert.equal(s.completed,true);
});
test('双断线取消而非胜利；期限内恢复不误判超时',()=>{
 const a=context('CAMP-E11');a.control('disconnect');a.control('clock');
 assert.equal(a.s.room.battleState.match.result.outcome,'canceled');assert.equal(a.s.completed,true);
 const b=context('CAMP-X06:resume');b.control('disconnect');b.control('resume');assert.equal(b.s.room.connectionPhase,'CONNECTED');assert.equal(b.s.completed,true);
});
test('虚拟时钟截止前不会把X08练习提前判完成',()=>{
 const {s,control}=context('CAMP-X08:action');control('clock',{before:true});assert.equal(s.completed,false);
 control('clock');assert.equal(s.completed,true);
});
test('标记练习需指定种类并实际删除；三人需不同敌图',()=>{
 const a=context('CAMP-I14:surface_yes');
 assert.throws(()=>a.control('markers',{markers:[['A1','underwater_yes']],targetPlayerId:'cadet-2'}),e=>e.code==='WRONG_MARKER');
 a.control('markers',{markers:[['A1','surface_yes']],targetPlayerId:'cadet-2'});assert.equal(a.s.completed,false);
 a.control('markers',{markers:[],targetPlayerId:'cadet-2'});assert.equal(a.s.completed,true);
 const b=context('CAMP-I15');b.control('markers',{markers:[['A1','occupied']],targetPlayerId:'cadet-2'});assert.equal(b.s.completed,false);
 b.control('markers',{markers:[['A2','surface_no']],targetPlayerId:'cadet-3'});assert.equal(b.s.completed,true);
});
test('训练撤回恢复完整检查点，重置不残留时钟/解析/标记任务',()=>{
 const {s,act,control}=context('CAMP-W01');const count=s.room.battleState.actionLog.length,gen=s.generation;
 act();assert.equal(s.completed,true);control('undo');assert.equal(s.room.battleState.actionLog.length,count);assert.notEqual(s.generation,gen);assert.equal(s.completed,false);
 control('reveal');control('run-clock');control('reset');assert.equal(s.revealed,false);assert.equal(s.running,false);assert.equal(s.notes.length,0);
});
test('场景过期后的恢复入口与自由预设受限组合',()=>{
 const {t,s,control}=context('CAMP-X12');control('expire');assert.throws(()=>t.get(s.id,s.token),e=>e.code==='TRAINING_EXPIRED');
 const lab=new TrainingService();const x=lab.create('free-practice',{action:'nuclear_bomb',targetKind:'carrier',sourceState:'normal',mapSize:15,players:3});
 assert.equal(x.view.mapSize,15);assert.equal(x.view.maxPlayers,3);
 assert.throws(()=>lab.create('free-practice',{action:'pirate_attack',targetKind:'empty',sourceState:'exhausted'}),/不限次数/);
});
test('结算复盘、取消重赛再请求后合成席位才能确认',()=>{
 const {s,control,send}=context('CAMP-E12');control('replay-inspect');
 send('rematch:request');assert.equal(s.room.roomPhase,'FINISHED');send('rematch:cancel');
 send('rematch:request');assert.equal(s.completed,false);control('script');assert.equal(s.room.roomPhase,'DEPLOYING');assert.equal(s.completed,true);
});

test('等待房间、满员拒绝、开局前断线关闭的实际阶段',()=>{
 const a=context('CAMP-R01');assert.equal(a.s.room.roomPhase,'WAITING');a.control('join-seat');assert.equal(a.s.room.roomPhase,'DEPLOYING');assert.equal(a.s.completed,true);
 const b=context('CAMP-R02');b.control('join-seat');assert.equal(b.s.completed,true);assert.equal(b.s.room.seats.length,2);
 const c=context('CAMP-R04');c.control('disconnect');c.control('clock');assert.equal(c.s.room.roomPhase,'CLOSED');assert.equal(c.s.completed,true);
});
test('准备后取消准备恢复编辑，不提前给训练通过',()=>{
 const {s,send}=context('CAMP-R03');send('deployment:submit',{deployment:S.layout(12,true)});send('deployment:ready');
 assert.equal(s.room.roomPhase,'DEPLOYING');assert.equal(s.completed,false);assert.equal(s.room.seats[0].ready,true);
 send('deployment:cancel-ready');assert.equal(s.room.seats[0].ready,false);assert.equal(s.completed,true);
});
test('训练昵称与房间码纠错使用正式验证器，不创建正式房间',()=>{
 const {s,control}=context('CAMP-R05');
 assert.throws(()=>control('validate-entry',{nickname:'',roomCode:'A'}));
 assert.throws(()=>control('validate-entry',{nickname:'学员',roomCode:'A'}));
 control('validate-entry',{nickname:'学员',roomCode:'ABCDEF'});assert.equal(s.completed,true);
 control('reset');assert.equal(s.entryErrors.size,0);assert.equal(s.entryValidated,false);
});
test('赛后另一方离开，留下方保留座位进入等待页',()=>{
 const {s,control}=context('CAMP-R06');assert.equal(s.viewer,'cadet-2');
 control('leave-other');assert.equal(s.room.roomPhase,'WAITING');assert.equal(s.room.seats[0].playerId,'cadet-2');assert.equal(s.completed,true);
});
