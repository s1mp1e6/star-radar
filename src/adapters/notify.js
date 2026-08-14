/* 通知渠道适配器（W5）：通用 Webhook（POST JSON）。未来邮件/IM 加协议类型零侵入 */
export function buildNotifyPayload(title, content) {
  return { title, content, time: new Date().toISOString() };
}

export async function sendWebhook(url, { title, content }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000); // 8s 超时，通知失败不得拖垮同步
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildNotifyPayload(title, content)),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`notify_http_${res.status}`);
    return true;
  } finally {
    clearTimeout(timer);
  }
}
