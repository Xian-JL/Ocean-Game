"use strict";
const { verifyUiContract } = require("../test-fixtures/ui-contract");

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
    const relativePath = path.join(relativeDirectory, entry.name).split(path.sep).join("/");
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

test("UI2 迁移：三套主题海面与十种行动图标全部接入正式前端", () => {
  verifyUiContract("theme");
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

test("UI2 迁移：整船跨格投影使用 CSP 兼容 data 属性而非动态内联定位", () => {
  verifyUiContract("assets");
});

test("UI2 迁移：2.5D单位只进入部署、己方战场与复盘，不进入敌方安全地图", () => {
  verifyUiContract("privacy");
});
