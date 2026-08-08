"use strict";

const { RuleValidationError } = require("./errors");

const BOARD_SIZE = 10;
const ROW_LABELS = "ABCDEFGHIJ";

function isPointInBounds(row, column) {
  return (
    Number.isInteger(row) &&
    Number.isInteger(column) &&
    row >= 0 &&
    row < BOARD_SIZE &&
    column >= 0 &&
    column < BOARD_SIZE
  );
}

function parseCoordinate(value) {
  if (typeof value !== "string") {
    throw new RuleValidationError(
      "INVALID_COORDINATE",
      "坐标必须是 A1～J10 格式的字符串。",
      { value },
    );
  }

  const normalized = value.trim().toUpperCase();
  const match = /^([A-J])(10|[1-9])$/.exec(normalized);

  if (!match) {
    throw new RuleValidationError(
      "INVALID_COORDINATE",
      "坐标必须位于 A1～J10。",
      { value },
    );
  }

  return {
    row: ROW_LABELS.indexOf(match[1]),
    column: Number(match[2]) - 1,
  };
}

function normalizePoint(value) {
  if (typeof value === "string") {
    return parseCoordinate(value);
  }

  if (
    value &&
    typeof value === "object" &&
    isPointInBounds(value.row, value.column)
  ) {
    return {
      row: value.row,
      column: value.column,
    };
  }

  throw new RuleValidationError(
    "INVALID_COORDINATE",
    "坐标必须位于 A1～J10。",
    { value },
  );
}

function formatCoordinate(value) {
  const point = normalizePoint(value);
  return `${ROW_LABELS[point.row]}${point.column + 1}`;
}

function coordinateKey(value) {
  const point = normalizePoint(value);
  return `${point.row}:${point.column}`;
}

function comparePoints(left, right) {
  return left.row - right.row || left.column - right.column;
}

function sortCoordinates(coordinates) {
  return coordinates
    .map((coordinate) => normalizePoint(coordinate))
    .sort(comparePoints)
    .map((point) => formatCoordinate(point));
}

function getOrthogonalNeighbors(value) {
  const point = normalizePoint(value);
  const candidates = [
    { row: point.row - 1, column: point.column },
    { row: point.row + 1, column: point.column },
    { row: point.row, column: point.column - 1 },
    { row: point.row, column: point.column + 1 },
  ];

  return candidates
    .filter((candidate) =>
      isPointInBounds(candidate.row, candidate.column),
    )
    .map((candidate) => formatCoordinate(candidate));
}

module.exports = {
  BOARD_SIZE,
  ROW_LABELS,
  comparePoints,
  coordinateKey,
  formatCoordinate,
  getOrthogonalNeighbors,
  isPointInBounds,
  normalizePoint,
  parseCoordinate,
  sortCoordinates,
};
