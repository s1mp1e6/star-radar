/* GET /api/v1/leaderboard?range=all|7d — 出现频率榜（同天去重，跨天累加）
 * SQL 正确性见 ARCHITECTURE 附录：COUNT(DISTINCT date) 而非 COUNT(*) */
import { json, fail } from "../lib/http.js";

export async function handleLeaderboard(request, env) {
  const range = new URL(request.url).searchParams.get("range") || "all";
  const where = range === "7d" ? "WHERE date >= date('now', '-7 days')" : "";
  try {
    const { results } = await env.DB.prepare(
      `SELECT repo, MAX(description) AS description, MAX(language) AS language,
              MAX(stars_total) AS best_stars, MAX(date) AS last_date,
              COUNT(DISTINCT date) AS appear_days
       FROM projects ${where}
       GROUP BY repo
       ORDER BY appear_days DESC, best_stars DESC
       LIMIT 10`
    ).all();
    return json(results || []);
  } catch (e) {
    return fail("db_error", `排行榜查询失败: ${e.message}`, 500);
  }
}
