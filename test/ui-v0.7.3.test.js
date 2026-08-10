"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const model = fs.readFileSync(path.join(ROOT, "public/js/ui-model.js"), "utf8");

function includesAll(source, values) {
  for (const value of values) {
    assert.equal(source.includes(value), true, `缺少：${value}`);
  }
}

test("v0.7.3 行动面板按舰艇攻击、潜航武器、舰载系统分组且保留全部行动入口", () => {
  includesAll(app, [
    "action-list--v073",
    'label: "舰艇攻击"',
    'label: "潜航武器"',
    'label: "舰载系统"',
    "renderActionCard(room, definition)",
    "Data.ACTION_DEFINITIONS.filter",
  ]);
  includesAll(css, [
    ".action-group__grid",
    ".action-card--v073",
    ".action-card__meta",
  ]);
});

test("v0.7.3 首次行动使用独立雷达任务卡且普通确认框不再堆叠完整规则说明", () => {
  includesAll(app, [
    "function openingRadarRequired(room)",
    "opening-radar-task",
    "首次行动",
    "开始扫描",
  ]);
  const confirmation = app.slice(
    app.indexOf("function openActionConfirmation()"),
    app.indexOf("async function submitSelectedAction()"),
  );
  assert.equal(confirmation.includes("definition.warning"), false);
});

test("v0.7.3 直升机双目标状态拥有明确多目标提示和两张地图同步范围图例", () => {
  includesAll(app, [
    "multi-target-action--v073",
    "同时作用",
    "消耗 1 次",
    "renderRangeLegend(room, playerId)",
    "双目标同步预览",
    "isGlobalHelicopterSelection(room)",
  ]);
  includesAll(css, [
    ".multi-target-action--v073",
    ".range-legend--v073",
  ]);
});

test("v0.7.3 地图格统一暴露公开结果、未知结果、私人标记与范围状态", () => {
  includesAll(app, [
    'cellState = "public-hit"',
    'cellState = "public-miss"',
    'cellState = "fired-unknown"',
    'cellState = "private-marker"',
    '"data-cell-state": cellState',
    '"data-range-state": rangeState',
    '"data-intel-state"',
  ]);
  includesAll(css, [
    '[data-cell-state="public-hit"]',
    '[data-cell-state="fired-unknown"]',
    '[data-range-state="selected"]',
  ]);
});

test("v0.7.3 己方舰队面板直接展示 HP 状态条、瘫痪沉没状态和剩余特殊资源", () => {
  includesAll(app, [
    "fleet-status-panel--v073",
    "unit-status-list--v073",
    "unitResourceBadges(ownBattle, unit)",
    "hp-track",
    'data-unit-state="${stateCode}"',
  ]);
  includesAll(css, [
    ".fleet-status-panel--v073",
    ".unit-resource-badge",
    ".hp-track",
    ".unit-status--paralyzed",
    ".unit-status--sunk",
  ]);
  assert.match(model, /unit\.type === actionDefinition\.sourceType && unit\.hp > 0/);
});
