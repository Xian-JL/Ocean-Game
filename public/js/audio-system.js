"use strict";

(function initializeOceanAudio(root) {
  const EFFECTS_KEY = "ocean.audio.effects.v1";
  const MUSIC_KEY = "ocean.audio.music.v1";
  const EFFECTS_VOLUME_KEY = "ocean.audio.effects-volume.v1";
  const MUSIC_VOLUME_KEY = "ocean.audio.music-volume.v1";
  const MUSIC_PATH = "/assets/audio/music/ocean-theme.mp3";
  const EFFECT_LIBRARY_VERSION = "3.1";
  const EFFECT_ROOT = "/assets/audio/effects";
  const EFFECT_MANIFEST_PATH = `${EFFECT_ROOT}/audio-manifest.json?v=1.3.3.2`;
  const MAX_CONCURRENT_EFFECTS = 12;
  let context = null;
  let masterChain = null;
  let activeEffectCount = 0;
  let effectsEnabled = readPreference(EFFECTS_KEY, true);
  let musicEnabled = readPreference(MUSIC_KEY, false);
  let effectsVolume = readVolumePreference(EFFECTS_VOLUME_KEY, 1);
  let musicVolume = readVolumePreference(MUSIC_VOLUME_KEY, 0.28);
  let music = null;
  const decodedSamples = new Map();
  const pendingSamples = new Map();
  let manifestPromise = null;

  function tone(frequency, endFrequency, duration, wave, gain, delay = 0) {
    return Object.freeze({
      kind: "tone",
      frequency,
      endFrequency,
      duration,
      wave,
      gain,
      delay,
    });
  }

  function noise(duration, gain, delay = 0, filterFrequency = 900) {
    return Object.freeze({
      kind: "noise",
      duration,
      gain,
      delay,
      filterFrequency,
    });
  }

  /*
   * 每个名称代表一个明确的产品语义。所有战斗武器使用“发射/操作”声，
   * 不根据隐藏命中结果改变声音，避免音效绕过信息投影规则。
   */
  const PATTERNS = Object.freeze({
    click: [tone(520, 430, 0.055, "sine", 0.035)],
    ui_select: [tone(420, 610, 0.075, "triangle", 0.045)],
    panel_open: [tone(260, 520, 0.13, "sine", 0.04), tone(520, 680, 0.09, "triangle", 0.025, 0.055)],
    panel_close: [tone(620, 300, 0.11, "sine", 0.035)],
    confirm: [tone(440, 660, 0.1, "triangle", 0.05), tone(660, 880, 0.12, "sine", 0.035, 0.065)],
    cancel: [tone(430, 250, 0.1, "triangle", 0.04)],
    copy: [tone(720, 920, 0.06, "sine", 0.04), tone(920, 1120, 0.07, "sine", 0.03, 0.045)],
    room_create: [tone(220, 440, 0.16, "sine", 0.045), tone(440, 660, 0.15, "triangle", 0.04, 0.11)],
    room_join: [tone(330, 520, 0.1, "sine", 0.04), tone(520, 780, 0.14, "sine", 0.035, 0.08)],
    reconnect: [tone(240, 360, 0.12, "triangle", 0.035), tone(480, 720, 0.16, "sine", 0.04, 0.1)],
    map_switch: [tone(360, 480, 0.065, "triangle", 0.035), tone(480, 420, 0.055, "triangle", 0.025, 0.05)],
    log_switch: [tone(760, 640, 0.055, "sine", 0.025)],

    place: [noise(0.07, 0.035, 0, 1500), tone(170, 120, 0.1, "triangle", 0.055)],
    move: [tone(230, 390, 0.12, "sine", 0.035), tone(390, 280, 0.08, "triangle", 0.025, 0.08)],
    rotate: [tone(300, 520, 0.08, "triangle", 0.035), tone(520, 300, 0.08, "triangle", 0.035, 0.07)],
    remove: [noise(0.065, 0.025, 0, 1900), tone(300, 140, 0.09, "sine", 0.035)],
    undo: [tone(620, 380, 0.08, "sine", 0.035), tone(380, 520, 0.1, "sine", 0.03, 0.065)],
    randomize: [tone(260, 520, 0.08, "triangle", 0.035), tone(390, 780, 0.08, "triangle", 0.035, 0.055), tone(520, 1040, 0.11, "triangle", 0.03, 0.11)],
    ready: [tone(330, 495, 0.11, "triangle", 0.045), tone(495, 660, 0.13, "triangle", 0.045, 0.085), tone(660, 990, 0.18, "sine", 0.035, 0.17)],
    dice_roll: [noise(0.16, 0.045, 0, 2600), tone(190, 310, 0.08, "square", 0.025, 0.03), tone(260, 410, 0.08, "square", 0.025, 0.1)],
    marker_add: [tone(680, 880, 0.075, "sine", 0.04)],
    marker_remove: [tone(760, 390, 0.085, "sine", 0.035)],
    target_lock: [tone(860, 860, 0.045, "square", 0.035), tone(1160, 1160, 0.07, "sine", 0.04, 0.065)],

    attack_destroyer_i: [noise(0.13, 0.055, 0, 720), tone(115, 68, 0.25, "sawtooth", 0.06), tone(78, 52, 0.22, "sine", 0.055, 0.08)],
    attack_destroyer_ii: [noise(0.18, 0.06, 0, 620), tone(98, 48, 0.34, "sawtooth", 0.065), tone(65, 42, 0.3, "sine", 0.06, 0.09)],
    attack_pirate: [noise(0.2, 0.075, 0, 800), tone(92, 52, 0.32, "square", 0.055), tone(180, 105, 0.13, "sawtooth", 0.035, 0.04)],
    attack_motorboat: [tone(95, 340, 0.34, "sawtooth", 0.04), tone(340, 150, 0.16, "triangle", 0.035, 0.26), noise(0.08, 0.035, 0.27, 1300)],
    attack_missile: [noise(0.22, 0.045, 0, 1100), tone(120, 780, 0.42, "sawtooth", 0.045), tone(260, 1040, 0.3, "sine", 0.025, 0.12)],
    attack_nuclear: [tone(220, 220, 0.07, "square", 0.04), tone(220, 220, 0.07, "square", 0.04, 0.12), tone(110, 38, 0.48, "sawtooth", 0.06, 0.24), noise(0.38, 0.075, 0.27, 420)],
    attack_shock: [tone(180, 920, 0.18, "sawtooth", 0.045), tone(880, 210, 0.17, "square", 0.04, 0.13), tone(240, 1180, 0.16, "triangle", 0.035, 0.25)],
    attack_detection: [tone(1180, 760, 0.14, "sine", 0.045), tone(1180, 760, 0.14, "sine", 0.035, 0.22)],
    attack_helicopter: [tone(72, 88, 0.36, "sawtooth", 0.045), noise(0.055, 0.05, 0.08, 1700), noise(0.055, 0.05, 0.17, 1700), noise(0.055, 0.05, 0.26, 1700)],
    attack_radar: [tone(920, 440, 0.42, "sine", 0.05), tone(690, 330, 0.38, "sine", 0.03, 0.13)],
    final_salvo: [tone(135, 610, 0.32, "sawtooth", 0.05), noise(0.16, 0.055, 0.23, 650), tone(74, 42, 0.32, "sine", 0.055, 0.25)],

    tutorial_step: [tone(520, 660, 0.08, "sine", 0.045), tone(660, 880, 0.11, "triangle", 0.035, 0.07)],
    tutorial_complete: [tone(392, 523, 0.11, "triangle", 0.045), tone(523, 659, 0.11, "triangle", 0.045, 0.1), tone(659, 988, 0.2, "sine", 0.04, 0.2)],
    success: [tone(520, 720, 0.1, "sine", 0.05), tone(720, 960, 0.14, "triangle", 0.04, 0.08)],
    warning: [tone(360, 250, 0.12, "triangle", 0.055), tone(310, 210, 0.14, "square", 0.04, 0.11)],
    error: [noise(0.1, 0.05, 0, 520), tone(180, 95, 0.22, "sawtooth", 0.06), tone(135, 70, 0.2, "square", 0.045, 0.13)],
    hit: [noise(0.11, 0.065, 0, 760), tone(145, 58, 0.24, "square", 0.065), tone(82, 45, 0.28, "sine", 0.06, 0.04)],
    miss: [tone(680, 320, 0.13, "sine", 0.04), tone(470, 230, 0.12, "triangle", 0.028, 0.09)],
    unknown: [tone(280, 520, 0.12, "triangle", 0.04), tone(520, 310, 0.14, "sine", 0.035, 0.1)],
    private: [tone(760, 980, 0.11, "sine", 0.04), tone(980, 760, 0.13, "sine", 0.03, 0.09)],
    turn: [tone(392, 523, 0.11, "sine", 0.05), tone(523, 659, 0.11, "sine", 0.05, 0.1), tone(659, 988, 0.2, "triangle", 0.045, 0.2)],
    pause: [tone(420, 210, 0.22, "triangle", 0.045), tone(315, 157, 0.24, "sine", 0.035, 0.16)],
    eliminated: [noise(0.16, 0.055, 0, 580), tone(260, 95, 0.34, "sawtooth", 0.055)],
    victory: [tone(392, 523, 0.14, "triangle", 0.055), tone(523, 659, 0.14, "triangle", 0.055, 0.13), tone(659, 784, 0.14, "triangle", 0.055, 0.26), tone(784, 1047, 0.34, "sine", 0.05, 0.39), noise(0.16, 0.025, 0.44, 2600)],
    defeat: [tone(330, 247, 0.18, "triangle", 0.05), tone(247, 165, 0.21, "triangle", 0.05, 0.16), tone(165, 72, 0.42, "sawtooth", 0.045, 0.34), noise(0.2, 0.035, 0.36, 480)],
  });
  const EFFECT_NAMES = Object.freeze(Object.keys(PATTERNS));

  function sample(file, gain = 1, delay = 0, offset = 0, duration = null, playbackRate = 1) {
    return Object.freeze({ file, gain, delay, offset, duration, playbackRate });
  }

  const KENNEY = `${EFFECT_ROOT}/kenney_interface-sounds`;
  const SAMPLE_EFFECTS = Object.freeze({
    click: [sample("normal-click.wav", 0.48)],
    ui_select: [sample("tic-toc-click.wav", 0.52)],
    panel_open: [sample("kenney_interface-sounds/open_002.ogg", 0.52)],
    panel_close: [sample("kenney_interface-sounds/close_002.ogg", 0.5)],
    confirm: [sample("beep-confirmation-ok.wav", 0.42)],
    cancel: [sample("kenney_interface-sounds/back_002.ogg", 0.48)],
    copy: [sample("beep.wav", 0.38)],
    room_create: [sample("kenney_interface-sounds/maximize_004.ogg", 0.48), sample("beep-confirmation-ok.wav", 0.3, 0.12)],
    room_join: [sample("kenney_interface-sounds/open_003.ogg", 0.48), sample("beep-confirmation-ok.wav", 0.28, 0.1)],
    reconnect: [sample("kenney_interface-sounds/glitch_002.ogg", 0.28), sample("beep-confirmation-ok.wav", 0.4, 0.13)],
    map_switch: [sample("kenney_interface-sounds/scroll_002.ogg", 0.43)],
    log_switch: [sample("kenney_interface-sounds/select_003.ogg", 0.42)],
    place: [sample("kenney_interface-sounds/drop_003.ogg", 0.5), sample("metallic-clunk.wav", 0.2)],
    move: [sample("kenney_interface-sounds/scroll_004.ogg", 0.4)],
    rotate: [sample("kenney_interface-sounds/switch_003.ogg", 0.48)],
    remove: [sample("kenney_interface-sounds/minimize_004.ogg", 0.45)],
    undo: [sample("kenney_interface-sounds/back_003.ogg", 0.48)],
    randomize: [sample("kenney_interface-sounds/switch_006.ogg", 0.42), sample("kenney_interface-sounds/drop_001.ogg", 0.3, 0.08)],
    ready: [sample("kenney_interface-sounds/confirmation_002.ogg", 0.5)],
    dice_roll: [sample("dice-rolling-dungeon-and-dragons.wav", 0.42, 0, 0, 1.25)],
    marker_add: [sample("pencil-writing-on-paper.mp3", 0.48, 0, 0, 0.55)],
    marker_remove: [sample("pencil-scribble-on-paper.mp3", 0.48, 0, 0, 0.48, 1.08)],
    target_lock: [sample("beep.wav", 0.4), sample("kenney_interface-sounds/tick_004.ogg", 0.32, 0.08)],
    attack_destroyer_i: [sample("k-55-artillery.flac", 0.72, 0, 0, 4.8)],
    attack_destroyer_ii: [sample("k-55-artillery.flac", 0.78, 0, 0, 4.8, 0.88)],
    attack_pirate: [sample("retro-pirate-cannon-shot.wav", 0.72)],
    attack_motorboat: [sample("speedboat-loop.wav", 0.45, 0, 0, 1.45, 1.05), sample("boat-engine-on-water-sound-effect.wav", 0.5, 0.5), sample("metallic-clunk.wav", 0.48, 1.0), sample("water-splash-1.flac", 0.34, 1.02, 0, 1.3)],
    attack_missile: [sample("01.ogg", 0.66, 0, 0, 2.8), sample("1.ogg", 0.58, 0.38), sample("underwater-explosion.wav", 0.58, 0, 0, 1.25), sample("water-splash-2.flac", 0.42, 1.0, 0, 0.85)],
    attack_nuclear: [sample("c-ram-warning-sound-loops.mp3", 0.48), sample("missile-launcher-explosion-only.wav", 0.74, 0.62)],
    attack_shock: [sample("charged-laser.mp3", 0.38, 0, 0, 3.35, 1.3), sample("electrical-shock-zap.wav", 0.62, 2.35, 0, 1.25), sample("electric-shock-3-hit.wav", 0.5, 2.48)],
    attack_detection: [sample("sonar-ping.wav", 0.52, 0, 0, 1.55)],
    attack_helicopter: [sample("helicopter-rotor-loop.flac", 0.58, 0, 0, 2.25)],
    attack_radar: [sample("sonar-sweep-beep.wav", 0.45), sample("submarine-sonar.wav", 0.58, 0.2, 0.22, 1.1)],
    final_salvo: [sample("01.ogg", 0.58, 0, 0, 2.8), sample("underwater-explosion.wav", 0.5, 0.12, 0, 1.5)],
    tutorial_step: [sample("kenney_interface-sounds/confirmation_001.ogg", 0.42)],
    tutorial_complete: [sample("fanfare-rpg.wav", 0.48)],
    success: [sample("kenney_interface-sounds/confirmation_003.ogg", 0.46)],
    warning: [sample("c-ram-warning-sound-loops.mp3", 0.38, 0, 0, 0.55)],
    error: [sample("kenney_interface-sounds/error_003.ogg", 0.52)],
    hit: [sample("metallic-clunk.wav", 0.58)],
    miss: [sample("water-splash-2.flac", 0.48, 0, 0, 1.15)],
    unknown: [sample("kenney_interface-sounds/question_002.ogg", 0.45)],
    private: [sample("kenney_interface-sounds/glass_003.ogg", 0.42)],
    turn: [sample("kenney_interface-sounds/switch_003.ogg", 0.42), sample("beep-confirmation-ok.wav", 0.4, 0.12)],
    pause: [sample("kenney_interface-sounds/minimize_006.ogg", 0.46)],
    eliminated: [sample("metallic-clunk.wav", 0.5), sample("kenney_interface-sounds/error_007.ogg", 0.42, 0.18)],
    victory: [sample("fanfare-3-rpg.wav", 0.52)],
    defeat: [sample("kenney_interface-sounds/error_008.ogg", 0.48), sample("metallic-clunk.wav", 0.32, 0.14, 0, 0.8, 0.78)],
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

  function normalizeVolume(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.min(1, Math.max(0, number));
  }

  function readVolumePreference(key, fallback) {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null || !Number.isFinite(Number(stored))) return fallback;
      return normalizeVolume(stored);
    } catch (_error) {
      return fallback;
    }
  }

  function ensureContext() {
    const AudioContextClass = root.AudioContext ?? root.webkitAudioContext;
    if (!AudioContextClass) return null;
    context ??= new AudioContextClass();
    if (context.state === "suspended") void context.resume();
    return context;
  }

  /*
   * 主音频链：effectsBus / musicBus → DynamicsCompressor → masterGain → destination。
   * 压缩器防止多音叠加削波；后续空间化、混响与 ducking 都挂接到对应总线。
   */
  function ensureMasterChain() {
    const audioContext = ensureContext();
    if (!audioContext || typeof audioContext.createDynamicsCompressor !== "function") {
      return null;
    }
    if (masterChain) return masterChain;
    const masterGain = audioContext.createGain();
    masterGain.gain.value = 1;
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 20;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    const effectsBus = audioContext.createGain();
    effectsBus.gain.value = 1;
    const musicBus = audioContext.createGain();
    musicBus.gain.value = 1;
    effectsBus.connect(limiter);
    musicBus.connect(limiter);
    limiter.connect(masterGain);
    masterGain.connect(audioContext.destination);
    masterChain = { masterGain, limiter, effectsBus, musicBus };
    return masterChain;
  }

  function applyEnvelope(gainNode, start, duration, volume) {
    const peak = Math.max(0.0001, volume * effectsVolume);
    const attackEnd = start + Math.min(0.012, duration * 0.2);
    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(peak, attackEnd);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  }

  function playTone(note) {
    const audioContext = ensureContext();
    if (!audioContext) return;
    const start = audioContext.currentTime + note.delay;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = note.wave;
    oscillator.frequency.setValueAtTime(note.frequency, start);
    if (note.endFrequency !== note.frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, note.endFrequency),
        start + note.duration,
      );
    }
    applyEnvelope(gain, start, note.duration, note.gain);
    oscillator.connect(gain);
    gain.connect(ensureMasterChain()?.effectsBus ?? audioContext.destination);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.025);
  }

  function playNoise(note) {
    const audioContext = ensureContext();
    if (
      !audioContext ||
      typeof audioContext.createBuffer !== "function" ||
      typeof audioContext.createBufferSource !== "function"
    ) {
      playTone(tone(90, 42, note.duration, "sawtooth", note.gain, note.delay));
      return;
    }
    const sampleRate = audioContext.sampleRate || 44_100;
    const frameCount = Math.max(1, Math.floor(sampleRate * note.duration));
    const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index += 1) {
      channel[index] = Math.random() * 2 - 1;
    }
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    const filter = typeof audioContext.createBiquadFilter === "function"
      ? audioContext.createBiquadFilter()
      : null;
    const start = audioContext.currentTime + note.delay;
    source.buffer = buffer;
    if (filter) {
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(note.filterFrequency, start);
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.connect(gain);
    }
    applyEnvelope(gain, start, note.duration, note.gain);
    gain.connect(ensureMasterChain()?.effectsBus ?? audioContext.destination);
    source.start(start);
    source.stop(start + note.duration + 0.025);
  }

  function versionedAssetUrl(relativePath) {
    return `${EFFECT_ROOT}/${relativePath}?v=1.3.3.2`;
  }

  function loadManifest() {
    if (manifestPromise) return manifestPromise;
    if (typeof root.fetch !== "function") return Promise.resolve(null);
    manifestPromise = root.fetch(EFFECT_MANIFEST_PATH, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`audio manifest ${response.status}`);
        return response.json();
      })
      .then((manifest) => manifest?.version === "1.3.3.2" ? manifest : null)
      .catch(() => null);
    return manifestPromise;
  }

  async function decodeCandidate(audioContext, relativePath) {
    const response = await root.fetch(versionedAssetUrl(relativePath), { cache: "force-cache" });
    if (!response.ok) throw new Error(`audio ${response.status}`);
    return audioContext.decodeAudioData(await response.arrayBuffer());
  }

  async function loadSample(file) {
    if (decodedSamples.has(file)) return decodedSamples.get(file);
    if (pendingSamples.has(file)) return pendingSamples.get(file);
    const audioContext = ensureContext();
    if (!audioContext || typeof root.fetch !== "function" || typeof audioContext.decodeAudioData !== "function") {
      return null;
    }
    const pending = loadManifest()
      .then(async (manifest) => {
        const entry = manifest?.assets?.[file];
        const candidates = entry ? [entry.ogg, entry.mp3] : [`source/${file}`];
        for (const candidate of candidates) {
          try {
            return await decodeCandidate(audioContext, candidate);
          } catch (_error) {
            // OGG 不可用时尝试 MP3；全部失败后使用合成回退。
          }
        }
        return null;
      })
      .then((buffer) => {
        if (buffer) decodedSamples.set(file, buffer);
        pendingSamples.delete(file);
        return buffer;
      })
      .catch(() => {
        pendingSamples.delete(file);
        return null;
      });
    pendingSamples.set(file, pending);
    return pending;
  }

  function playDecodedSample(layer, buffer) {
    const audioContext = ensureContext();
    const chain = ensureMasterChain();
    if (!audioContext || !chain || !buffer) return false;
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    const start = audioContext.currentTime + layer.delay;
    const available = Math.max(0.01, buffer.duration - layer.offset);
    const duration = Math.min(layer.duration ?? available, available);
    source.buffer = buffer;
    source.playbackRate.value = layer.playbackRate;
    gainNode.gain.value = Math.max(0.0001, layer.gain * effectsVolume);
    source.connect(gainNode);
    gainNode.connect(chain.effectsBus);
    source.start(start, layer.offset, duration);
    source.stop(start + duration / layer.playbackRate + 0.03);
    return true;
  }

  async function playSampleEffect(name) {
    const layers = SAMPLE_EFFECTS[name];
    if (!layers) return false;
    const buffers = await Promise.all(layers.map((layer) => loadSample(layer.file)));
    if (!effectsEnabled) return true;
    let played = false;
    for (let index = 0; index < layers.length; index += 1) {
      played = playDecodedSample(layers[index], buffers[index]) || played;
    }
    return played;
  }

  function preloadEffects() {
    const files = [...new Set(Object.values(SAMPLE_EFFECTS).flat().map((layer) => layer.file))];
    return Promise.all(files.map(loadSample));
  }

  async function preloadGroup(groupName) {
    const manifest = await loadManifest();
    const files = manifest?.groups?.[groupName] ?? [];
    return Promise.all(files.map(loadSample));
  }

  function playEffect(name) {
    if (!effectsEnabled) return;
    if (activeEffectCount >= MAX_CONCURRENT_EFFECTS) return;
    const pattern = PATTERNS[name] ?? PATTERNS.click;
    const durationMs = Math.max(0, ...pattern.map(
      (note) => (note.delay + note.duration) * 1000,
    ));
    activeEffectCount += 1;
    setTimeout(() => {
      activeEffectCount = Math.max(0, activeEffectCount - 1);
    }, durationMs + 120);
    const audioContext = ensureContext();
    if (typeof root.fetch !== "function" || typeof audioContext?.decodeAudioData !== "function") {
      for (const note of pattern) {
        if (note.kind === "noise") playNoise(note);
        else playTone(note);
      }
      return;
    }
    void playSampleEffect(name).then((played) => {
      if (played || !effectsEnabled) return;
      for (const note of pattern) {
        if (note.kind === "noise") playNoise(note);
        else playTone(note);
      }
    });
  }

  function setEffectsEnabled(value) {
    effectsEnabled = Boolean(value);
    savePreference(EFFECTS_KEY, effectsEnabled);
    if (effectsEnabled) playEffect("success");
    return effectsEnabled;
  }

  function setEffectsVolume(value) {
    effectsVolume = normalizeVolume(value);
    savePreference(EFFECTS_VOLUME_KEY, effectsVolume);
    return effectsVolume;
  }

  function getMusic() {
    if (!music && typeof root.Audio === "function") {
      music = new root.Audio(MUSIC_PATH);
      music.loop = true;
      music.preload = "none";
      music.volume = musicVolume;
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

  function setMusicVolume(value) {
    musicVolume = normalizeVolume(value);
    savePreference(MUSIC_VOLUME_KEY, musicVolume);
    if (music) music.volume = musicVolume;
    return musicVolume;
  }

  function preferences() {
    return {
      effectsEnabled,
      effectsVolume,
      musicEnabled,
      musicVolume,
      musicPath: MUSIC_PATH,
    };
  }

  root.OceanAudio = Object.freeze({
    EFFECT_LIBRARY_VERSION,
    EFFECT_NAMES,
    MUSIC_PATH,
    playEffect,
    preloadEffects,
    preloadGroup,
    preferences,
    setEffectsEnabled,
    setEffectsVolume,
    setMusicEnabled,
    setMusicVolume,
  });

  root.addEventListener?.("pointerdown", () => {
    if (effectsEnabled) void preloadGroup("core");
  }, { once: true, passive: true });
})(typeof globalThis === "object" ? globalThis : window);
