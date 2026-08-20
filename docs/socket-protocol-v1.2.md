# 《海战 OCEAN》Socket.IO 协议 v1.2

> 实现版本：Ocean-v1.2.4  
> 协议版本：1.9  
> 规则依据：rule-v1.7.md、page-flow-v1.9.md  
> 变更重点：删除行动方的敌方伤害明细，并为防守方补充己方受击前后生命值；动态地图字段继续沿用协议 1.8。

## 1. 基本原则

1. 客户端只提交操作意图；房间阶段、回合、目标进度、计时、伤害、弹药、出局与胜负全部由服务器决定。
2. 每名玩家只收到其权限范围内的 `room:state`，不得通过前端隐藏完整敌方数据。
3. 除创建、加入、恢复和同步外，所有状态变更事件必须携带最近收到的正整数 `expectedVersion`。
4. 三人局中一个玩家回合可以包含两次服务器行动，但两次共享同一个回合号与 90 秒截止时间。
5. 三人普通行动必须明确 `targetPlayerId`，且只能选择本回合 `remainingTargetPlayerIds` 中的玩家；直升机扫射为多目标例外。
6. 同一行动编号必须幂等；网络重试复用原 `actionId`，不得造成重复结算。
7. 信息投影严格区分行动方、防守方和第三方。普通攻击的行动方只能取得规则允许的命中结论，不得取得敌方单位或生命值；潜射导弹、核弹、探测弹、雷达和震爆弹继续执行各自隐藏信息规则。

## 2. 协议版本

服务器连接后发送：

```json
{
  "stage": "Ocean-v1.2.4",
  "protocolVersion": "1.9",
  "connectedAt": "2026-08-09T12:00:00.000Z"
}
```

前端发布信息应与 `Ocean-v1.2.4 / rule-v1.7 / Socket 1.9` 一致。

## 3. 通用应答

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

失败同时可以通过 `room:error` 推送。客户端必须以服务器最新安全快照恢复界面。

## 4. 客户端事件

| 事件 | 数据 | 作用 |
| --- | --- | --- |
| `client:ping` | `{}` | 连接检查 |
| `room:create` | `{ nickname, maxPlayers, roomMode?, mapSize }` | 创建 2 人、3 人或 1v1 人机房，并锁定地图档位 |
| `room:join` | `{ roomCode, nickname }` | 加入等待房间 |
| `room:resume` | `{ roomCode, reconnectToken }` | 恢复席位并轮换凭证 |
| `room:sync` | `{}` | 获取当前安全快照 |
| `room:leave` | `{ expectedVersion }` | 按当前阶段离开 |
| `deployment:submit` | `{ expectedVersion, deployment }` | 提交部署 |
| `deployment:ready` | `{ expectedVersion }` | 准备 |
| `deployment:cancel-ready` | `{ expectedVersion }` | 取消准备 |
| `match:roll-die` | `{ expectedVersion }` | ROLLING 阶段由当前玩家主动掷一次骰，点数由服务器生成 |
| `action:submit` | `{ expectedVersion, intent }` | 提交一项正式行动；三人普通行动一次只完成一名敌人 |
| `final-salvo:submit` | `{ expectedVersion, decoyId }` | 每轮秘密选择一枚未引爆诱饵鱼雷 |
| `match:surrender` | `{ expectedVersion }` | 投降；三人局为该玩家出局 |
| `rematch:request` | `{ expectedVersion }` | 申请再来一局 |
| `rematch:cancel` | `{ expectedVersion }` | 取消申请 |


## 5. `match:roll-die` 主动掷骰

所有玩家准备后进入 `ROLLING`，服务器不再自动一次性完成掷骰。每名玩家在当前轮次主动提交：

```json
{
  "expectedVersion": 18
}
```

服务器验证：

- 房间必须处于 `ROLLING`；
- 当前连接必须属于房间内在线玩家；
- 该玩家本轮尚未掷骰；
- 随机点数只在服务器生成，范围为 1～6。

安全视图中的 `rolling` 可包含：

```json
{
  "rounds": [],
  "currentRound": 1,
  "currentRolls": {
    "player-1": 6
  },
  "firstPlayerId": null
}
```

当所有玩家均完成当前轮次后，服务器将完整结果写入 `rounds`。若最高点并列，`currentRound` 加一并清空 `currentRolls`，等待所有玩家再次主动投掷；若产生唯一最高点，则写入 `firstPlayerId`。结果展示时间结束后服务器进入 `PLAYING`。

掷骰按钮不允许客户端携带点数参数。

## 6. `action:submit` 与三人普通回合

### 5.1 普通单目标行动

三人局中，除直升机外，`intent` 必须包含目标玩家：

```json
{
  "expectedVersion": 27,
  "intent": {
    "actionId": "p1-turn4-action1",
    "actionType": "destroyer_i_ram",
    "sourceId": "destroyer-i",
    "targetPlayerId": "player-2",
    "target": {
      "kind": "cell",
      "coordinate": "G7"
    }
  }
}
```

服务器只接受本回合 `remainingTargetPlayerIds` 中的目标。

A、B、C 均仍在局时：

```text
A 回合开始
remaining = [B, C]

A → B 行动结算
remaining = [C]
currentPlayerId 仍为 A
turnNumber 不变
actionDeadlineAt 不变

A → C 行动结算
remaining = []
切换至 B
```

两次行动可以是任意合法组合。有限资源按实际提交次数分别消耗。

### 5.2 首回合雷达

如果当前玩家尚有首次雷达使用次数，则其本局第一个正常回合的第一项操作必须是 `radar_scan`。

三人局雷达仍是单目标辅助行动：

```json
{
  "actionType": "radar_scan",
  "sourceId": "carrier",
  "targetPlayerId": "player-2",
  "target": { "kind": "cell", "coordinate": "A1" }
}
```

扫描 B 后，A 仍需在同一回合对 C 完成一次合法操作。雷达结果只发送给 A。

### 5.3 直升机多目标例外

三人局且存在两名仍在局敌人时，直升机扫射必须作为当前玩家本回合首个且唯一行动。客户端只选择一行或一列，不需要为 B、C 分别提交：

```json
{
  "expectedVersion": 42,
  "intent": {
    "actionId": "p1-helicopter",
    "actionType": "helicopter_strafe",
    "sourceId": "carrier",
    "target": {
      "kind": "row",
      "row": "J"
    }
  }
}
```

服务器将同一目标行/列独立结算到所有仍在局敌方玩家，一次消耗 1 次直升机并结束整个玩家回合。

如果本回合已经完成过一项普通行动，再提交直升机返回：

```text
HELICOPTER_REQUIRES_FRESH_TURN
```

## 7. `room:state.turn`

`PLAYING` 时 `turn` 增加本回合目标进度：

```json
{
  "turn": {
    "currentPlayerId": "player-1",
    "turnNumber": 4,
    "requiredTargetPlayerIds": ["player-2", "player-3"],
    "completedTargetPlayerIds": ["player-2"],
    "remainingTargetPlayerIds": ["player-3"],
    "actionCount": 1,
    "canAct": true
  },
  "deadlines": {
    "actionDeadlineAt": 1786277400000
  }
}
```

字段含义：

- `requiredTargetPlayerIds`：本回合建立时的敌方目标集合；
- `completedTargetPlayerIds`：本回合已完成普通操作，或被全局行动覆盖的目标；
- `remainingTargetPlayerIds`：服务器剔除已完成和已出局目标后的当前集合；
- `actionCount`：本回合已经完成的服务器行动次数；
- `actionDeadlineAt`：整个玩家回合共用的绝对截止时间。第一项普通行动后保持不变。

双人局同样返回这些字段，但通常只有一个 required target。

## 8. 独立敌方地图

`battle.own.enemyMapsByPlayer` 为每名敌人分别维护记录：

```json
{
  "enemyMapsByPlayer": {
    "player-2": {
      "cellResults": { "D4": "hit" },
      "submarineMissileMarkers": [],
      "nuclearBombMarkers": [],
      "destroyerTargetCells": ["D4"]
    },
    "player-3": {
      "cellResults": {},
      "submarineMissileMarkers": ["G5"],
      "nuclearBombMarkers": [],
      "destroyerTargetCells": []
    }
  }
}
```

对 B 的记录不得写入 C 的对象，反之亦然。

## 9. 行动记录

普通单目标行动：

```json
{
  "actorId": "player-1",
  "defenderId": "player-2",
  "defenderIds": ["player-2"],
  "actionType": "destroyer_i_ram",
  "target": { "kind": "cell", "coordinate": "D4" }
}
```

三人全局直升机：

```json
{
  "actorId": "player-1",
  "defenderId": null,
  "defenderIds": ["player-2", "player-3"],
  "actionType": "helicopter_strafe",
  "target": { "kind": "row", "row": "J" },
  "cellResultsByDefender": {
    "player-2": [
      { "coordinate": "J1", "result": "miss" }
    ],
    "player-3": [
      { "coordinate": "J1", "result": "hit" }
    ]
  }
}
```

`cellResultsByDefender` 只包含规则允许公开的逐格 `hit/miss` 结果，不包含敌方舰种、生命值或隐藏部署。

## 10. 行动消息分级

- 行动方：普通单格攻击只取得 `result: "hit" | "miss"`；直升机只取得逐格 `coordinate/result`。不得下发敌方单位 ID、类型、实际伤害、生命值或沉没状态。行动方自己的伤害继续通过 `ownDamage` 精确下发。
- 防守方：`receivedHits` 只包含该防守方自己的受击单位与权威生命值变化；自己的诱饵变化继续通过 `ownDecoyChanges` 下发。
- 第三方：只取得行动方、被操作玩家、行动、公开目标和规则允许的公开结果，不取得双方任何伤害明细。
- 潜射导弹与核弹：行动方及公共记录的 `result` 必须为 `null`，不返回命中情况；防守方仅在实际受击时取得自己的 `receivedHits`。
- 震爆弹：行动方、第三方和公共记录均不返回是否生效；防守方只从自己的后续安全状态看到实际瘫痪。
- 探测弹和雷达：布尔结果只返回行动方，防守方与第三方的 `result` 为 `null`。
- 多目标直升机：每名防守方只取得自身相关伤害变化；行动公共记录可以包含全部防守玩家与每张地图公开的逐格命中/未命中结果。

行动方反馈不再定义 `inflictedDamage`。客户端必须忽略旧缓存或非权威来源中同名字段，不能用它生成播报。

防守方受击项结构如下：

```json
{
  "unitId": "carrier",
  "unitType": "aircraft_carrier",
  "hit": true,
  "beforeHp": 6,
  "appliedDamage": 2,
  "afterHp": 4,
  "sunk": false
}
```

该对象只发给拥有该单位的防守方。核弹命中航空母舰时 `appliedDamage` 必须为 `2`；行动方仍只看到核弹已执行而不知道是否命中。

## 11. 三人回合超时

一个玩家回合只有一个 90 秒截止时间。

- 第一项普通行动成功后不创建新计时器；
- 截止时间到达时若仍有 `remainingTargetPlayerIds`，当前回合直接超时结束；
- 已经完成的第一项行动不回滚；
- 未完成的另一名敌方操作不自动生成；
- 连续超时次数以完整玩家回合计数，而不是以子行动计数。

## 12. 终局手动鱼雷

请求结构保持：

```json
{
  "expectedVersion": 70,
  "decoyId": "decoy-1"
}
```

提交坐标继续对其他玩家保密，直到规则允许的最终复盘。

双人局：所选鱼雷攻击唯一对手的同名坐标。

三人局：所选鱼雷在本轮同时攻击其他所有仍在局玩家的同名坐标。例如 A 选择己方 `G10`，服务器同时检查 B 的 `G10` 和 C 的 `G10`。

每轮所有仍在局玩家先秘密提交，再统一结算；无可用鱼雷的玩家由服务器按既有逻辑自动 `pass`。

## 13. 主要新增错误码

| 错误码 | 含义 |
| --- | --- |
| `TURN_TARGET_ALREADY_RESOLVED` | 三人本回合已对该目标完成普通操作，或该目标不在当前剩余目标集合 |
| `HELICOPTER_REQUIRES_FRESH_TURN` | 三人本回合已执行普通操作，不能再追加全局直升机 |
| `OPENING_RADAR_REQUIRED` | 本玩家首个正常回合第一项操作必须使用雷达 |
| `PLAYER_ALREADY_ROLLED` | 当前玩家本轮已经完成掷骰，必须等待下一轮或进入对战 |
| `FIRST_PLAYER_ALREADY_DETERMINED` | 先手已经确定，不能继续掷骰 |
| `ACTION_DEADLINE_EXPIRED` | 整个玩家回合的 90 秒截止时间已到 |

其他部署、连接、状态版本、资源、范围与生命周期错误码继续沿用现有实现。

## 14. 断线、投降与目标集合

三人局中，如果当前玩家本回合的一名剩余目标因投降或断线超时出局：

- 该玩家立即从 `remainingTargetPlayerIds` 移除；
- 若仍有另一名合法剩余目标，则当前玩家继续原回合；
- 若已无剩余目标，则结束当前玩家回合并切换到下一名仍在局玩家；
- 原回合计时只在真正继续时恢复/延续，不创建第二个完整 90 秒回合。

## 15. Ocean-v1.1 人机扩展

### 15.1 创建人机房

`room:create` 新增可选字段：

```json
{
  "nickname": "玩家",
  "maxPlayers": 2,
  "roomMode": "bot_duel"
}
```

- `roomMode` 缺省为 `pvp`，保持旧客户端兼容。
- `bot_duel` 只接受 `maxPlayers: 2`；三人配置返回 `INVALID_BOT_PLAYER_COUNT`。
- 创建成功时机器人已经加入、完成合法部署并准备，真人取得的阶段为 `DEPLOYING`。
- 对 `bot_duel` 执行真人 `room:join` 必须失败。

### 15.2 安全状态字段

`room:state` 新增：

```json
{
  "roomMode": "bot_duel",
  "seats": [
    { "playerId": "...", "nickname": "玩家", "isBot": false },
    { "playerId": "...", "nickname": "OCEAN 战术机器人", "isBot": true }
  ]
}
```

机器人没有重连凭证和 Socket 会话。机器人部署、掷骰、行动、终局选择和再来一局确认均为服务端内部转换，不新增可由浏览器冒用的机器人控制事件。

### 15.3 兼容性

- `pvp + maxPlayers: 2`：原 1v1 联机行为不变。
- `pvp + maxPlayers: 3`：原三人 FFA 行为不变。
- `bot_duel + maxPlayers: 2`：新增 1v1 人机。
- 任何三人人机请求均拒绝。

## 16. Ocean-v1.2 动态地图扩展

### 16.1 创建房间

`room:create` 的 `mapSize` 为必选产品字段，服务器为兼容旧客户端在缺省时使用 12：

```json
{
  "nickname": "玩家",
  "maxPlayers": 2,
  "roomMode": "pvp",
  "mapSize": 15
}
```

- 合法值仅为整数 `10`、`12`、`15`；数字字符串可规范化为整数。
- 其他值返回 `INVALID_MAP_SIZE`，不得静默取整或回退。
- 地图档位随房间保存；加入、恢复、同步、再来一局均不能由客户端修改。

### 16.2 安全状态

所有阶段的 `room:state` 均包含：

```json
{
  "mapSize": 15,
  "mapRules": {
    "mapSize": 15,
    "boardSize": 15,
    "rowLabels": "ABCDEFGHIJKLMNO",
    "coordinateMaximum": "O15",
    "carrierCellCount": 8,
    "carrierHp": 8,
    "decoyCount": 5,
    "destroyerI": { "along": 13, "across": 9 },
    "destroyerII": { "along": 12, "across": 10 },
    "radarSize": 5,
    "shockSize": 7,
    "detectionSize": 3
  }
}
```

`mapRules` 是服务器根据 `mapSize` 生成的只读派生数据。客户端用它渲染地图与文案，但服务器仍在每次部署和行动时自行重新校验，不能接受客户端回传的规则覆盖。

### 16.3 兼容性与错误

- 协议 1.8 及以后客户端必须先按 `mapSize` 配置坐标与舰队，再渲染部署或战斗状态。
- 12×12 档位的规则值与协议 1.7 完全一致。
- 10×10、15×15 不新增行动事件；目标仍使用既有坐标、区域左上角、行或列结构。
- `INVALID_MAP_SIZE`：创建房间的地图档位不在允许集合。

UI 仍不得依靠客户端自行维护回合目标进度，也不得合并 `enemyMapsByPlayer` 中不同敌人的记录。
