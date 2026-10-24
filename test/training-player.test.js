'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events');
const R=require('../server/game/rules');
const {TrainingService}=require('../server/training/service');
const {playerCatalog}=require('../server/training/course');
const {intentFor}=require('../server/training/scenarios');
const {createOceanServer}=require('../server/app');
function command(service,s,event,payload={}){return service.command(s.id,s.token,event,{expectedVersion:s.room.stateVersion,trainingGeneration:s.generation,...payload},crypto.randomUUID());}

test('四步上手均能用实际战斗操作完成，不返回调试目录或敌方部署',()=>{
 const service=new TrainingService();
 for(const lesson of playerCatalog().course){
  const created=service.createPlayer('course',lesson.id),s=service.get(created.id,created.token);
  assert.equal(created.roles.length,0);assert.equal(created.task.target,undefined);
  assert.ok(!JSON.stringify(created.lesson).includes('CAMP-'));
  const result=lesson.action?command(service,s,'action:submit',{intent:intentFor(s.room,s.viewer,s.action,s.target)}):command(service,s,'final-salvo:submit',{decoyId:created.view.battle.match.finalSalvo.availableDecoyIds[0]});
  assert.equal(result.task.completed,true,lesson.id);
  assert.throws(()=>command(service,s,'training:control',{control:'role',role:'cadet-2'}),{code:'TRAINING_EVENT_NOT_ALLOWED'});
  assert.throws(()=>service.reveal(s.id,s.token),{code:'REVEAL_NOT_AVAILABLE'});
 }
});
test('十种武器可直接试射，完成依据实际合法执行，重来恢复资源',()=>{
 const service=new TrainingService();
 for(const lesson of playerCatalog().weapons){
  const created=service.createPlayer('weapon',lesson.id),s=service.get(created.id,created.token);
  const initial=structuredClone(s.room.battleState.players[s.viewer].remainingUses);
  const response=command(service,s,'action:submit',{intent:intentFor(s.room,s.viewer,s.action,s.target)});
  assert.equal(response.task.completed,true,lesson.id);
  command(service,s,'training:control',{control:'reset'});
  assert.equal(s.completed,false);assert.deepEqual(s.room.battleState.players[s.viewer].remainingUses,initial);
 }
});
test('自由练习的自动陪练使用安全视图，重复推进不替玩家行动，重来后拒绝旧请求',()=>{
 const service=new TrainingService(),created=service.createPlayer('free','free'),s=service.get(created.id,created.token);
 assert.equal(s.room.battleState.actionLog.length,0);assert.equal(s.room.currentPlayerId,s.viewer);
 const target=R.getActionTargetOptions(s.room.battleState.players[s.viewer],'radar_scan')[0];
 const shot=command(service,s,'action:submit',{intent:intentFor(s.room,s.viewer,'radar_scan',target)});
 assert.equal(shot.view.latestResolution.feedback.actorId,s.viewer);assert.equal(shot.task.completed,false);
 const auto=command(service,s,'training:advance');assert.equal(auto.view.turn.canAct,true);assert.equal(s.room.battleState.actionLog.length,2);
 command(service,s,'training:advance');assert.equal(s.room.battleState.actionLog.length,2);
 const old=s.generation;command(service,s,'training:control',{control:'reset'});assert.notEqual(s.generation,old);
 assert.equal(s.room.battleState.actionLog.length,0);assert.equal(s.room.currentPlayerId,s.viewer);
 assert.throws(()=>service.command(s.id,s.token,'training:advance',{expectedVersion:s.room.stateVersion,trainingGeneration:old},'old-auto'),{code:'STATE_VERSION_CONFLICT'});
});
test('公开训练HTTP只提供玩家课程，默认不开放开发目录、旧夹具入口或教官接口',async t=>{
 const runtime=createOceanServer();runtime.httpServer.listen(0,'127.0.0.1');await once(runtime.httpServer,'listening');t.after(()=>new Promise(resolve=>runtime.io.close(resolve)));
 const base='http://127.0.0.1:'+runtime.httpServer.address().port;
 const course=await(await fetch(base+'/api/training/course')).json();assert.equal(course.data.course.length,4);assert.equal(course.data.weapons.length,10);
 assert.equal((await fetch(base+'/api/training/catalog')).status,404);
 const request=body=>fetch(base+'/api/training/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await request({scenarioId:'CAMP-W01'})).status,400);
 const created=await(await request({mode:'course',lessonId:'fire'})).json();assert.equal(created.ok,true);
 assert.equal((await fetch(base+'/api/training/sessions/'+created.data.id+'/reveal',{headers:{'X-Training-Token':created.data.token}})).status,404);
 assert.equal((await request({mode:'course',lessonId:'CAMP-X06'})).status,400);
});
