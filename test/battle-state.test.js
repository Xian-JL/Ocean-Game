"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  activatePendingParalysisForPlayer,
  applyDamageToUnit,
  beginNormalTurn,
  completeAutomaticSkip,
  createBattleState,
  destroyDecoy,
  getBattlePlayerState,
  getBattleUnitById,
  queueParalysis,
  recordTargetCellResults,
  replaceBattlePlayerState,
} = require("../server/game/battle-state");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");
const {
  createTestBattle,
  damageBattleUnit,
} = require("../test-fixtures/battle");

test("合法部署生成双方权威战场、受击格和诱饵状态", () => {
  const battle = createTestBattle();
  assert.deepEqual(battle.playerIds, ["player-1", "player-2"]);
  assert.equal(battle.actionLog.length, 0);
  assert.equal(battle.nextActionSequence, 1);
  assert.deepEqual(battle.match, {
    status: "playing",
    result: null,
    finalSalvo: null,
  });

  const player = getBattlePlayerState(battle, "player-1");
  assert.equal(player.units.length, 7);
  assert.equal(player.decoys.length, 3);
  assert.ok(player.units.every((unit) => unit.hitCells.length === 0));
  assert.ok(player.decoys.every((decoy) => decoy.destroyed === false));
  assert.deepEqual(player.targetCellResults, {});
});

test("权威战场严格要求两个不同且格式合法的玩家 ID", () => {
  const deployment = createValidDeployment();
  assert.throws(
    () => createBattleState([{ id: "player-1", deployment }]),
    (error) => error.code === "INVALID_BATTLE_PLAYERS",
  );
  assert.throws(
    () =>
      createBattleState([
        { id: "same", deployment },
        { id: "same", deployment },
      ]),
    (error) => error.code === "DUPLICATE_PLAYER_ID",
  );
  assert.throws(
    () =>
      createBattleState([
        { id: "bad id", deployment },
        { id: "player-2", deployment },
      ]),
    (error) => error.code === "INVALID_PLAYER_ID",
  );
});

test("伤害最低扣至零，同时记录已受击单位格和沉没事件", () => {
  const player = getBattlePlayerState(createTestBattle(), "player-1");
  const applied = applyDamageToUnit(player, "submarine", 5, {
    hitCells: ["C3", "C4"],
    reason: "test",
  });
  const submarine = getBattleUnitById(applied.state, "submarine");
  assert.equal(submarine.hp, 0);
  assert.deepEqual(submarine.hitCells, ["C3", "C4"]);
  assert.equal(applied.event.appliedDamage, 2);
  assert.equal(applied.event.sunk, true);
});

test("无伤害命中仍可把单位格记录为已受击单位格", () => {
  const player = getBattlePlayerState(createTestBattle(), "player-1");
  const applied = applyDamageToUnit(player, "destroyer-i", 0, {
    hitCells: ["A1"],
  });
  assert.equal(getBattleUnitById(applied.state, "destroyer-i").hp, 3);
  assert.deepEqual(
    getBattleUnitById(applied.state, "destroyer-i").hitCells,
    ["A1"],
  );
});

test("同一已受击单位格不能通过底层伤害接口重复造成伤害", () => {
  const player = getBattlePlayerState(createTestBattle(), "player-1");
  const first = applyDamageToUnit(player, "submarine", 1, {
    hitCells: ["C3"],
  });
  const repeated = applyDamageToUnit(first.state, "submarine", 1, {
    hitCells: ["C3"],
  });
  assert.equal(getBattleUnitById(repeated.state, "submarine").hp, 1);
  assert.equal(repeated.event.effectiveRequestedDamage, 0);
  assert.equal(repeated.event.appliedDamage, 0);
});

test("攻击方逐格命中结果与已结算格同步保存，重复攻击保留首次结论", () => {
  const player = getBattlePlayerState(createTestBattle(), "player-1");
  const recorded = recordTargetCellResults(player, [
    { coordinate: "a1", result: "hit" },
    { coordinate: "B2", result: "miss" },
  ]);
  assert.deepEqual(recorded.targetCellResults, {
    A1: "hit",
    B2: "miss",
  });
  assert.deepEqual(recorded.resolvedTargetCells, ["A1", "B2"]);
  const repeated = recordTargetCellResults(recorded, [
    { coordinate: "A1", result: "miss" },
  ]);
  assert.equal(repeated.targetCellResults.A1, "hit");
});

test("诱饵鱼雷摧毁状态独立于作战单位生命值", () => {
  const player = getBattlePlayerState(createTestBattle(), "player-1");
  const destroyed = destroyDecoy(player, "decoy-1", "test");
  assert.equal(
    destroyed.state.decoys.find((decoy) => decoy.id === "decoy-1")
      .destroyed,
    true,
  );
  assert.equal(destroyed.event.cell, "A10");
  assert.equal(player.decoys[0].destroyed, false);
});

test("待生效瘫痪只接受存活水下单位，并在正常回合开始时激活", () => {
  const player = getBattlePlayerState(createTestBattle(), "player-2");
  const queued = queueParalysis(player, [
    "submarine",
    "nuclear",
    "destroyer-i",
  ]);
  assert.deepEqual(queued.pendingParalysisUnitIds, [
    "submarine",
    "nuclear",
  ]);

  const activation = activatePendingParalysisForPlayer(queued);
  assert.deepEqual(activation.activatedUnitIds, ["submarine", "nuclear"]);
  assert.equal(getBattleUnitById(activation.state, "submarine").paralyzed, true);
  assert.equal(getBattleUnitById(activation.state, "nuclear").paralyzed, true);
  assert.deepEqual(activation.state.pendingParalysisUnitIds, []);
});

test("没有合法行动时自动跳过并解除瘫痪，有合法行动时禁止自动跳过", () => {
  let battle = createTestBattle();
  let player = getBattlePlayerState(battle, "player-2");
  player = queueParalysis(player, ["submarine"]);
  battle = replaceBattlePlayerState(battle, "player-2", player);
  battle = beginNormalTurn(battle, "player-2").state;

  assert.throws(
    () => completeAutomaticSkip(battle, "player-2"),
    (error) => error.code === "AUTOMATIC_SKIP_NOT_ALLOWED",
  );

  for (const unitId of [
    "destroyer-i",
    "destroyer-ii",
    "pirate",
    "motorboat",
    "nuclear",
    "carrier",
  ]) {
    const unit = getBattleUnitById(
      getBattlePlayerState(battle, "player-2"),
      unitId,
    );
    battle = damageBattleUnit(
      battle,
      "player-2",
      unitId,
      unit.hp,
    );
  }
  player = getBattlePlayerState(battle, "player-2");
  battle = replaceBattlePlayerState(battle, "player-2", {
    ...player,
    remainingUses: { ...player.remainingUses, radar_scan: 0 },
  });

  const skipped = completeAutomaticSkip(battle, "player-2");
  assert.equal(
    getBattleUnitById(
      getBattlePlayerState(skipped, "player-2"),
      "submarine",
    ).paralyzed,
    false,
  );
});
