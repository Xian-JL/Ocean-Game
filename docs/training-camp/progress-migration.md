# 本机进度与迁移

## 存储约定

localStorage键ocean.training-progress.v1保存completed（场景ID到内容版本）、revealed、recent、ruleVersion与tutorialCompleted。五章原本地入门继续使用原教程记录，进入训练后汇总到tutorialCompleted；不会清除原完成章节或正式偏好。旧规则/内容版本按目录比较提示，不把过期内容直接作为当前已体验。

sessionStorage键ocean.training-session.v1仅保存当前标签页训练ID、token与generation。刷新尝试恢复；过期、服务重启或令牌不匹配时明确回到检查点重来，并保留已体验记录。自由演练最近记录包含行动/目标/来源参数，可重建练习。

## 数据边界

训练私人标记仅驻当前训练内存，按目标地图隔离，不写正式标记键。正式sessionStorage/localStorage恢复记录由原流程负责；仍有正式房间或恢复凭证时禁止直接进入训练覆盖。离开训练销毁临时会话、清理训练计时/效果和凭证，回到训练目录；返回首页后可开始正式游戏。

## 用户控制与未测

重置训练进度只清训练完成/解析/最近记录，保留正式对局、主题、音量等数据；原五章入门有自己的重置入口。测试覆盖损坏JSON回退、进度写入与私有标记隔离；跨标签页、浏览器禁用存储/容量耗尽、旧规则实际升级迁移的完整人工矩阵待独立复验。
