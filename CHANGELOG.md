# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

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
