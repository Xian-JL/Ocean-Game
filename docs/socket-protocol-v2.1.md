# 《海战 OCEAN》Socket.IO 协议 v2.1

> 实现版本：Ocean-v1.3  
> 协议版本：2.1  
> 规则依据：rule-v1.8、page-flow-v2.1  
> 基线：Socket Protocol v2.0

## 1. 变更范围

协议 2.1 在协议 2.0 的三人同步行动、状态版本、幂等、信息投影和全部事件语义上，仅新增人机难度房间配置。完整交互教程完全在浏览器本地运行，不新增 Socket 事件。

`system:ready` 当前值：

```json
{
  "stage": "Ocean-v1.3",
  "protocolVersion": "2.1",
  "connectedAt": "2026-08-26T12:00:00.000Z"
}
```

前端必须同时匹配产品阶段和协议版本；不匹配时提示强制刷新。

## 2. `room:create` 请求

PVP 请求保持不变：

```json
{
  "nickname": "玩家甲",
  "maxPlayers": 2,
  "roomMode": "pvp",
  "mapSize": 12
}
```

人机请求新增可选字段：

```json
{
  "nickname": "玩家甲",
  "maxPlayers": 2,
  "roomMode": "bot_duel",
  "botDifficulty": "expert",
  "mapSize": 12
}
```

约束：

- `botDifficulty` 只允许 `beginner`、`standard`、`expert`。
- `bot_duel` 固定 `maxPlayers: 2`；三人人机继续拒绝。
- 人机请求省略 `botDifficulty` 时，服务器使用 `standard`，兼容 v1.2.7 客户端。
- PVP 请求中的难度不进入房间状态；服务器安全视图固定返回 `null`。
- 未知难度返回 `INVALID_BOT_DIFFICULTY`，不得静默改成其他档位。

## 3. `room:state` 新字段

人机房：

```json
{
  "roomMode": "bot_duel",
  "botDifficulty": "expert",
  "maxPlayers": 2,
  "mapSize": 12
}
```

PVP 房：

```json
{
  "roomMode": "pvp",
  "botDifficulty": null
}
```

该字段是公开房间配置，不是战斗情报。房间创建后保持不可变，并出现在部署、掷骰、对战、终局、结算、重连和再来一局的安全快照中。

## 4. 机器人执行边界

1. 机器人部署和行动由服务器触发，客户端不能伪造机器人身份或直接提交机器人难度变更。
2. 决策函数只接收 `createRoomView(room, botPlayerId)` 的输出，而不接收权威 `room.battleState` 或真人部署。
3. 机器人产生的意图继续走与真人相同的 `action:submit` 验证与原子结算路径。
4. `actionId`、状态版本、可用行动、目标范围、驱逐舰已用坐标、弹药和瘫痪限制全部继续由服务器验证。
5. FINAL_SALVO 的机器人选择同样读取房间难度，但只从 `availableDecoyIds` 中选取。
6. 难度不随 Socket 广播内部热度表、策略评分、候选列表或随机值。

## 5. 错误结构

非法难度沿用协议统一错误：

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_BOT_DIFFICULTY",
    "message": "人机难度只能选择新手、标准或专家。",
    "details": {
      "botDifficulty": "impossible",
      "supportedBotDifficulties": ["beginner", "standard", "expert"]
    }
  }
}
```

客户端应停留在 P01 并允许重新选择，不得创建半完成房间。

## 6. 教程网络约束

T01 允许在尚未连接服务器时进入。教程操作不得发送以下任何事件：

- `room:create`、`room:join`、`room:resume`；
- `deployment:submit`、`deployment:ready`；
- `match:roll-die`、`action:submit`、`final-salvo:submit`；
- `match:surrender`、`rematch:request`。

教程进度不属于 `room:state`、遥测或协议字段，只保存在当前浏览器。

## 7. 协议 2.0 保持项

- 每次状态变更携带递增 `stateVersion`；客户端意图携带 `expectedVersion`。
- `actionId` 幂等，网络重试不得重复结算。
- 双人每回合一次行动；三人同一行动同时作用所有仍在局敌人，资源与行动方成本只算一次。
- 行动方、每名防守方和公共记录分开投影；潜射导弹、核弹、震爆弹继续对行动方保密。
- 五类私人标记仍是本地数据，不进入 Socket。
- 动态地图、断线恢复、赛后离开、再来一局和终局鱼雷的事件与字段不变。
