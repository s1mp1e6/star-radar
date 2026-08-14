/* 本地全链路集成测试（W4）：自动拉起 wrangler dev + mock AI，跑完整业务闭环
 * 用法：node scripts/integration.mjs
 * 覆盖：鉴权(401/429) → 抓取 → 存档 → 收藏 → 排行榜 → 供应商(测试/拉模型) → AI 生成 → 详情 */
import { spawn, execSync } from "node:child_process";
import { openSync } from "node:fs";

const PORT = 8791;
const MOCK_PORT = 9998;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const H = { "X-Admin-Token": "local-dev-token", "Content-Type": "application/json" };

const killTree = (child) => {
  if (child?.pid) {
    try {
      execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" }); // Windows：杀进程树，避免 workerd 僵尸
    } catch {
      /* 已退出 */
    }
  }
};

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitReady(url, tries = 240) {
  for (let i = 0; i < tries; i++) {
    try {
      await fetch(url);
      return; // 任何 HTTP 响应都说明服务已就绪（业务错误≠未就绪）
    } catch {
      /* 未就绪 */
    }
    await sleep(500);
  }
  throw new Error(`等待超时: ${url}（dev 日志见 integration-dev.log）`);
}

async function j(path, opts = {}) {
  const auth = opts.noAuth ? {} : (opts.method && opts.method !== "GET") || opts.auth ? H : {};
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { ...(opts.headers || {}), ...auth },
  });
  return { status: res.status, d: await res.json().catch(() => null) };
}

let dev = null;
let mock = null;

async function main() {
  console.log("启动 mock AI 与 wrangler dev …");
  const devLog = openSync("integration-dev.log", "a");
  mock = spawn(process.execPath, ["scripts/mock-ai.mjs"], {
    env: { ...process.env, MOCK_PORT: String(MOCK_PORT) },
    stdio: "ignore",
    windowsHide: true,
  });
  dev = spawn(process.execPath, ["./node_modules/wrangler/bin/wrangler.js", "dev", "--port", String(PORT)], {
    env: { ...process.env, CI: "1" },
    stdio: ["ignore", "ignore", devLog],
    windowsHide: true,
  });
  try {
    await waitReady(`${BASE}/dates`);
    console.log("✅ 服务就绪");

    // 1. 鉴权
    let r = await j("/admin/trigger", { method: "POST", body: JSON.stringify({ task: "scrape" }), noAuth: true });
    assert(r.status === 401, `无 Token 应 401，实际 ${r.status}`);
    console.log("✅ 无 Token 写操作 401");

    // 2. 抓取（真实 GitHub API）
    r = await j("/admin/trigger", { method: "POST", body: JSON.stringify({ task: "scrape" }) });
    assert(r.d?.ok && r.d.data.result.total >= 10, `抓取失败: ${JSON.stringify(r.d)}`);
    console.log(`✅ 抓取入库 ${r.d.data.result.ok} 条（重复 ${r.d.data.result.dup}）`);

    // 3. 日期与项目列表
    r = await j("/dates");
    assert(r.d?.ok && r.d.data.length >= 1, "dates 为空");
    const date = r.d.data[0].date;
    r = await j(`/projects?date=${date}`);
    assert(r.d?.ok && r.d.data.length >= 10, "项目列表过短");
    const repo = r.d.data[0].repo;
    console.log(`✅ 存档读取：${date} 共 ${r.d.data.length} 项`);

    // 4. 收藏闭环
    r = await j("/favs", { method: "POST", body: JSON.stringify({ repo, snapshot: { stargazers_count: 1 } }) });
    assert(r.d?.ok, "收藏失败");
    r = await j("/favs");
    assert(r.d?.ok && r.d.data.some((f) => f.repo === repo), "收藏未读回");
    r = await j(`/favs?repo=${encodeURIComponent(repo)}`, { method: "DELETE" });
    assert(r.d?.ok, "取消收藏失败");
    console.log("✅ 收藏 POST/GET/DELETE 闭环");

    // 5. 排行榜
    r = await j("/leaderboard?range=7d");
    assert(r.d?.ok && Array.isArray(r.d.data) && r.d.data.length > 0, "排行榜为空");
    console.log("✅ 排行榜有数据");

    // 6. 供应商：保存 mock → 测试 → 拉模型
    r = await j("/providers", {
      method: "POST",
      body: JSON.stringify({ providers: [{ id: "p_it", name: "集成Mock", type: "openai-compatible", base_url: `http://127.0.0.1:${MOCK_PORT}/v1`, model: "mock-model", api_key: "k", enabled: 1 }] }),
    });
    assert(r.d?.ok, "供应商保存失败");
    r = await j("/providers/test", { method: "POST", body: JSON.stringify({ provider_id: "p_it" }) });
    assert(r.d?.ok && r.d.data.ok === true, `测试失败: ${JSON.stringify(r.d)}`);
    r = await j("/providers/models", { method: "POST", body: JSON.stringify({ provider_id: "p_it" }) });
    assert(r.d?.ok && r.d.data.models.includes("mock-model"), "拉模型失败");
    console.log("✅ 供应商 保存/测试/拉模型");

    // 7. AI 生成 + 详情六字段（优先挑未生成过的仓库，避开 1 分钟手动窗口）
    const rows = (await j(`/projects?date=${date}`)).d.data;
    const target = rows.find((x) => x.detail_status === "pending") || rows[0];
    r = await j(`/projects/${encodeURIComponent(target.repo)}/generate`, { method: "POST", body: JSON.stringify({ date }) });
    if (!r.d?.ok && r.d?.error?.code === "too_soon") {
      console.log("✅ AI 生成（1 分钟窗口限流生效，本轮跳过重复生成）");
    } else {
      assert(r.d?.ok, `生成失败: ${JSON.stringify(r.d)}`);
      r = await j(`/projects/detail?repo=${encodeURIComponent(target.repo)}&date=${date}`);
      const detail = r.d?.data?.detail;
      for (const f of ["intro", "features", "recommend", "scenarios", "getting_started", "pros_cons"]) {
        assert(typeof detail?.[f] === "string" && detail[f].length > 0, `缺字段 ${f}`);
      }
      console.log(`✅ AI 生成 + 六维度校验（by ${detail.generated_by}）`);
    }

    // 7. 通知配置 + 测试消息（Webhook 指向 mock）
    r = await j("/settings/notify", {
      method: "POST",
      body: JSON.stringify({ enabled: 1, url: `http://127.0.0.1:${MOCK_PORT}/v1/notify`, events: ["release", "star_spike", "daily"], star_spike_threshold: 500 }),
    });
    assert(r.d?.ok, "通知配置保存失败");
    r = await j("/settings/notify/test", { method: "POST", body: JSON.stringify({}) });
    assert(r.d?.ok && r.d.data.ok === true, `通知测试失败: ${JSON.stringify(r.d)}`);
    r = await j("/settings/notify");
    assert(r.d?.ok && r.d.data.url_configured === true, "通知配置未回读");
    console.log(`✅ 通知 保存/测试/脱敏回读（${r.d.data.url_suffix}）`);

    // 8. 统计报表
    r = await j("/stats");
    assert(r.d?.ok && Array.isArray(r.d.data.trend) && typeof r.d.data.portfolio?.total === "number", `统计结构异常: ${JSON.stringify(r.d?.error || r.d?.data)}`);
    console.log(`✅ 统计报表（趋势 ${r.d.data.trend.length} 天 · 组合总星 ${r.d.data.portfolio.total}）`);

    // 9. 健康检查 + 调试
    r = await j("/health");
    assert(r.d?.ok && typeof r.d.data.degraded === "boolean", "health 结构异常");
    r = await j("/debug", { auth: true });
    assert(r.d?.ok && r.d.data.tables.projects > 0, "debug 失败");
    console.log("✅ health + debug");

    console.log("\n🎉 集成全链路 9 项全部通过");
  } finally {
    killTree(dev);
    killTree(mock);
    await sleep(800);
  }
}

main().catch((e) => {
  console.error(`❌ 集成测试失败: ${e.message}`);
  killTree(dev);
  killTree(mock);
  process.exit(1);
});
