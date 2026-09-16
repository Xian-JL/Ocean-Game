"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

test("v1.5.7 战场特效在 v1.6.1 发布元数据中继续保留", () => {
  assert.equal(require("../package.json").version, "1.6.1");
  assert.equal(require("../public/js/game-data").RELEASE.stage, "Ocean-v1.6.1");
  assert.match(html, /Ocean-v1\.6\.1/);
  assert.match(html, /main\.css\?v=1\.6\.1/);
  assert.match(app, /battle-page--v157/);
});

test("v1.5.7 在沙盘上创建3.6秒短时特效层且不接管交互", () => {
  assert.match(app, /resolutionEffectVisible:\s*false/);
  assert.match(app, /scheduleResolutionEffectHide\(nextResolutionKey\)/);
  assert.match(app, /},\s*3_600\);/);
  assert.match(app, /class="battle-effect-layer"/);
  assert.match(css, /\.battle-page--v157 \.battle-effect-layer[\s\S]*pointer-events:\s*none/);
  assert.match(css, /animation:\s*battle-effect-arrival 3\.6s/);
});

test("十项行动分别映射导弹、核爆、电磁、声呐、雷达、扫射与通用命中反馈", () => {
  const start = app.indexOf("function battleEffectAssets");
  const end = app.indexOf("\n  function renderBattleEffectLayer", start);
  const section = app.slice(start, end);
  for (const asset of [
    "vfx_missile_launch",
    "vfx_torpedo_trail",
    "vfx_nuclear_flash_core",
    "vfx_nuclear_shock_ring",
    "vfx_emp_pulse",
    "vfx_emp_impact",
    "vfx_sonar_ping",
    "vfx_radar_sweep",
    "vfx_helicopter_trace",
    "vfx_small_explosion",
    "vfx_large_explosion",
    "vfx_small_water_splash",
    "vfx_large_water_splash",
    "vfx_debris_sparks",
  ]) {
    assert.match(section, new RegExp(asset));
  }
});

test("导弹、核弹与震爆弹在行动方视图保持结果未知", () => {
  const start = app.indexOf("function battleEffectModel");
  const end = app.indexOf("\n  function battleEffectAssets", start);
  const section = app.slice(start, end);
  assert.match(section, /HIDDEN_RESULT_ACTIONS\.includes\(feedback\.actionType\)[\s\S]*visualState = "unknown"/);
  assert.doesNotMatch(section, /inflictedDamage|actualTargetKind|targetUnitType/);
  assert.match(section, /if \(!isActor \|\| !defenderIds\.includes\(mapId\)\) return null/);
});

test("防守方特效仅由己方安全快照差量生成", () => {
  const start = app.indexOf("function computeOwnEffectCells");
  const end = app.indexOf("\n  function scheduleResolutionEffectHide", start);
  const section = app.slice(start, end);
  assert.match(section, /previousRoom\.battle\.own\.units/);
  assert.match(section, /nextRoom\.battle\.own\.units/);
  assert.match(section, /changes\.hit\.add/);
  assert.match(section, /changes\.sunk\.add/);
  assert.match(section, /changes\.paralyzed\.add/);
  assert.match(section, /changes\.decoy\.add/);
  assert.doesNotMatch(section, /enemyMap|opponent|inflictedDamage/);
});

test("命中、未命中、瘫痪、诱饵与沉没均有独立地块反馈", () => {
  for (const stateName of ["hit", "miss", "paralyzed", "decoy", "sunk"]) {
    assert.match(css, new RegExp(`board-cell--effect-${stateName}`));
  }
  assert.match(css, /tile_hit_confirm_orange\.webp/);
  assert.match(css, /tile_miss_confirm_white\.webp/);
  assert.match(css, /tile_shock_range_purple\.webp/);
  assert.match(css, /tile_warning_yellow\.webp/);
});

test("特效层适配15×15整行整列并尊重减少动态效果设置", () => {
  assert.match(css, /battle-effect-art\[data-grid-row="15"\]/);
  assert.match(css, /battle-effect-art\[data-grid-column="15"\]/);
  assert.match(css, /battle-effect-art\[data-grid-row-span="15"\]/);
  assert.match(css, /battle-effect-art\[data-grid-column-span="15"\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.battle-page--v157 \.battle-effect-art img[\s\S]*animation:\s*none !important/);
});
