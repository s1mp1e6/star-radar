# ADR-0001：选择 Cloudflare Workers + D1 作为运行底座

- **日期**：2026-08
- **状态**：已接受（待用户最终确认）

## 背景

需要 0 元成本运行：定时抓取 GitHub 热门项目、历史存档、跨设备收藏、服务端 AI 调用。
用户无云服务器、预算 0 元/月，但已有 Cloudflare 账号。

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| 纯静态页 + 浏览器直连 API | 部署最简单 | 无历史存档、无跨设备收藏、AI key 暴露在浏览器 |
| GitHub Actions 每日 commit 存档 | 0 成本、有历史 | 无实时收藏、无服务端 AI、仓库被数据 commit 刷屏 |
| 租 VPS / 云函数 | 自由 | 每月 5 元以上，超出预算 |
| **CF Workers + D1** | **0 元、cron、数据库、静态托管一体** | 10ms CPU 硬约束（已验证可规避） |

## 决策

选 CF Workers + D1。已验证免费额度：10 万请求/天、5 cron/账号、D1 5GB、10ms CPU/调用。
CPU 约束通过"JSON 源 + 批量写入 + GraphQL 单请求"策略规避（见 ARCHITECTURE.md §1）。

## 后果

- 必须遵守 CPU 预算铁律，禁止 HTML 大页解析（真 Trending 源推迟到 L2）
- 架构不绑定 CF 私有 API（adapters 隔离），若未来额度变动可整体迁移
