import { test } from "node:test";
import assert from "node:assert";
import { buildNotifyPayload } from "../src/adapters/notify.js";
import { releaseChanged, spikeDetected, buildDigestLines } from "../src/services/notify.js";

test("buildNotifyPayload 形状", () => {
  const p = buildNotifyPayload("标题", "内容");
  assert.equal(p.title, "标题");
  assert.equal(p.content, "内容");
  assert.ok(p.time);
});

test("releaseChanged：新 tag 与历史不同才通知", () => {
  assert.equal(releaseChanged(null, "v1.0.0"), true);       // 首次检测到 release
  assert.equal(releaseChanged("v0.9.0", "v1.0.0"), true);  // 升级
  assert.equal(releaseChanged("v1.0.0", "v1.0.0"), false); // 无变化
  assert.equal(releaseChanged("v1.0.0", null), false);     // release 被删除
  assert.equal(releaseChanged(null, null), false);
});

test("spikeDetected：涨幅达阈值才通知", () => {
  assert.equal(spikeDetected(1200, 1000, 500), false);
  assert.equal(spikeDetected(1500, 1000, 500), true);
  assert.equal(spikeDetected(1500, null, 500), false); // 无昨日基线不通知
});

test("buildDigestLines 生成 Top 列表", () => {
  const lines = buildDigestLines([
    { repo: "a/b", stars_total: 100, description: "第一个" },
    { repo: "c/d", stars_total: 50, description: "第二个" },
  ]);
  assert.ok(lines.includes("#1 a/b ★100 第一个"));
  assert.ok(lines.includes("#2 c/d ★50 第二个"));
});
