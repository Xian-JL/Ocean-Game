  function actionVisualMeta(definition) {
    const table = {
      [Data.ACTION_TYPES.DESTROYER_I_RAM]: { group: "surface", glyph: "Ⅰ", icon: "action-destroyer-i", groupName: "舰艇攻击" },
      [Data.ACTION_TYPES.DESTROYER_II_RAM]: { group: "surface", glyph: "Ⅱ", icon: "action-destroyer-ii", groupName: "舰艇攻击" },
      [Data.ACTION_TYPES.PIRATE_ATTACK]: { group: "surface", glyph: "盗", icon: "action-pirate", groupName: "舰艇攻击" },
      [Data.ACTION_TYPES.MOTORBOAT_RAM]: { group: "surface", glyph: "摩", icon: "action-motorboat", groupName: "舰艇攻击" },
      [Data.ACTION_TYPES.SUBMARINE_MISSILE]: { group: "underwater", glyph: "↗", icon: "action-missile", groupName: "潜航武器" },
      [Data.ACTION_TYPES.NUCLEAR_BOMB]: { group: "underwater", glyph: "☢", icon: "action-nuclear", groupName: "潜航武器" },
      [Data.ACTION_TYPES.SHOCK_BOMB]: { group: "underwater", glyph: "震", icon: "action-shock", groupName: "潜航武器" },
      [Data.ACTION_TYPES.DETECTION_BOMB]: { group: "underwater", glyph: "探", icon: "action-detection", groupName: "潜航武器" },
      [Data.ACTION_TYPES.HELICOPTER_STRAFE]: { group: "carrier", glyph: "✦", icon: "action-helicopter", groupName: "舰载系统" },
      [Data.ACTION_TYPES.RADAR_SCAN]: { group: "carrier", glyph: "◎", icon: "action-radar", groupName: "舰载系统" },
    };
    return table[definition.type] ?? { group: "surface", glyph: "•", icon: "action-radar", groupName: "行动" };
  }

  function compactActionStatus(status) {
    if (status.code === "available") return "可用";
    if (status.code === "submitting") return "结算中";
    if (status.code === "waiting") return "等待回合";
    if (status.code === "sunk") return "单位沉没";
    if (status.code === "paralyzed") return "单位瘫痪";
    if (status.code === "empty") return "已耗尽";
    if (status.label.includes("首个行动") || status.label.includes("先扫描")) return "需先雷达";
    if (status.label.includes("首个行动并同时")) return "须首项使用";
    if (status.label.includes("驱逐舰均沉没")) return "尚未解锁";
    return status.label;
  }

  function actionAvailabilityTier(status) {
    if (status.enabled || status.code === "submitting") return "available";
    if (["empty", "sunk"].includes(status.code)) return "exhausted";
    return "limited";
  }


  const ARMORY_ORDER = Object.freeze(["destroyer_i_ram","destroyer_ii_ram","pirate_attack","motorboat_ram","submarine_missile","nuclear_bomb","shock_bomb","detection_bomb","radar_scan","helicopter_strafe"]);
  function actionNameMarkup(definition){
    const words={destroyer_i_ram:['驱逐舰Ⅰ','冲撞'],destroyer_ii_ram:['驱逐舰Ⅱ','冲撞'],pirate_attack:['海盗船','攻击'],motorboat_ram:['摩托艇','冲撞'],submarine_missile:['潜射','导弹'],helicopter_strafe:['直升机','扫射'],radar_scan:['雷达','扫描']};
    return (words[definition.type]??[definition.name]).map(word=>'<span>'+escapeHtml(word)+'</span>').join('');
  }
  function renderActionCard(room, definition) {
    const status=Model.deriveActionStatus(room,definition),selected=definition.type===state.battle.selectedAction;
    const slot=(ARMORY_ORDER.indexOf(definition.type)+1)%10;
    return `<div class="action-option" data-status="${status.code}"><button type="button" class="action-card ${selected?'action-card--selected':''}" data-action="select-action" data-action-type="${definition.type}" aria-label="${escapeHtml(definition.name+'，'+Model.actionResourceLabel(room,definition))}" aria-pressed="${selected}" aria-describedby="armory-reason-${definition.type}" ${status.enabled?'':'disabled'}><span class="action-slot-number" aria-hidden="true">${slot}</span><span class="action-card__icon" aria-hidden="true">${uiIcon(actionVisualMeta(definition).icon)}</span><span class="action-card__body"><strong>${actionNameMarkup(definition)}</strong><small>${escapeHtml(Model.actionResourceLabel(room,definition))}</small></span>${selected?'<span class="action-selected-mark" aria-hidden="true">✓</span>':''}</button><button id="armory-reason-${definition.type}" class="action-disabled-reason action-info" type="button" data-action="inspect-action" data-action-type="${definition.type}" aria-label="查看${escapeHtml(definition.name)}完整说明：${escapeHtml(status.label)}"><span aria-hidden="true">${escapeHtml(compactActionStatus(status))} ⓘ</span><span class="sr-only">${escapeHtml(status.label)}</span></button></div>`;
  }
  function renderArmorySource(room){
    const def=Data.getActionDefinition(state.battle.selectedAction);
    const units=room.battle.own.units;
    const source=def?units.find(u=>u.type===def.sourceType&&u.hp>0&&!u.paralyzed)??units.find(u=>u.type===def.sourceType):null;
    if(!source)return `<section class="armory-source" aria-label="行动来源"><span class="armory-source__crest" aria-hidden="true"></span><span class="status-kicker">舰队待命</span><strong>选择你的武器</strong><small>先选行动，再指定海图目标</small><button data-action="toggle-fleet">查看己方舰队</button></section>`;
    const unit=Data.getUnitDefinitionById(source.id)??Data.getUnitDefinitionByType(source.type);
    return `<section class="armory-source armory-source--active" data-source-state="${source.hp<=0?'sunk':source.paralyzed?'paralyzed':'active'}" aria-label="行动来源"><span class="source-projection" aria-hidden="true">${armorySourceProjection(source)}</span><strong class="source-name">${escapeHtml(unit.name)}</strong><span class="source-hp">${Model.formatHp(source.hp)} <small>/ ${unit.initialHp} HP</small><small class="source-condition">${escapeHtml(unitStatusText(source,unit))}</small></span><div class="hp-track"><i data-hp-percent="${Math.round(source.hp/unit.initialHp*100)}"></i></div><button data-action="toggle-fleet">己方舰队详情</button></section>`;
  }

  function renderActionGroups(room) {
    const groups = [
      { key: "surface", label: "舰艇攻击" },
      { key: "underwater", label: "潜航武器" },
      { key: "carrier", label: "舰载系统" },
    ];
    return `
      <div class="action-list action-list--v073">
        ${groups.map((group) => {
          const actions = Data.ACTION_DEFINITIONS.filter((definition) => actionVisualMeta(definition).group === group.key);
          return `<section class="action-group action-group--${group.key}" aria-label="${group.label}">
            <div class="action-group__heading"><span>${group.label}</span><b>${actions.filter((definition) => Model.deriveActionStatus(room, definition).enabled).length}</b></div>
            <div class="action-group__grid">${actions.map((definition) => renderActionCard(room, definition)).join("")}</div>
          </section>`;
        }).join("")}
      </div>`;
  }

  const ACTION_SOURCE_ORDER = Object.freeze([
    Data.UNIT_TYPES.DESTROYER_I,
    Data.UNIT_TYPES.DESTROYER_II,
    Data.UNIT_TYPES.PIRATE_SHIP,
    Data.UNIT_TYPES.MOTORBOAT,
    Data.UNIT_TYPES.SUBMARINE,
    Data.UNIT_TYPES.NUCLEAR_SUBMARINE,
    Data.UNIT_TYPES.AIRCRAFT_CARRIER,
  ]);

  function sourceUnitState(units, definition) {
    const alive = units.filter((unit) => unit.hp > 0);
    if (alive.length === 0) return { code: "sunk", label: "已沉没" };
    if (alive.every((unit) => unit.paralyzed)) return { code: "paralyzed", label: "瘫痪" };
    if (alive.length < units.length) return { code: "damaged", label: `${alive.length}/${units.length} 可用` };
    if (alive.some((unit) => unit.hp < definition.initialHp)) return { code: "damaged", label: "受伤" };
    return { code: "ready", label: "作战中" };
  }

  function renderUnitActionDeck(room, ownBattle) {
    const selectedSourceType = Data.getActionDefinition(state.battle.selectedAction)?.sourceType;
    const orderedSources = [...ACTION_SOURCE_ORDER].sort((left, right) => {
      const score = (sourceType) => {
        if (sourceType === selectedSourceType) return -3;
        const actions = Data.ACTION_DEFINITIONS.filter((action) => action.sourceType === sourceType);
        if (actions.some((action) => Model.deriveActionStatus(room, action).enabled)) return -2;
        if (actions.some((action) => actionAvailabilityTier(Model.deriveActionStatus(room, action)) === "limited")) return -1;
        return 0;
      };
      return score(left) - score(right) || ACTION_SOURCE_ORDER.indexOf(left) - ACTION_SOURCE_ORDER.indexOf(right);
    });
    return `
      <div class="unit-action-deck unit-action-deck--v076" aria-label="兵种行动与状态">
        ${orderedSources.map((sourceType) => {
          const definition = Data.getUnitDefinitionByType(sourceType);
          const units = (ownBattle.units ?? []).filter((unit) => unit.type === sourceType);
          const actions = Data.ACTION_DEFINITIONS.filter((action) => action.sourceType === sourceType);
          if (!definition || units.length === 0 || actions.length === 0) return "";
          const sourceState = sourceUnitState(units, definition);
          const sourceLabel = units.length > 1
            ? definition.name.replace(/\s+\d+$/, "")
            : definition.name;
          const hp = units.reduce((sum, unit) => sum + unit.hp, 0);
          const maxHp = units.length * definition.initialHp;
          const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));
          const availableCount = actions.filter((action) => Model.deriveActionStatus(room, action).enabled).length;
          const selectedSource = Data.getActionDefinition(state.battle.selectedAction)?.sourceType === sourceType;
          const expanded = selectedSource || state.battle.expandedUnitCards.has(sourceType);
          return `
            <section class="unit-action-card unit-action-card--${sourceState.code} ${expanded ? "unit-action-card--expanded" : "unit-action-card--collapsed"}" data-source-type="${sourceType}" data-unit-state="${sourceState.code}">
              <button class="unit-action-card__toggle" type="button" data-action="toggle-unit-card" data-source-type="${sourceType}" aria-expanded="${expanded}">
                <span class="unit-status__icon unit-status__icon--${definition.category}" aria-hidden="true">${uiIcon(unitIconName(sourceType))}</span>
                <div class="unit-action-card__identity">
                  <div><strong>${escapeHtml(sourceLabel)}${units.length > 1 ? ` ×${units.length}` : ""}</strong><small>${escapeHtml(sourceState.label)}</small></div>
                  <div class="hp-track hp-track--compact" aria-label="生命值 ${Model.formatHp(hp)} / ${maxHp}"><i style="--hp-percent:${hpPercent}%"></i></div>
                </div>
                <span class="hp-meter hp-meter--compact"><b>${Model.formatHp(hp)}</b><i>/ ${maxHp}</i></span>
                <span class="unit-action-card__availability">${availableCount}/${actions.length}</span>
                <span class="unit-action-card__chevron" aria-hidden="true">⌄</span>
              </button>
              <div class="unit-action-card__details" ${expanded ? "" : "hidden"}>
                ${units.length > 1 ? `<div class="unit-instance-row">${units.map((unit, index) => `<span data-unit-state="${unitStateCode(unit, definition)}">艇 ${index + 1} · ${Model.formatHp(unit.hp)}/${definition.initialHp}</span>`).join("")}</div>` : ""}
                <div class="unit-action-card__resources">${unitResourceBadges(ownBattle, units[0]) || `<span class="unit-resource-badge">可用行动 <b>${availableCount}/${actions.length}</b></span>`}</div>
                <div class="unit-action-card__actions">
                  ${actions.map((action) => renderActionCard(room, action)).join("")}
                </div>
              </div>
            </section>`;
        }).join("")}
        <section class="unit-action-card unit-action-card--decoy" aria-label="诱饵鱼雷状态">
          <header class="unit-action-card__header">
            <span class="unit-status__icon unit-status__icon--decoy" aria-hidden="true">${uiIcon("ship-decoy")}</span>
            <div class="unit-action-card__identity"><div><strong>诱饵鱼雷</strong><small>战术装置</small></div></div>
            <span class="hp-meter hp-meter--compact"><b>${ownBattle.decoys.filter((decoy) => !decoy.destroyed).length}</b><i>/ ${ownBattle.decoys.length}</i></span>
          </header>
        </section>
      </div>`;
  }

  function renderActionAvailabilitySummary(room) {
    const counts = Data.ACTION_DEFINITIONS.reduce((result, definition) => {
      result[actionAvailabilityTier(Model.deriveActionStatus(room, definition))] += 1;
      return result;
    }, { available: 0, limited: 0, exhausted: 0 });
    return `<div class="action-availability-summary" aria-label="行动状态总览">
      <span data-tier="available"><i></i>可用 <b>${counts.available}</b></span>
      <span data-tier="limited"><i></i>受限 <b>${counts.limited}</b></span>
      <span data-tier="exhausted"><i></i>耗尽/失效 <b>${counts.exhausted}</b></span>
    </div>`;
  }

  function renderActionCommandChain(room, selectedDefinition) {
    const hasAction = Boolean(selectedDefinition);
    const hasTarget = Boolean(state.battle.target);
    return `<section class="action-command-chain" aria-label="行动指令流程">
      <div class="action-command-step" data-step="action" data-complete="${hasAction}">
        ${uiCommandIcon("action")}<span><small>01 行动</small><strong>${hasAction ? escapeHtml(selectedDefinition.name) : "选择武器"}</strong></span>
      </div>
      <i aria-hidden="true">›</i>
      <div class="action-command-step" data-step="target" data-complete="${hasTarget}">
        ${uiCommandIcon("lock")}<span><small>02 目标</small><strong>${hasTarget ? escapeHtml(Model.formatTarget(state.battle.target)) : "选择坐标"}</strong></span>
      </div>
      <i aria-hidden="true">›</i>
      <button class="action-command-confirm" type="button" data-action="reopen-action-confirm" ${room.turn?.canAct && hasAction && hasTarget ? "" : "disabled"}>
        ${uiCommandIcon("confirm")}<span><small>03 确认</small><strong>${hasTarget ? "执行指令" : "等待目标"}</strong></span>
      </button>
    </section>`;
  }


  function renderActionPanel(room) {
    const definition=Data.getActionDefinition(state.battle.selectedAction);
    return `<aside class="action-rail ${state.battle.actionDrawerOpen?'action-rail--open':''}" aria-label="军械武器基座" data-scroll-key="actions"><header class="console-panel-heading"><div><span class="eyebrow">军械武器座</span><h2>${openingRadarRequired(room)?'首轮先扫描 · 左上起始格':'十项行动'}</h2></div><button class="drawer-close icon-button" data-action="close-battle-drawers" aria-label="关闭武器面板">×</button></header><div class="action-rail__content" data-scroll-key="action-content"><div class="action-list armory-slots" aria-label="十行动固定槽位">${ARMORY_ORDER.map(type=>Data.getActionDefinition(type)).map(d=>renderActionCard(room,d)).join('')}</div>${definition?.targetMode==='line'?`<div class="axis-switch" role="group" aria-label="直升机扫射方向"><button data-action="set-helicopter-axis" data-axis="row" aria-pressed="${state.battle.helicopterAxis==='row'}">按行扫射</button><button data-action="set-helicopter-axis" data-axis="column" aria-pressed="${state.battle.helicopterAxis==='column'}">按列扫射</button></div>`:''}</div></aside>`;
  }

  function renderTurnProgress(room) {
    if (room.maxPlayers !== 3) return "";
    const required = activeBattleOpponentIds(room);
    if (required.length === 0) return "";
    const synchronized = required.length > 1;
    const action = Data.getActionDefinition(state.battle.selectedAction);
    const target = state.battle.target ? Model.formatTarget(state.battle.target) : "等待坐标";
    return `
      <div class="battle-turn-progress" aria-label="本回合同步目标">
        <div class="battle-turn-progress__summary">
          <span>${synchronized ? "一次行动 · 资源/自损仅一次" : "单一有效目标"}</span>
          <strong>${synchronized ? `同步 ×${required.length}` : "目标 ×1"}</strong>
          <small>${action ? `${escapeHtml(action.name)} · ${escapeHtml(target)}` : "尚未选择行动"}</small>
        </div>
        <div class="battle-turn-progress__targets">
          ${required.map((playerId) => {
            const currentTarget = room.turn?.canAct && state.battle.targetPlayerId === playerId;
            return `<span data-complete="false" data-current="${currentTarget}">${synchronized ? "⇉" : "→"} ${escapeHtml(Model.nicknameFor(room, playerId))}</span>`;
          }).join("")}
        </div>
      </div>`;
  }
