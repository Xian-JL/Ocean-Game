"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pkg = require("../package.json");
const Data = require("../public/js/game-data");
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

test("Ocean-v1.2.1 前后端正式发布元数据使用同一基线", () => {
  assert.equal(pkg.version, "1.2.1");
  assert.equal(RELEASE_VERSION, "1.2.1");
  assert.equal(RELEASE_STAGE, "Ocean-v1.2.1");
  assert.equal(RULE_VERSION, "1.6");
  assert.equal(SOCKET_PROTOCOL_VERSION, "1.8");
  assert.deepEqual(Data.RELEASE, {
    version: "1.2.1",
    stage: "Ocean-v1.2.1",
    ruleVersion: "1.6",
    socketProtocolVersion: "1.8",
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
    "Ocean-v1.2.1",
    "10×10",
    "12×12",
    "15×15",
    'data-map-size="${mapSize}"',
    'data-max-players="3"',
    'data-room-mode="bot_duel"',
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

test("当前规则与页面流程文档冻结三种地图和 v1.2.1 交互边界", () => {
  const currentDocs = [
    read("README.md"),
    read("docs/rule-v1.6.md"),
    read("docs/page-flow-v1.8.md"),
    read("docs/socket-protocol-v1.1.md"),
    read("docs/release-manifest-Ocean-v1.2.1.md"),
  ].join("\n");

  for (const stale of ["postlaunch-v0.3", "协议 1.2"]) {
    assert.equal(currentDocs.includes(stale), false, `当前文档仍包含历史核心值：${stale}`);
  }

  for (const current of [
    "Ocean-v1.2.1",
    "rule-v1.6",
    "page-flow-v1.8",
    "10×10",
    "12×12",
    "15×15",
    "9×5",
    "13×9",
    "8×6",
    "12×10",
    "ocean-theme.mp3",
    "战况 / 私人情报 / 系统",
  ]) {
    assert.equal(currentDocs.includes(current), true, `当前文档缺少：${current}`);
  }
});

test("独立音量、地图邻接三频道与可关闭实时播报均打包在正式前端", () => {
  const html = read("public/index.html");
  const app = read("public/js/app.js");
  const audio = read("public/js/audio-system.js");
  const css = read("public/css/main.css");

  assert.match(html, /\/js\/audio-system\.js/);
  assert.match(html, /id="effects-toggle"/);
  assert.match(html, /id="music-toggle"/);
  assert.match(html, /id="effects-volume"/);
  assert.match(html, /id="music-volume"/);
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

  for (const channel of ["战况", "私人情报", "系统"]) {
    assert.equal(app.includes(channel), true, `底部频道被意外删除：${channel}`);
  }
});
