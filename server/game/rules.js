"use strict";

/**
 * 规则与对局服务统一入口。
 *
 * Ocean-v1.2.4 以 rule-v1.7 为服务器权威规则基线。
 * 本修订新增房间级 10×10、12×12、15×15 动态地图规则。
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
  ...require("./map-rules"),
  ...require("./match-resolution"),
  ...require("./match"),
  ...require("./random-deployment"),
  ...require("./ranges"),
  ...require("./room"),
  ...require("./room-service"),
  ...require("./timing"),
  ...require("./units"),
};
