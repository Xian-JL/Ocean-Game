"use strict";

class OperationalTelemetry {
  constructor(options = {}) {
    this.nowIso = options.nowIso ?? (() => new Date().toISOString());
    this.counters = new Map();
    this.errorsByCode = new Map();
  }

  increment(name, amount = 1) {
    if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(name)) {
      throw new TypeError("监控计数器名称无效。");
    }
    if (!Number.isInteger(amount) || amount < 1) {
      throw new TypeError("监控计数增量必须是正整数。");
    }
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  recordError(error, source = "unknown") {
    const code = typeof error?.code === "string" && error.code
      ? error.code
      : error?.name === "TypeError"
        ? "TYPE_ERROR"
        : "INTERNAL_ERROR";
    this.errorsByCode.set(code, (this.errorsByCode.get(code) ?? 0) + 1);
    this.increment("errorsTotal");
    return {
      timestamp: this.nowIso(),
      level: "error",
      source: String(source).slice(0, 64),
      code,
    };
  }

  snapshot() {
    return {
      counters: Object.fromEntries([...this.counters].sort()),
      errorsByCode: Object.fromEntries([...this.errorsByCode].sort()),
    };
  }
}

function logOperationalError(logger, telemetry, error, source) {
  const entry = telemetry.recordError(error, source);
  logger?.error?.(`[Ocean] ${JSON.stringify(entry)}`);
  return entry;
}

module.exports = { OperationalTelemetry, logOperationalError };
