# 《海战 OCEAN》Ocean-v1.3.3 正式发布清单

> 产品版本：Ocean-v1.3.3  
> npm version：1.3.3  
> 规则：rule-v1.8  
> 页面流程：page-flow-v2.1  
> Socket 协议：2.1

## 更新范围

- 接入用户筛选并上传的真实音频素材。
- 战斗、部署、私人标记、教程、房间和系统状态继续保持差异化音效。
- 新增本地素材缓存、分层播放、裁剪、延迟、响度与播放速率控制。
- 保留 Web Audio 合成回退、压缩器母线、独立音量和并发限制。
- 不修改游戏规则、数值、教程、人机、联机协议、主题或 UI 布局。

## 关键文件

- `public/js/audio-system.js`
- `public/assets/audio/effects/source/`
- `docs/audio-design-v1.3.3.md`
- `test/ocean-v1.3.3-audio.test.js`
- `test/ocean-v1.3.3-consistency.test.js`

## 隐私边界

潜射导弹、核弹和震爆弹只按行动名称选择固定音效，不读取服务器秘密结果。三人局同一行动也只播放一次执行音。

## 验收

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-v1.3.3"
npm ci
npm run acceptance
npm start
```

打开 `http://127.0.0.1:3000`，依次试听十种行动、部署、私人标记、己方回合开始、暂停、胜利和失败。

