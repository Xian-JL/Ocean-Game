"use strict";

const { RuleValidationError } = require("../game/errors");

const SOCKET_PROTOCOL_VERSION = "1.5";

const CLIENT_EVENTS = Object.freeze({
  PING: "client:ping",
  CREATE_ROOM: "room:create",
  JOIN_ROOM: "room:join",
  RESUME_ROOM: "room:resume",
  SYNC_ROOM: "room:sync",
  LEAVE_ROOM: "room:leave",
  SUBMIT_DEPLOYMENT: "deployment:submit",
  READY_DEPLOYMENT: "deployment:ready",
  CANCEL_READY: "deployment:cancel-ready",
  SUBMIT_ACTION: "action:submit",
  SUBMIT_FINAL_SALVO: "final-salvo:submit",
  SURRENDER_MATCH: "match:surrender",
  REQUEST_REMATCH: "rematch:request",
  CANCEL_REMATCH: "rematch:cancel",
});

const SERVER_EVENTS = Object.freeze({
  READY: "system:ready",
  SESSION: "room:session",
  STATE: "room:state",
  ERROR: "room:error",
});

function fail(code, message, details = {}) {
  throw new RuleValidationError(code, message, details);
}

function requirePayloadObject(payload) {
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  ) {
    fail("INVALID_SOCKET_PAYLOAD", "事件数据必须是对象。");
  }
  return payload;
}

function requireExpectedVersion(payload) {
  const normalized = requirePayloadObject(payload);
  if (
    !Number.isInteger(normalized.expectedVersion) ||
    normalized.expectedVersion < 1
  ) {
    fail(
      "INVALID_EXPECTED_VERSION",
      "操作必须携带最近收到的正整数状态版本号。",
      { expectedVersion: normalized.expectedVersion },
    );
  }
  return normalized.expectedVersion;
}

function createSuccessResponse(data = {}) {
  return {
    ok: true,
    data,
  };
}

function serializeSocketError(error) {
  if (error instanceof RuleValidationError) {
    return {
      code: error.code,
      message: error.message,
      details: structuredClone(error.details),
    };
  }
  return {
    code: "INTERNAL_SERVER_ERROR",
    message: "服务器处理请求时发生内部错误，请同步状态后重试。",
    details: {},
  };
}

module.exports = {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  SOCKET_PROTOCOL_VERSION,
  createSuccessResponse,
  requireExpectedVersion,
  requirePayloadObject,
  serializeSocketError,
};
