"use strict";

const { RuleValidationError } = require("../game/errors");

class FixedWindowRateLimiter {
  constructor(options = {}) {
    this.now = options.now ?? Date.now;
    this.windows = new Map();
  }

  consume(key, options) {
    const limit = options?.limit;
    const windowMs = options?.windowMs;
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError("限流次数必须是正整数。");
    }
    if (!Number.isInteger(windowMs) || windowMs < 1) {
      throw new TypeError("限流窗口必须是正整数毫秒。");
    }

    const nowMs = this.now();
    const current = this.windows.get(key);
    const entry = !current || nowMs >= current.resetAt
      ? { count: 0, resetAt: nowMs + windowMs }
      : current;
    entry.count += 1;
    this.windows.set(key, entry);
    if (entry.count > limit) {
      throw new RuleValidationError(
        "RATE_LIMITED",
        "操作过于频繁，请稍后重试。",
        { retryAfterMs: Math.max(0, entry.resetAt - nowMs) },
      );
    }
    return {
      remaining: Math.max(0, limit - entry.count),
      resetAt: entry.resetAt,
    };
  }

  deletePrefix(prefix) {
    for (const key of this.windows.keys()) {
      if (key.startsWith(prefix)) this.windows.delete(key);
    }
  }

  pruneExpired() {
    const nowMs = this.now();
    let removed = 0;
    for (const [key, entry] of this.windows) {
      if (nowMs >= entry.resetAt) {
        this.windows.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

module.exports = { FixedWindowRateLimiter };
