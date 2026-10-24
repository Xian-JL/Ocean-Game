  function emitRequest(eventName, payload = {}, options = {}) {
    if(eventName==="room:sync")state.suppressNextSync=true;
    if(state.training?.active && state.training.session)return trainingEmit(eventName,payload);
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
    state.battle.commandNotice = "";
    state.battle.awaitingSync = false;
    state.battle.selectedAction = null;
    state.battle.target = null;
    state.battle.actionId = null;
    state.battle.helicopterAxis = null;
    state.battle.markerMode = false;
  }

  function scheduleFeedbackCollapse(resolutionStateKey) {
    window.clearTimeout(state.battle.feedbackCollapseTimer);
    state.battle.feedbackCollapsed = false;
    state.battle.feedbackCollapseTimer = window.setTimeout(() => {
      if (state.battle.lastResolutionKey !== resolutionStateKey) return;
      state.battle.feedbackCollapsed = true;
      render();
    }, 4_500);
  }

  function emptyOwnEffectCells() {
    return {
      hit: new Set(),
      sunk: new Set(),
      paralyzed: new Set(),
      decoy: new Set(),
    };
  }

  function computeOwnEffectCells(previousRoom, nextRoom) {
    const changes = emptyOwnEffectCells();
    if (
      !previousRoom?.battle?.own ||
      !nextRoom?.battle?.own ||
      previousRoom.roomCode !== nextRoom.roomCode ||
      previousRoom.matchSummary?.startedAt !== nextRoom.matchSummary?.startedAt
    ) {
      return changes;
    }
    const previousUnits = new Map(
      (previousRoom.battle.own.units ?? []).map((unit) => [unit.id, unit]),
    );
    for (const unit of nextRoom.battle.own.units ?? []) {
      const previousUnit = previousUnits.get(unit.id);
      if (!previousUnit) continue;
      const previousHits = new Set(previousUnit.hitCells ?? []);
      const newHits = (unit.hitCells ?? []).filter((cell) => !previousHits.has(cell));
      newHits.forEach((cell) => changes.hit.add(cell));
      if (unit.hp <= 0 && previousUnit.hp > 0) {
        (unit.cells ?? []).forEach((cell) => changes.sunk.add(cell));
      } else if (unit.paralyzed && !previousUnit.paralyzed) {
        (unit.cells ?? []).forEach((cell) => changes.paralyzed.add(cell));
      } else if (unit.hp < previousUnit.hp && newHits.length === 0 && unit.cells?.[0]) {
        changes.hit.add(unit.cells[0]);
      }
    }
    const previousDecoys = new Map(
      (previousRoom.battle.own.decoys ?? []).map((decoy) => [decoy.id, decoy]),
    );
    for (const decoy of nextRoom.battle.own.decoys ?? []) {
      const previousDecoy = previousDecoys.get(decoy.id);
      if (decoy.destroyed && previousDecoy && !previousDecoy.destroyed && decoy.cell) {
        changes.decoy.add(decoy.cell);
      }
    }
    return changes;
  }

  function scheduleResolutionEffectHide(resolutionStateKey) {
    window.clearTimeout(state.battle.resolutionEffectTimer);
    state.battle.resolutionEffectKey = resolutionStateKey;
    state.battle.resolutionEffectVisible = startMotion(resolutionStateKey);
    state.battle.resolutionEffectTimer = window.setTimeout(() => {
      if (state.battle.resolutionEffectKey !== resolutionStateKey) return;
      state.battle.resolutionEffectVisible = false;
      render();
    }, 1_800);
  }

  function closeConfirmSilently() {
    state.confirm = null;
    if (confirmDialog.open) confirmDialog.close();
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
        const unit = Data.getUnitDefinitionById(event.unitId) ?? Data.getUnitDefinitionByType(event.unitType);
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
    if(state.training?.active && !state.training.applying)return;
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
    const freshMotion = Boolean(previous && !motionRuntime.hidden && !state.suppressMotion && !state.suppressNextSync && previous.roomCode===nextRoom.roomCode && previous.own.playerId===nextRoom.own.playerId && previous.matchSummary?.startedAt===nextRoom.matchSummary?.startedAt);
    state.suppressNextSync=false;
    if(!freshMotion){ state.battle.lastResolutionKey=resolutionKey(nextRoom); cancelMotion(); }
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
      state.battle.expandedUnitCards.clear();
      state.battle.lastResolutionKey = null;
      state.battle.feedbackCollapsed = false;
      window.clearTimeout(state.battle.feedbackCollapseTimer);
      state.battle.feedbackCollapseTimer = null;
      state.battle.resolutionEffectKey = null;
      state.battle.resolutionEffectVisible = false;
      state.battle.resolutionEffectMapId = null;
      state.battle.unreadResultPlayerIds.clear();
      state.battle.viewedResolutionByPlayer.clear();
      state.battle.mapViewPositions.clear();
      state.battle.ownEffectCells = emptyOwnEffectCells();
      window.clearTimeout(state.battle.resolutionEffectTimer);
      state.battle.resolutionEffectTimer = null;
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
    const actionConfirmInvalidated =
      state.confirm?.kind === "battle-action" &&
      (nextRoom.roomPhase !== "PLAYING" ||
        !nextRoom.turn?.canAct ||
        (previousTurn !== undefined && previousTurn !== nextRoom.turn?.turnNumber) ||
        pendingActionResolved);
    if (actionConfirmInvalidated) {
      closeConfirmSilently();
    }
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

    queueUiMotion(previous,nextRoom,freshMotion);
    state.room = nextRoom;
    if (
      freshMotion && nextRoom.turn?.canAct &&
      (!previous?.turn?.canAct || previous?.turn?.turnNumber !== nextRoom.turn.turnNumber)
    ) {
      Sound?.playEffect?.("turn");
    }
    if(freshMotion && nextRoom.roomPhase==='FINISHED')cancelMotion(true);
    if (enteredPause) {
      Sound?.playEffect?.("pause");
    }
    if (resumedFromPause) {
      Sound?.playEffect?.("reconnect");
      const remaining = nextRoom.deadlines?.actionDeadlineAt
        ? Model.remainingSeconds(nextRoom.deadlines.actionDeadlineAt, nextRoom.serverNow)
        : null;
      const turnText = nextRoom.turn?.canAct
        ? "仍是你的回合"
        : `当前由 ${Model.nicknameFor(nextRoom, nextRoom.turn?.currentPlayerId)} 行动`;
      const targetText = state.battle.target
        ? `，已保留目标 ${Model.formatTarget(state.battle.target)}`
        : "";
      showToast(`连接已恢复，对局继续。${turnText}${remaining === null ? "" : `，剩余 ${formatCountdown(remaining)}`}${targetText}。`, "success", 5_000, false);
    }
    for (const playerId of newlyEliminated) {
      Sound?.playEffect?.("eliminated");
      showToast(`${Model.nicknameFor(nextRoom, playerId)} 已淘汰`, "warning", 4_500, false);
    }
    const opponentIds = battleOpponentIds(nextRoom.battle);
    for(const id of state.battle.identityTones.keys())if(!opponentIds.includes(id))state.battle.identityTones.delete(id);
    const activeTargets = activeBattleOpponentIds(nextRoom);
    if (!opponentIds.includes(state.battle.targetPlayerId)) {
      state.battle.targetPlayerId = activeTargets[0] ?? opponentIds[0] ?? null;
    } else if (state.battle.selectedAction && !activeTargets.includes(state.battle.targetPlayerId)) {
      state.battle.targetPlayerId = activeTargets[0] ?? null;
    }
    const visibleBattleMaps = ["own", ...opponentIds];
    if (!visibleBattleMaps.includes(state.battle.mobileMap)) {
      state.battle.mobileMap = state.battle.targetPlayerId ?? "own";
    }
    document.title = nextRoom.turn?.canAct
      ? "轮到你行动 · 海战 OCEAN"
      : "海战 OCEAN";
    state.clockOffsetMs = Date.now() - nextRoom.serverNow;
    prepareMarkerContext(nextRoom);
    warmBattleArt(nextRoom);

    if (
      nextResolutionKey &&
      nextResolutionKey !== state.battle.lastResolutionKey
    ) {
      state.battle.ownEffectCells = computeOwnEffectCells(previous, nextRoom);
      const feedback = nextRoom.latestResolution?.feedback;
      const defenderIds = feedback?.defenderIds ?? [feedback?.defenderId].filter(Boolean);
      if (feedback?.actorId === nextRoom.own.playerId) {
        const viewedEnemyId = defenderIds.includes(state.battle.mobileMap)
          ? state.battle.mobileMap
          : null;
        state.battle.resolutionEffectMapId = viewedEnemyId;
        state.battle.unreadResultPlayerIds = new Set(
          defenderIds.filter((playerId) => playerId !== viewedEnemyId),
        );
        if (viewedEnemyId) {
          state.battle.viewedResolutionByPlayer.set(viewedEnemyId, nextResolutionKey);
        }
      } else {
        state.battle.resolutionEffectMapId = defenderIds.includes(nextRoom.own.playerId)
          ? "own"
          : null;
        state.battle.unreadResultPlayerIds.clear();
      }
      if(nextRoom.roomPhase!=='FINISHED')scheduleResolutionEffectHide(nextResolutionKey);
      if (
        feedback?.actorId !== nextRoom.own.playerId &&
        state.battle.mobileMap !== "own"
      ) {
        state.battle.ownMapAlert = true;
      }
      const description = describeLatestResolution(nextRoom);
      if (description && freshMotion) {
        showToast(description, resolutionVisualState(nextRoom), 7_000, false);
        if(nextRoom.roomPhase!=='FINISHED')Sound?.playEffect?.(ACTION_EFFECTS[feedback.actionType] ?? 'confirm');
      }
      state.battle.lastResolutionKey = nextResolutionKey;
      scheduleFeedbackCollapse(nextResolutionKey);
    }

    if (nextRoom.roomPhase === "CLOSED") {
      clearStoredSession();
    }
    if (!state.replayPlayerId && nextRoom.roomPhase === "FINISHED") {
      state.replayPlayerId = nextRoom.own.playerId;
    }

    settleStateWaiters();
    if (state.connected) {
      setConnectionPhase("online", "服务器状态已校准。", "online", "服务器在线");
    }
    render();
  }

  function getOwnSeat(room = state.room) {
    return room?.seats?.find((seat) => seat.playerId === room.own.playerId) ?? null;
  }

  function getServerNow() {
    if(state.training?.session && state.training.task)return state.training.task.clock+(state.training.task.running?Date.now()-state.training.syncedAt:0);
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
    const execute = document.querySelector('[data-action="execute-command"]');
    if (execute) execute.disabled = !commandIsValid();
    document.querySelectorAll("[data-deadline]").forEach((element) => {
      const deadline = Number(element.dataset.deadline);
      const seconds = Model.remainingSeconds(deadline, serverNow);
      element.textContent = formatCountdown(seconds);
      element.dataset.tone = Model.countdownTone(seconds);
    });
  }

  function render() {
    const viewMemory = captureViewMemory();
    headerRoomCode.hidden = !state.room?.roomCode && !state.tutorial.active;
    headerRoomCode.textContent = state.training?.session ? "训练营 · 核心战斗" : state.tutorial.active
      ? "交互教程 · 本地训练"
      : state.room?.roomCode
      ? `${state.room.roomCode} · ${state.room.maxPlayers ?? 2}P · ${state.room.mapSize ?? 12}×${state.room.mapSize ?? 12}${state.room.roomMode === "bot_duel" ? ` · ${botDifficultyLabel(state.room.botDifficulty)} AI` : ""}`
      : "";
    const page = state.tutorial.active ? "T01" : state.training?.active && !state.room ? "TCAMP" : Model.pageForState(state.room);
    const samePage = state.renderedPage === page;
    if (page === "P05" && samePage) rememberBattleMapView();
    try {
      if (page === "TCAMP") {
        app.innerHTML=renderTrainingCatalog();
      } else if (page === "T01") {
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
      if(state.training?.active && state.room && !state.tutorial.active)app.insertAdjacentHTML("afterbegin",renderTrainingTask());
      document.body.dataset.training=String(Boolean(state.training?.active));
      state.renderedPage = page;
      document.body.dataset.page = page;
      hydrateInterface(samePage ? viewMemory : null);
      if (page === "P05") restoreBattleMapView();
      if (!samePage) {
        const scrollingElement = document.scrollingElement ?? document.documentElement;
        scrollingElement.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        app.scrollTop = 0;
      }
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
    synchronizeOverlayFocus(viewMemory);
    updateCountdowns();
    hydrateTrainingHeight();
    reconcileMotion();
  }
