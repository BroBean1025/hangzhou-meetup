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

从 **0.3.x** 起采用冷热两条路径。仓库变更先经过测试并发布为正式版本，应用再检查更新；不会直接执行仓库中尚未发布的代码。

| 更新类型 | 安装版 | 免安装版 |
| --- | --- | --- |
| **热更新：兼容的界面小修复** | 下载轻量补丁，点击“应用补丁并刷新”，客户端进程不重启 | 同样支持，无需替换 EXE |
| **冷更新：较大改动、路线服务、依赖或客户端变化** | 下载完整程序，点击“重启并安装” | 下载新版 EXE，关闭旧程序后替换 |

热补丁保存在当前用户目录，刷新时当前路线重新加载，已保存的偏好与 Key 保留。补丁会校验版本、客户端兼容性、大小、文件路径和 SHA-256；加载失败恢复之前的界面，应用过程中中断也会在下次启动恢复。按 Alt → 帮助 → **恢复随程序安装的界面**，可手动撤销补丁。更新窗口分别显示当前界面版本与客户端版本。

- 每个本地自然日首次打开或重新聚焦应用时，后台检查一次稳定版；同日重复启动不重复检查。离线失败不影响地图，可手动重试。新装版本会重新检查。
- 右上角“更新” → “检查更新”，或按 Alt → “帮助” → “检查更新”。发现新版后按钮显示“有更新”。
- 更新窗口会自动选择适用路径并显示按钮。只检查不会直接安装；由用户点击应用补丁或重启，避免打断当前操作。
- 热更新失败可重试下载，或从发布页面下载完整 EXE。旧客户端不兼容时自动选择冷更新；跳过一次必要冷更新后，也不会被后续热补丁越过。
- [下载最新版本](https://github.com/BroBean1025/hangzhou-meetup/releases/latest)。**0.1.x / 0.2.x 需要先完整升级一次到 0.3.x 或更新版本**，随后才有热更新能力。

每次向 `main` 推送代码，`.github/workflows/desktop-release.yml` 会测试并构建 Windows 安装包、免安装包、`latest.yml`、`hot-update.json` 及轻量界面包，全部上传完成后才发布 GitHub Release。**首次下载只需选择 EXE**，补丁文件由应用处理。每次仍提供完整 EXE，供新用户和不兼容的旧客户端安装。

工作流相对上个已发布版本自动判断：仅修改 `core/src/` 顶层界面文件、最多 5 个文件且增删合计不超过 80 行，才可使用热更新；数据、第三方库、桌面桥接代码、后端、依赖、构建流程等变化均冷更新。界面包包含该版完整页面资源，因此可跳过中间热补丁。客户端指纹与最低客户端版本双重校验，防止跨越必要的冷更新。详见[维护说明](../.github/CONTRIBUTING.md)。

版本号由 `package.json` 的主、次版本与递增的工作流运行编号组合（如 `0.3.4`）；无需提交补丁版本号，重跑同次构建也不覆盖已发布版本。

工作流只使用 GitHub 自带的 `GITHUB_TOKEN`（仓库内容写权限），无需配置高德 Key 或个人访问令牌。Actions → Windows desktop release → Run workflow 可选择 `auto`（自动）、`cold`（强制完整更新）或 `hot`（要求热更新，但仍必须通过范围与兼容性检查）。工作流文件名应保持不变，以保留运行编号；需要重建工作流时先提高主版本或次版本。

## 重新构建

使用 Node.js 24 与 pnpm，在项目根目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm exec install-electron
pnpm run build
pnpm run prepare:desktop
pnpm test
pnpm run desktop
pnpm run dist:win
```

产物在 `desktop-output/`。开发时从根目录 `.env` 读取高德 Key；打包文件白名单排除了 `.env`、测试输出和用户数据。Electron 运行在沙箱及上下文隔离模式，页面无 Node.js 权限；本机 HTTP 服务仅绑定 `127.0.0.1`。

自动化验收：`pnpm run test:desktop`。打包后运行 `node tools/test-hot-desktop.mjs`，使用隔离配置与离线发布数据验证热更新、失败回滚和设置保留。添加 `MEETUP_LIVE_TEST=1` 可进行真实路线验证，会消耗正常 API 调用配额。`MEETUP_EXECUTABLE` 可指定打包后的 EXE；`MEETUP_USER_DATA` 用于隔离测试配置。

安装包未进行商业代码签名。

构建工具参考：[Electron 安全配置](https://www.electronjs.org/docs/latest/tutorial/security)、[electron-builder Windows 安装包](https://www.electron.build/docs/nsis/)。
