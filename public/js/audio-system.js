"use strict";

(function initializeOceanAudio(root) {
  const EFFECTS_KEY = "ocean.audio.effects.v1";
  const MUSIC_KEY = "ocean.audio.music.v1";
  const MUSIC_PATH = "/assets/audio/music/ocean-theme.mp3";
  let context = null;
  let effectsEnabled = readPreference(EFFECTS_KEY, true);
  let musicEnabled = readPreference(MUSIC_KEY, false);
  let music = null;

  const PATTERNS = Object.freeze({
    click: [[420, 0.035, "sine", 0.025]],
    success: [[520, 0.07, "sine", 0.045], [720, 0.11, "sine", 0.04, 0.06]],
    warning: [[310, 0.09, "triangle", 0.045], [260, 0.11, "triangle", 0.04, 0.08]],
    error: [[190, 0.12, "sawtooth", 0.04], [140, 0.16, "sawtooth", 0.035, 0.1]],
    hit: [[150, 0.055, "square", 0.055], [92, 0.14, "sine", 0.06, 0.035]],
    miss: [[560, 0.045, "sine", 0.025], [360, 0.08, "sine", 0.02, 0.045]],
    unknown: [[280, 0.08, "triangle", 0.03], [440, 0.09, "triangle", 0.025, 0.07]],
    private: [[660, 0.08, "sine", 0.03], [880, 0.13, "sine", 0.022, 0.055]],
    turn: [[392, 0.09, "sine", 0.04], [523, 0.09, "sine", 0.04, 0.08], [659, 0.16, "sine", 0.035, 0.16]],
    victory: [[392, 0.1, "triangle", 0.045], [523, 0.1, "triangle", 0.045, 0.1], [659, 0.1, "triangle", 0.045, 0.2], [784, 0.26, "triangle", 0.04, 0.3]],
    defeat: [[330, 0.12, "triangle", 0.04], [247, 0.15, "triangle", 0.04, 0.12], [165, 0.28, "triangle", 0.035, 0.27]],
  });

  function readPreference(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value === "true";
    } catch (_error) {
      return fallback;
    }
  }

  function savePreference(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (_error) {
      // 音频偏好保存失败不影响游戏。
    }
  }

  function ensureContext() {
    const AudioContextClass = root.AudioContext ?? root.webkitAudioContext;
    if (!AudioContextClass) return null;
    context ??= new AudioContextClass();
    if (context.state === "suspended") void context.resume();
    return context;
  }

  function playTone(frequency, duration, type, volume, delay = 0) {
    const audioContext = ensureContext();
    if (!audioContext) return;
    const start = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playEffect(name) {
    if (!effectsEnabled) return;
    for (const tone of PATTERNS[name] ?? PATTERNS.click) {
      playTone(...tone);
    }
  }

  function setEffectsEnabled(value) {
    effectsEnabled = Boolean(value);
    savePreference(EFFECTS_KEY, effectsEnabled);
    if (effectsEnabled) playEffect("success");
    return effectsEnabled;
  }

  function getMusic() {
    if (!music && typeof root.Audio === "function") {
      music = new root.Audio(MUSIC_PATH);
      music.loop = true;
      music.preload = "none";
      music.volume = 0.28;
    }
    return music;
  }

  async function setMusicEnabled(value) {
    const next = Boolean(value);
    const element = getMusic();
    if (!next) {
      element?.pause();
      musicEnabled = false;
      savePreference(MUSIC_KEY, false);
      return { enabled: false, available: Boolean(element) };
    }
    if (!element) {
      musicEnabled = false;
      return { enabled: false, available: false };
    }
    try {
      await element.play();
      musicEnabled = true;
      savePreference(MUSIC_KEY, true);
      return { enabled: true, available: true };
    } catch (_error) {
      musicEnabled = false;
      savePreference(MUSIC_KEY, false);
      return { enabled: false, available: false };
    }
  }

  function preferences() {
    return { effectsEnabled, musicEnabled, musicPath: MUSIC_PATH };
  }

  root.OceanAudio = Object.freeze({
    MUSIC_PATH,
    playEffect,
    preferences,
    setEffectsEnabled,
    setMusicEnabled,
  });
})(typeof globalThis === "object" ? globalThis : window);
