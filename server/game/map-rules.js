"use strict";

const { RuleValidationError } = require("./errors");

const DEFAULT_MAP_SIZE = 12;
const SUPPORTED_MAP_SIZES = Object.freeze([10, 12, 15]);
const ALL_ROW_LABELS = "ABCDEFGHIJKLMNO";

function failMapSize(mapSize) {
  throw new RuleValidationError(
    "INVALID_MAP_SIZE",
    "地图大小只能选择 10×10、12×12 或 15×15。",
    { mapSize, supportedMapSizes: [...SUPPORTED_MAP_SIZES] },
  );
}

function normalizeMapSize(value = DEFAULT_MAP_SIZE) {
  const mapSize = typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : value;
  if (!SUPPORTED_MAP_SIZES.includes(mapSize)) {
    failMapSize(value);
  }
  return mapSize;
}

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

function createMapRules(value = DEFAULT_MAP_SIZE) {
  const mapSize = normalizeMapSize(value);
  const scale = mapSize / DEFAULT_MAP_SIZE;
  const areaScale = scale * scale;
  const rules = {
    mapSize,
    boardSize: mapSize,
    rowLabels: ALL_ROW_LABELS.slice(0, mapSize),
    coordinateMaximum: `${ALL_ROW_LABELS[mapSize - 1]}${mapSize}`,
    carrierCellCount: Math.round(mapSize / 2),
    carrierHp: Math.round(mapSize / 2),
    decoyCount: Math.max(1, Math.round(3 * areaScale)),
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
  return Object.freeze({
    ...rules,
    destroyerI: Object.freeze(rules.destroyerI),
    destroyerII: Object.freeze(rules.destroyerII),
  });
}

const DEFAULT_MAP_RULES = createMapRules(DEFAULT_MAP_SIZE);

function assertMapRules(value) {
  const expected = createMapRules(value?.mapSize ?? value?.boardSize);
  if (JSON.stringify(value) !== JSON.stringify(expected)) {
    throw new RuleValidationError(
      "INVALID_MAP_RULES",
      "房间地图规则与服务器派生配置不一致。",
      { mapRules: value },
    );
  }
  return value;
}

module.exports = {
  ALL_ROW_LABELS,
  DEFAULT_MAP_RULES,
  DEFAULT_MAP_SIZE,
  SUPPORTED_MAP_SIZES,
  assertMapRules,
  createMapRules,
  normalizeMapSize,
};
