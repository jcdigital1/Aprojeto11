// Node adapter shared by the Vercel function (api/index.ts) and the local dev server.
import type { IncomingMessage, ServerResponse } from "node:http";
import { route, type Req } from "./routes.js";

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  // Vercel pre-parses JSON into req.body; plain Node does not.
  if (req.body !== undefined) return typeof req.body === "string" ? safeJson(req.body) : req.body;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? safeJson(Buffer.concat(chunks).toString("utf8")) : undefined;
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}

export async function nodeHandler(req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  // Vercel rewrites /api/* → /api?__p=*; locally the real path is used.
  const forwarded = url.searchParams.get("__p");
  url.searchParams.delete("__p");
  const path = "/" + (forwarded ?? url.pathname.replace(/^\/api\/?/, "")).replace(/^\/+/, "");
  const r: Req = { method: req.method ?? "GET", path, query: url.searchParams, headers: req.headers, body: await readBody(req) };
  const out = await route(r);
  if ("redirect" in out) {
    res.writeHead(out.status, { Location: out.redirect, "Cache-Control": "no-store" });
    res.end();
  } else if ("bytes" in out) {
    res.writeHead(out.status, { "Content-Type": out.contentType, ...(out.headers ?? {}) });
    res.end(out.bytes);
  } else {
    res.writeHead(out.status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(out.headers ?? {}) });
    res.end(JSON.stringify(out.json));
  }
}
