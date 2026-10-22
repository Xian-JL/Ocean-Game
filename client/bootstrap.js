  function returnHome() {
    if(state.training?.active){void exitTrainingSession();return;}
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

  setReduceMotion(readBooleanPreference(MOTION_STORAGE_KEY),false);
  document.documentElement.dataset.reduceMotion = state.reduceMotion
    ? "true"
    : "false";
  reduceMotionToggle.checked = state.reduceMotion;
  applyTheme(state.theme);
  applyAccent(state.accent);
  applyQualityMode(state.qualityMode);
  syncAudioControls();
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.addEventListener?.("change",()=>{setReduceMotion(readBooleanPreference(MOTION_STORAGE_KEY),false);render();});
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
    if (!state.training?.active && state.room && !["CLOSED", "FINISHED"].includes(state.room.roomPhase)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("resize", () => {
    if (state.renderedPage !== "P05") return;
    rememberBattleMapView();
    window.clearTimeout(viewportRestoreTimer);
    viewportRestoreTimer = window.setTimeout(() => {
      if (state.qualityMode === "auto") applyQualityMode("auto");
      render();
    }, 120);
  });
  window.addEventListener("orientationchange", () => {
    rememberBattleMapView();
    window.clearTimeout(viewportRestoreTimer);
    viewportRestoreTimer = window.setTimeout(() => render(), 220);
  });
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      state.socket?.connected &&
      state.room
    ) {
      setConnectionPhase(
        "syncing",
        "页面已回到前台，正在校准服务器回合与剩余时间。",
        "warning",
        "正在同步",
      );
      render();
      void emitRequest("room:sync", {}).then((response) => {
        if (response.view) acceptRoomState(response.view);
      }).catch(() => {
        setConnectionPhase("reconnecting", "同步暂未完成，客户端会继续重试。", "warning", "同步延迟");
        render();
      });
    }
  });
  window.setInterval(updateCountdowns, 250);
  render();
  connectSocket();
  if(location.pathname.startsWith("/training"))void enterTraining();
