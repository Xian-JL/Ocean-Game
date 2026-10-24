"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom'),Data=require('../public/js/game-data'),Model=require('../public/js/ui-model');
const {playingRoom}=require('../test-fixtures/ui-harness');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function view(){
 const state={battle:{selectedAction:null,actionDrawerOpen:false,helicopterAxis:'row'}};
 const ctx={Data,Model,state,escapeHtml:s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),uiIcon:()=>'<svg aria-hidden="true"></svg>',openingRadarRequired:()=>false,armorySourceProjection:()=>'<svg aria-hidden="true"></svg>',unitStatusText:u=>u.hp<=0?'已沉没':'作战中'};
 vm.createContext(ctx);vm.runInContext(read('client/command-view.js')+';this.api={renderActionPanel,renderArmorySource};',ctx);return {state,api:ctx.api};
}
test('U2 十槽在可用、沉没和耗尽状态保持同顺序，禁用原因保持可访问',()=>{
 const {api}=view(),room=playingRoom();
 const expected=['destroyer_i_ram','destroyer_ii_ram','pirate_attack','motorboat_ram','submarine_missile','nuclear_bomb','shock_bomb','detection_bomb','radar_scan','helicopter_strafe'];
 for(const spent of [false,true]){
  if(spent){room.battle.own.units.forEach(u=>u.hp=0);Object.keys(room.battle.own.remainingUses).forEach(k=>room.battle.own.remainingUses[k]=0);}
  const dom=new JSDOM(api.renderActionPanel(room)),doc=dom.window.document;
  assert.deepEqual([...doc.querySelectorAll('[data-action="select-action"]')].map(e=>e.dataset.actionType),expected);
  for(const b of doc.querySelectorAll('[data-action="select-action"]'))assert.ok(doc.getElementById(b.getAttribute('aria-describedby'))?.textContent);
  assert.equal(new Set([...doc.querySelectorAll('[id]')].map(e=>e.id)).size,10);dom.window.close();
 }
});
test('U2 来源舰仅显示实际己方实例，摩托艇不合并 HP',()=>{
 const {api,state}=view(),room=playingRoom(),boats=room.battle.own.units.filter(u=>u.type===Data.UNIT_TYPES.MOTORBOAT);
 assert.equal(boats.length,2);boats[0].hp=0;boats[1].hp=0.5;state.battle.selectedAction='motorboat_ram';
 const html=api.renderArmorySource(room);assert.match(html,/0\.5/);assert.doesNotMatch(html,/0\.5\s*\/\s*2/);assert.doesNotMatch(html,/opponents|reconnectToken|enemyMap/);
});
test('U2 正式引擎、Socket、静态规则和安全视图与 UI2 起点逐文件一致',()=>{
 const baseline=JSON.parse(read('docs/ui-v2/baseline-manifest.json'));
 const canonical=JSON.parse(read('docs/ui-v2/frozen-canonical-sha256.json')).files;
 let count=0;for(const [file,meta]of Object.entries(baseline.files)){
  if(!/^(server\/(game|socket)\/|public\/js\/(game-data|ui-model)\.js$)/.test(file))continue;
  const content=fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n');
  assert.equal(crypto.createHash('sha256').update(content).digest('hex'),canonical[file],file);count++;
 }assert.ok(count>=10);
});
test('U2 本次运行美术有独立手机构图、响应派生与预算约束',()=>{
 const manifest=JSON.parse(read('docs/ui-v2/generated-art.json')),runtime=manifest.files.filter(f=>f.path.startsWith('public/'));
 assert.equal(runtime.length,6);assert.ok(runtime.reduce((n,f)=>n+f.bytes,0)<6*1024*1024);
 for(const f of runtime)assert.ok(f.bytes<(f.path.includes('mobile')?220:450)*1024,f.path);
 const home=read('client/entry-view.js');assert.match(home,/<picture/);assert.match(home,/drydock-mobile-480/);assert.match(home,/srcset/);
});
test('U2 特效保留既有贴图、真实尺度与同族图形，手机抽屉高于遮罩',()=>{
 const motion=read('client/styles/motion.css'),battle=read('client/styles/battle.css');
 assert.match(motion,/clamp\(96px/);assert.match(motion,/clamp\(80px/);assert.match(motion,/restored-impact/);
 assert.doesNotMatch(motion,/smooth[^}]*\.motion-ray--second\{display:none/);
 assert.match(battle,/\.armory-plinth\{[^}]*z-index:auto/);
 assert.match(read('client/styles/responsive.css'),/grid-template-columns:minmax\(0,1fr\) 220px/);
});
test('U2 合成组件页不连接正式会话、不暴露业务状态',()=>{
 const lab=read('public/armory-lab.html'),script=read('public/js/armory-lab.js');
 assert.match(lab,/合成样板/);assert.match(script,/window\.OCEAN_LAB_MOTION/);
 assert.doesNotMatch(lab+script,/socket\.io|reconnectToken|sessionStorage|localStorage|window\.state/);
});
