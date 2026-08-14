# ADR-0004：Worker 使用只读 GitHub PAT（可选配置，显著提升配额）

- **日期**：2026-08
- **状态**：已接受（待用户最终确认）

## 背景

Worker 从 Cloudflare 边缘节点调用 GitHub API。Cloudflare 出口 IP 由海量租户共享，
未认证配额（REST 60 次/小时、搜索 10 次/分钟）按 IP 计算，**存在被共享 IP 其他租户
耗尽的风险**（假设登记表 A6）。当日配额耗尽会导致抓取失败（故障矩阵 #1）。

## 备选方案

| 方案 | 优点 | 缺点 |
|---|---|---|
| 不配置任何凭据 | 零配置 | 共享 IP 配额风险，抓取可能随机失败 |
| 复用用户 gh CLI 的 OAuth token | 现成 | 权限过宽（repo/workflow 读写），违反最小权限原则 |
| **用户自建 fine-grained PAT（仅 public 仓库只读）** | 最小权限、配额提升到 5000 次/小时 | 需用户手动创建一次（GitHub 不支持 API 创建 fine-grained PAT） |

## 决策

Worker 支持在 settings 页配置**只读 fine-grained PAT**（用户自建：GitHub → Settings →
Developer settings → Fine-grained tokens → 仅勾选 public repository 只读），
加密存 D1（GET 脱敏）。未配置时退化为未认证调用（降级模式可接受，抓取重试+备用查询兜底）。

配额对比：REST 60→5000 次/小时；搜索 10→30 次/分钟；GraphQL 5000→5000 点/小时（PAT 仍受产品级限制）。

## 后果

- 部署前置条件 +1：用户创建 PAT（README 提供图文步骤）
- Token 泄漏响应路径已写入 PLAYBOOK #6（撤销 + 换新）
- 不使用用户 gh CLI 的主 token——最小权限原则高于便利性
