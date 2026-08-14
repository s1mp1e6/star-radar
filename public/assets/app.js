/* =====================================================
 * 开源雷达 · 共享前端模块（ES Module，零依赖）
 * API 客户端（Token + 30s 缓存 + 事件总线）、主题、Toast、工具函数
 * 注意：本文件可在 Node 中导入做单测，DOM/localStorage 访问均有守卫
 * ===================================================== */

/* ---------------- 工具（纯函数，可单测） ---------------- */
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const fmtNum = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1) + "m" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(n ?? 0);

export const fmtFull = (n) => (n ?? 0).toLocaleString("zh-CN");

export function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toISOString().slice(0, 10);
}

const GRADS = [
  ["#7c5cff", "#22d3ee"], ["#f472b6", "#fb923c"], ["#34d399", "#22d3ee"],
  ["#a78bfa", "#f472b6"], ["#fbbf24", "#f87171"], ["#60a5fa", "#34d399"],
  ["#e879f9", "#60a5fa"], ["#f97316", "#facc15"],
];
export function gradient(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  const [a, b] = GRADS[h % GRADS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
}

const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Python: "#3572A5", Go: "#00ADD8",
  Rust: "#dea584", Java: "#b07219", "C++": "#f34b7d", C: "#555555", "C#": "#178600",
  Vue: "#41b883", HTML: "#e34c26", CSS: "#563d7c", Shell: "#89e051", Ruby: "#701516",
  PHP: "#4F5D95", Swift: "#F05138", Kotlin: "#A97BFF", Dart: "#00B4AB", Zig: "#ec915c",
};
export const langColor = (l) => LANG_COLORS[l] || "#8b98ad";

/* 星标曲线 SVG 路径（纯函数，可单测）：输入数值序列，输出归一化 path */
export function sparkPath(values, w = 120, h = 36, pad = 2) {
  if (!values || values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i) => pad + ((w - pad * 2) * i) / (values.length - 1);
  const y = (v) => pad + (h - pad * 2) * (1 - (v - min) / span);
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
}

/* ---------------- Toast ---------------- */
export function toast(msg, type) {
  if (typeof document === "undefined") return;
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = "toast" + (type === "success" ? " success" : "");
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s";
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

/* ---------------- 主题 ---------------- */
export function applyTheme(t) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = t;
  localStorage.setItem("sr-theme", t);
  const btn = document.getElementById("themeBtn");
  if (btn) btn.textContent = t === "dark" ? "☀️" : "🌙";
}
function initTheme() {
  applyTheme(localStorage.getItem("sr-theme") || "dark");
  document.getElementById("themeBtn")?.addEventListener("click", () =>
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark")
  );
}

/* ---------------- Token ---------------- */
export const getToken = () => (typeof localStorage !== "undefined" ? localStorage.getItem("sr-admin-token") || "" : "");
export const setToken = (t) => localStorage.setItem("sr-admin-token", t);

/* ---------------- API 客户端 ---------------- */
export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (method !== "GET") {
    headers["X-Admin-Token"] = getToken();
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch("/api/v1" + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!data || !data.ok) {
    const err = new Error(data?.error?.msg || `HTTP ${res.status}`);
    err.code = data?.error?.code;
    err.status = res.status;
    throw err;
  }
  return data.data;
}

/* 30s 本地缓存（旧方案 #16 落地：先给旧数据，后台静默刷新） */
const CACHE_PREFIX = "sr-cache:";
function readCache(key) {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_PREFIX + key));
    return v && Date.now() - v.t < 30000 ? v : null;
  } catch {
    return null;
  }
}
function writeCache(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), d: data }));
  } catch {
    /* 忽略配额异常 */
  }
}

export async function apiGet(path, { cache = true } = {}) {
  if (cache && typeof localStorage !== "undefined") {
    const hit = readCache(path);
    if (hit) {
      api(path).then((d) => writeCache(path, d)).catch(() => {});
      return hit.d;
    }
  }
  const d = await api(path);
  if (typeof localStorage !== "undefined") writeCache(path, d);
  return d;
}

export function invalidateCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* 忽略 */
  }
}

/* 写操作成功后广播（旧方案 #17 落地：跨页面/同页面数据同步） */
export function notifyChanged() {
  invalidateCache();
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("sr-data-changed"));
}

/* 401 统一提示 */
export function hintAuth(e) {
  if (e.status === 401 || e.code === "unauthorized" || e.code === "admin_token_missing") {
    toast("需要管理员令牌：请先到「设置」页填写", "error");
    return true;
  }
  return false;
}

/* ---------------- 初始化 ---------------- */
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initTheme);
  else initTheme();
}
