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

test("v0.6.1 前后端发布元数据使用同一基线", () => {
  assert.equal(pkg.version, "0.6.1");
  assert.equal(RELEASE_VERSION, "0.6.1");
  assert.equal(RELEASE_STAGE, "postlaunch-v0.6.1");
  assert.equal(RULE_VERSION, "1.3");
  assert.equal(SOCKET_PROTOCOL_VERSION, "1.4");
  assert.deepEqual(Data.RELEASE, {
    version: "0.6.1",
    stage: "postlaunch-v0.6.1",
    ruleVersion: "1.3",
    socketProtocolVersion: "1.4",
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
    "postlaunch-v0.6.1",
    "RULE v1.3",
    "12×12",
    "8 个作战单位",
  ]) {
    assert.equal(frontend.includes(current), true, `缺少当前文案：${current}`);
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
    read("docs/rule-v1.3.md"),
    read("docs/page-flow-v1.3.md"),
    read("docs/release-manifest-postlaunch-v0.6.1.md"),
  ].join("\n");

  for (const stale of ["10×10", "7×7", "8×8", "postlaunch-v0.3", "协议 1.2"]) {
    assert.equal(currentDocs.includes(stale), false, `当前文档仍包含历史核心值：${stale}`);
  }
});
