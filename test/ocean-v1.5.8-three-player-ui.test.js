"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

function functionBody(name, nextName) {
  const start = app.search(new RegExp(`^  (?:async )?function ${name}`, "m"));
  const tail = start >= 0 ? app.slice(start + 3) : "";
  const nextOffset = nextName
    ? tail.search(new RegExp(`^  (?:async )?function ${nextName}`, "m"))
    : -1;
  const end = nextOffset >= 0 ? start + 3 + nextOffset : app.length;
  assert.ok(start >= 0 && end > start, `找不到函数 ${name}`);
  return app.slice(start, end);
}

test("v1.5.8 发布元数据、缓存标识与页面类一致", () => {
  assert.equal(require("../package.json").version, "1.6.1");
  assert.equal(require("../public/js/game-data").RELEASE.stage, "Ocean-v1.6.1");
  assert.match(html, /main\.css\?v=1\.6\.1/);
  assert.match(html, /app\.js\?v=1\.6\.1/);
  assert.match(app, /battle-page--v158/);
});

test("三人行动使用同一目标同步两名存活敌方且资源和自损只提示一次", () => {
  const simultaneous = functionBody("isSimultaneousThreePlayerSelection", "markersForTarget");
  const confirmation = functionBody("openActionConfirmation", "submitSelectedAction");
  assert.match(simultaneous, /activeBattleOpponentIds\(room\)\.length > 1/);
  assert.match(confirmation, /使用同一目标或范围/);
  assert.match(confirmation, /行动资源以及行动方可能产生的自损只结算一次/);
  assert.match(app, /同一坐标\/范围 · 资源与自损只结算 1 次/);
});

test("切换两张敌方地图时保留同步行动的坐标与范围预览", () => {
  const switchStart = app.indexOf('if (action === "switch-map")');
  const switchHandler = app.slice(switchStart, app.indexOf('if (action === "toggle-battle-map")', switchStart));
  const board = functionBody("renderEnemyBoard", "unitStateCode");
  assert.match(switchHandler, /preserveSharedTarget = isSimultaneousThreePlayerSelection/);
  assert.match(switchHandler, /if \(!preserveSharedTarget\)[\s\S]*state\.battle\.target = null/);
  assert.match(board, /selectedForThisMap \|\| simultaneousAction/);
  assert.match(board, /Data\.previewCells\(state\.battle\.selectedAction, state\.battle\.target\)/);
});

test("敌方地图标签展示连接、淘汰、受影响、坐标、结果与未读状态", () => {
  const tabs = functionBody("renderBattleMapTabs", "renderBattleSideDock");
  for (const token of [
    "data-player-state",
    "data-affected",
    "data-unread-result",
    "battle-map-tab__identity",
    "battle-map-tab__result",
    "battle-map-tab__unread",
  ]) {
    assert.match(tabs, new RegExp(token));
  }
  assert.match(css, /\[data-player-state="offline"\] \.battle-map-tab__identity/);
  assert.match(css, /button\.is-eliminated/);
});

test("最新反馈按防守方分组且非行动方只生成自己的安全结果行", () => {
  const resultRows = functionBody("feedbackResultRows", "mapLatestResultMeta");
  const feedback = functionBody("renderLatestFeedback", "publicActionState");
  assert.match(resultRows, /feedback\.actorId === ownId/);
  assert.match(resultRows, /feedbackTargets\(feedback\)\.includes\(ownId\)[\s\S]*\[ownId\]/);
  assert.match(feedback, /resolution-player-results/);
  assert.match(feedback, /各防守方结果按你的查看权限展示/);
  assert.match(app, /privateResultsByDefender\?\.\[playerId\]/);
  assert.match(app, /cellResultsByDefender\?\.\[playerId\]/);
});

test("战斗日志保持一次行动记录并用可展开明细列出各方结算", () => {
  const log = functionBody("renderCombatEventList", "privateIntelligenceLabel");
  assert.match(log, /event-defender-details/);
  assert.match(log, /展开各方结算/);
  assert.match(log, /本条仅代表一次行动，不重复扣除资源或行动方自损/);
  assert.match(css, /\.event-defender-details summary/);
});

test("淘汰地图保留为只读历史且新行动自动聚焦存活敌方", () => {
  const selectAction = functionBody("selectAction", "handleEnemyCell");
  const enemyCard = functionBody("renderEnemyMapCard", "renderOwnMapCard");
  assert.match(selectAction, /activeBattleOpponentIds\(state\.room\)/);
  assert.match(selectAction, /activeTargets\.includes\(state\.battle\.targetPlayerId\)/);
  assert.match(enemyCard, /battle-map-card--eliminated/);
  assert.match(enemyCard, /已淘汰 · 历史只读/);
  assert.match(app, /另一敌方已淘汰，不再同步结算/);
});

test("三人结算动画固定在到达时正在查看的地图，其他地图仅保留静态结果", () => {
  const accept = functionBody("acceptRoomState", "getOwnSeat");
  const effect = functionBody("battleEffectModel", "battleEffectAssets");
  const board = functionBody("renderEnemyBoard", "unitStateCode");
  assert.match(accept, /resolutionEffectMapId = viewedEnemyId/);
  assert.match(effect, /room\.maxPlayers === 3 && state\.battle\.resolutionEffectMapId !== mapId/);
  assert.match(board, /board-cell--latest-result/);
  assert.match(css, /\.board-cell--latest-result/);
});

test("断线提示说明具体玩家与冻结倒计时，移动端结果布局不产生横向扩张", () => {
  const overlay = functionBody("renderBlockingOverlay", "pushDeploymentHistory");
  assert.match(overlay, /离线，行动计时已冻结/);
  assert.match(overlay, /重连后从此处继续/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.resolution-player-results[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.battle-map-tab__identity[\s\S]*min-width:\s*0/);
});
