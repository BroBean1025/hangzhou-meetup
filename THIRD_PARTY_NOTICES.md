# 第三方代码、数据与素材

原创程序代码采用 MIT；此文件列出的内容不因此转为 MIT。这里记录来源与许可边界，不声称已经取得第三方的额外授权。

项目演示及服务接入示例面向个人学习、研究与技术交流；使用者自行配置高德 Key。完整用途、学校标识及权利反馈声明见 [DISCLAIMER.md](DISCLAIMER.md)。这份声明不替代任何第三方授权，也不限制 MIT 已授予的原创代码使用权。

| 内容 | 本项目路径 | 来源与许可情况 |
| --- | --- | --- |
| Leaflet | `src/vendor/leaflet.*`、构建后的对应资源 | Leaflet，BSD-2-Clause；完整原始声明见 `licenses/Leaflet-LICENSE.txt` |
| 杭州地铁目录、静态时间与网络 | `data/map.json` 中的目录/基础数据；运行时从 API 查询 | [OpenMetro](https://github.com/Naptie/openmetro)，上游仓库声明 MPL-2.0；上游许可证不能替代底层供应商可能存在的权利。未复制上游 API 实现代码 |
| 底图与校园区域 | `data/geography.json` | © OpenStreetMap contributors，ODbL 1.0；构成公开派生数据库的内容应保持相应署名与同许可要求 |
| 真实轨道轨迹、跨城规划模型 | `data/map.json` 的 segments、`config/regional-network.json` | 整理自高德规划/线路资料，属于第三方派生快照；不授予 MIT 数据许可 |
| 校门接驳与跨站区步行资料 | `config/walking-snapshot.json`、`config/settings.json` 部分来源信息、前端估时快照 | 由高德规划及公开校区资料核实整理；不授予 MIT 数据许可 |
| 校徽 | `data/school-*.png`、相应构建图片及截图中的标识 | 据项目作者说明，下载自浙江大学、浙江工业大学、西湖大学官网“文化标识”等相关栏目公开提供的资源；仅用于地点识别，不表示学校背书，权利归原权利人，不纳入 MIT 许可 |
| 页面截图 | `docs/desktop.png`、`docs/mobile.png` | 包含上述地图数据与标识，其第三方权属随之保留 |

地图页已经保留 OpenStreetMap 和 OpenMetro 署名。源码/数据快照与构建资源同时提供，方便追溯。地理坐标转换和格式整理不会自动消除原始数据的使用限制。

## 公开发行需要区分的范围

密钥、日志、个人路径及托管绑定已从整理包中排除，但**移除密钥不等于取得数据再分发权**。

高德服务协议对相关内容的复制、存储、缓存、脱离服务使用和传播设有限制；当前未核实本项目既有轨迹、时间快照及图片的公开再分发授权。公开发布全量素材前，需要获得适用授权或替换成明确允许再分发的来源。校徽按作者提供的官网来源记录，其使用和再发布遵循学校公布的规范及适用规定；公开下载不改变原权利归属。

可先将代码整理包放入私有仓库审阅；如果要将所有文件放入公开仓库，不能仅凭本项目的 MIT LICENSE 认定第三方数据/素材均已获准。本文不扩大任何供应商许可，也不承诺对外发布已经完成许可审查。

## 原始来源

- [Leaflet](https://leafletjs.com/)；本地完整许可随包附带。
- [OpenMetro 仓库](https://github.com/Naptie/openmetro)、[上游 MPL-2.0 许可证](https://github.com/Naptie/openmetro/blob/main/LICENSE)、[API 文档](https://openmetro.dev/swagger)。
- [OpenStreetMap 版权与许可](https://www.openstreetmap.org/copyright)、[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)。
- [高德 Web 服务说明](https://lbs.amap.com/api/webservice/summary)、[高德开放平台服务协议](https://lbs.amap.com/pages/terms/)。

记录日期：2026-11-05。数据中的抓取时间/来源字段保留其原始值；记录日期不是数据刷新日期。
