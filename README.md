# 海战 OCEAN · postlaunch-v0.6

本版本继承已验收的 `postlaunch-v0.5`，新增双人/三人房间、三人目标选择和出局轮转、三层保密战报，并完成驱逐舰、核潜艇、潜射导弹和摩托艇数值调整。

## 完成内容

- `/api/ready` 提供部署就绪检查；
- `/api/metrics` 提供运行时间、Node 内存、连接、房间、请求和错误代码计数；
- HTTP 响应附带随机 `X-Request-Id`；
- Socket 成功请求、连接、断线、清理和错误形成进程内聚合计数；
- 意外错误输出单行结构化日志；
- 指标和日志不保存昵称、房间码、玩家 ID、部署、目标、错误详情或重连凭证。
- 驱逐舰Ⅰ/Ⅱ命中单位时自损 0.5，范围分别为沿舰身 11×7 和 10×8；
- 核潜艇 3 HP，潜射导弹 4 枚，每方部署两艘摩托艇；
- 创建房间时可选择 2 人或 3 人，三人行动必须选择一名仍在局敌方玩家；
- 行动方取得规则允许的精确伤害，防守方只收“被命中”战报，第三方只收公开战报。

## 验收

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-project-postlaunch-v0.6"
npm ci
npm run acceptance
npm start
```

预期全部测试通过。规则见 `docs/rule-v1.3.md`，页面流程见 `docs/page-flow-v1.3.md`。
