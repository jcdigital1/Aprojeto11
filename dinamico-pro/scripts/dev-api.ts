// Local API server (same handler as Vercel). Usage: yarn dev:api  (port API_PORT, default 4001)
import { createServer } from "node:http";
import { nodeHandler } from "../server/node.js";

const port = Number(process.env.API_PORT || 4001);
createServer((req, res) => {
  nodeHandler(req, res).catch((e) => {
    console.error(e);
    res.writeHead(500).end();
  });
}).listen(port, () => console.log(`DINÂMICO PRO API local em http://localhost:${port}/api`));
