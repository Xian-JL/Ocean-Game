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

test("UI2 迁移：v1.5 正式战斗页具有概念图对应的五区舰桥结构", () => {
  verifyUiContract("layout");
});

test("桌面沙盘使用舰桥场景、透视海图与常驻右侧行动台", () => {
  const v15 = css.slice(css.lastIndexOf("Ocean-v1.5 · carrier command bridge"));
  assert.match(v15, /carrier-bridge-ocean\.webp\?v=1\.5/);
  assert.match(v15, /tactical-ocean-v1\.4\.webp\?v=1\.5/);
  assert.match(v15, /rotateX\((?:5\.5|2\.5)deg\)/);
  assert.match(v15, /grid-template-columns:\s*minmax\(0, 1fr\) clamp\(250px, 19vw, 320px\)/);
  assert.match(v15, /\.action-rail--v073[\s\S]*opacity:\s*1/);
});

test("UI2 迁移：水面与潜层只写入本地界面状态且手机端关闭透视控制台", () => {
  verifyUiContract("responsive");
});
