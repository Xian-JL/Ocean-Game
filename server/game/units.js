"use strict";

const { RuleValidationError } = require("./errors");

const DEPLOYABLE_TYPES = Object.freeze({
  DESTROYER_I: "destroyer_i",
  DESTROYER_II: "destroyer_ii",
  SUBMARINE: "submarine",
  PIRATE_SHIP: "pirate_ship",
  MOTORBOAT: "motorboat",
  NUCLEAR_SUBMARINE: "nuclear_submarine",
  AIRCRAFT_CARRIER: "aircraft_carrier",
  DECOY_TORPEDO: "decoy_torpedo",
});

const DEPLOYABLE_CATEGORIES = Object.freeze({
  SURFACE_UNIT: "surface_unit",
  UNDERWATER_UNIT: "underwater_unit",
  DEPLOYMENT: "deployment",
});

const DEPLOYMENT_SHAPES = Object.freeze({
  LINE: "line",
  SQUARE_2X2: "square_2x2",
  SINGLE: "single",
  FOUR_CONNECTED: "four_connected",
});

function freezeDefinition(definition) {
  return Object.freeze(definition);
}

const DEPLOYABLE_DEFINITIONS = Object.freeze({
  [DEPLOYABLE_TYPES.DESTROYER_I]: freezeDefinition({
    type: DEPLOYABLE_TYPES.DESTROYER_I,
    name: "驱逐舰Ⅰ",
    category: DEPLOYABLE_CATEGORIES.SURFACE_UNIT,
    count: 1,
    cellCount: 3,
    initialHp: 3,
    shape: DEPLOYMENT_SHAPES.LINE,
  }),
  [DEPLOYABLE_TYPES.DESTROYER_II]: freezeDefinition({
    type: DEPLOYABLE_TYPES.DESTROYER_II,
    name: "驱逐舰Ⅱ",
    category: DEPLOYABLE_CATEGORIES.SURFACE_UNIT,
    count: 1,
    cellCount: 4,
    initialHp: 3,
    shape: DEPLOYMENT_SHAPES.LINE,
  }),
  [DEPLOYABLE_TYPES.SUBMARINE]: freezeDefinition({
    type: DEPLOYABLE_TYPES.SUBMARINE,
    name: "潜水艇",
    category: DEPLOYABLE_CATEGORIES.UNDERWATER_UNIT,
    count: 1,
    cellCount: 4,
    initialHp: 2,
    shape: DEPLOYMENT_SHAPES.SQUARE_2X2,
  }),
  [DEPLOYABLE_TYPES.PIRATE_SHIP]: freezeDefinition({
    type: DEPLOYABLE_TYPES.PIRATE_SHIP,
    name: "海盗船",
    category: DEPLOYABLE_CATEGORIES.SURFACE_UNIT,
    count: 1,
    cellCount: 3,
    initialHp: 2,
    shape: DEPLOYMENT_SHAPES.LINE,
  }),
  [DEPLOYABLE_TYPES.MOTORBOAT]: freezeDefinition({
    type: DEPLOYABLE_TYPES.MOTORBOAT,
    name: "摩托艇",
    category: DEPLOYABLE_CATEGORIES.SURFACE_UNIT,
    count: 2,
    cellCount: 1,
    initialHp: 1,
    shape: DEPLOYMENT_SHAPES.SINGLE,
  }),
  [DEPLOYABLE_TYPES.NUCLEAR_SUBMARINE]: freezeDefinition({
    type: DEPLOYABLE_TYPES.NUCLEAR_SUBMARINE,
    name: "核潜艇",
    category: DEPLOYABLE_CATEGORIES.UNDERWATER_UNIT,
    count: 1,
    cellCount: 4,
    initialHp: 3,
    shape: DEPLOYMENT_SHAPES.SQUARE_2X2,
  }),
  [DEPLOYABLE_TYPES.AIRCRAFT_CARRIER]: freezeDefinition({
    type: DEPLOYABLE_TYPES.AIRCRAFT_CARRIER,
    name: "航空母舰",
    category: DEPLOYABLE_CATEGORIES.SURFACE_UNIT,
    count: 1,
    cellCount: 6,
    initialHp: 6,
    shape: DEPLOYMENT_SHAPES.FOUR_CONNECTED,
  }),
  [DEPLOYABLE_TYPES.DECOY_TORPEDO]: freezeDefinition({
    type: DEPLOYABLE_TYPES.DECOY_TORPEDO,
    name: "诱饵鱼雷",
    category: DEPLOYABLE_CATEGORIES.DEPLOYMENT,
    count: 3,
    cellCount: 1,
    initialHp: null,
    shape: DEPLOYMENT_SHAPES.SINGLE,
  }),
});

const DEPLOYABLE_TYPE_ORDER = Object.freeze([
  DEPLOYABLE_TYPES.DESTROYER_I,
  DEPLOYABLE_TYPES.DESTROYER_II,
  DEPLOYABLE_TYPES.SUBMARINE,
  DEPLOYABLE_TYPES.PIRATE_SHIP,
  DEPLOYABLE_TYPES.MOTORBOAT,
  DEPLOYABLE_TYPES.NUCLEAR_SUBMARINE,
  DEPLOYABLE_TYPES.AIRCRAFT_CARRIER,
  DEPLOYABLE_TYPES.DECOY_TORPEDO,
]);

const FLEET_REQUIREMENTS = Object.freeze(
  Object.fromEntries(
    DEPLOYABLE_TYPE_ORDER.map((type) => [
      type,
      DEPLOYABLE_DEFINITIONS[type].count,
    ]),
  ),
);

function getDeployableDefinition(type) {
  const definition = DEPLOYABLE_DEFINITIONS[type];

  if (!definition) {
    throw new RuleValidationError(
      "UNKNOWN_DEPLOYABLE_TYPE",
      "未知的部署对象类型。",
      { type },
    );
  }

  return definition;
}

function isCombatUnitType(type) {
  const definition = DEPLOYABLE_DEFINITIONS[type];
  return Boolean(
    definition &&
      definition.category !== DEPLOYABLE_CATEGORIES.DEPLOYMENT,
  );
}

function isSurfaceUnitType(type) {
  return (
    DEPLOYABLE_DEFINITIONS[type]?.category ===
    DEPLOYABLE_CATEGORIES.SURFACE_UNIT
  );
}

function isUnderwaterUnitType(type) {
  return (
    DEPLOYABLE_DEFINITIONS[type]?.category ===
    DEPLOYABLE_CATEGORIES.UNDERWATER_UNIT
  );
}

module.exports = {
  DEPLOYABLE_CATEGORIES,
  DEPLOYABLE_DEFINITIONS,
  DEPLOYABLE_TYPE_ORDER,
  DEPLOYABLE_TYPES,
  DEPLOYMENT_SHAPES,
  FLEET_REQUIREMENTS,
  getDeployableDefinition,
  isCombatUnitType,
  isSurfaceUnitType,
  isUnderwaterUnitType,
};
