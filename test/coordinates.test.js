"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  formatCoordinate,
  getOrthogonalNeighbors,
  parseCoordinate,
  sortCoordinates,
} = require("../server/game/coordinates");

test("坐标只接受 A1～L12，并统一为大写", () => {
  assert.deepEqual(parseCoordinate("A1"), { row: 0, column: 0 });
  assert.deepEqual(parseCoordinate(" j10 "), { row: 9, column: 9 });
  assert.deepEqual(parseCoordinate(" l12 "), { row: 11, column: 11 });
  assert.equal(formatCoordinate({ row: 4, column: 6 }), "E7");

  for (const invalid of ["A0", "A13", "M1", "1A", "", null]) {
    assert.throws(
      () => parseCoordinate(invalid),
      (error) => error.code === "INVALID_COORDINATE",
    );
  }
});

test("坐标排序按 A1 到 L12 的行优先顺序", () => {
  assert.deepEqual(sortCoordinates(["B1", "A10", "A2", "a1"]), [
    "A1",
    "A2",
    "A10",
    "B1",
  ]);
});

test("四向相邻格不会越出地图", () => {
  assert.deepEqual(getOrthogonalNeighbors("A1"), ["B1", "A2"]);
  assert.deepEqual(getOrthogonalNeighbors("E5"), [
    "D5",
    "F5",
    "E4",
    "E6",
  ]);
});
