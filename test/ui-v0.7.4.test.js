"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");

function includesAll(source, values) {
  for (const value of values) assert.equal(source.includes(value), true, `缺少：${value}`);
}

test("v0.7.4 战场动态分为战况、私人情报和系统三个频道", () => {
  includesAll(app, [
    'eventChannel: "combat"',
    'data-channel="combat"',
    'data-channel="private"',
    'data-channel="system"',
    "renderCombatEventList(room)",
    "renderPrivateEventList(room)",
    "renderSystemEventList(room)",
  ]);
  includesAll(css, [".event-center--v074", ".event-tabs", ".event-list--private"]);
});

test("v0.7.4 最近结算区分命中、未命中、未知结果和私人情报", () => {
  includesAll(app, [
    "function resolutionVisualState(room)",
    'return "unknown"',
    'return "private"',
    'return "hit"',
    'return "miss"',
    'data-feedback-state="${visualState}"',
  ]);
  includesAll(css, [
    ".resolution-strip--hit",
    ".resolution-strip--miss",
    ".resolution-strip--unknown",
    ".resolution-strip--private",
  ]);
});

test("v0.7.4 私人情报只读取安全视图 intelligenceAreas 与本机标记", () => {
  includesAll(app, [
    "room.battle?.own?.intelligenceAreas",
    "privateIntelligenceLabel(area)",
    'data-action="select-intelligence"',
    "state.battle.markers?.size",
  ]);
  assert.equal(app.includes("battleState.actionLog"), false);
});

test("v0.7.4 玩家状态显式区分行动中、离线与已淘汰", () => {
  includesAll(app, [
    'playerState = eliminated ? "eliminated"',
    'seat.playerId === current ? "active"',
    'data-player-state="${playerState}"',
    'const stateText = eliminated ? "已淘汰"',
  ]);
  includesAll(css, [
    '[data-player-state="active"]',
    '[data-player-state="offline"]',
    '[data-player-state="eliminated"]',
  ]);
});

test("v0.7.4 断线重连与 Toast 使用现代非阻断状态反馈", () => {
  includesAll(app, [
    "pause-card--connection",
    "connection-status-chip",
    "正在重新连接",
    "对局已暂停",
    "连接已恢复，对局继续。",
    "toastPresentation(kind)",
    "toast__icon",
    "toast__content",
  ]);
  includesAll(css, [".pause-card--connection", ".connection-status-chip", ".toast__icon", ".toast__content"]);
});
