"use strict";

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const AUDIO_ROOT = path.join(ROOT, "public/assets/audio/effects");
const SOURCE_ROOT = path.join(AUDIO_ROOT, "source");
const RUNTIME_ROOT = path.join(AUDIO_ROOT, "runtime");
const audioSource = fs.readFileSync(path.join(ROOT, "public/js/audio-system.js"), "utf8");
const sourceFiles = [...new Set([...audioSource.matchAll(/sample\("([^"]+\.(?:wav|ogg|mp3|flac))"/g)].map((match) => match[1]))].sort();

function slugFor(file) {
  return file.replace(/^kenney_interface-sounds\//, "kenney-").replace(/\.[^.]+$/, "").replace(/_/g, "-").replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function exactSource(relativePath) {
  let current = SOURCE_ROOT;
  for (const segment of relativePath.split("/")) {
    const exact = fs.readdirSync(current).find((entry) => entry === segment);
    if (!exact) throw new Error(`音效文件大小写或路径不一致：${relativePath}`);
    current = path.join(current, exact);
  }
  return current;
}

fs.mkdirSync(RUNTIME_ROOT, { recursive: true });
const assets = {};
for (const sourceFile of sourceFiles) {
  const input = exactSource(sourceFile);
  const slug = slugFor(sourceFile);
  const common = ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-map", "0:a:0", "-vn", "-af", "aresample=async=1:first_pts=0", "-ar", "48000"];
  execFileSync("ffmpeg", [...common, "-c:a", "libvorbis", "-q:a", "5", path.join(RUNTIME_ROOT, `${slug}.ogg`)]);
  execFileSync("ffmpeg", [...common, "-c:a", "libmp3lame", "-q:a", "4", path.join(RUNTIME_ROOT, `${slug}.mp3`)]);
  assets[sourceFile] = { ogg: `runtime/${slug}.ogg`, mp3: `runtime/${slug}.mp3` };
}

const manifest = {
  version: "1.3.3.2",
  generatedAt: "release-build",
  assets,
  groups: {
    core: ["normal-click.wav", "tic-toc-click.wav", "beep-confirmation-ok.wav", "beep.wav", "kenney_interface-sounds/open_002.ogg", "kenney_interface-sounds/close_002.ogg", "kenney_interface-sounds/switch_003.ogg"],
    battle: sourceFiles.filter((file) => /artillery|cannon|motor|boat|missile|laser|shock|sonar|helicopter|explosion|splash|01\.ogg|1\.ogg/.test(file)),
    interface: sourceFiles.filter((file) => /kenney_interface|pencil|dice|fanfare|metallic/.test(file)),
  },
};
fs.writeFileSync(path.join(AUDIO_ROOT, "audio-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`已生成 ${sourceFiles.length} 组 OGG/MP3 运行音效。`);
