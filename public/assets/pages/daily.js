/* 日报页：三层 SPA（时段 → 项目列表 → 详情） */
import { api, apiGet, toast, hintAuth, notifyChanged, esc, fmtNum, fmtFull, langColor, gradient } from "../app.js";

const params = new URLSearchParams(location.search);
const date = params.get("date");
const autoRepo = params.get("autorepo"); // 排行榜/收藏跳转：自动展开详情（旧方案 A3 修复落地）

const statusBox = document.getElementById("statusBox");
let hours = [];        // [{ run_hour, items }] 按小时降序
let curHour = null;    // 当前选中时段
let curRepo = null;    // 当前详情 repo
let favSet = new Set();

function showStatus(html) {
  statusBox.innerHTML = html;
}
function clearStatus() {
  statusBox.innerHTML = "";
}

function statusBadge(p) {
  if (p.detail_status === "done") return '<span class="badge green">AI 详解已生成</span>';
  if (p.detail_status === "generating") return '<span class="badge blue">AI 生成中</span>';
  if (p.detail_status === "error" || p.detail_status === "failed_perm") return '<span class="badge gray">AI 生成失败</span>';
  return '<span class="badge yellow">AI 等待生成</span>';
}

/* ---------- 层1：时段 ---------- */
function renderHours() {
  const row = document.getElementById("hourRow");
  row.innerHTML = hours
    .map(
      (h) => `
    <div class="hour-card ${h.run_hour === curHour ? "active" : ""}" data-hour="${esc(h.run_hour)}">
      <div class="h">${esc(h.run_hour)}:00</div>
      <div class="m">${h.items.length} 个项目</div>
    </div>`
    )
    .join("");
  row.querySelectorAll(".hour-card").forEach((el) =>
    el.addEventListener("click", () => {
      curHour = el.dataset.hour;
      renderHours();
      renderList();
    })
  );
}

/* ---------- 层2：列表 ---------- */
function renderList() {
  const card = document.getElementById("listCard");
  const box = document.getElementById("listBox");
  const group = hours.find((h) => h.run_hour === curHour);
  if (!group) {
    card.style.display = "none";
    return;
  }
  card.style.display = "";
  document.getElementById("listTitle").textContent = `${curHour}:00 抓取 · ${group.items.length} 个项目`;
  box.innerHTML = group.items
    .map(
      (p, i) => `
    <div class="list-item" data-repo="${esc(p.repo)}">
      <div class="rank-badge ${i < 3 ? "top" : ""}">${p.rank ?? i + 1}</div>
      <div class="main">
        <div class="repo">${esc(p.repo)}</div>
        <div class="desc">${esc(p.description || "暂无描述")}</div>
        <div class="meta" style="margin-top:4px">
          <span>★ ${fmtNum(p.stars_total)}</span>
          ${p.language ? `<span><i class="dot" style="background:${langColor(p.language)}"></i>${esc(p.language)}</span>` : ""}
          ${statusBadge(p)}
        </div>
      </div>
      <button class="btn fav ${favSet.has(p.repo) ? "saved" : ""}" data-fav="${esc(p.repo)}">${favSet.has(p.repo) ? "★" : "☆"}</button>
    </div>`
    )
    .join("");

  box.querySelectorAll(".list-item").forEach((el) =>
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-fav]")) return;
      openDetail(el.dataset.repo);
    })
  );
  box.querySelectorAll("[data-fav]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFav(btn.dataset.fav, btn);
    })
  );
}

/* ---------- 层3：详情 ---------- */
function openDetail(repo) {
  const group = hours.find((h) => h.run_hour === curHour);
  const p = group?.items.find((i) => i.repo === repo);
  if (!p) return;
  curRepo = p;
  document.getElementById("detailCard").style.display = "";
  document.getElementById("listCard").style.display = "none";
  document.getElementById("dName").textContent = p.repo;
  document.getElementById("dBadge").innerHTML = statusBadge(p);
  document.getElementById("dDesc").textContent = p.description || "暂无描述";
  document.getElementById("dStats").innerHTML =
    stat("★ 星标", fmtFull(p.stars_total)) +
    stat("🗂 语言", p.language || "—") +
    stat("📅 抓取日", p.date) +
    stat("🕒 时段", `${p.run_hour}:00`);
  document.getElementById("dLink").href = p.url;
  const favBtn = document.getElementById("dFav");
  favBtn.classList.toggle("saved", favSet.has(p.repo));
  favBtn.innerHTML = `${favSet.has(p.repo) ? "★" : "☆"} ${favSet.has(p.repo) ? "已收藏" : "收藏"}`;
  favBtn.onclick = () => toggleFav(p.repo, favBtn);
  document.getElementById("dBack").onclick = () => {
    document.getElementById("detailCard").style.display = "none";
    renderList();
  };
  loadAi(p);
}
const stat = (k, v) => `<div class="stat-box"><div class="k">${k}</div><div class="v">${esc(String(v))}</div></div>`;

/* ---------- 收藏 ---------- */
async function toggleFav(repo, btn) {
  const saving = favSet.has(repo);
  try {
    if (saving) {
      await api(`/favs?repo=${encodeURIComponent(repo)}`, { method: "DELETE" });
      favSet.delete(repo);
      toast("已取消收藏");
    } else {
      const group = hours.find((h) => h.run_hour === curHour);
      const p = group?.items.find((i) => i.repo === repo);
      await api("/favs", {
        method: "POST",
        body: { repo, snapshot: p ? { description: p.description, language: p.language, stargazers_count: p.stars_total, url: p.url, saved_from: p.date } : null },
      });
      favSet.add(repo);
      toast("已收藏 ⭐", "success");
    }
    notifyChanged();
    renderList();
    if (curRepo?.repo === repo) {
      const favBtn = document.getElementById("dFav");
      favBtn.classList.toggle("saved", favSet.has(repo));
      favBtn.innerHTML = `${favSet.has(repo) ? "★" : "☆"} ${favSet.has(repo) ? "已收藏" : "收藏"}`;
    }
  } catch (e) {
    if (!hintAuth(e)) toast(`操作失败: ${e.message}`);
  }
}

/* ---------- 加载 ---------- */
async function load() {
  if (!date) {
    showStatus('<div class="status-card"><div class="big">🗓</div><h3>缺少日期参数</h3><p>请从<a href="index.html">日报存档</a>选择一天</p></div>');
    return;
  }
  document.getElementById("crumbDate").textContent = date;
  document.getElementById("pageTitle").textContent = `${date.slice(5).replace("-", "/")} 日报`;
  try {
    const rows = await apiGet(`/projects?date=${encodeURIComponent(date)}`);
    if (!rows.length) {
      showStatus('<div class="status-card"><div class="big">📭</div><h3>这一天没有数据</h3><p>抓取任务每天北京时间 05:00 运行</p><a class="btn btn-primary" href="index.html">返回存档</a></div>');
      return;
    }
    const map = {};
    for (const r of rows) (map[r.run_hour] ||= []).push(r);
    hours = Object.entries(map)
      .map(([run_hour, items]) => ({ run_hour, items }))
      .sort((a, b) => b.run_hour.localeCompare(a.run_hour));
    curHour = hours[0].run_hour;
    document.getElementById("pageSub").textContent = `共 ${rows.length} 个项目 · ${hours.length} 个时段`;
    renderHours();
    renderList();
    if (autoRepo) {
      const g = hours.find((h) => h.items.some((i) => i.repo === autoRepo));
      if (g) {
        curHour = g.run_hour;
        renderHours();
        renderList();
        openDetail(autoRepo);
      }
    }
  } catch (e) {
    showStatus(`<div class="status-card"><div class="big">⚠️</div><h3>加载失败</h3><p>${esc(e.message)}</p></div>`);
  }
}

/* ---------- AI 详解（M4） ---------- */
const AI_STATUS_TEXT = {
  pending: "等待生成",
  generating: "生成中…",
  error: "生成失败，可重试",
  failed_perm: "多次失败（permanent），仅可手动重试",
};

function renderAiDetail(d) {
  const box = document.getElementById("dAi");
  const groups = [
    { id: "overview", label: "概览", html: `<div class="ai-sec"><h4>📖 简介</h4><p>${esc(d.intro)}</p></div><div class="ai-sec"><h4>✨ 核心特性</h4><p>${esc(d.features)}</p></div>` },
    { id: "start", label: "上手", html: `<div class="ai-sec"><h4>🚀 快速上手</h4><p>${esc(d.getting_started)}</p></div>` },
    { id: "compare", label: "优缺点", html: `<div class="ai-sec"><h4>⚖️ 优缺点</h4><p>${esc(d.pros_cons)}</p></div>` },
    { id: "action", label: "行动", html: `<div class="ai-sec"><h4>💡 推荐理由</h4><p>${esc(d.recommend)}</p></div><div class="ai-sec"><h4>🎯 适用场景</h4><p>${esc(d.scenarios)}</p></div>` },
  ];
  box.innerHTML = `
    <div class="range-tabs" id="aiTabs" style="margin-bottom:12px">${groups.map((g, i) => `<button class="range-tab ${i === 0 ? "active" : ""}" data-tab="${g.id}">${g.label}</button>`).join("")}</div>
    ${groups.map((g, i) => `<div data-pane="${g.id}" ${i === 0 ? "" : 'style="display:none"'}>${g.html}</div>`).join("")}
    <div class="hint" style="margin-top:12px">🤖 生成于 ${d.generated_at ? new Date(d.generated_at).toLocaleString("zh-CN") : "—"} · ${esc(d.generated_by || "")}</div>`;
  box.querySelectorAll("#aiTabs .range-tab").forEach((t) =>
    t.addEventListener("click", () => {
      box.querySelectorAll("#aiTabs .range-tab").forEach((x) => x.classList.toggle("active", x === t));
      box.querySelectorAll("[data-pane]").forEach((x) => {
        x.style.display = x.dataset.pane === t.dataset.tab ? "" : "none";
      });
    })
  );
}

function renderAiPending(p) {
  const box = document.getElementById("dAi");
  const statusText = AI_STATUS_TEXT[p.detail_status] || "等待生成";
  box.innerHTML = `
    <div class="hint">🤖 AI 深度详解（6 维度）· <b>${statusText}</b>。生成一次后存库，跨设备可见。</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <select class="select" id="aiProvider" style="max-width:240px"></select>
      <button class="btn btn-primary" id="aiGenBtn">⚡ 立即生成</button>
    </div>`;
  apiGet("/providers")
    .then((list) => {
      const enabled = (list || []).filter((x) => x.enabled);
      const sel = document.getElementById("aiProvider");
      if (!sel) return;
      sel.innerHTML = enabled.length
        ? '<option value="">自动（failover 顺序）</option>' +
          enabled.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}${x.tag ? " · " + esc(x.tag) : ""}</option>`).join("")
        : '<option value="">未配置启用的供应商（去设置页添加）</option>';
    })
    .catch(() => {});
  document.getElementById("aiGenBtn").addEventListener("click", async () => {
    const btn = document.getElementById("aiGenBtn");
    btn.disabled = true;
    btn.textContent = "生成中…";
    try {
      const pid = document.getElementById("aiProvider").value;
      await api(`/projects/${encodeURIComponent(p.repo)}/generate`, {
        method: "POST",
        body: { provider_id: pid || null, date: p.date },
      });
      toast("AI 详解生成成功", "success");
      notifyChanged();
      await loadAi(p, true);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "⚡ 立即生成";
      if (!hintAuth(e)) toast(`生成失败: ${e.message}`);
    }
  });
}

async function loadAi(p, force = false) {
  const box = document.getElementById("dAi");
  try {
    const row = await apiGet(`/projects/detail?repo=${encodeURIComponent(p.repo)}&date=${encodeURIComponent(p.date)}`, { cache: !force });
    if (row.detail && row.detail.intro) renderAiDetail(row.detail);
    else renderAiPending(row);
  } catch (e) {
    box.innerHTML = `<div class="hint">AI 详解加载失败: ${esc(e.message)}</div>`;
  }
}
apiGet("/favs")
  .then((favs) => {
    favSet = new Set(favs.map((f) => f.repo));
    return load();
  })
  .catch(() => load());

document.addEventListener("sr-data-changed", () => {
  apiGet("/favs", { cache: false }).then((favs) => { favSet = new Set(favs.map((f) => f.repo)); }).catch(() => {});
});
