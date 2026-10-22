# OCEAN UI 改版验收预填单

- 日期：2026-10-21；需求基线：spec v1.3。
- 文件哈希、构建资源版本与源文件哈希见 `build-manifest.json`。
- 代码基线：959ed06；本轮变更位于工作区，尚未提交或发布。
- 开发阶段：实现与基础验证完成，待独立验收。
- 当前最终验收门槛：**尚不能判定通过**；按spec第29节，必测环境和性能未测时不能签发通过。
- 本文件是开发预填单，不是独立验收报告。每项如实保留待复验/未测。

## 已执行的基础验证

`npm run acceptance`：452项，452通过，0失败，0跳过。原始输出 `evidence/tests/final-acceptance.log`。

保留全部原测试文件；37项历史视觉形状断言迁移，真实DOM/双客户端测试助手适配，新增9项控制台行为。详见test-migration.md/json。

真实本地浏览器走通人机创建、部署、准备、掷骰/重投、雷达选点与统一指令台执行；查看过桌面、390×844模拟手机、行动抽屉与设置。运行截图在evidence/visual，组件/令牌/信息取舍/素材清单在design。

## 待独立执行

- iOS Safari、Android Chrome真机，Edge/Firefox等完整兼容、全部临界视口与三主题×五强调色全状态矩阵。
- 第23节正式p95、fps、长任务、循环内存、传输体积预算；当前没有正式通过结论。
- 全304项独立审定、深层权限/幂等专项与最终视觉质量。
- 日志沿用已有完整数据与列表渲染，超长局的性能及窗口化需要由专项采样确认，不能宣称内存/长局预算已通过。

## 逐项状态

| 需求 ID | 当前状态 | 实现/定位入口 | 证据与备注 |
| --- | --- | --- | --- |
| EXEC-01 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-02 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-03 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-04 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-05 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-06 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-07 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-08 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-09 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-10 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-11 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| EXEC-12 | 待独立复验 | spec.md §0 / development-handoff.md | 基础证据见本报告，最终结论待独立核对 |
| GOV-01 | 待独立复验 | spec.md / docs/ui-redesign | 基础证据见本报告，最终结论待独立核对 |
| GOV-02 | 待独立复验 | spec.md / docs/ui-redesign | 基础证据见本报告，最终结论待独立核对 |
| GOV-03 | 待独立复验 | spec.md / docs/ui-redesign | 基础证据见本报告，最终结论待独立核对 |
| GOV-04 | 待独立复验 | spec.md / docs/ui-redesign | 基础证据见本报告，最终结论待独立核对 |
| GOV-05 | 待独立复验 | spec.md / docs/ui-redesign | 基础证据见本报告，最终结论待独立核对 |
| GOV-06 | 待独立复验 | spec.md / docs/ui-redesign | 基础证据见本报告，最终结论待独立核对 |
| GOV-07 | 待独立复验 | spec.md / docs/ui-redesign | 基础证据见本报告，最终结论待独立核对 |
| SCOPE-01 | 待独立复验 | client/*-view.js / ui-dom.test.js | 基础证据见本报告，最终结论待独立核对 |
| SCOPE-02 | 待独立复验 | client/*-view.js / ui-dom.test.js | 基础证据见本报告，最终结论待独立核对 |
| SCOPE-03 | 待独立复验 | client/*-view.js / ui-dom.test.js | 基础证据见本报告，最终结论待独立核对 |
| SCOPE-04 | 待独立复验 | client/*-view.js / ui-dom.test.js | 基础证据见本报告，最终结论待独立核对 |
| SCOPE-05 | 待独立复验 | client/*-view.js / ui-dom.test.js | 基础证据见本报告，最终结论待独立核对 |
| SCOPE-06 | 待独立复验 | client/*-view.js / ui-dom.test.js | 基础证据见本报告，最终结论待独立核对 |
| SCOPE-07 | 待独立复验 | client/*-view.js / ui-dom.test.js | 基础证据见本报告，最终结论待独立核对 |
| SCOPE-08 | 待独立复验 | client/*-view.js / ui-dom.test.js | 基础证据见本报告，最终结论待独立核对 |
| VIS-01 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-02 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-03 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-04 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-05 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-06 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-07 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-08 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-09 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-10 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-11 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| VIS-12 | 待独立复验 | client/styles / design / evidence/visual | 基础证据见本报告，最终结论待独立核对 |
| DS-01 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-02 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-03 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-04 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-05 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-06 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-07 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-08 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-09 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-10 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-11 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-12 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-13 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| DS-14 | 待独立复验 | client/styles/tokens.css / base.css | 基础证据见本报告，最终结论待独立核对 |
| PREM-01 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-02 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-03 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-04 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-05 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-06 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-07 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-08 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-09 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-10 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-11 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-12 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-13 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-14 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-15 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| PREM-16 | 待独立复验 | design/information-decisions.md / client/styles | 基础证据见本报告，最终结论待独立核对 |
| LAY-01 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-02 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-03 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-04 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-05 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-06 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-07 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-08 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-09 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-10 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-11 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-12 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-13 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| LAY-14 | 待独立复验 | client/styles/responsive.css / accessibility.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-01 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-02 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-03 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-04 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-05 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-06 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-07 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-08 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-09 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| ENTRY-10 | 待独立复验 | client/entry-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| LOBBY-01 | 待独立复验 | client/entry-view.js / connection.js | 基础证据见本报告，最终结论待独立核对 |
| LOBBY-02 | 待独立复验 | client/entry-view.js / connection.js | 基础证据见本报告，最终结论待独立核对 |
| LOBBY-03 | 待独立复验 | client/entry-view.js / connection.js | 基础证据见本报告，最终结论待独立核对 |
| LOBBY-04 | 待独立复验 | client/entry-view.js / connection.js | 基础证据见本报告，最终结论待独立核对 |
| LOBBY-05 | 待独立复验 | client/entry-view.js / connection.js | 基础证据见本报告，最终结论待独立核对 |
| LOBBY-06 | 待独立复验 | client/entry-view.js / connection.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-01 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-02 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-03 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-04 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-05 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-06 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-07 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-08 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-09 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-10 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-11 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-12 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-13 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-14 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-15 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DEP-16 | 待独立复验 | client/deployment-view.js / deployment-input.js | 基础证据见本报告，最终结论待独立核对 |
| DICE-01 | 待独立复验 | client/deployment-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| DICE-02 | 待独立复验 | client/deployment-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| DICE-03 | 待独立复验 | client/deployment-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| DICE-04 | 待独立复验 | client/deployment-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| DICE-05 | 待独立复验 | client/deployment-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| DICE-06 | 待独立复验 | client/deployment-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-01 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-02 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-03 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-04 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-05 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-06 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-07 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-08 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-09 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-10 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-11 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-12 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-13 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| BATTLE-14 | 待独立复验 | client/battle-view.js / command-view.js | 基础证据见本报告，最终结论待独立核对 |
| MAP-01 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-02 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-03 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-04 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-05 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-06 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-07 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-08 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-09 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-10 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-11 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-12 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-13 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-14 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-15 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-16 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-17 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| MAP-18 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| CMD-01 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-02 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-03 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-04 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-05 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-06 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-07 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-08 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-09 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-10 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-11 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-12 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-13 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-14 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-15 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| CMD-16 | 待独立复验 | client/commands.js / battle-view.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-01 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-02 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-03 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-04 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-05 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-06 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-07 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-08 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-09 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| FFA-10 | 待独立复验 | client/battle-view.js / server/game/information-projection.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-01 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-02 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-03 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-04 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-05 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-06 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-07 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-08 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-09 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| INTEL-10 | 待独立复验 | client/battle-map.js / battle-view.js / events.js | 基础证据见本报告，最终结论待独立核对 |
| SALVO-01 | 待独立复验 | client/battle-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| SALVO-02 | 待独立复验 | client/battle-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| SALVO-03 | 待独立复验 | client/battle-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| SALVO-04 | 待独立复验 | client/battle-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| SALVO-05 | 待独立复验 | client/battle-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| SALVO-06 | 待独立复验 | client/battle-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| SALVO-07 | 待独立复验 | client/battle-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| SALVO-08 | 待独立复验 | client/battle-view.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| RESULT-01 | 待独立复验 | client/result-view.js | 基础证据见本报告，最终结论待独立核对 |
| RESULT-02 | 待独立复验 | client/result-view.js | 基础证据见本报告，最终结论待独立核对 |
| RESULT-03 | 待独立复验 | client/result-view.js | 基础证据见本报告，最终结论待独立核对 |
| RESULT-04 | 待独立复验 | client/result-view.js | 基础证据见本报告，最终结论待独立核对 |
| RESULT-05 | 待独立复验 | client/result-view.js | 基础证据见本报告，最终结论待独立核对 |
| RESULT-06 | 待独立复验 | client/result-view.js | 基础证据见本报告，最终结论待独立核对 |
| RESULT-07 | 待独立复验 | client/result-view.js | 基础证据见本报告，最终结论待独立核对 |
| RESULT-08 | 待独立复验 | client/result-view.js | 基础证据见本报告，最终结论待独立核对 |
| RESULT-09 | 待独立复验 | client/result-view.js | 基础证据见本报告，最终结论待独立核对 |
| TUT-01 | 待独立复验 | client/tutorial-view.js / public/js/tutorial-system.js | 基础证据见本报告，最终结论待独立核对 |
| TUT-02 | 待独立复验 | client/tutorial-view.js / public/js/tutorial-system.js | 基础证据见本报告，最终结论待独立核对 |
| TUT-03 | 待独立复验 | client/tutorial-view.js / public/js/tutorial-system.js | 基础证据见本报告，最终结论待独立核对 |
| TUT-04 | 待独立复验 | client/tutorial-view.js / public/js/tutorial-system.js | 基础证据见本报告，最终结论待独立核对 |
| TUT-05 | 待独立复验 | client/tutorial-view.js / public/js/tutorial-system.js | 基础证据见本报告，最终结论待独立核对 |
| TUT-06 | 待独立复验 | client/tutorial-view.js / public/js/tutorial-system.js | 基础证据见本报告，最终结论待独立核对 |
| TUT-07 | 待独立复验 | client/tutorial-view.js / public/js/tutorial-system.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-01 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-02 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-03 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-04 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-05 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-06 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-07 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-08 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-09 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| SEC-10 | 待独立复验 | information-projection.test.js / security-hardening.test.js | 基础证据见本报告，最终结论待独立核对 |
| COMP-01 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-02 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-03 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-04 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-05 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-06 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-07 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-08 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-09 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-10 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-11 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| COMP-12 | 待独立复验 | client/accessibility.js / styles/base.css | 基础证据见本报告，最终结论待独立核对 |
| PREF-01 | 待独立复验 | client/preferences.js / public/index.html | 基础证据见本报告，最终结论待独立核对 |
| PREF-02 | 待独立复验 | client/preferences.js / public/index.html | 基础证据见本报告，最终结论待独立核对 |
| PREF-03 | 待独立复验 | client/preferences.js / public/index.html | 基础证据见本报告，最终结论待独立核对 |
| PREF-04 | 待独立复验 | client/preferences.js / public/index.html | 基础证据见本报告，最终结论待独立核对 |
| PREF-05 | 待独立复验 | client/preferences.js / public/index.html | 基础证据见本报告，最终结论待独立核对 |
| PREF-06 | 待独立复验 | client/preferences.js / public/index.html | 基础证据见本报告，最终结论待独立核对 |
| PREF-07 | 待独立复验 | client/preferences.js / public/index.html | 基础证据见本报告，最终结论待独立核对 |
| PREF-08 | 待独立复验 | client/preferences.js / public/index.html | 基础证据见本报告，最终结论待独立核对 |
| NET-01 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-02 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-03 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-04 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-05 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-06 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-07 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-08 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-09 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-10 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-11 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| NET-12 | 待独立复验 | client/connection.js / transport.js / commands.js | 基础证据见本报告，最终结论待独立核对 |
| FX-01 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| FX-02 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| FX-03 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| FX-04 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| FX-05 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| FX-06 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| FX-07 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| FX-08 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| FX-09 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| FX-10 | 待独立复验 | client/battle-map.js / artwork.js / styles/map.css | 基础证据见本报告，最终结论待独立核对 |
| A11Y-01 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-02 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-03 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-04 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-05 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-06 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-07 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-08 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-09 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-10 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-11 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| A11Y-12 | 待独立复验 | client/accessibility.js / ui-console.test.js | 基础证据见本报告，最终结论待独立核对 |
| ASSET-01 | 待独立复验 | design/assets.json / client/artwork.js | 基础证据见本报告，最终结论待独立核对 |
| ASSET-02 | 待独立复验 | design/assets.json / client/artwork.js | 基础证据见本报告，最终结论待独立核对 |
| ASSET-03 | 待独立复验 | design/assets.json / client/artwork.js | 基础证据见本报告，最终结论待独立核对 |
| ASSET-04 | 待独立复验 | design/assets.json / client/artwork.js | 基础证据见本报告，最终结论待独立核对 |
| ASSET-05 | 待独立复验 | design/assets.json / client/artwork.js | 基础证据见本报告，最终结论待独立核对 |
| ASSET-06 | 待独立复验 | design/assets.json / client/artwork.js | 基础证据见本报告，最终结论待独立核对 |
| ASSET-07 | 待独立复验 | design/assets.json / client/artwork.js | 基础证据见本报告，最终结论待独立核对 |
| PERF-01 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| PERF-02 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| PERF-03 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| PERF-04 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| PERF-05 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| PERF-06 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| PERF-07 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| PERF-08 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| PERF-09 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| PERF-10 | 未测 | build-manifest.json / 待独立性能采样 | 基础证据见本报告，最终结论待独立核对 |
| ENG-01 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |
| ENG-02 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |
| ENG-03 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |
| ENG-04 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |
| ENG-05 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |
| ENG-06 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |
| ENG-07 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |
| ENG-08 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |
| ENG-09 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |
| ENG-10 | 待独立复验 | client/modules.json / scripts/build-ui.js / test-migration.md | 基础证据见本报告，最终结论待独立核对 |

## 变更与复验

spec 1.3仅记录用户授权当前Sol续作，没有降低功能、权限或最终验收标准。后续修复需更新构建清单和关联证据；独立验收者逐项判定，不能把本表批量改成通过。
