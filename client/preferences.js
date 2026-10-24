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
      if(state.training?.active){state.training.active=false;history.replaceState(null,"","/");}
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
    if(state.training?.session)return ["training",state.training.session.id,state.training.session.generation,playerId,targetPlayerId].join(":");
    return `${MARKER_STORAGE_PREFIX}:${roomCode}:${playerId}:${targetPlayerId}`;
  }

  function readMarkers(roomCode, playerId, targetPlayerId = "default") {
    if(state.training?.session)return new Map(state.training.markerStore?.get(markerStorageKey(roomCode,playerId,targetPlayerId))??[]);
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
    if(state.training?.session){const c=state.battle.markerContext;if(c){state.training.markerStore??=new Map();state.training.markerStore.set(markerStorageKey(c.roomCode,c.playerId,c.targetPlayerId),[...state.battle.markers.entries()]);}return;}
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
    if(state.training?.session){state.training.markerStore=new Map();return;}
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

  function setReduceMotion(enabled, persist = true) {
    state.reduceMotion = Boolean(enabled || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    document.documentElement.dataset.reduceMotion = state.reduceMotion ? "true" : "false";
    reduceMotionToggle.checked = state.reduceMotion;
    let motionNote=document.querySelector('#system-motion-note');
    if(!motionNote){motionNote=document.createElement('small');motionNote.id='system-motion-note';reduceMotionToggle.parentElement.append(motionNote);}
    motionNote.textContent=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?'系统已启用减少动画，当前使用静态反馈。':'';
    if(state.reduceMotion) cancelMotion();
    if(persist) writeBooleanPreference(MOTION_STORAGE_KEY, Boolean(enabled));
    if (state.qualityMode === "auto") applyQualityMode("auto");
  }

  function resolveAutomaticQuality() {
    const reduced = state.reduceMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const memory = Number(navigator.deviceMemory ?? 8);
    const cores = Number(navigator.hardwareConcurrency ?? 8);
    const compactViewport = Math.min(window.innerWidth || 1280, window.innerHeight || 720) < 700;
    return motionRuntime.autoDegraded || reduced || memory <= 4 || cores <= 4 || compactViewport ? "smooth" : "high";
  }

  function applyQualityMode(mode) {
    if (!["auto", "high", "smooth"].includes(mode)) mode = "auto";
    state.qualityMode = mode;
    state.effectiveQuality = mode === "auto" ? resolveAutomaticQuality() : mode;
    document.documentElement.dataset.qualityMode = mode;
    document.documentElement.dataset.quality = state.effectiveQuality;
    writeStringPreference(QUALITY_STORAGE_KEY, mode);
    syncPersonalizeControls();
    warmBattleArt(state.room);
  }

  const THEME_OPTIONS = Object.freeze({"armory-ember":"炉火","armory-cast":"冷铸","armory-ivory":"铸白"});
  const LEGACY_THEMES = {"ocean-dark":"armory-ember","ocean-dusk":"armory-ember","ocean-light":"armory-ivory"};
  function applyTheme(theme) {
    if(LEGACY_THEMES[theme]) {
      const oldAccent=readStringPreference(ACCENT_STORAGE_KEY,"cyan");
      theme=theme==="ocean-light"?"armory-ivory":["cyan","jade","violet"].includes(oldAccent)?"armory-cast":"armory-ember";
    }
    if(!Object.hasOwn(THEME_OPTIONS,theme))theme="armory-ember";
    state.theme=theme;document.documentElement.dataset.theme=theme;
    writeStringPreference(THEME_STORAGE_KEY,theme);syncPersonalizeControls();
  }
  function applyAccent() {
    for(const key of ["--accent-primary","--accent-strong","--accent-soft","--accent-primary-rgb"])document.documentElement.style.removeProperty(key);
    for(const [kind,allowed,fallback] of [["crest",["keel","wave","anchor"],"keel"],["density",["comfortable","compact"],"comfortable"],["textSize",["default","large"],"default"]]){
      const value=readStringPreference("ocean.ui2."+kind,fallback);document.documentElement.dataset[kind]=allowed.includes(value)?value:fallback;
    }
    syncPersonalizeControls();
  }
  function applyArmoryPreference(kind,value){
    const allowed={crest:["keel","wave","anchor"],density:["comfortable","compact"],textSize:["default","large"]};
    if(!allowed[kind]?.includes(value))return;
    writeStringPreference("ocean.ui2."+kind,value);document.documentElement.dataset[kind]=value;
    syncPersonalizeControls();cancelMotion();render();
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
    const qualityControls = personalizeDialog.querySelectorAll(
      '[data-action="select-quality-mode"]',
    );
    for (const control of qualityControls) {
      const active = control.dataset.qualityMode === state.qualityMode;
      control.classList.toggle("is-active", active);
      control.setAttribute("aria-checked", String(active));
      const detail = control.querySelector("small");
      if (detail && control.dataset.qualityMode === "auto") {
        detail.textContent = `当前：${state.effectiveQuality === "smooth" ? "流畅" : "高画质"}`;
      }
    }
    for(const control of personalizeDialog.querySelectorAll('[data-action="armory-preference"]')){
      const active=document.documentElement.dataset[control.dataset.preference]===control.dataset.value;
      control.classList.toggle("is-active",active);control.setAttribute("aria-checked",String(active));
    }
    updateChoiceSemantics();
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
    if(state.training?.session && state.renderedPage==="P03" && kind==="warning"){state.training.localEvents??=[];state.training.localEvents.push({action:"deployment-rejected",message:String(message)});}
    const meta = toastPresentation(kind);
    const mirroredBattle = state.renderedPage === "P05" && ["hit", "miss", "unknown", "private", "result"].includes(kind);
    const toast = document.createElement("div");
    toast.className = `toast toast--${kind}${mirroredBattle ? " toast--mirrored" : ""}`;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");
    toast.setAttribute("tabindex", mirroredBattle ? "-1" : "0");
    toast.setAttribute("aria-label", `${meta.title}：${message}${mirroredBattle ? "" : "。点击关闭"}`);
    toast.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${uiIcon(meta.icon)}</span>
      <div class="toast__content"><strong>${escapeHtml(meta.title)}</strong><p>${escapeHtml(message)}</p></div>
      <button class="toast__close" type="button" aria-label="关闭这条播报">×</button>`;
    if (mirroredBattle) toast.querySelector("button").hidden = true;
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
