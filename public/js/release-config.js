"use strict";

(function initializeOceanReleaseConfig(root) {
  const config = Object.freeze({
    version: "1.6.2",
    stage: "Ocean-v1.6.2",
    ruleVersion: "1.8",
    socketProtocolVersion: "2.1",
    assetVersion: "1.6.2-ui2.604da58b80",
  });
  if (typeof module === "object" && module.exports) {
    module.exports = config;
  }
  if (root) root.OceanReleaseConfig = config;
})(typeof globalThis === "object" ? globalThis : this);
