/* 追踪同步：收藏仓库 → GraphQL 批量拉取 → 快照更新 + star_history 时间序列（ADR-0003）
 * 每仓库每天 1 行；分片 50 个仓库/请求；全程 ≤5 子请求 + 审计 */
import { insertCronRun, finishCronRun } from "../lib/db.js";
import { fetchReposGraphQL, parseRepoData } from "../adapters/github-graphql.js";

const CHUNK = 50; // 预留分片：收藏超 50 时自动多请求（ADR-0003 后果）

export async function trackerSync(env, bj) {
  const runId = await insertCronRun(env, "tracker_sync", bj);
  let ok = 0;
  let fail = 0;
  try {
    const { results: favRows } = await env.DB.prepare("SELECT repo FROM favs").all();
    const repos = (favRows || []).map((r) => r.repo);
    if (!repos.length) {
      await finishCronRun(env, runId, { status: "done", items_ok: 0 });
      return { ok: 0, fail: 0, total: 0 };
    }

    const allData = [];
    for (let i = 0; i < repos.length; i += CHUNK) {
      const chunk = repos.slice(i, i + CHUNK);
      const json = await fetchReposGraphQL(chunk, env.GITHUB_TOKEN || null);
      allData.push(...parseRepoData(chunk, json));
    }

    const stmts = [];
    for (const d of allData) {
      if (d.error) {
        fail += 1;
        continue;
      }
      ok += 1;
      const snapshot = JSON.stringify({
        stargazers_count: d.stars,
        forks_count: d.forks,
        latest_release: d.release,
        pushed_at: d.pushed_at,
        tracked_at: new Date().toISOString(),
      });
      stmts.push(env.DB.prepare("UPDATE favs SET snapshot_json = ? WHERE repo = ?").bind(snapshot, d.repo));
      stmts.push(
        env.DB.prepare("INSERT OR REPLACE INTO star_history (repo, date, stars) VALUES (?, ?, ?)").bind(d.repo, bj.date, d.stars)
      );
    }
    if (stmts.length) await env.DB.batch(stmts);

    await finishCronRun(env, runId, { status: "done", items_ok: ok, items_fail: fail });
    return { ok, fail, total: repos.length };
  } catch (e) {
    await finishCronRun(env, runId, {
      status: "error",
      items_ok: ok,
      items_fail: fail,
      error_msg: String(e.message || e).slice(0, 300),
    });
    throw e;
  }
}
