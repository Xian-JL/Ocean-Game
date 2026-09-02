"use strict";

(() => {
  const Data = window.OceanGameData;
  const Model = window.OceanUiModel;
  const Sound = window.OceanAudio;
  const Tutorial = window.OceanTutorial;
  const app = document.querySelector("#app");
  const connectionDot = document.querySelector("#connection-dot");
  const connectionText = document.querySelector("#connection-text");
  const headerRoomCode = document.querySelector("#header-room-code");
  const footerRelease = document.querySelector("#footer-release");
  const footerProtocol = document.querySelector("#footer-protocol");
  const blockingOverlay = document.querySelector("#blocking-overlay");
  const toastRegion = document.querySelector("#toast-region");
  const confirmDialog = document.querySelector("#confirm-dialog");
  const confirmTitle = document.querySelector("#confirm-title");
  const confirmBody = document.querySelector("#confirm-body");
  const confirmCancel = document.querySelector("#confirm-cancel");
  const confirmAccept = document.querySelector("#confirm-accept");
  const rulesDialog = document.querySelector("#rules-dialog");
  const audioDialog = document.querySelector("#audio-dialog");
  const personalizeDialog = document.querySelector("#personalize-dialog");
  const reduceMotionToggle = document.querySelector("#reduce-motion-toggle");
  const effectsToggle = document.querySelector("#effects-toggle");
  const musicToggle = document.querySelector("#music-toggle");
  const effectsVolumeInput = document.querySelector("#effects-volume");
  const musicVolumeInput = document.querySelector("#music-volume");
  const effectsVolumeOutput = document.querySelector("#effects-volume-output");
  const musicVolumeOutput = document.querySelector("#music-volume-output");
  const effectsButton = document.querySelector("#effects-button");
  const musicButton = document.querySelector("#music-button");

  const SESSION_STORAGE_KEY = "ocean.reconnect-session.v1";
  const MOTION_STORAGE_KEY = "ocean.reduce-motion.v1";
  const NICKNAME_STORAGE_KEY = "ocean.nickname.v1";
  const MARKER_STORAGE_PREFIX = "ocean.private-markers.v2";
  const TUTORIAL_STORAGE_KEY = "ocean.tutorial-progress.v1";
  const THEME_STORAGE_KEY = "ocean.theme.v1";
  const ACCENT_STORAGE_KEY = "ocean.accent.v1";
  const MARKER_DEFINITIONS = Object.freeze([
    { value: "occupied", label: "确定有目标", shortLabel: "确定有" },
    { value: "surface_yes", label: "水面有目标", shortLabel: "水面有" },
    { value: "surface_no", label: "水面无目标", shortLabel: "水面无" },
    { value: "underwater_yes", label: "水下有目标", shortLabel: "水下有" },
    { value: "underwater_no", label: "水下无目标", shortLabel: "水下无" },
  ]);
  const MARKER_CYCLE = MARKER_DEFINITIONS.map((marker) => marker.value);
  const ROOM_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  const REQUEST_TIMEOUT_MS = 8_000;
  const ACTION_EFFECTS = Object.freeze({
    destroyer_i_ram: "attack_destroyer_i",
    destroyer_ii_ram: "attack_destroyer_ii",
    pirate_attack: "attack_pirate",
    motorboat_ram: "attack_motorboat",
    submarine_missile: "attack_missile",
    nuclear_bomb: "attack_nuclear",
    shock_bomb: "attack_shock",
    detection_bomb: "attack_detection",
    helicopter_strafe: "attack_helicopter",
    radar_scan: "attack_radar",
  });
  const CONTROL_EFFECTS = Object.freeze({
    "start-tutorial": "panel_open",
    "exit-tutorial": "panel_close",
    "tutorial-start-beginner": "tutorial_complete",
    "select-mode": "ui_select",
    "select-bot-difficulty": "ui_select",
    "select-map-size": "map_switch",
    "open-audio-settings": "panel_open",
    "close-audio-settings": "panel_close",
    "open-rules": "panel_open",
    "close-rules": "panel_close",
    reload: "confirm",
    "retry-connection": "reconnect",
    "restore-session": "reconnect",
    "dismiss-session": "cancel",
    "copy-room": "copy",
    "copy-invite": "copy",
    "share-invite": "copy",
    "toggle-deployment-map": "panel_close",
    "select-placement": "ui_select",
    "clear-deployment": "warning",
    "ready-deployment": "panel_open",
    "leave-room": "warning",
    "switch-map": "map_switch",
    "toggle-battle-map": "panel_close",
    "select-battle-target": "ui_select",
    "select-action": "ui_select",
    "toggle-action-drawer": "panel_open",
    "toggle-log": "panel_open",
    "close-battle-drawers": "panel_close",
    "set-event-channel": "log_switch",
    "set-tactical-layer": "map_switch",
    "set-helicopter-axis": "ui_select",
    "select-marker-tool": "ui_select",
    "select-bridge-marker-tool": "ui_select",
    "toggle-marker-mode": "ui_select",
    "cancel-action-selection": "cancel",
    "reopen-action-confirm": "panel_open",
    "select-intelligence": "private",
    "clear-intelligence": "cancel",
    surrender: "warning",
    "surrender-and-leave": "warning",
    "focus-replay": "panel_open",
    "select-replay-player": "ui_select",
    "return-home": "panel_close",
    "open-personalize": "panel_open",
    "close-personalize": "panel_close",
    "select-theme": "ui_select",
    "select-accent": "ui_select",
    "reset-personalization": "cancel",
  });

  if (!Data || !Model || !Tutorial || !app) {
    document.body.textContent = "正式页面资源加载失败，请刷新页面。";
    return;
  }

  if (footerRelease && Data.RELEASE) {
    footerRelease.textContent = Data.RELEASE.stage;
  }
  if (footerProtocol && Data.RELEASE) {
    footerProtocol.textContent = `Rule ${Data.RELEASE.ruleVersion} · Socket ${Data.RELEASE.socketProtocolVersion}`;
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
      roomMode: "pvp",
      botDifficulty: "standard",
      mapSize: 12,
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
    tutorial: {
      active: false,
      session: null,
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
      mapCollapsed: false,
    },
    battle: {
      targetPlayerId: null,
      selectedAction: null,
      target: null,
      actionId: null,
      helicopterAxis: null,
      markerMode: false,
      selectedMarker: "occupied",
      markers: new Map(),
      markerContext: null,
      mobileMap: "enemy",
      actionDrawerOpen: false,
      logOpen: false,
      eventChannel: "combat",
      tacticalLayer: "all",
      ownMapAlert: false,
      collapsedMaps: {},
      selectedIntelligenceSequence: null,
      lastResolutionKey: null,
    },
    replayPlayerId: null,
    reduceMotion: readBooleanPreference(MOTION_STORAGE_KEY),
    theme: readStringPreference(THEME_STORAGE_KEY, "ocean-dark"),
    accent: readStringPreference(ACCENT_STORAGE_KEY, "cyan"),
    audio: Sound?.preferences?.() ?? {
      effectsEnabled: false,
      effectsVolume: 1,
      musicEnabled: false,
      musicVolume: 0.28,
    },
    confirm: null,
    stateWaiters: [],
    renderedPage: null,
  };
  let markerLongPress = null;
  let suppressEnemyCellClickUntil = 0;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uiIcon(name, className = "") {
    return `<svg class="ui-svg-icon ${escapeHtml(className)}" aria-hidden="true" focusable="false"><use href="/assets/icons/ocean-ui.svg#${escapeHtml(name)}"></use></svg>`;
  }

  function unitIconName(unitType) {
    return {
      [Data.UNIT_TYPES.DESTROYER_I]: "ship-destroyer-i",
      [Data.UNIT_TYPES.DESTROYER_II]: "ship-destroyer-ii",
      [Data.UNIT_TYPES.SUBMARINE]: "ship-submarine",
      [Data.UNIT_TYPES.NUCLEAR_SUBMARINE]: "ship-nuclear-submarine",
      [Data.UNIT_TYPES.PIRATE_SHIP]: "ship-pirate",
      [Data.UNIT_TYPES.MOTORBOAT]: "ship-motorboat",
      [Data.UNIT_TYPES.AIRCRAFT_CARRIER]: "ship-aircraft-carrier",
      [Data.UNIT_TYPES.DECOY_TORPEDO]: "ship-decoy",
    }[unitType] ?? "ship-destroyer-i";
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

  function readStringPreference(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return typeof value === "string" && value !== "" ? value : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function writeStringPreference(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_error) {
      showToast("浏览器未允许保存个性化设置。", "warning");
    }
  }

  function botDifficultyLabel(value) {
    return {
      beginner: "新手",
      standard: "标准",
      expert: "专家",
    }[value] ?? "标准";
  }

  function readTutorialProgress() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TUTORIAL_STORAGE_KEY));
      if (
        parsed?.version === Tutorial.TUTORIAL_VERSION &&
        Array.isArray(parsed.completedLessonIds)
      ) {
        return parsed.completedLessonIds;
      }
    } catch (_error) {
      // 教程进度损坏或本机存储被禁用时从头开始。
    }
    return [];
  }

  function saveTutorialProgress() {
    try {
      const session = state.tutorial.session;
      localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({
        version: Tutorial.TUTORIAL_VERSION,
        completedLessonIds: session?.completedLessonIds ?? [],
      }));
    } catch (_error) {
      showToast("浏览器未允许保存教程进度。", "warning");
    }
  }

  function startTutorial() {
    if (rulesDialog.open) rulesDialog.close();
    const session = Tutorial.createSession(readTutorialProgress());
    const firstIncomplete = Tutorial.LESSONS.findIndex(
      (lesson) => !session.completedLessonIds.includes(lesson.id),
    );
    state.tutorial.session = Tutorial.reduce(session, {
      type: "tutorial-go-lesson",
      index: firstIncomplete >= 0 ? firstIncomplete : 0,
    });
    state.tutorial.active = true;
    state.renderedPage = null;
    Data.configureMap(12);
    render();
    app.focus({ preventScroll: true });
  }

  function exitTutorial({ selectBeginner = false } = {}) {
    saveTutorialProgress();
    state.tutorial.active = false;
    if (selectBeginner) {
      state.entry.roomMode = "bot_duel";
      state.entry.maxPlayers = 2;
      state.entry.botDifficulty = "beginner";
      state.entry.mapSize = 12;
    }
    state.renderedPage = null;
    Data.configureMap(state.entry.mapSize);
    render();
    app.focus({ preventScroll: true });
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
      const prefix = `${MARKER_STORAGE_PREFIX}:${roomCode}:${playerId}:`;
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) localStorage.removeItem(key);
      }
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

  const THEME_OPTIONS = Object.freeze({
    "ocean-dark": "深海暗夜",
    "ocean-light": "极地寒光",
    "ocean-dusk": "黄昏余晖",
  });
  const ACCENT_OPTIONS = Object.freeze({
    cyan: ["#63ddf5", "#1ec6eb", "rgba(64, 204, 236, 0.12)", "99, 221, 245"],
    gold: ["#f4c25a", "#d9a02e", "rgba(244, 194, 90, 0.14)", "244, 194, 90"],
    jade: ["#59e0ac", "#2fbf85", "rgba(89, 224, 172, 0.14)", "89, 224, 172"],
    crimson: ["#ff6b77", "#e23b4c", "rgba(255, 107, 119, 0.14)", "255, 107, 119"],
    violet: ["#bc8cff", "#9660e8", "rgba(188, 140, 255, 0.14)", "188, 140, 255"],
  });

  function applyTheme(theme) {
    if (!Object.hasOwn(THEME_OPTIONS, theme)) theme = "ocean-dark";
    state.theme = theme;
    document.documentElement.dataset.theme = theme;
    writeStringPreference(THEME_STORAGE_KEY, theme);
    syncPersonalizeControls();
  }

  function applyAccent(accent) {
    if (!Object.hasOwn(ACCENT_OPTIONS, accent)) accent = "cyan";
    state.accent = accent;
    const parts = ACCENT_OPTIONS[accent];
    const style = document.documentElement.style;
    style.setProperty("--accent-primary", parts[0]);
    style.setProperty("--accent-strong", parts[1]);
    style.setProperty("--accent-soft", parts[2]);
    style.setProperty("--accent-primary-rgb", parts[3]);
    writeStringPreference(ACCENT_STORAGE_KEY, accent);
    syncPersonalizeControls();
  }

  function syncPersonalizeControls() {
    if (!personalizeDialog) return;
    const themeControls = personalizeDialog.querySelectorAll(
      '[data-action="select-theme"]',
    );
    for (const control of themeControls) {
      const active = control.dataset.themeValue === state.theme;
      control.classList.toggle("is-active", active);
      control.setAttribute("aria-checked", String(active));
    }
    const accentControls = personalizeDialog.querySelectorAll(
      '[data-action="select-accent"]',
    );
    for (const control of accentControls) {
      const active = control.dataset.accentValue === state.accent;
      control.classList.toggle("is-active", active);
      control.setAttribute("aria-checked", String(active));
    }
  }

  function openPersonalize() {
    syncPersonalizeControls();
    if (!personalizeDialog.open) personalizeDialog.showModal();
    personalizeDialog
      .querySelector('[data-action="select-theme"].is-active')
      ?.focus();
  }

  function syncAudioControls() {
    const effectsPercent = Math.round((state.audio.effectsVolume ?? 1) * 100);
    const musicPercent = Math.round((state.audio.musicVolume ?? 0.28) * 100);
    effectsToggle.checked = state.audio.effectsEnabled;
    musicToggle.checked = state.audio.musicEnabled;
    effectsVolumeInput.value = String(effectsPercent);
    musicVolumeInput.value = String(musicPercent);
    effectsVolumeOutput.textContent = `${effectsPercent}%`;
    musicVolumeOutput.textContent = `${musicPercent}%`;
    effectsButton.dataset.enabled = String(state.audio.effectsEnabled);
    musicButton.dataset.enabled = String(state.audio.musicEnabled);
    effectsButton.setAttribute(
      "aria-label",
      `打开音效设置；当前${state.audio.effectsEnabled ? "已开启" : "已关闭"}，音量 ${effectsPercent}%`,
    );
    musicButton.setAttribute(
      "aria-label",
      `打开背景音乐设置；当前${state.audio.musicEnabled ? "已开启" : "已关闭"}，音量 ${musicPercent}%`,
    );
  }

  function openAudioSettings(channel = "effects") {
    syncAudioControls();
    if (!audioDialog.open) audioDialog.showModal();
    const focusTarget = channel === "music" ? musicVolumeInput : effectsVolumeInput;
    focusTarget?.focus();
  }

  function setEffectsPreference(enabled) {
    state.audio.effectsEnabled = Sound?.setEffectsEnabled?.(enabled) ?? false;
    syncAudioControls();
  }

  function normalizeVolumeInput(value) {
    const number = Number(value);
    return Number.isFinite(number)
      ? Math.min(1, Math.max(0, number))
      : 0;
  }

  function setEffectsVolumePreference(value) {
    const normalized = normalizeVolumeInput(value);
    state.audio.effectsVolume = Sound?.setEffectsVolume?.(normalized) ?? normalized;
    syncAudioControls();
  }

  function setMusicVolumePreference(value) {
    const normalized = normalizeVolumeInput(value);
    state.audio.musicVolume = Sound?.setMusicVolume?.(normalized) ?? normalized;
    syncAudioControls();
  }

  async function setMusicPreference(enabled) {
    const result = await Sound?.setMusicEnabled?.(enabled) ?? {
      enabled: false,
      available: false,
    };
    state.audio.musicEnabled = result.enabled;
    syncAudioControls();
    if (enabled && !result.enabled) {
      showToast(
        `未能播放背景音乐。请确认已放置 ${Sound?.MUSIC_PATH ?? "背景音乐文件"}，并再次点击音乐按钮。`,
        "warning",
        8_000,
      );
    }
  }

  function toastPresentation(kind) {
    return {
      info: { icon: "action-radar", title: "提示" },
      success: { icon: "status-online", title: "完成" },
      warning: { icon: "status-unknown", title: "注意" },
      error: { icon: "status-loss", title: "操作未完成" },
      result: { icon: "action-radar", title: "战场更新" },
      hit: { icon: "status-hit", title: "命中" },
      miss: { icon: "status-miss", title: "未命中" },
      unknown: { icon: "status-unknown", title: "结果未知" },
      private: { icon: "status-private", title: "私人情报" },
    }[kind] ?? { icon: "action-radar", title: "提示" };
  }

  function controlEffectName(action, control) {
    if (action === "toggle-deployment-map") {
      return state.deployment.mapCollapsed ? "panel_open" : "panel_close";
    }
    if (action === "toggle-action-drawer") {
      return state.battle.actionDrawerOpen ? "panel_close" : "panel_open";
    }
    if (action === "toggle-log") {
      return state.battle.logOpen ? "panel_close" : "panel_open";
    }
    if (action === "toggle-battle-map") {
      return state.battle.collapsedMaps[control.dataset.mapId]
        ? "panel_open"
        : "panel_close";
    }
    return CONTROL_EFFECTS[action] ?? null;
  }

  function showToast(message, kind = "info", duration = 5_000, effect = undefined) {
    if (!message) {
      return;
    }
    const meta = toastPresentation(kind);
    const toast = document.createElement("div");
    toast.className = `toast toast--${kind}`;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");
    toast.setAttribute("tabindex", "0");
    toast.setAttribute("aria-label", `${meta.title}：${message}。点击关闭`);
    toast.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${uiIcon(meta.icon)}</span>
      <div class="toast__content"><strong>${escapeHtml(meta.title)}</strong><p>${escapeHtml(message)}</p></div>
      <button class="toast__close" type="button" aria-label="关闭这条播报">×</button>`;
    let timer = null;
    const dismiss = () => {
      if (timer !== null) window.clearTimeout(timer);
      toast.remove();
    };
    toast.addEventListener("click", dismiss);
    toast.addEventListener("keydown", (event) => {
      if (["Enter", " ", "Escape"].includes(event.key)) {
        event.preventDefault();
        dismiss();
      }
    });
    toastRegion.append(toast);
    timer = window.setTimeout(dismiss, duration);
    if (effect !== false) {
      Sound?.playEffect?.(effect ?? ({
        success: "success",
        warning: "warning",
        error: "error",
        hit: "hit",
        miss: "miss",
        unknown: "unknown",
        private: "private",
      }[kind] ?? "click"));
    }
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
    state.deployment.mapCollapsed = false;
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
    const enemyMap = room.battle.own.enemyMapsByPlayer?.[targetPlayerId]
      ?? room.battle.own.enemyMap;
    const resolved = Data.resolvedTargetSet({ ...room.battle.own, enemyMap });
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
    const defenderIds = feedback.defenderIds ?? [feedback.defenderId].filter(Boolean);
    const defenderName = defenderIds.length > 1
      ? defenderIds.map((id) => Model.nicknameFor(room, id)).join("、")
      : feedback.defenderId
        ? Model.nicknameFor(room, feedback.defenderId)
        : "目标玩家";
    const isActor = feedback.actorId === ownId;
    const isDefender = defenderIds.includes(ownId);
    const target = Model.formatTarget(feedback.target);
    const publicActorPrefix = isDefender
      ? `${actorName} 对你`
      : `${actorName} 对 ${defenderName}`;
    const actorTargetPrefix = `${feedback.actionName} → ${defenderName}`;
    const receivedHits = (feedback.receivedHits ?? [])
      .map((event) => {
        const unit = Data.getUnitDefinitionByType(event.unitType);
        const hpText = event.appliedDamage > 0
          ? `生命值 ${Model.formatHp(event.beforeHp)} → ${Model.formatHp(event.afterHp)}`
          : `生命值保持 ${Model.formatHp(event.afterHp)}`;
        return `${unit?.name ?? "己方单位"}被命中，${hpText}${event.sunk ? "，已沉没" : ""}`;
      });

    if (feedback.actionType === Data.ACTION_TYPES.SUBMARINE_MISSILE) {
      return isActor
        ? `潜射导弹已向 ${defenderName} 的 ${target} 发射；命中结果不会向你显示。`
        : receivedHits.length > 0
          ? `${publicActorPrefix}使用潜射导弹攻击了 ${target}；${receivedHits.join("；")}。`
          : `${publicActorPrefix}使用潜射导弹攻击了 ${target}。`;
    }
    if (feedback.actionType === Data.ACTION_TYPES.NUCLEAR_BOMB) {
      return isActor
        ? `核弹已向 ${defenderName} 的 ${target} 投放；命中结果不会向你显示。`
        : receivedHits.length > 0
          ? `${publicActorPrefix}向 ${target} 投放了核弹；${receivedHits.join("；")}。`
          : `${publicActorPrefix}向 ${target} 投放了核弹。`;
    }
    if (feedback.actionType === Data.ACTION_TYPES.SHOCK_BOMB) {
      return isActor
        ? `震爆弹已作用于 ${defenderName} 地图中以 ${target} 为中心的 ${room.mapRules.shockSize}×${room.mapRules.shockSize} 区域；是否生效不会向你显示。`
        : `${publicActorPrefix}以 ${target} 为中心使用了震爆弹。`;
    }
    if (feedback.actionType === Data.ACTION_TYPES.DETECTION_BOMB) {
      if (isActor) {
        if (feedback.privateResultsByDefender) {
          const results = Object.entries(feedback.privateResultsByDefender)
            .map(([playerId, result]) => `${Model.nicknameFor(room, playerId)}：${result === "underwater_signal_detected" ? "有水下信号" : "无水下信号"}`);
          return `探测弹同时完成：${results.join("；")}。`;
        }
        return feedback.result === "underwater_signal_detected"
          ? `探测弹：${defenderName} 的 ${target} 周围探测到水下信号。`
          : `探测弹：${defenderName} 的 ${target} 周围未探测到水下信号。`;
      }
      return `${publicActorPrefix}以 ${target} 为中心使用了探测弹；探测结果仅行动方可见。`;
    }
    if (feedback.actionType === Data.ACTION_TYPES.RADAR_SCAN) {
      if (isActor) {
        if (feedback.privateResultsByDefender) {
          const results = Object.entries(feedback.privateResultsByDefender)
            .map(([playerId, result]) => `${Model.nicknameFor(room, playerId)}：${result === "layout_detected" ? "发现布局" : "未发现布局"}`);
          return `雷达从 ${target} 开始同时扫描：${results.join("；")}。`;
        }
        return feedback.result === "layout_detected"
          ? `雷达扫描：${defenderName} 的 ${target} 起始 ${room.mapRules.radarSize}×${room.mapRules.radarSize} 区域发现布局。`
          : `雷达扫描：${defenderName} 的 ${target} 起始 ${room.mapRules.radarSize}×${room.mapRules.radarSize} 区域未发现布局。`;
      }
      return `${publicActorPrefix}从 ${target} 开始执行了 ${room.mapRules.radarSize}×${room.mapRules.radarSize} 雷达扫描；扫描结果仅行动方可见。`;
    }
    if (isActor && feedback.resultsByDefender) {
      const results = Object.entries(feedback.resultsByDefender)
        .map(([playerId, result]) => `${Model.nicknameFor(room, playerId)}：${result === "hit" ? "命中" : "未命中"}`);
      return `${feedback.actionName} → ${target} 同时结算：${results.join("；")}。`;
    }
    if (feedback.result === "hit") {
      if (isDefender && receivedHits.length > 0) {
        return `${actorName} 使用${feedback.actionName}：${receivedHits.join("；")}。`;
      }
      return isActor
        ? `${actorTargetPrefix}：${target} 命中。`
        : `${publicActorPrefix}使用${feedback.actionName}：${target} 命中。`;
    }
    if (feedback.result === "miss") {
      return isActor
        ? `${actorTargetPrefix}：${target} 未命中。`
        : `${publicActorPrefix}使用${feedback.actionName}：${target} 未命中。`;
    }
    if (feedback.cellResultsByDefender) {
      const counts = Object.entries(feedback.cellResultsByDefender).map(([playerId, cells]) => {
        const hits = cells.filter((cell) => cell.result === "hit").length;
        const misses = cells.filter((cell) => cell.result === "miss").length;
        return `${Model.nicknameFor(room, playerId)}：命中 ${hits} 格，未命中 ${misses} 格`;
      });
      if (isDefender && receivedHits.length > 0) {
        return `${actorName} 对所有敌方玩家执行直升机扫射：${receivedHits.join("；")}。`;
      }
      return `直升机同时扫射 ${defenderName}：${counts.join("；")}。`;
    }
    if (Array.isArray(feedback.cellResults)) {
      const hits = feedback.cellResults.filter((cell) => cell.result === "hit").length;
      const misses = feedback.cellResults.filter((cell) => cell.result === "miss").length;
      if (isDefender && receivedHits.length > 0) {
        return `${actorName} 对你执行直升机扫射：${receivedHits.join("；")}。`;
      }
      return isActor
        ? `直升机扫射 → ${defenderName}：命中 ${hits} 格，未命中 ${misses} 格。`
        : `${publicActorPrefix}执行直升机扫射：命中 ${hits} 格，未命中 ${misses} 格。`;
    }
    return isActor
      ? `${actorTargetPrefix}已经完成结算。`
      : `${publicActorPrefix}使用${feedback.actionName}已经完成结算。`;
  }

  function acceptRoomState(nextRoom) {
    if (!nextRoom || typeof nextRoom.stateVersion !== "number") {
      return;
    }
    const mapSize = nextRoom.mapSize ?? nextRoom.mapRules?.mapSize ?? 12;
    Data.configureMap(mapSize);
    nextRoom = {
      ...nextRoom,
      mapSize,
      mapRules: nextRoom.mapRules ?? Data.createMapRules(mapSize),
    };
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

    const resumedFromPause = Boolean(
      previous?.roomCode === nextRoom.roomCode &&
      previous?.connectionPhase &&
      previous.connectionPhase !== "CONNECTED" &&
      nextRoom.connectionPhase === "CONNECTED"
    );
    const enteredPause = Boolean(
      previous?.roomCode === nextRoom.roomCode &&
      previous?.connectionPhase === "CONNECTED" &&
      nextRoom.connectionPhase !== "CONNECTED"
    );
    const previousEliminated = new Set(previous?.battle?.match?.eliminatedPlayerIds ?? []);
    const newlyEliminated = (nextRoom.battle?.match?.eliminatedPlayerIds ?? []).filter((id) => !previousEliminated.has(id));

    state.room = nextRoom;
    if (
      nextRoom.turn?.canAct &&
      (!previous?.turn?.canAct || previous?.turn?.turnNumber !== nextRoom.turn.turnNumber)
    ) {
      Sound?.playEffect?.("turn");
    }
    if (nextRoom.roomPhase === "FINISHED" && previous?.roomPhase !== "FINISHED") {
      const winnerId = nextRoom.battle?.match?.result?.winnerId;
      Sound?.playEffect?.(
        winnerId === nextRoom.own.playerId
          ? "victory"
          : winnerId === null
            ? "unknown"
            : "defeat",
      );
    }
    if (enteredPause) {
      Sound?.playEffect?.("pause");
    }
    if (resumedFromPause) {
      Sound?.playEffect?.("reconnect");
      showToast("连接已恢复，对局继续。", "success", 3_500, false);
    }
    for (const playerId of newlyEliminated) {
      Sound?.playEffect?.("eliminated");
      showToast(`${Model.nicknameFor(nextRoom, playerId)} 已淘汰`, "warning", 4_500, false);
    }
    const availableTargets = nextRoom.turn?.canAct && nextRoom.maxPlayers === 3
      ? (nextRoom.turn.remainingTargetPlayerIds ?? [])
      : battleOpponentIds(nextRoom.battle);
    if (!availableTargets.includes(state.battle.targetPlayerId)) {
      state.battle.targetPlayerId = availableTargets[0] ?? null;
    }
    const visibleBattleMaps = ["own", ...battleOpponentIds(nextRoom.battle)];
    if (!visibleBattleMaps.includes(state.battle.mobileMap)) {
      state.battle.mobileMap = state.battle.targetPlayerId ?? "own";
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
        showToast(description, resolutionVisualState(nextRoom), 7_000);
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
    headerRoomCode.hidden = !state.room?.roomCode && !state.tutorial.active;
    headerRoomCode.textContent = state.tutorial.active
      ? "交互教程 · 本地训练"
      : state.room?.roomCode
      ? `${state.room.roomCode} · ${state.room.maxPlayers ?? 2}P · ${state.room.mapSize ?? 12}×${state.room.mapSize ?? 12}${state.room.roomMode === "bot_duel" ? ` · ${botDifficultyLabel(state.room.botDifficulty)} AI` : ""}`
      : "";
    const page = state.tutorial.active ? "T01" : Model.pageForState(state.room);
    const samePage = state.renderedPage === page;
    try {
      if (page === "T01") {
        app.innerHTML = renderTutorialPage();
      } else if (page === "P01") {
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

  function tutorialTargetCoordinate(session, lessonId) {
    if (lessonId === "deployment" && session.step === 0) return "B2";
    if (lessonId === "damage") return "D6";
    if (lessonId === "intelligence") {
      if (session.step === 0) return "C3";
      if (session.step === 2) return "E5";
      if (session.step === 4) return "H8";
    }
    if (lessonId === "secrecy") {
      return session.step === 0 ? "G7" : session.step === 1 ? "H8" : "F6";
    }
    return null;
  }

  function renderTutorialBoard(session, lessonId) {
    const targetCoordinate = tutorialTargetCoordinate(session, lessonId);
    return renderGrid("教程训练海域", (coordinate) => {
      const classes = ["tutorial-board-cell"];
      let content = "";
      let stateText = "未知海域";
      if (coordinate === targetCoordinate) {
        classes.push("tutorial-board-cell--target");
        stateText = "当前任务目标";
      }
      if (lessonId === "deployment" && session.deployment.cells.includes(coordinate)) {
        classes.push("tutorial-board-cell--ship");
        content = "驱";
        stateText = "己方驱逐舰Ⅰ";
      }
      if (lessonId === "damage") {
        if (session.damage.hitCells.includes(coordinate)) {
          classes.push("board-cell--enemy-hit", "tutorial-board-cell--settled");
          content = '<span class="enemy-result">✦</span>';
          stateText = "命中，已经受过一次伤害";
        }
        if (session.damage.nuclearCells.includes(coordinate)) {
          classes.push("board-cell--missile");
          content += '<span class="tutorial-weapon-glyph">☢</span>';
          stateText = "核弹已投放，不重复扣血";
        }
      }
      if (lessonId === "intelligence") {
        if (session.intelligence.radarCells.includes(coordinate)) {
          classes.push("tutorial-board-cell--radar");
          stateText = "雷达扫描区域";
        }
        if (session.intelligence.detectionCells.includes(coordinate)) {
          classes.push("board-cell--intel-detection");
          stateText = "探测弹区域";
        }
        if (session.intelligence.markers[coordinate] === "underwater_yes") {
          classes.push("board-cell--marker", "board-cell--marker-underwater_yes");
          content = '<span class="marker-half marker-half--top"></span><span class="marker-half marker-half--bottom"></span>';
          stateText = "本机标记：水下有目标";
        }
      }
      if (lessonId === "secrecy") {
        if (session.secrecy.shockCells.includes(coordinate)) {
          classes.push("board-cell--intel-shock");
          stateText = "震爆弹作用区域";
        }
        if (session.secrecy.missileCells.includes(coordinate)) {
          classes.push("board-cell--missile");
          content = '<span class="missile-glyph">↗</span>';
          stateText = "潜射导弹已发射";
        }
        if (session.secrecy.nuclearCells.includes(coordinate)) {
          classes.push("board-cell--missile");
          content = '<span class="missile-glyph">☢</span>';
          stateText = "核弹已投放";
        }
      }
      return {
        classes,
        content,
        label: `${coordinate}，${stateText}`,
        attributes: {
          "data-action": "tutorial-cell",
          "data-coordinate": coordinate,
        },
      };
    }, "tutorial-board-frame");
  }

  function tutorialToolButton(value, label, selected, options = {}) {
    return `<button
      type="button"
      class="tutorial-tool ${selected ? "is-selected" : ""}"
      data-action="tutorial-select"
      data-value="${escapeHtml(value)}"
      ${options.disabled ? "disabled" : ""}
      aria-pressed="${selected}"
    ><span>${escapeHtml(options.glyph ?? "•")}</span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(options.hint ?? "")}</small></button>`;
  }

  function renderTutorialDeployment(session) {
    return `
      <div class="tutorial-simulator">
        <section class="tutorial-stage-card">
          <div class="tutorial-tool-row">
            ${tutorialToolButton("destroyer", "驱逐舰Ⅰ", true, { glyph: "驱", hint: "3 格直线" })}
            <button class="tutorial-tool" type="button" data-action="tutorial-rotate" ${session.step !== 1 ? "disabled" : ""}>
              <span>↻</span><strong>旋转</strong><small>${session.deployment.orientation === "horizontal" ? "当前横向" : "当前纵向"}</small>
            </button>
          </div>
          ${renderTutorialBoard(session, "deployment")}
        </section>
        <aside class="tutorial-concept-card">
          <span class="status-kicker">部署原则</span>
          <h3>先形状，后位置</h3>
          <ul>
            <li>驱逐舰与海盗船只能形成水平或垂直直线。</li>
            <li>潜水艇和核潜艇固定为完整 2×2。</li>
            <li>航空母舰占格必须全部四向连通。</li>
            <li>作战单位与诱饵都不能重叠，部署不会向敌方公开。</li>
          </ul>
        </aside>
      </div>`;
  }

  function renderTutorialDamage(session) {
    return `
      <div class="tutorial-simulator">
        <section class="tutorial-stage-card">
          <div class="tutorial-tool-row">
            ${tutorialToolButton("destroyer", "驱逐舰Ⅰ冲撞", session.damage.selectedAction === "destroyer", {
              glyph: "冲", hint: "命中自损 0.5", disabled: session.step >= 2,
            })}
            ${tutorialToolButton("nuclear", "核弹", session.damage.selectedAction === "nuclear", {
              glyph: "☢", hint: "结果保密", disabled: session.step < 2,
            })}
          </div>
          ${renderTutorialBoard(session, "damage")}
        </section>
        <aside class="tutorial-concept-card">
          <span class="status-kicker">训练状态</span>
          <div class="tutorial-hp-grid">
            <div><strong>${Model.formatHp(session.damage.targetHp)}</strong><small>训练目标 HP</small></div>
            <div><strong>${Model.formatHp(session.damage.ownDestroyerHp)}</strong><small>己方驱逐舰Ⅰ HP</small></div>
          </div>
          <h3>受击格不是“禁止选择格”</h3>
          <p>同一单位格只能受到一次伤害。潜射导弹、核弹和部分范围行动仍可覆盖它，但不会重复扣减生命值。</p>
          <p>驱逐舰另有更严格限制：两艘驱逐舰共享已攻击坐标，每个坐标只能冲撞一次。</p>
        </aside>
      </div>`;
  }

  function renderTutorialIntelligence(session) {
    return `
      <div class="tutorial-simulator">
        <section class="tutorial-stage-card">
          <div class="tutorial-tool-row tutorial-tool-row--scroll">
            ${tutorialToolButton("radar", "雷达", session.intelligence.selectedTool === "radar", {
              glyph: "◎", hint: "4×4 布局判断", disabled: session.step > 0,
            })}
            ${tutorialToolButton("underwater_yes", "水下有", session.intelligence.selectedTool === "underwater_yes", {
              glyph: "▰", hint: "本机私人标记", disabled: session.step !== 1 && session.step !== 2,
            })}
            ${tutorialToolButton("detection", "探测弹", session.intelligence.selectedTool === "detection", {
              glyph: "⌁", hint: "3×3 水下信号", disabled: session.step < 3,
            })}
          </div>
          ${renderTutorialBoard(session, "intelligence")}
        </section>
        <aside class="tutorial-concept-card">
          <span class="status-kicker">情报边界</span>
          <h3>“发现”不等于“定位”</h3>
          <ul>
            <li>首次正常回合强制使用航母雷达。</li>
            <li>雷达只判断区域内是否存在任意布局。</li>
            <li>探测弹的信号可能来自水下单位或有效诱饵。</li>
            <li>私人标记只是你的推断，自动命中标记才是服务器事实。</li>
          </ul>
        </aside>
      </div>`;
  }

  function renderTutorialSecrecy(session) {
    return `
      <div class="tutorial-simulator">
        <section class="tutorial-stage-card">
          <div class="tutorial-tool-row tutorial-tool-row--scroll">
            ${tutorialToolButton("missile", "潜射导弹", session.secrecy.selectedWeapon === "missile", {
              glyph: "↗", hint: "点击 G7", disabled: session.step > 0,
            })}
            ${tutorialToolButton("nuclear", "核弹", session.secrecy.selectedWeapon === "nuclear", {
              glyph: "☢", hint: "点击 H8", disabled: session.step !== 1,
            })}
            ${tutorialToolButton("shock", "震爆弹", session.secrecy.selectedWeapon === "shock", {
              glyph: "ϟ", hint: "点击 F6", disabled: session.step !== 2,
            })}
          </div>
          ${renderTutorialBoard(session, "secrecy")}
        </section>
        <aside class="tutorial-concept-card tutorial-concept-card--messages">
          <span class="status-kicker">分角色播报</span>
          <article data-viewer="attacker"><small>行动方看到</small><strong>${escapeHtml(session.secrecy.attackerMessage)}</strong></article>
          <article data-viewer="defender"><small>防守方看到</small><strong>${escapeHtml(session.secrecy.defenderMessage)}</strong></article>
          <p>正式对局中，两侧消息由服务器分别生成；客户端不会收到自己无权知道的隐藏结果。</p>
        </aside>
      </div>`;
  }

  function renderTutorialCommand(session) {
    const question = Tutorial.QUIZ[session.quiz.index];
    if (!question) {
      return `
        <section class="tutorial-complete-card">
          <span class="tutorial-complete-card__emblem" aria-hidden="true">✓</span>
          <span class="status-kicker">TRAINING COMPLETE</span>
          <h2>指挥训练完成</h2>
          <p>五个章节均已完成。建议先挑战新手机器人，再逐步切换到标准和专家。</p>
          <div class="tutorial-complete-actions">
            <button class="button button--primary button--large" type="button" data-action="tutorial-start-beginner">选择新手人机</button>
            <button class="button button--secondary" type="button" data-action="exit-tutorial">返回首页</button>
          </div>
        </section>`;
    }
    return `
      <div class="tutorial-quiz-layout">
        <section class="tutorial-quiz-card">
          <div class="tutorial-quiz-card__meta"><span>问题 ${session.quiz.index + 1} / ${Tutorial.QUIZ.length}</span><span>已答对 ${session.quiz.correctCount}</span></div>
          <h2>${escapeHtml(question.question)}</h2>
          <div class="tutorial-answer-list">
            ${question.options.map((option) => `<button type="button" data-action="tutorial-answer" data-value="${escapeHtml(option.id)}"><span>${escapeHtml(option.id.toUpperCase())}</span><strong>${escapeHtml(option.text)}</strong></button>`).join("")}
          </div>
        </section>
        <aside class="tutorial-concept-card">
          <span class="status-kicker">终局提示</span>
          <h3>先完成行动，再判断胜负</h3>
          <p>普通情况下航空母舰沉没即出局；海盗船具有特殊同时沉没优先规则；常规攻击全部耗尽时进入手动终局鱼雷齐射。</p>
          <p>三人局每回合只提交一次行动，两名防守方独立结算，行动资源和行动方自损只计算一次。</p>
        </aside>
      </div>`;
  }

  function renderTutorialPage() {
    const session = state.tutorial.session ?? Tutorial.createSession(readTutorialProgress());
    state.tutorial.session = session;
    const lesson = Tutorial.currentLesson(session);
    const lessonComplete = Tutorial.lessonIsComplete(session, lesson.id);
    const progress = Tutorial.progress(session);
    const lessonBody = lesson.id === "deployment"
      ? renderTutorialDeployment(session)
      : lesson.id === "damage"
        ? renderTutorialDamage(session)
        : lesson.id === "intelligence"
          ? renderTutorialIntelligence(session)
          : lesson.id === "secrecy"
            ? renderTutorialSecrecy(session)
            : renderTutorialCommand(session);
    return `
      <section class="tutorial-page page-enter" aria-labelledby="tutorial-title">
        <header class="tutorial-header">
          <div>
            <span class="status-kicker">OCEAN ACADEMY · 本地训练</span>
            <h1 id="tutorial-title">完整交互教程</h1>
            <p>所有训练均在当前浏览器内运行，不创建房间，不读取或改写正式对局。</p>
          </div>
          <button class="button button--quiet" type="button" data-action="exit-tutorial">退出教程</button>
        </header>

        <div class="tutorial-progress" aria-label="教程完成进度">
          <div data-progress="${progress.percent}"><span></span></div>
          <strong>${progress.completed} / ${progress.total} 章节完成</strong>
        </div>

        <nav class="tutorial-chapters" aria-label="教程章节">
          ${Tutorial.LESSONS.map((item, index) => {
            const complete = Tutorial.lessonIsComplete(session, item.id);
            return `<button type="button" data-action="tutorial-go-lesson" data-index="${index}" class="${index === session.lessonIndex ? "is-active" : ""}" aria-current="${index === session.lessonIndex ? "step" : "false"}">
              <span>${complete ? "✓" : item.number}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)}</small>
            </button>`;
          }).join("")}
        </nav>

        <article class="tutorial-lesson-heading">
          <div><span>第 ${lesson.number} 章</span><h2>${escapeHtml(lesson.title)}</h2></div>
          <p>${escapeHtml(lesson.summary)}</p>
        </article>

        <div class="tutorial-task-message" data-kind="${escapeHtml(session.messageKind)}" role="status" aria-live="polite">
          <span aria-hidden="true">${session.messageKind === "success" ? "✓" : session.messageKind === "warning" ? "!" : "→"}</span>
          <strong>${escapeHtml(session.message)}</strong>
        </div>

        ${lessonBody}

        <footer class="tutorial-footer-actions">
          <button class="button button--quiet" type="button" data-action="tutorial-previous-lesson" ${session.lessonIndex === 0 ? "disabled" : ""}>上一章</button>
          <button class="button button--secondary" type="button" data-action="tutorial-reset-lesson">重置本章</button>
          ${session.lessonIndex < Tutorial.LESSONS.length - 1
            ? `<button class="button button--primary" type="button" data-action="tutorial-next-lesson" ${lessonComplete ? "" : "disabled"}>下一章</button>`
            : session.finished
              ? '<button class="button button--primary" type="button" data-action="tutorial-start-beginner">选择新手人机</button>'
              : '<button class="button button--primary" type="button" disabled>完成考核后继续</button>'}
        </footer>
      </section>`;
  }

  function renderEntryPage() {
    const stored = readStoredSession();
    const pending = state.pendingRequest;
    const roomCode = escapeHtml(state.entry.roomCode);
    const online = state.connection.phase === "online";
    return `
      <section class="entry-page entry-page--v07 page-enter" aria-labelledby="entry-title">
        <div class="entry-hero entry-hero--v07">
          <div class="entry-hero__badge"><span></span> ONLINE TACTICAL GAME</div>
          <h1 id="entry-title">OCEAN</h1>
          <p class="entry-hero__tagline">深海战术对抗</p>
          <div class="entry-hero__visual" aria-hidden="true">
            <span class="hero-sonar hero-sonar--one"></span>
            <span class="hero-sonar hero-sonar--two"></span>
            <span class="hero-sonar hero-sonar--three"></span>
            <i></i>
          </div>
          <div class="entry-facts entry-facts--v07" aria-label="游戏特征">
            <span><strong>10–15</strong> 海域</span>
            <span><strong>2–3</strong> 玩家</span>
            <span><strong>90s</strong> 回合</span>
          </div>
        </div>

        <div class="entry-console entry-console--v07">
          ${!online ? `
            <article class="connection-help connection-help--compact" role="status" aria-live="polite">
              <span class="connection-help__signal" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(state.connection.phase === "offline" ? "连接已中断" : "正在连接服务器")}</strong>
                <p>${escapeHtml(state.connection.message)}</p>
              </div>
              <button class="button button--quiet button--compact" data-action="retry-connection">重试</button>
            </article>` : ""}

          ${stored ? `
            <article class="restore-card restore-card--v07">
              <div class="restore-card__status" aria-hidden="true">↻</div>
              <div>
                <span class="status-kicker">可恢复对局</span>
                <strong>${escapeHtml(stored.roomCode)}</strong>
              </div>
              <div class="restore-card__actions">
                <button class="button button--primary button--compact" data-action="restore-session" ${!state.connected || pending ? "disabled" : ""}>
                  ${state.restoring ? "恢复中…" : "继续"}
                </button>
                <button class="icon-button icon-button--small" data-action="dismiss-session" ${pending ? "disabled" : ""} aria-label="忽略恢复记录" data-tooltip="忽略">×</button>
              </div>
            </article>` : ""}

          <div class="entry-form-card entry-form-card--v07">
            <div class="entry-form-card__header entry-form-card__header--v07">
              <div>
                <span class="status-kicker">进入战场</span>
                <h2>开始对局</h2>
              </div>
              <button class="icon-button icon-button--small" type="button" data-action="open-rules" aria-label="打开游戏说明" data-tooltip="游戏说明">?</button>
            </div>

            <label class="field field--modern">
              <span>昵称</span>
              <input
                id="nickname-input"
                name="nickname"
                maxlength="12"
                autocomplete="nickname"
                placeholder="输入昵称"
                value="${escapeHtml(state.entry.nickname)}"
                ${pending ? "disabled" : ""}
              />
              <small><span id="nickname-count">${Array.from(state.entry.nickname).length}</span>/12</small>
            </label>

            ${state.entry.error ? `<p class="form-error" role="alert">${escapeHtml(state.entry.error)}</p>` : ""}

            <form id="create-form" class="create-room-panel">
              <div class="mode-switch" role="radiogroup" aria-label="对战模式">
                <button
                  type="button"
                  class="mode-switch__option ${state.entry.roomMode === "pvp" && state.entry.maxPlayers === 2 ? "is-active" : ""}"
                  role="radio"
                  aria-checked="${state.entry.roomMode === "pvp" && state.entry.maxPlayers === 2}"
                  data-action="select-mode"
                  data-max-players="2"
                  data-room-mode="pvp"
                  ${!state.connected || pending ? "disabled" : ""}
                >
                  <span>2 人</span><small>对战</small>
                </button>
                <button
                  type="button"
                  class="mode-switch__option ${state.entry.roomMode === "pvp" && state.entry.maxPlayers === 3 ? "is-active" : ""}"
                  role="radio"
                  aria-checked="${state.entry.roomMode === "pvp" && state.entry.maxPlayers === 3}"
                  data-action="select-mode"
                  data-max-players="3"
                  data-room-mode="pvp"
                  ${!state.connected || pending ? "disabled" : ""}
                >
                  <span>3 人</span><small>自由战</small>
                </button>
                <button
                  type="button"
                  class="mode-switch__option ${state.entry.roomMode === "bot_duel" ? "is-active" : ""}"
                  role="radio"
                  aria-checked="${state.entry.roomMode === "bot_duel"}"
                  data-action="select-mode"
                  data-max-players="2"
                  data-room-mode="bot_duel"
                  ${!state.connected || pending ? "disabled" : ""}
                >
                  <span>人机</span><small>1v1</small>
                </button>
              </div>
              ${state.entry.roomMode === "bot_duel" ? `
                <div class="bot-difficulty-picker">
                  <div class="bot-difficulty-picker__heading">
                    <span>机器人难度</span><small>三档均遵守相同规则与情报权限</small>
                  </div>
                  <div class="bot-difficulty-switch" role="radiogroup" aria-label="机器人难度">
                    ${[
                      { value: "beginner", label: "新手", hint: "合法行动中偏随机选择" },
                      { value: "standard", label: "标准", hint: "利用命中与侦察情报" },
                      { value: "expert", label: "专家", hint: "分析热区、延伸和资源" },
                    ].map((difficulty) => `<button
                      type="button"
                      class="bot-difficulty-switch__option ${state.entry.botDifficulty === difficulty.value ? "is-active" : ""}"
                      role="radio"
                      aria-checked="${state.entry.botDifficulty === difficulty.value}"
                      data-action="select-bot-difficulty"
                      data-bot-difficulty="${difficulty.value}"
                      ${!state.connected || pending ? "disabled" : ""}
                    ><strong>${difficulty.label}</strong><small>${difficulty.hint}</small></button>`).join("")}
                  </div>
                </div>` : ""}
              <div class="map-size-picker">
                <span>地图大小</span>
                <div class="map-size-switch" role="radiogroup" aria-label="地图大小">
                  ${Data.SUPPORTED_MAP_SIZES.map((mapSize) => `
                    <button
                      type="button"
                      class="map-size-switch__option ${state.entry.mapSize === mapSize ? "is-active" : ""}"
                      role="radio"
                      aria-checked="${state.entry.mapSize === mapSize}"
                      data-action="select-map-size"
                      data-map-size="${mapSize}"
                      ${!state.connected || pending ? "disabled" : ""}
                    ><strong>${mapSize}×${mapSize}</strong><small>${mapSize === 10 ? "紧凑" : mapSize === 12 ? "标准" : "广域"}</small></button>`).join("")}
                </div>
              </div>
              <button class="button button--primary button--large" type="submit" ${!state.connected || pending ? "disabled" : ""}>
                ${pending === "create" ? '<span class="button-spinner" aria-hidden="true"></span> 创建中…' : '创建房间 <span aria-hidden="true">→</span>'}
              </button>
              <button class="button button--secondary tutorial-entry-button" type="button" data-action="start-tutorial" ${pending ? "disabled" : ""}>
                <span aria-hidden="true">◇</span><span><strong>完整交互教程</strong><small>${readTutorialProgress().length === Tutorial.LESSONS.length ? "已完成，可随时复习" : "五章训练 · 无需创建房间"}</small></span>
              </button>
            </form>

            <div class="entry-divider entry-divider--clean"><span>加入已有房间</span></div>

            <form id="join-form" class="join-form join-form--v07">
              <label class="field field--code field--modern">
                <span class="sr-only">6 位房间码</span>
                <input
                  id="room-code-input"
                  name="roomCode"
                  maxlength="6"
                  inputmode="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="输入 6 位房间码"
                  value="${roomCode}"
                  ${pending ? "disabled" : ""}
                />
              </label>
              <button class="button button--secondary" type="submit" ${!state.connected || pending ? "disabled" : ""}>
                ${pending === "join" ? '<span class="button-spinner" aria-hidden="true"></span> 加入中…' : "加入"}
              </button>
            </form>
          </div>
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
    const occupied = room.seats.length;
    const capacity = room.maxPlayers ?? 2;
    return `
      <section class="waiting-page waiting-page--v07 page-enter" aria-labelledby="waiting-title">
        ${renderRoomTop("等待玩家", `${occupied} / ${capacity} 已加入`, {
          kicker: `${capacity === 3 ? "3 PLAYER FFA" : "2 PLAYER MATCH"}`,
        })}

        <div class="waiting-layout waiting-layout--v07">
          <section class="lobby-room-card" aria-label="房间邀请">
            <span class="status-kicker">房间码</span>
            <strong class="lobby-room-code">${escapeHtml(room.roomCode)}</strong>
            <div class="lobby-room-actions">
              <button class="button button--primary" data-action="copy-room">复制房间码</button>
              <button class="button button--secondary" data-action="share-invite">分享邀请</button>
            </div>
            <div class="lobby-link" title="${escapeHtml(inviteUrl)}">
              <span aria-hidden="true">↗</span>
              <code>${escapeHtml(inviteUrl)}</code>
              <button class="icon-button icon-button--small" data-action="copy-invite" aria-label="复制邀请链接" data-tooltip="复制链接">⧉</button>
            </div>
          </section>

          <section class="waiting-panel waiting-panel--v07" aria-labelledby="waiting-title">
            <div class="waiting-panel__heading">
              <div>
                <span class="status-kicker">玩家</span>
                <h2 id="waiting-title">${occupied} / ${capacity}</h2>
              </div>
              <span class="lobby-wait-indicator" aria-live="polite">
                <i></i>${occupied < capacity ? "等待加入" : "准备开始"}
              </span>
            </div>
            ${renderSeats(room)}
            <div class="waiting-panel__footer">
              <button class="button button--danger-quiet" data-action="leave-room">离开房间</button>
              <button class="button button--quiet" data-action="open-rules">游戏说明</button>
            </div>
          </section>
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
    const tacticalSea = className.split(/\s+/).includes("board-frame--tactical-sea");
    const contents = [
      '<span class="board-corner" aria-hidden="true"></span>',
      ...Data.COLUMNS.map(
        (column) => `<span class="board-axis board-axis--column" data-axis-column="${column}">${column}</span>`,
      ),
    ];
    for (const row of Data.ROWS) {
      contents.push(`<span class="board-axis board-axis--row" data-axis-row="${row}">${row}</span>`);
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
            role="gridcell"
            aria-label="${escapeHtml(cell.label ?? coordinate)}"
            ${cell.disabled ? "disabled" : ""}
            ${cell.draggable ? 'draggable="true"' : ""}
            ${attributes}
          >${cell.content ?? ""}${tacticalSea ? `<span class="tactical-crosshair" aria-hidden="true"></span><span class="tactical-coordinate-badge" aria-hidden="true">${coordinate}</span>` : ""}</button>`);
      }
    }
    return `
      <div class="board-frame ${className}"${tacticalSea ? ' data-tactical-hover="false"' : ""}>
        <div class="ocean-board" role="grid" aria-label="${escapeHtml(label)}" data-board-size="${Data.BOARD_SIZE}">
          ${contents.join("")}
        </div>
        ${tacticalSea ? '<div class="tactical-map-readout" aria-hidden="true"><span>坐标锁定</span><strong data-tactical-coordinate>—</strong><small>隐形网格已启用</small></div>' : ""}
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
        ? `航空母舰：依次选择 ${definition.cellCount} 个四向连通格；点击已选的最后一格可撤销。`
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
    const groups = [
      {
        key: "surface",
        label: "水面舰队",
        definitions: Data.UNIT_DEFINITIONS.filter((definition) => definition.category === "surface"),
      },
      {
        key: "underwater",
        label: "水下单位",
        definitions: Data.UNIT_DEFINITIONS.filter((definition) => definition.category === "underwater"),
      },
      {
        key: "decoy",
        label: "战术装置",
        definitions: Data.UNIT_DEFINITIONS.filter((definition) => definition.category === "decoy"),
      },
    ];

    const renderItem = (definition) => {
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
            <small>${escapeHtml(definition.shapeText)}${orientation ? ` · ${orientation === "horizontal" ? "横" : "纵"}` : ""}</small>
          </span>
          <span class="fleet-item__state" data-complete="${complete}">
            ${complete ? "✓ 已部署" : count > 0 ? `${count}/${definition.cellCount}` : "待部署"}
          </span>
        </button>`;
    };

    return `
      <div class="fleet-inventory fleet-inventory--grouped">
        ${groups.map((group) => `
          <section class="fleet-group fleet-group--${group.key}">
            <div class="fleet-group__heading">
              <span>${group.label}</span>
              <small>${group.definitions.filter((definition) => {
                const placement = placementById(definition.id);
                return (placement?.cells.length ?? 0) === definition.cellCount;
              }).length}/${group.definitions.length}</small>
            </div>
            <div class="fleet-group__items">
              ${group.definitions.map(renderItem).join("")}
            </div>
          </section>`).join("")}
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
    const completeCount = Data.UNIT_DEFINITIONS.filter((definition) => {
      const placement = placementById(definition.id);
      return (placement?.cells.length ?? 0) === definition.cellCount;
    }).length;
    const totalCount = Data.UNIT_DEFINITIONS.length;
    const progress = Math.round((completeCount / totalCount) * 100);
    const readyCount = room.seats.filter((seat) => seat.ready).length;
    const latestAutoEvent = [...room.systemEvents]
      .reverse()
      .find((event) => event.kind === "deployment_timeout_auto_ready");
    const pausedRemaining = room.connection?.pausedTimer?.kind === "deployment"
      ? Math.ceil(room.connection.pausedTimer.remainingMs / 1000)
      : null;
    const collapsed = state.deployment.mapCollapsed;
    const selectedPlacement = selectedDefinition
      ? placementById(selectedDefinition.id)
      : null;
    const selectedPlacedCells = selectedPlacement?.cells.length ?? 0;
    const selectedComplete = Boolean(
      selectedDefinition && selectedPlacedCells === selectedDefinition.cellCount,
    );

    return `
      <section class="deployment-page deployment-page--v071 page-enter" aria-labelledby="deployment-title">
        ${renderRoomTop("部署舰队", "布置完成后提交准备。", {
          kicker: "舰队部署",
          deadline: room.deadlines.deploymentDeadlineAt,
          timerLabel: "部署剩余",
        })}
        ${pausedRemaining !== null ? `<div class="status-banner status-banner--warning">部署计时已暂停 · ${formatCountdown(pausedRemaining)}</div>` : ""}
        ${latestAutoEvent ? `<div class="status-banner">${escapeHtml(latestAutoEvent.message)}</div>` : ""}
        ${renderSeats(room, true)}

        <section class="deployment-progress-strip" aria-label="部署进度">
          <div class="deployment-progress-strip__summary">
            <span class="status-kicker">部署进度</span>
            <strong>${completeCount} / ${totalCount}</strong>
          </div>
          <div class="deployment-progress-track" aria-hidden="true">
            <i style="width:${progress}%"></i>
          </div>
          <div class="deployment-progress-strip__status">
            <span>${validation.valid ? "舰队已就绪" : "继续部署"}</span>
            <small>${readyCount}/${room.seats.length} 玩家已准备</small>
          </div>
        </section>

        <div class="deployment-layout deployment-layout--v071">
          <aside class="deployment-panel deployment-panel--fleet">
            <div class="panel-heading panel-heading--compact">
              <div>
                <span>舰队</span>
                <small>8 个单位 · ${room.mapRules.decoyCount} 枚诱饵</small>
              </div>
              <span class="panel-counter">${completeCount}/${totalCount}</span>
            </div>
            ${renderDeploymentInventory(locked)}
          </aside>

          <section class="deployment-map-card collapsible-map ${collapsed ? "collapsible-map--collapsed" : ""}">
            <div class="map-card__heading map-card__heading--with-toggle">
              <button
                type="button"
                class="map-collapse-button"
                data-action="toggle-deployment-map"
                aria-expanded="${!collapsed}"
                aria-label="${collapsed ? "展开部署地图" : "最小化部署地图"}"
                data-tooltip="${collapsed ? "展开地图" : "最小化地图"}"
              >${collapsed ? "+" : "−"}</button>
              <div class="map-card__title">
                <span class="status-kicker">己方海域</span>
                <h2>${room.mapSize}×${room.mapSize} 部署图</h2>
              </div>
              <span class="map-state" data-ready="${locked}">${locked ? "已锁定" : "编辑中"}</span>
            </div>
            ${collapsed
              ? `<button class="collapsed-map-summary" type="button" data-action="toggle-deployment-map">
                   <span>部署地图已最小化</span>
                   <strong>${completeCount}/${totalCount} 已完成</strong>
                 </button>`
              : `${renderDeploymentBoard(locked)}
                 <p class="board-help">
                   ${locked
                     ? "部署已锁定。"
                     : selectedDefinition?.shape === "connected"
                       ? `航空母舰 · ${selectedPlacedCells}/${selectedDefinition.cellCount} 格`
                       : "点击放置 · R 旋转 · 可拖动已放置单位"}
                 </p>`}
          </section>

          <aside class="deployment-panel deployment-panel--guide">
            <div class="panel-heading panel-heading--compact">
              <div>
                <span>当前操作</span>
                <small>${selectedComplete ? "已部署" : "待完成"}</small>
              </div>
              <button class="icon-button icon-button--small" type="button" data-action="open-rules" aria-label="查看部署规则" data-tooltip="部署规则">?</button>
            </div>
            <div class="selected-placement-card ${selectedComplete ? "selected-placement-card--complete" : ""}">
              <span class="selected-placement-card__icon">${escapeHtml(selectedDefinition?.shortName ?? "—")}</span>
              <div>
                <strong>${escapeHtml(selectedDefinition?.name ?? "未选择")}</strong>
                <small>${escapeHtml(selectedDefinition?.shapeText ?? "")}${selectedDefinition ? ` · ${selectedPlacedCells}/${selectedDefinition.cellCount}` : ""}</small>
              </div>
              <span class="selected-placement-card__state">${selectedComplete ? "✓" : "○"}</span>
            </div>
            <div class="guide-actions guide-actions--modern">
              <button class="button button--secondary button--compact" data-action="rotate-placement" ${locked || !selectedDefinition ? "disabled" : ""}>旋转 <kbd>R</kbd></button>
              <button class="button button--quiet button--compact" data-action="remove-placement" ${locked || !placementById(state.deployment.selectedId) ? "disabled" : ""}>撤回</button>
              <button class="button button--quiet button--compact" data-action="undo-deployment" ${locked || state.deployment.history.length === 0 ? "disabled" : ""}>撤销</button>
            </div>
            <div class="validation-card validation-card--compact" data-valid="${validation.valid}">
              <strong>${validation.valid ? "✓ 部署完整合法" : `${validation.errors.length} 项待处理`}</strong>
              ${validation.valid
                ? "<p>可以提交准备。</p>"
                : `<p>${escapeHtml(validation.errors[0] ?? "继续完成舰队部署。")}</p>`}
            </div>
            <div class="deployment-utility-actions">
              <button class="button button--secondary button--compact" data-action="random-deployment" ${locked ? "disabled" : ""}>随机部署</button>
              <button class="button button--quiet button--compact" data-action="clear-deployment" ${locked || state.deployment.placements.length === 0 ? "disabled" : ""}>清空</button>
            </div>
          </aside>
        </div>

        <div class="deployment-toolbar deployment-toolbar--v071">
          <div class="deployment-toolbar__status">
            <span>${validation.valid ? "部署完成" : `已完成 ${completeCount}/${totalCount}`}</span>
            <small>${locked ? "等待其他玩家" : "提交前仍可调整"}</small>
          </div>
          <div class="deployment-toolbar__actions">
            <button class="button button--danger-quiet" data-action="leave-room">离开</button>
            ${ownSeat?.ready
              ? `<button class="button button--secondary" data-action="cancel-ready" ${room.deploymentsLocked ? "disabled" : ""}>取消准备</button>`
              : `<button class="button button--primary button--ready" data-action="ready-deployment" ${!validation.valid || state.pendingRequest ? "disabled" : ""}>${state.pendingRequest === "ready" ? '<span class="button-spinner" aria-hidden="true"></span>提交中' : "准备"}</button>`}
          </div>
        </div>
      </section>`;
  }

  function diceGlyph(value) {
    return ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][value] ?? "—";
  }

  function renderRollingPage() {
    const room = state.room;
    const rolling = room.rolling ?? {
      rounds: [],
      currentRound: 1,
      currentRolls: {},
      firstPlayerId: null,
    };
    const rounds = rolling.rounds ?? [];
    const lastRound = rounds.at(-1) ?? null;
    const firstPlayer = rolling.firstPlayerId
      ? Model.nicknameFor(room, rolling.firstPlayerId)
      : null;
    const currentRoundNumber = rolling.currentRound ?? Math.max(1, rounds.length + 1);
    const currentRolls = rolling.firstPlayerId
      ? (lastRound?.rolls ?? {})
      : (rolling.currentRolls ?? {});
    const ownPlayerId = room.own.playerId;
    const ownRolled = Object.hasOwn(currentRolls, ownPlayerId);
    const anyoneRolled = Object.keys(currentRolls).length > 0;
    const waitingForRoll = !rolling.firstPlayerId && !ownRolled;
    const rollingPending = state.pendingRequest === "roll-die";

    return `
      <section class="rolling-page rolling-page--v076 page-enter" aria-labelledby="rolling-title">
        ${renderRoomTop("决定第一回合", "每位玩家亲自掷骰，点数仍由服务器生成。", {
          kicker: `P04 / 第 ${currentRoundNumber} 轮`,
        })}
        <div class="rolling-stage rolling-stage--interactive ${state.reduceMotion ? "rolling-stage--still" : ""}" data-player-count="${room.seats.length}">
          ${room.seats.map((seat, index) => {
            const value = currentRolls[seat.playerId];
            const hasRolled = Number.isInteger(value);
            const isOwn = seat.playerId === ownPlayerId;
            const isWinner = seat.playerId === rolling.firstPlayerId;
            const status = rolling.firstPlayerId
              ? `${value ?? "—"} 点`
              : hasRolled
                ? `${value} 点 · 已投掷`
                : isOwn
                  ? "等待你投掷"
                  : seat.isBot
                    ? (anyoneRolled ? "机器人准备中" : "等待你先投掷")
                    : "等待投掷";
            return `
              <article class="die-player die-player--interactive ${isWinner ? "die-player--winner" : ""}" data-roll-state="${hasRolled ? "rolled" : "waiting"}">
                <span class="die-player__seat">席位 0${index + 1}${isOwn ? " · 你" : ""}</span>
                <strong>${escapeHtml(seat.nickname)}</strong>
                <div class="die ${hasRolled ? "die--revealed" : "die--waiting"}" aria-label="骰子点数 ${value ?? "等待"}">
                  ${hasRolled ? diceGlyph(value) : "?"}
                </div>
                <small>${escapeHtml(status)}</small>
              </article>`;
          }).join("")}
          ${room.seats.length === 2 ? '<div class="rolling-versus">VS</div>' : ""}
        </div>

        <div class="rolling-control" role="group" aria-label="掷骰操作">
          ${rolling.firstPlayerId
            ? `<span class="rolling-control__locked">结果已锁定</span>`
            : `<button class="button button--primary roll-die-button" data-action="roll-die" ${!waitingForRoll || rollingPending ? "disabled" : ""}>
                ${rollingPending
                  ? '<span class="button-spinner" aria-hidden="true"></span>投掷中'
                  : ownRolled
                    ? room.roomMode === "bot_duel"
                      ? "已投掷 · 等待机器人"
                      : "已投掷 · 等待其他玩家"
                    : `掷骰子 · 第 ${currentRoundNumber} 轮`}
              </button>`}
        </div>

        <div class="rolling-result rolling-result--v076" role="status">
          ${rolling.firstPlayerId
            ? `<strong>${escapeHtml(firstPlayer)} 获得第一回合</strong><span>结果将额外停留 3 秒后进入正式对战</span>`
            : lastRound?.tied && !anyoneRolled
              ? `<strong>上一轮最高点同分</strong><span>第 ${currentRoundNumber} 轮，请所有玩家再次掷骰</span>`
              : anyoneRolled
                ? "<strong>等待本轮其余玩家投掷</strong><span>已提交的点数会保留在当前轮次</span>"
                : "<strong>点击“掷骰子”决定先手</strong><span>每位玩家每轮只能投掷一次</span>"}
        </div>
        ${rounds.length > 0 ? `
          <ol class="roll-history" aria-label="掷骰历史">
            ${rounds.map((round) => `
              <li>
                <span>第 ${round.round} 轮</span>
                <div class="roll-history__scores">${room.seats.map((seat) => `<b>${escapeHtml(seat.nickname)} ${round.rolls[seat.playerId]} 点</b>`).join("")}</div>
                <em>${round.tied ? "同点 · 重投" : "先手已确定"}</em>
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
      let cellState = "empty";
      if (entry?.kind === "unit") {
        const { unit, definition } = entry;
        const hit = unit.hitCells.includes(coordinate);
        const sunk = unit.hp <= 0;
        classes.push("board-cell--unit", `board-cell--${definition.category}`);
        if (hit) classes.push("board-cell--own-hit");
        if (sunk) classes.push("board-cell--wreck");
        if (unit.paralyzed) classes.push("board-cell--paralyzed");
        cellState = sunk ? "sunk-unit" : unit.paralyzed ? "paralyzed-unit" : hit ? "damaged-unit" : "own-unit";
        classes.push(`cell-state--${cellState}`);
        if (selectedDefinition?.sourceType === unit.type) {
          classes.push("board-cell--source");
        }
        if (centerCells.has(coordinate)) {
          classes.push("board-cell--range-center");
        }
        content = `<span class="unit-glyph unit-glyph--v15">${uiIcon(unitIconName(unit.type))}<i>${escapeHtml(definition.shortName)}</i></span>${hit ? '<span class="cell-state-glyph">✦</span>' : ""}`;
        label = `${coordinate}，${definition.name}，生命值 ${Model.formatHp(unit.hp)}${hit ? "，该格已受击" : ""}${sunk ? "，已沉没" : ""}${unit.paralyzed ? "，本回合瘫痪" : ""}`;
      } else if (entry?.kind === "decoy") {
        classes.push("board-cell--unit", "board-cell--decoy");
        if (entry.decoy.destroyed) classes.push("board-cell--wreck");
        cellState = entry.decoy.destroyed ? "destroyed-decoy" : "decoy";
        classes.push(`cell-state--${cellState}`);
        content = `<span class="unit-glyph">雷</span>${entry.decoy.destroyed ? '<span class="cell-state-glyph">×</span>' : ""}`;
        label = `${coordinate}，诱饵鱼雷${entry.decoy.destroyed ? "，已摧毁" : "，有效"}`;
      }
      return {
        classes,
        content,
        label,
        disabled: true,
        attributes: {
          "data-coordinate": coordinate,
          "data-cell-state": cellState,
          "data-tactical-layer": entry?.kind === "unit"
            ? entry.definition.category === "underwater_unit" ? "underwater" : "surface"
            : entry?.kind === "decoy" ? "underwater" : "empty",
        },
      };
    }, options.replay
      ? "board-frame--replay board-frame--tactical-sea board-frame--own-sea"
      : "board-frame--tactical-sea board-frame--own-sea");
  }

  function currentIntelligenceArea(ownBattle, targetPlayerId = state.battle.targetPlayerId) {
    const areas = (ownBattle?.intelligenceAreas ?? []).filter(
      (area) => !area.defenderId || area.defenderId === targetPlayerId,
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
      ) ?? null;
    }
    return areas.at(-1);
  }

  function enemyMapFor(ownBattle, targetPlayerId) {
    return ownBattle.enemyMapsByPlayer?.[targetPlayerId] ?? ownBattle.enemyMap;
  }

  function isGlobalHelicopterSelection(room = state.room) {
    return Boolean(
      isSimultaneousThreePlayerSelection(room) &&
      state.battle.selectedAction === Data.ACTION_TYPES.HELICOPTER_STRAFE &&
      (room.turn?.remainingTargetPlayerIds?.length ?? 0) > 1,
    );
  }

  function isSimultaneousThreePlayerSelection(room = state.room) {
    return Boolean(
      room?.maxPlayers === 3 &&
      room?.turn?.canAct &&
      state.battle.selectedAction &&
      (room.turn?.remainingTargetPlayerIds?.length ?? 0) > 1,
    );
  }

  function markersForTarget(targetPlayerId) {
    if (targetPlayerId === state.battle.targetPlayerId) {
      return state.battle.markers;
    }
    const room = state.room;
    if (!room?.roomCode || !room?.own?.playerId) return new Map();
    return readMarkers(room.roomCode, room.own.playerId, targetPlayerId);
  }

  function removePrivateMarker(control) {
    const coordinate = control?.dataset.coordinate;
    const targetPlayerId = control?.dataset.targetPlayerId;
    if (
      control?.dataset.cellState !== "private-marker" ||
      !coordinate ||
      !targetPlayerId ||
      !markersForTarget(targetPlayerId).has(coordinate)
    ) {
      return false;
    }
    if (targetPlayerId !== state.battle.targetPlayerId) {
      saveMarkers();
      state.battle.targetPlayerId = targetPlayerId;
      state.battle.mobileMap = targetPlayerId;
      state.battle.markerContext = null;
      prepareMarkerContext(state.room);
    }
    state.battle.markers.delete(coordinate);
    saveMarkers();
    Sound?.playEffect?.("marker_remove");
    render();
    return true;
  }

  function legalTargetCells(ownBattle, targetPlayerId = state.battle.targetPlayerId) {
    if (!state.battle.selectedAction) {
      return new Set();
    }
    const enemyMap = enemyMapFor(ownBattle, targetPlayerId);
    const effectiveOwnBattle = { ...ownBattle, enemyMap };
    const options = Data.getTargetOptions(state.battle.selectedAction, effectiveOwnBattle);
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

  function renderEnemyBoard(ownBattle, targetPlayerId = state.battle.targetPlayerId) {
    const enemyMap = enemyMapFor(ownBattle, targetPlayerId);
    const results = enemyMap?.cellResults ?? {};
    const missiles = new Set(enemyMap?.submarineMissileMarkers ?? []);
    const nuclearBombs = new Set(enemyMap?.nuclearBombMarkers ?? []);
    const effectiveOwnBattle = { ...ownBattle, enemyMap };
    const selectedForThisMap = targetPlayerId === state.battle.targetPlayerId;
    const simultaneousAction = isSimultaneousThreePlayerSelection();
    const interactiveForThisMap = selectedForThisMap || simultaneousAction;
    const legal = interactiveForThisMap
      ? legalTargetCells(ownBattle, targetPlayerId)
      : new Set();
    const preview = interactiveForThisMap
      ? new Set(Data.previewCells(state.battle.selectedAction, state.battle.target))
      : new Set();
    const intelligence = currentIntelligenceArea(ownBattle, targetPlayerId);
    const intelligenceCells = new Set(intelligence?.area ?? []);
    const targetMarkers = markersForTarget(targetPlayerId);
    return renderGrid("敌方地图", (coordinate) => {
      const result = results[coordinate];
      const resolved = result === "hit" || result === "miss";
      const hasMissile = missiles.has(coordinate) && !resolved;
      const hasNuclearBomb = nuclearBombs.has(coordinate) && !resolved;
      const marker = !resolved ? targetMarkers.get(coordinate) : null;
      const hasMarker = Boolean(marker);
      const classes = [];
      let content = "";
      let stateText = "未知";
      let cellState = "unknown";
      if (result === "hit") {
        classes.push("board-cell--enemy-hit");
        cellState = "public-hit";
        content = '<span class="enemy-result">✦</span>';
        stateText = "命中，已结算";
      } else if (result === "miss") {
        classes.push("board-cell--enemy-miss");
        cellState = "public-miss";
        content = '<span class="enemy-result">×</span>';
        stateText = "未命中，已结算";
      } else if (hasMissile) {
        classes.push("board-cell--missile");
        cellState = "fired-unknown";
        content = '<span class="missile-glyph">↗</span>';
        stateText = "导弹已发射，仍未结算";
      } else if (hasNuclearBomb) {
        classes.push("board-cell--missile");
        cellState = "fired-unknown";
        content = '<span class="missile-glyph">☢</span>';
        stateText = "核弹已投放，命中情况保密";
      } else if (hasMarker) {
        classes.push("board-cell--marker", `board-cell--marker-${marker}`);
        cellState = "private-marker";
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
      classes.push(`cell-state--${cellState}`);
      const rangeState = preview.has(coordinate) ? "selected" : legal.has(coordinate) ? "valid" : "none";
      if (legal.has(coordinate)) {
        classes.push("board-cell--legal-target", "range-state--valid");
      }
      if (preview.has(coordinate)) {
        classes.push("board-cell--target-preview", "range-state--selected");
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
          "data-target-player-id": targetPlayerId,
          "data-cell-state": cellState,
          "data-range-state": rangeState,
          "data-intel-state": intelligenceCells.has(coordinate) ? intelligence?.kind ?? "none" : "none",
          "aria-pressed": preview.has(coordinate) || hasMarker ? "true" : "false",
        },
      };
    }, "board-frame--tactical-sea board-frame--enemy-sea");
  }

  function unitStateCode(unit, definition) {
    if (unit.hp <= 0) return "sunk";
    if (unit.paralyzed) return "paralyzed";
    if (unit.hp < definition.initialHp) return "damaged";
    return "ready";
  }

  function unitStatusText(unit, definition) {
    const code = unitStateCode(unit, definition);
    return {
      sunk: "已沉没",
      paralyzed: "瘫痪",
      damaged: "受伤",
      ready: "作战中",
    }[code];
  }

  function unitResourceBadges(ownBattle, unit) {
    return Data.ACTION_DEFINITIONS
      .filter((action) => action.sourceType === unit.type && action.initialUses !== null)
      .map((action) => {
        const remaining = ownBattle.remainingUses?.[action.type] ?? 0;
        const short = {
          [Data.ACTION_TYPES.SUBMARINE_MISSILE]: "导弹",
          [Data.ACTION_TYPES.NUCLEAR_BOMB]: "核弹",
          [Data.ACTION_TYPES.SHOCK_BOMB]: "震爆",
          [Data.ACTION_TYPES.DETECTION_BOMB]: "探测",
          [Data.ACTION_TYPES.HELICOPTER_STRAFE]: "直升机",
          [Data.ACTION_TYPES.RADAR_SCAN]: "雷达",
        }[action.type] ?? action.name;
        return `<span class="unit-resource-badge" data-empty="${remaining <= 0}">${escapeHtml(short)} <b>${remaining}</b></span>`;
      }).join("");
  }

  function renderOwnUnitStatus(ownBattle) {
    const units = [...(ownBattle.units ?? [])].sort((left, right) => {
      const leftIndex = Data.UNIT_DEFINITIONS.findIndex((unit) => unit.type === left.type);
      const rightIndex = Data.UNIT_DEFINITIONS.findIndex((unit) => unit.type === right.type);
      return leftIndex - rightIndex;
    });
    return `
      <div class="unit-status-list unit-status-list--v073">
        ${units.map((unit) => {
          const definition = Data.getUnitDefinitionByType(unit.type);
          const stateCode = unitStateCode(unit, definition);
          const hpPercent = Math.max(0, Math.min(100, (unit.hp / definition.initialHp) * 100));
          return `
            <article class="unit-status unit-status--v073 unit-status--${stateCode} ${unit.hp <= 0 ? "unit-status--sunk" : ""} ${unit.paralyzed ? "unit-status--paralyzed" : ""}" data-unit-state="${stateCode}">
              <span class="unit-status__icon unit-status__icon--${definition.category}" aria-hidden="true">${uiIcon(unitIconName(unit.type))}</span>
              <div class="unit-status__main">
                <div class="unit-status__title"><strong>${escapeHtml(definition.name)}</strong><small>${escapeHtml(unitStatusText(unit, definition))}</small></div>
                <div class="hp-track" aria-label="生命值 ${Model.formatHp(unit.hp)} / ${definition.initialHp}"><i style="--hp-percent:${hpPercent}%"></i></div>
                <div class="unit-resource-row">${unitResourceBadges(ownBattle, unit)}</div>
              </div>
              <span class="hp-meter" aria-label="生命值 ${Model.formatHp(unit.hp)} / ${definition.initialHp}"><b>${Model.formatHp(unit.hp)}</b><i>/ ${definition.initialHp}</i></span>
            </article>`;
        }).join("")}
        <article class="decoy-status decoy-status--v073">
          <span class="unit-status__icon unit-status__icon--decoy" aria-hidden="true">${uiIcon("ship-decoy")}</span>
          <div><strong>诱饵鱼雷</strong><small>仍有效</small></div>
          <b>${ownBattle.decoys.filter((decoy) => !decoy.destroyed).length} / ${ownBattle.decoys.length}</b>
        </article>
      </div>`;
  }

  function openingRadarRequired(room) {
    if (!room?.turn?.canAct) return false;
    const availability = room.battle?.own?.actionAvailability ?? [];
    const radar = availability.find((item) => item.actionType === Data.ACTION_TYPES.RADAR_SCAN);
    return Boolean(
      radar?.available &&
      availability.some((item) =>
        item.actionType !== Data.ACTION_TYPES.RADAR_SCAN &&
        item.issues?.some((issue) => issue.code === "OPENING_RADAR_REQUIRED"),
      )
    );
  }

  function actionVisualMeta(definition) {
    const table = {
      [Data.ACTION_TYPES.DESTROYER_I_RAM]: { group: "surface", glyph: "Ⅰ", icon: "action-destroyer-i", groupName: "舰艇攻击" },
      [Data.ACTION_TYPES.DESTROYER_II_RAM]: { group: "surface", glyph: "Ⅱ", icon: "action-destroyer-ii", groupName: "舰艇攻击" },
      [Data.ACTION_TYPES.PIRATE_ATTACK]: { group: "surface", glyph: "盗", icon: "action-pirate", groupName: "舰艇攻击" },
      [Data.ACTION_TYPES.MOTORBOAT_RAM]: { group: "surface", glyph: "摩", icon: "action-motorboat", groupName: "舰艇攻击" },
      [Data.ACTION_TYPES.SUBMARINE_MISSILE]: { group: "underwater", glyph: "↗", icon: "action-missile", groupName: "潜航武器" },
      [Data.ACTION_TYPES.NUCLEAR_BOMB]: { group: "underwater", glyph: "☢", icon: "action-nuclear", groupName: "潜航武器" },
      [Data.ACTION_TYPES.SHOCK_BOMB]: { group: "underwater", glyph: "震", icon: "action-shock", groupName: "潜航武器" },
      [Data.ACTION_TYPES.DETECTION_BOMB]: { group: "underwater", glyph: "探", icon: "action-detection", groupName: "潜航武器" },
      [Data.ACTION_TYPES.HELICOPTER_STRAFE]: { group: "carrier", glyph: "✦", icon: "action-helicopter", groupName: "舰载系统" },
      [Data.ACTION_TYPES.RADAR_SCAN]: { group: "carrier", glyph: "◎", icon: "action-radar", groupName: "舰载系统" },
    };
    return table[definition.type] ?? { group: "surface", glyph: "•", icon: "action-radar", groupName: "行动" };
  }

  function compactActionStatus(status) {
    if (status.code === "available") return "可用";
    if (status.code === "submitting") return "结算中";
    if (status.code === "waiting") return "等待回合";
    if (status.code === "sunk") return "单位沉没";
    if (status.code === "paralyzed") return "单位瘫痪";
    if (status.code === "empty") return "已耗尽";
    if (status.label.includes("首个行动") || status.label.includes("先扫描")) return "需先雷达";
    if (status.label.includes("首个行动并同时")) return "须首项使用";
    if (status.label.includes("驱逐舰均沉没")) return "尚未解锁";
    return status.label;
  }

  function renderActionCard(room, definition) {
    const status = Model.deriveActionStatus(room, definition);
    const selected = definition.type === state.battle.selectedAction;
    const meta = actionVisualMeta(definition);
    const sourceDefinition = Data.getUnitDefinitionByType(definition.sourceType);
    const global = isSimultaneousThreePlayerSelection(room);
    return `
      <button
        type="button"
        class="action-card action-card--v073 ${selected ? "action-card--selected" : ""}"
        data-action="select-action"
        data-action-type="${definition.type}"
        data-status="${status.code}"
        data-action-group="${meta.group}"
        title="${escapeHtml(definition.warning)}"
        ${status.enabled ? "" : "disabled"}
      >
        <span class="action-card__icon action-card__icon--${meta.group}" aria-hidden="true">${uiIcon(meta.icon)}</span>
        <span class="action-card__body">
          <strong>${escapeHtml(definition.name)}</strong>
          <small>${escapeHtml(sourceDefinition?.name ?? "作战单位")}${global ? " · 同步两方" : ""}</small>
        </span>
        <span class="action-card__meta">
          <span class="action-card__state">${escapeHtml(compactActionStatus(status))}</span>
          <span class="action-card__resource">${escapeHtml(Model.actionResourceLabel(room, definition))}</span>
        </span>
      </button>`;
  }

  function renderActionGroups(room) {
    const groups = [
      { key: "surface", label: "舰艇攻击" },
      { key: "underwater", label: "潜航武器" },
      { key: "carrier", label: "舰载系统" },
    ];
    return `
      <div class="action-list action-list--v073">
        ${groups.map((group) => {
          const actions = Data.ACTION_DEFINITIONS.filter((definition) => actionVisualMeta(definition).group === group.key);
          return `<section class="action-group action-group--${group.key}" aria-label="${group.label}">
            <div class="action-group__heading"><span>${group.label}</span><b>${actions.filter((definition) => Model.deriveActionStatus(room, definition).enabled).length}</b></div>
            <div class="action-group__grid">${actions.map((definition) => renderActionCard(room, definition)).join("")}</div>
          </section>`;
        }).join("")}
      </div>`;
  }

  const ACTION_SOURCE_ORDER = Object.freeze([
    Data.UNIT_TYPES.DESTROYER_I,
    Data.UNIT_TYPES.DESTROYER_II,
    Data.UNIT_TYPES.PIRATE_SHIP,
    Data.UNIT_TYPES.MOTORBOAT,
    Data.UNIT_TYPES.SUBMARINE,
    Data.UNIT_TYPES.NUCLEAR_SUBMARINE,
    Data.UNIT_TYPES.AIRCRAFT_CARRIER,
  ]);

  function sourceUnitState(units, definition) {
    const alive = units.filter((unit) => unit.hp > 0);
    if (alive.length === 0) return { code: "sunk", label: "已沉没" };
    if (alive.every((unit) => unit.paralyzed)) return { code: "paralyzed", label: "瘫痪" };
    if (alive.length < units.length) return { code: "damaged", label: `${alive.length}/${units.length} 可用` };
    if (alive.some((unit) => unit.hp < definition.initialHp)) return { code: "damaged", label: "受伤" };
    return { code: "ready", label: "作战中" };
  }

  function renderUnitActionDeck(room, ownBattle) {
    return `
      <div class="unit-action-deck unit-action-deck--v076" aria-label="兵种行动与状态">
        ${ACTION_SOURCE_ORDER.map((sourceType) => {
          const definition = Data.getUnitDefinitionByType(sourceType);
          const units = (ownBattle.units ?? []).filter((unit) => unit.type === sourceType);
          const actions = Data.ACTION_DEFINITIONS.filter((action) => action.sourceType === sourceType);
          if (!definition || units.length === 0 || actions.length === 0) return "";
          const sourceState = sourceUnitState(units, definition);
          const hp = units.reduce((sum, unit) => sum + unit.hp, 0);
          const maxHp = units.length * definition.initialHp;
          const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
          const availableCount = actions.filter((action) => Model.deriveActionStatus(room, action).enabled).length;
          return `
            <section class="unit-action-card unit-action-card--${sourceState.code}" data-source-type="${sourceType}" data-unit-state="${sourceState.code}">
              <header class="unit-action-card__header">
                <span class="unit-status__icon unit-status__icon--${definition.category}" aria-hidden="true">${uiIcon(unitIconName(sourceType))}</span>
                <div class="unit-action-card__identity">
                  <div><strong>${escapeHtml(definition.name)}${units.length > 1 ? ` ×${units.length}` : ""}</strong><small>${escapeHtml(sourceState.label)}</small></div>
                  <div class="hp-track hp-track--compact" aria-label="生命值 ${Model.formatHp(hp)} / ${maxHp}"><i style="--hp-percent:${hpPercent}%"></i></div>
                </div>
                <span class="hp-meter hp-meter--compact"><b>${Model.formatHp(hp)}</b><i>/ ${maxHp}</i></span>
              </header>
              ${units.length > 1 ? `<div class="unit-instance-row">${units.map((unit, index) => `<span data-unit-state="${unitStateCode(unit, definition)}">艇 ${index + 1} · ${Model.formatHp(unit.hp)}/${definition.initialHp}</span>`).join("")}</div>` : ""}
              <div class="unit-action-card__resources">${unitResourceBadges(ownBattle, units[0]) || `<span class="unit-resource-badge">可用行动 <b>${availableCount}/${actions.length}</b></span>`}</div>
              <div class="unit-action-card__actions">
                ${actions.map((action) => renderActionCard(room, action)).join("")}
              </div>
            </section>`;
        }).join("")}
        <section class="unit-action-card unit-action-card--decoy" aria-label="诱饵鱼雷状态">
          <header class="unit-action-card__header">
            <span class="unit-status__icon unit-status__icon--decoy" aria-hidden="true">${uiIcon("ship-decoy")}</span>
            <div class="unit-action-card__identity"><div><strong>诱饵鱼雷</strong><small>战术装置</small></div></div>
            <span class="hp-meter hp-meter--compact"><b>${ownBattle.decoys.filter((decoy) => !decoy.destroyed).length}</b><i>/ ${ownBattle.decoys.length}</i></span>
          </header>
        </section>
      </div>`;
  }

  function renderActionPanel(room) {
    const ownBattle = room.battle.own;
    const selectedDefinition = Data.getActionDefinition(state.battle.selectedAction);
    const radarRequired = openingRadarRequired(room);
    const simultaneousAction = Boolean(
      selectedDefinition && isSimultaneousThreePlayerSelection(room),
    );
    const remainingNames = (room.turn?.remainingTargetPlayerIds ?? [])
      .map((playerId) => Model.nicknameFor(room, playerId));
    return `
      <aside class="action-rail action-rail--v073 ${state.battle.actionDrawerOpen ? "action-rail--open" : ""}" aria-label="行动与单位状态">
        <button class="action-rail__heading" type="button" data-action="toggle-action-drawer" aria-expanded="${state.battle.actionDrawerOpen}">
          <div>
            <span class="status-kicker">行动面板</span>
            <h2>${room.turn?.canAct ? (radarRequired ? "完成首次雷达" : "选择行动") : "等待行动"}</h2>
          </div>
          <span class="turn-lock" data-active="${room.turn?.canAct}">${room.turn?.canAct ? "你的回合" : "已锁定"}</span>
          <span class="drawer-chevron" aria-hidden="true">⌃</span>
        </button>
        <div class="action-rail__content">
        <div class="bridge-target-readout" data-has-target="${Boolean(state.battle.target)}">
          <div><span>选择坐标</span><strong>${state.battle.target ? escapeHtml(Model.formatTarget(state.battle.target)) : "—"}</strong></div>
          <small>${selectedDefinition ? escapeHtml(selectedDefinition.name) : room.turn?.canAct ? "等待选择武器" : "战术链路已锁定"}</small>
        </div>
        ${room.turn?.canAct && battleOpponentIds(room.battle).length > 1 ? `
          <div class="battle-target-progress" aria-label="三人回合目标">
            <div class="battle-target-progress__heading"><span>同步目标</span><strong>一次行动</strong></div>
            <div class="battle-target-progress__items">
              ${(room.turn?.requiredTargetPlayerIds ?? battleOpponentIds(room.battle)).map((playerId) => {
                const pending = (room.turn?.remainingTargetPlayerIds ?? []).includes(playerId);
                const selected = state.battle.targetPlayerId === playerId;
                return `<button type="button" data-action="select-battle-target" data-target-player-id="${escapeHtml(playerId)}" data-done="${!pending}" class="${selected ? "is-selected" : ""}" ${room.turn?.canAct && !pending ? "disabled" : ""}><span>${pending ? "⇉" : "○"}</span><strong>${escapeHtml(Model.nicknameFor(room, playerId))}</strong><small>${pending ? "同步生效" : "查看"}</small></button>`;
              }).join("")}
            </div>
          </div>
          <label class="sr-only" for="target-player-input">当前敌方目标</label>
          <select id="target-player-input" class="sr-only" tabindex="-1" aria-hidden="true">
            ${battleOpponentIds(room.battle).map((playerId) => `<option value="${escapeHtml(playerId)}" ${state.battle.targetPlayerId === playerId ? "selected" : ""}>${escapeHtml(Model.nicknameFor(room, playerId))}</option>`).join("")}
          </select>` : ""}

        ${radarRequired ? `
          <section class="opening-radar-task" aria-label="首次雷达任务">
            <span class="opening-radar-task__icon" aria-hidden="true">${uiIcon("action-radar")}</span>
            <div><span class="status-kicker">首次行动</span><strong>雷达扫描</strong><small>${remainingNames.length > 1 ? `选择扫描区域的左上起始格，同时扫描 ${escapeHtml(remainingNames.join(" / "))}` : `选择敌方 ${room.mapRules.radarSize}×${room.mapRules.radarSize} 扫描区域的左上起始格`}</small></div>
            <button class="button button--primary button--compact" data-action="select-action" data-action-type="${Data.ACTION_TYPES.RADAR_SCAN}">${state.battle.selectedAction === Data.ACTION_TYPES.RADAR_SCAN ? "已选择" : "开始扫描"}</button>
          </section>` : ""}

        ${renderUnitActionDeck(room, ownBattle)}

        ${selectedDefinition ? `
          <div class="target-instruction target-instruction--v073" data-target-mode="${selectedDefinition.targetMode}">
            <div class="target-instruction__heading"><span class="action-card__icon action-card__icon--${actionVisualMeta(selectedDefinition).group}" aria-hidden="true">${uiIcon(actionVisualMeta(selectedDefinition).icon)}</span><div><small>当前行动</small><strong>${escapeHtml(selectedDefinition.name)}</strong></div></div>
            ${simultaneousAction ? `<div class="multi-target-action multi-target-action--v073"><span>同时作用</span>${(room.turn?.remainingTargetPlayerIds ?? []).map((playerId) => `<b>${escapeHtml(Model.nicknameFor(room, playerId))}</b>`).join("")}<small>资源与自损只结算 1 次</small></div>` : ""}
            <p>${selectedDefinition.type === Data.ACTION_TYPES.RADAR_SCAN
              ? `选择 ${room.mapRules.radarSize}×${room.mapRules.radarSize} 扫描区域的左上起始格。`
              : selectedDefinition.targetMode === "line"
              ? "选择行或列，再点地图。"
              : selectedDefinition.targetMode === "area"
                ? "选择高亮中心格。"
                : "选择高亮目标格。"}</p>
            ${selectedDefinition.targetMode === "line" ? `
              <div class="axis-switch" role="group" aria-label="直升机扫射方向">
                <button class="button button--compact ${state.battle.helicopterAxis === "row" ? "button--primary" : "button--quiet"}" data-action="set-helicopter-axis" data-axis="row">按行</button>
                <button class="button button--compact ${state.battle.helicopterAxis === "column" ? "button--primary" : "button--quiet"}" data-action="set-helicopter-axis" data-axis="column">按列</button>
              </div>` : ""}
            ${state.battle.target ? `
              <div class="chosen-target chosen-target--v073">
                <span>目标</span><strong>${escapeHtml(Model.formatTarget(state.battle.target))}</strong>
                <button class="button button--primary button--compact" data-action="reopen-action-confirm">确认</button>
              </div>` : ""}
            <button class="text-button" data-action="cancel-action-selection">取消选择</button>
          </div>` : ""}

        </div>
      </aside>`;
  }

  function renderTurnProgress(room) {
    const required = room.turn?.requiredTargetPlayerIds ?? [];
    if (required.length <= 1) return "";
    return `
      <div class="battle-turn-progress" aria-label="本回合同步目标">
        <div class="battle-turn-progress__summary">
          <span>一次行动</span>
          <strong>同步 ×${required.length}</strong>
        </div>
        <div class="battle-turn-progress__targets">
          ${required.map((playerId) => {
            const currentTarget = room.turn?.canAct && state.battle.targetPlayerId === playerId;
            return `<span data-complete="false" data-current="${currentTarget}">⇉ ${escapeHtml(Model.nicknameFor(room, playerId))}</span>`;
          }).join("")}
        </div>
      </div>`;
  }

  function renderBattleHeader(room) {
    const current = room.turn?.currentPlayerId;
    const currentName = current ? Model.nicknameFor(room, current) : "服务器";
    const currentSeat = room.seats.find((seat) => seat.playerId === current);
    const canAct = room.turn?.canAct;
    const botThinking = !canAct && currentSeat?.isBot && room.turnPhase === "ACTIVE";
    return `
      <header class="battle-header battle-header--v072">
        <button class="bridge-menu-button" type="button" data-action="open-rules" aria-label="打开舰桥菜单"><span></span><span></span><span></span></button>
        <div class="battle-header__room">
          <small>房间号</small><span>OCEAN-${escapeHtml(room.roomCode)}</span>
          <button class="text-button" data-action="copy-room">复制</button>
        </div>
        <div class="battle-header__turn" data-own-turn="${canAct}">
          <small>回合 ${String(room.turn?.turnNumber ?? room.matchSummary.turnCount).padStart(2, "0")}</small>
          <strong>${canAct ? "你的回合" : botThinking ? "机器人思考中" : `等待 ${escapeHtml(currentName)}`}</strong>
        </div>
        ${renderTurnProgress(room)}
        <div class="battle-header__timer">
          <span>倒计时</span>
          ${room.deadlines.actionDeadlineAt
            ? `<strong data-deadline="${room.deadlines.actionDeadlineAt}">—</strong>`
            : `<strong>${room.turnPhase === "RESOLVING" ? "结算中" : room.turnPhase === "AUTO_SKIPPING" ? "自动跳过" : "暂停"}</strong>`}
        </div>
        <div class="battle-header__players">
          ${room.seats.map((seat) => {
            const eliminated = (room.battle?.match?.eliminatedPlayerIds ?? []).includes(seat.playerId);
            const playerState = eliminated ? "eliminated" : !seat.online ? "offline" : seat.playerId === current ? "active" : "online";
            const stateText = eliminated ? "已淘汰" : !seat.online ? "离线" : seat.playerId === current ? (seat.isBot ? "思考中" : "行动中") : (seat.isBot ? "待命" : "在线");
            return `<span data-online="${seat.online}" data-player-state="${playerState}"><i></i><b>${escapeHtml(seat.nickname)}${seat.playerId === room.own.playerId ? "（你）" : ""}</b><small>${stateText}</small></span>`;
          }).join("")}
        </div>
        <div class="bridge-versus" aria-hidden="true">VS</div>
        <div class="battle-header__timeouts">
          <span>连续超时</span><strong>${room.own.consecutiveActionTimeouts} / 3</strong>
        </div>
      </header>`;
  }

  function resolutionVisualState(room) {
    const feedback = room?.latestResolution?.feedback;
    if (!feedback) return "result";
    const ownId = room.own.playerId;
    const isActor = feedback.actorId === ownId;
    if (isActor && [Data.ACTION_TYPES.DETECTION_BOMB, Data.ACTION_TYPES.RADAR_SCAN].includes(feedback.actionType)) {
      return "private";
    }
    if (isActor && [Data.ACTION_TYPES.SUBMARINE_MISSILE, Data.ACTION_TYPES.NUCLEAR_BOMB, Data.ACTION_TYPES.SHOCK_BOMB].includes(feedback.actionType)) {
      return "unknown";
    }
    if (feedback.result === "hit" || (feedback.receivedHits ?? []).length > 0) return "hit";
    if (feedback.result === "miss") return "miss";
    if (feedback.resultsByDefender) {
      return Object.values(feedback.resultsByDefender).includes("hit")
        ? "hit"
        : "miss";
    }
    const cells = Array.isArray(feedback.cellResults)
      ? feedback.cellResults
      : Object.values(feedback.cellResultsByDefender ?? {}).flat();
    if (cells.length > 0) {
      return cells.some((cell) => cell.result === "hit") ? "hit" : "miss";
    }
    return "result";
  }

  function resolutionVisualMeta(room) {
    const stateCode = resolutionVisualState(room);
    return {
      hit: { label: "命中", icon: "✦" },
      miss: { label: "未命中", icon: "○" },
      unknown: { label: "结果未知", icon: "↗" },
      private: { label: "私人情报", icon: "⌾" },
      result: { label: "结算完成", icon: "✓" },
    }[stateCode];
  }

  function renderLatestFeedback(room) {
    const feedback = room.latestResolution?.feedback;
    if (!feedback) {
      return "";
    }
    const ownDamage = feedback.ownDamage ?? [];
    const decoys = feedback.ownDecoyChanges ?? [];
    const visualState = resolutionVisualState(room);
    const meta = resolutionVisualMeta(room);
    return `
      <section class="resolution-strip resolution-strip--v074 resolution-strip--${visualState}" data-feedback-state="${visualState}" aria-label="最近一次行动反馈">
        <span class="resolution-strip__icon" aria-hidden="true">${escapeHtml(meta.icon)}</span>
        <div class="resolution-strip__content">
          <div class="resolution-strip__meta"><span>${escapeHtml(meta.label)}</span><small>行动 ${feedback.sequence ?? "—"}</small></div>
          <strong>${escapeHtml(describeLatestResolution(room))}</strong>
          ${ownDamage.length || decoys.length ? `
            <ul>
              ${ownDamage.map((event) => {
                const definition = Data.getUnitDefinitionByType(event.unitType);
                return `<li>${escapeHtml(definition?.name ?? event.unitId)}：${Model.formatHp(event.beforeHp)} → ${Model.formatHp(event.afterHp)}${event.sunk ? " · 已沉没" : ""}</li>`;
              }).join("")}
              ${decoys.map((event) => `<li>诱饵鱼雷 ${escapeHtml(event.decoyId)} · ${escapeHtml(event.cell)} 已摧毁</li>`).join("")}
            </ul>` : ""}
        </div>
      </section>`;
  }

  function publicActionState(record) {
    if ([Data.ACTION_TYPES.SUBMARINE_MISSILE, Data.ACTION_TYPES.NUCLEAR_BOMB, Data.ACTION_TYPES.SHOCK_BOMB, Data.ACTION_TYPES.DETECTION_BOMB, Data.ACTION_TYPES.RADAR_SCAN].includes(record.actionType)) {
      return "unknown";
    }
    if (record.result === "hit") return "hit";
    if (record.result === "miss") return "miss";
    const cells = Array.isArray(record.cellResults)
      ? record.cellResults
      : Object.values(record.cellResultsByDefender ?? {}).flat();
    if (cells.length > 0) return cells.some((cell) => cell.result === "hit") ? "hit" : "miss";
    return "resolved";
  }

  function renderCombatEventList(room) {
    const actions = [...(room.battle?.publicActionLog ?? [])].reverse();
    if (actions.length === 0) return '<p class="empty-state">暂无战况。</p>';
    return `<ol class="event-list event-list--combat">
      ${actions.map((record) => {
        const actorName = Model.nicknameFor(room, record.actorId);
        const defenderIds = record.defenderIds ?? [record.defenderId].filter(Boolean);
        const defenders = defenderIds.map((id) => Model.nicknameFor(room, id)).join(" + ") || "目标";
        const stateCode = publicActionState(record);
        const stateLabel = { hit: "命中", miss: "未命中", unknown: "结果隐藏", resolved: "已结算" }[stateCode];
        return `<li class="event-item event-item--combat" data-event-state="${stateCode}">
          <span class="event-item__marker" aria-hidden="true"></span>
          <div class="event-item__body">
            <div class="event-item__route"><b>${escapeHtml(actorName)}</b><span>→</span><b>${escapeHtml(defenders)}</b><em>${escapeHtml(record.actionName)}</em></div>
            <p>${escapeHtml(Model.publicActionText(record, room))}</p>
          </div>
          <div class="event-item__meta"><span>${escapeHtml(stateLabel)}</span><small>#${record.sequence}</small></div>
        </li>`;
      }).join("")}
    </ol>`;
  }

  function privateIntelligenceLabel(area) {
    if (area.kind === "radar") return area.detected ? "发现布局" : "未发现布局";
    if (area.kind === "detection") return area.detected ? "探测到水下信号" : "未探测到水下信号";
    return "震爆区域已记录";
  }

  function privateIntelligenceName(area) {
    if (area.kind === "radar") return "雷达";
    if (area.kind === "detection") return "探测";
    return "震爆";
  }

  function renderPrivateEventList(room) {
    const areas = [...(room.battle?.own?.intelligenceAreas ?? [])].reverse();
    const markerCount = state.battle.markers?.size ?? 0;
    if (areas.length === 0 && markerCount === 0) return '<p class="empty-state">暂无私人情报。</p>';
    return `<div class="private-event-stack">
      ${markerCount > 0 ? `<div class="private-marker-summary"><span aria-hidden="true">⌖</span><div><strong>本机标记 ${markerCount}</strong><small>${escapeHtml(Model.nicknameFor(room, state.battle.targetPlayerId))} 海域</small></div></div>` : ""}
      ${areas.length ? `<ol class="event-list event-list--private">
        ${areas.map((area) => `<li class="event-item event-item--private" data-intelligence-kind="${escapeHtml(area.kind)}">
          <span class="event-item__marker" aria-hidden="true">⌾</span>
          <div class="event-item__body">
            <div class="event-item__route"><b>${escapeHtml(privateIntelligenceName(area))}</b><span>→</span><b>${escapeHtml(Model.nicknameFor(room, area.defenderId))}</b><em>${escapeHtml(area.center ?? "区域")}</em></div>
            <p>${escapeHtml(privateIntelligenceLabel(area))}</p>
          </div>
          <button class="text-button" data-action="select-intelligence" data-sequence="${area.sequence}">高亮</button>
        </li>`).join("")}
      </ol>` : ""}
    </div>`;
  }

  function systemEventTone(kind) {
    if (["action_timeout", "surrender", "disconnect_timeout"].includes(kind)) return "danger";
    if (["automatic_skip", "deployment_timeout_auto_ready"].includes(kind)) return "warning";
    return "neutral";
  }

  function renderSystemEventList(room) {
    const turnEvents = room.turnEvents ?? [];
    const systemEvents = room.systemEvents ?? [];
    const items = [
      ...turnEvents.map((event) => ({ sequence: event.sequence, kind: event.kind, text: Model.turnEventText(event, room), playerId: event.playerId })),
      ...systemEvents.map((event) => ({ sequence: event.sequence, kind: event.kind, text: event.message, playerIds: event.playerIds })),
    ].sort((left, right) => right.sequence - left.sequence);
    const eliminated = room.battle?.match?.eliminatedPlayerIds ?? [];
    if (items.length === 0 && eliminated.length === 0) return '<p class="empty-state">暂无系统消息。</p>';
    return `<div class="system-event-stack">
      ${eliminated.length ? `<div class="elimination-summary"><span>已淘汰</span>${eliminated.map((id) => `<b>${escapeHtml(Model.nicknameFor(room, id))}</b>`).join("")}</div>` : ""}
      ${items.length ? `<ol class="event-list event-list--system">
        ${items.map((item) => `<li class="event-item event-item--system" data-event-tone="${systemEventTone(item.kind)}">
          <span class="event-item__marker" aria-hidden="true"></span>
          <div class="event-item__body"><small>${escapeHtml(item.kind.replaceAll("_", " "))}</small><p>${escapeHtml(item.text)}</p></div>
          <div class="event-item__meta"><small>#${item.sequence}</small></div>
        </li>`).join("")}
      </ol>` : ""}
    </div>`;
  }

  function renderPublicLog(room, options = {}) {
    const publicOnly = Boolean(options.publicOnly);
    const active = publicOnly ? "combat" : state.battle.eventChannel;
    const channelContent = active === "private"
      ? renderPrivateEventList(room)
      : active === "system"
        ? renderSystemEventList(room)
        : renderCombatEventList(room);
    return `
      <section class="log-panel event-center event-center--v074 ${state.battle.logOpen ? "log-panel--open" : ""}" data-event-channel="${escapeHtml(active)}">
        <button class="panel-heading log-panel__toggle" type="button" data-action="toggle-log" aria-expanded="${state.battle.logOpen}">
          <span>${publicOnly ? "公开行动记录" : "战场动态"}</span><small>${publicOnly ? "对局中公开可见的信息" : "战况 · 私人情报 · 系统"}</small><i aria-hidden="true">⌃</i>
        </button>
        ${publicOnly ? "" : `<div class="event-tabs" role="tablist" aria-label="战场动态分类">
          <button role="tab" aria-selected="${active === "combat"}" class="${active === "combat" ? "is-active" : ""}" data-action="set-event-channel" data-channel="combat"><span>战况</span><b>${room.battle?.publicActionLog?.length ?? 0}</b></button>
          <button role="tab" aria-selected="${active === "private"}" class="${active === "private" ? "is-active" : ""}" data-action="set-event-channel" data-channel="private"><span>私人情报</span><b>${room.battle?.own?.intelligenceAreas?.length ?? 0}</b></button>
          <button role="tab" aria-selected="${active === "system"}" class="${active === "system" ? "is-active" : ""}" data-action="set-event-channel" data-channel="system"><span>系统</span><b>${(room.turnEvents?.length ?? 0) + (room.systemEvents?.length ?? 0)}</b></button>
        </div>`}
        <div class="log-panel__content event-center__content">${channelContent}</div>
      </section>`;
  }

  function battleOpponentIds(battle) {
    if (Array.isArray(battle?.opponentIds) && battle.opponentIds.length > 0) {
      return battle.opponentIds;
    }
    const legacyOpponentId = battle?.opponentId ?? battle?.opponent?.id;
    return legacyOpponentId ? [legacyOpponentId] : [];
  }

  function isRemainingTurnTarget(room, playerId) {
    const remaining = room?.turn?.remainingTargetPlayerIds;
    return !Array.isArray(remaining) || remaining.includes(playerId);
  }

  function battleMapIsCollapsed(mapId) {
    return Boolean(state.battle.collapsedMaps?.[mapId]);
  }

  function enemyTurnStatus(room, playerId) {
    if (!room.turn?.canAct) return "查看";
    if ((room.turn.completedTargetPlayerIds ?? []).includes(playerId)) return "已完成";
    if (isRemainingTurnTarget(room, playerId)) {
      return room.maxPlayers === 3 ? "同步目标" : "待操作";
    }
    return "查看";
  }

  function renderRangeLegend(room, playerId) {
    const definition = Data.getActionDefinition(state.battle.selectedAction);
    if (!definition) return "";
    const simultaneous = isSimultaneousThreePlayerSelection(room);
    const applies = state.battle.targetPlayerId === playerId || simultaneous;
    if (!applies) return "";
    return `
      <div class="range-legend range-legend--v073" aria-label="攻击范围图例">
        <span><i data-kind="valid"></i>可选</span>
        <span><i data-kind="selected"></i>${state.battle.target ? "已选范围" : "目标预览"}</span>
        ${simultaneous ? '<b>两张敌方地图同步预览</b>' : ""}
      </div>`;
  }

  function renderMarkerPalette(playerId) {
    const activeForMap =
      state.battle.markerMode && state.battle.targetPlayerId === playerId;
    return `
      <div class="marker-palette" data-active="${activeForMap}" aria-label="${escapeHtml(Model.nicknameFor(state.room, playerId))}海域自定义标记">
        <div class="marker-palette__heading">
          <strong>自定义标记</strong>
          <small>点击格子添加；电脑右键或手机长按删除</small>
        </div>
        <div class="marker-palette__tools" role="toolbar" aria-label="标记类型">
          ${MARKER_DEFINITIONS.map((marker) => {
            const selected = activeForMap && state.battle.selectedMarker === marker.value;
            return `<button
              type="button"
              class="marker-tool ${selected ? "marker-tool--selected" : ""}"
              data-action="select-marker-tool"
              data-marker="${marker.value}"
              data-target-player-id="${escapeHtml(playerId)}"
              aria-pressed="${selected}"
              title="${escapeHtml(marker.label)}"
            ><i class="marker-tool__swatch marker-tool__swatch--${marker.value}" aria-hidden="true"></i><span>${escapeHtml(marker.shortLabel)}</span></button>`;
          }).join("")}
        </div>
      </div>`;
  }

  function renderEnemyMapCard(room, playerId) {
    const ownBattle = room.battle.own;
    const nickname = Model.nicknameFor(room, playerId);
    const collapsed = battleMapIsCollapsed(playerId);
    const selected = state.battle.targetPlayerId === playerId;
    const status = enemyTurnStatus(room, playerId);
    const canTarget = !room.turn?.canAct || isRemainingTurnTarget(room, playerId);
    const mobileActive = state.battle.mobileMap === playerId;
    const intel = currentIntelligenceArea(ownBattle, playerId);
    const activeAction = Data.getActionDefinition(state.battle.selectedAction);
    return `
      <section
        class="battle-map-card battle-map-card--enemy battle-map-card--v072 battle-map-card--v073 ${selected ? "battle-map-card--targeted" : ""} ${collapsed ? "battle-map-card--collapsed" : ""} ${mobileActive ? "is-mobile-active" : ""}"
        data-map-panel="enemy"
        data-player-id="${escapeHtml(playerId)}"
      >
        <div class="map-card__heading map-card__heading--v072">
          <button class="map-collapse-button" type="button" data-action="toggle-battle-map" data-map-id="${escapeHtml(playerId)}" aria-label="${collapsed ? "展开" : "最小化"}${escapeHtml(nickname)}的敌方地图" aria-expanded="${!collapsed}">${collapsed ? "+" : "−"}</button>
          <button
            class="map-target-heading"
            type="button"
            data-action="select-battle-target"
            data-target-player-id="${escapeHtml(playerId)}"
            ${canTarget ? "" : 'aria-disabled="true"'}
          >
            <span class="status-kicker">敌方海域</span>
            <h2>${escapeHtml(nickname)}</h2>
          </button>
          <span class="map-turn-state" data-state="${status === "已完成" ? "done" : ["待操作", "同步目标"].includes(status) ? "pending" : "view"}">${status === "已完成" ? "✓" : ["待操作", "同步目标"].includes(status) ? "●" : "○"} ${status}</span>
          <button
            class="marker-toggle ${state.battle.markerMode && selected ? "marker-toggle--active" : ""}"
            data-action="toggle-marker-mode"
            data-target-player-id="${escapeHtml(playerId)}"
            aria-pressed="${state.battle.markerMode && selected}"
            title="私人标记"
          >标记</button>
        </div>
        ${collapsed
          ? `<button class="battle-map-collapsed-summary" type="button" data-action="toggle-battle-map" data-map-id="${escapeHtml(playerId)}"><span>${escapeHtml(nickname)} · 独立记录</span><strong>${status}</strong></button>`
          : `${renderMarkerPalette(playerId)}
             <div class="tactical-sea-toolbar"><span><i aria-hidden="true"></i>海面战术投影</span><b>${state.battle.markerMode && selected ? "私人标记模式" : activeAction && (selected || isSimultaneousThreePlayerSelection(room)) ? escapeHtml(activeAction.name) : "悬停显示坐标"}</b></div>
             ${renderEnemyBoard(ownBattle, playerId)}
             ${renderRangeLegend(room, playerId)}
             <div class="map-caption map-caption--v072">
               <span>${selected ? (state.battle.selectedAction ? "当前目标" : "已选中") : "独立敌方记录"}</span>
               ${intel ? `<button class="intel-chip" data-action="clear-intelligence" data-kind="${intel.kind}">${intel.kind === "shock" ? "震爆区域" : intel.kind === "radar" ? `雷达 · ${intel.detected ? "发现" : "未发现"}` : `探测 · ${intel.detected ? "有信号" : "无信号"}`} ×</button>` : ""}
             </div>`}
      </section>`;
  }

  function renderOwnMapCard(room) {
    const collapsed = battleMapIsCollapsed("own");
    const mobileActive = state.battle.mobileMap === "own";
    return `
      <section class="battle-map-card battle-map-card--own battle-map-card--v072 battle-map-card--v073 ${collapsed ? "battle-map-card--collapsed" : ""} ${mobileActive ? "is-mobile-active" : ""}" data-map-panel="own">
        <div class="map-card__heading map-card__heading--v072">
          <button class="map-collapse-button" type="button" data-action="toggle-battle-map" data-map-id="own" aria-label="${collapsed ? "展开" : "最小化"}己方地图" aria-expanded="${!collapsed}">${collapsed ? "+" : "−"}</button>
          <div class="map-target-heading map-target-heading--static"><span class="status-kicker">己方海域</span><h2>己方地图</h2></div>
          <span class="map-turn-state" data-state="own">私密</span>
        </div>
        ${collapsed
          ? `<button class="battle-map-collapsed-summary" type="button" data-action="toggle-battle-map" data-map-id="own"><span>己方海域</span><strong>完整情报</strong></button>`
          : `<div class="tactical-sea-toolbar"><span><i aria-hidden="true"></i>己方舰队投影</span><b>完整情报</b></div>${renderOwnBattleBoard(room.battle.own)}<div class="map-caption map-caption--v072"><span>己方完整情报</span></div>`}
      </section>`;
  }

  function renderBattleMapTabs(room) {
    const opponents = battleOpponentIds(room.battle);
    const tabs = [
      { id: "own", label: "己方" },
      ...opponents.map((playerId) => ({ id: playerId, label: Model.nicknameFor(room, playerId) })),
    ];
    return `
      <div class="mobile-map-tabs mobile-map-tabs--v072" data-tab-count="${tabs.length}" role="tablist" aria-label="地图切换">
        ${tabs.map((tab) => `
          <button role="tab" aria-selected="${state.battle.mobileMap === tab.id}" class="${state.battle.mobileMap === tab.id ? "is-active" : ""}" data-action="switch-map" data-map="${escapeHtml(tab.id)}">
            ${escapeHtml(tab.label)}${tab.id === "own" && state.battle.ownMapAlert ? '<i class="alert-dot" aria-label="有新的己方受击信息"></i>' : ""}
          </button>`).join("")}
      </div>`;
  }

  function renderBattleSideDock(room) {
    const combatCount = room.battle?.publicActionLog?.length ?? 0;
    const privateCount = room.battle?.own?.intelligenceAreas?.length ?? 0;
    const systemCount = (room.turnEvents?.length ?? 0) + (room.systemEvents?.length ?? 0);
    return `
      <nav class="battle-side-dock" aria-label="战术侧边栏">
        <button class="battle-side-dock__action" type="button" data-action="toggle-action-drawer" aria-expanded="${state.battle.actionDrawerOpen}">
          <span aria-hidden="true">${uiIcon("action-radar")}</span><strong>行动</strong><small>${room.turn?.canAct ? "可操作" : "待命"}</small>
        </button>
        <button type="button" data-action="set-event-channel" data-channel="combat" aria-expanded="${state.battle.logOpen && state.battle.eventChannel === "combat"}" class="${state.battle.logOpen && state.battle.eventChannel === "combat" ? "is-active" : ""}">
          <span aria-hidden="true">${uiIcon("status-hit")}</span><strong>战斗日志</strong><small>${combatCount}</small>
        </button>
        <button type="button" data-action="set-event-channel" data-channel="private" aria-expanded="${state.battle.logOpen && state.battle.eventChannel === "private"}" class="${state.battle.logOpen && state.battle.eventChannel === "private" ? "is-active" : ""}">
          <span aria-hidden="true">${uiIcon("status-private")}</span><strong>情报信息</strong><small>${privateCount}</small>
        </button>
        <button type="button" data-action="set-event-channel" data-channel="system" aria-expanded="${state.battle.logOpen && state.battle.eventChannel === "system"}" class="${state.battle.logOpen && state.battle.eventChannel === "system" ? "is-active" : ""}">
          <span aria-hidden="true">${uiIcon("status-online")}</span><strong>系统消息</strong><small>${systemCount}</small>
        </button>
      </nav>`;
  }

  function renderBridgeCommandDeck(room) {
    const selectedDefinition = Data.getActionDefinition(state.battle.selectedAction);
    const targetPlayerId = state.battle.targetPlayerId ?? battleOpponentIds(room.battle)[0];
    const hasDraft = Boolean(selectedDefinition || state.battle.target || state.battle.markerMode);
    const targetText = state.battle.target ? Model.formatTarget(state.battle.target) : "选择目标";
    return `
      <div class="bridge-command-deck" aria-label="舰桥底部控制台">
        <section class="bridge-console-group bridge-layer-control">
          <span>战术视层</span>
          <div role="group" aria-label="己方沙盘显示层">
            ${[
              ["all", "综合"],
              ["surface", "水面"],
              ["underwater", "潜层"],
            ].map(([value, label]) => `<button type="button" data-action="set-tactical-layer" data-layer="${value}" aria-pressed="${state.battle.tacticalLayer === value}" class="${state.battle.tacticalLayer === value ? "is-active" : ""}">${label}</button>`).join("")}
          </div>
        </section>
        <section class="bridge-console-group bridge-marker-control">
          <span>私人标记</span>
          <div role="toolbar" aria-label="快速私人标记">
            ${MARKER_DEFINITIONS.map((marker) => `<button
              type="button"
              data-action="select-bridge-marker-tool"
              data-marker="${marker.value}"
              data-target-player-id="${escapeHtml(targetPlayerId)}"
              aria-pressed="${state.battle.markerMode && state.battle.selectedMarker === marker.value}"
              title="${escapeHtml(marker.label)}"
            ><i class="marker-tool__swatch marker-tool__swatch--${marker.value}" aria-hidden="true"></i><b>${escapeHtml(marker.shortLabel)}</b></button>`).join("")}
          </div>
        </section>
        <section class="bridge-console-group bridge-confirm-control">
          <span>行动确认</span>
          <button class="bridge-confirm-button" type="button" data-action="reopen-action-confirm" ${state.battle.target ? "" : "disabled"}>
            <small>${selectedDefinition ? escapeHtml(selectedDefinition.name) : "等待指令"}</small>
            <strong>${escapeHtml(targetText)}</strong>
          </button>
        </section>
        <section class="bridge-console-group bridge-cancel-control">
          <span>取消操作</span>
          <button type="button" data-action="cancel-action-selection" ${hasDraft ? "" : "disabled"}>取消选择</button>
        </section>
        <section class="bridge-console-group bridge-help-control">
          <span>舰桥菜单</span>
          <div><button type="button" data-action="open-rules">游戏说明</button>${room.roomPhase === "PLAYING" ? '<button type="button" data-action="surrender">投降</button>' : ""}</div>
        </section>
      </div>`;
  }

  function renderFinalSalvoStage(room, finalSalvoState, availableFinalDecoys) {
    if (!finalSalvoState) return "";
    const submitted = new Set(finalSalvoState.submittedPlayerIds ?? []);
    const ownSelected = (room.battle?.own?.decoys ?? []).find(
      (decoy) => decoy.id === finalSalvoState.ownSelectedDecoyId,
    );
    const selecting = finalSalvoState.status === "selecting";
    const waiting = selecting && finalSalvoState.ownSubmitted;
    const allReady = room.seats.every((seat) => submitted.has(seat.playerId));
    return `
      <section class="final-salvo-stage final-salvo-stage--v075" data-final-salvo-status="${escapeHtml(finalSalvoState.status)}" aria-labelledby="final-salvo-title" aria-live="polite">
        <header class="final-salvo-stage__header">
          <span class="final-salvo-stage__emblem" aria-hidden="true">${uiIcon("status-final-salvo")}</span>
          <div>
            <span class="status-kicker">FINAL SALVO · 第 ${finalSalvoState.round ?? "—"} 轮</span>
            <h2 id="final-salvo-title">最终齐射</h2>
            <p>${selecting ? "秘密选择一枚尚未引爆的己方诱饵鱼雷。" : "全部鱼雷已经结算，正在生成最终结果。"}</p>
          </div>
          <span class="final-salvo-stage__state" data-state="${waiting ? "waiting" : selecting ? "selecting" : "resolving"}">${waiting ? "等待其他玩家" : selecting ? "等待选择" : "终局结算中"}</span>
        </header>

        <div class="final-salvo-stage__grid">
          <div class="salvo-choice-panel">
            <div class="salvo-choice-panel__heading">
              <div><span class="status-kicker">己方鱼雷</span><strong>${waiting ? "选择已锁定" : "选择引爆坐标"}</strong></div>
              <span>${availableFinalDecoys.length} 枚可用</span>
            </div>
            ${waiting
              ? `<div class="salvo-locked-choice">${uiIcon("status-private")}<div><strong>${ownSelected ? `已选择 ${escapeHtml(ownSelected.cell)}` : "已秘密提交"}</strong><small>其他玩家无法看到你的选择；本轮会同时结算。</small></div></div>`
              : availableFinalDecoys.length > 0
                ? `<div class="salvo-decoy-grid">${availableFinalDecoys.map((decoy) => `
                    <button class="salvo-decoy-card" type="button" data-action="submit-final-salvo" data-decoy-id="${escapeHtml(decoy.id)}">
                      <span aria-hidden="true">${uiIcon("ship-decoy")}</span>
                      <strong>${escapeHtml(decoy.cell)}</strong>
                      <small>引爆鱼雷</small>
                    </button>`).join("")}</div>`
                : `<div class="salvo-empty-choice">${uiIcon("status-sunk")}<div><strong>本方无可用鱼雷</strong><small>无需选择，等待服务器推进。</small></div></div>`}
            <div class="salvo-multi-target-note">${uiIcon("status-final-salvo")}<span>同一坐标同时作用于<strong>其他所有仍在局玩家</strong></span></div>
          </div>

          <aside class="salvo-submit-panel" aria-label="本轮提交状态">
            <div class="salvo-submit-panel__heading"><span>本轮状态</span><strong>${submitted.size} / ${room.seats.length}</strong></div>
            <div class="salvo-player-list">
              ${room.seats.map((seat) => {
                const own = seat.playerId === room.own.playerId;
                const ready = submitted.has(seat.playerId);
                return `<div class="salvo-player-status" data-ready="${ready}" data-own="${own}">
                  <span>${ready ? uiIcon("status-online") : uiIcon("status-unknown")}</span>
                  <div><strong>${escapeHtml(seat.nickname)}${own ? "（你）" : ""}</strong><small>${own && ready ? "已秘密提交" : ready ? "已就绪" : "等待选择"}</small></div>
                </div>`;
              }).join("")}
            </div>
            <div class="salvo-submit-summary" data-ready="${allReady}">${allReady ? "所有玩家已就绪，等待同时结算。" : "其他玩家的具体鱼雷坐标始终保密。"}</div>
          </aside>
        </div>
      </section>`;
  }

  function renderBattlePage() {
    const room = state.room;
    const battle = room.battle;
    if (!battle) {
      return '<section class="boot-card"><span class="sonar"></span><p>正在同步安全战场视图……</p></section>';
    }
    const finalSalvo = room.roomPhase === "FINAL_SALVO";
    const finalSalvoState = battle.match?.finalSalvo;
    const availableFinalDecoys = (battle.own.decoys ?? []).filter(
      (decoy) => finalSalvoState?.availableDecoyIds?.includes(decoy.id),
    );
    const opponents = battleOpponentIds(battle);
    void Sound?.preloadGroup?.("battle");
    return `
      <section class="battle-page battle-page--v072 battle-page--v073 battle-page--v076 battle-page--carrier battle-page--v14 battle-page--v15 battle-page--immersive page-enter" data-player-count="${room.maxPlayers}" data-map-size="${room.mapSize}" data-tactical-layer="${escapeHtml(state.battle.tacticalLayer)}" data-drawer-open="${state.battle.actionDrawerOpen ? "actions" : state.battle.logOpen ? "messages" : "none"}" aria-labelledby="battle-page-title">
        <h1 id="battle-page-title" class="sr-only">正式对战</h1>
        <div class="carrier-bridge-scene" aria-hidden="true"><div class="carrier-bridge-scene__glass"></div><div class="carrier-bridge-scene__horizon"></div><div class="carrier-bridge-scene__console"></div><div class="bridge-frame bridge-frame--left"></div><div class="bridge-frame bridge-frame--right"></div></div>
        <div class="carrier-bridge-interface">
          ${renderBattleHeader(room)}
          <div class="carrier-horizon-deck" aria-hidden="true"><span>CVN COMMAND BRIDGE</span><i></i><span>SEA TACTICAL DISPLAY · GRID ASSIST</span></div>
          <div class="carrier-tactical-console">
            ${finalSalvo ? renderFinalSalvoStage(room, finalSalvoState, availableFinalDecoys) : ""}
            ${renderLatestFeedback(room)}
            ${renderBattleMapTabs(room)}
            ${finalSalvo ? "" : renderBattleSideDock(room)}
            ${state.battle.actionDrawerOpen || state.battle.logOpen ? '<button class="battle-drawer-scrim" type="button" data-action="close-battle-drawers" aria-label="关闭战术侧边栏"></button>' : ""}

            <div class="battle-layout battle-layout--v072 battle-layout--v073 battle-layout--v076 ${finalSalvo ? "battle-layout--final" : ""}">
              <div class="battle-main-column">
                <div class="battle-maps battle-maps--v072 battle-maps--v073" data-map-count="${1 + opponents.length}">
                  ${renderOwnMapCard(room)}
                  ${opponents.map((playerId) => renderEnemyMapCard(room, playerId)).join("")}
                </div>
                ${renderPublicLog(room)}
              </div>
              ${finalSalvo ? "" : renderActionPanel(room)}
            </div>

            ${finalSalvo ? "" : renderBridgeCommandDeck(room)}
            <div class="battle-lower battle-lower--controls-only">
              <aside class="battle-controls"><div><span class="status-kicker">航母作战控制台</span><strong>${room.turn?.canAct ? "等待指挥官确认行动" : "战术链路监视中"}</strong></div><button class="button button--quiet" data-action="open-rules">游戏说明</button>${room.roomPhase === "PLAYING" ? '<button class="button button--danger-quiet" data-action="surrender">投降</button>' : ""}</aside>
            </div>
          </div>
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
          <b>${snapshot?.decoys?.filter((decoy) => !decoy.destroyed).length ?? 0} / ${snapshot?.decoys?.length ?? 0}</b>
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

  function resultIconName(code) {
    if (code === "win") return "status-win";
    if (code === "loss") return "status-loss";
    return "status-draw";
  }

  function renderResultPlayers(room, result, replay) {
    return `
      <section class="result-player-panel" aria-label="玩家终局状态">
        <div class="panel-heading"><span>玩家状态</span><small>航空母舰最终生命值</small></div>
        <div class="result-player-grid">
          ${room.seats.map((seat) => {
            const winner = seat.playerId === result?.winnerId;
            const own = seat.playerId === room.own.playerId;
            const hp = resultCarrierHp(replay, seat.playerId);
            return `<article class="result-player-card ${winner ? "result-player-card--winner" : ""}" data-winner="${winner}" data-own="${own}">
              <span class="result-player-card__icon" aria-hidden="true">${uiIcon(winner ? "status-win" : "ship-aircraft-carrier")}</span>
              <div class="result-player-card__identity"><strong>${escapeHtml(seat.nickname)}${own ? "（你）" : ""}</strong><small>${winner ? "胜者" : "对局结束"}</small></div>
              <div class="result-player-card__hp"><strong>${Model.formatHp(hp)}</strong><small>航母 HP</small></div>
            </article>`;
          }).join("")}
        </div>
      </section>`;
  }

  function renderRematchPanel(room) {
    const requested = new Set(room.rematch.requestedPlayerIds ?? []);
    const readyCount = room.seats.filter((seat) => requested.has(seat.playerId)).length;
    return `
      <section class="rematch-panel rematch-panel--v075" aria-labelledby="rematch-title">
        <div class="rematch-panel__heading">
          <div><span class="status-kicker">REMATCH</span><h2 id="rematch-title">再来一局</h2></div>
          <span class="rematch-progress">${readyCount} / ${room.seats.length} 已确认</span>
        </div>
        <div class="rematch-player-grid">
          ${room.seats.map((seat) => {
            const own = seat.playerId === room.own.playerId;
            const ready = requested.has(seat.playerId);
            return `<div class="rematch-player" data-ready="${ready}" data-own="${own}">
              <span aria-hidden="true">${uiIcon(ready ? "status-rematch" : "status-unknown")}</span>
              <div><strong>${escapeHtml(seat.nickname)}${own ? "（你）" : ""}</strong><small>${ready ? "已申请" : seat.isBot ? "将在你申请后自动确认" : "等待确认"}</small></div>
            </div>`;
          }).join("")}
        </div>
        <div class="rematch-panel__actions">
          ${room.rematch.ownRequested
            ? `<button class="button button--secondary" data-action="cancel-rematch" ${state.pendingRequest ? "disabled" : ""}>取消申请</button>`
            : `<button class="button button--primary" data-action="request-rematch" ${state.pendingRequest ? "disabled" : ""}>再来一局</button>`}
          <button class="button button--danger-quiet" data-action="leave-room">离开房间</button>
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
    return `
      <section class="finished-page finished-page--v075 page-enter" data-result="${relative.code}" aria-labelledby="result-title">
        <header class="result-hero result-hero--v075">
          <span class="result-emblem result-emblem--v075" aria-hidden="true">${uiIcon(resultIconName(relative.code))}</span>
          <div class="result-hero__content">
            <span class="status-kicker">MATCH COMPLETE</span>
            <h1 id="result-title">${escapeHtml(relative.title)}</h1>
            <p>${escapeHtml(Model.endReasonForViewer(result, room.own.playerId))}</p>
            <div class="result-hero__facts">
              <span><b>${room.matchSummary.turnCount}</b> 回合</span>
              <span><b>${escapeHtml(Model.formatDuration(room.matchSummary.durationMs))}</b> 对局时长</span>
              <span><b>${room.seats.length}</b> 名玩家</span>
            </div>
          </div>
          <button class="button button--quiet result-hero__replay-link" type="button" data-action="focus-replay">查看复盘</button>
        </header>

        ${renderResultPlayers(room, result, replay)}
        ${renderRematchPanel(room)}

        <div class="replay-layout replay-layout--v075" id="match-replay" tabindex="-1">
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
          <summary>查看对局中各玩家当时可见的公开记录</summary>
          ${renderPublicLog(room, { publicOnly: true })}
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
        <section class="pause-card pause-card--connection" role="alertdialog" aria-modal="true" aria-labelledby="restore-title">
          <div class="pause-card__icon" data-kind="sync" aria-hidden="true">↻</div>
          <span class="connection-status-chip" data-state="syncing">同步中</span>
          <h2 id="restore-title">正在恢复对局</h2>
          <p>等待服务器同步</p>
        </section>`;
      return;
    }
    if (!state.connected && state.room) {
      blockingOverlay.hidden = false;
      blockingOverlay.innerHTML = `
        <section class="pause-card pause-card--connection" role="alertdialog" aria-modal="true" aria-labelledby="offline-title">
          <div class="pause-card__icon" data-kind="offline" aria-hidden="true">⌁</div>
          <span class="connection-status-chip" data-state="offline">连接中断</span>
          <h2 id="offline-title">正在重新连接</h2>
          <p>操作暂时锁定</p>
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
    const offlineNames = offlineSeats.map((seat) => seat.nickname).join("、");
    const deadline = earliestReconnectDeadline(room);
    const beforeMatch = ["WAITING", "DEPLOYING", "ROLLING"].includes(room.roomPhase);
    const playing = room.roomPhase === "PLAYING";
    const finished = room.roomPhase === "FINISHED";
    blockingOverlay.hidden = false;
    blockingOverlay.innerHTML = `
      <section class="pause-card pause-card--connection" role="alertdialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="pause-card__icon" data-kind="paused" aria-hidden="true">Ⅱ</div>
        <span class="connection-status-chip" data-state="offline">${escapeHtml(offlineNames)} 已断线</span>
        <h2 id="pause-title">对局已暂停</h2>
        <p>等待玩家重连</p>
        ${deadline ? `<div class="reconnect-timer reconnect-timer--v074"><span>重连剩余</span><strong data-deadline="${deadline}">—</strong></div>` : '<div class="reconnect-timer reconnect-timer--v074"><span>状态</span><strong>等待在线</strong></div>'}
        <div class="pause-player-list">${offlineSeats.map((seat) => `<span><i></i>${escapeHtml(seat.nickname)}<small>离线</small></span>`).join("")}</div>
        <div class="modal__actions">
          ${beforeMatch ? '<button class="button button--danger-quiet" data-action="leave-room">离开房间</button>' : ""}
          ${playing ? '<button class="button button--danger" data-action="surrender-and-leave">投降并离开</button>' : ""}
          ${finished ? '<button class="button button--danger-quiet" data-action="leave-room">离开房间</button>' : ""}
          ${room.roomPhase === "FINAL_SALVO" ? '<button class="button button--secondary" disabled>等待终局结算</button>' : ""}
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
        Sound?.playEffect?.("move");
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
        Sound?.playEffect?.("remove");
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
      Sound?.playEffect?.("place");
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
    Sound?.playEffect?.("place");
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
        Sound?.playEffect?.("rotate");
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
    Sound?.playEffect?.("rotate");
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
    Sound?.playEffect?.("move");
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
    Sound?.playEffect?.("cancel");
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
    const simultaneousAction =
      state.room.maxPlayers === 3 &&
      (state.room.turn?.remainingTargetPlayerIds?.length ?? 0) > 1;
    const paragraphs = [
      `目标：${Model.formatTarget(target)}`,
      ...(simultaneousAction
        ? [`敌方玩家：${state.room.turn.remainingTargetPlayerIds.map((playerId) => Model.nicknameFor(state.room, playerId)).join("、")}（同时生效）`]
        : battleOpponentIds(state.room.battle).length > 1
        ? [`敌方玩家：${Model.nicknameFor(state.room, state.battle.targetPlayerId)}`]
        : []),
    ];
    if (definition.initialUses !== null) {
      paragraphs.push(`提交成功后剩余 ${Math.max(0, remaining - 1)} 次。`);
    }
    if (simultaneousAction) {
      paragraphs.push("行动资源以及行动方可能产生的自损只结算一次。");
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
      Sound?.playEffect?.(ACTION_EFFECTS[definition.type] ?? "confirm");
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
      Sound?.playEffect?.("final_salvo");
      await ensureStateVersion(response.stateVersion);
    } catch (error) {
      showToast(humanizeSocketError(error), "error");
    } finally {
      state.pendingRequest = null;
      render();
    }
  }

  async function submitOpeningRoll() {
    const room = state.room;
    if (!room || room.roomPhase !== "ROLLING" || room.rolling?.firstPlayerId) return;
    state.pendingRequest = "roll-die";
    render();
    try {
      const response = await emitRequest("match:roll-die", {
        expectedVersion: room.stateVersion,
      });
      Sound?.playEffect?.("dice_roll");
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
      Sound?.playEffect?.("ready");
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
    state.battle.actionDrawerOpen = definition.targetMode === "line";
    state.battle.logOpen = false;
    state.battle.target = null;
    state.battle.actionId = null;
    state.battle.markerMode = false;
    state.battle.helicopterAxis =
      definition.targetMode === "line" ? state.battle.helicopterAxis : null;
    render();
  }

  function handleEnemyCell(coordinate, targetPlayerId = state.battle.targetPlayerId) {
    const ownBattle = state.room?.battle?.own;
    if (!ownBattle || !targetPlayerId) return;
    const simultaneousAction = isSimultaneousThreePlayerSelection();
    if (state.room?.turn?.canAct && !simultaneousAction && !isRemainingTurnTarget(state.room, targetPlayerId) && !state.battle.markerMode) {
      showToast("该敌方玩家本回合已完成操作。", "info");
      return;
    }
    if (targetPlayerId !== state.battle.targetPlayerId) {
      saveMarkers();
      state.battle.targetPlayerId = targetPlayerId;
      state.battle.markerContext = null;
      prepareMarkerContext(state.room);
      state.battle.target = null;
      state.battle.actionId = null;
    }
    const selectedEnemyMap = enemyMapFor(ownBattle, targetPlayerId);
    const effectiveOwnBattle = { ...ownBattle, enemyMap: selectedEnemyMap };
    const resolved = Data.resolvedTargetSet(effectiveOwnBattle);
    if (state.battle.markerMode) {
      if (resolved.has(coordinate)) {
        showToast("命中或未命中格不能添加私人标记。", "warning");
        return;
      }
      state.battle.markers.set(coordinate, state.battle.selectedMarker);
      saveMarkers();
      Sound?.playEffect?.("marker_add");
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
    const options = Data.getTargetOptions(actionType, effectiveOwnBattle);
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
    Sound?.playEffect?.("target_lock");
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
        roomMode: state.entry.roomMode,
        botDifficulty: state.entry.roomMode === "bot_duel"
          ? state.entry.botDifficulty
          : undefined,
        mapSize: state.entry.mapSize,
      });
      Sound?.playEffect?.("room_create");
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
      Sound?.playEffect?.("room_join");
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
      Sound?.playEffect?.("reconnect");
      showToast(
        response.disconnectResolved
          ? "座位已恢复，服务器已同步断线期间的最终处理结果。"
          : "座位与服务器确认状态已恢复。",
        "success",
        5_000,
        false,
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
      if (
        Data.RELEASE &&
        (state.protocolVersion !== Data.RELEASE.socketProtocolVersion ||
          state.serverStage !== Data.RELEASE.stage)
      ) {
        showToast(
          `前后端版本不一致：页面 ${Data.RELEASE.stage}/协议 ${Data.RELEASE.socketProtocolVersion}，服务器 ${state.serverStage ?? "未知"}/协议 ${state.protocolVersion ?? "未知"}。请强制刷新页面。`,
          "warning",
          12_000,
        );
      }
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
    if (event.target.id === "effects-volume") {
      setEffectsVolumePreference(Number(event.target.value) / 100);
    }
    if (event.target.id === "music-volume") {
      setMusicVolumePreference(Number(event.target.value) / 100);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "reduce-motion-toggle") {
      setReduceMotion(event.target.checked);
    }
    if (event.target.id === "effects-toggle") {
      setEffectsPreference(event.target.checked);
    }
    if (event.target.id === "music-toggle") {
      void setMusicPreference(event.target.checked);
    }
    if (event.target.id === "effects-volume" && state.audio.effectsEnabled) {
      Sound?.playEffect?.("success");
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
    if (brand && state.tutorial.active) {
      event.preventDefault();
      exitTutorial();
      return;
    }
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
    const controlEffect = controlEffectName(action, control);
    if (controlEffect) Sound?.playEffect?.(controlEffect);

    if (action === "start-tutorial") {
      startTutorial();
      return;
    }
    if (action === "exit-tutorial") {
      exitTutorial();
      return;
    }
    if (action === "tutorial-start-beginner") {
      exitTutorial({ selectBeginner: true });
      showToast("已选择 12×12 新手人机，填写昵称后即可创建。", "success");
      return;
    }
    if (action.startsWith("tutorial-")) {
      const previousTutorial = state.tutorial.session;
      const tutorialAction = {
        type: action,
        coordinate: control.dataset.coordinate,
        value: control.dataset.value,
        index: control.dataset.index,
      };
      const nextTutorial = Tutorial.reduce(
        previousTutorial,
        tutorialAction,
      );
      state.tutorial.session = nextTutorial;
      if (
        nextTutorial.completedLessonIds.length >
        previousTutorial.completedLessonIds.length
      ) {
        Sound?.playEffect?.("tutorial_complete");
      } else if (nextTutorial.messageKind === "success") {
        Sound?.playEffect?.("tutorial_step");
      } else if (nextTutorial.messageKind === "warning") {
        Sound?.playEffect?.("warning");
      } else {
        Sound?.playEffect?.("ui_select");
      }
      saveTutorialProgress();
      render();
      return;
    }

    if (action === "select-mode") {
      state.entry.maxPlayers = Number(control.dataset.maxPlayers) === 3 ? 3 : 2;
      state.entry.roomMode = control.dataset.roomMode === "bot_duel"
        ? "bot_duel"
        : "pvp";
      render();
      return;
    }
    if (action === "select-bot-difficulty") {
      const difficulty = control.dataset.botDifficulty;
      if (["beginner", "standard", "expert"].includes(difficulty)) {
        state.entry.botDifficulty = difficulty;
        render();
      }
      return;
    }
    if (action === "select-map-size") {
      const mapSize = Number(control.dataset.mapSize);
      if (Data.SUPPORTED_MAP_SIZES.includes(mapSize)) {
        state.entry.mapSize = mapSize;
        Data.configureMap(mapSize);
        render();
      }
      return;
    }
    if (action === "open-audio-settings") {
      openAudioSettings(control.dataset.audioFocus);
      return;
    }
    if (action === "close-audio-settings") {
      audioDialog.close();
      return;
    }
    if (action === "open-rules") {
      reduceMotionToggle.checked = state.reduceMotion;
      syncAudioControls();
      if (!rulesDialog.open) rulesDialog.showModal();
      return;
    }
    if (action === "close-rules") {
      rulesDialog.close();
      return;
    }
    if (action === "open-personalize") {
      openPersonalize();
      return;
    }
    if (action === "close-personalize") {
      personalizeDialog.close();
      return;
    }
    if (action === "select-theme") {
      applyTheme(control.dataset.themeValue);
      return;
    }
    if (action === "select-accent") {
      applyAccent(control.dataset.accentValue);
      return;
    }
    if (action === "reset-personalization") {
      applyTheme("ocean-dark");
      applyAccent("cyan");
      showToast("已恢复默认主题与强调色。", "success");
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
    if (action === "toggle-deployment-map") {
      state.deployment.mapCollapsed = !state.deployment.mapCollapsed;
      render();
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
        Sound?.playEffect?.("remove");
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
        Sound?.playEffect?.("undo");
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
        Sound?.playEffect?.("randomize");
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
        paragraphs: [`八个作战单位与 ${state.room.mapRules.decoyCount} 枚诱饵鱼雷都会撤回，清空后可以撤销。`],
        confirmLabel: "确认清空",
        danger: true,
        onConfirm: () => {
          pushDeploymentHistory();
          state.deployment.placements = [];
          state.deployment.dirty = true;
          state.deployment.selectedId = "destroyer-i";
          Sound?.playEffect?.("remove");
          render();
        },
      });
      return;
    }
    if (action === "ready-deployment") {
      openConfirm({
        title: "提交部署并准备？",
        paragraphs: ["服务器会再次验证完整部署。本方准备后地图只读；尚无其他玩家准备时仍可取消准备。"],
        confirmLabel: "提交并准备",
        onConfirm: submitAndReadyDeployment,
      });
      return;
    }
    if (action === "cancel-ready") {
      void emitRequest("deployment:cancel-ready", {
        expectedVersion: state.room.stateVersion,
      })
        .then(() => Sound?.playEffect?.("cancel"))
        .catch((error) => showToast(humanizeSocketError(error), "error"));
      return;
    }
    if (action === "leave-room") {
      openConfirm({
        title: state.room.roomPhase === "FINISHED" ? "离开本房间？" : "关闭并离开房间？",
        paragraphs: [
          state.room.roomPhase === "FINISHED"
            ? "离开后你的本机凭证失效；其余玩家将保留在房间并回到等待页。"
            : "对局开始前离开会关闭房间，当前房间玩家的部署不会保留。",
        ],
        confirmLabel: "确认离开",
        danger: true,
        onConfirm: leaveRoom,
      });
      return;
    }
    if (action === "roll-die") {
      void submitOpeningRoll();
      return;
    }
    if (action === "switch-map") {
      const mapId = control.dataset.map;
      state.battle.mobileMap = mapId;
      if (mapId === "own") {
        state.battle.ownMapAlert = false;
      } else if ((state.room?.turn?.remainingTargetPlayerIds ?? []).includes(mapId)) {
        saveMarkers();
        state.battle.targetPlayerId = mapId;
        state.battle.markerContext = null;
        state.battle.target = null;
        state.battle.actionId = null;
      }
      state.battle.actionDrawerOpen = false;
      state.battle.logOpen = false;
      render();
      return;
    }
    if (action === "toggle-battle-map") {
      const mapId = control.dataset.mapId;
      const mapIds = ["own", ...battleOpponentIds(state.room?.battle)];
      const currentlyCollapsed = Boolean(state.battle.collapsedMaps[mapId]);
      if (!currentlyCollapsed) {
        const expandedCount = mapIds.filter((id) => !state.battle.collapsedMaps[id]).length;
        if (expandedCount <= 1) {
          showToast("至少保留一张地图展开。", "info");
          return;
        }
      }
      state.battle.collapsedMaps[mapId] = !currentlyCollapsed;
      render();
      return;
    }
    if (action === "select-battle-target") {
      const playerId = control.dataset.targetPlayerId;
      if (state.room?.turn?.canAct && !isRemainingTurnTarget(state.room, playerId)) {
        showToast("该敌方玩家本回合已完成操作。", "info");
        return;
      }
      saveMarkers();
      state.battle.targetPlayerId = playerId;
      state.battle.mobileMap = playerId;
      state.battle.markerContext = null;
      state.battle.target = null;
      state.battle.actionId = null;
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
      const opening = !state.battle.actionDrawerOpen;
      state.battle.actionDrawerOpen = opening;
      if (opening) state.battle.logOpen = false;
      render();
      return;
    }
    if (action === "toggle-log") {
      const opening = !state.battle.logOpen;
      state.battle.logOpen = opening;
      if (opening) state.battle.actionDrawerOpen = false;
      render();
      return;
    }
    if (action === "close-battle-drawers") {
      state.battle.actionDrawerOpen = false;
      state.battle.logOpen = false;
      render();
      return;
    }
    if (action === "set-event-channel") {
      state.battle.eventChannel = control.dataset.channel ?? "combat";
      state.battle.logOpen = true;
      state.battle.actionDrawerOpen = false;
      render();
      return;
    }
    if (action === "set-tactical-layer") {
      const layer = control.dataset.layer;
      if (!["all", "surface", "underwater"].includes(layer)) return;
      state.battle.tacticalLayer = layer;
      render();
      return;
    }
    if (action === "set-helicopter-axis") {
      state.battle.helicopterAxis = control.dataset.axis;
      state.battle.target = null;
      state.battle.actionId = null;
      state.battle.actionDrawerOpen = false;
      render();
      return;
    }
    if (action === "enemy-cell") {
      if (Date.now() < suppressEnemyCellClickUntil) return;
      handleEnemyCell(control.dataset.coordinate, control.dataset.targetPlayerId);
      return;
    }
    if (action === "select-marker-tool" || action === "select-bridge-marker-tool") {
      const markerTarget = control.dataset.targetPlayerId;
      const marker = control.dataset.marker;
      if (!MARKER_CYCLE.includes(marker) || !markerTarget) return;
      if (markerTarget !== state.battle.targetPlayerId) {
        saveMarkers();
        state.battle.targetPlayerId = markerTarget;
        state.battle.mobileMap = markerTarget;
        state.battle.markerContext = null;
        prepareMarkerContext(state.room);
      }
      state.battle.selectedMarker = marker;
      state.battle.markerMode = true;
      state.battle.selectedAction = null;
      state.battle.target = null;
      state.battle.actionId = null;
      state.battle.helicopterAxis = null;
      render();
      return;
    }
    if (action === "toggle-marker-mode") {
      const markerTarget = control.dataset.targetPlayerId;
      if (markerTarget && markerTarget !== state.battle.targetPlayerId) {
        saveMarkers();
        state.battle.targetPlayerId = markerTarget;
        state.battle.mobileMap = markerTarget;
        state.battle.markerContext = null;
        prepareMarkerContext(state.room);
      }
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
      })
        .then(() => Sound?.playEffect?.("confirm"))
        .catch((error) => showToast(humanizeSocketError(error), "error"));
      return;
    }
    if (action === "cancel-rematch") {
      void emitRequest("rematch:cancel", {
        expectedVersion: state.room.stateVersion,
      })
        .then(() => Sound?.playEffect?.("cancel"))
        .catch((error) => showToast(humanizeSocketError(error), "error"));
      return;
    }
    if (action === "focus-replay") {
      const replay = document.querySelector("#match-replay");
      replay?.scrollIntoView({ behavior: state.reduceMotion ? "auto" : "smooth", block: "start" });
      replay?.focus({ preventScroll: true });
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

  document.addEventListener("contextmenu", (event) => {
    const control = event.target.closest?.('[data-action="enemy-cell"]');
    if (!control) return;
    if (Date.now() < suppressEnemyCellClickUntil) {
      event.preventDefault();
      return;
    }
    if (removePrivateMarker(control)) {
      const touchContextMenu = Boolean(markerLongPress) ||
        Boolean(event.sourceCapabilities?.firesTouchEvents);
      if (touchContextMenu) {
        suppressEnemyCellClickUntil = Date.now() + 800;
      }
      if (markerLongPress) {
        if (markerLongPress.timer) clearTimeout(markerLongPress.timer);
        markerLongPress.timer = null;
        markerLongPress.fired = true;
      }
      event.preventDefault();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse") return;
    const control = event.target.closest?.('[data-action="enemy-cell"][data-cell-state="private-marker"]');
    if (!control) return;
    if (markerLongPress?.timer) clearTimeout(markerLongPress.timer);
    const press = {
      control,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      fired: false,
      timer: null,
    };
    press.timer = window.setTimeout(() => {
      press.timer = null;
      if (markerLongPress !== press) return;
      if (removePrivateMarker(control)) {
        press.fired = true;
        suppressEnemyCellClickUntil = Date.now() + 800;
        navigator.vibrate?.(20);
      }
    }, 550);
    markerLongPress = press;
  });

  document.addEventListener("pointermove", (event) => {
    const press = markerLongPress;
    if (!press || press.pointerId !== event.pointerId || press.fired) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
      if (press.timer) clearTimeout(press.timer);
      markerLongPress = null;
    }
  });

  function finishMarkerLongPress(event) {
    const press = markerLongPress;
    if (!press || press.pointerId !== event.pointerId) return;
    if (press.timer) clearTimeout(press.timer);
    if (press.fired) event.preventDefault();
    markerLongPress = null;
  }

  document.addEventListener("pointerup", finishMarkerLongPress);
  document.addEventListener("pointercancel", finishMarkerLongPress);
  document.addEventListener("lostpointercapture", finishMarkerLongPress);

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

  let activeTacticalBoard = null;

  function clearTacticalHover(board = activeTacticalBoard) {
    if (!board) return;
    board.dataset.tacticalHover = "false";
    board.querySelectorAll(".board-cell--tactical-hover, .board-cell--tactical-near")
      .forEach((cell) => cell.classList.remove(
        "board-cell--tactical-hover",
        "board-cell--tactical-near",
      ));
    board.querySelectorAll(".board-axis--active")
      .forEach((axis) => axis.classList.remove("board-axis--active"));
    const readout = board.querySelector("[data-tactical-coordinate]");
    if (readout) readout.textContent = "—";
    if (activeTacticalBoard === board) activeTacticalBoard = null;
  }

  function updateTacticalHover(cell) {
    const board = cell?.closest?.(".board-frame--tactical-sea");
    const coordinate = cell?.dataset?.coordinate;
    const point = Data.parseCoordinate(coordinate);
    if (!board || !point) return;
    if (activeTacticalBoard && activeTacticalBoard !== board) {
      clearTacticalHover(activeTacticalBoard);
    }
    activeTacticalBoard = board;
    board.dataset.tacticalHover = "true";
    board.querySelectorAll(".board-cell--tactical-hover, .board-cell--tactical-near")
      .forEach((candidate) => candidate.classList.remove(
        "board-cell--tactical-hover",
        "board-cell--tactical-near",
      ));
    board.querySelectorAll(".board-cell[data-coordinate]").forEach((candidate) => {
      const candidatePoint = Data.parseCoordinate(candidate.dataset.coordinate);
      if (!candidatePoint) return;
      if (
        Math.abs(candidatePoint.row - point.row) <= 2 &&
        Math.abs(candidatePoint.column - point.column) <= 2
      ) {
        candidate.classList.add("board-cell--tactical-near");
      }
    });
    cell.classList.add("board-cell--tactical-hover");
    board.querySelectorAll(".board-axis--active")
      .forEach((axis) => axis.classList.remove("board-axis--active"));
    board.querySelector(`[data-axis-row="${Data.ROWS[point.row]}"]`)
      ?.classList.add("board-axis--active");
    board.querySelector(`[data-axis-column="${point.column + 1}"]`)
      ?.classList.add("board-axis--active");
    const readout = board.querySelector("[data-tactical-coordinate]");
    if (readout) readout.textContent = coordinate;
  }

  document.addEventListener("pointerover", (event) => {
    const cell = event.target.closest?.(".board-frame--tactical-sea .board-cell[data-coordinate]");
    if (cell) updateTacticalHover(cell);
  });

  document.addEventListener("pointerout", (event) => {
    const board = event.target.closest?.(".board-frame--tactical-sea");
    if (board && !board.contains(event.relatedTarget)) clearTacticalHover(board);
  });

  document.addEventListener("focusin", (event) => {
    const cell = event.target.closest?.(".board-frame--tactical-sea .board-cell[data-coordinate]");
    if (cell) updateTacticalHover(cell);
  });

  document.addEventListener("focusout", (event) => {
    const board = event.target.closest?.(".board-frame--tactical-sea");
    if (board && !board.contains(event.relatedTarget)) clearTacticalHover(board);
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
    if (
      event.key === "Escape" &&
      state.room?.roomPhase === "PLAYING" &&
      (state.battle.actionDrawerOpen || state.battle.logOpen)
    ) {
      event.preventDefault();
      state.battle.actionDrawerOpen = false;
      state.battle.logOpen = false;
      render();
      return;
    }
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
      Sound?.playEffect?.("ui_select");
      render();
    }
  });

  confirmCancel.addEventListener("click", cancelConfirm);
  confirmAccept.addEventListener("click", () => {
    Sound?.playEffect?.("confirm");
    void acceptConfirm();
  });
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
    showToast(successMessage, "success", 5_000, false);
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
    Data.configureMap(state.entry.mapSize);
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
  applyTheme(state.theme);
  applyAccent(state.accent);
  syncAudioControls();
  function resumeStoredMusicOnFirstGesture() {
    window.removeEventListener("pointerdown", resumeStoredMusicOnFirstGesture, true);
    window.removeEventListener("keydown", resumeStoredMusicOnFirstGesture, true);
    if (state.audio.musicEnabled) {
      void setMusicPreference(true);
    }
  }
  window.addEventListener("pointerdown", resumeStoredMusicOnFirstGesture, true);
  window.addEventListener("keydown", resumeStoredMusicOnFirstGesture, true);
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
