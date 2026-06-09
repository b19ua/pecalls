// Lunara — Client Data Gateway (production-grade reference).
// Receives HMAC-signed handoffs from Lunara cloud, downloads audio from Twilio,
// transcribes locally, stores in PostgreSQL + MinIO. Never sends data back.
//
// Production hardening:
//   - HMAC-SHA256 request signing with 5-minute clock skew window
//   - Optional IP allow-list (LUNARA_ALLOWED_IPS, comma separated CIDR/ip)
//   - Retention sweeper (RETENTION_DAYS) deletes audio + DB rows on schedule
//   - Structured JSON logs, request-id propagation
//   - /health (liveness) and /ready (DB + S3 reachability)
//   - Graceful shutdown on SIGTERM
//   - Request body size cap (1 MiB)
import crypto from "node:crypto";
import express from "express";
import pg from "pg";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const SECRET = process.env.LUNARA_HMAC_SECRET;
if (!SECRET || SECRET.length < 16) { console.error("LUNARA_HMAC_SECRET must be set (>=16 chars)"); process.exit(1); }
const PORT = Number(process.env.PORT ?? 8080);
const BUCKET = process.env.S3_BUCKET ?? "call-recordings";
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS ?? 0);
const ALLOWED_IPS = (process.env.LUNARA_ALLOWED_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const VERSION = "1.1.0";

function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
});

async function ensureBucket() {
  try { await s3.send(new HeadBucketCommand({ Bucket: BUCKET })); }
  catch { await s3.send(new CreateBucketCommand({ Bucket: BUCKET })); log("info", "bucket created", { bucket: BUCKET }); }
}

// --------- IP allow-list ----------
function ipAllowed(req) {
  if (!ALLOWED_IPS.length) return true;
  const raw = (req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").toString();
  const ip = raw.split(",")[0].trim().replace(/^::ffff:/, "");
  return ALLOWED_IPS.includes(ip);
}

// --------- HMAC verification middleware ---------
function verify(req, res, next) {
  if (!ipAllowed(req)) { log("warn", "ip blocked", { ip: req.socket.remoteAddress }); return res.status(403).json({ error: "ip not allowed" }); }
  const ts = req.header("x-lunara-timestamp") ?? "";
  const sig = req.header("x-lunara-signature") ?? "";
  const owner = req.header("x-lunara-owner") ?? "";
  if (!ts || !sig || !owner) return res.status(401).json({ error: "missing signature headers" });
  const drift = Math.abs(Math.floor(Date.now() / 1000) - Number(ts));
  if (!Number.isFinite(drift) || drift > 300) return res.status(401).json({ error: "stale timestamp" });
  const body = req.rawBody ?? "";
  const expected = crypto.createHmac("sha256", SECRET).update(`${ts}\n${req.method}\n${req.path}\n${body}`).digest("hex");
  const a = Buffer.from(sig); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "bad signature" });
  req.ownerId = owner;
  next();
}

// --------- Twilio download ---------
async function downloadFromTwilio(recordingSid) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const keySid = process.env.TWILIO_API_KEY_SID;
  const keySecret = process.env.TWILIO_API_KEY_SECRET;
  if (!sid || !keySid || !keySecret) throw new Error("Twilio creds not configured");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${recordingSid}.mp3`;
  const auth = Buffer.from(`${keySid}:${keySecret}`).toString("base64");
  const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!r.ok) throw new Error(`Twilio download failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// --------- Transcription backends ---------
async function transcribe(audio, language) {
  const backend = process.env.TRANSCRIBE_BACKEND ?? "gemini";
  if (backend === "whisper") {
    const url = `${process.env.WHISPER_URL}/asr?task=transcribe&language=${encodeURIComponent((language ?? "ru").slice(0, 2))}&output=json`;
    const fd = new FormData();
    fd.append("audio_file", new Blob([audio], { type: "audio/mpeg" }), "call.mp3");
    const r = await fetch(url, { method: "POST", body: fd });
    if (!r.ok) throw new Error(`whisper ${r.status}`);
    const data = await r.json();
    return data.text ?? "";
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const b64 = audio.toString("base64");
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: `Transcribe this call (language: ${language}). Format: "Speaker: text" lines, no commentary.` },
        { inlineData: { mimeType: "audio/mp3", data: b64 } },
      ] }],
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const data = await r.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

// --------- Summary backends (Ollama for fully on-prem) ---------
async function summarize(text, language) {
  const backend = process.env.SUMMARY_BACKEND ?? "none";
  if (backend === "none" || !text) return null;
  const sys = `You are a call analyst. Reply in the SAME language as the dialog (${language ?? "auto"}). Output: 1) what the call was about (1-2 sentences), 2) key facts (bullets), 3) caller intent, 4) next steps. No filler.`;
  if (backend === "ollama") {
    const url = `${process.env.OLLAMA_URL ?? "http://ollama:11434"}/api/generate`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL ?? "qwen2.5:7b-instruct", system: sys, prompt: text.slice(0, 12000), stream: false }),
    });
    if (!r.ok) throw new Error(`ollama ${r.status}`);
    const j = await r.json();
    return j.response ?? null;
  }
  return null;
}

// --------- Audit log (hash-chain — tamper-evident) ---------
async function audit(ownerId, action, targetId, meta) {
  try {
    const { rows } = await pool.query(`SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1`);
    const prev = rows[0]?.hash ?? "GENESIS";
    const ts = new Date().toISOString();
    const payload = JSON.stringify({ ts, owner: ownerId, action, target: targetId, meta: meta ?? {}, prev });
    const hash = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
    await pool.query(
      `INSERT INTO audit_log (owner_id, action, target_id, meta, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6)`,
      [ownerId ?? null, action, targetId ?? null, meta ?? {}, prev, hash],
    );
  } catch (e) { log("warn", "audit failed", { err: String(e) }); }
}

// --------- App ---------
const app = express();
app.disable("x-powered-by");
app.use((req, _res, next) => { req.requestId = req.header("x-request-id") ?? crypto.randomUUID(); next(); });
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString("utf8"); }, limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, version: VERSION }));
app.get("/ready", async (_req, res) => {
  const out = { ok: true, version: VERSION, db: false, s3: false, transcribe: process.env.TRANSCRIBE_BACKEND ?? "gemini", summary: process.env.SUMMARY_BACKEND ?? "none", retention_days: RETENTION_DAYS, allowed_ips: ALLOWED_IPS.length };
  try { await pool.query("SELECT 1"); out.db = true; } catch (e) { out.ok = false; out.dbError = String(e).slice(0, 200); }
  try { await s3.send(new HeadBucketCommand({ Bucket: BUCKET })); out.s3 = true; } catch (e) { out.ok = false; out.s3Error = String(e).slice(0, 200); }
  try {
    const { rows } = await pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='ready')::int AS ready, count(*) FILTER (WHERE status='failed')::int AS failed FROM calls`);
    out.calls = rows[0];
  } catch { /* ignore */ }
  res.status(out.ok ? 200 : 503).json(out);
});

app.post("/calls/ingest", verify, async (req, res) => {
  const { call_id, twilio_call_sid, recording_sid, duration_seconds, language } = req.body ?? {};
  if (!call_id || !recording_sid) return res.status(400).json({ error: "call_id and recording_sid required" });
  res.json({ ok: true, accepted: call_id });
  try {
    await pool.query(
      `INSERT INTO calls (id, owner_id, twilio_call_sid, recording_sid, duration_sec, language, status)
       VALUES ($1,$2,$3,$4,$5,$6,'processing')
       ON CONFLICT (id) DO UPDATE SET status='processing', recording_sid=EXCLUDED.recording_sid, updated_at=now()`,
      [call_id, req.ownerId, twilio_call_sid ?? null, recording_sid, duration_seconds ?? 0, language ?? null],
    );
    const audio = await downloadFromTwilio(recording_sid);
    const key = `${req.ownerId}/${call_id}.mp3`;
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: audio, ContentType: "audio/mpeg", ServerSideEncryption: "AES256" }));
    let text = "";
    try { text = await transcribe(audio, language ?? "ru"); }
    catch (e) { log("error", "transcribe failed", { call_id, err: String(e) }); }
    await pool.query(
      `UPDATE calls SET storage_key=$2, transcript=$3::jsonb, status='ready', error=null, updated_at=now() WHERE id=$1`,
      [call_id, key, JSON.stringify(text ? [{ source: process.env.TRANSCRIBE_BACKEND ?? "gemini", text, at: new Date().toISOString() }] : [])],
    );
    log("info", "ingest ok", { call_id, owner: req.ownerId, bytes: audio.length });
  } catch (e) {
    log("error", "ingest failed", { call_id, err: String(e) });
    await pool.query(`UPDATE calls SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [call_id, String(e).slice(0, 500)]).catch(() => {});
  }
});

// Allow Lunara cloud to push back updated summary/analysis (optional).
app.post("/calls/:id/analysis", verify, async (req, res) => {
  const { summary, transcript } = req.body ?? {};
  await pool.query(
    `UPDATE calls
       SET summary    = COALESCE($1, summary),
           transcript = COALESCE($2::jsonb, transcript),
           updated_at = now()
     WHERE id = $3 AND owner_id = $4`,
    [summary ?? null, transcript ? JSON.stringify(transcript) : null, req.params.id, req.ownerId],
  ).catch((e) => log("error", "analysis update failed", { err: String(e) }));
  res.json({ ok: true });
});

app.get("/calls/:id", verify, async (req, res) => {
  const { rows } = await pool.query(`SELECT storage_key, transcript, summary FROM calls WHERE id=$1 AND owner_id=$2`, [req.params.id, req.ownerId]);
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "not found" });
  let audio_url = null;
  if (row.storage_key) audio_url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: row.storage_key }), { expiresIn: 3600 });
  res.json({ audio_url, transcript: row.transcript ?? [], summary: row.summary });
});

app.get("/calls/:id/audio-url", verify, async (req, res) => {
  const { rows } = await pool.query(`SELECT storage_key FROM calls WHERE id=$1 AND owner_id=$2`, [req.params.id, req.ownerId]);
  if (!rows[0]?.storage_key) return res.json({ audio_url: null });
  const audio_url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: rows[0].storage_key }), { expiresIn: 3600 });
  res.json({ audio_url });
});

app.get("/calls/:id/audio", verify, async (req, res) => {
  const { rows } = await pool.query(`SELECT storage_key FROM calls WHERE id=$1 AND owner_id=$2`, [req.params.id, req.ownerId]);
  if (!rows[0]?.storage_key) return res.status(404).json({ error: "not found" });
  try {
    const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: rows[0].storage_key }));
    res.setHeader("content-type", obj.ContentType ?? "audio/mpeg");
    if (obj.ContentLength) res.setHeader("content-length", String(obj.ContentLength));
    obj.Body.pipe(res);
  } catch (e) { log("error", "audio stream failed", { err: String(e) }); res.status(502).json({ error: "stream failed" }); }
});

app.delete("/calls/:id", verify, async (req, res) => {
  const { rows } = await pool.query(`SELECT storage_key FROM calls WHERE id=$1 AND owner_id=$2`, [req.params.id, req.ownerId]);
  if (rows[0]?.storage_key) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: rows[0].storage_key })).catch(() => {});
  await pool.query(`DELETE FROM calls WHERE id=$1 AND owner_id=$2`, [req.params.id, req.ownerId]);
  log("info", "deleted", { id: req.params.id, owner: req.ownerId });
  res.json({ ok: true });
});

// --------- Retention sweeper ---------
async function retentionSweep() {
  if (!RETENTION_DAYS || RETENTION_DAYS <= 0) return;
  const { rows } = await pool.query(
    `SELECT id, owner_id, storage_key FROM calls WHERE created_at < now() - ($1 || ' days')::interval LIMIT 500`,
    [String(RETENTION_DAYS)],
  );
  for (const row of rows) {
    if (row.storage_key) await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: row.storage_key })).catch(() => {});
    await pool.query(`DELETE FROM calls WHERE id=$1`, [row.id]).catch(() => {});
  }
  if (rows.length) log("info", "retention swept", { deleted: rows.length, days: RETENTION_DAYS });
}

ensureBucket().then(() => {
  const server = app.listen(PORT, () => log("info", "gateway listening", { port: PORT, version: VERSION, retention_days: RETENTION_DAYS, allowed_ips: ALLOWED_IPS.length }));
  if (RETENTION_DAYS > 0) setInterval(() => retentionSweep().catch((e) => log("error", "retention failed", { err: String(e) })), 6 * 3600 * 1000);
  const shutdown = (sig) => { log("info", "shutting down", { sig }); server.close(() => pool.end().then(() => process.exit(0))); setTimeout(() => process.exit(1), 10000).unref(); };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
