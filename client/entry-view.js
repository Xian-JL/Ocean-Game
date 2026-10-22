  function renderEntryPage() {
    const stored = readStoredSession();
    const pending = state.pendingRequest;
    const roomCode = escapeHtml(state.entry.roomCode);
    const online = state.connection.phase === "online";
    return `
      <section class="entry-page entry-page--v07 page-enter" aria-labelledby="entry-title">
        <div class="entry-hero entry-hero--v07">
          <div class="entry-hero__badge"><span></span> 回合制海域对抗</div>
          <h1 id="entry-title">OCEAN</h1>
          <p class="entry-hero__tagline">静默海域。<br>精确指挥。</p><p class="entry-hero__description">部署你的舰队，解读有限的情报。<br>每一次行动，都由你决定。</p>
          <div class="entry-hero__visual" aria-hidden="true">
            <span class="hero-sonar hero-sonar--one"></span>
            <span class="hero-sonar hero-sonar--two"></span>
            <span class="hero-sonar hero-sonar--three"></span>
            <i></i>
          </div>
          <div class="entry-facts entry-facts--v07" aria-label="游戏特征">
            <span><strong>10–15</strong> 海域</span>
            <span><strong>2–3</strong> 玩家</span>
            <span><strong>90s</strong> 回合</span>
          </div>
        </div>

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
                <span class="status-kicker">进入战场</span>
                <h2>建立作战连线</h2>
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

            <button class="button button--secondary" type="button" data-action="training-open">训练营 · 全情况练习</button>\n            <form id="create-form" class="create-room-panel">
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
                ${pending === "create" ? '<span class="button-spinner" aria-hidden="true"></span> 创建中…' : '创建房间 <span aria-hidden="true">→</span>'}
              </button>
              <button class="button button--secondary tutorial-entry-button" type="button" data-action="start-tutorial" ${pending ? "disabled" : ""}>
                <span aria-hidden="true">◇</span><span><strong>完整交互教程</strong><small>${readTutorialProgress().length === Tutorial.LESSONS.length ? "已完成，可随时复习" : "五章训练 · 无需创建房间"}</small></span>
              </button>
            </form>

            <div class="entry-divider entry-divider--clean"><span>加入已有房间</span></div>

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
            </form>
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
          <p class="eyebrow">${escapeHtml(options.kicker ?? "PRIVATE MATCH")}</p>
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
                <span class="seat-card__number">0${index + 1}</span>
                <div><strong>等待玩家</strong><small>席位尚未占用</small></div>
                <span class="seat-status">空闲</span>
              </article>`;
          }
          const own = seat.playerId === room.own.playerId;
          return `
            <article class="seat-card ${own ? "seat-card--own" : ""}">
              <span class="seat-card__number">0${index + 1}</span>
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
          kicker: `${capacity === 3 ? "3 PLAYER FFA" : "2 PLAYER MATCH"}`,
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
