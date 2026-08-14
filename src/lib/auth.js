/* 鉴权：写操作需 X-Admin-Token 匹配 secrets.ADMIN_TOKEN（最小权限，ADR-0004 同源精神） */
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

export function requireToken(request, env) {
  if (!env.ADMIN_TOKEN) {
    return {
      error: "admin_token_missing",
      msg: "未设置 ADMIN_TOKEN，请运行: npx wrangler secret put ADMIN_TOKEN",
    };
  }
  if (!isAuthed(request, env)) return { error: "unauthorized", msg: "Token 无效" };
  return null;
}
