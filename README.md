# 海战 OCEAN · Ocean-v1.6.2

## 本版内容

科幻舰队控制台与简约布局；支持10×10、12×12、15×15海图，2人联机、人机1v1、3人FFA。玩法仍为rule-v1.8，页面流程page-flow-v2.1，Socket协议2.1。

训练营提供90个主题、163个变体，包含部署、十项行动、侦察/标记、三人局面、最终齐射、终局和连接恢复。支持自由演练、角色切换、主动教官解析、重置/撤回和虚拟时钟，训练与正式房间隔离。

恢复原有爆炸、水花、尾迹、舰体状态和海域材质，并增强轨迹、冲击环与扫描；流畅模式保留动作形态，减少动画保留静态事实。

## 安装与运行

需要Node.js 24或更新版本。进入目录执行：

    npm ci
    npm start

访问 http://127.0.0.1:3000 。Windows也可双击start.cmd，首次自动安装运行依赖。仅运行可执行npm ci --omit=dev；测试需要完整安装开发依赖。node_modules不随精简项目保留，可随时重建。

局域网执行npm run start:lan，公开服务执行npm run start:public。Render配置见render.yaml。房间使用内存存储，服务重启后不能恢复；公开部署的管理令牌说明见原部署文档。训练进度保存在本机浏览器。

## 开发与验证

修改client源模块，npm run build生成app.js和ocean.css；不要只改生成文件。npm run acceptance执行音频、语法和完整回归。

[本版发布与验证](docs/releases/v1.6.2/README.md)记录实际测试、构建与清理。[spec.md](spec.md)的v1.5是设计规范编号，与产品v1.6.2分别编号。发布不表示真机、全兼容矩阵、正式性能及完整独立验收的未测项已通过。

| 目录 | 用途 |
| --- | --- |
| client / public | 客户端源模块、构建产物和运行资源 |
| server | 权威规则、房间服务、训练服务 |
| test / test-fixtures | 原有及新增回归 |
| assets/audio | 音效重建所需源素材及来源记录 |
| docs / spec.md | 规则、协议、验收、交接及规范 |

历史文档与旧CSS有部分被回归直接读取，保留为验证资料。逐帧截图与GIF已移入GitHub Release的独立证据包，源仓库仅保留代表截图和清单。源码目录与音效源文件是维护、重建依赖，不作为缓存删除。

## 资料

[动效交接](docs/ui-motion/README.md)、[训练营交接](docs/training-camp/README.md)、[正式规则](docs/rule-v1.8.md)、[页面流程](docs/page-flow-v2.1.md)、[Socket协议](docs/socket-protocol-v2.1.md)。背景音乐ocean-theme.mp3及其他音频的来源说明随音频资料保留。


## 既有体验保留

十项行动继续使用差异化音效，音效与视觉只读取安全玩家视图，不泄露命中、舰位或其他未授权结果。个性化设置支持主题、强调色、画质和减少动画；五章入门与新手、标准、专家人机继续可用。
