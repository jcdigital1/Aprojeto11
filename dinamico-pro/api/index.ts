// Single Vercel Serverless Function serving every /api/* route (see vercel.json rewrites).
import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeHandler } from "../server/node.js";

export const config = { maxDuration: 30 };

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  await nodeHandler(req, res);
}
