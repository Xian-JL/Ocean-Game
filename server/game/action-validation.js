"use strict";

const {
  ACTION_CATEGORIES,
  ACTION_DEFINITIONS,
  ACTION_TYPE_ORDER,
  ACTION_TYPES,
  RANGE_MODES,
  TARGET_MODES,
  getActionDefinition,
} = require("./actions");
const {
  assertActionState,
  getRemainingUses,
  getUnitById,
  getUnitByType,
  hasProcessedActionId,
  markDestroyerTarget,
  markNuclearBombTarget,
  markSubmarineMissileTarget,
  getStateMapRules,
} = require("./action-state");
const {
  formatCoordinate,
  parseCoordinate,
} = require("./coordinates");
const { DEFAULT_MAP_RULES } = require("./map-rules");
const { RuleValidationError, createRuleIssue } = require("./errors");
const {
  getDetectionArea,
  getDestroyerIRange,
  getDestroyerIIRange,
  getFullColumn,
  getFullRow,
  getShockArea,
  getRadarArea,
} = require("./ranges");
const { DEPLOYABLE_TYPES } = require("./units");

function createAllBoardCells(mapRules) {
  return Array.from({ length: mapRules.boardSize }, (_rowValue, row) =>
    Array.from({ length: mapRules.boardSize }, (_columnValue, column) =>
      formatCoordinate({ row, column }, mapRules),
    ),
  ).flat();
}

const ALL_BOARD_CELLS = Object.freeze(createAllBoardCells(DEFAULT_MAP_RULES));

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHelicopterUnlocked(state) {
  const destroyerI = getUnitByType(state, DEPLOYABLE_TYPES.DESTROYER_I);
  const destroyerII = getUnitByType(state, DEPLOYABLE_TYPES.DESTROYER_II);
  return Boolean(
    destroyerI &&
      destroyerII &&
      destroyerI.hp <= 0 &&
      destroyerII.hp <= 0,
  );
}

function getSourceIssues(state, definition, sourceId, options = {}) {
  const issues = [];
  const source = getUnitById(state, sourceId);

  if (!source) {
    issues.push(
      createRuleIssue("SOURCE_NOT_FOUND", "找不到指定的行动来源。", {
        sourceId,
      }),
    );
    return issues;
  }

  if (source.type !== definition.sourceType) {
    issues.push(
      createRuleIssue(
        "SOURCE_TYPE_MISMATCH",
        "该作战单位不能发动所选行动。",
        {
          sourceId,
          expectedType: definition.sourceType,
          actualType: source.type,
        },
      ),
    );
  }

  if (source.hp <= 0) {
    issues.push(
      createRuleIssue("SOURCE_SUNK", "沉没单位不能作为行动来源。", {
        sourceId,
      }),
    );
  }

  if (source.paralyzed && options.ignoreParalysis !== true) {
    issues.push(
      createRuleIssue(
        "SOURCE_PARALYZED",
        "处于瘫痪状态的水下单位不能作为行动来源。",
        { sourceId },
      ),
    );
  }

  if (
    definition.initialUses !== null &&
    getRemainingUses(state, definition.type) <= 0
  ) {
    issues.push(
      createRuleIssue(
        "RESOURCE_EXHAUSTED",
        "该行动的弹药或使用次数已经耗尽。",
        { actionType: definition.type },
      ),
    );
  }

  if (
    definition.type === ACTION_TYPES.HELICOPTER_STRAFE &&
    !isHelicopterUnlocked(state)
  ) {
    issues.push(
      createRuleIssue(
        "ACTION_LOCKED",
        "己方两艘驱逐舰均沉没后才可使用直升机扫射。",
        { actionType: definition.type },
      ),
    );
  }

  return issues;
}

function createCenterTargets(minRow, maxRow, minColumn, maxColumn, mapRules) {
  const targets = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let column = minColumn; column <= maxColumn; column += 1) {
      targets.push({
        kind: "cell",
        coordinate: formatCoordinate({ row, column }, mapRules),
      });
    }
  }
  return targets;
}

function getActionTargetOptions(state, actionType, options = {}) {
  assertActionState(state);
  const mapRules = getStateMapRules(state);
  const definition = getActionDefinition(actionType);
  const destroyerTargets = new Set(state.destroyerTargetCells);

  switch (definition.rangeMode) {
    case RANGE_MODES.DESTROYER_I: {
      const source = getUnitByType(state, definition.sourceType);
      if (!source) {
        return [];
      }
      return getDestroyerIRange(source.cells, mapRules)
        .filter((coordinate) =>
          !destroyerTargets.has(coordinate) &&
          !(typeof options.targetPlayerId === "string" &&
            destroyerTargets.has(`${options.targetPlayerId}:${coordinate}`))
        )
        .map((coordinate) => ({ kind: "cell", coordinate }));
    }
    case RANGE_MODES.DESTROYER_II: {
      const source = getUnitByType(state, definition.sourceType);
      if (!source) {
        return [];
      }
      return getDestroyerIIRange(source.cells, mapRules)
        .filter((coordinate) =>
          !destroyerTargets.has(coordinate) &&
          !(typeof options.targetPlayerId === "string" &&
            destroyerTargets.has(`${options.targetPlayerId}:${coordinate}`))
        )
        .map((coordinate) => ({ kind: "cell", coordinate }));
    }
    case RANGE_MODES.FULL_BOARD:
      return createAllBoardCells(mapRules).map(
        (coordinate) => ({ kind: "cell", coordinate }),
      );
    case RANGE_MODES.SHOCK_AREA:
      return createCenterTargets(
        Math.floor(mapRules.shockSize / 2),
        mapRules.boardSize - Math.ceil(mapRules.shockSize / 2),
        Math.floor(mapRules.shockSize / 2),
        mapRules.boardSize - Math.ceil(mapRules.shockSize / 2),
        mapRules,
      );
    case RANGE_MODES.DETECTION_AREA:
      return createCenterTargets(
        Math.floor(mapRules.detectionSize / 2),
        mapRules.boardSize - Math.ceil(mapRules.detectionSize / 2),
        Math.floor(mapRules.detectionSize / 2),
        mapRules.boardSize - Math.ceil(mapRules.detectionSize / 2),
        mapRules,
      );
    case RANGE_MODES.RADAR_AREA:
      return createCenterTargets(
        0,
        mapRules.boardSize - mapRules.radarSize,
        0,
        mapRules.boardSize - mapRules.radarSize,
        mapRules,
      );
    case RANGE_MODES.FULL_LINE: {
      const targets = [];
      for (const row of mapRules.rowLabels) {
        targets.push({ kind: "row", row });
      }
      for (let column = 1; column <= mapRules.boardSize; column += 1) {
        targets.push({ kind: "column", column });
      }
      return targets;
    }
    default:
      throw new RuleValidationError(
        "UNKNOWN_RANGE_MODE",
        "行动定义包含未知范围模式。",
        { actionType, rangeMode: definition.rangeMode },
      );
  }
}

function normalizeCellTarget(target, mapRules) {
  if (!target || target.kind !== "cell") {
    throw new RuleValidationError(
      "INVALID_TARGET",
      "该行动必须选择一个目标格。",
      { target },
    );
  }
  const point = parseCoordinate(target.coordinate, mapRules);
  return {
    kind: "cell",
    coordinate: formatCoordinate(point, mapRules),
  };
}

function normalizeLineTarget(target, mapRules) {
  if (!target || typeof target !== "object") {
    throw new RuleValidationError(
      "INVALID_TARGET",
      "直升机扫射必须选择完整一行或完整一列。",
      { target },
    );
  }

  if (target.kind === "row") {
    const row = isNonEmptyString(target.row)
      ? target.row.trim().toUpperCase()
      : target.row;
    const cells = getFullRow(row, mapRules);
    return {
      normalizedTarget: { kind: "row", row },
      cells,
    };
  }

  if (target.kind === "column") {
    const cells = getFullColumn(target.column, mapRules);
    return {
      normalizedTarget: { kind: "column", column: target.column },
      cells,
    };
  }

  throw new RuleValidationError(
    "INVALID_TARGET",
    "直升机扫射必须选择完整一行或完整一列。",
    { target },
  );
}

function validateAndNormalizeTarget(state, definition, source, target, targetPlayerId = null) {
  const mapRules = getStateMapRules(state);
  try {
    if (definition.targetMode === TARGET_MODES.SINGLE_CELL) {
      const normalizedTarget = normalizeCellTarget(target, mapRules);
      let allowedCells = createAllBoardCells(mapRules);

      if (
        definition.rangeMode === RANGE_MODES.DESTROYER_I &&
        source?.type === definition.sourceType
      ) {
        allowedCells = getDestroyerIRange(source.cells, mapRules);
      } else if (
        definition.rangeMode === RANGE_MODES.DESTROYER_II &&
        source?.type === definition.sourceType
      ) {
        allowedCells = getDestroyerIIRange(source.cells, mapRules);
      }

      if (!allowedCells.includes(normalizedTarget.coordinate)) {
        return {
          error: createRuleIssue(
            "TARGET_OUT_OF_RANGE",
            "目标格不在该行动的攻击范围内。",
            { coordinate: normalizedTarget.coordinate },
          ),
        };
      }

      if (
        [RANGE_MODES.DESTROYER_I, RANGE_MODES.DESTROYER_II].includes(
          definition.rangeMode,
        ) &&
        (state.destroyerTargetCells.includes(normalizedTarget.coordinate) ||
          (typeof targetPlayerId === "string" &&
            state.destroyerTargetCells.includes(
              `${targetPlayerId}:${normalizedTarget.coordinate}`,
            )))
      ) {
        return {
          error: createRuleIssue(
            "DESTROYER_TARGET_ALREADY_USED",
            "该坐标已经由任一驱逐舰攻击过，不能再次作为驱逐舰目标。",
            { coordinate: normalizedTarget.coordinate },
          ),
        };
      }

      return {
        normalizedTarget,
        targetCells: [normalizedTarget.coordinate],
        pendingTargetCells: [normalizedTarget.coordinate],
      };
    }

    if (definition.targetMode === TARGET_MODES.AREA_CENTER) {
      const normalizedTarget = normalizeCellTarget(target, mapRules);
      let cells;
      try {
        cells = definition.rangeMode === RANGE_MODES.SHOCK_AREA
          ? getShockArea(normalizedTarget.coordinate, mapRules)
          : definition.rangeMode === RANGE_MODES.RADAR_AREA
            ? getRadarArea(normalizedTarget.coordinate, mapRules)
            : getDetectionArea(normalizedTarget.coordinate, mapRules);
      } catch (error) {
        if (error instanceof RuleValidationError) {
          return {
            error: createRuleIssue(
              "TARGET_OUT_OF_RANGE",
              "中心格无法形成规则要求的完整作用区域。",
              { coordinate: normalizedTarget.coordinate },
            ),
          };
        }
        throw error;
      }

      return {
        normalizedTarget,
        targetCells: cells,
        pendingTargetCells: cells,
      };
    }

    if (definition.targetMode === TARGET_MODES.ROW_OR_COLUMN) {
      const { normalizedTarget, cells } = normalizeLineTarget(target, mapRules);
      const pendingTargetCells = cells;
      return {
        normalizedTarget,
        targetCells: cells,
        pendingTargetCells,
      };
    }
  } catch (error) {
    if (error instanceof RuleValidationError) {
      return {
        error: createRuleIssue("INVALID_TARGET", error.message, {
          target,
          cause: error.code,
        }),
      };
    }
    throw error;
  }

  return {
    error: createRuleIssue("INVALID_TARGET", "行动目标形式无效。", {
      target,
    }),
  };
}

function validateActionIntent(state, intent) {
  assertActionState(state);
  const errors = [];

  if (!intent || typeof intent !== "object" || Array.isArray(intent)) {
    return {
      valid: false,
      errors: [
        createRuleIssue("INVALID_ACTION_INTENT", "行动请求必须是对象。"),
      ],
      normalizedIntent: null,
      targetCells: [],
      pendingTargetCells: [],
    };
  }

  const actionId = isNonEmptyString(intent.actionId)
    ? intent.actionId.trim()
    : null;
  if (actionId === null) {
    errors.push(
      createRuleIssue("INVALID_ACTION_ID", "行动编号必须是非空字符串。"),
    );
  } else if (hasProcessedActionId(state, actionId)) {
    errors.push(
      createRuleIssue(
        "DUPLICATE_ACTION_ID",
        "该行动编号已经处理，不得重复结算。",
        { actionId },
      ),
    );
  }

  let definition = null;
  try {
    definition = getActionDefinition(intent.actionType);
  } catch (error) {
    if (error instanceof RuleValidationError) {
      errors.push(
        createRuleIssue(error.code, error.message, {
          actionType: intent.actionType,
        }),
      );
    } else {
      throw error;
    }
  }

  const sourceId = isNonEmptyString(intent.sourceId)
    ? intent.sourceId.trim()
    : null;
  if (sourceId === null) {
    errors.push(
      createRuleIssue(
        "INVALID_SOURCE_ID",
        "行动来源 ID 必须是非空字符串。",
      ),
    );
  }

  let source = null;
  if (definition && sourceId !== null) {
    source = getUnitById(state, sourceId);
    errors.push(...getSourceIssues(state, definition, sourceId));
  }

  let targetResult = null;
  if (definition) {
    targetResult = validateAndNormalizeTarget(
      state,
      definition,
      source,
      intent.target,
      intent.targetPlayerId,
    );
    if (targetResult.error) {
      errors.push(targetResult.error);
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    normalizedIntent: valid
      ? {
          actionId,
          actionType: definition.type,
          sourceId,
          ...(typeof intent.targetPlayerId === "string"
            ? { targetPlayerId: intent.targetPlayerId }
            : {}),
          target: targetResult.normalizedTarget,
        }
      : null,
    targetCells: valid ? targetResult.targetCells : [],
    pendingTargetCells: valid ? targetResult.pendingTargetCells : [],
  };
}

function getActionAvailability(state, actionType, options = {}) {
  assertActionState(state);
  const definition = getActionDefinition(actionType);
  const source = getUnitByType(state, definition.sourceType);
  const issues = source
    ? getSourceIssues(state, definition, source.id, options)
    : [
        createRuleIssue("SOURCE_NOT_FOUND", "找不到该行动的行动来源。", {
          sourceType: definition.sourceType,
        }),
      ];
  const targets = source ? getActionTargetOptions(state, actionType, options) : [];

  if (source && targets.length === 0) {
    issues.push(
      createRuleIssue(
        "NO_LEGAL_TARGET",
        "该行动的攻击范围内不存在合法目标。",
        { actionType },
      ),
    );
  }

  return {
    actionType,
    name: definition.name,
    category: definition.category,
    sourceId: source?.id ?? null,
    remainingUses: getRemainingUses(state, actionType),
    available: issues.length === 0,
    issues,
    targetCount: targets.length,
  };
}

function listActionAvailability(state, options = {}) {
  return ACTION_TYPE_ORDER.map((actionType) =>
    getActionAvailability(state, actionType, options),
  );
}

function listLegalActions(state, options = {}) {
  return listActionAvailability(state, options).filter(
    (availability) => availability.available,
  );
}

function hasAnyLegalAction(state) {
  return listLegalActions(state).length > 0;
}

function hasAnyLegalActionForTarget(state, targetPlayerId, options = {}) {
  const excludedActionTypes = new Set(options.excludeActionTypes ?? []);
  return listActionAvailability(state, {
    ...options,
    targetPlayerId,
  }).some(
    (availability) =>
      availability.available && !excludedActionTypes.has(availability.actionType),
  );
}

function hasAttackCapability(state, options = {}) {
  const targetPlayerIds = Array.isArray(options.targetPlayerIds)
    ? options.targetPlayerIds.filter((playerId) => typeof playerId === "string")
    : typeof options.targetPlayerId === "string"
      ? [options.targetPlayerId]
      : [];
  const targetContexts = targetPlayerIds.length > 0
    ? targetPlayerIds.map((targetPlayerId) => ({ targetPlayerId }))
    : [{}];

  return targetContexts.some((targetContext) =>
    listActionAvailability(state, {
      ignoreParalysis: true,
      ...targetContext,
    }).some(
      (availability) =>
        availability.category === ACTION_CATEGORIES.ATTACK &&
        availability.available,
    ),
  );
}

function commitActionUsage(state, intent) {
  const validation = validateActionIntent(state, intent);
  if (!validation.valid) {
    throw new RuleValidationError(
      "INVALID_ACTION",
      "行动请求不符合《游戏规则 v1.8》。",
      { errors: validation.errors },
    );
  }

  const definition = ACTION_DEFINITIONS[validation.normalizedIntent.actionType];
  const remainingUses = { ...state.remainingUses };
  if (definition.initialUses !== null) {
    remainingUses[definition.type] -= 1;
  }

  let nextState = {
    ...state,
    remainingUses,
    processedActionIds: [
      ...state.processedActionIds,
      validation.normalizedIntent.actionId,
    ],
  };

  if (definition.type === ACTION_TYPES.SUBMARINE_MISSILE) {
    nextState = markSubmarineMissileTarget(
      nextState,
      validation.normalizedIntent.target.coordinate,
    );
  }

  if (definition.type === ACTION_TYPES.NUCLEAR_BOMB) {
    nextState = markNuclearBombTarget(
      nextState,
      validation.normalizedIntent.target.coordinate,
    );
  }

  if (
    [ACTION_TYPES.DESTROYER_I_RAM, ACTION_TYPES.DESTROYER_II_RAM].includes(
      definition.type,
    )
  ) {
    nextState = markDestroyerTarget(
      nextState,
      validation.normalizedIntent.target.coordinate,
      validation.normalizedIntent.targetPlayerId,
    );
  }

  return {
    state: nextState,
    action: validation.normalizedIntent,
    targetCells: validation.targetCells,
    pendingTargetCells: validation.pendingTargetCells,
  };
}

module.exports = {
  ALL_BOARD_CELLS,
  commitActionUsage,
  getActionAvailability,
  getActionTargetOptions,
  hasAnyLegalAction,
  hasAnyLegalActionForTarget,
  hasAttackCapability,
  isHelicopterUnlocked,
  listActionAvailability,
  listLegalActions,
  validateActionIntent,
};
