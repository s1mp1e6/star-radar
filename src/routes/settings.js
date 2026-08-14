/* /api/v1/settings/github-token — GitHub 只读 PAT 的网页配置（ADR-0004 落地）
 * 存 D1 settings；GET 只回 has_token（永不回显密钥）；优先级低于 CF Secret */
import { json, fail } from "../lib/http.js";
import { requireToken } from "../lib/auth.js";
import { getSetting, setSetting } from "../lib/db.js";

export async function handleGithubToken(request, env) {
  if (request.method === "GET") {
    const v = await getSetting(env, "github_token");
    return json({ has_token: !!v, source: env.GITHUB_TOKEN ? "secret" : "settings" });
  }

  const authErr = requireToken(request, env);
  if (authErr) return fail(authErr.error, authErr.msg, 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.token !== "string") return fail("bad_param", "需要 token 字段");

  if (body.token === "") {
    await setSetting(env, "github_token", "");
    return json({ has_token: false, cleared: true });
  }
  await setSetting(env, "github_token", body.token.trim());
  return json({ has_token: true });
}
