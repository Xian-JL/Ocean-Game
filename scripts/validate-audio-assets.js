"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "public/assets/audio/effects");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "audio-manifest.json"), "utf8"));
if (manifest.version !== "1.3.3.2") throw new Error("音效清单版本错误");
const entries = Object.entries(manifest.assets ?? {});
if (entries.length < 50) throw new Error(`生产音效数量不足：${entries.length}`);
for (const [logicalName, formats] of entries) {
  for (const format of ["ogg", "mp3"]) {
    const relativePath = formats?.[format];
    const file = relativePath && path.join(root, relativePath);
    if (!relativePath?.endsWith(`.${format}`) || !fs.existsSync(file) || fs.statSync(file).size < 32) throw new Error(`${logicalName} 缺少有效 ${format.toUpperCase()}`);
  }
}
console.log(`[通过] ${entries.length} 组生产音效均包含 OGG 与 MP3。`);
