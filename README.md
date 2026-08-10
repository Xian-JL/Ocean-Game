# 海战 OCEAN · postlaunch-v0.7.6

`postlaunch-v0.7.6` 是基于 v0.7.5 的交互微调版。战斗玩法继续使用 `rule-v1.4`，三人双目标回合、独立敌方地图、直升机多目标与终局鱼雷逻辑均不改变。

本版两项改动：

1. 开局掷骰改为每名玩家主动点击“掷骰子”；随机点数仍完全由服务器生成。全部玩家完成当前轮后才判断先手，同点则所有玩家进入下一轮再次主动投掷。先手确定后的展示时间在原阶段停留基础上额外增加 3 秒。
2. 对战右侧将各兵种的生命值、状态、剩余资源与其对应行动融合到同一兵种卡片，减少“行动区”和“舰队状态区”之间来回观察。

## 本地运行

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-project-postlaunch-v0.7.6"
npm ci
npm run acceptance
npm start
```

Node.js 要求 `>=24.0.0`。

## 当前基线

- 发布版本：0.7.6
- 规则：rule-v1.4
- 页面流程：page-flow-v1.5
- Socket Protocol：1.6
- 战斗玩法基线：postlaunch-v0.6.2

相关文档：

- `docs/rule-v1.4.md`
- `docs/page-flow-v1.5.md`
- `docs/socket-protocol-v0.9.md`
- `docs/UI_design-v0.7.0.txt`
- `docs/release-manifest-postlaunch-v0.7.6.md`
