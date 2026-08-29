"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { JSDOM } = require("jsdom");

const AUDIO_SCRIPT = fs.readFileSync(
  path.resolve(__dirname, "../public/js/audio-system.js"),
  "utf8",
);

class FakeAudioContext {
  constructor() {
    this.currentTime = 4;
    this.destination = {};
    this.state = "running";
    this.sampleRate = 8_000;
    this.oscillators = [];
    this.gains = [];
    this.sources = [];
    this.filters = [];
  }

  createOscillator() {
    const oscillator = {
      type: null,
      frequency: {
        setValueAtTime(value) { oscillator.frequencyValue = value; },
        exponentialRampToValueAtTime(value, time) {
          oscillator.frequencyRamp = { value, time };
        },
      },
      connect() {},
      start(value) { oscillator.startedAt = value; },
      stop(value) { oscillator.stoppedAt = value; },
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    const gainNode = {
      ramps: [],
      gain: {
        setValueAtTime(value, time) { gainNode.ramps.push({ kind: "set", value, time }); },
        exponentialRampToValueAtTime(value, time) { gainNode.ramps.push({ kind: "ramp", value, time }); },
      },
      connect() {},
    };
    this.gains.push(gainNode);
    return gainNode;
  }

  createBuffer(_channels, length) {
    const data = new Float32Array(length);
    return { getChannelData() { return data; } };
  }

  createBufferSource() {
    const source = {
      connect() {},
      start(value) { source.startedAt = value; },
      stop(value) { source.stoppedAt = value; },
    };
    this.sources.push(source);
    return source;
  }

  createBiquadFilter() {
    const filter = {
      type: null,
      frequency: { setValueAtTime(value) { filter.frequencyValue = value; } },
      connect() {},
    };
    this.filters.push(filter);
    return filter;
  }

  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

test("内置音效使用 Web Audio 合成完整反馈、可调音量且可独立关闭", () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://127.0.0.1/",
    runScripts: "outside-only",
  });
  const contexts = [];
  dom.window.AudioContext = class extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  };
  dom.window.eval(AUDIO_SCRIPT);

  const audio = dom.window.OceanAudio;
  assert.ok(audio);
  assert.equal(audio.EFFECT_LIBRARY_VERSION, "3.1");
  audio.setEffectsEnabled(true);
  audio.playEffect("victory");
  assert.equal(contexts.length, 1);
  assert.ok(contexts[0].oscillators.length >= 6);
  const beforeDisabled = contexts[0].oscillators.length;
  audio.setEffectsEnabled(false);
  audio.playEffect("hit");
  assert.equal(contexts[0].oscillators.length, beforeDisabled);

  assert.equal(audio.setEffectsVolume(0.25), 0.25);
  assert.equal(audio.preferences().effectsVolume, 0.25);
  assert.equal(dom.window.localStorage.getItem("ocean.audio.effects-volume.v1"), "0.25");
  audio.setEffectsEnabled(true);
  const gainStart = contexts[0].gains.length;
  audio.playEffect("hit");
  const hitPeaks = contexts[0].gains.slice(gainStart).map((gain) =>
    Math.max(...gain.ramps.map((entry) => entry.value)),
  );
  assert.deepEqual(hitPeaks, [0.065 * 0.25, 0.065 * 0.25, 0.06 * 0.25]);
  assert.equal(audio.setEffectsVolume(-1), 0);
  assert.equal(audio.setEffectsVolume(8), 1);
  dom.window.close();
});

test("v1.3.3 为十项战斗行动提供真实素材与合成回退", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://127.0.0.1/",
    runScripts: "outside-only",
  });
  const contexts = [];
  dom.window.AudioContext = class extends FakeAudioContext {
    constructor() {
      super();
      contexts.push(this);
    }
  };
  dom.window.eval(AUDIO_SCRIPT);
  const audio = dom.window.OceanAudio;
  const actionEffects = [
    "attack_destroyer_i",
    "attack_destroyer_ii",
    "attack_pirate",
    "attack_motorboat",
    "attack_missile",
    "attack_nuclear",
    "attack_shock",
    "attack_detection",
    "attack_helicopter",
    "attack_radar",
  ];
  const interfaceEffects = [
    "panel_open",
    "panel_close",
    "confirm",
    "cancel",
    "place",
    "move",
    "rotate",
    "remove",
    "undo",
    "randomize",
    "ready",
    "dice_roll",
    "marker_add",
    "marker_remove",
    "target_lock",
    "tutorial_step",
    "tutorial_complete",
    "pause",
    "reconnect",
    "eliminated",
    "final_salvo",
  ];
  const effects = [...actionEffects, ...interfaceEffects];
  const BATCH_SIZE = 8;
  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index];
    assert.ok(audio.EFFECT_NAMES.includes(effect), `缺少音效：${effect}`);
    const before = contexts[0]?.oscillators.length ?? 0;
    audio.playEffect(effect);
    const after = contexts[0].oscillators.length;
    assert.ok(after > before, `${effect} 没有创建可听音调`);
    if ((index + 1) % BATCH_SIZE === 0) {
      await new Promise((resolve) => setTimeout(resolve, 650));
    }
  }
  assert.ok(contexts[0].sources.length >= 10, "爆炸、机械和部署音效应包含噪声层");
  dom.window.close();
});

test("背景音乐读取固定占位路径、循环播放、实时调音并允许随时暂停", async () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://127.0.0.1/",
    runScripts: "outside-only",
  });
  const created = [];
  dom.window.Audio = class FakeAudio {
    constructor(source) {
      this.source = source;
      this.paused = true;
      created.push(this);
    }

    play() {
      this.paused = false;
      return Promise.resolve();
    }

    pause() {
      this.paused = true;
    }
  };
  dom.window.eval(AUDIO_SCRIPT);

  const audio = dom.window.OceanAudio;
  assert.equal(audio.MUSIC_PATH, "/assets/audio/music/ocean-theme.mp3");
  assert.equal(audio.setMusicVolume(0.63), 0.63);
  const enabled = await audio.setMusicEnabled(true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.available, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].source, audio.MUSIC_PATH);
  assert.equal(created[0].loop, true);
  assert.equal(created[0].volume, 0.63);
  assert.equal(created[0].paused, false);
  assert.equal(audio.setMusicVolume(0.41), 0.41);
  assert.equal(created[0].volume, 0.41);
  assert.equal(dom.window.localStorage.getItem("ocean.audio.music-volume.v1"), "0.41");
  const disabled = await audio.setMusicEnabled(false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.available, true);
  assert.equal(created[0].paused, true);
  dom.window.close();
});

test("音量偏好刷新后恢复，非法存储值回退到默认值", () => {
  const dom = new JSDOM("<!doctype html><body></body>", {
    url: "http://127.0.0.1/",
    runScripts: "outside-only",
  });
  dom.window.localStorage.setItem("ocean.audio.effects-volume.v1", "0.36");
  dom.window.localStorage.setItem("ocean.audio.music-volume.v1", "not-a-number");
  dom.window.eval(AUDIO_SCRIPT);

  assert.equal(dom.window.OceanAudio.preferences().effectsVolume, 0.36);
  assert.equal(dom.window.OceanAudio.preferences().musicVolume, 0.28);
  dom.window.close();
});
