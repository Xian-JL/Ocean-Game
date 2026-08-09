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
    defenderId: actionRecord.defenderId,
    actionType: definition.type,
    actionName: definition.name,
    target: clone(actionRecord.action.target),
  };

  switch (definition.type) {
    case ACTION_TYPES.SUBMARINE_MISSILE:
    case ACTION_TYPES.NUCLEAR_BOMB:
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
    case ACTION_TYPES.RADAR_SCAN:
      return {
        ...record,
        area: [...actionRecord.outcome.area],
        result: null,
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

function createInflictedDamageNotifications(actionRecord) {
  return (actionRecord.outcome.damageEvents ?? [])
    .filter((event) => event.side === "defender")
    .map((event) => ({
      playerId: event.playerId,
      unitId: event.unitId,
      unitType: event.unitType,
      beforeHp: event.beforeHp,
      appliedDamage: event.appliedDamage,
      afterHp: event.afterHp,
      sunk: event.sunk,
    }));
}

function createReceivedHitNotifications(actionRecord) {
  return (actionRecord.outcome.damageEvents ?? [])
    .filter((event) => event.side === "defender" && event.appliedDamage > 0)
    .map((event) => ({
      unitId: event.unitId,
      unitType: event.unitType,
      hit: true,
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

  const publicRecord = createPublicActionRecord(actionRecord);
  const privateResult = definition.type === ACTION_TYPES.DETECTION_BOMB
    ? (actionRecord.outcome.detected
      ? "underwater_signal_detected"
      : "no_underwater_signal")
    : definition.type === ACTION_TYPES.RADAR_SCAN
      ? (actionRecord.outcome.detected ? "layout_detected" : "no_layout_detected")
      : publicRecord.result;

  return {
    ...publicRecord,
    result: privateResult,
    actionId: actionRecord.action.actionId,
    sourceId: actionRecord.action.sourceId,
    remainingUses,
    ownDamage: createOwnDamageNotifications(actionRecord, "actor"),
    inflictedDamage: [ACTION_TYPES.SUBMARINE_MISSILE, ACTION_TYPES.NUCLEAR_BOMB]
      .includes(definition.type)
      ? []
      : createInflictedDamageNotifications(actionRecord),
    ownDecoyChanges: createOwnDecoyNotifications(actionRecord, "actor"),
    submarineMissileMarker:
      definition.type === ACTION_TYPES.SUBMARINE_MISSILE
        ? actionRecord.action.target.coordinate
        : null,
    nuclearBombMarker:
      definition.type === ACTION_TYPES.NUCLEAR_BOMB
        ? actionRecord.action.target.coordinate
        : null,
  };
}

function createDefenderFeedback(actionRecord) {
  assertActionRecord(actionRecord);
  return {
    ...createPublicActionRecord(actionRecord),
    ownDamage: [],
    receivedHits: createReceivedHitNotifications(actionRecord),
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
            defenderId: record.defenderId,
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
            defenderId: record.defenderId,
            kind: "detection",
            center: record.outcome.center,
            area: [...record.outcome.area],
            detected: record.outcome.detected,
          },
        ];
      }
      if (record.action.actionType === ACTION_TYPES.RADAR_SCAN) {
        return [{
          sequence: record.sequence,
          defenderId: record.defenderId,
          kind: "radar",
          center: record.outcome.anchor,
          area: [...record.outcome.area],
          detected: record.outcome.detected,
        }];
      }
      return [];
    });

  const opponentIds = battleState.playerIds.filter((id) => id !== playerId);
  const enemyMapsByPlayer = Object.fromEntries(opponentIds.map((opponentId) => {
    const records = battleState.actionLog.filter(
      (record) => record.actorId === playerId && record.defenderId === opponentId,
    );
    const cellResults = {};
    const submarineMissileMarkers = [];
    const nuclearBombMarkers = [];
    const destroyerTargetCells = [];
    for (const record of records) {
      const type = record.action.actionType;
      if ([ACTION_TYPES.SUBMARINE_MISSILE].includes(type)) {
        submarineMissileMarkers.push(record.action.target.coordinate);
      }
      if (type === ACTION_TYPES.NUCLEAR_BOMB) {
        nuclearBombMarkers.push(record.action.target.coordinate);
      }
      if ([ACTION_TYPES.DESTROYER_I_RAM, ACTION_TYPES.DESTROYER_II_RAM].includes(type)) {
        destroyerTargetCells.push(record.action.target.coordinate);
      }
      if (![ACTION_TYPES.SUBMARINE_MISSILE, ACTION_TYPES.NUCLEAR_BOMB,
        ACTION_TYPES.SHOCK_BOMB, ACTION_TYPES.DETECTION_BOMB,
        ACTION_TYPES.RADAR_SCAN].includes(type)) {
        for (const item of record.outcome.cellResults ?? [record.outcome.cellResult].filter(Boolean)) {
          if (["hit", "miss"].includes(item.result)) cellResults[item.coordinate] = item.result;
        }
      }
    }
    return [opponentId, {
      cellResults,
      submarineMissileMarkers: [...new Set(submarineMissileMarkers)],
      nuclearBombMarkers: [...new Set(nuclearBombMarkers)],
      destroyerTargetCells: [...new Set(destroyerTargetCells)],
    }];
  }));

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
      nuclearBombMarkers: [...playerState.nuclearBombMarkers],
      destroyerTargetCells: [...playerState.destroyerTargetCells],
    },
    enemyMapsByPlayer,
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
  if (!battleState.playerIds.includes(viewerId)) {
    throw new RuleValidationError(
      "ACTION_VIEWER_NOT_INVOLVED",
      "只有当前对局玩家可以取得行动反馈。",
      { viewerId },
    );
  }
  const opponentIds = battleState.playerIds.filter((id) => id !== viewerId);
  const opponentId = opponentIds[0] ?? null;
  const finalSalvo = battleState.match.finalSalvo;
  const safeFinalSalvo = finalSalvo?.status === "selecting"
    ? {
        status: "selecting",
        round: finalSalvo.round,
        ownSubmitted: finalSalvo.selectionsByPlayer[viewerId] !== null,
        ownSelectedDecoyId:
          finalSalvo.selectionsByPlayer[viewerId] === "pass"
            ? null
            : finalSalvo.selectionsByPlayer[viewerId],
        opponentSubmitted: opponentIds.every(
          (id) => finalSalvo.selectionsByPlayer[id] !== null,
        ),
        submittedPlayerIds: battleState.playerIds.filter(
          (id) => finalSalvo.selectionsByPlayer[id] !== null,
        ),
        availableDecoyIds: battleState.players[viewerId].decoys
          .filter((decoy) => !decoy.destroyed)
          .map((decoy) => decoy.id),
        completedShots: finalSalvo.shots.length,
      }
    : finalSalvo?.status === "completed"
      ? { status: "completed", round: finalSalvo.round }
      : null;

  return {
    viewerId,
    opponentId,
    opponentIds,
    match: {
      status: battleState.match.status,
      result: clone(battleState.match.result),
      finalSalvo: safeFinalSalvo,
    },
    own: createOwnPlayerSnapshot(battleState, viewerId),
    opponent: { id: opponentId },
    opponents: opponentIds.map((id) => ({ id })),
    publicActionLog: battleState.actionLog.map(createPublicActionRecord),
    replay: createFinishedReplay(battleState),
  };
}

function createResolutionDelivery(battleState, actionRecord, viewerId) {
  assertBattleState(battleState);
  assertActionRecord(actionRecord);
  const actorId = actionRecord.actorId;
  const defenderId = actionRecord.defenderId;
  if (!battleState.playerIds.includes(viewerId)) {
    throw new RuleValidationError(
      "ACTION_VIEWER_NOT_INVOLVED",
      "只有当前对局玩家可以取得行动反馈。",
      { viewerId },
    );
  }

  return {
    match: {
      status: battleState.match.status,
      result: clone(battleState.match.result),
    },
    publicRecord: createPublicActionRecord(actionRecord),
    feedback: viewerId === actorId
      ? createActorFeedback(battleState, actionRecord)
      : viewerId === defenderId
        ? createDefenderFeedback(actionRecord)
        : { ...createPublicActionRecord(actionRecord), observer: true },
    view: createPlayerView(battleState, viewerId),
  };
}

function createResolutionDeliveries(battleState, actionRecord) {
  assertBattleState(battleState);
  assertActionRecord(actionRecord);
  return Object.fromEntries(
    battleState.playerIds.map((playerId) => [
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
