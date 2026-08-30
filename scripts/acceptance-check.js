"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { collectLanUrls } = require("../server/server");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const FROZEN_HASHES = Object.freeze({
  "docs/rule-v1.0.md": "750b3bfd23f81d498ef6eedeca76b817c88d1ec20f3da3d9b953de04d6f761b3",
  "docs/page-flow-v1.0.md": "9cb72f51883e40e9a176746a5ee16575c316c31475eb6b0124f9e07612b903aa",
  "docs/development-outline-v1.0.md": "eb3dc1e1453f86660f4aa881c98f9676d327157797819c686147ddcde732e599",
  "docs/develop_environment.txt": "ee39fed4f7c0591a5ae4697b15e6e857bac5b1dd36b83f81a1420c20788beb11",
});
const REQUIRED_PATHS = Object.freeze([
  "package.json",
  "package-lock.json",
  "public/index.html",
  "public/css/main.css",
  "public/js/app.js",
  "public/js/audio-system.js",
  "public/js/tutorial-system.js",
  "public/assets/icons/ocean-ui.svg",
  "public/assets/images/battle/tactical-ocean-v1.4.webp",
  "public/assets/audio/music/README.txt",
  "docs/release-manifest-Ocean-v1.3.3.md",
  "docs/audio-design-v1.3.3.md",
  "docs/ui-theme-v1.0.md",
  "docs/ui-battle-tactical-sea-v1.4.md",
  "docs/release-manifest-Ocean-v1.4.md",
  "docs/rule-v1.8.md",
  "docs/page-flow-v2.1.md",
  "docs/socket-protocol-v2.1.md",
  "docs/tutorial-design-v1.3.md",
  "docs/bot-design-v1.3.md",
  "server/app.js",
  "server/server.js",
  "server/game/map-rules.js",
  "server/game/bot-difficulty.js",
  "server/game/bot-strategy.js",
  "test/ui-full-match-integration.test.js",
  "test/ui-v0.7.5.test.js",
  "test/ui-v0.7.6.test.js",
  "test/ocean-v1.1-bot.test.js",
  "test/ocean-v1.3.3-consistency.test.js",
  "test/ocean-v1.4-tactical-sea.test.js",
  "test/ocean-v1.3.3-audio.test.js",
  "test/ocean-v1.3.2-theme.test.js",
  "test/ocean-v1.3-tutorial-bot.test.js",
  "test/ocean-v1.2.7-mobile.test.js",
  "test/ocean-v1.2.6-three-player.test.js",
  "test/ocean-v1.2.6-ui.test.js",
  "test/ocean-v1.2-dynamic-map.test.js",
  "test/ocean-v1.2.4-audio.test.js",
  "test/ui-readability.test.js",
  "test/production-readiness.test.js",
  "test/postlaunch-stability.test.js",
  "test/postlaunch-mobile.test.js",
  "test/postlaunch-monitoring.test.js",
  "render.yaml",
  ".node-version",
]);

function pass(message) {
  console.log(`[通过] ${message}`);
}

function warn(message) {
  console.log(`[提示] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => reject(error));
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

async function main() {
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 24) {
    fail(`Node.js 必须为 24 或更高版本，当前为 ${process.version}`);
  }
  pass(`Node.js 版本符合要求：${process.version}`);

  fs.accessSync(PROJECT_ROOT, fs.constants.R_OK | fs.constants.W_OK);
  pass("项目根目录可读写");

  for (const relativePath of REQUIRED_PATHS) {
    if (!fs.existsSync(path.join(PROJECT_ROOT, relativePath))) {
      fail(`缺少关键文件：${relativePath}`);
    }
  }
  pass("关键源码、页面与测试文件完整");

  for (const [relativePath, expected] of Object.entries(FROZEN_HASHES)) {
    const actual = sha256(path.join(PROJECT_ROOT, relativePath));
    if (actual !== expected) {
      fail(`冻结文件已变化：${relativePath}`);
    }
  }
  pass("历史冻结规则、页面流程、开发大纲和环境说明保持不变");

  try {
    await assertPortAvailable(3000);
    pass("本机端口 3000 当前可用");
  } catch (error) {
    fail(`本机端口 3000 已被占用：${error.code ?? error.message}`);
  }

  const lanUrls = collectLanUrls(3000);
  if (lanUrls.length === 0) {
    warn("未发现 10.x、172.16～31.x 或 192.168.x 私有 IPv4；本机模式不受影响，LAN 模式需先连接同一局域网。");
  } else {
    pass(`发现可用于同一局域网验收的地址：${lanUrls.join("、")}`);
  }

  console.log("\nOcean 本机验收环境检查全部通过。继续执行语法与自动测试……");
}

main().catch((error) => {
  console.error(`[失败] ${error.message}`);
  process.exitCode = 1;
});
