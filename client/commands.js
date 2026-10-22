  function openConfirm(options) {
    state.confirm = {
      onConfirm: options.onConfirm,
      onCancel: options.onCancel ?? null,
      kind: options.kind ?? "generic",
      roomCode: state.room?.roomCode ?? null,
      stateVersion: state.room?.stateVersion ?? null,
      turnNumber: state.room?.turn?.turnNumber ?? null,
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
    if (options.deadline) {
      const countdown = document.createElement("p");
      countdown.className = "confirm-turn-countdown";
      countdown.append("本回合剩余：");
      const value = document.createElement("strong");
      value.dataset.deadline = String(options.deadline);
      value.textContent = formatCountdown(Model.remainingSeconds(options.deadline, getServerNow()));
      countdown.append(value);
      confirmBody.append(countdown);
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
    const confirmation=state.confirm;
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
      if(state.confirm!==confirmation)return;
      state.confirm = null;
      if (confirmDialog.open) confirmDialog.close();
    } catch (error) {
      if(state.confirm!==confirmation)return;
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
    const activeTargets = activeBattleOpponentIds(state.room);
    const simultaneousAction =
      state.room.maxPlayers === 3 &&
      activeTargets.length > 1;
    const paragraphs = [
      `目标：${Model.formatTarget(target)}`,
      ...(simultaneousAction
        ? [`敌方玩家：${activeTargets.map((playerId) => Model.nicknameFor(state.room, playerId)).join("、")}（同时生效）· 使用同一目标或范围`]
        : battleOpponentIds(state.room.battle).length > 1
        ? [`敌方玩家：${Model.nicknameFor(state.room, activeTargets[0] ?? state.battle.targetPlayerId)}（当前唯一有效目标）`]
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
      kind: "battle-action",
      deadline: state.room.deadlines?.actionDeadlineAt,
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
    const requestGeneration=state.training?.session?.generation??null;
    if (state.pendingRequest) return;
    if (!commandIsValid()) { showToast('当前指令已失效，请同步状态后重新选择。','warning'); return; }
    const room = state.room;
    const definition = Data.getActionDefinition(state.battle.selectedAction);
    const source = room.battle.own.units.find(unit => unit.type === definition.sourceType && unit.hp > 0 && !unit.paralyzed);
    const actionId = state.battle.actionId || createActionId();
    state.battle.actionId = actionId;
    const expectedVersion = room.stateVersion;
    const intent = {actionId, actionType:definition.type, sourceId:source.id, targetPlayerId:state.battle.targetPlayerId, target:clone(state.battle.target)};
    state.pendingRequest = 'action';
    state.battle.commandNotice = '';
    render();
    try {
      const response = await emitRequest('action:submit',{expectedVersion,intent});
      // Accepted safe resolution owns the action sound, not the request ACK.
      await ensureStateVersion(response.stateVersion);
      clearBattleDraft();
    } catch (error) {
      if(requestGeneration!==(state.training?.session?.generation??null))return;
      if (['REQUEST_TIMEOUT','STATE_VERSION_CONFLICT'].includes(error.code)) {
        state.battle.awaitingSync = true;
        state.battle.commandNotice = '正在确认执行结果，请勿重复下达新指令。';
        try {
          const response = await emitRequest('room:sync',{});
          if (response.view) acceptRoomState(response.view);
          state.battle.awaitingSync = false;
          if (state.room?.latestResolution?.feedback?.actionId === actionId) {
            clearBattleDraft();
            showToast('行动已由服务器执行，状态已恢复。','success');
          } else if (state.room?.stateVersion === expectedVersion && state.room?.turn?.canAct) {
            state.battle.actionId = actionId;
            state.battle.commandNotice = '状态已同步。可确认重试同一指令，不会重复结算。';
          } else {
            clearBattleDraft();
            state.battle.commandNotice = '状态已更新，请重新选择并确认目标。';
          }
        } catch (_) {
          state.battle.commandNotice = '执行结果尚未确认。请先同步对局。';
        }
      } else {
        state.battle.commandNotice = humanizeSocketError(error);
        showToast(state.battle.commandNotice,'error',8000);
      }
    } finally {
      if(requestGeneration!==(state.training?.session?.generation??null))return;
      state.pendingRequest = null;
      render();
    }
  }

  function commandIsValid() {
    const room = state.room;
    const definition = Data.getActionDefinition(state.battle.selectedAction);
    if (!room || room.roomPhase !== 'PLAYING' || !room.turn?.canAct || !state.connected || state.connection.phase !== 'online' || state.pendingRequest || state.battle.awaitingSync || !definition || !state.battle.target || state.battle.markerMode) return false;
    if (room.deadlines?.actionDeadlineAt && getServerNow() >= room.deadlines.actionDeadlineAt) return false;
    if (!Model.deriveActionStatus(room,definition).enabled || !activeBattleOpponentIds(room).includes(state.battle.targetPlayerId)) return false;
    const own = {...room.battle.own, enemyMap:enemyMapFor(room.battle.own,state.battle.targetPlayerId)};
    return Data.getTargetOptions(definition.type,own).some(target=>Data.targetKey(target)===Data.targetKey(state.battle.target));
  }

  async function submitFinalSalvo(decoyId) {
    const requestGeneration=state.training?.session?.generation??null;
    const room = state.room;
    if (room?.roomPhase !== "FINAL_SALVO" || !decoyId || state.pendingRequest || room.battle?.match?.finalSalvo?.ownSubmitted || !room.battle?.match?.finalSalvo?.availableDecoyIds?.includes(decoyId)) return;
    state.pendingRequest = "final-salvo";
    render();
    try {
      const response = await emitRequest("final-salvo:submit", {
        expectedVersion: room.stateVersion,
        decoyId,
      });
      // Simultaneous resolution, rather than local secret selection, owns the salvo cue.
      await ensureStateVersion(response.stateVersion);
    } catch (error) {
      if(requestGeneration!==(state.training?.session?.generation??null))return;
      showToast(humanizeSocketError(error), "error");
    } finally {
      if(requestGeneration!==(state.training?.session?.generation??null))return;
      state.pendingRequest = null;
      render();
    }
  }

  async function submitOpeningRoll() {
    const requestGeneration=state.training?.session?.generation??null;
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
      if(requestGeneration!==(state.training?.session?.generation??null))return;
      showToast(humanizeSocketError(error), "error");
    } finally {
      if(requestGeneration!==(state.training?.session?.generation??null))return;
      state.pendingRequest = null;
      render();
    }
  }

  async function submitAndReadyDeployment() {
    const requestGeneration=state.training?.session?.generation??null;
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
      if(requestGeneration!==(state.training?.session?.generation??null))return;
      state.pendingRequest = null;
      render();
      throw error;
    }
  }

  async function leaveRoom() {
    const requestGeneration=state.training?.session?.generation??null;
    if (!state.room) return;
    state.pendingRequest = "leave";
    render();
    try {
      await emitRequest("room:leave", {
        expectedVersion: state.room.stateVersion,
      });
      state.pendingRequest = null;
    } catch (error) {
      if(requestGeneration!==(state.training?.session?.generation??null))return;
      state.pendingRequest = null;
      render();
      throw error;
    }
  }

  async function surrender(andLeave = false) {
    const requestGeneration=state.training?.session?.generation??null;
    const surrendered = await emitRequest("match:surrender", {
      expectedVersion: state.room.stateVersion,
    });
    await ensureStateVersion(surrendered.stateVersion);
    if(requestGeneration!==(state.training?.session?.generation??null))return;
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
    state.battle.commandNotice = "";
    state.battle.awaitingSync = false;
    state.battle.fleetOpen = false;
    state.battle.selectedAction = actionType;
    state.battle.expandedUnitCards.add(definition.sourceType);
    state.battle.actionDrawerOpen = definition.targetMode === "line";
    state.battle.logOpen = false;
    state.battle.target = null;
    state.battle.actionId = null;
    state.battle.markerMode = false;
    state.battle.helicopterAxis =
      definition.targetMode === "line" ? state.battle.helicopterAxis : null;
    const activeTargets = activeBattleOpponentIds(state.room);
    const targetPlayerId = activeTargets.includes(state.battle.targetPlayerId)
      ? state.battle.targetPlayerId
      : activeTargets[0] ?? null;
    if (targetPlayerId) {
      state.battle.targetPlayerId = targetPlayerId;
      state.battle.mobileMap = targetPlayerId;
    }
    warmBattleArt(state.room);
    render();
  }

  function handleEnemyCell(coordinate, targetPlayerId = state.battle.targetPlayerId) {
    const ownBattle = state.room?.battle?.own;
    if (!ownBattle || !targetPlayerId) return;
    if (!activeBattleOpponentIds(state.room).includes(targetPlayerId)) {
      showToast("该玩家已淘汰，地图与标记保持只读。", "info");
      return;
    }
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
      if (!simultaneousAction) {
        state.battle.target = null;
        state.battle.actionId = null;
      }
    }
    const selectedEnemyMap = enemyMapFor(ownBattle, targetPlayerId);
    const effectiveOwnBattle = { ...ownBattle, enemyMap: selectedEnemyMap };
    const resolved = Data.resolvedTargetSet(effectiveOwnBattle);
    if (state.battle.markerMode) {
      if (resolved.has(coordinate)) {
        showToast("命中或未命中格不能添加私人标记。", "warning");
        return;
      }
      if (state.battle.eraseMarker) state.battle.markers.delete(coordinate);
      else state.battle.markers.set(coordinate, state.battle.selectedMarker);
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
    state.battle.logOpen = false;
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
    state.battle.commandNotice = "";
    render();
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
