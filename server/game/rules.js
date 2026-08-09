"use strict";

/**
 * 规则与对局服务统一入口。
 *
 * postlaunch-v0.6.1 以 rule-v1.3 为服务器权威规则基线。
 * 本修订统一双人/三人流程、前后端版本信息、分级战报和赛后房间生命周期。
 */

module.exports = {
  ...require("./actions"),
  ...require("./action-state"),
  ...require("./action-validation"),
  ...require("./action-resolution"),
  ...require("./battle-state"),
  ...require("./connection"),
  ...require("./coordinates"),
  ...require("./deployment"),
  ...require("./endgame"),
  ...require("./errors"),
  ...require("./information-projection"),
  ...require("./lifecycle"),
  ...require("./match-resolution"),
  ...require("./match"),
  ...require("./random-deployment"),
  ...require("./ranges"),
  ...require("./room"),
  ...require("./room-service"),
  ...require("./timing"),
  ...require("./units"),
};
