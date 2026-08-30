"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("v1.4 战斗地图使用真实海面并保留原坐标按钮", () => {
  const app = read("public/js/app.js");
  const css = read("public/css/main.css");
  const html = read("public/index.html");
  const oceanAsset = path.join(
    ROOT,
    "public/assets/images/battle/tactical-ocean-v1.4.webp",
  );

  assert.equal(fs.existsSync(oceanAsset), true);
  assert.ok(fs.statSync(oceanAsset).size > 50_000);
  assert.match(html, /tactical-ocean-v1\.4\.webp/);
  assert.match(css, /tactical-ocean-v1\.4\.webp/);
  assert.match(app, /data-action="enemy-cell"/);
  assert.match(app, /data-coordinate/);
  assert.match(app, /board-frame--tactical-sea/);
  assert.match(app, /tactical-coordinate-badge/);
  assert.match(app, /tactical-map-readout/);
});

test("隐形网格在悬停或键盘聚焦时显示准线、坐标和局部 5×5 网格", () => {
  const app = read("public/js/app.js");
  const css = read("public/css/main.css");

  assert.match(app, /function updateTacticalHover/);
  assert.match(app, /function clearTacticalHover/);
  assert.match(app, /Math\.abs\(candidatePoint\.row - point\.row\) <= 2/);
  assert.match(app, /Math\.abs\(candidatePoint\.column - point\.column\) <= 2/);
  assert.match(app, /board-axis--active/);
  assert.match(app, /data-tactical-coordinate/);
  assert.match(css, /\.tactical-crosshair::before/);
  assert.match(css, /\.tactical-crosshair::after/);
  assert.match(css, /\.board-cell--tactical-near/);
  assert.match(css, /\.board-cell--tactical-hover/);
});

test("行动范围、五种私人标记与三种地图尺寸继续复用原逻辑", () => {
  const app = read("public/js/app.js");
  const css = read("public/css/main.css");

  for (const marker of [
    "occupied",
    "surface_yes",
    "surface_no",
    "underwater_yes",
    "underwater_no",
  ]) {
    assert.equal(app.includes(marker), true, `缺少私人标记：${marker}`);
  }
  assert.match(app, /legalTargetCells/);
  assert.match(app, /Data\.previewCells/);
  assert.match(app, /isSimultaneousThreePlayerSelection/);
  for (const size of [10, 12, 15]) {
    assert.match(css, new RegExp(`data-board-size="${size}"`));
  }
});

test("三套主题、手机端、减少动画与高对比度均覆盖战术海面", () => {
  const css = read("public/css/main.css");

  assert.match(css, /data-theme="ocean-light"[^}]*battle-page--v14/);
  assert.match(css, /data-theme="ocean-dusk"[^}]*battle-page--v14/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*battle-page--v14/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*board-frame--tactical-sea/);
  assert.match(css, /forced-colors: active[\s\S]*board-frame--tactical-sea/);
});

test("正式对战使用单一近全屏主地图和互斥战术侧栏", () => {
  const app = read("public/js/app.js");
  const css = read("public/css/main.css");

  assert.match(app, /battle-page--immersive/);
  assert.match(app, /function renderBattleSideDock/);
  assert.match(app, /data-action="toggle-action-drawer"/);
  assert.match(app, /data-action="toggle-log"/);
  assert.match(app, /data-action="close-battle-drawers"/);
  assert.match(app, /if \(opening\) state\.battle\.logOpen = false/);
  assert.match(app, /if \(opening\) state\.battle\.actionDrawerOpen = false/);
  assert.match(css, /\.battle-page--immersive \.battle-map-card\s*\{[^}]*display: none !important/);
  assert.match(css, /\.battle-page--immersive \.battle-map-card\.is-mobile-active\s*\{[^}]*display: block !important/);
  assert.match(css, /\.battle-side-dock\s*\{/);
  assert.match(css, /\.battle-page--immersive \.action-rail--v073,[\s\S]*\.event-center--v074/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*position: fixed/);
});
