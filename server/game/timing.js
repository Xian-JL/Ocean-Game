"use strict";

const { RuleValidationError } = require("./errors");

const DEPLOYMENT_DURATION_MS = 180_000;
const ACTION_DURATION_MS = 90_000;
const MAX_CONSECUTIVE_ACTION_TIMEOUTS = 3;

function normalizeServerTime(nowMs = Date.now()) {
  if (!Number.isInteger(nowMs) || nowMs < 0) {
    throw new RuleValidationError(
      "INVALID_SERVER_TIME",
      "服务器时间必须是非负整数毫秒时间戳。",
      { nowMs },
    );
  }
  return nowMs;
}

function createDeadline(nowMs, durationMs) {
  const normalizedNow = normalizeServerTime(nowMs);
  if (!Number.isInteger(durationMs) || durationMs <= 0) {
    throw new RuleValidationError(
      "INVALID_TIMER_DURATION",
      "计时长度必须是正整数毫秒数。",
      { durationMs },
    );
  }
  return normalizedNow + durationMs;
}

function isDeadlineReached(deadlineAt, nowMs) {
  const normalizedNow = normalizeServerTime(nowMs);
  if (!Number.isInteger(deadlineAt) || deadlineAt < 0) {
    throw new RuleValidationError(
      "INVALID_DEADLINE",
      "绝对截止时间必须是非负整数毫秒时间戳。",
      { deadlineAt },
    );
  }
  return normalizedNow >= deadlineAt;
}

module.exports = {
  ACTION_DURATION_MS,
  DEPLOYMENT_DURATION_MS,
  MAX_CONSECUTIVE_ACTION_TIMEOUTS,
  createDeadline,
  isDeadlineReached,
  normalizeServerTime,
};
