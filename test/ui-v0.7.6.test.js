"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const gateway = fs.readFileSync(path.join(ROOT, "server/socket/game-gateway.js"), "utf8");
const protocol = require("../server/socket/protocol");

function includesAll(source, values) {
  for (const value of values) {
    assert.equal(source.includes(value), true, `缺少：${value}`);
  }
}

test("v0.7.6 开局掷骰由每名玩家主动触发且结果仍由服务器生成", () => {
  assert.equal(protocol.CLIENT_EVENTS.ROLL_DIE, "match:roll-die");
  assert.equal(protocol.SOCKET_PROTOCOL_VERSION, "2.0");
  includesAll(app, [
    'data-action="roll-die"',
    'emitRequest("match:roll-die"',
    'state.pendingRequest = "roll-die"',
    "每位玩家亲自掷骰，点数仍由服务器生成",
    "每位玩家每轮只能投掷一次",
  ]);
});

test("v0.7.6 先手结果在原阶段停留时间基础上额外展示 3 秒", () => {
  includesAll(gateway, [
    "DEFAULT_ROLL_RESULT_EXTRA_PRESENTATION_MS = 3_000",
    "this.phasePresentationMs + this.rollResultExtraPresentationMs",
  ]);
  assert.match(app, /结果将额外停留 3 秒后进入正式对战/);
});

test("v0.7.6 对战右栏按兵种融合单位状态、HP、资源和行动入口", () => {
  includesAll(app, [
    "function renderUnitActionDeck(room, ownBattle)",
    "unit-action-deck--v076",
    "unit-action-card__header",
    "unit-action-card__resources",
    "unit-action-card__actions",
    "sourceUnitState(units, definition)",
    "renderActionCard(room, action)",
    "hp-track--compact",
    "诱饵鱼雷",
  ]);
  includesAll(css, [
    ".unit-action-deck--v076",
    ".unit-action-card__header",
    ".unit-action-card__actions",
    ".unit-instance-row",
    ".battle-layout--v076",
  ]);
});

test("v0.7.6 两艘摩托艇继续作为两个实例显示而不改变行动规则", () => {
  includesAll(app, [
    "units.length > 1",
    "艇 ${index + 1}",
    'data-unit-state="${unitStateCode(unit, definition)}"',
  ]);
});
