"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DEPLOYABLE_CATEGORIES,
  DEPLOYABLE_DEFINITIONS,
  DEPLOYABLE_TYPES,
  FLEET_REQUIREMENTS,
  isCombatUnitType,
  isSurfaceUnitType,
  isUnderwaterUnitType,
} = require("../server/game/units");

test("舰队编成、占格数和初始生命值与规则文档一致", () => {
  assert.equal(Object.keys(DEPLOYABLE_DEFINITIONS).length, 9);
  assert.deepEqual(FLEET_REQUIREMENTS, {
    destroyer_i: 1,
    destroyer_ii: 1,
    submarine: 1,
    pirate_ship: 1,
    motorboat: 1,
    nuclear_submarine: 1,
    aircraft_carrier: 1,
    decoy_torpedo: 3,
    radar: 1,
  });

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(DEPLOYABLE_DEFINITIONS).map(([type, definition]) => [
        type,
        [definition.cellCount, definition.initialHp],
      ]),
    ),
    {
      destroyer_i: [3, 3],
      destroyer_ii: [4, 3],
      submarine: [4, 2],
      pirate_ship: [3, 2],
      motorboat: [1, 1],
      nuclear_submarine: [4, 2],
      aircraft_carrier: [6, 6],
      decoy_torpedo: [1, null],
      radar: [9, null],
    },
  );
});

test("只有潜水艇和核潜艇属于水下作战单位", () => {
  const underwaterTypes = Object.keys(DEPLOYABLE_DEFINITIONS).filter(
    isUnderwaterUnitType,
  );
  assert.deepEqual(underwaterTypes, [
    DEPLOYABLE_TYPES.SUBMARINE,
    DEPLOYABLE_TYPES.NUCLEAR_SUBMARINE,
  ]);

  assert.equal(isSurfaceUnitType(DEPLOYABLE_TYPES.DESTROYER_I), true);
  assert.equal(isSurfaceUnitType(DEPLOYABLE_TYPES.DECOY_TORPEDO), false);
  assert.equal(isCombatUnitType(DEPLOYABLE_TYPES.DECOY_TORPEDO), false);
  assert.equal(
    DEPLOYABLE_DEFINITIONS[DEPLOYABLE_TYPES.DECOY_TORPEDO].category,
    DEPLOYABLE_CATEGORIES.DEPLOYMENT,
  );
});
