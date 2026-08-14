/* HTTP 响应工具：统一 {ok, data, error} 结构 + 安全响应头（PLAYBOOK 安全模型） */
const COMMON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Token",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

export function json(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: COMMON_HEADERS });
}

export function fail(code, msg, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: { code, msg } }), {
    status,
    headers: COMMON_HEADERS,
  });
}

export function handleOptions() {
  return new Response(null, { status: 204, headers: COMMON_HEADERS });
}
