// Imports migration/export.json (from scripts/export_mongo.py) into Firebase Auth + Firestore.
//
//   yarn import:firebase                       → simulação (não grava nada), mostra o que faria
//   yarn import:firebase --apply               → grava no Firebase
//   yarn import:firebase --apply --send-reset-emails     → também envia e-mail "criar nova senha"
//   yarn import:firebase --apply --new-base-url=https://qr.seudominio.com.br
//        → define o domínio no painel e reescreve qr_url das plaquinhas em MODO TESTE
//          (as de produção nunca são alteradas: o QR impresso continua igual)
//
// Needs FIREBASE_SERVICE_ACCOUNT (or emulator hosts) and, for e-mails, VITE_FIREBASE_API_KEY.
// Idempotent: re-running overwrites the same document IDs; never deletes anything.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, db } from "../server/firebase.js";

const args = new Map(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, "").split("=");
  return [k, v ?? "true"] as [string, string];
}));
const APPLY = args.has("apply");
const NEW_BASE = (args.get("new-base-url") ?? "").replace(/\/+$/, "");
const file = resolve(args.get("file") ?? "migration/export.json");

type Row = Record<string, any>;
const { data } = JSON.parse(readFileSync(file, "utf8")) as { data: Record<string, Row[]> };

function revive(v: any): any {
  if (v && typeof v === "object") {
    if ("$date" in v) return Timestamp.fromDate(new Date(v.$date));
    if ("$bytes" in v) return Buffer.from(v.$bytes, "base64");
    if (Array.isArray(v)) return v.map(revive);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  }
  return v;
}

async function sendResetEmail(email: string) {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const key = process.env.VITE_FIREBASE_API_KEY || "emulator";
  const base = host ? `http://${host}/identitytoolkit.googleapis.com` : "https://identitytoolkit.googleapis.com";
  const r = await fetch(`${base}/v1/accounts:sendOobCode?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
}

async function main() {
  const rows = (c: string) => (data[c] ?? []).map(revive);
  console.log(`Arquivo: ${file}\nModo: ${APPLY ? "GRAVAÇÃO" : "SIMULAÇÃO (use --apply para gravar)"}\n`);

  // 1) Firebase Authentication — same UID as the old user id, no password (users set a new one).
  const users = rows("users");
  const authReport: string[] = [];
  for (const u of users) {
    const existing = await adminAuth.getUserByEmail(u.email).catch(() => null);
    if (existing && existing.uid !== u.id) {
      authReport.push(`! ${u.email}: já existe no Firebase com outro UID (${existing.uid}) — perfil será gravado nesse UID`);
      u.__uid = existing.uid;
      continue;
    }
    if (!existing && APPLY) await adminAuth.createUser({ uid: u.id, email: u.email, displayName: u.name, emailVerified: false });
    authReport.push(`${existing ? "=" : "+"} ${u.email} (${u.role}/${u.status})`);
  }
  console.log("Authentication:\n  " + (authReport.join("\n  ") || "(nenhum usuário)"));

  // 2) Firestore documents (doc ID = original id; UID remapped where needed).
  const uidMap = new Map(users.map((u) => [u.id, u.__uid ?? u.id]));
  const remap = (r: Row) => (r.owner_id && uidMap.has(r.owner_id) ? { ...r, owner_id: uidMap.get(r.owner_id) } : r);
  const writer = db.bulkWriter();
  const counts: Record<string, number> = {};
  const put = (col: string, id: string, doc: Row) => {
    counts[col] = (counts[col] ?? 0) + 1;
    if (APPLY) writer.set(db.collection(col).doc(id), doc);
  };

  for (const u of users) {
    const { __uid, ...doc } = u;
    put("users", __uid ?? u.id, { ...doc, id: __uid ?? u.id });
  }
  for (const t of rows("templates")) put("templates", t.id, t);
  for (const a of rows("template_assets")) put("template_assets", a.template_id, a);
  for (const b of rows("batches").map(remap)) {
    put("batches", b.id, b);
    if (b.idempotency_key) put("idempotency", `${b.owner_id}_${b.idempotency_key}`, { batch_id: b.id, owner_id: b.owner_id, at: b.created_at });
  }
  const testBatches = new Set(rows("batches").filter((b) => b.test_mode !== false).map((b) => b.id));
  let rewritten = 0;
  let maxNumber = 0;
  for (const p of rows("plaques").map(remap)) {
    maxNumber = Math.max(maxNumber, Number(p.number) || 0);
    if (NEW_BASE && testBatches.has(p.batch_id)) {
      p.qr_url = `${NEW_BASE}/api/r/${p.code}`; // same permanent code, new domain
      rewritten++;
    }
    put("plaques", p.id, p);
  }
  for (const s of rows("scans").map(remap)) put("scans", s.id, s);
  for (const a of rows("admin_actions")) put("admin_actions", a.id, a);

  // Counter never moves backwards: numbering continues after the highest migrated plaque.
  const oldCounter = Number(rows("counters").find((c) => c.__key === "plaque_number")?.value ?? 0);
  const curCounter = Number((await db.collection("counters").doc("plaque_number").get()).data()?.value ?? 0);
  put("counters", "plaque_number", { value: Math.max(oldCounter, maxNumber, curCounter) });

  const s = rows("settings").find((x) => x.__key === "global") ?? {};
  const settings: Row = { public_base_url: s.public_base_url ?? "", production_confirmed: !!s.production_confirmed, updated_at: s.updated_at ?? Timestamp.now() };
  if (NEW_BASE) Object.assign(settings, { public_base_url: NEW_BASE, production_confirmed: false, updated_at: Timestamp.now() });
  put("settings", "global", settings);

  if (APPLY) await writer.close();
  console.log("\nFirestore:", counts);
  if (NEW_BASE) console.log(`qr_url reescrito (modo teste): ${rewritten}`);

  // 3) Verification: every migrated document must exist.
  if (APPLY) {
    const checks: [string, number][] = [["users", users.length], ["batches", rows("batches").length], ["plaques", rows("plaques").length], ["templates", rows("templates").length]];
    for (const [col, expected] of checks) {
      const n = (await db.collection(col).count().get()).data().count;
      console.log(`  verificação ${col}: ${n} no Firestore (esperado ≥ ${expected}) ${n >= expected ? "OK" : "FALHOU"}`);
    }
  }

  // 4) Optional: password e-mails (users chose new passwords).
  if (APPLY && args.has("send-reset-emails")) {
    for (const u of users) {
      try {
        await sendResetEmail(u.email);
        console.log(`  e-mail de nova senha enviado: ${u.email}`);
      } catch (e) {
        console.log(`  ! falha ao enviar para ${u.email}: ${(e as Error).message}`);
      }
    }
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
