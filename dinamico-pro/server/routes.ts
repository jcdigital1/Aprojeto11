// All /api routes. Same paths and JSON shapes as the original FastAPI backend, so the frontend
// pages are unchanged; data lives in Cloud Firestore and identity in Firebase Authentication.
import { FieldValue, type Query } from "firebase-admin/firestore";
import { db } from "./firebase.js";
import { audit, getSettings, HttpError, iso, newCode, newId, now, validateUrl, type Doc } from "./common.js";
import { currentUser, ensureProfile, requireAdmin, requireApproved, userOut, verifyToken } from "./auth.js";
import { seedTemplates } from "./templatesSeed.js";

export interface Req {
  method: string;
  path: string; // without the /api prefix, e.g. "/batches/123"
  query: URLSearchParams;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}
export type Res =
  | { status: number; json: unknown; headers?: Record<string, string> }
  | { status: number; redirect: string }
  | { status: number; bytes: Buffer; contentType: string; headers?: Record<string, string> };

const ok = (json: unknown): Res => ({ status: 200, json });
const authz = (r: Req) => (Array.isArray(r.headers.authorization) ? r.headers.authorization[0] : r.headers.authorization);
const intParam = (v: string | null, def: number, min: number, max: number) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const count = async (q: Query) => (await q.count().get()).data().count;

// ---------- serializers ----------
function batchOut(b: Doc) {
  return {
    id: b.id, owner_id: b.owner_id, name: b.name, template_id: b.template_id, template_name: b.template_name,
    template_version: b.template_version, render: b.render, quantity: b.quantity,
    number_start: b.number_start ?? 0, number_end: b.number_end ?? 0, status: b.status,
    test_mode: b.test_mode ?? true, created_at: iso(b.created_at),
  };
}
function plaqueOut(p: Doc, b: Doc) {
  return {
    id: p.id, code: p.code, number: p.number, batch_id: p.batch_id, batch_name: b.name, template_id: p.template_id,
    qr_url: p.qr_url, destination_url: p.destination_url ?? "", disabled: !!p.disabled, scan_count: p.scan_count ?? 0,
    test_mode: b.test_mode ?? true, render: b.render, created_at: iso(p.created_at), updated_at: iso(p.updated_at),
  };
}
function templateOut(t: Doc) {
  return {
    id: t.id, name: t.name, original_url: t.original_url, clean_url: t.clean_url, version: t.version,
    production_ready: t.production_ready, calibration: t.calibration, updated_at: iso(t.updated_at),
  };
}
async function adminPlaqueOut(p: Doc) {
  const [o, b] = await Promise.all([db.collection("users").doc(p.owner_id).get(), db.collection("batches").doc(p.batch_id).get()]);
  return {
    id: p.id, code: p.code, number: p.number, owner_email: o.data()?.email ?? "—", batch_name: b.data()?.name ?? "—",
    destination_url: p.destination_url ?? "", disabled: !!p.disabled, scan_count: p.scan_count ?? 0,
  };
}

// ---------- auth / profile ----------
async function authProfile(r: Req): Promise<Res> {
  const c = await verifyToken(authz(r));
  const name = String(r.body?.name ?? "").trim();
  if (name && name.length < 3) throw new HttpError(422, "Informe seu nome completo.");
  return ok(userOut(await ensureProfile(c, name)));
}
async function me(r: Req) {
  return ok(userOut(await currentUser(authz(r))));
}
async function myStats(r: Req) {
  const u = requireApproved(await currentUser(authz(r)));
  const plaques = db.collection("plaques").where("owner_id", "==", u.id);
  const [batches, total, unconfigured, scans] = await Promise.all([
    count(db.collection("batches").where("owner_id", "==", u.id).where("status", "==", "ready")),
    count(plaques), count(plaques.where("destination_url", "==", "")),
    count(db.collection("scans").where("owner_id", "==", u.id)),
  ]);
  return ok({ batches, plaques: total, configured: total - unconfigured, scans });
}

// ---------- templates ----------
async function listTemplates(r: Req) {
  await currentUser(authz(r));
  let snap = await db.collection("templates").get();
  if (snap.empty) {
    await seedTemplates();
    snap = await db.collection("templates").get();
  }
  const docs = snap.docs.map((d) => d.data()).sort((a, b) => Number(a.id) - Number(b.id));
  return ok(docs.map(templateOut));
}
async function cleanImage(tid: string): Promise<Res> {
  const a = (await db.collection("template_assets").doc(tid).get()).data();
  if (!a) throw new HttpError(404, "Imagem não encontrada.");
  return { status: 200, bytes: Buffer.from(a.data), contentType: a.content_type, headers: { "Cache-Control": "public, max-age=31536000, immutable" } };
}
async function updateTemplate(tid: string, patch: (t: Doc) => Doc): Promise<Doc> {
  const ref = db.collection("templates").doc(tid);
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new HttpError(404, "Modelo não encontrado.");
    const t = { ...s.data(), ...patch(s.data() as Doc), updated_at: now() };
    tx.set(ref, t);
    return t;
  });
}
const NUM_KEYS = ["qrX", "qrY", "qrWidth", "qrHeight", "quietZone", "numberX", "numberY", "numberFontSize"] as const;
function parseCalibration(b: any) {
  const c: Doc = {};
  for (const k of NUM_KEYS) {
    const v = Number(b?.[k]);
    if (!Number.isFinite(v) || v < 0 || v > 1) throw new HttpError(422, `Valor inválido em ${k}.`);
    c[k] = v;
  }
  const cr = b?.cleanupRegion ?? {};
  c.cleanupRegion = { x: Number(cr.x) || 0, y: Number(cr.y) || 0, w: Number(cr.w) || 0, h: Number(cr.h) || 0 };
  c.numberColor = /^#[0-9a-fA-F]{6}$/.test(b?.numberColor) ? b.numberColor : "#2b2f36";
  c.numberAlignment = ["left", "center", "right"].includes(b?.numberAlignment) ? b.numberAlignment : "right";
  return c;
}
async function saveCalibration(r: Req, tid: string) {
  const admin = requireAdmin(await currentUser(authz(r)));
  const cal = parseCalibration(r.body);
  const t = await updateTemplate(tid, (t) => ({ calibration: cal, version: t.version + 1 }));
  await audit(admin, "template.calibrate", tid, `v${t.version}`);
  return ok(templateOut(t));
}
async function setProduction(r: Req, tid: string) {
  const admin = requireAdmin(await currentUser(authz(r)));
  const ready = !!r.body?.production_ready;
  const t = await updateTemplate(tid, () => ({ production_ready: ready }));
  await audit(admin, "template.production", tid, String(ready));
  return ok(templateOut(t));
}
async function uploadClean(r: Req, tid: string) {
  const admin = requireAdmin(await currentUser(authz(r)));
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(String(r.body?.data_url ?? ""));
  if (!m) throw new HttpError(422, "Envie uma imagem PNG, JPG ou WEBP.");
  const data = Buffer.from(m[2], "base64");
  if (data.length > 900 * 1024) throw new HttpError(422, "Imagem muito grande (máx. 900 KB após otimização).");
  if (!(await db.collection("templates").doc(tid).get()).exists) throw new HttpError(404, "Modelo não encontrado.");
  await db.collection("template_assets").doc(tid).set({ template_id: tid, content_type: m[1], data, uploaded_at: now() });
  const t = await updateTemplate(tid, (t) => ({
    clean_url: `/api/templates/${tid}/clean?v=${t.version + 1}`, version: t.version + 1, production_ready: false,
  }));
  await audit(admin, "template.clean_upload", tid, `v${t.version}`);
  return ok(templateOut(t));
}

// ---------- batches / plaques ----------
async function ownedBatch(bid: string, uid: string): Promise<Doc> {
  const b = (await db.collection("batches").doc(bid).get()).data();
  if (!b || b.owner_id !== uid) throw new HttpError(404, "Lote não encontrado.");
  return b;
}

async function createBatch(r: Req) {
  const u = requireApproved(await currentUser(authz(r)));
  const uid = u.id;
  const templateId = String(r.body?.template_id ?? "");
  const quantity = Number(r.body?.quantity);
  const key = String(r.body?.idempotency_key ?? "");
  const name = String(r.body?.name ?? "").trim().slice(0, 80);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 200) throw new HttpError(422, "Quantidade deve ser entre 1 e 200.");
  if (key.length < 8 || key.length > 64) throw new HttpError(422, "Requisição inválida.");

  // Idempotency: one marker doc per (owner, key); create() fails if a double click got there first.
  const idemRef = db.collection("idempotency").doc(`${uid}_${key}`);
  const existing = (await idemRef.get()).data();
  if (existing) return ok(batchOut(await ownedBatch(existing.batch_id, uid)));

  const tpl = (await db.collection("templates").doc(templateId).get()).data();
  if (!tpl) throw new HttpError(404, "Modelo não encontrado.");
  if (!tpl.production_ready) throw new HttpError(409, "Este modelo ainda não foi aprovado para produção.");
  const settings = await getSettings();
  const base = settings.public_base_url;
  if (!base) throw new HttpError(503, "Domínio público não configurado pelo administrador.");

  const bid = newId();
  try {
    await idemRef.create({ batch_id: bid, owner_id: uid, at: now() });
  } catch {
    const again = (await idemRef.get()).data();
    if (again) return ok(batchOut(await ownedBatch(again.batch_id, uid)));
    throw new HttpError(409, "Requisição duplicada.");
  }

  const ts = now();
  const owned = await count(db.collection("batches").where("owner_id", "==", uid));
  const batch: Doc = {
    id: bid, owner_id: uid, idempotency_key: key, name: name || `Lote ${owned + 1}`,
    template_id: tpl.id, template_name: tpl.name, template_version: tpl.version,
    render: { template_id: tpl.id, template_version: tpl.version, clean_url: tpl.clean_url, calibration: tpl.calibration },
    quantity, number_start: 0, number_end: 0, status: "creating", test_mode: !settings.production_confirmed,
    base_url: base, created_at: ts,
  };
  const bref = db.collection("batches").doc(bid);
  await bref.set(batch);
  try {
    // Atomic global range reservation: concurrent transactions on one counter doc never overlap.
    const counter = db.collection("counters").doc("plaque_number");
    const end = await db.runTransaction(async (tx) => {
      const cur = Number((await tx.get(counter)).data()?.value ?? 0);
      tx.set(counter, { value: cur + quantity }, { merge: true });
      return cur + quantity;
    });
    const start = end - quantity + 1;
    const wb = db.batch();
    for (let n = start; n <= end; n++) {
      const id = newId();
      const code = newCode();
      wb.set(db.collection("plaques").doc(id), {
        id, code, number: n, batch_id: bid, owner_id: uid, template_id: tpl.id, qr_url: `${base}/api/r/${code}`,
        destination_url: "", disabled: false, scan_count: 0, created_at: ts, updated_at: ts,
      });
    }
    wb.update(bref, { status: "ready", number_start: start, number_end: end });
    await wb.commit();
    Object.assign(batch, { status: "ready", number_start: start, number_end: end });
  } catch (e) {
    console.error("batch creation failed", bid, e);
    await bref.update({ status: "failed" }).catch(() => undefined);
    throw new HttpError(500, "Falha ao gerar o lote. Tente novamente.");
  }
  return ok(batchOut(batch));
}

async function listBatches(r: Req) {
  const u = requireApproved(await currentUser(authz(r)));
  const snap = await db.collection("batches").where("owner_id", "==", u.id).where("status", "==", "ready")
    .orderBy("created_at", "desc").limit(500).get();
  return ok(snap.docs.map((d) => batchOut(d.data())));
}
async function getBatch(r: Req, bid: string) {
  const u = requireApproved(await currentUser(authz(r)));
  return ok(batchOut(await ownedBatch(bid, u.id)));
}
async function batchPlaques(r: Req, bid: string) {
  const u = requireApproved(await currentUser(authz(r)));
  const b = await ownedBatch(bid, u.id);
  const page = intParam(r.query.get("page"), 1, 1, 100000);
  const size = intParam(r.query.get("page_size"), 24, 1, 500);
  const q = db.collection("plaques").where("owner_id", "==", u.id).where("batch_id", "==", bid);
  const [total, snap] = await Promise.all([count(q), q.orderBy("number", "asc").offset((page - 1) * size).limit(size).get()]);
  return ok({ items: snap.docs.map((d) => plaqueOut(d.data(), b)), total, page, page_size: size });
}
async function listPlaques(r: Req) {
  const u = requireApproved(await currentUser(authz(r)));
  const page = intParam(r.query.get("page"), 1, 1, 100000);
  const size = intParam(r.query.get("page_size"), 20, 1, 100);
  let q: Query = db.collection("plaques").where("owner_id", "==", u.id); // tenant isolation in the query itself
  const batchId = r.query.get("batch_id") ?? "";
  if (batchId) q = q.where("batch_id", "==", batchId);
  const term = (r.query.get("q") ?? "").trim().replace(/^Nº/, "").trim();
  let docs: Doc[];
  let total: number;
  if (term && /^\d{1,9}$/.test(term)) {
    q = q.where("number", "==", Number(term));
    docs = (await q.get()).docs.map((d) => d.data());
    total = docs.length;
  } else if (term) {
    // Firestore has no substring search: filter the owner's plaques in memory (bounded).
    const t = term.toLowerCase();
    const all = (await q.orderBy("number", "desc").limit(5000).get()).docs.map((d) => d.data())
      .filter((p) => p.code === term || String(p.destination_url ?? "").toLowerCase().includes(t));
    total = all.length;
    docs = all.slice((page - 1) * size, page * size);
  } else {
    const [n, snap] = await Promise.all([count(q), q.orderBy("number", "desc").offset((page - 1) * size).limit(size).get()]);
    total = n;
    docs = snap.docs.map((d) => d.data());
  }
  const bids = [...new Set(docs.map((p) => p.batch_id))];
  const bsnaps = bids.length ? await db.getAll(...bids.map((id) => db.collection("batches").doc(id))) : [];
  const batches = new Map(bsnaps.map((s) => [s.id, s.data()]).filter(([, b]) => b && (b as Doc).owner_id === u.id) as [string, Doc][]);
  const items = docs.filter((p) => batches.has(p.batch_id)).map((p) => plaqueOut(p, batches.get(p.batch_id)!));
  return ok({ items, total, page, page_size: size });
}
async function updateDestination(r: Req, pid: string) {
  const u = requireApproved(await currentUser(authz(r)));
  const url = validateUrl(r.body?.destination_url);
  const ref = db.collection("plaques").doc(pid);
  const p = await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const d = s.data() as Doc | undefined;
    if (!d || d.owner_id !== u.id) throw new HttpError(404, "Plaquinha não encontrada.");
    // Only destination_url is writable: code, number and qr_url are permanent.
    const next: Doc = { ...d, destination_url: url, updated_at: now() };
    tx.update(ref, { destination_url: url, updated_at: next.updated_at });
    return next;
  });
  return ok(plaqueOut(p, await ownedBatch(p.batch_id, u.id)));
}

// ---------- admin ----------
async function adminStats(r: Req) {
  requireAdmin(await currentUser(authz(r)));
  const users = db.collection("users").where("role", "==", "customer");
  const plaques = db.collection("plaques");
  const [pending, approved, blocked, batches, total, disabled, scans] = await Promise.all([
    count(users.where("status", "==", "pending")), count(users.where("status", "==", "approved")),
    count(users.where("status", "==", "blocked")), count(db.collection("batches").where("status", "==", "ready")),
    count(plaques), count(plaques.where("disabled", "==", true)), count(db.collection("scans")),
  ]);
  return ok({ pending, approved, blocked, batches, plaques: total, qr_issued: total - disabled, scans });
}
async function adminUsers(r: Req) {
  requireAdmin(await currentUser(authz(r)));
  let q: Query = db.collection("users").where("role", "==", "customer");
  const st = r.query.get("status") ?? "";
  if (["pending", "approved", "blocked"].includes(st)) q = q.where("status", "==", st);
  const snap = await q.orderBy("created_at", "desc").limit(1000).get();
  return ok(snap.docs.map((d) => userOut(d.data())));
}
async function userAction(r: Req, uid: string, action: string) {
  const admin = requireAdmin(await currentUser(authz(r)));
  const rules: Record<string, [string[], string]> = {
    approve: [["pending"], "approved"], block: [["pending", "approved"], "blocked"], reactivate: [["blocked"], "approved"],
  };
  const rule = rules[action];
  if (!rule) throw new HttpError(404, "Ação desconhecida.");
  const ref = db.collection("users").doc(uid);
  const u = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data();
    if (!d || d.role !== "customer" || !rule[0].includes(d.status)) {
      throw new HttpError(409, "Ação não permitida para o status atual deste comprador.");
    }
    const patch: Doc = { status: rule[1], status_changed_at: now() };
    if (action !== "block") patch.approved_at = now();
    tx.update(ref, patch);
    return { ...d, ...patch };
  });
  await audit(admin, `user.${action}`, uid, u.email);
  return ok(userOut(u));
}
async function readSettings(r: Req) {
  requireAdmin(await currentUser(authz(r)));
  return ok(await getSettings());
}
async function writeSettings(r: Req) {
  const admin = requireAdmin(await currentUser(authz(r)));
  const url = validateUrl(r.body?.public_base_url, false).replace(/\/+$/, "");
  const prod = !!r.body?.production_confirmed;
  if (prod && !url.startsWith("https://")) throw new HttpError(422, "O domínio de produção precisa usar https://");
  await db.collection("settings").doc("global").set({ public_base_url: url, production_confirmed: prod, updated_at: now() }, { merge: true });
  await audit(admin, "settings.update", "global", `${url} prod=${prod}`);
  return ok(await getSettings());
}
async function adminSearchPlaques(r: Req) {
  requireAdmin(await currentUser(authz(r)));
  const n = parseInt(r.query.get("number") ?? "", 10);
  if (!Number.isFinite(n) || n < 1) throw new HttpError(422, "Informe um número válido.");
  const snap = await db.collection("plaques").where("number", "==", n).limit(5).get();
  return ok(await Promise.all(snap.docs.map((d) => adminPlaqueOut(d.data()))));
}
async function togglePlaque(r: Req, pid: string) {
  const admin = requireAdmin(await currentUser(authz(r)));
  const ref = db.collection("plaques").doc(pid);
  const p = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() as Doc | undefined;
    if (!d) throw new HttpError(404, "Plaquinha não encontrada.");
    const disabled = !d.disabled;
    tx.update(ref, { disabled, updated_at: now() });
    return { ...d, disabled } as Doc;
  });
  await audit(admin, p.disabled ? "plaque.disable" : "plaque.enable", pid, String(p.number));
  return ok(await adminPlaqueOut(p));
}

// ---------- public dynamic QR redirect ----------
async function resolve(r: Req, code: string): Promise<Res> {
  const go = (to: string): Res => ({ status: 302, redirect: to });
  if (!/^[A-Za-z0-9]{6,32}$/.test(code)) return go("/q/indisponivel?motivo=nao-encontrado");
  const snap = await db.collection("plaques").where("code", "==", code).limit(1).get();
  const p = snap.docs[0]?.data();
  if (!p) return go("/q/indisponivel?motivo=nao-encontrado");
  if (p.disabled) return go("/q/indisponivel?motivo=desativado");
  const dest = String(p.destination_url ?? "");
  if (!/^https?:\/\//.test(dest)) return go(`/q/indisponivel?motivo=nao-configurado&n=${p.number}`);
  try {
    // Every resolution counts as one "leitura registrada".
    const id = newId();
    const ua = String(r.headers["user-agent"] ?? "").slice(0, 200);
    const wb = db.batch();
    wb.set(db.collection("scans").doc(id), { id, plaque_id: p.id, owner_id: p.owner_id, at: now(), ua });
    wb.update(snap.docs[0].ref, { scan_count: FieldValue.increment(1) });
    await wb.commit();
  } catch (e) {
    console.error("scan logging failed", code, e); // never block the redirect on analytics
  }
  return go(dest);
}

// ---------- router ----------
type Handler = (r: Req, ...params: string[]) => Promise<Res>;
const ROUTES: [string, RegExp, Handler][] = [
  ["GET", /^\/?$/, async () => ok({ message: "DINÂMICO PRO API" })],
  ["POST", /^\/auth\/profile$/, authProfile],
  ["GET", /^\/auth\/me$/, me],
  ["GET", /^\/me\/stats$/, myStats],
  ["GET", /^\/templates$/, listTemplates],
  ["GET", /^\/templates\/([^/]+)\/clean$/, (_r, tid) => cleanImage(tid)],
  ["PUT", /^\/admin\/templates\/([^/]+)\/calibration$/, saveCalibration],
  ["POST", /^\/admin\/templates\/([^/]+)\/production$/, setProduction],
  ["POST", /^\/admin\/templates\/([^/]+)\/clean-image$/, uploadClean],
  ["POST", /^\/batches$/, createBatch],
  ["GET", /^\/batches$/, listBatches],
  ["GET", /^\/batches\/([^/]+)$/, getBatch],
  ["GET", /^\/batches\/([^/]+)\/plaques$/, batchPlaques],
  ["GET", /^\/plaques$/, listPlaques],
  ["PATCH", /^\/plaques\/([^/]+)$/, updateDestination],
  ["GET", /^\/admin\/stats$/, adminStats],
  ["GET", /^\/admin\/users$/, adminUsers],
  ["POST", /^\/admin\/users\/([^/]+)\/(approve|block|reactivate)$/, userAction],
  ["GET", /^\/admin\/settings$/, readSettings],
  ["PUT", /^\/admin\/settings$/, writeSettings],
  ["GET", /^\/admin\/plaques$/, adminSearchPlaques],
  ["POST", /^\/admin\/plaques\/([^/]+)\/toggle$/, togglePlaque],
  ["GET", /^\/r\/([^/]+)$/, resolve],
];

export async function route(r: Req): Promise<Res> {
  try {
    for (const [method, re, h] of ROUTES) {
      const m = re.exec(r.path);
      if (m && method === r.method) return await h(r, ...m.slice(1).map(decodeURIComponent));
    }
    return { status: 404, json: { detail: "Rota não encontrada." } };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, json: { detail: e.message } };
    console.error("unhandled", r.method, r.path, e);
    return { status: 500, json: { detail: "Erro interno do servidor." } };
  }
}
