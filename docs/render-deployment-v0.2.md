# Render 公网部署说明 v0.2

## 1. 本版本定位

`Ocean-project-deploy-v0.2` 是低成本公网双人测试版。它不改变 `rule-v1.0`、`page-flow-v1.0` 或 Socket.IO 协议 1.2，只把已经验收的游戏做成可由 Render 部署的 Node.js Web Service。

首轮采用 Render 免费方案，原因是：支持 Node.js、HTTPS 和 WebSocket；项目只需一个服务；仓库中的 `render.yaml` 已固定构建、启动和健康检查命令。

## 2. 部署前本机验收

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-project-deploy-v0.2"
npm ci
npm run acceptance
npm run start:public
```

浏览器打开 `http://127.0.0.1:3000`。确认首页可进入后按 `Ctrl+C` 停止服务。

## 3. 首次公网部署

1. 新建一个代码仓库，把本目录内容作为仓库根目录上传。不要上传 `node_modules`；`.gitignore` 已排除它。
2. 登录 Render，选择 **New > Blueprint**，连接该仓库。
3. Render 读取根目录的 `render.yaml` 后，确认服务类型是 Web Service、套餐是 Free，然后创建服务。
4. 等待构建和健康检查完成。构建命令应为 `npm ci`，启动命令应为 `npm run start:public`。
5. 打开 Render 分配的 `https://…onrender.com` 地址，再打开 `https://…onrender.com/api/health`。后者应返回 `status: "ok"` 和 `stage: "deploy-v0.2"`。
6. 房主创建房间，把页面生成的邀请链接发给另一网络中的玩家，完成一次创建、加入、部署、行动、断线重连和结算测试。

本版本不需要数据库、Docker、环境变量或付费域名。Render 会设置 `PORT`，应用会监听 `0.0.0.0`。

## 4. 更新与回滚

- 每次发布前先在新项目目录完成 `npm run acceptance`，不要覆盖旧版本。
- 对局进行期间不要提交部署；新部署会重启实例并中断内存中的房间。
- 若新版本异常，在 Render 中回滚到上一个成功部署；回滚只能恢复代码，不能恢复已经丢失的对局。
- 保留 `Ocean-project-deploy-v0.1` 和本版本压缩包作为本地回退点。

## 5. 上线验收结果记录

| 项目 | 预期 | 结果 |
|---|---|---|
| `/api/health` | HTTP 200，stage 为 deploy-v0.2 | 待填写 |
| HTTPS | 浏览器无证书警告 | 待填写 |
| 异地加入 | 第二台电脑可通过邀请链接加入 | 待填写 |
| 双方信息隔离 | 不显示对方私密舰队和隐藏结算 | 待填写 |
| 断线重连 | 短暂断网后恢复原座位 | 待填写 |
| 完整对局 | 部署至结算可完成 | 待填写 |

