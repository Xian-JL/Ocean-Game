"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assertValidDeployment,
  validateDeployment,
  validatePlacement,
} = require("../server/game/deployment");
const { DEPLOYABLE_TYPES: TYPES } = require("../server/game/units");

function createValidDeployment() {
  return [
    { id: "destroyer-i", type: TYPES.DESTROYER_I, cells: ["A1", "A2", "A3"] },
    {
      id: "destroyer-ii",
      type: TYPES.DESTROYER_II,
      cells: ["B1", "C1", "D1", "E1"],
    },
    {
      id: "submarine",
      type: TYPES.SUBMARINE,
      cells: ["C3", "C4", "D3", "D4"],
    },
    { id: "pirate", type: TYPES.PIRATE_SHIP, cells: ["F1", "F2", "F3"] },
    { id: "motorboat", type: TYPES.MOTORBOAT, cells: ["J10"] },
    {
      id: "nuclear",
      type: TYPES.NUCLEAR_SUBMARINE,
      cells: ["H1", "H2", "I1", "I2"],
    },
    {
      id: "carrier",
      type: TYPES.AIRCRAFT_CARRIER,
      cells: ["G5", "G6", "H5", "H6", "I5", "J5"],
    },
    { id: "decoy-1", type: TYPES.DECOY_TORPEDO, cells: ["A10"] },
    { id: "decoy-2", type: TYPES.DECOY_TORPEDO, cells: ["D10"] },
    { id: "decoy-3", type: TYPES.DECOY_TORPEDO, cells: ["G10"] },
  ];
}

function errorCodes(result) {
  return result.errors.map((error) => error.code);
}

test("完整合法舰队可以部署，单位彼此相邻也合法", () => {
  const deployment = createValidDeployment();
  const result = validateDeployment(deployment);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalizedPlacements.length, 10);
  assert.equal(assertValidDeployment(deployment).length, 10);
});

test("线形单位必须水平或垂直连续", () => {
  const result = validatePlacement({
    id: "destroyer-i",
    type: TYPES.DESTROYER_I,
    cells: ["A1", "A2", "B2"],
  });
  assert.equal(result.valid, false);
  assert.ok(errorCodes(result).includes("INVALID_SHAPE"));
});

test("潜水艇和核潜艇必须占据完整的 2×2", () => {
  for (const type of [TYPES.SUBMARINE, TYPES.NUCLEAR_SUBMARINE]) {
    const result = validatePlacement({
      id: type,
      type,
      cells: ["C3", "C4", "D3", "E3"],
    });
    assert.ok(errorCodes(result).includes("INVALID_SHAPE"));
  }
});

test("航空母舰六格必须全部四向连通", () => {
  const connected = validatePlacement({
    id: "carrier",
    type: TYPES.AIRCRAFT_CARRIER,
    cells: ["A1", "A2", "B2", "B3", "C3", "C4"],
  });
  assert.equal(connected.valid, true);

  const disconnected = validatePlacement({
    id: "carrier",
    type: TYPES.AIRCRAFT_CARRIER,
    cells: ["A1", "A2", "B2", "B3", "C4", "C5"],
  });
  assert.ok(errorCodes(disconnected).includes("INVALID_SHAPE"));
});

test("完整部署拒绝重叠格、重复 ID 和错误对象数量", () => {
  const deployment = createValidDeployment();
  deployment[1] = {
    ...deployment[1],
    id: "destroyer-i",
    cells: ["A3", "B3", "C3", "D3"],
  };
  deployment.pop();

  const result = validateDeployment(deployment);
  const codes = errorCodes(result);
  assert.equal(result.valid, false);
  assert.ok(codes.includes("DUPLICATE_PLACEMENT_ID"));
  assert.ok(codes.includes("CELL_OVERLAP"));
  assert.ok(codes.includes("WRONG_DEPLOYABLE_COUNT"));
});

test("部署拒绝越界坐标、单对象重复格和错误格数", () => {
  const result = validatePlacement({
    id: "pirate",
    type: TYPES.PIRATE_SHIP,
    cells: ["A1", "A1", "K1", "A2"],
  });
  const codes = errorCodes(result);
  assert.ok(codes.includes("OUT_OF_BOUNDS"));
  assert.ok(codes.includes("DUPLICATE_CELL"));
  assert.ok(codes.includes("WRONG_CELL_COUNT"));
});

test("非法完整部署断言提供所有结构化错误", () => {
  assert.throws(
    () => assertValidDeployment([]),
    (error) =>
      error.code === "INVALID_DEPLOYMENT" &&
      Array.isArray(error.details.errors) &&
      error.details.errors.length === 8,
  );
});
