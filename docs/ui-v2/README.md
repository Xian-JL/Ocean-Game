# OCEAN UI 2.0 · 开发交付

方向：暗黑军械库 × 战争史诗。视觉工作名“黑潮军械库”，产品名仍为海战OCEAN。

2026-10-24发布更新：本轮实现现随[v1.6.3](../releases/v1.6.3/README.md)发布。本目录保留开发阶段原始构建和证据，独立未测项不因发布而改为通过。

## 当前交付

当前工作区已完成界面与素材实现，状态为“开发完成，待独立验收”。基础回归为738项；产品仍为1.6.2，规则1.8，Socket 2.1。本轮未发布或推送。

首先阅读[开发交接](development-handoff.md)、[设计包](design-package.md)、[组件与迁移](components-and-migration.md)、[资源与特效](effects-and-assets.md)。实际构建见[构建清单](build-manifest.json)，生图提示及文件记录见[generated-art.json](generated-art.json)。

| 文件 | 用途 |
| --- | --- |
| [主规范](../../spec.md) | 全新视觉、布局、十行动、训练、主题、权限、响应式、预算与实施顺序 |
| [逐需求验收表](acceptance.md) | 194项U2需求，开发基础证据与独立验收状态 |
| [场景验收记录](scenarios.md) | 24项场景的已有基础覆盖与完整门槛 |
| [视觉验收表](visual-review.md) | 六项硬门槛、八项评分、用户/验收人结论 |
| [运行令牌](design-tokens.json) | 三主题、形状、尺寸和时长；与实际代码对应 |
| [参考记录](references.md) | 实际读取的官方资料与原创提案边界 |
| [功能基线](baseline-manifest.json) | 当前代码/协议/资源指纹、待保留训练功能和732项历史结果 |
| [规范指纹](spec-manifest.json) | 本规范SHA、旧规范SHA、条目编号与数量 |
| [旧规范归档](../spec-archive/spec-v1.5-core-combat.md) | 完整保留此前规范，不再约束新视觉 |

## 后续验收重点

首页需成为电影感舰坞，战斗需成为海图中心加武器基座；仅换色、加背景、缩小旧布局不通过。舰徽、切角、断刻线、军械槽和战果章面形成OCEAN自己的识别系统。逻辑/权限不变，训练保留四步、十行动和自动陪练。

开发阶段完成必要实现与基础验证后交付，复杂矩阵、真机/正式性能和最终审美由独立验收填写。没有证据的项目保留未测；不得自动发布。

## 运行与验证

npm start 后访问 http://127.0.0.1:3000 。合成组件与十行动样板位于 /armory-lab.html，不连接正式房间、不读取凭证。真实战斗可从训练营进入。

最终原始日志为 development-acceptance.log，依赖审计为 dependency-audit-final.json。中间失败日志标为 intermediate，不能当作最终结果。性能实测边界见[performance-report.md](performance-report.md)，静态资源分析见[resource-budget.json](resource-budget.json)。
