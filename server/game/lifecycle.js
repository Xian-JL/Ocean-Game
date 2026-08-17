"use strict";

const {
  RECONNECT_DURATION_MS,
  deriveConnectionPhase,
} = require("./connection");
const { END_REASONS, finishByForfeit } = require("./endgame");
const { RuleValidationError } = require("./errors");
const {
  TURN_PHASES,
  assertMatchRoomState,
  getRemainingTurnTargetPlayerIds,
  prepareNextTurn,
} = require("./match");
const {
  clearParalysisForPlayer,
  getBattlePlayerState,
  getNextActivePlayerId,
  replaceBattlePlayerState,
} = require("./battle-state");
const {
  CONNECTION_PHASES,
  ROOM_MODES,
  ROOM_PHASES,
  assertRoomConnected,
  getPlayerSeat,
} = require("./room");
const {
  DEPLOYMENT_DURATION_MS,
  createDeadline,
  normalizeServerTime,
} = require("./timing");

function fail(code, message, details = {}) {
  throw new RuleValidationError(code, message, details);
}

function falseByPlayer(seats) {
  return Object.fromEntries(seats.map((seat) => [seat.playerId, false]));
}

function assertFinishedRoom(room, code, message) {
  assertMatchRoomState(room);
  if (room.roomPhase !== ROOM_PHASES.FINISHED) {
    fail(code, message, { roomPhase: room.roomPhase });
  }
}

function assertOnlineSeat(room, playerId) {
  const seat = getPlayerSeat(room, playerId);
  if (!seat.online) {
    fail("PLAYER_OFFLINE", "离线席位不能主动执行该操作。", { playerId });
  }
  return seat;
}

function surrenderMatch(room, playerId, nowMs = Date.now()) {
  assertMatchRoomState(room);
  const normalizedNow = normalizeServerTime(nowMs);
  if (room.roomPhase !== ROOM_PHASES.PLAYING) {
    fail("SURRENDER_NOT_ALLOWED", "只有正式对局进行中可以投降。", {
      roomPhase: room.roomPhase,
    });
  }
  assertOnlineSeat(room, playerId);
  if (room.turnPhase === TURN_PHASES.RESOLVING) {
    fail(
      "ACTION_RESOLUTION_PENDING",
      "已接受的行动必须先完成结算，再处理投降。",
    );
  }

  const forfeited = finishByForfeit(
    room.battleState,
    playerId,
    END_REASONS.SURRENDER,
  );
  const event = {
    sequence: room.nextTurnEventSequence,
    kind: "surrender",
    playerId,
    message: "玩家主动投降",
  };
  const seats = room.seats.map((seat) => ({
    ...seat,
    reconnectDeadlineAt: null,
  }));

  if (!forfeited.ended) {
    let next = {
      ...room,
      stateVersion: room.stateVersion + 1,
      battleState: forfeited.state,
      pendingAction: null,
      turnEvents: [...room.turnEvents, event],
      nextTurnEventSequence: room.nextTurnEventSequence + 1,
    };

    const currentPlayerEliminated = room.currentPlayerId === playerId;
    const remainingTargets = currentPlayerEliminated
      ? []
      : getRemainingTurnTargetPlayerIds(
          forfeited.state,
          room.turnActionState,
        );

    if (!currentPlayerEliminated && remainingTargets.length > 0) {
      return assertMatchRoomState(next);
    }

    let battleState = forfeited.state;
    if (!currentPlayerEliminated) {
      const currentState = getBattlePlayerState(battleState, room.currentPlayerId);
      battleState = replaceBattlePlayerState(
        battleState,
        room.currentPlayerId,
        clearParalysisForPlayer(currentState),
      );
    }
    const nextPlayerId = getNextActivePlayerId(
      battleState,
      currentPlayerEliminated ? playerId : room.currentPlayerId,
    );
    next = prepareNextTurn(next, battleState, nextPlayerId, normalizedNow);
    return assertMatchRoomState(next);
  }

  return assertMatchRoomState({
    ...room,
    stateVersion: room.stateVersion + 1,
    roomPhase: ROOM_PHASES.FINISHED,
    turnPhase: null,
    seats,
    deploymentDeadlineAt: null,
    actionDeadlineAt: null,
    pausedTimer: null,
    battleState: forfeited.state,
    currentPlayerId: null,
    turnActionState: null,
    pendingAction: null,
    lastTurnStart: null,
    matchFinishedAt: normalizedNow,
    rematchRequestedByPlayer: falseByPlayer(seats),
    turnEvents: [...room.turnEvents, event],
    nextTurnEventSequence: room.nextTurnEventSequence + 1,
  });
}

function requestRematch(room, playerId) {
  assertFinishedRoom(
    room,
    "REMATCH_NOT_ALLOWED",
    "只有本局结算完成后可以申请再来一局。",
  );
  assertOnlineSeat(room, playerId);
  if (room.rematchRequestedByPlayer[playerId]) {
    fail("REMATCH_ALREADY_REQUESTED", "该玩家已经申请再来一局。", {
      playerId,
    });
  }

  return assertMatchRoomState({
    ...room,
    stateVersion: room.stateVersion + 1,
    rematchRequestedByPlayer: {
      ...room.rematchRequestedByPlayer,
      [playerId]: true,
    },
  });
}

function cancelRematch(room, playerId) {
  assertFinishedRoom(
    room,
    "REMATCH_CANCEL_NOT_ALLOWED",
    "只有本局结算完成后可以取消再来一局申请。",
  );
  assertOnlineSeat(room, playerId);
  if (!room.rematchRequestedByPlayer[playerId]) {
    fail("REMATCH_NOT_REQUESTED", "该玩家尚未申请再来一局。", {
      playerId,
    });
  }

  return assertMatchRoomState({
    ...room,
    stateVersion: room.stateVersion + 1,
    rematchRequestedByPlayer: {
      ...room.rematchRequestedByPlayer,
      [playerId]: false,
    },
  });
}

function startRematch(room, nowMs = Date.now()) {
  assertFinishedRoom(
    room,
    "REMATCH_NOT_ALLOWED",
    "只有本局结算完成后可以开始再来一局。",
  );
  assertRoomConnected(room);
  const normalizedNow = normalizeServerTime(nowMs);
  if (
    room.seats.length !== room.maxPlayers ||
    room.seats.some(
      (seat) => !room.rematchRequestedByPlayer[seat.playerId],
    )
  ) {
    fail("REMATCH_CONFIRMATION_REQUIRED", "所有玩家都确认后才能开始再来一局。");
  }

  const seats = room.seats.map((seat) => ({
    ...seat,
    deployment: null,
    ready: false,
    autoPrepared: false,
    disconnectedAt: null,
    reconnectDeadlineAt: null,
  }));

  return assertMatchRoomState({
    ...room,
    stateVersion: room.stateVersion + 1,
    roomPhase: ROOM_PHASES.DEPLOYING,
    turnPhase: null,
    connectionPhase: CONNECTION_PHASES.CONNECTED,
    pausedTimer: null,
    seats,
    deploymentsLocked: false,
    deploymentDeadlineAt: createDeadline(
      normalizedNow,
      DEPLOYMENT_DURATION_MS,
    ),
    actionDeadlineAt: null,
    consecutiveActionTimeouts: Object.fromEntries(
      seats.map((seat) => [seat.playerId, 0]),
    ),
    rematchRequestedByPlayer: falseByPlayer(seats),
    rolling: null,
    battleState: null,
    currentPlayerId: null,
    turnNumber: 0,
    turnActionState: null,
    matchStartedAt: null,
    matchFinishedAt: null,
    pendingAction: null,
    lastResolutionByPlayer: null,
    lastTurnStart: null,
    turnEvents: [],
    nextTurnEventSequence: 1,
    systemEvents: [],
    nextSystemEventSequence: 1,
    closedReason: null,
  });
}

function leaveFinishedRoom(room, playerId, nowMs = Date.now()) {
  assertFinishedRoom(
    room,
    "LEAVE_NOT_ALLOWED",
    "只有本局结算完成后可以直接离开正式对局。",
  );
  assertOnlineSeat(room, playerId);
  const normalizedNow = normalizeServerTime(nowMs);
  if (room.roomMode === ROOM_MODES.BOT_DUEL) {
    return assertMatchRoomState({
      ...room,
      stateVersion: room.stateVersion + 1,
      roomPhase: ROOM_PHASES.CLOSED,
      connectionPhase: CONNECTION_PHASES.CONNECTED,
      closedReason: "human_left_bot_match",
      actionDeadlineAt: null,
      deploymentDeadlineAt: null,
      pausedTimer: null,
      seats: room.seats.map((seat) => ({
        ...seat,
        disconnectedAt: null,
        reconnectDeadlineAt: null,
      })),
    });
  }
  const remaining = room.seats.filter((seat) => seat.playerId !== playerId);
  if (remaining.length < 1) {
    fail("INVALID_ROOM_STATE", "赛后离开前房间必须保留至少一名玩家。");
  }

  const seats = remaining.map((seat) => ({
    ...seat,
    deployment: null,
    ready: false,
    autoPrepared: false,
    disconnectedAt: seat.online ? null : normalizedNow,
    reconnectDeadlineAt: seat.online
      ? null
      : normalizedNow + RECONNECT_DURATION_MS,
  }));
  const ownerPlayerId = seats.some((seat) => seat.playerId === room.ownerPlayerId)
    ? room.ownerPlayerId
    : seats[0].playerId;

  return assertMatchRoomState({
    ...room,
    stateVersion: room.stateVersion + 1,
    roomPhase: ROOM_PHASES.WAITING,
    turnPhase: null,
    connectionPhase: deriveConnectionPhase(seats),
    pausedTimer: null,
    ownerPlayerId,
    seats,
    deploymentsLocked: false,
    deploymentDeadlineAt: null,
    actionDeadlineAt: null,
    consecutiveActionTimeouts: Object.fromEntries(
      seats.map((seat) => [seat.playerId, 0]),
    ),
    rematchRequestedByPlayer: falseByPlayer(seats),
    rolling: null,
    battleState: null,
    currentPlayerId: null,
    turnNumber: 0,
    turnActionState: null,
    matchStartedAt: null,
    matchFinishedAt: null,
    pendingAction: null,
    lastResolutionByPlayer: null,
    lastTurnStart: null,
    turnEvents: [],
    nextTurnEventSequence: 1,
    systemEvents: [],
    nextSystemEventSequence: 1,
    closedReason: null,
  });
}

module.exports = {
  cancelRematch,
  leaveFinishedRoom,
  requestRematch,
  startRematch,
  surrenderMatch,
};
