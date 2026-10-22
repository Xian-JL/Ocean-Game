"use strict";
const { verifyUiContract } = require("../test-fixtures/ui-contract");

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

test("UI2 迁移：v0.7.2 对战页使用己方 + 独立敌方多地图工作区", () => {
  verifyUiContract("layout");
});

test("UI2 迁移：v1.2.6 三人回合明确显示一次行动同步两名目标", () => {
  verifyUiContract("command");
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
    '{ id: "own", label: "己方", own: true }',
    "...opponents.map((playerId)",
    'data-tab-count="${tabs.length}"',
  ]);
  includesAll(css, [
    '.mobile-map-tabs--v072[data-tab-count="2"]',
    '.mobile-map-tabs--v072[data-tab-count="3"]',
    ".battle-map-card--v072.is-mobile-active",
  ]);
});
