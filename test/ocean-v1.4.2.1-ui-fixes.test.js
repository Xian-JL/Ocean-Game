"use strict";
const { verifyUiContract } = require("../test-fixtures/ui-contract");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const Data = require("../public/js/game-data");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

test("诱饵鱼雷状态和复盘分母读取当前对局实际总数", () => {
  for (const [mapSize, expected] of [[10, 2], [12, 3], [15, 5]]) {
    assert.equal(Data.createMapRules(mapSize).decoyCount, expected);
  }

  assert.match(app, /ownBattle\.decoys\.filter[\s\S]*\/ \$\{ownBattle\.decoys\.length\}/);
  assert.match(app, /snapshot\?\.decoys\?\.filter[\s\S]*\/ \$\{snapshot\?\.decoys\?\.length \?\? 0\}/);
  assert.doesNotMatch(app, /诱饵鱼雷[\s\S]{0,500}\/ 3/);
});

test("UI2 迁移：雷达明确选择扫描区域左上起始格，其他区域武器继续使用中心格", () => {
  verifyUiContract("range");
});

test("桌面战斗首屏按视口收束，方形地图不再强制撑出首屏", () => {
  const start = css.lastIndexOf("Ocean-v1.4.2.1 · viewport-bounded battle workspace");
  const fixes = css.slice(start, css.indexOf("Ocean-v1.4.2.2 · keep desktop map tabs", start));
  assert.match(fixes, /@media \(min-width: 901px\)/);
  assert.match(fixes, /\.app:has\(> \.battle-page--immersive\)[\s\S]*padding: 0 0 16px/);
  assert.match(fixes, /width: min\(100%, clamp\(380px, calc\(100dvh - 392px\), 900px\)\)/);
  assert.match(fixes, /carrier-horizon-deck[\s\S]*height: 28px/);
});

test("UI2 迁移：桌面行动和消息侧栏使用独立视口上限与内部滚动区", () => {
  verifyUiContract("layout");
});
