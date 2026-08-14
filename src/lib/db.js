/* D1 封装：cron_runs 审计（PLAYBOOK 故障检测依赖） */
export async function insertCronRun(env, taskType, bj) {
  const res = await env.DB.prepare(
    "INSERT INTO cron_runs (task_type, date, run_hour, status) VALUES (?, ?, ?, 'running')"
  )
    .bind(taskType, bj.date, String(bj.hour))
    .run();
  return res.meta.last_row_id;
}

export async function finishCronRun(env, id, fields) {
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(id);
  await env.DB.prepare(
    `UPDATE cron_runs SET ${sets.join(", ")}, ended_at = datetime('now') WHERE id = ?`
  )
    .bind(...vals)
    .run();
}

export async function hasCompletedRun(env, taskType, date) {
  const { results } = await env.DB.prepare(
    "SELECT id FROM cron_runs WHERE task_type = ? AND date = ? AND status = 'done' LIMIT 1"
  )
    .bind(taskType, date)
    .all();
  return results.length > 0;
}

/* settings 表读写（供应商冷却状态、手动触发窗口等） */
export async function getSetting(env, key) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
  return row?.value ?? null;
}

export async function setSetting(env, key, value) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(key, value)
    .run();
}
