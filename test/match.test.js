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
  TURN_PHASES,
  beginPlayerAction,
  completeAutomaticTurnSkip,
  completeFinalSalvo,
  completePlayerAction,
  createRoomView,
  determineFirstPlayer,
  startPlaying,
} = require("../server/game/match");
const {
  ROOM_PHASES,
  createRoomState,
  joinRoomState,
  setPlayerReady,
  submitDeployment,
} = require("../server/game/room");
const {
  damageBattleUnit,
} = require("../test-fixtures/battle");
const {
  createValidDeployment,
} = require("../test-fixtures/valid-deployment");

function sequenceRandom(values) {
  const queue = [...values];
  return () => {
    assert.ok(queue.length > 0, "测试随机序列已耗尽");
    return queue.shift();
  };
}

function createRollingRoom() {
  let room = createRoomState({
    roomCode: "ABC234",
    playerId: "player-1",
    nickname: "甲方",
  });
  room = joinRoomState(room, {
    playerId: "player-2",
    nickname: "乙方",
  });
  room = submitDeployment(room, "player-1", createValidDeployment());
  room = submitDeployment(room, "player-2", createValidDeployment());
  room = setPlayerReady(room, "player-1");
  return setPlayerReady(room, "player-2");
}

function createPlayingRoom(firstPlayerId = "player-1") {
  const random = firstPlayerId === "player-1"
    ? sequenceRandom([0.9, 0.1])
    : sequenceRandom([0.1, 0.9]);
  return startPlaying(determineFirstPlayer(createRollingRoom(), random));
}

function pirateMiss(actionId = "pirate-miss") {
  return {
    actionId,
    actionType: ACTION_TYPES.PIRATE_ATTACK,
    sourceId: "pirate",
    target: { kind: "cell", coordinate: "J1" },
  };
}

function battleUnit(battle, playerId, unitId) {
  return getBattleUnitById(
    getBattlePlayerState(battle, playerId),
    unitId,
  );
}

function setRemainingUses(battle, playerId, changes) {
  const playerState = getBattlePlayerState(battle, playerId);
  return replaceBattlePlayerState(battle, playerId, {
    ...playerState,
    remainingUses: {
      ...playerState.remainingUses,
      ...changes,
    },
  });
}

function sinkUnits(battle, playerId, unitIds) {
  let next = battle;
  for (const unitId of unitIds) {
    const unit = battleUnit(next, playerId, unitId);
    next = damageBattleUnit(next, playerId, unitId, unit.hp);
  }
  return next;
}

function prepareLastSubmarineMissile(battle) {
  let next = sinkUnits(battle, "player-1", [
    "destroyer-i",
    "destroyer-ii",
    "pirate",
    "motorboat",
    "nuclear",
  ]);
  next = setRemainingUses(next, "player-1", {
    submarine_missile: 1,
    nuclear_bomb: 0,
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
  return setRemainingUses(next, "player-2", {
    submarine_missile: 0,
    nuclear_bomb: 0,
    helicopter_strafe: 0,
  });
}

function preparePlayerTwoForAutomaticSkip(battle) {
  let next = sinkUnits(battle, "player-2", [
    "destroyer-i",
    "destroyer-ii",
    "pirate",
    "motorboat",
  ]);
  next = setRemainingUses(next, "player-2", {
    helicopter_strafe: 0,
    radar_scan: 0,
  });
  const playerState = getBattlePlayerState(next, "player-2");
  return replaceBattlePlayerState(next, "player-2", {
    ...playerState,
    pendingParalysisUnitIds: ["submarine", "nuclear"],
  });
}

test("服务器掷骰同点时重掷，并记录全部轮次和唯一先手", () => {
  const rolling = createRollingRoom();
  const decided = determineFirstPlayer(
    rolling,
    sequenceRandom([0, 0, 0.2, 0.8]),
  );

  assert.equal(decided.roomPhase, ROOM_PHASES.ROLLING);
  assert.equal(decided.rolling.rounds.length, 2);
  assert.equal(decided.rolling.rounds[0].tied, true);
  assert.equal(decided.rolling.rounds[1].tied, false);
  assert.equal(decided.rolling.firstPlayerId, "player-2");
  assert.equal(decided.stateVersion, rolling.stateVersion + 1);
});

test("未确定先手不能开始，确定后进入 PLAYING/ACTIVE 且回合数为 1", () => {
  const rolling = createRollingRoom();
  assert.throws(
    () => startPlaying(rolling),
    (error) => error.code === "FIRST_PLAYER_REQUIRED",
  );

  const playing = startPlaying(
    determineFirstPlayer(rolling, sequenceRandom([0.9, 0.1])),
  );
  assert.equal(playing.roomPhase, ROOM_PHASES.PLAYING);
  assert.equal(playing.turnPhase, TURN_PHASES.ACTIVE);
  assert.equal(playing.currentPlayerId, "player-1");
  assert.equal(playing.turnNumber, 1);
  assert.equal(playing.battleState.actionLog.length, 0);
});

test("只有当前玩家能提交行动，非法行动不进入 RESOLVING", () => {
  const playing = createPlayingRoom("player-1");

  assert.throws(
    () => beginPlayerAction(playing, "player-2", pirateMiss("wrong-player")),
    (error) => error.code === "NOT_CURRENT_PLAYER",
  );
  assert.throws(
    () => beginPlayerAction(playing, "player-1", {
      ...pirateMiss("bad-target"),
      target: { kind: "cell", coordinate: "Z99" },
    }),
    (error) => error.code === "INVALID_ACTION",
  );
  assert.equal(playing.turnPhase, TURN_PHASES.ACTIVE);
  assert.equal(playing.stateVersion, 8);
});

test("合法行动先进入 RESOLVING，期间双方操作均锁定且重复提交被拒绝", () => {
  const playing = createPlayingRoom("player-1");
  const resolving = beginPlayerAction(
    playing,
    "player-1",
    pirateMiss("one-action"),
  );

  assert.equal(resolving.turnPhase, TURN_PHASES.RESOLVING);
  assert.equal(resolving.pendingAction.intent.actionId, "one-action");
  assert.equal(resolving.battleState.actionLog.length, 0);
  assert.equal(createRoomView(resolving, "player-1").battle.own.actionsLocked, true);
  assert.equal(createRoomView(resolving, "player-2").battle.own.actionsLocked, true);
  assert.throws(
    () => beginPlayerAction(resolving, "player-1", pirateMiss("one-action")),
    (error) => error.code === "TURN_PHASE_MISMATCH",
  );
});

test("完成行动只结算一次并切换到对手的下一个 ACTIVE 回合", () => {
  const playing = createPlayingRoom("player-1");
  const resolving = beginPlayerAction(
    playing,
    "player-1",
    pirateMiss("single-commit"),
  );
  const completed = completePlayerAction(resolving);

  assert.equal(completed.battleState.actionLog.length, 1);
  assert.equal(completed.currentPlayerId, "player-2");
  assert.equal(completed.turnPhase, TURN_PHASES.ACTIVE);
  assert.equal(completed.turnNumber, 2);
  assert.equal(completed.pendingAction, null);
  assert.throws(
    () => completePlayerAction(completed),
    (error) => error.code === "TURN_PHASE_MISMATCH",
  );
  assert.equal(completed.battleState.actionLog.length, 1);
});

test("玩家安全视图只开放当前玩家行动，并只取得自己的结算投递", () => {
  let room = createPlayingRoom("player-1");
  room = completePlayerAction(
    beginPlayerAction(room, "player-1", pirateMiss("safe-view")),
  );
  const actorView = createRoomView(room, "player-1");
  const defenderView = createRoomView(room, "player-2");

  assert.equal(actorView.turn.canAct, false);
  assert.equal(defenderView.turn.canAct, true);
  assert.equal(actorView.battle.own.actionsLocked, true);
  assert.equal(defenderView.battle.own.actionsLocked, false);
  assert.equal(actorView.latestResolution.feedback.actionId, "safe-view");
  assert.equal(Object.hasOwn(actorView, "lastResolutionByPlayer"), false);
  assert.equal(Object.hasOwn(defenderView.battle.opponent, "units"), false);
});

test("下一玩家无合法行动时进入 AUTO_SKIPPING，自动跳过本身不计回合", () => {
  let room = createPlayingRoom("player-1");
  room = {
    ...room,
    battleState: preparePlayerTwoForAutomaticSkip(room.battleState),
  };
  room = completePlayerAction(
    beginPlayerAction(room, "player-1", pirateMiss("before-skip")),
  );

  assert.equal(room.currentPlayerId, "player-2");
  assert.equal(room.turnPhase, TURN_PHASES.AUTO_SKIPPING);
  assert.equal(room.turnNumber, 1);
  assert.equal(
    battleUnit(room.battleState, "player-2", "submarine").paralyzed,
    true,
  );

  const skipped = completeAutomaticTurnSkip(room);
  assert.equal(skipped.currentPlayerId, "player-1");
  assert.equal(skipped.turnPhase, TURN_PHASES.ACTIVE);
  assert.equal(skipped.turnNumber, 2);
  assert.equal(skipped.turnEvents.length, 1);
  assert.equal(skipped.turnEvents[0].kind, "automatic_skip");
  assert.equal(
    battleUnit(skipped.battleState, "player-2", "submarine").paralyzed,
    false,
  );
});

test("攻击直接摧毁航空母舰时跳过下一回合并进入 FINISHED", () => {
  let room = createPlayingRoom("player-1");
  room = {
    ...room,
    battleState: damageBattleUnit(
      room.battleState,
      "player-2",
      "carrier",
      4,
    ),
  };
  room = beginPlayerAction(room, "player-1", {
    actionId: "finish-carrier",
    actionType: ACTION_TYPES.NUCLEAR_BOMB,
    sourceId: "nuclear",
    target: { kind: "cell", coordinate: "G5" },
  });
  const finished = completePlayerAction(room);

  assert.equal(finished.roomPhase, ROOM_PHASES.FINISHED);
  assert.equal(finished.turnPhase, null);
  assert.equal(finished.currentPlayerId, null);
  assert.equal(finished.battleState.match.result.winnerId, "player-1");
});

test("最后攻击手段耗尽后先进入 FINAL_SALVO，展示完成后才进入 FINISHED", () => {
  let room = createPlayingRoom("player-1");
  room = {
    ...room,
    battleState: prepareLastSubmarineMissile(room.battleState),
  };
  room = beginPlayerAction(room, "player-1", {
    actionId: "last-missile",
    actionType: ACTION_TYPES.SUBMARINE_MISSILE,
    sourceId: "submarine",
    target: { kind: "cell", coordinate: "J1" },
  });
  const finalSalvo = completePlayerAction(room);

  assert.equal(finalSalvo.roomPhase, ROOM_PHASES.FINAL_SALVO);
  assert.equal(finalSalvo.turnPhase, null);
  assert.ok(finalSalvo.battleState.match.finalSalvo);
  const finished = completeFinalSalvo(finalSalvo);
  assert.equal(finished.roomPhase, ROOM_PHASES.FINISHED);
  assert.equal(
    finished.battleState.actionLog.length,
    finalSalvo.battleState.actionLog.length,
  );
  assert.equal(finished.stateVersion, finalSalvo.stateVersion + 1);
});
