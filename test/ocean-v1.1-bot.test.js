"use strict";

const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const test = require("node:test");
const { io: createSocketClient } = require("socket.io-client");
const { createOceanServer } = require("../server/app");
const { ACTION_TYPES } = require("../server/game/actions");
const {
  buildKnowledge,
  chooseBotFinalSalvo,
  createBotActionIntent,
} = require("../server/game/bot-strategy");
const { InMemoryRoomService } = require("../server/game/room-service");
const { ROOM_MODES } = require("../server/game/room");
const { CLIENT_EVENTS, SERVER_EVENTS } = require("../server/socket/protocol");
const { createValidDeployment } = require("../test-fixtures/valid-deployment");

const TEST_TIMEOUT_MS = 4_000;

function deterministicRandom(values = []) {
  const queue = [...values];
  return () => queue.length > 0 ? queue.shift() : 0.4;
}

function createService(options = {}) {
  const playerIds = ["human-1", "bot-1", "extra-human"];
  return new InMemoryRoomService({
    now: () => 1_000,
    roomCodeFactory: () => "BAT234",
    playerIdFactory: () => playerIds.shift(),
    random: options.random ?? deterministicRandom(),
    randomDeploymentFactory: () => createValidDeployment(),
  });
}

test("1v1 人机房间自动加入一个已部署机器人，并拒绝第三名真人", () => {
  const service = createService();
  const created = service.createRoom({
    nickname: "真人",
    maxPlayers: 2,
    roomMode: ROOM_MODES.BOT_DUEL,
  });
  assert.equal(created.view.roomMode, ROOM_MODES.BOT_DUEL);
  assert.equal(created.view.roomPhase, "DEPLOYING");
  assert.equal(created.view.seats.length, 2);
  const bot = created.view.seats.find((seat) => seat.isBot);
  assert.ok(bot);
  assert.equal(bot.nickname, "OCEAN 战术机器人");
  assert.equal(bot.ready, true);
  assert.equal(created.view.own.deployment, null);
  assert.throws(
    () => service.joinRoom({ roomCode: created.roomCode, nickname: "闯入者" }),
    (error) => ["ROOM_NOT_JOINABLE", "BOT_ROOM_NOT_JOINABLE"].includes(error.code),
  );
});

test("三人人机房间被明确拒绝，原有三人真人模式保持可创建", () => {
  const service = createService();
  assert.throws(
    () => service.createRoom({
      nickname: "真人",
      maxPlayers: 3,
      roomMode: ROOM_MODES.BOT_DUEL,
    }),
    (error) => error.code === "INVALID_BOT_PLAYER_COUNT",
  );
  const pvpService = createService();
  const created = pvpService.createRoom({
    nickname: "真人",
    maxPlayers: 3,
    roomMode: ROOM_MODES.PVP,
  });
  assert.equal(created.view.maxPlayers, 3);
  assert.equal(created.view.roomMode, ROOM_MODES.PVP);
});

function safeBotView() {
  const cells = {};
  return {
    stateVersion: 20,
    turn: {
      canAct: true,
      remainingTargetPlayerIds: ["human-1"],
    },
    battle: {
      opponentId: "human-1",
      own: {
        units: [
          { id: "carrier", type: "aircraft_carrier", cells: ["A1"], hp: 6 },
        ],
        decoys: [
          { id: "decoy-1", cell: "B2", destroyed: false },
          { id: "decoy-2", cell: "J10", destroyed: false },
        ],
        intelligenceAreas: [],
        enemyMap: {
          cellResults: cells,
          submarineMissileMarkers: [],
          nuclearBombMarkers: [],
          destroyerTargetCells: [],
        },
        enemyMapsByPlayer: {
          "human-1": {
            cellResults: cells,
            submarineMissileMarkers: [],
            nuclearBombMarkers: [],
            destroyerTargetCells: [],
          },
        },
        actionAvailability: [{
          actionType: ACTION_TYPES.RADAR_SCAN,
          sourceId: "carrier",
          available: true,
        }],
      },
      match: {
        finalSalvo: {
          status: "selecting",
          ownSubmitted: false,
          availableDecoyIds: ["decoy-1", "decoy-2"],
        },
      },
    },
  };
}

test("机器人决策只依赖安全视图，不会因附加隐藏部署变化而改变", () => {
  const first = safeBotView();
  const second = structuredClone(first);
  first.secretEnemyDeployment = [{ id: "carrier", cells: ["A1"] }];
  second.secretEnemyDeployment = [{ id: "carrier", cells: ["L12"] }];
  const intentA = createBotActionIntent(first, {
    random: deterministicRandom(Array(300).fill(0.25)),
    actionId: "bot-safe-a",
  });
  const intentB = createBotActionIntent(second, {
    random: deterministicRandom(Array(300).fill(0.25)),
    actionId: "bot-safe-a",
  });
  assert.deepEqual(intentA, intentB);
  assert.equal(intentA.actionType, ACTION_TYPES.RADAR_SCAN);
  assert.equal(buildKnowledge(first, "human-1").general.A1, 1);
});

test("机器人终局鱼雷只根据自己的可用鱼雷和安全情报选择", () => {
  const view = safeBotView();
  const copy = structuredClone(view);
  view.secretHumanSelection = "decoy-1";
  copy.secretHumanSelection = "decoy-3";
  assert.equal(
    chooseBotFinalSalvo(view, deterministicRandom([0.2, 0.8])),
    chooseBotFinalSalvo(copy, deterministicRandom([0.2, 0.8])),
  );
});

function emitWithAck(socket, eventName, payload = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${eventName} 未应答`)),
      TEST_TIMEOUT_MS,
    );
    socket.emit(eventName, payload, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

async function waitForState(states, predicate, message) {
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const found = [...states].reverse().find(predicate);
    if (found) return found;
    await delay(5);
  }
  assert.fail(message);
}

test("浏览器可完成人机创建、部署、掷骰，并由机器人自动完成首回合雷达", async (context) => {
  const service = createService({ random: deterministicRandom([0.9, 0.1]) });
  const server = createOceanServer({
    roomService: service,
    timerSweepMs: 0,
    phasePresentationMs: 0,
    rollResultExtraPresentationMs: 0,
    botThinkDelayMs: 0,
    logger: { error() {} },
  });
  server.httpServer.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.httpServer.once("listening", resolve);
    server.httpServer.once("error", reject);
  });
  const address = server.httpServer.address();
  const socket = createSocketClient(`http://127.0.0.1:${address.port}`, {
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });
  const states = [];
  socket.on(SERVER_EVENTS.STATE, (state) => states.push(state));
  context.after(async () => {
    socket.disconnect();
    if (server.httpServer.listening) {
      await new Promise((resolve) => server.io.close(resolve));
    }
  });
  await new Promise((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("connect_error", reject);
  });

  const created = await emitWithAck(socket, CLIENT_EVENTS.CREATE_ROOM, {
    nickname: "真人",
    maxPlayers: 2,
    roomMode: ROOM_MODES.BOT_DUEL,
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  const deploying = await waitForState(
    states,
    (state) => state.roomPhase === "DEPLOYING",
    "人机房间没有进入部署阶段",
  );
  assert.equal(deploying.seats.filter((seat) => seat.isBot).length, 1);

  let response = await emitWithAck(socket, CLIENT_EVENTS.SUBMIT_DEPLOYMENT, {
    deployment: createValidDeployment(),
    expectedVersion: states.at(-1).stateVersion,
  });
  assert.equal(response.ok, true, JSON.stringify(response));
  await waitForState(
    states,
    (state) => state.stateVersion >= response.data.stateVersion,
    "真人部署状态未同步",
  );
  response = await emitWithAck(socket, CLIENT_EVENTS.READY_DEPLOYMENT, {
    expectedVersion: states.at(-1).stateVersion,
  });
  assert.equal(response.ok, true, JSON.stringify(response));
  await waitForState(states, (state) => state.roomPhase === "ROLLING", "未进入掷骰阶段");
  response = await emitWithAck(socket, CLIENT_EVENTS.ROLL_DIE, {
    expectedVersion: states.at(-1).stateVersion,
  });
  assert.equal(response.ok, true, JSON.stringify(response));
  const playing = await waitForState(
    states,
    (state) => state.roomPhase === "PLAYING" && state.turn?.canAct,
    "人机房间未进入真人首回合",
  );
  response = await emitWithAck(socket, CLIENT_EVENTS.SUBMIT_ACTION, {
    expectedVersion: playing.stateVersion,
    intent: {
      actionId: "human-radar",
      actionType: ACTION_TYPES.RADAR_SCAN,
      sourceId: "carrier",
      targetPlayerId: playing.seats.find((seat) => seat.isBot).playerId,
      target: { kind: "cell", coordinate: "A1" },
    },
  });
  assert.equal(response.ok, true, JSON.stringify(response));
  const afterBot = await waitForState(
    states,
    (state) =>
      state.roomPhase === "PLAYING" &&
      state.turn?.canAct &&
      state.battle?.publicActionLog?.some(
        (record) =>
          record.actorId === state.seats.find((seat) => seat.isBot)?.playerId &&
          record.actionType === ACTION_TYPES.RADAR_SCAN,
      ),
    "机器人没有自动完成首回合雷达",
  );
  const botRecord = afterBot.battle.publicActionLog.find(
    (record) => record.actorId === afterBot.seats.find((seat) => seat.isBot).playerId,
  );
  assert.equal(botRecord.result, null, "真人不应看到机器人雷达的私人布尔结果");

  response = await emitWithAck(socket, CLIENT_EVENTS.SUBMIT_ACTION, {
    expectedVersion: afterBot.stateVersion,
    intent: {
      actionId: "human-follow-up",
      actionType: ACTION_TYPES.PIRATE_ATTACK,
      sourceId: "pirate",
      targetPlayerId: afterBot.seats.find((seat) => seat.isBot).playerId,
      target: { kind: "cell", coordinate: "L11" },
    },
  });
  assert.equal(response.ok, true, JSON.stringify(response));
  const secondBotTurn = await waitForState(
    states,
    (state) =>
      state.roomPhase === "PLAYING" &&
      state.turn?.canAct &&
      state.battle?.publicActionLog?.filter(
        (record) => record.actorId === state.seats.find((seat) => seat.isBot)?.playerId,
      ).length >= 2,
    "机器人没有自动完成第二个正常行动",
  );
  const botActions = secondBotTurn.battle.publicActionLog.filter(
    (record) => record.actorId === secondBotTurn.seats.find((seat) => seat.isBot).playerId,
  );
  assert.notEqual(botActions.at(-1).actionType, ACTION_TYPES.RADAR_SCAN);

  response = await emitWithAck(socket, CLIENT_EVENTS.SURRENDER_MATCH, {
    expectedVersion: secondBotTurn.stateVersion,
  });
  assert.equal(response.ok, true, JSON.stringify(response));
  const finished = await waitForState(
    states,
    (state) => state.roomPhase === "FINISHED",
    "真人投降后人机房间没有进入结算",
  );
  response = await emitWithAck(socket, CLIENT_EVENTS.REQUEST_REMATCH, {
    expectedVersion: finished.stateVersion,
  });
  assert.equal(response.ok, true, JSON.stringify(response));
  const rematch = await waitForState(
    states,
    (state) =>
      state.roomPhase === "DEPLOYING" &&
      state.matchSummary?.startedAt === null &&
      state.seats.find((seat) => seat.isBot)?.ready === true,
    "机器人没有自动确认再来一局并重新部署",
  );
  assert.equal(rematch.own.deployment, null);
});
