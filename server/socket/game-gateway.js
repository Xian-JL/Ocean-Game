"use strict";

const { RuleValidationError } = require("../game/errors");
const { RELEASE_STAGE } = require("../release");
const { TURN_PHASES } = require("../game/match");
const { CONNECTION_PHASES, ROOM_PHASES } = require("../game/room");
const { FixedWindowRateLimiter } = require("../operations/rate-limiter");
const {
  OperationalTelemetry,
  logOperationalError,
} = require("../operations/telemetry");
const {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  SOCKET_PROTOCOL_VERSION,
  createSuccessResponse,
  requireExpectedVersion,
  requirePayloadObject,
  serializeSocketError,
} = require("./protocol");

const DEFAULT_TIMER_SWEEP_MS = 250;
const DEFAULT_PHASE_PRESENTATION_MS = 1_000;
const DEFAULT_ROLL_RESULT_EXTRA_PRESENTATION_MS = 3_000;
const MAX_AUTOMATIC_TRANSITIONS = 20;
const CLEANUP_SWEEP_MS = 30_000;
const GENERAL_REQUEST_LIMIT = Object.freeze({ limit: 120, windowMs: 60_000 });
const CREATE_ROOM_LIMIT = Object.freeze({ limit: 6, windowMs: 10 * 60_000 });
const ENTRY_REQUEST_LIMIT = Object.freeze({ limit: 30, windowMs: 60_000 });

function fail(code, message, details = {}) {
  throw new RuleValidationError(code, message, details);
}

function assertNonNegativeInteger(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} 必须是非负整数。`);
  }
  return value;
}

function roomChannel(roomCode) {
  return `ocean:room:${roomCode}`;
}

function playerChannel(playerId) {
  return `ocean:player:${playerId}`;
}

function normalizeIncomingArguments(payload, acknowledge) {
  if (typeof payload === "function" && acknowledge === undefined) {
    return {
      payload: {},
      acknowledge: payload,
    };
  }
  return {
    payload: payload ?? {},
    acknowledge,
  };
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function readActionId(intent) {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) {
    return null;
  }
  return typeof intent.actionId === "string" && intent.actionId.trim()
    ? intent.actionId.trim()
    : null;
}

class SocketGameGateway {
  constructor(options) {
    if (!options?.io || !options?.roomService) {
      throw new TypeError("SocketGameGateway 需要 io 和 roomService。");
    }

    this.io = options.io;
    this.roomService = options.roomService;
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.nowMs = options.nowMs ?? Date.now;
    this.logger = options.logger ?? console;
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
    this.rateLimiter = options.rateLimiter ?? new FixedWindowRateLimiter({
      now: this.nowMs,
    });
    this.telemetry = options.telemetry ?? new OperationalTelemetry({
      nowIso: this.nowIso,
    });
    this.nextCleanupAt = this.nowMs() + CLEANUP_SWEEP_MS;
    this.timerSweepMs = assertNonNegativeInteger(
      options.timerSweepMs ?? DEFAULT_TIMER_SWEEP_MS,
      "timerSweepMs",
    );
    this.phasePresentationMs = assertNonNegativeInteger(
      options.phasePresentationMs ?? DEFAULT_PHASE_PRESENTATION_MS,
      "phasePresentationMs",
    );
    this.rollResultExtraPresentationMs = assertNonNegativeInteger(
      options.rollResultExtraPresentationMs ?? DEFAULT_ROLL_RESULT_EXTRA_PRESENTATION_MS,
      "rollResultExtraPresentationMs",
    );
    this.scheduledTransitions = new Map();
    this.actionReceipts = new Map();
    this.closed = false;
    this.connectionHandler = (socket) => this.#registerSocket(socket);
    this.io.on("connection", this.connectionHandler);

    this.timerHandle = null;
    if (this.timerSweepMs > 0) {
      this.timerHandle = this.setIntervalFn(() => {
        void this.sweepExpiredTimers().catch((error) => {
          this.#reportBackgroundError(null, error);
        });
      }, this.timerSweepMs);
      this.timerHandle?.unref?.();
    }
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.io.off("connection", this.connectionHandler);
    if (this.timerHandle !== null) {
      this.clearIntervalFn(this.timerHandle);
      this.timerHandle = null;
    }
    for (const scheduled of this.scheduledTransitions.values()) {
      this.clearTimeoutFn(scheduled.handle);
    }
    this.scheduledTransitions.clear();
  }

  async sweepExpiredTimers() {
    if (this.closed) {
      return [];
    }
    const processed = this.roomService.processExpiredTimers();
    for (const entry of processed) {
      this.#emitViews(entry.viewsByPlayer);
      const room = this.roomService.getServerState(entry.roomCode);
      if (room.roomPhase === ROOM_PHASES.CLOSED) {
        this.#clearRoomActionReceipts(entry.roomCode);
      }
      await this.advanceRoom(entry.roomCode);
    }
    if (this.nowMs() >= this.nextCleanupAt) {
      this.nextCleanupAt = this.nowMs() + CLEANUP_SWEEP_MS;
      const removedRoomCodes = this.roomService.cleanupExpiredRooms();
      for (const roomCode of removedRoomCodes) {
        this.#cancelRoomTransitions(roomCode);
        this.#clearRoomActionReceipts(roomCode);
      }
      if (removedRoomCodes.length > 0) {
        this.telemetry.increment("roomsCleaned", removedRoomCodes.length);
      }
      this.rateLimiter.pruneExpired();
    }
    return processed.map((entry) => entry.roomCode);
  }

  async advanceRoom(roomCode) {
    for (
      let transition = 0;
      transition < MAX_AUTOMATIC_TRANSITIONS;
      transition += 1
    ) {
      const room = this.roomService.getServerState(roomCode);

      if (room.connectionPhase !== CONNECTION_PHASES.CONNECTED) {
        return;
      }

      if (room.roomPhase === ROOM_PHASES.ROLLING) {
        if (!room.rolling?.firstPlayerId) {
          return;
        }
        this.#scheduleTransition(
          roomCode,
          "start-playing",
          room.stateVersion,
          async () => {
            const current = this.roomService.getServerState(roomCode);
            if (
              current.roomPhase !== ROOM_PHASES.ROLLING ||
              current.connectionPhase !== CONNECTION_PHASES.CONNECTED ||
              current.stateVersion !== room.stateVersion
            ) {
              return;
            }
            const views = this.roomService.startPlaying({
              roomCode,
              expectedVersion: current.stateVersion,
            });
            this.#emitViews(views);
            await this.advanceRoom(roomCode);
          },
          this.phasePresentationMs + this.rollResultExtraPresentationMs,
        );
        return;
      }

      if (
        room.roomPhase === ROOM_PHASES.PLAYING &&
        room.turnPhase === TURN_PHASES.AUTO_SKIPPING
      ) {
        const views = this.roomService.completeAutomaticSkip({
          roomCode,
          expectedVersion: room.stateVersion,
        });
        this.#emitViews(views);
        continue;
      }

      if (
        room.roomPhase === ROOM_PHASES.FINAL_SALVO &&
        room.battleState.match.status === "finished"
      ) {
        this.#scheduleTransition(
          roomCode,
          "finish-final-salvo",
          room.stateVersion,
          async () => {
            const current = this.roomService.getServerState(roomCode);
            if (
              current.roomPhase !== ROOM_PHASES.FINAL_SALVO ||
              current.connectionPhase !== CONNECTION_PHASES.CONNECTED ||
              current.stateVersion !== room.stateVersion
            ) {
              return;
            }
            const views = this.roomService.completeFinalSalvo({
              roomCode,
              expectedVersion: current.stateVersion,
            });
            this.#emitViews(views);
          },
        );
        return;
      }

      if (
        room.roomPhase === ROOM_PHASES.FINISHED &&
        room.seats.length === room.maxPlayers &&
        room.seats.every(
          (seat) => room.rematchRequestedByPlayer[seat.playerId],
        )
      ) {
        const views = this.roomService.startRematch({
          roomCode,
          expectedVersion: room.stateVersion,
        });
        this.#cancelRoomTransitions(roomCode);
        this.#clearRoomActionReceipts(roomCode);
        this.#emitViews(views);
        continue;
      }

      return;
    }

    fail(
      "AUTOMATIC_TRANSITION_LIMIT",
      "服务器自动阶段转换次数超过安全上限。",
      { roomCode },
    );
  }

  #registerSocket(socket) {
    this.telemetry.increment("socketConnections");
    socket.emit(SERVER_EVENTS.READY, {
      stage: RELEASE_STAGE,
      protocolVersion: SOCKET_PROTOCOL_VERSION,
      connectedAt: this.nowIso(),
    });

    socket.on(CLIENT_EVENTS.PING, (payload, acknowledge) => {
      const normalized = normalizeIncomingArguments(payload, acknowledge);
      if (typeof normalized.acknowledge === "function") {
        normalized.acknowledge({
          ok: true,
          receivedAt: this.nowIso(),
          protocolVersion: SOCKET_PROTOCOL_VERSION,
        });
      }
    });

    this.#registerEvent(socket, CLIENT_EVENTS.CREATE_ROOM, (payload) =>
      this.#createRoom(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.JOIN_ROOM, (payload) =>
      this.#joinRoom(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.RESUME_ROOM, (payload) =>
      this.#resumeRoom(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.SYNC_ROOM, () =>
      this.#syncRoom(socket));
    this.#registerEvent(socket, CLIENT_EVENTS.LEAVE_ROOM, (payload) =>
      this.#leaveRoom(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.SUBMIT_DEPLOYMENT, (payload) =>
      this.#submitDeployment(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.READY_DEPLOYMENT, (payload) =>
      this.#readyDeployment(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.CANCEL_READY, (payload) =>
      this.#cancelReady(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.ROLL_DIE, (payload) =>
      this.#rollDie(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.SUBMIT_ACTION, (payload) =>
      this.#submitAction(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.SUBMIT_FINAL_SALVO, (payload) =>
      this.#submitFinalSalvo(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.SURRENDER_MATCH, (payload) =>
      this.#surrenderMatch(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.REQUEST_REMATCH, (payload) =>
      this.#requestRematch(socket, payload));
    this.#registerEvent(socket, CLIENT_EVENTS.CANCEL_REMATCH, (payload) =>
      this.#cancelRematch(socket, payload));

    socket.on("disconnect", () => {
      this.telemetry.increment("socketDisconnects");
      this.rateLimiter.deletePrefix(`socket:${socket.id}:`);
      void this.#disconnectSocket(socket);
    });
  }

  #registerEvent(socket, eventName, handler) {
    socket.on(eventName, (payload, acknowledge) => {
      const normalized = normalizeIncomingArguments(payload, acknowledge);
      this.telemetry.increment("socketRequests");
      void Promise.resolve()
        .then(() => this.#consumeRequestBudget(socket, eventName))
        .then(() => handler(normalized.payload))
        .then((data) => {
          this.telemetry.increment("socketRequestsSucceeded");
          this.telemetry.increment(
            `socket.${eventName.replaceAll(":", "_")}.success`,
          );
          if (typeof normalized.acknowledge === "function") {
            normalized.acknowledge(createSuccessResponse(data));
          }
        })
        .catch((error) => {
          void this.#handleSocketError(
            socket,
            error,
            normalized.acknowledge,
            eventName,
          );
        });
    });
  }

  #consumeRequestBudget(socket, eventName) {
    this.rateLimiter.consume(`socket:${socket.id}:all`, GENERAL_REQUEST_LIMIT);
    const address = String(
      socket.handshake?.headers?.["x-forwarded-for"] ??
        socket.handshake?.address ??
        "unknown",
    ).split(",", 1)[0].trim();
    if (eventName === CLIENT_EVENTS.CREATE_ROOM) {
      this.rateLimiter.consume(`address:${address}:create`, CREATE_ROOM_LIMIT);
    }
    if ([CLIENT_EVENTS.JOIN_ROOM, CLIENT_EVENTS.RESUME_ROOM].includes(eventName)) {
      this.rateLimiter.consume(`address:${address}:entry`, ENTRY_REQUEST_LIMIT);
    }
  }

  async #createRoom(socket, payload) {
    this.#assertSocketUnbound(socket);
    const normalized = requirePayloadObject(payload);
    const result = this.roomService.createRoom({
      nickname: normalized.nickname,
      maxPlayers: normalized.maxPlayers ?? 2,
    });
    await this.#bindSocket(
      socket,
      result.roomCode,
      result.playerId,
      result.reconnectToken,
    );
    socket.emit(SERVER_EVENTS.STATE, result.view);
    return {
      roomCode: result.roomCode,
      playerId: result.playerId,
      reconnectToken: result.reconnectToken,
      stateVersion: result.view.stateVersion,
    };
  }

  async #joinRoom(socket, payload) {
    this.#assertSocketUnbound(socket);
    const normalized = requirePayloadObject(payload);
    const result = this.roomService.joinRoom({
      roomCode: normalized.roomCode,
      nickname: normalized.nickname,
    });
    await this.#bindSocket(
      socket,
      result.roomCode,
      result.playerId,
      result.reconnectToken,
    );
    const views = this.roomService.getViewsByPlayer(result.roomCode);
    this.#emitViews(views);
    return {
      roomCode: result.roomCode,
      playerId: result.playerId,
      reconnectToken: result.reconnectToken,
      stateVersion: views[result.playerId].stateVersion,
    };
  }

  async #resumeRoom(socket, payload) {
    this.#assertSocketUnbound(socket);
    const normalized = requirePayloadObject(payload);
    const result = this.roomService.resume({
      roomCode: normalized.roomCode,
      reconnectToken: normalized.reconnectToken,
    });
    await this.#bindSocket(
      socket,
      result.roomCode,
      result.playerId,
      result.reconnectToken,
    );
    this.#emitViews(result.viewsByPlayer);

    const resumedRoom = this.roomService.getServerState(result.roomCode);
    if (resumedRoom.connectionPhase === CONNECTION_PHASES.CONNECTED) {
      await this.sweepExpiredTimers();
      await this.advanceRoom(result.roomCode);
    }
    const view = this.roomService.getPlayerView(
      result.roomCode,
      result.playerId,
    );
    socket.emit(SERVER_EVENTS.STATE, view);
    return {
      roomCode: result.roomCode,
      playerId: result.playerId,
      reconnectToken: result.reconnectToken,
      stateVersion: view.stateVersion,
      disconnectResolved: result.disconnectResolved,
    };
  }

  #syncRoom(socket) {
    const session = this.#requireSession(socket);
    const view = this.roomService.getPlayerView(
      session.roomCode,
      session.playerId,
    );
    socket.emit(SERVER_EVENTS.STATE, view);
    return {
      stateVersion: view.stateVersion,
      view,
    };
  }

  async #leaveRoom(socket, payload) {
    const session = this.#requireSession(socket);
    const expectedVersion = requireExpectedVersion(payload);
    const current = this.roomService.getServerState(session.roomCode);
    if (current.roomPhase === ROOM_PHASES.FINISHED) {
      const result = this.roomService.leaveAfterMatch({
        roomCode: session.roomCode,
        playerId: session.playerId,
        expectedVersion,
      });
      this.#cancelRoomTransitions(session.roomCode);
      this.#clearRoomActionReceipts(session.roomCode);
      this.#emitViews(result.viewsByPlayer);
      await this.#unbindSocket(socket);
      return {
        roomCode: session.roomCode,
        stateVersion: result.stateVersion,
        remainingPlayerId: result.remainingPlayerId,
        remainingPlayerIds: result.remainingPlayerIds,
        roomPhase: ROOM_PHASES.WAITING,
      };
    }

    const view = this.roomService.leaveBeforeMatch({
      roomCode: session.roomCode,
      playerId: session.playerId,
      expectedVersion,
    });
    this.#cancelRoomTransitions(session.roomCode);
    this.#clearRoomActionReceipts(session.roomCode);
    this.#broadcastCurrentRoom(session.roomCode);
    await this.#clearRoomBindings(session.roomCode);
    return {
      roomCode: session.roomCode,
      stateVersion: view.stateVersion,
    };
  }

  #submitDeployment(socket, payload) {
    const session = this.#requireSession(socket);
    const normalized = requirePayloadObject(payload);
    const expectedVersion = requireExpectedVersion(normalized);
    const view = this.roomService.submitDeployment({
      roomCode: session.roomCode,
      playerId: session.playerId,
      deployment: normalized.deployment,
      expectedVersion,
    });
    this.#broadcastCurrentRoom(session.roomCode);
    return { stateVersion: view.stateVersion };
  }

  async #readyDeployment(socket, payload) {
    const session = this.#requireSession(socket);
    const expectedVersion = requireExpectedVersion(payload);
    const view = this.roomService.ready({
      roomCode: session.roomCode,
      playerId: session.playerId,
      expectedVersion,
    });
    this.#broadcastCurrentRoom(session.roomCode);
    await this.advanceRoom(session.roomCode);
    return { stateVersion: view.stateVersion };
  }

  #cancelReady(socket, payload) {
    const session = this.#requireSession(socket);
    const expectedVersion = requireExpectedVersion(payload);
    const view = this.roomService.cancelReady({
      roomCode: session.roomCode,
      playerId: session.playerId,
      expectedVersion,
    });
    this.#broadcastCurrentRoom(session.roomCode);
    return { stateVersion: view.stateVersion };
  }

  async #rollDie(socket, payload) {
    const session = this.#requireSession(socket);
    const expectedVersion = requireExpectedVersion(payload);
    const views = this.roomService.rollDie({
      roomCode: session.roomCode,
      playerId: session.playerId,
      expectedVersion,
    });
    this.#emitViews(views);
    await this.advanceRoom(session.roomCode);
    const ownView = views[session.playerId];
    return {
      stateVersion: ownView.stateVersion,
      rolling: structuredClone(ownView.rolling),
    };
  }

  async #submitAction(socket, payload) {
    const session = this.#requireSession(socket);
    const normalized = requirePayloadObject(payload);
    const actionId = readActionId(normalized.intent);
    const receiptKey = actionId
      ? `${session.roomCode}\u0000${session.playerId}\u0000${actionId}`
      : null;
    const fingerprint = stableSerialize(normalized.intent);
    const existingReceipt = receiptKey
      ? this.actionReceipts.get(receiptKey)
      : null;

    if (existingReceipt) {
      if (existingReceipt.fingerprint !== fingerprint) {
        fail(
          "ACTION_ID_REUSE_CONFLICT",
          "同一行动编号不能用于不同的行动请求。",
          { actionId },
        );
      }
      const currentView = this.roomService.getPlayerView(
        session.roomCode,
        session.playerId,
      );
      socket.emit(SERVER_EVENTS.STATE, currentView);
      return {
        ...structuredClone(existingReceipt.data),
        replayed: true,
      };
    }

    const expectedVersion = requireExpectedVersion(normalized);
    const resolvingView = this.roomService.beginAction({
      roomCode: session.roomCode,
      playerId: session.playerId,
      intent: normalized.intent,
      expectedVersion,
    });
    this.#broadcastCurrentRoom(session.roomCode);

    const views = this.roomService.completeAction({
      roomCode: session.roomCode,
      expectedVersion: resolvingView.stateVersion,
    });
    this.#emitViews(views);
    const actorView = views[session.playerId];
    const data = {
      stateVersion: actorView.stateVersion,
      resolution: structuredClone(actorView.latestResolution),
      replayed: false,
    };
    if (receiptKey) {
      this.actionReceipts.set(receiptKey, {
        fingerprint,
        data: structuredClone(data),
      });
    }
    await this.advanceRoom(session.roomCode);
    return data;
  }

  async #submitFinalSalvo(socket, payload) {
    const session = this.#requireSession(socket);
    const normalized = requirePayloadObject(payload);
    const expectedVersion = requireExpectedVersion(normalized);
    const views = this.roomService.submitFinalSalvo({
      roomCode: session.roomCode,
      playerId: session.playerId,
      decoyId: normalized.decoyId,
      expectedVersion,
    });
    this.#emitViews(views);
    await this.advanceRoom(session.roomCode);
    return {
      stateVersion: views[session.playerId].stateVersion,
      round: views[session.playerId].battle?.match?.finalSalvo?.round ?? null,
    };
  }

  #surrenderMatch(socket, payload) {
    const session = this.#requireSession(socket);
    const expectedVersion = requireExpectedVersion(payload);
    const views = this.roomService.surrender({
      roomCode: session.roomCode,
      playerId: session.playerId,
      expectedVersion,
    });
    this.#cancelRoomTransitions(session.roomCode);
    this.#emitViews(views);
    return {
      stateVersion: views[session.playerId].stateVersion,
      result: structuredClone(
        views[session.playerId].battle.match.result,
      ),
    };
  }

  async #requestRematch(socket, payload) {
    const session = this.#requireSession(socket);
    const expectedVersion = requireExpectedVersion(payload);
    const requestedView = this.roomService.requestRematch({
      roomCode: session.roomCode,
      playerId: session.playerId,
      expectedVersion,
    });
    this.#broadcastCurrentRoom(session.roomCode);
    await this.advanceRoom(session.roomCode);
    const currentView = this.roomService.getPlayerView(
      session.roomCode,
      session.playerId,
    );
    return {
      stateVersion: currentView.stateVersion,
      requestedStateVersion: requestedView.stateVersion,
      rematchStarted: currentView.roomPhase === ROOM_PHASES.DEPLOYING,
    };
  }

  #cancelRematch(socket, payload) {
    const session = this.#requireSession(socket);
    const expectedVersion = requireExpectedVersion(payload);
    const view = this.roomService.cancelRematch({
      roomCode: session.roomCode,
      playerId: session.playerId,
      expectedVersion,
    });
    this.#broadcastCurrentRoom(session.roomCode);
    return { stateVersion: view.stateVersion };
  }

  #assertSocketUnbound(socket) {
    if (socket.data.oceanSession) {
      fail(
        "SOCKET_ALREADY_BOUND",
        "当前连接已经进入一个房间，请先离开当前房间。",
        { roomCode: socket.data.oceanSession.roomCode },
      );
    }
  }

  #requireSession(socket) {
    const session = socket.data.oceanSession;
    if (!session) {
      fail(
        "SOCKET_NOT_BOUND",
        "当前连接尚未进入房间，请先创建或加入房间。",
      );
    }
    return session;
  }

  async #bindSocket(socket, roomCode, playerId, reconnectToken) {
    socket.data.oceanSession = { roomCode, playerId };
    await socket.join(roomChannel(roomCode));
    await socket.join(playerChannel(playerId));
    const session = {
      active: true,
      roomCode,
      playerId,
    };
    if (typeof reconnectToken === "string") {
      session.reconnectToken = reconnectToken;
    }
    socket.emit(SERVER_EVENTS.SESSION, session);
  }

  async #disconnectSocket(socket) {
    if (this.closed) {
      return;
    }
    const session = socket.data.oceanSession;
    if (!session) {
      return;
    }
    delete socket.data.oceanSession;
    try {
      const result = this.roomService.disconnect({
        roomCode: session.roomCode,
        playerId: session.playerId,
      });
      if (result.changed) {
        this.#cancelRoomTransitions(session.roomCode);
        this.#emitViews(result.viewsByPlayer);
      }
    } catch (error) {
      if (!(error instanceof RuleValidationError)) {
        logOperationalError(this.logger, this.telemetry, error, "disconnect");
      }
    }
  }

  async #clearRoomBindings(roomCode) {
    const sockets = await this.io.in(roomChannel(roomCode)).fetchSockets();
    for (const socket of sockets) {
      const session = socket.data.oceanSession;
      if (!session || session.roomCode !== roomCode) {
        continue;
      }
      await this.#unbindSocket(socket);
    }
  }

  async #unbindSocket(socket) {
    const session = socket.data.oceanSession;
    if (!session) {
      return;
    }
    socket.emit(SERVER_EVENTS.SESSION, {
      active: false,
      roomCode: null,
      playerId: null,
      reconnectToken: null,
    });
    delete socket.data.oceanSession;
    await socket.leave(playerChannel(session.playerId));
    await socket.leave(roomChannel(session.roomCode));
  }

  #clearRoomActionReceipts(roomCode) {
    const prefix = `${roomCode}\u0000`;
    for (const key of this.actionReceipts.keys()) {
      if (key.startsWith(prefix)) {
        this.actionReceipts.delete(key);
      }
    }
  }

  #broadcastCurrentRoom(roomCode) {
    this.#emitViews(this.roomService.getViewsByPlayer(roomCode));
  }

  #emitViews(viewsByPlayer) {
    for (const [playerId, view] of Object.entries(viewsByPlayer)) {
      this.io.to(playerChannel(playerId)).emit(SERVER_EVENTS.STATE, view);
    }
  }

  #scheduleTransition(roomCode, kind, stateVersion, operation, delayMs = this.phasePresentationMs) {
    const key = `${roomCode}:${kind}`;
    const existing = this.scheduledTransitions.get(key);
    if (existing?.stateVersion === stateVersion) {
      return;
    }
    if (existing) {
      this.clearTimeoutFn(existing.handle);
    }

    const handle = this.setTimeoutFn(() => {
      this.scheduledTransitions.delete(key);
      if (this.closed) {
        return;
      }
      void Promise.resolve()
        .then(operation)
        .catch((error) => this.#reportBackgroundError(roomCode, error));
    }, delayMs);
    handle?.unref?.();
    this.scheduledTransitions.set(key, {
      handle,
      stateVersion,
    });
  }

  #cancelRoomTransitions(roomCode) {
    const prefix = `${roomCode}:`;
    for (const [key, scheduled] of this.scheduledTransitions.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      this.clearTimeoutFn(scheduled.handle);
      this.scheduledTransitions.delete(key);
    }
  }

  async #handleSocketError(socket, error, acknowledge, eventName = "unknown") {
    const serialized = serializeSocketError(error);
    if (!(error instanceof RuleValidationError)) {
      logOperationalError(this.logger, this.telemetry, error, "socket:unexpected");
    } else {
      this.telemetry.recordError(error, `socket:${eventName}`);
    }
    socket.emit(SERVER_EVENTS.ERROR, serialized);

    const session = socket.data.oceanSession;
    if (session) {
      try {
        const view = this.roomService.getPlayerView(
          session.roomCode,
          session.playerId,
        );
        socket.emit(SERVER_EVENTS.STATE, view);
      } catch (syncError) {
        if (!(syncError instanceof RuleValidationError)) {
          logOperationalError(
            this.logger,
            this.telemetry,
            syncError,
            "socket:error-sync",
          );
        }
      }
    }

    if (typeof acknowledge === "function") {
      acknowledge({
        ok: false,
        error: serialized,
      });
    }
  }

  #reportBackgroundError(roomCode, error) {
    const serialized = serializeSocketError(error);
    logOperationalError(this.logger, this.telemetry, error, "background");
    if (!roomCode) {
      return;
    }
    try {
      const room = this.roomService.getServerState(roomCode);
      for (const seat of room.seats) {
        this.io
          .to(playerChannel(seat.playerId))
          .emit(SERVER_EVENTS.ERROR, serialized);
      }
    } catch (readError) {
      logOperationalError(
        this.logger,
        this.telemetry,
        readError,
        "background:notify",
      );
    }
  }
}

module.exports = {
  DEFAULT_PHASE_PRESENTATION_MS,
  DEFAULT_ROLL_RESULT_EXTRA_PRESENTATION_MS,
  DEFAULT_TIMER_SWEEP_MS,
  SocketGameGateway,
  playerChannel,
  roomChannel,
};
