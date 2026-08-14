/* POST /api/v1/admin/trigger — 手动补抓/补生成/补追踪（需 Token，PLAYBOOK 故障响应入口） */
import { json, fail } from "../lib/http.js";
import { requireToken } from "../lib/auth.js";
import { beijingParts } from "../lib/time.js";
import { runScrape } from "../services/scrape.js";
import { generateDailyBatch } from "../services/ai.js";
import { trackerSync } from "../services/tracker.js";

export async function handleAdminTrigger(request, env) {
  const authErr = requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, 401);

  let body;
  try {
    body = await request.json();
  } catch {
    return fail("bad_body", "请求体必须是 JSON");
  }

  const bj = beijingParts();
  switch (body.task) {
    case "scrape": {
      try {
        const res = await runScrape(env, bj);
        return json({ task: "scrape", result: res });
      } catch (e) {
        return fail("scrape_failed", `抓取失败: ${e.message}`, 500);
      }
    }
    case "generate": {
      try {
        const res = await generateDailyBatch(env, bj);
        return json({ task: "generate", result: res });
      } catch (e) {
        return fail("generate_failed", `批量生成失败: ${e.message}`, 500);
      }
    }
    case "tracker": {
      try {
        const res = await trackerSync(env, bj);
        return json({ task: "tracker", result: res });
      } catch (e) {
        return fail("tracker_failed", `追踪同步失败: ${e.message}`, 500);
      }
    }
    default:
      return fail("bad_task", "task 仅支持: scrape | generate | tracker");
  }
}
