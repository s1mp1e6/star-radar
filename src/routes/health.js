/* GET /api/v1/health — 公开健康检查（可接免费外部监控，如 UptimeRobot）
 * degraded 语义：无抓取记录 或 最近一次抓取失败 */
import { json, fail } from "../lib/http.js";

export async function handleHealth(env) {
  try {
    const { results: last } = await env.DB.prepare(
      "SELECT date, status, error_msg FROM cron_runs WHERE task_type = 'scrape' ORDER BY id DESC LIMIT 1"
    ).all();
    const run = last?.[0] || null;
    const { results: dates } = await env.DB.prepare("SELECT MAX(date) AS latest FROM projects").all();
    const degraded = !run || run.status === "error";
    return json({
      ok: true,
      version: "0.1.4",
      degraded,
      last_scrape: run ? { date: run.date, status: run.status } : null,
      latest_data_date: dates?.[0]?.latest || null,
    });
  } catch (e) {
    return fail("health_error", `健康检查异常: ${e.message}`, 500);
  }
}
