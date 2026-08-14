/* 收藏页：跨设备收藏 + 追踪视图（星标曲线 / 涨跌 / 新 release，M5） */
import { api, apiGet, toast, hintAuth, notifyChanged, esc, fmtFull, timeAgo, langColor, gradient, sparkPath, statusCard } from "../app.js";

const listBox = document.getElementById("listBox");
const statusBox = document.getElementById("statusBox");

function deltaText(history, current) {
  if (!history || history.length < 2) return null;
  const first = history[0].stars;
  const diff = current - first;
  if (diff === 0) return '<span class="badge gray">持平</span>';
  const cls = diff > 0 ? "green" : "gray";
  const arrow = diff > 0 ? "↑" : "↓";
  return `<span class="badge ${cls}">${arrow} ${fmtFull(Math.abs(diff))} 星（自收藏）</span>`;
}

function sparkline(history) {
  if (!history || history.length < 2) return "";
  const path = sparkPath(history.map((h) => h.stars), 120, 36);
  return `<svg viewBox="0 0 120 36" style="width:120px;height:36px;flex-shrink:0">
    <path d="${path}" fill="none" stroke="var(--accent-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    <circle cx="120" cy="${(() => {
      const min = Math.min(...history.map((h) => h.stars));
      const max = Math.max(...history.map((h) => h.stars));
      const span = max - min || 1;
      return (2 + 32 * (1 - (history[history.length - 1].stars - min) / span)).toFixed(1);
    })()}" r="2.5" fill="var(--accent-2)"></circle>
  </svg>`;
}

function releaseBadge(snapshot) {
  const r = snapshot?.latest_release;
  if (!r) return "";
  return `<span class="badge blue" title="最新 release：${esc(r.name || r.tag)}（${timeAgo(r.published_at)}）">🔔 ${esc(r.tag)}</span>`;
}

function render(favs) {
  statusBox.innerHTML = "";
  document.getElementById("count").textContent = favs.length;
  if (!favs.length) {
    listBox.innerHTML = "";
    statusBox.innerHTML = `
      <div class="status-card">
        <div class="big">🗂️</div><h3>还没有收藏</h3>
        <p>在日报里点 ☆ 收藏后，这里会每天追踪它们的星标变化与新 release</p>
        <a class="btn btn-primary" href="index.html">去日报逛逛</a>
      </div>`;
    return;
  }
  listBox.innerHTML = favs
    .map((f) => {
      const s = f.snapshot || {};
      const current = s.stargazers_count || 0;
      return `
    <div class="list-item" style="align-items:flex-start">
      <div style="width:46px;height:46px;border-radius:10px;flex-shrink:0;background:${gradient(f.repo)}"></div>
      <div class="main">
        <div class="repo"><a href="${esc(s.url || `https://github.com/${f.repo}`)}" target="_blank" rel="noopener">${esc(f.repo)}</a></div>
        <div class="desc">${esc(s.description || "暂无描述")}</div>
        <div class="meta" style="margin-top:6px;align-items:center">
          <span title="最新星标">★ ${fmtFull(current)}</span>
          ${deltaText(f.history, current) || ""}
          ${releaseBadge(s)}
          ${s.language ? `<span><i class="dot" style="background:${langColor(s.language)}"></i>${esc(s.language)}</span>` : ""}
          <span>收藏于 ${timeAgo(f.saved_at)}</span>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        ${sparkline(f.history)}
        <button class="btn fav saved" data-remove="${esc(f.repo)}" style="padding:5px 12px">★ 移除</button>
      </div>
    </div>`;
    })
    .join("");

  listBox.querySelectorAll("[data-remove]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const repo = btn.dataset.remove;
      if (!confirm(`确定取消收藏 ${repo} 吗？`)) return;
      try {
        await api(`/favs?repo=${encodeURIComponent(repo)}`, { method: "DELETE" });
        toast("已取消收藏");
        notifyChanged();
        await load();
      } catch (e) {
        if (!hintAuth(e)) toast(`操作失败: ${e.message}`);
      }
    })
  );
}

async function load() {
  // 加载态：列表骨架
  document.getElementById("listCard").style.display = "";
  listBox.innerHTML = `${'<div class="skel-row"></div>'.repeat(4)}`;
  try {
    render(await apiGet("/favs?history=1"));
  } catch (e) {
    listBox.innerHTML = "";
    statusBox.innerHTML = statusCard("⚠️", "加载失败", e.message, '<button class="btn btn-primary" onclick="location.reload()">重试</button>');
  }
}

document.getElementById("syncBtn").addEventListener("click", async () => {
  const btn = document.getElementById("syncBtn");
  btn.disabled = true;
  try {
    const res = await api("/admin/trigger", { method: "POST", body: { task: "tracker" } });
    toast(`追踪同步完成：${res.result.ok} 个仓库已更新`, "success");
    notifyChanged();
    await load();
  } catch (e) {
    if (!hintAuth(e)) toast(`同步失败: ${e.message}`);
  } finally {
    btn.disabled = false;
  }
});

document.addEventListener("sr-data-changed", () => load());
load();
