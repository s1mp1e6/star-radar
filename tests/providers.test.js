import { test } from "node:test";
import assert from "node:assert";
import {
  extractJson,
  validateDetail,
  DETAIL_FIELDS,
  PRESETS,
} from "../src/adapters/providers.js";

const GOOD = {
  intro: "是什么",
  features: "特性",
  recommend: "推荐",
  scenarios: "场景",
  getting_started: "上手",
  pros_cons: "优缺点",
};

test("extractJson 解析裸 JSON", () => {
  assert.deepEqual(extractJson(JSON.stringify(GOOD)), GOOD);
});

test("extractJson 剥离 markdown 围栏", () => {
  const fenced = '```json\n' + JSON.stringify(GOOD) + "\n```";
  assert.deepEqual(extractJson(fenced), GOOD);
});

test("extractJson 从混合文本中提取", () => {
  const messy = '好的，结果如下：\n' + JSON.stringify(GOOD) + '\n希望有帮助';
  assert.deepEqual(extractJson(messy), GOOD);
});

test("extractJson 非法输入抛错", () => {
  assert.throws(() => extractJson("这不是 JSON"), /不是合法 JSON/);
});

test("validateDetail 接受合法对象并修剪", () => {
  const out = validateDetail({ ...GOOD, features: "  特性  " });
  assert.equal(out.features, "特性");
});

test("validateDetail 拒绝缺字段/类型错误", () => {
  const missing = { ...GOOD };
  delete missing.pros_cons;
  assert.throws(() => validateDetail(missing), /pros_cons/);
  assert.throws(() => validateDetail({ ...GOOD, intro: 42 }), /intro/);
  assert.throws(() => validateDetail({ ...GOOD, scenarios: "  " }), /scenarios/);
  assert.throws(() => validateDetail(null), /对象/);
});

test("DETAIL_FIELDS 为 6 维度", () => {
  assert.equal(DETAIL_FIELDS.length, 6);
});

test("预设供应商完整性：slug 唯一、字段齐全、type 合法", () => {
  const slugs = PRESETS.map((p) => p.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const p of PRESETS) {
    assert.ok(p.name && p.slug && p.model !== undefined && p.base_url !== undefined);
    assert.ok(["openai-compatible", "gemini-native"].includes(p.type), `${p.slug} type 非法`);
  }
});
