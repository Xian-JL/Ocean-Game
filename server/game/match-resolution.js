"use strict";

const { resolveAction } = require("./action-resolution");
const { settleAfterAction, ensureBattlePlaying } = require("./endgame");
const {
  createResolutionDeliveries,
} = require("./information-projection");

/**
 * 正式对局应调用此入口，而不是直接把 resolveAction 的内部结果发给客户端。
 * 返回值中的 state 仅供服务器保存；deliveriesByPlayer 的每个值只能发送给
 * 对应键名的玩家，不能把整个路由表广播给浏览器。
 */
function resolveBattleAction(battleState, actorId, intent) {
  ensureBattlePlaying(battleState);
  const resolved = resolveAction(battleState, actorId, intent);
  const settled = settleAfterAction(resolved.state, resolved.result);

  return {
    state: settled.state,
    deliveriesByPlayer: createResolutionDeliveries(
      settled.state,
      resolved.result,
    ),
  };
}

module.exports = {
  resolveBattleAction,
};
