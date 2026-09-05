"use strict";

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
const patch = css.slice(css.indexOf("/* Ocean-v1.5.3 ·"));
const context = vm.createContext({ Data, escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;") });
vm.runInContext(app.slice(app.indexOf("  const UNIT_ART_FOLDERS"), app.indexOf("  function actionArtIcon")) + "\nthis.art = { UNIT_ART_VIEWBOXES, artSpriteMarkup, renderTacticalUnitArt, artBounds, carrierModuleName };", context);
const { art } = context;

test("v1.5.3 全部28张方向素材使用有效边界及等比SVG视口", () => {
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
  assert.equal(dom.window.document.querySelectorAll(".tactical-unit-art--carrier-module img").length, 6);
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

test("桌面布局紧贴左右栏和反馈并覆盖历史正方形限制", () => {
  assert.match(patch, /@media \(min-width: 901px\)/);
  assert.match(patch, /grid-template-columns: 76px minmax\(0, 1fr\)/);
  assert.match(patch, /grid-template-rows: auto auto minmax\(0, 1fr\)/);
  assert.match(patch, /padding: 8px 12px 120px/);
  assert.match(patch, /\.battle-layout--v076\s*\{[^}]*grid-row: 3;[^}]*gap: 8px;[^}]*padding: 0/);
  assert.match(patch, /\.board-frame--tactical-sea\s*\{[^}]*width: 100%;[^}]*height: 100%;[^}]*aspect-ratio: auto;[^}]*transform: none/);
  assert.match(patch, /\.board-frame--tactical-sea \.ocean-board\s*\{[^}]*height: 100%;[^}]*aspect-ratio: auto/);
  assert.match(patch, /\.tactical-unit-art-layer\s*\{[^}]*top: 26px;[^}]*left: 26px/);
  assert.match(patch, /:has\(\.battle-turn-progress\)[^{]*\{[^}]*height: calc\(100dvh - 92px\)/);
  assert.doesNotMatch(patch, /font-family:|\.action-rail--v073\s*\{/);
  assert.ok(app.includes('${finalSalvo ? "" : "battle-page--v153"}'));
});

test("敌方未知海图不渲染舰体，版本和缓存标识一致", () => {
  const enemyStart = app.indexOf("  function renderEnemyMapCard");
  const enemyEnd = app.indexOf("\n  function ", enemyStart + 3);
  assert.ok(enemyStart > 0 && enemyEnd > enemyStart);
  assert.doesNotMatch(app.slice(enemyStart, enemyEnd), /renderTacticalUnitArt/);
  assert.equal(require("../package.json").version, "1.5.3");
  assert.equal(Data.RELEASE.stage, "Ocean-v1.5.3");
  assert.match(fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8"), /main\.css\?v=1\.5\.3/);
});
