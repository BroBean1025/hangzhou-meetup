# 杭城同行 Windows 桌面版

此目录将原来的本地 Web 项目包装为 Windows x64 应用。运行已打包的 EXE 不需要另装 Node.js。

**[下载最新 Windows EXE](https://github.com/BroBean1025/hangzhou-meetup/releases/latest)** · [返回首页](../README.md) · [使用核心源码](../docs/SOURCE_USAGE.md)

## 首次下载

1. 打开上面的下载页，在 **Assets** 中选择 `HangzhouMeetUp-Setup-版本号.exe`（安装版，推荐）或 `HangzhouMeetUp-Portable-版本号.exe`（免安装版）。`Source code` 下载的是源码。
2. 安装版运行安装程序，然后打开“杭城同行”；免安装版直接双击 EXE。
3. 打开右上角 **设置**，填写**自己申请的高德 Web 服务 Key**并保存。[申请方法](../docs/CONFIGURATION.md#申请)

**安装包和免安装 EXE 均不附带作者的 Key。** 每位用户自行配置，只保存在本机；安装新版本会保留已经填写的个人配置。

## 使用

- `HangzhouMeetUp-Setup-<版本>.exe`：当前用户安装，支持选择目录，创建桌面及开始菜单快捷方式。建议使用安装版，可直接在程序内升级。
- `HangzhouMeetUp-Portable-<版本>.exe`：免安装单文件，双击后解压到临时目录运行。
- 高德 Key 保存在 `%APPDATA%\HangzhouMeetUp\settings.json`，不包含在安装包或免安装 EXE 中。可在窗口右上角的“设置”中修改；在另一台电脑首次使用时需填写。
- 本地地图资源可离线显示；完整路线、校门接驳等查询需要联网访问 OpenMetro 和高德。
- `Ctrl + / −` 调整界面大小，`Ctrl + 0` 恢复默认，`F11` 全屏，`Alt` 显示菜单。
- 关闭窗口即退出本地服务；重复启动会聚焦已有窗口。窗口尺寸、缩放、出发点与缓冲偏好保存在当前用户目录。

## UI 适配

保留原项目的纸色地图风格。宽窗口中地图与结果并排；窄于 1001 CSS 像素时，结果排到地图下方并随页面滚动。较矮窗口中压缩顶部空白，展开设置时保留可滚动的可达内容。Leaflet 跟随容器尺寸更新，不以缩小整张地图截图代替适配。

## GitHub 与 EXE 更新

当前采用完整应用包发布：Electron 外壳与业务代码一起打包成版本化安装包。更新器在条件允许时可以差分下载，但安装时升级的仍是整个应用版本，并未拆成独立的“外壳更新”和“业务代码更新”。仓库变更需通过构建并发布为正式版本后，应用才能收到更新。

- 每个本地自然日首次打开或重新聚焦应用时，后台检查一次稳定版；同日重复启动不重复检查。离线失败不影响地图，可手动重试。新装版本会重新检查。
- 右上角“更新” → “检查更新”，或按 Alt → “帮助” → “检查更新”。发现新版后按钮显示“有更新”。
- 安装版点击“下载更新”，下载并通过校验后点击“重启并安装”。不会在关闭时自行安装；高德 Key、出发点、窗口和缩放设置保留。
- 免安装版使用相同检查机制，点击下载后在浏览器保存新版免安装 EXE，关闭旧程序再替换文件。
- [下载最新版本](https://github.com/BroBean1025/hangzhou-meetup/releases/latest)。0.1.x 不包含更新功能，需要先安装一次 0.2.x 或更新版本。

每次向 `main` 推送代码，`.github/workflows/desktop-release.yml` 会测试并构建 Windows 安装包、免安装包和 `latest.yml`，上传完整后发布 GitHub Release。发布完成后本地 EXE 才能发现新版。工作流将 `package.json` 的主、次版本与单调递增的工作流运行编号组合为版本号（例如 `0.2.1`、`0.2.2`）；无需手动修改补丁号，也不会把版本提交回仓库。重新运行同一次构建不会覆盖已发布版本。

工作流只使用 GitHub 自带的 `GITHUB_TOKEN`（仓库内容写权限），无需配置高德 Key 或个人访问令牌。也可在 Actions → Windows desktop release → Run workflow 手动发布。工作流文件名应保持不变，以保留运行编号；需要重建工作流时先提高主版本或次版本。

## 重新构建

使用 Node.js 24 与 pnpm，在项目根目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm exec install-electron
pnpm run build
pnpm test
pnpm run desktop
pnpm run dist:win
```

产物在 `desktop-output/`。开发时从根目录 `.env` 读取高德 Key；打包文件白名单排除了 `.env`、测试输出和用户数据。Electron 运行在沙箱及上下文隔离模式，页面无 Node.js 权限；本机 HTTP 服务仅绑定 `127.0.0.1`。

自动化验收：`pnpm run test:desktop`。添加 `MEETUP_LIVE_TEST=1` 可进行真实路线验证，会消耗正常 API 调用配额。`MEETUP_EXECUTABLE` 可指定打包后的 EXE；`MEETUP_USER_DATA` 用于隔离测试配置。

安装包未进行商业代码签名。

构建工具参考：[Electron 安全配置](https://www.electronjs.org/docs/latest/tutorial/security)、[electron-builder Windows 安装包](https://www.electron.build/docs/nsis/)。
