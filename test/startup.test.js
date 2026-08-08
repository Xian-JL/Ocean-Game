"use strict";

const assert = require("node:assert/strict");
const { once } = require("node:events");
const test = require("node:test");
const {
  collectLanUrls,
  displayUrls,
  isPrivateIpv4,
  parsePort,
  resolveLaunchConfig,
  startOceanServer,
} = require("../server/server");

test("安全默认启动只监听 127.0.0.1，LAN 模式必须显式开启", () => {
  assert.deepEqual(resolveLaunchConfig([], {}), {
    host: "127.0.0.1",
    port: 3000,
    lan: false,
  });
  assert.deepEqual(resolveLaunchConfig(["--lan", "--port=4567"], {}), {
    host: "0.0.0.0",
    port: 4567,
    lan: true,
  });
  assert.deepEqual(resolveLaunchConfig(["--host", "192.168.1.8"], {}), {
    host: "192.168.1.8",
    port: 3000,
    lan: false,
  });
});

test("端口和主机参数拒绝非法值", () => {
  assert.equal(parsePort("0"), 0);
  assert.equal(parsePort("65535"), 65535);
  for (const value of ["-1", "65536", "3.5", "abc"]) {
    assert.throws(() => parsePort(value), /PORT/);
  }
  assert.throws(() => resolveLaunchConfig(["--host", "bad host"], {}), /HOST/);
  assert.throws(() => resolveLaunchConfig(["--host=/tmp/socket"], {}), /HOST/);
});

test("局域网地址只选择可信私有 IPv4，并去重排序", () => {
  assert.equal(isPrivateIpv4("10.1.2.3"), true);
  assert.equal(isPrivateIpv4("172.16.0.1"), true);
  assert.equal(isPrivateIpv4("172.31.255.254"), true);
  assert.equal(isPrivateIpv4("192.168.2.5"), true);
  assert.equal(isPrivateIpv4("172.32.0.1"), false);
  assert.equal(isPrivateIpv4("8.8.8.8"), false);
  const interfaces = {
    WiFi: [
      { family: "IPv4", internal: false, address: "192.168.1.20" },
      { family: "IPv6", internal: false, address: "fe80::1" },
    ],
    Ethernet: [
      { family: 4, internal: false, address: "10.0.0.8" },
      { family: 4, internal: false, address: "192.168.1.20" },
    ],
    Loopback: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
    Public: [{ family: "IPv4", internal: false, address: "203.0.113.7" }],
  };
  assert.deepEqual(collectLanUrls(3000, interfaces), [
    "http://10.0.0.8:3000",
    "http://192.168.1.20:3000",
  ]);
  assert.deepEqual(
    displayUrls({ host: "0.0.0.0", lan: true }, 3000, interfaces),
    [
      "http://127.0.0.1:3000",
      "http://10.0.0.8:3000",
      "http://192.168.1.20:3000",
    ],
  );
});

test("LAN 启动真实监听所有接口并继续提供 HTTP 与 Socket.IO", async (context) => {
  const logs = [];
  const runtime = startOceanServer({
    config: { host: "0.0.0.0", port: 0, lan: true },
    logger: {
      log: (message) => logs.push(message),
      error: (message) => logs.push(message),
    },
    networkInterfaces: {
      WiFi: [{ family: "IPv4", internal: false, address: "192.168.1.20" }],
    },
    setProcessExitCode: false,
    serverOptions: { timerSweepMs: 0 },
  });
  context.after(async () => {
    await new Promise((resolve) => runtime.io.close(resolve));
  });
  await once(runtime.httpServer, "listening");
  const address = runtime.httpServer.address();
  assert.ok(address && typeof address === "object");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).stage, "postlaunch-v0.4");
  assert.ok(logs.some((line) => line.includes("局域网：http://192.168.1.20:")));
});
