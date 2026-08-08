# 海战 OCEAN · 公网部署准备 deploy-v0.2

本目录是阶段 10 的第二个独立子版本，完整继承已通过 214 项测试和人工验收的 `Ocean-project-deploy-v0.1`。本版本将游戏整理为可部署到 Render 的低成本公网双人测试版，不修改冻结规则、page-flow 或 Socket.IO 协议 1.2。

## 本版本完成内容

- 新增 `render.yaml`：免费 Node Web Service、`npm ci` 构建、健康检查和优雅停机配置；
- 新增 `.node-version`，固定 Node.js 24.19.0；
- 新增 `npm run start:public`，监听托管平台要求的 `0.0.0.0` 并读取其 `PORT`；
- Socket.IO 浏览器握手限制为同源，兼容 Render 的反向代理主机头；
- 页面增加 CSP、防嵌入、禁止 MIME 猜测、权限限制等基础安全响应头；
- 健康检查禁止缓存，`robots.txt` 阻止公网测试站被搜索引擎收录；
- 新增生产就绪自动测试、Render 部署步骤和公网运行边界说明。

## Windows 完整检查

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-project-deploy-v0.2"
npm ci
npm run acceptance
npm start
```

本机仍默认只监听 `127.0.0.1`。局域网测试继续使用 `npm run start:lan`；托管平台才使用 `npm run start:public`。

## 文档入口

- `docs/render-deployment-v0.2.md`：从本机验收到 Render 首次发布、更新与回滚；
- `docs/public-beta-operations-v0.2.md`：公网测试能力、内存房间限制和后续生产化门槛；
- `docs/deploy-optimization-v0.1.md`：上一版本部署页刷新与文字可读性优化记录。

## 重要边界

公网 URL 可以让异地电脑进入游戏，但 v0.2 的房间状态仍只在内存中。Render 重启、部署、进程退出或免费实例休眠恢复都可能清空当前房间。它适合双人公网验收和展示，不等同于具备持久化与高可用能力的正式商业服务。
