"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  applyDamageToUnit,
  createBattleState,
  getBattlePlayerState,
  getBattleUnitById,
  replaceBattlePlayerState,
} = require("../server/game/battle-state");
const { resolveBattleAction } = require("../server/game/match-resolution");
const {
  beginPlayerAction,
  completePlayerAction,
  createRoomView,
  determineFirstPlayer,
  startPlaying,
} = require("../server/game/match");
const {
  createRoomState,
  joinRoomState,
  setPlayerReady,
  submitDeployment,
} = require("../server/game/room");
const { surrenderMatch } = require("../server/game/lifecycle");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

const PLAYER_IDS = ["player-1", "player-2", "player-3"];

function deploymentWith(changes = {}) {
  return createValidDeployment().map((placement) => ({
    ...placement,
    cells: changes[placement.id]
      ? [...changes[placement.id]]
      : [...placement.cells],
  }));
}

function threePlayerBattle(deployments = {}) {
  return createBattleState(PLAYER_IDS.map((id) => ({
    id,
    deployment: deployments[id] ?? createValidDeployment(),
  })));
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
  for (const playerId of PLAYER_IDS) {
    room = submitDeployment(room, playerId, createValidDeployment(), nowMs);
  }
  for (const playerId of PLAYER_IDS) {
    room = setPlayerReady(room, playerId, nowMs);
  }
  const rolls = [0.9, 0.5, 0.1];
  room = determineFirstPlayer(room, () => rolls.shift());
  return startPlaying(room, nowMs);
}

function cellIntent(actionId, actionType, sourceId, coordinate, targetPlayerId = "player-2") {
  return {
    actionId,
    actionType,
    sourceId,
    targetPlayerId,
    target: { kind: "cell", coordinate },
  };
}

function unitHp(battle, playerId, unitId) {
  return getBattleUnitById(getBattlePlayerState(battle, playerId), unitId).hp;
}

function exhaustOpeningRadar(room, playerId = "player-1") {
  const player = getBattlePlayerState(room.battleState, playerId);
  return {
    ...room,
    battleState: replaceBattlePlayerState(room.battleState, playerId, {
      ...player,
      remainingUses: {
        ...player.remainingUses,
        [ACTION_TYPES.RADAR_SCAN]: 0,
      },
    }),
  };
}

test("v1.2.6 三人玩家每回合只提交一次行动，并同步完成两名敌方目标", () => {
  let room = threePlayerPlayingRoom();

  room = beginPlayerAction(room, "player-1", cellIntent(
    "opening-radar-both",
    ACTION_TYPES.RADAR_SCAN,
    "carrier",
    "A1",
  ), 2_000);
  room = completePlayerAction(room, 2_010);

  assert.equal(room.battleState.actionLog.length, 1);
  assert.deepEqual(room.battleState.actionLog[0].defenderIds, ["player-2", "player-3"]);
  assert.equal(room.battleState.actionLog[0].defenderId, null);
  assert.equal(room.turnNumber, 2);
  assert.equal(room.currentPlayerId, "player-2");
  assert.equal(getBattlePlayerState(room.battleState, "player-1")
    .remainingUses[ACTION_TYPES.RADAR_SCAN], 0);
  assert.deepEqual(room.turnActionState.requiredTargetPlayerIds, ["player-1", "player-3"]);
  assert.deepEqual(room.turnActionState.completedTargetPlayerIds, []);
});

test("v1.2.6 驱逐舰同格命中两名敌人时，各目标受伤而行动方只自损一次", () => {
  const resolved = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent(
      "destroyer-hit-both",
      ACTION_TYPES.DESTROYER_I_RAM,
      "destroyer-i",
      "D4",
    ),
  );

  assert.equal(unitHp(resolved.state, "player-1", "destroyer-i"), 2.5);
  assert.equal(unitHp(resolved.state, "player-2", "submarine"), 1);
  assert.equal(unitHp(resolved.state, "player-3", "submarine"), 1);
  assert.deepEqual(
    resolved.deliveriesByPlayer["player-1"].feedback.resultsByDefender,
    { "player-2": "hit", "player-3": "hit" },
  );
  assert.equal(resolved.deliveriesByPlayer["player-2"].feedback.receivedHits[0].afterHp, 1);
  assert.equal(resolved.deliveriesByPlayer["player-3"].feedback.receivedHits[0].afterHp, 1);
  assert.equal(resolved.deliveriesByPlayer["player-1"].publicRecord.result, null);
});

test("v1.2.6 驱逐舰同步行动可对一方命中、一方未命中，自损仍只计算一次", () => {
  const shiftedSubmarine = deploymentWith({
    submarine: ["C6", "C7", "D6", "D7"],
  });
  const resolved = resolveBattleAction(
    threePlayerBattle({ "player-3": shiftedSubmarine }),
    "player-1",
    cellIntent(
      "destroyer-hit-one",
      ACTION_TYPES.DESTROYER_I_RAM,
      "destroyer-i",
      "D4",
    ),
  );

  assert.equal(unitHp(resolved.state, "player-1", "destroyer-i"), 2.5);
  assert.equal(unitHp(resolved.state, "player-2", "submarine"), 1);
  assert.equal(unitHp(resolved.state, "player-3", "submarine"), 2);
  assert.deepEqual(
    resolved.deliveriesByPlayer["player-1"].feedback.resultsByDefender,
    { "player-2": "hit", "player-3": "miss" },
  );
  assert.equal(resolved.deliveriesByPlayer["player-3"].feedback.receivedHits.length, 0);
});

test("v1.2.6 海盗船同步命中两方时，两方各受 2 点而海盗船与己方航母只联动一次", () => {
  const resolved = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent(
      "pirate-hit-both",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "D4",
    ),
  );

  assert.equal(unitHp(resolved.state, "player-1", "pirate"), 1);
  assert.equal(unitHp(resolved.state, "player-1", "carrier"), 5.5);
  assert.equal(unitHp(resolved.state, "player-2", "submarine"), 0);
  assert.equal(unitHp(resolved.state, "player-3", "submarine"), 0);
  assert.equal(
    resolved.actionRecord.outcome.damageEvents
      .filter((event) => event.side === "actor" && event.unitId === "pirate").length,
    1,
  );
});

test("v1.2.6 有限弹药一次消耗，并在两张敌方地图留下相同目标标记", () => {
  const resolved = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent(
      "missile-both",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      "G5",
    ),
  );
  const actor = getBattlePlayerState(resolved.state, "player-1");
  const ownView = resolved.deliveriesByPlayer["player-1"].view.own;

  assert.equal(actor.remainingUses[ACTION_TYPES.SUBMARINE_MISSILE], 3);
  assert.deepEqual(ownView.enemyMapsByPlayer["player-2"].submarineMissileMarkers, ["G5"]);
  assert.deepEqual(ownView.enemyMapsByPlayer["player-3"].submarineMissileMarkers, ["G5"]);
  assert.equal(resolved.deliveriesByPlayer["player-1"].feedback.result, null);
  assert.equal(Object.hasOwn(
    resolved.deliveriesByPlayer["player-1"].feedback,
    "resultsByDefender",
  ), false);
});

test("v1.2.6 核弹同时命中两方航母，各扣 2 且不向行动方报告命中", () => {
  const resolved = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent(
      "nuke-both-carriers",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "G5",
    ),
  );

  assert.equal(unitHp(resolved.state, "player-2", "carrier"), 4);
  assert.equal(unitHp(resolved.state, "player-3", "carrier"), 4);
  assert.equal(getBattlePlayerState(resolved.state, "player-1")
    .remainingUses[ACTION_TYPES.NUCLEAR_BOMB], 1);
  assert.equal(resolved.deliveriesByPlayer["player-1"].feedback.result, null);
  assert.equal(Object.hasOwn(
    resolved.deliveriesByPlayer["player-1"].feedback,
    "resultsByDefender",
  ), false);
  assert.equal(resolved.deliveriesByPlayer["player-2"].feedback.receivedHits[0].afterHp, 4);
  assert.equal(resolved.deliveriesByPlayer["player-3"].feedback.receivedHits[0].afterHp, 4);
});

test("v1.2.6 雷达同一区域分别判定两方，只向行动方返回两份私人结果", () => {
  const clearRadarCorner = deploymentWith({
    motorboat: ["K1"],
    "motorboat-2": ["K2"],
  });
  const resolved = resolveBattleAction(
    threePlayerBattle({ "player-3": clearRadarCorner }),
    "player-1",
    cellIntent(
      "radar-independent-results",
      ACTION_TYPES.RADAR_SCAN,
      "carrier",
      "I9",
    ),
  );
  const actorFeedback = resolved.deliveriesByPlayer["player-1"].feedback;
  const actorView = resolved.deliveriesByPlayer["player-1"].view.own;

  assert.deepEqual(actorFeedback.privateResultsByDefender, {
    "player-2": "layout_detected",
    "player-3": "no_layout_detected",
  });
  assert.equal(actorView.intelligenceAreas.length, 2);
  assert.deepEqual(
    actorView.intelligenceAreas.map((area) => area.defenderId),
    ["player-2", "player-3"],
  );
  for (const defenderId of ["player-2", "player-3"]) {
    const defenderFeedback = resolved.deliveriesByPlayer[defenderId].feedback;
    assert.equal(defenderFeedback.result, null);
    assert.equal(Object.hasOwn(defenderFeedback, "privateResultsByDefender"), false);
  }
});

test("v1.2.6 驱逐舰同步使用后的坐标全局锁定，不能切换敌方地图重复利用", () => {
  const first = resolveBattleAction(
    threePlayerBattle(),
    "player-1",
    cellIntent(
      "destroyer-lock-both",
      ACTION_TYPES.DESTROYER_I_RAM,
      "destroyer-i",
      "D4",
    ),
  );

  assert.throws(
    () => resolveBattleAction(
      first.state,
      "player-1",
      cellIntent(
        "destroyer-repeat-both",
        ACTION_TYPES.DESTROYER_II_RAM,
        "destroyer-ii",
        "D4",
        "player-3",
      ),
    ),
    (error) => error.code === "INVALID_ACTION" &&
      error.details.errors.some((issue) => issue.code === "DESTROYER_TARGET_ALREADY_USED"),
  );
});

test("v1.2.6 一名敌人已出局时，同一协议自然退化为单目标行动", () => {
  let room = exhaustOpeningRadar(threePlayerPlayingRoom());
  room = surrenderMatch(room, "player-3", 1_500);

  assert.deepEqual(
    createRoomView(room, "player-1", 1_510).turn.remainingTargetPlayerIds,
    ["player-2"],
  );
  room = beginPlayerAction(room, "player-1", cellIntent(
    "single-after-elimination",
    ACTION_TYPES.PIRATE_ATTACK,
    "pirate",
    "D4",
  ), 2_000);
  room = completePlayerAction(room, 2_010);

  const record = room.battleState.actionLog.at(-1);
  assert.equal(record.defenderId, "player-2");
  assert.deepEqual(record.defenderIds, ["player-2"]);
  assert.equal(room.currentPlayerId, "player-2");
});

test("v1.2.6 混合命中单位与诱饵时，两方独立结算且驱逐舰只承担一次较高自损", () => {
  const decoyAtUnitCell = deploymentWith({
    submarine: ["C6", "C7", "D6", "D7"],
    "decoy-2": ["D4"],
  });
  const resolved = resolveBattleAction(
    threePlayerBattle({ "player-3": decoyAtUnitCell }),
    "player-1",
    cellIntent(
      "destroyer-mixed-targets",
      ACTION_TYPES.DESTROYER_I_RAM,
      "destroyer-i",
      "D4",
    ),
  );

  assert.equal(unitHp(resolved.state, "player-1", "destroyer-i"), 2);
  assert.equal(unitHp(resolved.state, "player-2", "submarine"), 1);
  assert.equal(
    getBattlePlayerState(resolved.state, "player-3").decoys
      .find((decoy) => decoy.id === "decoy-2").destroyed,
    true,
  );
});
