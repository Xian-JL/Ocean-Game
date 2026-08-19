# 海战 OCEAN · Ocean-v1.1

`Ocean-v1.1` 以通过 293/293 acceptance 的正式版 `Ocean-v1.0` 为唯一基线，新增公平的服务端规则型机器人和独立 `1v1 人机`模式。原 1v1 联机与三人 FFA 保持不变。

## 正式版本基线

- 产品名称：Ocean-v1.1
- npm version：1.1.0
- 战斗规则：rule-v1.5
- 页面流程：page-flow-v1.6
- Socket Protocol：1.7
- 稳定代码基线：Ocean-v1.0
- 棋盘：12×12
- 模式：1v1 联机 / 1v1 人机 / 3 人 FFA
- Node.js：>=24

## 本机运行

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-v1.1"
npm ci
npm start
```

## 正式验收

```powershell
npm run acceptance
```

正式上线前要求全部测试通过。

## 当前文档

- `docs/rule-v1.5.md`
- `docs/page-flow-v1.6.md`
- `docs/socket-protocol-v1.0.md`
- `docs/release-manifest-Ocean-v1.1.md`

历史 postlaunch / UI 迭代文档保留用于追溯，不代表当前线上发布名称。
