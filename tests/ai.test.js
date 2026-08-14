import { test } from "node:test";
import assert from "node:assert";
import {
  recordFail,
  isCooled,
  decideStatus,
  buildPrompt,
  PERM_FAIL,
  COOLING_MS,
} from "../src/services/ai.js";

test("recordFail：2 次失败进入冷却，冷却期满解禁", () => {
  let map = {};
  const t0 = 1_000_000;
  map = recordFail(map, "p1", t0);
  assert.equal(isCooled(map, "p1", t0), false, "第 1 次失败不冷却");
  map = recordFail(map, "p1", t0 + 30_000);
  assert.equal(isCooled(map, "p1", t0 + 30_000), true, "1 分钟内第 2 次失败进入冷却");
  assert.equal(isCooled(map, "p1", t0 + 30_000 + COOLING_MS - 1), true);
  assert.equal(isCooled(map, "p1", t0 + 30_000 + COOLING_MS + 1), false, "冷却期满解禁");
});

test("recordFail 不影响其他供应商", () => {
  let map = {};
  map = recordFail(map, "p1", 1);
  map = recordFail(map, "p1", 2);
  map = recordFail(map, "p2", 3);
  assert.equal(isCooled(map, "p2", 3), false);
});

test("decideStatus：10 次失败转 permanent（B1）", () => {
  assert.equal(decideStatus(0), "error");
  assert.equal(decideStatus(9), "error");
  assert.equal(decideStatus(PERM_FAIL), "failed_perm");
  assert.equal(decideStatus(11), "failed_perm");
});

test("buildPrompt 包含仓库名与 6 个字段名", () => {
  const p = buildPrompt({ repo: "org/repo", description: "d", language: "Go", stars_total: 123 });
  assert.ok(p.includes("org/repo"));
  for (const f of ["intro", "features", "recommend", "scenarios", "getting_started", "pros_cons"]) {
    assert.ok(p.includes(`"${f}"`), `缺少字段 ${f}`);
  }
});
