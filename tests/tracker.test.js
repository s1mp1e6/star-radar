import { test } from "node:test";
import assert from "node:assert";
import { buildRepoQuery, parseRepoData } from "../src/adapters/github-graphql.js";
import { sparkPath } from "../public/assets/app.js";

test("buildRepoQuery 生成别名查询", () => {
  const q = buildRepoQuery(["org/a", "org/b"]);
  assert.ok(q.includes("r0: repository(owner: \"org\", name: \"a\")"));
  assert.ok(q.includes("r1: repository(owner: \"org\", name: \"b\")"));
  assert.ok(q.includes("stargazerCount"));
  assert.ok(q.includes("latestRelease"));
});

test("parseRepoData 映射字段", () => {
  const json = {
    data: {
      r0: {
        stargazerCount: 123,
        forkCount: 4,
        latestRelease: { tagName: "v1.0.0", name: "release", publishedAt: "2026-01-01T00:00:00Z", url: "https://x" },
        pushedAt: "2026-01-02T00:00:00Z",
      },
    },
  };
  const [d] = parseRepoData(["org/a"], json);
  assert.equal(d.stars, 123);
  assert.equal(d.release.tag, "v1.0.0");
  assert.equal(d.error, undefined);
});

test("parseRepoData 处理仓库不存在（null → error）", () => {
  const [d] = parseRepoData(["org/ghost"], { data: { r0: null } });
  assert.equal(d.error, "not_found");
});

test("sparkPath 空输入返回空串", () => {
  assert.equal(sparkPath([]), "");
  assert.equal(sparkPath(null), "");
});

test("sparkPath 生成合法路径（起点 M、点数一致）", () => {
  const path = sparkPath([10, 20, 15, 30]);
  assert.ok(path.startsWith("M"));
  const points = path.split(" L").length;
  assert.equal(points, 4);
});

test("sparkPath 平直序列不产生 NaN", () => {
  const path = sparkPath([5, 5, 5]);
  assert.ok(!path.includes("NaN"));
  assert.ok(path.startsWith("M"));
});
