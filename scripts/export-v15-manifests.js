'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),spec=path.resolve(root,'spec.md');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(p,obj)=>{const dest=path.join(root,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(obj,null,2)+'\n');};
const source=read('client/motion.js');
const defs=vm.runInNewContext('('+source.match(/const motionDefinitions = Object.freeze\((\{[\s\S]*?\})\);/)[1]+')');
const metadata=Object.entries(defs).map(([id,d])=>({id,...d,stages:[{phase:'lock',start:0,end:d.lockEnd},{phase:'travel',start:d.lockEnd,end:d.travelEnd},{phase:'release',start:d.travelEnd,end:d.duration}],trigger:'fresh accepted server resolution; never submit ACK or restored snapshot',scope:['radar_scan','detection_bomb','shock_bomb'].includes(id)?'authorized area from Data target cells':id==='helicopter_strafe'?'authorized row/column':'authorized target cell; neutral fixed-edge decoration',allowedLayers:'only currently visible authorized map; clipping inside ocean-board',resources:{newBitmap:0,geometry:'6 CSS/DOM children; no particle system',legacyBitmaps:{highMax:4,smoothMax:2},singleCellDecorationPx:[84,112]},safeInput:'role-filtered battleEffectModel',resultPolicy:['submarine_missile','nuclear_bomb','shock_bomb'].includes(id)?'attacker: unknown, invariant across hidden outcomes':'only authorized hit/miss or area boolean',reduced:'static facts, no effect layer',cancellation:['new event','map change','hidden','reduced motion','leave/reset','1800ms deadline']}));
write('docs/ui-motion/effects-manifest.json',{version:'1.5',actions:metadata,mainEffects:1,queue:0,particles:0,environment:{periods:[16000,18000],movingLayers:1,maxShiftPx:3},assets:'Existing role-filtered impact/trail/ring bitmaps restored, composed with code-native geometry; hull shadow/wake/status and existing sea textures restored'});
write('docs/ui-motion/motion-tokens.json',{control:[100,160],panel:[180,220],page:[160,220],lock:[180,240],turn:[240,400],hp:[200,400],salvo:[900,1400],result:[700,1100],actions:defs});
const reusedOcean=['assets/images/ocean-2.5d/ocean/ocean_deep_calm.webp','assets/images/ocean-2.5d/layers/surface/surface_specular_seamless.webp','assets/images/ocean-2.5d/layers/underwater/underwater_caustics_seamless.webp'].map(p=>({path:p,bytes:fs.statSync(path.join(root,'public',p)).size,width:2048,height:2048,transparent:false,source:'existing project WebP; dimensions/alpha inspected with Pillow on 2026-10-22',sha256:hash(fs.readFileSync(path.join(root,'public',p)))}));
write('docs/ui-motion/assets-manifest.json',{generatedImages:[],newBitmapBytes:0,codeNativeMotion:true,restoredLegacyBitmaps:true,restoredInventory:"restored-assets.json",reusedOcean,preheat:'Existing artwork demand decoding and idle preheat in client/artwork.js; new motion geometry has no bitmap preheat',retainedHullAssets:'Existing units/carrier module imagery; source directory public/assets/images/ocean-2.5d/units; no new files generated',legacyFeedback:'Existing role-filtered impact/trail/ring images are visible again and composed with new CSS/DOM geometry; max4 high/max2 smooth. No generated image.'});
const {catalog,makeScenario}=require('../server/training/scenarios');
function sources(c){
 if(c.group==='R')return ['room.js','lifecycle.js','connection.js'];
 if(c.kind==='deployment')return ['deployment.js','room.js','map-rules.js'];
 if(c.kind==='rolling')return ['match.js'];
 if(c.kind==='salvo'||c.group==='E')return ['endgame.js','lifecycle.js','match.js'];
 if(c.group==='X')return ['action-validation.js','connection.js','match.js','timing.js'];
 return ['action-validation.js','action-resolution.js','information-projection.js','match-resolution.js'];
}
const scenarios=catalog.map(c=>{
 const s=makeScenario(c);
 return {...c,ruleVersion:'1.8',checkpointSha256:hash(JSON.stringify(s.room)),checkpointValidation:'assertMatchRoomState; per-map bootstrap regression',
  defaultMap:s.room.mapSize,expectedAction:s.action??null,targetHint:s.target??null,restriction:s.restriction??null,
  sources:sources(c).map(x=>'server/game/'+x),provenance:s.provenance};
});
write('docs/training-camp/scenario-manifest.json',{version:'1.5.0',parents:new Set(catalog.map(c=>c.parentId)).size,variants:catalog.length,scenarios});
const reasons={aircraft_carrier_sunk:'CAMP-E01',pirate_enemy_carrier_sunk:'CAMP-E02',pirate_own_carrier_sunk:'CAMP-E03',pirate_simultaneous_carrier_sink:'CAMP-E04',final_salvo_higher_carrier_hp:'CAMP-E09:higher-hp',final_salvo_tie:'CAMP-E09:tie',surrender:'CAMP-E10:surrender',three_consecutive_timeouts:'CAMP-E10:three-timeouts',disconnect_timeout:'CAMP-E10:disconnect',both_disconnected:'CAMP-E11'};
const errors={SOURCE_SUNK:'CAMP-W22:sunk',SOURCE_PARALYZED:'CAMP-W22:paralyzed',RESOURCE_EXHAUSTED:'CAMP-W23:submarine_missile',ACTION_LOCKED:'CAMP-I10:locked',NO_LEGAL_TARGET:'CAMP-W07:no-target',TARGET_OUT_OF_RANGE:'CAMP-W07',DESTROYER_TARGET_ALREADY_USED:'CAMP-W06',OPENING_RADAR_REQUIRED:'CAMP-D14',STATE_VERSION_CONFLICT:'CAMP-X05',REQUEST_TIMEOUT:'CAMP-X04',NOT_CURRENT_PLAYER:'CAMP-X01:not-turn',TURN_PHASE_MISMATCH:'CAMP-X01:resolving',CELL_OVERLAP:'CAMP-D08',INVALID_SHAPE:'CAMP-D06',OUT_OF_BOUNDS:'CAMP-D07',WRONG_CELL_COUNT:'CAMP-D09',RECONNECT_DEADLINE_EXPIRED:'CAMP-X06:expired',ROOM_NOT_FOUND:'CAMP-X06:missing-room',FINAL_SALVO_ALREADY_SUBMITTED:'CAMP-E06',INVALID_NICKNAME:'CAMP-R05',INVALID_ROOM_CODE:'CAMP-R05',JOIN_NOT_ALLOWED:'CAMP-R02',PLAYER_NOT_READY:'CAMP-R03',READY_CANCEL_NOT_ALLOWED:'CAMP-R03'};
const ruleFiles=fs.readdirSync(path.join(root,'server/game')).filter(x=>x.endsWith('.js')).sort();
const fingerprints=Object.fromEntries(ruleFiles.map(f=>['server/game/'+f,hash(fs.readFileSync(path.join(root,'server/game',f)))]));
const coverage={version:'1.5',ruleVersion:'1.8',ruleFiles:fingerprints,
 endReasons:Object.entries(reasons).map(([branch,scenario])=>({branch,scenario,source:'server/game/endgame.js'})),
 playerErrors:Object.entries(errors).map(([branch,scenario])=>({branch,scenario})),
 scenarios:scenarios.map(s=>({id:s.id,parent:s.parentId,action:s.action,kind:s.kind,sources:s.sources})),
 boundary:'Explicit player-visible branch inventory; malformed JSON, invalid server clocks/random sources, prototype injection and internal corrupted-state errors are not player exercises. Final independent branch audit is pending; generated counts are not a claim of exhaustive source proof.'};
write('docs/training-camp/coverage-matrix.json',coverage);
const specText=fs.readFileSync(spec,'utf8'),ids=[...specText.matchAll(/^\| ((?:MV|TCAMP)-[A-Z]+-\d+)\b/gm)].map(m=>m[1]);
for(const [folder,prefix]of [['ui-motion','MV-'],['training-camp','TCAMP-']]){
 const rows=ids.filter(x=>x.startsWith(prefix)).map(id=>'| '+id+' | 待独立复验 | 见实现清单、相关回归与实际浏览器证据 |').join('\n');
 const report='# v1.5 '+(prefix==='MV-'?'动效':'训练营')+'验收记录\n\n开发实现与基础验证不等同于最终通过。正式真机、完整矩阵、正式性能与逐项独立审定尚未执行。本表保留真实状态，后续由独立验收填写。\n\n| 需求 | 状态 | 证据入口 |\n| --- | --- | --- |\n'+rows+'\n';
 const dest=path.join(root,'docs',folder,'acceptance-report.md');
 if(!fs.existsSync(dest))fs.writeFileSync(dest,report);
}
const files=['package.json','package-lock.json','scripts/build-ui.js','public/js/app.js','public/css/ocean.css','public/index.html','public/js/release-config.js','client/motion.js','client/training.js','client/artwork.js','client/deployment-view.js','client/accessibility.js','client/bootstrap.js','client/commands.js','client/transport.js','client/styles/motion.css','client/styles/map.css','client/styles/responsive.css','client/battle-map.js','client/styles/training.css','public/js/audio-system.js','server/training/scenarios.js','server/training/service.js','server/training/catalog.json'];
const logPath=fs.existsSync(path.join(root,'docs/releases/v1.6.2/acceptance.log'))?'docs/releases/v1.6.2/acceptance.log':fs.existsSync(path.join(root,'docs/ui-motion/evidence/tests/final-effects-acceptance.log'))?'docs/ui-motion/evidence/tests/final-effects-acceptance.log':'docs/ui-motion/evidence/tests/final-acceptance.log';
let actualTests='not run';
if(fs.existsSync(path.join(root,logPath))){
 const log=read(logPath),number=name=>Number(log.match(new RegExp('(?:^|\\n).*?'+name+' (\\d+)\\r?$', 'm'))?.[1]);
 const tests=number('tests'),pass=number('pass'),fail=number('fail'),skipped=number('skipped');
 if(tests&&Number.isFinite(pass)&&Number.isFinite(fail)&&Number.isFinite(skipped))actualTests={tests,pass,fail,skipped,log:logPath,logSha256:hash(log)};
}
const manifest={specVersion:'1.5',date:'2026-10-22',specSha256:hash(fs.readFileSync(spec)),baseCommit:'959ed06 (working tree also contains the prior UI2 implementation)',assetVersion:require('../public/js/release-config').assetVersion,modules:JSON.parse(read('client/modules.json')),files:Object.fromEntries(files.map(p=>{const b=fs.readFileSync(path.join(root,p));return [p,{bytes:b.length,sha256:hash(b)}];})),automatedTests:actualTests,implementationModel:{model:'GPT-6.1 Sol',authorization:'User explicitly allowed current Sol continuation'},independentAcceptance:'pending'};
write('docs/ui-motion/build-manifest.json',manifest);write('docs/training-camp/build-manifest.json',manifest);
console.log('[Ocean] Exported '+metadata.length+' effects, '+catalog.length+' scenario variants and '+ids.length+' requirement rows.');
