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
    const mapFrame = event.target.closest?.(".board-frame--tactical-sea");
    if (mapFrame) {
      mapPanGesture = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    }
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
    const gesture = mapPanGesture;
    if (gesture && gesture.pointerId === event.pointerId && !gesture.moved) {
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) {
        gesture.moved = true;
        suppressEnemyCellClickUntil = Date.now() + 650;
        if (markerLongPress?.timer) clearTimeout(markerLongPress.timer);
        markerLongPress = null;
      }
    }
    const press = markerLongPress;
    if (!press || press.pointerId !== event.pointerId || press.fired) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
      if (press.timer) clearTimeout(press.timer);
      markerLongPress = null;
    }
  });

  function finishMarkerLongPress(event) {
    if (mapPanGesture?.pointerId === event.pointerId) mapPanGesture = null;
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
    if (typing || event.isComposing || document.querySelector("dialog[open]")) return;
    if (
      event.key === "Escape" &&
      state.room?.roomPhase === "PLAYING" &&
      (state.battle.actionDrawerOpen || state.battle.logOpen || state.battle.fleetOpen)
    ) {
      event.preventDefault();
      state.battle.fleetOpen = false;
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
