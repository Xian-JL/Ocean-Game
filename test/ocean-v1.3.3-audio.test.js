"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(ROOT, "public/js/app.js"), "utf8");
const audio = fs.readFileSync(path.join(ROOT, "public/js/audio-system.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");

const ACTION_EFFECTS = Object.freeze({
  destroyer_i_ram: "attack_destroyer_i",
  destroyer_ii_ram: "attack_destroyer_ii",
  pirate_attack: "attack_pirate",
  motorboat_ram: "attack_motorboat",
  submarine_missile: "attack_missile",
  nuclear_bomb: "attack_nuclear",
  shock_bomb: "attack_shock",
  detection_bomb: "attack_detection",
  helicopter_strafe: "attack_helicopter",
  radar_scan: "attack_radar",
});

test("十种战斗行动具有十种独立音效并在行动成功后播放", () => {
  assert.equal(new Set(Object.values(ACTION_EFFECTS)).size, 10);
  for (const [action, effect] of Object.entries(ACTION_EFFECTS)) {
    assert.match(app, new RegExp(`${action}: "${effect}"`));
    assert.match(audio, new RegExp(`${effect}: \\[`));
  }
  assert.match(app, /Sound\?\.playEffect\?\.\(ACTION_EFFECTS\[definition\.type\]/);
});

test("隐藏武器音效只按行动类型选择，不读取命中与伤害结果", () => {
  const start = app.indexOf("async function submitSelectedAction");
  const end = app.indexOf("async function submitFinalSalvo", start);
  const submitSource = app.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(submitSource, /ACTION_EFFECTS\[definition\.type\]/);
  for (const forbidden of ["inflictedDamage", "receivedHits", "privateResults", "feedback.result"]) {
    assert.equal(submitSource.includes(forbidden), false, `行动音效读取了秘密结果：${forbidden}`);
  }
  for (const effect of ["attack_missile", "attack_nuclear", "attack_shock"]) {
    assert.equal((app.match(new RegExp(`"${effect}"`, "g")) ?? []).length, 1);
  }
});

test("主要界面、部署、标记、教程与系统状态均接入语义音效", () => {
  for (const effect of [
    "panel_open", "panel_close", "ui_select", "map_switch", "log_switch",
    "room_create", "room_join", "reconnect", "copy", "confirm", "cancel",
    "place", "move", "rotate", "remove", "undo", "randomize", "ready", "dice_roll",
    "marker_add", "marker_remove", "target_lock", "tutorial_step", "tutorial_complete",
    "pause", "eliminated", "victory", "defeat", "final_salvo",
  ]) {
    assert.match(audio, new RegExp(`${effect}: \\[`), `音效库缺少 ${effect}`);
    assert.equal(app.includes(`"${effect}"`), true, `界面未接入 ${effect}`);
  }
});

test("音效库接入本地真实素材且设置说明保持独立音量", () => {
  assert.match(audio, /EFFECT_LIBRARY_VERSION = "3\.0"/);
  assert.match(audio, /createOscillator/);
  assert.match(audio, /createBufferSource/);
  assert.match(audio, /Math\.random\(\) \* 2 - 1/);
  assert.match(audio, /k-55-artillery\.flac/);
  assert.match(audio, /underwater-explosion\.wav/);
  assert.match(audio, /sonar-sweep-beep\.wav/);
  assert.match(audio, /SAMPLE_EFFECTS/);
  assert.match(audio, /MUSIC_PATH = "\/assets\/audio\/music\/ocean-theme\.mp3"/);
  assert.match(html, /不同操作具有独立的辨识音效/);
  assert.match(html, /id="effects-volume"/);
  assert.match(html, /id="music-volume"/);
});

test("v1.3.3 音效映射引用的本地素材全部随发布包存在", () => {
  const sampleFiles = [...audio.matchAll(/sample\("([^"]+\.(?:wav|ogg|mp3|flac))"/g)]
    .map((match) => match[1]);
  assert.ok(sampleFiles.length >= 35, "真实素材映射数量不足");
  for (const file of new Set(sampleFiles)) {
    assert.equal(
      fs.existsSync(path.join(ROOT, "public/assets/audio/effects/source", file)),
      true,
      `缺少音效素材：${file}`,
    );
  }
});

test("v1.3.2 主音频链：压缩器母线取代直连，防止多音削波", () => {
  assert.match(audio, /createDynamicsCompressor/);
  assert.match(audio, /effectsBus/);
  assert.match(audio, /musicBus/);
  assert.match(audio, /limiter\.connect\(masterGain\)/);
  assert.match(audio, /masterGain\.connect\(audioContext\.destination\)/);
  assert.equal(/gain\.connect\(audioContext\.destination\)/.test(audio), false);
  assert.equal(/source\.connect\(audioContext\.destination\)/.test(audio), false);
});

test("v1.3.2 音效并发上限防止快速连点节点风暴", () => {
  assert.match(audio, /MAX_CONCURRENT_EFFECTS\s*=\s*12/);
  assert.match(audio, /activeEffectCount/);
  assert.match(audio, /activeEffectCount\s*>=\s*MAX_CONCURRENT_EFFECTS/);
});
