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
  getOpponentPlayerIds,
  replaceBattlePlayerState,
  destroyDecoy,
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
      ...battleState.match,
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

function carrierSunkPlayerIdsInEvents(events, side) {
  return [
    ...new Set(
      events
        .filter(
          (event) =>
            event.side === side &&
            event.unitType === DEPLOYABLE_TYPES.AIRCRAFT_CARRIER &&
            event.sunk === true &&
            typeof event.playerId === "string",
        )
        .map((event) => event.playerId),
    ),
  ];
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
  const defenderCarrierSunkIds = carrierSunkPlayerIdsInEvents(
    damageEvents,
    "defender",
  );
  const defenderCarrierSunk = defenderCarrierSunkIds.length > 0;
  const actorCarrierSunk = carrierSunkInEvents(damageEvents, "actor");
  const trigger = {
    kind: "action",
    sequence: actionRecord.sequence,
    actionType: actionRecord.action.actionType,
  };
  let result = null;

  if (battleState.playerIds.length === 3) {
    const priorEliminated = battleState.match.eliminatedPlayerIds ?? [];
    const eliminated = new Set(priorEliminated);
    for (const defenderId of defenderCarrierSunkIds) eliminated.add(defenderId);
    if (actorCarrierSunk) eliminated.add(actionRecord.actorId);
    if (eliminated.size === priorEliminated.length) {
      return { state: battleState, ended: false, result: null };
    }
    const activeIds = battleState.playerIds.filter((id) => !eliminated.has(id));
    const state = {
      ...battleState,
      match: { ...battleState.match, eliminatedPlayerIds: [...eliminated] },
    };
    if (activeIds.length === 1) {
      result = {
        ...createWinResult(activeIds[0], [...eliminated][0] ?? null,
          END_REASONS.AIRCRAFT_CARRIER_SUNK, trigger),
        loserIds: [...eliminated],
      };
      return { state: finishBattle(state, result), ended: true, result };
    }
    if (activeIds.length === 0) {
      result = {
        outcome: MATCH_OUTCOMES.DRAW,
        winnerId: null,
        loserId: null,
        loserIds: [...eliminated],
        reason: END_REASONS.AIRCRAFT_CARRIER_SUNK,
        trigger,
      };
      return { state: finishBattle(state, result), ended: true, result };
    }
    return { state, ended: false, result: null };
  }

  if (actionRecord.action.actionType === ACTION_TYPES.PIRATE_ATTACK) {
    const singleDefenderId = actionRecord.defenderId ?? actionRecord.defenderIds?.[0];
    if (defenderCarrierSunk) {
      result = createWinResult(
        actionRecord.actorId,
        singleDefenderId,
        actorCarrierSunk
          ? END_REASONS.PIRATE_SIMULTANEOUS_CARRIER_SINK
          : END_REASONS.PIRATE_ENEMY_CARRIER_SUNK,
        trigger,
      );
    } else if (actorCarrierSunk) {
      result = createWinResult(
        singleDefenderId,
        actionRecord.actorId,
        END_REASONS.PIRATE_OWN_CARRIER_SUNK,
        trigger,
      );
    }
  } else if (defenderCarrierSunk) {
    const singleDefenderId = actionRecord.defenderId ?? actionRecord.defenderIds?.[0];
    result = createWinResult(
      actionRecord.actorId,
      singleDefenderId,
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
      (battleState.match.eliminatedPlayerIds ?? []).includes(playerId) ||
      !hasAttackCapability(getBattlePlayerState(battleState, playerId), {
        targetPlayerIds: getOpponentPlayerIds(battleState, playerId),
      }),
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
  const damagePlans = [];
  const eliminated = new Set(battleState.match.eliminatedPlayerIds ?? []);

  for (const sourcePlayerId of battleState.playerIds) {
    if (eliminated.has(sourcePlayerId)) continue;
    const sourceState = getBattlePlayerState(battleState, sourcePlayerId);
    const targetPlayerIds = getOpponentPlayerIds(battleState, sourcePlayerId);

    for (const decoy of sourceState.decoys.filter(
      (candidate) => !candidate.destroyed,
    )) {
      for (const targetPlayerId of targetPlayerIds) {
        const targetState = getBattlePlayerState(battleState, targetPlayerId);
        const inspection = inspectFinalSalvoTarget(targetState, decoy.cell);
        const liveUnit = inspection.kind === "unit" ? inspection.unit : null;
        const freshUnitCell = Boolean(
          liveUnit && !liveUnit.hitCells.includes(decoy.cell),
        );
        shots.push({
          sourcePlayerId,
          sourceDecoyId: decoy.id,
          sourceCoordinate: decoy.cell,
          targetPlayerId,
          targetCoordinate: decoy.cell,
          result: liveUnit ? "hit" : "miss",
          actualTargetKind: inspection.kind,
          targetUnitId: liveUnit?.id ?? null,
          targetUnitType: liveUnit?.type ?? null,
          freshUnitCell,
        });
        if (freshUnitCell) {
          damagePlans.push({
            sourcePlayerId,
            targetPlayerId,
            unitId: liveUnit.id,
            cell: decoy.cell,
          });
        }
      }
    }
  }

  return { shots, damagePlans };
}

function applyFinalSalvoPlan(battleState, plan) {
  let state = battleState;
  const damageEvents = [];

  for (const damagePlan of plan.damagePlans) {
    const targetState = getBattlePlayerState(state, damagePlan.targetPlayerId);
    const applied = applyDamageToUnit(targetState, damagePlan.unitId, 1, {
      hitCells: [damagePlan.cell],
      reason: "final_salvo",
    });
    state = replaceBattlePlayerState(
      state,
      damagePlan.targetPlayerId,
      applied.state,
    );
    if (applied.event.appliedDamage > 0) {
      damageEvents.push({
        sourcePlayerId: damagePlan.sourcePlayerId,
        targetPlayerId: damagePlan.targetPlayerId,
        ...applied.event,
      });
    }
  }

  return { state, damageEvents };
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
      "只有所有仍在局玩家均无攻击手段时才能执行终局鱼雷齐射。",
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
  const ranking = applied.state.playerIds
    .filter((id) => !(applied.state.match.eliminatedPlayerIds ?? []).includes(id))
    .map((id) => ({ id, hp: carrierHpByPlayer[id] }))
    .sort((a, b) => b.hp - a.hp);
  let result;

  if (ranking.length > 1 && ranking[0].hp === ranking[1].hp) {
    result = {
      outcome: MATCH_OUTCOMES.DRAW,
      winnerId: null,
      loserId: null,
      reason: END_REASONS.FINAL_SALVO_TIE,
      trigger: { kind: "final_salvo" },
    };
  } else {
    const winnerId = ranking[0].id;
    const loserId = ranking.at(-1).id;
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

function createManualFinalSalvoState(battleState) {
  const selectionsByPlayer = {};
  const usedDecoyIdsByPlayer = {};
  for (const playerId of battleState.playerIds) {
    const playerState = getBattlePlayerState(battleState, playerId);
    const available = !(battleState.match.eliminatedPlayerIds ?? []).includes(playerId) &&
      playerState.decoys.some((decoy) => !decoy.destroyed);
    selectionsByPlayer[playerId] = available ? null : "pass";
    usedDecoyIdsByPlayer[playerId] = [];
  }
  return {
    status: "selecting",
    round: 1,
    selectionsByPlayer,
    usedDecoyIdsByPlayer,
    shots: [],
    damageEvents: [],
    carrierHpByPlayer: null,
  };
}

function startManualFinalSalvo(battleState) {
  ensureBattlePlaying(battleState);
  if (!bothPlayersLackAttackCapability(battleState)) {
    throw new RuleValidationError(
      "FINAL_SALVO_NOT_ALLOWED",
      "只有所有仍在局玩家均无攻击手段时才能进入手动鱼雷引爆阶段。",
    );
  }
  return {
    ...battleState,
    match: {
      ...battleState.match,
      finalSalvo: createManualFinalSalvoState(battleState),
    },
  };
}

function applyPirateLink(playerState, damageEvents, playerId) {
  const pirateDamaged = damageEvents.some(
    (event) =>
      event.targetPlayerId === playerId &&
      event.unitType === DEPLOYABLE_TYPES.PIRATE_SHIP &&
      event.appliedDamage > 0,
  );
  if (!pirateDamaged) return { state: playerState, event: null };
  const carrier = getUnitByType(playerState, DEPLOYABLE_TYPES.AIRCRAFT_CARRIER);
  if (!carrier || carrier.hp <= 0) return { state: playerState, event: null };
  const linked = applyDamageToUnit(playerState, carrier.id, 0.5, {
    reason: "pirate_damage_carrier_link",
  });
  return {
    state: linked.state,
    event: {
      sourcePlayerId: getOpponentPlayerIdForPair(playerId, damageEvents),
      targetPlayerId: playerId,
      ...linked.event,
    },
  };
}

function getOpponentPlayerIdForPair(playerId, damageEvents) {
  return damageEvents.find((event) => event.targetPlayerId === playerId)
    ?.sourcePlayerId ?? null;
}

function resolveManualFinalSalvoRound(battleState, finalSalvo) {
  let nextState = battleState;
  const shots = [];
  const roundDamageEvents = [];

  for (const sourcePlayerId of battleState.playerIds) {
    const selected = finalSalvo.selectionsByPlayer[sourcePlayerId];
    if (selected === "pass") continue;
    const sourceState = getBattlePlayerState(nextState, sourcePlayerId);
    const decoy = sourceState.decoys.find((item) => item.id === selected);
    const consumed = destroyDecoy(sourceState, decoy.id, "manual_final_salvo");
    nextState = replaceBattlePlayerState(nextState, sourcePlayerId, consumed.state);
  }

  const damagePlans = [];
  for (const sourcePlayerId of battleState.playerIds) {
    const selected = finalSalvo.selectionsByPlayer[sourcePlayerId];
    if (selected === "pass") continue;
    const sourceState = getBattlePlayerState(battleState, sourcePlayerId);
    const decoy = sourceState.decoys.find((item) => item.id === selected);
    const targetPlayerIds = getOpponentPlayerIds(battleState, sourcePlayerId);
    for (const targetPlayerId of targetPlayerIds) {
      const targetState = getBattlePlayerState(battleState, targetPlayerId);
      const inspection = inspectFinalSalvoTarget(targetState, decoy.cell);
      const liveUnit = inspection.kind === "unit" ? inspection.unit : null;
      const freshUnitCell = Boolean(liveUnit && !liveUnit.hitCells.includes(decoy.cell));
      shots.push({
        round: finalSalvo.round,
        sourcePlayerId,
        sourceDecoyId: decoy.id,
        sourceCoordinate: decoy.cell,
        targetPlayerId,
        targetCoordinate: decoy.cell,
        result: liveUnit ? "hit" : "miss",
        actualTargetKind: inspection.kind,
        targetUnitId: liveUnit?.id ?? null,
        targetUnitType: liveUnit?.type ?? null,
        freshUnitCell,
      });
      if (freshUnitCell) {
        damagePlans.push({ sourcePlayerId, targetPlayerId, unit: liveUnit, cell: decoy.cell });
      }
    }
  }

  for (const plan of damagePlans) {
    const targetState = getBattlePlayerState(nextState, plan.targetPlayerId);
    const applied = applyDamageToUnit(targetState, plan.unit.id, 1, {
      hitCells: [plan.cell],
      reason: "manual_final_salvo",
    });
    nextState = replaceBattlePlayerState(nextState, plan.targetPlayerId, applied.state);
    roundDamageEvents.push({
      sourcePlayerId: plan.sourcePlayerId,
      targetPlayerId: plan.targetPlayerId,
      ...applied.event,
    });
  }

  for (const playerId of battleState.playerIds) {
    const linked = applyPirateLink(
      getBattlePlayerState(nextState, playerId),
      roundDamageEvents,
      playerId,
    );
    nextState = replaceBattlePlayerState(nextState, playerId, linked.state);
    if (linked.event) roundDamageEvents.push(linked.event);
  }

  return { state: nextState, shots, damageEvents: roundDamageEvents };
}

function finishManualFinalSalvo(battleState, finalSalvo) {
  const carrierHpByPlayer = Object.fromEntries(
    battleState.playerIds.map((playerId) => [
      playerId,
      getCarrierHp(getBattlePlayerState(battleState, playerId)),
    ]),
  );
  const ranking = battleState.playerIds
    .filter((id) => !(battleState.match.eliminatedPlayerIds ?? []).includes(id))
    .map((id) => ({ id, hp: carrierHpByPlayer[id] }))
    .sort((a, b) => b.hp - a.hp);
  const tied = ranking.length > 1 && ranking[0].hp === ranking[1].hp;
  const result = tied
    ? {
        outcome: MATCH_OUTCOMES.DRAW,
        winnerId: null,
        loserId: null,
        reason: END_REASONS.FINAL_SALVO_TIE,
        trigger: { kind: "manual_final_salvo" },
      }
    : createWinResult(
        ranking[0].id,
        ranking.at(-1).id,
        END_REASONS.FINAL_SALVO_HIGHER_CARRIER_HP,
        { kind: "manual_final_salvo" },
      );
  const completed = {
    ...finalSalvo,
    status: "completed",
    selectionsByPlayer: Object.fromEntries(
      battleState.playerIds.map((playerId) => [playerId, null]),
    ),
    carrierHpByPlayer,
  };
  return finishBattle(battleState, result, completed);
}

function submitManualFinalSalvo(battleState, playerId, decoyId) {
  ensureBattlePlaying(battleState);
  const draft = battleState.match.finalSalvo;
  if (!draft || draft.status !== "selecting") {
    throw new RuleValidationError("FINAL_SALVO_NOT_ACTIVE", "当前不在手动鱼雷引爆阶段。");
  }
  getBattlePlayerState(battleState, playerId);
  if (draft.selectionsByPlayer[playerId] !== null) {
    throw new RuleValidationError("FINAL_SALVO_ALREADY_SUBMITTED", "本轮已经提交鱼雷选择。");
  }
  const playerState = getBattlePlayerState(battleState, playerId);
  const decoy = playerState.decoys.find((item) => item.id === decoyId);
  if (!decoy || decoy.destroyed || draft.usedDecoyIdsByPlayer[playerId].includes(decoyId)) {
    throw new RuleValidationError("INVALID_FINAL_SALVO_DECOY", "只能选择尚未触发的己方诱饵鱼雷。", { decoyId });
  }
  let finalSalvo = {
    ...draft,
    selectionsByPlayer: { ...draft.selectionsByPlayer, [playerId]: decoyId },
  };
  let state = { ...battleState, match: { ...battleState.match, finalSalvo } };
  if (state.playerIds.some((id) => finalSalvo.selectionsByPlayer[id] === null)) {
    return state;
  }

  const round = resolveManualFinalSalvoRound(state, finalSalvo);
  state = round.state;
  const usedDecoyIdsByPlayer = Object.fromEntries(
    state.playerIds.map((id) => [
      id,
      finalSalvo.selectionsByPlayer[id] === "pass"
        ? [...finalSalvo.usedDecoyIdsByPlayer[id]]
        : [...finalSalvo.usedDecoyIdsByPlayer[id], finalSalvo.selectionsByPlayer[id]],
    ]),
  );
  finalSalvo = {
    ...finalSalvo,
    shots: [...finalSalvo.shots, ...round.shots],
    damageEvents: [...finalSalvo.damageEvents, ...round.damageEvents],
    usedDecoyIdsByPlayer,
  };
  const availableByPlayer = Object.fromEntries(
    state.playerIds.map((id) => [
      id,
      getBattlePlayerState(state, id).decoys.some((item) => !item.destroyed),
    ]),
  );
  if (!Object.values(availableByPlayer).some(Boolean)) {
    return finishManualFinalSalvo(state, finalSalvo);
  }
  finalSalvo = {
    ...finalSalvo,
    round: finalSalvo.round + 1,
    selectionsByPlayer: Object.fromEntries(
      state.playerIds.map((id) => [id, availableByPlayer[id] ? null : "pass"]),
    ),
  };
  return { ...state, match: { ...state.match, finalSalvo } };
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

  const settledState = carrierOutcome.state;
  if (bothPlayersLackAttackCapability(settledState)) {
    return {
      state: startManualFinalSalvo(settledState),
      ended: false,
      result: null,
      finalSalvo: null,
    };
  }

  return {
    state: settledState,
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

  if (battleState.playerIds.length === 3) {
    const eliminated = [...new Set([
      ...(battleState.match.eliminatedPlayerIds ?? []),
      loserId,
    ])];
    const activeIds = battleState.playerIds.filter((id) => !eliminated.includes(id));
    const ongoing = {
      ...battleState,
      match: { ...battleState.match, eliminatedPlayerIds: eliminated },
    };
    if (activeIds.length > 1) {
      return { state: ongoing, result: null, ended: false };
    }
    const result = {
      ...createWinResult(activeIds[0], loserId, reason, { kind: "forfeit" }),
      loserIds: eliminated,
    };
    return { state: finishBattle(ongoing, result), result, ended: true };
  }
  const winnerId = getOpponentPlayerId(battleState, loserId);
  const result = createWinResult(winnerId, loserId, reason, {
    kind: "forfeit",
  });
  return {
    state: finishBattle(battleState, result),
    result,
    ended: true,
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
  startManualFinalSalvo,
  submitManualFinalSalvo,
  settleAfterAction,
  settleCarrierOutcome,
};
