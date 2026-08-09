# 海战 OCEAN · postlaunch-v0.7.0

`postlaunch-v0.7.0` 是 UI 重构系列的第一版，玩法基线完全继承 `postlaunch-v0.6.2 / rule-v1.4 / Socket 1.5`。

本版只修改界面与交互表现，不修改舰船数值、行动规则、三人双目标回合、隐藏信息、计时、淘汰、断线重连、直升机多目标结算或终局鱼雷规则。

## v0.7.0 UI 范围

- 建立统一 Design System：颜色、间距、圆角、阴影、动效和层级变量；
- 重构全局应用壳、顶部导航、连接状态、帮助入口和弱化版本信息；
- 重构首页：昵称、2/3 人模式切换、创建房间、加入房间和恢复对局；
- 重构等待房间：房间码、邀请操作、2/3 人席位卡片和在线状态；
- 统一 Toast、Modal、Tooltip、Loading、Focus 和减少动画行为；
- 将详细规则集中到“游戏说明”，减少主游戏页面常驻解释文字；
- 保留 v0.6.2 后续部署页、战斗页和结算页逻辑与 DOM 接口，为 v0.7.1+ 继续重构。

## 玩法基线

- 棋盘：12×12；
- 房间：2 人或 3 人 FFA；
- 三人正常回合：当前玩家分别对每名仍在局敌人各完成一次操作，两次操作共享 90 秒；
- 每名敌人拥有独立敌方地图记录；
- 直升机在两名敌人均在局时，同一行/列同时对两名敌人独立结算；
- 三人终局手动鱼雷：一枚选中鱼雷同一坐标同时作用于其他所有仍在局敌人；
- 每名玩家首个正常回合第一项操作强制雷达；
- 服务器继续作为所有游戏状态和合法性判断的唯一权威来源。

## 本地验收

要求 Node.js 24 或更高版本，`.node-version` 为 `24.19.0`。

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-project-postlaunch-v0.7.0"
npm ci
npm run acceptance
npm start
```

UI 规范见 `docs/UI_design-v0.7.0.txt`。

规则见 `docs/rule-v1.4.md`，页面流程基线见 `docs/page-flow-v1.4.md`，Socket 协议见 `docs/socket-protocol-v0.8.md`，本版发布清单见 `docs/release-manifest-postlaunch-v0.7.0.md`。
