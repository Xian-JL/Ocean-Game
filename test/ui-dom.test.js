"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");
const Data = require("../public/js/game-data");

const PROJECT_ROOT = path.resolve(__dirname, "..");

class FakeSocket {
  constructor() {
    this.connected = false;
    this.handlers = new Map();
    this.emitted = [];
  }

  on(eventName, handler) {
    const handlers = this.handlers.get(eventName) ?? [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
    return this;
  }

  timeout() {
    return this;
  }

  emit(eventName, payload, acknowledge) {
    this.emitted.push({ eventName, payload });
    if (typeof acknowledge === "function") {
      if (eventName === "client:ping") {
        acknowledge(null, {
          ok: true,
          protocolVersion: "2.1",
        });
      } else {
        acknowledge(null, {
          ok: true,
          data: { stateVersion: 999 },
        });
      }
    }
    return this;
  }

  serverEmit(eventName, payload) {
    for (const handler of this.handlers.get(eventName) ?? []) {
      handler(payload);
    }
  }

  connect() {
    this.connected = true;
    this.serverEmit("connect");
  }

  disconnect() {
    this.connected = false;
    this.serverEmit("disconnect");
  }
}

function baseRoom(overrides = {}) {
  return {
    roomCode: "ABC234",
    stateVersion: 1,
    roomPhase: "WAITING",
    turnPhase: null,
    connectionPhase: "CONNECTED",
    deploymentsLocked: false,
    seats: [
      {
        playerId: "player-1",
        nickname: "甲",
        online: true,
        ready: false,
        autoPrepared: false,
      },
    ],
    own: {
      playerId: "player-1",
      nickname: "甲",
      deployment: null,
      consecutiveActionTimeouts: 0,
    },
    rematch: {
      ownRequested: false,
      opponentRequested: false,
      requestedPlayerIds: [],
    },
    matchSummary: {
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      turnCount: 0,
    },
    serverNow: 10_000,
    deadlines: {
      deploymentDeadlineAt: null,
      actionDeadlineAt: null,
      reconnectDeadlineAtByPlayer: {},
    },
    connection: {
      offlinePlayerIds: [],
      pausedTimer: null,
    },
    rolling: null,
    turn: null,
    battle: null,
    latestResolution: null,
    turnEvents: [],
    systemEvents: [],
    closedReason: null,
    ...overrides,
  };
}

function createSnapshot() {
  const deployment = createValidDeployment();
  const units = deployment
    .filter((placement) => placement.type !== Data.UNIT_TYPES.DECOY_TORPEDO)
    .map((placement) => {
      const definition = Data.getUnitDefinitionByType(placement.type);
      return {
        id: placement.id,
        type: placement.type,
        cells: [...placement.cells],
        hp: definition.initialHp,
        paralyzed: false,
        hitCells: [],
      };
    });
  const decoys = deployment
    .filter((placement) => placement.type === Data.UNIT_TYPES.DECOY_TORPEDO)
    .map((placement) => ({
      id: placement.id,
      cell: placement.cells[0],
      destroyed: false,
    }));
  return {
    units,
    decoys,
    remainingUses: Object.fromEntries(
      Data.ACTION_DEFINITIONS.filter((action) => action.initialUses !== null).map(
        (action) => [action.type, action.initialUses],
      ),
    ),
  };
}

function playingRoom() {
  const snapshot = createSnapshot();
  return baseRoom({
    stateVersion: 4,
    roomPhase: "PLAYING",
    turnPhase: "ACTIVE",
    seats: [
      { playerId: "player-1", nickname: "甲", online: true, ready: true, autoPrepared: false },
      { playerId: "player-2", nickname: "乙", online: true, ready: true, autoPrepared: false },
    ],
    own: {
      playerId: "player-1",
      nickname: "甲",
      deployment: createValidDeployment(),
      consecutiveActionTimeouts: 0,
    },
    matchSummary: {
      startedAt: 1_000,
      finishedAt: null,
      durationMs: 9_000,
      turnCount: 1,
    },
    deadlines: {
      deploymentDeadlineAt: null,
      actionDeadlineAt: 100_000,
      reconnectDeadlineAtByPlayer: {},
    },
    turn: {
      currentPlayerId: "player-1",
      turnNumber: 1,
      canAct: true,
    },
    battle: {
      viewerId: "player-1",
      opponentId: "player-2",
      match: { status: "playing", result: null },
      own: {
        ...snapshot,
        enemyMap: {
          cellResults: {},
          submarineMissileMarkers: ["B3"],
        },
        intelligenceAreas: [],
        actionsLocked: false,
        actionAvailability: Data.ACTION_DEFINITIONS.map((action) => ({
          actionType: action.type,
          name: action.name,
          sourceId: snapshot.units.find((unit) => unit.type === action.sourceType)?.id,
          remainingUses: snapshot.remainingUses[action.type] ?? null,
          available:
            action.type !== Data.ACTION_TYPES.HELICOPTER_STRAFE,
          issues:
            action.type === Data.ACTION_TYPES.HELICOPTER_STRAFE
              ? [{ code: "ACTION_LOCKED", message: "尚未解锁" }]
              : [],
          targetCount: 100,
        })),
      },
      opponent: { id: "player-2" },
      publicActionLog: [],
      replay: null,
    },
  });
}

function threePlayerPlayingRoom() {
  const room = playingRoom();
  const emptyEnemyMap = {
    cellResults: {},
    submarineMissileMarkers: [],
    nuclearBombMarkers: [],
    destroyerTargetCells: [],
  };
  room.stateVersion = 8;
  room.maxPlayers = 3;
  room.seats.push({
    playerId: "player-3",
    nickname: "丙",
    online: true,
    ready: true,
    autoPrepared: false,
  });
  room.turn = {
    ...room.turn,
    requiredTargetPlayerIds: ["player-2", "player-3"],
    completedTargetPlayerIds: [],
    remainingTargetPlayerIds: ["player-2", "player-3"],
  };
  room.battle.opponentIds = ["player-2", "player-3"];
  room.battle.opponents = [{ id: "player-2" }, { id: "player-3" }];
  room.battle.own.enemyMapsByPlayer = {
    "player-2": structuredClone(room.battle.own.enemyMap),
    "player-3": emptyEnemyMap,
  };
  return room;
}

function assertBoardCoordinateAlignment(board, size = 12) {
  assert.equal(board.dataset.boardSize, String(size));
  assert.equal(board.hasAttribute("style"), false);
  const columnAxes = [...board.querySelectorAll(".board-axis--column")];
  const rowAxes = [...board.querySelectorAll(".board-axis--row")];
  assert.deepEqual(columnAxes.map((axis) => axis.textContent),
    Array.from({ length: size }, (_value, index) => String(index + 1)));
  assert.deepEqual(rowAxes.map((axis) => axis.textContent),
    "ABCDEFGHIJKLMNO".slice(0, size).split(""));
  const children = [...board.children];
  assert.ok(children[0].classList.contains("board-corner"));
  columnAxes.forEach((axis, index) => {
    assert.equal(children[index + 1], axis);
    assert.equal(axis.hasAttribute("style"), false);
  });
  for (const [rowIndex, row] of rowAxes.entries()) {
    const rowStart = size + 1 + rowIndex * (size + 1);
    assert.equal(children[rowStart], row);
    assert.equal(row.hasAttribute("style"), false);
    for (let columnIndex = 0; columnIndex < size; columnIndex += 1) {
      const coordinate = `${row.textContent}${columnIndex + 1}`;
      const cell = board.querySelector(`[data-coordinate="${coordinate}"]`);
      assert.ok(cell, `缺少地图格 ${coordinate}`);
      assert.equal(children[rowStart + columnIndex + 1], cell);
      assert.equal(cell.hasAttribute("style"), false);
    }
  }
  assert.equal(children.length, (size + 1) ** 2);
}

function click(window, element) {
  element.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

test("正式页面脚本在浏览器 DOM 中闭环渲染 P01～P06、O01～O06 与核心交互", async (context) => {
  const html = fs
    .readFileSync(path.join(PROJECT_ROOT, "public/index.html"), "utf8")
    .replaceAll(/<script[^>]+src="[^"]+"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, {
    url: "http://127.0.0.1:3000/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  context.after(() => dom.window.close());
  const { window } = dom;
  window.structuredClone = structuredClone;
  window.document.execCommand = () => true;
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: async () => {} },
    configurable: true,
  });
  window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  window.HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };

  const socket = new FakeSocket();
  window.io = () => socket;
  for (const script of ["game-data.js", "ui-model.js", "audio-system.js", "tutorial-system.js", "app.js"]) {
    window.eval(
      fs.readFileSync(path.join(PROJECT_ROOT, "public/js", script), "utf8"),
    );
  }
  socket.connect();
  socket.serverEmit("system:ready", {
    stage: "Ocean-v1.4.1",
    protocolVersion: "2.1",
  });

  assert.match(window.document.querySelector("#app").textContent, /创建房间/);
  assert.equal(window.document.querySelectorAll("#create-form").length, 1);
  assert.equal(window.document.querySelectorAll('[data-action="select-map-size"]').length, 3);
  click(window, window.document.querySelector('[data-room-mode="bot_duel"]'));
  assert.equal(
    window.document.querySelectorAll('[data-action="select-bot-difficulty"]').length,
    3,
  );
  click(window, window.document.querySelector('[data-bot-difficulty="expert"]'));
  assert.equal(
    window.document.querySelector('[data-bot-difficulty="expert"]').getAttribute("aria-checked"),
    "true",
  );
  const emittedBeforeTutorial = socket.emitted.length;
  click(window, window.document.querySelector('[data-action="start-tutorial"]'));
  assert.ok(window.document.querySelector(".tutorial-page"));
  assert.equal(window.document.querySelectorAll('[data-action="tutorial-cell"]').length, 144);
  click(window, window.document.querySelector('[data-action="tutorial-cell"][data-coordinate="B2"]'));
  assert.equal(window.document.querySelectorAll(".tutorial-board-cell--ship").length, 3);
  click(window, window.document.querySelector('[data-action="tutorial-rotate"]'));
  for (const coordinate of ["B2", "C2", "D2"]) {
    assert.ok(window.document.querySelector(
      `[data-action="tutorial-cell"][data-coordinate="${coordinate}"].tutorial-board-cell--ship`,
    ));
  }
  assert.equal(socket.emitted.length, emittedBeforeTutorial, "教程不得发送任何 Socket 事件");
  assert.deepEqual(
    JSON.parse(window.localStorage.getItem("ocean.tutorial-progress.v1")).completedLessonIds,
    ["deployment"],
  );
  click(window, window.document.querySelector('[data-action="exit-tutorial"]'));
  assert.match(window.document.querySelector("#app").textContent, /创建房间/);
  assert.equal(
    window.document.querySelector('[data-bot-difficulty="expert"]').getAttribute("aria-checked"),
    "true",
  );
  click(window, window.document.querySelector('[data-map-size="15"]'));
  assert.equal(
    window.document.querySelector('[data-map-size="15"]').getAttribute("aria-checked"),
    "true",
  );
  click(window, window.document.querySelector('[data-action="open-rules"]'));
  assert.equal(window.document.querySelector("#rules-dialog").open, true);
  assert.equal(window.document.querySelector("#rules-dialog #effects-volume"), null);
  click(window, window.document.querySelector('[data-action="close-rules"]'));

  const effectsEnabledBeforeOpen = window.document.querySelector("#effects-toggle").checked;
  click(window, window.document.querySelector("#effects-button"));
  assert.equal(window.document.querySelector("#audio-dialog").open, true);
  assert.equal(window.document.querySelector("#effects-toggle").checked, effectsEnabledBeforeOpen);
  assert.equal(window.document.activeElement.id, "effects-volume");
  const effectsVolume = window.document.querySelector("#effects-volume");
  effectsVolume.value = "37";
  effectsVolume.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.querySelector("#effects-volume-output").textContent, "37%");
  assert.equal(window.localStorage.getItem("ocean.audio.effects-volume.v1"), "0.37");
  click(window, window.document.querySelector('[data-action="close-audio-settings"]'));
  click(window, window.document.querySelector("#music-button"));
  assert.equal(window.document.querySelector("#audio-dialog").open, true);
  assert.equal(window.document.activeElement.id, "music-volume");
  const musicVolume = window.document.querySelector("#music-volume");
  musicVolume.value = "64";
  musicVolume.dispatchEvent(new window.Event("input", { bubbles: true }));
  assert.equal(window.document.querySelector("#music-volume-output").textContent, "64%");
  assert.equal(window.localStorage.getItem("ocean.audio.music-volume.v1"), "0.64");
  click(window, window.document.querySelector('[data-action="close-audio-settings"]'));
  socket.serverEmit("room:error", {
    code: "TEST_MESSAGE",
    message: "可恢复的测试提示",
    details: {},
  });
  const dismissibleToast = window.document.querySelector(".toast");
  assert.match(dismissibleToast.textContent, /可恢复的测试提示/);
  click(window, dismissibleToast);
  assert.equal(window.document.querySelector(".toast"), null);

  socket.serverEmit("room:session", {
    active: true,
    roomCode: "ABC234",
    playerId: "player-1",
    reconnectToken: "private-token-must-not-enter-dom",
  });
  socket.serverEmit("room:state", baseRoom());
  assert.match(window.document.querySelector("#app").textContent, /等待玩家/);
  assert.equal(
    window.document.body.textContent.includes("private-token-must-not-enter-dom"),
    false,
  );

  socket.serverEmit("room:state", baseRoom({
    stateVersion: 2,
    roomPhase: "DEPLOYING",
    seats: [
      { playerId: "player-1", nickname: "甲", online: true, ready: false, autoPrepared: false },
      { playerId: "player-2", nickname: "乙", online: true, ready: false, autoPrepared: false },
    ],
    deadlines: {
      deploymentDeadlineAt: 190_000,
      actionDeadlineAt: null,
      reconnectDeadlineAtByPlayer: {},
    },
  }));
  assert.equal(window.document.querySelectorAll(".fleet-item").length, 11);
  assert.equal(window.document.querySelectorAll('[data-action="deployment-cell"]').length, 144);
  const deploymentPage = window.document.querySelector(".deployment-page");
  const deploymentBoard = window.document.querySelector(
    ".deployment-map-card .ocean-board",
  );
  assertBoardCoordinateAlignment(deploymentBoard);
  click(
    window,
    window.document.querySelector(
      '[data-action="select-placement"][data-placement-id="motorboat"]',
    ),
  );
  assert.equal(window.document.querySelector(".deployment-page"), deploymentPage);
  assert.equal(
    window.document.querySelector(".deployment-map-card .ocean-board"),
    deploymentBoard,
  );
  assert.match(window.document.querySelector(".selected-placement-card").textContent, /摩托艇/);
  const deploymentA1 = window.document.querySelector(
    '[data-action="deployment-cell"][data-coordinate="A1"]',
  );
  deploymentA1.dispatchEvent(
    new window.MouseEvent("pointerover", { bubbles: true }),
  );
  assert.equal(window.document.querySelector(".deployment-page"), deploymentPage);
  assert.equal(
    window.document.querySelector(".deployment-map-card .ocean-board"),
    deploymentBoard,
  );
  assert.ok(
    deploymentA1.classList.contains("board-cell--placement-preview-valid"),
  );
  const deploymentA2 = window.document.querySelector(
    '[data-action="deployment-cell"][data-coordinate="A2"]',
  );
  deploymentA2.dispatchEvent(
    new window.MouseEvent("pointerover", { bubbles: true }),
  );
  assert.ok(
    !deploymentA1.classList.contains("board-cell--placement-preview-valid"),
  );
  assert.ok(
    deploymentA2.classList.contains("board-cell--placement-preview-valid"),
  );
  click(window, window.document.querySelector('[data-action="toggle-deployment-map"]'));
  assert.equal(window.document.querySelectorAll('[data-action="deployment-cell"]').length, 0);
  assert.ok(window.document.querySelector(".collapsible-map--collapsed"));
  click(window, window.document.querySelector(".collapsed-map-summary"));
  assert.equal(window.document.querySelectorAll('[data-action="deployment-cell"]').length, 144);
  click(window, window.document.querySelector('[data-action="random-deployment"]'));
  assert.match(window.document.querySelector(".validation-card").textContent, /部署完整合法/);
  assert.equal(
    window.document.querySelector('[data-action="ready-deployment"]').disabled,
    false,
  );

  socket.serverEmit("room:state", baseRoom({
    stateVersion: 3,
    roomPhase: "ROLLING",
    seats: [
      { playerId: "player-1", nickname: "甲", online: true, ready: true, autoPrepared: false },
      { playerId: "player-2", nickname: "乙", online: true, ready: true, autoPrepared: false },
    ],
    rolling: {
      rounds: [
        {
          round: 1,
          rolls: { "player-1": 6, "player-2": 2 },
          tied: false,
        },
      ],
      firstPlayerId: "player-1",
    },
  }));
  assert.match(window.document.querySelector("#app").textContent, /甲 获得第一回合/);

  socket.serverEmit("room:state", playingRoom());
  assert.equal(window.document.querySelectorAll(".action-card").length, 10);
  assert.equal(window.document.querySelectorAll('.battle-map-card [data-action="enemy-cell"]').length, 144);
  const battleMainColumn = window.document.querySelector(".battle-main-column");
  assert.ok(battleMainColumn);
  assert.ok(battleMainColumn.firstElementChild.classList.contains("battle-maps"));
  assert.ok(battleMainColumn.lastElementChild.classList.contains("event-center"));
  assert.equal(window.document.querySelector(".battle-lower .event-center"), null);
  for (const board of window.document.querySelectorAll(".battle-map-card .ocean-board")) {
    assertBoardCoordinateAlignment(board);
  }
  const pirate = window.document.querySelector(
    `[data-action="select-action"][data-action-type="${Data.ACTION_TYPES.PIRATE_ATTACK}"]`,
  );
  click(window, pirate);
  const enemyA1 = window.document.querySelector(
    '.battle-map-card--enemy [data-action="enemy-cell"][data-coordinate="A1"]',
  );
  click(window, enemyA1);
  assert.equal(window.document.querySelector("#confirm-dialog").open, true);
  assert.match(window.document.querySelector("#confirm-body").textContent, /目标：A1/);
  assert.equal(window.document.querySelector("#confirm-body").textContent.includes("未命中无伤害"), false);
  click(window, window.document.querySelector("#confirm-cancel"));

  assert.equal(
    window.document.querySelectorAll('[data-action="select-marker-tool"]').length,
    5,
  );
  click(window, window.document.querySelector(
    '[data-action="select-marker-tool"][data-marker="surface_yes"]',
  ));
  const enemyA2 = window.document.querySelector(
    '.battle-map-card--enemy [data-action="enemy-cell"][data-coordinate="A2"]',
  );
  click(window, enemyA2);
  assert.match(
    window.document.querySelector(
      '.battle-map-card--enemy [data-action="enemy-cell"][data-coordinate="A2"]',
    ).getAttribute("aria-label"),
    /本机标记：水面有布局/,
  );
  window.document.querySelector(
    '.battle-map-card--enemy [data-action="enemy-cell"][data-coordinate="A2"]',
  ).dispatchEvent(new window.MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
  }));
  assert.doesNotMatch(
    window.document.querySelector(
      '.battle-map-card--enemy [data-action="enemy-cell"][data-coordinate="A2"]',
    ).getAttribute("aria-label"),
    /本机标记/,
  );

  const actorFeedbackRoom = playingRoom();
  actorFeedbackRoom.stateVersion = 5;
  actorFeedbackRoom.latestResolution = {
    feedback: {
      sequence: 1,
      actorId: "player-1",
      defenderId: "player-2",
      defenderIds: ["player-2"],
      actionType: Data.ACTION_TYPES.DESTROYER_I_RAM,
      actionName: "驱逐舰Ⅰ冲撞",
      target: { kind: "cell", coordinate: "A1" },
      result: "hit",
      ownDamage: [],
      receivedHits: [],
      inflictedDamage: [{
        unitType: Data.UNIT_TYPES.AIRCRAFT_CARRIER,
        beforeHp: 6,
        appliedDamage: 1,
        afterHp: 5,
      }],
    },
  };
  socket.serverEmit("room:state", actorFeedbackRoom);
  const attackerToast = window.document.querySelector("#toast-region").lastElementChild;
  assert.match(attackerToast.textContent, /A1 命中/);
  assert.equal(attackerToast.textContent.includes("航空母舰"), false);
  assert.equal(attackerToast.textContent.includes("生命值"), false);
  assert.equal(window.document.querySelector(".resolution-strip").textContent.includes("航空母舰"), false);

  const defenderFeedbackRoom = playingRoom();
  defenderFeedbackRoom.stateVersion = 6;
  defenderFeedbackRoom.latestResolution = {
    feedback: {
      sequence: 2,
      actorId: "player-2",
      defenderId: "player-1",
      defenderIds: ["player-1"],
      actionType: Data.ACTION_TYPES.DESTROYER_I_RAM,
      actionName: "驱逐舰Ⅰ冲撞",
      target: { kind: "cell", coordinate: "G5" },
      result: "hit",
      ownDamage: [],
      receivedHits: [{
        unitId: "carrier",
        unitType: Data.UNIT_TYPES.AIRCRAFT_CARRIER,
        beforeHp: 6,
        appliedDamage: 1,
        afterHp: 5,
        sunk: false,
      }],
    },
  };
  socket.serverEmit("room:state", defenderFeedbackRoom);
  const defenderToast = window.document.querySelector("#toast-region").lastElementChild;
  assert.match(defenderToast.textContent, /航空母舰被命中，生命值 6 → 5/);

  const nuclearFeedbackRoom = playingRoom();
  nuclearFeedbackRoom.stateVersion = 7;
  nuclearFeedbackRoom.latestResolution = {
    feedback: {
      sequence: 3,
      actorId: "player-1",
      defenderId: "player-2",
      defenderIds: ["player-2"],
      actionType: Data.ACTION_TYPES.NUCLEAR_BOMB,
      actionName: "核弹",
      target: { kind: "cell", coordinate: "G5" },
      result: null,
      ownDamage: [],
      receivedHits: [],
      inflictedDamage: [{
        unitType: Data.UNIT_TYPES.AIRCRAFT_CARRIER,
        beforeHp: 6,
        appliedDamage: 2,
        afterHp: 4,
      }],
    },
  };
  socket.serverEmit("room:state", nuclearFeedbackRoom);
  const nuclearToast = window.document.querySelector("#toast-region").lastElementChild;
  assert.match(nuclearToast.textContent, /命中结果不会向你显示/);
  assert.equal(nuclearToast.textContent.includes("生命值"), false);

  socket.serverEmit("room:state", threePlayerPlayingRoom());
  assert.equal(window.document.querySelectorAll(".battle-map-card .ocean-board").length, 3);
  assert.equal(
    window.document.querySelectorAll('[data-action="select-marker-tool"]').length,
    10,
  );
  for (const board of window.document.querySelectorAll(".battle-map-card .ocean-board")) {
    assertBoardCoordinateAlignment(board);
  }
  click(window, window.document.querySelector(
    `[data-action="select-action"][data-action-type="${Data.ACTION_TYPES.RADAR_SCAN}"]`,
  ));
  click(window, window.document.querySelector(
    '.battle-map-card--enemy[data-player-id="player-2"] [data-action="enemy-cell"][data-coordinate="A1"]',
  ));
  assert.equal(
    window.document.querySelectorAll(
      '.battle-map-card--enemy [data-action="enemy-cell"].board-cell--target-preview',
    ).length,
    32,
  );
  assert.match(window.document.querySelector("#confirm-body").textContent, /乙、丙（同时生效）/);
  assert.match(window.document.querySelector("#confirm-body").textContent, /自损只结算一次/);
  click(window, window.document.querySelector("#confirm-cancel"));

  let dynamicStateVersion = 9;
  for (const mapSize of [10, 15]) {
    const mapRules = Data.createMapRules(mapSize);
    const deployment = baseRoom({
      stateVersion: dynamicStateVersion++,
      roomPhase: "DEPLOYING",
      mapSize,
      mapRules,
      seats: [
        { playerId: "player-1", nickname: "甲", online: true, ready: false, autoPrepared: false },
        { playerId: "player-2", nickname: "乙", online: true, ready: false, autoPrepared: false },
      ],
      deadlines: {
        deploymentDeadlineAt: 190_000,
        actionDeadlineAt: null,
        reconnectDeadlineAtByPlayer: {},
      },
    });
    socket.serverEmit("room:state", deployment);
    assertBoardCoordinateAlignment(
      window.document.querySelector(".deployment-map-card .ocean-board"),
      mapSize,
    );

    const online = playingRoom();
    online.stateVersion = dynamicStateVersion++;
    online.mapSize = mapSize;
    online.mapRules = mapRules;
    socket.serverEmit("room:state", online);
    assert.equal(window.document.querySelectorAll(".battle-map-card .ocean-board").length, 2);
    for (const board of window.document.querySelectorAll(".battle-map-card .ocean-board")) {
      assertBoardCoordinateAlignment(board, mapSize);
    }

    const bot = playingRoom();
    bot.stateVersion = dynamicStateVersion++;
    bot.roomMode = "bot_duel";
    bot.mapSize = mapSize;
    bot.mapRules = mapRules;
    bot.seats[0].isBot = false;
    bot.seats[1].isBot = true;
    socket.serverEmit("room:state", bot);
    assert.equal(window.document.querySelectorAll(".battle-map-card .ocean-board").length, 2);
    for (const board of window.document.querySelectorAll(".battle-map-card .ocean-board")) {
      assertBoardCoordinateAlignment(board, mapSize);
    }

    const threePlayer = threePlayerPlayingRoom();
    threePlayer.stateVersion = dynamicStateVersion++;
    threePlayer.mapSize = mapSize;
    threePlayer.mapRules = mapRules;
    socket.serverEmit("room:state", threePlayer);
    assert.equal(window.document.querySelectorAll(".battle-map-card .ocean-board").length, 3);
    for (const board of window.document.querySelectorAll(".battle-map-card .ocean-board")) {
      assertBoardCoordinateAlignment(board, mapSize);
    }
  }

  const paused = playingRoom();
  paused.stateVersion = dynamicStateVersion++;
  paused.connectionPhase = "PAUSED_ONE_OFFLINE";
  paused.seats[1].online = false;
  paused.connection = {
    offlinePlayerIds: ["player-2"],
    pausedTimer: { kind: "action", remainingMs: 45_000 },
  };
  paused.deadlines.actionDeadlineAt = null;
  paused.deadlines.reconnectDeadlineAtByPlayer = {
    "player-2": 130_000,
  };
  socket.serverEmit("room:state", paused);
  assert.equal(window.document.querySelector("#blocking-overlay").hidden, false);
  assert.match(window.document.querySelector(".pause-card").textContent, /乙 已断线/);
  assert.match(window.document.querySelector(".pause-card").textContent, /投降并离开/);

  const resumed = playingRoom();
  resumed.stateVersion = dynamicStateVersion++;
  socket.serverEmit("room:state", resumed);
  assert.equal(window.document.querySelector("#blocking-overlay").hidden, true);

  const replayOne = createSnapshot();
  const replayTwo = createSnapshot();
  const finished = playingRoom();
  finished.stateVersion = dynamicStateVersion++;
  finished.roomPhase = "FINISHED";
  finished.turnPhase = null;
  finished.turn = null;
  finished.deadlines.actionDeadlineAt = null;
  finished.matchSummary = {
    startedAt: 1_000,
    finishedAt: 61_000,
    durationMs: 60_000,
    turnCount: 8,
  };
  finished.battle.match = {
    status: "finished",
    result: {
      outcome: "win",
      winnerId: "player-1",
      loserId: "player-2",
      reason: "aircraft_carrier_sunk",
      trigger: { kind: "action" },
    },
  };
  finished.battle.own.actionsLocked = true;
  finished.battle.own.actionAvailability = [];
  finished.battle.replay = {
    players: { "player-1": replayOne, "player-2": replayTwo },
    actionLog: [],
    finalSalvo: null,
  };
  socket.serverEmit("room:state", finished);
  assert.match(window.document.querySelector("#result-title").textContent, /胜利/);
  assert.equal(window.document.querySelectorAll(".replay-tabs button").length, 2);
  assert.equal(window.document.querySelectorAll(".replay-resources span").length, 6);

  socket.serverEmit("room:state", baseRoom({
    stateVersion: dynamicStateVersion++,
    roomPhase: "CLOSED",
    closedReason: "disconnect_timeout_before_match",
  }));
  assert.match(window.document.querySelector("#app").textContent, /本房间已关闭/);
  assert.match(window.document.querySelector("#app").textContent, /120 秒/);
});
