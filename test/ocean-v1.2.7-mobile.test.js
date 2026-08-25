"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const mobileCss = css.slice(css.indexOf("Ocean-v1.2.7 · phone-first UI adaptation"));

test("v1.2.7 手机视口支持刘海安全区和软键盘动态视口", () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /interactive-widget=resizes-content/);
  assert.match(mobileCss, /min-height:\s*100dvh/);
  assert.match(mobileCss, /env\(safe-area-inset-top\)/);
  assert.match(mobileCss, /env\(safe-area-inset-bottom\)/);
});

test("v1.2.7 手机地图保持 42px 触控格且不叠加桌面缩放", () => {
  assert.match(mobileCss, /--cell-size:\s*42px/);
  assert.match(mobileCss, /\.board-cell\s*\{[\s\S]*?min-width:\s*42px;[\s\S]*?min-height:\s*42px;/);
  assert.match(mobileCss, /\.ocean-board\[data-board-size="15"\][\s\S]*?zoom:\s*1;/);
  assert.match(mobileCss, /左右滑动查看完整海域/);
});

test("v1.2.7 手机战斗状态栏、地图标签和行动抽屉不会互相遮挡", () => {
  assert.match(mobileCss, /\.battle-header,[\s\S]*?position:\s*relative;[\s\S]*?top:\s*auto;/);
  assert.match(mobileCss, /\.mobile-map-tabs,[\s\S]*?position:\s*sticky;[\s\S]*?z-index:\s*45;/);
  assert.match(mobileCss, /\.action-rail,[\s\S]*?position:\s*sticky;[\s\S]*?bottom:\s*max\(6px, env\(safe-area-inset-bottom\)\)/);
  assert.match(mobileCss, /max-height:\s*min\(64dvh, 560px\)/);
});

test("v1.2.7 手机标记工具可横向滑动并支持安全长按删除", () => {
  assert.match(mobileCss, /\.marker-palette__tools\s*\{[\s\S]*?overflow-x:\s*auto;/);
  assert.match(app, /手机长按删除/);
  assert.match(app, /document\.addEventListener\("pointerdown"/);
  assert.match(app, /Math\.hypot\([\s\S]*?> 10/);
  assert.match(app, /\}, 550\);/);
  assert.match(app, /suppressEnemyCellClickUntil = Date\.now\(\) \+ 800/);
  assert.match(app, /function removePrivateMarker\(control\)/);
});

test("v1.2.7 手机 Toast、底部弹层与横屏模式受视口约束", () => {
  assert.match(mobileCss, /\.toast-region\s*\{[\s\S]*?right:\s*max\(8px,[\s\S]*?left:\s*max\(8px/);
  assert.match(mobileCss, /dialog\.modal\s*\{[\s\S]*?inset:\s*auto 0 0;[\s\S]*?max-height:\s*min\(88dvh, 760px\)/);
  assert.match(mobileCss, /max-height:\s*520px\) and \(orientation:\s*landscape\)/);
});

