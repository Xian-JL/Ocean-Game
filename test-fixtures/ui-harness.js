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
  const children = [...board.children].filter(
    (child) => !child.classList.contains("tactical-unit-art-layer") &&
      !child.classList.contains("battle-effect-layer") &&
      !child.classList.contains("tactical-environment-layer"),
  );
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


module.exports={FakeSocket,baseRoom,createSnapshot,playingRoom,threePlayerPlayingRoom,click};
