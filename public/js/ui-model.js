"use strict";

(function initializeUiModel(root, factory) {
  const data =
    typeof module === "object" && module.exports
      ? require("./game-data")
      : root.OceanGameData;
  const api = factory(data);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.OceanUiModel = api;
  }
})(typeof globalThis === "object" ? globalThis : this, function createUiModel(data) {
  const PAGE_BY_PHASE = Object.freeze({
    WAITING: "P02",
    DEPLOYING: "P03",
    ROLLING: "P04",
    PLAYING: "P05",
    FINAL_SALVO: "P05",
    FINISHED: "P06",
    CLOSED: "O05",
  });

  const END_REASON_TEXT = Object.freeze({
    aircraft_carrier_sunk: "航空母舰被攻击摧毁",
    pirate_enemy_carrier_sunk: "海盗船攻击使敌方航空母舰沉没",
    pirate_simultaneous_carrier_sink:
      "双方航空母舰同时沉没；按海盗船特殊规则，海盗船一方获胜",
    pirate_own_carrier_sunk: "海盗船攻击仅使发动方航空母舰沉没",
    final_salvo_higher_carrier_hp:
      "终局鱼雷齐射后，航空母舰剩余生命值较高的一方获胜",
    final_salvo_tie: "终局鱼雷齐射后双方航空母舰生命值相同",
    surrender: "一方主动投降",
    three_consecutive_timeouts: "一方连续三次行动超时",
    disconnect_timeout: "一方未在 120 秒内重连",
    both_disconnected: "双方均未在 120 秒内重连，对局取消",
  });

  const CLOSED_REASON_TEXT = Object.freeze({
    disconnect_timeout_before_match: "玩家未在 120 秒内返回，房间已关闭。",
    both_disconnected: "双方均未在 120 秒内返回，房间已关闭。",
    player_left_before_match: "有玩家在对局开始前离开，房间已关闭。",
  });

  function pageForState(roomState) {
    return roomState ? PAGE_BY_PHASE[roomState.roomPhase] ?? "O05" : "P01";
  }

  function getSeat(roomState, playerId) {
    return roomState?.seats?.find((seat) => seat.playerId === playerId) ?? null;
  }

  function getOpponentSeat(roomState) {
    return roomState?.seats?.find(
      (seat) => seat.playerId !== roomState.own.playerId,
    ) ?? null;
  }

  function nicknameFor(roomState, playerId) {
    return getSeat(roomState, playerId)?.nickname ?? "未知玩家";
  }

  function formatHp(value) {
    if (typeof value !== "number") {
      return "—";
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function formatDuration(milliseconds) {
    if (typeof milliseconds !== "number" || !Number.isFinite(milliseconds)) {
      return "—";
    }
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function remainingSeconds(deadlineAt, serverNow) {
    if (
      typeof deadlineAt !== "number" ||
      typeof serverNow !== "number"
    ) {
      return null;
    }
    return Math.max(0, Math.ceil((deadlineAt - serverNow) / 1000));
  }

  function formatTarget(target) {
    if (target?.kind === "cell") {
      return target.coordinate;
    }
    if (target?.kind === "row") {
      return `${target.row} 行`;
    }
    if (target?.kind === "column") {
      return `第 ${target.column} 列`;
    }
    return "未知目标";
  }

  function availabilityIssueText(issue) {
    const map = {
      SOURCE_SUNK: "行动来源已沉没",
      SOURCE_PARALYZED: "该单位本回合不能行动",
      RESOURCE_EXHAUSTED: "弹药或使用次数已经耗尽",
      ACTION_LOCKED: "己方两艘驱逐舰均沉没后解锁",
      NO_LEGAL_TARGET: "攻击范围内没有合法目标",
    };
    return map[issue?.code] ?? issue?.message ?? "当前不可用";
  }

  function deriveActionStatus(roomState, actionDefinition) {
    const ownBattle = roomState?.battle?.own;
    const source = actionDefinition.sourceType === data.UNIT_TYPES.RADAR
      ? ownBattle?.radar
      : ownBattle?.units?.find((unit) => unit.type === actionDefinition.sourceType);
    if (!source || (typeof source.hp === "number" && source.hp <= 0)) {
      return { code: "sunk", label: "已沉没", enabled: false };
    }
    if (source.paralyzed) {
      return {
        code: "paralyzed",
        label: "瘫痪：该单位本回合不能行动",
        enabled: false,
      };
    }
    if (
      actionDefinition.initialUses !== null &&
      (ownBattle?.remainingUses?.[actionDefinition.type] ?? 0) <= 0
    ) {
      return { code: "empty", label: "弹药耗尽", enabled: false };
    }
    if (actionDefinition.type === data.ACTION_TYPES.HELICOPTER_STRAFE) {
      const destroyers = ownBattle.units.filter((unit) =>
        [data.UNIT_TYPES.DESTROYER_I, data.UNIT_TYPES.DESTROYER_II].includes(
          unit.type,
        ),
      );
      if (destroyers.length !== 2 || destroyers.some((unit) => unit.hp > 0)) {
        return {
          code: "locked",
          label: "己方两艘驱逐舰均沉没后解锁",
          enabled: false,
        };
      }
    }
    if (roomState?.turnPhase === "RESOLVING") {
      return { code: "submitting", label: "服务器正在结算", enabled: false };
    }
    if (!roomState?.turn?.canAct) {
      return { code: "waiting", label: "等待回合", enabled: false };
    }
    const availability = ownBattle?.actionAvailability?.find(
      (candidate) => candidate.actionType === actionDefinition.type,
    );
    if (availability && !availability.available) {
      return {
        code: "unavailable",
        label: availabilityIssueText(availability.issues?.[0]),
        enabled: false,
      };
    }
    if (!availability) {
      return { code: "locked", label: "提交锁定", enabled: false };
    }
    return { code: "available", label: "可用", enabled: true };
  }

  function actionResourceLabel(roomState, actionDefinition) {
    if (actionDefinition.initialUses === null) {
      return "不限次数";
    }
    const remaining =
      roomState?.battle?.own?.remainingUses?.[actionDefinition.type] ?? 0;
    return `剩余 ${remaining}/${actionDefinition.initialUses}`;
  }

  function resultForViewer(result, viewerId) {
    if (!result) {
      return { code: "unknown", title: "对局结束" };
    }
    if (result.outcome === "draw") {
      return { code: "draw", title: "平局" };
    }
    if (result.outcome === "canceled") {
      return { code: "canceled", title: "对局取消" };
    }
    return result.winnerId === viewerId
      ? { code: "win", title: "胜利" }
      : { code: "loss", title: "失败" };
  }

  function endReasonForViewer(result, viewerId) {
    if (!result) {
      return "服务器未提供终局原因。";
    }
    if (result.reason === "pirate_own_carrier_sunk") {
      return result.loserId === viewerId
        ? "海盗船攻击仅使己方航空母舰沉没"
        : "对方海盗船攻击仅使其航空母舰沉没";
    }
    return END_REASON_TEXT[result.reason] ?? `终局原因：${result.reason}`;
  }

  function publicActionText(record, roomState) {
    const nickname = nicknameFor(roomState, record.actorId);
    const target = formatTarget(record.target);
    let resultText = "";
    if (record.actionType === data.ACTION_TYPES.SUBMARINE_MISSILE) {
      return `${nickname} 使用潜射导弹攻击了 ${target}`;
    }
    if (record.actionType === data.ACTION_TYPES.SHOCK_BOMB) {
      return `${nickname} 以 ${target} 为中心使用震爆弹`;
    }
    if (record.result === "hit") {
      resultText = " · 命中";
    } else if (record.result === "miss") {
      resultText = " · 未命中";
    } else if (record.result === "underwater_signal_detected") {
      resultText = " · 探测到水下信号";
    } else if (record.result === "no_underwater_signal") {
      resultText = " · 未探测到水下信号";
    } else if (Array.isArray(record.cellResults)) {
      const hits = record.cellResults.filter((cell) => cell.result === "hit").length;
      const misses = record.cellResults.filter((cell) => cell.result === "miss").length;
      resultText = ` · 命中 ${hits} 格，未命中 ${misses} 格`;
    }
    return `${nickname} 使用${record.actionName}，目标 ${target}${resultText}`;
  }

  function turnEventText(event, roomState) {
    const nickname = nicknameFor(roomState, event.playerId);
    if (event.kind === "action_timeout") {
      return `${nickname} 行动超时`;
    }
    if (event.kind === "automatic_skip") {
      return `${nickname} 没有可用行动，本回合自动跳过`;
    }
    if (event.kind === "surrender") {
      return `${nickname} 主动投降`;
    }
    return event.message ?? "对局状态已更新";
  }

  function closedReasonText(reason) {
    return CLOSED_REASON_TEXT[reason] ?? "房间已经关闭，本机座位凭证不再有效。";
  }

  function countdownTone(seconds) {
    if (seconds === null) {
      return "idle";
    }
    if (seconds <= 10) {
      return "urgent";
    }
    if (seconds <= 30) {
      return "warning";
    }
    return "normal";
  }

  return Object.freeze({
    END_REASON_TEXT,
    PAGE_BY_PHASE,
    actionResourceLabel,
    availabilityIssueText,
    closedReasonText,
    countdownTone,
    deriveActionStatus,
    endReasonForViewer,
    formatDuration,
    formatHp,
    formatTarget,
    getOpponentSeat,
    getSeat,
    nicknameFor,
    pageForState,
    publicActionText,
    remainingSeconds,
    resultForViewer,
    turnEventText,
  });
});
