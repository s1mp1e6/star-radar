/* 设置页 · AI 供应商管理器（M4）：预设添加 / 排序 / 测试 / 拉模型 / 脱敏保存 */
import { api, apiGet, toast, hintAuth, esc } from "../app.js";

const box = document.getElementById("providersBox");
const presetSel = document.getElementById("presetSel");
const modelModal = document.getElementById("modelModal");
let providers = [];
let modelTarget = -1; // 正在选模型的供应商下标

const MASK = "***masked***";

/* ---------- 渲染 ---------- */
function cardHTML(p, i) {
  return `
  <div class="provider-card" data-idx="${i}">
    <div class="prow">
      <input class="input" data-f="name" placeholder="显示名称" value="${esc(p.name)}" style="max-width:220px">
      <select class="select" data-f="type" style="max-width:200px">
        <option value="openai-compatible" ${p.type === "openai-compatible" ? "selected" : ""}>openai-compatible</option>
        <option value="gemini-native" ${p.type === "gemini-native" ? "selected" : ""}>gemini-native</option>
      </select>
    </div>
    <div class="prow">
      <input class="input" data-f="base_url" placeholder="base_url（如 https://api.deepseek.com/v1）" value="${esc(p.base_url)}">
      <input class="input" data-f="model" placeholder="model（如 deepseek-chat）" value="${esc(p.model)}">
    </div>
    <div class="prow">
      <input class="input" data-f="api_key" type="password" placeholder="${p.has_key ? "🔒 输入新 key 以更换" : "api_key（必填）"}" value="" style="flex:2">
      ${p.has_key ? '<span class="key-status">✅ 已保存（只显示状态，不回显内容）</span>' : ""}
      <input class="input" data-f="tag" placeholder="标签（免费/主力）" value="${esc(p.tag)}" style="max-width:130px">
    </div>
    <div class="prow">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--muted)">
        <input type="checkbox" data-f="enabled" ${p.enabled ? "checked" : ""}>启用（参与 failover）
      </label>
      <span style="flex:1"></span>
      <button class="btn ghost" data-act="up" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="btn ghost" data-act="down" ${i === providers.length - 1 ? "disabled" : ""}>↓</button>
      <button class="btn ghost" data-act="test">测试</button>
      <button class="btn ghost" data-act="models">获取模型</button>
      ${p.has_key ? '<button class="btn ghost" data-act="clearKey" style="color:var(--red)">清Key</button>' : ""}
      <button class="btn ghost" data-act="del" style="color:var(--red)">删除</button>
    </div>
  </div>`;
}

function render() {
  if (!providers.length) {
    box.innerHTML = '<div class="hint">还没有供应商。从上方下拉选预设（Gemini 原生 / DeepSeek / 智谱 / OpenRouter…）点「＋ 添加」。</div>';
    return;
  }
  box.innerHTML = providers.map(cardHTML).join("");
}

function readCard(i) {
  const p = { ...providers[i], sort: i };
  const card = box.querySelector(`.provider-card[data-idx="${i}"]`);
  if (!card) return p;
  card.querySelectorAll("[data-f]").forEach((inp) => {
    const f = inp.dataset.f;
    if (f === "enabled") p.enabled = inp.checked ? 1 : 0;
    else p[f] = inp.value;
  });
  return p;
}

/* ---------- 动作 ---------- */
function bindActions() {
  box.querySelectorAll(".provider-card").forEach((card) => {
    const i = Number(card.dataset.idx);
    card.querySelectorAll("[data-act]").forEach((btn) =>
      btn.addEventListener("click", () => act(btn.dataset.act, i))
    );
  });
}

async function act(action, i) {
  const p = readCard(i);
  if (action === "up" && i > 0) {
    [providers[i - 1], providers[i]] = [providers[i], providers[i - 1]];
    render();
    bindActions();
  }
  if (action === "down" && i < providers.length - 1) {
    [providers[i + 1], providers[i]] = [providers[i], providers[i + 1]];
    render();
    bindActions();
  }
  if (action === "del") {
    if (confirm(`删除供应商「${p.name}」？`)) {
      providers.splice(i, 1);
      render();
      bindActions();
    }
  }
  if (action === "clearKey") {
    if (confirm(`清空「${p.name}」的已保存 key？`)) {
      p._clear_api_key = true;
      p.has_key = false;
      p.api_key = "";
      render();
      bindActions();
    }
  }
  if (action === "test") {
    toast("测试请求已发出…");
    try {
      const body = p.id
        ? { provider_id: p.id }
        : { type: p.type, base_url: p.base_url, model: p.model, api_key: p.api_key };
      const r = await api("/providers/test", { method: "POST", body });
      if (r.ok) toast(`✅ 连通（${r.ms}ms）`, "success");
      else toast(`⚠️ ${r.code}: ${r.msg || ""}`);
    } catch (e) {
      if (!hintAuth(e)) toast(`测试失败: ${e.message}`);
    }
  }
  if (action === "models") {
    toast("拉取模型列表中…");
    try {
      const body = p.id
        ? { provider_id: p.id }
        : { type: p.type, base_url: p.base_url, api_key: p.api_key };
      const r = await api("/providers/models", { method: "POST", body });
      openModelModal(i, r.models || []);
    } catch (e) {
      if (!hintAuth(e)) toast(`拉取失败: ${e.message}`);
    }
  }
}

/* ---------- 模型选择弹窗 ---------- */
function openModelModal(i, models) {
  modelTarget = i;
  const list = document.getElementById("modelList");
  const search = document.getElementById("modelSearch");
  search.value = "";
  const draw = () => {
    const kw = search.value.trim().toLowerCase();
    const filtered = models.filter((m) => !kw || m.toLowerCase().includes(kw));
    list.innerHTML = filtered.length
      ? filtered.map((m) => `<div class="model-item" data-model="${esc(m)}">${esc(m)}</div>`).join("")
      : '<div class="hint">无匹配模型</div>';
    list.querySelectorAll(".model-item").forEach((el) =>
      el.addEventListener("click", () => {
        providers[modelTarget].model = el.dataset.model;
        render();
        bindActions();
        modelModal.hidden = true;
        toast(`已选择模型 ${el.dataset.model}`, "success");
      })
    );
  };
  search.oninput = draw;
  draw();
  modelModal.hidden = false;
}
document.getElementById("modelCancel").addEventListener("click", () => {
  modelModal.hidden = true;
});

/* ---------- 增删保存 ---------- */
document.getElementById("addProviderBtn").addEventListener("click", async () => {
  try {
    const presets = await apiGet("/providers/presets");
    const pre = presets.find((p) => p.slug === presetSel.value) || presets[0];
    providers.push({
      id: null,
      name: pre.name,
      type: pre.type,
      base_url: pre.base_url,
      model: pre.model,
      tag: pre.tag,
      api_key: "",
      enabled: 0,
      has_key: false,
    });
    render();
    bindActions();
  } catch (e) {
    toast(`预设加载失败: ${e.message}`);
  }
});

document.getElementById("saveProvidersBtn").addEventListener("click", async () => {
  const list = providers.map((_, i) => {
    const p = readCard(i);
    const keyInput = box.querySelector(`.provider-card[data-idx="${i}"] [data-f="api_key"]`);
    if (keyInput && keyInput.value.trim()) {
      p.api_key = keyInput.value.trim();
      p._clear_api_key = false;
    } else if (p.has_key && !p._clear_api_key) {
      p.api_key = MASK; // 留空不改旧 key
    }
    return p;
  });
  try {
    await api("/providers", { method: "POST", body: { providers: list } });
    toast(`已保存 ${list.length} 个供应商（key 已加密存云端，界面不回显）`, "success");
    document.getElementById("saveStatus").textContent = `✅ 已保存 ${new Date().toLocaleTimeString("zh-CN")}`;
    await load();
  } catch (e) {
    document.getElementById("saveStatus").textContent = "❌ 未保存";
    // 关键修复：401 时保留卡片与已填内容，明确告知原因
    if (e.status === 401 || e.code === "unauthorized" || e.code === "admin_token_missing") {
      box.insertAdjacentHTML("afterbegin",
        '<div class="warn-banner">⚠️ 保存失败：管理员令牌未保存或无效。请先在上方「🔑 管理员令牌」粘贴 <code>admin-token.txt</code> 里的令牌并点保存，你填的 key 都还在，保存令牌后直接再点「保存全部」即可。</div>');
      return;
    }
    if (!hintAuth(e)) toast(`保存失败: ${e.message}`);
  }
});

/* ---------- 初始化 ---------- */
async function load() {
  box.innerHTML = '<div class="hint">加载中…</div>';
  try {
    providers = (await apiGet("/providers", { cache: false })) || [];
    render();
    bindActions();
  } catch (e) {
    if (e.status === 401 || e.code === "unauthorized") {
      box.innerHTML = '<div class="hint">⚠️ 需要管理员令牌：请先在上方「🔑 管理员令牌」粘贴令牌（在项目目录 admin-token.txt 文件里）并点保存，再回来配置。</div>';
      return;
    }
    box.innerHTML = `<div class="hint">加载失败: ${esc(e.message)}</div>`;
  }
}

(async () => {
  try {
    const presets = await apiGet("/providers/presets");
    presetSel.innerHTML = presets
      .map((p) => `<option value="${p.slug}">${esc(p.name)}${p.tag ? " · " + esc(p.tag) : ""}</option>`)
      .join("");
  } catch {
    presetSel.innerHTML = "<option>预设加载失败</option>";
  }
  await load();
})();

/* 令牌保存后自动刷新（避免用户保存令牌后还要手动刷新页面） */
window.addEventListener("sr-token-saved", () => load());
