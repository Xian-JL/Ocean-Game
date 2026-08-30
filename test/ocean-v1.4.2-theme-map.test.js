"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

test("v1.4.2 极地寒光为入口、部署和战斗组件提供完整浅色表面", () => {
  assert.match(css, /Ocean-v1\.4\.2 · complete theme compatibility/);
  assert.match(css, /html\[data-theme="ocean-light"\][\s\S]*--theme-control-bg:/);
  for (const selector of [
    ".field input",
    ".mode-switch",
    ".map-size-switch",
    ".deployment-panel",
    ".deployment-map-card",
    ".fleet-item",
    ".marker-palette",
    ".resolution-strip--v074",
    ".action-rail--v073",
    ".event-center--v074",
  ]) {
    assert.equal(css.includes(selector), true, `缺少主题适配组件：${selector}`);
  }
  assert.match(css, /deployment-page--v071 :where\(\.board-cell, \.board-axis, \.board-corner\)/);
});

test("v1.4.2 黄昏余晖复用同一组件体系且激活态不再残留深海蓝", () => {
  assert.match(css, /html\[data-theme="ocean-dusk"\][\s\S]*--theme-control-selected:/);
  assert.match(css, /mode-switch__option\.is-active/);
  assert.match(css, /map-size-switch__option\.is-active/);
  assert.match(css, /background: var\(--theme-control-selected\) !important/);
});

test("桌面对战海面严格收束为随视口放大的方形坐标盘", () => {
  const finalOverrides = css.slice(css.lastIndexOf("Ocean-v1.4.2 · final immersive-layout overrides"));
  assert.match(finalOverrides, /@media \(min-width: 901px\)/);
  assert.match(finalOverrides, /width: min\(100%, clamp\(440px, calc\(100dvh - 250px\), 980px\)\)/);
  assert.match(finalOverrides, /\.board-frame--tactical-sea \.ocean-board\s*\{[\s\S]*aspect-ratio: 1/);
  assert.match(finalOverrides, /grid-template-columns: 26px repeat\(var\(--board-size\), minmax\(0, 1fr\)\)/);
  assert.match(finalOverrides, /grid-template-rows: 26px repeat\(var\(--board-size\), minmax\(0, 1fr\)\)/);
  assert.match(finalOverrides, /tactical-ocean-v1\.4\.webp/);
});

test("手机地图尺寸、强制高对比和 v1.4.2 缓存版本继续有效", () => {
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*--cell-size: 42px/);
  assert.match(css, /forced-colors: active[\s\S]*board-frame--tactical-sea/);
  assert.match(html, /\/css\/main\.css\?v=1\.4\.2/);
  for (const size of [10, 12, 15]) {
    assert.match(css, new RegExp(`data-map-size="${size}"`));
  }
});
