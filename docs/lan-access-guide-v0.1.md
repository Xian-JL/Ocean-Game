# 《海战 OCEAN》同一局域网双电脑访问指南 v0.1

## 1. 能力边界

`npm start` 只允许主机自己访问。`npm run start:lan` 才允许同一可信局域网中的第二台电脑访问。

LAN 模式满足：

- 两台电脑连接同一个家庭、宿舍或手机热点网络；
- 主机保持 Node.js 服务运行；
- Windows 防火墙允许 TCP 3000 的专用网络入站连接。

LAN 模式不满足异地互联网访问，也不应在校园公共网络、咖啡店网络等不可信环境开放。

## 2. 主机操作

在 MateBook 上运行：

```powershell
Set-Location "E:\University\University_2.5\Ocean\Ocean-project-acceptance-v0.1"
npm run start:lan
```

终端会显示类似：

```text
[Ocean] 上线准备 deploy-v0.1 已启动
[Ocean] 本机：http://127.0.0.1:3000
[Ocean] 局域网：http://192.168.1.20:3000
```

主机浏览器也应打开显示出来的“局域网”地址，例如：

```text
http://192.168.1.20:3000
```

创建房间后复制邀请链接，链接才会包含第二台电脑可访问的局域网 IP。

## 3. 第二台电脑操作

1. 确认与主机连接同一个 Wi-Fi 或热点；
2. 在 Edge 地址栏输入主机终端打印的“局域网”地址；
3. 页面出现 P01 后，通过房间码或邀请链接加入；
4. 不需要安装 Node.js，第二台电脑只需要现代浏览器。

## 4. Windows 防火墙

首次启动 LAN 模式可能弹出 Windows Defender 防火墙窗口：

- 勾选“专用网络”；
- 不勾选“公用网络”；
- 允许访问。

若没有弹窗且第二台电脑无法连接，可在主机“以管理员身份运行”的 PowerShell 中临时添加专用网络规则：

```powershell
New-NetFirewallRule -DisplayName "Ocean LAN 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000 -Profile Private
```

完成 LAN 验收后，如不再需要，可删除该规则：

```powershell
Remove-NetFirewallRule -DisplayName "Ocean LAN 3000"
```

## 5. 故障定位顺序

1. 主机使用打印出的 LAN 地址能否打开页面；
2. 两台电脑是否确实在同一网络，且没有开启访客网络/客户端隔离；
3. 主机网络配置是否为“专用网络”；
4. 第二台电脑执行：

```powershell
Test-NetConnection 192.168.1.20 -Port 3000
```

将示例 IP 换成主机实际地址。`TcpTestSucceeded : True` 表示网络与端口可达。

5. VPN、代理或安全软件可能改变路由；测试时暂时退出不需要的 VPN，但不要关闭系统防火墙；
6. 主机 IP 在重连 Wi-Fi 后可能改变，应以每次启动时打印的新地址为准。

## 6. 安全要求

- 只向认识的同一局域网玩家分享地址；
- 不在路由器配置端口转发、DMZ 或公网暴露 TCP 3000；
- 不把此开发服务当成正式公网服务器；
- 停止服务使用 `Ctrl+C`，停止后第二台电脑立即无法进入。
