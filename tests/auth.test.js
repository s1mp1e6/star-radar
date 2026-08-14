import { test } from "node:test";
import assert from "node:assert";
import { isAuthed, requireToken } from "../src/lib/auth.js";

const envWith = (token) => ({ ADMIN_TOKEN: token });
const reqWith = (token) => new Request("http://x", { headers: { "X-Admin-Token": token } });

test("Token 匹配通过", () => {
  assert.equal(isAuthed(reqWith("secret"), envWith("secret")), true);
});

test("Token 不匹配拒绝", () => {
  assert.equal(isAuthed(reqWith("wrong"), envWith("secret")), false);
});

test("缺 Token 拒绝", () => {
  assert.equal(isAuthed(new Request("http://x"), envWith("secret")), false);
});

test("未设置 ADMIN_TOKEN 时返回明确错误（引导用户设 secret）", () => {
  const err = requireToken(reqWith("x"), {});
  assert.equal(err.error, "admin_token_missing");
});

test("Token 正确时通过", () => {
  assert.equal(requireToken(reqWith("secret"), envWith("secret")), null);
});
