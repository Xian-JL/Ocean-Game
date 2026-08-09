"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Data = require("../public/js/game-data");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function createOwnBattle(overrides = {}) {
  return {
    units: [
      { id: "destroyer-i", type: Data.UNIT_TYPES.DESTROYER_I, cells: ["E4", "E5", "E6"], hp: 3, paralyzed: false },
      { id: "destroyer-ii", type: Data.UNIT_TYPES.DESTROYER_II, cells: ["D5", "E5", "F5", "G5"], hp: 3, paralyzed: false },
      { id: "submarine", type: Data.UNIT_TYPES.SUBMARINE, cells: ["A1", "A2", "B1", "B2"], hp: 2, paralyzed: false },
      { id: "pirate", type: Data.UNIT_TYPES.PIRATE_SHIP, cells: ["A3", "A4", "A5"], hp: 2, paralyzed: false },
      { id: "motorboat", type: Data.UNIT_TYPES.MOTORBOAT, cells: ["A6"], hp: 1, paralyzed: false },
      { id: "nuclear", type: Data.UNIT_TYPES.NUCLEAR_SUBMARINE, cells: ["H1", "H2", "I1", "I2"], hp: 2, paralyzed: false },
      { id: "carrier", type: Data.UNIT_TYPES.AIRCRAFT_CARRIER, cells: ["H5", "H6", "I5", "I6", "J5", "J6"], hp: 6, paralyzed: false },
    ],
    enemyMap: {
      cellResults: {},
      submarineMissileMarkers: [],
    },
    ...overrides,
  };
}

test("正式页面坐标模型固定生成 A1～L12 的 144 格", () => {
  assert.equal(Data.ALL_COORDINATES.length, 144);
  assert.equal(Data.ALL_COORDINATES[0], "A1");
  assert.equal(Data.ALL_COORDINATES.at(-1), "L12");
  assert.deepEqual(Data.parseCoordinate("j10"), { row: 9, column: 9 });
  assert.equal(Data.parseCoordinate("M1"), null);
});

test("正式页面定义八个作战单位、三个诱饵和十项行动", () => {
  assert.equal(Data.UNIT_DEFINITIONS.length, 11);
  assert.equal(
    Data.UNIT_DEFINITIONS.filter((unit) => unit.category !== "decoy").length,
    8,
  );
  assert.equal(
    Data.UNIT_DEFINITIONS.filter((unit) => unit.category === "decoy").length,
    3,
  );
  assert.equal(Data.ACTION_DEFINITIONS.length, 10);
  assert.deepEqual(
    Data.ACTION_DEFINITIONS.map((action) => action.name),
    [
      "驱逐舰Ⅰ冲撞",
      "驱逐舰Ⅱ冲撞",
      "海盗船攻击",
      "摩托艇冲撞",
      "潜射导弹",
      "核弹",
      "震爆弹",
      "探测弹",
      "直升机扫射",
      "雷达扫描",
    ],
  );
  assert.match(
    Data.getActionDefinition(Data.ACTION_TYPES.DETECTION_BOMB).warning,
    /诱饵鱼雷/,
  );
});

test("服务器测试夹具在客户端部署预检中同样完整合法", () => {
  const result = Data.validateDeployment(createValidDeployment());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalizedPlacements.length, 11);
});

test("客户端部署预检拒绝重叠、缺失与不连通航空母舰", () => {
  const deployment = createValidDeployment();
  deployment.find((item) => item.id === "motorboat").cells = ["A1"];
  deployment.find((item) => item.id === "carrier").cells = [
    "G5",
    "G6",
    "H5",
    "H6",
    "I5",
    "J10",
  ];
  deployment.splice(
    deployment.findIndex((item) => item.id === "decoy-3"),
    1,
  );
  const result = Data.validateDeployment(deployment);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("重叠")));
  assert.ok(result.errors.some((message) => message.includes("四向连通")));
  assert.ok(result.errors.some((message) => message.includes("诱饵鱼雷 3")));
});

test("随机部署连续生成完整合法舰队", () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const deployment = Data.generateRandomDeployment(seededRandom(seed));
    assert.equal(Data.validateDeployment(deployment).valid, true, `seed ${seed}`);
  }
});

test("部署锚点按横向、纵向、2×2 和单格生成完整预览", () => {
  assert.deepEqual(
    Data.createAnchoredCells(Data.getUnitDefinitionById("destroyer-i"), "B2", "horizontal"),
    ["B2", "B3", "B4"],
  );
  assert.deepEqual(
    Data.createAnchoredCells(Data.getUnitDefinitionById("destroyer-i"), "B2", "vertical"),
    ["B2", "C2", "D2"],
  );
  assert.deepEqual(
    Data.createAnchoredCells(Data.getUnitDefinitionById("submarine"), "B2"),
    ["B2", "B3", "C2", "C3"],
  );
  assert.deepEqual(
    Data.createAnchoredCells(Data.getUnitDefinitionById("motorboat"), "J10"),
    ["J10"],
  );
});

test("驱逐舰Ⅰ和驱逐舰Ⅱ客户端范围与 11×7、8×10 规则一致", () => {
  const first = Data.destroyerRange(["E4", "E5", "E6"], Data.UNIT_TYPES.DESTROYER_I);
  assert.equal(first.length, 70);
  assert.ok(first.includes("B2"));
  assert.ok(first.includes("H10"));
  assert.equal(first.includes("A1"), false);

  const second = Data.destroyerRange(["D5", "E5", "F5", "G5"], Data.UNIT_TYPES.DESTROYER_II);
  assert.equal(second.length, 80);
  assert.ok(second.includes("B2"));
  assert.ok(second.includes("J9"));
});

test("震爆弹、探测弹在 12×12 地图提供完整区域中心格", () => {
  const own = createOwnBattle();
  const shock = Data.getTargetOptions(Data.ACTION_TYPES.SHOCK_BOMB, own);
  const detection = Data.getTargetOptions(Data.ACTION_TYPES.DETECTION_BOMB, own);
  assert.equal(shock.length, 64);
  assert.equal(shock[0].coordinate, "C3");
  assert.equal(shock.at(-1).coordinate, "J10");
  assert.equal(detection.length, 100);
  assert.equal(detection[0].coordinate, "B2");
  assert.equal(detection.at(-1).coordinate, "K11");
  assert.equal(
    Data.previewCells(Data.ACTION_TYPES.SHOCK_BOMB, {
      kind: "cell",
      coordinate: "E5",
    }).length,
    25,
  );
});

test("重复攻击规则下所有单格都保持可选", () => {
  const own = createOwnBattle({
    enemyMap: {
      cellResults: { A1: "hit", A2: "miss" },
      submarineMissileMarkers: ["A3"],
    },
  });
  const options = Data.getTargetOptions(Data.ACTION_TYPES.SUBMARINE_MISSILE, own);
  const coordinates = new Set(options.map((option) => option.coordinate));
  assert.equal(coordinates.has("A1"), true);
  assert.equal(coordinates.has("A2"), true);
  assert.equal(coordinates.has("A3"), true);
  assert.equal(options.length, 144);
});

test("直升机扫射允许重复覆盖已结算的整行或整列", () => {
  const rowAResults = Object.fromEntries(
    Data.COLUMNS.map((column) => [`A${column}`, column % 2 ? "hit" : "miss"]),
  );
  const own = createOwnBattle({
    enemyMap: {
      cellResults: rowAResults,
      submarineMissileMarkers: ["B1"],
    },
  });
  const options = Data.getTargetOptions(Data.ACTION_TYPES.HELICOPTER_STRAFE, own);
  assert.equal(options.some((target) => target.kind === "row" && target.row === "A"), true);
  assert.equal(options.some((target) => target.kind === "row" && target.row === "B"), true);
  assert.equal(options.filter((target) => target.kind === "column").length, 12);
  assert.equal(
    Data.previewCells(Data.ACTION_TYPES.HELICOPTER_STRAFE, {
      kind: "column",
      column: 3,
    }).length,
    12,
  );
});
