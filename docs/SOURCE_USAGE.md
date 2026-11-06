# 运行核心源码（浏览器版）

这是原来的独立 Node.js 运行方式，支持 Windows、macOS 和 Linux。地图、校门接驳、路线比较、途中汇合与到达时间安排均可在浏览器使用。[返回首页](../README.md) · [功能演示](FEATURES.md)

## 下载与启动

1. 安装 [Node.js](https://nodejs.org/) **22.13 或更新版本**。
2. [下载源码 ZIP](https://github.com/BroBean1025/hangzhou-meetup/archive/refs/heads/main.zip) 并解压；也可以在仓库中点 **Code → Download ZIP**，或使用 Git 克隆仓库。
3. 在仓库根目录（包含 `package.json` 和 `core/`）打开终端。

```sh
npm run setup
```

这会创建空白 `.env`，已有文件会保留。用文本编辑器填写自己申请的高德 Web 服务 Key：

```dotenv
AMAP_WEB_SERVICE_KEY=在这里填写自己的高德Web服务Key
HOST=127.0.0.1
PORT=8080
```

把中文提示替换为真实 Key，保存后运行：

```sh
npm run doctor
npm start
```

浏览器打开 **http://localhost:8080**，保持终端开启。Windows 用户也可以双击 `启动地图.cmd`，首次运行会创建并打开配置文件。退出时在终端按 `Ctrl+C`。

核心服务只使用 Node.js 内置模块，运行它无需 `npm install`，也无需 Electron、ChatGPT、Codex 或 Python。源码 ZIP 是完整仓库，包含可选的 `desktop/` 目录；浏览器运行方式不会加载桌面外壳或更新模块。`core/public/` 已包含构建好的网页，直接启动即可。

`doctor` 检查所需文件和 Key 是否填入，不会显示 Key 或消耗高德接口额度，也不验证账户权限与余额。修改 `.env` 后需要重启服务；若系统已经有同名环境变量，Node 会优先使用系统环境变量。

高德 Key 的申请步骤、手机访问方法和常见报错见 [配置指南](CONFIGURATION.md)。

## Key 由谁提供

**源码和 EXE 都不附带作者的高德 Key。** 每个下载者或部署自行申请和填写 `AMAP_WEB_SERVICE_KEY`。Key 只由后端发往高德 API，不会写进网页、浏览器本地存储、截图或公开接口响应。仓库中的 `.env.example` 是空白模板，真实 `.env` 已由 `.gitignore` 排除。

下载者在自己的电脑或服务器上运行时，使用自己的额度；如果部署成一个供多人访问的网站，访客共用该服务器的 Key，不需要逐人在网页中填写。项目不调用作者的托管网站。

没有 Key 时仍能浏览内置地图，部分站到站查询也可用。学校接驳或任意选点查询遇到未缓存的数据时，会提示缺少服务，不会把站间时间补成完整出行时间。缓存可以减少调用，但不保证所有查询都不消耗高德额度；额度按接口调用量计算。

## 修改与更新源码

- 前端源码在 `core/src/`，后端查询逻辑在 `core/lib/`，HTTP 入口是 `core/server.mjs`。修改前端或地图数据后，运行 `npm run build` 并重启服务。
- 更新时先停止服务，再更新代码。使用 Git 的用户可在没有未提交冲突时运行 `git pull`；使用 ZIP 的用户可解压新版到新目录，在本机迁移自己的 `.env` 和自定义数据后启动。
- 浏览器版由你自行更新源码，程序内的桌面更新按钮只用于 EXE 版本。
- 开发依赖、完整测试和目录结构见 [开发与维护](DEVELOPMENT.md)。添加学校见 [学校与校区扩展指南](EXTENDING_CAMPUSES.md)。

手机访问、Docker 和服务器部署方式见 [配置指南](CONFIGURATION.md) 与 [Docker 使用说明](DEVELOPMENT.md#用-docker-运行)。
