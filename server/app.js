"use strict";

const path = require("node:path");
const http = require("node:http");
const express = require("express");
const { Server } = require("socket.io");
const { InMemoryRoomService } = require("./game/room-service");
const { SocketGameGateway } = require("./socket/game-gateway");

const PUBLIC_DIRECTORY = path.resolve(__dirname, "..", "public");

const SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self' ws: wss:",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
  ].join("; "),
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

function firstHeaderValue(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return String(candidate ?? "").split(",", 1)[0].trim().toLowerCase();
}

function allowSameOriginRequest(request, callback) {
  const origin = firstHeaderValue(request?.headers?.origin);
  if (!origin) {
    callback(null, true);
    return;
  }

  const expectedHost = firstHeaderValue(
    request?.headers?.["x-forwarded-host"] ?? request?.headers?.host,
  );
  let originHost = "";
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch (_error) {
    callback(null, false);
    return;
  }
  callback(null, Boolean(expectedHost) && originHost === expectedHost);
}

function createOceanServer(options = {}) {
  const nowIso =
    typeof options.now === "function"
      ? options.now
      : () => new Date().toISOString();
  const roomService = options.roomService ?? new InMemoryRoomService({
    now: options.nowMs ?? Date.now,
    random: options.random,
    roomCodeFactory: options.roomCodeFactory,
    playerIdFactory: options.playerIdFactory,
    reconnectTokenFactory: options.reconnectTokenFactory,
    randomDeploymentFactory: options.randomDeploymentFactory,
  });

  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.setHeader(name, value);
    }
    next();
  });
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      status: "ok",
      service: "ocean",
      stage: "deploy-v0.2",
      socketProtocol: "1.2",
      timestamp: nowIso(),
    });
  });

  app.use(
    express.static(PUBLIC_DIRECTORY, {
      etag: true,
      index: "index.html",
      maxAge: 0,
    }),
  );

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    allowRequest: options.allowRequest ?? allowSameOriginRequest,
    serveClient: true,
  });
  const gameGateway = new SocketGameGateway({
    io,
    roomService,
    nowIso,
    logger: options.logger,
    timerSweepMs: options.timerSweepMs,
    phasePresentationMs: options.phasePresentationMs,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
    setIntervalFn: options.setIntervalFn,
    clearIntervalFn: options.clearIntervalFn,
  });
  httpServer.once("close", () => gameGateway.close());

  return {
    app,
    httpServer,
    io,
    roomService,
    gameGateway,
  };
}

module.exports = {
  SECURITY_HEADERS,
  allowSameOriginRequest,
  createOceanServer,
};
