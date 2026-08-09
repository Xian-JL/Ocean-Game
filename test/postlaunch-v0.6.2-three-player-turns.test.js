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
const {
  startManualFinalSalvo,
  submitManualFinalSalvo,
} = require("../server/game/endgame");
const {
  TURN_PHASES,
  beginPlayerAction,
  completePlayerAction,
  createRoomView,
  determineFirstPlayer,
  processActionTimeout,
  startPlaying,
} = require("../server/game/match");
const {
  ROOM_PHASES,
  createRoomState,
  joinRoomState,
  setPlayerReady,
  submitDeployment,
} = require("../server/game/room");
const { surrenderMatch } = require("../server/game/lifecycle");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

const PLAYER_IDS = ["player-1", "player-2", "player-3"];

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

function withUses(room, playerId, changes) {
  const player = getBattlePlayerState(room.battleState, playerId);
  return {
    ...room,
    battleState: replaceBattlePlayerState(room.battleState, playerId, {
      ...player,
      remainingUses: {
        ...player.remainingUses,
        ...changes,
      },
    }),
  };
}


function setRoomUnitStatus(room, playerId, unitId, changes) {
  const player = getBattlePlayerState(room.battleState, playerId);
  const units = player.units.map((unit) =>
    unit.id === unitId ? { ...unit, ...changes } : unit,
  );
  return {
    ...room,
    battleState: replaceBattlePlayerState(room.battleState, playerId, {
      ...player,
      units,
    }),
  };
}

function damageRoomUnit(room, playerId, unitId, amount) {
  const player = getBattlePlayerState(room.battleState, playerId);
  const damaged = applyDamageToUnit(player, unitId, amount);
  return {
    ...room,
    battleState: replaceBattlePlayerState(
      room.battleState,
      playerId,
      damaged.state,
    ),
  };
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

function lineIntent(actionId, target) {
  return {
    actionId,
    actionType: ACTION_TYPES.HELICOPTER_STRAFE,
    sourceId: "carrier",
    target,
  };
}

function unitHp(battle, playerId, unitId) {
  return getBattleUnitById(
    getBattlePlayerState(battle, playerId),
    unitId,
  ).hp;
}

function exhaustAttackCapability(battle, playerId) {
  let state = battle;
  for (const unitId of [
    "destroyer-i",
    "destroyer-ii",
    "submarine",
    "pirate",
    "motorboat",
    "motorboat-2",
    "nuclear",
  ]) {
    const player = getBattlePlayerState(state, playerId);
    const unit = getBattleUnitById(player, unitId);
    const damaged = applyDamageToUnit(player, unitId, unit.hp);
    state = replaceBattlePlayerState(state, playerId, damaged.state);
  }
  const player = getBattlePlayerState(state, playerId);
  return replaceBattlePlayerState(state, playerId, {
    ...player,
    remainingUses: {
      ...player.remainingUses,
      [ACTION_TYPES.SUBMARINE_MISSILE]: 0,
      [ACTION_TYPES.NUCLEAR_BOMB]: 0,
      [ACTION_TYPES.HELICOPTER_STRAFE]: 0,
    },
  });
}

test("v0.6.2 三人回合要求当前玩家分别完成两名敌方玩家的一次操作", () => {
  let room = threePlayerPlayingRoom(1_000);
  const originalDeadline = room.actionDeadlineAt;

  assert.deepEqual(room.turnActionState.requiredTargetPlayerIds, ["player-2", "player-3"]);
  assert.deepEqual(room.turnActionState.completedTargetPlayerIds, []);

  room = beginPlayerAction(room, "player-1", cellIntent(
    "opening-radar-p2",
    ACTION_TYPES.RADAR_SCAN,
    "carrier",
    "player-2",
    "A1",
  ), 2_000);
  room = completePlayerAction(room, 2_050);

  assert.equal(room.roomPhase, ROOM_PHASES.PLAYING);
  assert.equal(room.turnPhase, TURN_PHASES.ACTIVE);
  assert.equal(room.currentPlayerId, "player-1");
  assert.equal(room.turnNumber, 1);
  assert.equal(room.actionDeadlineAt, originalDeadline);
  assert.deepEqual(room.turnActionState.completedTargetPlayerIds, ["player-2"]);
  assert.deepEqual(
    createRoomView(room, "player-1", 2_100).turn.remainingTargetPlayerIds,
    ["player-3"],
  );

  room = beginPlayerAction(room, "player-1", cellIntent(
    "second-action-p3",
    ACTION_TYPES.SUBMARINE_MISSILE,
    "submarine",
    "player-3",
    "G5",
  ), 3_000);
  room = completePlayerAction(room, 3_050);

  assert.equal(room.currentPlayerId, "player-2");
  assert.equal(room.turnNumber, 2);
  assert.deepEqual(room.turnActionState.requiredTargetPlayerIds, ["player-1", "player-3"]);
});

test("v0.6.2 同一三人回合不能对已经完成操作的目标再次操作", () => {
  let room = threePlayerPlayingRoom(1_000);
  room = beginPlayerAction(room, "player-1", cellIntent(
    "radar-p2-once",
    ACTION_TYPES.RADAR_SCAN,
    "carrier",
    "player-2",
    "A1",
  ), 2_000);
  room = completePlayerAction(room, 2_010);

  assert.throws(
    () => beginPlayerAction(room, "player-1", cellIntent(
      "repeat-p2",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "player-2",
      "L11",
    ), 2_100),
    (error) => error.code === "TURN_TARGET_ALREADY_RESOLVED",
  );
});

test("v0.6.2 两次操作可采用任意合法组合并分别消耗资源", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });

  room = beginPlayerAction(room, "player-1", cellIntent(
    "shock-p2",
    ACTION_TYPES.SHOCK_BOMB,
    "nuclear",
    "player-2",
    "C3",
  ), 2_000);
  room = completePlayerAction(room, 2_010);
  assert.equal(room.currentPlayerId, "player-1");

  room = beginPlayerAction(room, "player-1", cellIntent(
    "nuke-p3",
    ACTION_TYPES.NUCLEAR_BOMB,
    "nuclear",
    "player-3",
    "G5",
  ), 2_100);
  room = completePlayerAction(room, 2_110);

  const actor = getBattlePlayerState(room.battleState, "player-1");
  assert.equal(actor.remainingUses[ACTION_TYPES.SHOCK_BOMB], 0);
  assert.equal(actor.remainingUses[ACTION_TYPES.NUCLEAR_BOMB], 1);
  assert.equal(room.currentPlayerId, "player-2");
});

test("v0.6.2 两名敌方玩家保持独立敌方地图记录", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });

  room = beginPlayerAction(room, "player-1", cellIntent(
    "destroyer-p2",
    ACTION_TYPES.DESTROYER_I_RAM,
    "destroyer-i",
    "player-2",
    "D4",
  ), 2_000);
  room = completePlayerAction(room, 2_010);

  room = beginPlayerAction(room, "player-1", cellIntent(
    "missile-p3",
    ACTION_TYPES.SUBMARINE_MISSILE,
    "submarine",
    "player-3",
    "G5",
  ), 2_100);
  room = completePlayerAction(room, 2_110);

  const own = createRoomView(room, "player-1", 2_120).battle.own;
  assert.deepEqual(own.enemyMapsByPlayer["player-2"].destroyerTargetCells, ["D4"]);
  assert.deepEqual(own.enemyMapsByPlayer["player-3"].destroyerTargetCells, []);
  assert.deepEqual(own.enemyMapsByPlayer["player-2"].submarineMissileMarkers, []);
  assert.deepEqual(own.enemyMapsByPlayer["player-3"].submarineMissileMarkers, ["G5"]);
});

test("v0.6.2 三人直升机作为整回合例外，对两名仍在局敌人同时扫射", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });
  room = damageRoomUnit(room, "player-1", "destroyer-i", 3);
  room = damageRoomUnit(room, "player-1", "destroyer-ii", 3);

  room = beginPlayerAction(room, "player-1", lineIntent(
    "global-helicopter",
    { kind: "row", row: "J" },
  ), 2_000);
  room = completePlayerAction(room, 2_010);

  assert.equal(room.battleState.actionLog.length, 1);
  const record = room.battleState.actionLog[0];
  assert.equal(record.defenderId, null);
  assert.deepEqual(record.defenderIds, ["player-2", "player-3"]);
  assert.equal(record.outcome.kind, "multi_defender_line");
  assert.equal(unitHp(room.battleState, "player-2", "motorboat"), 0);
  assert.equal(unitHp(room.battleState, "player-3", "motorboat"), 0);
  assert.equal(room.currentPlayerId, "player-2");

  const actorView = createRoomView(room, "player-1", 2_020).battle.own;
  assert.equal(actorView.enemyMapsByPlayer["player-2"].cellResults.J10, "hit");
  assert.equal(actorView.enemyMapsByPlayer["player-3"].cellResults.J10, "hit");
});

test("v0.6.2 直升机不能在已经对一名敌人操作后作为额外第三次效果插入", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });
  room = damageRoomUnit(room, "player-1", "destroyer-i", 3);
  room = damageRoomUnit(room, "player-1", "destroyer-ii", 3);

  room = beginPlayerAction(room, "player-1", cellIntent(
    "pirate-p2-before-heli",
    ACTION_TYPES.PIRATE_ATTACK,
    "pirate",
    "player-2",
    "L11",
  ), 2_000);
  room = completePlayerAction(room, 2_010);

  assert.throws(
    () => beginPlayerAction(room, "player-1", lineIntent(
      "late-global-helicopter",
      { kind: "row", row: "J" },
    ), 2_100),
    (error) => error.code === "HELICOPTER_REQUIRES_FRESH_TURN",
  );
});

test("v0.6.2 三人手动鱼雷每次选择同时作用于另外两名仍在局玩家", () => {
  let battle = createBattleState(PLAYER_IDS.map((id) => ({
    id,
    deployment: createValidDeployment(),
  })));
  for (const playerId of PLAYER_IDS) {
    battle = exhaustAttackCapability(battle, playerId);
  }

  battle = startManualFinalSalvo(battle);
  battle = submitManualFinalSalvo(battle, "player-1", "decoy-1");
  battle = submitManualFinalSalvo(battle, "player-2", "decoy-1");
  battle = submitManualFinalSalvo(battle, "player-3", "decoy-1");

  assert.equal(battle.match.finalSalvo.status, "selecting");
  assert.equal(battle.match.finalSalvo.round, 2);
  assert.equal(battle.match.finalSalvo.shots.length, 6);
  assert.deepEqual(
    battle.match.finalSalvo.shots
      .filter((shot) => shot.sourcePlayerId === "player-1")
      .map((shot) => shot.targetPlayerId)
      .sort(),
    ["player-2", "player-3"],
  );
  assert.equal(
    getBattlePlayerState(battle, "player-1").decoys.find(
      (decoy) => decoy.id === "decoy-1",
    ).destroyed,
    true,
  );
});


test("v0.6.2 三人两次操作共享同一90秒，第一项后超时保留已结算结果并结束整个玩家回合", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });
  const deadline = room.actionDeadlineAt;

  room = beginPlayerAction(room, "player-1", cellIntent(
    "timeout-first-p2",
    ACTION_TYPES.PIRATE_ATTACK,
    "pirate",
    "player-2",
    "L11",
  ), 2_000);
  room = completePlayerAction(room, 2_010);

  assert.equal(room.currentPlayerId, "player-1");
  assert.equal(room.turnNumber, 1);
  assert.equal(room.actionDeadlineAt, deadline);
  assert.deepEqual(room.turnActionState.completedTargetPlayerIds, ["player-2"]);
  assert.equal(room.battleState.actionLog.length, 1);

  room = processActionTimeout(room, deadline);

  assert.equal(room.currentPlayerId, "player-2");
  assert.equal(room.turnNumber, 2);
  assert.equal(room.consecutiveActionTimeouts["player-1"], 1);
  assert.equal(room.battleState.actionLog.length, 1);
});

test("v0.6.2 三人回合第一项操作后瘫痪不会提前解除，整个玩家回合结束后才解除", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });
  room = setRoomUnitStatus(room, "player-1", "submarine", { paralyzed: true });

  room = beginPlayerAction(room, "player-1", cellIntent(
    "paralysis-first-p2",
    ACTION_TYPES.PIRATE_ATTACK,
    "pirate",
    "player-2",
    "L11",
  ), 2_000);
  room = completePlayerAction(room, 2_010);
  assert.equal(
    getBattleUnitById(getBattlePlayerState(room.battleState, "player-1"), "submarine").paralyzed,
    true,
  );

  room = beginPlayerAction(room, "player-1", cellIntent(
    "paralysis-second-p3",
    ACTION_TYPES.PIRATE_ATTACK,
    "pirate",
    "player-3",
    "L11",
  ), 2_100);
  room = completePlayerAction(room, 2_110);
  assert.equal(
    getBattleUnitById(getBattlePlayerState(room.battleState, "player-1"), "submarine").paralyzed,
    false,
  );
  assert.equal(room.currentPlayerId, "player-2");
});

test("v0.6.2 三人回合剩余目标投降后从目标集合移除并在没有剩余目标时切换下一玩家", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });

  room = beginPlayerAction(room, "player-1", cellIntent(
    "before-p3-surrender",
    ACTION_TYPES.PIRATE_ATTACK,
    "pirate",
    "player-2",
    "L11",
  ), 2_000);
  room = completePlayerAction(room, 2_010);
  assert.deepEqual(
    createRoomView(room, "player-1", 2_020).turn.remainingTargetPlayerIds,
    ["player-3"],
  );

  room = surrenderMatch(room, "player-3", 2_100);
  assert.ok(room.battleState.match.eliminatedPlayerIds.includes("player-3"));
  assert.equal(room.currentPlayerId, "player-2");
  assert.equal(room.turnNumber, 2);
});

test("v0.6.2 三人回合尚未操作的一个目标提前投降时当前玩家继续操作另一名敌人", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });
  const deadline = room.actionDeadlineAt;

  room = surrenderMatch(room, "player-2", 1_500);
  assert.equal(room.currentPlayerId, "player-1");
  assert.equal(room.turnNumber, 1);
  assert.equal(room.actionDeadlineAt, deadline);
  assert.deepEqual(
    createRoomView(room, "player-1", 1_510).turn.remainingTargetPlayerIds,
    ["player-3"],
  );

  room = beginPlayerAction(room, "player-1", cellIntent(
    "only-p3-after-p2-surrender",
    ACTION_TYPES.PIRATE_ATTACK,
    "pirate",
    "player-3",
    "L11",
  ), 2_000);
  room = completePlayerAction(room, 2_010);
  assert.equal(room.currentPlayerId, "player-3");
});

test("v0.6.2 同一有限行动可在同一三人回合分别对B和C各使用一次", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });

  room = beginPlayerAction(room, "player-1", cellIntent(
    "missile-p2-same-turn",
    ACTION_TYPES.SUBMARINE_MISSILE,
    "submarine",
    "player-2",
    "G5",
  ), 2_000);
  room = completePlayerAction(room, 2_010);

  room = beginPlayerAction(room, "player-1", cellIntent(
    "missile-p3-same-turn",
    ACTION_TYPES.SUBMARINE_MISSILE,
    "submarine",
    "player-3",
    "G5",
  ), 2_100);
  room = completePlayerAction(room, 2_110);

  const actor = getBattlePlayerState(room.battleState, "player-1");
  assert.equal(actor.remainingUses[ACTION_TYPES.SUBMARINE_MISSILE], 2);
  const own = createRoomView(room, "player-1", 2_120).battle.own;
  assert.deepEqual(own.enemyMapsByPlayer["player-2"].submarineMissileMarkers, ["G5"]);
  assert.deepEqual(own.enemyMapsByPlayer["player-3"].submarineMissileMarkers, ["G5"]);
});

test("v0.6.2 驱逐舰同一坐标可在同一三人回合分别攻击B和C，历史按敌方玩家隔离", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });

  room = beginPlayerAction(room, "player-1", cellIntent(
    "destroyer-same-cell-p2",
    ACTION_TYPES.DESTROYER_I_RAM,
    "destroyer-i",
    "player-2",
    "D4",
  ), 2_000);
  room = completePlayerAction(room, 2_010);

  room = beginPlayerAction(room, "player-1", cellIntent(
    "destroyer-same-cell-p3",
    ACTION_TYPES.DESTROYER_I_RAM,
    "destroyer-i",
    "player-3",
    "D4",
  ), 2_100);
  room = completePlayerAction(room, 2_110);

  const own = createRoomView(room, "player-1", 2_120).battle.own;
  assert.deepEqual(own.enemyMapsByPlayer["player-2"].destroyerTargetCells, ["D4"]);
  assert.deepEqual(own.enemyMapsByPlayer["player-3"].destroyerTargetCells, ["D4"]);
});

test("v0.6.2 本回合首项操作前已有一名敌人出局时直升机退化为单目标行动", () => {
  let room = withUses(threePlayerPlayingRoom(1_000), "player-1", {
    [ACTION_TYPES.RADAR_SCAN]: 0,
  });
  room = damageRoomUnit(room, "player-1", "destroyer-i", 3);
  room = damageRoomUnit(room, "player-1", "destroyer-ii", 3);
  room = surrenderMatch(room, "player-3", 1_500);

  assert.deepEqual(
    createRoomView(room, "player-1", 1_510).turn.remainingTargetPlayerIds,
    ["player-2"],
  );

  room = beginPlayerAction(room, "player-1", {
    ...lineIntent("single-helicopter-after-elimination", { kind: "row", row: "J" }),
    targetPlayerId: "player-2",
  }, 2_000);
  room = completePlayerAction(room, 2_010);

  const record = room.battleState.actionLog.at(-1);
  assert.equal(record.defenderId, "player-2");
  assert.deepEqual(record.defenderIds, ["player-2"]);
  assert.equal(room.currentPlayerId, "player-2");
});
