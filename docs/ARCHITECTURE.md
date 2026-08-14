# 开源雷达 StarRadar v2 — 架构方案（可持续 · 可扩展 · 分级）

> 状态：v0.2 待确认。本文档为唯一实施依据，代码变更先改文档。
> 依据：用户旧版《github-trending-cf-workers.md》+ 调研结论 + Cloudflare 官方限额实测。

## 0. 调研结论与决策

**决策：自研。** 2026-08 调研 GitHub Trending 相关开源项目（vitalets/github-trending-repos 2989⭐、
bonfy/github-trending 1096⭐、huchenme/github-trending-api 828⭐、yangwenmai/github-trending-backup 455⭐、
hunter-ai-content-factory 385⭐ 等），无一同时满足「历史存档 + 自定义界面 + 跨设备收藏 + 多供应商 AI + 0 成本 + 中文」。
**CF Workers + D1 在该方向为空白，具备开源价值。**

关键决策记录见 `docs/adr/`（每个决策一份 ADR，含背景/方案/后果，是"正规流程化"的基石）。

## 1. 可行性验证（Cloudflare 免费额度实测）

来源：[官方 Limits 文档](https://developers.cloudflare.com/workers/platform/limits/)。

| 限额（免费计划） | 数值 | 我们的消耗估算 | 结论 |
|---|---|---|---|
| 请求数 | 10 万/天 | 单人使用 <1000/天 | ✅ 余量 99% |
| **CPU 时间** | **10ms/次调用** | 见下方"CPU 预算" | ⚠️ 唯一硬约束 |
| 子请求 | 50/次调用 | 抓取 1-2 次 + D1 批量写入 | ✅ batch 合并后远低于上限 |
| Cron 触发器 | 5 个/账号 | 计划 3 个 | ✅ |
| Cron 墙钟 | 30s（<1h 间隔）/ 15min（≥1h） | AI 分批 + 截止时间 | ✅ |
| D1 存储 | 5GB | 每天 25 行 ≈ 几 KB | ✅ 可用数十年 |
| D1 读写 | 500 万行读 / 10 万行写（天） | 25 写/天 | ✅ |

**结论：0 元可行。** 唯一硬约束是 10ms CPU——官方文档明确："解析大负载的工作通常用 10-20ms"，
**因此禁止在 Worker 内做 HTML 大页解析**。所有设计围绕这一点展开：

**CPU 预算策略（铁律）**
1. 数据源用 **JSON API**（官方 Search API），JSON.parse 是原生 C++ 实现，25 条 ≈ 1-2ms
2. 数据库写入全部走 **D1 batch**（一次子请求完成 25 行）
3. AI 详解只做"拼 prompt + JSON.parse 响应"，网络等待不算 CPU
4. 追踪系统用 **GitHub GraphQL 单请求**拉全部收藏仓库（替代 N 次 REST）
5. 禁止：正则爬大 HTML、模板引擎服务端渲染、JSON 往返多次序列化

**风险登记表**

| 风险 | 概率 | 对策 |
|---|---|---|
| 未来想上真 Trending（HTML 源）CPU 超限 | 中 | L2 预留 HTML 适配器 + 本地压测；超限则评估付费提额或第三方 JSON 源 |
| AI 厂商超时/限流 | 高 | 按需生成为主（用户打开才生成）+ failover + 熔断 + 10 次失败转 permanent |
| 免费额度被官方调整 | 低 | 架构不绑定 CF 私有 API，adapters 可整体替换为其他 serverless |

## 2. 分级架构（L0 / L1 / L2）

```
L0 核心闭环（v1.0 必须，无 AI 也能用）
  抓取存档 → 日期浏览 → 日报 → 跨设备收藏 → 排行榜 → 设置/安全
L1 智能增强（v1.1，用户确认后做）
  多供应商 AI 详解（深度版） + 项目追踪（收藏即追踪：星标历史/release 提醒）
L2 预留扩展（文档占位，不做）
  真 Trending HTML 源 · 邮件/Webhook 通知 · 数据导出 · 多用户
```

分层不变（routes → services → adapters → lib），但**功能按 L0/L1/L2 分级交付**，
每级完成才进入下一级，防止一次做太多导致屎山。

## 3. 系统架构

```
浏览器（任意设备）
  ├─ index.html 日期卡片 │ daily.html 三层 SPA │ favorites.html（含追踪视图）
  ├─ leaderboard.html │ settings.html
  └─ app.js：API 客户端（Token + 30s 缓存 + 事件总线）
        │ HTTPS /api/v1/*
Worker（src/index.js 路由注册 → 中间件 → routes → services → adapters → lib）
        │
D1：projects / favs / star_history / providers / settings / cron_runs
        ▲
Cron（北京时区，共 3 个触发器，全部间隔 ≥1h）
  ├─ 05:00  每日管线：抓取 25 项 → 去重入库 → cron_runs 审计 → 漏跑补抓
  ├─ 06:00  AI 增量生成（当日新入库，分批 + 22s 截止，不足留 pending）
  └─ 21:00  追踪同步（GraphQL 批量更新收藏星标 + release 检测）
```

**数据源（L0）**：官方 Search API 新星榜
`q = created:>昨日 archived:false NOT 量化 NOT 回测 NOT 股票 NOT A股 sort=stars` → 拉 45 条缓冲，
post-filter 全量 24 词排除后取前 25（不足则窗口扩至 2/3 天）。
⚠️ 实测约束：GitHub Search 单查询最多 **5 个 AND/OR/NOT 操作符**（超出返回 422），
因此查询层只放 4 个 NOT（留余量），关键词过滤主体在 post-filter 层（M2 实测验证）。
真 Trending（含老项目爆火）列入 L2 的 HTML 适配器。

## 4. 追踪系统设计（L1，回答"项目后来更新了怎么办"）

**决策（ADR-0003）：收藏 = 追踪。只追踪收藏的项目，不追踪全部。**

理由：追踪全部项目数据无界（25 项/天 × 永久），D1 与 GraphQL 消耗线性膨胀；
收藏集合是用户显式表达的兴趣集，量级 ≤ 数百，完全可控。想追踪更多 → 收藏它。

```
star_history(repo, date, stars)  -- 每个收藏仓库每天 1 行，时间序列
favs.snapshot_json              -- 最新快照（含 latest_release）
```

- 每日 21:00 cron：GraphQL 单请求拉全部收藏仓库的 stars/fork/latest release
  → batch 写入 star_history + 更新快照 → 收藏页显示：
  「自收藏以来 ↑ 1.2k 星」+ SVG 星标曲线 + 「🔔 有新 release」徽章
- 未来扩展（不动现有表）：`star_history` 加 tracked 仓库即可支持"追踪非收藏"；
  release 历史升级为独立 events 表；通知推送走 L2 adapter。

## 5. 数据模型（权威 schema = migrations/0001_init.sql）

```sql
projects     (id, date, run_hour, rank, repo UNIQUE(date,repo), description, language,
              stars_total, url, detail_json, detail_status, detail_fail_count,
              detail_trigger, detail_updated_at, created_at)
favs         (repo UNIQUE, snapshot_json, saved_at)
star_history (repo, date, stars, PRIMARY KEY(repo,date))          -- L1 追踪
providers    (id, name, type, base_url, model, api_key, enabled, tag, sort)  -- L1 AI
settings     (key PRIMARY KEY, value)
cron_runs    (id, task_type, date, run_hour, started_at, ended_at,
              items_ok, items_dup, items_fail, ai_ok, ai_fail, status, error_msg)
```

变更一律走 `migrations/`（编号 SQL，成对 up/down）+ `npm run db:init`，禁止手改线上。

## 6. API 设计（/api/v1/*）

| 接口 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| /dates | GET | 公开 | 日期卡片（每日项目数/时段状态） |
| /projects?date=X | GET | 公开 | 某日项目列表 + AI 状态 |
| /projects/:repo/generate | POST | Token | 手动生成详解，可指定 provider（L1） |
| /projects/:repo/refresh | POST | Token | 手动刷新该收藏项目追踪数据（L1） |
| /favs | GET/POST/DELETE | 读公开/写 Token | 跨设备收藏（含追踪曲线数据，L1） |
| /leaderboard?range=all\|7d | GET | 公开 | 出现频率榜 |
| /providers + /models + /test | GET/POST | Token | 供应商 CRUD / 拉模型列表 / 1-token 测试（L1） |
| /cron-runs | GET | Token | 最近 5 次审计 |
| /admin/trigger | POST | Token | 手动补抓/补生成/补追踪 |
| /debug | GET | Token | 运行状态汇总 |

安全模型：ADMIN_TOKEN 保护写操作；API key 存 D1 且 GET 脱敏、支持 `_clear_api_key`；
POST/DELETE 强制 JSON Content-Type；统一 `nosniff` + `X-Frame-Options: DENY`；前端 30s 缓存。

## 7. 已确认产品决策（2026-08 用户拍板）

| 决策 | 内容 |
|---|---|
| 抓取 | 每天 1 次（北京 05:00）× 前 25 |
| 排除 | 金融量化类关键词过滤保留（20+ 词，不足 25 向后补足） |
| AI 规格 | 深度版：6 维度（简介/特性/推荐/场景/上手/优缺点），字数不封顶 |
| AI 生成时机 | 按需（打开详情/收藏时 lazy）+ 每日 06:00 增量兜底 |
| 开源 | 公开仓库 + MIT + 完善 README |
| 追踪 | 收藏即追踪，只追踪收藏项目（L1） |

## 8. 开发流程（正规流程化，详见 docs/PROCESS.md）

每阶段固定五步：**设计（改文档/ADR）→ 实现（任务清单逐项勾选）→ 自检（验收清单）→
本地验证（wrangler dev）→ 部署验收（用户确认）**。版本 semver + CHANGELOG + Conventional Commits。
见 `docs/PROCESS.md`（含每阶段验收清单模板与"完成"的定义）。

## 9. 里程碑

| 阶段 | 级别 | 交付物 | 验收标准 |
|---|---|---|---|
| M0 | — | 本文档 + PROCESS + ADR | 用户确认（本轮） |
| M1 | L0 | wrangler 配置/schema/迁移/中间件/空路由/bootstrap | dev 起来，/api/v1/dates 返回 [] |
| M2 | L0 | scheduler/数据源/去重/cron_runs/补抓 | 手动触发抓 25 条入库，同日去重生效 |
| M3 | L0 | 5 页面 + 主题 + 缓存 + 收藏/排行 | 本地走通完整浏览闭环 |
| M4 | L1 | AI 适配器/模型拉取/测试/failover/lazy 生成 | 真实 key 生成 1 条深度详解 |
| M5 | L1 | 追踪同步/star 曲线/release 徽章 | 收藏项目隔天显示涨幅曲线 |
| M6 | — | D1 建库/ADMIN_TOKEN/deploy/端到端 | 手机+电脑跨设备同步，次日 cron 自动入库 |
| M7 | — | README/LICENSE 完善 + 开源发布 | 公开仓库可访问 |

## 10. 防屎山守则（违者返工）

1. 分层不越界；外部依赖一律走 adapter（数据源/供应商/通知）。
2. 模块文件 ≤300 行；单函数 ≤50 行。
3. schema 变更走 migrations；API 响应统一 `{ok,data,error}`。
4. 新功能先写文档/ADR 再写代码；README 同步更新。
5. 禁止裸 await；fetch/DB 必须有错误路径。
6. 供应商/数据源清单数据驱动，不写死。
7. 密钥三不进：不进日志、不进前端代码、不进聊天。
8. 每次改动 `npm run check`（语法 + 单测）通过才算完。
9. 提交 Conventional Commits；每阶段完成打 tag。
10. 30s 缓存、批处理、截止时间是性能铁律，改动需 ADR。
