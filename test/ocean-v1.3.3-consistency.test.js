"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pkg = require("../package.json");
const Data = require("../public/js/game-data");
const { SECURITY_HEADERS } = require("../server/app");
const {
  RELEASE_STAGE,
  RELEASE_VERSION,
  RULE_VERSION,
  SOCKET_PROTOCOL_VERSION,
} = require("../server/release");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("Ocean-v1.4 前后端正式发布元数据使用同一基线", () => {
  assert.equal(pkg.version, "1.4.0");
  assert.equal(RELEASE_VERSION, "1.4.0");
  assert.equal(RELEASE_STAGE, "Ocean-v1.4");
  assert.equal(RULE_VERSION, "1.8");
  assert.equal(SOCKET_PROTOCOL_VERSION, "2.1");
  assert.deepEqual(Data.RELEASE, {
    version: "1.4.0",
    stage: "Ocean-v1.4",
    ruleVersion: "1.8",
    socketProtocolVersion: "2.1",
  });
});

test("正式前端不再包含会误导当前规则的历史关键文案", () => {
  const frontend = [
    read("public/index.html"),
    read("public/js/app.js"),
    read("public/js/game-data.js"),
  ].join("\n");

  for (const stale of [
    "postlaunch-v0.3",
    "协议 1.2",
    "RULE v1.0",
    "7 个作战单位",
    "七个作战单位",
    "九项战术行动",
  ]) {
    assert.equal(frontend.includes(stale), false, `仍包含历史文案：${stale}`);
  }

  for (const current of [
    "Ocean-v1.4",
    "10×10",
    "12×12",
    "15×15",
    'data-map-size="${mapSize}"',
    'data-max-players="3"',
    'data-room-mode="bot_duel"',
    'data-action="start-tutorial"',
    'data-action="select-bot-difficulty"',
    "新手",
    "标准",
    "专家",
    "机器人准备中",
    "机器人思考中",
    "游戏说明",
  ]) {
    assert.equal(frontend.includes(current), true, `缺少当前 UI / 发布信息：${current}`);
  }

  assert.match(
    Data.getActionDefinition(Data.ACTION_TYPES.DESTROYER_I_RAM).warning,
    /自身受到 0\.5 点伤害/,
  );
  assert.equal(
    Data.getActionDefinition(Data.ACTION_TYPES.SUBMARINE_MISSILE).initialUses,
    4,
  );
});

test("当前文档冻结 v1.4 战术海面、v1.3 教程、人机边界与真实素材音效范围", () => {
  const currentDocs = [
    read("README.md"),
    read("docs/rule-v1.8.md"),
    read("docs/page-flow-v2.1.md"),
    read("docs/socket-protocol-v2.1.md"),
    read("docs/tutorial-design-v1.3.md"),
    read("docs/bot-design-v1.3.md"),
    read("docs/audio-design-v1.3.3.md"),
    read("docs/ui-theme-v1.0.md"),
    read("docs/ui-battle-tactical-sea-v1.4.md"),
    read("docs/release-manifest-Ocean-v1.4.md"),
  ].join("\n");

  for (const stale of ["postlaunch-v0.3", "协议 1.2"]) {
    assert.equal(currentDocs.includes(stale), false, `当前文档仍包含历史核心值：${stale}`);
  }

  for (const current of [
    "Ocean-v1.4",
    "rule-v1.8",
    "page-flow-v2.1",
    "10×10",
    "12×12",
    "15×15",
    "9×5",
    "13×9",
    "8×6",
    "12×10",
    "ocean-theme.mp3",
    "战况 / 私人情报 / 系统",
    "一次行动",
    "同时作用",
    "右键",
    "手机长按",
    "0.765",
    "五章",
    "新手",
    "标准",
    "专家",
    "安全玩家视图",
    "差异化音效",
    "不泄露",
    "个性化",
    "主题",
    "强调色",
    "隐形坐标",
    "局部网格",
    "真实海面",
  ]) {
    assert.equal(currentDocs.includes(current), true, `当前文档缺少：${current}`);
  }
});

test("独立声音设置、个性化弹窗、CSP 兼容动态地图与分角色播报均打包在正式前端", () => {
  const html = read("public/index.html");
  const app = read("public/js/app.js");
  const audio = read("public/js/audio-system.js");
  const css = read("public/css/main.css");
  const projection = read("server/game/information-projection.js");

  assert.match(html, /\/js\/audio-system\.js/);
  assert.match(html, /\/js\/theme-bootstrap\.js/);
  assert.match(html, /id="effects-toggle"/);
  assert.match(html, /id="music-toggle"/);
  assert.match(html, /id="effects-volume"/);
  assert.match(html, /id="music-volume"/);
  assert.match(html, /id="audio-dialog"/);
  assert.match(html, /data-action="open-audio-settings" data-audio-focus="effects"/);
  assert.match(html, /data-action="open-audio-settings" data-audio-focus="music"/);
  assert.match(html, /id="personalize-dialog"/);
  assert.match(html, /data-action="open-personalize"/);
  assert.match(html, /data-action="select-theme"/);
  assert.match(html, /data-action="select-accent"/);
  const rulesStart = html.indexOf('id="rules-dialog"');
  const rulesEnd = html.indexOf("</dialog>", rulesStart);
  assert.ok(rulesStart >= 0 && rulesEnd > rulesStart);
  assert.ok(html.indexOf('id="effects-volume"') > rulesEnd);
  assert.match(audio, /\/assets\/audio\/music\/ocean-theme\.mp3/);
  assert.match(audio, /createOscillator/);
  assert.match(audio, /setEffectsVolume/);
  assert.match(audio, /setMusicVolume/);
  assert.match(app, /class="toast__close"/);
  assert.match(app, /toast\.addEventListener\("click", dismiss\)/);
  assert.match(app, /"Escape"\]\.includes\(event\.key\)/);
  assert.match(css, /max-width:\s*300px/);
  assert.match(css, /pointer-events:\s*auto/);
  assert.match(app, /class="battle-main-column"/);
  assert.match(app, /battle-main-column[\s\S]*renderPublicLog\(room\)/);
  assert.match(css, /\.battle-main-column\s*\{/);
  for (const mapSize of [10, 12, 15]) {
    assert.match(
      css,
      new RegExp(`\\.ocean-board\\[data-board-size="${mapSize}"\\]\\s*\\{[^}]*--board-size:\\s*${mapSize}`),
    );
  }
  assert.match(css, /repeat\(var\(--board-size, 12\), var\(--cell-size\)\)/);
  assert.equal(app.includes('style="grid-row'), false);
  assert.equal(app.includes('style="--board-size'), false);
  assert.match(SECURITY_HEADERS["Content-Security-Policy"], /style-src 'self'/);
  assert.equal(
    SECURITY_HEADERS["Content-Security-Policy"].includes("'unsafe-inline'"),
    false,
  );
  assert.equal(app.includes("feedback.inflictedDamage"), false);
  assert.equal(projection.includes("inflictedDamage"), false);
  assert.match(projection, /receivedHits:\s*createReceivedHitNotifications/);
  assert.match(projection, /privateResultsByDefender/);
  assert.match(app, /data-action="select-marker-tool"/);
  assert.match(app, /document\.addEventListener\("contextmenu"/);
  assert.match(css, /zoom:\s*0\.85/);
  assert.match(css, /zoom:\s*0\.9/);
  assert.match(css, /zoom:\s*0\.765/);

  for (const channel of ["战况", "私人情报", "系统"]) {
    assert.equal(app.includes(channel), true, `底部频道被意外删除：${channel}`);
  }
});
