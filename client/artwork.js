  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uiIcon(name, className = "") {
    return `<svg class="ui-svg-icon ${escapeHtml(className)}" aria-hidden="true" focusable="false"><use href="/assets/icons/ocean-ui.svg#${escapeHtml(name)}"></use></svg>`;
  }

  function unitIconName(unitType) {
    return {
      [Data.UNIT_TYPES.DESTROYER_I]: "ship-destroyer-i",
      [Data.UNIT_TYPES.DESTROYER_II]: "ship-destroyer-ii",
      [Data.UNIT_TYPES.SUBMARINE]: "ship-submarine",
      [Data.UNIT_TYPES.NUCLEAR_SUBMARINE]: "ship-nuclear-submarine",
      [Data.UNIT_TYPES.PIRATE_SHIP]: "ship-pirate",
      [Data.UNIT_TYPES.MOTORBOAT]: "ship-motorboat",
      [Data.UNIT_TYPES.AIRCRAFT_CARRIER]: "ship-aircraft-carrier",
      [Data.UNIT_TYPES.DECOY_TORPEDO]: "ship-decoy",
    }[unitType] ?? "ship-destroyer-i";
  }

  const UNIT_ART_FOLDERS = Object.freeze({
    [Data.UNIT_TYPES.DESTROYER_I]: "destroyer-1",
    [Data.UNIT_TYPES.DESTROYER_II]: "destroyer-2",
    [Data.UNIT_TYPES.PIRATE_SHIP]: "pirate",
    [Data.UNIT_TYPES.MOTORBOAT]: "motorboat",
    [Data.UNIT_TYPES.SUBMARINE]: "submarine",
    [Data.UNIT_TYPES.NUCLEAR_SUBMARINE]: "nuclear-submarine",
    [Data.UNIT_TYPES.DECOY_TORPEDO]: "decoy",
  });

  const ACTION_ART_FILES = Object.freeze({
    [Data.ACTION_TYPES.DESTROYER_I_RAM]: "action_destroyer_1_ram.webp",
    [Data.ACTION_TYPES.DESTROYER_II_RAM]: "action_destroyer_2_ram.webp",
    [Data.ACTION_TYPES.PIRATE_ATTACK]: "action_pirate_raid.webp",
    [Data.ACTION_TYPES.MOTORBOAT_RAM]: "action_motorboat_ram.webp",
    [Data.ACTION_TYPES.SUBMARINE_MISSILE]: "action_submarine_missile.webp",
    [Data.ACTION_TYPES.NUCLEAR_BOMB]: "action_nuclear_bomb.webp",
    [Data.ACTION_TYPES.SHOCK_BOMB]: "action_shock_bomb.webp",
    [Data.ACTION_TYPES.DETECTION_BOMB]: "action_detection_bomb.webp",
    [Data.ACTION_TYPES.HELICOPTER_STRAFE]: "action_helicopter_strafe.webp",
    [Data.ACTION_TYPES.RADAR_SCAN]: "action_radar_scan.webp",
  });

  const ART_DIRECTIONS = Object.freeze(["north", "east", "south", "west"]);
  const FEEDBACK_ART_ROOT = "/assets/images/ocean-2.5d/feedback";
  const UI_ART_ROOT = "/assets/images/ocean-2.5d/ui";
  const LAYER_ART_ROOT = "/assets/images/ocean-2.5d/layers";
  const ASSET_VERSION = Data.ASSET_VERSION;

  function versionedArtUrl(url) {
    return `${url}?v=${encodeURIComponent(ASSET_VERSION)}`;
  }
  const UI_COMMAND_ICONS = Object.freeze({
    action: "icon_attack_main",
    cancel: "icon_cancel_action",
    confirm: "icon_confirm_target",
    lock: "icon_lock_target",
    radar: "icon_radar_scan",
    sonar: "icon_sonar_scan",
    surface: "icon_emerge",
    underwater: "icon_submerge",
  });
  const SECOND_BATCH_ASSET_FILES = Object.freeze({
    tiles: Object.freeze([
      "tile_selected_blue", "tile_move_valid", "tile_move_hover", "tile_attack_range_red", "tile_attack_target_red", "tile_scan_range_cyan", "tile_radar_range_green", "tile_shock_range_purple", "tile_forbidden_dark", "tile_hit_confirm_orange", "tile_miss_confirm_white", "tile_warning_yellow", "tile_enemy_mark_red", "tile_self_mark_blue",
    ]),
    status: Object.freeze([
      "status_damaged_light", "status_damaged_heavy", "status_emp_disabled", "status_revealed_sonar", "status_revealed_radar", "status_target_locked", "status_burning", "status_flooding", "status_sinking", "status_decoy_active", "status_low_hp_warning", "status_destroyed_marker",
    ]),
    vfx: Object.freeze([
      "vfx_missile_launch", "vfx_torpedo_trail", "vfx_small_explosion", "vfx_large_explosion", "vfx_small_water_splash", "vfx_large_water_splash", "vfx_emp_pulse", "vfx_emp_impact", "vfx_sonar_ping", "vfx_radar_sweep", "vfx_helicopter_trace", "vfx_nuclear_flash_core", "vfx_nuclear_shock_ring", "vfx_debris_sparks",
    ]),
    props: Object.freeze([
      "prop_shadow_small", "prop_shadow_medium", "prop_shadow_large", "prop_wake_small", "prop_wake_medium", "prop_wake_large", "prop_ping_beacon", "prop_target_arrow",
    ]),
  });

  function feedbackArtPath(group, name) {
    return SECOND_BATCH_ASSET_FILES[group]?.includes(name)
      ? versionedArtUrl(`${FEEDBACK_ART_ROOT}/${group}/${name}.webp`)
      : "";
  }

  function uiCommandIcon(name, className = "") {
    const file = UI_COMMAND_ICONS[name];
    return file
      ? `<img class="ui-command-icon ${escapeHtml(className)}" src="${versionedArtUrl(`${UI_ART_ROOT}/icons-actions/${file}.webp`)}" alt="" loading="lazy" decoding="async" fetchpriority="low" draggable="false" />`
      : "";
  }

  function tacticalLayerMeta(layer = state.battle.tacticalLayer) {
    return {
      all: { label: "综合视层", detail: "水面与潜层协同显示", icon: "sonar" },
      surface: { label: "水面视层", detail: "突出水面舰艇、阴影与航迹", icon: "surface" },
      underwater: { label: "潜层视层", detail: "突出潜航单位、焦散与声呐", icon: "underwater" },
    }[layer] ?? { label: "综合视层", detail: "水面与潜层协同显示", icon: "sonar" };
  }

  function renderTacticalEnvironmentLayer(kind = "own") {
    return `<div class="tactical-environment-layer tactical-environment-layer--${kind}" aria-hidden="true">
      <span class="tactical-environment tactical-environment--surface"></span>
      <span class="tactical-environment tactical-environment--foam"></span>
      <span class="tactical-environment tactical-environment--caustics"></span>
      <span class="tactical-environment tactical-environment--depth"></span>
      <span class="tactical-environment tactical-environment--particles"></span>
      <span class="tactical-environment tactical-environment--refraction"></span>
      <span class="tactical-layer-transition tactical-layer-transition--sonar"></span>
      <span class="tactical-layer-transition tactical-layer-transition--submerge"></span>
      <span class="tactical-layer-transition tactical-layer-transition--emerge"></span>
    </div>`;
  }

  function preloadArtAssets(urls) {
    if (typeof Image !== "function") return;
    const load = () => {
      for (const url of urls.filter(Boolean)) {
        if (preloadedArtAssets.has(url)) continue;
        preloadedArtAssets.add(url);
        const image = new Image();
        image.decoding = "async";
        image.fetchPriority = "low";
        image.src = versionedArtUrl(url);
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(load, { timeout: 1_200 });
    } else {
      window.setTimeout(load, 0);
    }
  }

  function warmBattleArt(room) {
    if (!room?.battle) return;
    const urls = [
      "/assets/images/ocean-2.5d/ocean/ocean_deep_active.webp",
      "/assets/images/ocean-2.5d/actions/action_radar_scan.webp",
      `${LAYER_ART_ROOT}/surface/surface_specular_seamless.webp`,
      `${LAYER_ART_ROOT}/underwater/underwater_depth_haze.webp`,
      `${UI_ART_ROOT}/icons-actions/icon_confirm_target.webp`,
    ];
    const selectedFile = ACTION_ART_FILES[state.battle.selectedAction];
    if (selectedFile) urls.push(`/assets/images/ocean-2.5d/actions/${selectedFile}`);
    if (state.effectiveQuality === "high") {
      urls.push(...Object.values(ACTION_ART_FILES).map((file) => `/assets/images/ocean-2.5d/actions/${file}`));
      urls.push(
        feedbackArtPath("vfx", "vfx_small_explosion"),
        feedbackArtPath("vfx", "vfx_small_water_splash"),
        feedbackArtPath("status", "status_target_locked"),
        `${LAYER_ART_ROOT}/surface/surface_foam_overlay.webp`,
        `${LAYER_ART_ROOT}/underwater/underwater_caustics_seamless.webp`,
        `${LAYER_ART_ROOT}/underwater/underwater_particles.webp`,
        `${LAYER_ART_ROOT}/transitions/sonar_scan_ring_sheet.webp`,
      );
    }
    preloadArtAssets(urls);
  }

  function tacticalPropSize(bounds) {
    const occupied = (bounds?.rowSpan ?? 1) * (bounds?.columnSpan ?? 1);
    return occupied >= 6 ? "large" : occupied >= 3 ? "medium" : "small";
  }

  function statusArtName(unit, definition, stateCode, selected) {
    if (unit?.destroyed || unit?.hp <= 0) return "status_sinking";
    if (unit?.paralyzed) return "status_emp_disabled";
    if (definition?.initialHp && unit?.hp <= definition.initialHp / 2) return "status_low_hp_warning";
    if ((unit?.hitCells?.length ?? 0) >= 2) return "status_damaged_heavy";
    if ((unit?.hitCells?.length ?? 0) > 0 || stateCode === "damaged" || stateCode === "hit") return "status_damaged_light";
    if (selected) return "status_target_locked";
    return null;
  }

  function tacticalArtEffects({ unit, definition, bounds, stateCode, selected, kind, quality = "high" }) {
    const size = tacticalPropSize(bounds);
    const status = kind === "decoy"
      ? (stateCode === "sunk" ? "status_destroyed_marker" : "status_decoy_active")
      : statusArtName(unit, definition, stateCode, selected);
    if (quality === "smooth") {
      return status ? `<img class="tactical-status-art" src="${feedbackArtPath("status", status)}" alt="" loading="lazy" decoding="async" fetchpriority="low" draggable="false" />` : "";
    }
    return `${stateCode === "sunk" ? "" : `<img class="tactical-prop tactical-prop--shadow" src="${feedbackArtPath("props", `prop_shadow_${size}`)}" alt="" loading="lazy" decoding="async" fetchpriority="low" draggable="false" />`}
      ${stateCode === "sunk" ? "" : `<img class="tactical-prop tactical-prop--wake" src="${feedbackArtPath("props", `prop_wake_${size}`)}" alt="" loading="lazy" decoding="async" fetchpriority="low" draggable="false" />`}
      ${status ? `<img class="tactical-status-art" src="${feedbackArtPath("status", status)}" alt="" loading="lazy" decoding="async" fetchpriority="low" draggable="false" />` : ""}`;
  }

  // Alpha bounds of the unchanged 512px assets, with a 3px safety margin.
  // A cropped SVG viewport fits the hull, not the transparent square canvas.
  const UNIT_ART_VIEWBOXES = Object.freeze({
    "decoy/east.webp": "3 190 502 129",
    "decoy/north.webp": "194 22 124 468",
    "decoy/south.webp": "193 16 126 472",
    "decoy/west.webp": "7 184 501 139",
    "destroyer-1/east.webp": "6 199 498 107",
    "destroyer-1/north.webp": "203 4 106 503",
    "destroyer-1/south.webp": "198 5 116 501",
    "destroyer-1/west.webp": "3 194 506 112",
    "destroyer-2/east.webp": "8 176 497 137",
    "destroyer-2/north.webp": "210 17 92 471",
    "destroyer-2/south.webp": "208 13 97 482",
    "destroyer-2/west.webp": "2 198 504 114",
    "motorboat/east.webp": "44 189 425 136",
    "motorboat/north.webp": "191 57 130 381",
    "motorboat/south.webp": "188 54 132 395",
    "motorboat/west.webp": "36 183 443 138",
    "nuclear-submarine/east.webp": "1 186 507 124",
    "nuclear-submarine/north.webp": "199 6 114 500",
    "nuclear-submarine/south.webp": "201 4 111 504",
    "nuclear-submarine/west.webp": "1 183 509 121",
    "pirate/east.webp": "4 154 502 203",
    "pirate/north.webp": "160 1 207 501",
    "pirate/south.webp": "151 3 199 503",
    "pirate/west.webp": "6 152 501 199",
    "submarine/east.webp": "12 206 488 98",
    "submarine/north.webp": "209 32 93 448",
    "submarine/south.webp": "208 11 96 479",
    "submarine/west.webp": "11 188 490 119",
  });

  function artCoordinate(coordinate) {
    const parsed = Data.parseCoordinate(coordinate);
    return parsed ? { row: parsed.row + 1, column: parsed.column + 1 } : null;
  }

  function stableArtDirection(seed) {
    const hash = [...String(seed ?? "")].reduce(
      (value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0,
      0,
    );
    return ART_DIRECTIONS[hash % ART_DIRECTIONS.length];
  }

  function artBounds(cells) {
    const parsed = cells.map(artCoordinate).filter(Boolean);
    if (parsed.length === 0) return null;
    const rows = parsed.map((cell) => cell.row);
    const columns = parsed.map((cell) => cell.column);
    const row = Math.min(...rows);
    const column = Math.min(...columns);
    return {
      row,
      column,
      rowSpan: Math.max(...rows) - row + 1,
      columnSpan: Math.max(...columns) - column + 1,
    };
  }

  function unitArtDirection(unit) {
    const first = artCoordinate(unit.cells?.[0]);
    const last = artCoordinate(unit.cells?.at(-1));
    const bounds = artBounds(unit.cells ?? []);
    if (!first || !last || !bounds) return stableArtDirection(unit.id);
    if (bounds.columnSpan > bounds.rowSpan) {
      return last.column < first.column ? "west" : "east";
    }
    if (bounds.rowSpan > bounds.columnSpan) {
      return last.row < first.row ? "north" : "south";
    }
    return stableArtDirection(unit.id ?? unit.cells?.[0]);
  }

  function carrierModuleName(coordinate, carrierCells) {
    const current = artCoordinate(coordinate);
    if (!current) return "carrier_n0e0s0w0.webp";
    const occupied = new Set(carrierCells);
    const north = Data.formatCoordinate(current.row - 2, current.column - 1);
    const east = Data.formatCoordinate(current.row - 1, current.column);
    const south = Data.formatCoordinate(current.row, current.column - 1);
    const west = Data.formatCoordinate(current.row - 1, current.column - 2);
    return `carrier_n${Number(occupied.has(north))}e${Number(occupied.has(east))}s${Number(occupied.has(south))}w${Number(occupied.has(west))}.webp`;
  }

  function unitArtState(unit, definition, coordinate = null) {
    if (unit.destroyed || unit.hp <= 0) return "sunk";
    if (unit.paralyzed) return "paralyzed";
    if (coordinate && unit.hitCells?.includes(coordinate)) return "hit";
    if ((unit.hitCells?.length ?? 0) > 0 || (definition.initialHp && unit.hp < definition.initialHp)) {
      return "damaged";
    }
    return "ready";
  }

  function artSpriteMarkup({
    asset,
    bounds,
    layer,
    stateCode = "ready",
    kind = "unit",
    selected = false,
    label = "",
    effects = "",
    unitId = "",
  }) {
    if (!asset || !bounds) return "";
    const viewBox = UNIT_ART_VIEWBOXES[asset.replace("/assets/images/ocean-2.5d/units/", "")];
    const artwork = viewBox
      ? `<svg class="tactical-hull-viewport" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><image href="${versionedArtUrl(asset)}" x="0" y="0" width="512" height="512" /></svg>`
      : `<img src="${versionedArtUrl(asset)}" alt="" loading="eager" decoding="async" fetchpriority="auto" draggable="false" />`;
    return `<span
      class="tactical-unit-art tactical-unit-art--${kind} tactical-unit-art--${stateCode}${selected ? " tactical-unit-art--selected" : ""}"
      data-grid-row="${bounds.row}"
      data-grid-column="${bounds.column}"
      data-grid-row-span="${bounds.rowSpan}"
      data-grid-column-span="${bounds.columnSpan}"
      data-art-unit-id="${escapeHtml(unitId)}"
      data-art-layer="${layer}"
      data-art-state="${stateCode}"
      role="img"
      aria-label="${escapeHtml(label)}"
    >${effects}${artwork}</span>`;
  }

  function renderTacticalUnitArt(snapshot, options = {}) {
    const sprites = [];
    for (const unit of snapshot?.units ?? []) {
      const definition = Data.getUnitDefinitionById(unit.id) ??
        Data.getUnitDefinitionByType(unit.type);
      if (!definition || !Array.isArray(unit.cells) || unit.cells.length === 0) continue;
      const layer = definition.category === "underwater" ? "underwater" : "surface";
      const selected = options.selectedId === unit.id;
      if (unit.type === Data.UNIT_TYPES.AIRCRAFT_CARRIER) {
        for (const coordinate of unit.cells) {
          const position = artCoordinate(coordinate);
          if (!position) continue;
          const stateCode = unitArtState(unit, definition, coordinate);
          sprites.push(artSpriteMarkup({
            asset: `/assets/images/ocean-2.5d/units/carrier/${carrierModuleName(coordinate, unit.cells)}`,
            bounds: { row: position.row, column: position.column, rowSpan: 1, columnSpan: 1 },
            layer,
            stateCode,
            unitId: unit.id,
            kind: "carrier-module",
            selected,
            label: `${definition.name} ${coordinate}${stateCode === "hit" ? "，该格已受击" : ""}`,
            effects: tacticalArtEffects({ unit, definition, bounds: { rowSpan: 1, columnSpan: 1 }, stateCode, selected, kind: "carrier-module", quality: options.quality }),
          }));
        }
        continue;
      }
      const folder = UNIT_ART_FOLDERS[unit.type];
      const stateCode = unitArtState(unit, definition);
      sprites.push(artSpriteMarkup({
        asset: folder ? `/assets/images/ocean-2.5d/units/${folder}/${unitArtDirection(unit)}.webp` : null,
        bounds: artBounds(unit.cells),
        layer,
        stateCode,
        unitId: unit.id,
        kind: definition.shape === "square" ? "square-unit" : "whole-unit",
        selected,
        label: `${definition.name}${stateCode === "sunk" ? "，已沉没" : stateCode === "paralyzed" ? "，已瘫痪" : ""}`,
        effects: tacticalArtEffects({ unit, definition, bounds: artBounds(unit.cells), stateCode, selected, kind: "unit", quality: options.quality }),
      }));
    }
    for (const decoy of snapshot?.decoys ?? []) {
      const position = artCoordinate(decoy.cell);
      if (!position) continue;
      const stateCode = decoy.destroyed ? "sunk" : "ready";
      sprites.push(artSpriteMarkup({
        asset: `/assets/images/ocean-2.5d/units/decoy/${stableArtDirection(decoy.id ?? decoy.cell)}.webp`,
        bounds: { row: position.row, column: position.column, rowSpan: 1, columnSpan: 1 },
        layer: "underwater",
        stateCode,
        unitId: decoy.id,
        kind: "decoy",
        selected: options.selectedId === decoy.id,
        label: `诱饵鱼雷 ${decoy.cell}${decoy.destroyed ? "，已摧毁" : ""}`,
        effects: tacticalArtEffects({ unit: decoy, definition: Data.getUnitDefinitionByType(Data.UNIT_TYPES.DECOY_TORPEDO), bounds: { rowSpan: 1, columnSpan: 1 }, stateCode, selected: options.selectedId === decoy.id, kind: "decoy", quality: options.quality }),
      }));
    }
    return sprites.length > 0
      ? `<div class="tactical-unit-art-layer" aria-label="2.5D 作战单位投影">${sprites.join("")}</div>`
      : "";
  }

  function actionArtIcon(definition) {
    const file = ACTION_ART_FILES[definition?.type];
    return file
      ? `<img class="action-art-icon" src="${versionedArtUrl(`/assets/images/ocean-2.5d/actions/${file}`)}" alt="" loading="lazy" decoding="async" fetchpriority="low" draggable="false" />`
      : uiIcon("action-radar");
  }
