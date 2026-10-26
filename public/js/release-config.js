"use strict";

(function initializeOceanReleaseConfig(root) {
  const config = Object.freeze({
    version: "1.6.4",
    stage: "Ocean-v1.6.4",
    ruleVersion: "1.8",
    socketProtocolVersion: "2.1",
    assetVersion: "1.6.4-ui2.b2737ca469",
  });
  if (typeof module === "object" && module.exports) {
    module.exports = config;
  }
  if (root) root.OceanReleaseConfig = config;
})(typeof globalThis === "object" ? globalThis : this);
