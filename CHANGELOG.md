# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.1.4] - 2026-08-14

产品化 W4：稳定性与安全加固。

### Added

- 防爆破限流：管理员令牌失败 10 次/10 分钟按 IP 锁 10 分钟（429），成功自动清零
- `GET /api/v1/health` 公开健康检查（degraded 语义，可接 UptimeRobot 等免费监控）
- `scripts/integration.mjs` 本地全链路集成测试（自动拉起 dev+mock，9 项断言）
- `scripts/backup.mjs` D1 远程备份到本地（docs/BACKUP.md 三层保障 + 演练记录）
- 设置页系统状态卡片增加服务健康指示

### Changed

- requireToken 升级为异步（带限流），全部 8 处调用点同步升级并支持 429 状态码

## [0.1.3] - 2026-08-14

产品化 W3：移动端打磨。

### Added

- PWA 可安装：manifest + SVG 图标 + theme-color 随主题动态同步
- 移动端安全区适配（viewport-fit=cover + env(safe-area-inset-*)）

### Changed

- 移动端布局：顶栏导航横滑、卡片单列、表单全宽堆叠、时段行横滑、排行榜换行
- 触控目标：主导航/图标按钮 44px、按钮 40px、按压反馈
- 决策：不做 Service Worker 离线壳（API 驱动产品离线无意义，避免缓存事故），记录于 PRODUCT.md

## [0.1.2] - 2026-08-14

产品化 W2：交互零死角。

### Added

- 骨架屏全覆盖：日报（时段+列表）、收藏、排行榜、供应商列表加载态
- 统一状态组件 `statusCard`（空态/错误态文案与行动按钮各页一致）
- AI 详解加载态与失败重试按钮；打开详情自动滚回顶部
- 设置页已存令牌时自动加载系统状态

## [0.1.1] - 2026-08-14

产品化 W1：视觉系统第一轮 + 发布自检。

### Added

- 首页 hero + 全站统计总览（存档天数/项目总数/收藏数）
- 新手引导三步卡（令牌 → 抓取 → AI）
- `scripts/smoke.mjs` 生产冒烟脚本（8 项检查，npm run smoke）
- 按钮焦点态（无障碍）、首页版本号页脚
- GitHub Token 网页配置（无需终端，ADR-0004 落地）

### Fixed

- **key 保存"消失"问题**：保存失败（401）不再静默——顶部常驻警告横幅 + 失败时保留已填内容并明确指引；保存成功后显示「✅ 已保存」状态徽章，消除掩码空输入框的误导
- 供应商预设列表改为免密公开（设置页无需令牌即可加载预设）
- 设置页过时文案（"AI 详解（M4）开发中"→ 已上线）

## [0.1.0] - 2026-08-14

首个完整版本：L0 核心闭环 + L1 智能增强全部交付并部署上线（0 元成本）。

### Added

- **M1 骨架**：CF Workers + D1 分层架构、统一 API 结构与安全头、鉴权中间件、自检脚本与单测体系
- **M2 抓取存档**：官方 Search API 新星榜（金融量化排除 + post-filter）、批量入库去重、cron 审计、同日漏跑补抓、手动触发
- **M3 前端**：五页面（日报存档/日报三层 SPA/收藏/排行榜/设置）、亮暗双主题、30s 缓存、事件总线
- **M4 AI**：openai-compatible + gemini-native 双协议适配器、11 家预设、模型列表拉取、1-token 测试、failover + 熔断冷却 + 10 败转 permanent、22s 截止分批、lazy 生成
- **M5 追踪**：GraphQL 批量同步、star_history 时间序列、星标曲线/涨跌/release 徽章
- **M6 部署**：workers.dev 上线 + D1 建库 + 3 cron + 回滚演练
- 工程化文档：架构方案、开发流程、假设登记表、应急手册、ADR×4、里程碑验收记录 M1-M6

### Fixed

- GitHub Search 5 操作符硬限制（422）→ 查询层 4 NOT + 全量 post-filter
- 4xx 确定性失败不再重试（防配额雪崩）
- quant 单词边界匹配（不误杀 quantum）
- 生产静态资源 404 → ASSETS 显式兜底
- 北京时区 Intl 断言 + 手动 +8h 兜底
- 批量 AI 子请求预算（LIMIT 24 + 批式写库）

[0.1.0]: https://github.com/s1mp1e6/star-radar/releases/tag/v0.1.0
