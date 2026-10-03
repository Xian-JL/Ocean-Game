"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const Data = require("../public/js/game-data");

const ROOT = path.resolve(__dirname, "..");

test("首页房间码隐藏时不保留空胶囊占位", () => {
  const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
  const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
  assert.match(html, /id="header-room-code"[^>]*hidden/);
  assert.match(css, /\.header-room\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test("相同舰种的多实例读屏名称能区分摩托艇编号", () => {
  const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
  const motorboats = Data.UNIT_DEFINITIONS.filter((unit) => unit.type === Data.UNIT_TYPES.MOTORBOAT);
  assert.deepEqual(motorboats.map((unit) => unit.name), ["摩托艇 1", "摩托艇 2"]);
  assert.match(app, /getUnitDefinitionById\(unit\.id\)\s*\?\?\s*Data\.getUnitDefinitionByType\(unit\.type\)/);
});

test("手机顶栏隐藏状态文字时仍保留连接状态圆点", () => {
  const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
  assert.match(css, /\.connection-pill #connection-text\s*,/);
  assert.doesNotMatch(css, /\.connection-pill span\s*,\s*\.global-header__tools > \.button\s*\{\s*display:\s*none/);
});

test("两艘摩托艇共享行动卡时名称以数量汇总", () => {
  const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
  assert.match(app, /const sourceLabel = units\.length > 1\s*\? definition\.name\.replace\(\/\\s\+\\d\+\$\/, ""\)/);
  assert.match(app, /escapeHtml\(sourceLabel\).*units\.length > 1 \? ` ×\$\{units\.length\}`/);
});
