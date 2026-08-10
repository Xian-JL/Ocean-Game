"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");

function includesAll(source, values) {
  for (const value of values) {
    assert.equal(source.includes(value), true, `缺少：${value}`);
  }
}

test("v0.7.2 对战页使用己方 + 独立敌方多地图工作区", () => {
  includesAll(app, [
    "battle-page--v072",
    "battle-maps--v072",
    "renderOwnMapCard(room)",
    "renderEnemyMapCard(room, playerId)",
    "ownBattle.enemyMapsByPlayer?.[targetPlayerId]",
    'data-player-id="${escapeHtml(playerId)}"',
  ]);
  includesAll(css, [
    '.battle-maps--v072[data-map-count="2"]',
    "grid-template-columns: repeat(3, minmax(0, 1fr))",
    ".battle-map-card--v072.battle-map-card--targeted",
  ]);
});

test("v0.7.2 三人回合明确显示 0/2、1/2、2/2 目标进度", () => {
  includesAll(app, [
    "battle-turn-progress",
    "battle-target-progress",
    "completedTargetPlayerIds",
    "remainingTargetPlayerIds",
    "requiredTargetPlayerIds",
    "已完成",
    "待操作",
  ]);
});

test("v0.7.2 三张地图可以纯前端独立最小化且至少保留一张展开", () => {
  includesAll(app, [
    "collapsedMaps: {}",
    'data-action="toggle-battle-map"',
    "state.battle.collapsedMaps[mapId]",
    "expandedCount <= 1",
    "至少保留一张地图展开。",
    "battle-map-collapsed-summary",
  ]);
  assert.equal(app.includes("battle:collapse"), false);
  assert.equal(app.includes("map:collapse"), false);
});

test("v0.7.2 普通行动绑定被点击敌方地图，直升机仍保持多目标预览", () => {
  includesAll(app, [
    '"data-target-player-id": targetPlayerId',
    "handleEnemyCell(control.dataset.coordinate, control.dataset.targetPlayerId)",
    "isGlobalHelicopterSelection",
    "selectedForThisMap || globalHelicopter",
    "state.battle.targetPlayerId = targetPlayerId",
  ]);
});

test("v0.7.2 平板和手机使用己方及每名敌方的独立地图 Tab", () => {
  includesAll(app, [
    "renderBattleMapTabs(room)",
    '{ id: "own", label: "己方" }',
    "...opponents.map((playerId)",
    'data-tab-count="${tabs.length}"',
  ]);
  includesAll(css, [
    '.mobile-map-tabs--v072[data-tab-count="2"]',
    '.mobile-map-tabs--v072[data-tab-count="3"]',
    ".battle-map-card--v072.is-mobile-active",
  ]);
});
