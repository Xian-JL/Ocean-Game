"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { createOceanServer } = require("../server/app");
const {
  OperationalTelemetry,
  logOperationalError,
} = require("../server/operations/telemetry");

test("聚合监控只记录计数和错误代码，不保存错误消息或对局内容", () => {
  const telemetry = new OperationalTelemetry({
    nowIso: () => "2026-08-08T00:00:00.000Z",
  });
  telemetry.increment("socketRequests");
  telemetry.recordError(
    Object.assign(new Error("房间 ABC234 的私密凭证 secret-token"), {
      code: "TEST_ERROR",
      details: { roomCode: "ABC234", reconnectToken: "secret-token" },
    }),
    "test",
  );
  const serialized = JSON.stringify(telemetry.snapshot());
  assert.match(serialized, /TEST_ERROR/);
  for (const forbidden of ["ABC234", "secret-token", "roomCode", "reconnectToken"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test("结构化错误日志省略异常消息、堆栈和私密上下文", () => {
  const lines = [];
  const telemetry = new OperationalTelemetry({
    nowIso: () => "2026-08-08T00:00:00.000Z",
  });
  logOperationalError(
    { error: (line) => lines.push(line) },
    telemetry,
    new Error("secret-token at room ABC234"),
    "background",
  );
  assert.equal(lines.length, 1);
  assert.match(lines[0], /INTERNAL_ERROR/);
  assert.equal(lines[0].includes("secret-token"), false);
  assert.equal(lines[0].includes("ABC234"), false);
  assert.equal(lines[0].includes("stack"), false);
});

test("就绪与指标接口提供请求编号、资源用量和聚合计数", async (context) => {
  const runtime = createOceanServer();
  runtime.httpServer.listen(0, "127.0.0.1");
  await once(runtime.httpServer, "listening");
  context.after(() => new Promise((resolve) => runtime.io.close(resolve)));
  const address = runtime.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const readyResponse = await fetch(`${baseUrl}/api/ready`);
  assert.equal(readyResponse.status, 200);
  assert.match(readyResponse.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);
  assert.equal((await readyResponse.json()).status, "ready");

  const metricsResponse = await fetch(`${baseUrl}/api/metrics`);
  assert.equal(metricsResponse.status, 200);
  assert.equal(metricsResponse.headers.get("cache-control"), "no-store");
  const metrics = await metricsResponse.json();
  assert.equal(metrics.stage, "postlaunch-v0.3");
  assert.ok(Number.isInteger(metrics.memoryMb.rss));
  assert.ok(Number.isInteger(metrics.memoryMb.heapUsed));
  assert.ok(metrics.counters.httpRequests >= 2);
  assert.equal(metrics.rooms.roomCount, 0);
  const serialized = JSON.stringify(metrics);
  for (const forbidden of ["roomCode", "nickname", "playerId", "reconnectToken"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
