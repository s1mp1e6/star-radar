# ADR-0002：数据源采用官方 Search API 新星榜（而非爬 Trending HTML）

- **日期**：2026-08
- **状态**：已接受（待用户最终确认）

## 背景

GitHub Trending 无官方 API。旧方案爬 `github.com/trending` HTML；
但 CF Workers 免费计划 CPU 仅 10ms/调用，官方文档明示"解析大负载通常 10-20ms"，
HTML 解析（~200KB 页面）存在超限风险，且页面结构变化会导致抓取失效。

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| 爬 Trending HTML（HTMLRewriter） | 真 Trending 语义（含老项目爆火） | CPU 超限风险、结构脆弱 |
| 第三方 Trending JSON 服务 | 省事 | 依赖他人可用性，违背"可持续" |
| **官方 Search API 新星榜** | 官方稳定、JSON 原生解析 1-2ms、支持 NOT 关键词过滤 | 语义为"新创建+高星"，缺老项目爆火 |

## 决策

L0 用官方 Search API：`created:>昨日 archived:false NOT 量化 NOT 回测 ... sort=stars` 取前 25。
真 Trending（HTML 源）作为 L2 预留适配器，届时本地压测 CPU，超限再评估。

## 后果

- "每日新星榜"与真 Trending 有语义差异，需在 UI 文案中如实标注
- 排除金融量化类靠 NOT 关键词（覆盖名称/描述/topic），存在漏网可能，接受
- DataSourceAdapter 接口从第一天就抽象好，L2 换源零侵入
