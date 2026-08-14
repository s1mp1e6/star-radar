# 应急手册（Playbook）

> 制度：**每个已知故障模式都必须有「检测方式 + 响应动作 + 回滚路径」**，
> 新故障发生后 24h 内补进本手册。目标：任何故障 ≤5 分钟定位、≤30 分钟恢复。

## 降级模式（Degradation Modes）

| 模式 | 触发 | 系统表现 | 用户感知 |
|---|---|---|---|
| D0 全功能 | 无故障 | 全部能力可用 | 正常 |
| D1 无 AI | AI 厂商故障/额度耗尽 | 详情页显示"等待生成"，其余正常 | L0 功能不受影响 ✅ |
| D2 无自动抓取 | cron 连续失败 | 历史数据可浏览；手动 /admin/trigger 可补抓 | 无新日报 |
| D3 纯静态兜底 | Worker 整体不可用 | 切换回 radar/ 纯前端版本（已存在） | 至少能看热门列表 |

**设计铁律：AI 是增强层，抓取是数据层，浏览是展示层——层间故障互不拖垮。**

## 故障矩阵

| # | 故障 | 检测 | 响应 | 回滚 |
|---|---|---|---|---|
| 1 | 抓取失败（GitHub 限流/网络） | cron_runs.error_msg + /debug | 重试 3 次指数退避 → 切备用查询（活跃榜）→ 标记 skip | 次日自动补抓；或 /admin/trigger 手动 |
| 2 | AI 生成失败 | detail_status=error + fail_count | failover 换供应商 → 10 次转 permanent | 详情页手动"立即生成"重置 |
| 3 | CPU 超限 Error 1102 | cron_runs + CF 仪表盘 Metrics | 定位超限步骤（/debug）→ 减小批量/改按需 | 回滚上一版本代码 |
| 4 | D1 数据损坏/误删 | 页面数据异常 | 停止写入 → 用 **D1 Time Travel** 恢复到 30 天内任意时间点 | 数据恢复后再排查原因 |
| 5 | 部署事故（新版有 bug） | 用户报告 / 验收失败 | `wrangler rollback <version-id>`（秒级回到上一版本） | 修好再发新版本 |
| 6 | ADMIN_TOKEN 或 GitHub PAT 泄漏 | 异常写入/异常 API 消耗 | 立即 `wrangler secret put ADMIN_TOKEN` 换新 + 撤销 PAT（GitHub Settings→Applications） | 审计 cron_runs 找异常操作 |
| 7 | 请求量异常暴涨（Error 1027） | CF 仪表盘 + /debug | 前端缓存 + 中间件限流（已内置）→ 查刷量来源 | 必要时临时停用 Worker |
| 8 | 收藏/追踪数据膨胀异常 | /debug 行数统计 | 检查是否有循环写入 bug | Time Travel 恢复 + 修 bug |

## 回滚路径（标准化）

```
代码回滚：wrangler deployments list → wrangler rollback <version-id>
数据回滚：CF Dashboard → D1 → star-radar-db → Time travel → 选时间点 → Restore
配置回滚：settings 表有 last_modified 审计，/admin/trigger 支持 dry-run
迁移回滚：每个 migrations/*.sql 必须带 down 部分（成对）
```

## 上线前检查表（M6 部署验收必做）

- [ ] 上一版本 tag 存在（v0.x.x），可随时 rollback
- [ ] ADMIN_TOKEN 已设置，GitHub 只读 PAT 已配置（ADR-0004）
- [ ] /debug 接口能显示 cron_runs、行数、剩余额度
- [ ] 手机 + 电脑各完成一次完整浏览/收藏/详情闭环
- [ ] 手动触发一次 /admin/trigger 验证补抓链路
- [ ] 记录部署时间与版本到 CHANGELOG

## 演练要求

- 每个里程碑验收时，随机抽取 1 条故障矩阵做**桌面演练**（口述：检测→响应→回滚），
  不通过不进入下一阶段。M2 抽 #1（抓取失败），M4 抽 #2（AI 失败），M6 抽 #5（部署回滚）。
