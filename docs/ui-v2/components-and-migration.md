# 组件、事件与偏好迁移

## 结构和责任

| 层 | 当前入口 | 责任 |
| --- | --- | --- |
| 令牌 | client/styles/tokens.css | 三主题完整颜色、形状、字体、密度与基准几何 |
| 页面 | entry-view / deployment-view / tutorial-view / result-view | 阶段构图与可访问文字 |
| 军械台 | command-view / battle-view | 固定十槽、实际己方来源、目标与确认；不重新计算规则 |
| 地图 | deployment-view / battle-map / artwork | 同一坐标网格、原真实舰形、己方投影、安全结果与私人笔记 |
| 生命周期 | motion / accessibility / events / transport | 去重、取消、焦点与滚动恢复、命令防重和安全快照 |
| 构建 | scripts/build-ui.js | 20 私有模块、8 样式层；CSS 资源版本、SVG sprite、主题引导和实际资源参与指纹 |

正式伤害、范围、资源、胜负、回合、Socket 协议和安全投影保持基线。新增 identityTones 只按公开 playerId 给本机图形身份分配稳定色形，不广播外观或读取敌方 HP。地图放大只改变本机格尺寸；行动和目标不因此提交。

## 事件迁移

原 select-mode、create-form、join-form、部署、掷骰、select-action、execute-command、齐射、复盘与训练事件继续使用原处理链。十槽不按可用性重排；受限说明始终保留。查看舰队详情不改变实际来源。雷达仍选左上起始格，其他区域武器仍按现有模型选择中心格。

舰队、行动与记录抽屉互斥。手机武器抽屉从军械台打开，选中后关闭并返回海图。基座不建立压住抽屉的层叠上下文；遮罩不会因 hover 变成不透明背景。320px 高横屏使用右侧摘要，避免把地图挤成零高度。

所有新偏好使用原全局监听，未注册一套新的战斗监听。字号变化先取消装饰，再通过原 render/captureViewMemory 恢复草稿、焦点和滚动。换图、退出、重来、后台与减少动画继续走原取消边界。SVG 图标和效果不接收点击。

## 偏好迁移表

| 旧值 | 新值 |
| --- | --- |
| ocean-light，任意旧 accent | armory-ivory 铸白 |
| ocean-dark / ocean-dusk，cyan / jade / violet | armory-cast 冷铸 |
| ocean-dark / ocean-dusk，gold / crimson 或未识别 accent | armory-ember 炉火 |
| 新主题有效值 | 原样保留 |
| 损坏/未知 theme | 炉火 |
| 无历史偏好 | 炉火、龙骨、舒适、默认文字 |

旧默认 accent 缺失按 cyan 解释，首帧与运行时使用同一映射。移除旧的内联强调色覆盖，不清音量、减少动画、正式恢复凭证、训练进度或私人笔记。战徽、密度、字号分别存入 ocean.ui2.crest / density / textSize，仅保存在本机。恢复外观默认不清业务记录。

## 回归断言迁移

| 原断言 | 等效新覆盖 | 原因 |
| --- | --- | --- |
| 左 240px / 右 304px 两侧栏 | 单海图、底部 armory-plinth 和互斥抽屉 | SPEC 2.0 明确废弃旧布局 |
| 三个 ocean-* 主题与五个独立强调色 | 三个完整 armory-* 主题；VM 实际运行首帧迁移与持久化 | 强调色不再越过完整主题 |
| 可用优先、受限折叠 | 十槽固定顺序、禁用原因、来源实例 | 保持位置记忆与武器身份 |
| 创建房间文案 | 创建战局；DOM 开局闭环保留 | 规范要求的真实动词 |
| SVG sprite 无版本 URL | 指纹查询在 fragment 之前 | 防止更新后复用旧图标 |
| 流畅 ≤360ms | 360～550ms；高档与同权限配对仍测 | 新规范取代旧时长门槛 |

变更位于 test-fixtures/ui-contract.js、主题测试、文案/图标路径测试和 motion.test.js。没有删除、skip 规则、Socket、权限或完整对局用例。新增 ui-v2-armory.test.js 六项行为/预算/冻结检查，总数从 732 增至 738。最终日志为 development-acceptance.log；中间失败日志单独标明，不能作为当前构建结论。

## 依赖

不新增框架或运行库。npm ci 的实际审计发现 body-parser 与 undici 漏洞，按已允许的依赖范围更新 body-parser 2.4.0、undici 7.30.1 及关联 content-type 2.1.0、qs 6.16.1。package.json 直接版本未改；锁文件记录更新。最终 npm audit 为 0，正式基础验收全部通过。
