# 《海战 OCEAN》Ocean-v1.3 正式发布清单

> 产品版本：Ocean-v1.3  
> npm version：1.3.0  
> 稳定代码基线：Ocean-v1.2.7  
> 规则：rule-v1.8（未修改）  
> 页面流程：page-flow-v2.1  
> Socket Protocol：2.1

## 1. 本版交付

- 五章完整交互教程：部署、伤害格、情报与标记、隐藏武器与消息、指挥考核。
- 教程可离线运行，不创建房间；本机保存章节完成度，支持复习和完成后预选新手人机。
- 1v1 人机新增新手、标准、专家三档；标准档完整保留 v1.2.7 行为。
- 新手合法随机；专家加入否定情报排除、命中方向延伸、扫描去重和资源权衡。
- 难度由服务器校验并随房间锁定；PVP 不携带有效难度，三人人机仍不存在。
- 教程和难度选择完整适配手机、键盘和正式 CSP。

## 2. 明确不变

- rule-v1.8 的单位、伤害、资源、动态范围和胜负规则不变。
- 10×10、12×12、15×15 地图参数不变。
- 1v1 联机和三人 FFA 结算不变；三人仍为一次行动同时作用另两方且行动方成本只算一次。
- 消息保密、私人标记、断线重连、最终鱼雷、声音和手机 UI 基线不变。
- 不加入快速对战、额外邀请链接设计、标准/自定义规则模式或三人人机。

## 3. 主要新增文件

```text
server/game/bot-difficulty.js
public/js/tutorial-system.js
docs/tutorial-design-v1.3.md
docs/bot-design-v1.3.md
docs/page-flow-v2.1.md
docs/socket-protocol-v2.1.md
test/ocean-v1.3-tutorial-bot.test.js
test/ocean-v1.3-consistency.test.js
```

主要修改文件包括 `room.js`、`room-service.js`、`match.js`、`game-gateway.js`、`bot-strategy.js`、`app.js`、`index.html` 和 `main.css`。

## 4. 必测项目

- 三种难度创建、公开、重连和再来一局保持一致；非法值被拒绝。
- 三档机器人只读取安全玩家视图，所有生成意图合法。
- 专家否定雷达排除、探测分层、相邻命中方向延伸和终局鱼雷选择符合设计。
- 五章教程可以连续完成；错误操作不推进；本地进度可恢复。
- 教程入口在断网时可用且不触发房间请求。
- 双客户端从创建到结算、重连、复盘、再来一局继续通过。
- 1v1、三人、动态地图、信息保密、音频、手机 UI 和上线稳定性全部回归。

## 5. 音乐文件

源码包可能不含用户自备的背景音乐。正式目录应确认：

```text
public/assets/audio/music/ocean-theme.mp3
```

若缺失，从 `Ocean-v1.2.7` 的相同相对路径复制。缺少该文件时游戏和浏览器合成音效仍可正常运行。

## 6. 验收命令

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-v1.3"
npm ci
npm run acceptance
npm start
```

验收全部通过且手工检查教程五章、三档人机各一局后，方可覆盖 release 仓库并发布 `v1.3` 标签。
