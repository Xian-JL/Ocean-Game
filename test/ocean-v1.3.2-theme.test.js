"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const app = read("public/js/app.js");
const html = read("public/index.html");
const css = read("public/css/main.css");
const bootstrap = read("public/js/theme-bootstrap.js");

const THEMES = ["ocean-dark", "ocean-light", "ocean-dusk"];
const ACCENTS = ["cyan", "gold", "jade", "crimson", "violet"];

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ].join(", ");
}

test("theme-bootstrap 首帧引导存在且与 app.js 使用同一存储键", () => {
  assert.match(bootstrap, /ocean\.theme\.v1/);
  assert.match(bootstrap, /ocean\.accent\.v1/);
  assert.match(app, /THEME_STORAGE_KEY = "ocean\.theme\.v1"/);
  assert.match(app, /ACCENT_STORAGE_KEY = "ocean\.accent\.v1"/);
  assert.match(html, /<script src="\/js\/theme-bootstrap\.js"><\/script>/);
  assert.equal(/<script src="\/js\/theme-bootstrap\.js" defer/.test(html), false);
  assert.match(bootstrap, /documentRoot\.dataset\.theme = theme/);
});

test("主题选择器提供三套主题、五种强调色与对应控件", () => {
  for (const theme of THEMES) {
    assert.equal(
      (bootstrap.match(new RegExp(`"${theme}"`, "g")) ?? []).length >= 1,
      true,
      `theme-bootstrap 缺少主题 ${theme}`,
    );
  }
  for (const accent of ACCENTS) {
    assert.equal(
      (bootstrap.match(new RegExp(`${accent}: \\[`)) ?? []).length,
      1,
      `theme-bootstrap 缺少强调色 ${accent}`,
    );
  }
  assert.equal((html.match(/data-action="select-theme"/g) ?? []).length, 3);
  assert.equal((html.match(/data-action="select-accent"/g) ?? []).length, 5);
  assert.match(html, /id="personalize-dialog"/);
  assert.match(html, /data-action="open-personalize"/);
  assert.match(html, /data-action="close-personalize"/);
  assert.match(html, /data-action="reset-personalization"/);
  assert.match(html, /data-theme-value="ocean-dark"/);
  assert.match(html, /data-theme-value="ocean-light"/);
  assert.match(html, /data-theme-value="ocean-dusk"/);
  for (const accent of ACCENTS) {
    assert.match(html, new RegExp(`data-accent-value="${accent}"`));
  }
});

test("CSS 主题覆盖块完整且旧变量别名跟随语义层", () => {
  for (const theme of ["ocean-light", "ocean-dusk"]) {
    const blockStart = css.indexOf(`[data-theme="${theme}"] {`);
    assert.ok(blockStart >= 0, `缺少主题块 ${theme}`);
    const blockEnd = css.indexOf("}", blockStart);
    const block = css.slice(blockStart, blockEnd);
    assert.match(block, /--surface-page:/);
    assert.match(block, /--text-primary:/);
    assert.match(block, /--accent-primary:/);
    assert.match(block, /--accent-primary-rgb:/);
    assert.match(block, /--status-danger:/);
    if (theme === "ocean-light") assert.match(block, /color-scheme: light/);
  }
  assert.match(css, /--cyan: var\(--accent-primary\)/);
  assert.match(css, /--bg-abyss: var\(--surface-page\)/);
  assert.match(css, /rgba\(var\(--accent-primary-rgb\)/);
  assert.match(css, /rgba\(var\(--line-rgb\)/);
  assert.match(css, /\.theme-swatch--light/);
  assert.match(css, /\.accent-swatch--gold/);
});

test("强调色三元组在 app.js 与 theme-bootstrap 中一致且 RGB 分量匹配", () => {
  const expected = {
    cyan: "#63ddf5",
    gold: "#f4c25a",
    jade: "#59e0ac",
    crimson: "#ff6b77",
    violet: "#bc8cff",
  };
  for (const accent of ACCENTS) {
    const hex = expected[accent];
    const rgb = hexToRgb(hex);
    assert.match(
      app,
      new RegExp(`${accent}: \\["${hex}", "[^"]+", "[^"]+", "${rgb.replace(/, /g, ", ")}"\\]`),
      `app.js 中 ${accent} 的 RGB 分量与色值不一致`,
    );
    assert.match(
      bootstrap,
      new RegExp(`${accent}: \\["${hex}", "[^"]+", "[^"]+", "${rgb.replace(/, /g, ", ")}"\\]`),
      `theme-bootstrap 中 ${accent} 的 RGB 分量与色值不一致`,
    );
  }
});

test("app.js 运行时应用主题与强调色并持久化", () => {
  assert.match(app, /function applyTheme\(/);
  assert.match(app, /function applyAccent\(/);
  assert.match(app, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(app, /style\.setProperty\("--accent-primary", parts\[0\]\)/);
  assert.match(app, /style\.setProperty\("--accent-primary-rgb", parts\[3\]\)/);
  assert.match(app, /writeStringPreference\(THEME_STORAGE_KEY, theme\)/);
  assert.match(app, /writeStringPreference\(ACCENT_STORAGE_KEY, accent\)/);
  assert.match(app, /if \(action === "select-theme"\)/);
  assert.match(app, /if \(action === "select-accent"\)/);
  assert.match(app, /if \(action === "open-personalize"\)/);
  assert.match(app, /applyTheme\("ocean-dark"\);/);
  assert.match(app, /applyAccent\("cyan"\);/);
  assert.match(app, /"reset-personalization": "cancel"/);
  assert.match(app, /"open-personalize": "panel_open"/);
});

test("个性化设置不触碰服务器协议与信息边界", () => {
  assert.equal(app.includes('room:create'), true, "协议事件仍然存在");
  assert.equal(html.includes("不影响对局与服务器"), true);
  assert.equal(app.includes("feedback.inflictedDamage"), false);
});
