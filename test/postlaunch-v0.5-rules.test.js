"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { ACTION_TYPES } = require("../server/game/actions");
const { validateActionIntent } = require("../server/game/action-validation");
const { getBattlePlayerState } = require("../server/game/battle-state");
const { resolveAction } = require("../server/game/action-resolution");
const {
  startManualFinalSalvo,
  submitManualFinalSalvo,
} = require("../server/game/endgame");
const { createPlayerView } = require("../server/game/information-projection");
const { resolveBattleAction } = require("../server/game/match-resolution");
const { createTestBattle } = require("../test-fixtures/battle");

function intent(actionId, actionType, sourceId, coordinate) {
  return {
    actionId,
    actionType,
    sourceId,
    target: { kind: "cell", coordinate },
  };
}

test("两艘驱逐舰共享已攻击坐标，任一驱逐舰攻击后双方都不能重复选择", () => {
  const first = resolveAction(
    createTestBattle(),
    "player-1",
    intent("destroyer-first", ACTION_TYPES.DESTROYER_I_RAM, "destroyer-i", "D5"),
  );
  const player = getBattlePlayerState(first.state, "player-1");
  assert.deepEqual(player.destroyerTargetCells, ["D5"]);
  const repeated = validateActionIntent(
    player,
    intent("destroyer-repeat", ACTION_TYPES.DESTROYER_II_RAM, "destroyer-ii", "D5"),
  );
  assert.equal(repeated.valid, false);
  assert.ok(repeated.errors.some((error) => error.code === "DESTROYER_TARGET_ALREADY_USED"));
});

test("核弹命中结果对发射方保密，但防守方仍收到实际伤害", () => {
  const resolved = resolveBattleAction(
    createTestBattle(),
    "player-1",
    intent("hidden-nuclear", ACTION_TYPES.NUCLEAR_BOMB, "nuclear", "G5"),
  );
  const actor = resolved.deliveriesByPlayer["player-1"];
  const defender = resolved.deliveriesByPlayer["player-2"];
  assert.equal(actor.feedback.result, null);
  assert.equal(actor.feedback.nuclearBombMarker, "G5");
  assert.deepEqual(actor.view.own.enemyMap.nuclearBombMarkers, ["G5"]);
  assert.equal(defender.feedback.result, null);
  assert.equal(defender.feedback.receivedHits[0].unitType, "aircraft_carrier");
  assert.equal(Object.hasOwn(defender.feedback.receivedHits[0], "appliedDamage"), false);
});

test("海盗船受到敌方伤害时，己方航空母舰每次行动联动损失 0.5", () => {
  const resolved = resolveAction(
    createTestBattle(),
    "player-1",
    intent("damage-pirate", ACTION_TYPES.NUCLEAR_BOMB, "nuclear", "F1"),
  );
  const defender = getBattlePlayerState(resolved.state, "player-2");
  assert.equal(defender.units.find((unit) => unit.id === "pirate").hp, 1);
  assert.equal(defender.units.find((unit) => unit.id === "carrier").hp, 5.5);
});

function exhaustAttacks(battle) {
  for (const playerId of battle.playerIds) {
    const player = battle.players[playerId];
    player.remainingUses.submarine_missile = 0;
    player.remainingUses.nuclear_bomb = 0;
    player.remainingUses.helicopter_strafe = 0;
    for (const id of ["destroyer-i", "destroyer-ii", "pirate", "motorboat", "motorboat-2"]) {
      player.units.find((unit) => unit.id === id).hp = 0;
    }
  }
  return battle;
}

test("弹药耗尽后双方逐轮秘密选择鱼雷，并在双方提交后同时结算", () => {
  let battle = startManualFinalSalvo(exhaustAttacks(createTestBattle()));
  battle = submitManualFinalSalvo(battle, "player-1", "decoy-1");
  const waitingView = createPlayerView(battle, "player-2");
  assert.equal(waitingView.match.finalSalvo.opponentSubmitted, true);
  assert.equal(waitingView.match.finalSalvo.ownSelectedDecoyId, null);
  assert.equal(
    Object.hasOwn(waitingView.match.finalSalvo, "opponentSelectedDecoyId"),
    false,
  );

  battle = submitManualFinalSalvo(battle, "player-2", "decoy-1");
  assert.equal(battle.match.finalSalvo.round, 2);
  assert.equal(battle.match.finalSalvo.shots.length, 2);
  for (const number of [2, 3]) {
    battle = submitManualFinalSalvo(battle, "player-1", `decoy-${number}`);
    battle = submitManualFinalSalvo(battle, "player-2", `decoy-${number}`);
  }
  assert.equal(battle.match.status, "finished");
  assert.equal(battle.match.finalSalvo.status, "completed");
  assert.equal(battle.match.finalSalvo.shots.length, 6);
});
