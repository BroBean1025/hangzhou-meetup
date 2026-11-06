# Hangzhou MeetUp · 杭城同行

杭州地铁多起点出行地图：比较通勤时间、选择校门接驳、安排途中汇合和到达时间。支持 Windows 桌面应用，也支持运行源码、在浏览器使用。

**[⬇ 下载 Windows EXE](https://github.com/BroBean1025/hangzhou-meetup/releases/latest) · [⬇ 下载源码 ZIP](https://github.com/BroBean1025/hangzhou-meetup/archive/refs/heads/main.zip) · [完整功能演示](docs/FEATURES.md)**

## 下载与使用

| 使用方式 | 下载和启动 |
| --- | --- |
| **Windows 安装版（推荐）** | 在[最新版本页](https://github.com/BroBean1025/hangzhou-meetup/releases/latest)的 **Assets** 中下载 `HangzhouMeetUp-Setup-版本号.exe`，安装后打开“杭城同行” |
| Windows 免安装版 | 在同一页面下载 `HangzhouMeetUp-Portable-版本号.exe`，双击运行 |
| **核心源码 / 浏览器版** | [下载源码 ZIP](https://github.com/BroBean1025/hangzhou-meetup/archive/refs/heads/main.zip)，按[源码使用指南](docs/SOURCE_USAGE.md)启动；支持 Windows、macOS、Linux |

### 使用 EXE

桌面版适用于 **Windows x64**，无需安装 Node.js。首次打开后，在右上角 **设置** 中填写自己申请的高德 **Web 服务 Key** 并保存。[Key 申请方法](docs/CONFIGURATION.md#申请)

安装版每天首次打开自动检查更新，也可点击 **更新 → 检查更新 → 下载更新 → 重启并安装**。免安装版下载新版后关闭旧程序，替换 EXE 即可。[桌面版使用说明](desktop/README.md)

**源码和 EXE 均不附带作者的 Key，每位用户自行填写，只保存在自己的电脑上。** 没有 Key 仍能浏览内置地图；完整的校门接驳和任意选点查询需要配置服务。

### 运行核心源码

安装 [Node.js](https://nodejs.org/) **22.13 或更新版本**，解压源码，在仓库根目录运行：

```sh
npm run setup
```

编辑生成的 `.env`，填写自己的 `AMAP_WEB_SERVICE_KEY`，再运行：

```sh
npm run doctor
npm start
```

浏览器打开 **http://localhost:8080**，保持终端开启。核心服务无需 `npm install`；Windows 用户也可以双击 `启动地图.cmd`。[完整步骤与手机访问](docs/SOURCE_USAGE.md)

## 主要功能

### 一张地图，看清各自从哪里出发

支持多校区和地铁站起点，可选择具体校门以及步行、公交、骑行、打车接驳。地图同时展示轨道线路与交通枢纽估时。

![地图总览：校区起点、轨道线路和交通枢纽估时](docs/screenshots/01-overview.jpg)

### 比较到同一个地方的行程

搜索车站或直接点地图选择目的地，对比各人的总耗时、换乘、票价和时间拆分。设置希望到达的时间，还能倒推各自何时出发，并自定途中缓冲。

![多起点路线比较：三所学校前往钱江路](docs/screenshots/03-route-comparison.jpg)

### 在途中碰面，再一起出发

识别各条行程开始共用路段的位置，标出参与者、建议汇合点和各自到站时间。多个汇合点可按先后安排碰面与继续出发的时刻。

![途中汇合：在古荡、武林门分阶段碰面](docs/screenshots/04-meeting-points.jpg)

**[查看全部功能与操作截图 →](docs/FEATURES.md)**

内置浙江大学、浙江工业大学和西湖大学的 10 个校区作为示例，可[添加自己的学校和校区](docs/EXTENDING_CAMPUSES.md)。截图中的时间用于演示；行程为静态估计，不代表实时班次，也不校验首末班。

## 最近更新

<!-- recent-updates:start -->
**2026-11-06 · 桌面版、自动更新与出行时间安排**

- 新增 Windows 安装版及免安装 EXE，支持每日检查更新、程序内手动升级，保留个人配置。
- 设置到达日期和时间，倒推各人出发时刻；支持途中汇合安排、跨天行程与自定义缓冲。

**2026-11-05 · 首次发布**

- 支持多起点路线比较、校门接驳、途中汇合与交通枢纽估时，适配电脑和手机。
- 提供三所大学的示例数据，可自行扩展学校、校区与校门。
<!-- recent-updates:end -->

[完整更新日志](docs/CHANGELOG.md)

## 文档与源码

- [文档导航](docs/README.md)：功能演示、配置、学校扩展、开发与部署。
- `core/`：核心网页、服务与地图数据；`desktop/`：Windows 应用；`tools/`：构建、测试与部署工具。
- [参与维护](.github/CONTRIBUTING.md) · [密钥与安全反馈](.github/SECURITY.md)

原创代码采用 [MIT](LICENSE)。第三方地图数据、服务与素材保留各自许可，详见[第三方资源说明](docs/legal/THIRD_PARTY_NOTICES.md)及[用途声明](docs/legal/DISCLAIMER.md)。
