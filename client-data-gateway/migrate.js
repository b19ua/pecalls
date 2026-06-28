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
  meta      JSONB NOT NULL DEFAULT '{}'::jsonb,
  prev_hash TEXT,
  hash      TEXT
);
CREATE INDEX IF NOT EXISTS audit_owner_ts ON audit_log(owner_id, ts DESC);

CREATE TABLE IF NOT EXISTS gateway_users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  role          TEXT NOT NULL DEFAULT 'operator',
  department    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- GDPR / on-prem mirror of cloud: agents, knowledge, transcripts
-- ============================================================

CREATE TABLE IF NOT EXISTS agents (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  name         TEXT,
  kind         TEXT,                    -- 'voice' | 'copilot' | 'agent'
  snapshot     JSONB NOT NULL,          -- full prompt + voice + behavior + tools
  version      INTEGER NOT NULL DEFAULT 1,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agents_owner ON agents(owner_id);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  agent_id     TEXT,
  name         TEXT,
  mime         TEXT,
  bytes        INTEGER NOT NULL DEFAULT 0,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kd_owner_agent ON knowledge_documents(owner_id, agent_id);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  owner_id      TEXT NOT NULL,
  agent_id      TEXT,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  embedding     JSONB,                  -- float[] kept as JSON for portability (no pgvector required on-prem)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kc_owner_agent ON knowledge_chunks(owner_id, agent_id);
CREATE INDEX IF NOT EXISTS kc_doc ON knowledge_chunks(document_id);

CREATE TABLE IF NOT EXISTS dsr_requests (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  kind         TEXT NOT NULL,           -- export | erase
  status       TEXT NOT NULL DEFAULT 'pending',
  result       JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS dsr_owner ON dsr_requests(owner_id, created_at DESC);
`;

const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
await c.query(sql);
await c.end();
console.log("[migrate] done");
