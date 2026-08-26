"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { once } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");
const { io: createSocketClient } = require("socket.io-client");
const { createOceanServer } = require("../server/app");

const PROJECT_ROOT = path.resolve(__dirname, "..");

function waitFor(check, message, timeoutMs = 6_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const inspect = () => {
      let value;
      try {
        value = check();
      } catch (_error) {
        value = null;
      }
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(message));
        return;
      }
      setTimeout(inspect, 20);
    };
    inspect();
  });
}

function click(window, element) {
  assert.ok(element, "要点击的页面元素必须存在");
  element.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

function setInput(window, selector, value) {
  const input = window.document.querySelector(selector);
  assert.ok(input, selector);
  input.value = value;
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

function submit(window, selector) {
  const form = window.document.querySelector(selector);
  assert.ok(form, selector);
  form.dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
}

async function rollOpeningDice(first, second) {
  for (let round = 1; round <= 20; round += 1) {
    const firstButton = await waitFor(
      () =>
        first.window.document.querySelector(".battle-page") ||
        first.window.document.querySelector('[data-action="roll-die"]:not(:disabled)'),
      `第 ${round} 轮第一客户端掷骰按钮未开放`,
    );
    if (firstButton.classList?.contains("battle-page")) return;
    click(first.window, firstButton);

    await waitFor(
      () =>
        second.window.document.querySelector(".battle-page") ||
        second.window.document.querySelectorAll('.die-player[data-roll-state="rolled"]').length >= 1,
      `第 ${round} 轮第一方掷骰结果未同步`,
    );
    if (second.window.document.querySelector(".battle-page")) return;

    const secondButton = await waitFor(
      () => second.window.document.querySelector('[data-action="roll-die"]:not(:disabled)'),
      `第 ${round} 轮第二客户端掷骰按钮未开放`,
    );
    click(second.window, secondButton);

    const outcome = await waitFor(
      () => {
        if (first.window.document.querySelector(".battle-page")) return "playing";
        if (first.window.document.querySelector('[data-action="roll-die"]:not(:disabled)')) return "reroll";
        return null;
      },
      `第 ${round} 轮掷骰后既未进入对战也未进入重投`,
    );
    if (outcome === "playing") {
      await waitFor(
        () => second.window.document.querySelector(".battle-page"),
        "第二客户端未同步进入 P05",
      );
      return;
    }
  }
  assert.fail("连续 20 轮掷骰仍未决出先手");
}

function createBrowser(baseUrl, clients) {
  const html = fs
    .readFileSync(path.join(PROJECT_ROOT, "public/index.html"), "utf8")
    .replaceAll(/<script[^>]+src="[^"]+"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, {
    url: `${baseUrl}/`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.structuredClone = structuredClone;
  window.document.execCommand = () => true;
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: async () => {} },
    configurable: true,
  });
  window.HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  window.HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
  window.io = () => {
    const client = createSocketClient(baseUrl, {
      forceNew: true,
      reconnection: true,
      transports: ["websocket"],
    });
    clients.push(client);
    return client;
  };
  for (const script of ["game-data.js", "ui-model.js", "tutorial-system.js", "app.js"]) {
    window.eval(
      fs.readFileSync(path.join(PROJECT_ROOT, "public/js", script), "utf8"),
    );
  }
  return dom;
}

async function randomizeAndReady(dom) {
  const { window } = dom;
  click(
    window,
    await waitFor(
      () => window.document.querySelector('[data-action="random-deployment"]:not(:disabled)'),
      "随机部署按钮未开放",
    ),
  );
  const ready = await waitFor(
    () => window.document.querySelector('[data-action="ready-deployment"]:not(:disabled)'),
    "完整随机部署后准备按钮仍未开放",
  );
  click(window, ready);
  const confirm = await waitFor(
    () => window.document.querySelector("#confirm-dialog[open] #confirm-accept:not(:disabled)"),
    "准备确认层未打开",
  );
  click(window, confirm);
}

test("两个正式页面客户端可真实创建、加入、部署并进入服务器权威对战", async (context) => {
  const { httpServer, io } = createOceanServer({
    timerSweepMs: 0,
    phasePresentationMs: 10,
    rollResultExtraPresentationMs: 10,
  });
  httpServer.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const clients = [];
  const browsers = [];

  context.after(async () => {
    for (const client of clients) client.disconnect();
    for (const browser of browsers) browser.window.close();
    await new Promise((resolve) => io.close(resolve));
  });

  const first = createBrowser(baseUrl, clients);
  const second = createBrowser(baseUrl, clients);
  browsers.push(first, second);

  await Promise.all([
    waitFor(
      () => first.window.document.querySelector('#create-form button[type="submit"]:not(:disabled)'),
      "第一客户端未连接",
    ),
    waitFor(
      () => second.window.document.querySelector('#create-form button[type="submit"]:not(:disabled)'),
      "第二客户端未连接",
    ),
  ]);

  setInput(first.window, "#nickname-input", "甲");
  submit(first.window, "#create-form");
  const waiting = await waitFor(
    () => first.window.document.querySelector(".waiting-page"),
    "创建房间后未进入 P02",
  );
  assert.ok(waiting);
  const roomCode = first.window.document
    .querySelector(".room-code-card strong")
    .textContent.trim();
  assert.match(roomCode, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);

  setInput(second.window, "#nickname-input", "乙");
  setInput(second.window, "#room-code-input", roomCode);
  submit(second.window, "#join-form");

  await Promise.all([
    waitFor(
      () => first.window.document.querySelector(".deployment-page"),
      "第一客户端未进入 P03",
    ),
    waitFor(
      () => second.window.document.querySelector(".deployment-page"),
      "第二客户端未进入 P03",
    ),
  ]);

  await randomizeAndReady(first);
  await waitFor(
    () => /舰队已准备/.test(first.window.document.querySelector(".seat-card--own")?.textContent ?? ""),
    "第一客户端准备状态未同步",
  );
  await randomizeAndReady(second);
  await Promise.all([
    waitFor(
      () => first.window.document.querySelector(".rolling-page"),
      "第一客户端未进入 P04",
    ),
    waitFor(
      () => second.window.document.querySelector(".rolling-page"),
      "第二客户端未进入 P04",
    ),
  ]);
  await rollOpeningDice(first, second);

  await Promise.all([
    waitFor(
      () => first.window.document.querySelector(".battle-page"),
      "第一客户端未进入 P05",
    ),
    waitFor(
      () => second.window.document.querySelector(".battle-page"),
      "第二客户端未进入 P05",
    ),
  ]);

  for (const browser of [first, second]) {
    assert.equal(browser.window.document.querySelectorAll(".action-card").length, 10);
    assert.equal(
      browser.window.document.querySelectorAll(
        '.battle-map-card--enemy [data-action="enemy-cell"]',
      ).length,
      144,
    );
    assert.equal(
      browser.window.document.body.textContent.includes("reconnectToken"),
      false,
    );
  }

  const ownTurnCount = [first, second].filter(
    (browser) => browser.window.document.querySelectorAll('.action-card:not(:disabled)').length > 0,
  ).length;
  assert.equal(ownTurnCount, 1, "只有当前玩家的行动卡应开放");
});
