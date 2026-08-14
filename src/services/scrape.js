/* 抓取管线：数据源 → 过滤 → D1 批量入库（INSERT OR IGNORE 去重）→ 审计 */
import { insertCronRun, finishCronRun, hasCompletedRun } from "../lib/db.js";
import { SearchApiSource } from "../adapters/datasource.js";

export async function runScrapeIfNeeded(env, bj) {
  // 同日漏跑补抓：任何一次 cron 触发时检查当天是否已完成抓取
  if (await hasCompletedRun(env, "scrape", bj.date)) return { skipped: true, date: bj.date };
  return runScrape(env, bj);
}

export async function runScrape(env, bj) {
  const runId = await insertCronRun(env, "scrape", bj);
  try {
    const source = new SearchApiSource(env);
    const items = await source.fetchTopRepos({ limit: 25 });
    if (items.length === 0) {
      await finishCronRun(env, runId, { status: "done", error_msg: "数据源返回 0 条（主源+备用）" });
      return { ok: 0, dup: 0, total: 0 };
    }
    // 单次 D1 batch = 1 个子请求（CPU/子请求预算铁律）
    const stmts = items.map((it) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO projects
         (date, run_hour, rank, repo, description, language, stars_total, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(bj.date, String(bj.hour), it.rank, it.repo, it.description, it.language, it.stars_total, it.url)
    );
    const results = await env.DB.batch(stmts);
    let ok = 0;
    let dup = 0;
    for (const r of results) {
      if (r?.meta?.changes > 0) ok++;
      else dup++;
    }
    await finishCronRun(env, runId, { status: "done", items_ok: ok, items_dup: dup, items_fail: items.length - ok - dup });
    return { ok, dup, total: items.length };
  } catch (e) {
    await finishCronRun(env, runId, { status: "error", error_msg: String(e.message || e).slice(0, 300) });
    throw e;
  }
}
