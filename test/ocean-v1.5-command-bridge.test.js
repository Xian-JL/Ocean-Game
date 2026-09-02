"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

test("v1.5 正式战斗页具有概念图对应的五区舰桥结构", () => {
  assert.match(app, /battle-page--v15/);
  assert.match(app, /bridge-menu-button/);
  assert.match(app, /battle-side-dock[\s\S]*战斗日志[\s\S]*情报信息[\s\S]*系统消息/);
  assert.match(app, /bridge-target-readout/);
  assert.match(app, /bridge-command-deck/);
  assert.match(app, /战术视层[\s\S]*综合[\s\S]*水面[\s\S]*潜层/);
  assert.match(app, /私人标记[\s\S]*行动确认[\s\S]*取消操作/);
});

test("桌面沙盘使用舰桥场景、透视海图与常驻右侧行动台", () => {
  const v15 = css.slice(css.lastIndexOf("Ocean-v1.5 · carrier command bridge"));
  assert.match(v15, /carrier-bridge-ocean\.webp\?v=1\.5/);
  assert.match(v15, /tactical-ocean-v1\.4\.webp\?v=1\.5/);
  assert.match(v15, /rotateX\((?:5\.5|2\.5)deg\)/);
  assert.match(v15, /grid-template-columns:\s*minmax\(0, 1fr\) clamp\(250px, 19vw, 320px\)/);
  assert.match(v15, /\.action-rail--v073[\s\S]*opacity:\s*1/);
});

test("水面与潜层只写入本地界面状态且手机端关闭透视控制台", () => {
  assert.match(app, /tacticalLayer:\s*"all"/);
  assert.match(app, /if \(action === "set-tactical-layer"\)/);
  assert.doesNotMatch(app, /emitRequest\("set-tactical-layer"/);
  assert.match(css, /data-tactical-layer="surface"/);
  assert.match(css, /data-tactical-layer="underwater"/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.battle-page--v15 \.bridge-command-deck/);
  assert.match(html, /\/css\/main\.css\?v=1\.5(?:\.1)?/);
});
