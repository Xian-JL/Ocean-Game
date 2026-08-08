"use strict";

const { createInitialRemainingUses, getActionDefinition } = require("./actions");
const { sortCoordinates } = require("./coordinates");
const { assertValidDeployment } = require("./deployment");
const { RuleValidationError } = require("./errors");
const {
  getDeployableDefinition,
  isCombatUnitType,
  isUnderwaterUnitType,
} = require("./units");

function assertActionState(state) {
  if (
    !state ||
    typeof state !== "object" ||
    !Array.isArray(state.units) ||
    !state.remainingUses ||
    typeof state.remainingUses !== "object" ||
    !Array.isArray(state.resolvedTargetCells) ||
    !Array.isArray(state.submarineMissileMarkers) ||
    !Array.isArray(state.processedActionIds)
  ) {
    throw new RuleValidationError(
      "INVALID_ACTION_STATE",
      "行动状态结构无效。",
    );
  }

  for (const unit of state.units) {
    if (
      !unit ||
      typeof unit.id !== "string" ||
      typeof unit.type !== "string" ||
      !Array.isArray(unit.cells) ||
      typeof unit.hp !== "number" ||
      typeof unit.paralyzed !== "boolean"
    ) {
      throw new RuleValidationError(
        "INVALID_ACTION_STATE",
        "行动状态包含无效的作战单位。",
        { unit },
      );
    }
  }

  return state;
}

function createInitialActionState(deployment) {
  const normalizedPlacements = assertValidDeployment(deployment);
  const units = normalizedPlacements
    .filter((placement) => isCombatUnitType(placement.type))
    .map((placement) => {
      const definition = getDeployableDefinition(placement.type);
      return {
        id: placement.id,
        type: placement.type,
        cells: [...placement.cells],
        hp: definition.initialHp,
        paralyzed: false,
      };
    });

  return {
    units,
    remainingUses: createInitialRemainingUses(),
    resolvedTargetCells: [],
    submarineMissileMarkers: [],
    processedActionIds: [],
  };
}

function getUnitById(state, unitId) {
  assertActionState(state);
  return state.units.find((unit) => unit.id === unitId) || null;
}

function getUnitByType(state, type) {
  assertActionState(state);
  return state.units.find((unit) => unit.type === type) || null;
}

function getRemainingUses(state, actionType) {
  assertActionState(state);
  const definition = getActionDefinition(actionType);
  return definition.initialUses === null
    ? null
    : state.remainingUses[actionType] ?? 0;
}

function hasResolvedTargetCell(state, coordinate) {
  assertActionState(state);
  const [normalized] = sortCoordinates([coordinate]);
  return state.resolvedTargetCells.includes(normalized);
}

function hasProcessedActionId(state, actionId) {
  assertActionState(state);
  return state.processedActionIds.includes(actionId);
}

function markTargetCellsResolved(state, coordinates) {
  assertActionState(state);
  if (!Array.isArray(coordinates)) {
    throw new RuleValidationError(
      "INVALID_RESOLVED_CELLS",
      "已结算格必须是坐标数组。",
      { coordinates },
    );
  }

  const merged = sortCoordinates([
    ...state.resolvedTargetCells,
    ...coordinates,
  ]);

  return {
    ...state,
    resolvedTargetCells: [...new Set(merged)],
  };
}

function markSubmarineMissileTarget(state, coordinate) {
  assertActionState(state);
  const [normalized] = sortCoordinates([coordinate]);
  return {
    ...state,
    submarineMissileMarkers: [
      ...new Set(
        sortCoordinates([...state.submarineMissileMarkers, normalized]),
      ),
    ],
  };
}

function setUnitStatus(state, unitId, changes) {
  assertActionState(state);
  const unit = getUnitById(state, unitId);
  if (!unit) {
    throw new RuleValidationError(
      "SOURCE_NOT_FOUND",
      "找不到指定的作战单位。",
      { unitId },
    );
  }
  if (!changes || typeof changes !== "object") {
    throw new RuleValidationError(
      "INVALID_UNIT_STATUS",
      "单位状态修改必须是对象。",
      { changes },
    );
  }

  const nextUnit = { ...unit };
  if (Object.hasOwn(changes, "hp")) {
    const maximumHp = getDeployableDefinition(unit.type).initialHp;
    if (
      typeof changes.hp !== "number" ||
      !Number.isFinite(changes.hp) ||
      changes.hp < 0 ||
      changes.hp > maximumHp ||
      !Number.isInteger(changes.hp * 2)
    ) {
      throw new RuleValidationError(
        "INVALID_HP",
        "生命值必须在 0 与初始生命值之间，并以 0.5 为最小单位。",
        { unitId, hp: changes.hp, maximumHp },
      );
    }
    if (changes.hp > unit.hp) {
      throw new RuleValidationError(
        "HP_INCREASE_NOT_ALLOWED",
        "规则中不存在恢复生命值或复活单位的行动。",
        { unitId, currentHp: unit.hp, requestedHp: changes.hp },
      );
    }
    nextUnit.hp = changes.hp;
    if (nextUnit.hp <= 0) {
      nextUnit.paralyzed = false;
    }
  }

  if (Object.hasOwn(changes, "paralyzed")) {
    if (typeof changes.paralyzed !== "boolean") {
      throw new RuleValidationError(
        "INVALID_PARALYSIS_STATE",
        "瘫痪状态必须是布尔值。",
        { unitId, paralyzed: changes.paralyzed },
      );
    }
    if (changes.paralyzed && !isUnderwaterUnitType(unit.type)) {
      throw new RuleValidationError(
        "INVALID_PARALYSIS_TARGET",
        "只有潜水艇和核潜艇可以进入瘫痪状态。",
        { unitId, type: unit.type },
      );
    }
    if (changes.paralyzed && nextUnit.hp <= 0) {
      throw new RuleValidationError(
        "INVALID_PARALYSIS_TARGET",
        "沉没单位不能进入瘫痪状态。",
        { unitId, type: unit.type },
      );
    }
    nextUnit.paralyzed = changes.paralyzed;
  }

  return {
    ...state,
    units: state.units.map((candidate) =>
      candidate.id === unitId ? nextUnit : candidate,
    ),
  };
}

module.exports = {
  assertActionState,
  createInitialActionState,
  getRemainingUses,
  getUnitById,
  getUnitByType,
  hasProcessedActionId,
  hasResolvedTargetCell,
  markSubmarineMissileTarget,
  markTargetCellsResolved,
  setUnitStatus,
};
