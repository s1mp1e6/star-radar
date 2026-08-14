# 🛰️ 开源雷达 StarRadar

> 0 元成本的 GitHub 开源项目发现与追踪系统 —— 自动抓取每日新星榜、历史存档、跨设备收藏、AI 深度详解、星标追踪。

**纯 Cloudflare 免费额度运行**（Workers + D1 + Cron），无需云服务器、无需维护费、打开网页即用。

## ✨ 功能

| 模块 | 说明 |
|---|---|
| 📡 每日抓取 | 北京时间 05:00 自动抓取 GitHub 新星榜前 25（金融量化类自动排除），历史存档可回溯任意一天 |
| 🗓 日报浏览 | 日期卡片 → 时段 → 项目列表 → 详情，三层 SPA |
| ⭐ 跨设备收藏 | 收藏存 D1 数据库，任何设备打开同一网址数据一致 |
| 📈 星标追踪 | 收藏即追踪：每天 21:00 同步星标曲线、涨跌徽章、新 release 提醒 |
| 🤖 AI 深度详解 | 6 维度中文详解（简介/特性/推荐/场景/上手/优缺点），11 家预设供应商（OpenAI 兼容 + Gemini 原生），自动拉模型列表、一键测试、failover 熔断 |
| 🏆 排行榜 | 出现频率榜（同天去重），全部/近 7 天 |
| 🌗 双主题 | 暗色（默认）/浅色，自动记忆 |
| 🔧 可观测 | cron 审计表 + /debug 接口 + 系统状态面板 |

## 🚀 快速部署（3 步，全部免费）

```bash
git clone https://github.com/<你>/star-radar.git
cd star-radar
npm install

# 1. 登录 Cloudflare（已有账号，免费）
npx wrangler login

# 2. 建库 + 建表 + 设管理员密码（自动写回配置）
npx wrangler d1 create star-radar-db   # 把输出的 database_id 填入 wrangler.toml
npm run db:init:remote
npx wrangler secret put ADMIN_TOKEN    # 自定义一个密码字符串

# 3. 部署（Worker + D1 + 静态资源 + 3 个 cron 一条命令）
npm run deploy
```

部署后访问输出的 `https://star-radar.<你的子域>.workers.dev`。
打开「设置」页填入 ADMIN_TOKEN 即可开始使用。

### 推荐：配置 GitHub 只读 PAT（提升配额稳定性）

未认证调用受限（共享 IP 配额可能被耗尽，已实测发生）。建议自建最小权限令牌：

1. GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate new token
2. Repository access 选 **Public Repositories（只读）**，不勾任何写权限
3. 生成后运行：`npx wrangler secret put GITHUB_TOKEN`（粘贴令牌）
4. 配额从 60 次/小时提升到 5000 次/小时

### 配置 AI 供应商

设置页 → AI 供应商 → 选预设（Gemini / DeepSeek / 智谱 / OpenRouter 等 11 家）→ 粘贴 key →
点「测试」确认连通 →「启用」→「保存全部」。生成时按顺序 failover，1 分钟内连挂 2 次自动熔断 10 分钟。

## 🛠 本地开发

```bash
npm install
npm run dev          # http://127.0.0.1:8787，本地 D1 独立数据
npm run check        # 语法检查 + 单测（43 个）
npm run db:init      # 本地 D1 建表
node scripts/mock-ai.mjs   # （可选）本地 mock AI，无 key 跑通生成全链路
```

本地触发 cron：`curl -X POST http://127.0.0.1:8787/cdn-cgi/local/scheduled`

## 🏗 架构

```
浏览器（5 个静态页面，零框架 ES Module）
   ↓ /api/v1/*
Cloudflare Worker（routes → services → adapters → lib 四层）
   ↓
D1（projects / favs / star_history / providers / settings / cron_runs）
   ↑ 3 个 cron：北京 05:00 抓取 / 06:00 AI 增量 / 21:00 追踪同步
```

- **零成本设计**：全部落在 CF 免费额度内（10 万请求/天、10ms CPU、5 cron、D1 5GB）
- **CPU 铁律**：Worker 内禁止 HTML 大页解析，数据源用官方 JSON API + D1 批量写 + GraphQL 单请求
- **可扩展**：数据源/AI 供应商/追踪都是适配器注册表，新增协议零侵入
- **工程化**：架构文档 + ADR 决策记录 + 假设登记表 + 应急手册 + 五步开发流程（见 docs/）

## 📚 文档

- [架构方案](docs/ARCHITECTURE.md)（分级 L0/L1/L2 + 可行性验证 + 防屎山守则）
- [开发流程](docs/PROCESS.md)（五步法 + 预演门禁 + 演练要求）
- [假设登记表](docs/ASSUMPTIONS.md)（20+ 条假设台账，含被推翻记录）
- [应急手册](docs/PLAYBOOK.md)（8 种故障 × 检测/响应/回滚 + 4 级降级）
- [决策记录](docs/adr/)（ADR-0001~0004）
- [里程碑验收](docs/plan/)（M1~M6 全量记录）

## 📄 License

[MIT](LICENSE) © 2026 StarRadar Contributors
