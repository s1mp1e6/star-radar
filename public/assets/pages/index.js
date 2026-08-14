/* 首页：hero 统计总览 + 日期卡片网格 + 新手引导 */
import { api, apiGet, toast, hintAuth, notifyChanged, gradient, esc } from "../app.js";

const grid = document.getElementById("grid");
const skelBox = document.getElementById("skelBox");
const statusBox = document.getElementById("statusBox");

const weekday = (date) => {
  const d = new Date(`${date}T00:00:00+08:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("zh-CN", { weekday: "long" });
};

function fillStats(dates) {
  document.getElementById("statDays").textContent = dates.length;
  document.getElementById("statProjects").textContent = dates.reduce((s, d) => s + d.project_count, 0);
  apiGet("/favs")
    .then((favs) => (document.getElementById("statFavs").textContent = favs.length))
    .catch(() => (document.getElementById("statFavs").textContent = "–"));
}

function render(dates) {
  skelBox.innerHTML = "";
  statusBox.innerHTML = "";
  fillStats(dates);
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
      <p>抓取任务每天北京时间 05:00 自动运行，第一次使用可先手动抓一批</p>
      <div class="steps">
        <div class="step"><span class="n">1</span><span>到 <a href="settings.html">设置页</a> 粘贴管理员令牌（在项目目录 <code>admin-token.txt</code>）</span></div>
        <div class="step"><span class="n">2</span><span>回来点下方按钮，立即抓取今天的 25 个新星项目</span></div>
        <div class="step"><span class="n">3</span><span>（可选）在设置页配置 AI 供应商，给每个项目生成六维深度详解</span></div>
      </div>
      <button class="btn btn-primary" id="triggerBtn" style="margin-top:14px">⚡ 立即抓取</button>
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
