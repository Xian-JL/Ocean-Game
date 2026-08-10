# 《海战 OCEAN》Ocean-v1.0 正式发布清单

> 产品版本：Ocean-v1.0  
> npm version：1.0.0  
> 稳定代码基线：postlaunch-v0.7.6  
> 战斗规则：rule-v1.4  
> 页面流程：page-flow-v1.5  
> Socket Protocol：1.6

## 发布定位

Ocean-v1.0 是《海战 OCEAN》的第一版正式上线版本。正式版由已经完成 293/293 acceptance 的 v0.7.6 直接固化而来；除发布名称、版本元数据、当前文档引用与页面版本展示外，不改变已验收的游戏行为。

## 核心能力

- 12×12 海域。
- 2 人对战与 3 人 FFA。
- 三人模式每个正常回合分别对另外两名仍在局敌人完成一次合法操作，两张敌方地图独立记录。
- 直升机在三人双敌存活时同时作用于两名敌人。
- 终局手动诱饵鱼雷同时作用于其他所有仍在局敌人。
- 玩家主动掷骰决定先手，随机结果由服务器生成；唯一最高结果额外展示 3 秒。
- 单位状态、HP、资源与行动入口融合显示。
- 服务器权威结算与 Actor / Defender / Observer 信息隔离。
- 断线重连、行动超时、淘汰、最终齐射、再来一局。

## 正式发布元数据

- `/api/health`、`/api/status` 与 Socket `system:ready` 的 stage：`Ocean-v1.0`。
- 前端 `Data.RELEASE.version`：`1.0.0`。
- 前端 `Data.RELEASE.stage`：`Ocean-v1.0`。
- Rule：`1.4`。
- Socket Protocol：`1.6`。

## 上线门槛

在 Node.js 24+ 环境执行：

```text
npm ci
npm run acceptance
```

要求全部测试通过后再推送正式线上分支。
