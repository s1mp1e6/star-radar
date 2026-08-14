/* 首页：日期卡片网格 */
import { api, apiGet, toast, hintAuth, notifyChanged, gradient, esc } from "../app.js";

const grid = document.getElementById("grid");
const skelBox = document.getElementById("skelBox");
const statusBox = document.getElementById("statusBox");

const weekday = (date) => {
  const w = new Date(`${date}T00:00:00+08:00`).toLocaleDateString("zh-CN", { weekday: "long" });
  return Number.isNaN(new Date(`${date}T00:00:00+08:00`).getTime()) ? "" : w;
};

function render(dates) {
  skelBox.innerHTML = "";
  statusBox.innerHTML = "";
  grid.innerHTML = dates
    .map(
      (d) => `
    <a class="date-card" href="daily.html?date=${esc(d.date)}">
      <div class="cover" style="background:${gradient(d.date)}"></div>
      <div class="date-body">
        <div class="date-num">${esc(d.date.slice(5).replace("-", "/"))} <span style="color:var(--muted);font-size:12px;font-weight:600">${weekday(d.date)}</span></div>
        <div class="date-meta">${d.project_count} 个项目 · 最后抓取 ${esc(d.last_hour || "—")} 点</div>
      </div>
    </a>`
    )
    .join("");
}

function renderEmpty() {
  skelBox.innerHTML = "";
  grid.innerHTML = "";
  statusBox.innerHTML = `
    <div class="status-card">
      <div class="big">📡</div>
      <h3>还没有日报数据</h3>
      <p>抓取任务每天北京时间 05:00 自动运行，也可手动触发一次</p>
      <button class="btn btn-primary" id="triggerBtn">⚡ 立即抓取</button>
    </div>`;
  document.getElementById("triggerBtn")?.addEventListener("click", async () => {
    try {
      const res = await api("/admin/trigger", { method: "POST", body: { task: "scrape" } });
      toast(`抓取完成：入库 ${res.result.ok} 条，重复 ${res.result.dup} 条`, "success");
      notifyChanged();
      await load();
    } catch (e) {
      if (!hintAuth(e)) toast(`抓取失败: ${e.message}`);
    }
  });
}

async function load() {
  skelBox.innerHTML = `<div class="date-grid">${'<div class="skel"></div>'.repeat(4)}</div>`;
  try {
    const dates = await apiGet("/dates");
    if (dates.length) render(dates);
    else renderEmpty();
  } catch (e) {
    skelBox.innerHTML = "";
    statusBox.innerHTML = `
      <div class="status-card">
        <div class="big">⚠️</div><h3>加载失败</h3><p>${esc(e.message)}</p>
        <button class="btn btn-primary" onclick="location.reload()">重试</button>
      </div>`;
  }
}

document.addEventListener("sr-data-changed", load);
load();
