# 《海战 OCEAN》Ocean-v1.3.2 正式发布清单

> 产品版本：Ocean-v1.3.2  
> npm version：1.3.2  
> 稳定代码基线：Ocean-v1.3.1  
> 规则：rule-v1.8（未修改）  
> 页面流程：page-flow-v2.1（未修改）  
> Socket Protocol：2.1（未修改）

## 1. 本版唯一改动

- **个性化主题与强调色**：新增独立“个性化设置”弹窗，三套界面主题（深海暗夜 / 极地寒光 / 黄昏余晖）与五种强调色（离子青 / 荣耀金 / 翡翠绿 / 赤焰红 / 极光紫）；`theme-bootstrap.js` 首帧防闪烁；设置只存本机（`ocean.theme.v1` / `ocean.accent.v1`）。
- **音效引擎母线增强**：`effectsBus / musicBus → DynamicsCompressor → masterGain → destination` 主音频链，防止多音削波；新增 12 个并发上限；音频库内部版本升级为 `2.0`。
- **UI 设计令牌化**：`main.css` 建立“色板 → 语义 → 旧变量别名”三层令牌体系，高频硬编码颜色与半透明色（`rgba(var(--x-rgb), alpha)` 派生）迁移为令牌，视觉零变化。

## 2. 明确不变

- rule-v1.8 的全部单位、伤害、资源、地图参数和胜负规则不变。
- 五章教程与新手、标准、专家三档人机逻辑不变。
- 1v1 联机、1v1 人机、三人 FFA、动态地图、消息投影和私人标记不变。
- page-flow-v2.1 与 Socket Protocol 2.1 不变。
- 不新增外部音效文件、依赖或网络请求；个性化设置不进入网络协议。

## 3. 主要改动文件

```text
public/js/audio-system.js
public/js/theme-bootstrap.js        （新增）
public/js/app.js
public/css/main.css
public/index.html
package.json
server/release.js
public/js/game-data.js
test/ocean-v1.3.2-audio.test.js     （由 v1.3.1 演进）
test/ocean-v1.3.2-consistency.test.js（由 v1.3.1 演进）
test/ocean-v1.3.2-theme.test.js     （新增）
scripts/acceptance-check.js
README.md
docs/audio-design-v1.3.2.md         （新增）
docs/ui-theme-v1.0.md               （新增）
```

## 4. 必测项目

- 三套主题在首页、等待、部署、掷骰、对战、结算、教程与全部弹窗中布局正常、文字可读。
- 五种强调色在暗色与亮色主题下作用于边框、图标与激活状态。
- 主题与强调色切换即时生效、刷新后保持、恢复默认正常。
- 个性化弹窗在手机端（≤480px）布局正常，触控点不小于 42px。
- 音效总线与压缩器存在且可回退；快速连续操作无爆音；音效/音乐开关与音量行为不变。
- 潜射导弹、核弹、震爆弹不因命中结果改变声音（自动化测试覆盖）。
- 完整规则、人机、教程、联机、三人、手机端和上线稳定性回归通过。

## 5. 音乐文件

背景音乐仍使用：

```text
public/assets/audio/music/ocean-theme.mp3
```

若源码包没有该文件，从上一正式版本相同路径复制即可。该文件与 v1.3.2 的操作音效和主题无关。

## 6. 验收命令

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-v1.3.2"
npm ci
npm run acceptance
npm start
```

验收全部通过，并实际切换三套主题、五种强调色与试听音效后，再发布 `v1.3.2` 标签。
