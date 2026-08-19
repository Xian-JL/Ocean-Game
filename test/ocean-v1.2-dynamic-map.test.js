"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const Data = require("../public/js/game-data");
const { ACTION_TYPES } = require("../server/game/actions");
const { createInitialActionState } = require("../server/game/action-state");
const { getActionTargetOptions } = require("../server/game/action-validation");
const { formatCoordinate } = require("../server/game/coordinates");
const { assertValidDeployment } = require("../server/game/deployment");
const {
  createMapRules,
  normalizeMapSize,
  SUPPORTED_MAP_SIZES,
} = require("../server/game/map-rules");
const { generateRandomDeployment } = require("../server/game/random-deployment");
const {
  getDestroyerIRange,
  getDestroyerIIRange,
  getRadarArea,
  getShockArea,
} = require("../server/game/ranges");
const { createRoomState } = require("../server/game/room");
const { DEPLOYABLE_TYPES } = require("../server/game/units");

const EXPECTED_PROFILES = Object.freeze({
  10: {
    carrierCellCount: 5,
    carrierHp: 5,
    decoyCount: 2,
    destroyerI: { along: 9, across: 5 },
    destroyerII: { along: 8, across: 6 },
    radarSize: 3,
    shockSize: 5,
    detectionSize: 3,
  },
  12: {
    carrierCellCount: 6,
    carrierHp: 6,
    decoyCount: 3,
    destroyerI: { along: 11, across: 7 },
    destroyerII: { along: 10, across: 8 },
    radarSize: 4,
    shockSize: 5,
    detectionSize: 3,
  },
  15: {
    carrierCellCount: 8,
    carrierHp: 8,
    decoyCount: 5,
    destroyerI: { along: 13, across: 9 },
    destroyerII: { along: 12, across: 10 },
    radarSize: 5,
    shockSize: 7,
    detectionSize: 3,
  },
});

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function horizontalCells(length, centerColumn, row, rules) {
  const startColumn = centerColumn - Math.floor((length - 1) / 2);
  return Array.from({ length }, (_value, index) => formatCoordinate({
    row,
    column: startColumn + index,
  }, rules));
}

test("10×10、12×12、15×15 使用同一套确定性缩放算法", () => {
  assert.deepEqual(SUPPORTED_MAP_SIZES, [10, 12, 15]);
  for (const mapSize of SUPPORTED_MAP_SIZES) {
    const rules = createMapRules(mapSize);
    assert.deepEqual({
      carrierCellCount: rules.carrierCellCount,
      carrierHp: rules.carrierHp,
      decoyCount: rules.decoyCount,
      destroyerI: rules.destroyerI,
      destroyerII: rules.destroyerII,
      radarSize: rules.radarSize,
      shockSize: rules.shockSize,
      detectionSize: rules.detectionSize,
    }, EXPECTED_PROFILES[mapSize]);
    assert.equal(rules.rowLabels.length, mapSize);
    assert.equal(rules.coordinateMaximum, `${rules.rowLabels.at(-1)}${mapSize}`);
  }
});

test("非法地图尺寸在服务器和浏览器规则层均被拒绝", () => {
  for (const value of [0, 11, 14, 16, "large", null]) {
    assert.throws(() => normalizeMapSize(value), /地图大小只能选择/);
    assert.throws(() => Data.createMapRules(value), /地图大小只能选择/);
  }
});

test("三种地图均能生成完整、无重叠且符合动态舰队编成的部署", () => {
  for (const mapSize of SUPPORTED_MAP_SIZES) {
    const rules = createMapRules(mapSize);
    const deployment = generateRandomDeployment(seededRandom(1200 + mapSize), rules);
    assert.doesNotThrow(() => assertValidDeployment(deployment, rules));
    assert.equal(
      deployment.filter((item) => item.type === DEPLOYABLE_TYPES.DECOY_TORPEDO).length,
      rules.decoyCount,
    );
    const carrier = deployment.find(
      (item) => item.type === DEPLOYABLE_TYPES.AIRCRAFT_CARRIER,
    );
    assert.equal(carrier.cells.length, rules.carrierCellCount);
    assert.equal(new Set(deployment.flatMap((item) => item.cells)).size,
      deployment.flatMap((item) => item.cells).length);
  }
});

test("驱逐舰、雷达与震爆范围随地图档位变化且不会发生半格中心", () => {
  for (const mapSize of SUPPORTED_MAP_SIZES) {
    const rules = createMapRules(mapSize);
    const center = Math.floor((mapSize - 1) / 2);
    const destroyerI = horizontalCells(3, center, center, rules);
    const destroyerII = horizontalCells(4, center, center, rules);

    assert.equal(
      getDestroyerIRange(destroyerI, rules).length,
      rules.destroyerI.along * rules.destroyerI.across,
    );
    assert.equal(
      getDestroyerIIRange(destroyerII, rules).length,
      rules.destroyerII.along * rules.destroyerII.across,
    );
    assert.equal(getRadarArea("A1", rules).length, rules.radarSize ** 2);
    assert.equal(
      getShockArea(formatCoordinate({ row: center, column: center }, rules), rules).length,
      rules.shockSize ** 2,
    );
  }
});

test("房间与首回合雷达目标数量携带所选地图规则", () => {
  const roomCodes = { 10: "MAPTEN", 12: "MAPTWE", 15: "MAPFVE" };
  for (const mapSize of SUPPORTED_MAP_SIZES) {
    const rules = createMapRules(mapSize);
    const room = createRoomState({
      roomCode: roomCodes[mapSize],
      playerId: "owner",
      nickname: "舰长",
      mapSize,
    });
    assert.equal(room.mapSize, mapSize);
    assert.deepEqual(room.mapRules, rules);

    const deployment = generateRandomDeployment(seededRandom(2200 + mapSize), rules);
    const state = createInitialActionState(deployment, rules);
    assert.equal(
      getActionTargetOptions(state, ACTION_TYPES.RADAR_SCAN).length,
      (mapSize - rules.radarSize + 1) ** 2,
    );
  }
});

test("浏览器规则数据切换地图后同步刷新坐标、舰队和行动文案", () => {
  try {
    for (const mapSize of SUPPORTED_MAP_SIZES) {
      const expected = EXPECTED_PROFILES[mapSize];
      Data.configureMap(mapSize);
      assert.equal(Data.BOARD_SIZE, mapSize);
      assert.equal(Data.ALL_COORDINATES.length, mapSize ** 2);
      assert.equal(Data.ALL_COORDINATES.at(-1), `${Data.ROWS.at(-1)}${mapSize}`);
      assert.equal(Data.MAP_RULES.decoyCount, expected.decoyCount);
      assert.equal(
        Data.UNIT_DEFINITIONS.filter(
          (unit) => unit.type === Data.UNIT_TYPES.DECOY_TORPEDO,
        ).length,
        expected.decoyCount,
      );
      assert.match(
        Data.getActionDefinition(Data.ACTION_TYPES.RADAR_SCAN).warning,
        new RegExp(`${expected.radarSize}×${expected.radarSize}`),
      );
      const deployment = Data.generateRandomDeployment(seededRandom(3200 + mapSize));
      assert.equal(Data.validateDeployment(deployment).valid, true);
    }
  } finally {
    Data.configureMap(12);
  }
});
