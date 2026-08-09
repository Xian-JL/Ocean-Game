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
const SESSION_STORAGE_KEY = "ocean.reconnect-session.v1";

function waitFor(check, message, timeoutMs = 8_000) {
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

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
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

function createBrowser(baseUrl, clients, options = {}) {
  const html = fs
    .readFileSync(path.join(PROJECT_ROOT, "public/index.html"), "utf8")
    .replaceAll(/<script[^>]+src="[^"]+"[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, {
    url: options.url ?? `${baseUrl}/`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.structuredClone = structuredClone;
  window.Math.random = seededRandom(options.seed ?? 1);
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
  if (options.storedSession) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, options.storedSession);
  }
  let activeClient = null;
  window.io = () => {
    activeClient = createSocketClient(baseUrl, {
      forceNew: true,
      reconnection: true,
      transports: ["websocket"],
    });
    clients.push(activeClient);
    return activeClient;
  };
  for (const script of ["game-data.js", "ui-model.js", "app.js"]) {
    window.eval(
      fs.readFileSync(path.join(PROJECT_ROOT, "public/js", script), "utf8"),
    );
  }
  dom.oceanClient = activeClient;
  return dom;
}

function placementCells(dom, placementId) {
  return [...dom.window.document.querySelectorAll(
    `[data-action="deployment-cell"][data-placement-id="${placementId}"]`,
  )].map((cell) => cell.dataset.coordinate);
}

function selectiveShockCenter(dom) {
  const Data = dom.window.OceanGameData;
  const submarine = new Set(placementCells(dom, "submarine"));
  const nuclear = new Set(placementCells(dom, "nuclear"));
  for (const row of Data.ROWS.slice(2, 8)) {
    for (const column of Data.COLUMNS.slice(2, 8)) {
      const center = `${row}${column}`;
      const area = Data.getAreaCells("shock", center);
      if (
        area.some((cell) => submarine.has(cell)) &&
        area.every((cell) => !nuclear.has(cell))
      ) {
        return center;
      }
    }
  }
  return null;
}

async function randomizeAndReady(dom, requireSelectiveShock = false) {
  const { window } = dom;
  let shockCenter = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    click(
      window,
      await waitFor(
        () => window.document.querySelector(
          '[data-action="random-deployment"]:not(:disabled)',
        ),
        "随机部署按钮未开放",
      ),
    );
    const overwrite = window.document.querySelector(
      "#confirm-dialog[open] #confirm-accept:not(:disabled)",
    );
    if (overwrite) click(window, overwrite);
    await waitFor(
      () => window.document.querySelectorAll("[data-deployment-cell]").length === 29,
      "随机部署没有生成完整十一对象部署",
    );
    shockCenter = selectiveShockCenter(dom);
    if (!requireSelectiveShock || shockCenter) break;
  }
  assert.ok(!requireSelectiveShock || shockCenter, "未生成可隔离核潜艇的震爆目标");

  click(
    window,
    await waitFor(
      () => window.document.querySelector(
        '[data-action="ready-deployment"]:not(:disabled)',
      ),
      "完整部署后准备按钮仍未开放",
    ),
  );
  click(
    window,
    await waitFor(
      () => window.document.querySelector(
        "#confirm-dialog[open] #confirm-accept:not(:disabled)",
      ),
      "准备确认层未打开",
    ),
  );
  await waitFor(
    () =>
      /舰队已准备/.test(
        window.document.querySelector(".seat-card--own")?.textContent ?? "",
      ) ||
      window.document.querySelector(".rolling-page") ||
      window.document.querySelector(".battle-page"),
    "准备请求未被服务器确认",
  );
  return shockCenter;
}

function canAct(dom) {
  return Boolean(dom.window.document.querySelector(
    '[data-action="select-action"]:not(:disabled)',
  ));
}

function unitCells(dom, unitName) {
  return [...dom.window.document.querySelectorAll(
    ".battle-map-card--own [data-coordinate]",
  )]
    .filter((cell) => cell.getAttribute("aria-label")?.includes(`，${unitName}，`))
    .map((cell) => cell.dataset.coordinate);
}

function unitStatus(dom, unitName) {
  return [...dom.window.document.querySelectorAll(".unit-status")].find(
    (item) => item.querySelector("strong")?.textContent.trim() === unitName,
  );
}

async function performAction(dom, actionType, coordinate) {
  const { window } = dom;
  click(
    window,
    await waitFor(
      () => window.document.querySelector(
        `[data-action="select-action"][data-action-type="${actionType}"]:not(:disabled)`,
      ),
      `行动 ${actionType} 未开放`,
    ),
  );
  click(
    window,
    await waitFor(
      () => window.document.querySelector(
        `.battle-map-card--enemy [data-action="enemy-cell"][data-coordinate="${coordinate}"].board-cell--legal-target`,
      ),
      `目标 ${coordinate} 未成为合法目标`,
    ),
  );
  click(
    window,
    await waitFor(
      () => window.document.querySelector(
        "#confirm-dialog[open] #confirm-accept:not(:disabled)",
      ),
      `行动 ${actionType} 未打开确认层`,
    ),
  );
  await waitFor(
    () => !window.document.querySelector("#confirm-dialog")?.open,
    `行动 ${actionType} 提交后确认层未关闭`,
  );
}

async function createAndEnterBattle(baseUrl, clients, browsers, options = {}) {
  const first = createBrowser(baseUrl, clients, { seed: options.firstSeed ?? 101 });
  const second = createBrowser(baseUrl, clients, { seed: options.secondSeed ?? 202 });
  browsers.push(first, second);
  await Promise.all([
    waitFor(
      () => first.window.document.querySelector("#create-form button:not(:disabled)"),
      "第一客户端未连接",
    ),
    waitFor(
      () => second.window.document.querySelector("#create-form button:not(:disabled)"),
      "第二客户端未连接",
    ),
  ]);

  setInput(first.window, "#nickname-input", "甲");
  submit(first.window, "#create-form");
  await waitFor(
    () => first.window.document.querySelector(".waiting-page"),
    "创建房间后未进入 P02",
  );
  const roomCode = first.window.document
    .querySelector(".room-code-card strong")
    .textContent.trim();

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

  const firstShockCenter = await randomizeAndReady(
    first,
    options.requireSelectiveShock,
  );
  const secondShockCenter = await randomizeAndReady(
    second,
    options.requireSelectiveShock,
  );
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
  return {
    first,
    second,
    roomCode,
    shockCenters: new Map([
      [first, firstShockCenter],
      [second, secondShockCenter],
    ]),
  };
}

test("两个正式页面客户端完成整局、保密、重连、复盘、再来一局和赛后离开", async (context) => {
  const { httpServer, io } = createOceanServer({
    timerSweepMs: 0,
    phasePresentationMs: 10,
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

  const setup = await createAndEnterBattle(baseUrl, clients, browsers, {
    requireSelectiveShock: true,
  });
  let firstMover = canAct(setup.first) ? setup.first : setup.second;
  const secondMover = firstMover === setup.first ? setup.second : setup.first;
  const firstName = firstMover === setup.first ? "甲" : "乙";
  const Data = firstMover.window.OceanGameData;
  const secondCarrier = unitCells(secondMover, "航空母舰");
  const firstCarrier = unitCells(firstMover, "航空母舰");
  assert.equal(firstCarrier.length, 6);
  assert.equal(secondCarrier.length, 6);

  await performAction(firstMover, Data.ACTION_TYPES.RADAR_SCAN, "A1");
  await waitFor(() => canAct(secondMover), "第一方首回合雷达后未切换回合");
  await performAction(secondMover, Data.ACTION_TYPES.RADAR_SCAN, "A1");
  await waitFor(() => canAct(firstMover), "第二方首回合雷达后未切换回合");

  for (const browser of [firstMover, secondMover]) {
    const enemyPanel = browser.window.document.querySelector(
      ".battle-map-card--enemy",
    );
    assert.doesNotMatch(enemyPanel.textContent, /航空母舰|潜水艇|核潜艇|生命值/);
    assert.equal(browser.window.document.body.textContent.includes("reconnectToken"), false);
  }

  await performAction(
    firstMover,
    Data.ACTION_TYPES.SUBMARINE_MISSILE,
    secondCarrier[0],
  );
  await waitFor(() => canAct(secondMover), "潜射导弹后未切换到对方回合");
  const missileCell = firstMover.window.document.querySelector(
    `.battle-map-card--enemy [data-coordinate="${secondCarrier[0]}"]`,
  );
  assert.match(missileCell.getAttribute("aria-label"), /导弹已发射，仍未结算/);
  assert.doesNotMatch(missileCell.getAttribute("aria-label"), /命中|航空母舰|伤害/);
  assert.equal(unitStatus(secondMover, "航空母舰").querySelector(".hp-meter b").textContent.trim(), "5");

  const shockCenter = setup.shockCenters.get(firstMover);
  await performAction(
    secondMover,
    Data.ACTION_TYPES.SHOCK_BOMB,
    shockCenter,
  );
  await waitFor(() => canAct(firstMover), "震爆弹后未切换到受影响方回合");
  const shockFeedback = secondMover.window.document.querySelector(
    '.resolution-strip[aria-label="最近一次行动反馈"]',
  );
  assert.match(shockFeedback.textContent, /是否生效不会向你显示/);
  assert.doesNotMatch(shockFeedback.textContent, /成功|失败|潜水艇|核潜艇/);
  assert.ok(unitStatus(firstMover, "潜水艇").classList.contains("unit-status--paralyzed"));
  assert.ok(!unitStatus(firstMover, "核潜艇").classList.contains("unit-status--paralyzed"));

  const storedSession = firstMover.window.localStorage.getItem(SESSION_STORAGE_KEY);
  const oldToken = JSON.parse(storedSession).reconnectToken;
  firstMover.oceanClient.disconnect();
  await waitFor(
    () => !secondMover.window.document.querySelector("#blocking-overlay").hidden,
    "一方断线后另一方未进入 O02",
  );
  assert.match(
    secondMover.window.document.querySelector("#blocking-overlay").textContent,
    new RegExp(`${firstName} 已断线`),
  );

  const restored = createBrowser(baseUrl, clients, {
    url: `${baseUrl}/?room=${setup.roomCode}`,
    storedSession,
    seed: 303,
  });
  browsers.push(restored);
  firstMover.window.close();
  firstMover = restored;
  await waitFor(
    () => firstMover.window.document.querySelector(".battle-page") && canAct(firstMover),
    "刷新式新客户端未恢复 P05 与当前回合",
  );
  await waitFor(
    () => secondMover.window.document.querySelector("#blocking-overlay").hidden,
    "座位恢复后对方 O02 未关闭",
  );
  const newToken = JSON.parse(
    firstMover.window.localStorage.getItem(SESSION_STORAGE_KEY),
  ).reconnectToken;
  assert.notEqual(newToken, oldToken, "恢复成功后必须轮换私密凭证");
  assert.equal(firstMover.window.document.documentElement.outerHTML.includes(oldToken), false);
  assert.equal(firstMover.window.document.documentElement.outerHTML.includes(newToken), false);

  await performAction(firstMover, Data.ACTION_TYPES.PIRATE_ATTACK, secondCarrier[1]);
  await waitFor(() => canAct(secondMover), "海盗船行动后未切换回合");
  await performAction(secondMover, Data.ACTION_TYPES.NUCLEAR_BOMB, firstCarrier[0]);
  await waitFor(() => canAct(firstMover), "第一枚核弹后未切换回合");
  await performAction(firstMover, Data.ACTION_TYPES.NUCLEAR_BOMB, secondCarrier[2]);
  await waitFor(() => canAct(secondMover), "第二枚核弹后未切换回合");
  await performAction(secondMover, Data.ACTION_TYPES.NUCLEAR_BOMB, firstCarrier[1]);
  await waitFor(() => canAct(firstMover), "第三枚核弹后未切换回合");
  await performAction(firstMover, Data.ACTION_TYPES.DETECTION_BOMB, "C3");
  await waitFor(() => canAct(secondMover), "探测弹后未切换回合");
  await performAction(secondMover, Data.ACTION_TYPES.PIRATE_ATTACK, firstCarrier[2]);

  await Promise.all([
    waitFor(
      () => firstMover.window.document.querySelector(".finished-page"),
      "第一客户端未进入 P06",
    ),
    waitFor(
      () => secondMover.window.document.querySelector(".finished-page"),
      "第二客户端未进入 P06",
    ),
  ]);
  assert.match(
    secondMover.window.document.querySelector(".result-hero").textContent,
    /胜利.*海盗船攻击使敌方航空母舰沉没/s,
  );
  assert.match(
    firstMover.window.document.querySelector(".result-hero").textContent,
    /失败.*海盗船攻击使敌方航空母舰沉没/s,
  );
  for (const browser of [firstMover, secondMover]) {
    const carrierResults = [...browser.window.document.querySelectorAll(
      ".carrier-result strong",
    )].map((item) => item.textContent.trim()).sort();
    assert.deepEqual(carrierResults, ["0", "0.5"]);
    assert.equal(browser.window.document.querySelectorAll(".replay-log > li").length, 10);
    assert.match(browser.window.document.querySelector(".replay-layout").textContent, /完整部署复盘/);
  }

  click(
    firstMover.window,
    firstMover.window.document.querySelector('[data-action="request-rematch"]'),
  );
  await waitFor(
    () => /已申请/.test(secondMover.window.document.querySelector(".rematch-status")?.textContent ?? ""),
    "单方再来一局申请未同步",
  );
  click(
    secondMover.window,
    secondMover.window.document.querySelector('[data-action="request-rematch"]'),
  );
  await Promise.all([
    waitFor(
      () => firstMover.window.document.querySelector(".deployment-page"),
      "双方确认后第一客户端未回到 P03",
    ),
    waitFor(
      () => secondMover.window.document.querySelector(".deployment-page"),
      "双方确认后第二客户端未回到 P03",
    ),
  ]);
  for (const browser of [firstMover, secondMover]) {
    assert.equal(browser.window.document.querySelectorAll("[data-deployment-cell]").length, 0);
    assert.equal(browser.window.document.querySelector(".finished-page"), null);
  }

  await randomizeAndReady(firstMover);
  await randomizeAndReady(secondMover);
  await Promise.all([
    waitFor(
      () => firstMover.window.document.querySelector(".battle-page"),
      "再来一局后第一客户端未进入 P05",
    ),
    waitFor(
      () => secondMover.window.document.querySelector(".battle-page"),
      "再来一局后第二客户端未进入 P05",
    ),
  ]);
  click(
    firstMover.window,
    firstMover.window.document.querySelector('[data-action="surrender"]'),
  );
  click(
    firstMover.window,
    await waitFor(
      () => firstMover.window.document.querySelector(
        "#confirm-dialog[open] #confirm-accept:not(:disabled)",
      ),
      "投降确认层未打开",
    ),
  );
  await Promise.all([
    waitFor(
      () => firstMover.window.document.querySelector(".finished-page"),
      "投降方未进入 P06",
    ),
    waitFor(
      () => secondMover.window.document.querySelector(".finished-page"),
      "对方未收到投降终局",
    ),
  ]);
  assert.match(firstMover.window.document.querySelector(".result-hero").textContent, /失败.*主动投降/s);

  click(
    firstMover.window,
    firstMover.window.document.querySelector('[data-action="leave-room"]'),
  );
  click(
    firstMover.window,
    await waitFor(
      () => firstMover.window.document.querySelector(
        "#confirm-dialog[open] #confirm-accept:not(:disabled)",
      ),
      "赛后离开确认层未打开",
    ),
  );
  await Promise.all([
    waitFor(
      () => firstMover.window.document.querySelector(".entry-page"),
      "离开方未回到 P01",
    ),
    waitFor(
      () => secondMover.window.document.querySelector(".waiting-page"),
      "留下方未回到 P02",
    ),
  ]);
});
