"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { MATCH_STATUS } = require("../server/game/battle-state");
const {
  RECONNECT_DURATION_MS,
  disconnectPlayer,
  isDisconnectResolutionDue,
  processDisconnectTimeout,
  reconnectPlayer,
} = require("../server/game/connection");
const { END_REASONS, MATCH_OUTCOMES } = require("../server/game/endgame");
const {
  beginPlayerAction,
  completePlayerAction,
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
const { ACTION_DURATION_MS, DEPLOYMENT_DURATION_MS } = require("../server/game/timing");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

function createDeployingRoom(nowMs = 1_000) {
  return joinRoomState(
    createRoomState({
      roomCode: "ABC234",
      playerId: "player-1",
      nickname: "甲方",
    }),
    { playerId: "player-2", nickname: "乙方" },
    nowMs,
  );
}

function createPlayingRoom(nowMs = 1_000) {
  let room = createDeployingRoom(nowMs);
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

test("断线等待参数固定为 120 秒，WAITING 座位进入阻塞暂停", () => {
  const waiting = createRoomState({
    roomCode: "ABC234",
    playerId: "player-1",
    nickname: "甲方",
  });
  const paused = disconnectPlayer(waiting, "player-1", 5_000);

  assert.equal(RECONNECT_DURATION_MS, 120_000);
  assert.equal(paused.connectionPhase, CONNECTION_PHASES.PAUSED_ONE_OFFLINE);
  assert.equal(paused.seats[0].online, false);
  assert.equal(paused.seats[0].disconnectedAt, 5_000);
  assert.equal(paused.seats[0].reconnectDeadlineAt, 125_000);
  assert.equal(paused.pausedTimer, null);
  assert.throws(
    () => joinRoomState(
      paused,
      { playerId: "player-2", nickname: "乙方" },
      6_000,
    ),
    (error) => error.code === "ROOM_PAUSED",
  );
});

test("DEPLOYING 首次断线冻结剩余时间，全部上线后从剩余时间续计", () => {
  const deploying = createDeployingRoom(1_000);
  assert.equal(deploying.deploymentDeadlineAt, 1_000 + DEPLOYMENT_DURATION_MS);

  const paused = disconnectPlayer(deploying, "player-1", 31_000);
  assert.equal(paused.deploymentDeadlineAt, null);
  assert.deepEqual(paused.pausedTimer, {
    kind: "deployment",
    remainingMs: 150_000,
  });
  assert.throws(
    () => submitDeployment(
      paused,
      "player-2",
      createValidDeployment(),
      80_000,
    ),
    (error) => error.code === "ROOM_PAUSED",
  );

  const resumed = reconnectPlayer(paused, "player-1", 100_000);
  assert.equal(resumed.connectionPhase, CONNECTION_PHASES.CONNECTED);
  assert.equal(resumed.deploymentDeadlineAt, 250_000);
  assert.equal(resumed.pausedTimer, null);
  assert.equal(resumed.seats[0].reconnectDeadlineAt, null);
});

test("双方断线使用各自截止时间，单方先恢复不会启动冻结计时", () => {
  let room = createDeployingRoom(1_000);
  room = disconnectPlayer(room, "player-1", 20_000);
  room = disconnectPlayer(room, "player-2", 50_000);

  assert.equal(room.connectionPhase, CONNECTION_PHASES.PAUSED_BOTH_OFFLINE);
  assert.equal(room.seats[0].reconnectDeadlineAt, 140_000);
  assert.equal(room.seats[1].reconnectDeadlineAt, 170_000);
  const frozen = structuredClone(room.pausedTimer);

  room = reconnectPlayer(room, "player-1", 139_999);
  assert.equal(room.connectionPhase, CONNECTION_PHASES.PAUSED_ONE_OFFLINE);
  assert.equal(room.deploymentDeadlineAt, null);
  assert.deepEqual(room.pausedTimer, frozen);
});

test("PLAYING 的 90 秒行动计时在任一方断线时冻结并禁止行动", () => {
  const playing = createPlayingRoom(1_000);
  assert.equal(playing.actionDeadlineAt, 1_000 + ACTION_DURATION_MS);

  const paused = disconnectPlayer(playing, "player-2", 21_000);
  assert.equal(paused.actionDeadlineAt, null);
  assert.deepEqual(paused.pausedTimer, {
    kind: "action",
    remainingMs: 70_000,
  });
  assert.equal(createRoomView(paused, "player-1", 30_000).turn.canAct, false);
  assert.throws(
    () => beginPlayerAction(paused, "player-1", {
      actionId: "paused-action",
      actionType: "pirate_attack",
      sourceId: "pirate",
      target: { kind: "cell", coordinate: "J1" },
    }, 30_000),
    (error) => error.code === "ROOM_PAUSED",
  );

  const resumed = reconnectPlayer(paused, "player-2", 80_000);
  assert.equal(resumed.actionDeadlineAt, 150_000);
  assert.equal(createRoomView(resumed, "player-1", 80_000).turn.canAct, true);
});

test("重连必须发生在截止时刻之前，截止瞬间起拒绝恢复", () => {
  const paused = disconnectPlayer(
    createRoomState({
      roomCode: "ABC234",
      playerId: "player-1",
      nickname: "甲方",
    }),
    "player-1",
    10_000,
  );
  assert.doesNotThrow(() => reconnectPlayer(paused, "player-1", 129_999));
  assert.throws(
    () => reconnectPlayer(paused, "player-1", 130_000),
    (error) => error.code === "RECONNECT_DEADLINE_EXPIRED",
  );
});

test("对局开始前一方断线超时关闭房间且不产生胜负", () => {
  const paused = disconnectPlayer(createDeployingRoom(1_000), "player-2", 2_000);
  assert.equal(isDisconnectResolutionDue(paused, 121_999), false);
  assert.equal(isDisconnectResolutionDue(paused, 122_000), true);

  const closed = processDisconnectTimeout(paused, 122_000);
  assert.equal(closed.roomPhase, ROOM_PHASES.CLOSED);
  assert.equal(closed.closedReason, "disconnect_timeout_before_match");
  assert.equal(closed.battleState, null);
  assert.equal(closed.seats[1].reconnectDeadlineAt, null);
});

test("双方均离线时必须等各自截止时间全部到达才取消", () => {
  let room = createPlayingRoom(1_000);
  room = disconnectPlayer(room, "player-1", 2_000);
  room = disconnectPlayer(room, "player-2", 5_000);

  assert.equal(isDisconnectResolutionDue(room, 122_000), false);
  assert.equal(isDisconnectResolutionDue(room, 124_999), false);
  assert.equal(isDisconnectResolutionDue(room, 125_000), true);
  const canceled = processDisconnectTimeout(room, 125_000);
  assert.equal(canceled.roomPhase, ROOM_PHASES.CLOSED);
  assert.equal(canceled.closedReason, END_REASONS.BOTH_DISCONNECTED);
  assert.equal(canceled.battleState.match.result.outcome, MATCH_OUTCOMES.CANCELED);
  assert.equal(canceled.battleState.match.result.winnerId, null);
});

test("正式对局一方在线而断线方超时，由在线方获胜", () => {
  const paused = disconnectPlayer(createPlayingRoom(1_000), "player-2", 2_000);
  const finished = processDisconnectTimeout(paused, 122_000);

  assert.equal(finished.roomPhase, ROOM_PHASES.FINISHED);
  assert.equal(finished.battleState.match.status, MATCH_STATUS.FINISHED);
  assert.equal(finished.battleState.match.result.winnerId, "player-1");
  assert.equal(finished.battleState.match.result.loserId, "player-2");
  assert.equal(
    finished.battleState.match.result.reason,
    END_REASONS.DISCONNECT_TIMEOUT,
  );
});

test("一方按时返回后，已超过截止时间的另一离线方立即判负", () => {
  let room = createPlayingRoom(1_000);
  room = disconnectPlayer(room, "player-1", 2_000);
  room = disconnectPlayer(room, "player-2", 20_000);
  room = reconnectPlayer(room, "player-2", 130_000);

  assert.equal(room.connectionPhase, CONNECTION_PHASES.PAUSED_ONE_OFFLINE);
  assert.equal(isDisconnectResolutionDue(room, 130_000), true);
  const finished = processDisconnectTimeout(room, 130_000);
  assert.equal(finished.battleState.match.result.loserId, "player-1");
  assert.equal(finished.battleState.match.result.winnerId, "player-2");
});

test("FINAL_SALVO 展示期间断线超时以断线判负覆盖尚未展示完的结果", () => {
  const playing = createPlayingRoom(1_000);
  const originalResult = {
    outcome: MATCH_OUTCOMES.DRAW,
    winnerId: null,
    loserId: null,
    reason: END_REASONS.FINAL_SALVO_TIE,
    trigger: { kind: "final_salvo" },
  };
  const finalSalvo = {
    ...playing,
    roomPhase: ROOM_PHASES.FINAL_SALVO,
    turnPhase: null,
    currentPlayerId: null,
    turnActionState: null,
    pendingAction: null,
    actionDeadlineAt: null,
    matchFinishedAt: 1_500,
    battleState: {
      ...playing.battleState,
      match: {
        status: MATCH_STATUS.FINISHED,
        result: originalResult,
        finalSalvo: { shots: [], damageEvents: [], carrierHpByPlayer: {} },
      },
    },
  };
  const paused = disconnectPlayer(finalSalvo, "player-2", 2_000);
  const finished = processDisconnectTimeout(paused, 122_000);

  assert.equal(finished.roomPhase, ROOM_PHASES.FINISHED);
  assert.equal(finished.battleState.match.result.winnerId, "player-1");
  assert.equal(finished.battleState.match.result.reason, END_REASONS.DISCONNECT_TIMEOUT);
  assert.deepEqual(
    finished.battleState.match.finalSalvo,
    finalSalvo.battleState.match.finalSalvo,
  );
});

test("行动已被接受后即使发生断线仍完成一次原子结算并冻结下一回合", () => {
  const playing = createPlayingRoom(1_000);
  const resolving = beginPlayerAction(playing, "player-1", {
    actionId: "accepted-before-offline",
    actionType: "pirate_attack",
    sourceId: "pirate",
    target: { kind: "cell", coordinate: "J1" },
  }, 2_000);
  const paused = disconnectPlayer(resolving, "player-2", 3_000);
  const completed = completePlayerAction(paused, 4_000);

  assert.equal(completed.battleState.actionLog.length, 1);
  assert.equal(completed.connectionPhase, CONNECTION_PHASES.PAUSED_ONE_OFFLINE);
  assert.equal(completed.actionDeadlineAt, null);
  assert.deepEqual(completed.pausedTimer, {
    kind: "action",
    remainingMs: ACTION_DURATION_MS,
  });
});

test("服务只保存重连凭证摘要，成功恢复后轮换且旧凭证失效", () => {
  let nowMs = 1_000;
  const playerIds = ["player-1", "player-2"];
  const tokens = [
    "A".repeat(32),
    "B".repeat(32),
    "C".repeat(32),
  ];
  const service = new InMemoryRoomService({
    now: () => nowMs,
    roomCodeFactory: () => "ABC234",
    playerIdFactory: () => playerIds.shift(),
    reconnectTokenFactory: () => tokens.shift(),
  });
  const created = service.createRoom({ nickname: "甲方" });
  service.joinRoom({ roomCode: created.roomCode, nickname: "乙方" });

  assert.equal(
    JSON.stringify(service.getServerState(created.roomCode))
      .includes(created.reconnectToken),
    false,
  );
  service.disconnect({
    roomCode: created.roomCode,
    playerId: created.playerId,
  });
  nowMs = 2_000;
  const resumed = service.resume({
    roomCode: created.roomCode,
    reconnectToken: created.reconnectToken,
  });
  assert.equal(resumed.playerId, created.playerId);
  assert.equal(resumed.reconnectToken, "C".repeat(32));
  assert.notEqual(resumed.reconnectToken, created.reconnectToken);

  service.disconnect({
    roomCode: created.roomCode,
    playerId: created.playerId,
  });
  assert.throws(
    () => service.resume({
      roomCode: created.roomCode,
      reconnectToken: created.reconnectToken,
    }),
    (error) =>
      error.code === "INVALID_RECONNECT_CREDENTIAL" &&
      !JSON.stringify(error.details).includes(created.reconnectToken),
  );
});
