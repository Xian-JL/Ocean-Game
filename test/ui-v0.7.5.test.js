"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const sprite = fs.readFileSync(path.join(ROOT, "public/assets/icons/ocean-ui.svg"), "utf8");

function includesAll(source, values) {
  for (const value of values) assert.equal(source.includes(value), true, `缺少：${value}`);
}

test("v0.7.5 FINAL_SALVO 使用独立阶段 UI 且普通行动面板不参与终局选择", () => {
  includesAll(app, [
    "function renderFinalSalvoStage(room, finalSalvoState, availableFinalDecoys)",
    "final-salvo-stage--v075",
    "salvo-decoy-grid",
    "salvo-submit-panel",
    'data-action="submit-final-salvo"',
    '${finalSalvo ? "" : renderActionPanel(room)}',
  ]);
  includesAll(css, [
    ".final-salvo-stage--v075",
    ".salvo-decoy-card",
    ".salvo-player-status",
    ".battle-layout--final",
  ]);
});

test("v0.7.5 最终齐射仅展示己方秘密选择与其他玩家提交状态，不暴露对方鱼雷坐标", () => {
  includesAll(app, [
    "finalSalvoState.ownSelectedDecoyId",
    "finalSalvoState.submittedPlayerIds",
    "其他玩家的具体鱼雷坐标始终保密",
    "其他所有仍在局玩家",
    "已秘密提交",
  ]);
  assert.equal(app.includes("opponentSelectedDecoyId"), false);
  assert.equal(app.includes("selectionsByPlayer"), false);
});

test("v0.7.5 结算页按结果、玩家状态、再来一局和复盘重新分层", () => {
  includesAll(app, [
    "finished-page--v075",
    "result-hero--v075",
    "renderResultPlayers(room, result, replay)",
    "renderRematchPanel(room)",
    "rematch-player-grid",
    'data-action="focus-replay"',
    'id="match-replay"',
  ]);
  includesAll(css, [
    ".result-player-grid",
    ".result-player-card--winner",
    ".rematch-panel--v075",
    ".rematch-player-grid",
  ]);
});

test("v0.7.5 本地 SVG sprite 覆盖舰船、十项行动和主要状态且正式 UI 已接入", () => {
  includesAll(sprite, [
    'id="ship-destroyer-i"',
    'id="ship-destroyer-ii"',
    'id="ship-submarine"',
    'id="ship-nuclear-submarine"',
    'id="ship-pirate"',
    'id="ship-motorboat"',
    'id="ship-aircraft-carrier"',
    'id="ship-decoy"',
    'id="action-destroyer-i"',
    'id="action-destroyer-ii"',
    'id="action-pirate"',
    'id="action-motorboat"',
    'id="action-missile"',
    'id="action-nuclear"',
    'id="action-shock"',
    'id="action-detection"',
    'id="action-radar"',
    'id="action-helicopter"',
    'id="status-final-salvo"',
    'id="status-rematch"',
  ]);
  includesAll(app, [
    "function uiIcon(name, className = \"\")",
    "/assets/icons/ocean-ui.svg#",
    "unitIconName(unit.type)",
    "uiIcon(meta.icon)",
  ]);
});

test("v0.7.5 完成窄屏、高对比度和强制颜色模式收尾", () => {
  includesAll(css, [
    "@media (max-width: 1080px)",
    "@media (max-width: 700px)",
    "@media (max-width: 460px)",
    "@media (prefers-contrast: more)",
    "@media (forced-colors: active)",
    ".replay-layout--v075:focus-visible",
  ]);
});
