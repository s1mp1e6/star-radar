import { test } from "node:test";
import assert from "node:assert";
import { computePortfolio, topGainers } from "../src/routes/stats.js";

test("computePortfolio：总星标与语言分布", () => {
  const p = computePortfolio([
    { repo: "a/b", s: { stargazers_count: 100, language: "Go" } },
    { repo: "c/d", s: { stargazers_count: 50, language: "Go" } },
    { repo: "e/f", s: { stargazers_count: 30, language: "Rust" } },
    { repo: "g/h", s: null },
  ]);
  assert.equal(p.total, 180);
  assert.deepEqual(p.langs, [
    { name: "Go", count: 2 },
    { name: "Rust", count: 1 },
  ]);
});

test("computePortfolio：空收藏", () => {
  const p = computePortfolio([]);
  assert.equal(p.total, 0);
  assert.deepEqual(p.langs, []);
});

test("topGainers：按净增排序且过滤非正增长", () => {
  const g = topGainers([
    { repo: "a/b", first_stars: 10, last_stars: 20 },
    { repo: "c/d", first_stars: 10, last_stars: 100 },
    { repo: "e/f", first_stars: 10, last_stars: 10 },
    { repo: "g/h", first_stars: 100, last_stars: 50 },
  ]);
  assert.deepEqual(
    g.map((x) => x.repo),
    ["c/d", "a/b"]
  );
});

test("topGainers：空输入返回空", () => {
  assert.deepEqual(topGainers([]), []);
});
