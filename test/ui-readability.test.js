"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const CSS_PATH = path.resolve(__dirname, "..", "public", "css", "main.css");
const css = fs.readFileSync(CSS_PATH, "utf8");

test("正式样式表保持可解析，并包含阶段 10 可读性覆盖层", () => {
  const dom = new JSDOM(`<!doctype html><style>${css}</style>`);
  const sheet = dom.window.document.styleSheets[0];
  assert.ok(sheet.cssRules.length > 400);
  assert.match(css, /Stage 10 readability baseline/);
  assert.match(css, /:root\s*{\s*font-size:\s*17px;/s);
  assert.match(css, /body\s*{\s*font-size:\s*1rem;\s*line-height:\s*1\.55;/s);
  dom.window.close();
});

test("关键交互文字、地图文字与手机文字使用提高后的字号下限", () => {
  const readability = css.slice(css.indexOf("Stage 10 readability baseline"));
  assert.match(readability, /\.button\s*{[^}]*min-height:\s*42px;[^}]*font-size:\s*0\.92rem;/s);
  assert.match(readability, /\.fleet-item__body strong[\s\S]*font-size:\s*0\.9rem;/);
  assert.match(readability, /\.board-axis,[\s\S]*font-size:\s*0\.72rem;/);
  assert.match(readability, /\.board-cell\s*{\s*font-size:\s*clamp\(0\.68rem,[^;]+;/s);
  assert.match(readability, /@media \(max-width: 600px\)[\s\S]*font-size:\s*16px;/);
});
