"""Package an already built/tested release without credentials or dependencies."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
PREFIX = "Ocean-v" + VERSION
DEST = ROOT / ".release-output" / ("v" + VERSION)
DOCS = ROOT / "docs" / "releases" / ("v" + VERSION)
DEST.mkdir(parents=True, exist_ok=True)


def fingerprint(path):
    data = path.read_bytes()
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": len(data),
            "sha256": hashlib.sha256(data).hexdigest()}


runtime = []
for directory in ("client", "public", "server"):
    runtime.extend(p for p in (ROOT / directory).rglob("*") if p.is_file())
for file in ("package.json", "package-lock.json", "start.cmd", ".node-version",
             "scripts/build-ui.js", "docs/rule-v1.8.md", "docs/socket-protocol-v2.1.md"):
    runtime.append(ROOT / file)
runtime = sorted(set(runtime))
release_config = (ROOT / "public/js/release-config.js").read_text(encoding="utf-8")
asset_version = re.search(r'assetVersion: "([^"]+)"', release_config).group(1)
log = (DOCS / "acceptance.log").read_text(encoding="utf-8")
counts = {key: int(re.findall(r"ℹ " + key + r" (\d+)", log)[-1])
          for key in ("tests", "pass", "fail", "skipped")}
if counts["fail"] or counts["pass"] != counts["tests"] or counts["skipped"]:
    raise RuntimeError("Packaging requires a fully passing real release log")
baseline = json.loads((ROOT / "docs/ui-v2/baseline-manifest.json").read_text(encoding="utf-8"))
canonical = json.loads((ROOT / "docs/ui-v2/frozen-canonical-sha256.json").read_text(encoding="utf-8"))["files"]
frozen = []
for name, meta in baseline["files"].items():
    if re.match(r"^(server/(game|socket)/|public/js/(game-data|ui-model)\.js$)", name):
        normalized = (ROOT / name).read_bytes().replace(b"\r\n", b"\n")
        same = hashlib.sha256(normalized).hexdigest() == canonical[name]
        if not same:
            raise RuntimeError("Frozen rule/projection changed: " + name)
        frozen.append({"path": name, "originalSha256": meta["sha256"], "canonicalLfSha256": canonical[name], "unchanged": same})
manifest = {"productVersion": VERSION, "tag": "v" + VERSION,
            "assetVersion": asset_version, "uiSpec": "2.0", "ruleVersion": "1.8",
            "socketProtocol": "2.1", "gitParent": subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "tests": counts, "frozenFiles": frozen,
            "runtimeFiles": [fingerprint(p) for p in runtime],
            "independentAcceptance": "Not complete; see docs/ui-v2/acceptance.md",
            "sourceArchives": "GitHub provides tag source archives; runtime excludes node_modules, Git, original art and development screenshots."}
(DOCS / "build-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

with zipfile.ZipFile(DEST / (PREFIX + "-runtime.zip"), "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in runtime:
        archive.write(file, PREFIX + "/" + file.relative_to(ROOT).as_posix())
    archive.writestr(PREFIX + "/README.md", "# " + PREFIX + "\n\nRequires Node.js 24+.\n\nRun npm ci --omit=dev, then npm start. Open http://127.0.0.1:3000 . Windows users can run start.cmd.\n\nRules 1.8 / Socket 2.1. Rooms are held in memory and do not survive server restarts. Full source and evidence are available on the GitHub release.\n")

evidence = list((ROOT / "docs/ui-v2").rglob("*")) + list(DOCS.rglob("*"))
evidence += list((ROOT / "docs/training-camp").glob("core-combat*"))
with zipfile.ZipFile(DEST / (PREFIX + "-evidence.zip"), "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(set(p for p in evidence if p.is_file())):
        archive.write(file, PREFIX + "-evidence/" + file.relative_to(ROOT).as_posix())
checksums = []
for suffix in ("-runtime.zip", "-evidence.zip"):
    file = DEST / (PREFIX + suffix)
    with zipfile.ZipFile(file) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("ZIP CRC failed: " + file.name)
    checksums.append(hashlib.sha256(file.read_bytes()).hexdigest() + "  " + file.name)
(DEST / "SHA256SUMS.txt").write_text("\n".join(checksums) + "\n", encoding="ascii")
print(json.dumps({"version": VERSION, "assetVersion": asset_version, "tests": counts,
                  "frozenFiles": len(frozen), "archives": [p.name for p in DEST.glob("*.zip")]}, ensure_ascii=True))
