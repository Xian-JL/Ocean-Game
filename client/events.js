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
    if(action.startsWith("training-")){void handleTrainingAction(action,control);return;}
    const controlEffect = controlEffectName(action, control);
    if (controlEffect) Sound?.playEffect?.(controlEffect);


    if (action === 'execute-command') { void submitSelectedAction(); return; }
    if (action === 'sync-command') {
      void emitRequest('room:sync',{}).then(response => {
        if(response.view) acceptRoomState(response.view);
        state.battle.awaitingSync=false;
        state.battle.commandNotice='状态已同步，请确认当前目标。';
        render();
      }).catch(error=>showToast(humanizeSocketError(error),'error'));
      return;
    }
    if (action === 'open-battle-menu') { document.querySelector('#battle-menu-dialog').showModal(); return; }
    if (action === 'close-battle-menu') { document.querySelector('#battle-menu-dialog').close(); return; }
    if (action === 'toggle-fleet') {
      state.battle.fleetOpen=!state.battle.fleetOpen;
      state.battle.actionDrawerOpen=false;state.battle.logOpen=false;render();return;
    }
    if (action === 'erase-marker-tool') {
      state.battle.eraseMarker=true;state.battle.markerMode=true;render();return;
    }
    if (action === 'confirm-final-salvo') {
      if (state.pendingRequest || !state.battle.finalDecoyId) return;
      void submitFinalSalvo(state.battle.finalDecoyId);return;
    }
    if (['open-rules','open-audio-settings','open-personalize','surrender','surrender-and-leave'].includes(action)) document.querySelector('#battle-menu-dialog')?.close();
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
      if(personalizeDialog.open)personalizeDialog.close();
      if(rulesDialog.open) rulesDialog.close();
      openAudioSettings(control.dataset.audioFocus);
      return;
    }
    if (action === "close-audio-settings") {
      audioDialog.close();
      return;
    }
    if (action === "open-rules") {
      if(personalizeDialog.open)personalizeDialog.close();
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
      if(rulesDialog.open) rulesDialog.close();
      openPersonalize();
      return;
    }
    if (action === "close-personalize") {
      personalizeDialog.close();
      return;
    }
    if(action === "toggle-map-zoom"){changeMapZoom();return;}
    if(action === "inspect-action"){showWeaponDetails(control.dataset.actionType);return;}
    if(action === "close-weapon-details"){document.querySelector("#weapon-details-dialog").close();return;}
    if (action === "home-tab") { if(state.tutorial.active)exitTutorial();else if(state.training?.active){void exitTrainingSession();state.training.active=false;history.replaceState(null,"","/");render();}return; }
    if (action === "select-theme") {
      applyTheme(control.dataset.themeValue);
      return;
    }
    if (action === "armory-preference") { applyArmoryPreference(control.dataset.preference,control.dataset.value);return; }
    if (action === "select-accent") {
      applyAccent(control.dataset.accentValue);
      return;
    }
    if (action === "select-quality-mode") {
      applyQualityMode(control.dataset.qualityMode);
      render();
      return;
    }
    if (action === "reset-personalization") {
      applyTheme("armory-ember");
      applyAccent();
      applyArmoryPreference("crest","keel");applyArmoryPreference("density","comfortable");applyArmoryPreference("textSize","default");
      applyQualityMode("auto");
      showToast("已恢复炉火、龙骨战徽、舒适密度、默认字号与自动画质。", "success");
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
      rememberBattleMapView();
      state.battle.mobileMap = mapId;
      if (mapId === "own") {
        state.battle.ownMapAlert = false;
      } else {
        state.battle.unreadResultPlayerIds.delete(mapId);
        if (state.battle.lastResolutionKey) {
          state.battle.viewedResolutionByPlayer.set(mapId, state.battle.lastResolutionKey);
        }
      }
      if (
        mapId !== "own" &&
        activeBattleOpponentIds(state.room).includes(mapId) &&
        (state.room?.turn?.remainingTargetPlayerIds ?? []).includes(mapId)
      ) {
        const preserveSharedTarget = isSimultaneousThreePlayerSelection(state.room);
        saveMarkers();
        state.battle.targetPlayerId = mapId;
        state.battle.markerContext = null;
        if (!preserveSharedTarget) {
          state.battle.target = null;
          state.battle.actionId = null;
        }
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
      if (!activeBattleOpponentIds(state.room).includes(playerId)) {
        showToast("该玩家已淘汰，地图仅供查看历史记录。", "info");
        return;
      }
      if (state.room?.turn?.canAct && !isRemainingTurnTarget(state.room, playerId)) {
        showToast("该敌方玩家本回合已完成操作。", "info");
        return;
      }
      saveMarkers();
      state.battle.targetPlayerId = playerId;
      state.battle.mobileMap = playerId;
      state.battle.markerContext = null;
      if (!isSimultaneousThreePlayerSelection(state.room)) {
        state.battle.target = null;
        state.battle.actionId = null;
      }
      render();
      return;
    }
    if (action === "select-action") {
      selectAction(control.dataset.actionType);
      return;
    }
    if (action === "toggle-unit-card") {
      const sourceType = control.dataset.sourceType;
      if (!sourceType) return;
      if (state.battle.expandedUnitCards.has(sourceType)) {
        state.battle.expandedUnitCards.delete(sourceType);
      } else {
        state.battle.expandedUnitCards.add(sourceType);
      }
      render();
      return;
    }
    if (action === "toggle-feedback") {
      state.battle.feedbackCollapsed = !state.battle.feedbackCollapsed;
      window.clearTimeout(state.battle.feedbackCollapseTimer);
      state.battle.feedbackCollapseTimer = null;
      render();
      return;
    }
    if (action === "submit-final-salvo") {
      state.battle.finalDecoyId = control.dataset.decoyId;
      render();
      return;
    }
    if (action === "toggle-action-drawer") {
      state.battle.fleetOpen = false;
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
      state.battle.fleetOpen = false;
      state.battle.actionDrawerOpen = false;
      state.battle.logOpen = false;
      render();
      return;
    }
    if (action === "set-event-channel") {
      state.battle.fleetOpen = false;
      state.battle.eventChannel = control.dataset.channel ?? "combat";
      state.battle.logOpen = true;
      state.battle.actionDrawerOpen = false;
      render();
      return;
    }
    if (action === "set-tactical-layer") {
      changeTacticalLayer(control.dataset.layer);
      return;
    }
    if (action === "cycle-tactical-layer") {
      const layers = ["all", "surface", "underwater"];
      changeTacticalLayer(layers[(layers.indexOf(state.battle.tacticalLayer) + 1) % layers.length]);
      return;
    }
    if (action === "focus-selected-target") {
      if (state.battle.targetPlayerId) { state.battle.mobileMap=state.battle.targetPlayerId; render(); }
      centerBattleMap(targetFocusCoordinate());
      return;
    }
    if (action === "center-battle-map") {
      centerBattleMap();
      return;
    }
    if (action === "set-helicopter-axis") {
      state.battle.helicopterAxis = control.dataset.axis;
      state.battle.actionDrawerOpen = false;
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
      if (!activeBattleOpponentIds(state.room).includes(markerTarget)) {
        showToast("已淘汰玩家的历史标记保持只读。", "info");
        return;
      }
      if (markerTarget !== state.battle.targetPlayerId) {
        saveMarkers();
        state.battle.targetPlayerId = markerTarget;
        state.battle.mobileMap = markerTarget;
        state.battle.markerContext = null;
        prepareMarkerContext(state.room);
      }
      state.battle.eraseMarker = false;
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
      if (markerTarget && !activeBattleOpponentIds(state.room).includes(markerTarget)) {
        showToast("已淘汰玩家的历史标记保持只读。", "info");
        return;
      }
      if (markerTarget && markerTarget !== state.battle.targetPlayerId) {
        saveMarkers();
        state.battle.targetPlayerId = markerTarget;
        state.battle.mobileMap = markerTarget;
        state.battle.markerContext = null;
        prepareMarkerContext(state.room);
      }
      state.battle.markerMode = !state.battle.markerMode;
      state.battle.eraseMarker = false;
      if(state.battle.markerMode && state.battle.targetPlayerId) state.battle.mobileMap=state.battle.targetPlayerId;
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
      if(state.training?.session)void trainingControl("replay-inspect");
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
