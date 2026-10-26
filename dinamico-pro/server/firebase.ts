// Firebase Admin SDK (server-only). Credentials come exclusively from environment variables
// configured on Vercel — never from the frontend bundle.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function credentials() {
  // Option A: whole service-account JSON (raw or base64) in FIREBASE_SERVICE_ACCOUNT.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (raw) {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(json) as { project_id: string; client_email: string; private_key: string };
    return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
  }
  // Option B: three separate variables.
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (projectId && clientEmail && privateKey) return { projectId, clientEmail, privateKey };
  return null;
}

function init(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  // Local emulator mode (FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST set): no key needed.
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || "demo-dinamico" });
  }
  const c = credentials();
  if (!c) throw new Error("Credenciais do Firebase Admin ausentes (FIREBASE_SERVICE_ACCOUNT ou FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY).");
  return initializeApp({ credential: cert(c), projectId: c.projectId });
}

const app = init();
export const db: Firestore = getFirestore(app);
export const adminAuth = getAuth(app);
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch {
  /* settings() can only be called once per instance; warm lambdas reuse it */
}
