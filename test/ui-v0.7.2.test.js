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

test("v1.2.6 三人回合明确显示一次行动同步两名目标", () => {
  includesAll(app, [
    "battle-turn-progress",
    "battle-target-progress",
    "remainingTargetPlayerIds",
    "requiredTargetPlayerIds",
    "一次行动",
    "同步 ×",
    "同步生效",
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

test("v1.2.6 三人任意行动绑定点击坐标并在两张敌方地图同步预览", () => {
  includesAll(app, [
    '"data-target-player-id": targetPlayerId',
    "handleEnemyCell(control.dataset.coordinate, control.dataset.targetPlayerId)",
    "isSimultaneousThreePlayerSelection",
    "selectedForThisMap || simultaneousAction",
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
