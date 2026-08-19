"use strict";

const { formatCoordinate, sortCoordinates } = require("./coordinates");
const { assertValidDeployment } = require("./deployment");
const { RuleValidationError } = require("./errors");
const { DEFAULT_MAP_RULES, createMapRules } = require("./map-rules");
const { DEPLOYABLE_TYPES: TYPES } = require("./units");

const BASE_PLACEMENT_SPECS = Object.freeze([
  { id: "carrier", type: TYPES.AIRCRAFT_CARRIER, shape: "carrier" },
  { id: "destroyer-ii", type: TYPES.DESTROYER_II, shape: "line_4" },
  { id: "submarine", type: TYPES.SUBMARINE, shape: "square_2x2" },
  { id: "nuclear", type: TYPES.NUCLEAR_SUBMARINE, shape: "square_2x2" },
  { id: "destroyer-i", type: TYPES.DESTROYER_I, shape: "line_3" },
  { id: "pirate", type: TYPES.PIRATE_SHIP, shape: "line_3" },
  { id: "motorboat", type: TYPES.MOTORBOAT, shape: "single" },
  { id: "motorboat-2", type: TYPES.MOTORBOAT, shape: "single" },
]);

const BASE_OUTPUT_ID_ORDER = Object.freeze([
  "destroyer-i",
  "destroyer-ii",
  "submarine",
  "pirate",
  "motorboat",
  "motorboat-2",
  "nuclear",
  "carrier",
]);

function createPlacementSpecs(mapRules) {
  return [
    ...BASE_PLACEMENT_SPECS,
    ...Array.from({ length: mapRules.decoyCount }, (_value, index) => ({
      id: `decoy-${index + 1}`,
      type: TYPES.DECOY_TORPEDO,
      shape: "single",
    })),
  ];
}

function createOutputIdOrder(mapRules) {
  return [
    ...BASE_OUTPUT_ID_ORDER,
    ...Array.from({ length: mapRules.decoyCount }, (_value, index) => `decoy-${index + 1}`),
  ];
}

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

function cellsFromRectangle(startRow, startColumn, height, width, mapRules) {
  const cells = [];
  for (let rowOffset = 0; rowOffset < height; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < width; columnOffset += 1) {
      cells.push(formatCoordinate({
        row: startRow + rowOffset,
        column: startColumn + columnOffset,
      }, mapRules));
    }
  }
  return sortCoordinates(cells, mapRules);
}

function createLineCandidates(length, mapRules) {
  const candidates = [];
  for (let row = 0; row < mapRules.boardSize; row += 1) {
    for (let column = 0; column <= mapRules.boardSize - length; column += 1) {
      candidates.push(cellsFromRectangle(row, column, 1, length, mapRules));
    }
  }
  for (let row = 0; row <= mapRules.boardSize - length; row += 1) {
    for (let column = 0; column < mapRules.boardSize; column += 1) {
      candidates.push(cellsFromRectangle(row, column, length, 1, mapRules));
    }
  }
  return candidates;
}

function createRectangleCandidates(height, width, mapRules) {
  const candidates = [];
  for (let row = 0; row <= mapRules.boardSize - height; row += 1) {
    for (let column = 0; column <= mapRules.boardSize - width; column += 1) {
      candidates.push(cellsFromRectangle(row, column, height, width, mapRules));
    }
  }
  return candidates;
}

function createCarrierCandidates(mapRules) {
  if (mapRules.carrierCellCount === 5) {
    const candidates = [];
    for (const [height, width] of [[2, 3], [3, 2]]) {
      for (const rectangleCells of createRectangleCandidates(height, width, mapRules)) {
        for (let omitted = 0; omitted < rectangleCells.length; omitted += 1) {
          candidates.push(rectangleCells.filter((_cell, index) => index !== omitted));
        }
      }
    }
    return candidates;
  }
  const dimensions = mapRules.carrierCellCount === 8 ? [[2, 4], [4, 2]] : [[2, 3], [3, 2]];
  return dimensions.flatMap(([height, width]) =>
    createRectangleCandidates(height, width, mapRules));
}

function createCandidatesByShape(mapRules) {
  return {
    carrier: createCarrierCandidates(mapRules),
    line_4: createLineCandidates(4, mapRules),
    line_3: createLineCandidates(3, mapRules),
    square_2x2: createRectangleCandidates(2, 2, mapRules),
    square_3x3: createRectangleCandidates(3, 3, mapRules),
    single: createRectangleCandidates(1, 1, mapRules),
  };
}

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

function generateRandomDeployment(random = Math.random, mapRules = DEFAULT_MAP_RULES) {
  const rules = createMapRules(mapRules.mapSize ?? mapRules);
  const placementSpecs = createPlacementSpecs(rules);
  const candidatesByShape = createCandidatesByShape(rules);
  const candidatesById = Object.fromEntries(
    placementSpecs.map((spec) => [
      spec.id,
      shuffle(candidatesByShape[spec.shape], random),
    ]),
  );
  const placements = new Map();
  const placed = placeRecursively(
    placementSpecs,
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
    createOutputIdOrder(rules).map((id) => placements.get(id)),
    rules,
  );
}

module.exports = {
  generateRandomDeployment,
};
