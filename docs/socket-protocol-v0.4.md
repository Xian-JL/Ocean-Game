# 《海战 OCEAN》Socket.IO 协议 v0.4

> 实现版本：match-v0.4  
> 协议版本：1.1  
> 依据：rule-v1.0.md、page-flow-v1.0.md  
> 边界：本文件记录当前服务接口，不修改已冻结规则和页面流程。

## 1. 基本原则

1. 客户端只提交操作意图；房间阶段、连接状态、剩余时间、结算和胜负全部由服务器决定。
2. 创建或加入成功后，服务器把当前 Socket 绑定到唯一玩家席位。
3. 后续普通事件以 Socket 绑定身份为准；请求中的 `playerId` 不能改变实际操作人。
4. 房间码只用于定位房间，公开的 `playerId` 只用于界面识别；二者都不是重连凭证。
5. 每名玩家拥有服务器签发的独立私密重连凭证。服务端只保存其 SHA-256 摘要，不把原文写入房间状态、错误详情或日志。
6. 每名玩家只收到服务器为自己生成的 `room:state`，不能取得对手秘密状态。
7. 除创建、加入、恢复和同步外，状态变更请求必须携带最近收到的 `expectedVersion`。

## 2. 通用应答

客户端事件均可携带 Socket.IO acknowledge 回调。

成功：

```json
{
  "ok": true,
  "data": {}
}
```

失败：

```json
{
  "ok": false,
  "error": {
    "code": "STATE_VERSION_CONFLICT",
    "message": "客户端状态已过期，请先同步最新状态。",
    "details": {}
  }
}
```

失败同时通过 `room:error` 发送。已绑定玩家发生错误时，服务器随后再发送最新安全快照；客户端必须以服务器快照恢复界面。

## 3. 客户端事件

| 事件 | 数据 | 说明 |
| --- | --- | --- |
| `client:ping` | `{}` | 连接应答检查，不改变状态 |
| `room:create` | `{ nickname }` | 创建房间、绑定房主席位并签发凭证 |
| `room:join` | `{ roomCode, nickname }` | 加入可进入的房间、绑定第二席位并签发凭证 |
| `room:resume` | `{ roomCode, reconnectToken }` | 使用本机私密凭证恢复离线席位；不接受可信 `playerId` |
| `room:sync` | `{}` | 重新取得当前连接对应的安全快照 |
| `room:leave` | `{ expectedVersion }` | 仅用于正式对局前离开；关闭当前房间 |
| `deployment:submit` | `{ expectedVersion, deployment }` | 提交一整套完整合法部署 |
| `deployment:ready` | `{ expectedVersion }` | 锁定本方部署并准备 |
| `deployment:cancel-ready` | `{ expectedVersion }` | 对方尚未准备时取消本方准备 |
| `action:submit` | `{ expectedVersion, intent }` | 当前玩家提交一个正式行动 |

`room:resume` 的成功应答示例：

```json
{
  "ok": true,
  "data": {
    "roomCode": "ABC234",
    "playerId": "server-generated-player-id",
    "reconnectToken": "new-rotated-private-token",
    "stateVersion": 12,
    "disconnectResolved": false
  }
}
```

凭证成功使用一次后立即轮换。客户端必须原子替换本机旧凭证，旧凭证不能再次恢复座位。

`intent` 与 v0.3 相同。网络重试同一行动时必须复用完全相同的 `actionId` 和行动内容；服务器返回第一次结算产生的安全结果，不重复扣血或消耗弹药。

## 4. 服务器事件

### 4.1 `system:ready`

```json
{
  "stage": "match-v0.4",
  "protocolVersion": "1.1",
  "connectedAt": "2026-08-07T00:00:00.000Z"
}
```

### 4.2 `room:session`

创建、加入或恢复成功：

```json
{
  "active": true,
  "roomCode": "ABC234",
  "playerId": "server-generated-player-id",
  "reconnectToken": "private-token-only-for-this-device"
}
```

这是服务器主动发送私密凭证的唯一事件。创建、加入和恢复的 acknowledge 为便于调用方落盘，也返回相同的新凭证。客户端不得把凭证写入 DOM、地址、日志、错误上报或发给另一玩家。

对局前主动离开并解除绑定后：

```json
{
  "active": false,
  "roomCode": null,
  "playerId": null,
  "reconnectToken": null
}
```

### 4.3 `room:state`

每次成功变更后按玩家分别发送。连接相关主要字段如下：

```json
{
  "connectionPhase": "PAUSED_ONE_OFFLINE",
  "seats": [
    { "playerId": "player-1", "nickname": "甲方", "online": true },
    { "playerId": "player-2", "nickname": "乙方", "online": false }
  ],
  "serverNow": 21000,
  "deadlines": {
    "deploymentDeadlineAt": null,
    "actionDeadlineAt": null,
    "reconnectDeadlineAtByPlayer": {
      "player-2": 141000
    }
  },
  "connection": {
    "offlinePlayerIds": ["player-2"],
    "pausedTimer": {
      "kind": "action",
      "remainingMs": 70000
    }
  }
}
```

`pausedTimer` 只表示服务器冻结的计时种类和剩余毫秒数。它不是绝对截止时间；只要仍有玩家离线，就不会减少。双方全部在线后，服务器清除它，并按 `serverNow + remainingMs` 生成新的部署或行动截止时间。

完整快照还包括：

```text
roomCode、stateVersion、roomPhase、turnPhase、connectionPhase
seats                  双方公开席位与在线状态，不含部署
own                    本方部署和本方连续行动超时次数
serverNow、deadlines   服务器时间、游戏截止时间和各离线席位重连截止时间
connection             离线玩家列表和冻结计时
rolling、turn          掷骰和当前回合公开状态
battle                 规则引擎生成的本方安全战场视图
latestResolution       仅属于该玩家的最近结算反馈
turnEvents、systemEvents、closedReason
```

私密重连凭证绝不属于 `room:state`。客户端只接受版本不小于当前版本的快照，忽略较旧的迟到消息。

### 4.4 `room:error`

与失败 acknowledge 的 `error` 相同。重连相关错误包括：

| 错误码 | 含义 |
| --- | --- |
| `INVALID_RECONNECT_CREDENTIAL` | 凭证缺失、格式错误、已轮换或不属于该房间 |
| `RECONNECT_DEADLINE_EXPIRED` | 服务器收到恢复请求时已到该席位截止时刻 |
| `SEAT_ALREADY_ONLINE` | 该凭证对应席位仍由在线 Socket 占用 |
| `ROOM_CLOSED` | 房间已经关闭，不能恢复 |
| `ROOM_PAUSED` | 有玩家离线，当前游戏操作被阻塞 |

重连错误不回显提交的凭证。

## 5. 断线、冻结与恢复

### 5.1 首位玩家断线

服务器在收到 Socket 断开事件时：

1. 把该席位标记为离线，并记录 `disconnectedAt`；
2. 生成该席位自己的 `reconnectDeadlineAt = disconnectedAt + 120000`；
3. 若为 DEPLOYING，保存部署计时剩余毫秒并清除绝对部署截止时间；
4. 若为 PLAYING / ACTIVE，保存行动计时剩余毫秒并清除绝对行动截止时间；
5. 进入 `PAUSED_ONE_OFFLINE`，阻塞部署、准备、行动和自动阶段推进；
6. 向仍在线玩家发送新的安全快照。

### 5.2 第二名玩家断线

第二名玩家取得自己的断线时间和 120 秒截止时间，房间进入 `PAUSED_BOTH_OFFLINE`。已经冻结的游戏计时保持原值，不会再次扣减或重新计算。

### 5.3 恢复

1. 新 Socket 发送房间码和本机私密凭证；
2. 服务器用凭证摘要定位席位，不信任客户端传入的玩家 ID；
3. 请求必须早于该席位截止时刻；截止时刻本身已算超时；
4. 服务器把席位标记为在线并轮换凭证；
5. 若另一名玩家仍离线，房间继续暂停；
6. 若双方均在线，服务器从冻结的剩余毫秒生成新绝对截止时间，并继续自动状态编排；
7. 若冻结时间已经为零，恢复后立即按原部署或行动超时规则处理；
8. 恢复方收到完整的本方安全快照，不回滚、不重放已接受行动。

浏览器状态页使用同一设备的 `localStorage` 保存 `{ roomCode, reconnectToken }`，Socket 重建或刷新时自动发送 `room:resume`。首版没有账号系统，不提供跨设备查找或找回凭证。

## 6. 断线截止裁决

服务器默认每 250 毫秒扫描一次。房间暂停时只扫描断线截止时间，不处理部署或行动计时。

| 场景 | 裁决 |
| --- | --- |
| WAITING、DEPLOYING、ROLLING 中一方在线、另一方超时 | `CLOSED`，不判胜负 |
| PLAYING、FINAL_SALVO 中一方在线、另一方超时 | `FINISHED`，断线方判负 |
| 两人都离线，但只有一人的截止时间到达 | 继续保留，不提前裁决 |
| 两人都离线且各自截止时间都到达，对局尚未开始 | `CLOSED`，不判胜负 |
| 两人都离线且各自截止时间都到达，对局已经开始 | `CLOSED`，结果为取消且无胜方 |
| 一方按时恢复，另一离线方此前已经超时 | 立即按当前在线人数关闭或判负 |

FINAL_SALVO 是对局开始后的展示阶段。展示完成前发生单方断线超时，以断线判负覆盖尚未展示完的齐射胜负，但保留齐射记录供服务器审计。

## 7. 原子行动与自动阶段

- 服务器接受行动后，在同一服务端处理链中完成 `RESOLVING`；断线不能回滚、取消或重复行动。
- 若行动结算后仍应继续对局，但房间已经暂停，下一 ACTIVE 回合以完整 90 秒冻结，直到双方在线。
- ROLLING、AUTO_SKIPPING 和 FINAL_SALVO 的自动推进在断线时停止，重连后从服务器确认状态继续。
- 已接受攻击若按更高优先级产生终局，先采用该攻击结果，不再改判为随后发生的断线超时。

## 8. 当前边界

match-v0.4 尚未实现：

- 正式对局投降与离开编排；
- “再来一局”和房主转移；
- P01～P06、O01～O05 正式界面；
- 服务重启后的房间和凭证持久化。

旧版接口记录保留在 `socket-protocol-v0.3.md`；现行实现以本文件的协议 1.1 为准。
