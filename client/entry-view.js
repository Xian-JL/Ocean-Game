  function renderEntryPage() {
    const stored = readStoredSession();
    const pending = state.pendingRequest;
    const roomCode = escapeHtml(state.entry.roomCode);
    const online = state.connection.phase === "online";
    return `
      <section class="entry-page entry-page--armory page-enter" aria-labelledby="entry-title">
        <picture class="drydock-art" aria-hidden="true"><source media="(max-width:700px)" srcset="/assets/images/armory/drydock-mobile-480.webp?v=${encodeURIComponent(Data.ASSET_VERSION)} 480w, /assets/images/armory/drydock-mobile-720.webp?v=${encodeURIComponent(Data.ASSET_VERSION)} 720w, /assets/images/armory/drydock-mobile.webp?v=${encodeURIComponent(Data.ASSET_VERSION)} 900w" sizes="100vw"><img src="/assets/images/armory/drydock-desktop.webp?v=${encodeURIComponent(Data.ASSET_VERSION)}" srcset="/assets/images/armory/drydock-desktop-960.webp?v=${encodeURIComponent(Data.ASSET_VERSION)} 960w, /assets/images/armory/drydock-desktop-1440.webp?v=${encodeURIComponent(Data.ASSET_VERSION)} 1440w, /assets/images/armory/drydock-desktop.webp?v=${encodeURIComponent(Data.ASSET_VERSION)} 1920w" sizes="100vw" alt="" fetchpriority="high" width="1920" height="1080"></picture>
        <div class="entry-hero"><div class="entry-hero__badge">回合制海域对抗</div><h1 id="entry-title"><img src="/assets/icons/armory-wordmark.svg?v=${encodeURIComponent(Data.ASSET_VERSION)}" alt="" width="440" height="96"><span class="sr-only">OCEAN</span></h1><p class="entry-hero__tagline">静海之下，战意已铸。</p><p class="entry-hero__description">秘密部署 · 回合指令 · 情报博弈</p><div class="entry-keel" aria-hidden="true"><span></span>黑潮军械库</div></div>
        <div class="entry-console entry-console--v07">
          <p class="entry-volatile-notice" role="note">服务器维护或重启会中断正在进行的房间；当前对局暂不支持跨重启恢复。</p>
          ${!online ? `
            <article class="connection-help connection-help--compact" role="status" aria-live="polite">
              <span class="connection-help__signal" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(state.connection.phase === "offline" ? "连接已中断" : "正在连接服务器")}</strong>
                <p>${escapeHtml(state.connection.message)}</p>
              </div>
              <button class="button button--quiet button--compact" data-action="retry-connection">重试</button>
            </article>` : ""}

          ${stored ? `
            <article class="restore-card restore-card--v07">
              <div class="restore-card__status" aria-hidden="true">↻</div>
              <div>
                <span class="status-kicker">可恢复对局</span>
                <strong>${escapeHtml(stored.roomCode)}</strong>
              </div>
              <div class="restore-card__actions">
                <button class="button button--primary button--compact" data-action="restore-session" ${!state.connected || pending ? "disabled" : ""}>
                  ${state.restoring ? "恢复中…" : "继续"}
                </button>
                <button class="icon-button icon-button--small" data-action="dismiss-session" ${pending ? "disabled" : ""} aria-label="忽略恢复记录" data-tooltip="忽略">×</button>
              </div>
            </article>` : ""}

          <div class="entry-form-card entry-form-card--v07">
            <div class="entry-form-card__header entry-form-card__header--v07">
              <div>
                <span class="status-kicker">舰坞 · 作战</span>
                <h2>出征整备</h2>
              </div>
              <button class="icon-button icon-button--small" type="button" data-action="open-rules" aria-label="打开游戏说明" data-tooltip="游戏说明">?</button>
            </div>

            <label class="field field--modern">
              <span>昵称</span>
              <input
                id="nickname-input"
                aria-describedby="nickname-count${state.entry.error ? " entry-error" : ""}"
                aria-invalid="${Boolean(state.entry.error && !validateNickname(state.entry.nickname).valid)}"
                name="nickname"
                maxlength="24"
                autocomplete="nickname"
                placeholder="输入昵称"
                value="${escapeHtml(state.entry.nickname)}"
                ${pending ? "disabled" : ""}
              />
              <small><span id="nickname-count">${Array.from(state.entry.nickname).length}</span>/12</small>
            </label>

            ${state.entry.error ? `<p id="entry-error" class="form-error" role="alert">${escapeHtml(state.entry.error)}</p>` : ""}

            <form id="create-form" class="create-room-panel">
              <div class="mode-switch" role="radiogroup" aria-label="对战模式">
                <button
                  type="button"
                  class="mode-switch__option ${state.entry.roomMode === "pvp" && state.entry.maxPlayers === 2 ? "is-active" : ""}"
                  role="radio"
                  aria-checked="${state.entry.roomMode === "pvp" && state.entry.maxPlayers === 2}"
                  data-action="select-mode"
                  data-max-players="2"
                  data-room-mode="pvp"
                  ${!state.connected || pending ? "disabled" : ""}
                >
                  <span>2 人</span><small>对战</small>
                </button>
                <button
                  type="button"
                  class="mode-switch__option ${state.entry.roomMode === "pvp" && state.entry.maxPlayers === 3 ? "is-active" : ""}"
                  role="radio"
                  aria-checked="${state.entry.roomMode === "pvp" && state.entry.maxPlayers === 3}"
                  data-action="select-mode"
                  data-max-players="3"
                  data-room-mode="pvp"
                  ${!state.connected || pending ? "disabled" : ""}
                >
                  <span>3 人</span><small>自由战</small>
                </button>
                <button
                  type="button"
                  class="mode-switch__option ${state.entry.roomMode === "bot_duel" ? "is-active" : ""}"
                  role="radio"
                  aria-checked="${state.entry.roomMode === "bot_duel"}"
                  data-action="select-mode"
                  data-max-players="2"
                  data-room-mode="bot_duel"
                  ${!state.connected || pending ? "disabled" : ""}
                >
                  <span>人机</span><small>1v1</small>
                </button>
              </div>
              ${state.entry.roomMode === "bot_duel" ? `
                <div class="bot-difficulty-picker">
                  <div class="bot-difficulty-picker__heading">
                    <span>机器人难度</span><small>三档均遵守相同规则与情报权限</small>
                  </div>
                  <div class="bot-difficulty-switch" role="radiogroup" aria-label="机器人难度">
                    ${[
                      { value: "beginner", label: "新手", hint: "合法行动中偏随机选择" },
                      { value: "standard", label: "标准", hint: "利用命中与侦察情报" },
                      { value: "expert", label: "专家", hint: "分析热区、延伸和资源" },
                    ].map((difficulty) => `<button
                      type="button"
                      class="bot-difficulty-switch__option ${state.entry.botDifficulty === difficulty.value ? "is-active" : ""}"
                      role="radio"
                      aria-checked="${state.entry.botDifficulty === difficulty.value}"
                      data-action="select-bot-difficulty"
                      data-bot-difficulty="${difficulty.value}"
                      ${!state.connected || pending ? "disabled" : ""}
                    ><strong>${difficulty.label}</strong><small>${difficulty.hint}</small></button>`).join("")}
                  </div>
                </div>` : ""}
              <div class="map-size-picker">
                <span>地图大小</span>
                <div class="map-size-switch" role="radiogroup" aria-label="地图大小">
                  ${Data.SUPPORTED_MAP_SIZES.map((mapSize) => `
                    <button
                      type="button"
                      class="map-size-switch__option ${state.entry.mapSize === mapSize ? "is-active" : ""}"
                      role="radio"
                      aria-checked="${state.entry.mapSize === mapSize}"
                      data-action="select-map-size"
                      data-map-size="${mapSize}"
                      ${!state.connected || pending ? "disabled" : ""}
                    ><strong>${mapSize}×${mapSize}</strong><small>${mapSize === 10 ? "紧凑" : mapSize === 12 ? "标准" : "广域"}</small></button>`).join("")}
                </div>
              </div>
              <button class="button button--primary button--large" type="submit" ${!state.connected || pending ? "disabled" : ""}>
                ${pending === "create" ? '<span class="button-spinner" aria-hidden="true"></span> 创建中…' : '创建战局 <span aria-hidden="true">→</span>'}
              </button>
            </form>

            <details class="join-disclosure" ${roomCode ? "open" : ""}><summary>加入已有战局</summary>

            <form id="join-form" class="join-form join-form--v07">
              <label class="field field--code field--modern">
                <span class="sr-only">6 位房间码</span>
                <input
                  id="room-code-input"
                  name="roomCode"
                  maxlength="6"
                  inputmode="text"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="输入 6 位房间码"
                  value="${roomCode}"
                  ${pending ? "disabled" : ""}
                />
              </label>
              <button class="button button--secondary" type="submit" ${!state.connected || pending ? "disabled" : ""}>
                ${pending === "join" ? '<span class="button-spinner" aria-hidden="true"></span> 加入中…' : "加入"}
              </button>
            </form></details>
            <div class="entry-secondary-actions"><button type="button" data-action="training-open">核心战斗训练 <span aria-hidden="true">↗</span></button><button type="button" data-action="start-tutorial">五章交互教程</button></div>
          </div>
        </div>
      </section>`;
  }

  function renderRoomTop(title, subtitle, options = {}) {
    const room = state.room;
    const deadline = options.deadline;
    return `
      <header class="room-topbar">
        <div>
          <p class="eyebrow">${escapeHtml(options.kicker ?? "舰坞 · 私人战局")}</p>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <div class="room-topbar__meta">
          ${deadline ? `
            <div class="timer-card">
              <span>${escapeHtml(options.timerLabel ?? "剩余时间")}</span>
              <strong data-deadline="${deadline}">—</strong>
            </div>` : ""}
          <div class="room-code-card">
            <span>房间码</span>
            <strong>${escapeHtml(room.roomCode)}</strong>
            <button class="text-button" data-action="copy-room">复制</button>
          </div>
        </div>
      </header>`;
  }

  function renderSeats(room, compact = false) {
    return `
      <div class="seat-list ${compact ? "seat-list--compact" : ""}">
        ${Array.from({ length: room.maxPlayers ?? 2 }, (_, index) => {
          const seat = room.seats[index];
          if (!seat) {
            return `
              <article class="seat-card seat-card--empty">
                <span class="seat-card__number">0${index + 1}</span><span class="seat-crest" aria-hidden="true"></span>
                <div><strong>等待玩家</strong><small>席位尚未占用</small></div>
                <span class="seat-status">空闲</span>
              </article>`;
          }
          const own = seat.playerId === room.own.playerId;
          return `
            <article class="seat-card ${own ? "seat-card--own" : ""}">
              <span class="seat-card__number">0${index + 1}</span><span class="seat-crest" aria-hidden="true"></span>
              <div>
                <strong>${escapeHtml(seat.nickname)} ${own ? "<em>你</em>" : ""}</strong>
                <small>${seat.ready ? (seat.autoPrepared ? "服务器已自动准备" : "舰队已准备") : "尚未准备"}</small>
              </div>
              <span class="seat-status" data-online="${seat.online}">
                <i></i>${seat.online ? "在线" : "离线"}
              </span>
            </article>`;
        }).join("")}
      </div>`;
  }

  function renderWaitingPage() {
    const room = state.room;
    const inviteUrl = `${window.location.origin}/?room=${room.roomCode}`;
    const occupied = room.seats.length;
    const capacity = room.maxPlayers ?? 2;
    return `
      <section class="waiting-page waiting-page--v07 page-enter" aria-labelledby="waiting-title">
        ${renderRoomTop("等待玩家", `${occupied} / ${capacity} 已加入`, {
          kicker: `${capacity === 3 ? "三人自由战" : "双人对战"}`,
        })}

        <div class="waiting-layout waiting-layout--v07">
          <section class="lobby-room-card" aria-label="房间邀请">
            <span class="status-kicker">房间码</span>
            <strong class="lobby-room-code">${escapeHtml(room.roomCode)}</strong>
            <div class="lobby-room-actions">
              <button class="button button--primary" data-action="copy-room">复制房间码</button>
              <button class="button button--secondary" data-action="share-invite">分享邀请</button>
            </div>
            <div class="lobby-link" title="${escapeHtml(inviteUrl)}">
              <span aria-hidden="true">↗</span>
              <code>${escapeHtml(inviteUrl)}</code>
              <button class="icon-button icon-button--small" data-action="copy-invite" aria-label="复制邀请链接" data-tooltip="复制链接">⧉</button>
            </div>
          </section>

          <section class="waiting-panel waiting-panel--v07" aria-labelledby="waiting-title">
            <div class="waiting-panel__heading">
              <div>
                <span class="status-kicker">玩家</span>
                <h2 id="waiting-title">${occupied} / ${capacity}</h2>
              </div>
              <span class="lobby-wait-indicator" aria-live="polite">
                <i></i>${occupied < capacity ? "等待加入" : "准备开始"}
              </span>
            </div>
            ${renderSeats(room)}
            <div class="waiting-panel__footer">
              <button class="button button--danger-quiet" data-action="leave-room">离开房间</button>
              <button class="button button--quiet" data-action="open-rules">游戏说明</button>
            </div>
          </section>
        </div>
      </section>`;
  }
