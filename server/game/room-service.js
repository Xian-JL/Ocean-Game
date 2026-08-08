"use strict";

const {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} = require("node:crypto");
const {
  disconnectPlayer: markPlayerDisconnected,
  isDisconnectResolutionDue,
  processDisconnectTimeout,
  reconnectPlayer: restorePlayerConnection,
} = require("./connection");
const { RuleValidationError } = require("./errors");
const {
  cancelRematch: cancelRematchState,
  leaveFinishedRoom,
  requestRematch: requestRematchState,
  startRematch: startRematchState,
  surrenderMatch,
} = require("./lifecycle");
const {
  beginPlayerAction,
  completeAutomaticTurnSkip,
  completeFinalSalvo,
  completePlayerAction,
  createRoomView,
  createRoomViewsByPlayer,
  determineFirstPlayer,
  processActionTimeout,
  startPlaying,
  TURN_PHASES,
} = require("./match");
const { generateRandomDeployment } = require("./random-deployment");
const {
  CONNECTION_PHASES,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_PHASES,
  cancelPlayerReady,
  completeDeploymentTimeout,
  createRoomState,
  joinRoomState,
  leaveRoomBeforeMatch,
  normalizeRoomCode,
  setPlayerReady,
  submitDeployment,
} = require("./room");
const { normalizeServerTime } = require("./timing");

const MAX_ID_ATTEMPTS = 100;
const RECONNECT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const DEFAULT_MAX_ROOMS = 200;
const DEFAULT_CLOSED_ROOM_RETENTION_MS = 10 * 60 * 1000;
const DEFAULT_FINISHED_ROOM_RETENTION_MS = 2 * 60 * 60 * 1000;

function fail(code, message, details = {}) {
  throw new RuleValidationError(code, message, details);
}

function createRoomCode(random = Math.random) {
  if (typeof random !== "function") {
    fail("INVALID_RANDOM_SOURCE", "房间码随机源必须是函数。");
  }
  let roomCode = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const value = random();
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1) {
      fail("INVALID_RANDOM_VALUE", "房间码随机值必须位于 [0, 1)。", {
        value,
      });
    }
    roomCode += ROOM_CODE_ALPHABET[Math.floor(value * ROOM_CODE_ALPHABET.length)];
  }
  return roomCode;
}

function normalizeReconnectToken(reconnectToken) {
  if (
    typeof reconnectToken !== "string" ||
    !RECONNECT_TOKEN_PATTERN.test(reconnectToken)
  ) {
    fail(
      "INVALID_RECONNECT_CREDENTIAL",
      "私密重连凭证无效，无法恢复原座位。",
    );
  }
  return reconnectToken;
}

function digestReconnectToken(reconnectToken) {
  return createHash("sha256").update(reconnectToken, "utf8").digest();
}

class InMemoryRoomService {
  constructor(options = {}) {
    this.rooms = new Map();
    this.random = options.random ?? Math.random;
    this.roomCodeFactory = options.roomCodeFactory ?? (() => createRoomCode(this.random));
    this.playerIdFactory = options.playerIdFactory ?? (() => randomUUID());
    this.reconnectTokenFactory = options.reconnectTokenFactory ??
      (() => randomBytes(32).toString("base64url"));
    this.now = options.now ?? Date.now;
    this.randomDeploymentFactory = options.randomDeploymentFactory ??
      (() => generateRandomDeployment(this.random));
    this.reconnectCredentialDigests = new Map();
    this.roomActivityAt = new Map();
    this.maxRooms = options.maxRooms ?? DEFAULT_MAX_ROOMS;
    this.closedRoomRetentionMs = options.closedRoomRetentionMs ??
      DEFAULT_CLOSED_ROOM_RETENTION_MS;
    this.finishedRoomRetentionMs = options.finishedRoomRetentionMs ??
      DEFAULT_FINISHED_ROOM_RETENTION_MS;
    for (const [name, value] of [
      ["maxRooms", this.maxRooms],
      ["closedRoomRetentionMs", this.closedRoomRetentionMs],
      ["finishedRoomRetentionMs", this.finishedRoomRetentionMs],
    ]) {
      if (!Number.isInteger(value) || value < 1) {
        throw new TypeError(`${name} 必须是正整数。`);
      }
    }
  }

  createRoom({ nickname }) {
    const nowMs = this.#readNow();
    if (this.rooms.size >= this.maxRooms) {
      fail(
        "SERVER_CAPACITY_REACHED",
        "当前服务器房间数量已达上限，请稍后再创建。",
        { maxRooms: this.maxRooms },
      );
    }
    const playerId = this.#createUniquePlayerId(null);
    const roomCode = this.#createUniqueRoomCode();
    const room = createRoomState({ roomCode, playerId, nickname });
    this.rooms.set(roomCode, room);
    this.roomActivityAt.set(roomCode, nowMs);
    const reconnectToken = this.#issueReconnectToken(roomCode, playerId);
    return {
      roomCode,
      playerId,
      reconnectToken,
      view: createRoomView(room, playerId, nowMs),
    };
  }

  joinRoom({ roomCode, nickname, expectedVersion }) {
    const nowMs = this.#readNow();
    const current = this.#getRoom(roomCode);
    const playerId = this.#createUniquePlayerId(current);
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => joinRoomState(room, { playerId, nickname }, nowMs),
    );
    const reconnectToken = this.#issueReconnectToken(
      next.roomCode,
      playerId,
    );
    return {
      roomCode: next.roomCode,
      playerId,
      reconnectToken,
      view: createRoomView(next, playerId, nowMs),
    };
  }

  submitDeployment({ roomCode, playerId, deployment, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => submitDeployment(room, playerId, deployment, nowMs),
    );
    return createRoomView(next, playerId, nowMs);
  }

  ready({ roomCode, playerId, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => setPlayerReady(room, playerId, nowMs),
    );
    return createRoomView(next, playerId, nowMs);
  }

  cancelReady({ roomCode, playerId, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => cancelPlayerReady(room, playerId, nowMs),
    );
    return createRoomView(next, playerId, nowMs);
  }

  leaveBeforeMatch({ roomCode, playerId, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => leaveRoomBeforeMatch(room, playerId),
    );
    this.#invalidateRoomCredentials(next.roomCode);
    return createRoomView(next, playerId, nowMs);
  }

  leaveAfterMatch({ roomCode, playerId, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => leaveFinishedRoom(room, playerId, nowMs),
    );
    this.#invalidatePlayerCredential(next.roomCode, playerId);
    return {
      roomCode: next.roomCode,
      stateVersion: next.stateVersion,
      remainingPlayerId: next.seats[0].playerId,
      viewsByPlayer: createRoomViewsByPlayer(next, nowMs),
    };
  }

  surrender({ roomCode, playerId, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => surrenderMatch(room, playerId, nowMs),
    );
    return createRoomViewsByPlayer(next, nowMs);
  }

  requestRematch({ roomCode, playerId, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => requestRematchState(room, playerId),
    );
    return createRoomView(next, playerId, nowMs);
  }

  cancelRematch({ roomCode, playerId, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => cancelRematchState(room, playerId),
    );
    return createRoomView(next, playerId, nowMs);
  }

  startRematch({ roomCode, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => startRematchState(room, nowMs),
    );
    return createRoomViewsByPlayer(next, nowMs);
  }

  disconnect({ roomCode, playerId }) {
    const nowMs = this.#readNow();
    const current = this.#getRoom(roomCode);
    if (current.roomPhase === ROOM_PHASES.CLOSED) {
      return {
        changed: false,
        roomCode: current.roomCode,
        viewsByPlayer: createRoomViewsByPlayer(current, nowMs),
      };
    }
    const next = markPlayerDisconnected(current, playerId, nowMs);
    this.rooms.set(next.roomCode, next);
    this.roomActivityAt.set(next.roomCode, nowMs);
    return {
      changed: true,
      roomCode: next.roomCode,
      viewsByPlayer: createRoomViewsByPlayer(next, nowMs),
    };
  }

  resume({ roomCode, reconnectToken }) {
    const nowMs = this.#readNow();
    const current = this.#getRoom(roomCode);
    const playerId = this.#findPlayerByReconnectToken(
      current.roomCode,
      reconnectToken,
    );
    let next = restorePlayerConnection(current, playerId, nowMs);
    let disconnectResolved = false;
    if (isDisconnectResolutionDue(next, nowMs)) {
      next = processDisconnectTimeout(next, nowMs);
      disconnectResolved = true;
    }
    this.rooms.set(next.roomCode, next);
    this.roomActivityAt.set(next.roomCode, nowMs);

    let rotatedReconnectToken = null;
    if (next.roomPhase === ROOM_PHASES.CLOSED) {
      this.#invalidateRoomCredentials(next.roomCode);
    } else {
      rotatedReconnectToken = this.#rotateReconnectToken(
        next.roomCode,
        playerId,
      );
    }
    return {
      roomCode: next.roomCode,
      playerId,
      reconnectToken: rotatedReconnectToken,
      disconnectResolved,
      view: createRoomView(next, playerId, nowMs),
      viewsByPlayer: createRoomViewsByPlayer(next, nowMs),
    };
  }

  determineFirstPlayer({ roomCode, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => determineFirstPlayer(room, this.random),
    );
    return createRoomViewsByPlayer(next, nowMs);
  }

  startPlaying({ roomCode, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => startPlaying(room, nowMs),
    );
    return createRoomViewsByPlayer(next, nowMs);
  }

  beginAction({ roomCode, playerId, intent, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => beginPlayerAction(room, playerId, intent, nowMs),
    );
    return createRoomView(next, playerId, nowMs);
  }

  completeAction({ roomCode, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => completePlayerAction(room, nowMs),
    );
    return createRoomViewsByPlayer(next, nowMs);
  }

  completeAutomaticSkip({ roomCode, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => completeAutomaticTurnSkip(room, nowMs),
    );
    return createRoomViewsByPlayer(next, nowMs);
  }

  completeFinalSalvo({ roomCode, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      completeFinalSalvo,
    );
    return createRoomViewsByPlayer(next, nowMs);
  }

  processDeploymentTimeout({ roomCode, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => completeDeploymentTimeout(
        room,
        nowMs,
        (playerId) => this.randomDeploymentFactory(playerId),
      ),
    );
    return createRoomViewsByPlayer(next, nowMs);
  }

  processActionTimeout({ roomCode, expectedVersion }) {
    const nowMs = this.#readNow();
    const next = this.#mutate(
      roomCode,
      expectedVersion,
      (room) => processActionTimeout(room, nowMs),
    );
    return createRoomViewsByPlayer(next, nowMs);
  }

  processExpiredTimers() {
    const nowMs = this.#readNow();
    const processed = [];
    for (const room of this.rooms.values()) {
      let next = null;
      if (room.connectionPhase !== CONNECTION_PHASES.CONNECTED) {
        if (isDisconnectResolutionDue(room, nowMs)) {
          next = processDisconnectTimeout(room, nowMs);
        }
      } else if (
        room.roomPhase === ROOM_PHASES.DEPLOYING &&
        nowMs >= room.deploymentDeadlineAt
      ) {
        next = completeDeploymentTimeout(
          room,
          nowMs,
          (playerId) => this.randomDeploymentFactory(playerId),
        );
      } else if (
        room.roomPhase === ROOM_PHASES.PLAYING &&
        room.turnPhase === TURN_PHASES.ACTIVE &&
        nowMs >= room.actionDeadlineAt
      ) {
        next = processActionTimeout(room, nowMs);
      }

      if (next) {
        this.rooms.set(room.roomCode, next);
        this.roomActivityAt.set(room.roomCode, nowMs);
        if (next.roomPhase === ROOM_PHASES.CLOSED) {
          this.#invalidateRoomCredentials(next.roomCode);
        }
        processed.push({
          roomCode: room.roomCode,
          viewsByPlayer: createRoomViewsByPlayer(next, nowMs),
        });
      }
    }
    return processed;
  }

  cleanupExpiredRooms() {
    const nowMs = this.#readNow();
    const removedRoomCodes = [];
    for (const [roomCode, room] of this.rooms) {
      const lastActivityAt = this.roomActivityAt.get(roomCode) ?? nowMs;
      const retentionMs = room.roomPhase === ROOM_PHASES.CLOSED
        ? this.closedRoomRetentionMs
        : room.roomPhase === ROOM_PHASES.FINISHED &&
            room.seats.every((seat) => !seat.online)
          ? this.finishedRoomRetentionMs
          : null;
      if (retentionMs !== null && nowMs - lastActivityAt >= retentionMs) {
        this.rooms.delete(roomCode);
        this.roomActivityAt.delete(roomCode);
        this.#invalidateRoomCredentials(roomCode);
        removedRoomCodes.push(roomCode);
      }
    }
    return removedRoomCodes;
  }

  getOperationsSnapshot() {
    const roomsByPhase = {};
    for (const room of this.rooms.values()) {
      roomsByPhase[room.roomPhase] = (roomsByPhase[room.roomPhase] ?? 0) + 1;
    }
    return {
      roomCount: this.rooms.size,
      maxRooms: this.maxRooms,
      roomsByPhase,
    };
  }

  getPlayerView(roomCode, playerId) {
    const nowMs = this.#readNow();
    return createRoomView(this.#getRoom(roomCode), playerId, nowMs);
  }

  getViewsByPlayer(roomCode) {
    const nowMs = this.#readNow();
    return createRoomViewsByPlayer(this.#getRoom(roomCode), nowMs);
  }

  /** 仅供服务器编排和测试使用，禁止把该完整状态发送给浏览器。 */
  getServerState(roomCode) {
    return structuredClone(this.#getRoom(roomCode));
  }

  #getRoom(roomCode) {
    const normalized = normalizeRoomCode(roomCode);
    const room = this.rooms.get(normalized);
    if (!room) {
      fail("ROOM_NOT_FOUND", "未找到该房间，请检查 6 位房间码。", {
        roomCode: normalized,
      });
    }
    return room;
  }

  #readNow() {
    if (typeof this.now !== "function") {
      fail("INVALID_CLOCK", "服务器时钟必须是函数。");
    }
    return normalizeServerTime(this.now());
  }

  #mutate(roomCode, expectedVersion, updater) {
    const current = this.#getRoom(roomCode);
    if (expectedVersion !== undefined) {
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        fail("INVALID_STATE_VERSION", "预期状态版本必须是正整数。", {
          expectedVersion,
        });
      }
      if (current.stateVersion !== expectedVersion) {
        fail("STATE_VERSION_CONFLICT", "客户端状态已过期，请先同步最新状态。", {
          expectedVersion,
          actualVersion: current.stateVersion,
        });
      }
    }

    const next = updater(current);
    if (next.stateVersion <= current.stateVersion) {
      fail("STATE_VERSION_NOT_ADVANCED", "成功变更必须递增状态版本号。", {
        previousVersion: current.stateVersion,
        nextVersion: next.stateVersion,
      });
    }
    this.rooms.set(current.roomCode, next);
    this.roomActivityAt.set(current.roomCode, this.#readNow());
    return next;
  }

  #createUniqueRoomCode() {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const roomCode = normalizeRoomCode(this.roomCodeFactory());
      if (!this.rooms.has(roomCode)) {
        return roomCode;
      }
    }
    fail("ROOM_CODE_EXHAUSTED", "服务器暂时无法生成唯一房间码，请稍后重试。");
  }

  #createUniquePlayerId(room) {
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const playerId = this.playerIdFactory();
      const occupied = room?.seats.some((seat) => seat.playerId === playerId) ?? false;
      if (!occupied) {
        return playerId;
      }
    }
    fail("PLAYER_ID_EXHAUSTED", "服务器暂时无法生成唯一玩家 ID，请稍后重试。");
  }

  #credentialMap(roomCode) {
    let credentials = this.reconnectCredentialDigests.get(roomCode);
    if (!credentials) {
      credentials = new Map();
      this.reconnectCredentialDigests.set(roomCode, credentials);
    }
    return credentials;
  }

  #generateReconnectToken(roomCode, playerId, oldDigest = null) {
    if (typeof this.reconnectTokenFactory !== "function") {
      fail("INVALID_RECONNECT_TOKEN_FACTORY", "重连凭证生成器必须是函数。");
    }
    const credentials = this.#credentialMap(roomCode);
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
      const reconnectToken = normalizeReconnectToken(
        this.reconnectTokenFactory(roomCode, playerId),
      );
      const digest = digestReconnectToken(reconnectToken);
      const duplicatesExisting = [...credentials.values()].some(
        (candidate) => timingSafeEqual(candidate, digest),
      );
      const repeatsOld = oldDigest !== null &&
        timingSafeEqual(oldDigest, digest);
      if (!duplicatesExisting && !repeatsOld) {
        return { reconnectToken, digest };
      }
    }
    fail(
      "RECONNECT_TOKEN_EXHAUSTED",
      "服务器暂时无法生成唯一重连凭证，请稍后重试。",
    );
  }

  #issueReconnectToken(roomCode, playerId) {
    const credentials = this.#credentialMap(roomCode);
    const generated = this.#generateReconnectToken(roomCode, playerId);
    credentials.set(playerId, generated.digest);
    return generated.reconnectToken;
  }

  #rotateReconnectToken(roomCode, playerId) {
    const credentials = this.#credentialMap(roomCode);
    const oldDigest = credentials.get(playerId);
    if (!oldDigest) {
      fail(
        "INVALID_RECONNECT_CREDENTIAL",
        "私密重连凭证无效，无法恢复原座位。",
      );
    }
    credentials.delete(playerId);
    try {
      const generated = this.#generateReconnectToken(
        roomCode,
        playerId,
        oldDigest,
      );
      credentials.set(playerId, generated.digest);
      return generated.reconnectToken;
    } catch (error) {
      credentials.set(playerId, oldDigest);
      throw error;
    }
  }

  #findPlayerByReconnectToken(roomCode, reconnectToken) {
    const normalized = normalizeReconnectToken(reconnectToken);
    const digest = digestReconnectToken(normalized);
    const credentials = this.reconnectCredentialDigests.get(roomCode);
    for (const [playerId, candidate] of credentials ?? []) {
      if (timingSafeEqual(candidate, digest)) {
        return playerId;
      }
    }
    fail(
      "INVALID_RECONNECT_CREDENTIAL",
      "私密重连凭证无效，无法恢复原座位。",
    );
  }

  #invalidateRoomCredentials(roomCode) {
    this.reconnectCredentialDigests.delete(roomCode);
  }

  #invalidatePlayerCredential(roomCode, playerId) {
    const credentials = this.reconnectCredentialDigests.get(roomCode);
    if (!credentials) {
      return;
    }
    credentials.delete(playerId);
    if (credentials.size === 0) {
      this.reconnectCredentialDigests.delete(roomCode);
    }
  }
}

module.exports = {
  DEFAULT_CLOSED_ROOM_RETENTION_MS,
  DEFAULT_FINISHED_ROOM_RETENTION_MS,
  DEFAULT_MAX_ROOMS,
  InMemoryRoomService,
  RECONNECT_TOKEN_PATTERN,
  createRoomCode,
  normalizeReconnectToken,
};
