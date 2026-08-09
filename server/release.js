"use strict";

const { version } = require("../package.json");
const { SOCKET_PROTOCOL_VERSION } = require("./socket/protocol");

const RELEASE_VERSION = version;
const RELEASE_STAGE = `postlaunch-v${RELEASE_VERSION}`;
const RULE_VERSION = "1.3";

module.exports = Object.freeze({
  RELEASE_STAGE,
  RELEASE_VERSION,
  RULE_VERSION,
  SOCKET_PROTOCOL_VERSION,
});
