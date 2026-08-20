"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  applyDamageToUnit,
  createBattleState,
  getBattlePlayerState,
  replaceBattlePlayerState,
} = require("../server/game/battle-state");
const { resolveBattleAction } = require("../server/game/match-resolution");
const { leaveFinishedRoom, surrenderMatch } = require("../server/game/lifecycle");
const { determineFirstPlayer, startPlaying } = require("../server/game/match");
const {
  ROOM_PHASES,
  createRoomState,
  joinRoomState,
  setPlayerReady,
  submitDeployment,
} = require("../server/game/room");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

function threePlayerBattle() {
  return createBattleState(["player-1", "player-2", "player-3"].map((id) => ({
    id,
    deployment: createValidDeployment(),
  })));
}

function cellIntent(actionId, actionType, sourceId, targetPlayerId, coordinate) {
  return {
    actionId,
    actionType,
    sourceId,
    targetPlayerId,
    target: { kind: "cell", coordinate },
  };
}

function threePlayerPlayingRoom(nowMs = 1_000) {
  let room = createRoomState({
    roomCode: "ABC234",
    playerId: "player-1",
    nickname: "一号",
    maxPlayers: 3,
  });
  room = joinRoomState(room, { playerId: "player-2", nickname: "二号" }, nowMs);
  room = joinRoomState(room, { playerId: "player-3", nickname: "三号" }, nowMs);
  for (const playerId of ["player-1", "player-2", "player-3"]) {
    room = submitDeployment(room, playerId, createValidDeployment(), nowMs);
  }
  for (const playerId of ["player-1", "player-2", "player-3"]) {
    room = setPlayerReady(room, playerId, nowMs);
  }
  const rolls = [0.9, 0.5, 0.1];
  room = determineFirstPlayer(room, () => rolls.shift());
  return startPlaying(room, nowMs);
}

test("三人房间在第三名玩家加入后才进入部署阶段", () => {
  let room = createRoomState({
    roomCode: "ABC234",
    playerId: "player-1",
    nickname: "一号",
    maxPlayers: 3,
  });
  room = joinRoomState(room, { playerId: "player-2", nickname: "二号" }, 0);
  assert.equal(room.roomPhase, ROOM_PHASES.WAITING);
  assert.equal(room.deploymentDeadlineAt, null);
  room = joinRoomState(room, { playerId: "player-3", nickname: "三号" }, 0);
  assert.equal(room.roomPhase, ROOM_PHASES.DEPLOYING);
  assert.equal(room.deploymentDeadlineAt, 180_000);
  assert.equal(room.seats.length, 3);
});

test("v1.2.6 三人行动以同一坐标同步结算两名敌人，不再产生第三方旁观者", () => {
  const resolved = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent("target-both", ACTION_TYPES.PIRATE_ATTACK, "pirate", null, "D4"),
  );
  assert.equal(
    Object.hasOwn(resolved.deliveriesByPlayer["player-1"].feedback, "inflictedDamage"),
    false,
  );
  assert.equal(resolved.deliveriesByPlayer["player-2"].feedback.receivedHits[0].afterHp, 0);
  assert.equal(resolved.deliveriesByPlayer["player-2"].feedback.receivedHits[0].unitType, "submarine");
  assert.equal(Object.hasOwn(
    resolved.deliveriesByPlayer["player-2"].feedback.receivedHits[0],
    "afterHp",
  ), true);
  assert.equal(resolved.deliveriesByPlayer["player-3"].feedback.receivedHits[0].afterHp, 0);
  assert.equal(resolved.deliveriesByPlayer["player-3"].feedback.observer, undefined);
  assert.equal(resolved.deliveriesByPlayer["player-3"].publicRecord.defenderId, null);
  assert.deepEqual(
    resolved.deliveriesByPlayer["player-3"].publicRecord.defenderIds,
    ["player-2", "player-3"],
  );
});

test("v1.2.6 同一驱逐舰坐标同步用于两张敌方地图，并在之后全局锁定", () => {
  const first = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent("destroyer-p2", ACTION_TYPES.DESTROYER_I_RAM, "destroyer-i", "player-2", "D4"),
  );
  assert.throws(
    () => resolveBattleAction(
      first.state,
      "player-1",
      cellIntent("destroyer-repeat", ACTION_TYPES.DESTROYER_II_RAM, "destroyer-ii", "player-3", "D4"),
    ),
    (error) => error.code === "INVALID_ACTION",
  );
  const own = first.deliveriesByPlayer["player-1"].view.own;
  assert.deepEqual(own.enemyMapsByPlayer["player-2"].destroyerTargetCells, ["D4"]);
  assert.deepEqual(own.enemyMapsByPlayer["player-3"].destroyerTargetCells, ["D4"]);
});

test("三人局首个航空母舰沉没只令该玩家出局，对局继续", () => {
  let battle = threePlayerBattle();
  const defender = getBattlePlayerState(battle, "player-2");
  const damaged = applyDamageToUnit(defender, "carrier", 4);
  battle = replaceBattlePlayerState(battle, "player-2", damaged.state);
  const resolved = resolveBattleAction(
    battle,
    "player-1",
    cellIntent("sink-p2", ACTION_TYPES.NUCLEAR_BOMB, "nuclear", "player-2", "G5"),
  );
  assert.equal(resolved.state.match.status, "playing");
  assert.deepEqual(resolved.state.match.eliminatedPlayerIds, ["player-2"]);
  assert.equal(resolved.state.match.result, null);
});

test("v1.2.6 三人探测弹分别产生两份私人结果，两名防守方均看不到探测结论", () => {
  const resolved = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent("detect-p2", ACTION_TYPES.DETECTION_BOMB, "nuclear", "player-2", "B2"),
  );
  const actor = resolved.deliveriesByPlayer["player-1"];
  const defender = resolved.deliveriesByPlayer["player-2"];
  const secondDefender = resolved.deliveriesByPlayer["player-3"];

  assert.deepEqual(actor.feedback.privateResultsByDefender, {
    "player-2": "underwater_signal_detected",
    "player-3": "underwater_signal_detected",
  });
  assert.equal(actor.feedback.result, null);
  assert.equal(actor.publicRecord.result, null);
  assert.equal(defender.feedback.result, null);
  assert.equal(secondDefender.feedback.result, null);
  assert.equal(secondDefender.feedback.observer, undefined);
  assert.equal(secondDefender.publicRecord.defenderId, null);
  assert.equal(secondDefender.view.publicActionLog.at(-1).result, null);
  assert.equal(secondDefender.view.publicActionLog.at(-1).defenderId, null);
});

test("三人局赛后一名玩家离开时保留其余两名玩家并重置为等待房间", () => {
  let room = threePlayerPlayingRoom(1_000);
  room = surrenderMatch(room, "player-3", 2_000);
  assert.equal(room.roomPhase, ROOM_PHASES.PLAYING);
  room = surrenderMatch(room, "player-2", 3_000);
  assert.equal(room.roomPhase, ROOM_PHASES.FINISHED);

  const waiting = leaveFinishedRoom(room, "player-1", 4_000);
  assert.equal(waiting.roomPhase, ROOM_PHASES.WAITING);
  assert.equal(waiting.maxPlayers, 3);
  assert.equal(waiting.ownerPlayerId, "player-2");
  assert.deepEqual(waiting.seats.map((seat) => seat.playerId), ["player-2", "player-3"]);
  assert.ok(waiting.seats.every((seat) => seat.deployment === null && !seat.ready));
  assert.deepEqual(waiting.consecutiveActionTimeouts, {
    "player-2": 0,
    "player-3": 0,
  });
  assert.deepEqual(waiting.rematchRequestedByPlayer, {
    "player-2": false,
    "player-3": false,
  });
  assert.equal(waiting.battleState, null);
});
