"use strict";

const {
  applyDamageToUnit,
  createBattleState,
  getBattlePlayerState,
  replaceBattlePlayerState,
} = require("../server/game/battle-state");
const { createValidDeployment } = require("./valid-deployment");

function createTestBattle(options = {}) {
  return createBattleState([
    {
      id: "player-1",
      deployment: options.playerOneDeployment ?? createValidDeployment(),
    },
    {
      id: "player-2",
      deployment: options.playerTwoDeployment ?? createValidDeployment(),
    },
  ]);
}

function damageBattleUnit(
  battleState,
  playerId,
  unitId,
  damage,
  options = {},
) {
  const playerState = getBattlePlayerState(battleState, playerId);
  const applied = applyDamageToUnit(
    playerState,
    unitId,
    damage,
    options,
  );
  return replaceBattlePlayerState(
    battleState,
    playerId,
    applied.state,
  );
}

module.exports = {
  createTestBattle,
  damageBattleUnit,
};
