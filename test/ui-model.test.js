"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Data = require("../public/js/game-data");
const Model = require("../public/js/ui-model");

function createRoom(options = {}) {
  const units = Data.UNIT_DEFINITIONS.filter((unit) => unit.category !== "decoy").map(
    (definition) => ({
      id: definition.id,
      type: definition.type,
      cells: [],
      hp: definition.initialHp,
      paralyzed: false,
    }),
  );
  const remainingUses = Object.fromEntries(
    Data.ACTION_DEFINITIONS.filter((action) => action.initialUses !== null).map(
      (action) => [action.type, action.initialUses],
    ),
  );
  const actionAvailability = Data.ACTION_DEFINITIONS.map((action) => ({
    actionType: action.type,
    available: true,
    issues: [],
  }));
  return {
    roomPhase: "PLAYING",
    turnPhase: "ACTIVE",
    own: { playerId: "player-1" },
    seats: [
      { playerId: "player-1", nickname: "甲" },
      { playerId: "player-2", nickname: "乙" },
    ],
    turn: { canAct: true, currentPlayerId: "player-1", turnNumber: 1 },
    battle: {
      own: { units, remainingUses, actionAvailability },
    },
    ...options,
  };
}

test("roomPhase 唯一映射到 P01～P06 与 O05", () => {
  assert.equal(Model.pageForState(null), "P01");
  assert.equal(Model.pageForState({ roomPhase: "WAITING" }), "P02");
  assert.equal(Model.pageForState({ roomPhase: "DEPLOYING" }), "P03");
  assert.equal(Model.pageForState({ roomPhase: "ROLLING" }), "P04");
  assert.equal(Model.pageForState({ roomPhase: "PLAYING" }), "P05");
  assert.equal(Model.pageForState({ roomPhase: "FINAL_SALVO" }), "P05");
  assert.equal(Model.pageForState({ roomPhase: "FINISHED" }), "P06");
  assert.equal(Model.pageForState({ roomPhase: "CLOSED" }), "O05");
});

test("倒计时、持续时间和 0.5 生命值使用稳定展示", () => {
  assert.equal(Model.remainingSeconds(10_001, 5_000), 6);
  assert.equal(Model.remainingSeconds(4_000, 5_000), 0);
  assert.equal(Model.formatDuration(65_999), "01:05");
  assert.equal(Model.formatDuration(3_665_000), "1:01:05");
  assert.equal(Model.formatHp(5.5), "5.5");
  assert.equal(Model.formatHp(6), "6");
});

test("行动卡明确区分可用、等待回合、沉没、瘫痪、耗尽与未解锁", () => {
  const room = createRoom();
  const pirate = Data.getActionDefinition(Data.ACTION_TYPES.PIRATE_ATTACK);
  assert.deepEqual(Model.deriveActionStatus(room, pirate), {
    code: "available",
    label: "可用",
    enabled: true,
  });

  const waiting = createRoom({ turn: { canAct: false } });
  assert.equal(Model.deriveActionStatus(waiting, pirate).code, "waiting");

  const sunk = createRoom();
  sunk.battle.own.units.find((unit) => unit.type === pirate.sourceType).hp = 0;
  assert.equal(Model.deriveActionStatus(sunk, pirate).code, "sunk");

  const missile = Data.getActionDefinition(Data.ACTION_TYPES.SUBMARINE_MISSILE);
  const paralyzed = createRoom();
  paralyzed.battle.own.units.find((unit) => unit.type === missile.sourceType).paralyzed = true;
  assert.equal(Model.deriveActionStatus(paralyzed, missile).code, "paralyzed");

  const empty = createRoom();
  empty.battle.own.remainingUses[missile.type] = 0;
  assert.equal(Model.deriveActionStatus(empty, missile).code, "empty");

  const helicopter = Data.getActionDefinition(Data.ACTION_TYPES.HELICOPTER_STRAFE);
  assert.equal(Model.deriveActionStatus(room, helicopter).code, "locked");
});

test("两艘驱逐舰均沉没后直升机扫射才显示可用", () => {
  const room = createRoom();
  for (const unit of room.battle.own.units) {
    if ([Data.UNIT_TYPES.DESTROYER_I, Data.UNIT_TYPES.DESTROYER_II].includes(unit.type)) {
      unit.hp = 0;
    }
  }
  const helicopter = Data.getActionDefinition(Data.ACTION_TYPES.HELICOPTER_STRAFE);
  assert.equal(Model.deriveActionStatus(room, helicopter).code, "available");
});

test("海盗船特殊胜负原因保持冻结规则用语", () => {
  assert.equal(
    Model.endReasonForViewer(
      {
        reason: "pirate_simultaneous_carrier_sink",
        winnerId: "player-1",
        loserId: "player-2",
      },
      "player-1",
    ),
    "双方航空母舰同时沉没；按海盗船特殊规则，海盗船一方获胜",
  );
  assert.equal(
    Model.endReasonForViewer(
      {
        reason: "pirate_own_carrier_sunk",
        winnerId: "player-2",
        loserId: "player-1",
      },
      "player-1",
    ),
    "海盗船攻击仅使己方航空母舰沉没",
  );
});

test("潜射导弹与震爆弹公开记录不添加命中或生效结果", () => {
  const room = createRoom();
  const missile = Model.publicActionText(
    {
      sequence: 1,
      actorId: "player-1",
      actionType: Data.ACTION_TYPES.SUBMARINE_MISSILE,
      actionName: "潜射导弹",
      target: { kind: "cell", coordinate: "B3" },
      result: null,
    },
    room,
  );
  assert.equal(missile, "甲 使用潜射导弹攻击了 B3");
  assert.equal(missile.includes("命中"), false);

  const shock = Model.publicActionText(
    {
      sequence: 2,
      actorId: "player-2",
      actionType: Data.ACTION_TYPES.SHOCK_BOMB,
      actionName: "震爆弹",
      target: { kind: "cell", coordinate: "E5" },
      result: null,
    },
    room,
  );
  assert.equal(shock, "乙 以 E5 为中心使用震爆弹");
  assert.equal(shock.includes("成功"), false);
  assert.equal(shock.includes("失败"), false);
});

test("单格、行与列目标使用统一无歧义术语", () => {
  assert.equal(Model.formatTarget({ kind: "cell", coordinate: "J10" }), "J10");
  assert.equal(Model.formatTarget({ kind: "row", row: "C" }), "C 行");
  assert.equal(Model.formatTarget({ kind: "column", column: 8 }), "第 8 列");
});
