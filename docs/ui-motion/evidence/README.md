# 动效证据说明

## 构建与环境

资源构建1.6.1-ui2.709d0e9902，采集2026-10-22。准确文件SHA与spec SHA见../build-manifest.json；证据本身的SHA与字节见manifest.json。浏览器为Codex内置Chromium，暴露接口无法取得精确版本，未猜测填写。browser-smoke.json记录1280×720桌面、ocean-dark、实际smooth及390×844模拟的观测。

## 原始测试

tests/final-acceptance.log为完整npm run acceptance原始输出：727通过、0失败、0跳过。首次失败及迁移说明保留在上级目录，不删除失败历史；原UI2的452项历史日志未覆盖。

## 动态证据

visual/radar-full-frames.json记录45个真实浏览器采样帧与时间戳，范围1671ms；radar-demo.gif由这些JPEG编码并保留时间间隔，尾帧停留800ms。它是明确标注的合成雷达示例，不是正式海战录像或fps数据。旧radar-frames.json是较短采样，保留原始文件。

启动node scripts/preview-motion.js，选雷达扫描/高画质/区域有信号→播放一次，可复现扫描周期。点击立即取消后主效果与装饰节点均为0；减少动画播放只留静态说明。本次没有声称逐一人工验证十行动所有主题组合。

## 真实教学交互

真实规则结算的操作录像帧与截图在../../training-camp/evidence，包含W01桌面/手机和主动解析。动效示例不可代替那些交互。独立验收需按MT表补齐正式对局、隐私成对样本、真机和性能证据。


## 历史失败记录

final-coach-before-fix.log是收尾时教官自动展开回归失败的历史记录（726通过/1失败）；不得作为最终结果。final-acceptance.log为修复后的最终727通过。较短radar-frames.json及对应20帧保留旧构建标记；当前构建证据使用radar-full-frames.json及其GIF。
