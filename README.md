# 海战 OCEAN · postlaunch-v0.4

本版本继承已验收的 `postlaunch-v0.3`，加入 12×12 地图、每格一次伤害资格、3×3 雷达与 4×4 布尔扫描、五类分层私人标记。

## 完成内容

- `/api/ready` 提供部署就绪检查；
- `/api/metrics` 提供运行时间、Node 内存、连接、房间、请求和错误代码计数；
- HTTP 响应附带随机 `X-Request-Id`；
- Socket 成功请求、连接、断线、清理和错误形成进程内聚合计数；
- 意外错误输出单行结构化日志；
- 指标和日志不保存昵称、房间码、玩家 ID、部署、目标、错误详情或重连凭证。

## 验收

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-project-postlaunch-v0.4"
npm ci
npm run acceptance
npm start
```

预期 230 项测试全部通过。规则见 `docs/rule-v1.1.md`。
