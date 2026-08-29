"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const css = fs.readFileSync(path.join(root, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");

test("三套主题均覆盖页面环境背景而不只改变按键", () => {
  for (const theme of ["ocean-dark", "ocean-light", "ocean-dusk"]) {
    assert.match(css, new RegExp(`html\\[data-theme="${theme}"\\] body \\{[\\s\\S]*?background:`));
  }
  assert.match(css, /ocean-light.*global-header/);
  assert.match(css, /ocean-dusk.*global-header/);
  assert.match(css, /ocean-light.*carrier-bridge-scene::before/);
  assert.match(css, /ocean-dusk.*carrier-bridge-scene::before/);
});

test("航母界面使用正确主题标识并清除无效简写选择器", () => {
  assert.equal(css.includes('data-theme="light"'), false);
  assert.equal(css.includes('data-theme="dusk"'), false);
  assert.match(css, /data-theme="ocean-light"/);
  assert.match(css, /data-theme="ocean-dusk"/);
  assert.match(html, /main\.css\?v=1\.3\.3\.2-theme1/);
});

test("主题背景修正继续保留高对比度降级", () => {
  assert.match(css, /forced-colors:active/);
  assert.match(css, /\.carrier-bridge-scene \{ display:none; \}/);
  assert.match(css, /background:Canvas/);
});
