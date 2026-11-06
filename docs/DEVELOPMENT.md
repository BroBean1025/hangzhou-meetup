# 开发与部署

[返回首页](../README.md) · [只运行核心源码](SOURCE_USAGE.md) · [桌面版构建](../desktop/README.md)

## 使用自己的学校数据

内置校区提供了一个可以照着扩展的例子。新增学校主要涉及三处数据：

| 文件 | 需要补充的内容 |
| --- | --- |
| `core/config/settings.json` | 学校和校区信息、校门选项、校门参考坐标 |
| `core/data/map.json` | 前端校区目录、分组、标记坐标和可选校徽 |
| `core/data/geography.json` | 需要在地图上标出的真实校园边界 |

修改后重新构建前端并重启服务。学校、校区和校门的标识要在前后端保持一致，坐标也要使用对应的坐标系；不要只把示例校名换掉就沿用原学校的坐标和时间。[添加学校和校区](EXTENDING_CAMPUSES.md)列出了具体字段、图片约定和验证步骤。

新增学校仍使用项目已有的轨道网络。若学校位于当前网络之外，还需要补充当地线路和站点数据。

## 开发与维护

仅运行核心服务无需安装依赖。开发时要运行包含桌面更新模块的完整测试，请使用 Node.js 24 与 pnpm 11.25.0，先安装开发依赖：

```sh
pnpm install --frozen-lockfile
npm run build          # 从 core/src/ 和 core/data/ 重建 core/public/，不请求高德
npm test               # 不需要真实 Key，不调用在线供应商
npm run check:release  # 扫描发布文件与常见密钥特征
npm run pack:release   # 生成 releases/hangzhou-meetup-source.tar.gz
```

前端源码放在 `core/src/`。修改后重新构建并重启服务，浏览器就会加载带新内容摘要的资源。`core/public/` 随仓库提交，下载者可以直接启动应用。

杭州站间路线和票价使用 `core/config/rail-snapshot.json`，运行时直接在本地计算。刷新公开数据时运行 `node tools/sync-rail-snapshot.mjs`：下载 OpenMetro 目录、时长及票价表，并用杭州地铁官方查询重新核验异常票价行。该操作不需要高德 Key，耗时约数分钟，失败不会覆盖完整快照；中途结果暂存在忽略的 `test-artifacts/` 中。检查数据日期、站点和地图是否一致后运行测试并提交，随下次完整程序更新发布。

路由使用二叉堆 Dijkstra，同一起点的搜索结果可复用于所有目的地；缓存有数量上限。步行接驳只保留比最近可达站最多多5分钟、500米的候选；所有站较远时仍保留最近可达站。少换乘在时间优先方案的基础上最多多花10分钟、增加5分钟站外步行。骑行、公交和打车是用户主动选择的接驳方式，不套用步行上车站距离限制。

```text
core/            核心网页与后端
  src/           可编辑的 HTML、JS、CSS
  public/        构建好的网页，下载后可直接使用
  lib/           查询、缓存、换乘与路由
  config/        校区校门、站区连接与路线快照
  data/          地图数据与校徽
  server.mjs     HTTP 服务
desktop/         Windows 应用客户端与更新逻辑
tools/           初始化、构建、发布检查与打包
  tests/         离线测试
  docker/        Docker 部署配置
docs/            功能演示、使用指南与更新日志
.github/         自动检查、发布流程与贡献规范
```

后端的数据来源、缓存时效和时间口径见 [架构与数据说明](ARCHITECTURE.md)。

### 用 Docker 运行

先创建并填写 `.env`，然后运行：

```sh
docker compose -f tools/docker/compose.yaml up -d --build
```

默认端口只映射到本机 `127.0.0.1:8080`。公网部署需要支持 Node.js 或 Docker 的主机，并配置 HTTPS 和适当的访问控制；Key 放在服务器环境变量中。

GitHub 仓库用于分享源码。GitHub Pages 只能托管静态文件，无法运行本项目的 Node.js 后端或安全保存服务端 Key。[GitHub Pages 说明](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
