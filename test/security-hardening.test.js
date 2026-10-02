"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createOceanServer } = require("../server/app");
const { createRoomCode } = require("../server/game/room-service");
const { resolveClientAddress } = require("../server/socket/game-gateway");
const release = require("../public/js/release-config");

test("房间码使用可读格式且默认生成不依赖游戏随机源", () => {
  assert.match(createRoomCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(createRoomCode(() => 0), "AAAAAA");
});

test("IP 限流默认忽略转发头，只在配置可信代理跳数时解析链路", () => {
  const handshake = {
    address: "10.0.0.8",
    headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.24" },
  };
  assert.equal(resolveClientAddress(handshake), "10.0.0.8");
  assert.equal(resolveClientAddress(handshake, 1), "203.0.113.24");
  assert.equal(resolveClientAddress(handshake, 2), "198.51.100.7");
  assert.equal(resolveClientAddress({ ...handshake, headers: { "x-forwarded-for": "spoofed" } }, 1), "10.0.0.8");
});

test("运维接口默认隐藏，配置令牌后要求 Bearer 授权", async (context) => {
  const runtime = createOceanServer({ operationsToken: "test-operations-token-2026" });
  runtime.httpServer.listen(0, "127.0.0.1");
  await once(runtime.httpServer, "listening");
  context.after(() => new Promise((resolve) => runtime.io.close(resolve)));
  const address = runtime.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  for (const endpoint of ["/api/status", "/api/metrics"]) {
    const hidden = await fetch(`${baseUrl}${endpoint}`);
    assert.equal(hidden.status, 404, endpoint);
    const denied = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: "Bearer wrong-operations-token" },
    });
    assert.equal(denied.status, 404, endpoint);
    const allowed = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: "Bearer test-operations-token-2026" },
    });
    assert.equal(allowed.status, 200, endpoint);
    assert.equal(allowed.headers.get("cache-control"), "no-store");
  }
});

test("发布配置统一提供产品与资源缓存版本", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  assert.equal(release.version, "1.6.1");
  assert.equal(release.assetVersion, "1.6.1.2");
  assert.match(html, /__OCEAN_ASSET_VERSION__/);
  for (const assetPath of ["theme-bootstrap.js", "release-config.js", "game-data.js", "ui-model.js", "audio-system.js", "tutorial-system.js", "app.js", "main.css", "v1.6.0.css", "v1.6.1.css"]) {
    assert.match(html, new RegExp(`${assetPath.replaceAll(".", "\\.")}\\?v=__OCEAN_ASSET_VERSION__`));
  }
});

test("原始音源保存在仓库资源目录而不在公开静态目录", () => {
  const root = path.resolve(__dirname, "..");
  assert.equal(fs.existsSync(path.join(root, "assets/audio/effects/source")), true);
  assert.equal(fs.existsSync(path.join(root, "public/assets/audio/effects/source")), false);
});
