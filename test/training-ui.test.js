'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const {TrainingService}=require('../server/training/service');
const {playerCatalog}=require('../server/training/course');
const {FakeSocket,click}=require('../test-fixtures/ui-harness');
const root=path.resolve(__dirname,'..');
async function flush(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
function setup(t){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8').replaceAll(/<script[^>]+src="[^"]+"[^>]*><\/script>/g,'');
 const dom=new JSDOM(html,{url:'http://127.0.0.1:3000/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 t.after(()=>dom.window.close());
 const w=dom.window;w.structuredClone=structuredClone;
 w.HTMLElement.prototype.scrollIntoView=function(){};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 const service=new TrainingService(),socket=new FakeSocket(),calls=[],network={holdAction:false,releases:[]};
 w.io=()=>socket;
 w.fetch=async(raw,options={})=>{
  const url=new URL(raw,'http://127.0.0.1:3000'),body=options.body?JSON.parse(options.body):{},token=options.headers?.['X-Training-Token'];
  calls.push({path:url.pathname,event:body.event});
  try{
   let data;const match=url.pathname.match(/^\/api\/training\/sessions\/([^/]+)(?:\/(commands|reveal))?$/);
   if(url.pathname==='/api/training/course')data=playerCatalog();
   else if(url.pathname==='/api/training/sessions')data=service.createPlayer(body.mode,body.lessonId);
   else if(match&&options.method==='DELETE'){service.destroy(match[1],token);data={destroyed:true};}
   else if(match&&match[2]==='commands')data=service.command(match[1],token,body.event,body.payload,body.operationId);
   else if(match&&match[2]==='reveal')data=service.reveal(match[1],token);
   else if(match)data=service.response(service.get(match[1],token));
   else throw Error('Unexpected endpoint '+url.pathname);
   if(body.event==="action:submit"&&network.holdAction)await new Promise(resolve=>network.releases.push(resolve));
   return {json:async()=>({ok:true,data})};
  }catch(e){return {json:async()=>({ok:false,error:{code:e.code,message:e.message}})};}
 };
 for(const name of ['release-config','game-data','ui-model','tutorial-system','app'])w.eval(fs.readFileSync(path.join(root,'public/js/'+name+'.js'),'utf8'));
 socket.connect();
 const find=selector=>w.document.querySelector(selector);
 const press=selector=>click(w,find(selector));
 const open=async(id='fire',mode='course')=>{press('[data-action="training-open"]');await flush();press('[data-action="training-start"][data-mode="'+mode+'"][data-lesson="'+id+'"]');await flush();};
 return {w,service,socket,calls,errors,find,press,open,network};
}

test('快速上手复用真实选点确认，完成后进入下一步，没有调试面板',async t=>{
 const h=setup(t);await h.open();const {press,find,w,service}=h,s=[...service.sessions.values()][0],before=s.room.battleState.actionLog.length;
 assert.match(find('.training-task').textContent,/第一次开火/);
 assert.equal(w.document.querySelectorAll('.training-advanced,.training-coach,[data-action="training-role"],#training-filter,#training-lab').length,0);
 assert.doesNotMatch(find('#app').textContent,/CAMP-|虚拟时钟|合成席位|检查点/);
 press('[data-action="select-action"][data-action-type="destroyer_i_ram"]');press('.battle-map-card--enemy [data-coordinate="'+s.target.coordinate+'"]');
 assert.equal(s.room.battleState.actionLog.length,before);assert.equal(find('[data-action="execute-command"]').disabled,false);
 press('[data-action="execute-command"]');press('[data-action="execute-command"]');await flush();
 assert.equal(s.room.battleState.actionLog.length,before+1);assert.equal(s.completed,true);
 assert.equal(JSON.parse(w.localStorage.getItem('ocean.training-progress.v1')).completed['course:fire'],'core-1');
 assert.equal(h.calls.filter(x=>x.event==='action:submit').length,1);assert.equal(h.socket.emitted.filter(x=>x.eventName==='action:submit').length,0);
 const reduce=find('#reduce-motion-toggle');reduce.checked=true;reduce.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(find('.battle-effect-layer'),null);
 press('[data-action="training-next"]');await flush();assert.match(find('.training-task').textContent,/侦察海域/);assert.equal(service.sessions.size,1);
 assert.deepEqual(h.errors,[]);
});
test('武器体验只需选行动名称，无需指定目标种类和来源状态',async t=>{
 const h=setup(t);h.press('[data-action="training-open"]');await flush();
 assert.equal(h.w.document.querySelectorAll('.training-weapon-grid button').length,10);
 assert.match(h.find('.training-catalog').textContent,/快速上手/);assert.doesNotMatch(h.find('.training-catalog').textContent,/163|90个|断线|同步|场景编号/);
 h.press('[data-mode="weapon"][data-lesson="nuclear_bomb"]');await flush();
 const s=[...h.service.sessions.values()][0];assert.equal(s.playerMode,'weapon');assert.equal(s.action,'nuclear_bomb');
 h.press('[data-action="select-action"][data-action-type="nuclear_bomb"]');h.press('.battle-map-card--enemy [data-coordinate="'+s.target.coordinate+'"]');h.press('[data-action="execute-command"]');await flush();
 assert.equal(s.completed,true);assert.ok(h.find('.command-dock'));assert.deepEqual(h.errors,[]);
});
test('自由练习中标记保持本机隔离，不需要提交验证或发送攻击',async t=>{
 const h=setup(t);await h.open('free','free');
 h.press('[data-action="toggle-marker-mode"]');h.press('[data-action="select-marker-tool"][data-marker="surface_yes"]');h.press('.battle-map-card--enemy [data-coordinate="A7"]');
 assert.equal(h.find('.battle-map-card--enemy [data-coordinate="A7"]').dataset.cellState,'private-marker');
 h.press('[data-action="erase-marker-tool"]');h.press('.battle-map-card--enemy [data-coordinate="A7"]');
 assert.notEqual(h.find('.battle-map-card--enemy [data-coordinate="A7"]').dataset.cellState,'private-marker');
 assert.equal(h.calls.filter(x=>x.event==='action:submit').length,0);
 assert.equal(h.w.localStorage.getItem('ocean.private-markers.v2:TRNAAA:cadet-1:cadet-2'),null);
});
test('自由练习自动回应并归还回合，退出后不留下陪练请求',async t=>{
 const h=setup(t);const original=h.w.setTimeout.bind(h.w);h.w.setTimeout=(fn,ms,...args)=>original(fn,ms===1500?1:ms,...args);
 await h.open('free','free');const s=[...h.service.sessions.values()][0];
 h.press('[data-action="select-action"][data-action-type="radar_scan"]');h.press('.battle-map-card--enemy [data-coordinate="A1"]');h.press('[data-action="execute-command"]');
 await flush();await new Promise(resolve=>setTimeout(resolve,30));await flush();
 assert.equal(s.room.battleState.actionLog.length,2);assert.equal(s.room.currentPlayerId,'cadet-1');assert.equal(h.find('[data-deadline]'),null);
 assert.ok(h.calls.some(x=>x.event==='training:advance'));
 h.press('[data-action="training-exit-session"]');await flush();const requests=h.calls.length;
 await new Promise(resolve=>setTimeout(resolve,20));assert.equal(h.calls.length,requests);assert.equal(h.service.sessions.size,0);assert.ok(h.find('.training-catalog'));assert.deepEqual(h.errors,[]);
});
test('正式Socket的注销消息不会清除练习或覆盖正式恢复记录',async t=>{
 const h=setup(t);await h.open();const saved=JSON.stringify({roomCode:'ABCDEF',reconnectToken:'test-private-record'});
 h.w.localStorage.setItem('ocean.reconnect-session.v1',saved);h.socket.serverEmit('room:session',{active:false});await flush();
 assert.ok(h.find('.training-task'));assert.equal(h.w.localStorage.getItem('ocean.reconnect-session.v1'),saved);assert.equal(h.w.OceanState,undefined);
});
test('旧攻击应答晚到不覆盖重来的练习，仍能继续执行',async t=>{
 const h=setup(t);await h.open();const s=[...h.service.sessions.values()][0],oldGeneration=s.generation;
 const select=()=>{h.press('[data-action="select-action"][data-action-type="destroyer_i_ram"]');h.press('.battle-map-card--enemy [data-coordinate="'+s.target.coordinate+'"]');};
 h.network.holdAction=true;select();h.press('[data-action="execute-command"]');await flush();assert.equal(h.network.releases.length,1);
 h.press('[data-action="training-restart"]');await flush();assert.notEqual(s.generation,oldGeneration);
 h.network.holdAction=false;select();h.press('[data-action="execute-command"]');await flush();const version=s.room.stateVersion;
 h.network.releases.splice(0).forEach(f=>f());await flush();
 assert.equal(s.room.stateVersion,version);assert.match(h.find('.fleet-list').textContent,/2.5/);assert.equal(h.find('.fatal-card'),null);assert.deepEqual(h.errors,[]);
});
