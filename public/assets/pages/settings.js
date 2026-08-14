/* 设置页：管理员令牌 + GitHub Token + 系统状态（AI 供应商见 settings-providers.js） */
import { api, toast, getToken, setToken, esc, hintAuth } from "../app.js";

const tokenInput = document.getElementById("tokenInput");
tokenInput.value = getToken();

function updateTokenBanner() {
  const banner = document.getElementById("tokenBanner");
  banner.style.display = getToken() ? "none" : "";
}

document.getElementById("saveTokenBtn").addEventListener("click", () => {
  setToken(tokenInput.value.trim());
  toast("令牌已保存到本浏览器", "success");
  updateTokenBanner();
  loadGhStatus();
  // 通知供应商模块刷新（令牌就绪后才能加载/保存配置）
  window.dispatchEvent(new CustomEvent("sr-token-saved"));
});

/* ---------- GitHub Token ---------- */
async function loadGhStatus() {
  const el = document.getElementById("githubTokenStatus");
  try {
    const d = await api("/settings/github-token");
    el.textContent = d.has_token
      ? `✅ 已配置（来源：${d.source === "secret" ? "CF Secret" : "网页设置"}）`
      : "⚠️ 未配置——当前为未认证模式（60 次/小时，共享 IP 可能耗尽配额）";
  } catch {
    el.textContent = "状态加载失败";
  }
}
document.getElementById("saveGhTokenBtn").addEventListener("click", async () => {
  const v = document.getElementById("githubTokenInput").value.trim();
  if (!v) {
    toast("请先粘贴 Token（清空请用「清空」按钮）");
    return;
  }
  try {
    await api("/settings/github-token", { method: "POST", body: { token: v } });
    document.getElementById("githubTokenInput").value = "";
    toast("GitHub Token 已保存", "success");
    loadGhStatus();
  } catch (e) {
    if (!hintAuth(e)) toast(`保存失败: ${e.message}`);
  }
});
document.getElementById("clearGhTokenBtn").addEventListener("click", async () => {
  if (!confirm("确定清空 GitHub Token？清空后回到未认证模式（配额 60 次/小时）。")) return;
  try {
    await api("/settings/github-token", { method: "POST", body: { token: "" } });
    toast("已清空");
    loadGhStatus();
  } catch (e) {
    if (!hintAuth(e)) toast(`操作失败: ${e.message}`);
  }
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

loadGhStatus();
updateTokenBanner();

/* 令牌已存在时自动加载系统状态（省一次点击） */
if (getToken()) {
  api("/debug")
    .then(renderStatus)
    .catch(() => {});
}
