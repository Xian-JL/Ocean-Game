# 海战 OCEAN · Ocean-v1.2

`Ocean-v1.2` 以正式版 `Ocean-v1.1` 为基线，新增 10×10、12×12、15×15 三档动态地图、本地合成音效、背景音乐接口和轻量可关闭实时播报。1v1 联机、1v1 人机与三人 FFA 均保留。

## 正式版本基线

- 产品名称：Ocean-v1.2
- npm version：1.2.0
- 战斗规则：rule-v1.6
- 页面流程：page-flow-v1.7
- Socket Protocol：1.8
- 稳定代码基线：Ocean-v1.1
- 棋盘：10×10 / 12×12 / 15×15（默认 12×12）
- 模式：1v1 联机 / 1v1 人机 / 3 人 FFA
- Node.js：>=24

## 本机运行

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-v1.2"
npm ci
npm start
```

## 正式验收

```powershell
npm run acceptance
```

正式上线前要求全部测试通过。

## 背景音乐

音效由浏览器实时合成，不需要准备音效文件。若要启用背景音乐，请将拥有合法使用权的 MP3 命名为 `ocean-theme.mp3`，放入：

```text
public/assets/audio/music/ocean-theme.mp3
```

没有该文件时游戏和音效仍正常运行。

## 当前文档

- `docs/rule-v1.6.md`
- `docs/page-flow-v1.7.md`
- `docs/socket-protocol-v1.1.md`
- `docs/release-manifest-Ocean-v1.2.md`

历史 postlaunch / UI 迭代文档保留用于追溯，不代表当前线上发布名称。
