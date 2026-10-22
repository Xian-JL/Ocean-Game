# OCEAN UI 2 开发交付

本轮交付基线：`E:\Codex_workspace\Ocean\spec-v1.3-ui.md` v1.3。设计方向为简约、高级的科幻舰队控制台。最新 `spec.md` 已进入 v1.5 动效与训练营增量；本目录仍记录上一轮 UI 交付与证据，不代表新增动效已实现。

开发状态与基础证据见 `development-handoff.md`；最终逐项状态见 `acceptance-report.md`。两者不等同于独立验收通过。

## 运行

```powershell
Set-Location 'E:\Codex_workspace\Ocean\Ocean-Game-release'
npm ci
npm start
```

`npm start` 在启动前构建。默认仅监听本机 `127.0.0.1:3000`。端口占用时先 `npm run build`，再用 `node server/server.js --host 127.0.0.1 --port 3001`。

编辑 `client/` 和 `client/styles/`，运行 `npm run build` 生成 `public/js/app.js`、`public/css/ocean.css`。不要手工编辑生成文件。18 个脚本源模块在同一私有应用作用域内组合，不将房间或部署挂到 window；6 个样式层各自管理令牌、基础组件、页面、地图、战斗和断点。

构建对内容计算缓存版本，写入共享 release config；构建后重启服务、刷新页面才能取得完整一致的新版本。当前房间在内存中，服务重启会使旧房间失效。`npm run dev` 监听服务端及依赖，前端没有热更新。

## 基础验证

```powershell
npm run check
node --test test/ui-console.test.js test/ui-dom.test.js test/ui-full-match-integration.test.js
npm run acceptance
```

完整验收脚本需要本机 3000 端口空闲；自己的开发预览可用其他端口。语法/自动化通过不代表真机、全浏览器、全视口或性能预算已经验收。

## 设计与证据

- `design/components.html`、`components-light.html`、`components-dusk.html`：组件规范，显式使用演示内容，不是正式游戏状态。
- `design/tokens.json`：实际采用的令牌。
- `design/information-decisions.md`：各页信息保留、合并、展开与装饰取舍。
- `design/assets.json`：现有运行图形与使用策略；本轮复用素材，没有新增生图依赖。
- `evidence/visual/`：真实页面截图及清单。
- `evidence/tests/`：原始测试输出；`test-migration.json` 和 `test-migration.md` 说明旧断言迁移。

组件参考可用 `node scripts/preview-design.js` 在本机3003查看。该服务不接入正式游戏入口，无房间或秘密状态。

## 结构与回退

旧 CSS 文件保留供历史测试/来源追踪，正式 HTML 仅加载 `ocean.css`。规则、AI、伤害、部署、时间和胜负引擎沿用基线。服务端安全视图增加已公开的淘汰 ID 列表，供原有 UI 所需的淘汰状态正确显示，不包含敌舰/HP/隐藏结果。

所有变更在工作区可审查；本轮不自动推送、合并或发布。回退应使用版本控制恢复对应文件和构建产物，不执行材料根目录的清空覆盖脚本。


## v1.6.2 精简发布

逐帧截图与GIF已归档到[完整验收证据包](https://github.com/Xian-JL/Ocean-Game/releases/download/v1.6.2/Ocean-v1.6.2-evidence.zip)，按原项目相对路径保存；本地仅保留代表截图、原始清单与测试记录。历史构建不冒充v1.6.2当前验收。
