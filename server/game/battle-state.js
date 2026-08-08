"use strict";

const {
  assertActionState,
  createInitialActionState,
} = require("./action-state");
const { formatCoordinate, sortCoordinates } = require("./coordinates");
const { assertValidDeployment } = require("./deployment");
const { RuleValidationError } = require("./errors");
const { hasAnyLegalAction } = require("./action-validation");
const {
  DEPLOYABLE_TYPES,
  isUnderwaterUnitType,
} = require("./units");

const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const MATCH_STATUS = Object.freeze({
  PLAYING: "playing",
  FINISHED: "finished",
});

function assertPlayerId(playerId) {
  if (typeof playerId !== "string" || !PLAYER_ID_PATTERN.test(playerId)) {
    throw new RuleValidationError(
      "INVALID_PLAYER_ID",
      "玩家 ID 必须是 1～64 位字母、数字、下划线或连字符。",
      { playerId },
    );
  }
  return playerId;
}

function assertBattlePlayerState(playerState) {
  assertActionState(playerState);
  if (
    !Array.isArray(playerState.decoys) ||
    !Array.isArray(playerState.pendingParalysisUnitIds) ||
    !playerState.targetCellResults ||
    typeof playerState.targetCellResults !== "object" ||
    Array.isArray(playerState.targetCellResults)
  ) {
    throw new RuleValidationError(
      "INVALID_BATTLE_PLAYER_STATE",
      "玩家战场状态结构无效。",
    );
  }
  for (const unit of playerState.units) {
    if (!Array.isArray(unit.hitCells)) {
      throw new RuleValidationError(
        "INVALID_BATTLE_PLAYER_STATE",
        "作战单位缺少已受击单位格状态。",
        { unitId: unit.id },
      );
    }
  }
  for (const decoy of playerState.decoys) {
    if (
      !decoy ||
      typeof decoy.id !== "string" ||
      typeof decoy.cell !== "string" ||
      typeof decoy.destroyed !== "boolean"
    ) {
      throw new RuleValidationError(
        "INVALID_BATTLE_PLAYER_STATE",
        "诱饵鱼雷状态无效。",
        { decoy },
      );
    }
  }
  return playerState;
}

function createBattlePlayerState(deployment) {
  const normalizedPlacements = assertValidDeployment(deployment);
  const actionState = createInitialActionState(deployment);

  return {
    ...actionState,
    units: actionState.units.map((unit) => ({
      ...unit,
      hitCells: [],
    })),
    decoys: normalizedPlacements
      .filter((placement) => placement.type === DEPLOYABLE_TYPES.DECOY_TORPEDO)
      .map((placement) => ({
        id: placement.id,
        cell: placement.cells[0],
        destroyed: false,
      })),
    pendingParalysisUnitIds: [],
    targetCellResults: {},
  };
}

function createBattleState(playerEntries) {
  if (!Array.isArray(playerEntries) || playerEntries.length !== 2) {
    throw new RuleValidationError(
      "INVALID_BATTLE_PLAYERS",
      "权威战场必须恰好包含两名玩家。",
    );
  }

  const playerIds = playerEntries.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new RuleValidationError(
        "INVALID_BATTLE_PLAYERS",
        "玩家战场输入必须是对象。",
        { entry },
      );
    }
    return assertPlayerId(entry.id);
  });

  if (new Set(playerIds).size !== 2) {
    throw new RuleValidationError(
      "DUPLICATE_PLAYER_ID",
      "两名玩家必须使用不同的玩家 ID。",
      { playerIds },
    );
  }

  return {
    playerIds,
    players: Object.fromEntries(
      playerEntries.map((entry) => [
        entry.id,
        createBattlePlayerState(entry.deployment),
      ]),
    ),
    actionLog: [],
    nextActionSequence: 1,
    match: {
      status: MATCH_STATUS.PLAYING,
      result: null,
      finalSalvo: null,
    },
  };
}

function assertBattleState(battleState) {
  if (
    !battleState ||
    typeof battleState !== "object" ||
    !Array.isArray(battleState.playerIds) ||
    battleState.playerIds.length !== 2 ||
    !battleState.players ||
    typeof battleState.players !== "object" ||
    !Array.isArray(battleState.actionLog) ||
    !Number.isInteger(battleState.nextActionSequence) ||
    battleState.nextActionSequence < 1 ||
    !battleState.match ||
    typeof battleState.match !== "object" ||
    !Object.values(MATCH_STATUS).includes(battleState.match.status) ||
    !Object.hasOwn(battleState.match, "result") ||
    !Object.hasOwn(battleState.match, "finalSalvo")
  ) {
    throw new RuleValidationError(
      "INVALID_BATTLE_STATE",
      "权威战场状态结构无效。",
    );
  }

  for (const playerId of battleState.playerIds) {
    assertPlayerId(playerId);
    if (!Object.hasOwn(battleState.players, playerId)) {
      throw new RuleValidationError(
        "INVALID_BATTLE_STATE",
        "权威战场缺少玩家状态。",
        { playerId },
      );
    }
    assertBattlePlayerState(battleState.players[playerId]);
  }

  if (
    battleState.match.status === MATCH_STATUS.PLAYING &&
    (battleState.match.result !== null ||
      battleState.match.finalSalvo !== null)
  ) {
    throw new RuleValidationError(
      "INVALID_BATTLE_STATE",
      "进行中的战场不能包含终局结果或终局鱼雷齐射记录。",
    );
  }
  if (
    battleState.match.status === MATCH_STATUS.FINISHED &&
    (!battleState.match.result ||
      typeof battleState.match.result !== "object")
  ) {
    throw new RuleValidationError(
      "INVALID_BATTLE_STATE",
      "已经结束的战场必须包含终局结果。",
    );
  }
  return battleState;
}

function getBattlePlayerState(battleState, playerId) {
  assertBattleState(battleState);
  assertPlayerId(playerId);
  if (!Object.hasOwn(battleState.players, playerId)) {
    throw new RuleValidationError(
      "PLAYER_NOT_FOUND",
      "该玩家不属于当前战场。",
      { playerId },
    );
  }
  return battleState.players[playerId];
}

function getOpponentPlayerId(battleState, playerId) {
  getBattlePlayerState(battleState, playerId);
  return battleState.playerIds.find((candidate) => candidate !== playerId);
}

function replaceBattlePlayerState(battleState, playerId, playerState) {
  assertBattleState(battleState);
  getBattlePlayerState(battleState, playerId);
  assertBattlePlayerState(playerState);
  return {
    ...battleState,
    players: {
      ...battleState.players,
      [playerId]: playerState,
    },
  };
}

function getBattleUnitById(playerState, unitId) {
  assertBattlePlayerState(playerState);
  return playerState.units.find((unit) => unit.id === unitId) || null;
}

function getBattleUnitAtCell(playerState, coordinate) {
  assertBattlePlayerState(playerState);
  const normalized = formatCoordinate(coordinate);
  return (
    playerState.units.find((unit) => unit.cells.includes(normalized)) || null
  );
}

function getBattleDecoyAtCell(playerState, coordinate) {
  assertBattlePlayerState(playerState);
  const normalized = formatCoordinate(coordinate);
  return playerState.decoys.find((decoy) => decoy.cell === normalized) || null;
}

function applyDamageToUnit(
  playerState,
  unitId,
  requestedDamage,
  options = {},
) {
  assertBattlePlayerState(playerState);
  const unit = getBattleUnitById(playerState, unitId);
  if (!unit) {
    throw new RuleValidationError(
      "UNIT_NOT_FOUND",
      "找不到伤害目标单位。",
      { unitId },
    );
  }
  if (
    typeof requestedDamage !== "number" ||
    !Number.isFinite(requestedDamage) ||
    requestedDamage < 0 ||
    !Number.isInteger(requestedDamage * 2)
  ) {
    throw new RuleValidationError(
      "INVALID_DAMAGE",
      "伤害必须是非负的 0.5 倍数。",
      { unitId, requestedDamage },
    );
  }

  const hitCells = options.hitCells ?? [];
  if (!Array.isArray(hitCells)) {
    throw new RuleValidationError(
      "INVALID_HIT_CELLS",
      "已受击单位格必须是坐标数组。",
      { unitId, hitCells },
    );
  }
  const normalizedHitCells = sortCoordinates(hitCells);
  for (const cell of normalizedHitCells) {
    if (!unit.cells.includes(cell)) {
      throw new RuleValidationError(
        "HIT_CELL_NOT_IN_UNIT",
        "已受击单位格必须属于伤害目标单位。",
        { unitId, cell },
      );
    }
  }

  const hitCellsAdded = normalizedHitCells.filter(
    (cell) => !unit.hitCells.includes(cell),
  );
  const beforeHp = unit.hp;
  const effectiveRequestedDamage =
    normalizedHitCells.length > 0 && hitCellsAdded.length === 0
      ? 0
      : requestedDamage;
  const appliedDamage = Math.min(effectiveRequestedDamage, beforeHp);
  const afterHp = Math.max(0, beforeHp - appliedDamage);
  const nextUnit = {
    ...unit,
    hp: afterHp,
    hitCells: [
      ...new Set(sortCoordinates([...unit.hitCells, ...hitCellsAdded])),
    ],
    paralyzed: afterHp > 0 ? unit.paralyzed : false,
  };
  const nextState = {
    ...playerState,
    units: playerState.units.map((candidate) =>
      candidate.id === unitId ? nextUnit : candidate,
    ),
    pendingParalysisUnitIds:
      afterHp > 0
        ? [...playerState.pendingParalysisUnitIds]
        : playerState.pendingParalysisUnitIds.filter(
            (candidate) => candidate !== unitId,
          ),
  };

  return {
    state: nextState,
    event: {
      unitId,
      unitType: unit.type,
      reason: options.reason ?? "action_damage",
      beforeHp,
      requestedDamage,
      effectiveRequestedDamage,
      appliedDamage,
      afterHp,
      hitCellsAdded,
      sunk: beforeHp > 0 && afterHp <= 0,
    },
  };
}

function destroyDecoy(playerState, decoyId, reason = "action_hit") {
  assertBattlePlayerState(playerState);
  const decoy = playerState.decoys.find((candidate) => candidate.id === decoyId);
  if (!decoy) {
    throw new RuleValidationError(
      "DECOY_NOT_FOUND",
      "找不到指定的诱饵鱼雷。",
      { decoyId },
    );
  }

  return {
    state: {
      ...playerState,
      decoys: playerState.decoys.map((candidate) =>
        candidate.id === decoyId
          ? { ...candidate, destroyed: true }
          : candidate,
      ),
    },
    event: {
      decoyId,
      cell: decoy.cell,
      reason,
      destroyed: !decoy.destroyed,
    },
  };
}

function recordTargetCellResults(playerState, cellResults) {
  assertBattlePlayerState(playerState);
  if (!Array.isArray(cellResults)) {
    throw new RuleValidationError(
      "INVALID_TARGET_CELL_RESULTS",
      "逐格结算结果必须是数组。",
      { cellResults },
    );
  }

  const nextResults = { ...playerState.targetCellResults };
  const coordinates = [];
  for (const cellResult of cellResults) {
    if (
      !cellResult ||
      !["hit", "miss"].includes(cellResult.result)
    ) {
      throw new RuleValidationError(
        "INVALID_TARGET_CELL_RESULT",
        "逐格结算结果只能是 hit 或 miss。",
        { cellResult },
      );
    }
    const coordinate = formatCoordinate(cellResult.coordinate);
    const existing = nextResults[coordinate];
    // 重复攻击合法；敌方地图保留该格首次公开结论，避免历史被覆盖。
    nextResults[coordinate] = existing ?? cellResult.result;
    coordinates.push(coordinate);
  }

  return {
    ...playerState,
    targetCellResults: nextResults,
    resolvedTargetCells: [
      ...new Set(
        sortCoordinates([...playerState.resolvedTargetCells, ...coordinates]),
      ),
    ],
  };
}

function queueParalysis(playerState, unitIds) {
  assertBattlePlayerState(playerState);
  if (!Array.isArray(unitIds)) {
    throw new RuleValidationError(
      "INVALID_PARALYSIS_UNITS",
      "待生效瘫痪单位必须是 ID 数组。",
      { unitIds },
    );
  }

  const eligibleIds = unitIds.filter((unitId) => {
    const unit = getBattleUnitById(playerState, unitId);
    return unit && unit.hp > 0 && isUnderwaterUnitType(unit.type);
  });

  return {
    ...playerState,
    pendingParalysisUnitIds: [
      ...new Set([...playerState.pendingParalysisUnitIds, ...eligibleIds]),
    ],
  };
}

function activatePendingParalysisForPlayer(playerState) {
  assertBattlePlayerState(playerState);
  const pending = new Set(playerState.pendingParalysisUnitIds);
  const activatedUnitIds = [];
  const units = playerState.units.map((unit) => {
    if (
      pending.has(unit.id) &&
      unit.hp > 0 &&
      isUnderwaterUnitType(unit.type)
    ) {
      activatedUnitIds.push(unit.id);
      return { ...unit, paralyzed: true };
    }
    return unit;
  });

  return {
    state: {
      ...playerState,
      units,
      pendingParalysisUnitIds: [],
    },
    activatedUnitIds,
  };
}

function clearParalysisForPlayer(playerState) {
  assertBattlePlayerState(playerState);
  return {
    ...playerState,
    units: playerState.units.map((unit) =>
      unit.paralyzed ? { ...unit, paralyzed: false } : unit,
    ),
  };
}

function beginNormalTurn(battleState, playerId) {
  const playerState = getBattlePlayerState(battleState, playerId);
  const activation = activatePendingParalysisForPlayer(playerState);
  return {
    state: replaceBattlePlayerState(
      battleState,
      playerId,
      activation.state,
    ),
    activatedUnitIds: activation.activatedUnitIds,
  };
}

function completeAutomaticSkip(battleState, playerId) {
  const playerState = getBattlePlayerState(battleState, playerId);
  if (hasAnyLegalAction(playerState)) {
    throw new RuleValidationError(
      "AUTOMATIC_SKIP_NOT_ALLOWED",
      "玩家仍有合法行动，不能自动跳过回合。",
      { playerId },
    );
  }
  return replaceBattlePlayerState(
    battleState,
    playerId,
    clearParalysisForPlayer(playerState),
  );
}

module.exports = {
  MATCH_STATUS,
  activatePendingParalysisForPlayer,
  applyDamageToUnit,
  assertBattlePlayerState,
  assertBattleState,
  beginNormalTurn,
  clearParalysisForPlayer,
  completeAutomaticSkip,
  createBattlePlayerState,
  createBattleState,
  destroyDecoy,
  getBattleDecoyAtCell,
  getBattlePlayerState,
  getBattleUnitAtCell,
  getBattleUnitById,
  getOpponentPlayerId,
  queueParalysis,
  recordTargetCellResults,
  replaceBattlePlayerState,
};
