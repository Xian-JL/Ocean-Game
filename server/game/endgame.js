"use strict";

const { ACTION_TYPES, isAttackAction } = require("./actions");
const { getUnitByType } = require("./action-state");
const { hasAttackCapability } = require("./action-validation");
const {
  MATCH_STATUS,
  applyDamageToUnit,
  assertBattleState,
  getBattleDecoyAtCell,
  getBattlePlayerState,
  getBattleUnitAtCell,
  getOpponentPlayerId,
} = require("./battle-state");
const { RuleValidationError } = require("./errors");
const { DEPLOYABLE_TYPES } = require("./units");

const MATCH_OUTCOMES = Object.freeze({
  WIN: "win",
  DRAW: "draw",
  CANCELED: "canceled",
});

const END_REASONS = Object.freeze({
  AIRCRAFT_CARRIER_SUNK: "aircraft_carrier_sunk",
  PIRATE_ENEMY_CARRIER_SUNK: "pirate_enemy_carrier_sunk",
  PIRATE_SIMULTANEOUS_CARRIER_SINK:
    "pirate_simultaneous_carrier_sink",
  PIRATE_OWN_CARRIER_SUNK: "pirate_own_carrier_sunk",
  FINAL_SALVO_HIGHER_CARRIER_HP: "final_salvo_higher_carrier_hp",
  FINAL_SALVO_TIE: "final_salvo_tie",
  SURRENDER: "surrender",
  THREE_CONSECUTIVE_TIMEOUTS: "three_consecutive_timeouts",
  DISCONNECT_TIMEOUT: "disconnect_timeout",
  BOTH_DISCONNECTED: "both_disconnected",
});

const FORFEIT_REASONS = new Set([
  END_REASONS.SURRENDER,
  END_REASONS.THREE_CONSECUTIVE_TIMEOUTS,
  END_REASONS.DISCONNECT_TIMEOUT,
]);

function ensureBattlePlaying(battleState) {
  assertBattleState(battleState);
  if (battleState.match.status !== MATCH_STATUS.PLAYING) {
    throw new RuleValidationError(
      "MATCH_ALREADY_FINISHED",
      "对局已经结束，不能再次执行终局结算。",
      { result: battleState.match.result },
    );
  }
  return battleState;
}

function createWinResult(winnerId, loserId, reason, trigger) {
  return {
    outcome: MATCH_OUTCOMES.WIN,
    winnerId,
    loserId,
    reason,
    trigger,
  };
}

function finishBattle(battleState, result, finalSalvo = null) {
  return {
    ...battleState,
    match: {
      status: MATCH_STATUS.FINISHED,
      result,
      finalSalvo,
    },
  };
}

function carrierSunkInEvents(events, side) {
  return events.some(
    (event) =>
      event.side === side &&
      event.unitType === DEPLOYABLE_TYPES.AIRCRAFT_CARRIER &&
      event.sunk === true,
  );
}

function settleCarrierOutcome(battleState, actionRecord) {
  ensureBattlePlaying(battleState);
  if (
    !actionRecord ||
    typeof actionRecord !== "object" ||
    !actionRecord.action ||
    !isAttackAction(actionRecord.action.actionType)
  ) {
    return {
      state: battleState,
      ended: false,
      result: null,
    };
  }

  const damageEvents = actionRecord.outcome?.damageEvents ?? [];
  const defenderCarrierSunk = carrierSunkInEvents(
    damageEvents,
    "defender",
  );
  const actorCarrierSunk = carrierSunkInEvents(damageEvents, "actor");
  const trigger = {
    kind: "action",
    sequence: actionRecord.sequence,
    actionType: actionRecord.action.actionType,
  };
  let result = null;

  if (actionRecord.action.actionType === ACTION_TYPES.PIRATE_ATTACK) {
    if (defenderCarrierSunk) {
      result = createWinResult(
        actionRecord.actorId,
        actionRecord.defenderId,
        actorCarrierSunk
          ? END_REASONS.PIRATE_SIMULTANEOUS_CARRIER_SINK
          : END_REASONS.PIRATE_ENEMY_CARRIER_SUNK,
        trigger,
      );
    } else if (actorCarrierSunk) {
      result = createWinResult(
        actionRecord.defenderId,
        actionRecord.actorId,
        END_REASONS.PIRATE_OWN_CARRIER_SUNK,
        trigger,
      );
    }
  } else if (defenderCarrierSunk) {
    result = createWinResult(
      actionRecord.actorId,
      actionRecord.defenderId,
      END_REASONS.AIRCRAFT_CARRIER_SUNK,
      trigger,
    );
  }

  return result
    ? {
        state: finishBattle(battleState, result),
        ended: true,
        result,
      }
    : {
        state: battleState,
        ended: false,
        result: null,
      };
}

function bothPlayersLackAttackCapability(battleState) {
  assertBattleState(battleState);
  return battleState.playerIds.every(
    (playerId) =>
      !hasAttackCapability(getBattlePlayerState(battleState, playerId)),
  );
}

function inspectFinalSalvoTarget(playerState, coordinate) {
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

function createFinalSalvoPlan(battleState) {
  const shots = [];
  const freshHitsByTargetPlayer = Object.fromEntries(
    battleState.playerIds.map((playerId) => [playerId, new Map()]),
  );

  for (const sourcePlayerId of battleState.playerIds) {
    const sourceState = getBattlePlayerState(battleState, sourcePlayerId);
    const targetPlayerId = getOpponentPlayerId(
      battleState,
      sourcePlayerId,
    );
    const targetState = getBattlePlayerState(battleState, targetPlayerId);

    for (const decoy of sourceState.decoys.filter(
      (candidate) => !candidate.destroyed,
    )) {
      const inspection = inspectFinalSalvoTarget(targetState, decoy.cell);
      const liveUnit = inspection.kind === "unit" ? inspection.unit : null;
      const freshUnitCell = Boolean(
        liveUnit && !liveUnit.hitCells.includes(decoy.cell),
      );
      const result = liveUnit ? "hit" : "miss";

      shots.push({
        sourcePlayerId,
        sourceDecoyId: decoy.id,
        sourceCoordinate: decoy.cell,
        targetPlayerId,
        targetCoordinate: decoy.cell,
        result,
        actualTargetKind: inspection.kind,
        targetUnitId: liveUnit?.id ?? null,
        targetUnitType: liveUnit?.type ?? null,
        freshUnitCell,
      });

      if (freshUnitCell) {
        const byUnit = freshHitsByTargetPlayer[targetPlayerId];
        const hitCells = byUnit.get(liveUnit.id) ?? [];
        hitCells.push(decoy.cell);
        byUnit.set(liveUnit.id, hitCells);
      }
    }
  }

  return {
    shots,
    freshHitsByTargetPlayer,
  };
}

function applyFinalSalvoPlan(battleState, plan) {
  const players = { ...battleState.players };
  const damageEvents = [];

  for (const targetPlayerId of battleState.playerIds) {
    let targetState = players[targetPlayerId];
    const sourcePlayerId = getOpponentPlayerId(
      battleState,
      targetPlayerId,
    );

    for (const [unitId, hitCells] of plan.freshHitsByTargetPlayer[
      targetPlayerId
    ].entries()) {
      const applied = applyDamageToUnit(
        targetState,
        unitId,
        hitCells.length,
        {
          hitCells,
          reason: "final_salvo",
        },
      );
      targetState = applied.state;
      damageEvents.push({
        sourcePlayerId,
        targetPlayerId,
        ...applied.event,
      });
    }

    players[targetPlayerId] = targetState;
  }

  return {
    state: {
      ...battleState,
      players,
    },
    damageEvents,
  };
}

function getCarrierHp(playerState) {
  const carrier = getUnitByType(
    playerState,
    DEPLOYABLE_TYPES.AIRCRAFT_CARRIER,
  );
  if (!carrier) {
    throw new RuleValidationError(
      "AIRCRAFT_CARRIER_NOT_FOUND",
      "终局结算找不到航空母舰。",
    );
  }
  return carrier.hp;
}

function resolveFinalSalvo(battleState) {
  ensureBattlePlaying(battleState);
  if (!bothPlayersLackAttackCapability(battleState)) {
    throw new RuleValidationError(
      "FINAL_SALVO_NOT_ALLOWED",
      "只有双方均无攻击手段时才能执行终局鱼雷齐射。",
    );
  }

  const plan = createFinalSalvoPlan(battleState);
  const applied = applyFinalSalvoPlan(battleState, plan);
  const carrierHpByPlayer = Object.fromEntries(
    applied.state.playerIds.map((playerId) => [
      playerId,
      getCarrierHp(getBattlePlayerState(applied.state, playerId)),
    ]),
  );
  const [firstPlayerId, secondPlayerId] = applied.state.playerIds;
  const firstHp = carrierHpByPlayer[firstPlayerId];
  const secondHp = carrierHpByPlayer[secondPlayerId];
  let result;

  if (firstHp === secondHp) {
    result = {
      outcome: MATCH_OUTCOMES.DRAW,
      winnerId: null,
      loserId: null,
      reason: END_REASONS.FINAL_SALVO_TIE,
      trigger: { kind: "final_salvo" },
    };
  } else {
    const winnerId = firstHp > secondHp ? firstPlayerId : secondPlayerId;
    const loserId = getOpponentPlayerId(applied.state, winnerId);
    result = createWinResult(
      winnerId,
      loserId,
      END_REASONS.FINAL_SALVO_HIGHER_CARRIER_HP,
      { kind: "final_salvo" },
    );
  }

  const finalSalvo = {
    shots: plan.shots,
    damageEvents: applied.damageEvents,
    carrierHpByPlayer,
  };
  const state = finishBattle(applied.state, result, finalSalvo);

  return {
    state,
    ended: true,
    result,
    finalSalvo,
  };
}

function settleAfterAction(battleState, actionRecord) {
  ensureBattlePlaying(battleState);
  const carrierOutcome = settleCarrierOutcome(battleState, actionRecord);
  if (carrierOutcome.ended) {
    return {
      ...carrierOutcome,
      finalSalvo: null,
    };
  }

  if (bothPlayersLackAttackCapability(battleState)) {
    return resolveFinalSalvo(battleState);
  }

  return {
    state: battleState,
    ended: false,
    result: null,
    finalSalvo: null,
  };
}

function finishByForfeit(battleState, loserId, reason) {
  ensureBattlePlaying(battleState);
  getBattlePlayerState(battleState, loserId);
  if (!FORFEIT_REASONS.has(reason)) {
    throw new RuleValidationError(
      "INVALID_FORFEIT_REASON",
      "判负原因必须是投降、连续三次行动超时或断线超时。",
      { reason },
    );
  }

  const winnerId = getOpponentPlayerId(battleState, loserId);
  const result = createWinResult(winnerId, loserId, reason, {
    kind: "forfeit",
  });
  return {
    state: finishBattle(battleState, result),
    result,
  };
}

function cancelForBothDisconnected(battleState) {
  ensureBattlePlaying(battleState);
  const result = {
    outcome: MATCH_OUTCOMES.CANCELED,
    winnerId: null,
    loserId: null,
    reason: END_REASONS.BOTH_DISCONNECTED,
    trigger: { kind: "connection" },
  };
  return {
    state: finishBattle(battleState, result),
    result,
  };
}

module.exports = {
  END_REASONS,
  MATCH_OUTCOMES,
  bothPlayersLackAttackCapability,
  cancelForBothDisconnected,
  ensureBattlePlaying,
  finishByForfeit,
  resolveFinalSalvo,
  settleAfterAction,
  settleCarrierOutcome,
};
