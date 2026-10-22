  function ownBattleCellMap(snapshot) {
    const map = new Map();
    for (const unit of snapshot?.units ?? []) {
      const definition = Data.getUnitDefinitionById(unit.id) ?? Data.getUnitDefinitionByType(unit.type);
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

  const HIDDEN_RESULT_ACTIONS = Object.freeze([
    Data.ACTION_TYPES.SUBMARINE_MISSILE,
    Data.ACTION_TYPES.NUCLEAR_BOMB,
    Data.ACTION_TYPES.SHOCK_BOMB,
  ]);

  function activeBattleEffectFeedback(room) {
    const key = resolutionKey(room);
    if (
      !state.battle.resolutionEffectVisible ||
      !key ||
      key !== state.battle.resolutionEffectKey
    ) {
      return null;
    }
    return room?.latestResolution?.feedback ?? null;
  }

  function safeEffectTargetCells(feedback) {
    if (!feedback?.actionType || !feedback?.target) return [];
    return Data.previewCells(feedback.actionType, feedback.target)
      .filter((coordinate) => Boolean(Data.parseCoordinate(coordinate)));
  }

  function setEffectCell(cellStates, coordinate, value) {
    if (!Data.parseCoordinate(coordinate)) return;
    const priority = { miss: 1, paralyzed: 2, hit: 3, decoy: 4, sunk: 5 };
    const current = cellStates.get(coordinate);
    if (!current || priority[value] > priority[current]) {
      cellStates.set(coordinate, value);
    }
  }

  function battleEffectModel(room, mapId) {
    const feedback = activeBattleEffectFeedback(room);
    if (!feedback) return null;
    if (room.maxPlayers === 3 && state.battle.resolutionEffectMapId !== mapId) {
      return null;
    }
    const ownId = room.own.playerId;
    const isOwnMap = mapId === "own";
    const isActor = feedback.actorId === ownId;
    const defenderIds = feedback.defenderIds ?? [feedback.defenderId].filter(Boolean);
    const isOwnDefender = defenderIds.includes(ownId);
    const cellStates = new Map();
    let targetCells = [];
    let visualState = "unknown";

    if (isOwnMap) {
      const changes = state.battle.ownEffectCells ?? emptyOwnEffectCells();
      for (const coordinate of changes.hit) setEffectCell(cellStates, coordinate, "hit");
      for (const coordinate of changes.paralyzed) setEffectCell(cellStates, coordinate, "paralyzed");
      for (const coordinate of changes.decoy) setEffectCell(cellStates, coordinate, "decoy");
      for (const coordinate of changes.sunk) setEffectCell(cellStates, coordinate, "sunk");

      if (isOwnDefender) {
        targetCells = safeEffectTargetCells(feedback);
        if (feedback.actionType === Data.ACTION_TYPES.HELICOPTER_STRAFE) {
          for (const result of feedback.cellResults ?? []) {
            setEffectCell(cellStates, result.coordinate, result.result);
          }
        }
      } else if (cellStates.size > 0) {
        targetCells = [...cellStates.keys()];
      } else {
        return null;
      }

      if ([...cellStates.values()].some((value) => ["hit", "decoy", "sunk"].includes(value))) {
        visualState = "hit";
      } else if ([...cellStates.values()].includes("miss")) {
        visualState = "miss";
      } else if (
        isOwnDefender &&
        !HIDDEN_RESULT_ACTIONS.includes(feedback.actionType) &&
        ![Data.ACTION_TYPES.DETECTION_BOMB, Data.ACTION_TYPES.RADAR_SCAN].includes(feedback.actionType) &&
        ["hit", "miss"].includes(feedback.result)
      ) {
        visualState = feedback.result;
      }
    } else {
      if (!isActor || !defenderIds.includes(mapId)) return null;
      targetCells = safeEffectTargetCells(feedback);
      if (feedback.actionType === Data.ACTION_TYPES.HELICOPTER_STRAFE) {
        const results = feedback.cellResultsByDefender?.[mapId] ?? feedback.cellResults ?? [];
        for (const result of results) setEffectCell(cellStates, result.coordinate, result.result);
        visualState = results.some((result) => result.result === "hit") ? "hit" : "miss";
      } else if (feedback.actionType === Data.ACTION_TYPES.DETECTION_BOMB) {
        const result = feedback.privateResultsByDefender?.[mapId] ?? feedback.result;
        visualState = result === "underwater_signal_detected" ? "private-positive" : "private-negative";
      } else if (feedback.actionType === Data.ACTION_TYPES.RADAR_SCAN) {
        const result = feedback.privateResultsByDefender?.[mapId] ?? feedback.result;
        visualState = result === "layout_detected" ? "private-positive" : "private-negative";
      } else if (HIDDEN_RESULT_ACTIONS.includes(feedback.actionType)) {
        visualState = "unknown";
      } else {
        visualState = feedback.resultsByDefender?.[mapId] ?? feedback.result ?? "unknown";
        if (["hit", "miss"].includes(visualState) && targetCells.length === 1) {
          setEffectCell(cellStates, targetCells[0], visualState);
        }
      }
    }

    return {
      key: state.battle.resolutionEffectKey,
      actionType: feedback.actionType,
      cellStates,
      targetCells,
      visualState,
      hasSunk: [...cellStates.values()].includes("sunk"),
      hasParalyzed: [...cellStates.values()].includes("paralyzed"),
      hasDecoy: [...cellStates.values()].includes("decoy"),
    };
  }

  function battleEffectAssets(model) {
    if (!model) return [];
    const assets = [];
    const add = (group, name, role = "secondary") => {
      const path = feedbackArtPath(group, name);
      if (path) assets.push({ path, name, role });
    };
    const action = model.actionType;
    if (action === Data.ACTION_TYPES.SUBMARINE_MISSILE) {
      add("vfx", "vfx_missile_launch", "primary");
      add("vfx", "vfx_torpedo_trail", "trail");
    } else if (action === Data.ACTION_TYPES.NUCLEAR_BOMB) {
      add("vfx", "vfx_nuclear_flash_core", "primary");
      add("vfx", "vfx_nuclear_shock_ring", "ring");
    } else if (action === Data.ACTION_TYPES.SHOCK_BOMB) {
      add("vfx", "vfx_emp_pulse", "ring");
      add("vfx", "vfx_emp_impact", "primary");
    } else if (action === Data.ACTION_TYPES.DETECTION_BOMB) {
      add("vfx", "vfx_sonar_ping", "ring");
      add("status", "status_revealed_sonar", "status");
    } else if (action === Data.ACTION_TYPES.RADAR_SCAN) {
      add("vfx", "vfx_radar_sweep", "scan");
      add("status", "status_revealed_radar", "status");
      add("props", "prop_ping_beacon", "beacon");
    } else if (action === Data.ACTION_TYPES.HELICOPTER_STRAFE) {
      add("vfx", "vfx_helicopter_trace", "trail");
    }

    if (model.visualState === "hit") {
      add("vfx", action === Data.ACTION_TYPES.NUCLEAR_BOMB ? "vfx_large_explosion" : "vfx_small_explosion", "impact");
      add("vfx", "vfx_debris_sparks", "debris");
      add("status", "status_burning", "status");
    } else if (model.visualState === "miss") {
      add("vfx", action === Data.ACTION_TYPES.NUCLEAR_BOMB ? "vfx_large_water_splash" : "vfx_small_water_splash", "impact");
    }
    if (model.hasParalyzed) add("status", "status_emp_disabled", "status");
    if (model.hasDecoy) add("status", "status_destroyed_marker", "status");
    if (model.hasSunk) add("status", "status_sinking", "status");
    return state.effectiveQuality === "smooth"
      ? assets.filter((asset) => ["primary", "impact", "ring", "scan", "trail"].includes(asset.role)).slice(0, 2)
      : assets.slice(0, 4);
  }

  function renderBattleEffectLayer(model) {
    const cells = model?.targetCells?.length > 0
      ? model.targetCells
      : [...(model?.cellStates?.keys?.() ?? [])];
    const bounds = artBounds(cells);
    const assets = battleEffectAssets(model);
    if (!model || !bounds || assets.length === 0) return "";
    return `<div class="battle-effect-layer" data-effect-key="${escapeHtml(model.key)}" aria-hidden="true">
      <span
        class="battle-effect-art battle-effect-art--${escapeHtml(model.visualState)}"
        data-effect-action="${escapeHtml(model.actionType)}"
        data-effect-scope="${cells.length === 1 ? "cell" : "area"}"
        data-effect-result="${escapeHtml(model.visualState)}"
        data-grid-row="${bounds.row}"
        data-grid-column="${bounds.column}"
        data-grid-row-span="${bounds.rowSpan}"
        data-grid-column-span="${bounds.columnSpan}"
      >${renderMotionArt(model)}${assets.map((asset) => `<img class="battle-effect-art__${asset.role}" data-effect-asset="${asset.name}" src="${asset.path}" alt="" loading="eager" decoding="async" fetchpriority="high" draggable="false" />`).join("")}</span>
    </div>`;
  }

  function battleEffectCellClass(model, coordinate) {
    const value = model?.cellStates?.get(coordinate);
    return value ? `board-cell--effect-${value}` : "";
  }

  function renderOwnBattleBoard(snapshot, options = {}) {
    const map = ownBattleCellMap(snapshot);
    const effectModel = options.replay ? null : battleEffectModel(state.room, "own");
    const centerCells = new Set(
      Data.destroyerCenterCells(state.battle.selectedAction, snapshot),
    );
    const selectedDefinition = Data.getActionDefinition(state.battle.selectedAction);
    return renderGrid(options.label ?? "己方地图", (coordinate) => {
      const entry = map.get(coordinate);
      const classes = [];
      const effectClass = battleEffectCellClass(effectModel, coordinate);
      if (effectClass) classes.push(effectClass);
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
        if (!sunk && definition.initialHp && unit.hp <= definition.initialHp / 2) classes.push("board-cell--own-low-hp");
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
            ? entry.definition.category === "underwater" ? "underwater" : "surface"
            : entry?.kind === "decoy" ? "underwater" : "empty",
        },
      };
    }, options.replay
      ? "board-frame--replay board-frame--tactical-sea board-frame--own-sea"
      : "board-frame--tactical-sea board-frame--own-sea",
    `${renderTacticalEnvironmentLayer("own")}${renderTacticalUnitArt(snapshot, { replay: options.replay, quality: state.effectiveQuality })}${renderBattleEffectLayer(effectModel)}`);
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
      activeBattleOpponentIds(room).length > 1,
    );
  }

  function isSimultaneousThreePlayerSelection(room = state.room) {
    return Boolean(
      room?.maxPlayers === 3 &&
      room?.turn?.canAct &&
      state.battle.selectedAction &&
      activeBattleOpponentIds(room).length > 1,
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
      !activeBattleOpponentIds(state.room).includes(targetPlayerId) ||
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
    const eliminated = (state.room?.battle?.match?.eliminatedPlayerIds ?? []).includes(targetPlayerId);
    const interactiveForThisMap = !eliminated && (selectedForThisMap || simultaneousAction);
    const legal = interactiveForThisMap
      ? legalTargetCells(ownBattle, targetPlayerId)
      : new Set();
    const preview = interactiveForThisMap
      ? new Set(Data.previewCells(state.battle.selectedAction, state.battle.target))
      : new Set();
    const intelligence = currentIntelligenceArea(ownBattle, targetPlayerId);
    const intelligenceCells = new Set(intelligence?.area ?? []);
    const targetMarkers = markersForTarget(targetPlayerId);
    const effectModel = battleEffectModel(state.room, targetPlayerId);
    const latestFeedback = state.room?.latestResolution?.feedback;
    const latestResult = mapLatestResultMeta(state.room, targetPlayerId);
    const latestResultCells = new Set(
      latestResult && feedbackTargets(latestFeedback).includes(targetPlayerId)
        ? safeEffectTargetCells(latestFeedback)
        : [],
    );
    return renderGrid("敌方地图", (coordinate) => {
      const result = results[coordinate];
      const resolved = result === "hit" || result === "miss";
      const hasMissile = missiles.has(coordinate) && !resolved;
      const hasNuclearBomb = nuclearBombs.has(coordinate) && !resolved;
      const marker = !resolved ? targetMarkers.get(coordinate) : null;
      const hasMarker = Boolean(marker);
      const classes = [];
      const effectClass = battleEffectCellClass(effectModel, coordinate);
      if (effectClass) classes.push(effectClass);
      if (latestResultCells.has(coordinate)) {
        classes.push("board-cell--latest-result", `board-cell--latest-${latestResult.code}`);
      }
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
      if (state.battle.selectedAction === Data.ACTION_TYPES.RADAR_SCAN && preview.has(coordinate)) {
        classes.push("board-cell--radar-preview");
      }
      if (state.battle.selectedAction === Data.ACTION_TYPES.DETECTION_BOMB && preview.has(coordinate)) {
        classes.push("board-cell--scan-preview");
      }
      if (state.battle.selectedAction === Data.ACTION_TYPES.SHOCK_BOMB && preview.has(coordinate)) {
        classes.push("board-cell--shock-preview");
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
    }, "board-frame--tactical-sea board-frame--enemy-sea", `${renderTacticalEnvironmentLayer("enemy")}${renderBattleEffectLayer(effectModel)}`);
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
          const definition = Data.getUnitDefinitionById(unit.id) ?? Data.getUnitDefinitionByType(unit.type);
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
