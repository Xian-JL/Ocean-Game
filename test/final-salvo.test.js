"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  destroyDecoy,
  getBattlePlayerState,
  getBattleUnitById,
  replaceBattlePlayerState,
} = require("../server/game/battle-state");
const {
  END_REASONS,
  bothPlayersLackAttackCapability,
  resolveFinalSalvo,
} = require("../server/game/endgame");
const {
  resolveBattleAction,
} = require("../server/game/match-resolution");
const {
  createTestBattle,
  damageBattleUnit,
} = require("../test-fixtures/battle");
const {
  createValidDeployment,
} = require("../test-fixtures/valid-deployment");

function setPlacementCells(deployment, id, cells) {
  const placement = deployment.find((candidate) => candidate.id === id);
  placement.cells = [...cells];
}

function createPlayerOneSalvoDeployment() {
  const deployment = createValidDeployment();
  setPlacementCells(deployment, "carrier", [
    "A7",
    "A8",
    "A9",
    "A10",
    "B7",
    "C7",
  ]);
  setPlacementCells(deployment, "decoy-1", ["J1"]);
  return deployment;
}

function createPlayerTwoSalvoDeployment() {
  const deployment = createValidDeployment();
  setPlacementCells(deployment, "carrier", [
    "G7",
    "G8",
    "G9",
    "G10",
    "H7",
    "I7",
  ]);
  setPlacementCells(deployment, "decoy-3", ["J1"]);
  return deployment;
}

function createSalvoBattle() {
  return createTestBattle({
    playerOneDeployment: createPlayerOneSalvoDeployment(),
    playerTwoDeployment: createPlayerTwoSalvoDeployment(),
  });
}

function unit(battle, playerId, unitId) {
  return getBattleUnitById(
    getBattlePlayerState(battle, playerId),
    unitId,
  );
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

function sinkUnits(battle, playerId, unitIds) {
  let next = battle;
  for (const unitId of unitIds) {
    const current = unit(next, playerId, unitId);
    next = damageBattleUnit(next, playerId, unitId, current.hp);
  }
  return next;
}

function exhaustPlayerAttacks(battle, playerId) {
  let next = sinkUnits(battle, playerId, [
    "destroyer-i",
    "destroyer-ii",
    "submarine",
    "pirate",
    "motorboat",
    "motorboat-2",
    "nuclear",
  ]);
  next = setRemainingUses(next, playerId, {
    submarine_missile: 0,
    nuclear_bomb: 0,
    helicopter_strafe: 0,
  });
  return next;
}

function exhaustBothPlayers(battle) {
  let next = exhaustPlayerAttacks(battle, "player-1");
  next = exhaustPlayerAttacks(next, "player-2");
  return next;
}

function destroyBattleDecoy(battle, playerId, decoyId) {
  const player = getBattlePlayerState(battle, playerId);
  const destroyed = destroyDecoy(player, decoyId, "test");
  return replaceBattlePlayerState(battle, playerId, destroyed.state);
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
    submarine_missile: 1,
    nuclear_bomb: 0,
    helicopter_strafe: 0,
  });
  next = exhaustPlayerAttacks(next, "player-2");
  return next;
}

test("终局鱼雷齐射只允许在双方均无攻击手段时执行", () => {
  assert.equal(bothPlayersLackAttackCapability(createTestBattle()), false);
  assert.throws(
    () => resolveFinalSalvo(createTestBattle()),
    (error) => error.code === "FINAL_SALVO_NOT_ALLOWED",
  );

  const exhausted = exhaustBothPlayers(createTestBattle());
  assert.equal(bothPlayersLackAttackCapability(exhausted), true);
});

test("双方所有有效诱饵按同名坐标同时发射并在生命值相同时判平局", () => {
  const resolved = resolveFinalSalvo(exhaustBothPlayers(createSalvoBattle()));

  assert.equal(resolved.finalSalvo.shots.length, 6);
  assert.equal(
    resolved.finalSalvo.shots.filter((shot) => shot.result === "hit").length,
    2,
  );
  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 5);
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 5);
  assert.equal(resolved.result.outcome, "draw");
  assert.equal(resolved.result.reason, END_REASONS.FINAL_SALVO_TIE);
});

test("双方航空母舰均剩 1 点生命值时仍先完成全部齐射再判平局", () => {
  let battle = createSalvoBattle();
  battle = damageBattleUnit(battle, "player-1", "carrier", 5);
  battle = damageBattleUnit(battle, "player-2", "carrier", 5);
  const resolved = resolveFinalSalvo(exhaustBothPlayers(battle));

  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 0);
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 0);
  assert.equal(resolved.finalSalvo.shots.length, 6);
  assert.equal(resolved.result.outcome, "draw");
});

test("终局鱼雷齐射结束后航空母舰剩余生命值较高者获胜", () => {
  let battle = createSalvoBattle();
  battle = damageBattleUnit(battle, "player-2", "carrier", 2);
  const resolved = resolveFinalSalvo(exhaustBothPlayers(battle));

  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 5);
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 3);
  assert.equal(resolved.result.winnerId, "player-1");
  assert.equal(resolved.result.loserId, "player-2");
  assert.equal(
    resolved.result.reason,
    END_REASONS.FINAL_SALVO_HIGHER_CARRIER_HP,
  );
});

test("已经被摧毁的诱饵鱼雷不参加终局齐射", () => {
  let battle = createSalvoBattle();
  battle = destroyBattleDecoy(battle, "player-1", "decoy-3");
  const resolved = resolveFinalSalvo(exhaustBothPlayers(battle));

  assert.equal(resolved.finalSalvo.shots.length, 5);
  assert.equal(
    resolved.finalSalvo.shots.some(
      (shot) => shot.sourceDecoyId === "decoy-3" &&
        shot.sourcePlayerId === "player-1",
    ),
    false,
  );
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 6);
  assert.equal(resolved.result.winnerId, "player-2");
});

test("终局鱼雷命中敌方诱饵部署物时不造成伤害也不摧毁诱饵", () => {
  const resolved = resolveFinalSalvo(
    exhaustBothPlayers(createTestBattle()),
  );

  assert.ok(
    resolved.finalSalvo.shots.every((shot) => shot.result === "miss"),
  );
  assert.ok(
    getBattlePlayerState(resolved.state, "player-1").decoys.every(
      (decoy) => !decoy.destroyed,
    ),
  );
  assert.ok(
    getBattlePlayerState(resolved.state, "player-2").decoys.every(
      (decoy) => !decoy.destroyed,
    ),
  );
  assert.equal(resolved.result.outcome, "draw");
});

test("终局鱼雷覆盖此前已经受击的存活单位格时显示命中但不重复扣血", () => {
  let battle = createSalvoBattle();
  battle = damageBattleUnit(battle, "player-2", "carrier", 1, {
    hitCells: ["G10"],
  });
  const resolved = resolveFinalSalvo(exhaustBothPlayers(battle));
  const repeatedShot = resolved.finalSalvo.shots.find(
    (shot) =>
      shot.sourcePlayerId === "player-1" &&
      shot.targetCoordinate === "G10",
  );

  assert.equal(repeatedShot.result, "hit");
  assert.equal(repeatedShot.freshUnitCell, false);
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 5);
  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 5);
  assert.equal(resolved.result.outcome, "draw");
});

test("最后一种攻击手段使用完毕后进入手动鱼雷选择阶段", () => {
  const battle = prepareLastSubmarineMissile(createTestBattle());
  const resolved = resolveBattleAction(battle, "player-1", {
    actionId: "last-submarine-missile",
    actionType: ACTION_TYPES.SUBMARINE_MISSILE,
    sourceId: "submarine",
    target: { kind: "cell", coordinate: "J1" },
  });

  assert.equal(resolved.state.match.status, "playing");
  assert.ok(resolved.state.match.finalSalvo);
  assert.equal(resolved.state.match.finalSalvo.status, "selecting");
  assert.equal(resolved.state.match.finalSalvo.round, 1);
  assert.equal(resolved.deliveriesByPlayer["player-1"].view.replay, null);
});
