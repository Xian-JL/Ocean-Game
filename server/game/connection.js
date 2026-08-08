"use strict";

const {
  MATCH_STATUS,
  assertBattleState,
  getOpponentPlayerId,
} = require("./battle-state");
const {
  END_REASONS,
  MATCH_OUTCOMES,
  finishByForfeit,
} = require("./endgame");
const { RuleValidationError } = require("./errors");
const { TURN_PHASES, assertMatchRoomState } = require("./match");
const {
  CONNECTION_PHASES,
  ROOM_PHASES,
  getPlayerSeat,
} = require("./room");
const { normalizeServerTime } = require("./timing");

const RECONNECT_DURATION_MS = 120_000;

const PAUSED_TIMER_KINDS = Object.freeze({
  DEPLOYMENT: "deployment",
  ACTION: "action",
});

const PRE_MATCH_PHASES = new Set([
  ROOM_PHASES.WAITING,
  ROOM_PHASES.DEPLOYING,
  ROOM_PHASES.ROLLING,
]);

const DISCONNECT_ADJUDICATION_PHASES = new Set([
  ...PRE_MATCH_PHASES,
  ROOM_PHASES.PLAYING,
  ROOM_PHASES.FINAL_SALVO,
]);

function fail(code, message, details = {}) {
  throw new RuleValidationError(code, message, details);
}

function deriveConnectionPhase(seats) {
  const offlineCount = seats.filter((seat) => !seat.online).length;
  if (offlineCount === 0) {
    return CONNECTION_PHASES.CONNECTED;
  }
  if (seats.length === 2 && offlineCount === seats.length) {
    return CONNECTION_PHASES.PAUSED_BOTH_OFFLINE;
  }
  return CONNECTION_PHASES.PAUSED_ONE_OFFLINE;
}

function replaceSeat(room, playerId, replacement) {
  return room.seats.map((seat) =>
    seat.playerId === playerId ? replacement : seat,
  );
}

function captureRunningTimer(room, nowMs) {
  if (room.roomPhase === ROOM_PHASES.DEPLOYING) {
    return {
      pausedTimer: {
        kind: PAUSED_TIMER_KINDS.DEPLOYMENT,
        remainingMs: Math.max(0, room.deploymentDeadlineAt - nowMs),
      },
      deploymentDeadlineAt: null,
      actionDeadlineAt: room.actionDeadlineAt,
    };
  }
  if (
    room.roomPhase === ROOM_PHASES.PLAYING &&
    room.turnPhase === TURN_PHASES.ACTIVE
  ) {
    return {
      pausedTimer: {
        kind: PAUSED_TIMER_KINDS.ACTION,
        remainingMs: Math.max(0, room.actionDeadlineAt - nowMs),
      },
      deploymentDeadlineAt: room.deploymentDeadlineAt,
      actionDeadlineAt: null,
    };
  }
  return {
    pausedTimer: null,
    deploymentDeadlineAt: room.deploymentDeadlineAt,
    actionDeadlineAt: room.actionDeadlineAt,
  };
}

function disconnectPlayer(room, playerId, nowMs = Date.now()) {
  assertMatchRoomState(room);
  const normalizedNow = normalizeServerTime(nowMs);
  if (room.roomPhase === ROOM_PHASES.CLOSED) {
    fail("ROOM_CLOSED", "房间已经关闭，不能再记录断线。", {
      roomCode: room.roomCode,
    });
  }
  const seat = getPlayerSeat(room, playerId);
  if (!seat.online) {
    fail("PLAYER_ALREADY_OFFLINE", "该玩家已经处于离线状态。", {
      playerId,
    });
  }

  const shouldAdjudicate = DISCONNECT_ADJUDICATION_PHASES.has(
    room.roomPhase,
  );
  const offlineSeat = {
    ...seat,
    online: false,
    disconnectedAt: normalizedNow,
    reconnectDeadlineAt: shouldAdjudicate
      ? normalizedNow + RECONNECT_DURATION_MS
      : null,
  };
  const seats = replaceSeat(room, playerId, offlineSeat);
  const timerChanges = room.connectionPhase === CONNECTION_PHASES.CONNECTED
    ? captureRunningTimer(room, normalizedNow)
    : {
        pausedTimer: room.pausedTimer,
        deploymentDeadlineAt: room.deploymentDeadlineAt,
        actionDeadlineAt: room.actionDeadlineAt,
      };

  return assertMatchRoomState({
    ...room,
    ...timerChanges,
    seats,
    connectionPhase: deriveConnectionPhase(seats),
    stateVersion: room.stateVersion + 1,
  });
}

function reconnectPlayer(room, playerId, nowMs = Date.now()) {
  assertMatchRoomState(room);
  const normalizedNow = normalizeServerTime(nowMs);
  if (room.roomPhase === ROOM_PHASES.CLOSED) {
    fail("ROOM_CLOSED", "房间已经关闭，不能恢复原座位。", {
      roomCode: room.roomCode,
    });
  }
  const seat = getPlayerSeat(room, playerId);
  if (seat.online) {
    fail("SEAT_ALREADY_ONLINE", "该座位当前已经在线。", {
      playerId,
    });
  }
  if (
    seat.reconnectDeadlineAt !== null &&
    normalizedNow >= seat.reconnectDeadlineAt
  ) {
    fail(
      "RECONNECT_DEADLINE_EXPIRED",
      "该座位的 120 秒重连时限已经结束。",
      { reconnectDeadlineAt: seat.reconnectDeadlineAt },
    );
  }

  const onlineSeat = {
    ...seat,
    online: true,
    disconnectedAt: null,
    reconnectDeadlineAt: null,
  };
  const seats = replaceSeat(room, playerId, onlineSeat);
  const connectionPhase = deriveConnectionPhase(seats);
  const allOnline = connectionPhase === CONNECTION_PHASES.CONNECTED;
  let deploymentDeadlineAt = room.deploymentDeadlineAt;
  let actionDeadlineAt = room.actionDeadlineAt;
  let pausedTimer = room.pausedTimer;

  if (allOnline && pausedTimer !== null) {
    if (pausedTimer.kind === PAUSED_TIMER_KINDS.DEPLOYMENT) {
      deploymentDeadlineAt = normalizedNow + pausedTimer.remainingMs;
    } else if (pausedTimer.kind === PAUSED_TIMER_KINDS.ACTION) {
      actionDeadlineAt = normalizedNow + pausedTimer.remainingMs;
    }
    pausedTimer = null;
  }

  return assertMatchRoomState({
    ...room,
    seats,
    connectionPhase,
    pausedTimer,
    deploymentDeadlineAt,
    actionDeadlineAt,
    stateVersion: room.stateVersion + 1,
  });
}

function offlineSeats(room) {
  return room.seats.filter((seat) => !seat.online);
}

function hasExpired(seat, nowMs) {
  return seat.reconnectDeadlineAt !== null &&
    nowMs >= seat.reconnectDeadlineAt;
}

function isDisconnectResolutionDue(room, nowMs = Date.now()) {
  assertMatchRoomState(room);
  const normalizedNow = normalizeServerTime(nowMs);
  if (!DISCONNECT_ADJUDICATION_PHASES.has(room.roomPhase)) {
    return false;
  }
  const offline = offlineSeats(room);
  if (offline.length === 0) {
    return false;
  }
  const everyoneOffline = offline.length === room.seats.length;
  return everyoneOffline
    ? offline.every((seat) => hasExpired(seat, normalizedNow))
    : offline.some((seat) => hasExpired(seat, normalizedNow));
}

function clearReconnectDeadlines(seats) {
  return seats.map((seat) => ({
    ...seat,
    reconnectDeadlineAt: null,
  }));
}

function appendSystemEvent(room, kind, message, playerIds) {
  return {
    systemEvents: [
      ...room.systemEvents,
      {
        sequence: room.nextSystemEventSequence,
        kind,
        playerIds,
        message,
      },
    ],
    nextSystemEventSequence: room.nextSystemEventSequence + 1,
  };
}

function createCanceledBattleState(battleState) {
  assertBattleState(battleState);
  return {
    ...battleState,
    match: {
      status: MATCH_STATUS.FINISHED,
      result: {
        outcome: MATCH_OUTCOMES.CANCELED,
        winnerId: null,
        loserId: null,
        reason: END_REASONS.BOTH_DISCONNECTED,
        trigger: { kind: "connection" },
      },
      finalSalvo: battleState.match.finalSalvo,
    },
  };
}

function closeRoomForDisconnect(room, reason, message, finishedAt) {
  const playerIds = offlineSeats(room).map((seat) => seat.playerId);
  const battleState = room.battleState === null
    ? null
    : createCanceledBattleState(room.battleState);
  return assertMatchRoomState({
    ...room,
    ...appendSystemEvent(room, reason, message, playerIds),
    stateVersion: room.stateVersion + 1,
    roomPhase: ROOM_PHASES.CLOSED,
    turnPhase: null,
    seats: clearReconnectDeadlines(room.seats),
    deploymentsLocked: room.deploymentsLocked,
    deploymentDeadlineAt: null,
    actionDeadlineAt: null,
    pausedTimer: null,
    battleState,
    currentPlayerId: null,
    pendingAction: null,
    matchFinishedAt: room.matchStartedAt === null ? null : finishedAt,
    closedReason: reason,
  });
}

function createDisconnectForfeitBattleState(battleState, loserId) {
  assertBattleState(battleState);
  if (battleState.match.status === MATCH_STATUS.PLAYING) {
    return finishByForfeit(
      battleState,
      loserId,
      END_REASONS.DISCONNECT_TIMEOUT,
    ).state;
  }

  const winnerId = getOpponentPlayerId(battleState, loserId);
  return {
    ...battleState,
    match: {
      status: MATCH_STATUS.FINISHED,
      result: {
        outcome: MATCH_OUTCOMES.WIN,
        winnerId,
        loserId,
        reason: END_REASONS.DISCONNECT_TIMEOUT,
        trigger: { kind: "forfeit" },
      },
      finalSalvo: battleState.match.finalSalvo,
    },
  };
}

function finishRoomByDisconnectForfeit(room, loserId, finishedAt) {
  const battleState = createDisconnectForfeitBattleState(
    room.battleState,
    loserId,
  );
  return assertMatchRoomState({
    ...room,
    ...appendSystemEvent(
      room,
      END_REASONS.DISCONNECT_TIMEOUT,
      "玩家未在 120 秒内重连，断线方判负",
      [loserId],
    ),
    stateVersion: room.stateVersion + 1,
    roomPhase: ROOM_PHASES.FINISHED,
    turnPhase: null,
    seats: clearReconnectDeadlines(room.seats),
    deploymentDeadlineAt: null,
    actionDeadlineAt: null,
    pausedTimer: null,
    battleState,
    currentPlayerId: null,
    pendingAction: null,
    matchFinishedAt: finishedAt,
  });
}

function processDisconnectTimeout(room, nowMs = Date.now()) {
  assertMatchRoomState(room);
  const normalizedNow = normalizeServerTime(nowMs);
  if (!isDisconnectResolutionDue(room, normalizedNow)) {
    fail(
      "DISCONNECT_DEADLINE_NOT_REACHED",
      "当前尚未满足断线关闭或判负条件。",
    );
  }

  const offline = offlineSeats(room);
  if (offline.length === room.seats.length) {
    return closeRoomForDisconnect(
      room,
      PRE_MATCH_PHASES.has(room.roomPhase)
        ? "disconnect_timeout_before_match"
        : END_REASONS.BOTH_DISCONNECTED,
      PRE_MATCH_PHASES.has(room.roomPhase)
        ? "玩家未在 120 秒内返回，房间已关闭"
        : "双方均未在各自的 120 秒时限内返回，对局取消",
      normalizedNow,
    );
  }

  const expiredSeat = offline.find((seat) => hasExpired(seat, normalizedNow));
  if (PRE_MATCH_PHASES.has(room.roomPhase)) {
    return closeRoomForDisconnect(
      room,
      "disconnect_timeout_before_match",
      "玩家未在 120 秒内返回，房间已关闭",
      normalizedNow,
    );
  }
  return finishRoomByDisconnectForfeit(
    room,
    expiredSeat.playerId,
    normalizedNow,
  );
}

module.exports = {
  DISCONNECT_ADJUDICATION_PHASES,
  PAUSED_TIMER_KINDS,
  PRE_MATCH_PHASES,
  RECONNECT_DURATION_MS,
  deriveConnectionPhase,
  disconnectPlayer,
  isDisconnectResolutionDue,
  processDisconnectTimeout,
  reconnectPlayer,
};
