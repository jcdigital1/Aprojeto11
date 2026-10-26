import { randomBytes, randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "./firebase.js";

export class HttpError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

export type Doc = Record<string, any>;

export const newId = () => randomUUID();
export const now = () => Timestamp.now();

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function newCode(len = 12): string {
  const bytes = randomBytes(len * 2);
  let out = "";
  for (let i = 0; out.length < len && i < bytes.length; i++) {
    if (bytes[i] < 248) out += ALPHA[bytes[i] % 62]; // rejection sampling: no modulo bias
  }
  return out.length === len ? out : newCode(len);
}

/** Firestore Timestamp | Date | string → ISO string (or null). */
export function iso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") return v;
  return null;
}

export function validateUrl(raw: unknown, allowEmpty = true): string {
  let url = String(raw ?? "").trim();
  if (!url) {
    if (allowEmpty) return "";
    throw new HttpError(422, "Informe uma URL.");
  }
  if (!url.includes("://")) url = "https://" + url;
  let ok = false;
  try {
    const p = new URL(url);
    ok = (p.protocol === "http:" || p.protocol === "https:") && p.hostname.includes(".") && !url.includes(" ");
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(422, "URL inválida. Use um endereço começando com https://");
  return url;
}

export interface SettingsData {
  public_base_url: string;
  production_confirmed: boolean;
  updated_at: string | null;
}

export async function getSettings(): Promise<SettingsData> {
  const snap = await db.collection("settings").doc("global").get();
  const d = snap.data() ?? {};
  const base = (d.public_base_url || process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return { public_base_url: base, production_confirmed: !!d.production_confirmed, updated_at: iso(d.updated_at) };
}

export async function audit(actor: Doc, action: string, target: string, detail = ""): Promise<void> {
  const id = newId();
  await db.collection("admin_actions").doc(id).set({
    id, actor_id: actor.id, actor_email: actor.email, action, target, detail, at: now(),
  });
}
