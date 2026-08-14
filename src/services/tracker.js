/* 追踪同步：收藏仓库 → GraphQL 批量拉取 → 快照更新 + star_history 时间序列（ADR-0003）
 * 每仓库每天 1 行；分片 50 个仓库/请求；全程 ≤5 子请求 + 审计；顺带触发通知事件（W5） */
import { insertCronRun, finishCronRun, getGitHubToken } from "../lib/db.js";
import { fetchReposGraphQL, parseRepoData } from "../adapters/github-graphql.js";
import { notifyTrackedChanges } from "./notify.js";

const CHUNK = 50; // 预留分片：收藏超 50 时自动多请求（ADR-0003 后果）
const safeJson = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

export async function trackerSync(env, bj) {
  const runId = await insertCronRun(env, "tracker_sync", bj);
  let ok = 0;
  let fail = 0;
  try {
    const { results: favRows } = await env.DB.prepare("SELECT repo, snapshot_json FROM favs").all();
    const repos = (favRows || []).map((r) => r.repo);
    const prevStars = new Map((favRows || []).map((r) => [r.repo, safeJson(r.snapshot_json)?.stargazers_count ?? null]));
    if (!repos.length) {
      await finishCronRun(env, runId, { status: "done", items_ok: 0 });
      return { ok: 0, fail: 0, total: 0, notify: { skipped: true } };
    }

    const allData = [];
    const token = await getGitHubToken(env);
    for (let i = 0; i < repos.length; i += CHUNK) {
      const chunk = repos.slice(i, i + CHUNK);
      const json = await fetchReposGraphQL(chunk, token);
      allData.push(...parseRepoData(chunk, json));
    }

    const stmts = [];
    const changes = allData.map((d) => ({ ...d, prevStars: prevStars.get(d.repo) ?? null }));
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

    // 通知事件（失败不影响同步结果）
    let notify = { skipped: true };
    try {
      notify = await notifyTrackedChanges(env, bj, changes);
    } catch (e) {
      console.error("notify failed:", e.message);
    }
    return { ok, fail, total: repos.length, notify };
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
