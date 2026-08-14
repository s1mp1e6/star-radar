# 开发流程规范（PROCESS）

> 正规流程化是防屎山的第二道墙。每个阶段都必须走完五步，缺一步不算完成。

## 阶段五步法

```
1. 设计   → 更新 docs/（架构文档 + 新增决策写 ADR），任务清单写入 docs/plan/<M#>.md
2. 实现   → 按任务清单逐项勾选完成，每个任务一个 commit（Conventional Commits）
3. 自检   → 跑 docs/plan/<M#>.md 中的验收清单 + npm run check（语法/单测）
4. 本地   → wrangler dev 本地验证验收清单每一项
5. 验收   → 用户确认后打 tag（v0.x.0），进入下一阶段
```

## 完成（Done）的定义

一条任务只有同时满足以下条件才算 done：
- [ ] 代码实现且通过 `npm run check`
- [ ] 对应验收清单项在本地验证通过
- [ ] 文档（README/API/ADR）已同步更新
- [ ] commit message 符合 Conventional Commits

## 预演门禁（Spike Gate）

> 制度：**动工前先预演，未验证的假设禁止进入代码**（配合 docs/ASSUMPTIONS.md）。
> 每个里程碑若触碰「未验证假设」，必须先跑 Spike，把结果写回假设登记表，才能动工。

### 预演清单（M0.5 已启动，滚动执行）

| # | 预演 | 状态 | 结果 |
|---|---|---|---|
| S1 | Search API 查询语法 + 中文排除词 + 响应体积 | ✅ 完成 | 语法/中文词/体积全部验证通过（ASSUMPTIONS A1-A5） |
| S2 | wrangler 环境就绪 | ❌ 发现问题 | wrangler 未安装 → M1 第 1 步安装（E2） |
| S3 | CPU 预算实测（最小 Worker 跑三类操作取真实 CPU 报告） | M1 内 | 结果写回 A5 |
| S4 | 抓取全链路 + 中文排除人工抽样 3 天 | M2 内 | 结果写回 A4/A7 |
| S5 | AI 供应商协议实测（openai-compatible / gemini-native） | M4 前 | 结果写回 I1-I3 |
| S6 | GraphQL 批量追踪实测 | M5 前 | 结果写回 A6 追踪部分 |

### 演练要求（每阶段验收时）

按 PLAYBOOK「演练要求」抽 1 条故障矩阵做桌面演练（检测→响应→回滚），
不过关不进下一阶段。

## 仓库规范

| 项 | 规范 |
|---|---|
| 分支 | main 直接提交（单人项目），每阶段结束打 tag |
| 版本 | semver：0.x 阶段号，L0 完成 = v1.0.0 |
| 提交 | `feat:` `fix:` `docs:` `refactor:` `test:` `chore:` |
| 变更日志 | CHANGELOG.md，每阶段追加 |
| 目录 | `src/`（Worker）`public/`（前端）`migrations/`（DB 迁移）`docs/`（文档+ADR+计划）`tests/`（单测） |

## 验收清单模板（每个阶段 docs/plan/<M#>.md 必填）

- [ ] 功能点 1：操作步骤 → 预期结果
- [ ] 功能点 2：……
- [ ] 异常路径：断网/限流/空数据时的表现
- [ ] 性能红线：单请求 CPU 估算、子请求数、D1 写入量

## 评审门禁（防屎山守则执行机制）

进入下一阶段前，自查并记录：
1. 分层是否越界（routes 是否直接 fetch / services 是否直接写 SQL）
2. 是否出现 >300 行文件、>50 行函数（拆）
3. schema 是否走了迁移脚本
4. 是否存在写死的厂商/数据源清单（应为数据驱动）
5. 密钥是否出现在日志/前端/聊天
