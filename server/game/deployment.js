"use strict";

const {
  coordinateKey,
  getOrthogonalNeighbors,
  normalizePoint,
  sortCoordinates,
} = require("./coordinates");
const { RuleValidationError, createRuleIssue } = require("./errors");
const { DEFAULT_MAP_RULES, createMapRules } = require("./map-rules");
const {
  DEPLOYABLE_TYPE_ORDER,
  DEPLOYMENT_SHAPES,
  getFleetRequirements,
  getDeployableDefinition,
} = require("./units");

function isNonEmptyId(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isConsecutive(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted.every(
    (value, index) => index === 0 || value === sorted[index - 1] + 1,
  );
}

function isLine(points) {
  const rows = new Set(points.map((point) => point.row));
  const columns = new Set(points.map((point) => point.column));

  return (
    (rows.size === 1 && isConsecutive(points.map((point) => point.column))) ||
    (columns.size === 1 && isConsecutive(points.map((point) => point.row)))
  );
}

function isSquare2x2(points) {
  const rows = [...new Set(points.map((point) => point.row))].sort(
    (left, right) => left - right,
  );
  const columns = [...new Set(points.map((point) => point.column))].sort(
    (left, right) => left - right,
  );

  return (
    rows.length === 2 &&
    columns.length === 2 &&
    rows[1] === rows[0] + 1 &&
    columns[1] === columns[0] + 1 &&
    points.every((point) =>
      rows.includes(point.row) && columns.includes(point.column),
    )
  );
}

function isSquare3x3(points) {
  const rows = [...new Set(points.map((point) => point.row))].sort((a, b) => a - b);
  const columns = [...new Set(points.map((point) => point.column))].sort((a, b) => a - b);
  return rows.length === 3 && columns.length === 3 && rows[2] - rows[0] === 2 &&
    columns[2] - columns[0] === 2 &&
    points.every((point) => rows.includes(point.row) && columns.includes(point.column));
}

function isFourConnected(points, mapRules = DEFAULT_MAP_RULES) {
  if (points.length === 0) {
    return false;
  }

  const occupied = new Set(points.map((point) => coordinateKey(point, mapRules)));
  const visited = new Set();
  const queue = [points[0]];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = coordinateKey(current, mapRules);

    if (visited.has(currentKey)) {
      continue;
    }

    visited.add(currentKey);

    for (const neighbor of getOrthogonalNeighbors(current, mapRules)) {
      const neighborKey = coordinateKey(neighbor, mapRules);
      if (occupied.has(neighborKey) && !visited.has(neighborKey)) {
        queue.push(normalizePoint(neighbor, mapRules));
      }
    }
  }

  return visited.size === points.length;
}

function hasRequiredShape(shape, points, mapRules = DEFAULT_MAP_RULES) {
  switch (shape) {
    case DEPLOYMENT_SHAPES.LINE:
      return isLine(points);
    case DEPLOYMENT_SHAPES.SQUARE_2X2:
      return isSquare2x2(points);
    case DEPLOYMENT_SHAPES.SQUARE_3X3:
      return isSquare3x3(points);
    case DEPLOYMENT_SHAPES.SINGLE:
      return points.length === 1;
    case DEPLOYMENT_SHAPES.FOUR_CONNECTED:
      return isFourConnected(points, mapRules);
    default:
      return false;
  }
}

function validatePlacement(placement, options = {}) {
  const mapRules = createMapRules(options.mapRules?.mapSize ?? options.mapRules ?? 12);
  const errors = [];
  const index = Number.isInteger(options.index) ? options.index : undefined;

  if (!placement || typeof placement !== "object" || Array.isArray(placement)) {
    errors.push(
      createRuleIssue("PLACEMENT_NOT_OBJECT", "部署项必须是对象。", {
        index,
      }),
    );
    return {
      valid: false,
      errors,
      normalizedPlacement: null,
    };
  }

  const id = isNonEmptyId(placement.id) ? placement.id.trim() : null;
  if (id === null) {
    errors.push(
      createRuleIssue("INVALID_PLACEMENT_ID", "部署项必须具有非空字符串 ID。", {
        index,
      }),
    );
  }

  let definition = null;
  try {
    definition = getDeployableDefinition(placement.type, mapRules);
  } catch (error) {
    if (error instanceof RuleValidationError) {
      errors.push(
        createRuleIssue(error.code, error.message, {
          index,
          id,
          type: placement.type,
        }),
      );
    } else {
      throw error;
    }
  }

  if (!Array.isArray(placement.cells)) {
    errors.push(
      createRuleIssue("INVALID_CELLS", "部署坐标必须是数组。", {
        index,
        id,
      }),
    );
    return {
      valid: false,
      errors,
      normalizedPlacement: {
        id,
        type: placement.type,
        cells: [],
      },
    };
  }

  const points = [];
  for (const [cellIndex, cell] of placement.cells.entries()) {
    try {
      points.push(normalizePoint(cell, mapRules));
    } catch (error) {
      if (error instanceof RuleValidationError) {
        errors.push(
          createRuleIssue("OUT_OF_BOUNDS", `部署坐标必须位于 A1～${mapRules.coordinateMaximum}。`, {
            index,
            id,
            cellIndex,
            cell,
          }),
        );
      } else {
        throw error;
      }
    }
  }

  const uniqueKeys = new Set();
  for (const point of points) {
    const key = coordinateKey(point, mapRules);
    if (uniqueKeys.has(key)) {
      errors.push(
        createRuleIssue("DUPLICATE_CELL", "同一部署项不能重复占用一个格。", {
          index,
          id,
          cell: sortCoordinates([point], mapRules)[0],
        }),
      );
    }
    uniqueKeys.add(key);
  }

  if (definition && placement.cells.length !== definition.cellCount) {
    errors.push(
      createRuleIssue("WRONG_CELL_COUNT", "部署项占用格数不符合单位定义。", {
        index,
        id,
        type: placement.type,
        expected: definition.cellCount,
        actual: placement.cells.length,
      }),
    );
  }

  if (
    definition &&
    points.length === placement.cells.length &&
    uniqueKeys.size === points.length &&
    points.length === definition.cellCount &&
    !hasRequiredShape(definition.shape, points, mapRules)
  ) {
    errors.push(
      createRuleIssue("INVALID_SHAPE", "部署项的形状不符合单位定义。", {
        index,
        id,
        type: placement.type,
        shape: definition.shape,
      }),
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedPlacement: {
      id,
      type: placement.type,
      cells: sortCoordinates(points, mapRules),
    },
  };
}

function validateDeployment(placements, mapRules = DEFAULT_MAP_RULES) {
  const rules = createMapRules(mapRules.mapSize ?? mapRules);
  if (!Array.isArray(placements)) {
    return {
      valid: false,
      errors: [
        createRuleIssue("DEPLOYMENT_NOT_ARRAY", "完整部署必须是数组。"),
      ],
      normalizedPlacements: [],
    };
  }

  const errors = [];
  const normalizedPlacements = [];
  const ids = new Map();
  const occupiedCells = new Map();
  const typeCounts = Object.fromEntries(
    DEPLOYABLE_TYPE_ORDER.map((type) => [type, 0]),
  );

  for (const [index, placement] of placements.entries()) {
    const result = validatePlacement(placement, { index, mapRules: rules });
    errors.push(...result.errors);

    if (!result.normalizedPlacement) {
      continue;
    }

    const normalized = result.normalizedPlacement;
    normalizedPlacements.push(normalized);

    if (normalized.id !== null) {
      if (ids.has(normalized.id)) {
        errors.push(
          createRuleIssue("DUPLICATE_PLACEMENT_ID", "部署项 ID 必须唯一。", {
            index,
            id: normalized.id,
            firstIndex: ids.get(normalized.id),
          }),
        );
      } else {
        ids.set(normalized.id, index);
      }
    }

    if (Object.hasOwn(typeCounts, normalized.type)) {
      typeCounts[normalized.type] += 1;
    }

    for (const cell of normalized.cells) {
      const key = coordinateKey(cell, rules);
      if (occupiedCells.has(key)) {
        const first = occupiedCells.get(key);
        errors.push(
          createRuleIssue("CELL_OVERLAP", "不同部署项不能占用同一格。", {
            index,
            id: normalized.id,
            cell,
            firstIndex: first.index,
            firstId: first.id,
          }),
        );
      } else {
        occupiedCells.set(key, {
          index,
          id: normalized.id,
        });
      }
    }
  }

  const fleetRequirements = getFleetRequirements(rules);
  for (const type of DEPLOYABLE_TYPE_ORDER) {
    const expected = fleetRequirements[type];
    const actual = typeCounts[type];
    if (actual !== expected) {
      errors.push(
        createRuleIssue(
          "WRONG_DEPLOYABLE_COUNT",
          "部署对象数量不符合舰队编成。",
          { type, expected, actual },
        ),
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedPlacements,
  };
}

function assertValidDeployment(placements, mapRules = DEFAULT_MAP_RULES) {
  const result = validateDeployment(placements, mapRules);
  if (!result.valid) {
    throw new RuleValidationError(
      "INVALID_DEPLOYMENT",
      "部署不符合当前地图规则。",
      { errors: result.errors },
    );
  }
  return result.normalizedPlacements;
}

module.exports = {
  assertValidDeployment,
  hasRequiredShape,
  validateDeployment,
  validatePlacement,
};
