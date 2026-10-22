  function placementById(id) {
    return state.deployment.placements.find((placement) => placement.id === id) ?? null;
  }

  function occupantAt(coordinate, ignoredId = null) {
    return state.deployment.placements.find(
      (placement) =>
        placement.id !== ignoredId && placement.cells.includes(coordinate),
    ) ?? null;
  }

  function renderGrid(label, cellRenderer, className = "", artLayer = "") {
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
          ${artLayer}
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

    const artSnapshot = {
      units: state.deployment.placements
        .filter((placement) => Data.getUnitDefinitionById(placement.id)?.type !== Data.UNIT_TYPES.DECOY_TORPEDO)
        .map((placement) => ({
          id: placement.id,
          type: Data.getUnitDefinitionById(placement.id)?.type,
          cells: placement.cells,
          hitCells: [],
        })),
      decoys: state.deployment.placements
        .filter((placement) => Data.getUnitDefinitionById(placement.id)?.type === Data.UNIT_TYPES.DECOY_TORPEDO)
        .map((placement) => ({ id: placement.id, cell: placement.cells[0], destroyed: false })),
    };

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
    }, locked ? "board-frame--locked board-frame--2d-art" : "board-frame--2d-art",
    renderTacticalUnitArt(artSnapshot, { selectedId: selected, quality: state.effectiveQuality }));
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
    reconcileUiMotion();
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
            ? `<strong>${escapeHtml(firstPlayer)} 获得第一回合</strong><span>${state.training?.session?"训练时钟已暂停；可在任务控制中推进合成席位，继续开局。":"结果将额外停留 3 秒后进入正式对战"}</span>`
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
