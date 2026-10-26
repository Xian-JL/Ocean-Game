"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom'),{FakeSocket,playingRoom,baseRoom,click}=require('../test-fixtures/ui-harness');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function setup(t){
 const dom=new JSDOM(read('public/index.html').replaceAll(/<script[^>]+src="[^"]+"[^>]*><\/script>/g,''),{url:'http://127.0.0.1:3000/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
 const w=dom.window;w.structuredClone=structuredClone;w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 const socket=new FakeSocket();w.io=()=>socket;
 for(const name of ['release-config.js','game-data.js','ui-model.js','tutorial-system.js','app.js'])w.eval(read('public/js/'+name));
 socket.connect();socket.serverEmit('room:state',playingRoom());
 const find=s=>w.document.querySelector(s),press=s=>click(w,find(s));return {w,socket,find,press};
}
test('v164 全部后端、规则模型、训练和结算视图保持冻结内容',()=>{
 const frozen=JSON.parse(read('docs/releases/v1.6.4/frozen-scope.json'));assert.ok(Object.keys(frozen.files).length>=40);
 for(const [file,meta] of Object.entries(frozen.files))assert.equal(crypto.createHash('sha256').update(read(file).replaceAll('\r\n','\n')).digest('hex'),meta.canonicalLfSha256,file);
});
test('v164 视窗范围只依据几何，首尾和极限平移均限制在当前海图',()=>{
 const ctx={document:{addEventListener(){}},window:{addEventListener(){}}};vm.createContext(ctx);vm.runInContext(read('client/combat-polish.js')+';this.metrics=viewportMetrics;',ctx);
 const base={left:0,top:0,width:313,height:313,cellWidth:26,cellHeight:26,axisX:27,axisY:27,size:12};
 const a=ctx.metrics(base);assert.equal(a.firstColumn,0);assert.equal(a.lastColumn,10);assert.equal(a.lastRow,10);
 const b=ctx.metrics({...base,left:300,top:200,width:360,height:440,cellWidth:48,cellHeight:48,size:15});assert.equal(b.firstColumn,6);assert.equal(b.lastColumn,13);assert.equal(b.firstRow,4);assert.equal(b.lastRow,12);
 const edge=ctx.metrics({...base,left:10000,top:10000});assert.equal(edge.firstColumn,11);assert.equal(edge.lastRow,11);
});
test('v164 禁用武器可读完整说明且不改当前草稿或发送指令',t=>{
 const {socket,find,press}=setup(t);press('[data-action=select-action][data-action-type=pirate_attack]');press('.battle-map-card--enemy [data-coordinate=A1]');
 const before=find('.command-summary').textContent;
 press('[data-action=inspect-action][data-action-type=helicopter_strafe]');assert.equal(find('#weapon-details-dialog').open,true);assert.match(find('#weapon-details-body').textContent,/均沉没后解锁/);assert.equal(find('.command-summary').textContent,before);
 assert.equal(socket.emitted.filter(e=>e.eventName==='action:submit').length,0);press('[data-action=close-weapon-details]');assert.equal(find('#weapon-details-dialog').open,false);
});
test('v164 数字键只选择，坐标输入与弹窗中的数字键不改变武器',t=>{
 const {w,socket,find,press}=setup(t);w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'5',bubbles:true}));assert.equal(find('.action-card--selected').dataset.actionType,'submarine_missile');
 find('#map-coordinate-input').dispatchEvent(new w.KeyboardEvent('keydown',{key:'1',bubbles:true}));assert.equal(find('.action-card--selected').dataset.actionType,'submarine_missile');
 press('[data-action=inspect-action][data-action-type=nuclear_bomb]');w.document.body.dispatchEvent(new w.KeyboardEvent('keydown',{key:'2',bubbles:true}));assert.equal(find('.action-card--selected').dataset.actionType,'submarine_missile');assert.equal(socket.emitted.filter(e=>e.eventName==='action:submit').length,0);
});
test('v164 定位坐标保持目标草稿，Enter定位不发射，只有一个海图键盘入口',async t=>{
 const {w,socket,find,press}=setup(t);press('[data-action=select-action][data-action-type=pirate_attack]');press('.battle-map-card--enemy [data-coordinate=A1]');
 find('#map-coordinate-input').value='L12';find('#map-locate-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,50));
 assert.match(find('.command-target').textContent,/A1/);assert.equal(socket.emitted.filter(e=>e.eventName==='action:submit').length,0);
 assert.equal(w.document.querySelectorAll('.is-mobile-active [role=gridcell][tabindex="0"]:not(:disabled)').length,1);assert.equal(w.document.activeElement.dataset.coordinate,'L12');
});
test('v164 非法定位坐标原地提示，不改草稿与网络状态',t=>{
 const {w,socket,find,press}=setup(t);press('[data-action=select-action][data-action-type=pirate_attack]');press('.battle-map-card--enemy [data-coordinate=A1]');
 find('#map-coordinate-input').value='O15';find('#map-locate-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(find('#map-coordinate-input').getAttribute('aria-invalid'),'true');assert.match(find('.command-target').textContent,/A1/);assert.equal(socket.emitted.filter(e=>e.eventName==='action:submit').length,0);
});
test('v164 定位输入在重绘后保留，按真实地图身份隔离',t=>{
 const {w,find,press}=setup(t);find('#map-coordinate-input').value='l12';find('#map-coordinate-input').dispatchEvent(new w.Event('input',{bubbles:true}));
 press('[data-action=select-action][data-action-type=pirate_attack]');assert.equal(find('#map-coordinate-input').value,'L12');
 press('[data-action=switch-map][data-map=own]');assert.equal(find('#map-coordinate-input').value,'');
 press('.mobile-map-tabs [data-map=player-2]');assert.equal(find('#map-coordinate-input').value,'L12');
});
test('v164 航母肖像逐模块保持实际连通形状和实例数据',t=>{
 const {find,press}=setup(t);press('[data-action=select-action][data-action-type=radar_scan]');const carrier=playingRoom().battle.own.units.find(u=>u.type==='aircraft_carrier');
 assert.equal(find('.source-projection').querySelectorAll('image').length,carrier.cells.length);assert.match(find('.source-name').textContent,/航空母舰/);
});
test('v164 舰体图片失败回退文字，状态贴图失败不替换真实舰体',t=>{
 const {w,find}=setup(t),image=find('.tactical-unit-art--whole-unit .tactical-hull-viewport image'),unit=image.closest('.tactical-unit-art');image.dispatchEvent(new w.Event('error'));assert.ok(unit.querySelector('.hull-fallback'));assert.match(unit.textContent,/驱/);
 const other=[...w.document.querySelectorAll('.tactical-unit-art')].find(e=>e!==unit&&e.querySelector('.tactical-status-art'));if(other){other.querySelector('.tactical-status-art').dispatchEvent(new w.Event('error'));assert.equal(other.classList.contains('art-fallback'),false);}
});
test('v164 每次重绘释放旧视窗监听，离开战斗后不残留滚动监听',t=>{
 const {w,socket,press}=setup(t);let added=0,removed=0;const proto=w.EventTarget.prototype,add=proto.addEventListener,remove=proto.removeEventListener;
 proto.addEventListener=function(type,...args){if(type==='scroll'&&this.matches?.('.board-frame--tactical-sea'))added++;return add.call(this,type,...args);};
 proto.removeEventListener=function(type,...args){if(type==='scroll'&&this.matches?.('.board-frame--tactical-sea'))removed++;return remove.call(this,type,...args);};
 for(let i=0;i<10;i++)press('[data-action=select-action][data-action-type=pirate_attack]');assert.equal(added-removed,0);
 const room=baseRoom({stateVersion:100});socket.serverEmit('room:state',room);assert.equal(added-removed,-1);
});
