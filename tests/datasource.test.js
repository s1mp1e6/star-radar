import { test } from "node:test";
import assert from "node:assert";
import {
  buildSearchQuery,
  filterExcluded,
  mapItem,
  QUERY_EXCLUDE,
  MAX_QUERY_OPERATORS,
} from "../src/adapters/datasource.js";

test("buildSearchQuery 包含 created 窗口 / archived:false / NOT 排除词", () => {
  const q = buildSearchQuery("2026-08-13");
  assert.ok(q.startsWith("created:>2026-08-13"));
  assert.ok(q.includes("archived:false"));
  for (const kw of QUERY_EXCLUDE) {
    assert.ok(q.includes(`NOT ${kw}`));
  }
});

test("查询层 NOT 操作符数量 < 上限（GitHub 实测 422：最多 5 个，防回归）", () => {
  const q = buildSearchQuery("2026-08-13");
  const count = (q.match(/NOT /g) || []).length;
  assert.ok(count < MAX_QUERY_OPERATORS, `查询层 NOT 数 ${count} 必须小于 ${MAX_QUERY_OPERATORS}`);
});

test("buildSearchQuery 可自定义关键词集", () => {
  assert.equal(buildSearchQuery("2026-08-13", []), "created:>2026-08-13 archived:false ");
});

test("filterExcluded 过滤描述含量化词的项目（中文）", () => {
  const items = [
    { full_name: "a/b", description: "一个 A股 量化回测框架" },
    { full_name: "c/d", description: "轻量级 web 框架" },
    { full_name: "e/f", description: "DeFi protocol" },
    { full_name: "g/h", description: "build system" },
  ];
  assert.deepEqual(filterExcluded(items).map((i) => i.full_name), ["c/d", "g/h"]);
});

test("filterExcluded 大小写不敏感（英文词）", () => {
  const kept = filterExcluded([
    { full_name: "x/y", description: "NFT marketplace" },
    { full_name: "m/n", description: "Quantum simulator" }, // quant 子串不应误杀
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].full_name, "m/n");
});

test("filterExcluded 命中仓库名也算排除", () => {
  const kept = filterExcluded([{ full_name: "org/stock-picker", description: "nice tool" }]);
  assert.equal(kept.length, 0);
});

test("mapItem 形状映射正确", () => {
  const raw = {
    full_name: "org/repo",
    description: "desc",
    language: "Go",
    stargazers_count: 123,
    html_url: "https://github.com/org/repo",
  };
  const item = mapItem(raw, 3);
  assert.deepEqual(item, {
    rank: 3,
    repo: "org/repo",
    description: "desc",
    language: "Go",
    stars_total: 123,
    url: "https://github.com/org/repo",
  });
});
