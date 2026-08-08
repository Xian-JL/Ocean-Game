"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  createInitialActionState,
  getRemainingUses,
  getUnitById,
  hasResolvedTargetCell,
  markSubmarineMissileTarget,
  markTargetCellsResolved,
  setUnitStatus,
} = require("../server/game/action-state");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

test("合法部署生成七个作战单位及全部初始资源", () => {
  const state = createInitialActionState(createValidDeployment());
  assert.equal(state.units.length, 7);
  assert.equal(getUnitById(state, "carrier").hp, 6);
  assert.equal(getUnitById(state, "submarine").paralyzed, false);
  assert.deepEqual(state.remainingUses, {
    submarine_missile: 3,
    nuclear_bomb: 2,
    shock_bomb: 1,
    detection_bomb: 1,
    helicopter_strafe: 1,
    radar_scan: 1,
  });
  assert.equal(getRemainingUses(state, ACTION_TYPES.PIRATE_ATTACK), null);
  assert.deepEqual(state.submarineMissileMarkers, []);
});

test("单位状态更新不修改原状态，并支持 0.5 生命值", () => {
  const original = createInitialActionState(createValidDeployment());
  const changed = setUnitStatus(original, "pirate", { hp: 0.5 });
  assert.equal(getUnitById(original, "pirate").hp, 2);
  assert.equal(getUnitById(changed, "pirate").hp, 0.5);
});

test("只有存活的潜水艇和核潜艇能够被标记为瘫痪", () => {
  const state = createInitialActionState(createValidDeployment());
  const paralyzed = setUnitStatus(state, "submarine", { paralyzed: true });
  assert.equal(getUnitById(paralyzed, "submarine").paralyzed, true);

  assert.throws(
    () => setUnitStatus(state, "destroyer-i", { paralyzed: true }),
    (error) => error.code === "INVALID_PARALYSIS_TARGET",
  );

  const sunk = setUnitStatus(state, "nuclear", { hp: 0 });
  assert.throws(
    () => setUnitStatus(sunk, "nuclear", { paralyzed: true }),
    (error) => error.code === "INVALID_PARALYSIS_TARGET",
  );
});

test("生命值范围和最小变化单位受到校验", () => {
  const state = createInitialActionState(createValidDeployment());
  for (const hp of [-0.5, 2.1, 3]) {
    assert.throws(
      () => setUnitStatus(state, "submarine", { hp }),
      (error) => error.code === "INVALID_HP",
    );
  }

  const damaged = setUnitStatus(state, "submarine", { hp: 1 });
  assert.throws(
    () => setUnitStatus(damaged, "submarine", { hp: 2 }),
    (error) => error.code === "HP_INCREASE_NOT_ALLOWED",
  );
});

test("已结算格和潜射标记分别保存且坐标去重", () => {
  const state = createInitialActionState(createValidDeployment());
  const resolved = markTargetCellsResolved(state, ["b2", "A1", "A1"]);
  let marked = markSubmarineMissileTarget(resolved, "b10");
  marked = markSubmarineMissileTarget(marked, "a1");
  marked = markSubmarineMissileTarget(marked, "a1");
  assert.deepEqual(resolved.resolvedTargetCells, ["A1", "B2"]);
  assert.equal(hasResolvedTargetCell(resolved, "a1"), true);
  assert.deepEqual(marked.submarineMissileMarkers, ["A1", "B10"]);
  assert.deepEqual(state.resolvedTargetCells, []);
});
