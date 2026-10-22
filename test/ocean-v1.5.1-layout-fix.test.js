"use strict";
const { verifyUiContract } = require("../test-fixtures/ui-contract");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
const packageJson = require(path.join(ROOT, "package.json"));
const v151 = css.slice(css.lastIndexOf("Ocean-v1.5.1 · viewport-fit map"), css.indexOf("/* Ocean-v1.5.2 ·"));

test("UI2 迁移：v1.5.1 使用剩余高度约束整张战术海图", () => {
  verifyUiContract("layout");
});

test("地图标签、侧栏与底部控制恢复经典按键语言，行动面板保持 v1.5", () => {
  assert.match(v151, /\.mobile-map-tabs button[\s\S]*border-radius:\s*9px[\s\S]*font-family:\s*inherit/);
  assert.match(v151, /\.battle-side-dock button[\s\S]*border-radius:\s*10px[\s\S]*font-family:\s*inherit/);
  assert.match(v151, /\.bridge-console-group button[\s\S]*border:\s*1px solid var\(--line\)[\s\S]*border-radius:\s*10px/);
  assert.match(v151, /\.bridge-confirm-button[\s\S]*linear-gradient\(135deg, #2ed2ef, #149aba\)/);
  assert.doesNotMatch(v151, /\.action-rail--v073\s*\{/);
});

test("UI2 迁移：v1.5.1 布局修复在 v1.6.1 中继续保留", () => {
  verifyUiContract("layout");
});
