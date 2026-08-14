/* /api/v1/projects — 某日列表（公开）/ 单条详情（公开，含 AI 详解）/ 手动生成（Token） */
import { json, fail } from "../lib/http.js";
import { requireToken } from "../lib/auth.js";
import { generateOne } from "../services/ai.js";

const safeJson = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

export async function handleProjects(request, env) {
  const date = new URL(request.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail("bad_param", "缺少或非法 date 参数（格式 YYYY-MM-DD）");
  }
  try {
    const { results } = await env.DB.prepare(
      "SELECT date, run_hour, rank, repo, description, language, stars_total, url, detail_status " +
        "FROM projects WHERE date = ? ORDER BY run_hour, rank"
    )
      .bind(date)
      .all();
    return json(results || []);
  } catch (e) {
    return fail("db_error", `查询项目失败: ${e.message}`, 500);
  }
}

export async function handleProjectDetail(request, env) {
  const u = new URL(request.url);
  const repo = u.searchParams.get("repo");
  const date = u.searchParams.get("date");
  if (!repo || !date) return fail("bad_param", "需要 repo 与 date 参数");
  try {
    const row = await env.DB.prepare("SELECT * FROM projects WHERE repo = ? AND date = ?")
      .bind(repo, date)
      .first();
    if (!row) return fail("not_found", "项目不存在", 404);
    row.detail = safeJson(row.detail_json);
    return json(row);
  } catch (e) {
    return fail("db_error", `查询详情失败: ${e.message}`, 500);
  }
}

export async function handleGenerate(request, env, params) {
  const authErr = await requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, authErr.status || 401);
  const body = await request.json().catch(() => ({}));
  try {
    const res = await generateOne(env, params.repo, {
      forceProviderId: body.provider_id || null,
      trigger: "manual",
      date: body.date || null,
    });
    return json(res);
  } catch (e) {
    const status = e.code === "generating" ? 409 : e.code === "not_found" ? 404 : e.code === "too_soon" ? 429 : 502;
    return fail(e.code || "generate_failed", e.message, status);
  }
}
