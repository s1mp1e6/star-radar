import { test } from "node:test";
import assert from "node:assert";
import { json, fail, handleOptions } from "../src/lib/http.js";

test("json() 返回统一结构与安全头", async () => {
  const res = json([1, 2, 3]);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(res.headers.get("X-Frame-Options"), "DENY");
  assert.deepEqual(await res.json(), { ok: true, data: [1, 2, 3] });
});

test("fail() 返回错误结构", async () => {
  const res = fail("not_found", "没有", 404);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "not_found");
});

test("handleOptions() 返回 204", () => {
  assert.equal(handleOptions().status, 204);
});
