"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");

test("v1.2.6 每张敌方地图上方提供五类本机私人标记工具", () => {
  for (const value of [
    "occupied",
    "surface_yes",
    "surface_no",
    "underwater_yes",
    "underwater_no",
  ]) {
    assert.match(app, new RegExp(`value: "${value}"`));
    assert.match(app, new RegExp(`marker-tool__swatch--\\$\\{marker\\.value\\}`));
  }
  assert.match(app, /function renderMarkerPalette\(playerId\)/);
  assert.match(app, /选择类型后左键添加；右键已标记格删除/);
  assert.match(app, /data-action="select-marker-tool"/);
});

test("v1.2.6 左键按所选类型写入标记，右键只删除本机自定义标记", () => {
  assert.match(app, /state\.battle\.markers\.set\(coordinate, state\.battle\.selectedMarker\)/);
  assert.match(app, /document\.addEventListener\("contextmenu"/);
  assert.match(app, /control\.dataset\.cellState !== "private-marker"/);
  assert.match(app, /markersForTarget\(targetPlayerId\)\.has\(coordinate\)/);
  assert.match(app, /state\.battle\.markers\.delete\(coordinate\)/);
  assert.match(app, /const marker = !resolved \? targetMarkers\.get\(coordinate\) : null/);
  assert.match(app, /MARKER_STORAGE_PREFIX = "ocean\.private-markers\.v2"/);
  assert.match(app, /roomCode, playerId, targetPlayerId/);
});

test("v1.2.6 战斗地图按三人 0.85、15×15 0.9，并在条件叠加时缩放为 0.765", () => {
  assert.match(app, /data-player-count="\$\{room\.maxPlayers\}"/);
  assert.match(app, /data-map-size="\$\{room\.mapSize\}"/);
  assert.match(css, /\.battle-page\[data-player-count="3"\][\s\S]*?zoom:\s*0\.85/);
  assert.match(css, /\.ocean-board\[data-board-size="15"\][\s\S]*?zoom:\s*0\.9/);
  assert.match(css, /\.battle-page\[data-player-count="3"\]\[data-map-size="15"\][\s\S]*?zoom:\s*0\.765/);
});

test("v1.2.6 三人行动在两张敌图同步预览，并明确资源与自损仅结算一次", () => {
  assert.match(app, /function isSimultaneousThreePlayerSelection/);
  assert.match(app, /两张敌方地图同步预览/);
  assert.match(app, /资源与自损只结算 1 次/);
  assert.match(app, /行动资源以及行动方可能产生的自损只结算一次/);
});
