/* 鉴权：X-Admin-Token 常数时间比较 + 失败限流（防爆破，W4）
 * 限流：按来源 IP 固定窗口，10 分钟 10 次失败 → 锁 10 分钟（429） */
import { getSetting, setSetting } from "./db.js";

export const AUTH_WINDOW_MS = 10 * 60 * 1000;
export const AUTH_MAX_FAILS = 10;

/* 纯函数（可单测）：给定记录与当前时间，返回是否拦截与下一条记录 */
export function authBlockDecision(rec, now) {
  if (!rec || now - rec.t0 > AUTH_WINDOW_MS) {
    return { blocked: false, rec: { t0: now, fails: 0 } };
  }
  return { blocked: rec.fails >= AUTH_MAX_FAILS, rec };
}

export function isAuthed(request, env) {
  const expected = env.ADMIN_TOKEN;
  const given = request.headers.get("X-Admin-Token") || "";
  if (!expected || !given) return false;
  // 常数时间比较，防时序侧信道
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const clientIp = (request) => request.headers.get("CF-Connecting-IP") || "local";

export async function requireToken(request, env) {
  const key = `auth_fails_${clientIp(request)}`;
  let rec = null;
  try {
    rec = JSON.parse((await getSetting(env, key)) || "null");
  } catch {
    rec = null;
  }
  const now = Date.now();
  const { blocked, rec: fresh } = authBlockDecision(rec, now);
  if (blocked) {
    return { error: "too_many_attempts", msg: "尝试次数过多，请 10 分钟后再试", status: 429 };
  }
  if (!env.ADMIN_TOKEN) {
    // 部署未配置 token 属于运维问题而非攻击，不计入失败次数
    return {
      error: "admin_token_missing",
      msg: "未设置 ADMIN_TOKEN，请运行: npx wrangler secret put ADMIN_TOKEN",
      status: 401,
    };
  }
  if (!isAuthed(request, env)) {
    fresh.fails += 1;
    await setSetting(env, key, JSON.stringify(fresh));
    return { error: "unauthorized", msg: "Token 无效", status: 401 };
  }
  if (fresh.fails > 0) await setSetting(env, key, ""); // 成功后清零
  return null;
}
