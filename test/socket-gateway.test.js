"use strict";

const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const test = require("node:test");
const { io: createSocketClient } = require("socket.io-client");
const { createOceanServer } = require("../server/app");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  getBattlePlayerState,
  getBattleUnitById,
  replaceBattlePlayerState,
} = require("../server/game/battle-state");
const { InMemoryRoomService } = require("../server/game/room-service");
const { END_REASONS, MATCH_OUTCOMES } = require("../server/game/endgame");
const { ACTION_DURATION_MS, DEPLOYMENT_DURATION_MS } = require("../server/game/timing");
const {
  CLIENT_EVENTS,
  SERVER_EVENTS,
} = require("../server/socket/protocol");
const { damageBattleUnit } = require("../test-fixtures/battle");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

const TEST_TIMEOUT_MS = 3_000;

function createRecorder(socket) {
  const recorder = {
    errors: [],
    ready: [],
    sessions: [],
    states: [],
  };
  socket.on(SERVER_EVENTS.ERROR, (value) => recorder.errors.push(value));
  socket.on(SERVER_EVENTS.READY, (value) => recorder.ready.push(value));
  socket.on(SERVER_EVENTS.SESSION, (value) => recorder.sessions.push(value));
  socket.on(SERVER_EVENTS.STATE, (value) => recorder.states.push(value));
  return recorder;
}

async function waitForValue(readValues, predicate, message) {
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const match = [...readValues()].reverse().find(predicate);
    if (match) {
      return match;
    }
    await delay(5);
  }
  assert.fail(message);
}

function latestState(recorder) {
  assert.ok(recorder.states.length > 0, "客户端尚未收到房间状态");
  return recorder.states.at(-1);
}

function emitWithAck(socket, eventName, payload = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${eventName} 未在规定时间内应答`));
    }, TEST_TIMEOUT_MS);
    socket.emit(eventName, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function createHarness(context, options = {}) {
  let nowMs = options.nowMs ?? 1_000;
  const playerIds = ["player-1", "player-2", "player-3"];
  const randomValues = [0.9, 0.1, 0.8, 0.2];
  const roomService = new InMemoryRoomService({
    now: () => nowMs,
    roomCodeFactory: () => "ABC234",
    playerIdFactory: () => playerIds.shift(),
    random: () => randomValues.shift(),
    randomDeploymentFactory: () => createValidDeployment(),
  });
  const server = createOceanServer({
    roomService,
    timerSweepMs: 0,
    phasePresentationMs: options.phasePresentationMs ?? 0,
    logger: { error() {} },
    now: () => "2026-08-07T00:00:00.000Z",
  });
  server.httpServer.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.httpServer.once("listening", resolve);
    server.httpServer.once("error", reject);
  });
  const address = server.httpServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const clients = [];

  context.after(async () => {
    for (const { socket } of clients) {
      socket.disconnect();
    }
    if (server.httpServer.listening) {
      await new Promise((resolve) => server.io.close(resolve));
    }
  });

  async function connect() {
    const socket = createSocketClient(baseUrl, {
      autoConnect: false,
      forceNew: true,
      reconnection: false,
      transports: ["websocket"],
    });
    const recorder = createRecorder(socket);
    clients.push({ socket, recorder });
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
      socket.connect();
    });
    await waitForValue(
      () => recorder.ready,
      () => true,
      "客户端未收到 system:ready",
    );
    return { socket, recorder };
  }

  return {
    ...server,
    connect,
    roomService,
    setNow(value) {
      nowMs = value;
    },
  };
}

async function createTwoPlayerRoom(harness) {
  const first = await harness.connect();
  const second = await harness.connect();
  const created = await emitWithAck(
    first.socket,
    CLIENT_EVENTS.CREATE_ROOM,
    { nickname: "甲方" },
  );
  assert.equal(created.ok, true);
  await waitForValue(
    () => first.recorder.states,
    (state) => state.roomPhase === "WAITING",
    "创建者未收到 WAITING 状态",
  );

  const joined = await emitWithAck(
    second.socket,
    CLIENT_EVENTS.JOIN_ROOM,
    { roomCode: created.data.roomCode.toLowerCase(), nickname: "乙方" },
  );
  assert.equal(joined.ok, true);
  await Promise.all([
    waitForValue(
      () => first.recorder.states,
      (state) => state.roomPhase === "DEPLOYING",
      "创建者未收到 DEPLOYING 状态",
    ),
    waitForValue(
      () => second.recorder.states,
      (state) => state.roomPhase === "DEPLOYING",
      "加入者未收到 DEPLOYING 状态",
    ),
  ]);

  return {
    first,
    second,
    roomCode: created.data.roomCode,
    firstPlayerId: created.data.playerId,
    secondPlayerId: joined.data.playerId,
  };
}

async function submitDeployment(client) {
  const response = await emitWithAck(
    client.socket,
    CLIENT_EVENTS.SUBMIT_DEPLOYMENT,
    {
      deployment: createValidDeployment(),
      expectedVersion: latestState(client.recorder).stateVersion,
    },
  );
  assert.equal(response.ok, true);
  await waitForValue(
    () => client.recorder.states,
    (state) => state.stateVersion >= response.data.stateVersion,
    "部署后未收到新状态",
  );
}

async function readyDeployment(client) {
  const response = await emitWithAck(
    client.socket,
    CLIENT_EVENTS.READY_DEPLOYMENT,
    { expectedVersion: latestState(client.recorder).stateVersion },
  );
  assert.equal(response.ok, true);
  return response;
}

async function preparePlayingRoom(harness) {
  const room = await createTwoPlayerRoom(harness);
  await submitDeployment(room.first);
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.stateVersion === latestState(room.first.recorder).stateVersion,
    "第二名玩家未收到第一份部署后的状态",
  );
  await submitDeployment(room.second);
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.stateVersion === latestState(room.second.recorder).stateVersion,
    "第一名玩家未收到第二份部署后的状态",
  );
  await readyDeployment(room.first);
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.stateVersion === latestState(room.first.recorder).stateVersion,
    "第二名玩家未收到第一方准备状态",
  );
  await readyDeployment(room.second);

  const playing = await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "PLAYING",
    "房间没有由服务器自动进入 PLAYING",
  );
  await waitForValue(
    () => room.second.recorder.states,
    (state) =>
      state.roomPhase === "PLAYING" &&
      state.stateVersion === playing.stateVersion,
    "双方没有同步进入 PLAYING",
  );
  const serverRoom = harness.roomService.rooms.get(room.roomCode);
  for (const playerId of serverRoom.battleState.playerIds) {
    serverRoom.battleState.players[playerId].remainingUses.radar_scan = 0;
  }
  return room;
}

function pirateMiss(actionId, coordinate = "J1") {
  return {
    actionId,
    actionType: ACTION_TYPES.PIRATE_ATTACK,
    sourceId: "pirate",
    target: { kind: "cell", coordinate },
  };
}

function battleUnit(battle, playerId, unitId) {
  return getBattleUnitById(
    getBattlePlayerState(battle, playerId),
    unitId,
  );
}

function sinkUnits(battle, playerId, unitIds) {
  let next = battle;
  for (const unitId of unitIds) {
    const unit = battleUnit(next, playerId, unitId);
    next = damageBattleUnit(next, playerId, unitId, unit.hp);
  }
  return next;
}

function setRemainingUses(battle, playerId, changes) {
  const player = getBattlePlayerState(battle, playerId);
  return replaceBattlePlayerState(battle, playerId, {
    ...player,
    remainingUses: {
      ...player.remainingUses,
      ...changes,
    },
  });
}

function prepareSecondPlayerForAutomaticSkip(battle) {
  let next = sinkUnits(battle, "player-2", [
    "destroyer-i",
    "destroyer-ii",
    "pirate",
    "motorboat",
    "motorboat-2",
  ]);
  next = setRemainingUses(next, "player-2", {
    [ACTION_TYPES.HELICOPTER_STRAFE]: 0,
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });
  const player = getBattlePlayerState(next, "player-2");
  return replaceBattlePlayerState(next, "player-2", {
    ...player,
    pendingParalysisUnitIds: ["submarine", "nuclear"],
  });
}

function prepareLastSubmarineMissile(battle) {
  let next = sinkUnits(battle, "player-1", [
    "destroyer-i",
    "destroyer-ii",
    "pirate",
    "motorboat",
    "motorboat-2",
    "nuclear",
  ]);
  next = setRemainingUses(next, "player-1", {
    [ACTION_TYPES.SUBMARINE_MISSILE]: 1,
    [ACTION_TYPES.NUCLEAR_BOMB]: 0,
    [ACTION_TYPES.HELICOPTER_STRAFE]: 0,
  });
  next = sinkUnits(next, "player-2", [
    "destroyer-i",
    "destroyer-ii",
    "submarine",
    "pirate",
    "motorboat",
    "motorboat-2",
    "nuclear",
  ]);
  return setRemainingUses(next, "player-2", {
    [ACTION_TYPES.SUBMARINE_MISSILE]: 0,
    [ACTION_TYPES.NUCLEAR_BOMB]: 0,
    [ACTION_TYPES.HELICOPTER_STRAFE]: 0,
  });
}

test("Socket 协议创建和加入房间，并分别发送会话与安全状态", async (context) => {
  const harness = await createHarness(context);
  const room = await createTwoPlayerRoom(harness);
  const firstView = latestState(room.first.recorder);
  const secondView = latestState(room.second.recorder);

  assert.equal(room.first.recorder.ready.at(-1).stage, "postlaunch-v0.7.5");
  assert.equal(room.first.recorder.ready.at(-1).protocolVersion, "1.5");
  const firstSession = room.first.recorder.sessions.at(-1);
  assert.equal(firstSession.active, true);
  assert.equal(firstSession.roomCode, room.roomCode);
  assert.equal(firstSession.playerId, room.firstPlayerId);
  assert.match(firstSession.reconnectToken, /^[A-Za-z0-9_-]{32,128}$/);
  assert.equal(JSON.stringify(firstView).includes(firstSession.reconnectToken), false);
  assert.equal(firstView.own.playerId, room.firstPlayerId);
  assert.equal(secondView.own.playerId, room.secondPlayerId);
  assert.equal(firstView.seats.length, 2);
  assert.equal(Object.hasOwn(firstView.seats[1], "deployment"), false);
  assert.equal(Object.hasOwn(secondView.seats[0], "deployment"), false);
});

test("双方通过 Socket 完成部署、自动掷骰并进入服务器权威回合", async (context) => {
  const harness = await createHarness(context);
  const room = await preparePlayingRoom(harness);
  const firstView = latestState(room.first.recorder);
  const secondView = latestState(room.second.recorder);

  assert.equal(firstView.rolling.firstPlayerId, room.firstPlayerId);
  assert.equal(firstView.turn.currentPlayerId, room.firstPlayerId);
  assert.equal(firstView.turn.canAct, true);
  assert.equal(secondView.turn.canAct, false);
  assert.ok(
    room.first.recorder.states.some(
      (state) => state.roomPhase === "ROLLING" && state.rolling?.firstPlayerId,
    ),
  );
  assert.deepEqual(firstView.own.deployment, createValidDeployment());
  assert.equal(Object.hasOwn(firstView.battle.opponent, "units"), false);
});

test("Socket 身份绑定阻止冒用 playerId，行动原子结算后分别推送", async (context) => {
  const harness = await createHarness(context);
  const room = await preparePlayingRoom(harness);
  const versionBeforeSpoof = harness.roomService.getServerState(room.roomCode)
    .stateVersion;

  const spoofed = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SUBMIT_ACTION,
    {
      playerId: room.firstPlayerId,
      expectedVersion: latestState(room.second.recorder).stateVersion,
      intent: pirateMiss("spoofed-action"),
    },
  );
  assert.equal(spoofed.ok, false);
  assert.equal(spoofed.error.code, "NOT_CURRENT_PLAYER");
  assert.equal(
    harness.roomService.getServerState(room.roomCode).stateVersion,
    versionBeforeSpoof,
  );

  const firstStateIndex = room.first.recorder.states.length;
  const actionPayload = {
    expectedVersion: latestState(room.first.recorder).stateVersion,
    intent: pirateMiss("socket-action"),
  };
  const acted = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SUBMIT_ACTION,
    actionPayload,
  );
  assert.equal(acted.ok, true);
  assert.equal(acted.data.replayed, false);
  assert.ok(acted.data.resolution);
  await waitForValue(
    () => room.second.recorder.states,
    (state) =>
      state.roomPhase === "PLAYING" &&
      state.turn.currentPlayerId === room.secondPlayerId,
    "行动结算后没有切换到第二名玩家",
  );
  assert.ok(
    room.first.recorder.states
      .slice(firstStateIndex)
      .some((state) => state.turnPhase === "RESOLVING"),
  );
  assert.equal(
    Object.hasOwn(latestState(room.first.recorder).battle.opponent, "units"),
    false,
  );
  assert.equal(
    Object.hasOwn(latestState(room.second.recorder).battle.opponent, "units"),
    false,
  );
});

test("重复行动编号返回原安全结果，不二次结算且拒绝改写请求", async (context) => {
  const harness = await createHarness(context);
  const room = await preparePlayingRoom(harness);
  const payload = {
    expectedVersion: latestState(room.first.recorder).stateVersion,
    intent: pirateMiss("retry-action"),
  };
  const firstResponse = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SUBMIT_ACTION,
    payload,
  );
  assert.equal(firstResponse.ok, true);
  const stateAfterFirst = harness.roomService.getServerState(room.roomCode);

  const replayed = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SUBMIT_ACTION,
    payload,
  );
  assert.equal(replayed.ok, true);
  assert.equal(replayed.data.replayed, true);
  assert.deepEqual(replayed.data.resolution, firstResponse.data.resolution);
  assert.equal(
    harness.roomService.getServerState(room.roomCode).stateVersion,
    stateAfterFirst.stateVersion,
  );
  assert.equal(
    harness.roomService.getServerState(room.roomCode).battleState.actionLog.length,
    1,
  );

  const conflicting = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SUBMIT_ACTION,
    {
      ...payload,
      intent: pirateMiss("retry-action", "J2"),
    },
  );
  assert.equal(conflicting.ok, false);
  assert.equal(conflicting.error.code, "ACTION_ID_REUSE_CONFLICT");
});

test("协议拒绝未绑定、缺版本和旧版本请求，并主动回推最新状态", async (context) => {
  const harness = await createHarness(context);
  const unbound = await harness.connect();
  const notBound = await emitWithAck(
    unbound.socket,
    CLIENT_EVENTS.READY_DEPLOYMENT,
    { expectedVersion: 1 },
  );
  assert.equal(notBound.ok, false);
  assert.equal(notBound.error.code, "SOCKET_NOT_BOUND");

  const room = await createTwoPlayerRoom(harness);
  const missingVersion = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SUBMIT_DEPLOYMENT,
    { deployment: createValidDeployment() },
  );
  assert.equal(missingVersion.ok, false);
  assert.equal(missingVersion.error.code, "INVALID_EXPECTED_VERSION");

  const staleVersion = latestState(room.second.recorder).stateVersion;
  await submitDeployment(room.first);
  const stale = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SUBMIT_DEPLOYMENT,
    {
      deployment: createValidDeployment(),
      expectedVersion: staleVersion,
    },
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "STATE_VERSION_CONFLICT");
  const latest = await waitForValue(
    () => room.second.recorder.states,
    (state) => state.stateVersion > staleVersion,
    "旧版本请求后服务器没有回推最新状态",
  );
  assert.equal(latest.stateVersion, latestState(room.first.recorder).stateVersion);
});

test("服务端扫描到期计时器后主动广播自动部署和行动超时", async (context) => {
  const harness = await createHarness(context);
  const room = await createTwoPlayerRoom(harness);
  const deploymentDeadline = latestState(room.first.recorder)
    .deadlines.deploymentDeadlineAt;

  harness.setNow(deploymentDeadline);
  assert.deepEqual(await harness.gameGateway.sweepExpiredTimers(), [room.roomCode]);
  const playing = await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "PLAYING",
    "部署到期后没有自动进入正式对局",
  );
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.roomPhase === "PLAYING",
    "第二名玩家没有收到自动部署后的正式对局状态",
  );
  assert.equal(playing.seats.every((seat) => seat.autoPrepared), true);
  assert.ok(playing.own.deployment);
  assert.equal(Object.hasOwn(playing.seats[1], "deployment"), false);

  harness.setNow(deploymentDeadline + ACTION_DURATION_MS);
  assert.deepEqual(await harness.gameGateway.sweepExpiredTimers(), [room.roomCode]);
  const timedOut = await waitForValue(
    () => room.first.recorder.states,
    (state) =>
      state.turn?.currentPlayerId === room.secondPlayerId &&
      state.own.consecutiveActionTimeouts === 1,
    "行动到期后没有主动广播超时换手结果",
  );
  assert.equal(timedOut.turnEvents.at(-1).kind, "action_timeout");
  assert.equal(
    timedOut.deadlines.actionDeadlineAt,
    deploymentDeadline + ACTION_DURATION_MS * 2,
  );
  assert.equal(
    deploymentDeadline,
    1_000 + DEPLOYMENT_DURATION_MS,
  );
});

test("行动结算进入 AUTO_SKIPPING 后由网关自动跳过并广播记录", async (context) => {
  const harness = await createHarness(context);
  const room = await preparePlayingRoom(harness);
  const current = harness.roomService.getServerState(room.roomCode);
  harness.roomService.rooms.set(room.roomCode, {
    ...current,
    battleState: prepareSecondPlayerForAutomaticSkip(current.battleState),
  });
  const firstIndex = room.first.recorder.states.length;

  const response = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SUBMIT_ACTION,
    {
      expectedVersion: current.stateVersion,
      intent: pirateMiss("before-auto-skip"),
    },
  );
  assert.equal(response.ok, true);
  const automaticState = harness.roomService.getServerState(room.roomCode);
  assert.equal(automaticState.currentPlayerId, room.firstPlayerId);
  assert.equal(automaticState.turnNumber, 2);
  const returned = await waitForValue(
    () => room.first.recorder.states,
    (state) =>
      state.turn?.currentPlayerId === room.firstPlayerId &&
      state.turn.turnNumber === 2,
    "AUTO_SKIPPING 后没有自动回到第一名玩家",
  );
  assert.ok(
    room.first.recorder.states
      .slice(firstIndex)
      .some((state) => state.turnPhase === "AUTO_SKIPPING"),
  );
  assert.equal(returned.turnEvents.at(-1).kind, "automatic_skip");
});

test("终局条件出现后依次广播 FINAL_SALVO 和 FINISHED", async (context) => {
  const harness = await createHarness(context);
  const room = await preparePlayingRoom(harness);
  const current = harness.roomService.getServerState(room.roomCode);
  harness.roomService.rooms.set(room.roomCode, {
    ...current,
    battleState: prepareLastSubmarineMissile(current.battleState),
  });
  const firstIndex = room.first.recorder.states.length;

  const response = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SUBMIT_ACTION,
    {
      expectedVersion: current.stateVersion,
      intent: {
        actionId: "last-socket-missile",
        actionType: ACTION_TYPES.SUBMARINE_MISSILE,
        sourceId: "submarine",
        target: { kind: "cell", coordinate: "J1" },
      },
    },
  );
  assert.equal(response.ok, true);
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "FINAL_SALVO",
    "终局条件出现后没有进入手动鱼雷阶段",
  );
  for (let number = 1; number <= 3; number += 1) {
    const firstSelection = await emitWithAck(
      room.first.socket,
      CLIENT_EVENTS.SUBMIT_FINAL_SALVO,
      {
        expectedVersion: latestState(room.first.recorder).stateVersion,
        decoyId: `decoy-${number}`,
      },
    );
    assert.equal(firstSelection.ok, true);
    await waitForValue(
      () => room.second.recorder.states,
      (state) => state.stateVersion === firstSelection.data.stateVersion,
      "第二方没有同步第一方的秘密提交状态",
    );
    const secondSelection = await emitWithAck(
      room.second.socket,
      CLIENT_EVENTS.SUBMIT_FINAL_SALVO,
      {
        expectedVersion: latestState(room.second.recorder).stateVersion,
        decoyId: `decoy-${number}`,
      },
    );
    assert.equal(secondSelection.ok, true);
    await waitForValue(
      () => room.first.recorder.states,
      (state) => state.stateVersion >= secondSelection.data.stateVersion,
      "第一方没有同步本轮同时结算",
    );
  }
  const finished = await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "FINISHED",
    "终局鱼雷齐射后没有自动进入 FINISHED",
  );
  assert.ok(
    room.first.recorder.states
      .slice(firstIndex)
      .some((state) => state.roomPhase === "FINAL_SALVO"),
  );
  assert.ok(finished.battle.match.result);
});

test("对局开始前离开会关闭房间、通知双方并解除 Socket 绑定", async (context) => {
  const harness = await createHarness(context);
  const room = await createTwoPlayerRoom(harness);
  const response = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.LEAVE_ROOM,
    { expectedVersion: latestState(room.first.recorder).stateVersion },
  );
  assert.equal(response.ok, true);
  await Promise.all([
    waitForValue(
      () => room.first.recorder.states,
      (state) => state.roomPhase === "CLOSED",
      "离开方未收到 CLOSED 状态",
    ),
    waitForValue(
      () => room.second.recorder.states,
      (state) => state.roomPhase === "CLOSED",
      "另一方未收到 CLOSED 状态",
    ),
    waitForValue(
      () => room.first.recorder.sessions,
      (session) => session.active === false,
      "离开后未解除第一方连接绑定",
    ),
    waitForValue(
      () => room.second.recorder.sessions,
      (session) => session.active === false,
      "房间关闭后未解除第二方连接绑定",
    ),
  ]);

  const sync = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SYNC_ROOM,
  );
  assert.equal(sync.ok, false);
  assert.equal(sync.error.code, "SOCKET_NOT_BOUND");
});

test("私密凭证可在刷新式新连接中恢复座位，并轮换凭证与续接部署计时", async (context) => {
  const harness = await createHarness(context, { nowMs: 1_000 });
  const room = await createTwoPlayerRoom(harness);
  const originalSession = room.first.recorder.sessions.at(-1);
  const originalToken = originalSession.reconnectToken;

  harness.setNow(31_000);
  room.first.socket.disconnect();
  const paused = await waitForValue(
    () => room.second.recorder.states,
    (state) =>
      state.connectionPhase === "PAUSED_ONE_OFFLINE" &&
      state.connection.offlinePlayerIds.includes(room.firstPlayerId),
    "第一名玩家断线后房间没有暂停",
  );
  assert.equal(paused.deadlines.deploymentDeadlineAt, null);
  assert.deepEqual(paused.connection.pausedTimer, {
    kind: "deployment",
    remainingMs: 150_000,
  });
  assert.equal(JSON.stringify(paused).includes(originalToken), false);

  harness.setNow(100_000);
  const restored = await harness.connect();
  const response = await emitWithAck(
    restored.socket,
    CLIENT_EVENTS.RESUME_ROOM,
    { roomCode: room.roomCode, reconnectToken: originalToken },
  );
  assert.equal(response.ok, true);
  assert.equal(response.data.playerId, room.firstPlayerId);
  assert.notEqual(response.data.reconnectToken, originalToken);
  const resumed = await waitForValue(
    () => restored.recorder.states,
    (state) => state.connectionPhase === "CONNECTED",
    "新连接没有恢复原座位",
  );
  assert.equal(resumed.deadlines.deploymentDeadlineAt, 250_000);
  assert.equal(resumed.connection.pausedTimer, null);

  restored.socket.disconnect();
  await waitForValue(
    () => room.second.recorder.states,
    (state) =>
      state.connectionPhase === "PAUSED_ONE_OFFLINE" &&
      state.stateVersion > resumed.stateVersion,
    "恢复连接再次断线后没有重新暂停",
  );
  const rejectedClient = await harness.connect();
  const rejected = await emitWithAck(
    rejectedClient.socket,
    CLIENT_EVENTS.RESUME_ROOM,
    { roomCode: room.roomCode, reconnectToken: originalToken },
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "INVALID_RECONNECT_CREDENTIAL");
  assert.equal(JSON.stringify(rejected).includes(originalToken), false);
});

test("正式回合断线冻结 90 秒计时，恢复后按服务器剩余时间继续", async (context) => {
  const harness = await createHarness(context, { nowMs: 1_000 });
  const room = await preparePlayingRoom(harness);
  const secondToken = room.second.recorder.sessions.at(-1).reconnectToken;

  harness.setNow(21_000);
  room.second.socket.disconnect();
  const paused = await waitForValue(
    () => room.first.recorder.states,
    (state) => state.connectionPhase === "PAUSED_ONE_OFFLINE",
    "正式回合没有因断线暂停",
  );
  assert.equal(paused.turn.canAct, false);
  assert.equal(paused.deadlines.actionDeadlineAt, null);
  assert.deepEqual(paused.connection.pausedTimer, {
    kind: "action",
    remainingMs: 70_000,
  });

  harness.setNow(80_000);
  const restored = await harness.connect();
  const response = await emitWithAck(
    restored.socket,
    CLIENT_EVENTS.RESUME_ROOM,
    { roomCode: room.roomCode, reconnectToken: secondToken },
  );
  assert.equal(response.ok, true);
  const resumed = await waitForValue(
    () => room.first.recorder.states,
    (state) =>
      state.connectionPhase === "CONNECTED" &&
      state.stateVersion > paused.stateVersion,
    "双方在线后没有恢复正式回合",
  );
  assert.equal(resumed.deadlines.actionDeadlineAt, 150_000);
  assert.equal(resumed.turn.canAct, true);
});

test("正式对局单方断线满 120 秒后由服务器主动判负并广播", async (context) => {
  const harness = await createHarness(context, { nowMs: 1_000 });
  const room = await preparePlayingRoom(harness);

  harness.setNow(2_000);
  room.second.socket.disconnect();
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.connectionPhase === "PAUSED_ONE_OFFLINE",
    "断线后没有进入暂停",
  );
  harness.setNow(122_000);
  assert.deepEqual(await harness.gameGateway.sweepExpiredTimers(), [room.roomCode]);
  const finished = await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "FINISHED",
    "断线超时后没有广播终局",
  );
  assert.equal(finished.battle.match.result.winnerId, room.firstPlayerId);
  assert.equal(finished.battle.match.result.loserId, room.secondPlayerId);
  assert.equal(finished.battle.match.result.reason, END_REASONS.DISCONNECT_TIMEOUT);
});

test("双方分别断线时只在两人的独立截止时间都到达后取消对局", async (context) => {
  const harness = await createHarness(context, { nowMs: 1_000 });
  const room = await preparePlayingRoom(harness);

  harness.setNow(2_000);
  room.first.socket.disconnect();
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.connectionPhase === "PAUSED_ONE_OFFLINE",
    "第一方断线未暂停",
  );
  harness.setNow(5_000);
  room.second.socket.disconnect();
  await waitForValue(
    () => [harness.roomService.getServerState(room.roomCode)],
    (state) => state.connectionPhase === "PAUSED_BOTH_OFFLINE",
    "第二方断线后未进入双方离线",
  );

  harness.setNow(122_000);
  assert.deepEqual(await harness.gameGateway.sweepExpiredTimers(), []);
  harness.setNow(125_000);
  assert.deepEqual(await harness.gameGateway.sweepExpiredTimers(), [room.roomCode]);
  const canceled = harness.roomService.getServerState(room.roomCode);
  assert.equal(canceled.roomPhase, "CLOSED");
  assert.equal(canceled.closedReason, END_REASONS.BOTH_DISCONNECTED);
  assert.equal(canceled.battleState.match.result.outcome, MATCH_OUTCOMES.CANCELED);
  assert.equal(canceled.battleState.match.result.winnerId, null);
});

test("对局开始前断线超时关闭房间，不判胜负并通知在线方", async (context) => {
  const harness = await createHarness(context, { nowMs: 1_000 });
  const room = await createTwoPlayerRoom(harness);

  harness.setNow(2_000);
  room.second.socket.disconnect();
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.connectionPhase === "PAUSED_ONE_OFFLINE",
    "部署阶段未暂停",
  );
  harness.setNow(122_000);
  await harness.gameGateway.sweepExpiredTimers();
  const closed = await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "CLOSED",
    "部署阶段断线超时后未关闭房间",
  );
  assert.equal(closed.closedReason, "disconnect_timeout_before_match");
  assert.equal(closed.battle, null);
});

test("无凭证不能用房间码或 playerId 冒充恢复座位", async (context) => {
  const harness = await createHarness(context);
  const room = await createTwoPlayerRoom(harness);
  room.first.socket.disconnect();
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.connectionPhase === "PAUSED_ONE_OFFLINE",
    "断线后未暂停",
  );

  const attacker = await harness.connect();
  const response = await emitWithAck(
    attacker.socket,
    CLIENT_EVENTS.RESUME_ROOM,
    { roomCode: room.roomCode, playerId: room.firstPlayerId },
  );
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "INVALID_RECONNECT_CREDENTIAL");
  assert.equal(attacker.recorder.sessions.length, 0);
  assert.equal(
    harness.roomService.getServerState(room.roomCode).seats[0].online,
    false,
  );
});

test("ROLLING 展示期间断线会取消待执行转换，重连后才进入 PLAYING", async (context) => {
  const harness = await createHarness(context, {
    nowMs: 1_000,
    phasePresentationMs: 100,
  });
  const room = await createTwoPlayerRoom(harness);
  const firstToken = room.first.recorder.sessions.at(-1).reconnectToken;
  await submitDeployment(room.first);
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.stateVersion === latestState(room.first.recorder).stateVersion,
    "第二方未同步部署",
  );
  await submitDeployment(room.second);
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.stateVersion === latestState(room.second.recorder).stateVersion,
    "第一方未同步部署",
  );
  await readyDeployment(room.first);
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.stateVersion === latestState(room.first.recorder).stateVersion,
    "第二方未同步准备",
  );
  await readyDeployment(room.second);
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "ROLLING" && state.rolling?.firstPlayerId,
    "未进入 ROLLING 展示",
  );

  room.first.socket.disconnect();
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.connectionPhase === "PAUSED_ONE_OFFLINE",
    "ROLLING 断线后未暂停",
  );
  await delay(150);
  assert.equal(
    harness.roomService.getServerState(room.roomCode).roomPhase,
    "ROLLING",
  );

  const restored = await harness.connect();
  const resumed = await emitWithAck(
    restored.socket,
    CLIENT_EVENTS.RESUME_ROOM,
    { roomCode: room.roomCode, reconnectToken: firstToken },
  );
  assert.equal(resumed.ok, true);
  await waitForValue(
    () => restored.recorder.states,
    (state) => state.roomPhase === "PLAYING",
    "重连后没有继续进入 PLAYING",
  );
});

test("Socket 投降立即形成双方可复盘的 FINISHED 结果", async (context) => {
  const harness = await createHarness(context, { nowMs: 1_000 });
  const room = await preparePlayingRoom(harness);
  harness.setNow(6_000);

  const response = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SURRENDER_MATCH,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  assert.equal(response.ok, true);
  assert.equal(response.data.result.reason, END_REASONS.SURRENDER);

  const [firstFinished, secondFinished] = await Promise.all([
    waitForValue(
      () => room.first.recorder.states,
      (state) => state.roomPhase === "FINISHED",
      "胜方未收到投降终局",
    ),
    waitForValue(
      () => room.second.recorder.states,
      (state) => state.roomPhase === "FINISHED",
      "投降方未收到投降终局",
    ),
  ]);
  assert.equal(firstFinished.battle.match.result.winnerId, room.firstPlayerId);
  assert.equal(secondFinished.battle.match.result.loserId, room.secondPlayerId);
  assert.equal(firstFinished.matchSummary.durationMs, 5_000);
  assert.equal(firstFinished.turnEvents.at(-1).kind, "surrender");
  assert.equal(room.first.recorder.sessions.at(-1).active, true);
  assert.equal(room.second.recorder.sessions.at(-1).active, true);
});

test("在线玩家可在等待断线方时投降，断线方恢复后仍取得同一终局", async (context) => {
  const harness = await createHarness(context, { nowMs: 1_000 });
  const room = await preparePlayingRoom(harness);
  const secondToken = room.second.recorder.sessions.at(-1).reconnectToken;

  harness.setNow(2_000);
  room.second.socket.disconnect();
  const paused = await waitForValue(
    () => room.first.recorder.states,
    (state) => state.connectionPhase === "PAUSED_ONE_OFFLINE",
    "断线后没有暂停正式对局",
  );
  harness.setNow(3_000);
  const surrendered = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SURRENDER_MATCH,
    { expectedVersion: paused.stateVersion },
  );
  assert.equal(surrendered.ok, true);
  const finished = await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "FINISHED",
    "等待断线方期间投降后没有进入 FINISHED",
  );
  assert.equal(finished.battle.match.result.winnerId, room.secondPlayerId);
  assert.deepEqual(finished.deadlines.reconnectDeadlineAtByPlayer, {});

  const restored = await harness.connect();
  const resumed = await emitWithAck(
    restored.socket,
    CLIENT_EVENTS.RESUME_ROOM,
    { roomCode: room.roomCode, reconnectToken: secondToken },
  );
  assert.equal(resumed.ok, true);
  const restoredFinished = await waitForValue(
    () => restored.recorder.states,
    (state) => state.roomPhase === "FINISHED",
    "断线胜方恢复后没有取得终局复盘",
  );
  assert.deepEqual(
    restoredFinished.battle.match.result,
    finished.battle.match.result,
  );
});

test("正式对局不能直接离开，必须先投降形成结果再离开", async (context) => {
  const harness = await createHarness(context);
  const room = await preparePlayingRoom(harness);

  const directLeave = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.LEAVE_ROOM,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  assert.equal(directLeave.ok, false);
  assert.equal(directLeave.error.code, "LEAVE_NOT_ALLOWED");
  assert.equal(
    harness.roomService.getServerState(room.roomCode).roomPhase,
    "PLAYING",
  );

  const surrendered = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SURRENDER_MATCH,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  assert.equal(surrendered.ok, true);
  const finished = await waitForValue(
    () => room.second.recorder.states,
    (state) => state.roomPhase === "FINISHED",
    "投降后未形成终局",
  );
  const left = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.LEAVE_ROOM,
    { expectedVersion: finished.stateVersion },
  );
  assert.equal(left.ok, true);
  assert.equal(left.data.roomPhase, "WAITING");
});

test("赛后离开只解除离开方绑定，留下方回到 WAITING 并可邀请新玩家", async (context) => {
  const harness = await createHarness(context);
  const room = await preparePlayingRoom(harness);
  const surrendered = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SURRENDER_MATCH,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  assert.equal(surrendered.ok, true);
  const finished = await waitForValue(
    () => room.second.recorder.states,
    (state) => state.roomPhase === "FINISHED",
    "投降后未形成终局",
  );

  const left = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.LEAVE_ROOM,
    { expectedVersion: finished.stateVersion },
  );
  assert.equal(left.ok, true);
  const [waiting, inactive] = await Promise.all([
    waitForValue(
      () => room.first.recorder.states,
      (state) => state.roomPhase === "WAITING",
      "留下方没有回到 WAITING",
    ),
    waitForValue(
      () => room.second.recorder.sessions,
      (session) => session.active === false,
      "离开方没有解除 Socket 绑定",
    ),
  ]);
  assert.equal(inactive.roomCode, null);
  assert.equal(waiting.own.playerId, room.firstPlayerId);
  assert.equal(waiting.own.deployment, null);
  assert.equal(waiting.battle, null);
  assert.equal(
    room.first.recorder.sessions.some((session) => session.active === false),
    false,
  );

  const stillBound = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SYNC_ROOM,
  );
  assert.equal(stillBound.ok, true);
  const removed = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SYNC_ROOM,
  );
  assert.equal(removed.ok, false);
  assert.equal(removed.error.code, "SOCKET_NOT_BOUND");

  const newcomer = await harness.connect();
  const joined = await emitWithAck(
    newcomer.socket,
    CLIENT_EVENTS.JOIN_ROOM,
    { roomCode: room.roomCode, nickname: "丙方" },
  );
  assert.equal(joined.ok, true);
  assert.equal(joined.data.playerId, "player-3");
  await waitForValue(
    () => room.first.recorder.states,
    (state) =>
      state.roomPhase === "DEPLOYING" &&
      state.seats.some((seat) => seat.playerId === "player-3"),
    "新玩家加入后留下方没有进入新部署阶段",
  );
});

test("再来一局申请可广播和取消，双方确认后自动进入全新 DEPLOYING", async (context) => {
  const harness = await createHarness(context, { nowMs: 1_000 });
  const room = await preparePlayingRoom(harness);
  await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SURRENDER_MATCH,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "FINISHED",
    "没有进入结算阶段",
  );

  const firstRequested = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.REQUEST_REMATCH,
    { expectedVersion: latestState(room.first.recorder).stateVersion },
  );
  assert.equal(firstRequested.ok, true);
  const seenBySecond = await waitForValue(
    () => room.second.recorder.states,
    (state) =>
      state.roomPhase === "FINISHED" && state.rematch.opponentRequested,
    "对方未看到再来一局申请",
  );
  assert.equal(seenBySecond.rematch.ownRequested, false);

  const canceled = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.CANCEL_REMATCH,
    { expectedVersion: latestState(room.first.recorder).stateVersion },
  );
  assert.equal(canceled.ok, true);
  await waitForValue(
    () => room.second.recorder.states,
    (state) =>
      state.stateVersion >= canceled.data.stateVersion &&
      !state.rematch.opponentRequested,
    "取消申请没有广播给对方",
  );

  const reRequested = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.REQUEST_REMATCH,
    { expectedVersion: latestState(room.first.recorder).stateVersion },
  );
  assert.equal(reRequested.ok, true);
  await waitForValue(
    () => room.second.recorder.states,
    (state) =>
      state.stateVersion >= reRequested.data.stateVersion &&
      state.rematch.opponentRequested,
    "重新申请没有广播给对方",
  );
  harness.setNow(10_000);
  const secondRequested = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.REQUEST_REMATCH,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  assert.equal(secondRequested.ok, true, JSON.stringify(secondRequested));
  assert.equal(secondRequested.data.rematchStarted, true);
  const deploying = await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "DEPLOYING",
    "双方确认后没有进入全新部署",
  );
  assert.equal(deploying.deadlines.deploymentDeadlineAt, 190_000);
  assert.equal(deploying.own.deployment, null);
  assert.equal(deploying.battle, null);
  assert.deepEqual(deploying.rematch.requestedPlayerIds, []);
  assert.equal(deploying.matchSummary.startedAt, null);
});

test("双方已申请但有人断线时保持 FINISHED，恢复后才自动开始新局", async (context) => {
  const harness = await createHarness(context, { nowMs: 1_000 });
  const room = await preparePlayingRoom(harness);
  const firstToken = room.first.recorder.sessions.at(-1).reconnectToken;
  await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SURRENDER_MATCH,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "FINISHED",
    "没有进入结算阶段",
  );
  await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.REQUEST_REMATCH,
    { expectedVersion: latestState(room.first.recorder).stateVersion },
  );

  harness.setNow(2_000);
  room.first.socket.disconnect();
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.connectionPhase === "PAUSED_ONE_OFFLINE",
    "赛后断线没有反映到连接状态",
  );
  const secondRequested = await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.REQUEST_REMATCH,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  assert.equal(secondRequested.ok, true);
  assert.equal(secondRequested.data.rematchStarted, false);
  assert.equal(
    harness.roomService.getServerState(room.roomCode).roomPhase,
    "FINISHED",
  );

  harness.setNow(3_000);
  const restored = await harness.connect();
  const resumed = await emitWithAck(
    restored.socket,
    CLIENT_EVENTS.RESUME_ROOM,
    { roomCode: room.roomCode, reconnectToken: firstToken },
  );
  assert.equal(resumed.ok, true);
  await Promise.all([
    waitForValue(
      () => restored.recorder.states,
      (state) => state.roomPhase === "DEPLOYING",
      "恢复方没有进入新部署阶段",
    ),
    waitForValue(
      () => room.second.recorder.states,
      (state) => state.roomPhase === "DEPLOYING",
      "等待方没有进入新部署阶段",
    ),
  ]);
});

test("再来一局会清除上一局行动回执，同一行动编号可作为新行动使用", async (context) => {
  const harness = await createHarness(context);
  const room = await preparePlayingRoom(harness);
  const firstAction = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SUBMIT_ACTION,
    {
      expectedVersion: latestState(room.first.recorder).stateVersion,
      intent: pirateMiss("same-id-in-new-match"),
    },
  );
  assert.equal(firstAction.ok, true);
  assert.equal(firstAction.data.replayed, false);
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.turn?.currentPlayerId === room.secondPlayerId,
    "上一局行动后没有轮到第二方",
  );
  await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.SURRENDER_MATCH,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "FINISHED",
    "上一局没有结束",
  );
  await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.REQUEST_REMATCH,
    { expectedVersion: latestState(room.first.recorder).stateVersion },
  );
  await waitForValue(
    () => room.second.recorder.states,
    (state) => state.rematch.opponentRequested,
    "第二方没有看到第一方的新局申请",
  );
  await emitWithAck(
    room.second.socket,
    CLIENT_EVENTS.REQUEST_REMATCH,
    { expectedVersion: latestState(room.second.recorder).stateVersion },
  );
  await waitForValue(
    () => room.first.recorder.states,
    (state) => state.roomPhase === "DEPLOYING",
    "没有开始新部署",
  );

  await submitDeployment(room.first);
  await waitForValue(
    () => room.second.recorder.states,
    (state) =>
      state.stateVersion === latestState(room.first.recorder).stateVersion,
    "第二方没有同步新局第一份部署",
  );
  await submitDeployment(room.second);
  await waitForValue(
    () => room.first.recorder.states,
    (state) =>
      state.stateVersion === latestState(room.second.recorder).stateVersion,
    "第一方没有同步新局第二份部署",
  );
  await readyDeployment(room.first);
  await waitForValue(
    () => room.second.recorder.states,
    (state) =>
      state.stateVersion === latestState(room.first.recorder).stateVersion,
    "第二方没有同步新局准备",
  );
  const newSecondReady = await readyDeployment(room.second);
  await waitForValue(
    () => room.first.recorder.states,
    (state) =>
      state.stateVersion > newSecondReady.data.stateVersion &&
      state.roomPhase === "PLAYING" &&
      state.turn.currentPlayerId === room.firstPlayerId,
    "新局没有重新掷骰并轮到第一方",
  );

  const reused = await emitWithAck(
    room.first.socket,
    CLIENT_EVENTS.SUBMIT_ACTION,
    {
      expectedVersion: latestState(room.first.recorder).stateVersion,
      intent: {
        actionId: "same-id-in-new-match",
        actionType: ACTION_TYPES.RADAR_SCAN,
        sourceId: "carrier",
        target: { kind: "cell", coordinate: "A1" },
      },
    },
  );
  assert.equal(reused.ok, true, JSON.stringify(reused));
  assert.equal(reused.data.replayed, false);
  assert.equal(
    harness.roomService.getServerState(room.roomCode).battleState.actionLog.length,
    1,
  );
});
