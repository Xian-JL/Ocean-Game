"use strict";

/**
 * 规则与对局服务统一入口。
 *
 * deploy-v0.2 完整继承已验收版本的服务器权威规则、服务与页面；
 * 阶段 10 只优化渲染、可读性和部署准备，不改变冻结规则。
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
