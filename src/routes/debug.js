/* GET /api/v1/debug — 运行状态汇总（需 Token，PLAYBOOK 故障检测入口） */
import { json, fail } from "../lib/http.js";
import { requireToken } from "../lib/auth.js";

const TABLES = ["projects", "favs", "star_history", "providers", "cron_runs"];

export async function handleDebug(request, env) {
  const authErr = await requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, authErr.status || 401);

  try {
    const counts = {};
    for (const table of TABLES) {
      const { results } = await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${table}`).all();
      counts[table] = results[0]?.c ?? 0;
    }
    const { results: recent } = await env.DB.prepare(
      "SELECT * FROM cron_runs ORDER BY id DESC LIMIT 3"
    ).all();
    return json({ version: "0.1.6", tables: counts, recent_cron_runs: recent || [] });
  } catch (e) {
    return fail("db_error", `调试查询失败: ${e.message}`, 500);
  }
}
