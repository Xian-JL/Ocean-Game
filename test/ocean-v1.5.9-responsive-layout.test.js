"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

test("v1.5.9 发布元数据、缓存标识与页面类一致", () => {
  assert.equal(require("../package.json").version, "1.6.0");
  assert.equal(require("../public/js/game-data").RELEASE.stage, "Ocean-v1.6.0");
  assert.match(html, /main\.css\?v=1\.6\.0/);
  assert.match(html, /app\.js\?v=1\.6\.0/);
  assert.match(app, /battle-page--v159/);
});

test("主流手机与大型竖屏平板使用同一单地图底部指挥模式", () => {
  assert.match(css, /@media \(max-width: 700px\), \(min-width: 701px\) and \(max-width: 1000px\) and \(orientation: portrait\)/);
  assert.match(css, /\.battle-page--v159 \.battle-side-dock[\s\S]*grid-template-columns:\s*repeat\(4/);
  assert.match(css, /\.battle-page--v159 \.battle-layout--v072[\s\S]*display:\s*block/);
});

test("15乘15地图保持42像素格并只在地图框内部平移", () => {
  assert.match(css, /data-map-size="15"[\s\S]*--cell-size:\s*42px/);
  assert.match(css, /\.battle-page--v159 \.board-frame--tactical-sea[\s\S]*overflow:\s*auto/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(css, /touch-action:\s*pan-x pan-y/);
});

test("移动端当前行动与目标常驻且可回到目标和确认", () => {
  assert.match(app, /function renderMobileCommandPeek/);
  assert.match(app, /data-action="focus-selected-target"/);
  assert.match(app, /data-action="reopen-action-confirm"/);
  assert.match(app, /frame\.scrollTo\(\{ left, top, behavior:/);
});

test("行动与日志抽屉互斥并通过遮罩阻止误触地图", () => {
  assert.match(app, /if \(opening\) state\.battle\.logOpen = false/);
  assert.match(app, /if \(opening\) state\.battle\.actionDrawerOpen = false/);
  assert.match(css, /\.battle-page--v159 \.battle-drawer-scrim[\s\S]*z-index:\s*105/);
  assert.match(css, /\.battle-page--v159 \.action-rail--v073[\s\S]*z-index:\s*110/);
});

test("移动端触控按钮和安全区满足手持设备操作", () => {
  assert.match(css, /\.battle-page--v159 \.marker-toggle[\s\S]*min-height:\s*44px/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-x:\s*clip/);
});

test("大型竖屏平板限制抽屉宽度并扩大地图纵向空间", () => {
  assert.match(css, /@media \(min-width: 701px\) and \(max-width: 1000px\) and \(orientation: portrait\)/);
  assert.match(css, /width:\s*min\(760px, calc\(100% - 24px\)\)/);
  assert.match(css, /height:\s*clamp\(600px, 68dvh, 820px\)/);
});

test("平板横屏保留中央沙盘与右侧行动面板", () => {
  assert.match(css, /@media \(min-width: 1001px\) and \(max-width: 1280px\) and \(orientation: landscape\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\) clamp\(270px, 26vw, 318px\)/);
  assert.match(css, /\.battle-page--v159 \.bridge-command-deck[\s\S]*min-height:\s*92px/);
});

test("电脑断点保持v1.5.8驾驶舱并支持减少动态效果", () => {
  assert.match(css, /@media \(min-width: 1281px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.battle-page--v159/);
  assert.match(app, /battle-page--v158 battle-page--v159/);
});
