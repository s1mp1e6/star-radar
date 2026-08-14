/* AI 生成编排：failover + 熔断冷却 + 截止时间 + 状态机（旧方案 B/C 系列修复落地）
 * 纯函数（recordFail/isCooled/decideStatus）可单测 */
import { insertCronRun, finishCronRun, getSetting, setSetting } from "../lib/db.js";
import { callProvider, extractJson, validateDetail, DETAIL_FIELDS } from "../adapters/providers.js";

export const PERM_FAIL = 10;          // 连续失败 ≥10 次转 permanent（B1）
export const COOLING_MS = 10 * 60 * 1000; // 熔断冷却 10 分钟（#14）
export const BATCH_DEADLINE_MS = 22000;   // 全局截止，留 8s 缓冲（C1 致命修复）

export function recordFail(map, id, now) {
  const rec = map[id] || { fails: 0, until: 0 };
  rec.fails += 1;
  if (rec.fails >= 2) {
    rec.until = now + COOLING_MS;
    rec.fails = 0;
  }
  map[id] = rec;
  return map;
}
export function isCooled(map, id, now) {
  const r = map[id];
  return !!(r && r.until > now);
}
export function decideStatus(fails) {
  return fails >= PERM_FAIL ? "failed_perm" : "error";
}

export function buildPrompt(p) {
  return [
    "你是资深开源项目分析师。请为 GitHub 仓库撰写深度中文详解，只输出 JSON，不要任何其他文字或 markdown 围栏。",
    `仓库：${p.repo}`,
    `已知信息：描述=${p.description || "无"}；语言=${p.language || "未知"}；星标=${p.stars_total}。`,
    "必须覆盖 6 个维度，字段名固定为英文，深度优先、字数不封顶：",
    '{"intro": "简介：它是什么、解决什么问题、为什么值得关注",',
    '"features": "核心特性：逐一列出亮点，具体到功能与设计",',
    '"recommend": "推荐理由：与同类项目对比的差异化优势",',
    '"scenarios": "适用场景：谁该用、谁不该用、典型用例",',
    '"getting_started": "快速上手：安装、配置、使用步骤，含关键命令",',
    '"pros_cons": "优缺点：优点与坑分开写，坑必须具体（性能/兼容/文档/维护）"}',
    "项目名保留英文，正文用中文。",
  ].join("\n");
}

const getCooling = async (env) => {
  try {
    return JSON.parse((await getSetting(env, "provider_status")) || "{}");
  } catch {
    return {};
  }
};
const setCooling = (env, map) => setSetting(env, "provider_status", JSON.stringify(map));

async function getEnabledProviders(env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM providers WHERE enabled = 1 ORDER BY sort, name"
  ).all();
  return results || [];
}

/* 核心生成：只调 AI 与校验，不写项目状态（批量调用方统一 batch 写库） */
export async function generateCore(env, proj, { forceProviderId = null } = {}) {
  const providers = await getEnabledProviders(env);
  let cooling = await getCooling(env);
  const now = Date.now();
  const candidates = forceProviderId
    ? providers.filter((p) => p.id === forceProviderId)
    : providers.filter((p) => !isCooled(cooling, p.id, now));

  if (!providers.length) {
    const e = new Error("未配置启用的 AI 供应商（请在设置页添加并启用）");
    e.code = "no_provider";
    throw e;
  }
  if (forceProviderId && !candidates.length) {
    const e = new Error("指定供应商不存在或未启用");
    e.code = "bad_provider";
    throw e;
  }
  if (!forceProviderId && !candidates.length) {
    const e = new Error("所有供应商均在熔断冷却期");
    e.code = "all_cooled";
    throw e;
  }

  let lastErr = null;
  for (const p of candidates) {
    try {
      const text = await callProvider(
        { type: p.type, base_url: p.base_url, model: p.model, api_key: p.api_key },
        buildPrompt(proj)
      );
      const detail = validateDetail(extractJson(text));
      detail.generated_by = `${p.name}/${p.model}`;
      detail.generated_at = new Date().toISOString();
      return detail;
    } catch (e) {
      lastErr = e;
      if (!forceProviderId) {
        cooling = recordFail(cooling, p.id, Date.now());
        await setCooling(env, cooling);
      }
    }
  }
  const e = new Error(`全部供应商失败: ${lastErr?.message || "unknown"}`);
  e.code = "all_failed";
  throw e;
}

const getProjectRow = async (env, repo, date) => {
  if (date) return env.DB.prepare("SELECT * FROM projects WHERE repo = ? AND date = ?").bind(repo, date).first();
  return env.DB.prepare("SELECT * FROM projects WHERE repo = ? ORDER BY date DESC LIMIT 1").bind(repo).first();
};

/* 手动生成（lazy）：状态机 409/窗口限流/失败计数，单条 D1 写 */
export async function generateOne(env, repo, { forceProviderId = null, trigger = "manual", date = null } = {}) {
  const proj = await getProjectRow(env, repo, date);
  if (!proj) {
    const e = new Error("项目不存在");
    e.code = "not_found";
    throw e;
  }
  if (proj.detail_status === "generating") {
    const e = new Error("正在生成中，请稍候（生成中状态不会被并发触发）");
    e.code = "generating";
    throw e;
  }
  if (trigger === "manual") {
    const last = await getSetting(env, `mg_${proj.repo}`);
    if (last && Date.now() - Number(last) < 60000) {
      const e = new Error("1 分钟内已手动触发过，请稍候");
      e.code = "too_soon";
      throw e;
    }
    await setSetting(env, `mg_${proj.repo}`, String(Date.now()));
  }

  await env.DB.prepare(
    "UPDATE projects SET detail_status = 'generating', detail_trigger = ?, detail_updated_at = datetime('now') WHERE id = ?"
  )
    .bind(trigger, proj.id)
    .run();

  try {
    const detail = await generateCore(env, proj, { forceProviderId });
    await env.DB.prepare(
      "UPDATE projects SET detail_json = ?, detail_status = 'done', detail_fail_count = 0, detail_updated_at = datetime('now') WHERE id = ?"
    )
      .bind(JSON.stringify(detail), proj.id)
      .run();
    return { repo: proj.repo, status: "done", generated_by: detail.generated_by };
  } catch (e) {
    const fails = (proj.detail_fail_count || 0) + 1;
    await env.DB.prepare(
      "UPDATE projects SET detail_status = ?, detail_fail_count = ?, detail_updated_at = datetime('now') WHERE id = ?"
    )
      .bind(decideStatus(fails), fails, proj.id)
      .run();
    throw e;
  }
}

/* cron 卡死回退：只回退 cron 触发的 generating（C2 致命修复） */
export async function resetStaleGenerating(env) {
  await env.DB.prepare(
    "UPDATE projects SET detail_status = 'pending' WHERE detail_status = 'generating' AND detail_trigger = 'cron' AND detail_updated_at IS NOT NULL AND detail_updated_at < datetime('now', '-10 minutes')"
  ).run();
}

/* 每日增量批生成：全局截止时间 + 3 并发分批 + 批式写库（C1 修复 + 子请求预算） */
export async function generateDailyBatch(env, bj) {
  await resetStaleGenerating(env);
  const runId = await insertCronRun(env, "ai_generate", bj);
  const DEADLINE = Date.now() + BATCH_DEADLINE_MS;
  let ok = 0;
  let fail = 0;
  try {
    const { results } = await env.DB.prepare(
      `SELECT * FROM projects
       WHERE detail_status IN ('pending', 'error') AND detail_fail_count < ?
       ORDER BY (detail_updated_at IS NULL) DESC, detail_updated_at ASC
       LIMIT 24`
    )
      .bind(PERM_FAIL)
      .all();
    const rows = results || [];
    for (let i = 0; i < rows.length && Date.now() < DEADLINE; i += 3) {
      const chunk = rows.slice(i, i + 3);
      await env.DB.batch(
        chunk.map((r) =>
          env.DB.prepare(
            "UPDATE projects SET detail_status = 'generating', detail_trigger = 'cron', detail_updated_at = datetime('now') WHERE id = ?"
          ).bind(r.id)
        )
      );
      const outcomes = await Promise.allSettled(chunk.map((r) => generateCore(env, r)));
      const updates = [];
      chunk.forEach((r, idx) => {
        const o = outcomes[idx];
        if (o.status === "fulfilled") {
          ok += 1;
          updates.push(
            env.DB.prepare(
              "UPDATE projects SET detail_json = ?, detail_status = 'done', detail_fail_count = 0, detail_updated_at = datetime('now') WHERE id = ?"
            ).bind(JSON.stringify(o.value), r.id)
          );
        } else {
          fail += 1;
          const fails = (r.detail_fail_count || 0) + 1;
          updates.push(
            env.DB.prepare(
              "UPDATE projects SET detail_status = ?, detail_fail_count = ?, detail_updated_at = datetime('now') WHERE id = ?"
            ).bind(decideStatus(fails), fails, r.id)
          );
        }
      });
      await env.DB.batch(updates);
    }
    await finishCronRun(env, runId, { status: "done", ai_ok: ok, ai_fail: fail });
    return { ok, fail };
  } catch (e) {
    await finishCronRun(env, runId, { status: "error", ai_ok: ok, ai_fail: fail, error_msg: String(e.message || e).slice(0, 300) });
    throw e;
  }
}
