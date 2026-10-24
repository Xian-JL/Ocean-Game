'use strict';
const R=require('../game/rules');

const lessons=[
 {id:'fire',scene:'CAMP-W01',title:'第一次开火',action:'destroyer_i_ram',description:'选择驱逐舰Ⅰ，点选一个可用目标，再确认执行。',explanation:'选点只是瞄准，确认才会开火。命中后留意自己的生命值变化。'},
 {id:'radar',scene:'CAMP-I01:positive',title:'侦察海域',action:'radar_scan',description:'选择雷达，在敌方海图确定一片扫描区域并执行。',explanation:'雷达提供区域级信号，不会直接告诉你舰船在哪一格。'},
 {id:'missile',scene:'CAMP-W15:unit',title:'使用潜射导弹',action:'submarine_missile',description:'选择潜射导弹，瞄准一格海域并发射。',explanation:'导弹执行后的结果对攻击方保密。没有命中提示不代表没有造成伤害。'},
 {id:'salvo',scene:'CAMP-E06',title:'体验最终齐射',action:null,description:'选择己方一枚可用鱼雷，确认参加齐射。',explanation:'双方的选择锁定后同时结算，选择顺序不会改变先后胜负。'}
];
const weaponScenes=[
 ['destroyer_i_ram','CAMP-W01','驱逐舰Ⅰ冲撞','冲撞命中会带来自损，行动前留意生命值。'],
 ['destroyer_ii_ram','CAMP-W02','驱逐舰Ⅱ冲撞','体验另一种射程，留意海图中的可选范围。'],
 ['pirate_attack','CAMP-W08','海盗船攻击','海盗攻击威力较高，也会牵动己方航母的生命值。'],
 ['motorboat_ram','CAMP-W11:motorboat','摩托艇冲撞','选择一艘摩托艇试射，留意命中与自损的区别。'],
 ['submarine_missile','CAMP-W15:unit','潜射导弹','发射后结果保密，已执行不等于已确认命中。'],
 ['nuclear_bomb','CAMP-W17:carrier','核弹','体验有限弹药的强力攻击，结果仍然保密。'],
 ['shock_bomb','CAMP-I07','震爆弹','对区域内水下单位造成干扰，攻击方不知道是否生效。'],
 ['detection_bomb','CAMP-I04:positive','探测弹','侦察一片海域是否存在水下信号。'],
 ['radar_scan','CAMP-I01:positive','雷达扫描','用区域信号缩小判断范围，而不是直接揭示舰船。'],
 ['helicopter_strafe','CAMP-I10:unlocked','直升机扫射','本练习已准备好扫射解锁局面，选择一行或一列体验。']
].map(([action,scene,title,explanation])=>({id:action,scene,title,action,description:'选择'+title+'，在海图瞄准并确认执行。',explanation}));
const freeLesson={id:'free',title:'自由练习',action:null,description:'先用雷达侦察，再选择武器作战。陪练会自动回应，练习不计时。',explanation:'资源、命中与胜负沿用实战规则；随时可以重来。'};
function publicLesson(item){const {scene,...data}=item;return data;}
function playerCatalog(){return {version:'core-1',course:lessons.map(publicLesson),weapons:weaponScenes.map(publicLesson)};}
function findLesson(mode,id){return mode==='free'?freeLesson:(mode==='course'?lessons:mode==='weapon'?weaponScenes:[]).find(x=>x.id===id);}
function lessonView(mode,item){const index=lessons.findIndex(x=>x.id===item.id);return {...publicLesson(item),mode,index:mode==='course'?index:0,total:mode==='course'?lessons.length:1,next:mode==='course'?lessons[index+1]?.id??null:null};}
function freeRoom(){
 let room=R.createRoomState({roomCode:'TRNAAA',playerId:'cadet-1',nickname:'你',maxPlayers:2,mapSize:12});
 room=R.joinRoomState(room,{playerId:'cadet-2',nickname:'陪练舰队'},1000000);
 for(const id of ['cadet-2','cadet-1']){room=R.submitDeployment(room,id,R.generateRandomDeployment(Math.random,room.mapRules),1000000);room=R.setPlayerReady(room,id,1000000);}
 let i=0;room=R.determineFirstPlayer(room,()=>[.99,.1][i++%2]);return R.startPlaying(room,1000000);
}
module.exports={playerCatalog,findLesson,lessonView,freeRoom};
