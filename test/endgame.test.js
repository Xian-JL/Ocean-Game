"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  getBattlePlayerState,
  getBattleUnitById,
  replaceBattlePlayerState,
} = require("../server/game/battle-state");
const {
  END_REASONS,
  cancelForBothDisconnected,
  finishByForfeit,
} = require("../server/game/endgame");
const {
  resolveBattleAction,
} = require("../server/game/match-resolution");
const {
  createTestBattle,
  damageBattleUnit,
} = require("../test-fixtures/battle");

function cellIntent(actionId, actionType, sourceId, coordinate) {
  return {
    actionId,
    actionType,
    sourceId,
    target: { kind: "cell", coordinate },
  };
}

function unit(battle, playerId, unitId) {
  return getBattleUnitById(
    getBattlePlayerState(battle, playerId),
    unitId,
  );
}

function setRemainingUses(battle, playerId, changes) {
  const player = getBattlePlayerState(battle, playerId);
  return replaceBattlePlayerState(battle, playerId, {
    ...player,
    remainingUses: {
      ...player.remainingUses,
      ...changes,
    },
  });
}

function sinkUnits(battle, playerId, unitIds) {
  let next = battle;
  for (const unitId of unitIds) {
    const current = unit(next, playerId, unitId);
    next = damageBattleUnit(next, playerId, unitId, current.hp);
  }
  return next;
}

function prepareOnlyLastNuclearAttack(battle) {
  let next = battle;
  next = sinkUnits(next, "player-1", [
    "destroyer-i",
    "destroyer-ii",
    "submarine",
    "pirate",
    "motorboat",
  ]);
  next = setRemainingUses(next, "player-1", {
    submarine_missile: 0,
    nuclear_bomb: 1,
    helicopter_strafe: 0,
  });

  next = sinkUnits(next, "player-2", [
    "destroyer-i",
    "destroyer-ii",
    "submarine",
    "pirate",
    "motorboat",
    "nuclear",
  ]);
  next = setRemainingUses(next, "player-2", {
    submarine_missile: 0,
    nuclear_bomb: 0,
    helicopter_strafe: 0,
  });
  return next;
}

test("普通攻击摧毁敌方航空母舰后立即判攻击方获胜", () => {
  let battle = createTestBattle();
  battle = damageBattleUnit(battle, "player-2", "carrier", 4);
  const resolved = resolveBattleAction(
    battle,
    "player-1",
    cellIntent(
      "finish-normal",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "G5",
    ),
  );

  assert.equal(resolved.state.match.status, "finished");
  assert.equal(resolved.state.match.result.winnerId, "player-1");
  assert.equal(resolved.state.match.result.loserId, "player-2");
  assert.equal(
    resolved.state.match.result.reason,
    END_REASONS.AIRCRAFT_CARRIER_SUNK,
  );
  assert.equal(resolved.state.match.finalSalvo, null);
});

test("海盗船行动使双方航空母舰同时沉没时海盗船一方获胜", () => {
  let battle = createTestBattle();
  battle = damageBattleUnit(battle, "player-1", "carrier", 5);
  battle = damageBattleUnit(battle, "player-2", "carrier", 4);
  const resolved = resolveBattleAction(
    battle,
    "player-1",
    cellIntent(
      "finish-pirate-simultaneous",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "G5",
    ),
  );

  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 0);
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 0);
  assert.equal(resolved.state.match.result.winnerId, "player-1");
  assert.equal(
    resolved.state.match.result.reason,
    END_REASONS.PIRATE_SIMULTANEOUS_CARRIER_SINK,
  );
});

test("海盗船行动只使己方航空母舰沉没时海盗船一方失败", () => {
  let battle = createTestBattle();
  battle = damageBattleUnit(battle, "player-1", "carrier", 5);
  const resolved = resolveBattleAction(
    battle,
    "player-1",
    cellIntent(
      "finish-pirate-own-only",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "G5",
    ),
  );

  assert.equal(unit(resolved.state, "player-1", "carrier").hp, 0);
  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 4);
  assert.equal(resolved.state.match.result.winnerId, "player-2");
  assert.equal(
    resolved.state.match.result.reason,
    END_REASONS.PIRATE_OWN_CARRIER_SUNK,
  );
});

test("海盗船命中其他单位造成的额外 0.5 伤害也能摧毁敌方航空母舰并获胜", () => {
  let battle = createTestBattle();
  battle = damageBattleUnit(battle, "player-2", "carrier", 5.5);
  const resolved = resolveBattleAction(
    battle,
    "player-1",
    cellIntent(
      "finish-pirate-extra",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "A1",
    ),
  );

  assert.equal(unit(resolved.state, "player-2", "carrier").hp, 0);
  assert.equal(resolved.state.match.result.winnerId, "player-1");
  assert.equal(
    resolved.state.match.result.reason,
    END_REASONS.PIRATE_ENEMY_CARRIER_SUNK,
  );
});

test("没有航空母舰沉没且双方仍有攻击手段时对局继续", () => {
  const resolved = resolveBattleAction(
    createTestBattle(),
    "player-1",
    cellIntent(
      "continue-after-miss",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "J1",
    ),
  );

  assert.equal(resolved.state.match.status, "playing");
  assert.equal(resolved.state.match.result, null);
  assert.equal(
    resolved.deliveriesByPlayer["player-1"].match.status,
    "playing",
  );
});

test("已经结束的对局拒绝再次执行正式行动", () => {
  let battle = createTestBattle();
  battle = damageBattleUnit(battle, "player-2", "carrier", 4);
  const finished = resolveBattleAction(
    battle,
    "player-1",
    cellIntent(
      "finish-once",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "G5",
    ),
  );

  assert.throws(
    () =>
      resolveBattleAction(
        finished.state,
        "player-2",
        cellIntent(
          "finish-twice",
          ACTION_TYPES.PIRATE_ATTACK,
          "pirate",
          "J1",
        ),
      ),
    (error) => error.code === "MATCH_ALREADY_FINISHED",
  );
});

for (const [reason, label] of [
  [END_REASONS.SURRENDER, "主动投降"],
  [END_REASONS.THREE_CONSECUTIVE_TIMEOUTS, "连续三回合超时"],
  [END_REASONS.DISCONNECT_TIMEOUT, "断线超过 120 秒"],
]) {
  test(`${label}时由另一方获胜`, () => {
    const finished = finishByForfeit(
      createTestBattle(),
      "player-1",
      reason,
    );
    assert.equal(finished.result.winnerId, "player-2");
    assert.equal(finished.result.loserId, "player-1");
    assert.equal(finished.result.reason, reason);
    assert.equal(finished.state.match.status, "finished");
  });
}

test("外部判负接口拒绝规则之外的原因", () => {
  assert.throws(
    () => finishByForfeit(createTestBattle(), "player-1", "unknown"),
    (error) => error.code === "INVALID_FORFEIT_REASON",
  );
});

test("双方同时断线超时取消对局且不产生胜方", () => {
  const canceled = cancelForBothDisconnected(createTestBattle());
  assert.equal(canceled.state.match.status, "finished");
  assert.equal(canceled.result.outcome, "canceled");
  assert.equal(canceled.result.winnerId, null);
  assert.equal(canceled.result.loserId, null);
  assert.equal(canceled.result.reason, END_REASONS.BOTH_DISCONNECTED);
});

test("攻击摧毁航空母舰的判定优先于双方无攻击手段和终局鱼雷齐射", () => {
  let battle = prepareOnlyLastNuclearAttack(createTestBattle());
  battle = damageBattleUnit(battle, "player-2", "carrier", 4);
  const resolved = resolveBattleAction(
    battle,
    "player-1",
    cellIntent(
      "last-attack-sinks-carrier",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "G5",
    ),
  );

  assert.equal(resolved.state.match.result.winnerId, "player-1");
  assert.equal(
    resolved.state.match.result.reason,
    END_REASONS.AIRCRAFT_CARRIER_SUNK,
  );
  assert.equal(resolved.state.match.finalSalvo, null);
});
