
  function renderBattleHeader(room) {
    const final = room.roomPhase === 'FINAL_SALVO';
    const lessonFinished=state.training?.session&&state.training.mode!=='free'&&state.training.task?.completed;
    const label = lessonFinished ? '练习完成' : final ? '最终齐射' : room.turnPhase === 'RESOLVING' ? '正在结算' : room.turnPhase === 'AUTO_SKIPPING' ? '自动跳过' : room.turn?.canAct ? '你的回合' : `等待 ${Model.nicknameFor(room,room.turn?.currentPlayerId)}`;
    const online = state.connected && state.connection.phase === 'online';
    const connectionLabel = online ? '实时在线' : state.connected ? '同步中' : '连接中断';
    return `<header class="battle-header"><a class="brand" href="/" aria-label="海战 OCEAN 首页"><span class="brand__mark" aria-hidden="true"></span><strong>OCEAN</strong></a><div class="battle-header__room"><small>${escapeHtml(state.training?.session?"训练营":room.roomCode)} · ${room.mapSize}×${room.mapSize}</small><small>${state.training?.session ? "陪练对战 · 不计时" : room.maxPlayers+" 人对局 · 连续超时 "+room.own.consecutiveActionTimeouts+"/3"}</small></div><div class="battle-header__turn" data-own-turn="${Boolean(room.turn?.canAct)}"><small>${final ? '终局阶段' : `回合 ${String(room.turn?.turnNumber ?? room.matchSummary.turnCount).padStart(2,'0')}`}</small><strong>${escapeHtml(label)}</strong></div><div class="battle-header__timer"><small>${final ? '同时结算' : '剩余时间'}</small>${state.training?.session ? '<strong>不限时</strong>' : !final && room.deadlines.actionDeadlineAt ? `<strong data-deadline="${room.deadlines.actionDeadlineAt}">—</strong>` : '<strong>—</strong>'}</div><span class="battle-header__connection" data-state="${online ? 'online' : state.connected ? 'syncing' : 'offline'}"><i></i><span>${connectionLabel}</span></span><button class="icon-button" data-action="open-battle-menu" aria-label="打开舰桥菜单">☰</button></header>`;
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

  function feedbackArtMarkup(room) {
    const feedback = room.latestResolution?.feedback;
    if (!feedback) return "";
    const action = feedback.actionType;
    const stateCode = resolutionVisualState(room);
    const assets = [];
    const add = (group, name) => assets.push(`<img src="${feedbackArtPath(group, name)}" alt="" decoding="async" draggable="false" />`);
    if (action === Data.ACTION_TYPES.SUBMARINE_MISSILE) {
      add("vfx", "vfx_missile_launch");
      add("vfx", "vfx_torpedo_trail");
    } else if (action === Data.ACTION_TYPES.NUCLEAR_BOMB) {
      add("vfx", "vfx_nuclear_flash_core");
      add("vfx", "vfx_nuclear_shock_ring");
    } else if (action === Data.ACTION_TYPES.SHOCK_BOMB) {
      add("vfx", "vfx_emp_pulse");
      add("vfx", "vfx_emp_impact");
    } else if (action === Data.ACTION_TYPES.DETECTION_BOMB) {
      add("vfx", "vfx_sonar_ping");
      add("status", "status_revealed_sonar");
    } else if (action === Data.ACTION_TYPES.RADAR_SCAN) {
      add("vfx", "vfx_radar_sweep");
      add("status", "status_revealed_radar");
      add("props", "prop_ping_beacon");
    } else if (action === Data.ACTION_TYPES.HELICOPTER_STRAFE) {
      add("vfx", "vfx_helicopter_trace");
    }
    if (stateCode === "hit") {
      add("vfx", action === Data.ACTION_TYPES.NUCLEAR_BOMB ? "vfx_large_explosion" : "vfx_small_explosion");
      add("vfx", "vfx_debris_sparks");
      add("status", "status_burning");
    } else if (stateCode === "miss") {
      add("vfx", action === Data.ACTION_TYPES.NUCLEAR_BOMB ? "vfx_large_water_splash" : "vfx_small_water_splash");
    } else if (stateCode === "private") {
      add("status", "status_flooding");
    }
    return assets.length ? `<span class="resolution-artwork" aria-hidden="true">${assets.join("")}</span>` : "";
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
    const collapsed = state.battle.feedbackCollapsed;
    const grouped = room.maxPlayers === 3 && feedbackTargets(feedback).length > 1;
    const resultRows = grouped ? feedbackResultRows(room) : [];
    const groupedSummary = grouped
      ? `${feedback.actionName} → ${Model.formatTarget(feedback.target)} · 同步结算`
      : describeLatestResolution(room);
    return `
      <section class="resolution-strip resolution-strip--v074 resolution-strip--${visualState} ${collapsed ? "resolution-strip--collapsed" : ""}" data-feedback-state="${visualState}" aria-label="最近一次行动反馈">
        <span class="resolution-strip__icon" aria-hidden="true">${escapeHtml(meta.icon)}</span>
        ${feedbackArtMarkup(room)}
        <div class="resolution-strip__content">
          <div class="resolution-strip__meta"><span>${escapeHtml(meta.label)}</span><small>行动 ${feedback.sequence ?? "—"}</small></div>
          <strong>${escapeHtml(groupedSummary)}</strong>
          ${grouped ? `
            <div class="resolution-player-results" aria-label="各防守方独立结果">
              ${resultRows.map((row) => `<span data-result-state="${escapeHtml(row.code)}"><b>${escapeHtml(row.name)}</b><em>${escapeHtml(row.label)}</em></span>`).join("")}
              <small>行动、弹药与行动方自损仅结算 1 次；各防守方结果按你的查看权限展示。</small>
            </div>` : ""}
          ${ownDamage.length || decoys.length ? `
            <ul>
              ${ownDamage.map((event) => {
                const definition = Data.getUnitDefinitionById(event.unitId) ?? Data.getUnitDefinitionByType(event.unitType);
                return `<li>${escapeHtml(definition?.name ?? event.unitId)}：${Model.formatHp(event.beforeHp)} → ${Model.formatHp(event.afterHp)}${event.sunk ? " · 已沉没" : ""}</li>`;
              }).join("")}
              ${decoys.map((event) => `<li>诱饵鱼雷 ${escapeHtml(event.decoyId)} · ${escapeHtml(event.cell)} 已摧毁</li>`).join("")}
            </ul>` : ""}
        </div>
        <button class="resolution-strip__toggle" type="button" data-action="toggle-feedback" aria-expanded="${!collapsed}" aria-label="${collapsed ? "展开最近一次行动反馈" : "收起最近一次行动反馈"}">${collapsed ? "展开" : "收起"}</button>
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
        const latestFeedback = room.latestResolution?.feedback;
        const currentRows = latestFeedback?.sequence === record.sequence
          ? feedbackResultRows(room)
          : [];
        const detailRows = currentRows.length > 0
          ? currentRows
          : defenderIds.map((playerId) => ({
              name: Model.nicknameFor(room, playerId),
              code: "private",
              label: "独立结算 · 结果按权限显示",
            }));
        return `<li class="event-item event-item--combat" data-event-state="${stateCode}">
          <span class="event-item__marker" aria-hidden="true"></span>
          <div class="event-item__body">
            <div class="event-item__route"><b>${escapeHtml(actorName)}</b><span>→</span><b>${escapeHtml(defenders)}</b><em>${escapeHtml(record.actionName)}</em></div>
            <p>${escapeHtml(Model.publicActionText(record, room))}</p>
            ${defenderIds.length > 1 ? `<details class="event-defender-details"><summary>展开各方结算</summary><div>${detailRows.map((row) => `<span data-result-state="${escapeHtml(row.code)}"><b>${escapeHtml(row.name)}</b><em>${escapeHtml(row.label)}</em></span>`).join("")}</div><small>本条仅代表一次行动，不重复扣除资源或行动方自损。</small></details>` : ""}
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
        <div class="log-panel__content event-center__content" data-scroll-key="event-content">${channelContent}</div>
      </section>`;
  }

  function battleOpponentIds(battle) {
    if (Array.isArray(battle?.opponentIds) && battle.opponentIds.length > 0) {
      return battle.opponentIds;
    }
    const legacyOpponentId = battle?.opponentId ?? battle?.opponent?.id;
    return legacyOpponentId ? [legacyOpponentId] : [];
  }

  function activeBattleOpponentIds(room = state.room) {
    const eliminated = new Set(room?.battle?.match?.eliminatedPlayerIds ?? []);
    return battleOpponentIds(room?.battle).filter((playerId) => !eliminated.has(playerId));
  }

  function battlePlayerState(room, playerId) {
    if ((room.battle?.match?.eliminatedPlayerIds ?? []).includes(playerId)) {
      return { code: "eliminated", label: "已淘汰" };
    }
    const seat = room.seats.find((candidate) => candidate.playerId === playerId);
    if (seat && !seat.online) return { code: "offline", label: "离线" };
    return { code: "online", label: "在线" };
  }

  function feedbackTargets(feedback) {
    return feedback?.defenderIds ?? [feedback?.defenderId].filter(Boolean);
  }

  function feedbackResultForPlayer(room, playerId) {
    const feedback = room.latestResolution?.feedback;
    if (!feedback || !feedbackTargets(feedback).includes(playerId)) return null;
    const ownId = room.own.playerId;
    const isActor = feedback.actorId === ownId;
    if (!isActor && playerId !== ownId) return null;

    if (HIDDEN_RESULT_ACTIONS.includes(feedback.actionType)) {
      const affected = playerId === ownId && (feedback.receivedHits ?? []).length > 0;
      return {
        code: "unknown",
        label: affected ? "本方受击 · 详情已记录" : "结果未知",
      };
    }
    if ([Data.ACTION_TYPES.DETECTION_BOMB, Data.ACTION_TYPES.RADAR_SCAN].includes(feedback.actionType)) {
      if (!isActor) return { code: "private", label: "结果仅行动方可见" };
      const result = feedback.privateResultsByDefender?.[playerId] ?? feedback.result;
      if (feedback.actionType === Data.ACTION_TYPES.DETECTION_BOMB) {
        return result === "underwater_signal_detected"
          ? { code: "private-positive", label: "发现水下信号" }
          : { code: "private-negative", label: "未发现水下信号" };
      }
      return result === "layout_detected"
        ? { code: "private-positive", label: "发现舰队布局" }
        : { code: "private-negative", label: "未发现舰队布局" };
    }
    if (feedback.actionType === Data.ACTION_TYPES.HELICOPTER_STRAFE) {
      const cells = isActor
        ? feedback.cellResultsByDefender?.[playerId] ?? feedback.cellResults ?? []
        : feedback.cellResults ?? [];
      const hits = cells.filter((cell) => cell.result === "hit").length;
      const misses = cells.filter((cell) => cell.result === "miss").length;
      return {
        code: hits > 0 ? "hit" : "miss",
        label: `命中 ${hits} 格 · 未命中 ${misses} 格`,
      };
    }
    const result = isActor
      ? feedback.resultsByDefender?.[playerId] ?? feedback.result
      : feedback.result;
    if (result === "hit") return { code: "hit", label: "命中" };
    if (result === "miss") return { code: "miss", label: "未命中" };
    return { code: "resolved", label: "已独立结算" };
  }

  function feedbackResultRows(room) {
    const feedback = room.latestResolution?.feedback;
    if (!feedback) return [];
    const ownId = room.own.playerId;
    const visibleIds = feedback.actorId === ownId
      ? feedbackTargets(feedback)
      : feedbackTargets(feedback).includes(ownId)
        ? [ownId]
        : [];
    return visibleIds.map((playerId) => ({
      playerId,
      name: playerId === ownId ? `${Model.nicknameFor(room, playerId)}（你）` : Model.nicknameFor(room, playerId),
      ...feedbackResultForPlayer(room, playerId),
    })).filter((row) => row.code);
  }

  function mapLatestResultMeta(room, playerId) {
    const feedback = room.latestResolution?.feedback;
    if (!feedback || feedback.actorId !== room.own.playerId) return null;
    return feedbackResultForPlayer(room, playerId);
  }

  function isRemainingTurnTarget(room, playerId) {
    const remaining = room?.turn?.remainingTargetPlayerIds;
    return !Array.isArray(remaining) || remaining.includes(playerId);
  }

  function battleMapIsCollapsed(mapId) {
    return Boolean(state.battle.collapsedMaps?.[mapId]);
  }

  function enemyTurnStatus(room, playerId) {
    if ((room.battle?.match?.eliminatedPlayerIds ?? []).includes(playerId)) return "已淘汰";
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
    const playerState = battlePlayerState(room, playerId);
    const eliminated = playerState.code === "eliminated";
    const status = enemyTurnStatus(room, playerId);
    const canTarget = !eliminated && (!room.turn?.canAct || isRemainingTurnTarget(room, playerId));
    const mobileActive = state.battle.mobileMap === playerId;
    const intel = currentIntelligenceArea(ownBattle, playerId);
    const activeAction = Data.getActionDefinition(state.battle.selectedAction);
    const feedback = room.latestResolution?.feedback;
    const affected = Boolean(feedback?.actorId === room.own.playerId && feedbackTargets(feedback).includes(playerId));
    const resultMeta = mapLatestResultMeta(room, playerId);
    const unread = state.battle.unreadResultPlayerIds.has(playerId);
    return `
      <section
        class="battle-map-card battle-map-card--enemy battle-map-card--v072 battle-map-card--v073 ${selected ? "battle-map-card--targeted" : ""} ${collapsed ? "battle-map-card--collapsed" : ""} ${mobileActive ? "is-mobile-active" : ""} ${eliminated ? "battle-map-card--eliminated" : ""}"
        data-map-panel="${escapeHtml(playerId)}"
        data-player-id="${escapeHtml(playerId)}"
        data-player-state="${playerState.code}"
        data-affected="${affected}"
        data-unread-result="${unread}"
      >
        <div class="map-card__heading map-card__heading--v072">
          <button class="map-collapse-button" type="button" data-action="toggle-battle-map" data-map-id="${escapeHtml(playerId)}" aria-label="${collapsed ? "展开" : "最小化"}${escapeHtml(nickname)}的敌方地图" aria-expanded="${!collapsed}">${collapsed ? "+" : "−"}</button>
          <button
            class="map-target-heading"
            type="button"
            data-action="select-battle-target"
            data-target-player-id="${escapeHtml(playerId)}"
            ${canTarget ? "" : 'aria-disabled="true" disabled'}
          >
            <span class="status-kicker">敌方海域</span>
            <h2>${escapeHtml(nickname)}</h2>
          </button>
          <span class="map-turn-state" data-state="${eliminated ? "eliminated" : status === "已完成" ? "done" : ["待操作", "同步目标"].includes(status) ? "pending" : "view"}">${status === "已完成" ? "✓" : ["待操作", "同步目标"].includes(status) ? "●" : "○"} ${status}</span>
          <button
            class="marker-toggle ${state.battle.markerMode && selected ? "marker-toggle--active" : ""}"
            data-action="toggle-marker-mode"
            data-target-player-id="${escapeHtml(playerId)}"
            aria-pressed="${state.battle.markerMode && selected}"
            title="私人标记"
            ${eliminated ? "disabled" : ""}
          >标记</button>
        </div>
        ${collapsed
          ? `<button class="battle-map-collapsed-summary" type="button" data-action="toggle-battle-map" data-map-id="${escapeHtml(playerId)}"><span>${escapeHtml(nickname)} · 独立记录</span><strong>${status}</strong></button>`
          : `${state.battle.markerMode && selected ? renderMarkerPalette(playerId) : ""}
             <div class="tactical-sea-toolbar"><span><i aria-hidden="true"></i>海面战术投影</span><b>${state.battle.markerMode && selected ? "私人标记模式" : activeAction && (selected || isSimultaneousThreePlayerSelection(room)) ? escapeHtml(activeAction.name) : "悬停显示坐标"}</b></div>
             ${renderEnemyBoard(ownBattle, playerId)}
             ${renderRangeLegend(room, playerId)}
             <div class="map-caption map-caption--v072">
               <span>${eliminated ? "已淘汰 · 历史只读" : selected ? (state.battle.selectedAction ? "当前目标" : "已选中") : "独立敌方记录"}</span>
               ${affected && resultMeta ? `<b class="map-latest-result" data-result-state="${escapeHtml(resultMeta.code)}">${escapeHtml(Model.formatTarget(feedback.target))} · ${escapeHtml(resultMeta.label)}${unread ? " · 新" : ""}</b>` : ""}
               ${intel ? `<button class="intel-chip" data-action="clear-intelligence" data-kind="${intel.kind}">${intel.kind === "shock" ? "震爆区域" : intel.kind === "radar" ? `雷达 · ${intel.detected ? "发现" : "未发现"}` : `探测 · ${intel.detected ? "有信号" : "无信号"}`} ×</button>` : ""}
             </div>`}
      </section>`;
  }

  function renderOwnMapCard(room) {
    const collapsed = battleMapIsCollapsed("own");
    const mobileActive = state.battle.mobileMap === "own";
    const layerMeta = tacticalLayerMeta();
    return `
      <section class="battle-map-card battle-map-card--own battle-map-card--v072 battle-map-card--v073 ${collapsed ? "battle-map-card--collapsed" : ""} ${mobileActive ? "is-mobile-active" : ""}" data-map-panel="own">
        <div class="map-card__heading map-card__heading--v072">
          <button class="map-collapse-button" type="button" data-action="toggle-battle-map" data-map-id="own" aria-label="${collapsed ? "展开" : "最小化"}己方地图" aria-expanded="${!collapsed}">${collapsed ? "+" : "−"}</button>
          <div class="map-target-heading map-target-heading--static"><span class="status-kicker">己方海域</span><h2>己方地图</h2></div>
          <span class="map-turn-state" data-state="own">私密</span>
        </div>
        ${collapsed
          ? `<button class="battle-map-collapsed-summary" type="button" data-action="toggle-battle-map" data-map-id="own"><span>己方海域</span><strong>完整情报</strong></button>`
          : `<div class="tactical-sea-toolbar tactical-sea-toolbar--layer"><span>${uiCommandIcon(layerMeta.icon)}<i aria-hidden="true"></i>${layerMeta.label}</span><b>${layerMeta.detail}</b></div>${renderOwnBattleBoard(room.battle.own)}<div class="map-caption map-caption--v072"><span>己方完整情报 · ${layerMeta.label}</span></div>`}
      </section>`;
  }

  function renderBattleMapTabs(room) {
    const opponents = battleOpponentIds(room.battle);
    for(const id of [...opponents].sort())if(!state.battle.identityTones.has(id))state.battle.identityTones.set(id,state.battle.identityTones.size%2===0?"a":"b");
    const tabs = [
      { id: "own", label: "己方", own: true },
      ...opponents.map((playerId) => {
        const playerState = battlePlayerState(room, playerId);
        const feedback = room.latestResolution?.feedback;
        const affected = Boolean(feedback?.actorId === room.own.playerId && feedbackTargets(feedback).includes(playerId));
        return {
          id: playerId,
          label: Model.nicknameFor(room, playerId),
          own: false,
          playerState,
          affected,
          target: affected ? Model.formatTarget(feedback.target) : null,
          result: mapLatestResultMeta(room, playerId),
          unread: state.battle.unreadResultPlayerIds.has(playerId),
        };
      }),
    ];
    return `
      <div class="mobile-map-tabs mobile-map-tabs--v072 battle-map-tabs--v158" data-tab-count="${tabs.length}" role="tablist" aria-label="地图切换">
        ${tabs.map((tab) => `
          <button role="tab" aria-selected="${state.battle.mobileMap === tab.id}" class="${state.battle.mobileMap === tab.id ? "is-active" : ""} ${tab.playerState?.code === "eliminated" ? "is-eliminated" : ""}" data-action="switch-map" data-map="${escapeHtml(tab.id)}" data-identity-tone="${tab.own ? "own" : state.battle.identityTones.get(tab.id)}" data-player-state="${tab.playerState?.code ?? "own"}" data-affected="${Boolean(tab.affected)}" data-unread-result="${Boolean(tab.unread)}">
            <span class="battle-map-tab__identity"><i aria-hidden="true"></i><strong>${escapeHtml(tab.label)}</strong><small>${tab.own ? "己方完整情报" : tab.playerState.label}</small></span>
            ${tab.own
              ? state.battle.ownMapAlert ? '<b class="battle-map-tab__result" data-result-state="hit">本方有新受击信息</b>' : '<b class="battle-map-tab__result">舰队状态</b>'
              : tab.affected && tab.result
                ? `<b class="battle-map-tab__result" data-result-state="${escapeHtml(tab.result.code)}"><em>${escapeHtml(tab.target)}</em>${escapeHtml(tab.result.label)}</b>`
                : `<b class="battle-map-tab__result">${tab.playerState.code === "eliminated" ? "历史记录保留" : "等待最新结果"}</b>`}
            ${tab.unread ? '<i class="battle-map-tab__unread" aria-label="有未读的新结算结果"></i>' : ""}
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

  function battleMapPanel(mapId = state.battle.mobileMap) {
    return [...document.querySelectorAll("[data-map-panel]")]
      .find((panel) => panel.dataset.mapPanel === mapId) ?? null;
  }

  function rememberBattleMapView(mapId = state.battle.mobileMap) {
    const frame = battleMapPanel(mapId)?.querySelector(".board-frame--tactical-sea");
    if (!frame) return;
    state.battle.mapViewPositions.set(mapId, {
      left: frame.scrollLeft,
      top: frame.scrollTop,
    });
  }

  function restoreBattleMapView(mapId = state.battle.mobileMap) {
    const position = state.battle.mapViewPositions.get(mapId);
    if (!position) return;
    window.requestAnimationFrame(() => {
      const frame = battleMapPanel(mapId)?.querySelector(".board-frame--tactical-sea");
      if (!frame) return;
      frame.scrollLeft = Math.min(position.left, Math.max(0, frame.scrollWidth - frame.clientWidth));
      frame.scrollTop = Math.min(position.top, Math.max(0, frame.scrollHeight - frame.clientHeight));
    });
  }

  function targetFocusCoordinate(target = state.battle.target) {
    if (target?.coordinate) {
      const action = Data.getActionDefinition(state.battle.selectedAction);
      if(action?.rangeMode === 'radar') {
        const point = Data.parseCoordinate(target.coordinate);
        const shift = Math.floor((state.room?.mapRules?.radarSize ?? 4)/2);
        return point ? Data.formatCoordinate(point.row+shift,point.column+shift) : target.coordinate;
      }
      return target.coordinate;
    }
    const size = state.room?.mapSize ?? 12;
    const midpoint = Math.max(0, Math.floor((size - 1) / 2));
    if (target?.kind === "row") {
      const row = Data.ROWS.indexOf(target.row);
      return row >= 0 ? Data.formatCoordinate(row, midpoint) : null;
    }
    if (target?.kind === "column") {
      return Data.formatCoordinate(midpoint, Number(target.column) - 1);
    }
    return null;
  }

  function centerBattleMap(coordinate = null) {
    const mapId = state.battle.mobileMap;
    window.requestAnimationFrame(() => {
      const panel = battleMapPanel(mapId);
      const frame = panel?.querySelector(".board-frame--tactical-sea");
      const cell = coordinate
        ? [...(panel?.querySelectorAll("[data-coordinate]") ?? [])].find((item) => item.dataset.coordinate === coordinate)
        : null;
      if (!frame) return;
      const left = cell
        ? cell.offsetLeft + cell.offsetWidth / 2 - frame.clientWidth / 2
        : (frame.scrollWidth - frame.clientWidth) / 2;
      const top = cell
        ? cell.offsetTop + cell.offsetHeight / 2 - frame.clientHeight / 2
        : (frame.scrollHeight - frame.clientHeight) / 2;
      if (typeof frame.scrollTo === "function") {
        frame.scrollTo({ left, top, behavior: state.reduceMotion ? "auto" : "smooth" });
      } else {
        frame.scrollLeft = left;
        frame.scrollTop = top;
      }
      state.battle.mapViewPositions.set(mapId, { left: Math.max(0, left), top: Math.max(0, top) });
    });
  }

  function changeTacticalLayer(layer) {
    if (!["all", "surface", "underwater"].includes(layer)) return;
    const previousLayer = state.battle.tacticalLayer;
    if (previousLayer === layer) return;
    state.battle.tacticalLayer = layer;
    state.battle.tacticalLayerTransition = `${previousLayer}-to-${layer}`;
    render();
    window.clearTimeout(tacticalLayerTransitionTimer);
    tacticalLayerTransitionTimer = window.setTimeout(() => {
      state.battle.tacticalLayerTransition = null;
      document.querySelector(".ocean-console")?.removeAttribute("data-layer-transition");
    }, state.reduceMotion ? 80 : 820);
  }

  function renderMobileCommandPeek(room) {
    const selectedDefinition = Data.getActionDefinition(state.battle.selectedAction);
    const layerMeta = tacticalLayerMeta();
    const targetText = state.battle.target ? Model.formatTarget(state.battle.target) : "尚未选择目标";
    const statusText = !room.turn?.canAct
      ? "等待当前玩家行动"
      : selectedDefinition
        ? selectedDefinition.name
        : "选择本回合行动";
    return `
      <section class="mobile-command-peek" data-has-action="${Boolean(selectedDefinition)}" data-has-target="${Boolean(state.battle.target)}" aria-label="移动端当前指令">
        <button type="button" data-action="toggle-action-drawer" aria-expanded="${state.battle.actionDrawerOpen}">
          <span>${escapeHtml(statusText)}</span>
          <strong>${escapeHtml(targetText)}</strong>
          <small>${state.battle.target ? "点击展开或确认" : "点击打开行动面板"}</small>
        </button>
        ${state.battle.mobileMap === "own" ? `<button class="mobile-command-peek__layer" type="button" data-action="cycle-tactical-layer" title="切换己方沙盘视层">${uiCommandIcon(layerMeta.icon)}<span>${layerMeta.label.replace("视层", "")}</span></button>` : ""}
        <button class="mobile-command-peek__center" type="button" data-action="center-battle-map">地图居中</button>
        ${state.battle.target ? `<button class="mobile-command-peek__focus" type="button" data-action="focus-selected-target">回到目标</button><button class="mobile-command-peek__confirm" type="button" data-action="reopen-action-confirm">确认</button>` : ""}
      </section>`;
  }


  function renderBridgeCommandDeck(room) {
    const definition = Data.getActionDefinition(state.battle.selectedAction);
    const source = definition ? room.battle.own.units.find(unit=>unit.type===definition.sourceType && unit.hp>0 && !unit.paralyzed) : null;
    const sourceName = source ? (Data.getUnitDefinitionById(source.id) ?? Data.getUnitDefinitionByType(source.type))?.name : '';
    const targetLabel = state.battle.target ? definition?.rangeMode === 'radar'
      ? `${Model.formatTarget(state.battle.target)} 起始 · ${room.mapRules.radarSize}×${room.mapRules.radarSize}`
      : definition?.targetMode === 'area' ? `${Model.formatTarget(state.battle.target)} 中心 · ${definition.rangeMode === 'shock' ? room.mapRules.shockSize : room.mapRules.detectionSize}×${definition.rangeMode === 'shock' ? room.mapRules.shockSize : room.mapRules.detectionSize}`
      : Model.formatTarget(state.battle.target) : '';
    const ready = commandIsValid();
    const targets = activeBattleOpponentIds(room);
    const remaining = definition?.initialUses == null ? null : room.battle.own.remainingUses[definition.type];
    const instruction = definition ? definition.rangeMode === 'radar' ? '选择扫描区左上起始格' : definition.targetMode === 'area' ? '选择完整范围的中心格' : definition.targetMode === 'line' ? '选择整行或整列' : '选择目标坐标' : '选择行动';
    return `<section class="command-dock" aria-label="统一指令台"><div class="command-summary" role="status"><strong class="command-action-name">${state.battle.markerMode ? '私人标记模式' : definition ? escapeHtml(definition.name) : room.turn?.canAct ? '等待你的指令' : '等待当前玩家行动'}</strong><span class="command-target">${state.battle.target ? escapeHtml(targetLabel) : state.battle.markerMode ? '注记仅你可见，不消耗回合' : instruction}</span>${definition ? `<small class="command-source-cost">来源 ${escapeHtml(sourceName)}${source?` · ${Model.formatHp(source.hp)} HP`:""} · ${targets.map(id=>escapeHtml(Model.nicknameFor(room,id))).join('、')} · ${remaining === null ? '不限次数' : `消耗 1，执行后剩余 ${Math.max(0,remaining-1)}`}${targets.length>1?' · 同步两方':''}${HIDDEN_RESULT_ACTIONS.includes(definition.type)?' · 结果保密':''}</small>`:''}${definition && ['destroyer_i_ram','destroyer_ii_ram','pirate_attack','motorboat_ram'].includes(definition.type) ? `<small class="command-risk">可能造成己方损失</small>`:''}${state.battle.commandNotice?`<small class="command-notice">${escapeHtml(state.battle.commandNotice)}</small>`:''}${state.battle.awaitingSync ? '<button data-action="sync-command">同步对局</button>':''}</div>${definition?.targetMode === "line" ? `<div class="command-axis"><button data-action="set-helicopter-axis" data-axis="row" aria-pressed="${state.battle.helicopterAxis === "row"}">行</button><button data-action="set-helicopter-axis" data-axis="column" aria-pressed="${state.battle.helicopterAxis === "column"}">列</button></div>` : ""}<div class="command-controls">${definition ? `<button class="command-info" data-action="inspect-action" data-action-type="${definition.type}" aria-label="查看当前行动完整说明">详情</button>` : ""}<button data-action="cancel-action-selection" ${state.pendingRequest || (!definition && !state.battle.markerMode) ? 'disabled':''}>取消</button><button class="command-execute" data-action="execute-command" ${ready ? '' : 'disabled'}>${state.pendingRequest === 'action' ? '正在提交…' : '确认执行'}</button></div></section>`;
  }

  function renderFinalSalvoStage(room, finalSalvoState, availableFinalDecoys) {
    if (!finalSalvoState) return "";
    const submitted = new Set(finalSalvoState.submittedPlayerIds ?? []);
    const ownSelected = (room.battle?.own?.decoys ?? []).find(
      (decoy) => decoy.id === finalSalvoState.ownSelectedDecoyId,
    );
    const selecting = finalSalvoState.status === "selecting";
    const waiting = selecting && finalSalvoState.ownSubmitted;
    const participants = room.seats.filter(seat => !(room.battle?.match?.eliminatedPlayerIds ?? []).includes(seat.playerId));
    const submittedCount = participants.filter(seat => submitted.has(seat.playerId)).length;
    const allReady = participants.every((seat) => submitted.has(seat.playerId));
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
                    <button class="salvo-decoy-card" type="button" data-action="submit-final-salvo" data-decoy-id="${escapeHtml(decoy.id)}" aria-pressed="${state.battle.finalDecoyId === decoy.id}">
                      <span aria-hidden="true">${uiIcon("ship-decoy")}</span>
                      <strong>${escapeHtml(decoy.cell)}</strong>
                      <small>引爆鱼雷</small>
                    </button>`).join("")}</div>`
                : `<div class="salvo-empty-choice">${uiIcon("status-sunk")}<div><strong>本方无可用鱼雷</strong><small>无需选择，等待服务器推进。</small></div></div>`}
            ${selecting && !waiting ? `<button class="button button--primary" data-action="confirm-final-salvo" ${!availableFinalDecoys.some(d => d.id === state.battle.finalDecoyId) || state.pendingRequest ? "disabled" : ""}>确认引爆${state.battle.finalDecoyId ? " · " + escapeHtml(availableFinalDecoys.find(d => d.id === state.battle.finalDecoyId)?.cell ?? "") : ""}</button>` : ""}<div class="salvo-multi-target-note">${uiIcon("status-final-salvo")}<span>同一坐标同时作用于<strong>其他所有仍在局玩家</strong></span></div>
          </div>

          <aside class="salvo-submit-panel" aria-label="本轮提交状态">
            <div class="salvo-submit-panel__heading"><span>本轮状态</span><strong>${submittedCount} / ${participants.length}</strong></div>
            <div class="salvo-player-list">
              ${participants.map((seat) => {
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
    if (!room.battle) return '<section class="boot-card"><p>正在同步安全战场视图……</p></section>';
    const final = room.roomPhase === 'FINAL_SALVO';
    const salvo = room.battle.match?.finalSalvo;
    const available = (room.battle.own.decoys ?? []).filter(d => salvo?.availableDecoyIds?.includes(d.id));
    const opponents = battleOpponentIds(room.battle);
    const compact = window.innerWidth < 1024 || window.innerHeight < 600 || document.documentElement.dataset.textSize === "large";
    const drawer = state.battle.logOpen ? 'messages' : state.battle.actionDrawerOpen && compact ? 'actions' : state.battle.fleetOpen ? 'fleet' : 'none';
    void Sound?.preloadGroup?.('battle');
    return `<section class="battle-page ocean-console ${final ? 'ocean-console--salvo' : ''}" data-map-zoom="${Boolean(state.battle.mapZoom)}" data-player-count="${room.maxPlayers}" data-map-size="${room.mapSize}" data-tactical-layer="${state.battle.tacticalLayer}" data-drawer-open="${drawer}" ${state.battle.tacticalLayerTransition ? `data-layer-transition="${state.battle.tacticalLayerTransition}"` : ''} aria-labelledby="battle-page-title"><h1 id="battle-page-title" class="sr-only">${state.training?.session?"训练营 · 核心战斗":"正式对战"}</h1>${renderBattleHeader(room)}<div class="console-workspace">${renderFleetPanel(room)}<div class="battle-main-column"><div class="map-navigation">${renderBattleMapTabs(room)}<div class="map-tools"><button data-action="toggle-marker-mode" data-target-player-id="${escapeHtml(state.battle.targetPlayerId)}" aria-pressed="${state.battle.markerMode}">标记</button><button data-action="cycle-tactical-layer" ${state.battle.mobileMap !== "own" ? "disabled" : ""}>${tacticalLayerMeta().label.replace("视层","")}</button><button data-action="center-battle-map" aria-label="地图居中">居中</button><button data-action="toggle-map-zoom" aria-pressed="${Boolean(state.battle.mapZoom)}">${state.battle.mapZoom?"标准格":"放大格"}</button>${state.battle.target ? '<button data-action="focus-selected-target">回到目标</button>' : ''}</div></div>${final ? "" : renderMapNavigator()}${room.maxPlayers === 3 ? `<p class="sync-note">${activeBattleOpponentIds(room).length > 1 ? '一次行动，同步两方 · 成本只算一次' : '唯一有效目标'}</p>` : ''}${final ? renderFinalSalvoStage(room,salvo,available) : ''}<div class="battle-maps" data-map-count="${1+opponents.length}">${renderOwnMapCard(room)}${opponents.map(id=>renderEnemyMapCard(room,id)).join('')}</div><div class="feedback-slot">${renderLatestFeedback(room) || '<p class="feedback-empty">海域已同步。行动结果将显示在这里。</p>'}</div></div></div>${final ? '' : `<div class="armory-plinth">${renderArmorySource(room)}${renderActionPanel(room)}${renderBridgeCommandDeck(room)}</div>`}${drawer !== 'none' ? '<button class="battle-drawer-scrim" data-action="close-battle-drawers" aria-label="关闭战术侧边栏"></button>' : ''}${renderPublicLog(room)}<nav class="mobile-console-nav" aria-label="战术导航"><button data-action="toggle-action-drawer" aria-expanded="${state.battle.actionDrawerOpen}">${uiIcon('action-radar')}<span>行动</span></button><button data-action="toggle-fleet" aria-expanded="${state.battle.fleetOpen}">${uiIcon('ship-aircraft-carrier')}<span>舰队${state.battle.ownMapAlert ? ' · 新' : ''}</span></button><button data-action="set-event-channel" data-channel="private">${uiIcon('status-private')}<span>情报</span></button><button data-action="set-event-channel" data-channel="combat">${uiIcon('status-hit')}<span>日志</span></button></nav></section>`;
  }

  function renderFleetPanel(room) {
    const own = room.battle.own;
    const units = [...own.units].sort((a,b)=>(a.type === Data.UNIT_TYPES.AIRCRAFT_CARRIER ? -1 : b.type === Data.UNIT_TYPES.AIRCRAFT_CARRIER ? 1 : 0));
    return `<aside class="fleet-panel ${state.battle.fleetOpen ? 'fleet-panel--open' : ''}" aria-label="己方舰队"><header class="console-panel-heading"><div><span class="eyebrow">己方完整情报</span><h2>舰队状态</h2></div><button class="drawer-close icon-button" data-action="close-battle-drawers" aria-label="关闭舰队面板">×</button></header><div class="fleet-list" data-scroll-key="fleet">${units.map(unit=>{const def=Data.getUnitDefinitionById(unit.id)??Data.getUnitDefinitionByType(unit.type);return `<article class="fleet-unit unit-status" data-unit-id="${escapeHtml(unit.id)}" data-unit-state="${unitStateCode(unit,def)}"><div class="fleet-unit__identity">${uiIcon(unitIconName(unit.type))}<strong>${escapeHtml(def.name)}</strong><span class="hp-meter"><b>${Model.formatHp(unit.hp)}</b><small> / ${def.initialHp}</small></span></div><div class="hp-track"><i data-hp-percent="${Math.round(unit.hp/def.initialHp*100)}"></i></div><small>${escapeHtml(unitStatusText(unit,def))}</small>${unitResourceBadges(own,unit) ? `<details><summary>资源明细</summary><div class="unit-resource-row">${unitResourceBadges(own,unit)}</div></details>`:''}</article>`}).join('')}<div class="decoy-status"><strong>诱饵鱼雷</strong><span>${own.decoys.filter(d=>!d.destroyed).length} / ${own.decoys.length}</span></div></div><div class="fleet-links"><button data-action="switch-map" data-map="own">查看己方海域</button><button data-action="set-event-channel" data-channel="private">私人情报</button><button data-action="set-event-channel" data-channel="combat">战斗日志</button></div></aside>`;
  }
