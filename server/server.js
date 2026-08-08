"use strict";

const os = require("node:os");
const { createOceanServer } = require("./app");

const DEFAULT_HOST = "127.0.0.1";
const LAN_HOST = "0.0.0.0";
const DEFAULT_PORT = 3000;

function parsePort(value) {
  const port = Number(value ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT 必须是 0～65535 之间的整数。");
  }
  return port;
}

function readOption(argv, name) {
  const exactIndex = argv.indexOf(name);
  if (exactIndex >= 0) return argv[exactIndex + 1];
  const prefix = `${name}=`;
  return argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function validateHost(value) {
  const host = String(value ?? "").trim();
  if (!host || /[\s/\\]/.test(host)) {
    throw new Error("HOST 必须是不含空白、斜杠的主机名或 IP 地址。");
  }
  return host;
}

function resolveLaunchConfig(argv = [], env = process.env) {
  const hostArgument = readOption(argv, "--host");
  const portArgument = readOption(argv, "--port");
  const lan = argv.includes("--lan");
  const host = validateHost(
    hostArgument ?? (lan ? LAN_HOST : env.HOST ?? DEFAULT_HOST),
  );
  const port = parsePort(portArgument ?? env.PORT ?? DEFAULT_PORT);
  return { host, port, lan: host === LAN_HOST };
}

function isPrivateIpv4(address) {
  const parts = String(address).split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function collectLanUrls(port, interfaces) {
  let availableInterfaces = interfaces;
  if (availableInterfaces === undefined) {
    try {
      availableInterfaces = os.networkInterfaces();
    } catch (_error) {
      return [];
    }
  }
  const addresses = new Set();
  for (const records of Object.values(availableInterfaces ?? {})) {
    for (const record of records ?? []) {
      const ipv4 = record.family === "IPv4" || record.family === 4;
      if (ipv4 && !record.internal && isPrivateIpv4(record.address)) {
        addresses.add(record.address);
      }
    }
  }
  return [...addresses]
    .sort((left, right) => left.localeCompare(right, "en", { numeric: true }))
    .map((address) => `http://${address}:${port}`);
}

function displayUrls(config, listeningPort, interfaces) {
  if (!config.lan) {
    return [`http://${config.host}:${listeningPort}`];
  }
  return [
    `http://127.0.0.1:${listeningPort}`,
    ...collectLanUrls(listeningPort, interfaces),
  ];
}

function startOceanServer(options = {}) {
  const config = options.config ?? resolveLaunchConfig(
    options.argv ?? process.argv.slice(2),
    options.env ?? process.env,
  );
  const logger = options.logger ?? console;
  const { httpServer, io } = createOceanServer(options.serverOptions);

  httpServer.on("error", (error) => {
    logger.error("[Ocean] 服务器启动失败：", error.message);
    if (options.setProcessExitCode !== false) process.exitCode = 1;
  });

  httpServer.listen(config.port, config.host, () => {
    const address = httpServer.address();
    const listeningPort =
      address && typeof address === "object" ? address.port : config.port;
    logger.log("[Ocean] 运行监控 postlaunch-v0.4 已启动");
    for (const [index, url] of displayUrls(
      config,
      listeningPort,
      options.networkInterfaces,
    ).entries()) {
      logger.log(`[Ocean] ${config.lan && index > 0 ? "局域网" : "本机"}：${url}`);
    }
    if (config.lan) {
      logger.log("[Ocean] 只向可信的同一局域网用户分享“局域网”地址；主机也应使用该地址打开页面后再复制邀请链接。");
    }
  });

  return { httpServer, io, config };
}

function registerShutdown(runtime) {
  let isShuttingDown = false;
  function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Ocean] 收到 ${signal}，正在关闭服务器……`);
    const forceExitTimer = setTimeout(() => {
      console.error("[Ocean] 服务器未能按时关闭。");
      process.exit(1);
    }, 5000);
    forceExitTimer.unref();
    runtime.io.close(() => {
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  }
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  const runtime = startOceanServer();
  registerShutdown(runtime);
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  LAN_HOST,
  collectLanUrls,
  displayUrls,
  isPrivateIpv4,
  parsePort,
  resolveLaunchConfig,
  startOceanServer,
};
