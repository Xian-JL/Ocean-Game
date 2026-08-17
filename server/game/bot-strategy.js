"use strict";

const { ACTION_TYPES } = require("./actions");
const {
  BOARD_SIZE,
  ROW_LABELS,
  formatCoordinate,
  parseCoordinate,
} = require("./coordinates");
const {
  getDestroyerIRange,
  getDestroyerIIRange,
  getRadarArea,
  getDetectionArea,
  getShockArea,
  getFullRow,
  getFullColumn,
} = require("./ranges");
const { DEPLOYABLE_TYPES } = require("./units");
const { RuleValidationError } = require("./errors");

const ALL_CELLS = Object.freeze(
  Array.from({ length: BOARD_SIZE }, (_value, row) =>
    Array.from({ length: BOARD_SIZE }, (_cell, column) =>
      formatCoordinate({ row, column }),
    ),
  ).flat(),
);

function fail(code, message, details = {}) {
  throw new RuleValidationError(code, message, details);
}

function randomJitter(random, scale = 1) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    fail("INVALID_RANDOM_VALUE", "机器人随机值必须位于 [0, 1)。", { value });
  }
  return (value - 0.5) * scale;
}

function getOpponentId(view) {
  return view.turn?.remainingTargetPlayerIds?.[0] ??
    view.battle?.opponentId ??
    view.battle?.opponent?.id ??
    null;
}

function getEnemyMap(view, opponentId) {
  return view.battle?.own?.enemyMapsByPlayer?.[opponentId] ??
    view.battle?.own?.enemyMap ?? {
      cellResults: {},
      submarineMissileMarkers: [],
      nuclearBombMarkers: [],
      destroyerTargetCells: [],
    };
}

function neighbours(coordinate, distance = 1) {
  const point = parseCoordinate(coordinate);
  return [
    { row: point.row - distance, column: point.column },
    { row: point.row + distance, column: point.column },
    { row: point.row, column: point.column - distance },
    { row: point.row, column: point.column + distance },
  ]
    .filter(
      (item) =>
        item.row >= 0 && item.row < BOARD_SIZE &&
        item.column >= 0 && item.column < BOARD_SIZE,
    )
    .map(formatCoordinate);
}

function buildKnowledge(view, opponentId) {
  const enemyMap = getEnemyMap(view, opponentId);
  const general = Object.fromEntries(ALL_CELLS.map((cell) => [cell, 1]));
  const surface = Object.fromEntries(ALL_CELLS.map((cell) => [cell, 1]));
  const underwater = Object.fromEntries(ALL_CELLS.map((cell) => [cell, 1]));
  const attempted = new Set([
    ...(enemyMap.submarineMissileMarkers ?? []),
    ...(enemyMap.nuclearBombMarkers ?? []),
  ]);

  for (const area of view.battle?.own?.intelligenceAreas ?? []) {
    if (area.defenderId && area.defenderId !== opponentId) continue;
    if (area.kind === "radar") {
      for (const cell of area.area) {
        general[cell] += area.detected ? 3.5 : -4;
        surface[cell] += area.detected ? 2 : -4;
        underwater[cell] += area.detected ? 2 : -4;
      }
    }
    if (area.kind === "detection") {
      for (const cell of area.area) {
        underwater[cell] += area.detected ? 4 : -4;
        surface[cell] += area.detected ? -0.3 : 0.8;
        general[cell] += area.detected ? 1.5 : 0;
      }
    }
  }

  for (const [cell, result] of Object.entries(enemyMap.cellResults ?? {})) {
    if (result === "hit") {
      general[cell] = -100;
      surface[cell] = -100;
      underwater[cell] = -100;
      for (const adjacent of neighbours(cell, 1)) {
        general[adjacent] += 7;
        surface[adjacent] += 5;
        underwater[adjacent] += 3;
      }
      for (const extension of neighbours(cell, 2)) {
        general[extension] += 3;
        surface[extension] += 2;
        underwater[extension] += 1;
      }
    } else if (result === "miss") {
      general[cell] = -80;
      surface[cell] = -80;
      underwater[cell] = -40;
    }
  }

  for (const cell of attempted) {
    general[cell] -= 2.5;
    surface[cell] -= 2;
    underwater[cell] -= 2;
  }

  return { general, surface, underwater, attempted, enemyMap };
}

function legalCenterTargets(kind) {
  const offset = kind === "radar" ? 0 : kind === "detection" ? 1 : 2;
  const size = kind === "radar" ? 4 : kind === "detection" ? 3 : 5;
  const targets = [];
  for (let row = offset; row <= BOARD_SIZE - size + offset; row += 1) {
    for (let column = offset; column <= BOARD_SIZE - size + offset; column += 1) {
      targets.push(formatCoordinate({ row, column }));
    }
  }
  return targets;
}

function areaFor(actionType, coordinate) {
  if (actionType === ACTION_TYPES.RADAR_SCAN) return getRadarArea(coordinate);
  if (actionType === ACTION_TYPES.DETECTION_BOMB) return getDetectionArea(coordinate);
  return getShockArea(coordinate);
}

function unitById(view, sourceId) {
  return (view.battle?.own?.units ?? []).find((unit) => unit.id === sourceId) ?? null;
}

function candidatesFor(view, availability) {
  const source = unitById(view, availability.sourceId);
  switch (availability.actionType) {
    case ACTION_TYPES.DESTROYER_I_RAM:
      return source ? getDestroyerIRange(source.cells).map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: [coordinate],
      })) : [];
    case ACTION_TYPES.DESTROYER_II_RAM:
      return source ? getDestroyerIIRange(source.cells).map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: [coordinate],
      })) : [];
    case ACTION_TYPES.RADAR_SCAN:
      return legalCenterTargets("radar").map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: areaFor(availability.actionType, coordinate),
      }));
    case ACTION_TYPES.DETECTION_BOMB:
      return legalCenterTargets("detection").map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: areaFor(availability.actionType, coordinate),
      }));
    case ACTION_TYPES.SHOCK_BOMB:
      return legalCenterTargets("shock").map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: areaFor(availability.actionType, coordinate),
      }));
    case ACTION_TYPES.HELICOPTER_STRAFE:
      return [
        ...ROW_LABELS.map((row) => ({
          target: { kind: "row", row },
          cells: getFullRow(row),
        })),
        ...Array.from({ length: BOARD_SIZE }, (_value, index) => index + 1)
          .map((column) => ({
            target: { kind: "column", column },
            cells: getFullColumn(column),
          })),
      ];
    default:
      return ALL_CELLS.map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: [coordinate],
      }));
  }
}

function actionBaseScore(actionType, view, knowledge) {
  const ownUnits = view.battle?.own?.units ?? [];
  const carrierHp = ownUnits.find(
    (unit) => unit.type === DEPLOYABLE_TYPES.AIRCRAFT_CARRIER,
  )?.hp ?? 0;
  const positiveUnderwaterIntel = (view.battle?.own?.intelligenceAreas ?? [])
    .some((area) => area.kind === "detection" && area.detected === true);
  const scores = {
    [ACTION_TYPES.RADAR_SCAN]: 1000,
    [ACTION_TYPES.HELICOPTER_STRAFE]: 85,
    [ACTION_TYPES.DETECTION_BOMB]: 62,
    [ACTION_TYPES.NUCLEAR_BOMB]: 58,
    [ACTION_TYPES.SHOCK_BOMB]: positiveUnderwaterIntel ? 60 : 26,
    [ACTION_TYPES.PIRATE_ATTACK]: carrierHp <= 0.5 ? -40 : carrierHp <= 1 ? 12 : 48,
    [ACTION_TYPES.SUBMARINE_MISSILE]: 43,
    [ACTION_TYPES.DESTROYER_I_RAM]: 39,
    [ACTION_TYPES.DESTROYER_II_RAM]: 39,
    [ACTION_TYPES.MOTORBOAT_RAM]: 34,
  };
  const attemptedCount = knowledge.attempted.size;
  return (scores[actionType] ?? 10) - attemptedCount * 0.015;
}

function candidateScore(actionType, candidate, knowledge, random) {
  let layer = knowledge.general;
  if ([ACTION_TYPES.MOTORBOAT_RAM, ACTION_TYPES.HELICOPTER_STRAFE]
    .includes(actionType)) layer = knowledge.surface;
  if ([ACTION_TYPES.DETECTION_BOMB, ACTION_TYPES.SHOCK_BOMB]
    .includes(actionType)) layer = knowledge.underwater;

  let score = candidate.cells.reduce((sum, cell) => sum + (layer[cell] ?? 0), 0);
  if (actionType === ACTION_TYPES.RADAR_SCAN) {
    const known = candidate.cells.filter(
      (cell) => (knowledge.general[cell] ?? 1) <= -3,
    ).length;
    score = candidate.cells.length - known;
  }
  if (actionType === ACTION_TYPES.DETECTION_BOMB) {
    score += candidate.cells.filter(
      (cell) => !Object.hasOwn(knowledge.enemyMap.cellResults ?? {}, cell),
    ).length * 0.5;
  }
  return score + randomJitter(random, 2.5);
}

function chooseHighest(items, scoreOf) {
  let best = null;
  let bestScore = -Infinity;
  for (const item of items) {
    const score = scoreOf(item);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best === null ? null : { item: best, score: bestScore };
}

function createBotActionIntent(view, options = {}) {
  const random = options.random ?? Math.random;
  const opponentId = getOpponentId(view);
  if (!opponentId || !view.turn?.canAct) {
    fail("BOT_CANNOT_ACT", "机器人当前没有可执行的正常行动。");
  }
  const knowledge = buildKnowledge(view, opponentId);
  const legalActions = (view.battle?.own?.actionAvailability ?? [])
    .filter((item) => item.available);
  if (legalActions.length === 0) {
    fail("BOT_NO_LEGAL_ACTION", "机器人当前没有合法行动。");
  }

  let best = null;
  for (const availability of legalActions) {
    let candidates = candidatesFor(view, availability);
    if ([ACTION_TYPES.DESTROYER_I_RAM, ACTION_TYPES.DESTROYER_II_RAM]
      .includes(availability.actionType)) {
      const used = new Set(knowledge.enemyMap.destroyerTargetCells ?? []);
      candidates = candidates.filter(
        (candidate) => !used.has(candidate.target.coordinate),
      );
    }
    if (candidates.length === 0) continue;
    const targetChoice = chooseHighest(
      candidates,
      (candidate) => candidateScore(
        availability.actionType,
        candidate,
        knowledge,
        random,
      ),
    );
    if (!targetChoice) continue;
    const total = actionBaseScore(
      availability.actionType,
      view,
      knowledge,
    ) + targetChoice.score + randomJitter(random, 4);
    if (!best || total > best.total) {
      best = { availability, candidate: targetChoice.item, total };
    }
  }

  if (!best) {
    fail("BOT_NO_LEGAL_TARGET", "机器人找不到合法目标。");
  }
  return {
    actionId: options.actionId ?? `bot-${view.stateVersion}`,
    actionType: best.availability.actionType,
    sourceId: best.availability.sourceId,
    targetPlayerId: opponentId,
    target: best.candidate.target,
  };
}

function chooseBotFinalSalvo(view, random = Math.random) {
  const finalSalvo = view.battle?.match?.finalSalvo;
  if (!finalSalvo || finalSalvo.status !== "selecting" || finalSalvo.ownSubmitted) {
    fail("BOT_FINAL_SALVO_NOT_AVAILABLE", "机器人当前不能提交终局鱼雷。");
  }
  const available = new Set(finalSalvo.availableDecoyIds ?? []);
  const decoys = (view.battle?.own?.decoys ?? []).filter(
    (decoy) => available.has(decoy.id),
  );
  if (decoys.length === 0) return null;
  const opponentId = view.battle?.opponentId;
  const knowledge = buildKnowledge(view, opponentId);
  const choice = chooseHighest(
    decoys,
    (decoy) => (knowledge.general[decoy.cell] ?? 0) + randomJitter(random, 2),
  );
  return choice?.item.id ?? decoys[0].id;
}

module.exports = {
  buildKnowledge,
  chooseBotFinalSalvo,
  createBotActionIntent,
};
