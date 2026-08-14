/* 生产冒烟脚本：对已部署系统做 8 项关键检查
 * 用法：node scripts/smoke.mjs [--scrape]
 * 环境变量：BASE_URL（默认线上地址）；ADMIN_TOKEN 从本地 admin-token.txt 读取（不回显） */
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL || "https://star-radar.zal-pc-remote.workers.dev";
let token = "";
try {
  token = readFileSync(new URL("../admin-token.txt", import.meta.url), "utf8").trim();
} catch {
  console.warn("⚠️ 未找到本地 admin-token.txt，跳过带鉴权检查");
}

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const j = async (url, opts) => {
  const r = await fetch(url, opts);
  const d = await r.json().catch(() => null);
  return { r, d };
};

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check("首页 200", async () => {
  const r = await fetch(BASE);
  assert(r.ok, `HTTP ${r.status}`);
  const html = await r.text();
  assert(html.includes("开源雷达"), "页面缺少品牌文案");
});
check("五页面 + 静态资源 200", async () => {
  for (const p of ["/daily.html", "/favorites.html", "/leaderboard.html", "/settings.html", "/assets/style.css", "/assets/app.js"]) {
    const r = await fetch(BASE + p);
    assert(r.ok, `${p} → HTTP ${r.status}`);
  }
});
check("dates 返回数组", async () => {
  const { d } = await j(`${BASE}/api/v1/dates`);
  assert(d?.ok === true && Array.isArray(d.data), "结构异常");
});
check("leaderboard 返回数组", async () => {
  const { d } = await j(`${BASE}/api/v1/leaderboard?range=all`);
  assert(d?.ok === true && Array.isArray(d.data), "结构异常");
});
check("presets 免密可读（11 家）", async () => {
  const { d } = await j(`${BASE}/api/v1/providers/presets`);
  assert(d?.ok === true && d.data.length === 11, `预设数 ${d?.data?.length}`);
});
check("github-token 状态接口", async () => {
  const { d } = await j(`${BASE}/api/v1/settings/github-token`);
  assert(d?.ok === true && typeof d.data.has_token === "boolean", "结构异常");
});
if (token) {
  check("debug 无 token → 401", async () => {
    const { r } = await j(`${BASE}/api/v1/debug`);
    assert(r.status === 401, `期望 401 实际 ${r.status}`);
  });
  check("debug 带 token → 正常", async () => {
    const { r, d } = await j(`${BASE}/api/v1/debug`, { headers: { "X-Admin-Token": token } });
    assert(r.ok && d?.ok === true && d.data.tables.projects >= 0, "结构异常");
  });
  if (process.argv.includes("--scrape")) {
    check("手动抓取（--scrape）", async () => {
      const { d } = await j(`${BASE}/api/v1/admin/trigger`, {
        method: "POST",
        headers: { "X-Admin-Token": token, "Content-Type": "application/json" },
        body: JSON.stringify({ task: "scrape" }),
      });
      assert(d?.ok === true && d.data.result.total > 0, `抓取结果异常: ${JSON.stringify(d?.error || d)}`);
      console.log(`  ℹ️ 入库 ${d.data.result.ok} 条 / 重复 ${d.data.result.dup} 条`);
    });
  }
}

let fail = 0;
for (const c of checks) {
  try {
    await c.fn();
    console.log(`✅ ${c.name}`);
  } catch (e) {
    fail += 1;
    console.error(`❌ ${c.name}: ${e.message}`);
  }
}
console.log(fail ? `\n${fail} 项失败` : "\n✅ 冒烟全部通过");
process.exit(fail ? 1 : 0);
