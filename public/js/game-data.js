"use strict";

(function initializeGameData(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.OceanGameData = api;
  }
})(typeof globalThis === "object" ? globalThis : this, function createGameData() {
  const RELEASE = Object.freeze({
    version: "1.4.1",
    stage: "Ocean-v1.4.1",
    ruleVersion: "1.8",
    socketProtocolVersion: "2.1",
  });
  const SUPPORTED_MAP_SIZES = Object.freeze([10, 12, 15]);
  const ALL_ROW_LABELS = "ABCDEFGHIJKLMNO";
  let BOARD_SIZE = 12;
  let ACTIVE_MAP_RULES = null;
  const ROWS = [];
  const COLUMNS = [];

  const UNIT_TYPES = Object.freeze({
    DESTROYER_I: "destroyer_i",
    DESTROYER_II: "destroyer_ii",
    SUBMARINE: "submarine",
    PIRATE_SHIP: "pirate_ship",
    MOTORBOAT: "motorboat",
    NUCLEAR_SUBMARINE: "nuclear_submarine",
    AIRCRAFT_CARRIER: "aircraft_carrier",
    DECOY_TORPEDO: "decoy_torpedo",
  });

  const ACTION_TYPES = Object.freeze({
    DESTROYER_I_RAM: "destroyer_i_ram",
    DESTROYER_II_RAM: "destroyer_ii_ram",
    PIRATE_ATTACK: "pirate_attack",
    MOTORBOAT_RAM: "motorboat_ram",
    SUBMARINE_MISSILE: "submarine_missile",
    NUCLEAR_BOMB: "nuclear_bomb",
    SHOCK_BOMB: "shock_bomb",
    DETECTION_BOMB: "detection_bomb",
    HELICOPTER_STRAFE: "helicopter_strafe",
    RADAR_SCAN: "radar_scan",
  });

  const BASE_UNIT_DEFINITIONS = Object.freeze([
    Object.freeze({
      id: "destroyer-i",
      type: UNIT_TYPES.DESTROYER_I,
      name: "驱逐舰Ⅰ",
      shortName: "驱Ⅰ",
      category: "surface",
      shape: "line",
      cellCount: 3,
      initialHp: 3,
      shapeText: "1×3 直线",
    }),
    Object.freeze({
      id: "destroyer-ii",
      type: UNIT_TYPES.DESTROYER_II,
      name: "驱逐舰Ⅱ",
      shortName: "驱Ⅱ",
      category: "surface",
      shape: "line",
      cellCount: 4,
      initialHp: 3,
      shapeText: "1×4 直线",
    }),
    Object.freeze({
      id: "submarine",
      type: UNIT_TYPES.SUBMARINE,
      name: "潜水艇",
      shortName: "潜",
      category: "underwater",
      shape: "square",
      cellCount: 4,
      initialHp: 2,
      shapeText: "2×2",
    }),
    Object.freeze({
      id: "pirate",
      type: UNIT_TYPES.PIRATE_SHIP,
      name: "海盗船",
      shortName: "盗",
      category: "surface",
      shape: "line",
      cellCount: 3,
      initialHp: 2,
      shapeText: "1×3 直线",
    }),
    ...[1, 2].map((number) => Object.freeze({
      id: number === 1 ? "motorboat" : "motorboat-2",
      type: UNIT_TYPES.MOTORBOAT,
      name: `摩托艇 ${number}`,
      shortName: "摩",
      category: "surface",
      shape: "single",
      cellCount: 1,
      initialHp: 1,
      shapeText: "单格",
    })),
    Object.freeze({
      id: "nuclear",
      type: UNIT_TYPES.NUCLEAR_SUBMARINE,
      name: "核潜艇",
      shortName: "核",
      category: "underwater",
      shape: "square",
      cellCount: 4,
      initialHp: 3,
      shapeText: "2×2",
    }),
    Object.freeze({
      id: "carrier",
      type: UNIT_TYPES.AIRCRAFT_CARRIER,
      name: "航空母舰",
      shortName: "航",
      category: "surface",
      shape: "connected",
      cellCount: 6,
      initialHp: 6,
      shapeText: "6 格四向连通",
    }),
    ...[1, 2, 3].map((number) => Object.freeze({
      id: `decoy-${number}`,
      type: UNIT_TYPES.DECOY_TORPEDO,
      name: `诱饵鱼雷 ${number}`,
      shortName: "雷",
      category: "decoy",
      shape: "single",
      cellCount: 1,
      initialHp: null,
      shapeText: "单格",
    })),
  ]);

  const BASE_ACTION_DEFINITIONS = Object.freeze([
    Object.freeze({
      type: ACTION_TYPES.DESTROYER_I_RAM,
      name: "驱逐舰Ⅰ冲撞",
      sourceType: UNIT_TYPES.DESTROYER_I,
      targetMode: "cell",
      rangeMode: "destroyer_i",
      initialUses: null,
      warning: "命中存活作战单位时目标受到 1 点伤害、驱逐舰Ⅰ自身受到 0.5 点伤害；命中诱饵鱼雷时摧毁诱饵、驱逐舰Ⅰ自身受到 1 点伤害；未命中不自损。",
    }),
    Object.freeze({
      type: ACTION_TYPES.DESTROYER_II_RAM,
      name: "驱逐舰Ⅱ冲撞",
      sourceType: UNIT_TYPES.DESTROYER_II,
      targetMode: "cell",
      rangeMode: "destroyer_ii",
      initialUses: null,
      warning: "命中存活作战单位时目标受到 1 点伤害、驱逐舰Ⅱ自身受到 0.5 点伤害；命中诱饵鱼雷时摧毁诱饵、驱逐舰Ⅱ自身受到 1 点伤害；未命中不自损。",
    }),
    Object.freeze({
      type: ACTION_TYPES.PIRATE_ATTACK,
      name: "海盗船攻击",
      sourceType: UNIT_TYPES.PIRATE_SHIP,
      targetMode: "cell",
      rangeMode: "full_board",
      initialUses: null,
      warning: "成功命中任一敌方作战单位时目标 −2、海盗船自损 1；命中诱饵时海盗船受爆炸伤害 1。海盗船每次实际受伤都会使己方航空母舰额外损失 0.5；未命中无伤害。",
    }),
    Object.freeze({
      type: ACTION_TYPES.MOTORBOAT_RAM,
      name: "摩托艇冲撞",
      sourceType: UNIT_TYPES.MOTORBOAT,
      targetMode: "cell",
      rangeMode: "full_board",
      initialUses: null,
      warning: "只有命中航空母舰时目标受到 1 点伤害；命中其他水面单位只显示命中且不伤害目标；命中水面单位或诱饵鱼雷后摩托艇沉没；水下作战单位不可被命中。",
    }),
    Object.freeze({
      type: ACTION_TYPES.SUBMARINE_MISSILE,
      name: "潜射导弹",
      sourceType: UNIT_TYPES.SUBMARINE,
      targetMode: "cell",
      rangeMode: "full_board",
      initialUses: 4,
      warning: "发射后只显示“导弹已发射”；你不会获知命中、未命中、目标类型或伤害。该格仍可再次成为攻击目标。",
    }),
    Object.freeze({
      type: ACTION_TYPES.NUCLEAR_BOMB,
      name: "核弹",
      sourceType: UNIT_TYPES.NUCLEAR_SUBMARINE,
      targetMode: "cell",
      rangeMode: "full_board",
      initialUses: 2,
      warning: "命中航空母舰造成 2 点伤害，命中其他作战单位造成 1 点伤害，命中诱饵鱼雷会将其摧毁；发射方不会获知命中情况。",
    }),
    Object.freeze({
      type: ACTION_TYPES.SHOCK_BOMB,
      name: "震爆弹",
      sourceType: UNIT_TYPES.NUCLEAR_SUBMARINE,
      targetMode: "area",
      rangeMode: "shock",
      initialUses: 1,
      warning: "以中心格形成完整 5×5 区域。只有水下作战单位可能在其下一个正常回合瘫痪；你不会获知是否生效。",
    }),
    Object.freeze({
      type: ACTION_TYPES.DETECTION_BOMB,
      name: "探测弹",
      sourceType: UNIT_TYPES.NUCLEAR_SUBMARINE,
      targetMode: "area",
      rangeMode: "detection",
      initialUses: 1,
      warning: "以中心格形成完整 3×3 区域。潜水艇或核潜艇的未受击存活单位格，以及未被摧毁的诱饵鱼雷，都会产生水下信号；只返回是否探测到信号。",
    }),
    Object.freeze({
      type: ACTION_TYPES.HELICOPTER_STRAFE,
      name: "直升机扫射",
      sourceType: UNIT_TYPES.AIRCRAFT_CARRIER,
      targetMode: "line",
      rangeMode: "full_line",
      initialUses: 1,
      warning: "选择完整一行或一列，只命中水面单位；对航空母舰的本次总伤害最多为 2。己方两艘驱逐舰均沉没后解锁。",
    }),
    Object.freeze({
      type: ACTION_TYPES.RADAR_SCAN,
      name: "雷达扫描",
      sourceType: UNIT_TYPES.AIRCRAFT_CARRIER,
      targetMode: "area",
      rangeMode: "radar",
      initialUses: 1,
      warning: "每名玩家的首个行动回合必须使用航空母舰自带雷达，选择完整 4×4 区域；只返回是否存在敌方布局。",
    }),
  ]);

  const UNIT_DEFINITIONS = [];
  const ACTION_DEFINITIONS = [];
  const ALL_COORDINATES = [];

  function nearestWithParity(value, parity, maximum) {
    const candidates = [];
    for (let candidate = parity === "odd" ? 1 : 2; candidate <= maximum; candidate += 2) {
      candidates.push(candidate);
    }
    return candidates.reduce((best, candidate) => {
      const difference = Math.abs(candidate - value);
      const bestDifference = Math.abs(best - value);
      return difference < bestDifference || (difference === bestDifference && candidate < best)
        ? candidate
        : best;
    }, candidates[0]);
  }

  function createMapRules(value = 12) {
    const mapSize = Number(value);
    if (!SUPPORTED_MAP_SIZES.includes(mapSize)) {
      throw new RangeError("地图大小只能选择 10、12 或 15。");
    }
    const scale = mapSize / 12;
    const rules = {
      mapSize,
      boardSize: mapSize,
      rowLabels: ALL_ROW_LABELS.slice(0, mapSize),
      coordinateMaximum: `${ALL_ROW_LABELS[mapSize - 1]}${mapSize}`,
      carrierCellCount: Math.round(mapSize / 2),
      carrierHp: Math.round(mapSize / 2),
      decoyCount: Math.max(1, Math.round(3 * scale * scale)),
      destroyerI: {
        along: nearestWithParity(11 * scale, "odd", mapSize),
        across: nearestWithParity(7 * scale, "odd", mapSize),
      },
      destroyerII: {
        along: nearestWithParity(10 * scale, "even", mapSize),
        across: nearestWithParity(8 * scale, "even", mapSize),
      },
      radarSize: Math.round(mapSize / 3),
      shockSize: nearestWithParity(5 * scale, "odd", mapSize),
      detectionSize: nearestWithParity(3 * scale, "odd", mapSize),
    };
    return rules;
  }

  function createUnitDefinitions(mapRules) {
    const fixed = BASE_UNIT_DEFINITIONS
      .filter((definition) => definition.type !== UNIT_TYPES.DECOY_TORPEDO)
      .map((definition) => definition.type === UNIT_TYPES.AIRCRAFT_CARRIER
        ? Object.freeze({
            ...definition,
            cellCount: mapRules.carrierCellCount,
            initialHp: mapRules.carrierHp,
            shapeText: `${mapRules.carrierCellCount} 格四向连通`,
          })
        : definition);
    return [
      ...fixed,
      ...Array.from({ length: mapRules.decoyCount }, (_value, index) => Object.freeze({
        id: `decoy-${index + 1}`,
        type: UNIT_TYPES.DECOY_TORPEDO,
        name: `诱饵鱼雷 ${index + 1}`,
        shortName: "雷",
        category: "decoy",
        shape: "single",
        cellCount: 1,
        initialHp: null,
        shapeText: "单格",
      })),
    ];
  }

  function createActionDefinitions(mapRules) {
    return BASE_ACTION_DEFINITIONS.map((definition) => {
      let warning = definition.warning;
      if (definition.type === ACTION_TYPES.SHOCK_BOMB) {
        warning = `以中心格形成完整 ${mapRules.shockSize}×${mapRules.shockSize} 区域。只有水下作战单位可能在其下一个正常回合瘫痪；你不会获知是否生效。`;
      }
      if (definition.type === ACTION_TYPES.DETECTION_BOMB) {
        warning = `以中心格形成完整 ${mapRules.detectionSize}×${mapRules.detectionSize} 区域。潜水艇或核潜艇的未受击存活单位格，以及未被摧毁的诱饵鱼雷，都会产生水下信号；只返回是否探测到信号。`;
      }
      if (definition.type === ACTION_TYPES.RADAR_SCAN) {
        warning = `每名玩家的首个行动回合必须使用航空母舰自带雷达，选择完整 ${mapRules.radarSize}×${mapRules.radarSize} 区域；只返回是否存在敌方布局。`;
      }
      return Object.freeze({ ...definition, warning });
    });
  }

  function configureMap(value = 12) {
    const mapRules = createMapRules(value);
    BOARD_SIZE = mapRules.boardSize;
    ACTIVE_MAP_RULES = mapRules;
    ROWS.splice(0, ROWS.length, ...mapRules.rowLabels.split(""));
    COLUMNS.splice(0, COLUMNS.length,
      ...Array.from({ length: BOARD_SIZE }, (_value, index) => index + 1));
    UNIT_DEFINITIONS.splice(0, UNIT_DEFINITIONS.length, ...createUnitDefinitions(mapRules));
    ACTION_DEFINITIONS.splice(0, ACTION_DEFINITIONS.length, ...createActionDefinitions(mapRules));
    ALL_COORDINATES.splice(0, ALL_COORDINATES.length,
      ...ROWS.flatMap((row) => COLUMNS.map((column) => `${row}${column}`)));
    return mapRules;
  }

  function parseCoordinate(coordinate) {
    if (typeof coordinate !== "string") {
      return null;
    }
    const match = /^([A-O])(1[0-5]|[1-9])$/.exec(coordinate.trim().toUpperCase());
    if (!match || !ROWS.includes(match[1]) || Number(match[2]) > BOARD_SIZE) {
      return null;
    }
    return {
      row: ROWS.indexOf(match[1]),
      column: Number(match[2]) - 1,
    };
  }

  function formatCoordinate(row, column) {
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(column) ||
      row < 0 ||
      row >= BOARD_SIZE ||
      column < 0 ||
      column >= BOARD_SIZE
    ) {
      return null;
    }
    return `${ROWS[row]}${column + 1}`;
  }

  function sortCoordinates(coordinates) {
    return [...coordinates].sort((left, right) => {
      const leftPoint = parseCoordinate(left);
      const rightPoint = parseCoordinate(right);
      if (!leftPoint || !rightPoint) {
        return String(left).localeCompare(String(right));
      }
      return (
        leftPoint.row * BOARD_SIZE + leftPoint.column -
        (rightPoint.row * BOARD_SIZE + rightPoint.column)
      );
    });
  }

  function rectangle(minRow, maxRow, minColumn, maxColumn, clip = false) {
    const startRow = clip ? Math.max(0, minRow) : minRow;
    const endRow = clip ? Math.min(BOARD_SIZE - 1, maxRow) : maxRow;
    const startColumn = clip ? Math.max(0, minColumn) : minColumn;
    const endColumn = clip ? Math.min(BOARD_SIZE - 1, maxColumn) : maxColumn;
    if (
      startRow < 0 ||
      startColumn < 0 ||
      endRow >= BOARD_SIZE ||
      endColumn >= BOARD_SIZE
    ) {
      return [];
    }
    const cells = [];
    for (let row = startRow; row <= endRow; row += 1) {
      for (let column = startColumn; column <= endColumn; column += 1) {
        cells.push(formatCoordinate(row, column));
      }
    }
    return cells;
  }

  function fourNeighbors(coordinate) {
    const point = parseCoordinate(coordinate);
    if (!point) {
      return [];
    }
    return [
      formatCoordinate(point.row - 1, point.column),
      formatCoordinate(point.row + 1, point.column),
      formatCoordinate(point.row, point.column - 1),
      formatCoordinate(point.row, point.column + 1),
    ].filter(Boolean);
  }

  function isFourConnected(cells) {
    if (!Array.isArray(cells) || cells.length === 0) {
      return false;
    }
    const remaining = new Set(cells);
    const queue = [cells[0]];
    remaining.delete(cells[0]);
    while (queue.length > 0) {
      const cell = queue.shift();
      for (const neighbor of fourNeighbors(cell)) {
        if (remaining.delete(neighbor)) {
          queue.push(neighbor);
        }
      }
    }
    return remaining.size === 0;
  }

  function getUnitDefinitionById(id) {
    return UNIT_DEFINITIONS.find((definition) => definition.id === id) ?? null;
  }

  function getUnitDefinitionByType(type) {
    return UNIT_DEFINITIONS.find((definition) => definition.type === type) ?? null;
  }

  function getActionDefinition(type) {
    return ACTION_DEFINITIONS.find((definition) => definition.type === type) ?? null;
  }

  function placementOrientation(cells) {
    const points = (cells ?? []).map(parseCoordinate).filter(Boolean);
    if (points.length < 2) {
      return "horizontal";
    }
    return points.every((point) => point.row === points[0].row)
      ? "horizontal"
      : "vertical";
  }

  function createAnchoredCells(definition, anchor, orientation = "horizontal") {
    const point = parseCoordinate(anchor);
    if (!definition || !point) {
      return [];
    }
    if (definition.shape === "single") {
      return [formatCoordinate(point.row, point.column)];
    }
    if (definition.shape === "square") {
      return rectangle(point.row, point.row + 1, point.column, point.column + 1);
    }
    if (definition.shape === "square3") {
      return rectangle(point.row, point.row + 2, point.column, point.column + 2);
    }
    if (definition.shape === "line") {
      return Array.from({ length: definition.cellCount }, (_value, index) =>
        orientation === "vertical"
          ? formatCoordinate(point.row + index, point.column)
          : formatCoordinate(point.row, point.column + index),
      ).filter(Boolean);
    }
    return [];
  }

  function shapeIsValid(definition, cells) {
    if (!definition || cells.length !== definition.cellCount) {
      return false;
    }
    const points = cells.map(parseCoordinate);
    if (points.some((point) => point === null)) {
      return false;
    }
    if (definition.shape === "single") {
      return true;
    }
    if (definition.shape === "connected") {
      return isFourConnected(cells);
    }
    const rows = points.map((point) => point.row);
    const columns = points.map((point) => point.column);
    if (definition.shape === "square") {
      return (
        new Set(rows).size === 2 &&
        new Set(columns).size === 2 &&
        Math.max(...rows) - Math.min(...rows) === 1 &&
        Math.max(...columns) - Math.min(...columns) === 1
      );
    }
    if (definition.shape === "square3") {
      return new Set(rows).size === 3 && new Set(columns).size === 3 &&
        Math.max(...rows) - Math.min(...rows) === 2 &&
        Math.max(...columns) - Math.min(...columns) === 2;
    }
    if (definition.shape === "line") {
      const horizontal = new Set(rows).size === 1;
      const vertical = new Set(columns).size === 1;
      const values = horizontal ? columns : rows;
      return (
        (horizontal || vertical) &&
        Math.max(...values) - Math.min(...values) + 1 === cells.length
      );
    }
    return false;
  }

  function normalizePlacement(placement) {
    return {
      id: placement.id,
      type: placement.type,
      cells: sortCoordinates([...placement.cells]),
    };
  }

  function validateDeployment(placements) {
    const errors = [];
    const placementList = Array.isArray(placements) ? placements : [];
    if (!Array.isArray(placements)) {
      errors.push("完整部署必须是数组。");
    }
    const byId = new Map();
    for (const placement of placementList) {
      if (!placement || typeof placement !== "object") {
        errors.push("部署中存在无效对象。");
        continue;
      }
      if (byId.has(placement.id)) {
        errors.push(`部署对象 ${placement.id} 重复。`);
      }
      byId.set(placement.id, placement);
    }

    const occupied = new Map();
    const missingIds = [];
    for (const definition of UNIT_DEFINITIONS) {
      const placement = byId.get(definition.id);
      if (!placement) {
        missingIds.push(definition.id);
        errors.push(`尚未部署${definition.name}。`);
        continue;
      }
      if (placement.type !== definition.type) {
        errors.push(`${definition.name}的对象类型不正确。`);
      }
      const cells = Array.isArray(placement.cells) ? placement.cells : [];
      if (new Set(cells).size !== cells.length) {
        errors.push(`${definition.name}不能重复占用同一格。`);
      }
      if (!shapeIsValid(definition, cells)) {
        errors.push(`${definition.name}必须形成${definition.shapeText}。`);
      }
      for (const cell of cells) {
        if (!parseCoordinate(cell)) {
          errors.push(`${definition.name}包含越界坐标。`);
          continue;
        }
        if (occupied.has(cell) && occupied.get(cell) !== definition.id) {
          errors.push(`${cell} 被多个部署对象重叠占用。`);
        } else {
          occupied.set(cell, definition.id);
        }
      }
    }
    for (const placement of placementList) {
      if (!getUnitDefinitionById(placement?.id)) {
        errors.push(`存在未知部署对象 ${placement?.id ?? "（无 ID）"}。`);
      }
    }

    return {
      valid: errors.length === 0,
      errors: [...new Set(errors)],
      missingIds,
      normalizedPlacements: placementList
        .filter((placement) => getUnitDefinitionById(placement?.id))
        .map(normalizePlacement),
    };
  }

  function shuffle(values, random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const value = random();
      const safeValue = Number.isFinite(value) && value >= 0 && value < 1
        ? value
        : Math.random();
      const swapIndex = Math.floor(safeValue * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function lineCandidates(length) {
    const cells = [];
    for (const coordinate of ALL_COORDINATES) {
      const definition = { shape: "line", cellCount: length };
      for (const orientation of ["horizontal", "vertical"]) {
        const candidate = createAnchoredCells(definition, coordinate, orientation);
        if (candidate.length === length) {
          cells.push(candidate);
        }
      }
    }
    return cells;
  }

  function rectangleCandidates(height, width) {
    const candidates = [];
    for (let row = 0; row <= BOARD_SIZE - height; row += 1) {
      for (let column = 0; column <= BOARD_SIZE - width; column += 1) {
        candidates.push(
          rectangle(row, row + height - 1, column, column + width - 1),
        );
      }
    }
    return candidates;
  }

  function carrierCandidates() {
    if (ACTIVE_MAP_RULES.carrierCellCount === 5) {
      const candidates = [];
      for (const [height, width] of [[2, 3], [3, 2]]) {
        for (const cells of rectangleCandidates(height, width)) {
          for (let omitted = 0; omitted < cells.length; omitted += 1) {
            candidates.push(cells.filter((_cell, index) => index !== omitted));
          }
        }
      }
      return candidates;
    }
    const dimensions = ACTIVE_MAP_RULES.carrierCellCount === 8
      ? [[2, 4], [4, 2]]
      : [[2, 3], [3, 2]];
    return dimensions.flatMap(([height, width]) => rectangleCandidates(height, width));
  }

  function randomCandidates() {
    return {
      "destroyer-i": lineCandidates(3),
      "destroyer-ii": lineCandidates(4),
      submarine: rectangleCandidates(2, 2),
      pirate: lineCandidates(3),
      motorboat: ALL_COORDINATES.map((cell) => [cell]),
      "motorboat-2": ALL_COORDINATES.map((cell) => [cell]),
      nuclear: rectangleCandidates(2, 2),
      carrier: carrierCandidates(),
      ...Object.fromEntries(
        Array.from({ length: ACTIVE_MAP_RULES.decoyCount }, (_value, index) => [
          `decoy-${index + 1}`,
          ALL_COORDINATES.map((cell) => [cell]),
        ]),
      ),
    };
  }

  function randomOrder() {
    return [
    "carrier",
    "destroyer-ii",
    "submarine",
    "nuclear",
    "destroyer-i",
    "pirate",
    "motorboat",
    "motorboat-2",
      ...Array.from({ length: ACTIVE_MAP_RULES.decoyCount }, (_value, index) => `decoy-${index + 1}`),
    ];
  }

  function generateRandomDeployment(random = Math.random) {
    const order = randomOrder();
    const definitions = randomCandidates();
    const chosen = new Map();
    const occupied = new Set();
    const candidates = Object.fromEntries(
      order.map((id) => [id, shuffle(definitions[id], random)]),
    );

    function place(index) {
      if (index >= order.length) {
        return true;
      }
      const id = order[index];
      for (const cells of candidates[id]) {
        if (cells.some((cell) => occupied.has(cell))) {
          continue;
        }
        chosen.set(id, cells);
        cells.forEach((cell) => occupied.add(cell));
        if (place(index + 1)) {
          return true;
        }
        cells.forEach((cell) => occupied.delete(cell));
        chosen.delete(id);
      }
      return false;
    }

    if (!place(0)) {
      throw new Error("未能生成完整合法随机部署。");
    }
    return UNIT_DEFINITIONS.map((definition) => ({
      id: definition.id,
      type: definition.type,
      cells: sortCoordinates(chosen.get(definition.id)),
    }));
  }

  function destroyerRange(cells, type) {
    const points = sortCoordinates(cells).map(parseCoordinate);
    if (type === UNIT_TYPES.DESTROYER_I && points.length === 3) {
      const center = points[1];
      const horizontal = points[0].row === points[2].row;
      const halfAlong = Math.floor(ACTIVE_MAP_RULES.destroyerI.along / 2);
      const halfAcross = Math.floor(ACTIVE_MAP_RULES.destroyerI.across / 2);
      return horizontal
        ? rectangle(center.row - halfAcross, center.row + halfAcross, center.column - halfAlong, center.column + halfAlong, true)
        : rectangle(center.row - halfAlong, center.row + halfAlong, center.column - halfAcross, center.column + halfAcross, true);
    }
    if (type === UNIT_TYPES.DESTROYER_II && points.length === 4) {
      const centerRow = Math.floor((points[1].row + points[2].row) / 2);
      const centerColumn = Math.floor(
        (points[1].column + points[2].column) / 2,
      );
      const horizontal = points[0].row === points[3].row;
      const alongBefore = ACTIVE_MAP_RULES.destroyerII.along / 2 - 1;
      const alongAfter = ACTIVE_MAP_RULES.destroyerII.along / 2;
      const acrossBefore = ACTIVE_MAP_RULES.destroyerII.across / 2 - 1;
      const acrossAfter = ACTIVE_MAP_RULES.destroyerII.across / 2;
      return horizontal
        ? rectangle(centerRow - acrossBefore, centerRow + acrossAfter, centerColumn - alongBefore, centerColumn + alongAfter, true)
        : rectangle(centerRow - alongBefore, centerRow + alongAfter, centerColumn - acrossBefore, centerColumn + acrossAfter, true);
    }
    return [];
  }

  function getAreaCells(kind, center) {
    const point = parseCoordinate(center);
    if (!point) {
      return [];
    }
    if (kind === "shock") {
      const radius = Math.floor(ACTIVE_MAP_RULES.shockSize / 2);
      return rectangle(
        point.row - radius,
        point.row + radius,
        point.column - radius,
        point.column + radius,
      );
    }
    if (kind === "detection") {
      const radius = Math.floor(ACTIVE_MAP_RULES.detectionSize / 2);
      return rectangle(
        point.row - radius,
        point.row + radius,
        point.column - radius,
        point.column + radius,
      );
    }
    if (kind === "radar") {
      return rectangle(
        point.row,
        point.row + ACTIVE_MAP_RULES.radarSize - 1,
        point.column,
        point.column + ACTIVE_MAP_RULES.radarSize - 1,
      );
    }
    return [];
  }

  function getFullLine(target) {
    if (target?.kind === "row" && ROWS.includes(target.row)) {
      return COLUMNS.map((column) => `${target.row}${column}`);
    }
    if (
      target?.kind === "column" &&
      Number.isInteger(target.column) &&
      target.column >= 1 &&
      target.column <= BOARD_SIZE
    ) {
      return ROWS.map((row) => `${row}${target.column}`);
    }
    return [];
  }

  function resolvedTargetSet(ownBattle) {
    return new Set(
      Object.entries(ownBattle?.enemyMap?.cellResults ?? {})
        .filter(([, result]) => result === "hit" || result === "miss")
        .map(([coordinate]) => coordinate),
    );
  }

  function getTargetOptions(actionType, ownBattle) {
    const definition = getActionDefinition(actionType);
    if (!definition) {
      return [];
    }
    const destroyerTargets = new Set(
      ownBattle?.enemyMap?.destroyerTargetCells ?? [],
    );
    const source = (ownBattle?.units ?? []).find(
      (unit) => unit.type === definition.sourceType,
    );
    if (!source) {
      return [];
    }
    if (definition.rangeMode === "destroyer_i") {
      return destroyerRange(source.cells, UNIT_TYPES.DESTROYER_I)
        .filter((cell) => !destroyerTargets.has(cell))
        .map((coordinate) => ({ kind: "cell", coordinate }));
    }
    if (definition.rangeMode === "destroyer_ii") {
      return destroyerRange(source.cells, UNIT_TYPES.DESTROYER_II)
        .filter((cell) => !destroyerTargets.has(cell))
        .map((coordinate) => ({ kind: "cell", coordinate }));
    }
    if (definition.rangeMode === "full_board") {
      return ALL_COORDINATES.map(
        (coordinate) => ({ kind: "cell", coordinate }),
      );
    }
    if (definition.rangeMode === "shock") {
      const radius = Math.floor(ACTIVE_MAP_RULES.shockSize / 2);
      return rectangle(radius, BOARD_SIZE - radius - 1, radius, BOARD_SIZE - radius - 1).map((coordinate) => ({
        kind: "cell",
        coordinate,
      }));
    }
    if (definition.rangeMode === "detection") {
      const radius = Math.floor(ACTIVE_MAP_RULES.detectionSize / 2);
      return rectangle(radius, BOARD_SIZE - radius - 1, radius, BOARD_SIZE - radius - 1).map((coordinate) => ({
        kind: "cell",
        coordinate,
      }));
    }
    if (definition.rangeMode === "radar") {
      return rectangle(0, BOARD_SIZE - ACTIVE_MAP_RULES.radarSize, 0, BOARD_SIZE - ACTIVE_MAP_RULES.radarSize).map((coordinate) => ({ kind: "cell", coordinate }));
    }
    if (definition.rangeMode === "full_line") {
      return [
        ...ROWS.map((row) => ({ kind: "row", row })),
        ...COLUMNS.map((column) => ({ kind: "column", column })),
      ];
    }
    return [];
  }

  function targetKey(target) {
    if (target?.kind === "cell") {
      return `cell:${target.coordinate}`;
    }
    if (target?.kind === "row") {
      return `row:${target.row}`;
    }
    if (target?.kind === "column") {
      return `column:${target.column}`;
    }
    return "";
  }

  function previewCells(actionType, target) {
    const definition = getActionDefinition(actionType);
    if (!definition || !target) {
      return [];
    }
    if (definition.rangeMode === "shock") {
      return getAreaCells("shock", target.coordinate);
    }
    if (definition.rangeMode === "detection") {
      return getAreaCells("detection", target.coordinate);
    }
    if (definition.rangeMode === "radar") {
      return getAreaCells("radar", target.coordinate);
    }
    if (definition.rangeMode === "full_line") {
      return getFullLine(target);
    }
    return target.coordinate ? [target.coordinate] : [];
  }

  function destroyerCenterCells(actionType, ownBattle) {
    const definition = getActionDefinition(actionType);
    const source = (ownBattle?.units ?? []).find(
      (unit) => unit.type === definition?.sourceType,
    );
    if (!source) {
      return [];
    }
    const cells = sortCoordinates(source.cells);
    if (actionType === ACTION_TYPES.DESTROYER_I_RAM) {
      return cells.length === 3 ? [cells[1]] : [];
    }
    if (actionType === ACTION_TYPES.DESTROYER_II_RAM) {
      return cells.length === 4 ? [cells[1], cells[2]] : [];
    }
    return [];
  }

  configureMap(12);

  const api = {
    ACTION_DEFINITIONS,
    ACTION_TYPES,
    ALL_COORDINATES,
    COLUMNS,
    ROWS,
    RELEASE,
    UNIT_DEFINITIONS,
    UNIT_TYPES,
    SUPPORTED_MAP_SIZES,
    configureMap,
    createMapRules,
    createAnchoredCells,
    destroyerCenterCells,
    destroyerRange,
    formatCoordinate,
    fourNeighbors,
    generateRandomDeployment,
    getActionDefinition,
    getAreaCells,
    getFullLine,
    getTargetOptions,
    getUnitDefinitionById,
    getUnitDefinitionByType,
    isFourConnected,
    normalizePlacement,
    parseCoordinate,
    placementOrientation,
    previewCells,
    resolvedTargetSet,
    shapeIsValid,
    sortCoordinates,
    targetKey,
    validateDeployment,
  };
  Object.defineProperties(api, {
    BOARD_SIZE: { enumerable: true, get: () => BOARD_SIZE },
    MAP_RULES: { enumerable: true, get: () => ({ ...ACTIVE_MAP_RULES }) },
  });
  return Object.freeze(api);
});
