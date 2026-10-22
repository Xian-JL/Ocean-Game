# OCEAN v1.5 训练营交付

## 状态与入口

开发完成，待独立验收。训练营已接入首页和 /training 深链接，复用原正式地图、部署、指令台、齐射与结算界面。本地运行 npm start 后从首页进入；本次预览服务为 http://127.0.0.1:3006/training 。

## 实现范围

目录包含90个主题场景、163个可选择变体：原规范84个主题加6个房间/阶段补充主题。部署、开局、十行动、资源/来源限制、侦察/标记、三人、齐射/终局、断线/超时和恢复均有相应目录项。适用地图按场景定义，雷达范围沿原规则随10/12/15地图为3/4/5；没有修改正式规则以迁就教学。

保留五章本地入门；新增场景检索/筛选、自由试验、教学任务、角色切换、主动教官解析、重置/撤回、虚拟时间和本机进度。真实玩法结算使用server/game/rules，合成会话不加入正式房间列表或Socket房间。

## 材料入口

| 材料 | 用途 |
| --- | --- |
| [development-handoff.md](development-handoff.md) | 架构、源码、构造边界、基础验证、剩余验收 |
| [session-api.md](session-api.md) | 训练命令、凭证、版本、幂等、TTL、虚拟时间 |
| [progress-migration.md](progress-migration.md) | 本机进度、教程迁移、正式记录保护 |
| [scenario-manifest.json](scenario-manifest.json) | 90主题163变体、夹具SHA、规则版本、预期行动与目标 |
| [coverage-matrix.json](coverage-matrix.json) | 场景到源码、可见错误与终局原因的映射 |
| [build-manifest.json](build-manifest.json) | 实际构建与727项测试结果 |
| [evidence/README.md](evidence/README.md) | 实际交互帧、截图、原始日志与复现 |
| [acceptance-report.md](acceptance-report.md) | 69项TCAMP逐需求待独立复验 |
| [scenario-acceptance.md](scenario-acceptance.md) | 18项CT与全部变体复验入口 |
| [../ui-motion/performance-report.md](../ui-motion/performance-report.md) | 公共性能测量空表与静态体积实值 |

## 覆盖声明的边界

727项基础测试全部通过、0失败/0跳过。所有目录变体做适用地图启动检查，并对关键规则结算、教学判定、隔离、时钟、恢复与界面做参数化回归；这不构成163变体逐个完整教学流程及正式源码所有可达分支的独立证明。中局检查点历史可达性、覆盖缺口归零、完整手工完成、真机与正式性能仍需独立验收；没有把这些标成最终通过。


## v1.6.2 精简发布

逐帧截图与GIF已归档到[完整验收证据包](https://github.com/Xian-JL/Ocean-Game/releases/download/v1.6.2/Ocean-v1.6.2-evidence.zip)，按原项目相对路径保存；本地仅保留代表截图、原始清单与测试记录。历史构建不冒充v1.6.2当前验收。
