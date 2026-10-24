"use strict";
// UI SPEC 2.0 handoff inventory. It never invents test/visual/performance passes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),os=require('node:os'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),out=path.join(root,'docs/ui-v2');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const json=(file,data)=>fs.writeFileSync(path.join(out,file),JSON.stringify(data,null,2)+'\n');
const relative=p=>path.relative(root,p).split(path.sep).join('/');
function walk(dir){if(!fs.existsSync(dir))return [];return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
function record(file){const data=fs.readFileSync(file);return {path:relative(file),bytes:data.length,sha256:sha(data)};}
const spec=read('spec.md'),baseline=JSON.parse(read('docs/ui-v2/baseline-manifest.json')),release=require('../public/js/release-config');
const logs=fs.existsSync(path.join(out,'development-acceptance.log'))?read('docs/ui-v2/development-acceptance.log'):'';
const number=key=>Number([...logs.matchAll(new RegExp('ℹ '+key+' (\\d+)','g'))].at(-1)?.[1]??NaN);
const tests={tests:number('tests'),pass:number('pass'),fail:number('fail'),skipped:number('skipped'),log:'development-acceptance.log'};
if(!Number.isFinite(tests.tests)||tests.fail!==0)throw Error('A real successful acceptance log is required');
const canonical=JSON.parse(read('docs/ui-v2/frozen-canonical-sha256.json')).files;
const frozen=Object.entries(baseline.files).filter(([p])=>/^(server\/(game|socket)\/|public\/js\/(game-data|ui-model)\.js$)/.test(p)).map(([p,meta])=>({path:p,unchanged:sha(read(p).replaceAll('\r\n','\n'))===canonical[p],baselineSha256:meta.sha256,canonicalLfSha256:canonical[p]}));
if(frozen.some(f=>!f.unchanged))throw Error('Frozen rule/protocol files changed');
const files=walk(path.join(root,'public')).map(record);
json('build-manifest.json',{generatedAt:new Date().toISOString(),status:'开发完成，待独立验收',model:'Sol（当前会话已获继续授权）',product:require('../package.json').version,spec:'2.0',specSha256:sha(spec),rule:release.ruleVersion,socket:release.socketProtocolVersion,assetVersion:release.assetVersion,gitBase:baseline.head,gitHead:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),dirtyWorkspace:cp.execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}).trim(),tests,frozen,files,notes:'未创建新发布标签、未提交、未推送；真实手机与正式性能未测。'});
const newArt=files.filter(f=>f.path.includes('/images/armory/')||f.path.includes('/icons/armory-'));
const inventory=files.filter(f=>f.path.includes('/images/ocean-2.5d/')||f.path.endsWith('/icons/ocean-ui.svg'));
json('assets-manifest.json',{assetVersion:release.assetVersion,newArtBytes:newArt.reduce((n,f)=>n+f.bytes,0),newArt,existingInventory:inventory,provenance:'generated-art.json / effects-and-assets.md / existing source-asset-manifest.json; originals archived in source-art/.',fontBytes:0,fonts:'System fallbacks, no distributed font binary.'});
json('design-tokens.json',{...JSON.parse(read('docs/ui-v2/proposed-tokens.json')),status:'Applied to client/styles/tokens.css; timing details in motion.js; candidate palette unchanged.',assetVersion:release.assetVersion,runtimeTokenSha256:sha(read('client/styles/tokens.css'))});
const scriptFiles=['app.js','game-data.js','ui-model.js','audio-system.js','tutorial-system.js','theme-bootstrap.js','release-config.js'].map(n=>'public/js/'+n);
const critical=[...scriptFiles,'public/css/ocean.css','public/index.html'].map(p=>{const data=fs.readFileSync(path.join(root,p));return {path:p,bytes:data.length,gzipBytes:zlib.gzipSync(data,{level:9}).length};});
json('resource-budget.json',{assetVersion:release.assetVersion,method:'Static file sizes and gzip level 9, not actual cold network or LCP measurements',criticalFiles:critical,criticalRawBytes:critical.reduce((n,f)=>n+f.bytes,0),criticalGzipBytes:critical.reduce((n,f)=>n+f.gzipBytes,0),newArtBytes:newArt.reduce((n,f)=>n+f.bytes,0),fontBytes:0,environment:{node:process.version,os:os.platform(),arch:os.arch(),cpu:os.cpus()[0]?.model,memoryGiB:Math.round(os.totalmem()/1024**3)},formalPerformance:'未测'});
const references={GOV:'development-handoff.md；build-manifest.json；冻结指纹与基础回归',REF:'design-package.md；assets-manifest.json；generated-art.json',BRD:'design-package.md；screenshots/；待独立视觉评审',TOK:'design-tokens.json；client/styles/tokens.css；组件样板',IA:'components-and-migration.md；各 view 模块；DOM 全阶段回归',HOME:'client/entry-view.js；home-desktop/mobile.png；创建/加入 DOM 回归',PREP:'client/deployment-view.js；整备/掷骰实操；部署/Socket 回归',BTL:'client/battle-view.js；client/command-view.js；战斗与全局对局回归',CMP:'components-and-migration.md；armory-lab.html；真实底部台截图',MAP:'client/battle-map.js；client/artwork.js；地图与隐私回归',ACT:'effects-and-assets.md；motion.js；十行动、来源与完整对局回归',FX:'effects-and-assets.md；真实连续帧；motion/audio 生命周期回归',TRN:'client/training.js；训练玩家/HTTP/自动陪练回归；真实上手实操',END:'result-view.js；真实投降结果/复盘；齐射与重赛回归',PER:'components-and-migration.md；主题迁移 VM 测试；组件预览',MOB:'responsive.css；390×844、568×320 实操；完整矩阵/真机待验',SEC:'冻结安全投影；隐私配对/完整对局/去重回归；独立审定待验',ACC:'accessibility.js；原键盘/DOM 回归；真实辅助技术待验',AST:'assets-manifest.json；generated-art.json；资源预算回归',ENG:'components-and-migration.md；build-manifest.json；基础回归',PRF:'performance-report.md；resource-budget.json；正式样本未测',VIS:'design-package.md；visual-review.md；待用户/独立验收人判定',QA:'development-acceptance.log；scenarios.md；当前构建交接',DEL:'README.md；设计/素材/组件/日志/清单/交接文件'};
const passed=new Set(['GOV-01','GOV-03','GOV-04','GOV-05','GOV-06','GOV-07','REF-02','REF-03','TOK-01','TOK-05','TOK-06','IA-03','IA-05','HOME-02','HOME-04','HOME-05','PREP-01','PREP-02','PREP-03','PREP-04','PREP-06','PREP-07','BTL-02','MAP-02','MAP-03','MAP-04','MAP-05','MAP-07','ACT-12','ACT-13','ACT-14','ACT-15','ACT-16','FX-04','FX-05','FX-06','FX-11','FX-12','TRN-01','TRN-02','TRN-03','TRN-04','TRN-05','TRN-06','TRN-07','END-01','END-02','END-04','END-06','END-07','PER-04','PER-06','PER-07','SEC-01','SEC-02','SEC-03','SEC-04','SEC-06','ENG-01','ENG-03','ENG-04','ENG-06','ENG-07','ENG-08','ENG-09','AST-02','AST-04','AST-05','AST-08','AST-09','QA-01','QA-04','QA-07']);
let count=0,passCount=0;
let table=read('docs/ui-v2/acceptance.md').split('\n').map(line=>{
 if(!/^\| U2-/.test(line))return line;
 const cells=line.split('|'),id=cells[1].trim(),key=id.replace('U2-',''),group=id.split('-')[1];count++;
 const pass=passed.has(key);if(pass)passCount++;cells[4]=' '+(pass?'通过':'未测')+' ';
 cells[5]=' '+(references[group]??'development-handoff.md')+'；构建 '+release.assetVersion+'。'+(pass?'仅开发基础覆盖。':'实现已交付，需按该条完整门槛独立验收。')+' ';
 cells[6]=' '+(pass?'基础未发现；非最终签收':'待独立审定')+' ';return cells.join('|');
 }).join('\n');
table='# UI SPEC 2.0 逐需求验收表\n\n本表含 194 项。当前实现与基础证据已关联；“通过”仅指列明的开发基础覆盖，不表示全部设备/画质/辅助技术或最终审美已签收。“未测”项已有实现入口，完整门槛由独立验收填写。构建 '+release.assetVersion+'。\n\n'+table.slice(table.indexOf('| 编号'));
if(count!==194)throw Error('Expected 194 requirement rows, got '+count);
fs.writeFileSync(path.join(out,'acceptance.md'),table);
json('development-summary.json',{assetVersion:release.assetVersion,requirements:count,basicPassed:passCount,awaitingIndependent:count-passCount,tests,status:'开发完成，待独立验收',complexReviewAgents:0});
const capturesPath=path.join(out,'screenshots/capture-records.json');
if(fs.existsSync(capturesPath)){
 const captures=JSON.parse(fs.readFileSync(capturesPath,'utf8'));
 const latest=new Map(captures.map(c=>[c.file,c]));
 const evidence=walk(path.join(out,'screenshots')).filter(p=>/\.(png|jpg|webp)$/.test(p)).map(p=>{
  const entry=latest.get(path.basename(p));return {...record(p),capture:entry??null,status:entry?.css?.includes(release.assetVersion)?'当前构建实采':'开发中间参考；不作为当前构建最终验收证据'};
 });
 json('evidence-index.json',{assetVersion:release.assetVersion,browser:'Windows / Chrome 155.0.0.0 / DPR1; viewport simulation, not a real phone',notes:'Continuous frames are not FPS samples. Unbound older references are explicitly marked.',evidence});
}
console.log(JSON.stringify({assetVersion:release.assetVersion,tests,frozenFiles:frozen.length,requirements:count,basicPassed:passCount,awaitingIndependent:count-passCount,newArtBytes:newArt.reduce((n,f)=>n+f.bytes,0)}));
