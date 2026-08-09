"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const { resolveAction } = require("../server/game/action-resolution");
const {
  getBattlePlayerState,
  getBattleUnitById,
} = require("../server/game/battle-state");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");
const {
  createTestBattle,
  damageBattleUnit,
} = require("../test-fixtures/battle");

function createIntent(actionId, actionType, sourceId, coordinate) {
  return {
    actionId,
    actionType,
    sourceId,
    target: { kind: "cell", coordinate },
  };
}

function player(battle, playerId) {
  return getBattlePlayerState(battle, playerId);
}

function unit(battle, playerId, unitId) {
  return getBattleUnitById(player(battle, playerId), unitId);
}

function decoy(battle, playerId, decoyId) {
  return player(battle, playerId).decoys.find(
    (candidate) => candidate.id === decoyId,
  );
}

test("驱逐舰Ⅰ命中作战单位时目标受 1、己方受 0.5 点伤害", () => {
  const initial = createTestBattle();
  const resolved = resolveAction(
    initial,
    "player-1",
    createIntent(
      "destroyer-i-hit",
      ACTION_TYPES.DESTROYER_I_RAM,
      "destroyer-i",
      "D4",
    ),
  );

  assert.equal(unit(resolved.state, "player-2", "submarine").hp, 1);
  assert.deepEqual(
    unit(resolved.state, "player-2", "submarine").hitCells,
    ["D4"],
  );
  assert.equal(unit(resolved.state, "player-1", "destroyer-i").hp, 2.5);
  assert.deepEqual(player(resolved.state, "player-1").resolvedTargetCells, [
    "D4",
  ]);
  assert.deepEqual(player(resolved.state, "player-1").targetCellResults, {
    D4: "hit",
  });
  assert.equal(resolved.result.outcome.actualResult, "hit");
  assert.equal(initial.actionLog.length, 0);
  assert.equal(resolved.state.actionLog.length, 1);
  assert.equal(resolved.state.nextActionSequence, 2);
});

test("驱逐舰Ⅱ命中航空母舰时目标受 1、己方受 0.5 点伤害", () => {
  const resolved = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "destroyer-ii-hit",
      ACTION_TYPES.DESTROYER_II_RAM,
      "destroyer-ii",
      "G5",
    ),
  );
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 5);
  assert.equal(unit(resolved.state, "player-1", "destroyer-ii").hp, 2.5);
  assert.equal(resolved.result.outcome.actualResult, "hit");
});

test("驱逐舰命中诱饵时摧毁诱饵并自损，未命中时不自损", () => {
  const defenderDeployment = createValidDeployment();
  defenderDeployment.find((entry) => entry.id === "decoy-1").cells = ["B2"];
  const decoyBattle = createTestBattle({
    playerTwoDeployment: defenderDeployment,
  });
  const hit = resolveAction(
    decoyBattle,
    "player-1",
    createIntent(
      "destroyer-decoy",
      ACTION_TYPES.DESTROYER_I_RAM,
      "destroyer-i",
      "B2",
    ),
  );
  assert.equal(decoy(hit.state, "player-2", "decoy-1").destroyed, true);
  assert.equal(unit(hit.state, "player-1", "destroyer-i").hp, 2);
  assert.equal(hit.result.outcome.actualResult, "hit");

  const miss = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "destroyer-miss",
      ACTION_TYPES.DESTROYER_I_RAM,
      "destroyer-i",
      "D5",
    ),
  );
  assert.equal(unit(miss.state, "player-1", "destroyer-i").hp, 3);
  assert.equal(miss.result.outcome.actualResult, "miss");
  assert.equal(
    player(miss.state, "player-1").targetCellResults.D5,
    "miss",
  );
});

test("海盗船命中航空母舰后自损，并触发己方航母 0.5 联动伤害", () => {
  const resolved = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "pirate-carrier",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "G5",
    ),
  );
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 4);
  assert.equal(unit(resolved.state, "player-1", "pirate").hp, 1);
  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 5.5);
  assert.equal(resolved.result.outcome.damageEvents.length, 3);
});

test("海盗船命中其他作战单位时目标扣 2、海盗船扣 1、己方航母扣 0.5", () => {
  const resolved = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "pirate-other",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "A1",
    ),
  );
  assert.equal(unit(resolved.state, "player-2", "destroyer-i").hp, 1);
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 6);
  assert.equal(unit(resolved.state, "player-1", "pirate").hp, 1);
  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 5.5);
});

test("海盗船命中诱饵时摧毁诱饵、海盗船受爆炸伤害 1、己方航母扣 0.5", () => {
  const resolved = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "pirate-decoy",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "A10",
    ),
  );
  assert.equal(decoy(resolved.state, "player-2", "decoy-1").destroyed, true);
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 6);
  assert.equal(unit(resolved.state, "player-1", "pirate").hp, 1);
  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 5.5);
});

test("海盗船未命中时目标、双方航母和海盗船均不受伤害", () => {
  const resolved = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "pirate-miss",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "J1",
    ),
  );
  assert.equal(unit(resolved.state, "player-1", "pirate").hp, 2);
  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 6);
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 6);
  assert.equal(resolved.result.outcome.damageEvents.length, 0);
  assert.equal(resolved.result.outcome.actualResult, "miss");
});

test("海盗船行动即使造成双方航空母舰同时沉没也完整结算", () => {
  let battle = createTestBattle();
  battle = damageBattleUnit(battle, "player-1", "carrier", 5.5);
  battle = damageBattleUnit(battle, "player-1", "pirate", 1);
  battle = damageBattleUnit(battle, "player-2", "carrier", 4);

  const resolved = resolveAction(
    battle,
    "player-1",
    createIntent(
      "pirate-simultaneous",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "G5",
    ),
  );
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 0);
  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 0);
  assert.equal(unit(resolved.state, "player-1", "pirate").hp, 0);
});

test("摩托艇只伤害航空母舰，命中其他水面单位只标记命中并自沉", () => {
  const carrierHit = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "motor-carrier",
      ACTION_TYPES.MOTORBOAT_RAM,
      "motorboat",
      "G5",
    ),
  );
  assert.equal(unit(carrierHit.state, "player-2", "carrier").hp, 5);
  assert.equal(unit(carrierHit.state, "player-1", "motorboat").hp, 0);

  const surfaceHit = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "motor-surface",
      ACTION_TYPES.MOTORBOAT_RAM,
      "motorboat",
      "A1",
    ),
  );
  assert.equal(unit(surfaceHit.state, "player-2", "destroyer-i").hp, 3);
  assert.deepEqual(
    unit(surfaceHit.state, "player-2", "destroyer-i").hitCells,
    ["A1"],
  );
  assert.equal(unit(surfaceHit.state, "player-1", "motorboat").hp, 0);
  assert.equal(surfaceHit.result.outcome.actualResult, "hit");
});

test("摩托艇攻击水下单位或空海域未命中且不自损", () => {
  for (const [actionId, coordinate] of [
    ["motor-underwater", "C3"],
    ["motor-empty", "J1"],
  ]) {
    const resolved = resolveAction(
      createTestBattle(),
      "player-1",
      createIntent(
        actionId,
        ACTION_TYPES.MOTORBOAT_RAM,
        "motorboat",
        coordinate,
      ),
    );
    assert.equal(unit(resolved.state, "player-1", "motorboat").hp, 1);
    assert.equal(resolved.result.outcome.actualResult, "miss");
  }
});

test("摩托艇命中诱饵时摧毁诱饵并自沉", () => {
  const resolved = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "motor-decoy",
      ACTION_TYPES.MOTORBOAT_RAM,
      "motorboat",
      "A10",
    ),
  );
  assert.equal(decoy(resolved.state, "player-2", "decoy-1").destroyed, true);
  assert.equal(unit(resolved.state, "player-1", "motorboat").hp, 0);
});

test("潜射导弹造成实际伤害但只留下潜射标记，不产生已结算格", () => {
  const first = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "missile-first",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      "A1",
    ),
  );
  assert.equal(unit(first.state, "player-2", "destroyer-i").hp, 2);
  assert.deepEqual(player(first.state, "player-1").submarineMissileMarkers, [
    "A1",
  ]);
  assert.deepEqual(player(first.state, "player-1").resolvedTargetCells, []);
  assert.deepEqual(player(first.state, "player-1").targetCellResults, {});

  const second = resolveAction(
    first.state,
    "player-1",
    createIntent(
      "missile-second",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      "A1",
    ),
  );
  assert.equal(unit(second.state, "player-2", "destroyer-i").hp, 2);
  assert.equal(
    player(second.state, "player-1").remainingUses.submarine_missile,
    2,
  );
  assert.equal(second.result.outcome.damageEvents.length, 0);
});

test("潜射导弹命中诱饵时摧毁诱饵，但目标格仍不是已结算格", () => {
  const resolved = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "missile-decoy",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      "A10",
    ),
  );
  assert.equal(decoy(resolved.state, "player-2", "decoy-1").destroyed, true);
  assert.deepEqual(player(resolved.state, "player-1").resolvedTargetCells, []);
  assert.deepEqual(player(resolved.state, "player-1").submarineMissileMarkers, [
    "A10",
  ]);
});

test("核弹对航空母舰造成 2 点伤害，对其他单位造成 1 点伤害", () => {
  const carrier = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "nuclear-carrier",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "G5",
    ),
  );
  assert.equal(unit(carrier.state, "player-2", "carrier").hp, 4);

  const other = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "nuclear-other",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "A1",
    ),
  );
  assert.equal(unit(other.state, "player-2", "destroyer-i").hp, 2);
});

test("核弹可以摧毁诱饵，命中空海域则不造成伤害", () => {
  const decoyHit = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "nuclear-decoy",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "A10",
    ),
  );
  assert.equal(decoy(decoyHit.state, "player-2", "decoy-1").destroyed, true);

  const miss = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "nuclear-miss",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "J1",
    ),
  );
  assert.equal(miss.result.outcome.actualResult, "miss");
  assert.equal(miss.result.outcome.damageEvents.length, 0);
});

test("同一单位格被潜射导弹命中过后不会再次造成任何伤害", () => {
  const hidden = resolveAction(
    createTestBattle(),
    "player-1",
    createIntent(
      "hidden-hit",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      "A1",
    ),
  );
  const visible = resolveAction(
    hidden.state,
    "player-1",
    createIntent(
      "visible-repeat",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "A1",
    ),
  );
  assert.equal(unit(visible.state, "player-2", "destroyer-i").hp, 2);
  assert.equal(unit(visible.state, "player-2", "carrier").hp, 6);
  assert.equal(unit(visible.state, "player-1", "pirate").hp, 2);
  assert.equal(visible.result.outcome.actualResult, "hit");
  assert.deepEqual(player(visible.state, "player-1").resolvedTargetCells, [
    "A1",
  ]);
  assert.equal(
    player(visible.state, "player-1").targetCellResults.A1,
    "hit",
  );
});

test("海盗船重复命中同一已受击格不再触发目标、航母或自身伤害", () => {
  const first = resolveAction(
    createTestBattle(), "player-1",
    createIntent("pirate-first-cell", ACTION_TYPES.PIRATE_ATTACK, "pirate", "C3"),
  );
  const hpAfterFirst = {
    target: unit(first.state, "player-2", "submarine").hp,
    enemyCarrier: unit(first.state, "player-2", "carrier").hp,
    pirate: unit(first.state, "player-1", "pirate").hp,
  };
  const second = resolveAction(
    first.state, "player-1",
    createIntent("pirate-repeat-cell", ACTION_TYPES.PIRATE_ATTACK, "pirate", "C3"),
  );
  assert.equal(second.result.outcome.actualResult, "miss");
  assert.deepEqual({
    target: unit(second.state, "player-2", "submarine").hp,
    enemyCarrier: unit(second.state, "player-2", "carrier").hp,
    pirate: unit(second.state, "player-1", "pirate").hp,
  }, hpAfterFirst);
  assert.equal(second.result.outcome.damageEvents.length, 0);
});

test("沉没单位的其他单位格作为残骸处理并返回未命中", () => {
  let battle = createTestBattle();
  battle = damageBattleUnit(battle, "player-2", "carrier", 4);
  const sunk = resolveAction(
    battle,
    "player-1",
    createIntent(
      "sink-carrier",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "G5",
    ),
  );
  assert.equal(unit(sunk.state, "player-2", "carrier").hp, 0);

  const wreck = resolveAction(
    sunk.state,
    "player-1",
    createIntent(
      "attack-wreck",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "G6",
    ),
  );
  assert.equal(wreck.result.outcome.actualResult, "miss");
  assert.equal(unit(wreck.state, "player-1", "pirate").hp, 2);
});

test("非法行动不改变原权威战场", () => {
  const battle = createTestBattle();
  const snapshot = JSON.stringify(battle);
  assert.throws(
    () =>
      resolveAction(
        battle,
        "player-1",
        createIntent(
          "invalid-range",
          ACTION_TYPES.DESTROYER_I_RAM,
          "destroyer-i",
          "J10",
        ),
      ),
    (error) => error.code === "INVALID_ACTION",
  );
  assert.equal(JSON.stringify(battle), snapshot);
});
