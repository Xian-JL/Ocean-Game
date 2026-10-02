"use strict";

const path = require("node:path");
const http = require("node:http");
const { randomUUID, timingSafeEqual } = require("node:crypto");
const fs = require("node:fs");
const express = require("express");
const { Server } = require("socket.io");
const { InMemoryRoomService } = require("./game/room-service");
const { SocketGameGateway } = require("./socket/game-gateway");
const { OperationalTelemetry } = require("./operations/telemetry");
const { ASSET_VERSION, RELEASE_STAGE, SOCKET_PROTOCOL_VERSION } = require("./release");

const PUBLIC_DIRECTORY = path.resolve(__dirname, "..", "public");
const INDEX_HTML = fs.readFileSync(path.join(PUBLIC_DIRECTORY, "index.html"), "utf8");

function isOperationsRequestAuthorized(request, token) {
  if (typeof token !== "string" || token.length < 16) return false;
  const authorization = request?.headers?.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) {
    return false;
  }
  const supplied = Buffer.from(authorization.slice(7), "utf8");
  const expected = Buffer.from(token, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

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
  const clock = options.nowMs ?? Date.now;
  const startedAtMs = options.startedAtMs ?? clock();
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
    maxRooms: options.maxRooms,
    closedRoomRetentionMs: options.closedRoomRetentionMs,
    finishedRoomRetentionMs: options.finishedRoomRetentionMs,
  });
  const telemetry = options.telemetry ?? new OperationalTelemetry({ nowIso });
  const operationsToken = options.operationsToken ?? process.env.OCEAN_OPERATIONS_TOKEN ?? "";
  const trustedProxyHops = options.trustedProxyHops ?? Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  let io = null;

  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    telemetry.increment("httpRequests");
    response.setHeader("X-Request-Id", randomUUID());
    next();
  });
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
      stage: RELEASE_STAGE,
      socketProtocol: SOCKET_PROTOCOL_VERSION,
      roomStatePersistence: "in-memory",
      timestamp: nowIso(),
    });
  });

  app.get("/api/status", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!isOperationsRequestAuthorized(request, operationsToken)) {
      response.status(404).end();
      return;
    }
    response.status(200).json({
      status: "ok",
      service: "ocean",
      stage: RELEASE_STAGE,
      socketProtocol: SOCKET_PROTOCOL_VERSION,
      uptimeSeconds: Math.max(0, Math.floor((clock() - startedAtMs) / 1000)),
      connections: io?.engine?.clientsCount ?? 0,
      ...roomService.getOperationsSnapshot(),
      timestamp: nowIso(),
    });
  });

  app.get("/api/ready", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({
      status: "ready",
      service: "ocean",
      stage: RELEASE_STAGE,
      timestamp: nowIso(),
    });
  });

  app.get(["/", "/index.html"], (_request, response) => {
    response.setHeader("Cache-Control", "no-cache");
    response.type("html").send(
      INDEX_HTML.replaceAll("__OCEAN_ASSET_VERSION__", ASSET_VERSION),
    );
  });

  app.get("/api/metrics", (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!isOperationsRequestAuthorized(request, operationsToken)) {
      response.status(404).end();
      return;
    }
    const memory = process.memoryUsage();
    response.status(200).json({
      status: "ok",
      service: "ocean",
      stage: RELEASE_STAGE,
      uptimeSeconds: Math.max(0, Math.floor((clock() - startedAtMs) / 1000)),
      memoryMb: {
        rss: Math.round(memory.rss / 1024 / 1024),
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      },
      connections: io?.engine?.clientsCount ?? 0,
      rooms: roomService.getOperationsSnapshot(),
      ...telemetry.snapshot(),
      timestamp: nowIso(),
    });
  });

  app.use(
    express.static(PUBLIC_DIRECTORY, {
      etag: true,
      index: "index.html",
      maxAge: 0,
      setHeaders(response, filePath) {
        const requestUrl = new URL(response.req.originalUrl, "http://ocean.local");
        const isHtml = path.extname(filePath).toLowerCase() === ".html";
        if (isHtml) {
          response.setHeader("Cache-Control", "no-cache");
          return;
        }
        const isAudioAsset = requestUrl.pathname.startsWith("/assets/audio/");
        const expectedVersion = isAudioAsset ? "1.3.3.2" : ASSET_VERSION;
        if (requestUrl.searchParams.get("v") === expectedVersion) {
          response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        if (/\.(?:webp|svg|mp3|ogg|wav|flac|aiff)$/i.test(filePath)) {
          response.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
          return;
        }
        response.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
      },
    }),
  );

  const httpServer = http.createServer(app);
  io = new Server(httpServer, {
    allowRequest: options.allowRequest ?? allowSameOriginRequest,
    serveClient: true,
  });
  const gameGateway = new SocketGameGateway({
    io,
    roomService,
    trustedProxyHops,
    nowIso,
    nowMs: clock,
    logger: options.logger,
    telemetry,
    timerSweepMs: options.timerSweepMs,
    phasePresentationMs: options.phasePresentationMs,
    rollResultExtraPresentationMs: options.rollResultExtraPresentationMs,
    botThinkDelayMs: options.botThinkDelayMs,
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
    telemetry,
  };
}

module.exports = {
  SECURITY_HEADERS,
  allowSameOriginRequest,
  createOceanServer,
  isOperationsRequestAuthorized,
};
