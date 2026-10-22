'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const {TrainingService}=require('../server/training/service');
const {catalog}=require('../server/training/scenarios');
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
   if(url.pathname==='/api/training/catalog')data={scenarios:catalog};
   else if(url.pathname==='/api/training/sessions')data=service.create(body.scenarioId,body);
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
 const open=async id=>{press('[data-action="training-open"]');await flush();press('[data-scenario="'+id+'"]');await flush();};
 return {w,service,socket,calls,errors,find,press,open,network};
}
test('训练UI走完整确认流程，暂停时钟稳定，进度与正式凭证隔离',async t=>{
 const h=setup(t);await h.open('CAMP-W01');
 const {w,press,find,service,socket}=h;
 const s=[...service.sessions.values()][0],before=s.room.battleState.actionLog.length;
 assert.match(find('.training-current').textContent,/驱逐舰Ⅰ/);
 w.Date.now=()=>Date.now()+180000;
 press('[data-action="select-action"][data-action-type="destroyer_i_ram"]');
 press('.battle-map-card--enemy [data-coordinate="'+s.target.coordinate+'"]');
 assert.equal(s.room.battleState.actionLog.length,before);assert.equal(find('[data-action="execute-command"]').disabled,false);
 press('[data-action="execute-command"]');press('[data-action="execute-command"]');await flush();
 assert.equal(s.room.battleState.actionLog.length,before+1);
 assert.equal(JSON.parse(w.localStorage.getItem('ocean.training-progress.v1')).completed['CAMP-W01'],'1.5.0');
 assert.equal(w.localStorage.getItem('ocean.reconnect-session.v1'),null);
 assert.equal(socket.emitted.filter(e=>e.eventName==='action:submit').length,0);
 assert.equal(h.calls.filter(c=>c.event==='action:submit').length,1);
 const reduce=find('#reduce-motion-toggle');reduce.checked=true;reduce.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(find('.battle-effect-layer'),null);
 press('[data-action="training-control"][data-control="reset"]');await flush();assert.equal(s.completed,false);
 press('[data-action="training-control"][data-control="reveal"]');await flush();
 assert.equal(find('.training-task > details').open,true);assert.match(find('.training-coach').textContent,/教官视角/);
 const advanced=find('.training-advanced');advanced.open=true;await flush();advanced.open=false;await flush();
 press('[data-action="select-action"][data-action-type="destroyer_i_ram"]');
 assert.equal(find('.training-task > details').open,true,'内层时间控制折叠不能关闭外层任务与教官解析');
 assert.deepEqual(h.errors,[]);
});
test('场景筛选与自由演练可以实际生成规则局面',async t=>{
 const h=setup(t);h.press('[data-action="training-open"]');await flush();
 const input=h.find('#training-filter [name="query"]');input.value='核弹';
 h.find('#training-filter').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));
 assert.ok(h.w.document.querySelectorAll('.training-cards article').length<catalog.length);
 assert.ok(h.w.document.querySelectorAll('.training-cards article').length>0);
 h.find('#training-lab [name="action"]').value='nuclear_bomb';
 h.find('#training-lab [name="targetKind"]').value='carrier';
 h.find('#training-lab').dispatchEvent(new h.w.Event('submit',{bubbles:true,cancelable:true}));await flush();
 const s=[...h.service.sessions.values()][0];assert.equal(s.scene.code,'LAB');assert.equal(s.action,'nuclear_bomb');assert.ok(h.find('.command-dock'));
});
test('训练本机标记走实际控件，验证添加和删除，不产生战斗提交',async t=>{
 const h=setup(t);await h.open('CAMP-I14:surface_yes');
 h.press('[data-action="toggle-marker-mode"]');
 h.press('[data-action="select-marker-tool"][data-marker="surface_yes"]');
 h.press('.battle-map-card--enemy [data-coordinate="A7"]');
 h.press('[data-action="training-control"][data-control="markers"]');await flush();
 const s=[...h.service.sessions.values()][0];assert.equal(s.completed,false);
 h.press('[data-action="erase-marker-tool"]');h.press('.battle-map-card--enemy [data-coordinate="A7"]');
 h.press('[data-action="training-control"][data-control="markers"]');await flush();
 assert.equal(s.completed,true);assert.equal(h.calls.filter(c=>c.event==='action:submit').length,0);
 assert.equal(h.w.localStorage.getItem('ocean.private-markers.v2:TRNAAA:cadet-1:cadet-2'),null);
});
test('正式Socket的注销消息不会清除活动训练或覆盖正式恢复记录',async t=>{
 const h=setup(t);await h.open('CAMP-W01');
 const saved=JSON.stringify({roomCode:'ABCDEF',reconnectToken:'test-private-record'});
 h.w.localStorage.setItem('ocean.reconnect-session.v1',saved);
 h.socket.serverEmit('room:session',{active:false});await flush();
 assert.ok(h.find('.training-task'));assert.equal(h.w.localStorage.getItem('ocean.reconnect-session.v1'),saved);
 assert.equal(h.w.OceanState,undefined);
});

test('旧攻击应答晚到不能覆盖重置后的新训练，也不能解除新请求锁',async t=>{
 const h=setup(t);await h.open('CAMP-W01');
 const s=[...h.service.sessions.values()][0],oldGeneration=s.generation;
 const select=()=>{h.press('[data-action="select-action"][data-action-type="destroyer_i_ram"]');h.press('.battle-map-card--enemy [data-coordinate="'+s.target.coordinate+'"]');};
 h.network.holdAction=true;select();h.press('[data-action="execute-command"]');await flush();
 assert.equal(h.network.releases.length,1);
 h.press('[data-action="training-control"][data-control="reset"]');await flush();assert.notEqual(s.generation,oldGeneration);
 h.network.holdAction=false;select();h.press('[data-action="execute-command"]');await flush();
 const hp=s.room.battleState.players['cadet-1'].units.find(u=>u.id==='destroyer-i').hp,version=s.room.stateVersion;
 h.network.releases.splice(0).forEach(f=>f());await flush();
 assert.equal(s.room.stateVersion,version);assert.equal(hp,2.5);assert.match(h.find('.fleet-list').textContent,/2.5/);
 assert.equal(h.find('.fatal-card'),null);assert.deepEqual(h.errors,[]);
});
