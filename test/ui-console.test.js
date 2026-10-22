"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {JSDOM}=require("jsdom");
const {FakeSocket,playingRoom,threePlayerPlayingRoom,click}=require("../test-fixtures/ui-harness");
const root=path.resolve(__dirname,"..");

function setup(t,room=playingRoom()) {
  const html=fs.readFileSync(path.join(root,"public/index.html"),"utf8").replaceAll(/<script[^>]+src="[^"]+"[^>]*><\/script>/g,"");
  const dom=new JSDOM(html,{url:"http://127.0.0.1:3000/",runScripts:"outside-only",pretendToBeVisual:true});
  t.after(()=>dom.window.close());
  const w=dom.window; w.structuredClone=structuredClone;
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
  w.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
  const socket=new FakeSocket();w.io=()=>socket;
  for(const script of ["release-config.js","game-data.js","ui-model.js","tutorial-system.js","app.js"])
    w.eval(fs.readFileSync(path.join(root,"public/js",script),"utf8"));
  socket.connect();socket.serverEmit("room:state",room);
  const find=selector=>w.document.querySelector(selector);
  const press=selector=>click(w,find(selector));
  return {w,socket,find,press};
}

test("战斗反馈按实例 ID 标识摩托艇，不把第二艘显示为第一艘",t=>{
  const room=playingRoom();
  const boat=room.battle.own.units.find(unit=>unit.id==='motorboat-2');
  boat.hp=0;
  room.latestResolution={feedback:{sequence:2,actorId:'player-2',defenderId:'player-1',defenderIds:['player-1'],actionType:'nuclear_bomb',actionName:'核弹',target:{kind:'cell',coordinate:boat.cells[0]},ownDamage:[],receivedHits:[{unitId:'motorboat-2',unitType:'motorboat',beforeHp:1,appliedDamage:1,afterHp:0,sunk:true}]}};
  const {find}=setup(t,room);
  assert.match(find('.resolution-strip').textContent,/摩托艇 2被命中/);
  assert.doesNotMatch(find('.resolution-strip').textContent,/摩托艇 1被命中/);
  assert.match(find('.fleet-list').textContent,/摩托艇 2/);
});

test("CMD-02/09：选点不提交，执行中连续点击只发一个稳定意图",t=>{
  const {w,socket,find,press}=setup(t);
  press('[data-action="select-action"][data-action-type="pirate_attack"]');
  press('.battle-map-card--enemy [data-coordinate="A1"]');
  assert.equal(find('#confirm-dialog').open,false);
  assert.match(find('.command-dock').textContent,/A1/);
  assert.equal(socket.emitted.filter(e=>e.eventName==='action:submit').length,0);
  press('[data-action="execute-command"]');
  press('[data-action="execute-command"]');
  const requests=socket.emitted.filter(e=>e.eventName==='action:submit');
  assert.equal(requests.length,1);
  assert.equal(requests[0].payload.intent.target.coordinate,'A1');
  assert.ok(requests[0].payload.intent.actionId);
  assert.ok(find('[data-action="execute-command"]').disabled);
});

test("CMD-13：旧目标在阶段变化后不能再次提交",t=>{
  const {socket,find,press}=setup(t);
  press('[data-action="select-action"][data-action-type="pirate_attack"]');
  press('.battle-map-card--enemy [data-coordinate="A1"]');
  const next=playingRoom();next.stateVersion=50;next.turn.turnNumber+=1;next.turn.canAct=false;
  socket.serverEmit('room:state',next);
  assert.ok(find('[data-action="execute-command"]').disabled);
  press('[data-action="execute-command"]');
  assert.equal(socket.emitted.filter(e=>e.eventName==='action:submit').length,0);
});

test("A11Y-02：敌方海图单入口并支持方向键、Home 和 End",t=>{
  const {w,find,press}=setup(t);
  press('[data-action="select-action"][data-action-type="pirate_attack"]');
  const grid=find('.battle-map-card--enemy [role="grid"]');
  assert.equal(grid.querySelectorAll('[tabindex="0"]').length,1);
  const first=grid.querySelector('[data-coordinate="A1"]');first.focus();
  first.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  assert.equal(w.document.activeElement.dataset.coordinate,'A2');
  w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
  assert.equal(w.document.activeElement.dataset.coordinate,'A12');
  w.document.activeElement.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
  assert.equal(w.document.activeElement.dataset.coordinate,'A1');
});

test("INTEL-06/08：私人标记无网络动作且不同敌方保持隔离",t=>{
  const {socket,find,press}=setup(t,threePlayerPlayingRoom());
  const before=socket.emitted.length;
  press('[data-action="toggle-marker-mode"]');
  press('[data-action="select-marker-tool"][data-marker="surface_yes"]');
  press('.battle-map-card[data-player-id="player-2"] [data-coordinate="A2"]');
  assert.match(find('.battle-map-card[data-player-id="player-2"] [data-coordinate="A2"]').getAttribute('aria-label'),/本机标记/);
  assert.doesNotMatch(find('.battle-map-card[data-player-id="player-3"] [data-coordinate="A2"]').getAttribute('aria-label'),/本机标记/);
  assert.equal(socket.emitted.length,before);
});

test("SALVO-03：选择鱼雷仅更新摘要，确认后秘密提交一次",t=>{
  const room=playingRoom();room.roomPhase='FINAL_SALVO';room.turn=null;room.turnPhase=null;
  room.battle.match.finalSalvo={status:'selecting',round:1,ownSubmitted:false,ownSelectedDecoyId:null,submittedPlayerIds:[],availableDecoyIds:room.battle.own.decoys.map(d=>d.id)};
  const {socket,find,press}=setup(t,room);
  assert.equal(find('[data-action="execute-command"]'),null);
  const id=room.battle.own.decoys[0].id;
  press(`[data-action="submit-final-salvo"][data-decoy-id="${id}"]`);
  assert.equal(socket.emitted.filter(e=>e.eventName==='final-salvo:submit').length,0);
  press('[data-action="confirm-final-salvo"]');press('[data-action="confirm-final-salvo"]');
  const requests=socket.emitted.filter(e=>e.eventName==='final-salvo:submit');
  assert.equal(requests.length,1);assert.equal(requests[0].payload.decoyId,id);
});

test("COMP-05：行动、舰队和日志抽屉互斥",t=>{
  const {w,find,press}=setup(t);
  Object.defineProperty(w,'innerWidth',{value:390,configurable:true});
  press('[data-action="toggle-fleet"]');assert.equal(find('.ocean-console').dataset.drawerOpen,'fleet');
  press('[data-action="toggle-action-drawer"]');assert.equal(find('.ocean-console').dataset.drawerOpen,'actions');
  press('[data-action="set-event-channel"][data-channel="combat"]');assert.equal(find('.ocean-console').dataset.drawerOpen,'messages');
  assert.equal(find('.fleet-panel--open'),null);assert.equal(find('.action-rail--open'),null);
  press('[data-action="close-battle-drawers"]');assert.equal(find('.ocean-console').dataset.drawerOpen,'none');
});

test("FFA-02/08：同步目标切图保留，淘汰后自动选存活敌方",t=>{
  const {socket,find,press}=setup(t,threePlayerPlayingRoom());
  press('[data-action="select-action"][data-action-type="radar_scan"]');
  press('.battle-map-card[data-player-id="player-2"] [data-coordinate="A1"]');
  press('[data-action="switch-map"][data-map="player-3"]');
  assert.match(find('.command-dock').textContent,/A1/);
  assert.equal(find('#confirm-dialog').open,false);
  const next=threePlayerPlayingRoom();next.stateVersion=60;next.battle.match.eliminatedPlayerIds=['player-2'];
  next.turn.remainingTargetPlayerIds=['player-3'];next.turn.requiredTargetPlayerIds=['player-3'];
  socket.serverEmit('room:state',next);
  press('[data-action="select-action"][data-action-type="radar_scan"]');
  assert.equal(find('[data-map="player-3"]').getAttribute('aria-selected'),'true');
  assert.match(find('.sync-note').textContent,/唯一有效目标/);
});

test("SEC-01：正式壳只加载单一样式入口，无私密/测试状态挂到 window",t=>{
  const {w}=setup(t);
  const styles=[...w.document.querySelectorAll('link[rel="stylesheet"]')].map(el=>el.getAttribute('href'));
  assert.equal(styles.length,1);assert.match(styles[0],/ocean\.css/);
  assert.equal(w.state,undefined);assert.equal(w.room,undefined);
  assert.doesNotMatch(w.document.querySelector('.battle-map-card--enemy').textContent,/生命值|航空母舰|核潜艇/);
});
