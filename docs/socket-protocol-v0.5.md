# 《海战 OCEAN》Socket.IO 协议 v0.5

> 实现版本：match-v0.5  
> 协议版本：1.2  
> 依据：rule-v1.0.md、page-flow-v1.0.md  
> 边界：本文件记录当前服务接口，不修改已冻结规则和页面流程。

## 1. 基本原则

1. 客户端只提交操作意图；房间阶段、连接状态、计时、结算、胜负和新局重置全部由服务器决定。
2. 创建、加入或恢复成功后，服务器把当前 Socket 绑定到唯一玩家席位；普通事件以绑定身份为准。
3. 房间码和公开 `playerId` 不是身份凭证。恢复座位必须使用服务器签发的私密重连凭证。
4. 每名玩家只收到为自己生成的 `room:state`；对局结束前不能取得对手秘密状态。
5. 除创建、加入、恢复和同步外，所有状态变更事件必须携带最近收到的正整数 `expectedVersion`。
6. 投降先形成持久的 `FINISHED` 终局，再允许离开；客户端不能用离开事件跳过投降结算。
7. “再来一局”只有在双方都确认且全部在线时才启动；客户端不能自行清空或复用上局状态。

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

失败同时通过 `room:error` 发送。已绑定玩家发生错误后，服务器再发送最新安全快照；客户端必须以该快照恢复界面。

## 3. 客户端事件

| 事件 | 数据 | 允许阶段与作用 |
| --- | --- | --- |
| `client:ping` | `{}` | 连接应答检查，不改变状态 |
| `room:create` | `{ nickname }` | 创建 `WAITING` 房间并签发凭证 |
| `room:join` | `{ roomCode, nickname }` | 加入单人 `WAITING` 房间并进入 `DEPLOYING` |
| `room:resume` | `{ roomCode, reconnectToken }` | 用私密凭证恢复离线席位并轮换凭证 |
| `room:sync` | `{}` | 获取当前绑定席位的最新安全快照 |
| `room:leave` | `{ expectedVersion }` | 对局前关闭房间；`FINISHED` 时只移除离开方 |
| `deployment:submit` | `{ expectedVersion, deployment }` | `DEPLOYING` 中提交完整合法部署 |
| `deployment:ready` | `{ expectedVersion }` | `DEPLOYING` 中锁定本方部署并准备 |
| `deployment:cancel-ready` | `{ expectedVersion }` | 对方尚未准备时取消本方准备 |
| `action:submit` | `{ expectedVersion, intent }` | 当前玩家提交一个正式行动 |
| `match:surrender` | `{ expectedVersion }` | 在线玩家在 `PLAYING` 中主动投降 |
| `rematch:request` | `{ expectedVersion }` | 在线玩家在 `FINISHED` 中申请再来一局 |
| `rematch:cancel` | `{ expectedVersion }` | 在线玩家在 `FINISHED` 中取消自己的申请 |

### 3.1 `match:surrender`

成功应答：

```json
{
  "ok": true,
  "data": {
    "stateVersion": 15,
    "result": {
      "outcome": "win",
      "winnerId": "player-1",
      "loserId": "player-2",
      "reason": "surrender",
      "trigger": { "kind": "forfeit" }
    }
  }
}
```

处理顺序：

1. 只接受当前绑定且在线的席位；不要求投降方是当前回合玩家。
2. 即使对手断线、房间处于 `PAUSED_ONE_OFFLINE`，在线玩家仍可投降。
3. 若正式行动已经进入 `RESOLVING`，投降请求返回 `ACTION_RESOLUTION_PENDING`；服务器先完成该行动。
4. 若行动结算已经产生更高优先级终局，后续投降会因房间不再是 `PLAYING` 而被拒绝。
5. 成功投降立即进入 `FINISHED`，双方收到相同胜负结果和完整复盘。

页面中的“投降并离开”必须严格执行两步：

1. 发送 `match:surrender` 并等待 `FINISHED` 快照；
2. 使用该快照的新版本号发送 `room:leave`。

### 3.2 `room:leave`

| 当前阶段 | 结果 |
| --- | --- |
| `WAITING`、`DEPLOYING`、`ROLLING` | 房间进入 `CLOSED`，双方解除 Socket 绑定，全部凭证失效 |
| `PLAYING` | 拒绝；必须先投降形成终局 |
| `FINAL_SALVO` | 拒绝；等待服务器完成齐射展示并进入 `FINISHED` |
| `FINISHED` | 只移除离开方；其凭证失效；留下方成为房主并进入单人 `WAITING` |
| `CLOSED` | 拒绝 |

赛后离开成功应答：

```json
{
  "ok": true,
  "data": {
    "roomCode": "ABC234",
    "stateVersion": 18,
    "remainingPlayerId": "player-1",
    "roomPhase": "WAITING"
  }
}
```

离开方收到 `room:session { active: false }`，随后不能再同步该房间。留下方保持原 Socket 绑定和私密凭证，可等待新玩家加入。若留下方当时已经离线，服务器从赛后离开转换发生时重新给予完整 120 秒 `WAITING` 恢复期。

### 3.3 再来一局

单方申请成功后，房间仍为 `FINISHED`，双方收到申请状态。申请方可发送 `rematch:cancel` 撤销。

第二方申请成功且双方在线时，服务器在同一编排链中自动进入 `DEPLOYING`。`rematch:request` 成功应答包含：

```json
{
  "ok": true,
  "data": {
    "stateVersion": 21,
    "requestedStateVersion": 20,
    "rematchStarted": true
  }
}
```

`requestedStateVersion` 是本次申请落地时的版本；`stateVersion` 是自动转换完成后的当前版本。若另一方尚未申请或有人离线，`rematchStarted` 为 `false`。

双方已经申请但有人离线时，房间保持 `FINISHED`。离线席位恢复、房间回到 `CONNECTED` 后，服务器才自动启动新局。

新局重置以下内容：

- 双方部署、准备和自动准备状态；
- 权威战场、生命值、弹药、诱饵和瘫痪状态；
- 掷骰结果、当前玩家、回合数和连续行动超时计数；
- 部署/行动计时、行动反馈、公开记录和系统记录；
- 对局开始/结束时间、上局申请状态和上局行动幂等回执。

只保留：房间码、两名玩家的 `playerId`、昵称、座位顺序、房主和各自私密凭证。新局重新开始 180 秒部署并重新掷骰。

## 4. 服务器事件

### 4.1 `system:ready`

```json
{
  "stage": "match-v0.5",
  "protocolVersion": "1.2",
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

解除绑定：

```json
{
  "active": false,
  "roomCode": null,
  "playerId": null,
  "reconnectToken": null
}
```

私密凭证不得进入 DOM、地址、日志、错误上报或另一名玩家的状态。成功恢复后必须原子替换本机旧凭证。

### 4.3 `room:state`

v0.5 在 v0.4 安全快照基础上新增：

```json
{
  "rematch": {
    "ownRequested": true,
    "opponentRequested": false,
    "requestedPlayerIds": ["player-1"]
  },
  "matchSummary": {
    "startedAt": 1000,
    "finishedAt": 6000,
    "durationMs": 5000,
    "turnCount": 3
  }
}
```

- `rematch` 是公开的赛后确认状态。进入新 `DEPLOYING` 后三项恢复为未申请。
- `matchSummary.startedAt` 和 `finishedAt` 是服务器毫秒时间戳；对局前均为 `null`。
- 对局进行中，`durationMs` 按当前 `serverNow - startedAt` 计算；终局后固定为 `finishedAt - startedAt`。
- `turnCount` 是服务器累计的正常实际行动回合数；自动跳过不增加回合数。

其余主要字段保持：

```text
roomCode、stateVersion、roomPhase、turnPhase、connectionPhase
seats                  公开席位、昵称、在线和准备状态，不含对手部署
own                    本方部署和本方连续行动超时次数
serverNow、deadlines   服务器时间和各类绝对截止时间
connection             离线玩家列表和被冻结的游戏计时
rolling、turn          掷骰与当前回合公开状态
battle                 规则引擎生成的本方安全战场视图
latestResolution       仅属于该玩家的最近结算反馈
turnEvents、systemEvents、closedReason
```

`FINISHED` 的 `battle` 继续按冻结规则公开双方完整部署、最终资源和行动复盘。

### 4.4 `room:error`

新增或本阶段重点错误码：

| 错误码 | 含义 |
| --- | --- |
| `SURRENDER_NOT_ALLOWED` | 当前不是 `PLAYING`，不能投降 |
| `ACTION_RESOLUTION_PENDING` | 已接受行动尚未完成，须先结算 |
| `PLAYER_OFFLINE` | 离线席位不能主动操作 |
| `LEAVE_NOT_ALLOWED` | 当前阶段不能直接离开 |
| `REMATCH_NOT_ALLOWED` | 当前不是 `FINISHED` |
| `REMATCH_ALREADY_REQUESTED` | 本方已经申请 |
| `REMATCH_NOT_REQUESTED` | 本方尚未申请，不能取消 |
| `REMATCH_CONFIRMATION_REQUIRED` | 尚未取得双方确认 |
| `ROOM_PAUSED` | 双方确认但仍有人离线，不能开始新局 |

通用的凭证、版本、部署和行动错误仍按 v0.4 处理。

## 5. 终局、断线与新局的关系

1. `PLAYING` 中断线仍按 v0.4 冻结当前计时；在线方可以选择继续等待或主动投降。
2. 投降成功后胜负已经固定，原 120 秒断线判负截止时间清除；离线玩家仍可用有效凭证恢复并查看结算。
3. `FINISHED` 中断线不覆盖已经产生的胜负，也不会在有人离线时启动新局。
4. 一方赛后离开时，只注销离开方凭证；留下方的座位和凭证继续有效。
5. 新玩家加入留下方的 `WAITING` 房间后，按普通加入流程进入全新 `DEPLOYING`，不继承任何上局信息。

## 6. 当前边界

match-v0.5 已完成阶段 6 的房间与对局服务闭环。尚未实现 P01～P06、O01～O05 正式页面、服务重启持久化和公网部署。

旧版接口记录保留在 `socket-protocol-v0.3.md` 与 `socket-protocol-v0.4.md`；现行实现以本文件的协议 1.2 为准。
