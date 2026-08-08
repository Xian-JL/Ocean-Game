"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "../public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../public/css/main.css"), "utf8");

test("手机端地图保留 40px 触控格、横向滑动和安全区", () => {
  assert.match(css, /--cell-size: 40px/);
  assert.match(css, /-webkit-overflow-scrolling: touch/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
  assert.match(css, /min-height: 46px/);
});

test("移动地图切换条保持可见，键盘焦点有清晰轮廓", () => {
  assert.match(css, /\.mobile-map-tabs \{[\s\S]*?position: sticky/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline: 3px solid/);
});

test("邀请支持系统分享并在不支持时回退复制", () => {
  assert.match(appSource, /data-action="share-invite"/);
  assert.match(appSource, /typeof navigator\.share === "function"/);
  assert.match(appSource, /当前设备不支持系统分享，邀请链接已复制/);
});

test("客户端记忆昵称、切回页面同步状态并防止误关闭进行中对局", () => {
  assert.match(appSource, /NICKNAME_STORAGE_KEY/);
  assert.match(appSource, /visibilitychange/);
  assert.match(appSource, /beforeunload/);
  assert.match(appSource, /轮到你行动 · 海战 OCEAN/);
});
