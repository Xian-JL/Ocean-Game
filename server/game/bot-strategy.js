"use strict";

const { ACTION_TYPES } = require("./actions");
const {
  formatCoordinate,
  parseCoordinate,
} = require("./coordinates");
const { DEFAULT_MAP_RULES, createMapRules } = require("./map-rules");
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
const {
  BOT_DIFFICULTIES,
  DEFAULT_BOT_DIFFICULTY,
  normalizeBotDifficulty,
} = require("./bot-difficulty");

function rulesForView(view) {
  return view?.mapRules?.mapSize
    ? createMapRules(view.mapRules.mapSize)
    : DEFAULT_MAP_RULES;
}

function allCells(mapRules) {
  return Array.from({ length: mapRules.boardSize }, (_value, row) =>
    Array.from({ length: mapRules.boardSize }, (_cell, column) =>
      formatCoordinate({ row, column }, mapRules),
    ),
  ).flat();
}

function fail(code, message, details = {}) {
  throw new RuleValidationError(code, message, details);
}

function readRandom(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    fail("INVALID_RANDOM_VALUE", "机器人随机值必须位于 [0, 1)。", { value });
  }
  return value;
}

function randomJitter(random, scale = 1) {
  const value = readRandom(random);
  return (value - 0.5) * scale;
}

function randomChoice(items, random) {
  if (items.length === 0) return null;
  return items[Math.floor(readRandom(random) * items.length)];
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

function neighbours(coordinate, distance = 1, mapRules = DEFAULT_MAP_RULES) {
  const point = parseCoordinate(coordinate, mapRules);
  return [
    { row: point.row - distance, column: point.column },
    { row: point.row + distance, column: point.column },
    { row: point.row, column: point.column - distance },
    { row: point.row, column: point.column + distance },
  ]
    .filter(
      (item) =>
        item.row >= 0 && item.row < mapRules.boardSize &&
        item.column >= 0 && item.column < mapRules.boardSize,
    )
    .map((item) => formatCoordinate(item, mapRules));
}

function buildKnowledge(view, opponentId) {
  const mapRules = rulesForView(view);
  const cells = allCells(mapRules);
  const enemyMap = getEnemyMap(view, opponentId);
  const general = Object.fromEntries(cells.map((cell) => [cell, 1]));
  const surface = Object.fromEntries(cells.map((cell) => [cell, 1]));
  const underwater = Object.fromEntries(cells.map((cell) => [cell, 1]));
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
      for (const adjacent of neighbours(cell, 1, mapRules)) {
        general[adjacent] += 7;
        surface[adjacent] += 5;
        underwater[adjacent] += 3;
      }
      for (const extension of neighbours(cell, 2, mapRules)) {
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

function enhanceExpertKnowledge(view, opponentId) {
  const mapRules = rulesForView(view);
  const base = buildKnowledge(view, opponentId);
  const general = { ...base.general };
  const surface = { ...base.surface };
  const underwater = { ...base.underwater };
  const areas = (view.battle?.own?.intelligenceAreas ?? [])
    .filter((area) => !area.defenderId || area.defenderId === opponentId);

  for (const area of areas) {
    if (area.kind === "radar" && area.detected === false) {
      for (const cell of area.area) {
        general[cell] = -160;
        surface[cell] = -160;
        underwater[cell] = -160;
      }
    }
    if (area.kind === "detection") {
      for (const cell of area.area) {
        if (area.detected === false) {
          underwater[cell] = -150;
        } else {
          underwater[cell] = Math.max(underwater[cell], 9);
          general[cell] += 2;
        }
      }
    }
  }

  for (const coordinate of allCells(mapRules)) {
    if ((general[coordinate] ?? 0) <= -50) continue;
    const point = parseCoordinate(coordinate, mapRules);
    const edgeDistance = Math.min(
      point.row,
      point.column,
      mapRules.boardSize - point.row - 1,
      mapRules.boardSize - point.column - 1,
    );
    const centrality = Math.min(edgeDistance, 3) * 0.18;
    general[coordinate] += centrality;
    surface[coordinate] += centrality;
    underwater[coordinate] += centrality;
  }

  const hits = Object.entries(base.enemyMap.cellResults ?? {})
    .filter(([, result]) => result === "hit")
    .map(([coordinate]) => parseCoordinate(coordinate, mapRules));
  for (let leftIndex = 0; leftIndex < hits.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < hits.length; rightIndex += 1) {
      const left = hits[leftIndex];
      const right = hits[rightIndex];
      const sameRow = left.row === right.row;
      const sameColumn = left.column === right.column;
      if (!sameRow && !sameColumn) continue;
      const distance = sameRow
        ? Math.abs(left.column - right.column)
        : Math.abs(left.row - right.row);
      if (distance !== 1) continue;
      const extensions = sameRow
        ? [
            { row: left.row, column: Math.min(left.column, right.column) - 1 },
            { row: left.row, column: Math.max(left.column, right.column) + 1 },
          ]
        : [
            { row: Math.min(left.row, right.row) - 1, column: left.column },
            { row: Math.max(left.row, right.row) + 1, column: left.column },
          ];
      for (const point of extensions) {
        if (
          point.row < 0 || point.row >= mapRules.boardSize ||
          point.column < 0 || point.column >= mapRules.boardSize
        ) continue;
        const coordinate = formatCoordinate(point, mapRules);
        if ((general[coordinate] ?? -100) <= -50) continue;
        general[coordinate] += 18;
        surface[coordinate] += 14;
        underwater[coordinate] += 8;
      }
    }
  }

  return {
    ...base,
    general,
    surface,
    underwater,
    hasPositiveUnderwaterIntel: areas.some(
      (area) => area.kind === "detection" && area.detected === true,
    ),
    scannedRadarCells: new Set(
      areas.filter((area) => area.kind === "radar").flatMap((area) => area.area),
    ),
    scannedDetectionCells: new Set(
      areas.filter((area) => area.kind === "detection").flatMap((area) => area.area),
    ),
  };
}

function legalCenterTargets(kind, mapRules) {
  const size = kind === "radar"
    ? mapRules.radarSize
    : kind === "detection"
      ? mapRules.detectionSize
      : mapRules.shockSize;
  const offset = kind === "radar" ? 0 : Math.floor(size / 2);
  const targets = [];
  for (let row = offset; row <= mapRules.boardSize - size + offset; row += 1) {
    for (let column = offset; column <= mapRules.boardSize - size + offset; column += 1) {
      targets.push(formatCoordinate({ row, column }, mapRules));
    }
  }
  return targets;
}

function areaFor(actionType, coordinate, mapRules) {
  if (actionType === ACTION_TYPES.RADAR_SCAN) return getRadarArea(coordinate, mapRules);
  if (actionType === ACTION_TYPES.DETECTION_BOMB) return getDetectionArea(coordinate, mapRules);
  return getShockArea(coordinate, mapRules);
}

function unitById(view, sourceId) {
  return (view.battle?.own?.units ?? []).find((unit) => unit.id === sourceId) ?? null;
}

function candidatesFor(view, availability) {
  const mapRules = rulesForView(view);
  const source = unitById(view, availability.sourceId);
  switch (availability.actionType) {
    case ACTION_TYPES.DESTROYER_I_RAM:
      return source ? getDestroyerIRange(source.cells, mapRules).map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: [coordinate],
      })) : [];
    case ACTION_TYPES.DESTROYER_II_RAM:
      return source ? getDestroyerIIRange(source.cells, mapRules).map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: [coordinate],
      })) : [];
    case ACTION_TYPES.RADAR_SCAN:
      return legalCenterTargets("radar", mapRules).map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: areaFor(availability.actionType, coordinate, mapRules),
      }));
    case ACTION_TYPES.DETECTION_BOMB:
      return legalCenterTargets("detection", mapRules).map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: areaFor(availability.actionType, coordinate, mapRules),
      }));
    case ACTION_TYPES.SHOCK_BOMB:
      return legalCenterTargets("shock", mapRules).map((coordinate) => ({
        target: { kind: "cell", coordinate },
        cells: areaFor(availability.actionType, coordinate, mapRules),
      }));
    case ACTION_TYPES.HELICOPTER_STRAFE:
      return [
        ...mapRules.rowLabels.split("").map((row) => ({
          target: { kind: "row", row },
          cells: getFullRow(row, mapRules),
        })),
        ...Array.from({ length: mapRules.boardSize }, (_value, index) => index + 1)
          .map((column) => ({
            target: { kind: "column", column },
            cells: getFullColumn(column, mapRules),
          })),
      ];
    default:
      return allCells(mapRules).map((coordinate) => ({
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

function expertActionBaseScore(actionType, view, knowledge) {
  const ownUnits = view.battle?.own?.units ?? [];
  const carrierHp = ownUnits.find(
    (unit) => unit.type === DEPLOYABLE_TYPES.AIRCRAFT_CARRIER,
  )?.hp ?? 0;
  const hasHitLead = Object.values(knowledge.enemyMap.cellResults ?? {})
    .includes("hit");
  const hasDetection = knowledge.hasPositiveUnderwaterIntel === true;
  return {
    [ACTION_TYPES.RADAR_SCAN]: 1000,
    [ACTION_TYPES.HELICOPTER_STRAFE]: 92,
    [ACTION_TYPES.DETECTION_BOMB]: hasDetection ? 34 : 76,
    [ACTION_TYPES.NUCLEAR_BOMB]: hasHitLead ? 82 : 54,
    [ACTION_TYPES.SHOCK_BOMB]: hasDetection ? 96 : 18,
    [ACTION_TYPES.PIRATE_ATTACK]: carrierHp <= 0.5 ? -80 : carrierHp <= 1 ? 4 : 58,
    [ACTION_TYPES.SUBMARINE_MISSILE]: hasHitLead ? 59 : 46,
    [ACTION_TYPES.DESTROYER_I_RAM]: 52,
    [ACTION_TYPES.DESTROYER_II_RAM]: 52,
    [ACTION_TYPES.MOTORBOAT_RAM]: 33,
  }[actionType] ?? 10;
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

function expertCandidateScore(actionType, candidate, knowledge, random) {
  let layer = knowledge.general;
  if ([ACTION_TYPES.MOTORBOAT_RAM, ACTION_TYPES.HELICOPTER_STRAFE]
    .includes(actionType)) layer = knowledge.surface;
  if ([ACTION_TYPES.DETECTION_BOMB, ACTION_TYPES.SHOCK_BOMB]
    .includes(actionType)) layer = knowledge.underwater;

  let score = candidate.cells.reduce((sum, cell) => sum + (layer[cell] ?? 0), 0);
  if (actionType === ACTION_TYPES.RADAR_SCAN) {
    score = candidate.cells.reduce(
      (sum, cell) => sum + (knowledge.scannedRadarCells.has(cell) ? -2 : 1),
      0,
    );
  }
  if (actionType === ACTION_TYPES.DETECTION_BOMB) {
    score += candidate.cells.reduce(
      (sum, cell) => sum + (knowledge.scannedDetectionCells.has(cell) ? -2 : 1.2),
      0,
    );
  }
  if ([ACTION_TYPES.SUBMARINE_MISSILE, ACTION_TYPES.NUCLEAR_BOMB]
    .includes(actionType) && knowledge.attempted.has(candidate.target.coordinate)) {
    score -= 12;
  }
  return score + randomJitter(random, 0.35);
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

function eligibleCandidates(view, availability, knowledge) {
  let candidates = candidatesFor(view, availability);
  if ([ACTION_TYPES.DESTROYER_I_RAM, ACTION_TYPES.DESTROYER_II_RAM]
    .includes(availability.actionType)) {
    const used = new Set(knowledge?.enemyMap?.destroyerTargetCells ?? []);
    candidates = candidates.filter(
      (candidate) => !used.has(candidate.target.coordinate),
    );
  }
  return candidates;
}

function createBeginnerIntent(view, legalActions, opponentId, random, actionId) {
  const choices = legalActions
    .map((availability) => ({
      availability,
      candidates: eligibleCandidates(view, availability, {
        enemyMap: getEnemyMap(view, opponentId),
      }),
    }))
    .filter((choice) => choice.candidates.length > 0);
  const choice = randomChoice(choices, random);
  if (!choice) {
    fail("BOT_NO_LEGAL_TARGET", "机器人找不到合法目标。");
  }
  const candidate = randomChoice(choice.candidates, random);
  return {
    actionId,
    actionType: choice.availability.actionType,
    sourceId: choice.availability.sourceId,
    targetPlayerId: opponentId,
    target: candidate.target,
  };
}

function createBotActionIntent(view, options = {}) {
  const random = options.random ?? Math.random;
  const difficulty = normalizeBotDifficulty(
    options.difficulty ?? view.botDifficulty ?? DEFAULT_BOT_DIFFICULTY,
  );
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

  const actionId = options.actionId ?? `bot-${view.stateVersion}`;
  if (difficulty === BOT_DIFFICULTIES.BEGINNER) {
    return createBeginnerIntent(
      view,
      legalActions,
      opponentId,
      random,
      actionId,
    );
  }

  const scoredKnowledge = difficulty === BOT_DIFFICULTIES.EXPERT
    ? enhanceExpertKnowledge(view, opponentId)
    : knowledge;

  let best = null;
  for (const availability of legalActions) {
    const candidates = eligibleCandidates(view, availability, scoredKnowledge);
    if (candidates.length === 0) continue;
    const targetChoice = chooseHighest(
      candidates,
      (candidate) => difficulty === BOT_DIFFICULTIES.EXPERT
        ? expertCandidateScore(
            availability.actionType,
            candidate,
            scoredKnowledge,
            random,
          )
        : candidateScore(
            availability.actionType,
            candidate,
            scoredKnowledge,
            random,
          ),
    );
    if (!targetChoice) continue;
    const baseScore = difficulty === BOT_DIFFICULTIES.EXPERT
      ? expertActionBaseScore(availability.actionType, view, scoredKnowledge)
      : actionBaseScore(availability.actionType, view, scoredKnowledge);
    const total = baseScore + targetChoice.score + randomJitter(
      random,
      difficulty === BOT_DIFFICULTIES.EXPERT ? 0.5 : 4,
    );
    if (!best || total > best.total) {
      best = { availability, candidate: targetChoice.item, total };
    }
  }

  if (!best) {
    fail("BOT_NO_LEGAL_TARGET", "机器人找不到合法目标。");
  }
  return {
    actionId,
    actionType: best.availability.actionType,
    sourceId: best.availability.sourceId,
    targetPlayerId: opponentId,
    target: best.candidate.target,
  };
}

function chooseBotFinalSalvo(view, options = {}) {
  const normalizedOptions = typeof options === "function"
    ? { random: options }
    : options;
  const random = normalizedOptions.random ?? Math.random;
  const difficulty = normalizeBotDifficulty(
    normalizedOptions.difficulty ?? view.botDifficulty ?? DEFAULT_BOT_DIFFICULTY,
  );
  const finalSalvo = view.battle?.match?.finalSalvo;
  if (!finalSalvo || finalSalvo.status !== "selecting" || finalSalvo.ownSubmitted) {
    fail("BOT_FINAL_SALVO_NOT_AVAILABLE", "机器人当前不能提交终局鱼雷。");
  }
  const available = new Set(finalSalvo.availableDecoyIds ?? []);
  const decoys = (view.battle?.own?.decoys ?? []).filter(
    (decoy) => available.has(decoy.id),
  );
  if (decoys.length === 0) return null;
  if (difficulty === BOT_DIFFICULTIES.BEGINNER) {
    return randomChoice(decoys, random).id;
  }
  const opponentId = view.battle?.opponentId;
  const knowledge = difficulty === BOT_DIFFICULTIES.EXPERT
    ? enhanceExpertKnowledge(view, opponentId)
    : buildKnowledge(view, opponentId);
  const choice = chooseHighest(
    decoys,
    (decoy) => (knowledge.general[decoy.cell] ?? 0) + randomJitter(
      random,
      difficulty === BOT_DIFFICULTIES.EXPERT ? 0.25 : 2,
    ),
  );
  return choice?.item.id ?? decoys[0].id;
}

module.exports = {
  buildKnowledge,
  enhanceExpertKnowledge,
  chooseBotFinalSalvo,
  createBotActionIntent,
};
