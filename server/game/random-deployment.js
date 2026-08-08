"use strict";

const { BOARD_SIZE, formatCoordinate, sortCoordinates } = require("./coordinates");
const { assertValidDeployment } = require("./deployment");
const { RuleValidationError } = require("./errors");
const { DEPLOYABLE_TYPES: TYPES } = require("./units");

const PLACEMENT_SPECS = Object.freeze([
  { id: "radar", type: TYPES.RADAR, shape: "square_3x3" },
  { id: "carrier", type: TYPES.AIRCRAFT_CARRIER, shape: "rectangle_2x3" },
  { id: "destroyer-ii", type: TYPES.DESTROYER_II, shape: "line_4" },
  { id: "submarine", type: TYPES.SUBMARINE, shape: "square_2x2" },
  { id: "nuclear", type: TYPES.NUCLEAR_SUBMARINE, shape: "square_2x2" },
  { id: "destroyer-i", type: TYPES.DESTROYER_I, shape: "line_3" },
  { id: "pirate", type: TYPES.PIRATE_SHIP, shape: "line_3" },
  { id: "motorboat", type: TYPES.MOTORBOAT, shape: "single" },
  { id: "decoy-1", type: TYPES.DECOY_TORPEDO, shape: "single" },
  { id: "decoy-2", type: TYPES.DECOY_TORPEDO, shape: "single" },
  { id: "decoy-3", type: TYPES.DECOY_TORPEDO, shape: "single" },
]);

const OUTPUT_ID_ORDER = Object.freeze([
  "radar",
  "destroyer-i",
  "destroyer-ii",
  "submarine",
  "pirate",
  "motorboat",
  "nuclear",
  "carrier",
  "decoy-1",
  "decoy-2",
  "decoy-3",
]);

function readRandom(random) {
  if (typeof random !== "function") {
    throw new RuleValidationError(
      "INVALID_RANDOM_SOURCE",
      "随机部署的随机源必须是函数。",
    );
  }
  const value = random();
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RuleValidationError(
      "INVALID_RANDOM_VALUE",
      "随机部署的随机值必须位于 [0, 1)。",
      { value },
    );
  }
  return value;
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(readRandom(random) * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function cellsFromRectangle(startRow, startColumn, height, width) {
  const cells = [];
  for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
      cells.push(formatCoordinate({
        row: startRow + rowOffset,
        column: startColumn + columnOffset,
      }));
    }
  }
  return sortCoordinates(cells);
}

function createLineCandidates(length) {
  const candidates = [];
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column <= BOARD_SIZE - length; column += 1) {
      candidates.push(cellsFromRectangle(row, column, 1, length));
    }
  }
  for (let row = 0; row <= BOARD_SIZE - length; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      candidates.push(cellsFromRectangle(row, column, length, 1));
    }
  }
  return candidates;
}

function createRectangleCandidates(height, width) {
  const candidates = [];
  for (let row = 0; row <= BOARD_SIZE - height; row += 1) {
    for (let column = 0; column <= BOARD_SIZE - width; column += 1) {
      candidates.push(cellsFromRectangle(row, column, height, width));
    }
  }
  return candidates;
}

const CANDIDATES_BY_SHAPE = Object.freeze({
  rectangle_2x3: Object.freeze([
    ...createRectangleCandidates(2, 3),
    ...createRectangleCandidates(3, 2),
  ]),
  line_4: Object.freeze(createLineCandidates(4)),
  line_3: Object.freeze(createLineCandidates(3)),
  square_2x2: Object.freeze(createRectangleCandidates(2, 2)),
  square_3x3: Object.freeze(createRectangleCandidates(3, 3)),
  single: Object.freeze(createRectangleCandidates(1, 1)),
});

function cellsAreFree(cells, occupied) {
  return cells.every((cell) => !occupied.has(cell));
}

function placeRecursively(specs, candidatesById, index, occupied, placements) {
  if (index >= specs.length) {
    return true;
  }

  const spec = specs[index];
  for (const cells of candidatesById[spec.id]) {
    if (!cellsAreFree(cells, occupied)) {
      continue;
    }

    placements.set(spec.id, {
      id: spec.id,
      type: spec.type,
      cells: [...cells],
    });
    cells.forEach((cell) => occupied.add(cell));

    if (placeRecursively(specs, candidatesById, index + 1, occupied, placements)) {
      return true;
    }

    cells.forEach((cell) => occupied.delete(cell));
    placements.delete(spec.id);
  }
  return false;
}

function generateRandomDeployment(random = Math.random) {
  const candidatesById = Object.fromEntries(
    PLACEMENT_SPECS.map((spec) => [
      spec.id,
      shuffle(CANDIDATES_BY_SHAPE[spec.shape], random),
    ]),
  );
  const placements = new Map();
  const placed = placeRecursively(
    PLACEMENT_SPECS,
    candidatesById,
    0,
    new Set(),
    placements,
  );

  if (!placed) {
    throw new RuleValidationError(
      "RANDOM_DEPLOYMENT_FAILED",
      "服务器未能生成完整合法随机部署。",
    );
  }

  return assertValidDeployment(
    OUTPUT_ID_ORDER.map((id) => placements.get(id)),
  );
}

module.exports = {
  generateRandomDeployment,
};
