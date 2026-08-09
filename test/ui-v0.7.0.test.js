"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");

function includesAll(source, values) {
  for (const value of values) {
    assert.equal(source.includes(value), true, `缺少：${value}`);
  }
}

test("v0.7.0 建立统一设计变量与现代应用组件状态", () => {
  includesAll(css, [
    "--color-bg",
    "--color-surface",
    "--space-8",
    "--duration-normal",
    ".button-spinner",
    "[data-tooltip]",
    ".toast-region",
  ]);
});

test("v0.7.0 首页使用 2/3 人分段选择，并保持既有创建/加入表单协议", () => {
  includesAll(app, [
    'class="mode-switch"',
    'data-action="select-mode"',
    'data-max-players="2"',
    'data-max-players="3"',
    'id="create-form"',
    'id="join-form"',
    'id="nickname-input"',
    'id="room-code-input"',
  ]);
  assert.match(app, /state\.entry\.maxPlayers = Number\(control\.dataset\.maxPlayers\) === 3 \? 3 : 2/);
});

test("v0.7.0 等待房间以房间码和多人席位为核心，不再依赖大雷达说明区", () => {
  includesAll(app, [
    "lobby-room-card",
    "lobby-room-code",
    "waiting-panel--v07",
    "renderSeats(room)",
    "复制房间码",
    "分享邀请",
  ]);
  assert.equal(app.includes('class="waiting-radar"'), false);
});

test("v0.7.0 游戏说明准确保留 v0.6.2 三人玩法边界", () => {
  includesAll(html, [
    "分别对另外两名仍在局敌人各完成一次合法操作",
    "独立敌方地图",
    "直升机例外",
    "终局鱼雷例外",
    "减少动画",
  ]);
});
