"use strict";

(() => {
  const Data = window.OceanGameData;
  const Model = window.OceanUiModel;
  const app = document.querySelector("#app");
  const connectionDot = document.querySelector("#connection-dot");
  const connectionText = document.querySelector("#connection-text");
  const headerRoomCode = document.querySelector("#header-room-code");
  const blockingOverlay = document.querySelector("#blocking-overlay");
  const toastRegion = document.querySelector("#toast-region");
  const confirmDialog = document.querySelector("#confirm-dialog");
  const confirmTitle = document.querySelector("#confirm-title");
  const confirmBody = document.querySelector("#confirm-body");
  const confirmCancel = document.querySelector("#confirm-cancel");
  const confirmAccept = document.querySelector("#confirm-accept");
  const rulesDialog = document.querySelector("#rules-dialog");
  const reduceMotionToggle = document.querySelector("#reduce-motion-toggle");

  const SESSION_STORAGE_KEY = "ocean.reconnect-session.v1";
  const MOTION_STORAGE_KEY = "ocean.reduce-motion.v1";
  const NICKNAME_STORAGE_KEY = "ocean.nickname.v1";
  const MARKER_STORAGE_PREFIX = "ocean.private-markers.v2";
  const MARKER_CYCLE = ["occupied", "surface_yes", "surface_no", "underwater_yes", "underwater_no"];
  const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  const REQUEST_TIMEOUT_MS = 8_000;

  if (!Data || !Model || !app) {
    document.body.textContent = "正式页面资源加载失败，请刷新页面。";
    return;
  }

  const state = {
    socket: null,
    connected: false,
    connection: {
      phase: "connecting",
      message: "正在连接服务器。首次访问免费服务器时可能需要约一分钟。",
      failures: 0,
    },
    protocolVersion: null,
    serverStage: null,
    room: null,
    session: null,
    restoring: false,
    autoRestoreAttempted: false,
    pendingRequest: null,
    clockOffsetMs: 0,
    entry: {
      maxPlayers: 2,
      nickname: (() => {
        try {
          return localStorage.getItem(NICKNAME_STORAGE_KEY) ?? "";
        } catch (_error) {
          return "";
        }
      })(),
      roomCode:
        new URL(window.location.href).searchParams.get("room")
          ?.trim()
          .toUpperCase() ?? "",
      error: "",
    },
    deployment: {
      placements: [],
      selectedId: "destroyer-i",
      orientations: {
        "destroyer-i": "horizontal",
        "destroyer-ii": "horizontal",
        pirate: "horizontal",
      },
      history: [],
      dirty: false,
      serverDigest: "",
      cycleKey: null,
      drag: null,
      hoverCoordinate: null,
    },
    battle: {
      targetPlayerId: null,
      selectedAction: null,
      target: null,
      actionId: null,
      helicopterAxis: null,
      markerMode: false,
      markers: new Map(),
      markerContext: null,
      mobileMap: "enemy",
      actionDrawerOpen: false,
      logOpen: false,
      ownMapAlert: false,
      selectedIntelligenceSequence: null,
      lastResolutionKey: null,
    },
    replayPlayerId: null,
    reduceMotion: readBooleanPreference(MOTION_STORAGE_KEY),
    confirm: null,
    stateWaiters: [],
    renderedPage: null,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clone(value) {
    return structuredClone(value);
  }

  function readBooleanPreference(key) {
    try {
      return localStorage.getItem(key) === "true";
    } catch (_error) {
      return false;
    }
  }

  function writeBooleanPreference(key, value) {
    try {
      localStorage.setItem(key, value ? "true" : "false");
    } catch (_error) {
      showToast("浏览器未允许保存动画偏好。", "warning");
    }
  }

  function readStoredSession() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
      if (
        parsed &&
        ROOM_CODE_PATTERN.test(parsed.roomCode) &&
        typeof parsed.reconnectToken === "string" &&
        parsed.reconnectToken.length > 0
      ) {
        return {
          roomCode: parsed.roomCode,
          reconnectToken: parsed.reconnectToken,
        };
      }
    } catch (_error) {
      // 损坏或被禁用的本机存储不会阻止进入游戏页。
    }
    return null;
  }

  function saveStoredSession(session) {
    try {
      localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          roomCode: session.roomCode,
          reconnectToken: session.reconnectToken,
        }),
      );
    } catch (_error) {
      showToast("浏览器未允许保存重连凭证，刷新后可能无法恢复座位。", "warning", 8_000);
    }
  }

  function clearStoredSession() {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (_error) {
      // 无可清除的存储。
    }
  }

  function markerStorageKey(roomCode, playerId, targetPlayerId = "default") {
    return `${MARKER_STORAGE_PREFIX}:${roomCode}:${playerId}:${targetPlayerId}`;
  }

  function readMarkers(roomCode, playerId, targetPlayerId = "default") {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(markerStorageKey(roomCode, playerId, targetPlayerId)),
      );
      return new Map(Array.isArray(parsed) ? parsed.filter((entry) =>
        Array.isArray(entry) && Data.parseCoordinate(entry[0]) && MARKER_CYCLE.includes(entry[1])) : []);
    } catch (_error) {
      return new Map();
    }
  }

  function saveMarkers() {
    const context = state.battle.markerContext;
    if (!context) {
      return;
    }
    try {
      localStorage.setItem(
        markerStorageKey(context.roomCode, context.playerId, context.targetPlayerId),
        JSON.stringify([...state.battle.markers.entries()]),
      );
    } catch (_error) {
      showToast("浏览器未允许保存私人标记。", "warning");
    }
  }

  function clearMarkersFor(roomCode, playerId) {
    try {
      localStorage.removeItem(markerStorageKey(roomCode, playerId));
    } catch (_error) {
      // 私人标记只影响本机显示，清除失败不影响对局。
    }
    state.battle.markers = new Map();
  }

  function updateRoomAddress(roomCode) {
    const url = new URL(window.location.href);
    if (roomCode) {
      url.searchParams.set("room", roomCode);
    } else {
      url.searchParams.delete("room");
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function setConnectionDisplay(kind, text) {
    connectionDot.dataset.state = kind;
    connectionText.textContent = text;
  }

  function setConnectionPhase(phase, message, displayKind, displayText) {
    state.connection.phase = phase;
    state.connection.message = message;
    setConnectionDisplay(displayKind, displayText);
  }

  function setReduceMotion(enabled) {
    state.reduceMotion = Boolean(enabled);
    document.documentElement.dataset.reduceMotion = enabled ? "true" : "false";
    reduceMotionToggle.checked = enabled;
    writeBooleanPreference(MOTION_STORAGE_KEY, enabled);
  }

  function showToast(message, kind = "info", duration = 5_000) {
    if (!message) {
      return;
    }
    const toast = document.createElement("div");
    toast.className = `toast toast--${kind}`;
    toast.textContent = message;
    toastRegion.append(toast);
    window.setTimeout(() => toast.remove(), duration);
  }

  function humanizeSocketError(error) {
    const detailIssue = error?.details?.errors?.[0];
    if (detailIssue?.message) {
      return `${error.message} ${detailIssue.message}`;
    }
    return error?.message ?? "服务器没有确认该操作，请同步状态后重试。";
  }

  function createActionId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    return `action-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function emitRequest(eventName, payload = {}, options = {}) {
    return new Promise((resolve, reject) => {
      if (!state.socket?.connected) {
        reject({
          code: "CLIENT_OFFLINE",
          message: "与服务器的连接已中断，正在尝试重连。",
          details: {},
        });
        return;
      }
      state.socket
        .timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS)
        .emit(eventName, payload, (timeoutError, response) => {
          if (timeoutError) {
            reject({
              code: "REQUEST_TIMEOUT",
              message: "服务器尚未确认操作，已保留当前选择并尝试同步状态。",
              details: {},
            });
            return;
          }
          if (!response?.ok) {
            reject(
              response?.error ?? {
                code: "INVALID_SERVER_RESPONSE",
                message: "服务器返回了无法识别的应答。",
                details: {},
              },
            );
            return;
          }
          resolve(response.data ?? {});
        });
    });
  }

  function waitForState(predicate, timeoutMs = 3_000) {
    if (predicate(state.room)) {
      return Promise.resolve(state.room);
    }
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: null };
      waiter.timer = window.setTimeout(() => {
        state.stateWaiters = state.stateWaiters.filter(
          (candidate) => candidate !== waiter,
        );
        reject(new Error("等待服务器状态更新超时。"));
      }, timeoutMs);
      state.stateWaiters.push(waiter);
    });
  }

  function settleStateWaiters() {
    const remaining = [];
    for (const waiter of state.stateWaiters) {
      if (waiter.predicate(state.room)) {
        window.clearTimeout(waiter.timer);
        waiter.resolve(state.room);
      } else {
        remaining.push(waiter);
      }
    }
    state.stateWaiters = remaining;
  }

  async function ensureStateVersion(minimumVersion) {
    if ((state.room?.stateVersion ?? 0) >= minimumVersion) {
      return state.room;
    }
    try {
      return await waitForState(
        (room) => (room?.stateVersion ?? 0) >= minimumVersion,
        1_500,
      );
    } catch (_error) {
      const synced = await emitRequest("room:sync", {});
      if (synced.view) {
        acceptRoomState(synced.view);
      }
      return state.room;
    }
  }

  function placementDigest(placements) {
    return JSON.stringify(
      (placements ?? [])
        .map((placement) => ({
          id: placement.id,
          type: placement.type,
          cells: Data.sortCoordinates(placement.cells ?? []),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  }

  function resetDeployment(nextRoom) {
    const placements = clone(nextRoom?.own?.deployment ?? []);
    state.deployment.placements = placements;
    state.deployment.selectedId =
      Data.UNIT_DEFINITIONS.find(
        (definition) =>
          !placements.some((placement) => placement.id === definition.id),
      )?.id ?? "destroyer-i";
    state.deployment.orientations = {
      "destroyer-i": "horizontal",
      "destroyer-ii": "horizontal",
      pirate: "horizontal",
    };
    for (const placement of placements) {
      const definition = Data.getUnitDefinitionById(placement.id);
      if (definition?.shape === "line") {
        state.deployment.orientations[placement.id] =
          Data.placementOrientation(placement.cells);
      }
    }
    state.deployment.history = [];
    state.deployment.dirty = false;
    state.deployment.hoverCoordinate = null;
    state.deployment.serverDigest = placementDigest(nextRoom?.own?.deployment);
    state.deployment.cycleKey = nextRoom
      ? `${nextRoom.roomCode}:${nextRoom.matchSummary?.startedAt ?? "new"}:${nextRoom.stateVersion}`
      : null;
  }

  function clearBattleDraft() {
    state.battle.selectedAction = null;
    state.battle.target = null;
    state.battle.actionId = null;
    state.battle.helicopterAxis = null;
    state.battle.markerMode = false;
  }

  function prepareMarkerContext(room) {
    if (!room?.battle || !room?.own?.playerId) {
      return;
    }
    const targetPlayerId = state.battle.targetPlayerId ?? "default";
    const key = `${room.roomCode}:${room.own.playerId}:${targetPlayerId}`;
    if (state.battle.markerContext?.key !== key) {
      state.battle.markerContext = {
        key,
        roomCode: room.roomCode,
        playerId: room.own.playerId,
        targetPlayerId,
      };
      state.battle.markers = readMarkers(room.roomCode, room.own.playerId, targetPlayerId);
    }
    const resolved = Data.resolvedTargetSet(room.battle.own);
    let changed = false;
    for (const coordinate of state.battle.markers.keys()) {
      if (resolved.has(coordinate)) {
        state.battle.markers.delete(coordinate);
        changed = true;
      }
    }
    if (changed) {
      saveMarkers();
    }
  }

  function resolutionKey(room) {
    const feedback = room?.latestResolution?.feedback;
    if (!feedback) {
      return null;
    }
    return `${room.matchSummary?.startedAt ?? "match"}:${feedback.sequence}:${feedback.actorId}`;
  }

  function describeLatestResolution(room) {
    const delivery = room.latestResolution;
    const feedback = delivery?.feedback;
    if (!feedback) {
      return null;
    }
    const ownId = room.own.playerId;
    const actorName = Model.nicknameFor(room, feedback.actorId);
    const target = Model.formatTarget(feedback.target);
    const exactDamage = (feedback.inflictedDamage ?? [])
      .filter((event) => event.appliedDamage > 0)
      .map((event) => {
        const unit = Data.getUnitDefinitionByType(event.unitType);
        return `${unit?.name ?? "目标单位"}生命值变为 ${Model.formatHp(event.afterHp)}`;
      });
    const receivedHits = (feedback.receivedHits ?? [])
      .map((event) => {
        const unit = Data.getUnitDefinitionByType(event.unitType);
        return `${unit?.name ?? "己方单位"}被命中${event.sunk ? "并沉没" : ""}`;
      });
    if (feedback.actionType === Data.ACTION_TYPES.SUBMARINE_MISSILE) {
      return feedback.actorId === ownId
        ? `潜射导弹已发射至 ${target}；命中结果不会向你显示。`
        : receivedHits.length > 0
          ? `${actorName} 使用潜射导弹攻击了 ${target}；${receivedHits.join("；")}。`
          : `${actorName} 使用潜射导弹攻击了 ${target}。`;
    }
    if (feedback.actionType === Data.ACTION_TYPES.NUCLEAR_BOMB) {
      return feedback.actorId === ownId
        ? `核弹已投放至 ${target}；命中结果不会向你显示。`
        : receivedHits.length > 0
          ? `${actorName} 向 ${target} 投放了核弹；${receivedHits.join("；")}。`
          : `${actorName} 向 ${target} 投放了核弹。`;
    }
    if (feedback.actionType === Data.ACTION_TYPES.SHOCK_BOMB) {
      return feedback.actorId === ownId
        ? `震爆弹已作用于以 ${target} 为中心的 5×5 区域；是否生效不会向你显示。`
        : `${actorName} 以 ${target} 为中心使用了震爆弹。`;
    }
    if (feedback.result === "hit") {
      if (feedback.actorId === ownId && exactDamage.length > 0) {
        return `${feedback.actionName}：${target} 命中；${exactDamage.join("；")}。`;
      }
      if (feedback.actorId !== ownId && receivedHits.length > 0) {
        return `${feedback.actionName}：${receivedHits.join("；")}。`;
      }
      return `${feedback.actionName}：${target} 命中。`;
    }
    if (feedback.result === "miss") {
      return `${feedback.actionName}：${target} 未命中。`;
    }
    if (feedback.result === "underwater_signal_detected") {
      return `探测弹：${target} 周围探测到水下信号。`;
    }
    if (feedback.result === "no_underwater_signal") {
      return `探测弹：${target} 周围未探测到水下信号。`;
    }
    if (Array.isArray(feedback.cellResults)) {
      const hits = feedback.cellResults.filter((cell) => cell.result === "hit").length;
      const misses = feedback.cellResults.filter((cell) => cell.result === "miss").length;
      if (feedback.actorId === ownId && exactDamage.length > 0) {
        return `直升机扫射完成：命中 ${hits} 格，未命中 ${misses} 格；${exactDamage.join("；")}。`;
      }
      if (feedback.actorId !== ownId && receivedHits.length > 0) {
        return `直升机扫射完成：${receivedHits.join("；")}。`;
      }
      return `直升机扫射完成：命中 ${hits} 格，未命中 ${misses} 格。`;
    }
    return `${feedback.actionName}已经完成结算。`;
  }

  function acceptRoomState(nextRoom) {
    if (!nextRoom || typeof nextRoom.stateVersion !== "number") {
      return;
    }
    const previous = state.room;
    if (
      previous?.roomCode === nextRoom.roomCode &&
      nextRoom.stateVersion < previous.stateVersion
    ) {
      return;
    }

    const enteredDeployment =
      nextRoom.roomPhase === "DEPLOYING" &&
      (previous?.roomPhase !== "DEPLOYING" ||
        previous?.roomCode !== nextRoom.roomCode);
    if (enteredDeployment) {
      resetDeployment(nextRoom);
      clearBattleDraft();
      state.battle.lastResolutionKey = null;
      state.replayPlayerId = null;
      if (nextRoom.own?.playerId) {
        clearMarkersFor(nextRoom.roomCode, nextRoom.own.playerId);
      }
    } else if (nextRoom.roomPhase === "DEPLOYING") {
      state.deployment.serverDigest = placementDigest(nextRoom.own.deployment);
      if (nextRoom.seats.find((seat) => seat.playerId === nextRoom.own.playerId)?.ready) {
        state.deployment.placements = clone(nextRoom.own.deployment ?? []);
        state.deployment.dirty = false;
      }
    }

    const previousTurn = previous?.turn?.turnNumber;
    const nextResolutionKey = resolutionKey(nextRoom);
    const pendingActionResolved =
      state.battle.actionId &&
      nextRoom.latestResolution?.feedback?.actionId === state.battle.actionId;
    if (
      nextRoom.roomPhase !== "PLAYING" ||
      (previousTurn !== undefined && previousTurn !== nextRoom.turn?.turnNumber) ||
      pendingActionResolved
    ) {
      clearBattleDraft();
    }

    state.room = nextRoom;
    const availableTargets = nextRoom.battle?.opponentIds ?? [];
    if (!availableTargets.includes(state.battle.targetPlayerId)) {
      state.battle.targetPlayerId = availableTargets[0] ?? null;
    }
    document.title = nextRoom.turn?.canAct
      ? "轮到你行动 · 海战 OCEAN"
      : "海战 OCEAN";
    state.clockOffsetMs = Date.now() - nextRoom.serverNow;
    prepareMarkerContext(nextRoom);

    if (
      nextResolutionKey &&
      nextResolutionKey !== state.battle.lastResolutionKey
    ) {
      const feedback = nextRoom.latestResolution?.feedback;
      if (
        feedback?.actorId !== nextRoom.own.playerId &&
        state.battle.mobileMap !== "own"
      ) {
        state.battle.ownMapAlert = true;
      }
      const description = describeLatestResolution(nextRoom);
      if (description) {
        showToast(description, "result", 7_000);
      }
      state.battle.lastResolutionKey = nextResolutionKey;
    }

    if (nextRoom.roomPhase === "CLOSED") {
      clearStoredSession();
    }
    if (!state.replayPlayerId && nextRoom.roomPhase === "FINISHED") {
      state.replayPlayerId = nextRoom.own.playerId;
    }

    settleStateWaiters();
    render();
  }

  function getOwnSeat(room = state.room) {
    return room?.seats?.find((seat) => seat.playerId === room.own.playerId) ?? null;
  }

  function getServerNow() {
    return Date.now() - state.clockOffsetMs;
  }

  function formatCountdown(seconds) {
    if (seconds === null) {
      return "—";
    }
    if (seconds < 60) {
      return `${seconds} 秒`;
    }
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
  }

  function updateCountdowns() {
    const serverNow = getServerNow();
    document.querySelectorAll("[data-deadline]").forEach((element) => {
      const deadline = Number(element.dataset.deadline);
      const seconds = Model.remainingSeconds(deadline, serverNow);
      element.textContent = formatCountdown(seconds);
      element.dataset.tone = Model.countdownTone(seconds);
    });
  }

  function render() {
    headerRoomCode.hidden = !state.room?.roomCode;
    headerRoomCode.textContent = state.room?.roomCode
      ? `房间 ${state.room.roomCode}`
      : "";
    const page = Model.pageForState(state.room);
    const samePage = state.renderedPage === page;
    try {
      if (page === "P01") {
        app.innerHTML = renderEntryPage();
      } else if (page === "P02") {
        app.innerHTML = renderWaitingPage();
      } else if (page === "P03") {
        app.innerHTML = renderDeploymentPage();
      } else if (page === "P04") {
        app.innerHTML = renderRollingPage();
      } else if (page === "P05") {
        app.innerHTML = renderBattlePage();
      } else if (page === "P06") {
        app.innerHTML = renderFinishedPage();
      } else {
        app.innerHTML = renderClosedPage();
      }
      if (samePage) {
        app.querySelector(".page-enter")?.classList.remove("page-enter");
      }
      state.renderedPage = page;
    } catch (error) {
      console.error("[Ocean] 页面渲染失败", error);
      app.innerHTML = `
        <section class="fatal-card">
          <p class="eyebrow">界面恢复</p>
          <h1>页面状态未能显示</h1>
          <p>游戏状态仍由服务器保存。请刷新页面，客户端会使用本机凭证恢复座位。</p>
          <button class="button button--primary" data-action="reload">刷新页面</button>
        </section>`;
    }
    renderBlockingOverlay();
    updateCountdowns();
  }

  function renderEntryPage() {
    const stored = readStoredSession();
    const pending = state.pendingRequest;
    const roomCode = escapeHtml(state.entry.roomCode);
    return `
      <section class="entry-page page-enter" aria-labelledby="entry-title">
        <div class="entry-hero">
          <p class="eyebrow">双人 · 回合制 · 服务器权威</p>
          <h1 id="entry-title">在未知海域<br /><span>找到对方。</span></h1>
          <p class="entry-hero__summary">
            部署七个作战单位与三枚诱饵鱼雷，在不泄露舰队位置的前提下完成探测、震爆与九项战术行动。
          </p>
          <div class="entry-facts" aria-label="游戏要点">
            <span><strong>10×10</strong> 战术海域</span>
            <span><strong>90 秒</strong> 行动回合</span>
            <span><strong>2 人</strong> 私密对战</span>
          </div>
        </div>

        <div class="entry-console">
          ${state.connection.phase !== "online" ? `
            <article class="connection-help" role="status" aria-live="polite">
              <div>
                <strong>${escapeHtml(
                  state.connection.phase === "offline" ? "网络连接已中断" : "正在建立实时连接",
                )}</strong>
                <p>${escapeHtml(state.connection.message)}</p>
              </div>
              <button class="button button--secondary button--compact" data-action="retry-connection">
                立即重试
              </button>
            </article>` : ""}
          ${stored ? `
            <article class="restore-card">
              <div>
                <span class="status-kicker">检测到本机座位</span>
                <strong>房间 ${escapeHtml(stored.roomCode)}</strong>
                <small>使用本机私密凭证恢复，不会占用新席位。</small>
              </div>
              <div class="restore-card__actions">
                <button class="button button--primary button--compact" data-action="restore-session" ${!state.connected || pending ? "disabled" : ""}>
                  ${state.restoring ? "正在恢复…" : "恢复上次对局"}
                </button>
                <button class="button button--quiet button--compact" data-action="dismiss-session" ${pending ? "disabled" : ""}>忽略</button>
              </div>
            </article>` : ""}

          <div class="entry-form-card">
            <div class="entry-form-card__header">
              <span class="step-number">01</span>
              <div>
                <h2>建立身份</h2>
                <p>昵称只在当前房间显示，长度 1～12 个字符。</p>
              </div>
            </div>

            <label class="field">
              <span>你的昵称</span>
              <input
                id="nickname-input"
                name="nickname"
                maxlength="12"
                autocomplete="nickname"
                placeholder="例如：深蓝指挥官"
                value="${escapeHtml(state.entry.nickname)}"
                ${pending ? "disabled" : ""}
              />
              <small><span id="nickname-count">${Array.from(state.entry.nickname).length}</span>/12</small>
            </label>

            ${state.entry.error ? `<p class="form-error" role="alert">${escapeHtml(state.entry.error)}</p>` : ""}

            <form id="create-form" class="entry-action-block">
              <div>
                <strong>创建新房间</strong>
                <span>生成 6 位房间码，可选择双人或三人对战。</span>
              </div>
              <label class="field field--compact">
                <span>对战人数</span>
                <select id="max-players-input" ${pending ? "disabled" : ""}>
                  <option value="2" ${state.entry.maxPlayers === 2 ? "selected" : ""}>双人对战</option>
                  <option value="3" ${state.entry.maxPlayers === 3 ? "selected" : ""}>三人对战</option>
                </select>
              </label>
              <button class="button button--primary" type="submit" ${!state.connected || pending ? "disabled" : ""}>
                ${pending === "create" ? "正在创建…" : "创建房间"}
              </button>
            </form>

            <div class="entry-divider"><span>或加入已有房间</span></div>

            <form id="join-form" class="join-form">
              <label class="field field--code">
                <span>6 位房间码</span>
                <input
                  id="room-code-input"
                  name="roomCode"
                  maxlength="6"
                  inputmode="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="ABC234"
                  value="${roomCode}"
                  ${pending ? "disabled" : ""}
                />
              </label>
              <button class="button button--secondary" type="submit" ${!state.connected || pending ? "disabled" : ""}>
                ${pending === "join" ? "正在加入…" : "加入房间"}
              </button>
            </form>
          </div>

          <p class="entry-security">
            <span aria-hidden="true">◆</span>
            房间码用于邀请；恢复座位使用浏览器本机保存的独立私密凭证。
          </p>
        </div>
      </section>`;
  }

  function renderRoomTop(title, subtitle, options = {}) {
    const room = state.room;
    const deadline = options.deadline;
    return `
      <header class="room-topbar">
        <div>
          <p class="eyebrow">${escapeHtml(options.kicker ?? "PRIVATE MATCH")}</p>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="room-topbar__meta">
          ${deadline ? `
            <div class="timer-card">
              <span>${escapeHtml(options.timerLabel ?? "剩余时间")}</span>
              <strong data-deadline="${deadline}">—</strong>
            </div>` : ""}
          <div class="room-code-card">
            <span>房间码</span>
            <strong>${escapeHtml(room.roomCode)}</strong>
            <button class="text-button" data-action="copy-room">复制</button>
          </div>
        </div>
      </header>`;
  }

  function renderSeats(room, compact = false) {
    return `
      <div class="seat-list ${compact ? "seat-list--compact" : ""}">
        ${Array.from({ length: room.maxPlayers ?? 2 }, (_, index) => {
          const seat = room.seats[index];
          if (!seat) {
            return `
              <article class="seat-card seat-card--empty">
                <span class="seat-card__number">0${index + 1}</span>
                <div><strong>等待玩家</strong><small>席位尚未占用</small></div>
                <span class="seat-status">空闲</span>
              </article>`;
          }
          const own = seat.playerId === room.own.playerId;
          return `
            <article class="seat-card ${own ? "seat-card--own" : ""}">
              <span class="seat-card__number">0${index + 1}</span>
              <div>
                <strong>${escapeHtml(seat.nickname)} ${own ? "<em>你</em>" : ""}</strong>
                <small>${seat.ready ? (seat.autoPrepared ? "服务器已自动准备" : "舰队已准备") : "尚未准备"}</small>
              </div>
              <span class="seat-status" data-online="${seat.online}">
                <i></i>${seat.online ? "在线" : "离线"}
              </span>
            </article>`;
        }).join("")}
      </div>`;
  }

  function renderWaitingPage() {
    const room = state.room;
    const inviteUrl = `${window.location.origin}/?room=${room.roomCode}`;
    return `
      <section class="waiting-page page-enter" aria-labelledby="waiting-title">
        ${renderRoomTop("等待舰队接入", `坐满 ${room.maxPlayers ?? 2} 名玩家后，服务器将同时启动 180 秒舰队部署。`, {
          kicker: "P02 / 房间等待",
        })}
        <div class="waiting-layout">
          <div class="waiting-radar" aria-hidden="true">
            <span class="radar-sweep"></span>
            <i class="radar-point radar-point--one"></i>
            <i class="radar-point radar-point--two"></i>
            <strong>SEARCHING</strong>
            <small>等待另一名玩家</small>
          </div>
          <div class="waiting-panel">
            <p class="status-kicker">玩家席位</p>
            ${renderSeats(room)}
            <div class="invite-box">
              <span>邀请链接</span>
              <code>${escapeHtml(inviteUrl)}</code>
              <div class="invite-box__actions">
                <button class="button button--secondary button--compact" data-action="copy-invite">复制邀请链接</button>
                <button class="button button--quiet button--compact" data-action="share-invite">系统分享</button>
              </div>
            </div>
            <div class="inline-actions">
              <button class="button button--danger-quiet" data-action="leave-room">离开房间</button>
              <button class="button button--quiet" data-action="open-rules">查看精简规则</button>
            </div>
          </div>
        </div>
      </section>`;
  }

  function placementById(id) {
    return state.deployment.placements.find((placement) => placement.id === id) ?? null;
  }

  function occupantAt(coordinate, ignoredId = null) {
    return state.deployment.placements.find(
      (placement) =>
        placement.id !== ignoredId && placement.cells.includes(coordinate),
    ) ?? null;
  }

  function renderGrid(label, cellRenderer, className = "") {
    const contents = [
      '<span class="board-corner" aria-hidden="true"></span>',
      ...Data.COLUMNS.map(
        (column) => `<span class="board-axis board-axis--column">${column}</span>`,
      ),
    ];
    for (const row of Data.ROWS) {
      contents.push(`<span class="board-axis board-axis--row">${row}</span>`);
      for (const column of Data.COLUMNS) {
        const coordinate = `${row}${column}`;
        const cell = cellRenderer(coordinate) ?? {};
        const classes = ["board-cell", ...(cell.classes ?? [])].join(" ");
        const attributes = Object.entries(cell.attributes ?? {})
          .map(([name, value]) => `${name}="${escapeHtml(value)}"`)
          .join(" ");
        contents.push(`
          <button
            type="button"
            class="${classes}"
            aria-label="${escapeHtml(cell.label ?? coordinate)}"
            ${cell.disabled ? "disabled" : ""}
            ${cell.draggable ? 'draggable="true"' : ""}
            ${attributes}
          >${cell.content ?? ""}</button>`);
      }
    }
    return `
      <div class="board-frame ${className}">
        <div class="ocean-board" role="grid" aria-label="${escapeHtml(label)}">
          ${contents.join("")}
        </div>
      </div>`;
  }

  function renderDeploymentBoard(locked) {
    const selected = state.deployment.selectedId;
    const selectedPlacement = placementById(selected);
    const selectedDefinition = Data.getUnitDefinitionById(selected);
    const occupied = new Map();
    for (const placement of state.deployment.placements) {
      const definition = Data.getUnitDefinitionById(placement.id);
      for (const cell of placement.cells) {
        occupied.set(cell, { placement, definition });
      }
    }
    let validNextCarrierCells = new Set();
    if (
      selectedDefinition?.shape === "connected" &&
      (selectedPlacement?.cells.length ?? 0) < selectedDefinition.cellCount
    ) {
      const currentCells = selectedPlacement?.cells ?? [];
      validNextCarrierCells = new Set(
        (currentCells.length === 0
          ? Data.ALL_COORDINATES
          : currentCells.flatMap(Data.fourNeighbors)
        ).filter(
          (cell) =>
            !currentCells.includes(cell) &&
            !occupantAt(cell, selectedDefinition.id),
        ),
      );
    }
    const hoverPreview = getDeploymentHoverPreview(locked);
    const hoverCells = new Set(hoverPreview.cells);

    return renderGrid("己方舰队部署地图", (coordinate) => {
      const entry = occupied.get(coordinate);
      const classes = [];
      let content = "";
      let label = `${coordinate}，空海域`;
      if (entry) {
        classes.push("board-cell--unit", `board-cell--${entry.definition.category}`);
        if (entry.placement.id === selected) {
          classes.push("board-cell--selected-unit");
        }
        if (entry.placement.cells.length < entry.definition.cellCount) {
          classes.push("board-cell--partial");
        }
        content = `<span class="unit-glyph">${escapeHtml(entry.definition.shortName)}</span>`;
        label = `${coordinate}，${entry.definition.name}`;
      } else if (validNextCarrierCells.has(coordinate)) {
        classes.push("board-cell--legal-place");
        label = `${coordinate}，可作为航空母舰下一个连通格`;
      }
      if (hoverCells.has(coordinate)) {
        classes.push(
          hoverPreview.valid
            ? "board-cell--placement-preview-valid"
            : "board-cell--placement-preview-invalid",
        );
      }
      return {
        classes,
        content,
        label,
        disabled: locked,
        draggable: Boolean(entry && !locked),
        attributes: {
          "data-action": "deployment-cell",
          "data-coordinate": coordinate,
          ...(entry
            ? {
                "data-placement-id": entry.placement.id,
                "data-deployment-cell": "true",
              }
            : {}),
        },
      };
    }, locked ? "board-frame--locked" : "");
  }

  function getDeploymentHoverPreview(locked) {
    const coordinate = state.deployment.hoverCoordinate;
    const id = state.deployment.selectedId;
    const definition = Data.getUnitDefinitionById(id);
    if (locked || !coordinate || !definition) {
      return { cells: [], valid: false };
    }
    const existing = placementById(id);
    if (definition.shape === "connected") {
      const current = existing?.cells ?? [];
      if (current.length < definition.cellCount) {
        const valid =
          !current.includes(coordinate) &&
          !occupantAt(coordinate, id) &&
          (current.length === 0 ||
            current.some((cell) => Data.fourNeighbors(cell).includes(coordinate)));
        return { cells: [coordinate], valid };
      }
      const anchor = Data.parseCoordinate(coordinate);
      const points = current.map(Data.parseCoordinate);
      const minRow = Math.min(...points.map((point) => point.row));
      const minColumn = Math.min(...points.map((point) => point.column));
      const translated = points
        .map((point) =>
          Data.formatCoordinate(
            anchor.row + point.row - minRow,
            anchor.column + point.column - minColumn,
          ),
        )
        .filter(Boolean);
      return {
        cells: translated,
        valid:
          translated.length === definition.cellCount &&
          candidateIsFree(id, translated),
      };
    }
    const cells = Data.createAnchoredCells(
      definition,
      coordinate,
      state.deployment.orientations[id] ?? "horizontal",
    );
    return {
      cells,
      valid:
        cells.length === definition.cellCount && candidateIsFree(id, cells),
    };
  }

  function updateDeploymentPreview(coordinate) {
    if (state.room?.roomPhase !== "DEPLOYING") return;
    state.deployment.hoverCoordinate = coordinate;
    const ownSeat = getOwnSeat();
    const locked = Boolean(ownSeat?.ready || state.room.deploymentsLocked);
    const preview = coordinate
      ? getDeploymentHoverPreview(locked)
      : { cells: [], valid: false };
    const previewCells = new Set(preview.cells);
    document
      .querySelectorAll(
        ".deployment-map-card [data-action=\"deployment-cell\"]",
      )
      .forEach((cell) => {
        cell.classList.remove(
          "board-cell--placement-preview-valid",
          "board-cell--placement-preview-invalid",
        );
        if (previewCells.has(cell.dataset.coordinate)) {
          cell.classList.add(
            preview.valid
              ? "board-cell--placement-preview-valid"
              : "board-cell--placement-preview-invalid",
          );
        }
      });
  }

  function updateDeploymentSelectionUi() {
    if (state.room?.roomPhase !== "DEPLOYING") return;
    const definition = Data.getUnitDefinitionById(state.deployment.selectedId);
    if (!definition) return;
    document
      .querySelectorAll('[data-action="select-placement"]')
      .forEach((item) => {
        const selected = item.dataset.placementId === definition.id;
        item.classList.toggle("fleet-item--selected", selected);
        item.setAttribute("aria-pressed", String(selected));
      });
    document
      .querySelectorAll(".deployment-map-card [data-placement-id]")
      .forEach((cell) => {
        cell.classList.toggle(
          "board-cell--selected-unit",
          cell.dataset.placementId === definition.id,
        );
      });
    const selectedCard = document.querySelector(".selected-placement-card");
    if (selectedCard) {
      selectedCard.querySelector(".selected-placement-card__icon").textContent =
        definition.shortName;
      selectedCard.querySelector("strong").textContent = definition.name;
      selectedCard.querySelector("small").textContent = definition.shapeText;
    }
    const boardHelp = document.querySelector(".deployment-map-card .board-help");
    if (boardHelp) {
      boardHelp.textContent = definition.shape === "connected"
        ? "航空母舰：依次选择 6 个四向连通格；点击已选的最后一格可撤销。"
        : "选中对象后点击地图起点；桌面端也可拖动已放置对象。按 R 旋转直线单位。";
    }
    const removeButton = document.querySelector('[data-action="remove-placement"]');
    if (removeButton) {
      const ownSeat = getOwnSeat();
      const locked = Boolean(ownSeat?.ready || state.room.deploymentsLocked);
      removeButton.disabled = locked || !placementById(definition.id);
    }
    updateDeploymentPreview(null);
  }

  function renderDeploymentInventory(locked) {
    return `
      <div class="fleet-inventory">
        ${Data.UNIT_DEFINITIONS.map((definition) => {
          const placement = placementById(definition.id);
          const count = placement?.cells.length ?? 0;
          const complete = count === definition.cellCount;
          const selected = state.deployment.selectedId === definition.id;
          const orientation = definition.shape === "line"
            ? state.deployment.orientations[definition.id] ?? "horizontal"
            : null;
          return `
            <button
              type="button"
              class="fleet-item ${selected ? "fleet-item--selected" : ""} ${complete ? "fleet-item--placed" : ""}"
              data-action="select-placement"
              data-placement-id="${definition.id}"
              aria-pressed="${selected}"
              ${locked ? "disabled" : ""}
            >
              <span class="fleet-item__icon fleet-item__icon--${definition.category}">${escapeHtml(definition.shortName)}</span>
              <span class="fleet-item__body">
                <strong>${escapeHtml(definition.name)}</strong>
                <small>${escapeHtml(definition.shapeText)}${orientation ? ` · ${orientation === "horizontal" ? "横向" : "纵向"}` : ""}</small>
              </span>
              <span class="fleet-item__state" data-complete="${complete}">
                ${complete ? "已放置" : count > 0 ? `${count}/${definition.cellCount}` : "未放置"}
              </span>
            </button>`;
        }).join("")}
      </div>`;
  }

  function renderDeploymentPage() {
    const room = state.room;
    const ownSeat = getOwnSeat();
    const locked = Boolean(ownSeat?.ready || room.deploymentsLocked);
    const validation = Data.validateDeployment(state.deployment.placements);
    const selectedDefinition = Data.getUnitDefinitionById(
      state.deployment.selectedId,
    );
    const latestAutoEvent = [...room.systemEvents]
      .reverse()
      .find((event) => event.kind === "deployment_timeout_auto_ready");
    const pausedRemaining = room.connection?.pausedTimer?.kind === "deployment"
      ? Math.ceil(room.connection.pausedTimer.remainingMs / 1000)
      : null;
    return `
      <section class="deployment-page page-enter" aria-labelledby="deployment-title">
        ${renderRoomTop("部署己方舰队", "全部对象可以相邻，但不能重叠或越界。提交准备后仍由服务器完整验证。", {
          kicker: "P03 / 舰队部署",
          deadline: room.deadlines.deploymentDeadlineAt,
          timerLabel: "部署剩余",
        })}
        ${pausedRemaining !== null ? `<div class="status-banner status-banner--warning">部署计时已暂停，恢复后剩余 ${formatCountdown(pausedRemaining)}。</div>` : ""}
        ${latestAutoEvent ? `<div class="status-banner">${escapeHtml(latestAutoEvent.message)}</div>` : ""}
        ${renderSeats(room, true)}

        <div class="deployment-layout">
          <aside class="deployment-panel deployment-panel--fleet">
            <div class="panel-heading">
              <span>舰队清单</span><small>7 个作战单位 · 3 枚诱饵</small>
            </div>
            ${renderDeploymentInventory(locked)}
          </aside>

          <section class="deployment-map-card">
            <div class="map-card__heading">
              <div>
                <span class="status-kicker">己方海域</span>
                <h2>10×10 部署图</h2>
              </div>
              <span class="map-state" data-ready="${locked}">${locked ? "部署已锁定" : "编辑中"}</span>
            </div>
            ${renderDeploymentBoard(locked)}
            <p class="board-help">
              ${locked
                ? "本方已准备。对方准备前可取消准备并继续编辑。"
                : selectedDefinition?.shape === "connected"
                  ? "航空母舰：依次选择 6 个四向连通格；点击已选的最后一格可撤销。"
                  : "选中对象后点击地图起点；桌面端也可拖动已放置对象。按 R 旋转直线单位。"}
            </p>
          </section>

          <aside class="deployment-panel deployment-panel--guide">
            <div class="panel-heading"><span>当前操作</span><small>提交前均可撤销</small></div>
            <div class="selected-placement-card">
              <span class="selected-placement-card__icon">${escapeHtml(selectedDefinition?.shortName ?? "—")}</span>
              <div>
                <strong>${escapeHtml(selectedDefinition?.name ?? "未选择")}</strong>
                <small>${escapeHtml(selectedDefinition?.shapeText ?? "")}</small>
              </div>
            </div>
            <div class="guide-actions">
              <button class="button button--secondary button--compact" data-action="rotate-placement" ${locked || !selectedDefinition ? "disabled" : ""}>旋转 <kbd>R</kbd></button>
              <button class="button button--quiet button--compact" data-action="remove-placement" ${locked || !placementById(state.deployment.selectedId) ? "disabled" : ""}>撤回</button>
              <button class="button button--quiet button--compact" data-action="undo-deployment" ${locked || state.deployment.history.length === 0 ? "disabled" : ""}>撤销</button>
            </div>
            <div class="validation-card" data-valid="${validation.valid}">
              <strong>${validation.valid ? "部署完整合法" : `还需处理 ${validation.errors.length} 项`}</strong>
              ${validation.valid
                ? "<p>可以提交并准备。</p>"
                : `<ul>${validation.errors.slice(0, 5).map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>`}
            </div>
            <div class="deployment-tips">
              <strong>部署约束</strong>
              <span>直线单位必须水平或垂直连续</span>
              <span>潜水艇与核潜艇均为完整 2×2</span>
              <span>航空母舰六格必须全部四向连通</span>
            </div>
          </aside>
        </div>

        <div class="deployment-toolbar">
          <div>
            <button class="button button--secondary" data-action="random-deployment" ${locked ? "disabled" : ""}>随机部署</button>
            <button class="button button--quiet" data-action="clear-deployment" ${locked || state.deployment.placements.length === 0 ? "disabled" : ""}>清空部署</button>
          </div>
          <div>
            <button class="button button--danger-quiet" data-action="leave-room">离开房间</button>
            ${ownSeat?.ready
              ? `<button class="button button--secondary" data-action="cancel-ready" ${room.deploymentsLocked ? "disabled" : ""}>取消准备</button>`
              : `<button class="button button--primary" data-action="ready-deployment" ${!validation.valid || state.pendingRequest ? "disabled" : ""}>${state.pendingRequest === "ready" ? "正在提交…" : "准备"}</button>`}
          </div>
        </div>
      </section>`;
  }

  function diceGlyph(value) {
    return ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value] ?? "—";
  }

  function renderRollingPage() {
    const room = state.room;
    const rounds = room.rolling?.rounds ?? [];
    const currentRound = rounds.at(-1) ?? null;
    const firstPlayer = room.rolling?.firstPlayerId
      ? Model.nicknameFor(room, room.rolling.firstPlayerId)
      : null;
    return `
      <section class="rolling-page page-enter" aria-labelledby="rolling-title">
        ${renderRoomTop("决定第一回合", "骰子由服务器一次性生成；客户端动画不会改变结果。", {
          kicker: "P04 / 掷骰决定先手",
        })}
        <div class="rolling-stage ${state.reduceMotion ? "rolling-stage--still" : ""}">
          ${room.seats.map((seat, index) => `
            <article class="die-player ${seat.playerId === room.rolling?.firstPlayerId ? "die-player--winner" : ""}">
              <span class="die-player__seat">席位 0${index + 1}${seat.playerId === room.own.playerId ? " · 你" : ""}</span>
              <strong>${escapeHtml(seat.nickname)}</strong>
              <div class="die" aria-label="骰子点数 ${currentRound?.rolls?.[seat.playerId] ?? "等待"}">
                ${diceGlyph(currentRound?.rolls?.[seat.playerId])}
              </div>
              <small>${currentRound ? `${currentRound.rolls[seat.playerId]} 点` : "服务器正在掷骰"}</small>
            </article>`).join("")}
          <div class="rolling-versus">VS</div>
        </div>
        <div class="rolling-result" role="status">
          ${!currentRound
            ? "<strong>服务器正在生成结果…</strong>"
            : currentRound.tied
              ? `<strong>点数相同，重新掷骰</strong><span>第 ${currentRound.round} 轮平局</span>`
              : `<strong>${escapeHtml(firstPlayer)} 获得第一回合</strong><span>即将进入正式对战</span>`}
        </div>
        ${rounds.length > 1 ? `
          <ol class="roll-history" aria-label="掷骰历史">
            ${rounds.map((round) => `
              <li>
                <span>第 ${round.round} 轮</span>
                ${room.seats.map((seat) => `<b>${escapeHtml(seat.nickname)} ${round.rolls[seat.playerId]} 点</b>`).join("")}
                <em>${round.tied ? "同点" : "已分出先手"}</em>
              </li>`).join("")}
          </ol>` : ""}
      </section>`;
  }

  function ownBattleCellMap(snapshot) {
    const map = new Map();
    for (const unit of snapshot?.units ?? []) {
      const definition = Data.getUnitDefinitionByType(unit.type);
      for (const coordinate of unit.cells) {
        map.set(coordinate, { kind: "unit", unit, definition });
      }
    }
    for (const decoy of snapshot?.decoys ?? []) {
      map.set(decoy.cell, {
        kind: "decoy",
        decoy,
        definition: Data.getUnitDefinitionByType(Data.UNIT_TYPES.DECOY_TORPEDO),
      });
    }
    return map;
  }

  function renderOwnBattleBoard(snapshot, options = {}) {
    const map = ownBattleCellMap(snapshot);
    const centerCells = new Set(
      Data.destroyerCenterCells(state.battle.selectedAction, snapshot),
    );
    const selectedDefinition = Data.getActionDefinition(state.battle.selectedAction);
    return renderGrid(options.label ?? "己方地图", (coordinate) => {
      const entry = map.get(coordinate);
      const classes = [];
      let content = "";
      let label = `${coordinate}，空海域`;
      if (entry?.kind === "unit") {
        const { unit, definition } = entry;
        const hit = unit.hitCells.includes(coordinate);
        const sunk = unit.hp <= 0;
        classes.push("board-cell--unit", `board-cell--${definition.category}`);
        if (hit) classes.push("board-cell--own-hit");
        if (sunk) classes.push("board-cell--wreck");
        if (unit.paralyzed) classes.push("board-cell--paralyzed");
        if (selectedDefinition?.sourceType === unit.type) {
          classes.push("board-cell--source");
        }
        if (centerCells.has(coordinate)) {
          classes.push("board-cell--range-center");
        }
        content = `<span class="unit-glyph">${escapeHtml(definition.shortName)}</span>${hit ? '<span class="cell-state-glyph">✦</span>' : ""}`;
        label = `${coordinate}，${definition.name}，生命值 ${Model.formatHp(unit.hp)}${hit ? "，该格已受击" : ""}${sunk ? "，已沉没" : ""}${unit.paralyzed ? "，本回合瘫痪" : ""}`;
      } else if (entry?.kind === "decoy") {
        classes.push("board-cell--unit", "board-cell--decoy");
        if (entry.decoy.destroyed) classes.push("board-cell--wreck");
        content = `<span class="unit-glyph">雷</span>${entry.decoy.destroyed ? '<span class="cell-state-glyph">×</span>' : ""}`;
        label = `${coordinate}，诱饵鱼雷${entry.decoy.destroyed ? "，已摧毁" : "，有效"}`;
      }
      return {
        classes,
        content,
        label,
        disabled: true,
        attributes: { "data-coordinate": coordinate },
      };
    }, options.replay ? "board-frame--replay" : "");
  }

  function currentIntelligenceArea(ownBattle) {
    const areas = (ownBattle?.intelligenceAreas ?? []).filter(
      (area) => !area.defenderId || area.defenderId === state.battle.targetPlayerId,
    );
    if (areas.length === 0) {
      return null;
    }
    if (state.battle.selectedIntelligenceSequence === -1) {
      return null;
    }
    if (state.battle.selectedIntelligenceSequence !== null) {
      return areas.find(
        (area) => area.sequence === state.battle.selectedIntelligenceSequence,
      ) ?? areas.at(-1);
    }
    return areas.at(-1);
  }

  function legalTargetCells(ownBattle) {
    if (!state.battle.selectedAction) {
      return new Set();
    }
    const options = Data.getTargetOptions(state.battle.selectedAction, ownBattle);
    const definition = Data.getActionDefinition(state.battle.selectedAction);
    if (definition.targetMode !== "line") {
      return new Set(options.map((option) => option.coordinate));
    }
    const axis = state.battle.helicopterAxis;
    return new Set(
      options
        .filter((option) => option.kind === axis)
        .flatMap(Data.getFullLine),
    );
  }

  function renderEnemyBoard(ownBattle) {
    const enemyMap = ownBattle.enemyMapsByPlayer?.[state.battle.targetPlayerId]
      ?? ownBattle.enemyMap;
    const results = enemyMap?.cellResults ?? {};
    const missiles = new Set(enemyMap?.submarineMissileMarkers ?? []);
    const nuclearBombs = new Set(enemyMap?.nuclearBombMarkers ?? []);
    const effectiveOwnBattle = { ...ownBattle, enemyMap };
    const legal = legalTargetCells(effectiveOwnBattle);
    const preview = new Set(
      Data.previewCells(state.battle.selectedAction, state.battle.target),
    );
    const intelligence = currentIntelligenceArea(ownBattle);
    const intelligenceCells = new Set(intelligence?.area ?? []);
    return renderGrid("敌方地图", (coordinate) => {
      const result = results[coordinate];
      const resolved = result === "hit" || result === "miss";
      const hasMissile = missiles.has(coordinate) && !resolved;
      const hasNuclearBomb = nuclearBombs.has(coordinate) && !resolved;
      const marker = !resolved ? state.battle.markers.get(coordinate) : null;
      const hasMarker = Boolean(marker);
      const classes = [];
      let content = "";
      let stateText = "未知";
      if (result === "hit") {
        classes.push("board-cell--enemy-hit");
        content = '<span class="enemy-result">✦</span>';
        stateText = "命中，已结算";
      } else if (result === "miss") {
        classes.push("board-cell--enemy-miss");
        content = '<span class="enemy-result">×</span>';
        stateText = "未命中，已结算";
      } else if (hasMissile) {
        classes.push("board-cell--missile");
        content = '<span class="missile-glyph">↗</span>';
        stateText = "导弹已发射，仍未结算";
      } else if (hasNuclearBomb) {
        classes.push("board-cell--missile");
        content = '<span class="missile-glyph">☢</span>';
        stateText = "核弹已投放，命中情况保密";
      } else if (hasMarker) {
        classes.push("board-cell--marker", `board-cell--marker-${marker}`);
        content = marker === "occupied" ? '<span class="marker-glyph">●</span>' : '<span class="marker-half marker-half--top"></span><span class="marker-half marker-half--bottom"></span>';
        const markerText = { occupied: "确定有布局", surface_yes: "水面有布局", surface_no: "水面无布局", underwater_yes: "水下有布局", underwater_no: "水下无布局" }[marker];
        stateText = `未知，本机标记：${markerText}`;
      }
      if (intelligenceCells.has(coordinate)) {
        classes.push(
          intelligence.kind === "shock"
            ? "board-cell--intel-shock"
            : "board-cell--intel-detection",
        );
      }
      if (legal.has(coordinate)) {
        classes.push("board-cell--legal-target");
      }
      if (preview.has(coordinate)) {
        classes.push("board-cell--target-preview");
      }
      const targetMode = state.battle.markerMode
        ? "切换私人标记"
        : legal.has(coordinate)
          ? "可选择为目标"
          : "当前不可选";
      return {
        classes,
        content,
        label: `${coordinate}，${stateText}，${targetMode}`,
        attributes: {
          "data-action": "enemy-cell",
          "data-coordinate": coordinate,
          "aria-pressed": preview.has(coordinate) || hasMarker ? "true" : "false",
        },
      };
    });
  }

  function unitStatusText(unit) {
    if (unit.hp <= 0) return "已沉没";
    if (unit.paralyzed) return "瘫痪：本回合不能行动";
    return "可行动";
  }

  function renderOwnUnitStatus(ownBattle) {
    const units = [...(ownBattle.units ?? [])].sort((left, right) => {
      const leftIndex = Data.UNIT_DEFINITIONS.findIndex((unit) => unit.type === left.type);
      const rightIndex = Data.UNIT_DEFINITIONS.findIndex((unit) => unit.type === right.type);
      return leftIndex - rightIndex;
    });
    return `
      <div class="unit-status-list">
        ${units.map((unit) => {
          const definition = Data.getUnitDefinitionByType(unit.type);
          return `
            <article class="unit-status ${unit.hp <= 0 ? "unit-status--sunk" : ""} ${unit.paralyzed ? "unit-status--paralyzed" : ""}">
              <span class="unit-status__icon">${escapeHtml(definition.shortName)}</span>
              <div>
                <strong>${escapeHtml(definition.name)}</strong>
                <small>${escapeHtml(unitStatusText(unit))}</small>
              </div>
              <span class="hp-meter" aria-label="生命值 ${Model.formatHp(unit.hp)} / ${definition.initialHp}">
                <b>${Model.formatHp(unit.hp)}</b><i>/ ${definition.initialHp}</i>
              </span>
            </article>`;
        }).join("")}
        <article class="decoy-status">
          <strong>诱饵鱼雷</strong>
          <span>${ownBattle.decoys.filter((decoy) => !decoy.destroyed).length} / 3 有效</span>
        </article>
      </div>`;
  }

  function renderActionPanel(room) {
    const ownBattle = room.battle.own;
    const selectedDefinition = Data.getActionDefinition(state.battle.selectedAction);
    return `
      <aside class="action-rail ${state.battle.actionDrawerOpen ? "action-rail--open" : ""}" aria-label="行动与单位状态">
        <button class="action-rail__heading" type="button" data-action="toggle-action-drawer" aria-expanded="${state.battle.actionDrawerOpen}">
          <div>
            <span class="status-kicker">行动面板</span>
            <h2>${room.turn?.canAct ? "选择本回合行动" : "等待行动"}</h2>
          </div>
          <span class="turn-lock" data-active="${room.turn?.canAct}">${room.turn?.canAct ? "你的回合" : "已锁定"}</span>
          <span class="drawer-chevron" aria-hidden="true">⌃</span>
        </button>
        <div class="action-rail__content">
        ${(room.battle.opponentIds?.length ?? 0) > 1 ? `
          <label class="field target-player-field">
            <span>本回合攻击对象</span>
            <select id="target-player-input">
              ${room.battle.opponentIds.map((playerId) => `
                <option value="${escapeHtml(playerId)}" ${state.battle.targetPlayerId === playerId ? "selected" : ""}>
                  ${escapeHtml(Model.nicknameFor(room, playerId))}
                </option>`).join("")}
            </select>
          </label>` : ""}
        <div class="action-list">
          ${Data.ACTION_DEFINITIONS.map((definition) => {
            const status = Model.deriveActionStatus(room, definition);
            const selected = definition.type === state.battle.selectedAction;
            return `
              <button
                type="button"
                class="action-card ${selected ? "action-card--selected" : ""}"
                data-action="select-action"
                data-action-type="${definition.type}"
                data-status="${status.code}"
                ${status.enabled ? "" : "disabled"}
              >
                <span class="action-card__index">${String(Data.ACTION_DEFINITIONS.indexOf(definition) + 1).padStart(2, "0")}</span>
                <span class="action-card__body">
                  <strong>${escapeHtml(definition.name)}</strong>
                  <small>${escapeHtml(status.label)}</small>
                </span>
                <span class="action-card__resource">${escapeHtml(Model.actionResourceLabel(room, definition))}</span>
              </button>`;
          }).join("")}
        </div>

        ${selectedDefinition ? `
          <div class="target-instruction">
            <strong>${escapeHtml(selectedDefinition.name)}</strong>
            <p>${selectedDefinition.targetMode === "line"
              ? "先选择行或列，再点击敌方地图中的任意一格。"
              : selectedDefinition.targetMode === "area"
                ? "在敌方地图选择能形成完整作用区域的中心格。"
                : "在敌方地图选择一个高亮的合法目标格。"}</p>
            ${selectedDefinition.targetMode === "line" ? `
              <div class="axis-switch" role="group" aria-label="直升机扫射方向">
                <button class="button button--compact ${state.battle.helicopterAxis === "row" ? "button--primary" : "button--quiet"}" data-action="set-helicopter-axis" data-axis="row">选择一行</button>
                <button class="button button--compact ${state.battle.helicopterAxis === "column" ? "button--primary" : "button--quiet"}" data-action="set-helicopter-axis" data-axis="column">选择一列</button>
              </div>` : ""}
            ${state.battle.target ? `
              <div class="chosen-target">
                <span>已选目标</span><strong>${escapeHtml(Model.formatTarget(state.battle.target))}</strong>
                <button class="text-button" data-action="reopen-action-confirm">确认提交</button>
              </div>` : ""}
            <button class="text-button" data-action="cancel-action-selection">取消行动选择</button>
          </div>` : ""}

        <details class="unit-drawer">
          <summary>己方单位状态</summary>
          ${renderOwnUnitStatus(ownBattle)}
        </details>
        </div>
      </aside>`;
  }

  function renderBattleHeader(room) {
    const current = room.turn?.currentPlayerId;
    const currentName = current ? Model.nicknameFor(room, current) : "服务器";
    const canAct = room.turn?.canAct;
    return `
      <header class="battle-header">
        <div class="battle-header__room">
          <span>房间 ${escapeHtml(room.roomCode)}</span>
          <button class="text-button" data-action="copy-room">复制</button>
        </div>
        <div class="battle-header__turn" data-own-turn="${canAct}">
          <small>第 ${room.turn?.turnNumber ?? room.matchSummary.turnCount} 回合</small>
          <strong>${canAct ? "你的回合" : `等待 ${escapeHtml(currentName)}`}</strong>
        </div>
        <div class="battle-header__timer">
          <span>行动剩余</span>
          ${room.deadlines.actionDeadlineAt
            ? `<strong data-deadline="${room.deadlines.actionDeadlineAt}">—</strong>`
            : `<strong>${room.turnPhase === "RESOLVING" ? "结算中" : room.turnPhase === "AUTO_SKIPPING" ? "自动跳过" : "暂停"}</strong>`}
        </div>
        <div class="battle-header__players">
          ${room.seats.map((seat) => `
            <span data-online="${seat.online}"><i></i>${escapeHtml(seat.nickname)}${seat.playerId === room.own.playerId ? "（你）" : ""}</span>`).join("")}
        </div>
        <div class="battle-header__timeouts">
          <span>本方连续超时</span><strong>${room.own.consecutiveActionTimeouts} / 3</strong>
        </div>
      </header>`;
  }

  function renderLatestFeedback(room) {
    const feedback = room.latestResolution?.feedback;
    if (!feedback) {
      return "";
    }
    const ownDamage = feedback.ownDamage ?? [];
    const decoys = feedback.ownDecoyChanges ?? [];
    return `
      <section class="resolution-strip" aria-label="最近一次行动反馈">
        <div>
          <span class="status-kicker">最近结算</span>
          <strong>${escapeHtml(describeLatestResolution(room))}</strong>
        </div>
        ${ownDamage.length || decoys.length ? `
          <ul>
            ${ownDamage.map((event) => {
              const definition = Data.getUnitDefinitionByType(event.unitType);
              return `<li>${escapeHtml(definition?.name ?? event.unitId)}：生命值 ${Model.formatHp(event.beforeHp)} → ${Model.formatHp(event.afterHp)}${event.sunk ? "，已沉没" : ""}</li>`;
            }).join("")}
            ${decoys.map((event) => `<li>诱饵鱼雷 ${escapeHtml(event.decoyId)}（${escapeHtml(event.cell)}）已被摧毁</li>`).join("")}
          </ul>` : ""}
      </section>`;
  }

  function renderPublicLog(room) {
    const actions = room.battle?.publicActionLog ?? [];
    const turnEvents = room.turnEvents ?? [];
    const systemEvents = room.systemEvents ?? [];
    const items = [
      ...actions.map((record) => ({
        sort: record.sequence * 3,
        kind: "action",
        record,
        text: Model.publicActionText(record, room),
      })),
      ...turnEvents.map((event) => ({
        sort: event.sequence * 3 + 1,
        kind: event.kind,
        event,
        text: Model.turnEventText(event, room),
      })),
      ...systemEvents.map((event) => ({
        sort: event.sequence * 3 + 2,
        kind: "system",
        event,
        text: event.message,
      })),
    ].sort((left, right) => right.sort - left.sort);
    return `
      <section class="log-panel ${state.battle.logOpen ? "log-panel--open" : ""}">
        <button class="panel-heading log-panel__toggle" type="button" data-action="toggle-log" aria-expanded="${state.battle.logOpen}">
          <span>公开行动记录</span><small>不包含敌方秘密信息</small><i aria-hidden="true">⌃</i>
        </button>
        <div class="log-panel__content">
        ${items.length === 0
          ? '<p class="empty-state">尚无公开记录。</p>'
          : `<ol class="action-log">
              ${items.map((item) => {
                const record = item.record;
                const intelligence = record &&
                  record.actorId === room.own.playerId &&
                  [Data.ACTION_TYPES.SHOCK_BOMB, Data.ACTION_TYPES.DETECTION_BOMB].includes(record.actionType);
                return `
                  <li data-kind="${escapeHtml(item.kind)}">
                    <span class="log-dot"></span>
                    <div><small>${record ? `行动 ${record.sequence}` : "系统"}</small><p>${escapeHtml(item.text)}</p></div>
                    ${intelligence ? `<button class="text-button" data-action="select-intelligence" data-sequence="${record.sequence}">高亮区域</button>` : ""}
                  </li>`;
              }).join("")}
            </ol>`}
        </div>
      </section>`;
  }

  function renderBattlePage() {
    const room = state.room;
    const battle = room.battle;
    if (!battle) {
      return '<section class="boot-card"><span class="sonar"></span><p>正在同步安全战场视图……</p></section>';
    }
    const ownActive = state.battle.mobileMap === "own";
    const finalSalvo = room.roomPhase === "FINAL_SALVO";
    const finalSalvoState = battle.match?.finalSalvo;
    const availableFinalDecoys = (battle.own.decoys ?? []).filter(
      (decoy) => finalSalvoState?.availableDecoyIds?.includes(decoy.id),
    );
    const intel = currentIntelligenceArea(battle.own);
    return `
      <section class="battle-page page-enter" aria-labelledby="battle-page-title">
        <h1 id="battle-page-title" class="sr-only">正式对战</h1>
        ${renderBattleHeader(room)}
        ${finalSalvo ? `
          <div class="final-salvo-banner">
            <span class="sonar sonar--small"></span>
            <div>
              <strong>手动鱼雷引爆 · 第 ${finalSalvoState?.round ?? "—"} 轮</strong>
              ${finalSalvoState?.status === "selecting"
                ? finalSalvoState.ownSubmitted
                  ? `<p>本轮选择已秘密提交，正在等待对方。${finalSalvoState.opponentSubmitted ? "双方选择已齐，服务器正在同时结算。" : ""}</p>`
                  : availableFinalDecoys.length > 0
                    ? `<p>选择一枚尚未触发的己方诱饵鱼雷。双方提交后同时攻击各自对应坐标。</p>
                       <div class="final-salvo-actions">${availableFinalDecoys.map((decoy) => `<button class="button button--secondary" data-action="submit-final-salvo" data-decoy-id="${escapeHtml(decoy.id)}">引爆 ${escapeHtml(decoy.cell)}</button>`).join("")}</div>`
                    : "<p>本方已无可引爆鱼雷，服务器将自动跳过并等待对方。</p>"
                : "<p>全部鱼雷已经结算，正在生成最终结果。</p>"}
            </div>
          </div>` : ""}
        ${renderLatestFeedback(room)}

        <div class="mobile-map-tabs" role="tablist" aria-label="地图切换">
          <button role="tab" aria-selected="${!ownActive}" class="${!ownActive ? "is-active" : ""}" data-action="switch-map" data-map="enemy">敌方地图</button>
          <button role="tab" aria-selected="${ownActive}" class="${ownActive ? "is-active" : ""}" data-action="switch-map" data-map="own">
            己方地图 ${state.battle.ownMapAlert ? '<i class="alert-dot" aria-label="有新的己方受击信息"></i>' : ""}
          </button>
        </div>

        <div class="battle-layout">
          <div class="battle-maps">
            <section class="battle-map-card battle-map-card--enemy ${!ownActive ? "is-mobile-active" : ""}" data-map-panel="enemy">
              <div class="map-card__heading">
                <div><span class="status-kicker">目标海域</span><h2>敌方地图</h2></div>
                <button
                  class="marker-toggle ${state.battle.markerMode ? "marker-toggle--active" : ""}"
                  data-action="toggle-marker-mode"
                  aria-pressed="${state.battle.markerMode}"
                >标记模式 <kbd>M</kbd></button>
              </div>
              ${renderEnemyBoard(battle.own)}
              <div class="map-caption">
                <span>${state.battle.markerMode ? "标记模式：反复点击切换确定有、海面有/无、水下有/无和清除。" : state.battle.selectedAction ? "高亮格为当前行动合法目标。" : "选择行动后显示合法目标。"}</span>
                ${intel ? `<button class="intel-chip" data-action="clear-intelligence" data-kind="${intel.kind}">${intel.kind === "shock" ? "5×5 震爆区域" : intel.kind === "radar" ? `4×4 雷达区域 · ${intel.detected ? "发现布局" : "未发现布局"}` : `3×3 探测区域 · ${intel.detected ? "有水下信号" : "无水下信号"}`} ×</button>` : ""}
              </div>
            </section>

            <section class="battle-map-card battle-map-card--own ${ownActive ? "is-mobile-active" : ""}" data-map-panel="own">
              <div class="map-card__heading">
                <div><span class="status-kicker">防守海域</span><h2>己方地图</h2></div>
                <span class="map-state">完整己方情报</span>
              </div>
              ${renderOwnBattleBoard(battle.own)}
              <div class="map-caption"><span>敌方无法看到此处的单位类型、生命值、弹药与瘫痪状态。</span></div>
            </section>
          </div>
          ${renderActionPanel(room)}
        </div>

        <div class="battle-lower">
          ${renderPublicLog(room)}
          <aside class="battle-controls">
            <div>
              <span class="status-kicker">对局控制</span>
              <strong>行动提交后不可撤销</strong>
            </div>
            <button class="button button--quiet" data-action="open-rules">规则与图例</button>
            ${room.roomPhase === "PLAYING" ? '<button class="button button--danger-quiet" data-action="surrender">投降</button>' : ""}
          </aside>
        </div>
      </section>`;
  }

  function resultCarrierHp(replay, playerId) {
    const carrier = replay?.players?.[playerId]?.units?.find(
      (unit) => unit.type === Data.UNIT_TYPES.AIRCRAFT_CARRIER,
    );
    return carrier?.hp ?? null;
  }

  function renderReplayUnitList(snapshot) {
    return `
      <div class="replay-unit-list">
        ${(snapshot?.units ?? []).map((unit) => {
          const definition = Data.getUnitDefinitionByType(unit.type);
          return `
            <article>
              <span>${escapeHtml(definition.shortName)}</span>
              <div><strong>${escapeHtml(definition.name)}</strong><small>${unit.hp <= 0 ? "已沉没" : unit.paralyzed ? "瘫痪" : "存活"} · 受击格 ${unit.hitCells.length}</small></div>
              <b>${Model.formatHp(unit.hp)} / ${definition.initialHp}</b>
            </article>`;
        }).join("")}
        <article>
          <span>雷</span><div><strong>诱饵鱼雷</strong><small>最终有效数量</small></div>
          <b>${snapshot?.decoys?.filter((decoy) => !decoy.destroyed).length ?? 0} / 3</b>
        </article>
      </div>
      <div class="replay-resources" aria-label="最终剩余弹药与使用次数">
        ${Data.ACTION_DEFINITIONS.filter((action) => action.initialUses !== null).map((action) => `
          <span><b>${escapeHtml(action.name)}</b>${snapshot?.remainingUses?.[action.type] ?? 0} / ${action.initialUses}</span>`).join("")}
      </div>`;
  }

  function actualTargetText(cellResult) {
    if (!cellResult) return "";
    if (cellResult.actualTargetKind === "empty") return "空海域";
    if (cellResult.actualTargetKind === "decoy") return "诱饵鱼雷";
    if (cellResult.actualTargetKind === "destroyed_decoy") return "已摧毁诱饵鱼雷";
    if (cellResult.actualTargetKind === "wreck") return "残骸";
    if (cellResult.targetUnitType) {
      return Data.getUnitDefinitionByType(cellResult.targetUnitType)?.name ?? "作战单位";
    }
    return cellResult.actualTargetKind ?? "";
  }

  function replayActionDetail(record, room) {
    const action = Data.getActionDefinition(record.action.actionType);
    const outcome = record.outcome ?? {};
    const details = [];
    if (outcome.cellResult) {
      details.push(
        `${outcome.cellResult.result === "hit" ? "命中" : "未命中"}：${actualTargetText(outcome.cellResult)}`,
      );
    }
    if (Array.isArray(outcome.cellResults)) {
      const hits = outcome.cellResults.filter((cell) => cell.result === "hit").length;
      details.push(`逐格结果：命中 ${hits}，未命中 ${outcome.cellResults.length - hits}`);
    }
    if (typeof outcome.detected === "boolean") {
      details.push(outcome.detected ? "探测到水下信号" : "未探测到水下信号");
    }
    if (Array.isArray(outcome.affectedUnitIds)) {
      details.push(`实际影响 ${outcome.affectedUnitIds.length} 个水下作战单位`);
    }
    for (const damage of outcome.damageEvents ?? []) {
      const unit = Data.getUnitDefinitionByType(damage.unitType);
      details.push(
        `${Model.nicknameFor(room, damage.playerId)}的${unit?.name ?? damage.unitId}：${Model.formatHp(damage.beforeHp)} → ${Model.formatHp(damage.afterHp)}`,
      );
    }
    for (const decoy of outcome.decoyEvents ?? []) {
      if (decoy.destroyed) details.push(`诱饵鱼雷 ${decoy.cell} 被摧毁`);
    }
    return {
      title: `${Model.nicknameFor(room, record.actorId)} 使用${action?.name ?? record.action.actionType}`,
      target: Model.formatTarget(record.action.target),
      details,
    };
  }

  function renderFullReplayLog(room) {
    const log = room.battle.replay?.actionLog ?? [];
    return `
      <ol class="replay-log">
        ${log.length === 0 ? '<li class="empty-state">本局没有已完成的正式行动。</li>' : log.map((record) => {
          const detail = replayActionDetail(record, room);
          return `
            <li>
              <span class="replay-log__sequence">${record.sequence}</span>
              <div>
                <strong>${escapeHtml(detail.title)}</strong>
                <small>目标 ${escapeHtml(detail.target)}</small>
                ${detail.details.length ? `<ul>${detail.details.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
              </div>
            </li>`;
        }).join("")}
      </ol>`;
  }

  function renderFinalSalvoReplay(room) {
    const finalSalvo = room.battle.replay?.finalSalvo;
    if (!finalSalvo) return "";
    return `
      <section class="salvo-replay">
        <div class="panel-heading"><span>终局手动鱼雷记录</span><small>逐轮同时结算</small></div>
        <div class="salvo-shot-list">
          ${finalSalvo.shots.map((shot) => `
            <article>
              <span>${escapeHtml(Model.nicknameFor(room, shot.sourcePlayerId))}</span>
              <strong>${escapeHtml(shot.sourceCoordinate)} → ${escapeHtml(shot.targetCoordinate)}</strong>
              <em data-result="${shot.result}">${shot.result === "hit" ? `命中 ${escapeHtml(Data.getUnitDefinitionByType(shot.targetUnitType)?.name ?? "作战单位")}` : "未命中"}</em>
            </article>`).join("")}
        </div>
      </section>`;
  }

  function renderFinishedPage() {
    const room = state.room;
    const result = room.battle?.match?.result;
    const relative = Model.resultForViewer(result, room.own.playerId);
    const replay = room.battle?.replay;
    const selectedPlayerId = replay?.players?.[state.replayPlayerId]
      ? state.replayPlayerId
      : room.own.playerId;
    const selectedSnapshot = replay?.players?.[selectedPlayerId];
    const opponent = Model.getOpponentSeat(room);
    return `
      <section class="finished-page page-enter" data-result="${relative.code}" aria-labelledby="result-title">
        <header class="result-hero">
          <div class="result-emblem" aria-hidden="true"><span></span><i></i></div>
          <div>
            <p class="eyebrow">P06 / 对局结算</p>
            <h1 id="result-title">${escapeHtml(relative.title)}</h1>
            <p>${escapeHtml(Model.endReasonForViewer(result, room.own.playerId))}</p>
          </div>
          <div class="result-actions">
            ${room.rematch.ownRequested
              ? `<button class="button button--secondary" data-action="cancel-rematch" ${state.pendingRequest ? "disabled" : ""}>取消再来一局</button>`
              : `<button class="button button--primary" data-action="request-rematch" ${state.pendingRequest ? "disabled" : ""}>再来一局</button>`}
            <button class="button button--danger-quiet" data-action="leave-room">离开房间</button>
          </div>
        </header>

        <div class="result-summary-grid">
          <article><span>总回合数</span><strong>${room.matchSummary.turnCount}</strong></article>
          <article><span>对局持续</span><strong>${Model.formatDuration(room.matchSummary.durationMs)}</strong></article>
          ${room.seats.map((seat) => `
            <article class="carrier-result ${seat.playerId === result?.winnerId ? "carrier-result--winner" : ""}">
              <span>${escapeHtml(seat.nickname)}的航空母舰</span>
              <strong>${Model.formatHp(resultCarrierHp(replay, seat.playerId))}</strong><small>最终生命值</small>
            </article>`).join("")}
        </div>

        <div class="rematch-status" data-requested="${room.rematch.ownRequested}">
          <span>${room.rematch.ownRequested ? "你已申请再来一局" : "你尚未申请再来一局"}</span>
          <strong>${room.rematch.opponentRequested ? `${escapeHtml(opponent?.nickname)} 已申请` : `等待 ${escapeHtml(opponent?.nickname ?? "对方")} 选择`}</strong>
          <small>双方确认且全部在线后，将清空上局部署与资源并重新开始 180 秒部署。</small>
        </div>

        <div class="replay-layout">
          <section class="replay-map-panel">
            <div class="panel-heading"><span>完整部署复盘</span><small>结算后公开真实身份</small></div>
            <div class="replay-tabs" role="tablist" aria-label="复盘玩家地图">
              ${room.seats.map((seat) => `
                <button role="tab" aria-selected="${seat.playerId === selectedPlayerId}" class="${seat.playerId === selectedPlayerId ? "is-active" : ""}" data-action="select-replay-player" data-player-id="${escapeHtml(seat.playerId)}">
                  ${escapeHtml(seat.nickname)}${seat.playerId === room.own.playerId ? "（你）" : ""}
                </button>`).join("")}
            </div>
            ${selectedSnapshot ? renderOwnBattleBoard(selectedSnapshot, {
              label: `${Model.nicknameFor(room, selectedPlayerId)}的最终部署`,
              replay: true,
            }) : '<p class="empty-state">没有可显示的部署复盘。</p>'}
            ${renderReplayUnitList(selectedSnapshot)}
          </section>

          <section class="replay-record-panel">
            <div class="panel-heading"><span>完整行动复盘</span><small>包含结算后揭示信息</small></div>
            ${renderFullReplayLog(room)}
          </section>
        </div>

        ${renderFinalSalvoReplay(room)}

        <details class="public-log-after-match">
          <summary>查看对局中双方当时可见的公开记录</summary>
          ${renderPublicLog(room)}
        </details>
      </section>`;
  }

  function renderClosedPage() {
    const room = state.room;
    return `
      <section class="closed-page page-enter" aria-labelledby="closed-title">
        <div class="closed-symbol" aria-hidden="true">×</div>
        <p class="eyebrow">O05 / 房间关闭</p>
        <h1 id="closed-title">本房间已关闭</h1>
        <p>${escapeHtml(Model.closedReasonText(room?.closedReason))}</p>
        <div class="closed-meta"><span>房间 ${escapeHtml(room?.roomCode ?? "—")}</span><span>本机恢复凭证已清除</span></div>
        <button class="button button--primary" data-action="return-home">返回进入游戏页</button>
      </section>`;
  }

  function earliestReconnectDeadline(room) {
    const deadlines = Object.values(
      room?.deadlines?.reconnectDeadlineAtByPlayer ?? {},
    ).filter((value) => typeof value === "number");
    return deadlines.length ? Math.min(...deadlines) : null;
  }

  function renderBlockingOverlay() {
    if (state.restoring) {
      blockingOverlay.hidden = false;
      blockingOverlay.innerHTML = `
        <section class="pause-card" role="alertdialog" aria-modal="true" aria-labelledby="restore-title">
          <span class="sonar"></span>
          <p class="eyebrow">正在恢复</p>
          <h2 id="restore-title">正在恢复服务器确认的对局</h2>
          <p>收到完整安全快照后才会重新开放操作。</p>
        </section>`;
      return;
    }
    if (!state.connected && state.room) {
      blockingOverlay.hidden = false;
      blockingOverlay.innerHTML = `
        <section class="pause-card" role="alertdialog" aria-modal="true" aria-labelledby="offline-title">
          <span class="sonar"></span>
          <p class="eyebrow">连接中断</p>
          <h2 id="offline-title">正在重新连接服务器</h2>
          <p>当前操作已锁定。连接恢复后将使用本机私密凭证同步唯一状态。</p>
        </section>`;
      return;
    }
    const room = state.room;
    if (!room || room.connectionPhase === "CONNECTED" || room.roomPhase === "CLOSED") {
      blockingOverlay.hidden = true;
      blockingOverlay.innerHTML = "";
      return;
    }
    const offlineSeats = room.seats.filter((seat) => !seat.online);
    const deadline = earliestReconnectDeadline(room);
    const beforeMatch = ["WAITING", "DEPLOYING", "ROLLING"].includes(room.roomPhase);
    const playing = room.roomPhase === "PLAYING";
    const finished = room.roomPhase === "FINISHED";
    blockingOverlay.hidden = false;
    blockingOverlay.innerHTML = `
      <section class="pause-card" role="alertdialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="pause-card__icon" aria-hidden="true">⌁</div>
        <p class="eyebrow">O02 / 断线暂停</p>
        <h2 id="pause-title">${escapeHtml(offlineSeats.map((seat) => seat.nickname).join("、"))} 已断线</h2>
        <p>正在等待重连，当前操作与游戏计时均已暂停。</p>
        ${deadline ? `<div class="reconnect-timer"><span>服务器保留座位</span><strong data-deadline="${deadline}">—</strong></div>` : '<div class="reconnect-timer"><span>当前阶段无判负倒计时</span><strong>等待在线</strong></div>'}
        <div class="modal__actions">
          ${beforeMatch ? '<button class="button button--danger-quiet" data-action="leave-room">离开房间</button>' : ""}
          ${playing ? '<button class="button button--danger" data-action="surrender-and-leave">投降并离开</button>' : ""}
          ${finished ? '<button class="button button--danger-quiet" data-action="leave-room">离开房间</button>' : ""}
          ${room.roomPhase === "FINAL_SALVO" ? '<button class="button button--secondary" disabled>等待终局鱼雷选择或结算完成</button>' : ""}
        </div>
      </section>`;
  }

  function pushDeploymentHistory() {
    state.deployment.history.push(clone(state.deployment.placements));
    if (state.deployment.history.length > 50) {
      state.deployment.history.shift();
    }
  }

  function setPlacement(nextPlacement) {
    const placements = state.deployment.placements.filter(
      (placement) => placement.id !== nextPlacement.id,
    );
    placements.push({
      id: nextPlacement.id,
      type: nextPlacement.type,
      cells: Data.sortCoordinates(nextPlacement.cells),
    });
    state.deployment.placements = placements;
    state.deployment.dirty =
      placementDigest(placements) !== state.deployment.serverDigest;
  }

  function candidateIsFree(id, cells) {
    return cells.every(
      (coordinate) =>
        Data.parseCoordinate(coordinate) && !occupantAt(coordinate, id),
    );
  }

  function handleDeploymentCell(coordinate) {
    const room = state.room;
    if (getOwnSeat(room)?.ready || room.deploymentsLocked) {
      return;
    }
    const selectedId = state.deployment.selectedId;
    const definition = Data.getUnitDefinitionById(selectedId);
    if (!definition) {
      const occupied = occupantAt(coordinate);
      if (occupied) {
        state.deployment.selectedId = occupied.id;
        render();
      }
      return;
    }
    const existing = placementById(selectedId);

    if (definition.shape === "connected") {
      const cells = [...(existing?.cells ?? [])];
      if (cells.length >= definition.cellCount) {
        if (cells.includes(coordinate)) {
          return;
        }
        const points = cells.map(Data.parseCoordinate);
        const minRow = Math.min(...points.map((point) => point.row));
        const minColumn = Math.min(...points.map((point) => point.column));
        const anchor = Data.parseCoordinate(coordinate);
        const moved = points
          .map((point) =>
            Data.formatCoordinate(
              anchor.row + point.row - minRow,
              anchor.column + point.column - minColumn,
            ),
          )
          .filter(Boolean);
        if (moved.length !== cells.length || !candidateIsFree(selectedId, moved)) {
          showToast("航空母舰移动后会越界或重叠，请选择其他左上锚点。", "warning");
          return;
        }
        pushDeploymentHistory();
        setPlacement({ id: selectedId, type: definition.type, cells: moved });
        render();
        return;
      }
      const lastCell = cells.at(-1);
      if (cells.includes(coordinate)) {
        if (coordinate !== lastCell) {
          showToast("航空母舰编辑时只能撤销最后选择的一格。", "warning");
          return;
        }
        pushDeploymentHistory();
        const nextCells = cells.slice(0, -1);
        if (nextCells.length === 0) {
          state.deployment.placements = state.deployment.placements.filter(
            (placement) => placement.id !== selectedId,
          );
        } else {
          setPlacement({ id: selectedId, type: definition.type, cells: nextCells });
        }
        state.deployment.dirty = true;
        render();
        return;
      }
      if (occupantAt(coordinate, selectedId)) {
        showToast("该格已由其他部署对象占用。", "warning");
        return;
      }
      if (
        cells.length > 0 &&
        !cells.some((cell) => Data.fourNeighbors(cell).includes(coordinate))
      ) {
        showToast("航空母舰的下一格必须与已选格四向相邻。", "warning");
        return;
      }
      pushDeploymentHistory();
      setPlacement({
        id: selectedId,
        type: definition.type,
        cells: [...cells, coordinate],
      });
      render();
      return;
    }

    const orientation =
      state.deployment.orientations[selectedId] ?? "horizontal";
    const candidate = Data.createAnchoredCells(
      definition,
      coordinate,
      orientation,
    );
    if (
      candidate.length !== definition.cellCount ||
      !candidateIsFree(selectedId, candidate)
    ) {
      showToast("该位置会越界或与其他对象重叠，请选择新的起点。", "warning");
      return;
    }
    pushDeploymentHistory();
    setPlacement({ id: selectedId, type: definition.type, cells: candidate });
    render();
  }

  function rotateSelectedPlacement() {
    const id = state.deployment.selectedId;
    const definition = Data.getUnitDefinitionById(id);
    if (!definition) return;
    const existing = placementById(id);
    if (!existing) {
      if (definition.shape === "line") {
        state.deployment.orientations[id] =
          state.deployment.orientations[id] === "vertical"
            ? "horizontal"
            : "vertical";
        render();
      } else {
        showToast("该对象无需预先旋转。", "info");
      }
      return;
    }
    if (definition.shape === "single" || definition.shape === "square") {
      showToast("该对象旋转后形状不变。", "info");
      return;
    }
    const points = existing.cells.map(Data.parseCoordinate);
    const minRow = Math.min(...points.map((point) => point.row));
    const minColumn = Math.min(...points.map((point) => point.column));
    let rotated;
    if (definition.shape === "line") {
      const nextOrientation =
        Data.placementOrientation(existing.cells) === "horizontal"
          ? "vertical"
          : "horizontal";
      rotated = Data.createAnchoredCells(
        definition,
        Data.formatCoordinate(minRow, minColumn),
        nextOrientation,
      );
    } else {
      const maxRow = Math.max(...points.map((point) => point.row));
      rotated = points
        .map((point) =>
          Data.formatCoordinate(
            minRow + point.column - minColumn,
            minColumn + maxRow - point.row,
          ),
        )
        .filter(Boolean);
    }
    if (
      rotated.length !== definition.cellCount ||
      !candidateIsFree(id, rotated) ||
      !Data.shapeIsValid(definition, rotated)
    ) {
      showToast("旋转后会越界或重叠，已保留原位置。", "warning");
      return;
    }
    if (definition.shape === "line") {
      state.deployment.orientations[id] =
        Data.placementOrientation(rotated);
    }
    pushDeploymentHistory();
    setPlacement({ id, type: definition.type, cells: rotated });
    render();
  }

  function moveDraggedPlacement(id, fromCoordinate, toCoordinate) {
    const existing = placementById(id);
    if (!existing) return;
    const from = Data.parseCoordinate(fromCoordinate);
    const to = Data.parseCoordinate(toCoordinate);
    if (!from || !to) return;
    const moved = existing.cells
      .map((coordinate) => {
        const point = Data.parseCoordinate(coordinate);
        return Data.formatCoordinate(
          point.row + to.row - from.row,
          point.column + to.column - from.column,
        );
      })
      .filter(Boolean);
    if (
      moved.length !== existing.cells.length ||
      !candidateIsFree(id, moved)
    ) {
      showToast("拖动后会越界或重叠，已恢复原位置。", "warning");
      return;
    }
    pushDeploymentHistory();
    setPlacement({ id, type: existing.type, cells: moved });
    state.deployment.selectedId = id;
    render();
  }

  function openConfirm(options) {
    state.confirm = {
      onConfirm: options.onConfirm,
      onCancel: options.onCancel ?? null,
    };
    confirmTitle.textContent = options.title;
    confirmBody.replaceChildren();
    for (const paragraph of options.paragraphs ?? []) {
      const element = document.createElement("p");
      element.textContent = paragraph;
      confirmBody.append(element);
    }
    if (options.list?.length) {
      const list = document.createElement("ul");
      for (const item of options.list) {
        const element = document.createElement("li");
        element.textContent = item;
        list.append(element);
      }
      confirmBody.append(list);
    }
    confirmAccept.textContent = options.confirmLabel ?? "确认";
    confirmAccept.className = `button ${options.danger ? "button--danger" : "button--primary"}`;
    confirmAccept.disabled = false;
    confirmCancel.disabled = false;
    if (!confirmDialog.open) {
      confirmDialog.showModal();
    }
    window.setTimeout(() => confirmCancel.focus(), 0);
  }

  function cancelConfirm() {
    const cancelHandler = state.confirm?.onCancel;
    state.confirm = null;
    if (confirmDialog.open) confirmDialog.close();
    cancelHandler?.();
  }

  async function acceptConfirm() {
    const operation = state.confirm?.onConfirm;
    if (!operation) {
      cancelConfirm();
      return;
    }
    confirmAccept.disabled = true;
    confirmCancel.disabled = true;
    confirmAccept.textContent = "正在处理…";
    try {
      await operation();
      state.confirm = null;
      if (confirmDialog.open) confirmDialog.close();
    } catch (error) {
      confirmAccept.disabled = false;
      confirmCancel.disabled = false;
      confirmAccept.textContent = "重试";
      showToast(humanizeSocketError(error), "error", 8_000);
      if (["STATE_VERSION_CONFLICT", "REQUEST_TIMEOUT"].includes(error.code)) {
        void emitRequest("room:sync", {}).then((response) => {
          if (response.view) acceptRoomState(response.view);
        }).catch(() => {});
      }
    }
  }

  function openActionConfirmation() {
    const definition = Data.getActionDefinition(state.battle.selectedAction);
    const target = state.battle.target;
    if (!definition || !target) return;
    const remaining = state.room.battle.own.remainingUses?.[definition.type];
    const paragraphs = [
      `目标：${Model.formatTarget(target)}`,
      ...(state.room.battle.opponentIds?.length > 1
        ? [`敌方玩家：${Model.nicknameFor(state.room, state.battle.targetPlayerId)}`]
        : []),
      definition.warning,
    ];
    if (definition.initialUses !== null) {
      paragraphs.push(`提交成功后剩余 ${Math.max(0, remaining - 1)} 次。`);
    }
    openConfirm({
      title: `确认${definition.name}`,
      paragraphs,
      confirmLabel: "确认行动",
      onCancel: () => {
        state.battle.target = null;
        state.battle.actionId = null;
        render();
      },
      onConfirm: submitSelectedAction,
    });
  }

  async function submitSelectedAction() {
    const room = state.room;
    const definition = Data.getActionDefinition(state.battle.selectedAction);
    if (!definition || !state.battle.target) {
      throw { message: "行动或目标已经失效，请重新选择。" };
    }
    const source = room.battle.own.units.find(
      (unit) => unit.type === definition.sourceType && unit.hp > 0,
    );
    if (!source) {
      throw { message: "找不到该行动的己方来源单位。" };
    }
    if (!state.battle.actionId) {
      state.battle.actionId = createActionId();
    }
    state.pendingRequest = "action";
    render();
    try {
      const response = await emitRequest("action:submit", {
        expectedVersion: room.stateVersion,
        intent: {
          actionId: state.battle.actionId,
          actionType: definition.type,
          sourceId: source.id,
          targetPlayerId: state.battle.targetPlayerId,
          target: clone(state.battle.target),
        },
      });
      await ensureStateVersion(response.stateVersion);
      clearBattleDraft();
      state.pendingRequest = null;
      render();
    } catch (error) {
      state.pendingRequest = null;
      render();
      throw error;
    }
  }

  async function submitFinalSalvo(decoyId) {
    const room = state.room;
    if (room?.roomPhase !== "FINAL_SALVO" || !decoyId) return;
    state.pendingRequest = "final-salvo";
    render();
    try {
      const response = await emitRequest("final-salvo:submit", {
        expectedVersion: room.stateVersion,
        decoyId,
      });
      await ensureStateVersion(response.stateVersion);
    } catch (error) {
      showToast(humanizeSocketError(error), "error");
    } finally {
      state.pendingRequest = null;
      render();
    }
  }

  async function submitAndReadyDeployment() {
    const validation = Data.validateDeployment(state.deployment.placements);
    if (!validation.valid) {
      throw { message: `部署仍不完整：${validation.errors[0]}` };
    }
    state.pendingRequest = "ready";
    render();
    try {
      const room = state.room;
      let version = room.stateVersion;
      const localDigest = placementDigest(validation.normalizedPlacements);
      if (localDigest !== state.deployment.serverDigest) {
        const submitted = await emitRequest("deployment:submit", {
          expectedVersion: version,
          deployment: validation.normalizedPlacements,
        });
        await ensureStateVersion(submitted.stateVersion);
        version = state.room.stateVersion;
        state.deployment.serverDigest = localDigest;
        state.deployment.dirty = false;
      }
      const ready = await emitRequest("deployment:ready", {
        expectedVersion: version,
      });
      await ensureStateVersion(ready.stateVersion);
      state.pendingRequest = null;
      render();
    } catch (error) {
      state.pendingRequest = null;
      render();
      throw error;
    }
  }

  async function leaveRoom() {
    if (!state.room) return;
    state.pendingRequest = "leave";
    render();
    try {
      await emitRequest("room:leave", {
        expectedVersion: state.room.stateVersion,
      });
      state.pendingRequest = null;
    } catch (error) {
      state.pendingRequest = null;
      render();
      throw error;
    }
  }

  async function surrender(andLeave = false) {
    const surrendered = await emitRequest("match:surrender", {
      expectedVersion: state.room.stateVersion,
    });
    await ensureStateVersion(surrendered.stateVersion);
    if (andLeave) {
      await waitForState((room) => room?.roomPhase === "FINISHED");
      await emitRequest("room:leave", {
        expectedVersion: state.room.stateVersion,
      });
    }
  }

  function selectAction(actionType) {
    const definition = Data.getActionDefinition(actionType);
    if (!definition) return;
    const status = Model.deriveActionStatus(state.room, definition);
    if (!status.enabled) {
      showToast(status.label, "warning");
      return;
    }
    state.battle.selectedAction = actionType;
    state.battle.actionDrawerOpen = true;
    state.battle.target = null;
    state.battle.actionId = null;
    state.battle.markerMode = false;
    state.battle.helicopterAxis =
      definition.targetMode === "line" ? state.battle.helicopterAxis : null;
    render();
  }

  function handleEnemyCell(coordinate) {
    const ownBattle = state.room?.battle?.own;
    if (!ownBattle) return;
    const resolved = Data.resolvedTargetSet(ownBattle);
    if (state.battle.markerMode) {
      if (resolved.has(coordinate)) {
        showToast("命中或未命中格不能添加私人标记。", "warning");
        return;
      }
      const current = state.battle.markers.get(coordinate);
      const nextIndex = current ? MARKER_CYCLE.indexOf(current) + 1 : 0;
      if (nextIndex >= MARKER_CYCLE.length) state.battle.markers.delete(coordinate);
      else state.battle.markers.set(coordinate, MARKER_CYCLE[nextIndex]);
      saveMarkers();
      render();
      return;
    }
    const actionType = state.battle.selectedAction;
    const definition = Data.getActionDefinition(actionType);
    if (!definition) {
      showToast("请先在行动面板选择一项可用行动。", "info");
      return;
    }
    let target;
    if (definition.targetMode === "line") {
      if (!state.battle.helicopterAxis) {
        showToast("请先选择按行或按列扫射。", "warning");
        return;
      }
      const point = Data.parseCoordinate(coordinate);
      target = state.battle.helicopterAxis === "row"
        ? { kind: "row", row: Data.ROWS[point.row] }
        : { kind: "column", column: point.column + 1 };
    } else {
      target = { kind: "cell", coordinate };
    }
    const options = Data.getTargetOptions(actionType, ownBattle);
    const optionKeys = new Set(options.map(Data.targetKey));
    if (!optionKeys.has(Data.targetKey(target))) {
      showToast(
        resolved.has(coordinate)
          ? "该格已有命中或未命中结果，请选择未知格。"
          : "目标不在该行动的攻击范围内。",
        "warning",
      );
      return;
    }
    state.battle.target = target;
    state.battle.actionId = createActionId();
    render();
    openActionConfirmation();
  }

  function validateNickname(nickname) {
    const normalized = nickname.trim();
    const length = Array.from(normalized).length;
    if (length < 1 || length > 12) {
      return { valid: false, value: normalized, message: "昵称去除首尾空白后必须为 1～12 个字符。" };
    }
    return { valid: true, value: normalized };
  }

  async function createRoom() {
    const nickname = validateNickname(state.entry.nickname);
    if (!nickname.valid) {
      state.entry.error = nickname.message;
      render();
      return;
    }
    state.entry.error = "";
    state.pendingRequest = "create";
    render();
    try {
      await emitRequest("room:create", {
        nickname: nickname.value,
        maxPlayers: state.entry.maxPlayers,
      });
    } catch (error) {
      state.entry.error = humanizeSocketError(error);
    } finally {
      state.pendingRequest = null;
      render();
    }
  }

  async function joinRoom() {
    const nickname = validateNickname(state.entry.nickname);
    const roomCode = state.entry.roomCode.trim().toUpperCase();
    if (!nickname.valid) {
      state.entry.error = nickname.message;
      render();
      return;
    }
    if (!ROOM_CODE_PATTERN.test(roomCode)) {
      state.entry.error = "房间码必须是 6 位服务器允许字符。";
      render();
      return;
    }
    state.entry.error = "";
    state.pendingRequest = "join";
    render();
    try {
      await emitRequest("room:join", { roomCode, nickname: nickname.value });
    } catch (error) {
      state.entry.error = humanizeSocketError(error);
    } finally {
      state.pendingRequest = null;
      render();
    }
  }

  async function restoreSession() {
    const stored = readStoredSession();
    if (!stored || !state.socket?.connected || state.restoring) return;
    state.restoring = true;
    render();
    try {
      const response = await emitRequest("room:resume", stored);
      showToast(
        response.disconnectResolved
          ? "座位已恢复，服务器已同步断线期间的最终处理结果。"
          : "座位与服务器确认状态已恢复。",
        "success",
      );
    } catch (error) {
      state.restoring = false;
      if ([
        "INVALID_RECONNECT_CREDENTIAL",
        "RECONNECT_DEADLINE_EXPIRED",
        "ROOM_CLOSED",
        "ROOM_NOT_FOUND",
      ].includes(error.code)) {
        clearStoredSession();
        state.room = null;
        updateRoomAddress(null);
      }
      state.entry.error = humanizeSocketError(error);
      render();
    }
  }

  function connectSocket() {
    if (typeof window.io !== "function") {
      setConnectionDisplay("offline", "实时客户端加载失败");
      state.entry.error = "Socket.IO 客户端未能加载，请刷新页面。";
      render();
      return;
    }
    const socket = window.io({
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 8_000,
      randomizationFactor: 0.4,
      timeout: 10_000,
    });
    state.socket = socket;

    socket.on("system:ready", (message) => {
      state.protocolVersion = message?.protocolVersion ?? null;
      state.serverStage = message?.stage ?? null;
    });

    socket.on("room:session", (session) => {
      if (
        session?.active === true &&
        ROOM_CODE_PATTERN.test(session.roomCode) &&
        typeof session.playerId === "string"
      ) {
        state.session = {
          roomCode: session.roomCode,
          playerId: session.playerId,
        };
        if (typeof session.reconnectToken === "string") {
          saveStoredSession(session);
        }
        updateRoomAddress(session.roomCode);
        state.restoring = false;
      } else if (session?.active === false) {
        clearStoredSession();
        state.session = null;
        state.room = null;
        state.restoring = false;
        state.pendingRequest = null;
        updateRoomAddress(null);
      }
      render();
    });

    socket.on("room:state", acceptRoomState);

    socket.on("room:error", (error) => {
      const message = humanizeSocketError(error);
      showToast(message, "error", 8_000);
      if (
        state.restoring &&
        [
          "INVALID_RECONNECT_CREDENTIAL",
          "RECONNECT_DEADLINE_EXPIRED",
          "ROOM_CLOSED",
          "ROOM_NOT_FOUND",
        ].includes(error.code)
      ) {
        state.restoring = false;
        state.room = null;
        clearStoredSession();
        updateRoomAddress(null);
        state.entry.error = message;
        render();
      }
      if (error.code === "STATE_VERSION_CONFLICT") {
        void emitRequest("room:sync", {}).then((response) => {
          if (response.view) acceptRoomState(response.view);
        }).catch(() => {});
      }
    });

    socket.on("connect", () => {
      state.connected = true;
      state.connection.failures = 0;
      setConnectionPhase("online", "服务器连接正常。", "online", "服务器在线");
      render();
      socket.timeout(3_000).emit("client:ping", {}, (error, response) => {
        if (error || !response?.ok) {
          setConnectionDisplay("warning", "应答检查延迟");
        }
      });
      const stored = readStoredSession();
      const requestedRoom = new URL(window.location.href)
        .searchParams.get("room")
        ?.trim()
        .toUpperCase();
      const shouldAutoRestore = Boolean(
        stored &&
        (!requestedRoom || requestedRoom === stored.roomCode) &&
        (state.room || requestedRoom),
      );
      if (shouldAutoRestore && !state.restoring) {
        state.autoRestoreAttempted = true;
        void restoreSession();
      }
    });

    socket.on("disconnect", (reason) => {
      state.connected = false;
      state.restoring = false;
      setConnectionPhase(
        navigator.onLine ? "reconnecting" : "offline",
        navigator.onLine
          ? `连接已中断，客户端正在自动重连（${reason ?? "原因未知"}）。`
          : "当前设备处于离线状态。恢复网络后客户端会自动重连。",
        "offline",
        "正在重连",
      );
      render();
    });

    socket.on("connect_error", () => {
      state.connected = false;
      state.connection.failures += 1;
      setConnectionPhase(
        "waking",
        state.connection.failures >= 2
          ? "免费服务器可能正在从休眠中唤醒，请保留页面；客户端会自动重试。"
          : "服务器尚未响应，正在自动重试。",
        "warning",
        "正在唤醒服务器",
      );
      render();
    });
  }

  document.addEventListener("input", (event) => {
    if (event.target.id === "nickname-input") {
      state.entry.nickname = event.target.value;
      try {
        localStorage.setItem(NICKNAME_STORAGE_KEY, state.entry.nickname);
      } catch (_error) {
        // 昵称记忆失败不影响创建或加入房间。
      }
      const counter = document.querySelector("#nickname-count");
      if (counter) counter.textContent = Array.from(event.target.value).length;
    }
    if (event.target.id === "room-code-input") {
      const normalized = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      event.target.value = normalized;
      state.entry.roomCode = normalized;
    }
    if (event.target.id === "max-players-input") {
      state.entry.maxPlayers = Number(event.target.value) === 3 ? 3 : 2;
    }
    if (event.target.id === "target-player-input") {
      saveMarkers();
      state.battle.targetPlayerId = event.target.value;
      state.battle.markerContext = null;
      state.battle.target = null;
      state.battle.actionId = null;
      render();
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "reduce-motion-toggle") {
      setReduceMotion(event.target.checked);
    }
  });

  document.addEventListener("submit", (event) => {
    if (event.target.id === "create-form") {
      event.preventDefault();
      void createRoom();
    }
    if (event.target.id === "join-form") {
      event.preventDefault();
      void joinRoom();
    }
  });

  document.addEventListener("click", (event) => {
    const brand = event.target.closest("a.brand");
    if (brand && state.room) {
      event.preventDefault();
      if (state.room.roomPhase === "CLOSED") {
        returnHome();
      } else {
        showToast("请使用当前页面的“离开房间”，避免丢失座位状态。", "warning");
      }
      return;
    }
    const control = event.target.closest("[data-action]");
    if (!control || control.disabled) return;
    const action = control.dataset.action;

    if (action === "open-rules") {
      reduceMotionToggle.checked = state.reduceMotion;
      if (!rulesDialog.open) rulesDialog.showModal();
      return;
    }
    if (action === "close-rules") {
      rulesDialog.close();
      return;
    }
    if (action === "reload") {
      window.location.reload();
      return;
    }
    if (action === "retry-connection") {
      state.connection.failures = 0;
      setConnectionPhase(
        "connecting",
        "正在重新连接服务器。",
        "warning",
        "正在连接",
      );
      state.socket?.disconnect();
      state.socket?.connect();
      render();
      return;
    }
    if (action === "restore-session") {
      void restoreSession();
      return;
    }
    if (action === "dismiss-session") {
      clearStoredSession();
      if (new URL(window.location.href).searchParams.get("room") === state.entry.roomCode) {
        updateRoomAddress(null);
      }
      render();
      return;
    }
    if (action === "copy-room") {
      void copyText(state.room.roomCode, "房间码已复制。", control);
      return;
    }
    if (action === "copy-invite") {
      void copyText(
        `${window.location.origin}/?room=${state.room.roomCode}`,
        "邀请链接已复制。",
        control,
      );
      return;
    }
    if (action === "share-invite") {
      void shareInvite(control);
      return;
    }
    if (action === "select-placement") {
      state.deployment.selectedId = control.dataset.placementId;
      updateDeploymentSelectionUi();
      return;
    }
    if (action === "deployment-cell") {
      handleDeploymentCell(control.dataset.coordinate);
      return;
    }
    if (action === "rotate-placement") {
      rotateSelectedPlacement();
      return;
    }
    if (action === "remove-placement") {
      const id = state.deployment.selectedId;
      if (placementById(id)) {
        pushDeploymentHistory();
        state.deployment.placements = state.deployment.placements.filter(
          (placement) => placement.id !== id,
        );
        state.deployment.dirty = true;
        render();
      }
      return;
    }
    if (action === "undo-deployment") {
      const previous = state.deployment.history.pop();
      if (previous) {
        state.deployment.placements = previous;
        state.deployment.dirty =
          placementDigest(previous) !== state.deployment.serverDigest;
        render();
      }
      return;
    }
    if (action === "random-deployment") {
      const operation = () => {
        pushDeploymentHistory();
        state.deployment.placements = Data.generateRandomDeployment();
        state.deployment.dirty = true;
        state.deployment.selectedId = "destroyer-i";
        render();
      };
      if (state.deployment.placements.length > 0) {
        openConfirm({
          title: "覆盖当前部署？",
          paragraphs: ["随机部署会覆盖当前全部手动位置，但仍可使用“撤销”恢复。"],
          confirmLabel: "覆盖并随机部署",
          onConfirm: operation,
        });
      } else {
        operation();
      }
      return;
    }
    if (action === "clear-deployment") {
      openConfirm({
        title: "清空全部部署？",
        paragraphs: ["七个作战单位与三枚诱饵鱼雷都会撤回，清空后可以撤销。"],
        confirmLabel: "确认清空",
        danger: true,
        onConfirm: () => {
          pushDeploymentHistory();
          state.deployment.placements = [];
          state.deployment.dirty = true;
          state.deployment.selectedId = "destroyer-i";
          render();
        },
      });
      return;
    }
    if (action === "ready-deployment") {
      openConfirm({
        title: "提交部署并准备？",
        paragraphs: ["服务器会再次验证完整部署。本方准备后地图只读；对方尚未准备时仍可取消准备。"],
        confirmLabel: "提交并准备",
        onConfirm: submitAndReadyDeployment,
      });
      return;
    }
    if (action === "cancel-ready") {
      void emitRequest("deployment:cancel-ready", {
        expectedVersion: state.room.stateVersion,
      }).catch((error) => showToast(humanizeSocketError(error), "error"));
      return;
    }
    if (action === "leave-room") {
      openConfirm({
        title: state.room.roomPhase === "FINISHED" ? "离开本房间？" : "关闭并离开房间？",
        paragraphs: [
          state.room.roomPhase === "FINISHED"
            ? "离开后你的本机凭证失效；留下的玩家将回到等待页。"
            : "对局开始前离开会关闭房间，双方当前部署不会保留。",
        ],
        confirmLabel: "确认离开",
        danger: true,
        onConfirm: leaveRoom,
      });
      return;
    }
    if (action === "switch-map") {
      state.battle.mobileMap = control.dataset.map;
      if (control.dataset.map === "own") state.battle.ownMapAlert = false;
      render();
      return;
    }
    if (action === "select-action") {
      selectAction(control.dataset.actionType);
      return;
    }
    if (action === "submit-final-salvo") {
      void submitFinalSalvo(control.dataset.decoyId);
      return;
    }
    if (action === "toggle-action-drawer") {
      state.battle.actionDrawerOpen = !state.battle.actionDrawerOpen;
      render();
      return;
    }
    if (action === "toggle-log") {
      state.battle.logOpen = !state.battle.logOpen;
      render();
      return;
    }
    if (action === "set-helicopter-axis") {
      state.battle.helicopterAxis = control.dataset.axis;
      state.battle.target = null;
      state.battle.actionId = null;
      render();
      return;
    }
    if (action === "enemy-cell") {
      handleEnemyCell(control.dataset.coordinate);
      return;
    }
    if (action === "toggle-marker-mode") {
      state.battle.markerMode = !state.battle.markerMode;
      if (state.battle.markerMode) {
        state.battle.selectedAction = null;
        state.battle.target = null;
        state.battle.actionId = null;
      }
      render();
      return;
    }
    if (action === "cancel-action-selection") {
      clearBattleDraft();
      render();
      return;
    }
    if (action === "reopen-action-confirm") {
      openActionConfirmation();
      return;
    }
    if (action === "select-intelligence") {
      state.battle.selectedIntelligenceSequence = Number(control.dataset.sequence);
      render();
      return;
    }
    if (action === "clear-intelligence") {
      state.battle.selectedIntelligenceSequence = -1;
      render();
      return;
    }
    if (action === "surrender") {
      openConfirm({
        title: "确认投降？",
        paragraphs: ["投降后本局立即失败，无法撤销。服务器会先完成已经接受且正在结算的行动。"],
        confirmLabel: "确认投降",
        danger: true,
        onConfirm: () => surrender(false),
      });
      return;
    }
    if (action === "surrender-and-leave") {
      openConfirm({
        title: "投降并离开？",
        paragraphs: ["服务器将先生成本局投降结算，再使用新状态版本离开房间。该操作无法撤销。"],
        confirmLabel: "投降并离开",
        danger: true,
        onConfirm: () => surrender(true),
      });
      return;
    }
    if (action === "request-rematch") {
      void emitRequest("rematch:request", {
        expectedVersion: state.room.stateVersion,
      }).catch((error) => showToast(humanizeSocketError(error), "error"));
      return;
    }
    if (action === "cancel-rematch") {
      void emitRequest("rematch:cancel", {
        expectedVersion: state.room.stateVersion,
      }).catch((error) => showToast(humanizeSocketError(error), "error"));
      return;
    }
    if (action === "select-replay-player") {
      state.replayPlayerId = control.dataset.playerId;
      render();
      return;
    }
    if (action === "return-home") {
      returnHome();
    }
  });

  document.addEventListener("dragstart", (event) => {
    const cell = event.target.closest("[data-deployment-cell]");
    if (!cell) return;
    state.deployment.drag = {
      id: cell.dataset.placementId,
      coordinate: cell.dataset.coordinate,
    };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", cell.dataset.placementId);
  });

  document.addEventListener("dragover", (event) => {
    if (state.deployment.drag && event.target.closest('[data-action="deployment-cell"]')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  });

  document.addEventListener("drop", (event) => {
    const cell = event.target.closest('[data-action="deployment-cell"]');
    const drag = state.deployment.drag;
    state.deployment.drag = null;
    if (!cell || !drag) return;
    event.preventDefault();
    moveDraggedPlacement(drag.id, drag.coordinate, cell.dataset.coordinate);
  });

  document.addEventListener("dragend", () => {
    state.deployment.drag = null;
  });

  document.addEventListener("pointerover", (event) => {
    const cell = event.target.closest('[data-action="deployment-cell"]');
    if (
      cell &&
      !cell.disabled &&
      state.deployment.hoverCoordinate !== cell.dataset.coordinate
    ) {
      updateDeploymentPreview(cell.dataset.coordinate);
    }
  });

  document.addEventListener("pointerout", (event) => {
    const board = event.target.closest?.(".deployment-map-card .ocean-board");
    if (board && !board.contains(event.relatedTarget)) {
      updateDeploymentPreview(null);
    }
  });

  document.addEventListener("focusin", (event) => {
    const cell = event.target.closest?.('[data-action="deployment-cell"]');
    if (
      cell &&
      !cell.disabled &&
      state.deployment.hoverCoordinate !== cell.dataset.coordinate
    ) {
      updateDeploymentPreview(cell.dataset.coordinate);
    }
  });

  document.addEventListener("keydown", (event) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
    if (typing || confirmDialog.open || rulesDialog.open) return;
    if (event.key.toLowerCase() === "r" && state.room?.roomPhase === "DEPLOYING") {
      event.preventDefault();
      rotateSelectedPlacement();
    }
    if (event.key.toLowerCase() === "m" && state.room?.roomPhase === "PLAYING") {
      event.preventDefault();
      state.battle.markerMode = !state.battle.markerMode;
      if (state.battle.markerMode) {
        state.battle.selectedAction = null;
        state.battle.target = null;
        state.battle.actionId = null;
        state.battle.helicopterAxis = null;
      }
      render();
    }
  });

  confirmCancel.addEventListener("click", cancelConfirm);
  confirmAccept.addEventListener("click", () => void acceptConfirm());
  confirmDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    cancelConfirm();
  });

  async function copyText(text, successMessage, button) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_error) {
      const fallback = document.createElement("textarea");
      fallback.value = text;
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.append(fallback);
      fallback.select();
      document.execCommand("copy");
      fallback.remove();
    }
    const original = button.textContent;
    button.textContent = "已复制";
    showToast(successMessage, "success");
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = original;
    }, 1_500);
  }

  async function shareInvite(button) {
    const url = `${window.location.origin}/?room=${state.room.roomCode}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "加入海战 OCEAN",
          text: `房间码：${state.room.roomCode}`,
          url,
        });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    await copyText(url, "当前设备不支持系统分享，邀请链接已复制。", button);
  }

  function returnHome() {
    clearStoredSession();
    state.room = null;
    state.session = null;
    state.restoring = false;
    state.pendingRequest = null;
    updateRoomAddress(null);
    if (state.socket) {
      state.socket.disconnect();
      state.socket.connect();
    }
    render();
  }

  document.documentElement.dataset.reduceMotion = state.reduceMotion
    ? "true"
    : "false";
  reduceMotionToggle.checked = state.reduceMotion;
  window.addEventListener("offline", () => {
    state.connected = false;
    setConnectionPhase(
      "offline",
      "当前设备处于离线状态。恢复网络后客户端会自动重连。",
      "offline",
      "设备离线",
    );
    render();
  });
  window.addEventListener("online", () => {
    setConnectionPhase(
      "reconnecting",
      "网络已经恢复，正在重新连接服务器。",
      "warning",
      "正在重连",
    );
    state.socket?.connect();
    render();
  });
  window.addEventListener("beforeunload", (event) => {
    if (state.room && !["CLOSED", "FINISHED"].includes(state.room.roomPhase)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      state.socket?.connected &&
      state.room
    ) {
      void emitRequest("room:sync", {}).then((response) => {
        if (response.view) acceptRoomState(response.view);
      }).catch(() => {});
    }
  });
  window.setInterval(updateCountdowns, 250);
  render();
  connectSocket();
})();
