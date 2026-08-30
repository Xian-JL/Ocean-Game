"use strict";

const { version } = require("../package.json");
const { SOCKET_PROTOCOL_VERSION } = require("./socket/protocol");

const RELEASE_VERSION = version;
const RELEASE_STAGE = "Ocean-v1.4.1";
const RULE_VERSION = "1.8";

module.exports = Object.freeze({
  RELEASE_STAGE,
  RELEASE_VERSION,
  RULE_VERSION,
  SOCKET_PROTOCOL_VERSION,
});
