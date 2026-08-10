# 海战 OCEAN · Ocean-v1.0

`Ocean-v1.0` 是《海战 OCEAN》的第一版正式上线版本，代码基线来自已完成 293/293 acceptance 的 `v0.7.6`。本次正式化只统一发布命名与版本元数据，不修改已经验收通过的游戏玩法。

## 正式版本基线

- 产品名称：Ocean-v1.0
- npm version：1.0.0
- 战斗规则：rule-v1.4
- 页面流程：page-flow-v1.5
- Socket Protocol：1.6
- 稳定代码基线：v0.7.6
- 棋盘：12×12
- 模式：2 人 / 3 人 FFA
- Node.js：>=24

## 本机运行

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-v1.0"
npm ci
npm start
```

## 正式验收

```powershell
npm run acceptance
```

正式上线前要求全部测试通过。

## 当前文档

- `docs/rule-v1.4.md`
- `docs/page-flow-v1.5.md`
- `docs/socket-protocol-v0.9.md`
- `docs/release-manifest-Ocean-v1.0.md`

历史 postlaunch / UI 迭代文档保留用于追溯，不代表当前线上发布名称。
