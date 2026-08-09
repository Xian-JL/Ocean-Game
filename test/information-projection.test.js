"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  beginNormalTurn,
  getBattlePlayerState,
  getBattleUnitById,
} = require("../server/game/battle-state");
const {
  createPlayerView,
  createResolutionDelivery,
} = require("../server/game/information-projection");
const {
  resolveBattleAction,
} = require("../server/game/match-resolution");
const {
  createTestBattle,
  damageBattleUnit,
} = require("../test-fixtures/battle");
const {
  createValidDeployment,
} = require("../test-fixtures/valid-deployment");

function createEnemyDeployment() {
  return createValidDeployment().map((placement) => ({
    ...placement,
    id: `enemy-${placement.id}`,
    cells: [...placement.cells],
  }));
}

function createSecretBattle() {
  return createTestBattle({
    playerTwoDeployment: createEnemyDeployment(),
  });
}

function cellIntent(actionId, actionType, sourceId, coordinate) {
  return {
    actionId,
    actionType,
    sourceId,
    target: { kind: "cell", coordinate },
  };
}

function allObjectKeys(value, keys = []) {
  if (!value || typeof value !== "object") {
    return keys;
  }
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    allObjectKeys(child, keys);
  }
  return keys;
}

function assertNoInternalKeys(value) {
  const forbidden = new Set([
    "actualTargetKind",
    "targetUnitId",
    "targetUnitType",
    "targetDecoyId",
    "freshUnitCell",
    "affectedUnitIds",
    "damageEvents",
    "decoyEvents",
    "pendingParalysisUnitIds",
    "processedActionIds",
  ]);
  const leaked = allObjectKeys(value).filter((key) => forbidden.has(key));
  assert.deepEqual(leaked, []);
}

test("进行中的玩家视图只包含己方完整状态和敌方公开 ID", () => {
  const battle = createSecretBattle();
  const view = createPlayerView(battle, "player-1");

  assert.equal(view.own.units.length, 8);
  assert.equal(view.own.decoys.length, 3);
  assert.deepEqual(view.opponent, { id: "player-2" });
  assert.equal(view.replay, null);
  assert.equal(JSON.stringify(view).includes("enemy-carrier"), false);
  assert.equal(
    Object.hasOwn(view.own, "pendingParalysisUnitIds"),
    false,
  );
  assertNoInternalKeys(view);
});

test("普通单格攻击只向攻击方公开命中结论，防守方看到己方实际受伤", () => {
  const resolved = resolveBattleAction(
    createSecretBattle(),
    "player-1",
    cellIntent(
      "safe-visible-hit",
      ACTION_TYPES.DESTROYER_I_RAM,
      "destroyer-i",
      "D4",
    ),
  );
  const actor = resolved.deliveriesByPlayer["player-1"];
  const defender = resolved.deliveriesByPlayer["player-2"];

  assert.equal(actor.feedback.result, "hit");
  assert.equal(actor.feedback.ownDamage[0].unitId, "destroyer-i");
  assert.equal(actor.feedback.inflictedDamage[0].unitId, "enemy-submarine");
  assert.equal(actor.feedback.inflictedDamage[0].afterHp, 1);
  assert.equal(defender.feedback.receivedHits[0].unitId, "enemy-submarine");
  assert.equal(Object.hasOwn(defender.feedback.receivedHits[0], "afterHp"), false);
  assertNoInternalKeys(actor);
  assertNoInternalKeys(defender);
});

test("潜射导弹命中时发射方只得到发射标记，防守方正常看到己方伤害", () => {
  const resolved = resolveBattleAction(
    createSecretBattle(),
    "player-1",
    cellIntent(
      "safe-hidden-hit",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      "A1",
    ),
  );
  const actor = resolved.deliveriesByPlayer["player-1"];
  const defender = resolved.deliveriesByPlayer["player-2"];

  assert.equal(actor.feedback.result, null);
  assert.equal(actor.feedback.submarineMissileMarker, "A1");
  assert.deepEqual(actor.feedback.ownDamage, []);
  assert.deepEqual(actor.view.own.enemyMap.cellResults, {});
  assert.deepEqual(actor.view.own.enemyMap.submarineMissileMarkers, ["A1"]);
  assert.equal(defender.feedback.receivedHits[0].unitId, "enemy-destroyer-i");
  assert.equal(JSON.stringify(actor).includes("enemy-destroyer-i"), false);
  assertNoInternalKeys(actor);
});

test("潜射导弹未命中时防守方除公开行动外没有附加结果", () => {
  const resolved = resolveBattleAction(
    createSecretBattle(),
    "player-1",
    cellIntent(
      "safe-hidden-miss",
      ACTION_TYPES.SUBMARINE_MISSILE,
      "submarine",
      "J1",
    ),
  );
  const defender = resolved.deliveriesByPlayer["player-2"];

  assert.equal(defender.publicRecord.result, null);
  assert.deepEqual(defender.feedback.ownDamage, []);
  assert.deepEqual(defender.feedback.ownDecoyChanges, []);
  assertNoInternalKeys(defender);
});

test("震爆弹立即反馈不泄露是否生效，瘫痪仅在防守方回合状态中出现", () => {
  const resolved = resolveBattleAction(
    createSecretBattle(),
    "player-1",
    cellIntent(
      "safe-shock",
      ACTION_TYPES.SHOCK_BOMB,
      "nuclear",
      "F3",
    ),
  );
  const actor = resolved.deliveriesByPlayer["player-1"];
  const defender = resolved.deliveriesByPlayer["player-2"];

  assert.equal(actor.publicRecord.result, null);
  assert.equal(actor.publicRecord.area.length, 25);
  assert.equal(
    defender.view.own.units.some((unit) => unit.paralyzed),
    false,
  );
  assertNoInternalKeys(actor);
  assertNoInternalKeys(defender);

  const begun = beginNormalTurn(resolved.state, "player-2");
  const activeView = createPlayerView(begun.state, "player-2");
  const paralyzedIds = activeView.own.units
    .filter((unit) => unit.paralyzed)
    .map((unit) => unit.id);
  assert.deepEqual(paralyzedIds, ["enemy-submarine", "enemy-nuclear"]);
});

test("探测弹布尔结果只发给行动方，公共记录和防守方不泄露结果", () => {
  const resolved = resolveBattleAction(
    createSecretBattle(),
    "player-1",
    cellIntent(
      "safe-detection",
      ACTION_TYPES.DETECTION_BOMB,
      "nuclear",
      "B2",
    ),
  );
  const actor = resolved.deliveriesByPlayer["player-1"];
  const defender = resolved.deliveriesByPlayer["player-2"];

  assert.equal(actor.publicRecord.result, null);
  assert.equal(actor.feedback.result, "underwater_signal_detected");
  assert.equal(defender.feedback.result, null);
  assert.equal(actor.publicRecord.defenderId, "player-2");
  assert.equal(actor.publicRecord.area.length, 9);
  assert.equal(JSON.stringify(actor.feedback).includes("enemy-submarine"), false);
  assertNoInternalKeys(actor);
  assertNoInternalKeys(defender);
});

test("雷达扫描布尔结果只发给行动方，公共记录和防守方不泄露结果", () => {
  const resolved = resolveBattleAction(
    createSecretBattle(),
    "player-1",
    cellIntent(
      "safe-radar",
      ACTION_TYPES.RADAR_SCAN,
      "carrier",
      "A1",
    ),
  );
  const actor = resolved.deliveriesByPlayer["player-1"];
  const defender = resolved.deliveriesByPlayer["player-2"];

  assert.equal(actor.publicRecord.result, null);
  assert.equal(actor.feedback.result, "layout_detected");
  assert.equal(defender.feedback.result, null);
  assert.equal(actor.publicRecord.defenderId, "player-2");
  assert.equal(actor.publicRecord.area.length, 16);
  assertNoInternalKeys(actor);
  assertNoInternalKeys(defender);
});

test("直升机公开逐格结果，并向攻击方单独提供精确伤害", () => {
  let battle = createSecretBattle();
  battle = damageBattleUnit(battle, "player-1", "destroyer-i", 3);
  battle = damageBattleUnit(battle, "player-1", "destroyer-ii", 3);
  const resolved = resolveBattleAction(battle, "player-1", {
    actionId: "safe-helicopter",
    actionType: ACTION_TYPES.HELICOPTER_STRAFE,
    sourceId: "carrier",
    target: { kind: "column", column: 1 },
  });
  const actor = resolved.deliveriesByPlayer["player-1"];

  assert.equal(actor.feedback.cellResults.length, 12);
  assert.deepEqual(Object.keys(actor.feedback.cellResults[0]).sort(), [
    "coordinate",
    "result",
  ]);
  assert.equal(actor.feedback.inflictedDamage[0].unitId, "enemy-destroyer-i");
  assertNoInternalKeys(actor);
});

test("海盗船自身与己方航空母舰伤害只作为攻击方己方通知发送", () => {
  const resolved = resolveBattleAction(
    createSecretBattle(),
    "player-1",
    cellIntent(
      "safe-pirate",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "G5",
    ),
  );
  const actor = resolved.deliveriesByPlayer["player-1"];
  const defender = resolved.deliveriesByPlayer["player-2"];

  assert.deepEqual(
    actor.feedback.ownDamage.map((event) => event.unitId),
    ["pirate", "carrier"],
  );
  assert.deepEqual(defender.feedback.ownDamage, []);
  assert.deepEqual(
    defender.feedback.receivedHits.map((event) => event.unitId),
    ["enemy-carrier"],
  );
  assert.equal(actor.feedback.inflictedDamage[0].unitId, "enemy-carrier");
});

test("对局结束后双方视图才公开完整部署与服务器复盘", () => {
  let battle = createSecretBattle();
  battle = damageBattleUnit(battle, "player-2", "enemy-carrier", 4);
  const resolved = resolveBattleAction(
    battle,
    "player-1",
    cellIntent(
      "safe-finished-replay",
      ACTION_TYPES.NUCLEAR_BOMB,
      "nuclear",
      "G5",
    ),
  );
  const actorView = resolved.deliveriesByPlayer["player-1"].view;

  assert.equal(actorView.match.status, "finished");
  assert.ok(actorView.replay);
  assert.equal(actorView.replay.players["player-2"].units.length, 8);
  assert.equal(
    actorView.replay.players["player-2"].units.some(
      (unit) => unit.id === "enemy-carrier",
    ),
    true,
  );
  assert.equal(
    actorView.replay.actionLog[0].outcome.cellResult.targetUnitId,
    "enemy-carrier",
  );
});

test("安全视图是独立副本，客户端修改不会污染服务器权威状态", () => {
  const battle = createSecretBattle();
  const view = createPlayerView(battle, "player-1");
  view.own.units[0].hp = 0;
  view.own.units[0].cells.push("J9");
  view.own.enemyMap.cellResults.A1 = "hit";

  const serverPlayer = getBattlePlayerState(battle, "player-1");
  assert.equal(getBattleUnitById(serverPlayer, "destroyer-i").hp, 3);
  assert.deepEqual(getBattleUnitById(serverPlayer, "destroyer-i").cells, [
    "A1",
    "A2",
    "A3",
  ]);
  assert.deepEqual(serverPlayer.targetCellResults, {});
});

test("行动反馈拒绝发送给不属于本次行动的第三方 ID", () => {
  const resolved = resolveBattleAction(
    createSecretBattle(),
    "player-1",
    cellIntent(
      "safe-viewer-check",
      ACTION_TYPES.PIRATE_ATTACK,
      "pirate",
      "J1",
    ),
  );
  const internalRecord = resolved.state.actionLog[0];
  assert.throws(
    () => createResolutionDelivery(resolved.state, internalRecord, "other"),
    (error) => error.code === "ACTION_VIEWER_NOT_INVOLVED",
  );
});
