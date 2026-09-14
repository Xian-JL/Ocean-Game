"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const viewportCss = fs.readFileSync(path.join(ROOT, "public/css/v1.6.0.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

function functionBody(name, nextName) {
  const start = app.search(new RegExp(`^  (?:async )?function ${name}`, "m"));
  const tail = start >= 0 ? app.slice(start + 3) : "";
  const nextOffset = nextName ? tail.search(new RegExp(`^  (?:async )?function ${nextName}`, "m")) : -1;
  const end = nextOffset >= 0 ? start + 3 + nextOffset : app.length;
  assert.ok(start >= 0 && end > start, `找不到函数 ${name}`);
  return app.slice(start, end);
}

test("v1.6.0元数据、独立末级样式和页面类一致", () => {
  assert.equal(require("../package.json").version, "1.6.0");
  assert.equal(require("../public/js/game-data").RELEASE.stage, "Ocean-v1.6.0");
  assert.match(html, /main\.css\?v=1\.6\.0/);
  assert.match(html, /v1\.6\.0\.css\?v=1\.6\.0/);
  assert.match(app, /battle-page--v159 battle-page--v160/);
});

test("画质设置提供自动、高画质和流畅三档且只保存在本机", () => {
  assert.match(html, /data-quality-mode="auto"/);
  assert.match(html, /data-quality-mode="high"/);
  assert.match(html, /data-quality-mode="smooth"/);
  assert.match(app, /QUALITY_STORAGE_KEY = "ocean\.quality\.v1"/);
  assert.match(app, /writeStringPreference\(QUALITY_STORAGE_KEY, mode\)/);
  assert.doesNotMatch(app, /emitRequest\([^)]*quality/);
});

test("自动画质根据减少动画、设备内存、核心数和视口评估", () => {
  const body = functionBody("resolveAutomaticQuality", "applyQualityMode");
  assert.match(body, /prefers-reduced-motion/);
  assert.match(body, /navigator\.deviceMemory/);
  assert.match(body, /navigator\.hardwareConcurrency/);
  assert.match(body, /compactViewport/);
});

test("流畅模式省略阴影航迹并收束短时战斗特效", () => {
  const effects = functionBody("tacticalArtEffects", "artCoordinate");
  const battleEffects = functionBody("battleEffectAssets", "renderBattleEffectLayer");
  assert.match(effects, /quality === "smooth"/);
  assert.match(app, /quality: state\.effectiveQuality/);
  assert.match(battleEffects, /slice\(0, 1\)/);
  assert.match(css, /html\[data-quality="smooth"\]/);
  assert.match(css, /tactical-prop--wake/);
});

test("2.5D资源按当前行动预热并对装饰资源使用低优先级延迟加载", () => {
  const preload = functionBody("preloadArtAssets", "warmBattleArt");
  const warm = functionBody("warmBattleArt", "tacticalPropSize");
  assert.match(preload, /preloadedArtAssets\.has/);
  assert.match(preload, /requestIdleCallback/);
  assert.match(warm, /ACTION_ART_FILES\[state\.battle\.selectedAction\]/);
  assert.match(app, /loading="lazy" decoding="async" fetchpriority="low"/);
});

test("每张地图独立记忆滚动位置并在界面重绘后恢复", () => {
  const remember = functionBody("rememberBattleMapView", "restoreBattleMapView");
  const restore = functionBody("restoreBattleMapView", "targetFocusCoordinate");
  assert.match(remember, /mapViewPositions\.set\(mapId/);
  assert.match(restore, /mapViewPositions\.get\(mapId\)/);
  assert.match(restore, /frame\.scrollLeft/);
  assert.match(app, /if \(page === "P05" && samePage\) rememberBattleMapView\(\)/);
  assert.match(app, /if \(page === "P05"\) restoreBattleMapView\(\)/);
});

test("移动端支持地图居中以及单格、整行、整列目标复位", () => {
  const target = functionBody("targetFocusCoordinate", "centerBattleMap");
  const center = functionBody("centerBattleMap", "renderMobileCommandPeek");
  assert.match(target, /target\?\.kind === "row"/);
  assert.match(target, /target\?\.kind === "column"/);
  assert.match(center, /frame\.scrollTo/);
  assert.match(app, /data-action="center-battle-map"/);
  assert.match(app, /centerBattleMap\(targetFocusCoordinate\(\)\)/);
});

test("触摸拖图超过12像素后抑制攻击点击", () => {
  assert.match(app, /mapPanGesture = \{/);
  assert.match(app, /> 12/);
  assert.match(app, /suppressEnemyCellClickUntil = Date\.now\(\) \+ 650/);
  assert.match(app, /if \(Date\.now\(\) < suppressEnemyCellClickUntil\) return/);
});

test("横竖屏和视口变化保留地图位置并重新评估自动画质", () => {
  assert.match(app, /addEventListener\("resize"/);
  assert.match(app, /addEventListener\("orientationchange"/);
  assert.match(app, /state\.qualityMode === "auto"/);
  assert.match(app, /restoreBattleMapView\(\)/);
});

test("四档视口规则由最后加载的独立样式表接管", () => {
  assert.match(viewportCss, /max-width: 700px/);
  assert.match(viewportCss, /max-width: 1000px/);
  assert.match(viewportCss, /orientation: portrait/);
  assert.match(viewportCss, /min-width: 1001px/);
  assert.match(viewportCss, /max-width: 1280px/);
  assert.match(viewportCss, /orientation: landscape/);
  assert.match(viewportCss, /--cell-size: 42px/);
  assert.match(viewportCss, /overflow: auto/);
});

test("重连和页面回前台先显示同步状态再报告回合、计时与保留目标", () => {
  assert.match(app, /"syncing"/);
  assert.match(app, /页面已回到前台，正在校准服务器回合与剩余时间/);
  assert.match(app, /仍是你的回合/);
  assert.match(app, /已保留目标/);
  assert.match(app, /服务器状态已校准/);
});

test("v1.6.0不改变规则、协议、AI和服务器权威边界", () => {
  const release = require("../server/release");
  assert.equal(release.RULE_VERSION, "1.8");
  assert.equal(release.SOCKET_PROTOCOL_VERSION, "2.1");
  assert.match(app, /Data\.RELEASE\.socketProtocolVersion/);
  assert.doesNotMatch(viewportCss, /socket|damage|hitPoints|remainingUses/);
});
