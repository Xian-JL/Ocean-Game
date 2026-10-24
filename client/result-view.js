  function resultCarrierHp(replay, playerId) {
    const carrier = replay?.players?.[playerId]?.units?.find(
      (unit) => unit.type === Data.UNIT_TYPES.AIRCRAFT_CARRIER,
    );
    return carrier?.hp ?? null;
  }

  function renderReplayUnitList(snapshot) {
    return `
      <div class="replay-unit-list">
        ${(snapshot?.units ?? []).map((unit) => {
          const definition = Data.getUnitDefinitionById(unit.id) ?? Data.getUnitDefinitionByType(unit.type);
          return `
            <article>
              <span>${escapeHtml(definition.shortName)}</span>
              <div><strong>${escapeHtml(definition.name)}</strong><small>${unit.hp <= 0 ? "已沉没" : unit.paralyzed ? "瘫痪" : "存活"} · 受击格 ${unit.hitCells.length}</small></div>
              <b>${Model.formatHp(unit.hp)} / ${definition.initialHp}</b>
            </article>`;
        }).join("")}
        <article>
          <span>雷</span><div><strong>诱饵鱼雷</strong><small>最终有效数量</small></div>
          <b>${snapshot?.decoys?.filter((decoy) => !decoy.destroyed).length ?? 0} / ${snapshot?.decoys?.length ?? 0}</b>
        </article>
      </div>
      <div class="replay-resources" aria-label="最终剩余弹药与使用次数">
        ${Data.ACTION_DEFINITIONS.filter((action) => action.initialUses !== null).map((action) => `
          <span><b>${escapeHtml(action.name)}</b>${snapshot?.remainingUses?.[action.type] ?? 0} / ${action.initialUses}</span>`).join("")}
      </div>`;
  }

  function actualTargetText(cellResult) {
    if (!cellResult) return "";
    if (cellResult.actualTargetKind === "empty") return "空海域";
    if (cellResult.actualTargetKind === "decoy") return "诱饵鱼雷";
    if (cellResult.actualTargetKind === "destroyed_decoy") return "已摧毁诱饵鱼雷";
    if (cellResult.actualTargetKind === "wreck") return "残骸";
    if (cellResult.targetUnitType) {
      return (Data.getUnitDefinitionById(cellResult.targetUnitId) ?? Data.getUnitDefinitionByType(cellResult.targetUnitType))?.name ?? "作战单位";
    }
    return cellResult.actualTargetKind ?? "";
  }

  function replayActionDetail(record, room) {
    const action = Data.getActionDefinition(record.action.actionType);
    const outcome = record.outcome ?? {};
    const details = [];
    if (outcome.cellResult) {
      details.push(
        `${outcome.cellResult.result === "hit" ? "命中" : "未命中"}：${actualTargetText(outcome.cellResult)}`,
      );
    }
    if (Array.isArray(outcome.cellResults)) {
      const hits = outcome.cellResults.filter((cell) => cell.result === "hit").length;
      details.push(`逐格结果：命中 ${hits}，未命中 ${outcome.cellResults.length - hits}`);
    }
    if (typeof outcome.detected === "boolean") {
      details.push(outcome.detected ? "探测到水下信号" : "未探测到水下信号");
    }
    if (Array.isArray(outcome.affectedUnitIds)) {
      details.push(`实际影响 ${outcome.affectedUnitIds.length} 个水下作战单位`);
    }
    for (const damage of outcome.damageEvents ?? []) {
      const unit = Data.getUnitDefinitionById(damage.unitId) ?? Data.getUnitDefinitionByType(damage.unitType);
      details.push(
        `${Model.nicknameFor(room, damage.playerId)}的${unit?.name ?? damage.unitId}：${Model.formatHp(damage.beforeHp)} → ${Model.formatHp(damage.afterHp)}`,
      );
    }
    for (const decoy of outcome.decoyEvents ?? []) {
      if (decoy.destroyed) details.push(`诱饵鱼雷 ${decoy.cell} 被摧毁`);
    }
    return {
      title: `${Model.nicknameFor(room, record.actorId)} 使用${action?.name ?? record.action.actionType}`,
      target: Model.formatTarget(record.action.target),
      details,
    };
  }

  function renderFullReplayLog(room) {
    const log = room.battle.replay?.actionLog ?? [];
    return `
      <ol class="replay-log">
        ${log.length === 0 ? '<li class="empty-state">本局没有已完成的正式行动。</li>' : log.map((record) => {
          const detail = replayActionDetail(record, room);
          return `
            <li>
              <span class="replay-log__sequence">${record.sequence}</span>
              <div>
                <strong>${escapeHtml(detail.title)}</strong>
                <small>目标 ${escapeHtml(detail.target)}</small>
                ${detail.details.length ? `<ul>${detail.details.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>` : ""}
              </div>
            </li>`;
        }).join("")}
      </ol>`;
  }

  function renderFinalSalvoReplay(room) {
    const finalSalvo = room.battle.replay?.finalSalvo;
    if (!finalSalvo) return "";
    return `
      <section class="salvo-replay">
        <div class="panel-heading"><span>终局手动鱼雷记录</span><small>逐轮同时结算</small></div>
        <div class="salvo-shot-list">
          ${finalSalvo.shots.map((shot) => `
            <article>
              <span>${escapeHtml(Model.nicknameFor(room, shot.sourcePlayerId))}</span>
              <strong>${escapeHtml(shot.sourceCoordinate)} → ${escapeHtml(shot.targetCoordinate)}</strong>
              <em data-result="${shot.result}">${shot.result === "hit" ? `命中 ${escapeHtml((Data.getUnitDefinitionById(shot.targetUnitId) ?? Data.getUnitDefinitionByType(shot.targetUnitType))?.name ?? "作战单位")}` : "未命中"}</em>
            </article>`).join("")}
        </div>
      </section>`;
  }

  function resultIconName(code) {
    if (code === "win") return "status-win";
    if (code === "loss") return "status-loss";
    return "status-draw";
  }

  function renderResultPlayers(room, result, replay) {
    return `
      <section class="result-player-panel" aria-label="玩家终局状态">
        <div class="panel-heading"><span>玩家状态</span><small>航空母舰最终生命值</small></div>
        <div class="result-player-grid">
          ${room.seats.map((seat) => {
            const winner = seat.playerId === result?.winnerId;
            const own = seat.playerId === room.own.playerId;
            const hp = resultCarrierHp(replay, seat.playerId);
            return `<article class="result-player-card ${winner ? "result-player-card--winner" : ""}" data-winner="${winner}" data-own="${own}">
              <span class="result-player-card__icon" aria-hidden="true">${uiIcon(winner ? "status-win" : "ship-aircraft-carrier")}</span>
              <div class="result-player-card__identity"><strong>${escapeHtml(seat.nickname)}${own ? "（你）" : ""}</strong><small>${winner ? "胜者" : "对局结束"}</small></div>
              <div class="result-player-card__hp"><strong>${Model.formatHp(hp)}</strong><small>航母 HP</small></div>
            </article>`;
          }).join("")}
        </div>
      </section>`;
  }

  function renderRematchPanel(room) {
    const requested = new Set(room.rematch.requestedPlayerIds ?? []);
    const readyCount = room.seats.filter((seat) => requested.has(seat.playerId)).length;
    return `
      <section class="rematch-panel rematch-panel--v075" aria-labelledby="rematch-title">
        <div class="rematch-panel__heading">
          <div><span class="status-kicker">REMATCH</span><h2 id="rematch-title">再来一局</h2></div>
          <span class="rematch-progress">${readyCount} / ${room.seats.length} 已确认</span>
        </div>
        <div class="rematch-player-grid">
          ${room.seats.map((seat) => {
            const own = seat.playerId === room.own.playerId;
            const ready = requested.has(seat.playerId);
            return `<div class="rematch-player" data-ready="${ready}" data-own="${own}">
              <span aria-hidden="true">${uiIcon(ready ? "status-rematch" : "status-unknown")}</span>
              <div><strong>${escapeHtml(seat.nickname)}${own ? "（你）" : ""}</strong><small>${ready ? "已申请" : seat.isBot ? "将在你申请后自动确认" : "等待确认"}</small></div>
            </div>`;
          }).join("")}
        </div>
        <div class="rematch-panel__actions">
          ${room.rematch.ownRequested
            ? `<button class="button button--secondary" data-action="cancel-rematch" ${state.pendingRequest ? "disabled" : ""}>取消申请</button>`
            : `<button class="button button--primary" data-action="request-rematch" ${state.pendingRequest ? "disabled" : ""}>再来一局</button>`}
          <button class="button button--danger-quiet" data-action="leave-room">离开房间</button>
        </div>
      </section>`;
  }

  function renderFinishedPage() {
    const room = state.room;
    const result = room.battle?.match?.result;
    const relative = Model.resultForViewer(result, room.own.playerId);
    const replay = room.battle?.replay;
    const selectedPlayerId = replay?.players?.[state.replayPlayerId]
      ? state.replayPlayerId
      : room.own.playerId;
    const selectedSnapshot = replay?.players?.[selectedPlayerId];
    return `
      <section class="finished-page finished-page--v075 page-enter" data-result="${relative.code}" aria-labelledby="result-title">
        <header class="result-hero result-hero--v075">
          <span class="result-emblem result-emblem--v075" aria-hidden="true">${uiIcon(resultIconName(relative.code))}</span>
          <div class="result-hero__content">
            <span class="status-kicker">MATCH COMPLETE</span>
            <h1 id="result-title">${escapeHtml(relative.title)}</h1>
            <p>${escapeHtml(Model.endReasonForViewer(result, room.own.playerId))}</p>
            <div class="result-hero__facts">
              <span><b>${room.matchSummary.turnCount}</b> 回合</span>
              <span><b>${escapeHtml(Model.formatDuration(room.matchSummary.durationMs))}</b> 对局时长</span>
              <span><b>${room.seats.length}</b> 名玩家</span>
            </div>
          </div>
          <button class="button button--quiet result-hero__replay-link" type="button" data-action="focus-replay">查看复盘</button>
        </header>

        ${renderResultPlayers(room, result, replay)}
        ${state.training?.session ? renderTrainingFinishActions() : renderRematchPanel(room)}

        <div class="replay-layout replay-layout--v075" id="match-replay" tabindex="-1">
          <section class="replay-map-panel">
            <div class="panel-heading"><span>完整部署复盘</span><small>结算后公开真实身份</small></div>
            <div class="replay-tabs" role="tablist" aria-label="复盘玩家地图">
              ${room.seats.map((seat) => `
                <button role="tab" aria-selected="${seat.playerId === selectedPlayerId}" class="${seat.playerId === selectedPlayerId ? "is-active" : ""}" data-action="select-replay-player" data-player-id="${escapeHtml(seat.playerId)}">
                  ${escapeHtml(seat.nickname)}${seat.playerId === room.own.playerId ? "（你）" : ""}
                </button>`).join("")}
            </div>
            ${selectedSnapshot ? renderOwnBattleBoard(selectedSnapshot, {
              label: `${Model.nicknameFor(room, selectedPlayerId)}的最终部署`,
              replay: true,
            }) : '<p class="empty-state">没有可显示的部署复盘。</p>'}
            ${renderReplayUnitList(selectedSnapshot)}
          </section>

          <section class="replay-record-panel">
            <div class="panel-heading"><span>完整行动复盘</span><small>包含结算后揭示信息</small></div>
            ${renderFullReplayLog(room)}
          </section>
        </div>

        ${renderFinalSalvoReplay(room)}

        <details class="public-log-after-match">
          <summary>查看对局中各玩家当时可见的公开记录</summary>
          ${renderPublicLog(room, { publicOnly: true })}
        </details>
      </section>`;
  }

  function renderClosedPage() {
    const room = state.room;
    return `
      <section class="closed-page page-enter" aria-labelledby="closed-title">
        <div class="closed-symbol" aria-hidden="true">×</div>
        <p class="eyebrow">O05 / 房间关闭</p>
        <h1 id="closed-title">本房间已关闭</h1>
        <p>${escapeHtml(Model.closedReasonText(room?.closedReason))}</p>
        <div class="closed-meta"><span>房间 ${escapeHtml(room?.roomCode ?? "—")}</span><span>本机恢复凭证已清除</span></div>
        <button class="button button--primary" data-action="return-home">返回进入游戏页</button>
      </section>`;
  }

  function earliestReconnectDeadline(room) {
    const deadlines = Object.values(
      room?.deadlines?.reconnectDeadlineAtByPlayer ?? {},
    ).filter((value) => typeof value === "number");
    return deadlines.length ? Math.min(...deadlines) : null;
  }

  function renderBlockingOverlay() {
    if(state.training?.active && state.training.session){blockingOverlay.hidden=true;blockingOverlay.innerHTML="";return;}
    if (state.restoring) {
      blockingOverlay.hidden = false;
      blockingOverlay.innerHTML = `
        <section class="pause-card pause-card--connection" role="alertdialog" aria-modal="true" aria-labelledby="restore-title">
          <div class="pause-card__icon" data-kind="sync" aria-hidden="true">↻</div>
          <span class="connection-status-chip" data-state="syncing">同步中</span>
          <h2 id="restore-title">正在恢复对局</h2>
          <p>等待服务器同步</p>
        </section>`;
      return;
    }
    if (!state.connected && state.room) {
      blockingOverlay.hidden = false;
      blockingOverlay.innerHTML = `
        <section class="pause-card pause-card--connection" role="alertdialog" aria-modal="true" aria-labelledby="offline-title">
          <div class="pause-card__icon" data-kind="offline" aria-hidden="true">⌁</div>
          <span class="connection-status-chip" data-state="offline">连接中断</span>
          <h2 id="offline-title">正在重新连接</h2>
          <p>操作暂时锁定</p>
        </section>`;
      return;
    }
    const room = state.room;
    if (!room || room.connectionPhase === "CONNECTED" || room.roomPhase === "CLOSED") {
      blockingOverlay.hidden = true;
      blockingOverlay.innerHTML = "";
      return;
    }
    const offlineSeats = room.seats.filter((seat) => !seat.online);
    const offlineNames = offlineSeats.map((seat) => seat.nickname).join("、");
    const deadline = earliestReconnectDeadline(room);
    const beforeMatch = ["WAITING", "DEPLOYING", "ROLLING"].includes(room.roomPhase);
    const playing = room.roomPhase === "PLAYING";
    const finished = room.roomPhase === "FINISHED";
    blockingOverlay.hidden = false;
    blockingOverlay.innerHTML = `
      <section class="pause-card pause-card--connection" role="alertdialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="pause-card__icon" data-kind="paused" aria-hidden="true">Ⅱ</div>
        <span class="connection-status-chip" data-state="offline">${escapeHtml(offlineNames)} 已断线</span>
        <h2 id="pause-title">${playing ? `${escapeHtml(offlineNames)} 离线，行动计时已冻结` : "等待离线玩家重连"}</h2>
        <p>${playing ? `当前行动倒计时停在 ${formatCountdown(Math.ceil((room.connection?.pausedTimer?.remainingMs ?? 0) / 1_000))}，重连后从此处继续。` : "房间流程保持冻结，不会消耗准备或投掷时间。"}</p>
        ${deadline ? `<div class="reconnect-timer reconnect-timer--v074"><span>重连剩余</span><strong data-deadline="${deadline}">—</strong></div>` : '<div class="reconnect-timer reconnect-timer--v074"><span>状态</span><strong>等待在线</strong></div>'}
        <div class="pause-player-list">${offlineSeats.map((seat) => `<span><i></i>${escapeHtml(seat.nickname)}<small>离线</small></span>`).join("")}</div>
        <div class="modal__actions">
          ${beforeMatch ? '<button class="button button--danger-quiet" data-action="leave-room">离开房间</button>' : ""}
          ${playing ? '<button class="button button--danger" data-action="surrender-and-leave">投降并离开</button>' : ""}
          ${finished ? '<button class="button button--danger-quiet" data-action="leave-room">离开房间</button>' : ""}
          ${room.roomPhase === "FINAL_SALVO" ? '<button class="button button--secondary" disabled>等待终局结算</button>' : ""}
        </div>
      </section>`;
  }
