"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  createInitialActionState,
  getRemainingUses,
  getUnitById,
  markTargetCellsResolved,
  setUnitStatus,
} = require("../server/game/action-state");
const {
  ALL_BOARD_CELLS,
  commitActionUsage,
  getActionAvailability,
  getActionTargetOptions,
  hasAnyLegalAction,
  hasAttackCapability,
  listLegalActions,
  validateActionIntent,
} = require("../server/game/action-validation");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

function createState() {
  return createInitialActionState(createValidDeployment());
}

function createIntent(actionId, actionType, sourceId, target) {
  return { actionId, actionType, sourceId, target };
}

function errorCodes(result) {
  return result.errors.map((error) => error.code);
}

function sinkUnits(state, unitIds) {
  return unitIds.reduce(
    (current, unitId) => setUnitStatus(current, unitId, { hp: 0 }),
    state,
  );
}

test("初始状态有九种合法行动，直升机扫射尚未解锁", () => {
  const state = createState();
  const legal = listLegalActions(state);
  assert.equal(legal.length, 9);

  const helicopter = getActionAvailability(
    state,
    ACTION_TYPES.HELICOPTER_STRAFE,
  );
  assert.equal(helicopter.available, false);
  assert.ok(helicopter.issues.some((issue) => issue.code === "ACTION_LOCKED"));

  assert.equal(
    getActionAvailability(state, ACTION_TYPES.DESTROYER_I_RAM).targetCount,
    28,
  );
  assert.equal(
    getActionAvailability(state, ACTION_TYPES.DESTROYER_II_RAM).targetCount,
    40,
  );
  assert.equal(
    getActionAvailability(state, ACTION_TYPES.PIRATE_ATTACK).targetCount,
    144,
  );
  assert.equal(
    getActionAvailability(state, ACTION_TYPES.SHOCK_BOMB).targetCount,
    64,
  );
  assert.equal(
    getActionAvailability(state, ACTION_TYPES.DETECTION_BOMB).targetCount,
    100,
  );
});

test("十种行动都接受各自唯一的目标形式", () => {
  const state = createState();
  const cases = [
    [ACTION_TYPES.DESTROYER_I_RAM, "destroyer-i", { kind: "cell", coordinate: "D5" }],
    [ACTION_TYPES.DESTROYER_II_RAM, "destroyer-ii", { kind: "cell", coordinate: "G5" }],
    [ACTION_TYPES.PIRATE_ATTACK, "pirate", { kind: "cell", coordinate: "J10" }],
    [ACTION_TYPES.MOTORBOAT_RAM, "motorboat", { kind: "cell", coordinate: "J10" }],
    [ACTION_TYPES.SUBMARINE_MISSILE, "submarine", { kind: "cell", coordinate: "J9" }],
    [ACTION_TYPES.NUCLEAR_BOMB, "nuclear", { kind: "cell", coordinate: "J8" }],
    [ACTION_TYPES.SHOCK_BOMB, "nuclear", { kind: "cell", coordinate: "C3" }],
    [ACTION_TYPES.DETECTION_BOMB, "nuclear", { kind: "cell", coordinate: "I9" }],
    [ACTION_TYPES.RADAR_SCAN, "carrier", { kind: "cell", coordinate: "I9" }],
  ];

  cases.forEach(([actionType, sourceId, target], index) => {
    const result = validateActionIntent(
      state,
      createIntent(`action-${index}`, actionType, sourceId, target),
    );
    assert.equal(result.valid, true, actionType);
  });

  const unlocked = sinkUnits(state, ["destroyer-i", "destroyer-ii"]);
  const helicopter = validateActionIntent(
    unlocked,
    createIntent(
      "action-helicopter",
      ACTION_TYPES.HELICOPTER_STRAFE,
      "carrier",
      { kind: "row", row: "a" },
    ),
  );
  assert.equal(helicopter.valid, true);
  assert.deepEqual(helicopter.normalizedIntent.target, {
    kind: "row",
    row: "A",
  });
  assert.equal(helicopter.targetCells.length, 12);
});

test("行动来源必须匹配、存活且未瘫痪", () => {
  const state = createState();
  const mismatch = validateActionIntent(
    state,
    createIntent(
      "mismatch",
      ACTION_TYPES.NUCLEAR_BOMB,
      "pirate",
      { kind: "cell", coordinate: "A1" },
    ),
  );
  assert.ok(errorCodes(mismatch).includes("SOURCE_TYPE_MISMATCH"));

  const sunk = setUnitStatus(state, "submarine", { hp: 0 });
  const sunkResult = validateActionIntent(
    sunk,
    createIntent(
      "sunk",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      { kind: "cell", coordinate: "A1" },
    ),
  );
  assert.ok(errorCodes(sunkResult).includes("SOURCE_SUNK"));

  const paralyzed = setUnitStatus(state, "submarine", { paralyzed: true });
  const paralyzedResult = validateActionIntent(
    paralyzed,
    createIntent(
      "paralyzed",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      { kind: "cell", coordinate: "A1" },
    ),
  );
  assert.ok(errorCodes(paralyzedResult).includes("SOURCE_PARALYZED"));
});

test("驱逐舰目标必须在自身范围内，单格攻击允许重复选择已结算格", () => {
  const state = createState();
  const outOfRange = validateActionIntent(
    state,
    createIntent(
      "out-of-range",
      ACTION_TYPES.DESTROYER_I_RAM,
      "destroyer-i",
      { kind: "cell", coordinate: "E8" },
    ),
  );
  assert.ok(errorCodes(outOfRange).includes("TARGET_OUT_OF_RANGE"));

  const resolved = markTargetCellsResolved(state, ["A1"]);
  const repeated = validateActionIntent(
    resolved,
    createIntent(
      "resolved",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      { kind: "cell", coordinate: "A1" },
    ),
  );
  assert.equal(repeated.valid, true);
});

test("震爆弹和探测弹中心必须形成完整区域，但可覆盖已结算格", () => {
  const state = markTargetCellsResolved(createState(), ["C3", "D4", "E5"]);
  const shock = validateActionIntent(
    state,
    createIntent(
      "shock",
      ACTION_TYPES.SHOCK_BOMB,
      "nuclear",
      { kind: "cell", coordinate: "C3" },
    ),
  );
  assert.equal(shock.valid, true);
  assert.equal(shock.targetCells.length, 25);

  const invalidShock = validateActionIntent(
    state,
    createIntent(
      "shock-invalid",
      ACTION_TYPES.SHOCK_BOMB,
      "nuclear",
      { kind: "cell", coordinate: "B2" },
    ),
  );
  assert.ok(errorCodes(invalidShock).includes("TARGET_OUT_OF_RANGE"));

  const invalidDetection = validateActionIntent(
    state,
    createIntent(
      "detection-invalid",
      ACTION_TYPES.DETECTION_BOMB,
      "nuclear",
      { kind: "cell", coordinate: "A1" },
    ),
  );
  assert.ok(errorCodes(invalidDetection).includes("TARGET_OUT_OF_RANGE"));
});

test("直升机扫射仅在两艘己方驱逐舰均沉没后解锁", () => {
  const state = createState();
  const oneSunk = setUnitStatus(state, "destroyer-i", { hp: 0 });
  assert.equal(
    getActionAvailability(oneSunk, ACTION_TYPES.HELICOPTER_STRAFE)
      .available,
    false,
  );

  const bothSunk = setUnitStatus(oneSunk, "destroyer-ii", { hp: 0 });
  assert.equal(
    getActionAvailability(bothSunk, ACTION_TYPES.HELICOPTER_STRAFE)
      .available,
    true,
  );
});

test("直升机允许重复覆盖已结算格，伤害资格由结算器逐格判断", () => {
  let state = sinkUnits(createState(), ["destroyer-i", "destroyer-ii"]);
  state = markTargetCellsResolved(state, [
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
    "A11",
    "A12",
    "B1",
  ]);

  const rowA = validateActionIntent(
    state,
    createIntent(
      "row-a",
      ACTION_TYPES.HELICOPTER_STRAFE,
      "carrier",
      { kind: "row", row: "A" },
    ),
  );
  assert.equal(rowA.valid, true);
  assert.equal(rowA.pendingTargetCells.length, 12);

  const rowB = validateActionIntent(
    state,
    createIntent(
      "row-b",
      ACTION_TYPES.HELICOPTER_STRAFE,
      "carrier",
      { kind: "row", row: "B" },
    ),
  );
  assert.equal(rowB.valid, true);
  assert.equal(rowB.targetCells.length, 12);
  assert.equal(rowB.pendingTargetCells.length, 12);
  assert.equal(
    getActionTargetOptions(state, ACTION_TYPES.HELICOPTER_STRAFE).length,
    24,
  );
});

test("潜射标记不属于已结算格，同一格仍可再次攻击", () => {
  const initial = createState();
  const first = commitActionUsage(
    initial,
    createIntent(
      "missile-1",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      { kind: "cell", coordinate: "A1" },
    ),
  );
  assert.deepEqual(first.state.submarineMissileMarkers, ["A1"]);
  assert.deepEqual(first.state.resolvedTargetCells, []);

  const second = validateActionIntent(
    first.state,
    createIntent(
      "pirate-after-missile",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      { kind: "cell", coordinate: "A1" },
    ),
  );
  assert.equal(second.valid, true);
});

test("有限行动每次合法使用都消耗一次，耗尽后拒绝", () => {
  const initial = createState();
  let state = initial;
  for (let index = 1; index <= 4; index += 1) {
    state = commitActionUsage(
      state,
      createIntent(
        `missile-${index}`,
        ACTION_TYPES.SUBMARINE_MISSILE,
        "submarine",
        { kind: "cell", coordinate: "A1" },
      ),
    ).state;
  }

  assert.equal(getRemainingUses(initial, ACTION_TYPES.SUBMARINE_MISSILE), 4);
  assert.equal(getRemainingUses(state, ACTION_TYPES.SUBMARINE_MISSILE), 0);
  assert.deepEqual(state.submarineMissileMarkers, ["A1"]);

  const exhausted = validateActionIntent(
    state,
    createIntent(
      "missile-5",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      { kind: "cell", coordinate: "A2" },
    ),
  );
  assert.ok(errorCodes(exhausted).includes("RESOURCE_EXHAUSTED"));
});

test("核弹、震爆弹、探测弹和直升机分别管理自己的次数", () => {
  const cases = [
    [ACTION_TYPES.NUCLEAR_BOMB, "nuclear", { kind: "cell", coordinate: "A1" }],
    [ACTION_TYPES.SHOCK_BOMB, "nuclear", { kind: "cell", coordinate: "C3" }],
    [ACTION_TYPES.DETECTION_BOMB, "nuclear", { kind: "cell", coordinate: "B2" }],
  ];

  for (const [actionType, sourceId, target] of cases) {
    const initial = createState();
    const committed = commitActionUsage(
      initial,
      createIntent(`use-${actionType}`, actionType, sourceId, target),
    );
    assert.equal(
      getRemainingUses(committed.state, actionType),
      getRemainingUses(initial, actionType) - 1,
    );
  }

  const unlocked = sinkUnits(createState(), ["destroyer-i", "destroyer-ii"]);
  const helicopter = commitActionUsage(
    unlocked,
    createIntent(
      "use-helicopter",
      ACTION_TYPES.HELICOPTER_STRAFE,
      "carrier",
      { kind: "column", column: 10 },
    ),
  );
  assert.equal(
    getRemainingUses(helicopter.state, ACTION_TYPES.HELICOPTER_STRAFE),
    0,
  );

  const unlimited = commitActionUsage(
    createState(),
    createIntent(
      "use-pirate",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      { kind: "cell", coordinate: "A1" },
    ),
  );
  assert.equal(
    getRemainingUses(unlimited.state, ACTION_TYPES.PIRATE_ATTACK),
    null,
  );
});

test("重复行动编号不会再次消耗资源", () => {
  const first = commitActionUsage(
    createState(),
    createIntent(
      "same-action-id",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      { kind: "cell", coordinate: "A1" },
    ),
  );
  assert.equal(getRemainingUses(first.state, ACTION_TYPES.NUCLEAR_BOMB), 1);

  const duplicate = validateActionIntent(
    first.state,
    createIntent(
      "same-action-id",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      { kind: "cell", coordinate: "A2" },
    ),
  );
  assert.ok(errorCodes(duplicate).includes("DUPLICATE_ACTION_ID"));
  assert.throws(
    () =>
      commitActionUsage(
        first.state,
        createIntent(
          "same-action-id",
          ACTION_TYPES.NUCLEAR_BOMB,
          "nuclear",
          { kind: "cell", coordinate: "A2" },
        ),
      ),
    (error) => error.code === "INVALID_ACTION",
  );
  assert.equal(getRemainingUses(first.state, ACTION_TYPES.NUCLEAR_BOMB), 1);
});

test("水下来源瘫痪时航空母舰仍可使用尚未消耗的雷达扫描", () => {
  let state = sinkUnits(createState(), [
    "destroyer-i",
    "destroyer-ii",
    "pirate",
    "motorboat",
    "nuclear",
  ]);
  state = setUnitStatus(state, "submarine", { paralyzed: true });

  assert.equal(hasAnyLegalAction(state), true);
  assert.equal(hasAttackCapability(state), true);
  assert.equal(
    getActionAvailability(state, ACTION_TYPES.RADAR_SCAN).available,
    true,
  );
});

test("辅助行动不计入攻击手段，重复攻击规则使已结算坐标仍可选择", () => {
  const allResolved = markTargetCellsResolved(createState(), ALL_BOARD_CELLS);
  assert.equal(hasAnyLegalAction(allResolved), true);
  assert.equal(hasAttackCapability(allResolved), true);
  assert.equal(
    getActionAvailability(allResolved, ACTION_TYPES.SHOCK_BOMB).available,
    true,
  );
  assert.equal(
    getActionAvailability(allResolved, ACTION_TYPES.DETECTION_BOMB).available,
    true,
  );
});

test("行动请求拒绝未知类型、无效编号和错误目标形式", () => {
  const state = createState();
  const malformed = validateActionIntent(state, {
    actionId: "",
    actionType: "unknown",
    sourceId: "",
    target: { kind: "diagonal" },
  });
  assert.ok(errorCodes(malformed).includes("INVALID_ACTION_ID"));
  assert.ok(errorCodes(malformed).includes("UNKNOWN_ACTION_TYPE"));
  assert.ok(errorCodes(malformed).includes("INVALID_SOURCE_ID"));

  const invalidTarget = validateActionIntent(
    state,
    createIntent(
      "bad-target",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      { kind: "row", row: "A" },
    ),
  );
  assert.ok(errorCodes(invalidTarget).includes("INVALID_TARGET"));
});
