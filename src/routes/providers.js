/* /api/v1/providers — AI 供应商 CRUD / 拉模型列表 / 连通性测试（需 Token；key 一律脱敏） */
import { json, fail } from "../lib/http.js";
import { requireToken } from "../lib/auth.js";
import { testProvider, listModels, PRESETS } from "../adapters/providers.js";

const MASK = "***masked***";

const pick = (p) => ({
  id: p.id,
  name: p.name || "",
  type: p.type || "openai-compatible",
  base_url: p.base_url || "",
  model: p.model || "",
  tag: p.tag || "",
  enabled: p.enabled ? 1 : 0,
  sort: Number(p.sort) || 0,
});

export async function handleProviders(request, env) {
  const authErr = requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, 401);

  try {
    if (request.method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM providers ORDER BY sort, name").all();
      return json(
        (results || []).map((r) => ({
          ...pick(r),
          has_key: !!r.api_key,
          api_key: r.api_key ? MASK : "",
        }))
      );
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !Array.isArray(body.providers)) return fail("bad_param", "providers 必须是数组");
      const existing = await env.DB.prepare("SELECT * FROM providers").all();
      const old = new Map((existing.results || []).map((r) => [r.id, r]));

      const stmts = [env.DB.prepare("DELETE FROM providers")];
      for (const [i, p] of body.providers.entries()) {
        const id = p.id || `p_${Date.now()}_${i}`;
        let key = String(p.api_key ?? "");
        let clear = !!p._clear_api_key;
        if (key === MASK && old.has(id) && !clear) key = old.get(id).api_key; // 保留旧 key
        if (clear) key = "";
        stmts.push(
          env.DB.prepare(
            "INSERT INTO providers (id, name, type, base_url, model, api_key, enabled, tag, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(id, p.name || "", p.type || "openai-compatible", p.base_url || "", p.model || "", key, p.enabled ? 1 : 0, p.tag || "", Number(p.sort) || 0)
        );
      }
      await env.DB.batch(stmts);
      return json({ saved: body.providers.length });
    }
    return fail("method_not_allowed", `不支持 ${request.method}`, 405);
  } catch (e) {
    return fail("db_error", `供应商配置失败: ${e.message}`, 500);
  }
}

export async function handleProviderModels(request, env) {
  const authErr = requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, 401);
  const body = await request.json().catch(() => null);
  if (!body) return fail("bad_param", "请求体必须是 JSON");
  if (body.provider_id && !body.api_key) {
    const row = await env.DB.prepare("SELECT * FROM providers WHERE id = ?").bind(body.provider_id).first();
    if (!row) return fail("bad_param", "供应商不存在");
    body.type = row.type;
    body.base_url = row.base_url;
    body.api_key = row.api_key;
  }
  if (!body?.base_url || !body?.api_key) return fail("bad_param", "需要 base_url 与 api_key（或已保存的 provider_id）");
  try {
    const models = await listModels({ type: body.type || "openai-compatible", base_url: body.base_url, api_key: body.api_key });
    return json({ models });
  } catch (e) {
    return fail("models_unavailable", `此厂商未提供模型列表接口或请求失败（${e.message}），请手动输入 model`, 400);
  }
}

export async function handleProviderTest(request, env) {
  const authErr = requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, 401);
  const body = await request.json().catch(() => null);
  if (!body) return fail("bad_param", "请求体必须是 JSON");
  if (body.provider_id && !body.api_key) {
    const row = await env.DB.prepare("SELECT * FROM providers WHERE id = ?").bind(body.provider_id).first();
    if (!row) return fail("bad_param", "供应商不存在");
    body.type = row.type;
    body.base_url = row.base_url;
    body.model = body.model || row.model;
    body.api_key = row.api_key;
  }
  if (!body?.base_url || !body?.model || !body?.api_key) return fail("bad_param", "需要 base_url / model / api_key（或已保存的 provider_id）");
  const result = await testProvider({ type: body.type || "openai-compatible", base_url: body.base_url, model: body.model, api_key: body.api_key });
  return json(result);
}

export function handlePresets(request, env) {
  const authErr = requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, 401);
  return json(PRESETS);
}
