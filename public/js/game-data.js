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
    version: "1.0.0",
    stage: "Ocean-v1.0",
    ruleVersion: "1.4",
    socketProtocolVersion: "1.6",
  });
  const BOARD_SIZE = 12;
  const ROWS = Object.freeze("ABCDEFGHIJKL".split(""));
  const COLUMNS = Object.freeze(
    Array.from({ length: BOARD_SIZE }, (_value, index) => index + 1),
  );

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

  const UNIT_DEFINITIONS = Object.freeze([
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

  const ACTION_DEFINITIONS = Object.freeze([
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

  const ALL_COORDINATES = Object.freeze(
    ROWS.flatMap((row) => COLUMNS.map((column) => `${row}${column}`)),
  );

  function parseCoordinate(coordinate) {
    if (typeof coordinate !== "string") {
      return null;
    }
    const match = /^([A-L])(1[0-2]|[1-9])$/.exec(coordinate.trim().toUpperCase());
    if (!match) {
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

  const RANDOM_CANDIDATES = Object.freeze({
    "destroyer-i": lineCandidates(3),
    "destroyer-ii": lineCandidates(4),
    submarine: rectangleCandidates(2, 2),
    pirate: lineCandidates(3),
    motorboat: ALL_COORDINATES.map((cell) => [cell]),
    "motorboat-2": ALL_COORDINATES.map((cell) => [cell]),
    nuclear: rectangleCandidates(2, 2),
    carrier: [
      ...rectangleCandidates(2, 3),
      ...rectangleCandidates(3, 2),
    ],
    "decoy-1": ALL_COORDINATES.map((cell) => [cell]),
    "decoy-2": ALL_COORDINATES.map((cell) => [cell]),
    "decoy-3": ALL_COORDINATES.map((cell) => [cell]),
  });

  const RANDOM_ORDER = Object.freeze([
    "carrier",
    "destroyer-ii",
    "submarine",
    "nuclear",
    "destroyer-i",
    "pirate",
    "motorboat",
    "motorboat-2",
    "decoy-1",
    "decoy-2",
    "decoy-3",
  ]);

  function generateRandomDeployment(random = Math.random) {
    const chosen = new Map();
    const occupied = new Set();
    const candidates = Object.fromEntries(
      RANDOM_ORDER.map((id) => [id, shuffle(RANDOM_CANDIDATES[id], random)]),
    );

    function place(index) {
      if (index >= RANDOM_ORDER.length) {
        return true;
      }
      const id = RANDOM_ORDER[index];
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
      return horizontal
        ? rectangle(center.row - 3, center.row + 3, center.column - 5, center.column + 5, true)
        : rectangle(center.row - 5, center.row + 5, center.column - 3, center.column + 3, true);
    }
    if (type === UNIT_TYPES.DESTROYER_II && points.length === 4) {
      const centerRow = Math.floor((points[1].row + points[2].row) / 2);
      const centerColumn = Math.floor(
        (points[1].column + points[2].column) / 2,
      );
      const horizontal = points[0].row === points[3].row;
      return horizontal
        ? rectangle(centerRow - 3, centerRow + 4, centerColumn - 4, centerColumn + 5, true)
        : rectangle(centerRow - 4, centerRow + 5, centerColumn - 3, centerColumn + 4, true);
    }
    return [];
  }

  function getAreaCells(kind, center) {
    const point = parseCoordinate(center);
    if (!point) {
      return [];
    }
    if (kind === "shock") {
      return rectangle(
        point.row - 2,
        point.row + 2,
        point.column - 2,
        point.column + 2,
      );
    }
    if (kind === "detection") {
      return rectangle(
        point.row - 1,
        point.row + 1,
        point.column - 1,
        point.column + 1,
      );
    }
    if (kind === "radar") {
      return rectangle(point.row, point.row + 3, point.column, point.column + 3);
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
      return rectangle(2, BOARD_SIZE - 3, 2, BOARD_SIZE - 3).map((coordinate) => ({
        kind: "cell",
        coordinate,
      }));
    }
    if (definition.rangeMode === "detection") {
      return rectangle(1, BOARD_SIZE - 2, 1, BOARD_SIZE - 2).map((coordinate) => ({
        kind: "cell",
        coordinate,
      }));
    }
    if (definition.rangeMode === "radar") {
      return rectangle(0, BOARD_SIZE - 4, 0, BOARD_SIZE - 4).map((coordinate) => ({ kind: "cell", coordinate }));
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

  return Object.freeze({
    ACTION_DEFINITIONS,
    ACTION_TYPES,
    ALL_COORDINATES,
    BOARD_SIZE,
    COLUMNS,
    ROWS,
    RELEASE,
    UNIT_DEFINITIONS,
    UNIT_TYPES,
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
  });
});
