// Server-side identity + authorization. The Firebase ID token proves *who* the caller is;
// role and approval status live in Firestore (users/{uid}) and are enforced here, never in the UI.
import { adminAuth, db } from "./firebase.js";
import { HttpError, iso, now, type Doc } from "./common.js";

export interface Caller {
  uid: string;
  email: string;
  name: string;
}

export async function verifyToken(header: string | undefined): Promise<Caller> {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  if (!m) throw new HttpError(401, "Sessão não encontrada. Faça login.");
  try {
    const t = await adminAuth.verifyIdToken(m[1], true);
    return { uid: t.uid, email: (t.email ?? "").toLowerCase(), name: (t.name as string | undefined) ?? "" };
  } catch {
    throw new HttpError(401, "Sessão expirada. Faça login novamente.");
  }
}

export const adminEmail = () => (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

export function userOut(u: Doc) {
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, status: u.status,
    created_at: iso(u.created_at), approved_at: iso(u.approved_at),
  };
}

/** Returns the profile, creating it (pending, or admin bootstrap) on first sign-in. */
export async function ensureProfile(c: Caller, name?: string): Promise<Doc> {
  const ref = db.collection("users").doc(c.uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return snap.data() as Doc;
    // Exclusive admin: only ADMIN_EMAIL, and only while no admin exists yet.
    let isAdmin = false;
    if (c.email && c.email === adminEmail()) {
      const admins = await tx.get(db.collection("users").where("role", "==", "admin").limit(1));
      isAdmin = admins.empty;
    }
    const ts = now();
    const user = {
      id: c.uid, name: (name || c.name || c.email.split("@")[0]).trim().slice(0, 80), email: c.email,
      role: isAdmin ? "admin" : "customer", status: isAdmin ? "approved" : "pending",
      created_at: ts, approved_at: isAdmin ? ts : null,
    };
    tx.set(ref, user);
    return user;
  });
}

export async function currentUser(header: string | undefined): Promise<Doc> {
  const c = await verifyToken(header);
  return ensureProfile(c);
}

export function requireApproved(u: Doc): Doc {
  if (u.role === "admin") return u;
  if (u.status === "blocked") throw new HttpError(403, "Sua conta está bloqueada. Fale com o administrador.");
  if (u.status !== "approved") throw new HttpError(403, "Sua conta ainda aguarda aprovação.");
  return u;
}

export function requireAdmin(u: Doc): Doc {
  if (u.role !== "admin") throw new HttpError(403, "Acesso restrito ao administrador.");
  return u;
}
