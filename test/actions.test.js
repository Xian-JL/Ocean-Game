"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ACTION_CATEGORIES,
  ACTION_DEFINITIONS,
  ACTION_TYPE_ORDER,
  ACTION_TYPES,
  LIMIT_KINDS,
  TARGET_MODES,
  createInitialRemainingUses,
  isAttackAction,
  isAuxiliaryAction,
} = require("../server/game/actions");
const { DEPLOYABLE_TYPES } = require("../server/game/units");

test("十种正式行动名称、来源和目标形式固定", () => {
  assert.equal(ACTION_TYPE_ORDER.length, 10);
  assert.equal(new Set(ACTION_TYPE_ORDER).size, 10);
  assert.deepEqual(
    ACTION_TYPE_ORDER.map((type) => ACTION_DEFINITIONS[type].name),
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
  assert.equal(
    ACTION_DEFINITIONS[ACTION_TYPES.SUBMARINE_MISSILE].sourceType,
    DEPLOYABLE_TYPES.SUBMARINE,
  );
  assert.equal(
    ACTION_DEFINITIONS[ACTION_TYPES.SHOCK_BOMB].targetMode,
    TARGET_MODES.AREA_CENTER,
  );
  assert.equal(
    ACTION_DEFINITIONS[ACTION_TYPES.HELICOPTER_STRAFE].targetMode,
    TARGET_MODES.ROW_OR_COLUMN,
  );
});

test("震爆弹、探测弹和雷达扫描属于辅助行动", () => {
  const auxiliary = ACTION_TYPE_ORDER.filter(isAuxiliaryAction);
  assert.deepEqual(auxiliary, [
    ACTION_TYPES.SHOCK_BOMB,
    ACTION_TYPES.DETECTION_BOMB,
    ACTION_TYPES.RADAR_SCAN,
  ]);
  assert.equal(
    ACTION_TYPE_ORDER.filter(isAttackAction).length,
    7,
  );
  assert.equal(
    ACTION_DEFINITIONS[ACTION_TYPES.SHOCK_BOMB].category,
    ACTION_CATEGORIES.AUXILIARY,
  );
});

test("有限资源初始数量与规则一致，无限行动不创建计数", () => {
  assert.deepEqual(createInitialRemainingUses(), {
    submarine_missile: 4,
    nuclear_bomb: 2,
    shock_bomb: 1,
    detection_bomb: 1,
    helicopter_strafe: 1,
    radar_scan: 1,
  });
  assert.equal(
    ACTION_DEFINITIONS[ACTION_TYPES.DESTROYER_I_RAM].initialUses,
    null,
  );
  assert.equal(
    ACTION_DEFINITIONS[ACTION_TYPES.SUBMARINE_MISSILE].limitKind,
    LIMIT_KINDS.AMMUNITION,
  );
  assert.equal(
    ACTION_DEFINITIONS[ACTION_TYPES.HELICOPTER_STRAFE].limitKind,
    LIMIT_KINDS.USE_COUNT,
  );
});
