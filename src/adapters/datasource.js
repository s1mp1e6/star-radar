/* 数据源适配器：官方 Search API 新星榜（ADR-0002）+ 活跃榜备用
 * 原则：JSON 解析（CPU 预算）、重试退避、UA 轮换、数据驱动关键词
 *
 * ⚠️ GitHub Search 硬限制：单查询最多 5 个 AND/OR/NOT 操作符（实测 422 验证）。
 * 因此查询层只放 4 个高价值 NOT（留 1 个余量），全量关键词在 post-filter 层过滤。 */
export const QUERY_EXCLUDE = ["量化", "回测", "股票", "A股"];
export const ALL_EXCLUDE = [
  "量化", "回测", "股票", "A股", "基金", "债券", "期货", "期权",
  "数字货币", "加密货币", "挖矿", "做市", "定投", "打板", "游资",
  "龙虎榜", "DeFi", "NFT", "链游", "币", "quant", "trading bot",
  "crypto trading", "stock",
];

export const MAX_QUERY_OPERATORS = 5; // GitHub Search 硬限制（防回归，单测有守卫）

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) Firefox/127.0",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dateStr = (daysAgo) => new Date(Date.now() - daysAgo * 864e5).toISOString().slice(0, 10);

export function buildSearchQuery(createdAfter, keywords = QUERY_EXCLUDE) {
  const not = keywords.map((k) => `NOT ${k}`).join(" ");
  return `created:>${createdAfter} archived:false ${not}`;
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ASCII 关键词用单词边界匹配（quant 不误杀 quantum），中文用包含匹配 */
function containsKeyword(text, kw) {
  const asciiOnly = /^[\x00-\x7F]+$/.test(kw);
  if (asciiOnly) return new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(text);
  return text.includes(kw);
}

export function filterExcluded(items, keywords = ALL_EXCLUDE) {
  return items.filter((it) => {
    const text = `${it.full_name || ""} ${it.description || ""}`.toLowerCase();
    return !keywords.some((k) => containsKeyword(text, k));
  });
}

export function mapItem(raw, rank) {
  return {
    rank,
    repo: raw.full_name,
    description: raw.description || "",
    language: raw.language || "",
    stars_total: raw.stargazers_count || 0,
    url: raw.html_url || `https://github.com/${raw.full_name}`,
  };
}

export async function searchRepos(query, { perPage = 30, retries = 3, token = null } = {}) {
  const params = new URLSearchParams({ q: query, sort: "stars", order: "desc", per_page: String(perPage) });
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENTS[attempt % USER_AGENTS.length],
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`https://api.github.com/search/repositories?${params}`, { headers });
      if (res.status === 403) throw new Error("rate_limited(403)");
      if (res.status >= 400 && res.status < 500) throw new Error(`http_${res.status}`);
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = await res.json();
      return data.items || [];
    } catch (e) {
      lastErr = e;
      // 只重试网络错误与 5xx；403/4xx 是确定性失败，重试只会加剧配额消耗（旧方案 #14 教训）
      const retriable = !String(e.message).startsWith("http_") && e.message !== "rate_limited(403)";
      if (attempt < retries && retriable) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastErr;
}

/* 主数据源：新星榜（created 窗口 1→2→3 天扩展），失败切活跃榜备用 */
export class SearchApiSource {
  constructor(env) {
    this.token = env?.GITHUB_TOKEN || null;
  }

  async fetchTopRepos({ limit = 25 } = {}) {
    let lastItems = [];
    let lastErr = null;
    for (const days of [1, 2, 3]) {
      try {
        const q = buildSearchQuery(dateStr(days));
        // 缓冲 +20：post-filter 会删掉部分结果，多拉保证过滤后仍够 limit
        const raw = await searchRepos(q, { perPage: Math.min(limit + 20, 100), token: this.token });
        lastItems = filterExcluded(raw).map((r, i) => mapItem(r, i + 1)).slice(0, limit);
        if (lastItems.length >= limit) return lastItems;
      } catch (e) {
        lastErr = e;
        break; // 查询层确定性失败（限流/语法），不扩窗口重试
      }
    }
    if (lastItems.length > 0) return lastItems;

    // 主源失败且无结果 → 备用：活跃榜（近 3 天有 push 的高星项目）
    // 注意：限流类失败不切备用（备用同样会 403，白耗配额）
    if (lastErr && String(lastErr.message).match(/rate_limited|^http_4/)) throw lastErr;
    const fallbackQ = `pushed:>${dateStr(3)} stars:>1000 archived:false`;
    const raw = await searchRepos(fallbackQ, { perPage: 30, token: this.token });
    return filterExcluded(raw).map((r, i) => mapItem(r, i + 1)).slice(0, limit);
  }
}
