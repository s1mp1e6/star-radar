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

/* ---------- 通知推送（W5） ---------- */
async function loadNotify() {
  try {
    const d = await api("/settings/notify");
    document.getElementById("notifyEnabled").checked = d.enabled;
    document.getElementById("notifyUrlStatus").textContent = d.url_configured
      ? `✅ 已配置（…${d.url_suffix}，不回显完整地址）`
      : "⚠️ 未配置 Webhook URL";
    document.getElementById("evRelease").checked = d.events.includes("release");
    document.getElementById("evSpike").checked = d.events.includes("star_spike");
    document.getElementById("evDaily").checked = d.events.includes("daily");
    document.getElementById("spikeThreshold").value = d.star_spike_threshold;
    if (d.last_error) document.getElementById("notifyError").textContent = `上次通知失败：${d.last_error}`;
  } catch {
    document.getElementById("notifyUrlStatus").textContent = "状态加载失败";
  }
}

document.getElementById("saveNotifyBtn").addEventListener("click", async () => {
  try {
    await api("/settings/notify", {
      method: "POST",
      body: {
        enabled: document.getElementById("notifyEnabled").checked,
        url: document.getElementById("notifyUrl").value,
        events: [
          ...(document.getElementById("evRelease").checked ? ["release"] : []),
          ...(document.getElementById("evSpike").checked ? ["star_spike"] : []),
          ...(document.getElementById("evDaily").checked ? ["daily"] : []),
        ],
        star_spike_threshold: Number(document.getElementById("spikeThreshold").value) || 500,
      },
    });
    document.getElementById("notifySaveStatus").textContent = `✅ 已保存 ${new Date().toLocaleTimeString("zh-CN")}`;
    document.getElementById("notifyUrl").value = "";
    toast("通知设置已保存", "success");
    loadNotify();
  } catch (e) {
    document.getElementById("notifySaveStatus").textContent = "❌ 未保存";
    if (!hintAuth(e)) toast(`保存失败: ${e.message}`);
  }
});

document.getElementById("testNotifyBtn").addEventListener("click", async () => {
  const url = document.getElementById("notifyUrl").value.trim();
  try {
    const r = await api("/settings/notify/test", { method: "POST", body: url ? { url } : {} });
    toast(`测试消息已送达（${r.ms}ms），请查收`, "success");
  } catch (e) {
    if (!hintAuth(e)) toast(`测试失败: ${e.message}`);
  }
});

loadNotify();
async function renderHealth() {
  const el = document.getElementById("healthChip");
  if (!el) return;
  try {
    const d = await api("/health");
    el.innerHTML = d.degraded
      ? '<span class="badge gray">⚠️ 服务降级（最近抓取异常）</span>'
      : '<span class="badge green">✅ 服务健康</span>';
  } catch {
    el.innerHTML = '<span class="badge gray">健康检查失败</span>';
  }
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
renderHealth();

/* 令牌已存在时自动加载系统状态（省一次点击） */
if (getToken()) {
  api("/debug")
    .then(renderStatus)
    .catch(() => {});
}
