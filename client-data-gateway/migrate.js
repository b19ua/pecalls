import pg from "pg";
const { Client } = pg;

const sql = `
CREATE TABLE IF NOT EXISTS calls (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL,
  twilio_call_sid TEXT,
  recording_sid   TEXT,
  storage_key     TEXT,
  duration_sec    INTEGER NOT NULL DEFAULT 0,
  language        TEXT,
  transcript      JSONB  NOT NULL DEFAULT '[]'::jsonb,
  summary         TEXT,
  sentiment       TEXT,
  topics          TEXT[] NOT NULL DEFAULT '{}',
  status          TEXT   NOT NULL DEFAULT 'pending',
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calls_owner_created ON calls(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS calls_retention ON calls(created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGSERIAL PRIMARY KEY,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_id  TEXT,
  action    TEXT NOT NULL,
  target_id TEXT,
  meta      JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_owner_ts ON audit_log(owner_id, ts DESC);
`;

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(sql);
await c.end();
console.log("[migrate] done");
