/* GitHub GraphQL 适配器：单请求批量拉取仓库实时数据（ADR-0003 追踪数据源）
 * 别名 r0..rN 查询，无需 node id；未认证 5000 点/小时，可选只读 PAT */
export function buildRepoQuery(repos) {
  const aliases = repos.map((r, i) => {
    const [owner, name] = String(r).split("/");
    return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
        stargazerCount
        forkCount
        latestRelease { tagName name publishedAt url }
        pushedAt
      }`;
  });
  return `query { ${aliases.join(" ")} }`;
}

export function parseRepoData(repos, json) {
  const data = json?.data || {};
  return repos.map((r, i) => {
    const d = data[`r${i}`];
    if (!d) return { repo: r, error: "not_found" };
    return {
      repo: r,
      stars: d.stargazerCount || 0,
      forks: d.forkCount || 0,
      release: d.latestRelease
        ? {
            tag: d.latestRelease.tagName,
            name: d.latestRelease.name,
            published_at: d.latestRelease.publishedAt,
            url: d.latestRelease.url,
          }
        : null,
      pushed_at: d.pushedAt,
    };
  });
}

export async function fetchReposGraphQL(repos, token = null) {
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "star-radar/0.1",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query: buildRepoQuery(repos) }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`graphql_http_${res.status}: ${body.slice(0, 150)}`);
  }
  return res.json();
}
