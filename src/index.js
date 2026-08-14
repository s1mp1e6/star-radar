/* 入口：路由注册（支持 :param 路径模式）+ scheduled 调度（薄层） */
import { fail, handleOptions } from "./lib/http.js";
import { beijingParts } from "./lib/time.js";
import { runScrapeIfNeeded } from "./services/scrape.js";
import { generateDailyBatch } from "./services/ai.js";
import { trackerSync } from "./services/tracker.js";
import { handleDates } from "./routes/dates.js";
import { handleDebug } from "./routes/debug.js";
import { handleProjects, handleProjectDetail, handleGenerate } from "./routes/projects.js";
import { handleAdminTrigger } from "./routes/admin.js";
import { handleFavs } from "./routes/favs.js";
import { handleLeaderboard } from "./routes/leaderboard.js";
import { handleProviders, handleProviderModels, handleProviderTest, handlePresets } from "./routes/providers.js";
import { handleGithubToken } from "./routes/settings.js";

const ROUTES = [
  { method: "GET", path: "/api/v1/dates", handler: (r, e) => handleDates(e) },
  { method: "GET", path: "/api/v1/projects", handler: (r, e) => handleProjects(r, e) },
  { method: "GET", path: "/api/v1/projects/detail", handler: (r, e) => handleProjectDetail(r, e) },
  { method: "POST", path: "/api/v1/projects/:repo/generate", handler: (r, e, p) => handleGenerate(r, e, p) },
  { method: "GET", path: "/api/v1/favs", handler: (r, e) => handleFavs(r, e) },
  { method: "POST", path: "/api/v1/favs", handler: (r, e) => handleFavs(r, e) },
  { method: "DELETE", path: "/api/v1/favs", handler: (r, e) => handleFavs(r, e) },
  { method: "GET", path: "/api/v1/leaderboard", handler: (r, e) => handleLeaderboard(r, e) },
  { method: "GET", path: "/api/v1/providers", handler: (r, e) => handleProviders(r, e) },
  { method: "POST", path: "/api/v1/providers", handler: (r, e) => handleProviders(r, e) },
  { method: "GET", path: "/api/v1/providers/presets", handler: (r, e) => handlePresets(r, e) },
  { method: "POST", path: "/api/v1/providers/models", handler: (r, e) => handleProviderModels(r, e) },
  { method: "POST", path: "/api/v1/providers/test", handler: (r, e) => handleProviderTest(r, e) },
  { method: "GET", path: "/api/v1/settings/github-token", handler: (r, e) => handleGithubToken(r, e) },
  { method: "POST", path: "/api/v1/settings/github-token", handler: (r, e) => handleGithubToken(r, e) },
  { method: "GET", path: "/api/v1/debug", handler: (r, e) => handleDebug(r, e) },
  { method: "POST", path: "/api/v1/admin/trigger", handler: (r, e) => handleAdminTrigger(r, e) },
];

function matchRoute(method, pathname) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const parts = route.path.split("/");
    const segs = pathname.split("/");
    if (parts.length !== segs.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].startsWith(":")) params[parts[i].slice(1)] = decodeURIComponent(segs[i]);
      else if (parts[i] !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return handleOptions();
    const url = new URL(request.url);
    const matched = matchRoute(request.method, url.pathname);
    if (!matched) {
      // 未命中 API 路由 → 交给静态资源（生产环境必须显式调用 ASSETS.fetch）
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return fail("not_found", `未找到路由: ${request.method} ${url.pathname}`, 404);
    }
    try {
      return await matched.route.handler(request, env, matched.params);
    } catch (e) {
      return fail("internal", e.message, 500);
    }
  },

  /* 定时入口（北京时区）：
   * 任意触发 → 检查当天抓取是否完成（漏跑补抓）
   * 06:00 → 当日 pending 项目的 AI 增量批生成（22s 全局截止）
   * 21:00 → 收藏仓库追踪同步（GraphQL 批量，star_history + release） */
  async scheduled(controller, env) {
    const bj = beijingParts(controller.scheduledTime ? new Date(controller.scheduledTime) : new Date());
    await runScrapeIfNeeded(env, bj);
    if (bj.hour === 6) {
      try {
        await generateDailyBatch(env, bj);
      } catch (e) {
        console.error("AI batch failed:", e.message);
      }
    }
    if (bj.hour === 21) {
      try {
        await trackerSync(env, bj);
      } catch (e) {
        console.error("Tracker sync failed:", e.message);
      }
    }
  },
};
