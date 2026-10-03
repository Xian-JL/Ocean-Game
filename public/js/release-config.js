"use strict";

(function initializeOceanReleaseConfig(root) {
  const config = Object.freeze({
    version: "1.6.1",
    stage: "Ocean-v1.6.1",
    ruleVersion: "1.8",
    socketProtocolVersion: "2.1",
    assetVersion: "1.6.1.3",
  });
  if (typeof module === "object" && module.exports) {
    module.exports = config;
  }
  if (root) root.OceanReleaseConfig = config;
})(typeof globalThis === "object" ? globalThis : this);
