"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  getDetectionArea,
  getDestroyerIRange,
  getDestroyerIIRange,
  getDestroyerRange,
  getFullColumn,
  getFullRow,
  getHelicopterArea,
  getShockArea,
} = require("../server/game/ranges");
const { DEPLOYABLE_TYPES: TYPES } = require("../server/game/units");

test("驱逐舰Ⅰ以自身中间格为中心生成 7×7，靠边时裁切", () => {
  const central = getDestroyerIRange(["E4", "E5", "E6"]);
  assert.equal(central.length, 49);
  assert.equal(central[0], "B2");
  assert.equal(central.at(-1), "H8");

  const clipped = getDestroyerIRange(["A1", "A2", "A3"]);
  assert.equal(clipped.length, 20);
  assert.equal(clipped[0], "A1");
  assert.equal(clipped.at(-1), "D5");
});

test("驱逐舰Ⅱ以中间两格的几何中心生成 8×8，靠边时裁切", () => {
  const central = getDestroyerIIRange(["E4", "E5", "E6", "E7"]);
  assert.equal(central.length, 64);
  assert.equal(central[0], "B2");
  assert.equal(central.at(-1), "I9");

  const clipped = getDestroyerIIRange(["A1", "A2", "A3", "A4"]);
  assert.equal(clipped.length, 30);
  assert.equal(clipped[0], "A1");
  assert.equal(clipped.at(-1), "E6");

  const vertical = getDestroyerIIRange(["A1", "B1", "C1", "D1"]);
  assert.equal(vertical.length, 30);
  assert.equal(vertical.at(-1), "F5");
  assert.deepEqual(
    getDestroyerRange(TYPES.DESTROYER_II, ["A1", "B1", "C1", "D1"]),
    vertical,
  );
});

test("震爆弹必须形成完整 5×5，合法中心为 C3～H8", () => {
  const area = getShockArea("E5");
  assert.equal(area.length, 25);
  assert.equal(area[0], "C3");
  assert.equal(area.at(-1), "G7");
  assert.equal(getShockArea("C3").length, 25);
  assert.throws(
    () => getShockArea("B2"),
    (error) => error.code === "INCOMPLETE_AREA",
  );
});

test("探测弹必须形成完整 3×3，合法中心为 B2～I9", () => {
  const area = getDetectionArea("B2");
  assert.equal(area.length, 9);
  assert.deepEqual(area, [
    "A1",
    "A2",
    "A3",
    "B1",
    "B2",
    "B3",
    "C1",
    "C2",
    "C3",
  ]);
  assert.throws(
    () => getDetectionArea("A1"),
    (error) => error.code === "INCOMPLETE_AREA",
  );
});

test("直升机攻击范围是一整行或一整列", () => {
  assert.deepEqual(getFullRow("A"), [
    "A1",
    "A2",
    "A3",
    "A4",
    "A5",
    "A6",
    "A7",
    "A8",
    "A9",
    "A10",
  ]);
  assert.deepEqual(getFullColumn(10), [
    "A10",
    "B10",
    "C10",
    "D10",
    "E10",
    "F10",
    "G10",
    "H10",
    "I10",
    "J10",
  ]);
  assert.deepEqual(getHelicopterArea("row", "J"), getFullRow("J"));
  assert.deepEqual(
    getHelicopterArea("column", 1),
    getFullColumn(1),
  );
});

test("范围函数拒绝非法源单位、行、列或轴", () => {
  assert.throws(
    () => getDestroyerIRange(["A1", "A2", "B2"]),
    (error) => error.code === "INVALID_RANGE_SOURCE",
  );
  assert.throws(
    () => getDestroyerRange(TYPES.SUBMARINE, ["A1"]),
    (error) => error.code === "UNSUPPORTED_RANGE_SOURCE",
  );
  assert.throws(() => getFullRow("K"), (error) => error.code === "INVALID_ROW");
  assert.throws(
    () => getFullColumn(0),
    (error) => error.code === "INVALID_COLUMN",
  );
  assert.throws(
    () => getHelicopterArea("diagonal", 1),
    (error) => error.code === "INVALID_AXIS",
  );
});
