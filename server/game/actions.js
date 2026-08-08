"use strict";

const { RuleValidationError } = require("./errors");
const { DEPLOYABLE_TYPES } = require("./units");

const ACTION_TYPES = Object.freeze({
  DESTROYER_I_RAM: "destroyer_i_ram",
  DESTROYER_II_RAM: "destroyer_ii_ram",
  PIRATE_ATTACK: "pirate_attack",
  MOTORBOAT_RAM: "motorboat_ram",
  SUBMARINE_MISSILE: "submarine_missile",
  NUCLEAR_BOMB: "nuclear_bomb",
  SHOCK_BOMB: "shock_bomb",
  DETECTION_BOMB: "detection_bomb",
  HELICOPTER_STRAFE: "helicopter_strafe",
});

const ACTION_CATEGORIES = Object.freeze({
  ATTACK: "attack",
  AUXILIARY: "auxiliary",
});

const TARGET_MODES = Object.freeze({
  SINGLE_CELL: "single_cell",
  AREA_CENTER: "area_center",
  ROW_OR_COLUMN: "row_or_column",
});

const RANGE_MODES = Object.freeze({
  DESTROYER_I: "destroyer_i",
  DESTROYER_II: "destroyer_ii",
  FULL_BOARD: "full_board",
  SHOCK_AREA: "shock_area",
  DETECTION_AREA: "detection_area",
  FULL_LINE: "full_line",
});

const LIMIT_KINDS = Object.freeze({
  UNLIMITED: "unlimited",
  AMMUNITION: "ammunition",
  USE_COUNT: "use_count",
});

function freezeDefinition(definition) {
  return Object.freeze(definition);
}

const ACTION_DEFINITIONS = Object.freeze({
  [ACTION_TYPES.DESTROYER_I_RAM]: freezeDefinition({
    type: ACTION_TYPES.DESTROYER_I_RAM,
    name: "驱逐舰Ⅰ冲撞",
    category: ACTION_CATEGORIES.ATTACK,
    sourceType: DEPLOYABLE_TYPES.DESTROYER_I,
    targetMode: TARGET_MODES.SINGLE_CELL,
    rangeMode: RANGE_MODES.DESTROYER_I,
    limitKind: LIMIT_KINDS.UNLIMITED,
    initialUses: null,
  }),
  [ACTION_TYPES.DESTROYER_II_RAM]: freezeDefinition({
    type: ACTION_TYPES.DESTROYER_II_RAM,
    name: "驱逐舰Ⅱ冲撞",
    category: ACTION_CATEGORIES.ATTACK,
    sourceType: DEPLOYABLE_TYPES.DESTROYER_II,
    targetMode: TARGET_MODES.SINGLE_CELL,
    rangeMode: RANGE_MODES.DESTROYER_II,
    limitKind: LIMIT_KINDS.UNLIMITED,
    initialUses: null,
  }),
  [ACTION_TYPES.PIRATE_ATTACK]: freezeDefinition({
    type: ACTION_TYPES.PIRATE_ATTACK,
    name: "海盗船攻击",
    category: ACTION_CATEGORIES.ATTACK,
    sourceType: DEPLOYABLE_TYPES.PIRATE_SHIP,
    targetMode: TARGET_MODES.SINGLE_CELL,
    rangeMode: RANGE_MODES.FULL_BOARD,
    limitKind: LIMIT_KINDS.UNLIMITED,
    initialUses: null,
  }),
  [ACTION_TYPES.MOTORBOAT_RAM]: freezeDefinition({
    type: ACTION_TYPES.MOTORBOAT_RAM,
    name: "摩托艇冲撞",
    category: ACTION_CATEGORIES.ATTACK,
    sourceType: DEPLOYABLE_TYPES.MOTORBOAT,
    targetMode: TARGET_MODES.SINGLE_CELL,
    rangeMode: RANGE_MODES.FULL_BOARD,
    limitKind: LIMIT_KINDS.UNLIMITED,
    initialUses: null,
  }),
  [ACTION_TYPES.SUBMARINE_MISSILE]: freezeDefinition({
    type: ACTION_TYPES.SUBMARINE_MISSILE,
    name: "潜射导弹",
    category: ACTION_CATEGORIES.ATTACK,
    sourceType: DEPLOYABLE_TYPES.SUBMARINE,
    targetMode: TARGET_MODES.SINGLE_CELL,
    rangeMode: RANGE_MODES.FULL_BOARD,
    limitKind: LIMIT_KINDS.AMMUNITION,
    initialUses: 3,
  }),
  [ACTION_TYPES.NUCLEAR_BOMB]: freezeDefinition({
    type: ACTION_TYPES.NUCLEAR_BOMB,
    name: "核弹",
    category: ACTION_CATEGORIES.ATTACK,
    sourceType: DEPLOYABLE_TYPES.NUCLEAR_SUBMARINE,
    targetMode: TARGET_MODES.SINGLE_CELL,
    rangeMode: RANGE_MODES.FULL_BOARD,
    limitKind: LIMIT_KINDS.AMMUNITION,
    initialUses: 2,
  }),
  [ACTION_TYPES.SHOCK_BOMB]: freezeDefinition({
    type: ACTION_TYPES.SHOCK_BOMB,
    name: "震爆弹",
    category: ACTION_CATEGORIES.AUXILIARY,
    sourceType: DEPLOYABLE_TYPES.NUCLEAR_SUBMARINE,
    targetMode: TARGET_MODES.AREA_CENTER,
    rangeMode: RANGE_MODES.SHOCK_AREA,
    limitKind: LIMIT_KINDS.AMMUNITION,
    initialUses: 1,
  }),
  [ACTION_TYPES.DETECTION_BOMB]: freezeDefinition({
    type: ACTION_TYPES.DETECTION_BOMB,
    name: "探测弹",
    category: ACTION_CATEGORIES.AUXILIARY,
    sourceType: DEPLOYABLE_TYPES.NUCLEAR_SUBMARINE,
    targetMode: TARGET_MODES.AREA_CENTER,
    rangeMode: RANGE_MODES.DETECTION_AREA,
    limitKind: LIMIT_KINDS.AMMUNITION,
    initialUses: 1,
  }),
  [ACTION_TYPES.HELICOPTER_STRAFE]: freezeDefinition({
    type: ACTION_TYPES.HELICOPTER_STRAFE,
    name: "直升机扫射",
    category: ACTION_CATEGORIES.ATTACK,
    sourceType: DEPLOYABLE_TYPES.AIRCRAFT_CARRIER,
    targetMode: TARGET_MODES.ROW_OR_COLUMN,
    rangeMode: RANGE_MODES.FULL_LINE,
    limitKind: LIMIT_KINDS.USE_COUNT,
    initialUses: 1,
  }),
});

const ACTION_TYPE_ORDER = Object.freeze([
  ACTION_TYPES.DESTROYER_I_RAM,
  ACTION_TYPES.DESTROYER_II_RAM,
  ACTION_TYPES.PIRATE_ATTACK,
  ACTION_TYPES.MOTORBOAT_RAM,
  ACTION_TYPES.SUBMARINE_MISSILE,
  ACTION_TYPES.NUCLEAR_BOMB,
  ACTION_TYPES.SHOCK_BOMB,
  ACTION_TYPES.DETECTION_BOMB,
  ACTION_TYPES.HELICOPTER_STRAFE,
]);

function getActionDefinition(type) {
  const definition = ACTION_DEFINITIONS[type];
  if (!definition) {
    throw new RuleValidationError(
      "UNKNOWN_ACTION_TYPE",
      "未知的行动类型。",
      { type },
    );
  }
  return definition;
}

function createInitialRemainingUses() {
  return Object.fromEntries(
    ACTION_TYPE_ORDER.filter(
      (type) => ACTION_DEFINITIONS[type].initialUses !== null,
    ).map((type) => [type, ACTION_DEFINITIONS[type].initialUses]),
  );
}

function isAttackAction(type) {
  return ACTION_DEFINITIONS[type]?.category === ACTION_CATEGORIES.ATTACK;
}

function isAuxiliaryAction(type) {
  return ACTION_DEFINITIONS[type]?.category === ACTION_CATEGORIES.AUXILIARY;
}

module.exports = {
  ACTION_CATEGORIES,
  ACTION_DEFINITIONS,
  ACTION_TYPE_ORDER,
  ACTION_TYPES,
  LIMIT_KINDS,
  RANGE_MODES,
  TARGET_MODES,
  createInitialRemainingUses,
  getActionDefinition,
  isAttackAction,
  isAuxiliaryAction,
};
