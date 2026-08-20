# 《海战 OCEAN》Socket.IO 协议 v2.0

> 实现版本：Ocean-v1.2.6  
> 协议版本：2.0  
> 规则依据：rule-v1.8.md、page-flow-v2.0.md  
> 破坏性变化：三人局由“每回合分别提交两次单目标行动”改为“每回合提交一次、同步作用全部仍在局敌人”。

## 1. 基本原则

1. 客户端只提交操作意图；阶段、回合、目标集合、计时、资源、伤害、出局与胜负全部由服务器决定。
2. 每名玩家只收到其权限范围内的 `room:state`；不得先发送完整敌方状态再依靠前端隐藏。
3. 除创建、加入、恢复和同步外，所有状态变更事件必须携带最近收到的正整数 `expectedVersion`。
4. 同一 `actionId` 必须幂等；网络重试不得导致资源或伤害重复结算。
5. 双人局与三人局均为每个玩家回合一次行动。三人局一次行动同时覆盖全部仍在局敌人。
6. 三人行动的资源和行动方代价只提交一次，各防守方效果分别结算。
7. 信息投影严格区分行动方、每名防守方和公共记录；一名防守方不得看到另一名防守方的私密结果。
8. 五类自定义标记仅存在浏览器 `localStorage`，不属于 Socket 协议字段，也不得通过 `room:state` 同步。

## 2. 连接版本

服务器连接后发送 `system:ready`：

```json
{
  "stage": "Ocean-v1.2.6",
  "protocolVersion": "2.0",
  "connectedAt": "2026-08-20T12:00:00.000Z"
}
```

前端发布信息必须为 `Ocean-v1.2.6 / rule-v1.8 / Socket 2.0`。不理解同步三人行动的旧客户端不得假装兼容协议 2.0。

## 3. 通用应答

成功：

```json
{ "ok": true, "data": {} }
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

失败也可通过 `room:error` 推送。客户端收到状态冲突后必须调用 `room:sync`，并以服务器最新安全快照重建界面。

## 4. 客户端事件

| 事件 | 数据 | 作用 |
| --- | --- | --- |
| `client:ping` | `{}` | 连接与协议检查 |
| `room:create` | `{ nickname, maxPlayers, roomMode?, mapSize }` | 创建 2 人、3 人或 1v1 人机房，并锁定地图档位 |
| `room:join` | `{ roomCode, nickname }` | 加入等待房间 |
| `room:resume` | `{ roomCode, reconnectToken }` | 恢复席位并轮换凭证 |
| `room:sync` | `{}` | 获取当前玩家安全快照 |
| `room:leave` | `{ expectedVersion }` | 按当前阶段离开 |
| `deployment:submit` | `{ expectedVersion, deployment }` | 提交部署 |
| `deployment:ready` | `{ expectedVersion }` | 准备 |
| `deployment:cancel-ready` | `{ expectedVersion }` | 在规则允许时取消准备 |
| `match:roll-die` | `{ expectedVersion }` | 主动掷骰；点数由服务器生成 |
| `action:submit` | `{ expectedVersion, intent }` | 提交本回合唯一一次正式行动 |
| `final-salvo:submit` | `{ expectedVersion, decoyId }` | 每轮秘密选择一枚未引爆诱饵鱼雷 |
| `match:surrender` | `{ expectedVersion }` | 投降；三人局为该玩家出局 |
| `rematch:request` | `{ expectedVersion }` | 申请再来一局 |
| `rematch:cancel` | `{ expectedVersion }` | 取消申请 |

## 5. 主动掷骰

所有玩家准备后进入 `ROLLING`。每名玩家在当前轮次提交一次 `match:roll-die`。服务器验证玩家在线且本轮尚未投掷，并生成 1～6 点。

```json
{
  "rolling": {
    "rounds": [],
    "currentRound": 1,
    "currentRolls": { "player-1": 6 },
    "firstPlayerId": null
  }
}
```

全部玩家提交后，唯一最高点写入 `firstPlayerId`；最高点并列时进入下一轮并清空 `currentRolls`。客户端不得提交或修改骰子点数。

## 6. `action:submit`

### 6.1 标准意图

单格、区域左上角或区域中心：

```json
{
  "expectedVersion": 27,
  "intent": {
    "actionId": "p1-turn4-action1",
    "actionType": "destroyer_i_ram",
    "sourceId": "destroyer-i",
    "targetPlayerId": "player-2",
    "target": { "kind": "cell", "coordinate": "G7" }
  }
}
```

整行或整列：

```json
{
  "expectedVersion": 42,
  "intent": {
    "actionId": "p1-helicopter",
    "actionType": "helicopter_strafe",
    "sourceId": "carrier",
    "targetPlayerId": "player-3",
    "target": { "kind": "row", "row": "J" }
  }
}
```

`targetPlayerId` 在双人局标识唯一防守方。在三人局中，它只表明玩家从哪张敌方地图点击目标，必须属于 `remainingTargetPlayerIds`；服务器不得据此缩小结算对象，也不得把它作为第二份资源成本。直接调用权威结算器时可省略三人局 `targetPlayerId`。

### 6.2 三人同步语义

当 A 行动且 B、C 均仍在局时：

```text
A 选择一次行动与目标 G7
  ├─ 资源、actionId、驱逐舰坐标历史：提交 1 次
  ├─ B 的 G7：按 B 的权威地图独立结算
  ├─ C 的 G7：按 C 的权威地图独立结算
  └─ A 的自损或己方联动伤害：最多采用 1 个合法单场分支
结算完成后直接切换至下一名仍在局玩家
```

必须满足：

- 两名防守方可分别命中或未命中；目标效果互不覆盖。
- 两方同格均有单位时，两方单位分别承受完整目标伤害。
- 有限弹药或使用次数只减少 1。
- 驱逐舰同时命中两个单位时自损 0.5，不是 1；命中一方单位、一方空海域时仍自损 0.5。
- 驱逐舰同时命中单位与诱饵时采用较高单场代价，自损 1，不叠加为 1.5。
- 海盗船同时命中两方单位时两方各受 2，海盗船自损 1，其受伤触发的己方航空母舰联动伤害只结算一次。
- 潜射导弹、核弹、震爆弹、探测弹、雷达和直升机均使用同一同步框架。
- 行动开始前只剩一名敌人时，`defenderIds` 仅含该玩家，按单目标规则结算。

### 6.3 首回合雷达

当前玩家仍有 `radar_scan` 次数时，本局第一个正常回合只接受雷达：

```json
{
  "actionType": "radar_scan",
  "sourceId": "carrier",
  "targetPlayerId": "player-2",
  "target": { "kind": "cell", "coordinate": "A1" }
}
```

双人局扫描唯一对手；三人局以同一个左上角和同一个动态区域分别扫描全部仍在局敌人。雷达只消耗一次，扫描后回合结束。

### 6.4 驱逐舰坐标

协议 2.0 中，三人局驱逐舰坐标历史属于行动方共享集合。一次同步攻击 `D4` 后，两张 `enemyMapsByPlayer` 都显示 `D4` 已被驱逐舰尝试；之后任一驱逐舰不得通过切换敌方地图再次提交 `D4`。

## 7. `room:state.turn`

三人行动提交前：

```json
{
  "turn": {
    "currentPlayerId": "player-1",
    "turnNumber": 4,
    "requiredTargetPlayerIds": ["player-2", "player-3"],
    "completedTargetPlayerIds": [],
    "remainingTargetPlayerIds": ["player-2", "player-3"],
    "actionCount": 0,
    "canAct": true
  },
  "deadlines": { "actionDeadlineAt": 1786277400000 }
}
```

字段含义：

- `requiredTargetPlayerIds`：该回合建立时的同步防守方集合。
- `completedTargetPlayerIds`：结算后一次写入本次全部防守方；客户端通常不会在同一玩家的 ACTIVE 阶段看到部分完成状态。
- `remainingTargetPlayerIds`：提交前仍在局并将同时受作用的防守方集合。
- `actionCount`：本回合已完成服务器行动数，只能由 0 变为 1。
- `actionDeadlineAt`：本回合唯一 90 秒绝对截止时间。
- `canAct`：只有当前玩家、连接正常、ACTIVE 且未超时时为 `true`。

双人局返回同一结构，但目标集合通常只有一个玩家。

## 8. 权威行动记录

三人同步行动内部记录：

```json
{
  "actorId": "player-1",
  "defenderId": null,
  "defenderIds": ["player-2", "player-3"],
  "action": {
    "actionId": "p1-turn4-action1",
    "actionType": "destroyer_i_ram",
    "sourceId": "destroyer-i",
    "target": { "kind": "cell", "coordinate": "D4" }
  },
  "outcome": {
    "kind": "multi_defender",
    "outcomesByDefender": {
      "player-2": { "actualResult": "hit" },
      "player-3": { "actualResult": "miss" }
    }
  }
}
```

`outcomesByDefender`、完整伤害事件和目标身份只存在服务器权威状态及赛后复盘，不得原样广播。

双人行动使用字符串 `defenderId` 与单元素 `defenderIds`。三人同步行动使用 `defenderId: null` 与完整 `defenderIds`。

## 9. 独立敌方地图

行动方安全视图为每名敌人分别维护结果：

```json
{
  "enemyMapsByPlayer": {
    "player-2": {
      "cellResults": { "D4": "hit" },
      "submarineMissileMarkers": ["G5"],
      "nuclearBombMarkers": [],
      "destroyerTargetCells": ["D4"]
    },
    "player-3": {
      "cellResults": { "D4": "miss" },
      "submarineMissileMarkers": ["G5"],
      "nuclearBombMarkers": [],
      "destroyerTargetCells": ["D4"]
    }
  }
}
```

命中、未命中、潜射/核弹标记和情报区域按防守方隔离。驱逐舰同步行动的同一坐标必须同时写入两张地图的显示历史，并在行动方权威状态中只提交一次共享坐标。

## 10. 安全消息投影

### 10.1 公共记录

三人公共记录只包含：

```json
{
  "sequence": 8,
  "actorId": "player-1",
  "defenderId": null,
  "defenderIds": ["player-2", "player-3"],
  "actionType": "destroyer_i_ram",
  "actionName": "驱逐舰Ⅰ冲撞",
  "target": { "kind": "cell", "coordinate": "D4" },
  "result": null
}
```

公共记录不得包含任何防守方的命中/未命中、雷达、探测、单位、生命值、伤害或诱饵结果。这样 B 不会从公共记录看到 C 的结果，C 也不会看到 B 的结果。

### 10.2 行动方反馈

允许公开命中结论的三人单格行动：

```json
{
  "result": null,
  "resultsByDefender": {
    "player-2": "hit",
    "player-3": "miss"
  },
  "ownDamage": []
}
```

三人雷达或探测弹：

```json
{
  "result": null,
  "privateResultsByDefender": {
    "player-2": "layout_detected",
    "player-3": "no_layout_detected"
  }
}
```

三人直升机使用 `cellResultsByDefender`，每个值只含规则允许的 `{ coordinate, result }`。行动方不得取得敌方单位 ID、类型、实际伤害、生命值或沉没状态。行动方自身变化通过 `ownDamage` 精确下发。

潜射导弹、核弹和震爆弹不定义 `resultsByDefender`；行动方的 `result` 保持 `null`。

### 10.3 防守方反馈

每名防守方只取得自己的 `receivedHits`、`ownDecoyChanges` 和规则允许的自身逐格结果：

```json
{
  "receivedHits": [{
    "unitId": "carrier",
    "unitType": "aircraft_carrier",
    "hit": true,
    "beforeHp": 6,
    "appliedDamage": 2,
    "afterHp": 4,
    "sunk": false
  }],
  "ownDecoyChanges": []
}
```

该对象只发给拥有该单位的玩家。不得附带另一名防守方的结果。核弹命中航空母舰时 `appliedDamage` 为 2；行动方仍不知道核弹是否命中。

行动方反馈不定义 `inflictedDamage`。客户端不得使用旧缓存或非权威同名字段生成播报。

## 11. 情报区域

三人雷达、探测弹和震爆弹在行动方安全视图中各生成两条带 `defenderId` 的 `intelligenceAreas`：

```json
{
  "sequence": 9,
  "defenderId": "player-2",
  "kind": "radar",
  "center": "A1",
  "area": ["A1", "A2"],
  "detected": true
}
```

雷达和探测的 `detected` 只发给行动方；震爆不提供是否成功。每张敌方地图只读取与自身 `defenderId` 相符的区域。

## 12. 超时、投降和出局

- 每个玩家回合只有一个 90 秒截止时间。
- 截止时间到达前未提交行动，当前回合超时结束；不存在“已完成第一项、等待第二项”的中间状态。
- 连续超时按玩家回合计数；第三次在双人局判负、三人局出局。
- 三人行动开始前若一名敌人已经出局，`remainingTargetPlayerIds` 只含另一名敌人，行动退化为单目标。
- 三人同步行动结算中若一名或两名防守方航空母舰沉没，服务器先完成所有防守方和行动方代价，再统一更新出局集合与胜负。
- 对局已进入 FINISHED 后，非房主离开不得触发房主断线暂停。

## 13. 终局手动鱼雷

```json
{ "expectedVersion": 70, "decoyId": "decoy-1" }
```

提交坐标在本轮统一结算前保持秘密。双人局攻击唯一对手的同名坐标；三人局同一枚鱼雷同时攻击其他所有仍在局玩家的同名坐标。每轮所有仍在局玩家先秘密提交，再统一结算；无可用鱼雷的玩家由服务器自动 `pass`。

## 14. 动态地图

`room:create` 的 `mapSize` 合法值为 `10`、`12`、`15`，缺省兼容值为 12：

```json
{
  "nickname": "玩家",
  "maxPlayers": 3,
  "roomMode": "pvp",
  "mapSize": 15
}
```

所有阶段的安全状态包含服务器派生的 `mapRules`。客户端只能据此渲染，不能回传覆盖：

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

地图显示缩放由客户端基于 `mapSize` 和 `maxPlayers` 处理，不新增 Socket 字段，也不改变坐标协议。

## 15. 人机边界

- `roomMode` 缺省为 `pvp`。
- `bot_duel` 只接受 `maxPlayers: 2`；三人人机返回 `INVALID_BOT_PLAYER_COUNT`。
- 人机房创建后机器人占据第二席位、自动部署并准备，且不接受真人 `room:join`。
- 机器人只读取自己的安全视图；机器人没有重连凭证或可由浏览器冒用的控制事件。
- `pvp + maxPlayers: 3` 使用本协议的同步三人行动；任何三人人机请求均拒绝。

## 16. 主要错误码

| 错误码 | 含义 |
| --- | --- |
| `INVALID_SIMULTANEOUS_TARGET` | 三人点击来源地图不属于当前仍在局同步防守方集合 |
| `OPENING_RADAR_REQUIRED` | 本玩家首个正常回合必须使用雷达 |
| `DESTROYER_TARGET_ALREADY_USED` | 该坐标已由行动方任一驱逐舰攻击过 |
| `PLAYER_ALREADY_ROLLED` | 当前玩家本轮已经掷骰 |
| `FIRST_PLAYER_ALREADY_DETERMINED` | 先手已经确定 |
| `ACTION_DEADLINE_EXPIRED` | 本回合 90 秒截止时间已到 |
| `INVALID_MAP_SIZE` | 创建房间的地图档位不在允许集合 |
| `STATE_VERSION_CONFLICT` | 客户端状态版本落后 |

协议 1.9 的 `TURN_TARGET_ALREADY_RESOLVED` 和 `HELICOPTER_REQUIRES_FRESH_TURN` 不属于 v2.0 正常流程；新客户端不得依赖它们组织三人回合。

## 17. v2.0 验收边界

- 三人任意行动只生成一条权威行动记录和一次资源消耗。
- `defenderIds` 同时包含两名仍在局敌人；两方效果独立，行动方代价只一次。
- 公共记录不泄露任一防守方结果；行动方和各防守方只取得各自授权信息。
- 雷达、探测弹、潜射导弹、核弹、震爆弹与直升机都覆盖同步语义。
- 两张 `enemyMapsByPlayer` 保持独立结果；驱逐舰共享坐标限制不能通过切图绕过。
- 双人联机与 1v1 人机的单目标协议行为不变。
- 五类私人标记不进入任何 Socket 请求、状态或日志。
