/* 本地 mock AI 服务（仅开发/集成测试用，不参与部署）
 * 模拟 OpenAI 兼容接口：POST /v1/chat/completions + GET /v1/models
 * 用法：node scripts/mock-ai.mjs  （默认端口 9999） */
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 9999);

const DETAIL = JSON.stringify({
  intro: "这是一个用于测试的模拟项目，验证 AI 详解全链路。",
  features: "特性一：模拟响应；特性二：6 维度字段齐全。",
  recommend: "推荐理由：用于本地集成测试，无需真实 API key。",
  scenarios: "适用场景：开发阶段验证生成编排、failover 与状态机。",
  getting_started: "快速上手：npm install 后运行 mock 服务即可。",
  pros_cons: "优点：零成本、确定性；缺点：内容固定，不能测试真实模型质量。",
});

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url.startsWith("/v1/chat/completions")) {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          // 支持 mock 故障注入：model 名为 mock-fail 时返回 500
          if (parsed.model === "mock-fail") {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { message: "mock failure injected" } }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              id: "mock-1",
              choices: [{ message: { role: "assistant", content: DETAIL } }],
            })
          );
        } catch {
          res.writeHead(400);
          res.end("bad json");
        }
      });
    } else if (req.method === "GET" && req.url.startsWith("/v1/models")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "mock-model" }, { id: "mock-fail" }] }));
    } else if (req.method === "POST" && req.url.startsWith("/v1/notify")) {
      // 通知 Webhook 接收端（集成测试用）
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: 0 }));
    } else {
      res.writeHead(404);
      res.end("not found");
    }
  })
  .listen(PORT, () => console.log(`mock-ai listening on http://127.0.0.1:${PORT}`));
