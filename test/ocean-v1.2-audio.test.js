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
    this.oscillators = [];
  }

  createOscillator() {
    const oscillator = {
      type: null,
      frequency: { setValueAtTime(value) { oscillator.frequencyValue = value; } },
      connect() {},
      start(value) { oscillator.startedAt = value; },
      stop(value) { oscillator.stoppedAt = value; },
    };
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain() {
    return {
      gain: {
        setValueAtTime() {},
        exponentialRampToValueAtTime() {},
      },
      connect() {},
    };
  }

  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

test("内置音效使用 Web Audio 合成完整反馈且可独立关闭", () => {
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
  audio.setEffectsEnabled(true);
  audio.playEffect("victory");
  assert.equal(contexts.length, 1);
  assert.ok(contexts[0].oscillators.length >= 6);
  const beforeDisabled = contexts[0].oscillators.length;
  audio.setEffectsEnabled(false);
  audio.playEffect("hit");
  assert.equal(contexts[0].oscillators.length, beforeDisabled);
  dom.window.close();
});

test("背景音乐读取固定占位路径、循环播放并允许随时暂停", async () => {
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
  const enabled = await audio.setMusicEnabled(true);
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.available, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].source, audio.MUSIC_PATH);
  assert.equal(created[0].loop, true);
  assert.equal(created[0].volume, 0.28);
  assert.equal(created[0].paused, false);
  const disabled = await audio.setMusicEnabled(false);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.available, true);
  assert.equal(created[0].paused, true);
  dom.window.close();
});
