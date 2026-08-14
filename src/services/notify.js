/* 通知服务（W5）：事件检测（纯函数）+ 收藏事件推送 + 每日摘要 + 测试通知
 * 配置存 settings['notify_config']；通知失败只记录不阻塞；每事件每仓库每日最多 1 次 */
import { getSetting, setSetting } from "../lib/db.js";
import { sendWebhook } from "../adapters/notify.js";

const MAX_PER_RUN = 5; // 单次同步最多发 5 条，防轰炸

/* ---------- 纯函数（可单测） ---------- */
export function releaseChanged(prevTag, newTag) {
  return !!newTag && newTag !== prevTag;
}
export function spikeDetected(today, yesterday, threshold) {
  return yesterday != null && today - yesterday >= threshold;
}
export function buildDigestLines(rows) {
  return rows
    .map((r, i) => `#${i + 1} ${r.repo} ★${r.stars_total} ${(r.description || "").slice(0, 60)}`)
    .join("\n");
}

/* ---------- 配置 ---------- */
export async function getNotifyConfig(env) {
  try {
    return JSON.parse((await getSetting(env, "notify_config")) || "null");
  } catch {
    return null;
  }
}

async function recordError(env, e) {
  await setSetting(env, "last_notify_error", `${new Date().toISOString()} ${String(e.message || e).slice(0, 150)}`);
}

async function send(env, cfg, title, content) {
  try {
    await sendWebhook(cfg.url, { title, content });
    await setSetting(env, "last_notify_error", "");
    return true;
  } catch (e) {
    await recordError(env, e);
    return false;
  }
}

/* ---------- 收藏事件推送（trackerSync 调用） ---------- */
export async function notifyTrackedChanges(env, bj, changes) {
  const cfg = await getNotifyConfig(env);
  if (!cfg?.enabled || !cfg?.url) return { skipped: true };
  const events = cfg.events || [];
  let sent = 0;

  for (const c of changes || []) {
    if (sent >= MAX_PER_RUN) break;
    if (c.error) continue;

    if (events.includes("release")) {
      const key = `notified_release_${c.repo}`;
      const prev = await getSetting(env, key);
      const tag = c.release?.tag || "";
      if (releaseChanged(prev || null, tag)) {
        if (prev !== null && prev !== "") {
          const ok = await send(
            env, cfg,
            `🔔 新 release：${c.repo} ${tag}`,
            `${c.release?.name || ""}\n发布时间：${c.release?.published_at || "—"}\n${c.release?.url || `https://github.com/${c.repo}/releases`}`
          );
          if (ok) sent += 1;
        }
        await setSetting(env, key, tag);
      }
    }

    if (events.includes("star_spike")) {
      const threshold = Number(cfg.star_spike_threshold) || 500;
      const dayKey = `notified_spike_${c.repo}_${bj.date}`;
      if (!(await getSetting(env, dayKey)) && spikeDetected(c.stars, c.prevStars, threshold)) {
        const ok = await send(
          env, cfg,
          `🚀 星标大涨：${c.repo}`,
          `昨日 ★${c.prevStars} → 今日 ★${c.stars}（+${c.stars - c.prevStars}）\nhttps://github.com/${c.repo}`
        );
        if (ok) sent += 1;
        await setSetting(env, dayKey, "1");
      }
    }
  }
  return { skipped: false, sent };
}

/* ---------- 每日摘要（scheduled 21:00 / admin 手动触发） ---------- */
export async function sendDailyDigest(env, bj) {
  const cfg = await getNotifyConfig(env);
  if (!cfg?.enabled || !cfg?.url) return { skipped: true };
  if (!(cfg.events || []).includes("daily")) return { skipped: true, reason: "daily_event_disabled" };
  const dayKey = `notified_daily_${bj.date}`;
  if (await getSetting(env, dayKey)) return { skipped: true, reason: "already_sent" };

  const { results } = await env.DB.prepare(
    "SELECT repo, stars_total, description FROM projects WHERE date = ? ORDER BY rank LIMIT 5"
  )
    .bind(bj.date)
    .all();
  if (!(results || []).length) return { skipped: true, reason: "no_data" };

  const lines = buildDigestLines(results);
  const ok = await send(env, cfg, `📡 开源雷达日报 ${bj.date}`, `${lines}\n\n查看全部：https://star-radar.zal-pc-remote.workers.dev`);
  if (ok) await setSetting(env, dayKey, "1");
  return { skipped: false, sent: ok ? 1 : 0 };
}

/* ---------- 测试通知 ---------- */
export async function sendTestNotify(env, urlOverride) {
  const cfg = await getNotifyConfig(env);
  const url = urlOverride || cfg?.url;
  if (!url) {
    const e = new Error("未配置 Webhook URL");
    e.code = "no_url";
    throw e;
  }
  const t0 = Date.now();
  try {
    await sendWebhook(url, { title: "✅ 开源雷达通知测试", content: "如果你收到这条消息，说明通知通道配置成功。" });
    return { ok: true, ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, msg: String(e.message || e).slice(0, 150) };
  }
}
