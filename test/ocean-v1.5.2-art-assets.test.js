"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const ASSET_ROOT = path.join(ROOT, "public/assets/images/ocean-2.5d");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ASSET_ROOT, "source-asset-manifest.json"), "utf8"));

function filesUnder(relativeDirectory) {
  const directory = path.join(ASSET_ROOT, relativeDirectory);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? filesUnder(relativePath) : [relativePath];
  });
}

test("v1.5.2 完整打包57项非空 WebP 核心素材并控制运行体积", () => {
  const coreFiles = ["ocean", "units", "actions"].flatMap(filesUnder).sort();
  assert.equal(manifest.core_asset_count, 57);
  assert.equal(coreFiles.length, 57);
  let totalBytes = 0;
  for (const relativePath of coreFiles) {
    const absolutePath = path.join(ASSET_ROOT, relativePath);
    const bytes = fs.readFileSync(absolutePath);
    totalBytes += bytes.length;
    assert.ok(bytes.length > 1000, `${relativePath} 不能为空或异常过小`);
    assert.equal(path.extname(relativePath), ".webp");
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
  }
  assert.ok(totalBytes < 3 * 1024 * 1024, `运行素材体积过大：${totalBytes}`);
});

test("三套主题海面与十种行动图标全部接入正式前端", () => {
  for (const ocean of ["ocean_deep_active", "ocean_deep_calm", "ocean_deep_subtle"]) {
    assert.match(css, new RegExp(`${ocean}\\.webp\\?v=1\\.5\\.2`));
  }
  const actionFiles = filesUnder("actions");
  assert.equal(actionFiles.length, 10);
  for (const relativePath of actionFiles) {
    assert.match(app, new RegExp(path.basename(relativePath).replace(".", "\\.")));
  }
  assert.match(app, /actionArtIcon\(definition\)/);
  assert.match(app, /opening-radar-task__icon--art/);
});

test("航母使用完整16模块并由 N E S W 四向邻接选择", () => {
  const carrierFiles = filesUnder("units/carrier");
  assert.equal(carrierFiles.length, 16);
  const expected = [];
  for (const north of [0, 1]) for (const east of [0, 1]) {
    for (const south of [0, 1]) for (const west of [0, 1]) {
      expected.push(`units/carrier/carrier_n${north}e${east}s${south}w${west}.webp`);
    }
  }
  assert.deepEqual(carrierFiles.sort(), expected.sort());
  assert.match(app, /function carrierModuleName/);
  assert.match(app, /occupied\.has\(north\)/);
  assert.match(app, /occupied\.has\(east\)/);
  assert.match(app, /occupied\.has\(south\)/);
  assert.match(app, /occupied\.has\(west\)/);
});

test("整船跨格投影使用 CSP 兼容 data 属性而非动态内联定位", () => {
  const artSection = app.slice(app.indexOf("function artSpriteMarkup"), app.indexOf("function actionArtIcon"));
  assert.match(artSection, /data-grid-row=/);
  assert.match(artSection, /data-grid-column=/);
  assert.match(artSection, /data-grid-row-span=/);
  assert.match(artSection, /data-grid-column-span=/);
  assert.doesNotMatch(artSection, /style=/);
  assert.match(css, /grid-row:\s*var\(--art-row\) \/ span var\(--art-row-span\)/);
  assert.match(css, /grid-column:\s*var\(--art-column\) \/ span var\(--art-column-span\)/);
  assert.match(html, /main\.css\?v=1\.5\.2/);
});

test("2.5D单位只进入部署、己方战场与复盘，不进入敌方安全地图", () => {
  const deployment = app.slice(app.indexOf("function renderDeploymentBoard"), app.indexOf("function getDeploymentHoverPreview"));
  const own = app.slice(app.indexOf("function renderOwnBattleBoard"), app.indexOf("function currentIntelligenceArea"));
  const enemy = app.slice(app.indexOf("function renderEnemyBoard"), app.indexOf("function unitStateCode"));
  assert.match(deployment, /renderTacticalUnitArt/);
  assert.match(own, /renderTacticalUnitArt/);
  assert.doesNotMatch(enemy, /renderTacticalUnitArt/);
  assert.match(app, /renderOwnBattleBoard\(selectedSnapshot/);
  assert.match(css, /data-tactical-layer="surface"[\s\S]*data-art-layer="underwater"/);
  assert.match(app, /battle-page--v152/);
});
