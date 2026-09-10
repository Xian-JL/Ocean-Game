"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const ASSET_ROOT = path.join(ROOT, "public/assets/images/ocean-2.5d/feedback");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/ocean-v1.5.4-second-assets-source-manifest.json"), "utf8"));
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");

function groupFor(sourcePath) {
  if (sourcePath.startsWith("04_tile_feedback/")) return "tiles";
  if (sourcePath.startsWith("05_status_overlays/")) return "status";
  if (sourcePath.startsWith("06_vfx/")) return "vfx";
  return "props";
}

test("v1.5.4 将第二批48项透明反馈素材转换为运行时 WebP", () => {
  assert.equal(manifest.core_asset_count, 48);
  assert.equal(manifest.assets.length, 48);
  let totalBytes = 0;
  for (const source of manifest.assets) {
    const name = path.basename(source.path, ".png");
    const output = path.join(ASSET_ROOT, groupFor(source.path), `${name}.webp`);
    const bytes = fs.readFileSync(output);
    totalBytes += bytes.length;
    assert.ok(bytes.length > 3_000, `${name} 过小或为空`);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
    assert.equal(source.transparent_background, true);
    assert.ok(app.includes(name) || css.includes(name), `${name} 未接入前端`);
  }
  assert.ok(totalBytes < 4 * 1024 * 1024, `第二批运行资源过大：${totalBytes}`);
});

test("格子、状态、特效和战术道具均映射到既有合法信息", () => {
  for (const [klass, asset] of [
    ["board-cell--legal-target", "tile_move_valid"],
    ["board-cell--target-preview", "tile_attack_target_red"],
    ["board-cell--radar-preview", "tile_radar_range_green"],
    ["board-cell--scan-preview", "tile_scan_range_cyan"],
    ["board-cell--shock-preview", "tile_shock_range_purple"],
    ["board-cell--enemy-hit", "tile_hit_confirm_orange"],
    ["board-cell--enemy-miss", "tile_miss_confirm_white"],
    ["board-cell--marker", "tile_enemy_mark_red"],
  ]) {
    assert.match(css, new RegExp(`${klass}[\\s\\S]{0,180}${asset}`));
  }
  assert.match(app, /function tacticalArtEffects/);
  assert.match(app, /prop_shadow_\$\{size\}/);
  assert.match(app, /prop_wake_\$\{size\}/);
  assert.match(app, /status_emp_disabled/);
  assert.match(app, /function feedbackArtMarkup/);
  assert.match(app, /vfx_radar_sweep/);
  assert.match(app, /vfx_nuclear_shock_ring/);
  assert.match(app, /vfx_helicopter_trace/);
});

test("反馈特效继续遵守命中保密与可访问性边界", () => {
  const feedbackStart = app.indexOf("  function feedbackArtMarkup");
  const feedbackEnd = app.indexOf("\n  function renderLatestFeedback", feedbackStart);
  const feedback = app.slice(feedbackStart, feedbackEnd);
  assert.ok(feedbackStart > 0 && feedbackEnd > feedbackStart);
  assert.match(feedback, /if \(stateCode === "hit"\)/);
  assert.match(feedback, /else if \(stateCode === "miss"\)/);
  assert.match(feedback, /action === Data\.ACTION_TYPES\.SUBMARINE_MISSILE/);
  assert.match(feedback, /<span class="resolution-artwork" aria-hidden="true">/);
  const enemyStart = app.indexOf("  function renderEnemyMapCard");
  const enemyEnd = app.indexOf("\n  function ", enemyStart + 3);
  assert.doesNotMatch(app.slice(enemyStart, enemyEnd), /renderTacticalUnitArt/);
});

test("v1.5.4素材与满幅沙盘在 v1.5.5 中继续保留", () => {
  assert.equal(require("../package.json").version, "1.5.5");
  assert.match(app, /battle-page--v154/);
  assert.match(css, /Ocean-v1\.5\.4 · second production feedback/);
  assert.match(fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8"), /main\.css\?v=1\.5\.5/);
});
