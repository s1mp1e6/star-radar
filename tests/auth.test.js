import { test } from "node:test";
import assert from "node:assert";
import {
  isAuthed,
  authBlockDecision,
  AUTH_WINDOW_MS,
  AUTH_MAX_FAILS,
} from "../src/lib/auth.js";

test("Token 匹配通过", () => {
  assert.equal(isAuthed(req("secret"), env("secret")), true);
});

test("Token 不匹配拒绝", () => {
  assert.equal(isAuthed(req("wrong"), env("secret")), false);
});

test("缺 Token 拒绝", () => {
  assert.equal(isAuthed(new Request("http://x"), env("secret")), false);
});

/* ---------- 失败限流（W4）纯函数测试 ---------- */

test("限流窗口：无记录不拦截", () => {
  const d = authBlockDecision(null, 1_000_000);
  assert.equal(d.blocked, false);
  assert.equal(d.rec.fails, 0);
});

test("限流窗口：超过窗口自动重置", () => {
  const { rec } = authBlockDecision(null, 1_000_000);
  rec.fails = 9;
  const d = authBlockDecision(rec, 1_000_000 + AUTH_WINDOW_MS + 1);
  assert.equal(d.blocked, false);
  assert.equal(d.rec.fails, 0);
});

test(`限流窗口：满 ${AUTH_MAX_FAILS} 次失败被拦截`, () => {
  const { rec } = authBlockDecision(null, 1_000_000);
  rec.fails = AUTH_MAX_FAILS;
  const d = authBlockDecision(rec, 1_000_000 + 5000);
  assert.equal(d.blocked, true);
});

test("限流窗口：未满阈值不拦截", () => {
  const { rec } = authBlockDecision(null, 1_000_000);
  rec.fails = AUTH_MAX_FAILS - 1;
  assert.equal(authBlockDecision(rec, 1_000_000 + 5000).blocked, false);
});

/* requireToken 需要 D1（env.DB），集成验证在 scripts/integration.mjs 中覆盖 */

const env = (token) => ({ ADMIN_TOKEN: token });
const req = (token) => new Request("http://x", { headers: { "X-Admin-Token": token } });
