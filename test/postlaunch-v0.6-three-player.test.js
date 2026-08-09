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
const {
  ROOM_PHASES,
  createRoomState,
  joinRoomState,
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

test("三人行动必须选择仍存活的敌方玩家，第三方取得旁观战报", () => {
  assert.throws(
    () => resolveBattleAction(
      threePlayerBattle(),
      "player-1",
      cellIntent("missing-target", ACTION_TYPES.PIRATE_ATTACK, "pirate", null, "D4"),
    ),
    (error) => error.code === "INVALID_TARGET_PLAYER",
  );
  const resolved = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent("target-p2", ACTION_TYPES.PIRATE_ATTACK, "pirate", "player-2", "D4"),
  );
  assert.equal(resolved.deliveriesByPlayer["player-1"].feedback.inflictedDamage[0].afterHp, 0);
  assert.equal(resolved.deliveriesByPlayer["player-2"].feedback.receivedHits[0].unitType, "submarine");
  assert.equal(Object.hasOwn(
    resolved.deliveriesByPlayer["player-2"].feedback.receivedHits[0],
    "afterHp",
  ), false);
  assert.equal(resolved.deliveriesByPlayer["player-3"].feedback.observer, true);
  assert.equal(Object.hasOwn(resolved.deliveriesByPlayer["player-3"].feedback, "ownDamage"), false);
});

test("同一驱逐舰坐标按敌方玩家分别记录，不会错误锁死另一张敌方地图", () => {
  const first = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent("destroyer-p2", ACTION_TYPES.DESTROYER_I_RAM, "destroyer-i", "player-2", "D4"),
  );
  assert.doesNotThrow(() => resolveBattleAction(
    first.state,
    "player-1",
    cellIntent("destroyer-p3", ACTION_TYPES.DESTROYER_I_RAM, "destroyer-i", "player-3", "D4"),
  ));
  assert.throws(
    () => resolveBattleAction(
      first.state,
      "player-1",
      cellIntent("destroyer-repeat", ACTION_TYPES.DESTROYER_II_RAM, "destroyer-ii", "player-2", "D4"),
    ),
    (error) => error.code === "INVALID_ACTION",
  );
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

