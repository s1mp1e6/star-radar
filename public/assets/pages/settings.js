/* 设置页：管理员令牌 + 系统状态（AI 供应商配置 M4） */
import { api, toast, getToken, setToken, esc, hintAuth } from "../app.js";

const tokenInput = document.getElementById("tokenInput");
tokenInput.value = getToken();

document.getElementById("saveTokenBtn").addEventListener("click", () => {
  setToken(tokenInput.value.trim());
  toast("令牌已保存到本浏览器", "success");
});

const sysStatus = document.getElementById("sysStatus");

function renderStatus(d) {
  sysStatus.innerHTML = `
    <div class="stat-grid" style="margin:0 0 14px">
      <div class="stat-box"><div class="k">项目</div><div class="v">${d.tables.projects}</div></div>
      <div class="stat-box"><div class="k">收藏</div><div class="v">${d.tables.favs}</div></div>
      <div class="stat-box"><div class="k">追踪记录</div><div class="v">${d.tables.star_history}</div></div>
      <div class="stat-box"><div class="k">运行记录</div><div class="v">${d.tables.cron_runs}</div></div>
    </div>
    <div class="card-title" style="font-size:13.5px">最近运行</div>
    ${(d.recent_cron_runs || [])
      .map(
        (r) => `
      <div class="list-item" style="padding:8px 0">
        <span class="badge ${r.status === "done" ? "green" : "gray"}">${esc(r.task_type)}</span>
        <span style="color:var(--muted);font-size:12.5px">${esc(r.date)} ${esc(r.run_hour)}:00 · ok ${r.items_ok} / dup ${r.items_dup} / fail ${r.items_fail}${r.error_msg ? ` · ${esc(r.error_msg)}` : ""}</span>
      </div>`
      )
      .join("") || '<div class="hint">暂无运行记录</div>'}`;
}

document.getElementById("loadStatusBtn").addEventListener("click", async () => {
  try {
    renderStatus(await api("/debug"));
  } catch (e) {
    sysStatus.innerHTML = "";
    if (!hintAuth(e)) toast(`加载失败: ${e.message}`);
  }
});
