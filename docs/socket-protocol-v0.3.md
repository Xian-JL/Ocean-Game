# 《海战 OCEAN》Socket.IO 协议 v0.3

> 实现版本：match-v0.3  
> 协议版本：1.0  
> 依据：rule-v1.0.md、page-flow-v1.0.md  
> 边界：本文件记录当前服务接口，不修改已冻结规则和页面流程。

## 1. 基本原则

1. 客户端只提交操作意图，房间阶段、先手、计时、结算和胜负全部由服务器决定。
2. 创建或加入成功后，服务器把当前 Socket 绑定到唯一玩家席位。
3. 后续事件以 Socket 绑定身份为准；即使请求中伪造 `playerId`，也不会改变实际操作人。
4. 每个玩家只收到服务器为自己生成的 `room:state`，不能取得对手秘密状态。
5. 除创建、加入和同步外，所有状态变更请求必须携带 `expectedVersion`。
6. 本版本的 `room:session` 只表示当前在线连接绑定，不是重连凭证。

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

失败同时通过 `room:error` 发送。已绑定玩家发生错误时，服务器随后再发送一次最新 `room:state`，客户端应以该快照恢复界面。

## 3. 客户端事件

| 事件 | 数据 | 说明 |
| --- | --- | --- |
| `client:ping` | `{}` | 连接应答检查，不改变状态 |
| `room:create` | `{ nickname }` | 创建房间并绑定房主席位 |
| `room:join` | `{ roomCode, nickname }` | 加入尚可进入的房间并绑定第二席位 |
| `room:sync` | `{}` | 重新取得当前连接对应的安全快照 |
| `room:leave` | `{ expectedVersion }` | 仅用于正式对局前离开；关闭当前房间 |
| `deployment:submit` | `{ expectedVersion, deployment }` | 提交一整套完整合法部署 |
| `deployment:ready` | `{ expectedVersion }` | 锁定本方部署并准备 |
| `deployment:cancel-ready` | `{ expectedVersion }` | 对方尚未准备时取消本方准备 |
| `action:submit` | `{ expectedVersion, intent }` | 当前玩家提交一个正式行动 |

`intent` 继续采用规则引擎的统一结构：

```json
{
  "actionId": "client-generated-unique-id",
  "actionType": "pirate_attack",
  "sourceId": "pirate",
  "target": {
    "kind": "cell",
    "coordinate": "J1"
  }
}
```

客户端重试同一行动时必须复用完全相同的 `actionId` 和行动内容。服务器返回第一次结算产生的安全结果，不递增状态版本、不重复扣血或消耗弹药。若同一编号对应不同内容，返回 `ACTION_ID_REUSE_CONFLICT`。

## 4. 服务器事件

### 4.1 `system:ready`

连接建立后立即发送：

```json
{
  "stage": "match-v0.3",
  "protocolVersion": "1.0",
  "connectedAt": "2026-08-07T00:00:00.000Z"
}
```

### 4.2 `room:session`

创建或加入成功：

```json
{
  "active": true,
  "roomCode": "ABC234",
  "playerId": "server-generated-player-id"
}
```

对局前离开导致房间关闭后，双方收到 `active: false`。`playerId` 只用于客户端识别“本方”和显示状态，不作为后续请求的授权凭据。

### 4.3 `room:state`

每次成功变更后按玩家分别发送，主要字段包括：

```text
roomCode、stateVersion、roomPhase、turnPhase、connectionPhase
seats                  双方公开席位状态，不含部署
own                    本方部署和本方连续行动超时次数
serverNow、deadlines   服务器时间与绝对截止时间
rolling、turn          掷骰和当前回合公开状态
battle                 规则引擎生成的本方安全战场视图
latestResolution       仅属于该玩家的最近结算反馈
turnEvents             自动跳过、行动超时等公开记录
systemEvents           自动部署等系统记录
```

客户端只接受 `stateVersion` 大于或等于当前版本的快照；小于当前版本的迟到消息应忽略。任何时候都不得从 CSS 隐藏字段推断保密，而应确认秘密字段根本没有出现在消息中。

### 4.4 `room:error`

与失败 acknowledge 中的 `error` 结构相同。非规则类内部错误统一为 `INTERNAL_SERVER_ERROR`，不发送堆栈、文件路径或完整服务端状态。

## 5. 自动阶段与推送顺序

### 5.1 双方准备或部署超时

```text
DEPLOYING
  → ROLLING（部署锁定）
  → ROLLING（服务器骰子和唯一先手已确定）
  → PLAYING / ACTIVE 或 AUTO_SKIPPING
```

服务器保留短暂的掷骰展示阶段；客户端不能发送骰子结果或要求重掷。

### 5.2 正常行动

```text
PLAYING / ACTIVE
  → PLAYING / RESOLVING
  → PLAYING / ACTIVE、AUTO_SKIPPING、FINISHED 或 FINAL_SALVO
```

进入 `RESOLVING` 后服务器在同一处理链中完成原子结算。客户端不得以断开连接或重复发送的方式回滚行动。

### 5.3 自动跳过与终局齐射

- `AUTO_SKIPPING` 由服务器立即完成，写入公开记录，再推送下一有效阶段；
- `FINAL_SALVO` 先推送已完成的齐射结果，保留展示时间，再进入 `FINISHED`；
- 自动流程设有转换次数上限，防止异常状态形成无限循环。

## 6. 服务端计时推送

生产默认每 250 毫秒扫描一次到期房间：

1. 部署截止时自动补全部署、准备、掷骰并推进对局；
2. 行动截止时记录“行动超时”、更新本方连续超时次数并换手；
3. 第三次连续行动超时直接进入 `FINISHED`；
4. 客户端倒计时归零只进入等待显示，不能自行推进状态。

扫描结果仍通过逐玩家 `room:state` 发送，不使用包含双方完整状态的房间广播。

## 7. 本版本不处理的连接状态

match-v0.3 尚未实现断线暂停和重连：

- Socket 断开不会在本版本中启动 120 秒保留计时；
- 不生成或接受私密重连凭证；
- 刷新页面不能恢复原席位；
- 不冻结部署或行动计时。

这些功能将在独立 `match-v0.4` 中接入。在该版本完成前，不得把 `room:session` 中的 `playerId` 当作重连密钥。
