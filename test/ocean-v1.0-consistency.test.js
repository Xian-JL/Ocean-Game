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

test("Ocean-v1.0 前后端正式发布元数据使用同一基线", () => {
  assert.equal(pkg.version, "1.0.0");
  assert.equal(RELEASE_VERSION, "1.0.0");
  assert.equal(RELEASE_STAGE, "Ocean-v1.0");
  assert.equal(RULE_VERSION, "1.4");
  assert.equal(SOCKET_PROTOCOL_VERSION, "1.6");
  assert.deepEqual(Data.RELEASE, {
    version: "1.0.0",
    stage: "Ocean-v1.0",
    ruleVersion: "1.4",
    socketProtocolVersion: "1.6",
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
    "10×10",
    "7 个作战单位",
    "七个作战单位",
    "九项战术行动",
    "7×7",
    "8×8",
  ]) {
    assert.equal(frontend.includes(stale), false, `仍包含历史文案：${stale}`);
  }

  for (const current of [
    "Ocean-v1.0",
    "12×12",
    'data-max-players="3"',
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

test("当前规则与页面流程文档不再保留已废弃的核心数值", () => {
  const currentDocs = [
    read("README.md"),
    read("docs/rule-v1.4.md"),
    read("docs/page-flow-v1.5.md"),
    read("docs/release-manifest-Ocean-v1.0.md"),
  ].join("\n");

  for (const stale of ["10×10", "7×7", "8×8", "postlaunch-v0.3", "协议 1.2"]) {
    assert.equal(currentDocs.includes(stale), false, `当前文档仍包含历史核心值：${stale}`);
  }
});
