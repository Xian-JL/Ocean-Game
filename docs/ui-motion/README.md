# OCEAN v1.5 动效交付

## 2026-10-22 视觉修正

根据用户反馈，已恢复被隐藏的原有特效并增强新增表现；当前构建1.6.1-ui2.da71186532。本次727项完整回归通过，日志为[final-effects-acceptance.log](evidence/tests/final-effects-acceptance.log)。实际动态预览和原因说明见[特效恢复记录](evidence/restoration/README.md)。旧证据保留历史构建标记，最终视觉满意度不由测试数量替代。


## 状态

开发完成，待独立验收。主规范为材料根目录 [spec.md](../../spec.md)，它与产品版本1.6.1不是同一编号。当前构建1.6.1-ui2.da71186532，原规则1.8和Socket 2.1继续使用。本目录记录新增动效；[训练营交付](../training-camp/README.md)同属v1.5范围；[上轮UI交付](../ui-redesign/README.md)保留历史含义。

## 运行与查看

在Ocean-Game-release目录执行 npm start，访问终端给出的地址；首页可进入训练营。只查看合成动效时执行 node scripts/preview-motion.js，访问 http://127.0.0.1:3007 。该目录不创建房间或Socket连接，不能替代真实对战证据。

## 交付入口

| 材料 | 用途 |
| --- | --- |
| [development-handoff.md](development-handoff.md) | 实际模型、实现、源码定位、构建、验证与剩余复验 |
| [effects-manifest.json](effects-manifest.json) / [motion-tokens.json](motion-tokens.json) | 从实际motionDefinitions导出的十行动参数与安全输入 |
| [effects-catalog.html](effects-catalog.html) | 合成示例入口，需通过上述本地预览服务访问 |
| [assets-manifest.json](assets-manifest.json) | 资源复用与无新增生图的记录 |
| [build-manifest.json](build-manifest.json) | 主规范、生成文件、核心源码指纹与实际测试结果 |
| [test-migration.md](test-migration.md) | 本轮4项旧静态断言迁移；原用例未删除或跳过 |
| [performance-report.md](performance-report.md) | 静态预算实值与正式性能未测项 |
| [evidence/README.md](evidence/README.md) | 真实原始日志、连续帧、环境和复现方法 |
| [acceptance-report.md](acceptance-report.md) | 138项MV逐需求待独立复验 |
| [scenario-acceptance.md](scenario-acceptance.md) | 36项MT逐场景追踪 |

## 基础验证结果

npm run acceptance通过，727项测试全部通过，0失败、0跳过，原始输出在 [final-acceptance.log](evidence/tests/final-acceptance.log)。测试覆盖保留原452项并新增275项；已有少量旧UI静态契约按明确迁移清单更新。基础验证不能替代真机、完整矩阵、正式性能和逐条独立审定。


## v1.6.2 精简发布

逐帧截图与GIF已归档到[完整验收证据包](https://github.com/Xian-JL/Ocean-Game/releases/download/v1.6.2/Ocean-v1.6.2-evidence.zip)，按原项目相对路径保存；本地仅保留代表截图、原始清单与测试记录。历史构建不冒充v1.6.2当前验收。
