import { test } from "node:test";
import assert from "node:assert";
import { beijingParts, manualBeijing } from "../src/lib/time.js";

test("UTC 21:30 → 北京次日 05:30（C7 附录验收用例）", () => {
  const bj = beijingParts(new Date("2026-01-01T21:30:00Z"));
  assert.equal(bj.date, "2026-01-02");
  assert.equal(bj.hour, 5);
});

test("UTC 16:00 → 北京次日 00:00（午夜边界）", () => {
  const bj = beijingParts(new Date("2026-01-01T16:00:00Z"));
  assert.equal(bj.date, "2026-01-02");
  assert.equal(bj.hour, 0);
});

test("UTC 04:00 → 北京同日 12:00", () => {
  const bj = beijingParts(new Date("2026-01-01T04:00:00Z"));
  assert.equal(bj.date, "2026-01-01");
  assert.equal(bj.hour, 12);
});

test("manualBeijing 与 Intl 双路径结果一致", () => {
  const now = new Date("2026-06-15T10:15:00Z");
  const a = manualBeijing(now);
  const b = beijingParts(now);
  assert.equal(a.date, b.date);
  assert.equal(a.hour, b.hour);
});

test("缺省参数使用当前时间且不抛错", () => {
  const bj = beijingParts();
  assert.match(bj.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(bj.hour >= 0 && bj.hour <= 23);
});
