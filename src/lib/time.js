/* 北京时区工具：Intl 优先 + 断言校验 + 手动 +8h 兜底（旧方案 C7 修复落地） */
const BJ_TZ = "Asia/Shanghai";

export function manualBeijing(now) {
  const t = new Date(now.getTime() + 8 * 3600 * 1000);
  return { date: t.toISOString().slice(0, 10), hour: t.getUTCHours() };
}

export function assertBeijing(utc, bj) {
  // 北京 = UTC+8，手工路径是权威基准：Intl 结果与之不符则视为环境不支持
  const m = manualBeijing(utc);
  if (m.date !== bj.date || m.hour !== bj.hour) {
    throw new Error(`Beijing timezone assertion failed: intl=${bj.date}/${bj.hour} manual=${m.date}/${m.hour}`);
  }
}

export function beijingParts(now = new Date()) {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: BJ_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hour12: false,
    });
    const p = {};
    for (const { type, value } of fmt.formatToParts(now)) p[type] = value;
    const hour = parseInt(p.hour === "24" ? "0" : p.hour, 10);
    const result = { date: `${p.year}-${p.month}-${p.day}`, hour };
    assertBeijing(now, result);
    return result;
  } catch {
    return manualBeijing(now);
  }
}
