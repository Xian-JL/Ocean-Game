"use strict";

const { RuleValidationError } = require("./errors");
const {
  ALL_ROW_LABELS,
  DEFAULT_MAP_RULES,
  DEFAULT_MAP_SIZE,
  createMapRules,
} = require("./map-rules");

const BOARD_SIZE = DEFAULT_MAP_SIZE;
const ROW_LABELS = DEFAULT_MAP_RULES.rowLabels;

function resolveMapRules(value = DEFAULT_MAP_RULES) {
  if (typeof value === "number" || typeof value === "string") {
    return createMapRules(value);
  }
  return value?.mapSize ? createMapRules(value.mapSize) : DEFAULT_MAP_RULES;
}

function isPointInBounds(row, column, mapRules = DEFAULT_MAP_RULES) {
  const rules = resolveMapRules(mapRules);
  return (
    Number.isInteger(row) &&
    Number.isInteger(column) &&
    row >= 0 &&
    row < rules.boardSize &&
    column >= 0 &&
    column < rules.boardSize
  );
}

function parseCoordinate(value, mapRules = DEFAULT_MAP_RULES) {
  const rules = resolveMapRules(mapRules);
  if (typeof value !== "string") {
    throw new RuleValidationError(
      "INVALID_COORDINATE",
      `坐标必须是 A1～${rules.coordinateMaximum} 格式的字符串。`,
      { value },
    );
  }

  const normalized = value.trim().toUpperCase();
  const match = /^([A-O])(1[0-5]|[1-9])$/.exec(normalized);

  if (!match || !rules.rowLabels.includes(match[1]) || Number(match[2]) > rules.boardSize) {
    throw new RuleValidationError(
      "INVALID_COORDINATE",
      `坐标必须位于 A1～${rules.coordinateMaximum}。`,
      { value },
    );
  }

  return {
    row: ALL_ROW_LABELS.indexOf(match[1]),
    column: Number(match[2]) - 1,
  };
}

function normalizePoint(value, mapRules = DEFAULT_MAP_RULES) {
  const rules = resolveMapRules(mapRules);
  if (typeof value === "string") {
    return parseCoordinate(value, rules);
  }

  if (
    value &&
    typeof value === "object" &&
    isPointInBounds(value.row, value.column, rules)
  ) {
    return {
      row: value.row,
      column: value.column,
    };
  }

  throw new RuleValidationError(
    "INVALID_COORDINATE",
    `坐标必须位于 A1～${rules.coordinateMaximum}。`,
    { value },
  );
}

function formatCoordinate(value, mapRules = DEFAULT_MAP_RULES) {
  const rules = resolveMapRules(mapRules);
  const point = normalizePoint(value, rules);
  return `${rules.rowLabels[point.row]}${point.column + 1}`;
}

function coordinateKey(value, mapRules = DEFAULT_MAP_RULES) {
  const point = normalizePoint(value, mapRules);
  return `${point.row}:${point.column}`;
}

function comparePoints(left, right) {
  return left.row - right.row || left.column - right.column;
}

function sortCoordinates(coordinates, mapRules = DEFAULT_MAP_RULES) {
  const rules = resolveMapRules(mapRules);
  return coordinates
    .map((coordinate) => normalizePoint(coordinate, rules))
    .sort(comparePoints)
    .map((point) => formatCoordinate(point, rules));
}

function getOrthogonalNeighbors(value, mapRules = DEFAULT_MAP_RULES) {
  const rules = resolveMapRules(mapRules);
  const point = normalizePoint(value, rules);
  const candidates = [
    { row: point.row - 1, column: point.column },
    { row: point.row + 1, column: point.column },
    { row: point.row, column: point.column - 1 },
    { row: point.row, column: point.column + 1 },
  ];

  return candidates
    .filter((candidate) =>
      isPointInBounds(candidate.row, candidate.column, rules),
    )
    .map((candidate) => formatCoordinate(candidate, rules));
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
  resolveMapRules,
  sortCoordinates,
};
