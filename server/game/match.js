"use strict";

const {
  MATCH_STATUS,
  assertBattleState,
  beginNormalTurn,
  clearParalysisForPlayer,
  completeAutomaticSkip,
  createBattleState,
  getBattlePlayerState,
  getOpponentPlayerId,
  replaceBattlePlayerState,
} = require("./battle-state");
const {
  hasAnyLegalAction,
  validateActionIntent,
} = require("./action-validation");
const {
  END_REASONS,
  bothPlayersLackAttackCapability,
  finishByForfeit,
  resolveFinalSalvo,
} = require("./endgame");
const { RuleValidationError } = require("./errors");
const { createPlayerView } = require("./information-projection");
const { resolveBattleAction } = require("./match-resolution");
const {
  CONNECTION_PHASES,
  ROOM_PHASES,
  assertPlayerId,
  assertRoomConnected,
  assertRoomState,
  getPlayerSeat,
} = require("./room");
const {
  ACTION_DURATION_MS,
  MAX_CONSECUTIVE_ACTION_TIMEOUTS,
  createDeadline,
  isDeadlineReached,
  normalizeServerTime,
} = require("./timing");

const TURN_PHASES = Object.freeze({
  ACTIVE: "ACTIVE",
  RESOLVING: "RESOLVING",
  AUTO_SKIPPING: "AUTO_SKIPPING",
});

const MAX_ROLL_ROUNDS = 100;

function clone(value) {
  return structuredClone(value);
}

function fail(code, message, details = {}) {
  throw new RuleValidationError(code, message, details);
}

function bumpVersion(room, changes) {
  return {
    ...room,
    ...changes,
    stateVersion: room.stateVersion + 1,
  };
}

function assertRoomPhase(room, phase, code, message) {
  if (room.roomPhase !== phase) {
    fail(code, message, {
      expectedPhase: phase,
      actualPhase: room.roomPhase,
    });
  }
}

function rollDie(random) {
  if (typeof random !== "function") {
    fail("INVALID_RANDOM_SOURCE", "骰子随机源必须是函数。");
  }
  const value = random();
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1) {
    fail("INVALID_RANDOM_VALUE", "骰子随机值必须位于 [0, 1)。", {
      value,
    });
  }
  return Math.floor(value * 6) + 1;
}

function determineFirstPlayer(room, random = Math.random) {
  assertRoomState(room);
  assertRoomConnected(room);
  assertRoomPhase(
    room,
    ROOM_PHASES.ROLLING,
    "ROLLING_NOT_ALLOWED",
    "只有部署锁定后的 ROLLING 阶段可以决定先手。",
  );
  if (room.rolling !== null) {
    fail("FIRST_PLAYER_ALREADY_DETERMINED", "本局先手已经由服务器确定。", {
      firstPlayerId: room.rolling.firstPlayerId,
    });
  }

  const [firstSeat, secondSeat] = room.seats;
  const rounds = [];
  let firstPlayerId = null;

  for (let round = 1; round <= MAX_ROLL_ROUNDS; round += 1) {
    const firstRoll = rollDie(random);
    const secondRoll = rollDie(random);
    rounds.push({
      round,
      rolls: {
        [firstSeat.playerId]: firstRoll,
        [secondSeat.playerId]: secondRoll,
      },
      tied: firstRoll === secondRoll,
    });

    if (firstRoll !== secondRoll) {
      firstPlayerId = firstRoll > secondRoll
        ? firstSeat.playerId
        : secondSeat.playerId;
      break;
    }
  }

  if (firstPlayerId === null) {
    fail(
      "ROLLING_DID_NOT_RESOLVE",
      `连续 ${MAX_ROLL_ROUNDS} 轮同点，服务器未能确定先手。`,
    );
  }

  return assertMatchRoomState(
    bumpVersion(room, {
      rolling: {
        rounds,
        firstPlayerId,
      },
    }),
  );
}

function startPlaying(room, nowMs = Date.now()) {
  assertMatchRoomState(room);
  assertRoomConnected(room);
  const normalizedNow = normalizeServerTime(nowMs);
  assertRoomPhase(
    room,
    ROOM_PHASES.ROLLING,
    "MATCH_START_NOT_ALLOWED",
    "只有 ROLLING 阶段可以开始正式对局。",
  );
  if (!room.rolling?.firstPlayerId) {
    fail("FIRST_PLAYER_REQUIRED", "服务器确定先手后才能开始正式对局。");
  }

  const battleState = createBattleState(
    room.seats.map((seat) => ({
      id: seat.playerId,
      deployment: seat.deployment,
    })),
  );
  const firstPlayerId = room.rolling.firstPlayerId;
  const begun = beginNormalTurn(battleState, firstPlayerId);
  const active = hasAnyLegalAction(
    getBattlePlayerState(begun.state, firstPlayerId),
  );

  return assertMatchRoomState(
    bumpVersion(room, {
      roomPhase: ROOM_PHASES.PLAYING,
      turnPhase: active ? TURN_PHASES.ACTIVE : TURN_PHASES.AUTO_SKIPPING,
      battleState: begun.state,
      currentPlayerId: firstPlayerId,
      turnNumber: active ? 1 : 0,
      matchStartedAt: normalizedNow,
      matchFinishedAt: null,
      pendingAction: null,
      lastResolutionByPlayer: null,
      lastTurnStart: {
        playerId: firstPlayerId,
        activatedUnitIds: begun.activatedUnitIds,
      },
      actionDeadlineAt: active
        ? createDeadline(normalizedNow, ACTION_DURATION_MS)
        : null,
    }),
  );
}

function assertPlayingTurn(room, expectedTurnPhase) {
  assertMatchRoomState(room);
  assertRoomPhase(
    room,
    ROOM_PHASES.PLAYING,
    "MATCH_NOT_PLAYING",
    "只有 PLAYING 阶段可以处理回合。",
  );
  if (room.turnPhase !== expectedTurnPhase) {
    fail("TURN_PHASE_MISMATCH", "当前回合阶段不允许执行该操作。", {
      expectedTurnPhase,
      actualTurnPhase: room.turnPhase,
    });
  }
}

function assertActionWindowOpen(room, nowMs) {
  const normalizedNow = normalizeServerTime(nowMs);
  if (isDeadlineReached(room.actionDeadlineAt, normalizedNow)) {
    fail(
      "ACTION_DEADLINE_EXPIRED",
      "本回合行动时间已经结束，等待服务器处理超时。",
      {
        deadlineAt: room.actionDeadlineAt,
        nowMs: normalizedNow,
      },
    );
  }
  return normalizedNow;
}

function beginPlayerAction(room, playerId, intent, nowMs = Date.now()) {
  assertPlayingTurn(room, TURN_PHASES.ACTIVE);
  assertRoomConnected(room);
  assertPlayerId(playerId);
  if (room.currentPlayerId !== playerId) {
    fail("NOT_CURRENT_PLAYER", "只有当前回合玩家可以提交行动。", {
      currentPlayerId: room.currentPlayerId,
      playerId,
    });
  }
  assertActionWindowOpen(room, nowMs);

  const playerState = getBattlePlayerState(room.battleState, playerId);
  const validation = validateActionIntent(playerState, intent);
  if (!validation.valid) {
    fail("INVALID_ACTION", "行动请求不符合《游戏规则 v1.0》。", {
      errors: validation.errors,
    });
  }

  return assertMatchRoomState(
    bumpVersion(room, {
      turnPhase: TURN_PHASES.RESOLVING,
      pendingAction: {
        playerId,
        intent: clone(validation.normalizedIntent),
      },
      actionDeadlineAt: null,
    }),
  );
}

function prepareNextTurn(room, battleState, nextPlayerId, nowMs) {
  const normalizedNow = normalizeServerTime(nowMs);
  const begun = beginNormalTurn(battleState, nextPlayerId);
  const active = hasAnyLegalAction(
    getBattlePlayerState(begun.state, nextPlayerId),
  );
  const connected = room.connectionPhase === CONNECTION_PHASES.CONNECTED;
  return {
    ...room,
    battleState: begun.state,
    currentPlayerId: nextPlayerId,
    turnPhase: active ? TURN_PHASES.ACTIVE : TURN_PHASES.AUTO_SKIPPING,
    turnNumber: room.turnNumber + (active ? 1 : 0),
    pendingAction: null,
    lastTurnStart: {
      playerId: nextPlayerId,
      activatedUnitIds: begun.activatedUnitIds,
    },
    actionDeadlineAt: active && connected
      ? createDeadline(normalizedNow, ACTION_DURATION_MS)
      : null,
    pausedTimer: active && !connected
      ? {
          kind: "action",
          remainingMs: ACTION_DURATION_MS,
        }
      : room.pausedTimer,
  };
}

function finishAsFinalSalvo(room, battleState, finishedAt, extraChanges = {}) {
  return {
    ...room,
    ...extraChanges,
    roomPhase: ROOM_PHASES.FINAL_SALVO,
    turnPhase: null,
    battleState,
    currentPlayerId: null,
    pendingAction: null,
    actionDeadlineAt: null,
    pausedTimer: null,
    matchFinishedAt: finishedAt,
  };
}

function finishImmediately(room, battleState, finishedAt, extraChanges = {}) {
  return {
    ...room,
    ...extraChanges,
    roomPhase: ROOM_PHASES.FINISHED,
    turnPhase: null,
    battleState,
    currentPlayerId: null,
    pendingAction: null,
    actionDeadlineAt: null,
    pausedTimer: null,
    matchFinishedAt: finishedAt,
    seats: room.seats.map((seat) => ({
      ...seat,
      reconnectDeadlineAt: null,
    })),
  };
}

function completePlayerAction(room, nowMs = Date.now()) {
  assertPlayingTurn(room, TURN_PHASES.RESOLVING);
  const normalizedNow = normalizeServerTime(nowMs);
  const pending = room.pendingAction;
  const resolved = resolveBattleAction(
    room.battleState,
    pending.playerId,
    pending.intent,
  );
  let next = {
    ...room,
    battleState: resolved.state,
    pendingAction: null,
    lastResolutionByPlayer: clone(resolved.deliveriesByPlayer),
    consecutiveActionTimeouts: {
      ...room.consecutiveActionTimeouts,
      [pending.playerId]: 0,
    },
  };

  if (resolved.state.match.status === MATCH_STATUS.FINISHED) {
    next = resolved.state.match.finalSalvo
      ? finishAsFinalSalvo(next, resolved.state, normalizedNow)
      : finishImmediately(next, resolved.state, normalizedNow);
  } else {
    const nextPlayerId = getOpponentPlayerId(
      resolved.state,
      pending.playerId,
    );
    next = prepareNextTurn(
      next,
      resolved.state,
      nextPlayerId,
      normalizedNow,
    );
  }

  return assertMatchRoomState({
    ...next,
    stateVersion: room.stateVersion + 1,
  });
}

function createAutomaticSkipEvent(room, playerId) {
  return {
    sequence: room.nextTurnEventSequence,
    kind: "automatic_skip",
    playerId,
    message: "当前玩家没有可用行动，本回合自动跳过",
  };
}

function completeAutomaticTurnSkip(room, nowMs = Date.now()) {
  assertPlayingTurn(room, TURN_PHASES.AUTO_SKIPPING);
  assertRoomConnected(room);
  const normalizedNow = normalizeServerTime(nowMs);
  const skippedPlayerId = room.currentPlayerId;
  const clearedBattle = completeAutomaticSkip(
    room.battleState,
    skippedPlayerId,
  );
  const event = createAutomaticSkipEvent(room, skippedPlayerId);
  let next = {
    ...room,
    battleState: clearedBattle,
    turnEvents: [...room.turnEvents, event],
    nextTurnEventSequence: room.nextTurnEventSequence + 1,
    lastTurnStart: null,
  };

  // 防御性检查：双方永久失去攻击手段时，终局齐射优先于继续跳过。
  if (bothPlayersLackAttackCapability(clearedBattle)) {
    const finalSalvo = resolveFinalSalvo(clearedBattle);
    next = finishAsFinalSalvo(next, finalSalvo.state, normalizedNow);
  } else {
    const nextPlayerId = getOpponentPlayerId(
      clearedBattle,
      skippedPlayerId,
    );
    next = prepareNextTurn(
      next,
      clearedBattle,
      nextPlayerId,
      normalizedNow,
    );
  }

  return assertMatchRoomState({
    ...next,
    stateVersion: room.stateVersion + 1,
  });
}

function createActionTimeoutEvent(room, playerId) {
  return {
    sequence: room.nextTurnEventSequence,
    kind: "action_timeout",
    playerId,
    message: "行动超时",
  };
}

function processActionTimeout(room, nowMs = Date.now()) {
  assertPlayingTurn(room, TURN_PHASES.ACTIVE);
  assertRoomConnected(room);
  const normalizedNow = normalizeServerTime(nowMs);
  if (!isDeadlineReached(room.actionDeadlineAt, normalizedNow)) {
    fail(
      "ACTION_DEADLINE_NOT_REACHED",
      "当前行动截止时间尚未到达。",
      {
        deadlineAt: room.actionDeadlineAt,
        nowMs: normalizedNow,
      },
    );
  }

  const timedOutPlayerId = room.currentPlayerId;
  const timedOutPlayerState = getBattlePlayerState(
    room.battleState,
    timedOutPlayerId,
  );
  const clearedBattle = replaceBattlePlayerState(
    room.battleState,
    timedOutPlayerId,
    clearParalysisForPlayer(timedOutPlayerState),
  );
  const consecutiveTimeouts =
    room.consecutiveActionTimeouts[timedOutPlayerId] + 1;
  const event = createActionTimeoutEvent(room, timedOutPlayerId);
  let next = {
    ...room,
    battleState: clearedBattle,
    actionDeadlineAt: null,
    consecutiveActionTimeouts: {
      ...room.consecutiveActionTimeouts,
      [timedOutPlayerId]: consecutiveTimeouts,
    },
    turnEvents: [...room.turnEvents, event],
    nextTurnEventSequence: room.nextTurnEventSequence + 1,
    lastTurnStart: null,
  };

  if (consecutiveTimeouts >= MAX_CONSECUTIVE_ACTION_TIMEOUTS) {
    const forfeited = finishByForfeit(
      clearedBattle,
      timedOutPlayerId,
      END_REASONS.THREE_CONSECUTIVE_TIMEOUTS,
    );
    next = finishImmediately(next, forfeited.state, normalizedNow);
  } else {
    const nextPlayerId = getOpponentPlayerId(
      clearedBattle,
      timedOutPlayerId,
    );
    next = prepareNextTurn(
      next,
      clearedBattle,
      nextPlayerId,
      normalizedNow,
    );
  }

  return assertMatchRoomState({
    ...next,
    stateVersion: room.stateVersion + 1,
  });
}

function completeFinalSalvo(room) {
  assertMatchRoomState(room);
  assertRoomConnected(room);
  assertRoomPhase(
    room,
    ROOM_PHASES.FINAL_SALVO,
    "FINAL_SALVO_NOT_ACTIVE",
    "只有 FINAL_SALVO 阶段可以结束齐射展示。",
  );
  return assertMatchRoomState(
    bumpVersion(room, {
      roomPhase: ROOM_PHASES.FINISHED,
    }),
  );
}

function assertRollingState(room) {
  if (room.rolling === null) {
    return;
  }
  if (
    typeof room.rolling !== "object" ||
    !Array.isArray(room.rolling.rounds) ||
    room.rolling.rounds.length < 1 ||
    !room.seats.some((seat) => seat.playerId === room.rolling.firstPlayerId)
  ) {
    fail("INVALID_MATCH_ROOM_STATE", "服务器掷骰结果结构无效。");
  }
}

function assertMatchRoomState(room) {
  assertRoomState(room);
  assertRollingState(room);

  if (room.roomPhase === ROOM_PHASES.PLAYING) {
    assertBattleState(room.battleState);
    if (room.battleState.match.status !== MATCH_STATUS.PLAYING) {
      fail("INVALID_MATCH_ROOM_STATE", "PLAYING 房间必须具有进行中的战场。");
    }
    if (!Object.values(TURN_PHASES).includes(room.turnPhase)) {
      fail("INVALID_MATCH_ROOM_STATE", "PLAYING 房间缺少有效 turnPhase。", {
        turnPhase: room.turnPhase,
      });
    }
    if (!room.battleState.playerIds.includes(room.currentPlayerId)) {
      fail("INVALID_MATCH_ROOM_STATE", "当前玩家不属于战场。", {
        currentPlayerId: room.currentPlayerId,
      });
    }
    if (!Number.isInteger(room.turnNumber) || room.turnNumber < 0) {
      fail("INVALID_MATCH_ROOM_STATE", "回合计数必须是非负整数。", {
        turnNumber: room.turnNumber,
      });
    }
    if (
      room.turnPhase === TURN_PHASES.RESOLVING &&
      (!room.pendingAction || room.pendingAction.playerId !== room.currentPlayerId)
    ) {
      fail("INVALID_MATCH_ROOM_STATE", "RESOLVING 必须具有当前玩家的待结算行动。");
    }
    if (room.turnPhase !== TURN_PHASES.RESOLVING && room.pendingAction !== null) {
      fail("INVALID_MATCH_ROOM_STATE", "非 RESOLVING 阶段不能保留待结算行动。");
    }
    if (
      room.turnPhase === TURN_PHASES.ACTIVE &&
      room.connectionPhase === CONNECTION_PHASES.CONNECTED &&
      (!Number.isInteger(room.actionDeadlineAt) || room.actionDeadlineAt < 0)
    ) {
      fail("INVALID_MATCH_ROOM_STATE", "ACTIVE 回合必须具有行动绝对截止时间。");
    }
    if (
      room.turnPhase === TURN_PHASES.ACTIVE &&
      room.connectionPhase !== CONNECTION_PHASES.CONNECTED &&
      (room.actionDeadlineAt !== null || room.pausedTimer?.kind !== "action")
    ) {
      fail("INVALID_MATCH_ROOM_STATE", "断线暂停的 ACTIVE 回合必须冻结行动计时。");
    }
    if (
      room.turnPhase !== TURN_PHASES.ACTIVE &&
      room.actionDeadlineAt !== null
    ) {
      fail("INVALID_MATCH_ROOM_STATE", "非 ACTIVE 回合不能运行行动计时。", {
        turnPhase: room.turnPhase,
        actionDeadlineAt: room.actionDeadlineAt,
      });
    }
  } else if (
    [ROOM_PHASES.FINAL_SALVO, ROOM_PHASES.FINISHED].includes(room.roomPhase)
  ) {
    assertBattleState(room.battleState);
    if (room.battleState.match.status !== MATCH_STATUS.FINISHED) {
      fail("INVALID_MATCH_ROOM_STATE", "终局房间必须具有已结束的战场。");
    }
    if (
      room.roomPhase === ROOM_PHASES.FINAL_SALVO &&
      room.battleState.match.finalSalvo === null
    ) {
      fail("INVALID_MATCH_ROOM_STATE", "FINAL_SALVO 阶段缺少齐射结果。");
    }
  } else if (room.roomPhase === ROOM_PHASES.CLOSED) {
    if (room.battleState !== null) {
      assertBattleState(room.battleState);
      if (room.battleState.match.status !== MATCH_STATUS.FINISHED) {
        fail("INVALID_MATCH_ROOM_STATE", "已取消的正式对局必须具有已结束战场。");
      }
    }
  } else if (room.battleState !== null) {
    fail("INVALID_MATCH_ROOM_STATE", "正式对战开始前不能具有战场状态。", {
      roomPhase: room.roomPhase,
    });
  }
  if (room.roomPhase !== ROOM_PHASES.PLAYING && room.actionDeadlineAt !== null) {
    fail("INVALID_MATCH_ROOM_STATE", "PLAYING 之外不能保留行动截止时间。", {
      roomPhase: room.roomPhase,
      actionDeadlineAt: room.actionDeadlineAt,
    });
  }

  return room;
}

function createSafeBattleView(room, viewerId, nowMs) {
  if (room.battleState === null) {
    return null;
  }
  const view = createPlayerView(room.battleState, viewerId);
  const canAct =
    room.connectionPhase === CONNECTION_PHASES.CONNECTED &&
    room.roomPhase === ROOM_PHASES.PLAYING &&
    room.turnPhase === TURN_PHASES.ACTIVE &&
    room.currentPlayerId === viewerId &&
    !isDeadlineReached(room.actionDeadlineAt, nowMs);
  if (!canAct) {
    view.own.actionsLocked = true;
    view.own.actionAvailability = [];
  }
  return view;
}

function createRoomView(room, viewerId, nowMs = Date.now()) {
  assertMatchRoomState(room);
  const normalizedNow = normalizeServerTime(nowMs);
  const viewerSeat = getPlayerSeat(room, viewerId);
  return {
    roomCode: room.roomCode,
    stateVersion: room.stateVersion,
    roomPhase: room.roomPhase,
    turnPhase: room.turnPhase,
    connectionPhase: room.connectionPhase,
    deploymentsLocked: room.deploymentsLocked,
    seats: room.seats.map((seat) => ({
      playerId: seat.playerId,
      nickname: seat.nickname,
      online: seat.online,
      ready: seat.ready,
      autoPrepared: seat.autoPrepared,
    })),
    own: {
      playerId: viewerSeat.playerId,
      nickname: viewerSeat.nickname,
      deployment: clone(viewerSeat.deployment),
      consecutiveActionTimeouts:
        room.consecutiveActionTimeouts[viewerId],
    },
    rematch: {
      ownRequested: room.rematchRequestedByPlayer[viewerId],
      opponentRequested: room.seats.some(
        (seat) =>
          seat.playerId !== viewerId &&
          room.rematchRequestedByPlayer[seat.playerId],
      ),
      requestedPlayerIds: room.seats
        .filter((seat) => room.rematchRequestedByPlayer[seat.playerId])
        .map((seat) => seat.playerId),
    },
    matchSummary: {
      startedAt: room.matchStartedAt,
      finishedAt: room.matchFinishedAt,
      durationMs: room.matchStartedAt === null
        ? null
        : Math.max(
            0,
            (room.matchFinishedAt ?? normalizedNow) - room.matchStartedAt,
          ),
      turnCount: room.turnNumber,
    },
    serverNow: normalizedNow,
    deadlines: {
      deploymentDeadlineAt: room.deploymentDeadlineAt,
      actionDeadlineAt: room.actionDeadlineAt,
      reconnectDeadlineAtByPlayer: Object.fromEntries(
        room.seats
          .filter((seat) => seat.reconnectDeadlineAt !== null)
          .map((seat) => [seat.playerId, seat.reconnectDeadlineAt]),
      ),
    },
    connection: {
      offlinePlayerIds: room.seats
        .filter((seat) => !seat.online)
        .map((seat) => seat.playerId),
      pausedTimer: clone(room.pausedTimer),
    },
    rolling: clone(room.rolling),
    turn: room.roomPhase === ROOM_PHASES.PLAYING
      ? {
          currentPlayerId: room.currentPlayerId,
          turnNumber: room.turnNumber,
          canAct:
            room.connectionPhase === CONNECTION_PHASES.CONNECTED &&
            room.turnPhase === TURN_PHASES.ACTIVE &&
            room.currentPlayerId === viewerId &&
            !isDeadlineReached(room.actionDeadlineAt, normalizedNow),
        }
      : null,
    battle: createSafeBattleView(room, viewerId, normalizedNow),
    latestResolution: room.lastResolutionByPlayer
      ? clone(room.lastResolutionByPlayer[viewerId] ?? null)
      : null,
    turnEvents: clone(room.turnEvents),
    systemEvents: clone(room.systemEvents),
    closedReason: room.closedReason,
  };
}

function createRoomViewsByPlayer(room, nowMs = Date.now()) {
  assertMatchRoomState(room);
  const normalizedNow = normalizeServerTime(nowMs);
  return Object.fromEntries(
    room.seats.map((seat) => [
      seat.playerId,
      createRoomView(room, seat.playerId, normalizedNow),
    ]),
  );
}

module.exports = {
  MAX_ROLL_ROUNDS,
  TURN_PHASES,
  assertMatchRoomState,
  beginPlayerAction,
  completeAutomaticTurnSkip,
  completeFinalSalvo,
  completePlayerAction,
  createRoomView,
  createRoomViewsByPlayer,
  determineFirstPlayer,
  processActionTimeout,
  rollDie,
  startPlaying,
};
