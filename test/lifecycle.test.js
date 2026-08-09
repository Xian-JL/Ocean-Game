"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  disconnectPlayer,
  reconnectPlayer,
} = require("../server/game/connection");
const { END_REASONS } = require("../server/game/endgame");
const {
  cancelRematch,
  leaveFinishedRoom,
  requestRematch,
  startRematch,
  surrenderMatch,
} = require("../server/game/lifecycle");
const {
  beginPlayerAction,
  createRoomView,
  determineFirstPlayer,
  startPlaying,
} = require("../server/game/match");
const { InMemoryRoomService } = require("../server/game/room-service");
const {
  CONNECTION_PHASES,
  ROOM_PHASES,
  createRoomState,
  joinRoomState,
  setPlayerReady,
  submitDeployment,
} = require("../server/game/room");
const { DEPLOYMENT_DURATION_MS } = require("../server/game/timing");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

function createPlayingRoom(nowMs = 1_000) {
  let room = createRoomState({
    roomCode: "ABC234",
    playerId: "player-1",
    nickname: "甲方",
  });
  room = joinRoomState(
    room,
    { playerId: "player-2", nickname: "乙方" },
    nowMs,
  );
  room = submitDeployment(
    room,
    "player-1",
    createValidDeployment(),
    nowMs,
  );
  room = submitDeployment(
    room,
    "player-2",
    createValidDeployment(),
    nowMs,
  );
  room = setPlayerReady(room, "player-1", nowMs);
  room = setPlayerReady(room, "player-2", nowMs);
  const rolls = [0.9, 0.1];
  room = determineFirstPlayer(room, () => rolls.shift());
  room = startPlaying(room, nowMs);
  for (const playerId of room.battleState.playerIds) {
    room.battleState.players[playerId].remainingUses.radar_scan = 0;
  }
  return room;
}

function pirateMiss(actionId) {
  return {
    actionId,
    actionType: "pirate_attack",
    sourceId: "pirate",
    target: { kind: "cell", coordinate: "J1" },
  };
}

test("非当前玩家也可主动投降，并生成可复盘的终局时间与事件", () => {
  const playing = createPlayingRoom(1_000);
  const finished = surrenderMatch(playing, "player-2", 5_000);

  assert.equal(finished.roomPhase, ROOM_PHASES.FINISHED);
  assert.equal(finished.battleState.match.result.winnerId, "player-1");
  assert.equal(finished.battleState.match.result.loserId, "player-2");
  assert.equal(finished.battleState.match.result.reason, END_REASONS.SURRENDER);
  assert.equal(finished.matchStartedAt, 1_000);
  assert.equal(finished.matchFinishedAt, 5_000);
  assert.equal(finished.turnEvents.at(-1).kind, "surrender");

  const view = createRoomView(finished, "player-1", 9_000);
  assert.deepEqual(view.matchSummary, {
    startedAt: 1_000,
    finishedAt: 5_000,
    durationMs: 4_000,
    turnCount: 1,
  });
});

test("在线玩家可在等待断线方时投降，离线席位不能冒用投降", () => {
  const playing = createPlayingRoom(1_000);
  const paused = disconnectPlayer(playing, "player-2", 2_000);

  assert.throws(
    () => surrenderMatch(paused, "player-2", 3_000),
    (error) => error.code === "PLAYER_OFFLINE",
  );
  const finished = surrenderMatch(paused, "player-1", 3_000);
  assert.equal(finished.connectionPhase, CONNECTION_PHASES.PAUSED_ONE_OFFLINE);
  assert.equal(finished.battleState.match.result.winnerId, "player-2");
  assert.equal(finished.seats[1].reconnectDeadlineAt, null);
});

test("已进入 RESOLVING 的行动必须先完成，期间拒绝投降", () => {
  const playing = createPlayingRoom(1_000);
  const resolving = beginPlayerAction(
    playing,
    "player-1",
    pirateMiss("pending-before-surrender"),
    1_500,
  );

  assert.throws(
    () => surrenderMatch(resolving, "player-2", 1_600),
    (error) => error.code === "ACTION_RESOLUTION_PENDING",
  );
});

test("再来一局申请可单方发起和取消，双方视图含义相反且无歧义", () => {
  let room = surrenderMatch(createPlayingRoom(), "player-2", 5_000);
  room = requestRematch(room, "player-1");

  const firstView = createRoomView(room, "player-1", 5_000);
  const secondView = createRoomView(room, "player-2", 5_000);
  assert.deepEqual(firstView.rematch, {
    ownRequested: true,
    opponentRequested: false,
    requestedPlayerIds: ["player-1"],
  });
  assert.deepEqual(secondView.rematch, {
    ownRequested: false,
    opponentRequested: true,
    requestedPlayerIds: ["player-1"],
  });

  room = cancelRematch(room, "player-1");
  assert.equal(room.rematchRequestedByPlayer["player-1"], false);
  assert.throws(
    () => cancelRematch(room, "player-1"),
    (error) => error.code === "REMATCH_NOT_REQUESTED",
  );
});

test("双方确认后开始全新部署，旧部署、资源、记录、计时和先手全部清空", () => {
  let room = surrenderMatch(createPlayingRoom(1_000), "player-2", 5_000);
  room = requestRematch(room, "player-1");
  room = requestRematch(room, "player-2");
  const rematch = startRematch(room, 10_000);

  assert.equal(rematch.roomPhase, ROOM_PHASES.DEPLOYING);
  assert.equal(rematch.deploymentDeadlineAt, 10_000 + DEPLOYMENT_DURATION_MS);
  assert.equal(rematch.ownerPlayerId, "player-1");
  assert.deepEqual(
    rematch.seats.map(({ playerId, nickname }) => ({ playerId, nickname })),
    [
      { playerId: "player-1", nickname: "甲方" },
      { playerId: "player-2", nickname: "乙方" },
    ],
  );
  assert.ok(
    rematch.seats.every(
      (seat) =>
        seat.deployment === null &&
        seat.ready === false &&
        seat.autoPrepared === false,
    ),
  );
  assert.equal(rematch.battleState, null);
  assert.equal(rematch.rolling, null);
  assert.equal(rematch.turnNumber, 0);
  assert.equal(rematch.matchStartedAt, null);
  assert.equal(rematch.matchFinishedAt, null);
  assert.deepEqual(rematch.turnEvents, []);
  assert.deepEqual(rematch.systemEvents, []);
  assert.deepEqual(rematch.consecutiveActionTimeouts, {
    "player-1": 0,
    "player-2": 0,
  });
  assert.deepEqual(rematch.rematchRequestedByPlayer, {
    "player-1": false,
    "player-2": false,
  });
});

test("双方虽已申请但有人离线时不开始新局，恢复连接后才允许重置", () => {
  let room = surrenderMatch(createPlayingRoom(), "player-2", 5_000);
  room = requestRematch(room, "player-1");
  room = disconnectPlayer(room, "player-1", 6_000);
  room = requestRematch(room, "player-2");

  assert.throws(
    () => startRematch(room, 7_000),
    (error) => error.code === "ROOM_PAUSED",
  );
  room = reconnectPlayer(room, "player-1", 8_000);
  assert.equal(startRematch(room, 8_000).roomPhase, ROOM_PHASES.DEPLOYING);
});

test("赛后一方离开时留下方成为房主并回到无上局资源的 WAITING", () => {
  const finished = surrenderMatch(createPlayingRoom(), "player-2", 5_000);
  const waiting = leaveFinishedRoom(finished, "player-2", 6_000);

  assert.equal(waiting.roomPhase, ROOM_PHASES.WAITING);
  assert.equal(waiting.ownerPlayerId, "player-1");
  assert.deepEqual(waiting.seats.map((seat) => seat.playerId), ["player-1"]);
  assert.equal(waiting.seats[0].deployment, null);
  assert.equal(waiting.battleState, null);
  assert.equal(waiting.matchStartedAt, null);
  assert.equal(waiting.matchFinishedAt, null);
  assert.deepEqual(waiting.turnEvents, []);
});

test("赛后留下方若已离线，转入 WAITING 时重新获得完整 120 秒恢复期", () => {
  let finished = surrenderMatch(createPlayingRoom(), "player-2", 5_000);
  finished = disconnectPlayer(finished, "player-1", 6_000);
  const waiting = leaveFinishedRoom(finished, "player-2", 7_000);

  assert.equal(waiting.connectionPhase, CONNECTION_PHASES.PAUSED_ONE_OFFLINE);
  assert.equal(waiting.seats[0].disconnectedAt, 7_000);
  assert.equal(waiting.seats[0].reconnectDeadlineAt, 127_000);
});

test("服务在赛后只注销离开方凭证，留下方可恢复且房间可加入新玩家", () => {
  let nowMs = 1_000;
  const playerIds = ["player-1", "player-2", "player-3"];
  const rolls = [0.9, 0.1];
  const service = new InMemoryRoomService({
    now: () => nowMs,
    roomCodeFactory: () => "ABC234",
    playerIdFactory: () => playerIds.shift(),
    random: () => rolls.shift(),
  });
  const created = service.createRoom({ nickname: "甲方" });
  const joined = service.joinRoom({
    roomCode: created.roomCode,
    nickname: "乙方",
    expectedVersion: created.view.stateVersion,
  });
  let view = service.submitDeployment({
    roomCode: created.roomCode,
    playerId: created.playerId,
    deployment: createValidDeployment(),
    expectedVersion: joined.view.stateVersion,
  });
  view = service.submitDeployment({
    roomCode: created.roomCode,
    playerId: joined.playerId,
    deployment: createValidDeployment(),
    expectedVersion: view.stateVersion,
  });
  view = service.ready({
    roomCode: created.roomCode,
    playerId: created.playerId,
    expectedVersion: view.stateVersion,
  });
  view = service.ready({
    roomCode: created.roomCode,
    playerId: joined.playerId,
    expectedVersion: view.stateVersion,
  });
  let views = service.determineFirstPlayer({
    roomCode: created.roomCode,
    expectedVersion: view.stateVersion,
  });
  views = service.startPlaying({
    roomCode: created.roomCode,
    expectedVersion: views[created.playerId].stateVersion,
  });
  views = service.surrender({
    roomCode: created.roomCode,
    playerId: joined.playerId,
    expectedVersion: views[joined.playerId].stateVersion,
  });
  const left = service.leaveAfterMatch({
    roomCode: created.roomCode,
    playerId: joined.playerId,
    expectedVersion: views[joined.playerId].stateVersion,
  });
  const staleDisconnect = service.disconnect({
    roomCode: created.roomCode,
    playerId: joined.playerId,
  });
  assert.equal(staleDisconnect.changed, false);
  assert.equal(
    service.getServerState(created.roomCode).connectionPhase,
    "CONNECTED",
  );
  assert.equal(service.getServerState(created.roomCode).roomPhase, "WAITING");

  assert.throws(
    () => service.resume({
      roomCode: created.roomCode,
      reconnectToken: joined.reconnectToken,
    }),
    (error) => error.code === "INVALID_RECONNECT_CREDENTIAL",
  );
  nowMs = 2_000;
  service.disconnect({
    roomCode: created.roomCode,
    playerId: created.playerId,
  });
  const restored = service.resume({
    roomCode: created.roomCode,
    reconnectToken: created.reconnectToken,
  });
  assert.equal(restored.playerId, created.playerId);
  assert.notEqual(restored.reconnectToken, created.reconnectToken);

  const newcomer = service.joinRoom({
    roomCode: created.roomCode,
    nickname: "丙方",
    expectedVersion: service.getServerState(created.roomCode).stateVersion,
  });
  assert.equal(left.remainingPlayerId, created.playerId);
  assert.equal(newcomer.playerId, "player-3");
  assert.equal(newcomer.view.roomPhase, ROOM_PHASES.DEPLOYING);
});
