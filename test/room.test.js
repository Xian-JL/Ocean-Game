"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createRoomView } = require("../server/game/match");
const {
  InMemoryRoomService,
  createRoomCode,
} = require("../server/game/room-service");
const {
  ROOM_PHASES,
  cancelPlayerReady,
  createRoomState,
  joinRoomState,
  leaveRoomBeforeMatch,
  normalizeNickname,
  normalizeRoomCode,
  setPlayerReady,
  submitDeployment,
} = require("../server/game/room");
const {
  createValidDeployment,
} = require("../test-fixtures/valid-deployment");

function createTwoPlayerRoom() {
  return joinRoomState(
    createRoomState({
      roomCode: "ABC234",
      playerId: "player-1",
      nickname: "甲方",
    }),
    { playerId: "player-2", nickname: "乙方" },
  );
}

function deployBoth(room = createTwoPlayerRoom()) {
  let next = submitDeployment(room, "player-1", createValidDeployment());
  next = submitDeployment(next, "player-2", createValidDeployment());
  return next;
}

test("昵称去除首尾空白后只接受 1～12 个字符", () => {
  assert.equal(normalizeNickname("  海风  "), "海风");
  assert.equal(normalizeNickname("🚢".repeat(12)), "🚢".repeat(12));
  assert.throws(
    () => normalizeNickname("   "),
    (error) => error.code === "INVALID_NICKNAME",
  );
  assert.throws(
    () => normalizeNickname("一".repeat(13)),
    (error) => error.code === "INVALID_NICKNAME",
  );
});

test("房间码统一为六位大写服务器允许字符", () => {
  assert.equal(normalizeRoomCode(" abc234 "), "ABC234");
  assert.equal(createRoomCode(() => 0), "AAAAAA");
  assert.throws(
    () => normalizeRoomCode("ABCI01"),
    (error) => error.code === "INVALID_ROOM_CODE",
  );
});

test("创建房间占据一个席位并进入 WAITING", () => {
  const room = createRoomState({
    roomCode: "ABC234",
    playerId: "player-1",
    nickname: "  舰长甲  ",
  });

  assert.equal(room.roomPhase, ROOM_PHASES.WAITING);
  assert.equal(room.stateVersion, 1);
  assert.equal(room.seats.length, 1);
  assert.equal(room.seats[0].nickname, "舰长甲");
  assert.equal(room.turnPhase, null);
});

test("第二名玩家加入后进入 DEPLOYING，第三名玩家不能加入", () => {
  const room = createTwoPlayerRoom();

  assert.equal(room.roomPhase, ROOM_PHASES.DEPLOYING);
  assert.equal(room.stateVersion, 2);
  assert.equal(room.seats.length, 2);
  assert.throws(
    () => joinRoomState(room, { playerId: "player-3", nickname: "丙方" }),
    (error) => error.code === "ROOM_NOT_JOINABLE",
  );
  assert.equal(room.stateVersion, 2);
});

test("准备前必须提交完整合法部署，非法请求不改变原状态", () => {
  const room = createTwoPlayerRoom();

  assert.throws(
    () => setPlayerReady(room, "player-1"),
    (error) => error.code === "DEPLOYMENT_REQUIRED",
  );
  assert.throws(
    () => submitDeployment(room, "player-1", []),
    (error) => error.code === "INVALID_DEPLOYMENT",
  );
  assert.equal(room.stateVersion, 2);
  assert.equal(room.seats[0].deployment, null);
});

test("已准备玩家不能修改部署，对方未准备时可以取消准备", () => {
  let room = deployBoth();
  room = setPlayerReady(room, "player-1");

  assert.equal(room.seats[0].ready, true);
  assert.throws(
    () => submitDeployment(room, "player-1", createValidDeployment()),
    (error) => error.code === "READY_DEPLOYMENT_LOCKED",
  );

  room = cancelPlayerReady(room, "player-1");
  assert.equal(room.seats[0].ready, false);
  assert.equal(room.roomPhase, ROOM_PHASES.DEPLOYING);
});

test("双方准备后立即锁定部署并进入 ROLLING，延迟取消被拒绝", () => {
  let room = deployBoth();
  room = setPlayerReady(room, "player-1");
  room = setPlayerReady(room, "player-2");

  assert.equal(room.roomPhase, ROOM_PHASES.ROLLING);
  assert.equal(room.deploymentsLocked, true);
  assert.ok(room.seats.every((seat) => seat.ready));
  assert.throws(
    () => cancelPlayerReady(room, "player-1"),
    (error) => error.code === "CANCEL_READY_NOT_ALLOWED",
  );
});

test("玩家视图只包含自己的部署，不包含对手部署", () => {
  const room = deployBoth();
  const view = createRoomView(room, "player-1");

  assert.deepEqual(view.own.deployment, createValidDeployment());
  assert.ok(view.seats.every((seat) => !Object.hasOwn(seat, "deployment")));
  assert.equal(Object.hasOwn(view, "battleState"), false);
});

test("对局开始前任一玩家离开都会关闭房间", () => {
  const waiting = createRoomState({
    roomCode: "ABC234",
    playerId: "player-1",
    nickname: "甲方",
  });
  const closed = leaveRoomBeforeMatch(waiting, "player-1");

  assert.equal(closed.roomPhase, ROOM_PHASES.CLOSED);
  assert.equal(closed.closedReason, "player_left_before_match");
  assert.equal(closed.stateVersion, 2);

  let rolling = deployBoth();
  rolling = setPlayerReady(rolling, "player-1");
  rolling = setPlayerReady(rolling, "player-2");
  const rollingClosed = leaveRoomBeforeMatch(rolling, "player-2");
  assert.equal(rollingClosed.roomPhase, ROOM_PHASES.CLOSED);
});

test("内存房间服务拒绝过期版本并保持服务器状态不变", () => {
  const playerIds = ["player-1", "player-2", "player-3"];
  const service = new InMemoryRoomService({
    roomCodeFactory: () => "ABC234",
    playerIdFactory: () => playerIds.shift(),
  });
  const created = service.createRoom({ nickname: "甲方" });
  const joined = service.joinRoom({
    roomCode: "abc234",
    nickname: "乙方",
    expectedVersion: created.view.stateVersion,
  });

  assert.equal(joined.view.stateVersion, 2);
  assert.throws(
    () => service.submitDeployment({
      roomCode: "ABC234",
      playerId: created.playerId,
      deployment: createValidDeployment(),
      expectedVersion: 1,
    }),
    (error) =>
      error.code === "STATE_VERSION_CONFLICT" &&
      error.details.actualVersion === 2,
  );
  assert.equal(service.getServerState("ABC234").stateVersion, 2);
});

test("内存房间服务可以原子编排创建、加入、准备、掷骰和一次行动", () => {
  const playerIds = ["player-1", "player-2"];
  const rolls = [0.9, 0.1];
  const service = new InMemoryRoomService({
    roomCodeFactory: () => "ABC234",
    playerIdFactory: () => playerIds.shift(),
    random: () => rolls.shift(),
  });
  const created = service.createRoom({ nickname: "甲方" });
  const joined = service.joinRoom({
    roomCode: created.roomCode,
    nickname: "乙方",
    expectedVersion: 1,
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

  assert.equal(view.roomPhase, ROOM_PHASES.ROLLING);
  let views = service.determineFirstPlayer({
    roomCode: created.roomCode,
    expectedVersion: view.stateVersion,
  });
  views = service.startPlaying({
    roomCode: created.roomCode,
    expectedVersion: views[created.playerId].stateVersion,
  });
  const serverRoom = service.rooms.get(created.roomCode);
  for (const playerId of serverRoom.battleState.playerIds) {
    serverRoom.battleState.players[playerId].remainingUses.radar_scan = 0;
  }
  view = service.beginAction({
    roomCode: created.roomCode,
    playerId: created.playerId,
    expectedVersion: views[created.playerId].stateVersion,
    intent: {
      actionId: "service-action",
      actionType: "pirate_attack",
      sourceId: "pirate",
      target: { kind: "cell", coordinate: "J1" },
    },
  });
  views = service.completeAction({
    roomCode: created.roomCode,
    expectedVersion: view.stateVersion,
  });

  assert.equal(views[joined.playerId].turn.canAct, true);
  assert.equal(service.getServerState(created.roomCode).battleState.actionLog.length, 1);
});
