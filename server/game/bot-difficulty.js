"use strict";

const { RuleValidationError } = require("./errors");

const BOT_DIFFICULTIES = Object.freeze({
  BEGINNER: "beginner",
  STANDARD: "standard",
  EXPERT: "expert",
});

const DEFAULT_BOT_DIFFICULTY = BOT_DIFFICULTIES.STANDARD;

const BOT_DIFFICULTY_LABELS = Object.freeze({
  [BOT_DIFFICULTIES.BEGINNER]: "新手",
  [BOT_DIFFICULTIES.STANDARD]: "标准",
  [BOT_DIFFICULTIES.EXPERT]: "专家",
});

function normalizeBotDifficulty(value = DEFAULT_BOT_DIFFICULTY) {
  if (!Object.values(BOT_DIFFICULTIES).includes(value)) {
    throw new RuleValidationError(
      "INVALID_BOT_DIFFICULTY",
      "人机难度只能选择新手、标准或专家。",
      {
        botDifficulty: value,
        supportedBotDifficulties: Object.values(BOT_DIFFICULTIES),
      },
    );
  }
  return value;
}

function botDifficultyLabel(value) {
  return BOT_DIFFICULTY_LABELS[normalizeBotDifficulty(value)];
}

module.exports = {
  BOT_DIFFICULTIES,
  BOT_DIFFICULTY_LABELS,
  DEFAULT_BOT_DIFFICULTY,
  botDifficultyLabel,
  normalizeBotDifficulty,
};
