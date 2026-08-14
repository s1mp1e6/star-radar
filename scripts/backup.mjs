/* D1 远程数据备份：导出到 backups/backup-YYYYMMDD.sql（本地快照，双保险）
 * 说明：CF D1 已自动每日备份并保留 30 天（Time Travel 可恢复），本脚本用于额外本地快照 */
import { execSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outDir = "backups";
const outFile = `${outDir}/backup-${stamp}.sql`;

mkdirSync(outDir, { recursive: true });
if (existsSync(outFile)) {
  console.log(`今日备份已存在: ${outFile}`);
  process.exit(0);
}
execSync(`npx wrangler d1 export star-radar-db --remote --output "${outFile}"`, { stdio: "inherit" });
console.log(`✅ 已导出: ${outFile}`);
