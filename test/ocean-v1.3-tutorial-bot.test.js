"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  BOT_DIFFICULTIES,
} = require("../server/game/bot-difficulty");
const {
  createBotActionIntent,
  enhanceExpertKnowledge,
} = require("../server/game/bot-strategy");
const { ACTION_TYPES } = require("../server/game/actions");
const { createMapRules } = require("../server/game/map-rules");
const { InMemoryRoomService } = require("../server/game/room-service");
const { ROOM_MODES } = require("../server/game/room");
const Tutorial = require("../public/js/tutorial-system");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

const ROOT = path.resolve(__dirname, "..");

function deterministicRandom(value = 0.5) {
  return () => value;
}

function createService() {
  const playerIds = ["human-1", "bot-1"];
  return new InMemoryRoomService({
    now: () => 1_000,
    roomCodeFactory: () => "AT2345",
    playerIdFactory: () => playerIds.shift(),
    random: deterministicRandom(),
    randomDeploymentFactory: () => createValidDeployment(),
  });
}

test("v1.3 人机房间严格保存并公开新手、标准、专家三档难度", () => {
  const expectedNames = {
    beginner: "OCEAN 新手机器人",
    standard: "OCEAN 战术机器人",
    expert: "OCEAN 专家机器人",
  };
  for (const difficulty of Object.values(BOT_DIFFICULTIES)) {
    const service = createService();
    const created = service.createRoom({
      nickname: "真人",
      maxPlayers: 2,
      roomMode: ROOM_MODES.BOT_DUEL,
      botDifficulty: difficulty,
    });
    assert.equal(created.view.botDifficulty, difficulty);
    assert.equal(
      created.view.seats.find((seat) => seat.isBot).nickname,
      expectedNames[difficulty],
    );
  }

  assert.throws(
    () => createService().createRoom({
      nickname: "真人",
      maxPlayers: 2,
      roomMode: ROOM_MODES.BOT_DUEL,
      botDifficulty: "impossible",
    }),
    (error) => error.code === "INVALID_BOT_DIFFICULTY",
  );

  const pvp = createService().createRoom({
    nickname: "真人",
    maxPlayers: 2,
    roomMode: ROOM_MODES.PVP,
  });
  assert.equal(pvp.view.botDifficulty, null);
});

function safeDecisionView() {
  const mapRules = createMapRules(12);
  const enemyMap = {
    cellResults: {},
    submarineMissileMarkers: [],
    nuclearBombMarkers: [],
    destroyerTargetCells: [],
  };
  return {
    stateVersion: 12,
    botDifficulty: "standard",
    mapRules,
    turn: { canAct: true, remainingTargetPlayerIds: ["human-1"] },
    battle: {
      opponentId: "human-1",
      own: {
        units: [
          { id: "carrier", type: "aircraft_carrier", hp: 6, cells: ["A1"] },
          { id: "pirate", type: "pirate_ship", hp: 2, cells: ["B1", "B2", "B3"] },
          { id: "submarine", type: "submarine", hp: 2, cells: ["C1", "C2", "D1", "D2"] },
          { id: "nuclear", type: "nuclear_submarine", hp: 3, cells: ["E1", "E2", "F1", "F2"] },
        ],
        intelligenceAreas: [],
        enemyMap,
        enemyMapsByPlayer: { "human-1": enemyMap },
        actionAvailability: [
          { actionType: ACTION_TYPES.PIRATE_ATTACK, sourceId: "pirate", available: true },
          { actionType: ACTION_TYPES.SUBMARINE_MISSILE, sourceId: "submarine", available: true },
        ],
      },
    },
  };
}

test("新手机器人只做合法随机选择，且隐藏部署不能改变决定", () => {
  const first = safeDecisionView();
  const second = structuredClone(first);
  first.secretEnemyDeployment = [{ cells: ["A1"] }];
  second.secretEnemyDeployment = [{ cells: ["L12"] }];
  const options = {
    difficulty: BOT_DIFFICULTIES.BEGINNER,
    random: deterministicRandom(0),
    actionId: "beginner-fixed",
  };
  const firstIntent = createBotActionIntent(first, options);
  const secondIntent = createBotActionIntent(second, options);
  assert.deepEqual(firstIntent, secondIntent);
  assert.equal(firstIntent.actionType, ACTION_TYPES.PIRATE_ATTACK);
  assert.deepEqual(firstIntent.target, { kind: "cell", coordinate: "A1" });
});

test("专家机器人把无布局雷达区视为空区，并沿相邻命中方向追踪", () => {
  const view = safeDecisionView();
  view.botDifficulty = BOT_DIFFICULTIES.EXPERT;
  view.battle.own.enemyMap.cellResults = { D5: "hit", D6: "hit" };
  view.battle.own.enemyMapsByPlayer["human-1"] = view.battle.own.enemyMap;
  view.battle.own.intelligenceAreas = [{
    kind: "radar",
    defenderId: "human-1",
    detected: false,
    area: ["A1", "A2", "B1", "B2"],
  }];
  view.battle.own.actionAvailability = [{
    actionType: ACTION_TYPES.NUCLEAR_BOMB,
    sourceId: "nuclear",
    available: true,
  }];

  const knowledge = enhanceExpertKnowledge(view, "human-1");
  assert.ok(knowledge.general.A1 <= -150);
  assert.ok(knowledge.general.D4 > knowledge.general.C5);

  const intent = createBotActionIntent(view, {
    difficulty: BOT_DIFFICULTIES.EXPERT,
    random: deterministicRandom(0.5),
    actionId: "expert-extension",
  });
  assert.equal(intent.actionType, ACTION_TYPES.NUCLEAR_BOMB);
  assert.deepEqual(intent.target, { kind: "cell", coordinate: "D4" });
});

function apply(session, type, values = {}) {
  return Tutorial.reduce(session, { type, ...values });
}

test("五章交互教程可以从部署连续完成到最终指挥考核", () => {
  let session = Tutorial.createSession();

  session = apply(session, "tutorial-cell", { coordinate: "B2" });
  assert.deepEqual(session.deployment.cells, ["B2", "B3", "B4"]);
  session = apply(session, "tutorial-rotate");
  assert.deepEqual(session.deployment.cells, ["B2", "C2", "D2"]);
  assert.ok(session.completedLessonIds.includes("deployment"));

  session = apply(session, "tutorial-next-lesson");
  session = apply(session, "tutorial-cell", { coordinate: "D6" });
  assert.equal(session.damage.targetHp, 2);
  assert.equal(session.damage.ownDestroyerHp, 2.5);
  session = apply(session, "tutorial-cell", { coordinate: "D6" });
  session = apply(session, "tutorial-select", { value: "nuclear" });
  session = apply(session, "tutorial-cell", { coordinate: "D6" });
  assert.equal(session.damage.targetHp, 2, "受击格不得重复扣血");
  assert.ok(session.completedLessonIds.includes("damage"));

  session = apply(session, "tutorial-next-lesson");
  session = apply(session, "tutorial-cell", { coordinate: "C3" });
  assert.equal(session.intelligence.radarCells.length, 16);
  session = apply(session, "tutorial-select", { value: "underwater_yes" });
  session = apply(session, "tutorial-cell", { coordinate: "E5" });
  assert.equal(session.intelligence.markers.E5, "underwater_yes");
  session = apply(session, "tutorial-select", { value: "detection" });
  session = apply(session, "tutorial-cell", { coordinate: "H8" });
  assert.equal(session.intelligence.detectionCells.length, 9);

  session = apply(session, "tutorial-next-lesson");
  session = apply(session, "tutorial-cell", { coordinate: "G7" });
  assert.match(session.secrecy.attackerMessage, /结果未知/);
  assert.match(session.secrecy.defenderMessage, /生命值 2 → 1/);
  session = apply(session, "tutorial-select", { value: "nuclear" });
  session = apply(session, "tutorial-cell", { coordinate: "H8" });
  assert.match(session.secrecy.attackerMessage, /命中情况保密/);
  assert.match(session.secrecy.defenderMessage, /生命值 6 → 4/);
  session = apply(session, "tutorial-select", { value: "shock" });
  session = apply(session, "tutorial-cell", { coordinate: "F6" });
  assert.equal(session.secrecy.shockCells.length, 25);

  session = apply(session, "tutorial-next-lesson");
  for (const question of Tutorial.QUIZ) {
    session = apply(session, "tutorial-answer", { value: question.correct });
  }
  assert.equal(session.finished, true);
  assert.equal(Tutorial.progress(session).percent, 100);
  assert.deepEqual(
    session.completedLessonIds,
    Tutorial.LESSONS.map((lesson) => lesson.id),
  );
});

test("教程错误操作不会跳过任务，章节进度可安全恢复", () => {
  let session = Tutorial.createSession();
  session = apply(session, "tutorial-cell", { coordinate: "A1" });
  assert.equal(session.step, 0);
  assert.match(session.message, /B2/);

  const restored = Tutorial.createSession(["deployment", "damage", "invalid"]);
  assert.deepEqual(restored.completedLessonIds, ["deployment", "damage"]);
  assert.equal(Tutorial.progress(restored).percent, 40);
});

test("正式首页打包教程入口、三档难度控件与移动端教程布局", () => {
  const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
  const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
  assert.match(html, /tutorial-system\.js/);
  assert.match(app, /data-action="start-tutorial"/);
  assert.match(app, /data-action="select-bot-difficulty"/);
  assert.match(app, /beginner[\s\S]*standard[\s\S]*expert/);
  assert.match(css, /\.tutorial-page/);
  assert.match(css, /\.tutorial-board-frame[\s\S]*--cell-size:\s*42px/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});
