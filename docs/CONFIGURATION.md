# 配置自己的高德 Key

## 申请

1. 登录 [高德开放平台控制台](https://console.amap.com/)，按平台要求完成开发者注册/认证。
2. 进入“应用管理 → 我的应用”，创建应用，例如 `Hangzhou MeetUp`。
3. 在该应用中添加 Key，服务平台选择 **Web 服务**。不要选“Web 端（JS API）”，本项目没有使用高德浏览器 JS SDK，也不需要 `securityJsCode`。
4. 在自己的电脑上保存 Key；不要发到公开 Issue、仓库、截图或聊天中。

依据：[高德创建应用和 Key](https://lbs.amap.com/api/webservice/create-project-and-key)。配额、认证及具体接口可用性以你自己的控制台为准，不在本项目中保证免费额度。

## Windows EXE

从[最新版本下载页](https://github.com/BroBean1025/hangzhou-meetup/releases/latest)下载 `HangzhouMeetUp-Setup-版本号.exe` 或 `HangzhouMeetUp-Portable-版本号.exe`，运行后打开右上角 **设置**，填写自己的 **Web 服务 Key**并保存。无需安装 Node.js 或编辑 `.env`。

公开 EXE 不附带作者的 Key。填写的值保存在自己的 `%APPDATA%\HangzhouMeetUp\settings.json` 中，升级应用会保留；首次在另一台电脑使用时需重新填写。

## Windows 源码版

安装 Node.js 22.13+ 后，解压项目并在项目目录打开终端：

```powershell
npm run setup
notepad .env
```

在记事本中填写 `AMAP_WEB_SERVICE_KEY=` 后面的值，文件名必须是 `.env`，不能是 `.env.txt`。

```powershell
npm run doctor
npm start
```

若 PowerShell 阻止执行 `npm.ps1`，使用 `npm.cmd start` / `npm.cmd run setup`，或者直接：

```powershell
node --env-file=.env core/server.mjs
```

## macOS / Linux

```sh
npm run setup
# 使用你熟悉的编辑器填写 .env
node --env-file=.env core/server.mjs
```

不建议把真实 Key 直接写进命令行：它可能进入终端历史。不要为配置 Key 修改 `core/src/`、`core/public/`、`core/config/settings.json` 或 Dockerfile。

## 手机访问

以下局域网及公网部署使用[核心源码运行方式](SOURCE_USAGE.md)；EXE 的本地服务仅供本机窗口使用。

同一 Wi-Fi 下，将 `.env` 的 `HOST` 改为 `0.0.0.0`，重启后用手机访问 `http://电脑局域网IP:8080`，例如 `http://192.168.1.25:8080`。实际 IP 以电脑当前网络为准。

电脑必须保持运行；如被防火墙阻止，只为所需专用网络开放端口。`localhost` 在手机上指手机自身。这里的局域网设置不会产生可供外网朋友访问的网址。

## 公网部署

使用能运行 Node.js 22.13+ 或 Docker 的服务器。上传本项目，在服务器环境变量中配置 `AMAP_WEB_SERVICE_KEY`、`HOST=0.0.0.0`、`PORT`；使用 `node core/server.mjs` 启动。平台注入环境变量时不必上传 `.env`。

同一服务器的访客使用同一个 Key 的配额。现有服务有基本请求大小和频率限制，但没有用户账户、计费或完备的防滥用系统。面向陌生公众时，应在反向代理/托管平台配置 HTTPS、访问限制和监控。

Docker Compose 默认只绑定本机端口，供反向代理连接。若需要局域网直接访问，可将 `ports` 改为 `"8080:8080"`；不要把真实 Key 写进 compose 文件或镜像。

`GET /api/health` 返回 `walking_available`，只表示服务是否收到了非空 Key，不表示已经通过高德验证。Key 无效或无权限时，实际路径查询会报错。

## 常见问题

| 现象 | 检查方式 |
| --- | --- |
| 地图能显示，学校路线失败 | EXE 检查右上角“设置”；源码版检查 `.env` 和重启。确认使用 Web 服务 Key；地图快照可以不带 Key 显示 |
| 高德返回 10001、10009 等错误码 | 按[高德错误码文档](https://lbs.amap.com/api/webservice/guide/tools/info)检查 Key、账户、平台类型和权限 |
| 超时或暂不可用 | 检查服务器能否访问 OpenMetro 和高德；稍后重试，避免连续点击 |
| `.env` 改了却不生效 | 重启；检查系统是否已有同名环境变量，系统变量优先 |
| 手机打不开 | 确认同一网络、电脑 IP、监听地址和防火墙；不要在手机填 localhost |
| 双击 HTML 看得到却不能查询 | 通过 Node 服务提供的网址访问，不能直接用 `file://` 打开 |
| 修改前端不生效 | 运行 `npm run build` 并重启服务；必要时刷新浏览器 |

Key 泄漏后先在高德控制台撤销或更换，再清理公开文件及 Git 历史。仅删除最新提交里的文字不会撤销已经泄漏的 Key。
