"use strict";
const { verifyUiContract } = require("../test-fixtures/ui-contract");

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const Data = require("../public/js/game-data");
const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const patch = css.slice(css.indexOf("/* Ocean-v1.5.3 ·"), css.indexOf("/* Ocean-v1.5.4 ·"));
const context = vm.createContext({ Data, escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;") });
vm.runInContext(app.slice(app.indexOf("  const UNIT_ART_FOLDERS"), app.indexOf("  function actionArtIcon")) + "\nthis.art = { UNIT_ART_VIEWBOXES, artSpriteMarkup, renderTacticalUnitArt, artBounds, carrierModuleName };", context);
const { art } = context;

test("v1.5.4 全部28张方向素材使用有效边界及等比SVG视口", () => {
  assert.equal(Object.keys(art.UNIT_ART_VIEWBOXES).length, 28);
  for (const [file, viewBox] of Object.entries(art.UNIT_ART_VIEWBOXES)) {
    assert.ok(fs.existsSync(path.join(ROOT, "public/assets/images/ocean-2.5d/units", file)), file);
    const [x, y, width, height] = viewBox.split(" ").map(Number);
    assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 512 && y + height <= 512, file);
    const dom = new JSDOM(art.artSpriteMarkup({ asset: `/assets/images/ocean-2.5d/units/${file}`, bounds: { row: 1, column: 1, rowSpan: 1, columnSpan: 3 }, layer: "surface" }));
    const svg = dom.window.document.querySelector("svg");
    assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
    assert.equal(svg.getAttribute("viewBox"), viewBox);
    assert.equal(svg.getAttribute("preserveAspectRatio"), "xMidYMid meet");
    assert.equal(svg.querySelector("image").getAttribute("width"), "512");
    assert.equal(dom.window.document.querySelector("[style]"), null);
    dom.window.close();
  }
});

test("舰体有效视口使狭长占格中的驱逐舰至少放大两倍且不超出占格", () => {
  for (const [direction, box] of [["east", [144, 40]], ["north", [40, 144]]]) {
    const [, , w, h] = art.UNIT_ART_VIEWBOXES[`destroyer-1/${direction}.webp`].split(" ").map(Number);
    const oldScale = Math.min(box[0] / 512, box[1] / 512) * 1.16;
    const newScale = Math.min(box[0] / w, box[1] / h) * .96;
    assert.ok(newScale / oldScale > 2);
    assert.ok(w * newScale <= box[0] && h * newScale <= box[1]);
  }
});

test("三种地图边缘舰艇定位与航母六格连接不受放大影响", () => {
  try {
    for (const size of [10, 12, 15]) {
      Data.configureMap(size);
      const last = String.fromCharCode(64 + size);
      const bounds = art.artBounds([`${last}${size - 2}`, `${last}${size - 1}`, `${last}${size}`]);
      assert.deepEqual(JSON.parse(JSON.stringify(bounds)), { row: size, column: size - 2, rowSpan: 1, columnSpan: 3 });
    }
  } finally {
    Data.configureMap(12);
  }
  const cells = ["A1", "A2", "B1", "B2", "B3", "C2"];
  const dom = new JSDOM(art.renderTacticalUnitArt({ units: [{ id: "carrier", type: Data.UNIT_TYPES.AIRCRAFT_CARRIER, cells, hp: 6 }] }));
  assert.equal(dom.window.document.querySelectorAll(".tactical-unit-art--carrier-module > img:not(.tactical-prop):not(.tactical-status-art)").length, 6);
  assert.equal(dom.window.document.querySelectorAll("svg").length, 0);
  assert.equal(art.carrierModuleName("B2", cells), "carrier_n1e1s1w1.webp");
  dom.window.close();
});

test("舰体放大保留潜层、受损、瘫痪、沉没和选择状态", () => {
  for (const [stateCode, overrides] of [["ready", {}], ["damaged", { hp: .5 }], ["paralyzed", { paralyzed: true }], ["sunk", { hp: 0 }]]) {
    const dom = new JSDOM(art.renderTacticalUnitArt({ units: [{ id: "sub", type: Data.UNIT_TYPES.SUBMARINE, cells: ["A1", "A2", "B1", "B2"], hp: 99, ...overrides }] }, { selectedId: "sub" }));
    const sprite = dom.window.document.querySelector(".tactical-unit-art");
    assert.equal(sprite.dataset.artLayer, "underwater");
    assert.equal(sprite.dataset.artState, stateCode);
    assert.ok(sprite.classList.contains("tactical-unit-art--selected"));
    assert.ok(sprite.querySelector(".tactical-hull-viewport"));
    dom.window.close();
  }
  assert.match(patch, /pointer-events:\s*none/);
});

test("UI2 迁移：桌面布局紧贴左右栏和反馈并覆盖历史正方形限制", () => {
  verifyUiContract("layout");
});

test("UI2 迁移：敌方未知海图不渲染舰体，版本和缓存标识一致", () => {
  verifyUiContract("version");
});
