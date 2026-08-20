# 海战 OCEAN · Ocean-v1.2.4

`Ocean-v1.2.4` 基于已通过验收的 `Ocean-v1.2.1`，修复联机地图坐标对齐，重构声音设置入口，并收紧行动反馈的信息边界。1v1 联机、1v1 人机、三人 FFA、三档动态地图及既有战斗数值继续保留。

## 正式版本基线

- 产品名称：Ocean-v1.2.4
- npm version：1.2.4
- 战斗规则：rule-v1.7
- 页面流程：page-flow-v1.9
- Socket Protocol：1.9
- 稳定代码基线：Ocean-v1.2.1
- 棋盘：10×10 / 12×12 / 15×15（默认 12×12）
- 模式：1v1 联机 / 1v1 人机 / 3 人 FFA
- Node.js：>=24

## v1.2.4 更新

- 1v1 与三人联机的所有地图改为显式网格定位，字母行号、数字列号与格子一一对齐。
- 顶部“音效”“背景音乐”按钮改为声音设置入口；声音控制不再放在“帮助”中。
- 普通攻击的行动方只获得命中/未命中，不获得敌方单位名称、伤害、生命值或沉没信息；防守方获得己方准确受击变化。
- 潜射导弹、核弹和震爆弹继续不向行动方报告是否命中或生效。
- 核弹命中航空母舰仍由服务器扣除 2 点生命值，并由自动测试锁定。

## 本机运行

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-v1.2.4"
npm ci
npm start
```

## 正式验收

```powershell
npm run acceptance
```

正式上线前要求全部检查和自动测试通过。

## 声音资源

音效由浏览器实时合成，不需要准备音效文件。点击页面顶部的“音效”或“背景音乐”按钮会打开独立声音设置层，可分别开关并以 0～100 调整音量，偏好保存在当前浏览器。

若要启用背景音乐，请将拥有合法使用权的 MP3 命名为 `ocean-theme.mp3`，放入：

```text
public/assets/audio/music/ocean-theme.mp3
```

没有该文件时游戏和合成音效仍可正常运行。

## 当前文档

- `docs/rule-v1.7.md`
- `docs/page-flow-v1.9.md`
- `docs/socket-protocol-v1.2.md`
- `docs/release-manifest-Ocean-v1.2.4.md`

历史 postlaunch / UI / 规则文档保留用于追溯，不代表当前线上发布名称。
