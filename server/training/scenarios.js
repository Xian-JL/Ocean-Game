'use strict';
const R=require('../game/rules');
const catalog=require('./catalog.json');
const copy=x=>structuredClone(x);
const ids=['cadet-1','cadet-2','cadet-3'];
function layout(size=12,own=false,mirror=false){
 const rules=R.createMapRules(size);
 const carrier=['G5','G6','H5','H6','I5','J5','I6','J6'].slice(0,rules.carrierCellCount);
 const placements=[
 ['destroyer-i','destroyer_i',own?(size===10?['E4','E5','E6']:['E5','E6','E7']):['A1','A2','A3']],
 ['destroyer-ii','destroyer_ii',['B1','C1','D1','E1']],
 ['submarine','submarine',['C3','C4','D3','D4']],
 ['pirate','pirate_ship',['F1','F2','F3']],
 ['motorboat','motorboat',['J10']],['motorboat-2','motorboat',['I10']],
 ['nuclear','nuclear_submarine',['H1','H2','I1','I2']],['carrier','aircraft_carrier',carrier],
 ...['A10','D2','G10','E10','F10'].slice(0,rules.decoyCount).map((c,i)=>['decoy-'+(i+1),'decoy_torpedo',[c]])];
 return R.assertValidDeployment(placements.map(([id,type,cells])=>({id,type,cells:cells.map(c=>{
  if(!mirror)return c;const p=R.parseCoordinate(c,rules);
  return R.formatCoordinate({row:size-1-p.row,column:size-1-p.column},rules);
 })})),rules);
}
function intentFor(room,actor,action,target,sourceId){
 const own=room.battleState.players[actor];
 return {actionId:'training-'+room.battleState.nextActionSequence+'-'+actor,actionType:action,
 sourceId:sourceId??R.getUnitByType(own,R.getActionDefinition(action).sourceType).id,target:copy(target)};
}
function runAction(room,actor,action,target,now=1000000,sourceId){
 const intent=intentFor(room,actor,action,target,sourceId);
 const begun=R.beginPlayerAction(room,actor,intent,now);
 return R.completePlayerAction(begun,now+1);
}
function seedRoom(scene,size){
 const n=scene.players;
 let room=R.createRoomState({roomCode:'TRNAAA',playerId:ids[0],nickname:'你 · 训练学员',maxPlayers:n,mapSize:size});
 if(scene.kind==='lobby'&&scene.code!=='R02')return room;
 for(let i=1;i<n;i++)room=R.joinRoomState(room,{playerId:ids[i],nickname:'合成舰队 '+i},1000000);
 for(let i=1;i<n;i++){room=R.submitDeployment(room,ids[i],layout(size,false,((['F01','F03'].includes(scene.code)&&i===2)||scene.kind==='salvo')),1000000);if(scene.code!=='R03')room=R.setPlayerReady(room,ids[i],1000000);}
 if(scene.kind==='deployment'||scene.kind==='lobby')return room;
 const ownLayout=layout(size,true);
 if(scene.kind==='salvo'&&scene.code==='E08'&&['hit','old','wreck'].includes(scene.variant)){
  const enemy=layout(size,false,true),want=scene.variant==='wreck'?'destroyer-i':'carrier';
  ownLayout.find(x=>x.id==='decoy-1').cells=[enemy.find(x=>x.id===want).cells.find(c=>!ownLayout.some(p=>p.id!=='decoy-1'&&p.cells.includes(c)))];
 }
 room=R.submitDeployment(room,ids[0],ownLayout,1000000);room=R.setPlayerReady(room,ids[0],1000000);
 if(scene.kind==='rolling')return room;
 let index=0;const rolls=[.99,.3,.1];room=R.determineFirstPlayer(room,()=>rolls[index++%n]);room=R.startPlaying(room,1000000);
 if(scene.kind==='opening' || scene.action==='radar_scan')return room;
 for(let i=0;i<n;i++)room=runAction(room,room.currentPlayerId,'radar_scan',{kind:'cell',coordinate:'A1'});
 return room;
}
function hurt(room,id,unitId,hp,reason='training_checkpoint',hitCells=null){
 const player=room.battleState.players[id],unit=player.units.find(u=>u.id===unitId);
 if(unit.hp<=hp)return;
 const applied=R.applyDamageToUnit(player,unitId,unit.hp-hp,{reason,hitCells:hitCells??unit.cells.slice(0,Math.min(unit.cells.length,Math.ceil(unit.hp-hp)))});
 room.battleState=R.replaceBattlePlayerState(room.battleState,id,applied.state);
}
function cellKind(room,defender,cell){
 const p=room.battleState.players[defender];
 const u=R.getBattleUnitAtCell(p,cell);
 if(u)return u.hp<=0?'wreck':u.hitCells.includes(cell)?'old':u.id==='carrier'?'carrier':u.id==='pirate'?'pirate':['submarine','nuclear'].includes(u.id)?'underwater':'surface';
 const d=R.getBattleDecoyAtCell(p,cell);return d?d.destroyed?'destroyed-decoy':'decoy':'empty';
}
function chooseTarget(room,action,wanted='unit',variant='default'){
 const own=room.battleState.players[ids[0]],defender=ids[1];
 const options=R.getActionTargetOptions(own,action);
 if(action==='helicopter_strafe'){
   if(wanted!=='unit'){
    return options.find(t=>(t.kind==='row'?R.getFullRow(t.row,room.mapRules):R.getFullColumn(t.column,room.mapRules)).some(c=>cellKind(room,defender,c)===wanted))??options[0];
   }
   if(variant==='column')return options.find(t=>t.kind==='column'&&t.column===5);
   return options.find(t=>t.kind==='row'&&t.row==='G')??options[0];
 }
 if(['radar_scan','detection_bomb','shock_bomb'].includes(action)){
   for(const target of options){
    const a=intentFor(room,ids[0],action,target);
    const probe=copy(room.battleState);probe.players[ids[0]].remainingUses[action]=Math.max(1,probe.players[ids[0]].remainingUses[action]??1);
    const resolved=R.resolveAction(probe,ids[0],a);
    const outcome=resolved.result.outcome.outcomesByDefender?.[defender]??resolved.result.outcome;
    const positive=outcome.detected??(outcome.affectedUnitIds?.length>0);
    if(wanted==='negative'||wanted==='empty'){if(!positive)return target;}
    else if(['unit','positive','underwater'].includes(wanted)){if(positive)return target;}
    else {
      const cells=R.getActionDefinition(action).rangeMode==='radar_area'?R.getRadarArea(target.coordinate,room.mapRules):
       action==='detection_bomb'?R.getDetectionArea(target.coordinate,room.mapRules):R.getShockArea(target.coordinate,room.mapRules);
      if(cells.some(c=>cellKind(room,defender,c)===wanted))return target;
    }
   }
 }else for(const target of options){
   const kind=cellKind(room,defender,target.coordinate);
   if(kind===wanted || wanted==='unit'&&['surface','underwater','pirate','carrier'].includes(kind))return target;
 }
 throw new Error('训练目标不可达：'+action+'/'+wanted);
}
function makeScenario(scene,preset={}){
 const size=scene.code==='D01'?10:scene.code==='D03'?15:/^(10|12|15)-/.test(scene.variant)?Number(scene.variant.split('-')[0]):[10,12,15].includes(preset.mapSize)?preset.mapSize:12;
 scene={...scene};if([2,3].includes(preset.players))scene.players=preset.players;
 if(scene.code==='X08'&&scene.variant==='deployment')scene.kind='deployment';
 let room=seedRoom(scene,size),action=scene.kind==='opening'?'radar_scan':scene.action;
 const s={scene,room,now:1000001,viewer:ids[0],steps:0,completed:false,restriction:null,rejected:false,history:[],provenance:['合法部署','服务器掷骰','按规则完成各玩家首次雷达'].slice(0,room.battleState?3:1)};
 if(!room.battleState){s.hint=scene.kind==='lobby'?'展开任务控制，使用“模拟席位加入”；格式纠错场景使用专属训练字段，不接触正式房间。':scene.kind==='rolling'?'点击“掷骰子”，合成席位会在本轮跟随投掷。':'请完成合法部署并准备。可随机部署后调整，所有操作与实战相同。';return s;}
 const v=scene.variant,c=scene.code;
 if(v==='destroyer-ii')action='destroyer_ii_ram';
 if(c==='W23')action=v;
 if(['W11','W12','W14'].includes(c)&&v==='motorboat-2')hurt(room,ids[0],'motorboat',0);
 if(['I10','I11','I12','I13'].includes(c)||action==='helicopter_strafe'){
   if(c!=='I10'||v==='unlocked'){hurt(room,ids[0],'destroyer-i',0);hurt(room,ids[0],'destroyer-ii',0);}
   else if(v==='one-sunk')hurt(room,ids[0],'destroyer-i',0);
   if(c==='I10'&&v!=='unlocked')s.restriction='ACTION_LOCKED';
   if(c==='I12')s.preferredTarget={kind:'column',column:5};
 }
 let wanted=({W03:'empty',W04:'decoy',W05:'underwater',W08:'surface',W09:'pirate',W11:'carrier',W12:'surface',W13:'underwater',W17:v==='carrier'?'carrier':'surface',I07:'underwater',I09:'underwater',E01:'carrier',E02:'carrier',E03:'surface',E04:'carrier'})[c]??'unit';
 if(c==='LAB')wanted=preset.targetKind??'unit';
 if(['W10','W14','W15','W16','W18','W21','I03','I05','I08','I13'].includes(c))wanted=v;
 if(['I01','I04'].includes(c))wanted=v;
 if(v==='old'){
   const u=room.battleState.players[ids[1]].units.find(u=>u.id===(['motorboat_ram','helicopter_strafe'].includes(action)?'destroyer-i':'submarine'));
   hurt(room,ids[1],u.id,u.hp-1);
 }
 if(v==='wreck')hurt(room,ids[1],'submarine',0);
 if(v==='destroyed-decoy'){
  const p=room.battleState.players[ids[1]];
  room.battleState=R.replaceBattlePlayerState(room.battleState,ids[1],R.destroyDecoy(p,p.decoys[0].id,'training_checkpoint').state);
 }
 if(c==='W20'){hurt(room,ids[1],'destroyer-ii',v==='fraction'?.5:1);wanted='surface';}
 if(c==='W06'){
  const used=chooseTarget(room,'destroyer_i_ram','empty').coordinate;
  room.battleState=R.resolveAction(room.battleState,ids[0],intentFor(room,ids[0],'destroyer_i_ram',{kind:'cell',coordinate:used})).state;
  s.restriction='DESTROYER_TARGET_ALREADY_USED';s.restrictedTarget={kind:'cell',coordinate:used};
 }
 if(c==='W07'){
  s.restriction=v==='no-target'?'NO_LEGAL_TARGET':'TARGET_OUT_OF_RANGE';
  if(v==='no-target'){
   let player=room.battleState.players[ids[0]];
   const options=R.getActionTargetOptions(player,action);
   s.restrictedTarget=options[0];
   for(const t of options)player=R.markDestroyerTarget(player,t.coordinate);
   room.battleState=R.replaceBattlePlayerState(room.battleState,ids[0],player);
   s.provenance.push('驱逐舰范围内的共享坐标已在前序回合使用');
  }
 }
 if(c==='X02'){
  action=v==='range'?'destroyer_i_ram':'pirate_attack';s.restriction=v==='range'?'TARGET_OUT_OF_RANGE':'INVALID_TARGET';
  s.restrictedTarget=v==='axis'?{kind:'row',row:'A'}:{kind:'cell',coordinate:v==='out-of-bounds'?'Z99':room.mapRules.coordinateMaximum};
 }
 if(c==='W22'&&v!=='second-boat'){
   if(v==='sunk')hurt(room,ids[0],'submarine',0);
   else room.battleState.players[ids[0]].units.find(u=>u.id==='submarine').paralyzed=true;
   s.restriction=v==='sunk'?'SOURCE_SUNK':'SOURCE_PARALYZED';
 }else if(c==='W22'){action='motorboat_ram';hurt(room,ids[0],'motorboat',0);wanted='carrier';}
 if(c==='W23'){
   const p=room.battleState.players[ids[0]];
   // A finite, validated midgame resource checkpoint. Re-created for the recovery step.
   p.remainingUses[action]=0;s.restriction='RESOURCE_EXHAUSTED';s.provenance.push('该行动已在前序回合耗尽');
 }
 if(c==='W19'){wanted='old';hurt(room,ids[1],'submarine',1);}
 if(c==='E01'||c==='E02'||c==='E04')hurt(room,ids[1],'carrier',c==='E01'?2:1);
 if(c==='E03'||c==='E04'){hurt(room,ids[0],'carrier',.5);hurt(room,ids[0],'pirate',1);}
 if(['W24','E05'].includes(c)||scene.kind==='salvo'){
  for(const id of room.battleState.playerIds){
   for(const u of [...room.battleState.players[id].units])if(u.id!=='carrier' && !(c==='E05'&&id===ids[0]&&u.id==='nuclear'))hurt(room,id,u.id,0);
   for(const key of ['submarine_missile','nuclear_bomb','helicopter_strafe'])room.battleState.players[id].remainingUses[key]=0;
  }
  if(c==='E05'){action='nuclear_bomb';room.battleState.players[ids[0]].remainingUses.nuclear_bomb=1;wanted='empty';}
  else {
   if(c==='E06'){
    const p=room.battleState.players[ids[0]];
    room.battleState=R.replaceBattlePlayerState(room.battleState,ids[0],R.destroyDecoy(p,p.decoys[0].id,'training_checkpoint').state);
   }
   if(c==='E08'&&v==='old'){
    const u=room.battleState.players[ids[1]].units.find(u=>u.id==='carrier');hurt(room,ids[1],u.id,u.hp-1,'training_checkpoint',[room.battleState.players[ids[0]].decoys[0].cell]);
   }
   if(c==='E08'&&v==='no-decoy'){
    const p=room.battleState.players[ids[0]];
    for(const d of p.decoys)room.battleState=R.replaceBattlePlayerState(room.battleState,ids[0],R.destroyDecoy(room.battleState.players[ids[0]],d.id,'training_checkpoint').state);
   }
   room.battleState=R.startManualFinalSalvo(room.battleState);
   room={...room,roomPhase:'FINAL_SALVO',turnPhase:null,currentPlayerId:null,turnActionState:null,pendingAction:null,actionDeadlineAt:null};
   s.room=room;s.hint=v==='no-decoy'?'本方没有有效鱼雷，不必选择。点击“推进合成席位”，观察自动等待/结算。':'选择一枚自己的有效鱼雷，先选再确认；合成席位将秘密提交。重复各轮直到结束。';
   if(c==='E09'&&v==='higher-hp')hurt(room,ids[1],'carrier',room.battleState.players[ids[1]].units.find(u=>u.id==='carrier').hp-.5);
   R.assertMatchRoomState(room);return s;
  }
 }
 if(c==='F04'||c==='F05'){
   const victim=c==='F04'?ids[1]:ids[0];hurt(room,victim,'carrier',1);
   const actor=c==='F04'?ids[0]:ids[1];
   const target={kind:'cell',coordinate:room.battleState.players[victim].units.find(u=>u.id==='carrier').cells.find(x=>!room.battleState.players[victim].units.find(u=>u.id==='carrier').hitCells.includes(x))};
   const resolved=R.resolveBattleAction(room.battleState,actor,intentFor(room,actor,'nuclear_bomb',target));
   room.battleState=resolved.state;room.lastResolutionByPlayer=resolved.deliveriesByPlayer;
   room=R.prepareNextTurn(room,room.battleState,c==='F05'?ids[1]:ids[0],s.now);s.room=room;
 }
 if(c==='F06'){
   for(const u of room.battleState.players[ids[0]].units)if(!['submarine','nuclear','carrier'].includes(u.id))hurt(room,ids[0],u.id,0);
   room.battleState.players[ids[0]].remainingUses.helicopter_strafe=0;
   room.battleState.players[ids[0]].pendingParalysisUnitIds=['submarine','nuclear'];
   room=R.prepareNextTurn(room,room.battleState,ids[0],s.now);s.room=room;
 }
 if(scene.kind==='recovery'){
   s.hint='先尝试正常选点与确认。使用下方明确标注的训练控制模拟本例状态，再按提示同步或恢复。';
   if(c==='X01'){
     if(v==='not-turn')room=R.prepareNextTurn(room,room.battleState,ids[1],s.now);
     if(v==='resolving')room=R.beginPlayerAction(room,ids[0],intentFor(room,ids[0],'pirate_attack',chooseTarget(room,'pirate_attack','empty')),s.now);
     if(v==='offline')room=R.disconnectPlayer(room,ids[0],s.now);
   }
   if(c==='X08'&&v==='reconnect')room=R.disconnectPlayer(room,ids[0],s.now);
   if(c==='X06'&&v==='missing-room')s.simulateMissing=true;
   s.room=room;
 }
 if(c==='R06'){
  s.room=R.surrenderMatch(room,ids[0],s.now);s.viewer=ids[1];s.hint='你正在扮演留下的合成席位。展开任务控制并模拟另一方离开，观察座位与等待页。';return s;
 }
 if(c==='E12'){
  s.room=R.surrenderMatch(room,ids[1],s.now);s.hint='本例从合成对手投降后的终局开始。查看复盘，再申请/取消重赛，最后让对手确认开始新局。';return s;
 }
 s.action=action;
 if(scene.kind==='recovery')s.target=chooseTarget(s.room,action,'empty');
 if(c==='LAB'){
  const p=room.battleState.players[ids[0]],source=R.getUnitByType(p,R.getActionDefinition(action).sourceType);
  if(preset.sourceState==='sunk'){hurt(room,ids[0],source.id,0);s.restriction='SOURCE_SUNK';}
  if(preset.sourceState==='paralyzed'){
   if(!['submarine','nuclear_submarine'].includes(source.type))throw new Error('此来源不是可瘫痪的水下单位，请选择潜艇或核潜艇行动。');
   source.paralyzed=true;s.restriction='SOURCE_PARALYZED';
  }
  if(preset.sourceState==='exhausted'){
   if(R.getActionDefinition(action).initialUses===null)throw new Error('此行动不限次数，不能设置弹药耗尽。');
   p.remainingUses[action]=0;s.restriction='RESOURCE_EXHAUSTED';
  }
 }
 if(scene.kind!=='recovery'&&scene.kind!=='markers'&&c!=='F05'&&c!=='F06'){
  s.target=v==='no-target'?s.restrictedTarget:s.preferredTarget??chooseTarget(room,action,wanted,v);
  if(c==='I09'){
   s.target=R.getActionTargetOptions(room.battleState.players[ids[0]],action).find(t=>{
    const o=R.resolveAction(room.battleState,ids[0],intentFor(room,ids[0],action,t)).result.outcome;
    return o.affectedUnitIds?.length>=2;
   })??s.target;
  }
  if(c==='I08'||c==='I05'&&v==='surface'){
   const negative=chooseTarget(room,action,'negative');
   s.target=negative;
  }
  if(c==='I02'&&v.endsWith('invalid')||c==='I06'&&v==='invalid'){
    s.restriction='TARGET_OUT_OF_RANGE';s.restrictedTarget={kind:'cell',coordinate:room.mapRules.coordinateMaximum};
  }
  s.hint='请选择「'+R.getActionDefinition(action).name+'」，目标 '+(s.target.coordinate??s.target.row??s.target.column)+'，再按指令台确认。'+(s.restriction?'先查看并验证本例的受限原因，随后重建可操作检查点。':'');
 }else if(scene.kind==='markers')s.hint='开启私人标记，按任务添加/替换/删除注记；它不应发送攻击。完成后验证当前标记。';
 if(scene.kind==='recovery'){
  const guide={X01:'等待/同步到可行动状态；可推进合成席位或恢复合成座位。',X02:'先展开任务控制验证受限条件，再重建合法检查点。',X03:'先选点、取消，再改选另一个目标；只有确认才提交。',X04:'首次确认将模拟应答丢失；请等待自动同步，不要重复发指令。',X05:'首次确认会遇到旧版本冲突；同步后重新选点。',X06:'先模拟断线，再恢复；超期变体请推进时钟，房间不存在变体需重置。',X07:'模拟合成对手断线，再恢复或推进至期限之后。',X08:'分别推进至截止前5秒与截止之后，观察规则处理。',X09:'点击模拟回到前台，再同步训练状态。',X10:'用方向键/Home/End/Enter操作海图；窄屏还需平移海图。',X11:'先在设置中选取本例的画质/减少动画/静音条件，再执行。',X12:'可模拟训练服务重启，再同步观察过期，返回场景库重新进入。'};
  s.hint=(guide[c]??'')+'可行动时选择「'+R.getActionDefinition(action).name+'」，目标 '+(s.target?.coordinate??'合法格')+'，确认执行。';
 }
 R.assertMatchRoomState(s.room);
 return s;
}
module.exports={catalog,layout,makeScenario,intentFor,runAction,chooseTarget,cellKind,ids};
