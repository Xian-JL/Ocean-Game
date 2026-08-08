"use strict";

const { ACTION_TYPES, getActionDefinition } = require("./actions");
const { listActionAvailability } = require("./action-validation");
const {
  MATCH_STATUS,
  assertBattleState,
  getBattlePlayerState,
  getOpponentPlayerId,
} = require("./battle-state");
const { RuleValidationError } = require("./errors");

function clone(value) {
  return structuredClone(value);
}

function assertActionRecord(actionRecord) {
  if (
    !actionRecord ||
    typeof actionRecord !== "object" ||
    !Number.isInteger(actionRecord.sequence) ||
    typeof actionRecord.actorId !== "string" ||
    typeof actionRecord.defenderId !== "string" ||
    !actionRecord.action ||
    typeof actionRecord.action !== "object" ||
    !actionRecord.outcome ||
    typeof actionRecord.outcome !== "object"
  ) {
    throw new RuleValidationError(
      "INVALID_ACTION_RECORD",
      "无法从无效的服务器行动记录生成安全信息。",
    );
  }
  return actionRecord;
}

function publicCellResults(cellResults) {
  return cellResults
    .filter((cellResult) => ["hit", "miss"].includes(cellResult.result))
    .map((cellResult) => ({
      coordinate: cellResult.coordinate,
      result: cellResult.result,
    }));
}

function createPublicActionRecord(actionRecord) {
  assertActionRecord(actionRecord);
  const definition = getActionDefinition(actionRecord.action.actionType);
  const record = {
    sequence: actionRecord.sequence,
    actorId: actionRecord.actorId,
    actionType: definition.type,
    actionName: definition.name,
    target: clone(actionRecord.action.target),
  };

  switch (definition.type) {
    case ACTION_TYPES.SUBMARINE_MISSILE:
      return {
        ...record,
        result: null,
      };

    case ACTION_TYPES.SHOCK_BOMB:
      return {
        ...record,
        area: [...actionRecord.outcome.area],
        result: null,
      };

    case ACTION_TYPES.DETECTION_BOMB:
      return {
        ...record,
        area: [...actionRecord.outcome.area],
        result: actionRecord.outcome.detected
          ? "underwater_signal_detected"
          : "no_underwater_signal",
      };

    case ACTION_TYPES.HELICOPTER_STRAFE:
      return {
        ...record,
        cellResults: publicCellResults(actionRecord.outcome.cellResults),
      };

    default:
      return {
        ...record,
        result: actionRecord.outcome.actualResult,
      };
  }
}

function createOwnDamageNotifications(actionRecord, side) {
  return (actionRecord.outcome.damageEvents ?? [])
    .filter((event) => event.side === side)
    .map((event) => ({
      unitId: event.unitId,
      unitType: event.unitType,
      beforeHp: event.beforeHp,
      appliedDamage: event.appliedDamage,
      afterHp: event.afterHp,
      hitCellsAdded: [...event.hitCellsAdded],
      sunk: event.sunk,
    }));
}

function createOwnDecoyNotifications(actionRecord, side) {
  return (actionRecord.outcome.decoyEvents ?? [])
    .filter((event) => event.side === side && event.destroyed)
    .map((event) => ({
      decoyId: event.decoyId,
      cell: event.cell,
      destroyed: true,
    }));
}

function createActorFeedback(battleState, actionRecord) {
  assertBattleState(battleState);
  assertActionRecord(actionRecord);
  const actorState = getBattlePlayerState(
    battleState,
    actionRecord.actorId,
  );
  const definition = getActionDefinition(actionRecord.action.actionType);
  const remainingUses =
    definition.initialUses === null
      ? null
      : actorState.remainingUses[definition.type];

  return {
    ...createPublicActionRecord(actionRecord),
    actionId: actionRecord.action.actionId,
    sourceId: actionRecord.action.sourceId,
    remainingUses,
    ownDamage: createOwnDamageNotifications(actionRecord, "actor"),
    ownDecoyChanges: createOwnDecoyNotifications(actionRecord, "actor"),
    submarineMissileMarker:
      definition.type === ACTION_TYPES.SUBMARINE_MISSILE
        ? actionRecord.action.target.coordinate
        : null,
  };
}

function createDefenderFeedback(actionRecord) {
  assertActionRecord(actionRecord);
  return {
    ...createPublicActionRecord(actionRecord),
    ownDamage: createOwnDamageNotifications(actionRecord, "defender"),
    ownDecoyChanges: createOwnDecoyNotifications(
      actionRecord,
      "defender",
    ),
  };
}

function createOwnPlayerSnapshot(battleState, playerId) {
  const playerState = getBattlePlayerState(battleState, playerId);
  const actionsLocked = battleState.match.status !== MATCH_STATUS.PLAYING;
  const intelligenceAreas = battleState.actionLog
    .filter((record) => record.actorId === playerId)
    .flatMap((record) => {
      if (record.action.actionType === ACTION_TYPES.SHOCK_BOMB) {
        return [
          {
            sequence: record.sequence,
            kind: "shock",
            center: record.outcome.center,
            area: [...record.outcome.area],
          },
        ];
      }
      if (record.action.actionType === ACTION_TYPES.DETECTION_BOMB) {
        return [
          {
            sequence: record.sequence,
            kind: "detection",
            center: record.outcome.center,
            area: [...record.outcome.area],
            detected: record.outcome.detected,
          },
        ];
      }
      return [];
    });

  return {
    units: playerState.units.map((unit) => ({
      id: unit.id,
      type: unit.type,
      cells: [...unit.cells],
      hp: unit.hp,
      paralyzed: unit.paralyzed,
      hitCells: [...unit.hitCells],
    })),
    decoys: playerState.decoys.map((decoy) => ({ ...decoy })),
    remainingUses: { ...playerState.remainingUses },
    enemyMap: {
      cellResults: { ...playerState.targetCellResults },
      submarineMissileMarkers: [
        ...playerState.submarineMissileMarkers,
      ],
    },
    intelligenceAreas,
    actionsLocked,
    actionAvailability: actionsLocked
      ? []
      : clone(listActionAvailability(playerState)),
  };
}

function createRevealPlayerSnapshot(playerState) {
  return {
    units: playerState.units.map((unit) => ({
      id: unit.id,
      type: unit.type,
      cells: [...unit.cells],
      hp: unit.hp,
      paralyzed: unit.paralyzed,
      hitCells: [...unit.hitCells],
    })),
    decoys: playerState.decoys.map((decoy) => ({ ...decoy })),
    remainingUses: { ...playerState.remainingUses },
  };
}

function createFinishedReplay(battleState) {
  if (battleState.match.status !== MATCH_STATUS.FINISHED) {
    return null;
  }

  return {
    players: Object.fromEntries(
      battleState.playerIds.map((playerId) => [
        playerId,
        createRevealPlayerSnapshot(battleState.players[playerId]),
      ]),
    ),
    actionLog: clone(battleState.actionLog),
    finalSalvo: clone(battleState.match.finalSalvo),
  };
}

function createPlayerView(battleState, viewerId) {
  assertBattleState(battleState);
  getBattlePlayerState(battleState, viewerId);
  const opponentId = getOpponentPlayerId(battleState, viewerId);

  return {
    viewerId,
    opponentId,
    match: {
      status: battleState.match.status,
      result: clone(battleState.match.result),
    },
    own: createOwnPlayerSnapshot(battleState, viewerId),
    opponent: {
      id: opponentId,
    },
    publicActionLog: battleState.actionLog.map(createPublicActionRecord),
    replay: createFinishedReplay(battleState),
  };
}

function createResolutionDelivery(battleState, actionRecord, viewerId) {
  assertBattleState(battleState);
  assertActionRecord(actionRecord);
  const actorId = actionRecord.actorId;
  const defenderId = actionRecord.defenderId;
  if (![actorId, defenderId].includes(viewerId)) {
    throw new RuleValidationError(
      "ACTION_VIEWER_NOT_INVOLVED",
      "只有本次行动的两名玩家可以取得行动反馈。",
      { viewerId },
    );
  }

  return {
    match: {
      status: battleState.match.status,
      result: clone(battleState.match.result),
    },
    publicRecord: createPublicActionRecord(actionRecord),
    feedback:
      viewerId === actorId
        ? createActorFeedback(battleState, actionRecord)
        : createDefenderFeedback(actionRecord),
    view: createPlayerView(battleState, viewerId),
  };
}

function createResolutionDeliveries(battleState, actionRecord) {
  assertBattleState(battleState);
  assertActionRecord(actionRecord);
  return Object.fromEntries(
    [actionRecord.actorId, actionRecord.defenderId].map((playerId) => [
      playerId,
      createResolutionDelivery(battleState, actionRecord, playerId),
    ]),
  );
}

module.exports = {
  createActorFeedback,
  createDefenderFeedback,
  createPlayerView,
  createPublicActionRecord,
  createResolutionDelivery,
  createResolutionDeliveries,
};
