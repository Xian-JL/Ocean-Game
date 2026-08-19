"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const { createOceanServer } = require("../server/app");
const { InMemoryRoomService } = require("../server/game/room-service");
const { FixedWindowRateLimiter } = require("../server/operations/rate-limiter");

test("固定窗口限流达到上限后返回可重试时间，窗口结束后恢复", () => {
  let nowMs = 1_000;
  const limiter = new FixedWindowRateLimiter({ now: () => nowMs });
  assert.equal(limiter.consume("client", { limit: 2, windowMs: 500 }).remaining, 1);
  assert.equal(limiter.consume("client", { limit: 2, windowMs: 500 }).remaining, 0);
  assert.throws(
    () => limiter.consume("client", { limit: 2, windowMs: 500 }),
    (error) => error.code === "RATE_LIMITED" && error.details.retryAfterMs === 500,
  );
  nowMs = 1_500;
  assert.equal(limiter.consume("client", { limit: 2, windowMs: 500 }).remaining, 1);
});

test("内存服务限制房间总数，并在保留期后清理关闭房间", () => {
  let nowMs = 10_000;
  let sequence = 0;
  const service = new InMemoryRoomService({
    now: () => nowMs,
    maxRooms: 1,
    closedRoomRetentionMs: 100,
    finishedRoomRetentionMs: 100,
    roomCodeFactory: () => "ABC234",
    playerIdFactory: () => `player-${sequence += 1}`,
    reconnectTokenFactory: () => `${"a".repeat(31)}${sequence}`,
  });
  const created = service.createRoom({ nickname: "房主" });
  assert.throws(
    () => service.createRoom({ nickname: "另一房主" }),
    (error) => error.code === "SERVER_CAPACITY_REACHED",
  );
  service.leaveBeforeMatch({
    roomCode: created.roomCode,
    playerId: created.playerId,
    expectedVersion: 1,
  });
  nowMs += 99;
  assert.deepEqual(service.cleanupExpiredRooms(), []);
  nowMs += 1;
  assert.deepEqual(service.cleanupExpiredRooms(), [created.roomCode]);
  assert.equal(service.getOperationsSnapshot().roomCount, 0);
  assert.equal(service.createRoom({ nickname: "新房主" }).roomCode, "ABC234");
});

test("公开状态接口只返回聚合运行信息，不包含私密对局标识", async (context) => {
  let nowMs = 20_000;
  const runtime = createOceanServer({ nowMs: () => nowMs, startedAtMs: 10_000 });
  runtime.httpServer.listen(0, "127.0.0.1");
  await once(runtime.httpServer, "listening");
  context.after(() => new Promise((resolve) => runtime.io.close(resolve)));
  const address = runtime.httpServer.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/status`);
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.stage, "Ocean-v1.2");
  assert.equal(status.uptimeSeconds, 10);
  assert.equal(status.roomCount, 0);
  assert.equal(status.maxRooms, 200);
  for (const forbidden of ["reconnectToken", "roomCode", "nickname", "playerId"]) {
    assert.equal(JSON.stringify(status).includes(forbidden), false, forbidden);
  }
});

test("进入页包含冷启动解释、自动退避参数和手动重连入口", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(__dirname, "../public/js/app.js"), "utf8");
  assert.match(source, /免费服务器可能正在从休眠中唤醒/);
  assert.match(source, /reconnectionDelayMax: 8_000/);
  assert.match(source, /data-action="retry-connection"/);
  assert.match(source, /window\.addEventListener\("offline"/);
  assert.match(source, /window\.addEventListener\("online"/);
});
