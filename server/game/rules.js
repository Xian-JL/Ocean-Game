"use strict";

/**
 * 规则与对局服务统一入口。
 *
 * Ocean-v1.1 以 rule-v1.5 为服务器权威规则基线。
 * 本修订实现三人回合对每名仍在局敌方玩家分别操作，并加入直升机与终局鱼雷的多目标例外。
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
