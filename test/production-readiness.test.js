"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");
const test = require("node:test");
const {
  SECURITY_HEADERS,
  allowSameOriginRequest,
  createOceanServer,
} = require("../server/app");
const packageJson = require("../package.json");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function checkOrigin(headers) {
  return new Promise((resolve, reject) => {
    allowSameOriginRequest({ headers }, (error, allowed) => {
      if (error) reject(error);
      else resolve(allowed);
    });
  });
}

test("Render Blueprint 固定免费 Node 服务、健康检查和公网启动命令", () => {
  const blueprint = fs.readFileSync(path.join(PROJECT_ROOT, "render.yaml"), "utf8");
  assert.match(blueprint, /type: web/);
  assert.match(blueprint, /runtime: node/);
  assert.match(blueprint, /plan: free/);
  assert.match(blueprint, /buildCommand: npm ci/);
  assert.match(blueprint, /startCommand: npm run start:public/);
  assert.match(blueprint, /healthCheckPath: \/api\/health/);
  assert.equal(packageJson.scripts["start:public"], "node server/server.js --host 0.0.0.0");
  assert.equal(
    fs.readFileSync(path.join(PROJECT_ROOT, ".node-version"), "utf8").trim(),
    "24.19.0",
  );
});

test("浏览器 Socket.IO 只接受同源 Origin，并兼容反向代理主机头", async () => {
  assert.equal(await checkOrigin({ host: "ocean.example" }), true);
  assert.equal(await checkOrigin({ host: "ocean.example", origin: "https://ocean.example" }), true);
  assert.equal(await checkOrigin({
    host: "internal:10000",
    "x-forwarded-host": "ocean.example",
    origin: "https://ocean.example",
  }), true);
  assert.equal(await checkOrigin({ host: "ocean.example", origin: "https://attacker.example" }), false);
  assert.equal(await checkOrigin({ host: "ocean.example", origin: "not-a-url" }), false);
});

test("HTTP 页面带生产安全头，健康检查禁止缓存，测试站点拒绝搜索收录", async (context) => {
  const { httpServer, io } = createOceanServer({ timerSweepMs: 0 });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  context.after(() => new Promise((resolve) => io.close(resolve)));

  const address = httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const home = await fetch(baseUrl);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(home.headers.get(name), value, name);
  }
  assert.equal(home.headers.has("x-powered-by"), false);

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.headers.get("cache-control"), "no-store");

  const robots = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /Disallow: \/$/m);
});
