# 海战 OCEAN · postlaunch-v0.7.5

`postlaunch-v0.7.5` 是 v0.7.x UI 重构系列收尾版，玩法基线继续冻结在 `postlaunch-v0.6.2 / rule-v1.4 / Socket 1.5`。

## v0.7.5 UI 范围

- 最终齐射升级为独立终局阶段：己方鱼雷选择、本轮就绪状态和多目标同步结算关系集中展示。
- 其他玩家的秘密鱼雷坐标继续隐藏；三人局一枚己方鱼雷仍同时作用于其他所有仍在局玩家。
- 结算页改为现代结果页：胜负、回合数、时长、玩家航母状态、复盘与再来一局形成清晰层级。
- 三人再来一局按每名玩家分别展示申请状态，不退化为双人“对方”表达。
- 接入本地 SVG 图标资源，覆盖舰船、十项行动和主要状态反馈，不依赖在线图标服务。
- 完成最终响应式、触控、键盘焦点、高对比度和减少动画收尾。
- 不修改 v0.6.2 任何游戏规则、数值、隐藏信息和服务器权威逻辑。

## 本地验收

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-project-postlaunch-v0.7.5"
npm ci
npm run acceptance
```

规则见 `docs/rule-v1.4.md`，页面流程基线见 `docs/page-flow-v1.4.md`，Socket 协议见 `docs/socket-protocol-v0.8.md`，UI 总规范见 `docs/UI_design-v0.7.0.txt`，本版清单见 `docs/release-manifest-postlaunch-v0.7.5.md`。
