# 海战 OCEAN · postlaunch-v0.3

本版本继承 `postlaunch-v0.2`，增加低成本、无数据库、无第三方服务的聚合运行指标和隐私安全错误日志，是本轮推荐部署版本。

## 完成内容

- `/api/ready` 提供部署就绪检查；
- `/api/metrics` 提供运行时间、Node 内存、连接、房间、请求和错误代码计数；
- HTTP 响应附带随机 `X-Request-Id`；
- Socket 成功请求、连接、断线、清理和错误形成进程内聚合计数；
- 意外错误输出单行结构化日志；
- 指标和日志不保存昵称、房间码、玩家 ID、部署、目标、错误详情或重连凭证。

## 验收

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-project-postlaunch-v0.3"
npm ci
npm run acceptance
npm start
```

预期 228 项测试全部通过。详见 `docs/postlaunch-monitoring-v0.3.md`。
