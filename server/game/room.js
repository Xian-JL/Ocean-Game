"use strict";

const { assertValidDeployment } = require("./deployment");
const { RuleValidationError } = require("./errors");
const { generateRandomDeployment } = require("./random-deployment");
const {
  DEPLOYMENT_DURATION_MS,
  createDeadline,
  isDeadlineReached,
  normalizeServerTime,
} = require("./timing");

const ROOM_PHASES = Object.freeze({
  WAITING: "WAITING",
  DEPLOYING: "DEPLOYING",
  ROLLING: "ROLLING",
  PLAYING: "PLAYING",
  FINAL_SALVO: "FINAL_SALVO",
  FINISHED: "FINISHED",
  CLOSED: "CLOSED",
});

const CONNECTION_PHASES = Object.freeze({
  CONNECTED: "CONNECTED",
  PAUSED_ONE_OFFLINE: "PAUSED_ONE_OFFLINE",
  PAUSED_BOTH_OFFLINE: "PAUSED_BOTH_OFFLINE",
});

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_PATTERN = new RegExp(
  `^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`,
);
const PLAYER_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function clone(value) {
  return structuredClone(value);
}

function fail(code, message, details = {}) {
  throw new RuleValidationError(code, message, details);
}

function normalizeNickname(nickname) {
  if (typeof nickname !== "string") {
    fail("INVALID_NICKNAME", "昵称必须是字符串。", { nickname });
  }

  const normalized = nickname.trim();
  const characterCount = Array.from(normalized).length;
  if (characterCount < 1 || characterCount > 12) {
    fail("INVALID_NICKNAME", "昵称去除首尾空白后必须为 1～12 个字符。", {
      nickname,
      characterCount,
    });
  }
  return normalized;
}

function normalizeRoomCode(roomCode) {
  if (typeof roomCode !== "string") {
    fail("INVALID_ROOM_CODE", "房间码必须是 6 位服务器允许字符。", {
      roomCode,
    });
  }

  const normalized = roomCode.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(normalized)) {
    fail("INVALID_ROOM_CODE", "房间码必须是 6 位服务器允许字符。", {
      roomCode,
      allowedCharacters: ROOM_CODE_ALPHABET,
    });
  }
  return normalized;
}

function assertPlayerId(playerId) {
  if (typeof playerId !== "string" || !PLAYER_ID_PATTERN.test(playerId)) {
    fail(
      "INVALID_PLAYER_ID",
      "玩家 ID 必须是 1～64 位字母、数字、下划线或连字符。",
      { playerId },
    );
  }
  return playerId;
}

function createSeat(playerId, nickname) {
  return {
    playerId: assertPlayerId(playerId),
    nickname: normalizeNickname(nickname),
    online: true,
    disconnectedAt: null,
    reconnectDeadlineAt: null,
    deployment: null,
    ready: false,
    autoPrepared: false,
  };
}

function bumpVersion(room, changes) {
  return {
    ...room,
    ...changes,
    stateVersion: room.stateVersion + 1,
  };
}

function createRoomState({ roomCode, playerId, nickname, maxPlayers = 2 }) {
  if (![2, 3].includes(maxPlayers)) {
    fail("INVALID_PLAYER_COUNT", "房间人数只能是 2 或 3。", { maxPlayers });
  }
  const ownerSeat = createSeat(playerId, nickname);
  return {
    roomCode: normalizeRoomCode(roomCode),
    stateVersion: 1,
    roomPhase: ROOM_PHASES.WAITING,
    turnPhase: null,
    connectionPhase: CONNECTION_PHASES.CONNECTED,
    pausedTimer: null,
    ownerPlayerId: ownerSeat.playerId,
    maxPlayers,
    seats: [ownerSeat],
    deploymentsLocked: false,
    deploymentDeadlineAt: null,
    actionDeadlineAt: null,
    consecutiveActionTimeouts: {
      [ownerSeat.playerId]: 0,
    },
    rematchRequestedByPlayer: {
      [ownerSeat.playerId]: false,
    },
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
  };
}

function getPlayerSeat(room, playerId) {
  assertPlayerId(playerId);
  const seat = room.seats.find((candidate) => candidate.playerId === playerId);
  if (!seat) {
    fail("PLAYER_NOT_IN_ROOM", "该玩家不属于当前房间。", { playerId });
  }
  return seat;
}

function getOpponentSeat(room, playerId) {
  getPlayerSeat(room, playerId);
  return room.seats.find((candidate) => candidate.playerId !== playerId) ?? null;
}

function replaceSeat(room, playerId, nextSeat) {
  getPlayerSeat(room, playerId);
  return room.seats.map((seat) =>
    seat.playerId === playerId ? nextSeat : seat,
  );
}

function assertPhase(room, expectedPhase, code, message) {
  if (room.roomPhase !== expectedPhase) {
    fail(code, message, {
      expectedPhase,
      actualPhase: room.roomPhase,
    });
  }
}

function assertRoomConnected(room) {
  if (room.connectionPhase !== CONNECTION_PHASES.CONNECTED) {
    fail(
      "ROOM_PAUSED",
      "有玩家处于断线状态，当前房间操作已暂停。",
      { connectionPhase: room.connectionPhase },
    );
  }
  return room;
}

function joinRoomState(room, { playerId, nickname }, nowMs = Date.now()) {
  assertRoomState(room);
  assertRoomConnected(room);
  const normalizedNow = normalizeServerTime(nowMs);
  assertPhase(
    room,
    ROOM_PHASES.WAITING,
    "ROOM_NOT_JOINABLE",
    "房间已满或对局已经开始，不能加入。",
  );
  if (room.seats.length >= room.maxPlayers) {
    fail("ROOM_FULL", "房间席位已经坐满。", {
      seatCount: room.seats.length,
      maxPlayers: room.maxPlayers,
    });
  }
  if (room.seats.some((seat) => seat.playerId === playerId)) {
    fail("PLAYER_ALREADY_IN_ROOM", "该玩家已经在房间中。", { playerId });
  }

  const joinedSeat = createSeat(playerId, nickname);
  const seats = [...room.seats, joinedSeat];
  const full = seats.length === room.maxPlayers;
  const next = bumpVersion(room, {
    seats,
    roomPhase: full ? ROOM_PHASES.DEPLOYING : ROOM_PHASES.WAITING,
    deploymentDeadlineAt: full
      ? createDeadline(normalizedNow, DEPLOYMENT_DURATION_MS)
      : null,
    consecutiveActionTimeouts: {
      ...room.consecutiveActionTimeouts,
      [joinedSeat.playerId]: 0,
    },
    rematchRequestedByPlayer: {
      ...room.rematchRequestedByPlayer,
      [joinedSeat.playerId]: false,
    },
  });
  return assertRoomState(next);
}

function assertDeploymentWindowOpen(room, nowMs) {
  const normalizedNow = normalizeServerTime(nowMs);
  if (isDeadlineReached(room.deploymentDeadlineAt, normalizedNow)) {
    fail(
      "DEPLOYMENT_DEADLINE_EXPIRED",
      "部署时间已经结束，等待服务器自动完成部署。",
      {
        deadlineAt: room.deploymentDeadlineAt,
        nowMs: normalizedNow,
      },
    );
  }
  return normalizedNow;
}

function submitDeployment(room, playerId, deployment, nowMs = Date.now()) {
  assertRoomState(room);
  assertRoomConnected(room);
  assertPhase(
    room,
    ROOM_PHASES.DEPLOYING,
    "DEPLOYMENT_NOT_ALLOWED",
    "只有部署阶段可以提交舰队部署。",
  );
  if (room.deploymentsLocked) {
    fail("DEPLOYMENT_LOCKED", "所有玩家的部署已经锁定。", { playerId });
  }
  assertDeploymentWindowOpen(room, nowMs);

  const seat = getPlayerSeat(room, playerId);
  if (seat.ready) {
    fail("READY_DEPLOYMENT_LOCKED", "玩家已准备，必须先取消准备才能修改部署。", {
      playerId,
    });
  }

  const normalizedDeployment = assertValidDeployment(deployment);
  const nextSeat = {
    ...seat,
    deployment: clone(normalizedDeployment),
  };
  return assertRoomState(
    bumpVersion(room, {
      seats: replaceSeat(room, playerId, nextSeat),
    }),
  );
}

function setPlayerReady(room, playerId, nowMs = Date.now()) {
  assertRoomState(room);
  assertRoomConnected(room);
  assertPhase(
    room,
    ROOM_PHASES.DEPLOYING,
    "READY_NOT_ALLOWED",
    "只有部署阶段可以准备。",
  );
  if (room.deploymentsLocked) {
    fail("DEPLOYMENT_LOCKED", "所有玩家的部署已经锁定。", { playerId });
  }
  assertDeploymentWindowOpen(room, nowMs);

  const seat = getPlayerSeat(room, playerId);
  if (seat.ready) {
    fail("PLAYER_ALREADY_READY", "该玩家已经准备。", { playerId });
  }
  if (seat.deployment === null) {
    fail("DEPLOYMENT_REQUIRED", "提交完整合法部署后才能准备。", {
      playerId,
    });
  }

  // 准备是信任边界：即使部署先前通过，也必须在此再次完整校验。
  const normalizedDeployment = assertValidDeployment(seat.deployment);
  const readySeat = {
    ...seat,
    deployment: clone(normalizedDeployment),
    ready: true,
    autoPrepared: false,
  };
  const seats = replaceSeat(room, playerId, readySeat);
  const allReady = seats.length === room.maxPlayers && seats.every((candidate) => candidate.ready);
  const next = bumpVersion(room, {
    seats,
    roomPhase: allReady ? ROOM_PHASES.ROLLING : ROOM_PHASES.DEPLOYING,
    deploymentsLocked: allReady,
    deploymentDeadlineAt: allReady ? null : room.deploymentDeadlineAt,
  });
  return assertRoomState(next);
}

function cancelPlayerReady(room, playerId, nowMs = Date.now()) {
  assertRoomState(room);
  assertRoomConnected(room);
  assertPhase(
    room,
    ROOM_PHASES.DEPLOYING,
    "CANCEL_READY_NOT_ALLOWED",
    "只有其他玩家均尚未准备时才能取消准备。",
  );
  assertDeploymentWindowOpen(room, nowMs);

  const seat = getPlayerSeat(room, playerId);
  if (!seat.ready) {
    fail("PLAYER_NOT_READY", "该玩家尚未准备。", { playerId });
  }
  if (room.seats.some((candidate) => candidate.playerId !== playerId && candidate.ready)) {
    fail("OPPONENT_ALREADY_READY", "已有其他玩家准备，不能取消准备。", {
      playerId,
    });
  }

  const nextSeat = { ...seat, ready: false };
  return assertRoomState(
    bumpVersion(room, {
      seats: replaceSeat(room, playerId, nextSeat),
    }),
  );
}

function leaveRoomBeforeMatch(room, playerId) {
  assertRoomState(room);
  getPlayerSeat(room, playerId);
  if (
    ![
      ROOM_PHASES.WAITING,
      ROOM_PHASES.DEPLOYING,
      ROOM_PHASES.ROLLING,
    ].includes(room.roomPhase)
  ) {
    fail(
      "LEAVE_NOT_ALLOWED",
      "当前阶段不能直接离开；正式对局中必须先完成投降或终局结算。",
      { roomPhase: room.roomPhase },
    );
  }

  return assertRoomState(
    bumpVersion(room, {
      roomPhase: ROOM_PHASES.CLOSED,
      turnPhase: null,
      deploymentDeadlineAt: null,
      actionDeadlineAt: null,
      pausedTimer: null,
      seats: room.seats.map((seat) => ({
        ...seat,
        reconnectDeadlineAt: null,
      })),
      closedReason: "player_left_before_match",
    }),
  );
}

function completeDeploymentTimeout(
  room,
  nowMs = Date.now(),
  deploymentFactory = () => generateRandomDeployment(),
) {
  assertRoomState(room);
  assertRoomConnected(room);
  assertPhase(
    room,
    ROOM_PHASES.DEPLOYING,
    "DEPLOYMENT_TIMEOUT_NOT_ALLOWED",
    "只有 DEPLOYING 阶段可以处理部署超时。",
  );
  const normalizedNow = normalizeServerTime(nowMs);
  if (!isDeadlineReached(room.deploymentDeadlineAt, normalizedNow)) {
    fail(
      "DEPLOYMENT_DEADLINE_NOT_REACHED",
      "部署截止时间尚未到达。",
      {
        deadlineAt: room.deploymentDeadlineAt,
        nowMs: normalizedNow,
      },
    );
  }
  if (typeof deploymentFactory !== "function") {
    fail("INVALID_DEPLOYMENT_FACTORY", "自动部署生成器必须是函数。");
  }

  const autoPreparedPlayerIds = [];
  const seats = room.seats.map((seat) => {
    if (seat.ready) {
      return seat;
    }

    const candidate = seat.deployment ?? deploymentFactory(seat.playerId);
    const deployment = assertValidDeployment(candidate);
    autoPreparedPlayerIds.push(seat.playerId);
    return {
      ...seat,
      deployment: clone(deployment),
      ready: true,
      autoPrepared: true,
    };
  });
  const event = {
    sequence: room.nextSystemEventSequence,
    kind: "deployment_timeout_auto_ready",
    playerIds: autoPreparedPlayerIds,
    message: "部署时间结束，服务器已自动完成部署",
  };

  return assertRoomState(
    bumpVersion(room, {
      seats,
      roomPhase: ROOM_PHASES.ROLLING,
      deploymentsLocked: true,
      deploymentDeadlineAt: null,
      systemEvents: [...room.systemEvents, event],
      nextSystemEventSequence: room.nextSystemEventSequence + 1,
    }),
  );
}

function assertSeat(seat) {
  if (!seat || typeof seat !== "object" || Array.isArray(seat)) {
    fail("INVALID_ROOM_STATE", "房间包含无效玩家席位。", { seat });
  }
  assertPlayerId(seat.playerId);
  if (normalizeNickname(seat.nickname) !== seat.nickname) {
    fail("INVALID_ROOM_STATE", "席位昵称不是规范格式。", {
      playerId: seat.playerId,
    });
  }
  if (typeof seat.ready !== "boolean") {
    fail("INVALID_ROOM_STATE", "席位准备状态必须是布尔值。", {
      playerId: seat.playerId,
    });
  }
  if (typeof seat.autoPrepared !== "boolean") {
    fail("INVALID_ROOM_STATE", "席位自动准备状态必须是布尔值。", {
      playerId: seat.playerId,
    });
  }
  if (typeof seat.online !== "boolean") {
    fail("INVALID_ROOM_STATE", "席位在线状态必须是布尔值。", {
      playerId: seat.playerId,
    });
  }
  if (seat.online) {
    if (seat.disconnectedAt !== null || seat.reconnectDeadlineAt !== null) {
      fail("INVALID_ROOM_STATE", "在线席位不能保留断线时间。", {
        playerId: seat.playerId,
      });
    }
  } else {
    if (
      !Number.isInteger(seat.disconnectedAt) ||
      seat.disconnectedAt < 0
    ) {
      fail("INVALID_ROOM_STATE", "离线席位必须记录断线时间。", {
        playerId: seat.playerId,
      });
    }
    if (
      seat.reconnectDeadlineAt !== null &&
      (!Number.isInteger(seat.reconnectDeadlineAt) ||
        seat.reconnectDeadlineAt < seat.disconnectedAt)
    ) {
      fail("INVALID_ROOM_STATE", "离线席位的重连截止时间无效。", {
        playerId: seat.playerId,
      });
    }
  }
  if (seat.deployment !== null) {
    assertValidDeployment(seat.deployment);
  }
  if (seat.ready && seat.deployment === null) {
    fail("INVALID_ROOM_STATE", "已准备玩家必须具有完整合法部署。", {
      playerId: seat.playerId,
    });
  }
  if (seat.autoPrepared && !seat.ready) {
    fail("INVALID_ROOM_STATE", "自动准备席位必须处于已准备状态。", {
      playerId: seat.playerId,
    });
  }
}

function assertRoomState(room) {
  if (!room || typeof room !== "object" || Array.isArray(room)) {
    fail("INVALID_ROOM_STATE", "房间状态必须是对象。");
  }
  if (normalizeRoomCode(room.roomCode) !== room.roomCode) {
    fail("INVALID_ROOM_STATE", "房间码不是规范格式。", {
      roomCode: room.roomCode,
    });
  }
  if (!Number.isInteger(room.stateVersion) || room.stateVersion < 1) {
    fail("INVALID_ROOM_STATE", "状态版本号必须是正整数。", {
      stateVersion: room.stateVersion,
    });
  }
  if (!Object.values(ROOM_PHASES).includes(room.roomPhase)) {
    fail("INVALID_ROOM_STATE", "房间阶段无效。", {
      roomPhase: room.roomPhase,
    });
  }
  if (!Object.values(CONNECTION_PHASES).includes(room.connectionPhase)) {
    fail("INVALID_ROOM_STATE", "连接阶段无效。", {
      connectionPhase: room.connectionPhase,
    });
  }
  if (![2, 3].includes(room.maxPlayers)) {
    fail("INVALID_ROOM_STATE", "房间人数配置只能是 2 或 3。", { maxPlayers: room.maxPlayers });
  }
  if (!Array.isArray(room.seats) || room.seats.length < 1 || room.seats.length > room.maxPlayers) {
    fail("INVALID_ROOM_STATE", "房间席位数量超出人数配置。", {
      seatCount: room.seats?.length,
    });
  }

  room.seats.forEach(assertSeat);
  const eliminatedIds = new Set(room.battleState?.match?.eliminatedPlayerIds ?? []);
  const connectionSeats = room.seats.filter((seat) => !eliminatedIds.has(seat.playerId));
  const offlineCount = connectionSeats.filter((seat) => !seat.online).length;
  const expectedConnectionPhase = offlineCount === 0
    ? CONNECTION_PHASES.CONNECTED
    : offlineCount === connectionSeats.length && connectionSeats.length > 1
      ? CONNECTION_PHASES.PAUSED_BOTH_OFFLINE
      : CONNECTION_PHASES.PAUSED_ONE_OFFLINE;
  if (room.connectionPhase !== expectedConnectionPhase) {
    fail("INVALID_ROOM_STATE", "连接阶段与席位在线状态不一致。", {
      connectionPhase: room.connectionPhase,
      expectedConnectionPhase,
    });
  }
  if (room.connectionPhase === CONNECTION_PHASES.CONNECTED) {
    if (room.pausedTimer !== null) {
      fail("INVALID_ROOM_STATE", "全部在线时不能保留冻结计时。", {
        pausedTimer: room.pausedTimer,
      });
    }
  } else if (
    ![ROOM_PHASES.FINISHED, ROOM_PHASES.CLOSED].includes(room.roomPhase) &&
    connectionSeats.some(
      (seat) => !seat.online && seat.reconnectDeadlineAt === null,
    )
  ) {
    fail("INVALID_ROOM_STATE", "未结束房间的离线席位必须具有重连截止时间。");
  }

  if (room.pausedTimer !== null) {
    if (
      !room.pausedTimer ||
      typeof room.pausedTimer !== "object" ||
      !["deployment", "action"].includes(room.pausedTimer.kind) ||
      !Number.isInteger(room.pausedTimer.remainingMs) ||
      room.pausedTimer.remainingMs < 0
    ) {
      fail("INVALID_ROOM_STATE", "冻结计时结构无效。", {
        pausedTimer: room.pausedTimer,
      });
    }
    if (room.connectionPhase === CONNECTION_PHASES.CONNECTED) {
      fail("INVALID_ROOM_STATE", "冻结计时只允许在断线暂停时存在。");
    }
    if (
      room.pausedTimer.kind === "deployment" &&
      room.roomPhase !== ROOM_PHASES.DEPLOYING
    ) {
      fail("INVALID_ROOM_STATE", "部署冻结计时只允许存在于 DEPLOYING。");
    }
    if (
      room.pausedTimer.kind === "action" &&
      room.roomPhase !== ROOM_PHASES.PLAYING
    ) {
      fail("INVALID_ROOM_STATE", "行动冻结计时只允许存在于 PLAYING。");
    }
  }

  if (
    room.roomPhase === ROOM_PHASES.DEPLOYING &&
    room.connectionPhase === CONNECTION_PHASES.CONNECTED &&
    (!Number.isInteger(room.deploymentDeadlineAt) || room.deploymentDeadlineAt < 0)
  ) {
    fail("INVALID_ROOM_STATE", "DEPLOYING 阶段必须具有部署绝对截止时间。");
  }
  if (
    room.roomPhase === ROOM_PHASES.DEPLOYING &&
    room.connectionPhase !== CONNECTION_PHASES.CONNECTED &&
    (room.deploymentDeadlineAt !== null ||
      room.pausedTimer?.kind !== "deployment")
  ) {
    fail("INVALID_ROOM_STATE", "断线暂停的 DEPLOYING 必须冻结部署计时。");
  }
  if (
    room.roomPhase !== ROOM_PHASES.DEPLOYING &&
    room.deploymentDeadlineAt !== null
  ) {
    fail("INVALID_ROOM_STATE", "非 DEPLOYING 阶段不能保留部署截止时间。", {
      roomPhase: room.roomPhase,
      deploymentDeadlineAt: room.deploymentDeadlineAt,
    });
  }
  if (
    room.actionDeadlineAt !== null &&
    (!Number.isInteger(room.actionDeadlineAt) || room.actionDeadlineAt < 0)
  ) {
    fail("INVALID_ROOM_STATE", "行动截止时间必须为 null 或非负整数时间戳。", {
      actionDeadlineAt: room.actionDeadlineAt,
    });
  }

  const playerIds = room.seats.map((seat) => seat.playerId);
  if (new Set(playerIds).size !== playerIds.length) {
    fail("INVALID_ROOM_STATE", "房间玩家 ID 必须唯一。", { playerIds });
  }
  if (
    !room.consecutiveActionTimeouts ||
    typeof room.consecutiveActionTimeouts !== "object" ||
    Array.isArray(room.consecutiveActionTimeouts) ||
    playerIds.some(
      (playerId) =>
        !Number.isInteger(room.consecutiveActionTimeouts[playerId]) ||
        room.consecutiveActionTimeouts[playerId] < 0,
    )
  ) {
    fail("INVALID_ROOM_STATE", "房间连续行动超时计数结构无效。");
  }
  if (
    !room.rematchRequestedByPlayer ||
    typeof room.rematchRequestedByPlayer !== "object" ||
    Array.isArray(room.rematchRequestedByPlayer) ||
    Object.keys(room.rematchRequestedByPlayer).length !== playerIds.length ||
    playerIds.some(
      (playerId) =>
        typeof room.rematchRequestedByPlayer[playerId] !== "boolean",
    )
  ) {
    fail("INVALID_ROOM_STATE", "房间再来一局申请结构无效。");
  }
  if (
    room.roomPhase !== ROOM_PHASES.FINISHED &&
    playerIds.some((playerId) => room.rematchRequestedByPlayer[playerId])
  ) {
    fail("INVALID_ROOM_STATE", "只有 FINISHED 阶段可以保留再来一局申请。");
  }
  for (const [field, value] of [
    ["matchStartedAt", room.matchStartedAt],
    ["matchFinishedAt", room.matchFinishedAt],
  ]) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      fail("INVALID_ROOM_STATE", "对局时间必须为 null 或非负整数时间戳。", {
        field,
        value,
      });
    }
  }
  if (
    room.matchFinishedAt !== null &&
    (room.matchStartedAt === null || room.matchFinishedAt < room.matchStartedAt)
  ) {
    fail("INVALID_ROOM_STATE", "对局结束时间不能早于开始时间。");
  }
  if (
    [ROOM_PHASES.WAITING, ROOM_PHASES.DEPLOYING, ROOM_PHASES.ROLLING].includes(
      room.roomPhase,
    ) &&
    (room.matchStartedAt !== null || room.matchFinishedAt !== null)
  ) {
    fail("INVALID_ROOM_STATE", "正式对局开始前不能保留对局时间。");
  }
  if (
    room.roomPhase === ROOM_PHASES.PLAYING &&
    (room.matchStartedAt === null || room.matchFinishedAt !== null)
  ) {
    fail("INVALID_ROOM_STATE", "PLAYING 阶段必须只有对局开始时间。");
  }
  if (room.roomPhase === ROOM_PHASES.FINAL_SALVO) {
    if (room.matchStartedAt === null) {
      fail("INVALID_ROOM_STATE", "手动鱼雷阶段必须保留对局开始时间。");
    }
    const salvoFinished = room.battleState?.match?.status === "finished";
    if (salvoFinished !== (room.matchFinishedAt !== null)) {
      fail("INVALID_ROOM_STATE", "手动鱼雷阶段的结束时间与战场状态不一致。");
    }
  }
  if (
    room.roomPhase === ROOM_PHASES.FINISHED &&
    (room.matchStartedAt === null || room.matchFinishedAt === null)
  ) {
    fail("INVALID_ROOM_STATE", "赛后阶段必须具有完整对局时间。");
  }
  if (
    !Array.isArray(room.systemEvents) ||
    !Number.isInteger(room.nextSystemEventSequence) ||
    room.nextSystemEventSequence < 1
  ) {
    fail("INVALID_ROOM_STATE", "房间系统事件结构无效。");
  }
  if (!playerIds.includes(room.ownerPlayerId)) {
    fail("INVALID_ROOM_STATE", "房主必须占据当前房间席位。", {
      ownerPlayerId: room.ownerPlayerId,
    });
  }
  if (room.roomPhase === ROOM_PHASES.WAITING && room.seats.length >= room.maxPlayers) {
    fail("INVALID_ROOM_STATE", "等待阶段必须至少保留一个空席位。", {
      seatCount: room.seats.length,
    });
  }
  if (
    [ROOM_PHASES.DEPLOYING, ROOM_PHASES.ROLLING, ROOM_PHASES.PLAYING,
      ROOM_PHASES.FINAL_SALVO, ROOM_PHASES.FINISHED].includes(room.roomPhase) &&
    room.seats.length !== room.maxPlayers
  ) {
    fail("INVALID_ROOM_STATE", "当前房间阶段必须坐满配置的玩家席位。", {
      roomPhase: room.roomPhase,
      seatCount: room.seats.length,
    });
  }
  if (room.roomPhase === ROOM_PHASES.DEPLOYING && room.deploymentsLocked) {
    fail("INVALID_ROOM_STATE", "部署阶段不能提前锁定所有玩家的部署。");
  }
  if (
    [ROOM_PHASES.ROLLING, ROOM_PHASES.PLAYING, ROOM_PHASES.FINAL_SALVO,
      ROOM_PHASES.FINISHED].includes(room.roomPhase) &&
    (!room.deploymentsLocked || !room.seats.every((seat) => seat.ready))
  ) {
    fail("INVALID_ROOM_STATE", "掷骰及后续阶段必须锁定全部玩家的已准备部署。");
  }
  if (room.roomPhase !== ROOM_PHASES.PLAYING && room.turnPhase !== null) {
    fail("INVALID_ROOM_STATE", "turnPhase 只允许在 PLAYING 阶段存在。", {
      roomPhase: room.roomPhase,
      turnPhase: room.turnPhase,
    });
  }
  return room;
}

module.exports = {
  CONNECTION_PHASES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_PHASES,
  assertPlayerId,
  assertRoomConnected,
  assertRoomState,
  cancelPlayerReady,
  completeDeploymentTimeout,
  createRoomState,
  getOpponentSeat,
  getPlayerSeat,
  joinRoomState,
  leaveRoomBeforeMatch,
  normalizeNickname,
  normalizeRoomCode,
  setPlayerReady,
  submitDeployment,
};
