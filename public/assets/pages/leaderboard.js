/* 排行榜页：出现频率榜（全部/近 7 天） */
import { apiGet, esc, fmtNum, langColor } from "../app.js";

const lbBox = document.getElementById("lbBox");
const statusBox = document.getElementById("statusBox");
let range = "all";

function render(rows) {
  statusBox.innerHTML = "";
  if (!rows.length) {
    lbBox.innerHTML = "";
    statusBox.innerHTML = `<div class="status-card"><div class="big">📭</div><h3>暂无数据</h3><p>等日报积累几天后，这里会出现出现频率最高的项目</p></div>`;
    return;
  }
  lbBox.innerHTML = rows
    .map(
      (r, i) => `
    <a class="lb-row" href="daily.html?date=${esc(r.last_date)}&autorepo=${esc(r.repo)}" style="color:inherit;display:flex">
      <div class="lb-rank ${i < 3 ? "top" : ""}">#${i + 1}</div>
      <div class="main" style="flex:1;min-width:0">
        <div class="repo" style="font-weight:700">${esc(r.repo)}</div>
        <div class="desc" style="color:var(--muted);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.description || "")}</div>
      </div>
      <div class="meta">
        <span class="badge blue">出现 ${r.appear_days} 天</span>
        <span>★ ${fmtNum(r.best_stars)}</span>
        ${r.language ? `<span><i class="dot" style="background:${langColor(r.language)}"></i>${esc(r.language)}</span>` : ""}
      </div>
    </a>`
    )
    .join("");
}

async function load() {
  try {
    render(await apiGet(`/leaderboard?range=${range}`));
  } catch (e) {
    statusBox.innerHTML = `<div class="status-card"><div class="big">⚠️</div><h3>加载失败</h3><p>${esc(e.message)}</p></div>`;
  }
}

document.getElementById("rangeTabs").querySelectorAll(".range-tab").forEach((tab) =>
  tab.addEventListener("click", () => {
    range = tab.dataset.range;
    document.querySelectorAll(".range-tab").forEach((t) => t.classList.toggle("active", t === tab));
    load();
  })
);

load();
