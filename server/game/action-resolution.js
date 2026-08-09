"use strict";

const { ACTION_TYPES } = require("./actions");
const { getUnitByType } = require("./action-state");
const {
  commitActionUsage,
  validateActionIntent,
} = require("./action-validation");
const {
  applyDamageToUnit,
  assertBattleState,
  clearParalysisForPlayer,
  destroyDecoy,
  getBattleDecoyAtCell,
  getBattlePlayerState,
  getBattleUnitAtCell,
  getOpponentPlayerId,
  getOpponentPlayerIds,
  queueParalysis,
  recordTargetCellResults,
} = require("./battle-state");
const { RuleValidationError } = require("./errors");
const {
  DEPLOYABLE_TYPES,
  isSurfaceUnitType,
  isUnderwaterUnitType,
} = require("./units");

const VISIBLE_SINGLE_CELL_ACTIONS = new Set([
  ACTION_TYPES.DESTROYER_I_RAM,
  ACTION_TYPES.DESTROYER_II_RAM,
  ACTION_TYPES.PIRATE_ATTACK,
  ACTION_TYPES.MOTORBOAT_RAM,
]);

function inspectCell(playerState, coordinate) {
  const unit = getBattleUnitAtCell(playerState, coordinate);
  if (unit) {
    return {
      kind: unit.hp > 0 ? "unit" : "wreck",
      unit,
      decoy: null,
    };
  }

  const decoy = getBattleDecoyAtCell(playerState, coordinate);
  if (decoy) {
    return {
      kind: decoy.destroyed ? "destroyed_decoy" : "decoy",
      unit: null,
      decoy,
    };
  }

  return {
    kind: "empty",
    unit: null,
    decoy: null,
  };
}

function createCellResult(coordinate, inspection, result, freshUnitCell) {
  return {
    coordinate,
    result,
    actualTargetKind: inspection.kind,
    targetUnitId: inspection.unit?.id ?? null,
    targetUnitType: inspection.unit?.type ?? null,
    targetDecoyId: inspection.decoy?.id ?? null,
    freshUnitCell,
  };
}

function resolveSingleCellAction(
  action,
  actorId,
  defenderId,
  initialActorState,
  initialDefenderState,
) {
  let actorState = initialActorState;
  let defenderState = initialDefenderState;
  const damageEvents = [];
  const decoyEvents = [];
  const coordinate = action.target.coordinate;
  const inspection = inspectCell(initialDefenderState, coordinate);
  const targetUnit = inspection.unit;
  const targetDecoy = inspection.decoy;
  const liveUnit = inspection.kind === "unit" ? targetUnit : null;
  const activeDecoy = inspection.kind === "decoy" ? targetDecoy : null;
  const freshUnitCell = Boolean(
    liveUnit && !liveUnit.hitCells.includes(coordinate),
  );
  let actualResult = "miss";
  let actorPirateCarrierCoupled = false;
  let defenderPirateCarrierCoupled = false;

  function damageActor(unitId, damage, options = {}) {
    const applied = applyDamageToUnit(actorState, unitId, damage, options);
    actorState = applied.state;
    damageEvents.push({
      playerId: actorId,
      side: "actor",
      ...applied.event,
    });
    if (
      applied.event.unitType === DEPLOYABLE_TYPES.PIRATE_SHIP &&
      applied.event.appliedDamage > 0 &&
      !actorPirateCarrierCoupled
    ) {
      actorPirateCarrierCoupled = true;
      const carrier = getUnitByType(actorState, DEPLOYABLE_TYPES.AIRCRAFT_CARRIER);
      if (carrier?.hp > 0) {
        damageActor(carrier.id, 0.5, { reason: "pirate_damage_carrier_link" });
      }
    }
  }

  function damageDefender(unitId, damage, options = {}) {
    const applied = applyDamageToUnit(
      defenderState,
      unitId,
      damage,
      options,
    );
    defenderState = applied.state;
    damageEvents.push({
      playerId: defenderId,
      side: "defender",
      ...applied.event,
    });
    if (
      applied.event.unitType === DEPLOYABLE_TYPES.PIRATE_SHIP &&
      applied.event.appliedDamage > 0 &&
      !defenderPirateCarrierCoupled
    ) {
      defenderPirateCarrierCoupled = true;
      const carrier = getUnitByType(defenderState, DEPLOYABLE_TYPES.AIRCRAFT_CARRIER);
      if (carrier?.hp > 0) {
        damageDefender(carrier.id, 0.5, { reason: "pirate_damage_carrier_link" });
      }
    }
  }

  function destroyTargetDecoy(reason) {
    const destroyed = destroyDecoy(defenderState, activeDecoy.id, reason);
    defenderState = destroyed.state;
    decoyEvents.push({
      playerId: defenderId,
      side: "defender",
      ...destroyed.event,
    });
  }

  switch (action.actionType) {
    case ACTION_TYPES.DESTROYER_I_RAM:
    case ACTION_TYPES.DESTROYER_II_RAM:
      if (liveUnit) {
        actualResult = "hit";
        if (freshUnitCell) {
          damageDefender(liveUnit.id, 1, {
            hitCells: [coordinate],
            reason: action.actionType,
          });
          damageActor(action.sourceId, 0.5, {
            reason: `${action.actionType}_self_damage`,
          });
        }
      } else if (activeDecoy) {
        actualResult = "hit";
        destroyTargetDecoy(action.actionType);
        damageActor(action.sourceId, 1, {
          reason: `${action.actionType}_decoy_explosion`,
        });
      }
      break;

    case ACTION_TYPES.PIRATE_ATTACK:
      if (liveUnit) {
        actualResult = "hit";
        if (freshUnitCell) {
          damageDefender(liveUnit.id, 2, {
            hitCells: [coordinate],
            reason: ACTION_TYPES.PIRATE_ATTACK,
          });
          damageActor(action.sourceId, 1, {
            reason: "pirate_successful_hit_self_damage",
          });
        }
      } else if (activeDecoy) {
        actualResult = "hit";
        destroyTargetDecoy(ACTION_TYPES.PIRATE_ATTACK);
        damageActor(action.sourceId, 1, {
          reason: "pirate_decoy_explosion",
        });
      }
      break;

    case ACTION_TYPES.MOTORBOAT_RAM:
      if (liveUnit && isSurfaceUnitType(liveUnit.type)) {
        actualResult = "hit";
        if (freshUnitCell) {
          const targetDamage =
            liveUnit.type === DEPLOYABLE_TYPES.AIRCRAFT_CARRIER ? 1 : 0;
          damageDefender(liveUnit.id, targetDamage, {
            hitCells: [coordinate],
            reason: ACTION_TYPES.MOTORBOAT_RAM,
          });
          damageActor(action.sourceId, 1, {
            reason: "motorboat_self_damage",
          });
        }
      } else if (activeDecoy) {
        actualResult = "hit";
        destroyTargetDecoy(ACTION_TYPES.MOTORBOAT_RAM);
        damageActor(action.sourceId, 1, {
          reason: "motorboat_decoy_explosion",
        });
      }
      break;

    case ACTION_TYPES.SUBMARINE_MISSILE:
      if (liveUnit) {
        actualResult = "hit";
        if (freshUnitCell) {
          damageDefender(liveUnit.id, 1, {
            hitCells: [coordinate],
            reason: ACTION_TYPES.SUBMARINE_MISSILE,
          });
        }
      } else if (activeDecoy) {
        actualResult = "hit";
        destroyTargetDecoy(ACTION_TYPES.SUBMARINE_MISSILE);
      }
      break;

    case ACTION_TYPES.NUCLEAR_BOMB:
      if (liveUnit) {
        actualResult = "hit";
        if (freshUnitCell) {
          const damage =
            liveUnit.type === DEPLOYABLE_TYPES.AIRCRAFT_CARRIER ? 2 : 1;
          damageDefender(liveUnit.id, damage, {
            hitCells: [coordinate],
            reason: ACTION_TYPES.NUCLEAR_BOMB,
          });
        }
      } else if (activeDecoy) {
        actualResult = "hit";
        destroyTargetDecoy(ACTION_TYPES.NUCLEAR_BOMB);
      }
      break;

    default:
      throw new RuleValidationError(
        "UNSUPPORTED_SINGLE_ACTION",
        "该行动不是可结算的单格攻击。",
        { actionType: action.actionType },
      );
  }

  return {
    actorState,
    defenderState,
    outcome: {
      kind: "single_cell",
      actualResult,
      cellResult: createCellResult(
        coordinate,
        inspection,
        actualResult,
        actualResult === "hit" && freshUnitCell,
      ),
      damageEvents,
      decoyEvents,
    },
  };
}

function resolveShockBomb(action, defenderState) {
  const area = action.targetCells;
  const areaSet = new Set(area);
  const affectedUnitIds = defenderState.units
    .filter(
      (unit) =>
        unit.hp > 0 &&
        isUnderwaterUnitType(unit.type) &&
        unit.cells.some((cell) => areaSet.has(cell)),
    )
    .map((unit) => unit.id);

  return {
    defenderState: queueParalysis(defenderState, affectedUnitIds),
    outcome: {
      kind: "shock",
      center: action.action.target.coordinate,
      area,
      affectedUnitIds,
    },
  };
}

function resolveDetectionBomb(action, defenderState) {
  const signalCells = [];
  for (const coordinate of action.targetCells) {
    const inspection = inspectCell(defenderState, coordinate);
    if (
      inspection.kind === "unit" &&
      isUnderwaterUnitType(inspection.unit.type) &&
      !inspection.unit.hitCells.includes(coordinate)
    ) {
      signalCells.push(coordinate);
    } else if (inspection.kind === "decoy") {
      signalCells.push(coordinate);
    }
  }

  return {
    outcome: {
      kind: "detection",
      center: action.action.target.coordinate,
      area: action.targetCells,
      detected: signalCells.length > 0,
    },
  };
}

function resolveRadarScan(action, defenderState) {
  const areaSet = new Set(action.targetCells);
  const detected = defenderState.units.some((unit) =>
    unit.cells.some((cell) => areaSet.has(cell))) ||
    defenderState.decoys.some((decoy) => !decoy.destroyed && areaSet.has(decoy.cell));
  return {
    outcome: {
      kind: "radar",
      anchor: action.action.target.coordinate,
      area: action.targetCells,
      detected,
    },
  };
}

function resolveHelicopterStrafe(
  action,
  defenderId,
  initialDefenderState,
) {
  let defenderState = initialDefenderState;
  const pendingSet = new Set(action.pendingTargetCells);
  const freshCellsByUnit = new Map();
  const cellResults = [];

  for (const coordinate of action.targetCells) {
    if (!pendingSet.has(coordinate)) {
      cellResults.push({
        coordinate,
        result: "skipped",
        actualTargetKind: null,
        targetUnitId: null,
        targetUnitType: null,
        freshUnitCell: false,
      });
      continue;
    }

    const inspection = inspectCell(initialDefenderState, coordinate);
    const liveSurfaceUnit =
      inspection.kind === "unit" &&
      isSurfaceUnitType(inspection.unit.type)
        ? inspection.unit
        : null;
    const freshUnitCell = Boolean(
      liveSurfaceUnit && !liveSurfaceUnit.hitCells.includes(coordinate),
    );
    const result = liveSurfaceUnit ? "hit" : "miss";

    cellResults.push(
      createCellResult(coordinate, inspection, result, freshUnitCell),
    );

    if (freshUnitCell) {
      const existing = freshCellsByUnit.get(liveSurfaceUnit.id) ?? [];
      existing.push(coordinate);
      freshCellsByUnit.set(liveSurfaceUnit.id, existing);
    }
  }

  const damageEvents = [];
  let pirateCarrierCoupled = false;
  for (const [unitId, hitCells] of freshCellsByUnit.entries()) {
    const unit = initialDefenderState.units.find(
      (candidate) => candidate.id === unitId,
    );
    const requestedDamage =
      unit.type === DEPLOYABLE_TYPES.AIRCRAFT_CARRIER
        ? Math.min(2, hitCells.length)
        : hitCells.length;
    const applied = applyDamageToUnit(
      defenderState,
      unitId,
      requestedDamage,
      {
        hitCells,
        reason: ACTION_TYPES.HELICOPTER_STRAFE,
      },
    );
    defenderState = applied.state;
    damageEvents.push({
      playerId: defenderId,
      side: "defender",
      coveredFreshCellCount: hitCells.length,
      ...applied.event,
    });
    if (
      unit.type === DEPLOYABLE_TYPES.PIRATE_SHIP &&
      applied.event.appliedDamage > 0 &&
      !pirateCarrierCoupled
    ) {
      pirateCarrierCoupled = true;
      const carrier = getUnitByType(defenderState, DEPLOYABLE_TYPES.AIRCRAFT_CARRIER);
      if (carrier?.hp > 0) {
        const linked = applyDamageToUnit(defenderState, carrier.id, 0.5, {
          reason: "pirate_damage_carrier_link",
        });
        defenderState = linked.state;
        damageEvents.push({
          playerId: defenderId,
          side: "defender",
          ...linked.event,
        });
      }
    }
  }

  return {
    defenderState,
    outcome: {
      kind: "line",
      target: action.action.target,
      cellResults,
      damageEvents,
      decoyEvents: [],
    },
  };
}

function resolveAction(battleState, actorId, intent, options = {}) {
  assertBattleState(battleState);
  const opponentIds = getOpponentPlayerIds(battleState, actorId);
  const isGlobalHelicopter =
    intent?.actionType === ACTION_TYPES.HELICOPTER_STRAFE &&
    opponentIds.length > 1;
  const defenderIds = isGlobalHelicopter
    ? [...opponentIds]
    : [opponentIds.length === 1 ? opponentIds[0] : intent?.targetPlayerId];

  if (
    defenderIds.length < 1 ||
    defenderIds.some((defenderId) => !opponentIds.includes(defenderId))
  ) {
    throw new RuleValidationError(
      "INVALID_TARGET_PLAYER",
      "三人对战必须选择一名仍在对局中的敌方玩家。",
      { actorId, defenderIds, opponentIds },
    );
  }

  const initialActorState = getBattlePlayerState(battleState, actorId);
  const validation = validateActionIntent(initialActorState, intent);

  if (!validation.valid) {
    throw new RuleValidationError(
      "INVALID_ACTION",
      "行动请求不符合《游戏规则 v1.4》。",
      { errors: validation.errors },
    );
  }

  const committed = commitActionUsage(initialActorState, intent);
  let actorState = committed.state;
  const players = { ...battleState.players };
  let outcome;
  let defenderId = defenderIds[0];

  if (isGlobalHelicopter) {
    const outcomesByDefender = {};
    const damageEvents = [];
    const decoyEvents = [];
    const cellResultsByDefender = {};

    for (const targetPlayerId of defenderIds) {
      const initialDefenderState = getBattlePlayerState(battleState, targetPlayerId);
      const resolved = resolveHelicopterStrafe(
        committed,
        targetPlayerId,
        initialDefenderState,
      );
      players[targetPlayerId] = resolved.defenderState;
      outcomesByDefender[targetPlayerId] = resolved.outcome;
      cellResultsByDefender[targetPlayerId] = resolved.outcome.cellResults;
      damageEvents.push(...resolved.outcome.damageEvents);
      decoyEvents.push(...resolved.outcome.decoyEvents);
    }

    outcome = {
      kind: "multi_defender_line",
      target: committed.action.target,
      defenderIds: [...defenderIds],
      outcomesByDefender,
      cellResultsByDefender,
      damageEvents,
      decoyEvents,
    };
    defenderId = null;
  } else {
    const targetPlayerId = defenderIds[0];
    const initialDefenderState = getBattlePlayerState(battleState, targetPlayerId);
    let defenderState = initialDefenderState;

    if (
      VISIBLE_SINGLE_CELL_ACTIONS.has(committed.action.actionType) ||
      [ACTION_TYPES.SUBMARINE_MISSILE, ACTION_TYPES.NUCLEAR_BOMB].includes(
        committed.action.actionType,
      )
    ) {
      const resolved = resolveSingleCellAction(
        committed.action,
        actorId,
        targetPlayerId,
        actorState,
        defenderState,
      );
      actorState = resolved.actorState;
      defenderState = resolved.defenderState;
      outcome = resolved.outcome;

      if (VISIBLE_SINGLE_CELL_ACTIONS.has(committed.action.actionType)) {
        actorState = recordTargetCellResults(actorState, [
          {
            coordinate: committed.action.target.coordinate,
            result: outcome.actualResult,
          },
        ]);
      }
    } else if (committed.action.actionType === ACTION_TYPES.SHOCK_BOMB) {
      const resolved = resolveShockBomb(committed, defenderState);
      defenderState = resolved.defenderState;
      outcome = resolved.outcome;
    } else if (committed.action.actionType === ACTION_TYPES.DETECTION_BOMB) {
      outcome = resolveDetectionBomb(committed, defenderState).outcome;
    } else if (committed.action.actionType === ACTION_TYPES.RADAR_SCAN) {
      outcome = resolveRadarScan(committed, defenderState).outcome;
    } else if (
      committed.action.actionType === ACTION_TYPES.HELICOPTER_STRAFE
    ) {
      const resolved = resolveHelicopterStrafe(
        committed,
        targetPlayerId,
        defenderState,
      );
      defenderState = resolved.defenderState;
      outcome = resolved.outcome;
      actorState = recordTargetCellResults(
        actorState,
        outcome.cellResults.filter((cellResult) =>
          ["hit", "miss"].includes(cellResult.result),
        ),
      );
    } else {
      throw new RuleValidationError(
        "UNSUPPORTED_ACTION_RESOLUTION",
        "该行动尚无结算器。",
        { actionType: committed.action.actionType },
      );
    }

    players[targetPlayerId] = defenderState;
  }

  if (options.clearParalysisAfterAction !== false) {
    actorState = clearParalysisForPlayer(actorState);
  }
  players[actorId] = actorState;

  const actionRecord = {
    sequence: battleState.nextActionSequence,
    actorId,
    defenderId,
    defenderIds: [...defenderIds],
    action: committed.action,
    targetCells: committed.targetCells,
    pendingTargetCells: committed.pendingTargetCells,
    outcome,
  };
  const nextState = {
    ...battleState,
    players,
    actionLog: [...battleState.actionLog, actionRecord],
    nextActionSequence: battleState.nextActionSequence + 1,
  };

  return {
    state: nextState,
    result: actionRecord,
  };
}

module.exports = {
  inspectCell,
  resolveAction,
};
