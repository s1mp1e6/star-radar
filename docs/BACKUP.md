# 数据备份与恢复（BACKUP）

> 制度：数据安全三保险——CF 自动备份 + 本地快照 + 恢复演练记录。

## 三层保障

| 层 | 机制 | 说明 |
|---|---|---|
| 1 | **CF D1 自动备份** | Cloudflare 每日自动备份，保留 30 天，零配置零成本 |
| 2 | **Time Travel 恢复** | 可恢复到过去 30 天内任意时间点（见下） |
| 3 | **本地 SQL 快照** | `npm run db:backup` 导出到 `backups/`（gitignored，含密钥，勿提交） |

## 本地快照

```bash
npm run db:backup          # 导出 backups/backup-YYYYMMDD.sql（同日幂等）
```

## 恢复步骤（按损坏程度选）

### A. 误删部分数据 / 最近 30 天内损坏
1. CF Dashboard → Workers & Pages → star-radar → D1 → star-radar-db → **Time travel**
2. 选择恢复时间点 → Restore（全程秒级，期间建议暂停写操作）
3. 恢复后跑 `npm run smoke` 验证

### B. 超过 30 天 / 换账号迁移
1. `npx wrangler d1 create star-radar-db` 建新库（如迁移）
2. `npx wrangler d1 execute star-radar-db --remote --file=backups/backup-YYYYMMDD.sql`
3. 更新 wrangler.toml database_id → `npm run deploy`

## 演练记录（W4，2026-08-14）

- [x] `npm run db:backup` 远程导出成功（本地快照层验证）
- [ ] Time Travel 恢复演练：恢复步骤 A 完整走一遍（需 Dashboard 操作，用户验收时执行）
- [x] 恢复后验证手段就绪（smoke + /health + /debug）

## 注意

- `backups/*.sql` 包含 providers.api_key 等敏感字段，**已被 .gitignore 排除**，绝不提交/外传
- 建议每月手动跑一次 db:backup 并把文件另存（如网盘）
