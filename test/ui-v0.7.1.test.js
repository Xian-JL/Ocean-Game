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

test("v0.7.1 部署页使用进度驱动的现代三栏工作区", () => {
  includesAll(app, [
    "deployment-page--v071",
    "deployment-progress-strip",
    "deployment-layout--v071",
    "fleet-inventory--grouped",
    'key: "surface"',
    'key: "underwater"',
    'key: "decoy"',
    "deployment-toolbar--v071",
  ]);
});

test("v0.7.1 部署地图提供纯 UI 最小化能力且不触碰部署数据", () => {
  includesAll(app, [
    'data-action="toggle-deployment-map"',
    "state.deployment.mapCollapsed = !state.deployment.mapCollapsed",
    "collapsible-map--collapsed",
    "collapsed-map-summary",
  ]);
  assert.equal(app.includes("deployment:collapse"), false);
});

test("v0.7.1 减少部署页常驻说明并保留帮助入口", () => {
  includesAll(app, [
    'data-action="open-rules"',
    'data-tooltip="部署规则"',
    "点击放置 · R 旋转 · 可拖动已放置单位",
  ]);
  assert.equal(app.includes('<strong>部署约束</strong>'), false);
});

test("v0.7.1 移动端优先地图并提供可触控部署布局", () => {
  includesAll(css, [
    ".deployment-layout--v071 .deployment-map-card",
    "order: 1",
    ".fleet-group__items",
    ".deployment-toolbar__actions",
    "env(safe-area-inset-bottom)",
  ]);
});
