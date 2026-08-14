/* AI 供应商适配器（注册表模式，数据驱动，新增协议零侵入）
 * 协议：openai-compatible（/chat/completions）与 gemini-native（generateContent） */
const base = (cfg) => (cfg.base_url || "").replace(/\/+$/, "");

const chat = async (cfg, { prompt, maxTokens }) => {
  const type = PROVIDER_TYPES[cfg.type];
  if (!type) throw new Error(`unknown_provider_type: ${cfg.type}`);
  const res = await type.chat(cfg, { prompt, maxTokens });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`http_${res.status}: ${body.slice(0, 200)}`);
  }
  const text = type.parseChat(await res.text());
  if (!text || !text.trim()) throw new Error("empty_response");
  return text;
};

const PROVIDER_TYPES = {
  "openai-compatible": {
    chat(cfg, { prompt, maxTokens }) {
      return fetch(`${base(cfg)}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.api_key}` },
        body: JSON.stringify({
          model: cfg.model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens ?? 4096,
          temperature: 0.4,
        }),
      });
    },
    parseChat(raw) {
      const d = JSON.parse(raw);
      const t = d.choices?.[0]?.message?.content;
      if (typeof t !== "string") throw new Error("响应缺少 choices[0].message.content");
      return t;
    },
    async models(cfg) {
      const res = await fetch(`${base(cfg)}/models`, { headers: { Authorization: `Bearer ${cfg.api_key}` } });
      if (!res.ok) throw new Error(`models_http_${res.status}`);
      const d = await res.json();
      return (d.data || []).map((m) => m.id);
    },
  },
  "gemini-native": {
    chat(cfg, { prompt, maxTokens }) {
      const u = new URL(`${base(cfg)}/models/${encodeURIComponent(cfg.model)}:generateContent`);
      u.searchParams.set("key", cfg.api_key);
      return fetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens ?? 8192, temperature: 0.4 },
        }),
      });
    },
    parseChat(raw) {
      const d = JSON.parse(raw);
      const t = (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      if (!t) throw new Error("响应缺少 candidates[0].content.parts");
      return t;
    },
    async models(cfg) {
      const u = new URL(`${base(cfg)}/models`);
      u.searchParams.set("key", cfg.api_key);
      const res = await fetch(u);
      if (!res.ok) throw new Error(`models_http_${res.status}`);
      const d = await res.json();
      return (d.models || []).map((m) => m.name.replace(/^models\//, ""));
    },
  },
};

export async function callProvider(cfg, prompt) {
  return chat(cfg, { prompt });
}

/* 1-token 连通性测试，三态结果（旧方案 §5.4） */
function classify(e) {
  const m = String(e.message || e);
  if (/401|403/.test(m)) return "auth";
  if (/404/.test(m)) return "not_found";
  if (/429/.test(m)) return "rate_limited";
  if (e instanceof TypeError) return "network";
  return "other";
}
export async function testProvider(cfg) {
  const t0 = Date.now();
  try {
    const text = await chat(cfg, { prompt: "ping", maxTokens: 5 });
    return { ok: true, ms: Date.now() - t0, echo: text.slice(0, 50) };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, code: classify(e), msg: String(e.message || e).slice(0, 200) };
  }
}

export async function listModels(cfg) {
  const type = PROVIDER_TYPES[cfg.type];
  if (!type) throw new Error(`unknown_provider_type: ${cfg.type}`);
  return type.models(cfg);
}

/* AI 响应 JSON 提取与 6 维度校验（旧方案 #13 落地） */
export const DETAIL_FIELDS = ["intro", "features", "recommend", "scenarios", "getting_started", "pros_cons"];

export function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    /* 尝试剥离 markdown 围栏 */
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* 继续 */
    }
  }
  const bare = text.match(/(\{[\s\S]*\})/);
  if (bare) {
    try {
      return JSON.parse(bare[1]);
    } catch {
      /* 继续 */
    }
  }
  throw new Error("AI 响应不是合法 JSON");
}

export function validateDetail(obj) {
  if (!obj || typeof obj !== "object") throw new Error("详情必须是 JSON 对象");
  const out = {};
  for (const f of DETAIL_FIELDS) {
    if (typeof obj[f] !== "string" || !obj[f].trim()) throw new Error(`缺少字段或非字符串: ${f}`);
    out[f] = obj[f].trim();
  }
  return out;
}

/* 预设供应商（数据驱动，11 家；slug 唯一防匹配错位，旧方案 #18） */
export const PRESETS = [
  { slug: "gemini-native", name: "Gemini（原生直连）", type: "gemini-native", base_url: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.5-flash", tag: "推荐" },
  { slug: "gemini-proxy", name: "Gemini（OpenAI 兼容代理）", type: "openai-compatible", base_url: "", model: "gemini-2.5-flash", tag: "国内开发" },
  { slug: "openai", name: "OpenAI", type: "openai-compatible", base_url: "https://api.openai.com/v1", model: "gpt-4o-mini", tag: "官方" },
  { slug: "deepseek", name: "DeepSeek", type: "openai-compatible", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat", tag: "性价比高" },
  { slug: "stepfun", name: "阶跃星辰 StepFun", type: "openai-compatible", base_url: "https://api.stepfun.com/v1", model: "step-3.7-flash", tag: "多模态强" },
  { slug: "agnes", name: "Agnes AI", type: "openai-compatible", base_url: "https://apihub.agnes-ai.cn/v1", model: "agnes-2.5-flash-alp", tag: "免费" },
  { slug: "zhipu", name: "智谱 Zhipu", type: "openai-compatible", base_url: "https://open.bigmodel.cn/api/paas/v4/", model: "glm-4.7-flash", tag: "永久免费" },
  { slug: "sensenova", name: "商汤 SenseNova", type: "openai-compatible", base_url: "https://api.sensenova.cn/compatible-mode/v2", model: "SenseChat-5", tag: "有免费额度" },
  { slug: "openrouter", name: "OpenRouter", type: "openai-compatible", base_url: "https://openrouter.ai/api/v1", model: "", tag: "聚合平台" },
  { slug: "groq", name: "Groq", type: "openai-compatible", base_url: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile", tag: "速度极快" },
  { slug: "custom", name: "自定义", type: "openai-compatible", base_url: "", model: "", tag: "" },
];
