/* /api/v1/settings/notify — 通知配置（GET 脱敏 / POST 保存 / POST test 测试） */
import { json, fail } from "../lib/http.js";
import { requireToken } from "../lib/auth.js";
import { getSetting, setSetting } from "../lib/db.js";
import { getNotifyConfig, sendTestNotify } from "../services/notify.js";

const DEFAULT_EVENTS = ["release", "star_spike", "daily"];

export async function handleNotifyGet(env) {
  const cfg = await getNotifyConfig(env);
  return json({
    enabled: !!cfg?.enabled,
    url_configured: !!cfg?.url,
    url_suffix: cfg?.url ? String(cfg.url).slice(-8) : "",
    events: cfg?.events || DEFAULT_EVENTS,
    star_spike_threshold: Number(cfg?.star_spike_threshold) || 500,
    last_error: (await getSetting(env, "last_notify_error")) || "",
  });
}

export async function handleNotifySave(request, env) {
  const authErr = await requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, authErr.status || 401);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fail("bad_param", "请求体必须是 JSON");

  const cfg = {
    enabled: !!body.enabled,
    url: String(body.url || "").trim(),
    events: Array.isArray(body.events) ? body.events.filter((e) => DEFAULT_EVENTS.includes(e)) : DEFAULT_EVENTS,
    star_spike_threshold: Math.max(50, Number(body.star_spike_threshold) || 500),
  };
  await setSetting(env, "notify_config", JSON.stringify(cfg));
  return json({ saved: true });
}

export async function handleNotifyTest(request, env) {
  const authErr = await requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, authErr.status || 401);
  const body = await request.json().catch(() => null);
  const result = await sendTestNotify(env, body?.url ? String(body.url).trim() : null);
  if (!result.ok) return fail("notify_failed", result.msg, 502);
  return json(result);
}
