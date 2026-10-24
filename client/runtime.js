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
  const QUALITY_STORAGE_KEY = "ocean.quality.v1";
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
    "cycle-tactical-layer": "map_switch",
    "set-helicopter-axis": "ui_select",
    "select-marker-tool": "ui_select",
    "select-bridge-marker-tool": "ui_select",
    "toggle-marker-mode": "ui_select",
    "cancel-action-selection": "cancel",
    "reopen-action-confirm": "panel_open",
    "center-battle-map": "map_switch",
    "focus-selected-target": "map_switch",
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
    "select-quality-mode": "ui_select",
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
      identityTones: new Map(),
      actionDrawerOpen: false,
      fleetOpen: false,
      commandNotice: "",
      eraseMarker: false,
      finalDecoyId: null,
      logOpen: false,
      eventChannel: "combat",
      tacticalLayer: "all",
      tacticalLayerTransition: null,
      ownMapAlert: false,
      collapsedMaps: {},
      selectedIntelligenceSequence: null,
      lastResolutionKey: null,
      feedbackCollapsed: false,
      feedbackCollapseTimer: null,
      expandedUnitCards: new Set(),
      resolutionEffectKey: null,
      resolutionEffectVisible: false,
      resolutionEffectTimer: null,
      resolutionEffectMapId: null,
      unreadResultPlayerIds: new Set(),
      viewedResolutionByPlayer: new Map(),
      mapViewPositions: new Map(),
      ownEffectCells: {
        hit: new Set(),
        sunk: new Set(),
        paralyzed: new Set(),
        decoy: new Set(),
      },
    },
    replayPlayerId: null,
    reduceMotion: readBooleanPreference(MOTION_STORAGE_KEY),
    theme: readStringPreference(THEME_STORAGE_KEY, "armory-ember"),
    accent: readStringPreference(ACCENT_STORAGE_KEY, "cyan"),
    qualityMode: readStringPreference(QUALITY_STORAGE_KEY, "auto"),
    effectiveQuality: "high",
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
  let mapPanGesture = null;
  let suppressEnemyCellClickUntil = 0;
  let viewportRestoreTimer = null;
  let tacticalLayerTransitionTimer = null;
  const preloadedArtAssets = new Set();
