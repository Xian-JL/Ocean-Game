# 《海战 OCEAN》Ocean-v1.3.1 正式发布清单

> 产品版本：Ocean-v1.3.1  
> npm version：1.3.1  
> 稳定代码基线：Ocean-v1.3  
> 规则：rule-v1.8（未修改）  
> 页面流程：page-flow-v2.1（未修改）  
> Socket Protocol：2.1（未修改）

## 1. 本版唯一改动

- 重构浏览器合成音效库，提高音效响度、层次和辨识度。
- 为界面、房间、部署、标记、十种战斗行动、教程、系统状态和胜负结果配置差异化音效。
- 服务器操作成功后再播放对应声音；无效的部署或标记操作不播放成功反馈。
- 隐藏武器使用固定行动声，不按秘密结算结果变化，保证音效不泄露情报。
- 保留既有音效开关、音效音量、音乐开关和音乐音量设置。

## 2. 明确不变

- rule-v1.8 的全部单位、伤害、资源、地图参数和胜负规则不变。
- 五章教程与新手、标准、专家三档人机逻辑不变。
- 1v1 联机、1v1 人机、三人 FFA、动态地图、消息投影和私人标记不变。
- page-flow-v2.1 与 Socket Protocol 2.1 不变。
- 不新增外部音效文件、依赖或网络请求。

## 3. 主要改动文件

```text
public/js/audio-system.js
public/js/app.js
public/index.html
test/ocean-v1.2.4-audio.test.js
test/ocean-v1.3.1-audio.test.js
test/ocean-v1.3.1-consistency.test.js
docs/audio-design-v1.3.1.md
```

## 4. 必测项目

- 十种战斗行动分别映射到十种独立音效。
- 部署、拖动、旋转、删除、撤销、随机部署、准备、标记和目标锁定音效正常。
- 房间、教程、暂停、重连、淘汰与胜负音效正常。
- 潜射导弹、核弹和震爆弹不会因命中结果改变声音。
- 音效关闭、音量调节、背景音乐调节与缺失音乐文件的回退行为正常。
- 完整规则、人机、教程、联机、三人、手机端和上线稳定性回归通过。

## 5. 音乐文件

背景音乐仍使用：

```text
public/assets/audio/music/ocean-theme.mp3
```

若源码包没有该文件，从上一正式版本相同路径复制即可。该文件与 v1.3.1 的操作音效无关。

## 6. 验收命令

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-v1.3.1"
npm ci
npm run acceptance
npm start
```

验收全部通过，并实际试听十种行动、部署编辑、消息状态和胜负音效后，再发布 `v1.3.1` 标签。
