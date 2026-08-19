"use strict";

const {
  formatCoordinate,
  normalizePoint,
} = require("./coordinates");
const { validatePlacement } = require("./deployment");
const { RuleValidationError } = require("./errors");
const { DEFAULT_MAP_RULES, createMapRules } = require("./map-rules");
const { DEPLOYABLE_TYPES } = require("./units");

function getRectangle(minRow, maxRow, minColumn, maxColumn, options = {}) {
  const clip = options.clip === true;
  const mapRules = createMapRules(options.mapRules?.mapSize ?? options.mapRules ?? 12);

  if (
    !clip &&
    (minRow < 0 ||
      minColumn < 0 ||
      maxRow >= mapRules.boardSize ||
      maxColumn >= mapRules.boardSize)
  ) {
    throw new RuleValidationError(
      "INCOMPLETE_AREA",
      "该中心格无法形成规则要求的完整作用区域。",
      { minRow, maxRow, minColumn, maxColumn },
    );
  }

  const effectiveMinRow = clip ? Math.max(0, minRow) : minRow;
  const effectiveMaxRow = clip
    ? Math.min(mapRules.boardSize - 1, maxRow)
    : maxRow;
  const effectiveMinColumn = clip ? Math.max(0, minColumn) : minColumn;
  const effectiveMaxColumn = clip
    ? Math.min(mapRules.boardSize - 1, maxColumn)
    : maxColumn;
  const coordinates = [];

  for (let row = effectiveMinRow; row <= effectiveMaxRow; row += 1) {
    for (
      let column = effectiveMinColumn;
      column <= effectiveMaxColumn;
      column += 1
    ) {
      coordinates.push(formatCoordinate({ row, column }, mapRules));
    }
  }

  return coordinates;
}

function assertDestroyerPlacement(type, cells, mapRules = DEFAULT_MAP_RULES) {
  const result = validatePlacement({
    id: "range-source",
    type,
    cells,
  }, { mapRules });

  if (!result.valid) {
    throw new RuleValidationError(
      "INVALID_RANGE_SOURCE",
      "驱逐舰坐标不符合其部署形状。",
      { type, errors: result.errors },
    );
  }

  return result.normalizedPlacement.cells.map((cell) =>
    normalizePoint(cell, mapRules),
  );
}

function getDestroyerIRange(cells, mapRules = DEFAULT_MAP_RULES) {
  const rules = createMapRules(mapRules.mapSize ?? mapRules);
  const points = assertDestroyerPlacement(
    DEPLOYABLE_TYPES.DESTROYER_I,
    cells,
    rules,
  );
  const center = points[1];

  const horizontal = points[0].row === points[2].row;
  const halfAlong = Math.floor(rules.destroyerI.along / 2);
  const halfAcross = Math.floor(rules.destroyerI.across / 2);
  return horizontal
    ? getRectangle(center.row - halfAcross, center.row + halfAcross, center.column - halfAlong, center.column + halfAlong, { clip: true, mapRules: rules })
    : getRectangle(center.row - halfAlong, center.row + halfAlong, center.column - halfAcross, center.column + halfAcross, { clip: true, mapRules: rules });
}

function getDestroyerIIRange(cells, mapRules = DEFAULT_MAP_RULES) {
  const rules = createMapRules(mapRules.mapSize ?? mapRules);
  const points = assertDestroyerPlacement(
    DEPLOYABLE_TYPES.DESTROYER_II,
    cells,
    rules,
  );
  const centerRow = Math.floor((points[1].row + points[2].row) / 2);
  const centerColumn = Math.floor(
    (points[1].column + points[2].column) / 2,
  );

  const horizontal = points[0].row === points[3].row;
  const alongBefore = rules.destroyerII.along / 2 - 1;
  const alongAfter = rules.destroyerII.along / 2;
  const acrossBefore = rules.destroyerII.across / 2 - 1;
  const acrossAfter = rules.destroyerII.across / 2;
  return horizontal
    ? getRectangle(centerRow - acrossBefore, centerRow + acrossAfter, centerColumn - alongBefore, centerColumn + alongAfter, { clip: true, mapRules: rules })
    : getRectangle(centerRow - alongBefore, centerRow + alongAfter, centerColumn - acrossBefore, centerColumn + acrossAfter, { clip: true, mapRules: rules });
}

function getDestroyerRange(type, cells, mapRules = DEFAULT_MAP_RULES) {
  if (type === DEPLOYABLE_TYPES.DESTROYER_I) {
    return getDestroyerIRange(cells, mapRules);
  }
  if (type === DEPLOYABLE_TYPES.DESTROYER_II) {
    return getDestroyerIIRange(cells, mapRules);
  }
  throw new RuleValidationError(
    "UNSUPPORTED_RANGE_SOURCE",
    "只有驱逐舰Ⅰ或驱逐舰Ⅱ具有驱逐舰攻击范围。",
    { type },
  );
}

function getShockArea(center, mapRules = DEFAULT_MAP_RULES) {
  const rules = createMapRules(mapRules.mapSize ?? mapRules);
  const point = normalizePoint(center, rules);
  const radius = Math.floor(rules.shockSize / 2);
  return getRectangle(
    point.row - radius,
    point.row + radius,
    point.column - radius,
    point.column + radius,
    { mapRules: rules },
  );
}

function getDetectionArea(center, mapRules = DEFAULT_MAP_RULES) {
  const rules = createMapRules(mapRules.mapSize ?? mapRules);
  const point = normalizePoint(center, rules);
  const radius = Math.floor(rules.detectionSize / 2);
  return getRectangle(
    point.row - radius,
    point.row + radius,
    point.column - radius,
    point.column + radius,
    { mapRules: rules },
  );
}

function getRadarArea(topLeft, mapRules = DEFAULT_MAP_RULES) {
  const rules = createMapRules(mapRules.mapSize ?? mapRules);
  const point = normalizePoint(topLeft, rules);
  return getRectangle(
    point.row,
    point.row + rules.radarSize - 1,
    point.column,
    point.column + rules.radarSize - 1,
    { mapRules: rules },
  );
}

function getFullRow(rowLabel, mapRules = DEFAULT_MAP_RULES) {
  const rules = createMapRules(mapRules.mapSize ?? mapRules);
  if (typeof rowLabel !== "string") {
    throw new RuleValidationError(
      "INVALID_ROW",
      `行必须使用 A～${rules.rowLabels.at(-1)} 表示。`,
      { rowLabel },
    );
  }

  const normalized = rowLabel.trim().toUpperCase();
  const row = rules.rowLabels.indexOf(normalized);
  if (row === -1 || normalized.length !== 1) {
    throw new RuleValidationError(
      "INVALID_ROW",
      `行必须使用 A～${rules.rowLabels.at(-1)} 表示。`,
      { rowLabel },
    );
  }

  return getRectangle(row, row, 0, rules.boardSize - 1, { mapRules: rules });
}

function getFullColumn(columnNumber, mapRules = DEFAULT_MAP_RULES) {
  const rules = createMapRules(mapRules.mapSize ?? mapRules);
  if (
    !Number.isInteger(columnNumber) ||
    columnNumber < 1 ||
    columnNumber > rules.boardSize
  ) {
    throw new RuleValidationError(
      "INVALID_COLUMN",
      `列必须使用 1～${rules.boardSize} 的整数表示。`,
      { columnNumber },
    );
  }

  const column = columnNumber - 1;
  return getRectangle(0, rules.boardSize - 1, column, column, { mapRules: rules });
}

function getHelicopterArea(axis, index, mapRules = DEFAULT_MAP_RULES) {
  if (axis === "row") {
    return getFullRow(index, mapRules);
  }
  if (axis === "column") {
    return getFullColumn(index, mapRules);
  }
  throw new RuleValidationError(
    "INVALID_AXIS",
    "直升机攻击轴必须是 row 或 column。",
    { axis },
  );
}

module.exports = {
  getDetectionArea,
  getDestroyerIRange,
  getDestroyerIIRange,
  getDestroyerRange,
  getFullColumn,
  getFullRow,
  getHelicopterArea,
  getRadarArea,
  getShockArea,
};
