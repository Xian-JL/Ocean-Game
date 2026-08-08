# deploy-v0.2 发布清单

## 版本结论

- 阶段：10／公网部署准备
- 版本目录：`Ocean-project-deploy-v0.2`
- Socket.IO 协议：1.2（未修改）
- 自动测试：217 项通过，0 项失败
- 推荐首发平台：Render Free Web Service
- 房间存储：单进程内存，不承诺实例重启后恢复

## 冻结文件校验

| 文件 | SHA-256 |
|---|---|
| `docs/rule-v1.0.md` | `750b3bfd23f81d498ef6eedeca76b817c88d1ec20f3da3d9b953de04d6f761b3` |
| `docs/page-flow-v1.0.md` | `9cb72f51883e40e9a176746a5ee16575c316c31475eb6b0124f9e07612b903aa` |
| `docs/development-outline-v1.0.md` | `eb3dc1e1453f86660f4aa881c98f9676d327157797819c686147ddcde732e599` |
| `docs/develop_environment.txt` | `ee39fed4f7c0591a5ae4697b15e6e857bac5b1dd36b83f81a1420c20788beb11` |

## 发布门禁

- [x] 完整本机验收通过
- [x] Render Blueprint 与 Node 版本已固定
- [x] 公网监听和健康检查已配置
- [x] 同源 Socket.IO 握手和基础 HTTP 安全头已测试
- [x] 部署、更新、回滚和运行边界已有文档
- [ ] Render 实际构建成功
- [ ] 两个不同网络的设备完成整局验收

最后两项必须在用户账号下实际发布后填写，不能由本地自动测试代替。
