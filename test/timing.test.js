"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  getBattlePlayerState,
  getBattleUnitById,
  replaceBattlePlayerState,
} = require("../server/game/battle-state");
const { END_REASONS } = require("../server/game/endgame");
const {
  TURN_PHASES,
  beginPlayerAction,
  completeAutomaticTurnSkip,
  completePlayerAction,
  createRoomView,
  determineFirstPlayer,
  processActionTimeout,
  startPlaying,
} = require("../server/game/match");
const { InMemoryRoomService } = require("../server/game/room-service");
const {
  ROOM_PHASES,
  completeDeploymentTimeout,
  createRoomState,
  joinRoomState,
  setPlayerReady,
  submitDeployment,
} = require("../server/game/room");
const {
  ACTION_DURATION_MS,
  DEPLOYMENT_DURATION_MS,
  MAX_CONSECUTIVE_ACTION_TIMEOUTS,
  createDeadline,
} = require("../server/game/timing");
const { setUnitStatus } = require("../server/game/action-state");
const {
  createValidDeployment,
} = require("../test-fixtures/valid-deployment");

const JOIN_TIME = 1_000;
const START_TIME = 10_000;

function sequenceRandom(values) {
  const queue = [...values];
  return () => queue.shift();
}

function createDeployingRoom(joinTime = JOIN_TIME) {
  return joinRoomState(
    createRoomState({
      roomCode: "ABC234",
      playerId: "player-1",
      nickname: "甲方",
    }),
    { playerId: "player-2", nickname: "乙方" },
    joinTime,
  );
}

function createRollingRoom() {
  let room = createDeployingRoom();
  room = submitDeployment(room, "player-1", createValidDeployment(), JOIN_TIME);
  room = submitDeployment(room, "player-2", createValidDeployment(), JOIN_TIME);
  room = setPlayerReady(room, "player-1", JOIN_TIME);
  return setPlayerReady(room, "player-2", JOIN_TIME);
}

function createPlayingRoom(startTime = START_TIME) {
  const decided = determineFirstPlayer(
    createRollingRoom(),
    sequenceRandom([0.9, 0.1]),
  );
  const room = startPlaying(decided, startTime);
  for (const playerId of room.battleState.playerIds) {
    room.battleState.players[playerId].remainingUses.radar_scan = 0;
  }
  return room;
}

function pirateMiss(actionId, coordinate) {
  return {
    actionId,
    actionType: ACTION_TYPES.PIRATE_ATTACK,
    sourceId: "pirate",
    target: { kind: "cell", coordinate },
  };
}

function completePirateMiss(room, playerId, actionId, coordinate, beginAt, completeAt) {
  return completePlayerAction(
    beginPlayerAction(
      room,
      playerId,
      pirateMiss(actionId, coordinate),
      beginAt,
    ),
    completeAt,
  );
}

test("冻结计时参数为部署 180 秒、行动 90 秒和连续超时 3 次", () => {
  assert.equal(DEPLOYMENT_DURATION_MS, 180_000);
  assert.equal(ACTION_DURATION_MS, 90_000);
  assert.equal(MAX_CONSECUTIVE_ACTION_TIMEOUTS, 3);
  assert.equal(createDeadline(1_000, ACTION_DURATION_MS), 91_000);
});

test("第二名玩家加入时启动部署绝对截止时间，WAITING 不提前计时", () => {
  const waiting = createRoomState({
    roomCode: "ABC234",
    playerId: "player-1",
    nickname: "甲方",
  });
  const deploying = joinRoomState(
    waiting,
    { playerId: "player-2", nickname: "乙方" },
    JOIN_TIME,
  );

  assert.equal(waiting.deploymentDeadlineAt, null);
  assert.equal(
    deploying.deploymentDeadlineAt,
    JOIN_TIME + DEPLOYMENT_DURATION_MS,
  );
  const view = createRoomView(deploying, "player-1", JOIN_TIME + 20_000);
  assert.equal(view.serverNow, JOIN_TIME + 20_000);
  assert.equal(
    view.deadlines.deploymentDeadlineAt,
    JOIN_TIME + DEPLOYMENT_DURATION_MS,
  );
});

test("截止前最后一毫秒仍可部署，截止瞬间起拒绝客户端操作", () => {
  const room = createDeployingRoom();
  const deadline = room.deploymentDeadlineAt;
  const submitted = submitDeployment(
    room,
    "player-1",
    createValidDeployment(),
    deadline - 1,
  );

  assert.ok(submitted.seats[0].deployment);
  assert.throws(
    () => submitDeployment(
      room,
      "player-1",
      createValidDeployment(),
      deadline,
    ),
    (error) => error.code === "DEPLOYMENT_DEADLINE_EXPIRED",
  );
});

test("部署超时前不能处理；到时只为未准备玩家生成部署并进入 ROLLING", () => {
  let room = createDeployingRoom();
  room = submitDeployment(room, "player-1", createValidDeployment(), JOIN_TIME);
  room = setPlayerReady(room, "player-1", JOIN_TIME);
  const deadline = room.deploymentDeadlineAt;

  assert.throws(
    () => completeDeploymentTimeout(room, deadline - 1),
    (error) => error.code === "DEPLOYMENT_DEADLINE_NOT_REACHED",
  );

  let factoryCalls = 0;
  const completed = completeDeploymentTimeout(
    room,
    deadline,
    () => {
      factoryCalls += 1;
      return createValidDeployment();
    },
  );

  assert.equal(factoryCalls, 1);
  assert.equal(completed.roomPhase, ROOM_PHASES.ROLLING);
  assert.equal(completed.deploymentDeadlineAt, null);
  assert.equal(completed.deploymentsLocked, true);
  assert.equal(completed.seats[0].autoPrepared, false);
  assert.equal(completed.seats[1].autoPrepared, true);
  assert.equal(completed.systemEvents.at(-1).kind, "deployment_timeout_auto_ready");
});

test("玩家已提交完整部署但未点准备时，超时保留原部署并自动准备", () => {
  let room = createDeployingRoom();
  const deployment = createValidDeployment();
  room = submitDeployment(room, "player-1", deployment, JOIN_TIME);
  room = submitDeployment(room, "player-2", deployment, JOIN_TIME);
  const completed = completeDeploymentTimeout(
    room,
    room.deploymentDeadlineAt,
    () => {
      throw new Error("已有完整部署时不应调用随机生成器");
    },
  );

  assert.deepEqual(completed.seats[0].deployment, deployment);
  assert.deepEqual(completed.seats[1].deployment, deployment);
  assert.ok(completed.seats.every((seat) => seat.autoPrepared));
});

test("进入 ACTIVE 时启动 90 秒计时，截止后视图立即锁定并拒绝行动", () => {
  const room = createPlayingRoom();
  const deadline = START_TIME + ACTION_DURATION_MS;

  assert.equal(room.actionDeadlineAt, deadline);
  assert.equal(createRoomView(room, "player-1", deadline - 1).turn.canAct, true);
  assert.equal(createRoomView(room, "player-1", deadline).turn.canAct, false);
  assert.throws(
    () => beginPlayerAction(
      room,
      "player-1",
      pirateMiss("too-late", "J1"),
      deadline,
    ),
    (error) => error.code === "ACTION_DEADLINE_EXPIRED",
  );
});

test("一次行动超时不执行行动，并切换到对方的新计时回合", () => {
  const room = createPlayingRoom();
  const deadline = room.actionDeadlineAt;

  assert.throws(
    () => processActionTimeout(room, deadline - 1),
    (error) => error.code === "ACTION_DEADLINE_NOT_REACHED",
  );
  const timedOut = processActionTimeout(room, deadline);

  assert.equal(timedOut.battleState.actionLog.length, 0);
  assert.equal(timedOut.consecutiveActionTimeouts["player-1"], 1);
  assert.equal(timedOut.currentPlayerId, "player-2");
  assert.equal(timedOut.turnNumber, 2);
  assert.equal(timedOut.actionDeadlineAt, deadline + ACTION_DURATION_MS);
  assert.equal(timedOut.turnEvents.at(-1).kind, "action_timeout");
});

test("同一玩家第三次连续实际行动回合超时后自动判负", () => {
  let room = createPlayingRoom();

  room = processActionTimeout(room, room.actionDeadlineAt);
  room = completePirateMiss(
    room,
    "player-2",
    "p2-action-1",
    "J1",
    room.actionDeadlineAt - 2,
    room.actionDeadlineAt - 1,
  );
  room = processActionTimeout(room, room.actionDeadlineAt);
  room = completePirateMiss(
    room,
    "player-2",
    "p2-action-2",
    "J2",
    room.actionDeadlineAt - 2,
    room.actionDeadlineAt - 1,
  );
  room = processActionTimeout(room, room.actionDeadlineAt);

  assert.equal(room.roomPhase, ROOM_PHASES.FINISHED);
  assert.equal(room.turnPhase, null);
  assert.equal(room.consecutiveActionTimeouts["player-1"], 3);
  assert.equal(room.battleState.match.result.winnerId, "player-2");
  assert.equal(
    room.battleState.match.result.reason,
    END_REASONS.THREE_CONSECUTIVE_TIMEOUTS,
  );
  assert.equal(
    room.turnEvents.filter((event) => event.kind === "action_timeout").length,
    3,
  );
});

test("完成一次合法行动会把该玩家此前的连续超时次数清零", () => {
  let room = createPlayingRoom();
  room = processActionTimeout(room, room.actionDeadlineAt);
  room = completePirateMiss(
    room,
    "player-2",
    "return-turn",
    "J1",
    room.actionDeadlineAt - 2,
    room.actionDeadlineAt - 1,
  );
  assert.equal(room.consecutiveActionTimeouts["player-1"], 1);

  room = completePirateMiss(
    room,
    "player-1",
    "reset-timeouts",
    "J1",
    room.actionDeadlineAt - 2,
    room.actionDeadlineAt - 1,
  );
  assert.equal(room.consecutiveActionTimeouts["player-1"], 0);
});

test("行动超时结束瘫痪回合时解除本回合瘫痪", () => {
  let room = createPlayingRoom();
  const player = getBattlePlayerState(room.battleState, "player-1");
  const paralyzed = setUnitStatus(player, "submarine", { paralyzed: true });
  room = {
    ...room,
    battleState: replaceBattlePlayerState(
      room.battleState,
      "player-1",
      paralyzed,
    ),
  };
  room = processActionTimeout(room, room.actionDeadlineAt);

  assert.equal(
    getBattleUnitById(
      getBattlePlayerState(room.battleState, "player-1"),
      "submarine",
    ).paralyzed,
    false,
  );
});

test("AUTO_SKIPPING 不启动行动计时，也不增加连续超时次数", () => {
  let room = createPlayingRoom();
  room = {
    ...room,
    turnPhase: TURN_PHASES.AUTO_SKIPPING,
    actionDeadlineAt: null,
  };
  assert.throws(
    () => completeAutomaticTurnSkip(room, START_TIME),
    (error) => error.code === "AUTOMATIC_SKIP_NOT_ALLOWED",
  );
  assert.equal(room.consecutiveActionTimeouts["player-1"], 0);
});

test("玩家视图只显示本方连续超时次数，不发送完整计数表", () => {
  let room = createPlayingRoom();
  room = processActionTimeout(room, room.actionDeadlineAt);
  const playerOneView = createRoomView(room, "player-1", room.actionDeadlineAt - 1);
  const playerTwoView = createRoomView(room, "player-2", room.actionDeadlineAt - 1);

  assert.equal(playerOneView.own.consecutiveActionTimeouts, 1);
  assert.equal(playerTwoView.own.consecutiveActionTimeouts, 0);
  assert.equal(Object.hasOwn(playerOneView, "consecutiveActionTimeouts"), false);
});

test("房间服务可扫描并自动处理所有已到期计时器", () => {
  let nowMs = JOIN_TIME;
  const playerIds = ["player-1", "player-2"];
  const service = new InMemoryRoomService({
    now: () => nowMs,
    roomCodeFactory: () => "ABC234",
    playerIdFactory: () => playerIds.shift(),
    randomDeploymentFactory: () => createValidDeployment(),
  });
  const created = service.createRoom({ nickname: "甲方" });
  service.joinRoom({
    roomCode: created.roomCode,
    nickname: "乙方",
    expectedVersion: created.view.stateVersion,
  });

  assert.deepEqual(service.processExpiredTimers(), []);
  nowMs += DEPLOYMENT_DURATION_MS;
  const processed = service.processExpiredTimers();

  assert.equal(processed.length, 1);
  assert.equal(processed[0].roomCode, "ABC234");
  assert.equal(
    service.getServerState("ABC234").roomPhase,
    ROOM_PHASES.ROLLING,
  );
});
