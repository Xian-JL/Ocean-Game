"use strict";
const { verifyUiContract } = require("../test-fixtures/ui-contract");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

test("桌面地图切换条固定在回合状态栏下方且不会被遮挡", () => {
  const start = css.lastIndexOf("Ocean-v1.4.2.2 · keep desktop map tabs");
  const fixes = css.slice(start, css.indexOf("Ocean-v1.5 · carrier command bridge", start));
  assert.match(fixes, /@media \(min-width: 901px\)/);
  assert.match(fixes, /\.mobile-map-tabs,[\s\S]*\.mobile-map-tabs--v072[\s\S]*position: sticky/);
  assert.match(fixes, /z-index: 39/);
  assert.match(fixes, /top: 168px/);
});

test("战斗外框使用 clip 裁切，不再建立会破坏 sticky 的滚动容器", () => {
  const start = css.lastIndexOf("Ocean-v1.4.2.2 · keep desktop map tabs");
  const fixes = css.slice(start, css.indexOf("Ocean-v1.5 · carrier command bridge", start));
  assert.match(fixes, /\.battle-page--immersive\s*\{[\s\S]*overflow: clip/);
  assert.doesNotMatch(fixes, /overflow: hidden/);
});

test("UI2 迁移：v1.5 缓存版本生效且手机底部抽屉规则保持原样", () => {
  verifyUiContract("version");
});
