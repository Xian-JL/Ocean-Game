"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const { resolveAction } = require("../server/game/action-resolution");
const {
  beginNormalTurn,
  getBattlePlayerState,
  getBattleUnitById,
  recordTargetCellResults,
  replaceBattlePlayerState,
} = require("../server/game/battle-state");
const {
  createTestBattle,
  damageBattleUnit,
} = require("../test-fixtures/battle");

function cellIntent(actionId, actionType, sourceId, coordinate) {
  return {
    actionId,
    actionType,
    sourceId,
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

function player(battle, playerId) {
  return getBattlePlayerState(battle, playerId);
}

function unit(battle, playerId, unitId) {
  return getBattleUnitById(player(battle, playerId), unitId);
}

function unlockHelicopter(battle, playerId = "player-1") {
  let next = battle;
  next = damageBattleUnit(next, playerId, "destroyer-i", 3);
  next = damageBattleUnit(next, playerId, "destroyer-ii", 3);
  return next;
}

test("震爆弹只把区域覆盖到的存活水下单位加入待生效瘫痪", () => {
  const resolved = resolveAction(
    createTestBattle(),
    "player-1",
    cellIntent(
      "shock-two-underwater",
      ACTION_TYPES.SHOCK_BOMB,
      "nuclear",
      "F3",
    ),
  );

  assert.deepEqual(
    player(resolved.state, "player-2").pendingParalysisUnitIds,
    ["submarine", "nuclear"],
  );
  assert.deepEqual(resolved.result.outcome.affectedUnitIds, [
    "submarine",
    "nuclear",
  ]);
  assert.equal(unit(resolved.state, "player-2", "destroyer-ii").paralyzed, false);
  assert.ok(
    player(resolved.state, "player-2").decoys.every(
      (candidate) => candidate.destroyed === false,
    ),
  );
  assert.deepEqual(player(resolved.state, "player-1").resolvedTargetCells, []);
  assert.equal(player(resolved.state, "player-1").remainingUses.shock_bomb, 0);
});

test("震爆在防守方下一个正常回合生效，并在其他单位行动后解除", () => {
  const shocked = resolveAction(
    createTestBattle(),
    "player-1",
    cellIntent(
      "shock-lifecycle",
      ACTION_TYPES.SHOCK_BOMB,
      "nuclear",
      "F3",
    ),
  );
  const begun = beginNormalTurn(shocked.state, "player-2");
  assert.deepEqual(begun.activatedUnitIds, ["submarine", "nuclear"]);
  assert.equal(unit(begun.state, "player-2", "submarine").paralyzed, true);
  assert.equal(unit(begun.state, "player-2", "nuclear").paralyzed, true);

  const acted = resolveAction(
    begun.state,
    "player-2",
    cellIntent(
      "surface-action-clears-shock",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "J1",
    ),
  );
  assert.equal(unit(acted.state, "player-2", "submarine").paralyzed, false);
  assert.equal(unit(acted.state, "player-2", "nuclear").paralyzed, false);
});

test("探测弹只返回区域内是否存在未受击水下单位格或有效诱饵", () => {
  const detected = resolveAction(
    createTestBattle(),
    "player-1",
    cellIntent(
      "detect-submarine",
      ACTION_TYPES.DETECTION_BOMB,
      "nuclear",
      "B2",
    ),
  );
  assert.equal(detected.result.outcome.detected, true);
  assert.equal(detected.result.outcome.area.length, 9);
  assert.deepEqual(player(detected.state, "player-1").resolvedTargetCells, []);

  let hitSignalCell = createTestBattle();
  hitSignalCell = damageBattleUnit(
    hitSignalCell,
    "player-2",
    "submarine",
    1,
    { hitCells: ["C3"] },
  );
  const noSignal = resolveAction(
    hitSignalCell,
    "player-1",
    cellIntent(
      "detect-hit-cell",
      ACTION_TYPES.DETECTION_BOMB,
      "nuclear",
      "B2",
    ),
  );
  assert.equal(noSignal.result.outcome.detected, false);
});

test("有效诱饵产生水下信号，被摧毁后不再产生信号", () => {
  const active = resolveAction(
    createTestBattle(),
    "player-1",
    cellIntent(
      "detect-active-decoy",
      ACTION_TYPES.DETECTION_BOMB,
      "nuclear",
      "B9",
    ),
  );
  assert.equal(active.result.outcome.detected, true);

  const destroyed = resolveAction(
    createTestBattle(),
    "player-1",
    cellIntent(
      "destroy-decoy-before-detect",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "A10",
    ),
  );
  const afterDestruction = resolveAction(
    destroyed.state,
    "player-1",
    cellIntent(
      "detect-destroyed-decoy",
      ACTION_TYPES.DETECTION_BOMB,
      "nuclear",
      "B9",
    ),
  );
  assert.equal(afterDestruction.result.outcome.detected, false);
  assert.deepEqual(
    player(afterDestruction.state, "player-1").resolvedTargetCells,
    [],
  );
});

test("雷达扫描完整 4×4 区域且只返回是否存在敌方布局", () => {
  const found = resolveAction(
    createTestBattle(), "player-1",
    cellIntent("radar-found", ACTION_TYPES.RADAR_SCAN, "carrier", "I7"),
  );
  assert.equal(found.result.outcome.kind, "radar");
  assert.equal(found.result.outcome.area.length, 16);
  assert.equal(found.result.outcome.detected, true);
  assert.equal(player(found.state, "player-1").remainingUses.radar_scan, 0);

  const empty = resolveAction(
    createTestBattle(), "player-1",
    cellIntent("radar-empty", ACTION_TYPES.RADAR_SCAN, "carrier", "A5"),
  );
  assert.equal(empty.result.outcome.detected, false);
});

test("直升机扫射同时处理整列，只命中水面单位", () => {
  const resolved = resolveAction(
    unlockHelicopter(createTestBattle()),
    "player-1",
    lineIntent("helicopter-column-1", { kind: "column", column: 1 }),
  );

  assert.equal(unit(resolved.state, "player-2", "destroyer-i").hp, 2);
  assert.equal(unit(resolved.state, "player-2", "destroyer-ii").hp, 0);
  assert.deepEqual(
    unit(resolved.state, "player-2", "destroyer-ii").hitCells,
    ["B1", "C1", "D1", "E1"],
  );
  assert.equal(unit(resolved.state, "player-2", "pirate").hp, 1);
  assert.equal(unit(resolved.state, "player-2", "nuclear").hp, 3);
  assert.deepEqual(unit(resolved.state, "player-2", "nuclear").hitCells, []);

  const cellResults = resolved.result.outcome.cellResults;
  assert.equal(cellResults.filter((item) => item.result === "hit").length, 6);
  assert.equal(cellResults.filter((item) => item.result === "miss").length, 6);
  assert.equal(player(resolved.state, "player-1").resolvedTargetCells.length, 12);
});

test("直升机一次扫过航空母舰多个单位格时最多造成 2 点伤害", () => {
  const resolved = resolveAction(
    unlockHelicopter(createTestBattle()),
    "player-1",
    lineIntent("helicopter-carrier-cap", {
      kind: "column",
      column: 5,
    }),
  );

  const carrier = unit(resolved.state, "player-2", "carrier");
  assert.equal(carrier.hp, 4);
  assert.deepEqual(carrier.hitCells, ["G5", "H5", "I5", "J5"]);
  const event = resolved.result.outcome.damageEvents.find(
    (candidate) => candidate.unitId === "carrier",
  );
  assert.equal(event.coveredFreshCellCount, 4);
  assert.equal(event.requestedDamage, 2);
  assert.equal(event.appliedDamage, 2);
});

test("直升机不命中或摧毁诱饵鱼雷，但会命中同列的摩托艇", () => {
  const resolved = resolveAction(
    unlockHelicopter(createTestBattle()),
    "player-1",
    lineIntent("helicopter-decoys", { kind: "column", column: 10 }),
  );

  assert.equal(unit(resolved.state, "player-2", "motorboat").hp, 0);
  assert.ok(
    player(resolved.state, "player-2").decoys.every(
      (candidate) => candidate.destroyed === false,
    ),
  );
  for (const coordinate of ["A10", "D10", "G10"]) {
    const cell = resolved.result.outcome.cellResults.find(
      (candidate) => candidate.coordinate === coordinate,
    );
    assert.equal(cell.result, "miss");
    assert.equal(cell.actualTargetKind, "decoy");
  }
});

test("直升机重复覆盖已受击格仍报告命中但不重复伤害", () => {
  let battle = unlockHelicopter(createTestBattle());
  battle = damageBattleUnit(battle, "player-2", "carrier", 1, {
    hitCells: ["G5"],
  });
  let actor = player(battle, "player-1");
  actor = recordTargetCellResults(actor, [
    { coordinate: "G5", result: "hit" },
  ]);
  battle = replaceBattlePlayerState(battle, "player-1", actor);

  const resolved = resolveAction(
    battle,
    "player-1",
    lineIntent("helicopter-skip", { kind: "column", column: 5 }),
  );
  const carrier = unit(resolved.state, "player-2", "carrier");
  assert.equal(carrier.hp, 3);
  assert.deepEqual(carrier.hitCells, ["G5", "H5", "I5", "J5"]);

  const skipped = resolved.result.outcome.cellResults.find(
    (candidate) => candidate.coordinate === "G5",
  );
  assert.equal(skipped.result, "hit");
  assert.equal(resolved.result.pendingTargetCells.length, 12);
});

test("潜射导弹造成的隐藏受击格仍被范围攻击处理，但不会重复造成伤害", () => {
  const hiddenHit = resolveAction(
    createTestBattle(),
    "player-1",
    cellIntent(
      "hidden-carrier-hit",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      "G5",
    ),
  );
  let battle = unlockHelicopter(hiddenHit.state);
  const resolved = resolveAction(
    battle,
    "player-1",
    lineIntent("helicopter-after-hidden", {
      kind: "column",
      column: 5,
    }),
  );

  const carrier = unit(resolved.state, "player-2", "carrier");
  assert.equal(carrier.hp, 3);
  assert.deepEqual(carrier.hitCells, ["G5", "H5", "I5", "J5"]);
  const hiddenCell = resolved.result.outcome.cellResults.find(
    (candidate) => candidate.coordinate === "G5",
  );
  assert.equal(hiddenCell.result, "hit");
  assert.equal(hiddenCell.freshUnitCell, false);
  assert.ok(
    player(resolved.state, "player-1").submarineMissileMarkers.includes(
      "G5",
    ),
  );
  assert.ok(
    player(resolved.state, "player-1").resolvedTargetCells.includes("G5"),
  );
});
