"use strict";

/**
 * 规则与对局服务统一入口。
 *
 * Ocean-v1.3.2 继续以 rule-v1.8 为服务器权威规则基线。
 * 本修订加入三人同步双目标行动、灵活私人标记与战斗地图缩放。
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
