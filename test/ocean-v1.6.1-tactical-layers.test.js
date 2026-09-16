"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/v1.6.1.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

function filesUnder(relativePath) {
  const root = path.join(ROOT, relativePath);
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function assertWebp(filePath) {
  const bytes = fs.readFileSync(filePath);
  assert.ok(bytes.length > 64, `${filePath} 不应为空`);
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP");
}

function functionBody(name, nextName) {
  const start = app.search(new RegExp(`^  (?:async )?function ${name}`, "m"));
  const tail = start >= 0 ? app.slice(start + 3) : "";
  const nextOffset = nextName ? tail.search(new RegExp(`^  (?:async )?function ${nextName}`, "m")) : -1;
  const end = nextOffset >= 0 ? start + 3 + nextOffset : app.length;
  assert.ok(start >= 0 && end > start, `找不到函数 ${name}`);
  return app.slice(start, end);
}

test("v1.6.1元数据、缓存版本和末级样式一致", () => {
  assert.equal(require("../package.json").version, "1.6.1");
  assert.equal(require("../public/js/game-data").RELEASE.stage, "Ocean-v1.6.1");
  assert.equal(require("../server/release").RELEASE_STAGE, "Ocean-v1.6.1");
  assert.match(html, /v1\.6\.1\.css\?v=1\.6\.1\.1/);
  assert.ok(html.indexOf("v1.6.1.css") > html.indexOf("v1.6.0.css"));
  assert.match(app, /battle-page--v160 battle-page--v161/);
});

test("60项UI素材已优化为独立WebP并能正常解码标识", () => {
  const files = filesUnder("public/assets/images/ocean-2.5d/ui");
  assert.equal(files.length, 60);
  assert.ok(files.every((file) => file.endsWith(".webp")));
  files.forEach(assertWebp);
});

test("9项海域分层与过渡素材已优化为独立WebP", () => {
  const files = filesUnder("public/assets/images/ocean-2.5d/layers");
  assert.equal(files.length, 9);
  assert.ok(files.some((file) => file.endsWith("surface_specular_seamless.webp")));
  assert.ok(files.some((file) => file.endsWith("underwater_caustics_seamless.webp")));
  assert.ok(files.some((file) => file.endsWith("sonar_scan_ring_sheet.webp")));
  files.forEach(assertWebp);
});

test("UI美术只装饰既有按钮并保留可访问文字", () => {
  assert.match(app, /UI_COMMAND_ICONS = Object\.freeze/);
  assert.match(app, /alt="" loading="lazy" decoding="async"/);
  assert.match(app, /\["all", "综合"\]/);
  assert.match(app, /hasTarget \? "执行指令" : "等待目标"/);
  const iconMap = app.match(/UI_COMMAND_ICONS = Object\.freeze\(\{[\s\S]*?\n  \}\);/)?.[0] ?? "";
  assert.doesNotMatch(iconMap, /(?:move|patrol|endTurn)/);
});

test("行动面板形成行动、目标、确认三步指挥链", () => {
  const body = functionBody("renderActionCommandChain", "renderActionPanel");
  assert.match(body, /01 行动/);
  assert.match(body, /02 目标/);
  assert.match(body, /03 确认/);
  assert.match(body, /room\.turn\?\.canAct && hasAction && hasTarget/);
});

test("行动可用性按可用、受限、耗尽分级并优先排序", () => {
  const tier = functionBody("actionAvailabilityTier", "renderActionCard");
  const deck = functionBody("renderUnitActionDeck", "renderActionAvailabilitySummary");
  assert.match(tier, /available/);
  assert.match(tier, /exhausted/);
  assert.match(tier, /limited/);
  assert.match(deck, /selectedSourceType/);
  assert.match(deck, /ACTION_SOURCE_ORDER\.indexOf/);
  assert.match(app, /data-availability-tier/);
});

test("顶部实时信息增加在线、同步中和中断三态", () => {
  const body = functionBody("renderBattleHeader", "resolutionVisualState");
  assert.match(body, /connectionState/);
  assert.match(body, /实时在线/);
  assert.match(body, /同步中/);
  assert.match(body, /连接中断/);
  assert.match(css, /battle-header__connection\[data-state="offline"\]/);
});

test("己方沙盘提供综合、水面和潜层三种明确视觉环境", () => {
  assert.match(css, /data-tactical-layer="all"/);
  assert.match(css, /data-tactical-layer="surface"/);
  assert.match(css, /data-tactical-layer="underwater"/);
  assert.match(css, /underwater_caustics_seamless\.webp/);
  assert.match(css, /underwater_depth_haze\.webp/);
  assert.match(css, /surface_foam_overlay\.webp/);
});

test("水面舰与潜航单位按战术视层改变强调关系", () => {
  assert.match(css, /data-art-layer="surface"/);
  assert.match(css, /data-art-layer="underwater"/);
  assert.match(css, /opacity: \.06/);
  assert.match(css, /opacity: \.1/);
  assert.match(css, /drop-shadow\(0 0 9px/);
});

test("切层提供声呐、下潜和上浮过渡并自动清理状态", () => {
  const body = functionBody("changeTacticalLayer", "renderMobileCommandPeek");
  assert.match(body, /previousLayer}-to-\$\{layer/);
  assert.match(body, /tacticalLayerTransition = null/);
  assert.match(body, /state\.reduceMotion \? 80 : 820/);
  assert.match(css, /sonar_scan_ring_sheet\.webp/);
  assert.match(css, /submerge_surface_wake\.webp/);
  assert.match(css, /emerge_surface_wake\.webp/);
});

test("敌方地图只获得海面环境装饰且不增加敌方单位信息", () => {
  assert.match(css, /tactical-environment-layer--enemy/);
  assert.match(css, /tactical-environment-layer--enemy :is\([^}]+display: none/);
  assert.doesNotMatch(functionBody("renderTacticalEnvironmentLayer", "preloadArtAssets"), /room|enemy\.units|playerId/);
});

test("流畅模式和减少动画偏好均关闭高成本连续特效", () => {
  assert.match(css, /html\[data-quality="smooth"\]/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation: none !important/);
  assert.match(css, /transition: none !important/);
});

test("电脑、平板横屏、平板竖屏与主流手机继续被覆盖", () => {
  assert.match(css, /min-width: 1001px/);
  assert.match(css, /min-width: 1001px\) and \(max-width: 1280px\) and \(orientation: landscape/);
  assert.match(css, /min-width: 701px\) and \(max-width: 1000px\) and \(orientation: portrait/);
  assert.match(css, /max-width: 700px/);
  assert.match(css, /max-width: 520px/);
  assert.match(app, /data-action="cycle-tactical-layer"/);
});

test("桌面战斗主体、地图标签和左侧战术栏脱离普通文档流", () => {
  const start = css.indexOf("@media (min-width: 1001px) {");
  const end = css.indexOf("@media (min-width: 1001px) and", start);
  const desktop = css.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(desktop, /mobile-map-tabs[\s\S]*position:\s*absolute/);
  assert.match(desktop, /battle-layout--v072[\s\S]*position:\s*absolute/);
  assert.match(desktop, /bottom:\s*88px/);
  assert.match(desktop, /height:\s*auto/);
  assert.match(desktop, /battle-side-dock[\s\S]*position:\s*absolute/);
  assert.match(desktop, /battle-side-dock[\s\S]*height:\s*auto/);
});

test("v1.6.1不改变规则、协议和服务器权威结算边界", () => {
  const release = require("../server/release");
  assert.equal(release.RULE_VERSION, "1.8");
  assert.equal(release.SOCKET_PROTOCOL_VERSION, "2.1");
  assert.doesNotMatch(css, /damage\s*=|hitPoints\s*=|remainingUses\s*=/);
  assert.doesNotMatch(functionBody("changeTacticalLayer", "renderMobileCommandPeek"), /emitRequest|socket\.emit/);
});
