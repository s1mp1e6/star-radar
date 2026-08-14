/* /api/v1/favs — 跨设备收藏（GET 公开，POST/DELETE 需 Token，ADR-0003 收藏即追踪） */
import { json, fail } from "../lib/http.js";
import { requireToken } from "../lib/auth.js";

const safeJson = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

export async function handleFavs(request, env) {
  const method = request.method;
  const url = new URL(request.url);
  try {
    if (method === "GET") {
      const withHistory = url.searchParams.get("history") === "1";
      const { results } = await env.DB.prepare(
        "SELECT repo, snapshot_json, saved_at FROM favs ORDER BY saved_at DESC, id DESC"
      ).all();
      const favs = (results || []).map((r) => ({
        repo: r.repo,
        snapshot: safeJson(r.snapshot_json),
        saved_at: r.saved_at,
      }));
      if (withHistory && favs.length) {
        const ph = favs.map(() => "?").join(",");
        const { results: hist } = await env.DB.prepare(
          `SELECT repo, date, stars FROM star_history WHERE repo IN (${ph}) ORDER BY date`
        )
          .bind(...favs.map((f) => f.repo))
          .all();
        const map = {};
        for (const h of hist || []) (map[h.repo] ||= []).push({ date: h.date, stars: h.stars });
        for (const f of favs) f.history = map[f.repo] || [];
      }
      return json(favs);
    }

    const authErr = await requireToken(request, env);
    if (authErr) return fail(authErr.error, authErr.msg, authErr.status || 401);

    if (method === "POST") {
      const body = await request.json().catch(() => null);
      const repo = body?.repo;
      if (!repo || typeof repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        return fail("bad_param", "repo 必须为 owner/name 格式");
      }
      await env.DB.prepare("INSERT OR IGNORE INTO favs (repo, snapshot_json) VALUES (?, ?)")
        .bind(repo, JSON.stringify(body.snapshot || null))
        .run();
      return json({ repo, favorited: true });
    }

    if (method === "DELETE") {
      const repo = url.searchParams.get("repo");
      if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return fail("bad_param", "缺少或非法 repo 参数");
      await env.DB.prepare("DELETE FROM favs WHERE repo = ?").bind(repo).run();
      return json({ repo, removed: true });
    }

    return fail("method_not_allowed", `不支持 ${method}`, 405);
  } catch (e) {
    return fail("db_error", `收藏操作失败: ${e.message}`, 500);
  }
}
