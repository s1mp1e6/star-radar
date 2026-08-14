/* GET /api/v1/stats — 统计报表（公开）：趋势（近30天）+ 收藏组合 + 涨幅榜 */
import { json, fail } from "../lib/http.js";

const safeJson = (s) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

/* 纯函数（可单测）：收藏组合 = 总星标 + 语言分布 */
export function computePortfolio(favs) {
  let total = 0;
  const langs = new Map();
  for (const f of favs) {
    total += f.s?.stargazers_count || 0;
    const l = f.s?.language;
    if (l) langs.set(l, (langs.get(l) || 0) + 1);
  }
  return {
    total,
    langs: [...langs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count })),
  };
}

/* 纯函数（可单测）：涨幅 Top（净增星标，仅保留正增长） */
export function topGainers(hist, limit = 5) {
  return (hist || [])
    .map((h) => ({ repo: h.repo, gain: (h.last_stars || 0) - (h.first_stars || 0) }))
    .filter((g) => g.gain > 0)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit);
}

export async function handleStats(env) {
  try {
    const { results: trend } = await env.DB.prepare(
      "SELECT date, COUNT(*) AS project_count, SUM(stars_total) AS total_stars " +
        "FROM projects GROUP BY date ORDER BY date DESC LIMIT 30"
    ).all();
    const { results: favRows } = await env.DB.prepare("SELECT repo, snapshot_json FROM favs").all();
    const favs = (favRows || []).map((r) => ({ repo: r.repo, s: safeJson(r.snapshot_json) }));

    const { results: hist } = await env.DB.prepare(
      "SELECT repo, MIN(stars) AS first_stars, MAX(stars) AS last_stars FROM star_history GROUP BY repo"
    ).all();

    return json({
      trend: (trend || []).reverse(), // 旧 → 新
      portfolio: computePortfolio(favs),
      fav_count: favs.length,
      gainers: topGainers(hist),
    });
  } catch (e) {
    return fail("db_error", `统计查询失败: ${e.message}`, 500);
  }
}
