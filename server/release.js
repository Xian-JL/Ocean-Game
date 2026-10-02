"use strict";

const config = require("../public/js/release-config");

const RELEASE_VERSION = config.version;
const RELEASE_STAGE = config.stage;
const RULE_VERSION = config.ruleVersion;
const SOCKET_PROTOCOL_VERSION = config.socketProtocolVersion;

module.exports = Object.freeze({
  RELEASE_STAGE,
  RELEASE_VERSION,
  RULE_VERSION,
  SOCKET_PROTOCOL_VERSION,
  ASSET_VERSION: config.assetVersion,
});
