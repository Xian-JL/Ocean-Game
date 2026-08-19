"use strict";

const {
  BOARD_SIZE,
  ROW_LABELS,
  formatCoordinate,
  normalizePoint,
} = require("./coordinates");
const { validatePlacement } = require("./deployment");
const { RuleValidationError } = require("./errors");
const { DEPLOYABLE_TYPES } = require("./units");

function getRectangle(minRow, maxRow, minColumn, maxColumn, options = {}) {
  const clip = options.clip === true;

  if (
    !clip &&
    (minRow < 0 ||
      minColumn < 0 ||
      maxRow >= BOARD_SIZE ||
      maxColumn >= BOARD_SIZE)
  ) {
    throw new RuleValidationError(
      "INCOMPLETE_AREA",
      "该中心格无法形成规则要求的完整作用区域。",
      { minRow, maxRow, minColumn, maxColumn },
    );
  }

  const effectiveMinRow = clip ? Math.max(0, minRow) : minRow;
  const effectiveMaxRow = clip
    ? Math.min(BOARD_SIZE - 1, maxRow)
    : maxRow;
  const effectiveMinColumn = clip ? Math.max(0, minColumn) : minColumn;
  const effectiveMaxColumn = clip
    ? Math.min(BOARD_SIZE - 1, maxColumn)
    : maxColumn;
  const coordinates = [];

  for (let row = effectiveMinRow; row <= effectiveMaxRow; row += 1) {
    for (
      let column = effectiveMinColumn;
      column <= effectiveMaxColumn;
      column += 1
    ) {
      coordinates.push(formatCoordinate({ row, column }));
    }
  }

  return coordinates;
}

function assertDestroyerPlacement(type, cells) {
  const result = validatePlacement({
    id: "range-source",
    type,
    cells,
  });

  if (!result.valid) {
    throw new RuleValidationError(
      "INVALID_RANGE_SOURCE",
      "驱逐舰坐标不符合其部署形状。",
      { type, errors: result.errors },
    );
  }

  return result.normalizedPlacement.cells.map((cell) =>
    normalizePoint(cell),
  );
}

function getDestroyerIRange(cells) {
  const points = assertDestroyerPlacement(
    DEPLOYABLE_TYPES.DESTROYER_I,
    cells,
  );
  const center = points[1];

  const horizontal = points[0].row === points[2].row;
  return horizontal
    ? getRectangle(center.row - 3, center.row + 3, center.column - 5, center.column + 5, { clip: true })
    : getRectangle(center.row - 5, center.row + 5, center.column - 3, center.column + 3, { clip: true });
}

function getDestroyerIIRange(cells) {
  const points = assertDestroyerPlacement(
    DEPLOYABLE_TYPES.DESTROYER_II,
    cells,
  );
  const centerRow = Math.floor((points[1].row + points[2].row) / 2);
  const centerColumn = Math.floor(
    (points[1].column + points[2].column) / 2,
  );

  const horizontal = points[0].row === points[3].row;
  return horizontal
    ? getRectangle(centerRow - 3, centerRow + 4, centerColumn - 4, centerColumn + 5, { clip: true })
    : getRectangle(centerRow - 4, centerRow + 5, centerColumn - 3, centerColumn + 4, { clip: true });
}

function getDestroyerRange(type, cells) {
  if (type === DEPLOYABLE_TYPES.DESTROYER_I) {
    return getDestroyerIRange(cells);
  }
  if (type === DEPLOYABLE_TYPES.DESTROYER_II) {
    return getDestroyerIIRange(cells);
  }
  throw new RuleValidationError(
    "UNSUPPORTED_RANGE_SOURCE",
    "只有驱逐舰Ⅰ或驱逐舰Ⅱ具有驱逐舰攻击范围。",
    { type },
  );
}

function getShockArea(center) {
  const point = normalizePoint(center);
  return getRectangle(
    point.row - 2,
    point.row + 2,
    point.column - 2,
    point.column + 2,
  );
}

function getDetectionArea(center) {
  const point = normalizePoint(center);
  return getRectangle(
    point.row - 1,
    point.row + 1,
    point.column - 1,
    point.column + 1,
  );
}

function getRadarArea(topLeft) {
  const point = normalizePoint(topLeft);
  return getRectangle(point.row, point.row + 3, point.column, point.column + 3);
}

function getFullRow(rowLabel) {
  if (typeof rowLabel !== "string") {
    throw new RuleValidationError(
      "INVALID_ROW",
      "行必须使用 A～L 表示。",
      { rowLabel },
    );
  }

  const normalized = rowLabel.trim().toUpperCase();
  const row = ROW_LABELS.indexOf(normalized);
  if (row === -1 || normalized.length !== 1) {
    throw new RuleValidationError(
      "INVALID_ROW",
      "行必须使用 A～L 表示。",
      { rowLabel },
    );
  }

  return getRectangle(row, row, 0, BOARD_SIZE - 1);
}

function getFullColumn(columnNumber) {
  if (
    !Number.isInteger(columnNumber) ||
    columnNumber < 1 ||
    columnNumber > BOARD_SIZE
  ) {
    throw new RuleValidationError(
      "INVALID_COLUMN",
      "列必须使用 1～12 的整数表示。",
      { columnNumber },
    );
  }

  const column = columnNumber - 1;
  return getRectangle(0, BOARD_SIZE - 1, column, column);
}

function getHelicopterArea(axis, index) {
  if (axis === "row") {
    return getFullRow(index);
  }
  if (axis === "column") {
    return getFullColumn(index);
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
