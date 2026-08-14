import { test } from "node:test";
import assert from "node:assert";
import { fmtNum, fmtFull, gradient, esc, timeAgo } from "../public/assets/app.js";

test("fmtNum 千分位缩写", () => {
  assert.equal(fmtNum(0), "0");
  assert.equal(fmtNum(999), "999");
  assert.equal(fmtNum(1200), "1.2k");
  assert.equal(fmtNum(2_000_000), "2.0m");
});

test("fmtFull 完整数字", () => {
  assert.equal(fmtFull(86420), "86,420");
});

test("esc 转义 HTML 注入", () => {
  assert.equal(esc('<script>alert("x")</script>'), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
});

test("gradient 同名输入稳定输出（封面确定性）", () => {
  assert.equal(gradient("org/repo"), gradient("org/repo"));
  assert.notEqual(gradient("a/b"), gradient("c/d"));
});

test("timeAgo 基本形态", () => {
  assert.equal(timeAgo(new Date().toISOString()), "刚刚");
  assert.equal(timeAgo(""), "");
  assert.match(timeAgo(new Date(Date.now() - 3 * 864e5).toISOString()), /天前/);
});
