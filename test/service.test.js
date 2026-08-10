"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { createOceanServer } = require("../server/app");

test("运行监控 postlaunch-v0.7.5 提供健康检查、游戏入口和 Socket.IO 协议入口", async (context) => {
  const fixedTime = "2026-08-07T00:00:00.000Z";
  const { httpServer, io } = createOceanServer({
    now: () => fixedTime,
  });

  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");

  context.after(
    () =>
      new Promise((resolve) => {
        io.close(resolve);
      }),
  );

  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), {
    status: "ok",
    service: "ocean",
    stage: "postlaunch-v0.7.5",
    socketProtocol: "1.5",
    timestamp: fixedTime,
  });

  const homeResponse = await fetch(baseUrl);
  assert.equal(homeResponse.status, 200);
  const home = await homeResponse.text();
  assert.match(home, /海战 OCEAN/);
  assert.match(home, /id="app"/);
  assert.match(home, /id="rules-dialog"/);
  assert.match(home, /id="confirm-dialog"/);
  assert.match(home, /\/js\/game-data\.js/);
  assert.match(home, /\/js\/ui-model\.js/);
  assert.match(home, /\/js\/app\.js/);

  for (const asset of [
    "/css/main.css",
    "/js/game-data.js",
    "/js/ui-model.js",
    "/js/app.js",
  ]) {
    const assetResponse = await fetch(`${baseUrl}${asset}`);
    assert.equal(assetResponse.status, 200, asset);
    assert.ok((await assetResponse.text()).length > 500, asset);
  }

  const socketClientResponse = await fetch(
    `${baseUrl}/socket.io/socket.io.js`,
  );
  assert.equal(socketClientResponse.status, 200);
  assert.match(
    socketClientResponse.headers.get("content-type") || "",
    /javascript/,
  );
});
