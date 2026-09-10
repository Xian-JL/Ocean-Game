"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "public/css/main.css"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
const v155 = css.slice(css.indexOf("/* Ocean-v1.5.5 ·"));

function functionBody(name, nextName) {
  const start = app.search(new RegExp(`^  (?:async )?function ${name}`, "m"));
  const tail = start >= 0 ? app.slice(start + 3) : "";
  const nextOffset = nextName
    ? tail.search(new RegExp(`^  (?:async )?function ${nextName}`, "m"))
    : -1;
  const end = nextOffset >= 0 ? start + 3 + nextOffset : app.length;
  assert.ok(start >= 0 && end > start, `找不到函数 ${name}`);
  return app.slice(start, end);
}

test("v1.5.5 发布元数据与缓存标识一致", () => {
  assert.equal(require("../package.json").version, "1.5.5");
  assert.equal(require("../public/js/game-data").RELEASE.stage, "Ocean-v1.5.5");
  assert.match(html, /Ocean-v1\.5\.5/);
  assert.match(html, /main\.css\?v=1\.5\.5/);
  assert.match(app, /battle-page--v155/);
});

test("选择行动自动切换敌方地图、展开来源单位并收起日志", () => {
  const selectAction = functionBody("selectAction", "handleEnemyCell");
  assert.match(selectAction, /expandedUnitCards\.add\(definition\.sourceType\)/);
  assert.match(selectAction, /state\.battle\.logOpen = false/);
  assert.match(selectAction, /state\.battle\.mobileMap = targetPlayerId/);
  assert.match(selectAction, /battleOpponentIds\(state\.room\?\.battle\)\[0\]/);
});

test("行动确认显示倒计时并在回合状态失效时自动关闭", () => {
  const acceptRoomState = functionBody("acceptRoomState", "getOwnSeat");
  const openActionConfirmation = functionBody("openActionConfirmation", "submitSelectedAction");
  assert.match(acceptRoomState, /state\.confirm\?\.kind === "battle-action"/);
  assert.match(acceptRoomState, /previousTurn !== nextRoom\.turn\?\.turnNumber/);
  assert.match(acceptRoomState, /closeConfirmSilently\(\)/);
  assert.match(openActionConfirmation, /kind: "battle-action"/);
  assert.match(openActionConfirmation, /deadline: state\.room\.deadlines\?\.actionDeadlineAt/);
  assert.match(app, /className = "confirm-turn-countdown"/);
});

test("反馈完整展示4.5秒后折叠且允许手动展开", () => {
  const schedule = functionBody("scheduleFeedbackCollapse", "closeConfirmSilently");
  const feedback = functionBody("renderLatestFeedback", "publicActionState");
  assert.match(schedule, /4_500/);
  assert.match(schedule, /feedbackCollapsed = true/);
  assert.match(feedback, /resolution-strip--collapsed/);
  assert.match(feedback, /data-action="toggle-feedback"/);
  assert.match(v155, /\.resolution-strip--collapsed\s*\{[^}]*max-height:\s*42px/s);
  assert.match(v155, /:has\(\.resolution-strip--collapsed\)[^{]*\{[^}]*grid-template-rows:\s*auto 42px minmax\(0, 1fr\)/s);
});

test("单位行动卡默认折叠、选中来源自动展开并保留可访问状态", () => {
  const deck = functionBody("renderUnitActionDeck", "renderActionPanel");
  assert.match(deck, /expandedUnitCards\.has\(sourceType\)/);
  assert.match(deck, /data-action="toggle-unit-card"/);
  assert.match(deck, /aria-expanded="\$\{expanded\}"/);
  assert.match(deck, /unit-action-card__details/);
  assert.match(v155, /\.unit-action-card__details\[hidden\]\s*\{[^}]*display:\s*none/s);
});

test("页面切换重置滚动且目标点击再次收起日志", () => {
  const render = functionBody("render", "tutorialTargetCoordinate");
  const target = functionBody("handleEnemyCell", "validateNickname");
  assert.match(render, /if \(!samePage\)/);
  assert.match(render, /scrollingElement\.scrollTop = 0/);
  assert.match(render, /app\.scrollTop = 0/);
  assert.match(target, /state\.battle\.logOpen = false/);
});
