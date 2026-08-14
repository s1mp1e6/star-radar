/* GET /api/v1/dates — 日期卡片列表（公开只读） */
import { json, fail } from "../lib/http.js";

export async function handleDates(env) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT date, COUNT(*) AS project_count, MAX(run_hour) AS last_hour " +
        "FROM projects GROUP BY date ORDER BY date DESC LIMIT 90"
    ).all();
    return json(results || []);
  } catch (e) {
    return fail("db_error", `查询日期失败: ${e.message}`, 500);
  }
}
