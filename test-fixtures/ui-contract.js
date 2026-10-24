"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

// Replaces only retired visual implementation contracts. Live DOM, transport,
// information projection and full-match tests continue to exercise behaviour.
function verifyUiContract(kind) {
  const html=read("public/index.html"), css=read("public/css/ocean.css");
  const battle=read("client/battle-view.js"), commands=read("client/commands.js");
  assert.match(html, /href="\/css\/ocean\.css\?v=__OCEAN_ASSET_VERSION__"/);
  assert.doesNotMatch(html, /href="\/css\/(main|v1\.6\.[01])\.css/);
  if(kind==="version") {
    const release=require("../public/js/release-config");
    assert.equal(release.version,require("../package.json").version);
    assert.equal(release.stage,require("../server/release").RELEASE_STAGE);
    assert.ok(release.assetVersion.startsWith(require('../package.json').version+'-ui2.'));
    for(const file of ["app.js","release-config.js","theme-bootstrap.js"])
      assert.ok(html.includes(`/js/${file}?v=__OCEAN_ASSET_VERSION__`));
  } else if(kind==="layout") {
    for(const selector of [".console-workspace",".fleet-panel",".action-rail",".command-dock",".battle-maps"])
      assert.ok(css.includes(selector),selector);
    assert.match(battle,/console-workspace/);
    assert.doesNotMatch(css,/\.battle-page--v\d/);
    assert.match(css,/container-type:size/);
    assert.match(css,/\.armory-plinth\{[^}]*grid-template-columns:190px minmax\(0,1fr\) 264px/);
    assert.match(css,/\.console-workspace\{display:block/);
    assert.doesNotMatch(css,/grid-template-columns:240px minmax\(0,1fr\) 304px/);
  } else if(kind==="responsive") {
    for(const text of ["max-width:1023px","max-width:700px","max-height:599px","safe-area-inset-bottom","prefers-reduced-motion","forced-colors","--map-cell:40px"])
      assert.ok(css.includes(text),text);
    assert.match(css,/\.battle-map-card\.is-mobile-active/);
    assert.match(css,/\.mobile-console-nav/);
  } else if(kind==="theme") {
    for(const theme of ["armory-ember","armory-cast","armory-ivory"]) assert.ok(css.includes(`data-theme=${theme}`)||css.includes(`data-theme="${theme}"`));
    for(const token of ["--surface-panel","--text-primary","--accent-ink","--line"]) assert.ok(css.includes(token));
    assert.match(css,/color-mix/);
  } else if(kind==="privacy") {
    const maps=read("client/battle-map.js");
    const enemy=maps.slice(maps.indexOf("function renderEnemyBoard"),maps.indexOf("function unitStateCode"));
    assert.doesNotMatch(enemy,/renderTacticalUnitArt/);
    assert.match(enemy,/enemyMapFor\(ownBattle, targetPlayerId\)/);
    assert.match(maps,/HIDDEN_RESULT_ACTIONS/);
    assert.match(maps,/visualState = "unknown"/);
  } else if(kind==="command") {
    const handle=commands.slice(commands.indexOf("function handleEnemyCell"),commands.indexOf("function validateNickname"));
    assert.doesNotMatch(handle,/openActionConfirmation\(/);
    assert.match(battle,/data-action="execute-command"/);
    assert.match(commands,/function commandIsValid/);
    assert.match(commands,/stateVersion === expectedVersion/);
    assert.match(battle,/成本只算一次/);
    assert.match(battle,/targets\.map/);
  } else if(kind==="range") {
    assert.match(read("client/command-view.js"),/左上起始格/);
    assert.match(battle,/definition\.rangeMode === 'radar'/);
    assert.match(battle,/完整范围的中心格/);
    assert.match(commands,/Data\.getTargetOptions/);
    assert.match(commands,/Data\.targetKey/);
  } else if(kind==="availability") {
    const view=read("client/command-view.js");
    assert.match(view,/Model\.deriveActionStatus\(room,definition\)/);
    assert.match(view,/ARMORY_ORDER\.map/);
    assert.match(view,/aria-describedby="armory-reason-/);
    assert.match(view,/action-disabled-reason/);
    assert.match(battle,/fleet-unit/);
  } else if(kind==="connection") {
    assert.match(battle,/实时在线/);assert.match(battle,/同步中/);assert.match(battle,/连接中断/);
    assert.match(battle,/room\.deadlines\.actionDeadlineAt/);
    assert.match(battle,/battlePlayerState/);
  } else if(kind==="salvo") {
    assert.match(battle,/final \? '' : `[\s\S]*armory-plinth[\s\S]*renderActionPanel\(room\)/);
    assert.match(battle,/confirm-final-salvo/);
    assert.match(battle,/ownSelectedDecoyId/);
    assert.match(commands,/ownSubmitted/);
  } else if(kind==="assets") {
    for(const dir of ["units","actions","feedback","layers"]) assert.ok(fs.existsSync(path.join(root,"public/assets/images/ocean-2.5d",dir)));
    assert.match(css,/ocean_deep_calm\.webp/);
    assert.match(read("client/artwork.js"),/preserveAspectRatio="xMidYMid meet"/);
    assert.match(css,/\[data-grid-row\]/);
    assert.match(css,/pointer-events:none/);
  } else throw new Error(`Unknown UI contract: ${kind}`);
}
module.exports={verifyUiContract};
