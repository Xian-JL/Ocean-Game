  function tutorialTargetCoordinate(session, lessonId) {
    if (lessonId === "deployment" && session.step === 0) return "B2";
    if (lessonId === "damage") return "D6";
    if (lessonId === "intelligence") {
      if (session.step === 0) return "C3";
      if (session.step === 2) return "E5";
      if (session.step === 4) return "H8";
    }
    if (lessonId === "secrecy") {
      return session.step === 0 ? "G7" : session.step === 1 ? "H8" : "F6";
    }
    return null;
  }

  function renderTutorialBoard(session, lessonId) {
    const targetCoordinate = tutorialTargetCoordinate(session, lessonId);
    return renderGrid("教程训练海域", (coordinate) => {
      const classes = ["tutorial-board-cell"];
      let content = "";
      let stateText = "未知海域";
      if (coordinate === targetCoordinate) {
        classes.push("tutorial-board-cell--target");
        stateText = "当前任务目标";
      }
      if (lessonId === "deployment" && session.deployment.cells.includes(coordinate)) {
        classes.push("tutorial-board-cell--ship");
        content = "驱";
        stateText = "己方驱逐舰Ⅰ";
      }
      if (lessonId === "damage") {
        if (session.damage.hitCells.includes(coordinate)) {
          classes.push("board-cell--enemy-hit", "tutorial-board-cell--settled");
          content = '<span class="enemy-result">✦</span>';
          stateText = "命中，已经受过一次伤害";
        }
        if (session.damage.nuclearCells.includes(coordinate)) {
          classes.push("board-cell--missile");
          content += '<span class="tutorial-weapon-glyph">☢</span>';
          stateText = "核弹已投放，不重复扣血";
        }
      }
      if (lessonId === "intelligence") {
        if (session.intelligence.radarCells.includes(coordinate)) {
          classes.push("tutorial-board-cell--radar");
          stateText = "雷达扫描区域";
        }
        if (session.intelligence.detectionCells.includes(coordinate)) {
          classes.push("board-cell--intel-detection");
          stateText = "探测弹区域";
        }
        if (session.intelligence.markers[coordinate] === "underwater_yes") {
          classes.push("board-cell--marker", "board-cell--marker-underwater_yes");
          content = '<span class="marker-half marker-half--top"></span><span class="marker-half marker-half--bottom"></span>';
          stateText = "本机标记：水下有目标";
        }
      }
      if (lessonId === "secrecy") {
        if (session.secrecy.shockCells.includes(coordinate)) {
          classes.push("board-cell--intel-shock");
          stateText = "震爆弹作用区域";
        }
        if (session.secrecy.missileCells.includes(coordinate)) {
          classes.push("board-cell--missile");
          content = '<span class="missile-glyph">↗</span>';
          stateText = "潜射导弹已发射";
        }
        if (session.secrecy.nuclearCells.includes(coordinate)) {
          classes.push("board-cell--missile");
          content = '<span class="missile-glyph">☢</span>';
          stateText = "核弹已投放";
        }
      }
      return {
        classes,
        content,
        label: `${coordinate}，${stateText}`,
        attributes: {
          "data-action": "tutorial-cell",
          "data-coordinate": coordinate,
        },
      };
    }, "tutorial-board-frame");
  }

  function tutorialToolButton(value, label, selected, options = {}) {
    return `<button
      type="button"
      class="tutorial-tool ${selected ? "is-selected" : ""}"
      data-action="tutorial-select"
      data-value="${escapeHtml(value)}"
      ${options.disabled ? "disabled" : ""}
      aria-pressed="${selected}"
    ><span>${escapeHtml(options.glyph ?? "•")}</span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(options.hint ?? "")}</small></button>`;
  }

  function renderTutorialDeployment(session) {
    return `
      <div class="tutorial-simulator">
        <section class="tutorial-stage-card">
          <div class="tutorial-tool-row">
            ${tutorialToolButton("destroyer", "驱逐舰Ⅰ", true, { glyph: "驱", hint: "3 格直线" })}
            <button class="tutorial-tool" type="button" data-action="tutorial-rotate" ${session.step !== 1 ? "disabled" : ""}>
              <span>↻</span><strong>旋转</strong><small>${session.deployment.orientation === "horizontal" ? "当前横向" : "当前纵向"}</small>
            </button>
          </div>
          ${renderTutorialBoard(session, "deployment")}
        </section>
        <aside class="tutorial-concept-card">
          <span class="status-kicker">部署原则</span>
          <h3>先形状，后位置</h3>
          <ul>
            <li>驱逐舰与海盗船只能形成水平或垂直直线。</li>
            <li>潜水艇和核潜艇固定为完整 2×2。</li>
            <li>航空母舰占格必须全部四向连通。</li>
            <li>作战单位与诱饵都不能重叠，部署不会向敌方公开。</li>
          </ul>
        </aside>
      </div>`;
  }

  function renderTutorialDamage(session) {
    return `
      <div class="tutorial-simulator">
        <section class="tutorial-stage-card">
          <div class="tutorial-tool-row">
            ${tutorialToolButton("destroyer", "驱逐舰Ⅰ冲撞", session.damage.selectedAction === "destroyer", {
              glyph: "冲", hint: "命中自损 0.5", disabled: session.step >= 2,
            })}
            ${tutorialToolButton("nuclear", "核弹", session.damage.selectedAction === "nuclear", {
              glyph: "☢", hint: "结果保密", disabled: session.step < 2,
            })}
          </div>
          ${renderTutorialBoard(session, "damage")}
        </section>
        <aside class="tutorial-concept-card">
          <span class="status-kicker">训练状态</span>
          <div class="tutorial-hp-grid">
            <div><strong>${Model.formatHp(session.damage.targetHp)}</strong><small>训练目标 HP</small></div>
            <div><strong>${Model.formatHp(session.damage.ownDestroyerHp)}</strong><small>己方驱逐舰Ⅰ HP</small></div>
          </div>
          <h3>受击格不是“禁止选择格”</h3>
          <p>同一单位格只能受到一次伤害。潜射导弹、核弹和部分范围行动仍可覆盖它，但不会重复扣减生命值。</p>
          <p>驱逐舰另有更严格限制：两艘驱逐舰共享已攻击坐标，每个坐标只能冲撞一次。</p>
        </aside>
      </div>`;
  }

  function renderTutorialIntelligence(session) {
    return `
      <div class="tutorial-simulator">
        <section class="tutorial-stage-card">
          <div class="tutorial-tool-row tutorial-tool-row--scroll">
            ${tutorialToolButton("radar", "雷达", session.intelligence.selectedTool === "radar", {
              glyph: "◎", hint: "4×4 布局判断", disabled: session.step > 0,
            })}
            ${tutorialToolButton("underwater_yes", "水下有", session.intelligence.selectedTool === "underwater_yes", {
              glyph: "▰", hint: "本机私人标记", disabled: session.step !== 1 && session.step !== 2,
            })}
            ${tutorialToolButton("detection", "探测弹", session.intelligence.selectedTool === "detection", {
              glyph: "⌁", hint: "3×3 水下信号", disabled: session.step < 3,
            })}
          </div>
          ${renderTutorialBoard(session, "intelligence")}
        </section>
        <aside class="tutorial-concept-card">
          <span class="status-kicker">情报边界</span>
          <h3>“发现”不等于“定位”</h3>
          <ul>
            <li>首次正常回合强制使用航母雷达。</li>
            <li>雷达只判断区域内是否存在任意布局。</li>
            <li>探测弹的信号可能来自水下单位或有效诱饵。</li>
            <li>私人标记只是你的推断，自动命中标记才是服务器事实。</li>
          </ul>
        </aside>
      </div>`;
  }

  function renderTutorialSecrecy(session) {
    return `
      <div class="tutorial-simulator">
        <section class="tutorial-stage-card">
          <div class="tutorial-tool-row tutorial-tool-row--scroll">
            ${tutorialToolButton("missile", "潜射导弹", session.secrecy.selectedWeapon === "missile", {
              glyph: "↗", hint: "点击 G7", disabled: session.step > 0,
            })}
            ${tutorialToolButton("nuclear", "核弹", session.secrecy.selectedWeapon === "nuclear", {
              glyph: "☢", hint: "点击 H8", disabled: session.step !== 1,
            })}
            ${tutorialToolButton("shock", "震爆弹", session.secrecy.selectedWeapon === "shock", {
              glyph: "ϟ", hint: "点击 F6", disabled: session.step !== 2,
            })}
          </div>
          ${renderTutorialBoard(session, "secrecy")}
        </section>
        <aside class="tutorial-concept-card tutorial-concept-card--messages">
          <span class="status-kicker">分角色播报</span>
          <article data-viewer="attacker"><small>行动方看到</small><strong>${escapeHtml(session.secrecy.attackerMessage)}</strong></article>
          <article data-viewer="defender"><small>防守方看到</small><strong>${escapeHtml(session.secrecy.defenderMessage)}</strong></article>
          <p>正式对局中，两侧消息由服务器分别生成；客户端不会收到自己无权知道的隐藏结果。</p>
        </aside>
      </div>`;
  }

  function renderTutorialCommand(session) {
    const question = Tutorial.QUIZ[session.quiz.index];
    if (!question) {
      return `
        <section class="tutorial-complete-card">
          <span class="tutorial-complete-card__emblem" aria-hidden="true">✓</span>
          <span class="status-kicker">TRAINING COMPLETE</span>
          <h2>指挥训练完成</h2>
          <p>五个章节均已完成。建议先挑战新手机器人，再逐步切换到标准和专家。</p>
          <div class="tutorial-complete-actions">
            <button class="button button--primary button--large" type="button" data-action="tutorial-start-beginner">选择新手人机</button>
            <button class="button button--secondary" type="button" data-action="exit-tutorial">返回首页</button>
          </div>
        </section>`;
    }
    return `
      <div class="tutorial-quiz-layout">
        <section class="tutorial-quiz-card">
          <div class="tutorial-quiz-card__meta"><span>问题 ${session.quiz.index + 1} / ${Tutorial.QUIZ.length}</span><span>已答对 ${session.quiz.correctCount}</span></div>
          <h2>${escapeHtml(question.question)}</h2>
          <div class="tutorial-answer-list">
            ${question.options.map((option) => `<button type="button" data-action="tutorial-answer" data-value="${escapeHtml(option.id)}"><span>${escapeHtml(option.id.toUpperCase())}</span><strong>${escapeHtml(option.text)}</strong></button>`).join("")}
          </div>
        </section>
        <aside class="tutorial-concept-card">
          <span class="status-kicker">终局提示</span>
          <h3>先完成行动，再判断胜负</h3>
          <p>普通情况下航空母舰沉没即出局；海盗船具有特殊同时沉没优先规则；常规攻击全部耗尽时进入手动终局鱼雷齐射。</p>
          <p>三人局每回合只提交一次行动，两名防守方独立结算，行动资源和行动方自损只计算一次。</p>
        </aside>
      </div>`;
  }

  function renderTutorialPage() {
    const session = state.tutorial.session ?? Tutorial.createSession(readTutorialProgress());
    state.tutorial.session = session;
    const lesson = Tutorial.currentLesson(session);
    const lessonComplete = Tutorial.lessonIsComplete(session, lesson.id);
    const progress = Tutorial.progress(session);
    const lessonBody = lesson.id === "deployment"
      ? renderTutorialDeployment(session)
      : lesson.id === "damage"
        ? renderTutorialDamage(session)
        : lesson.id === "intelligence"
          ? renderTutorialIntelligence(session)
          : lesson.id === "secrecy"
            ? renderTutorialSecrecy(session)
            : renderTutorialCommand(session);
    return `
      <section class="tutorial-page page-enter" aria-labelledby="tutorial-title">
        <header class="tutorial-header">
          <div>
            <span class="status-kicker">OCEAN ACADEMY · 本地训练</span>
            <h1 id="tutorial-title">完整交互教程</h1>
            <p>所有训练均在当前浏览器内运行，不创建房间，不读取或改写正式对局。</p>
          </div>
          <button class="button button--quiet" type="button" data-action="exit-tutorial">退出教程</button>
        </header>

        <div class="tutorial-progress" aria-label="教程完成进度">
          <div data-progress="${progress.percent}"><span></span></div>
          <strong>${progress.completed} / ${progress.total} 章节完成</strong>
        </div>

        <nav class="tutorial-chapters" aria-label="教程章节">
          ${Tutorial.LESSONS.map((item, index) => {
            const complete = Tutorial.lessonIsComplete(session, item.id);
            return `<button type="button" data-action="tutorial-go-lesson" data-index="${index}" class="${index === session.lessonIndex ? "is-active" : ""}" aria-current="${index === session.lessonIndex ? "step" : "false"}">
              <span>${complete ? "✓" : item.number}</span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.subtitle)}</small>
            </button>`;
          }).join("")}
        </nav>

        <article class="tutorial-lesson-heading">
          <div><span>第 ${lesson.number} 章</span><h2>${escapeHtml(lesson.title)}</h2></div>
          <p>${escapeHtml(lesson.summary)}</p>
        </article>

        <div class="tutorial-task-message" data-kind="${escapeHtml(session.messageKind)}" role="status" aria-live="polite">
          <span aria-hidden="true">${session.messageKind === "success" ? "✓" : session.messageKind === "warning" ? "!" : "→"}</span>
          <strong>${escapeHtml(session.message)}</strong>
        </div>

        ${lessonBody}

        <footer class="tutorial-footer-actions">
          <button class="button button--quiet" type="button" data-action="tutorial-previous-lesson" ${session.lessonIndex === 0 ? "disabled" : ""}>上一章</button>
          <button class="button button--secondary" type="button" data-action="tutorial-reset-lesson">重置本章</button>
          ${session.lessonIndex < Tutorial.LESSONS.length - 1
            ? `<button class="button button--primary" type="button" data-action="tutorial-next-lesson" ${lessonComplete ? "" : "disabled"}>下一章</button>`
            : session.finished
              ? '<button class="button button--primary" type="button" data-action="tutorial-start-beginner">选择新手人机</button>'
              : '<button class="button button--primary" type="button" disabled>完成考核后继续</button>'}
        </footer>
      </section>`;
  }
