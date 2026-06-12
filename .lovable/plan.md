This is a very large change (multi-tenant rebuild + new telephony stack). I'll do it in ordered phases. After each phase I'll tell you exactly what to configure on your VPS. Confirm the plan and I'll start with Phase 0 + 1.

## Phase 0 — Fix human handoff (Twilio, current stack)

Problem: trigger phrases don't fire, "handoff numbers" field saves but call never transfers.

Fix in `supabase/functions/voice-call-bridge/index.ts`:
- Normalize transcript: lowercase, strip diacritics + punctuation, collapse whitespace — match against same-normalized phrase list (current code only partially does this).
- On match: pick first valid `handoff_numbers[]` entry, issue Twilio `<Dial>` TwiML update via REST `POST /Calls/{sid}.json` with `Twiml=<Response><Dial>+E164</Dial></Response>`, then mark call `status='transferred'`.
- DTMF digit handoff: same path on matching digit.
- Add structured log lines (`[handoff] match phrase=… number=…`) so we can verify in edge function logs.

Fix in `src/routes/_authenticated/agents.$agentId.tsx`:
- Tag-input for `handoff_numbers` with E.164 validation, "Add" button, can't save empty triggers when handoff enabled.
- Persist via existing `saveAgent` (schema already accepts arrays).

Verification: I'll deploy and curl-trigger `report-call` simulating a transcript chunk containing a trigger phrase; confirm Twilio REST update fires (logged) and DB row goes to `transferred`.

## Phase 1 — Database schema (multi-tenant)

New tables with RLS + GRANTs in a single migration:
`operators`, `sip_trunks`, `dispatch_rules`, `clients`, `usage_daily`.
Extend existing tables:
- `profiles`: add `role` enum (`super_admin|operator_admin|client_user`), `operator_id`.
- `agents`: add `operator_id`, `client_id`, `gemini_voice`, `transfer_number`, `knowledge_base` (text — separate from existing RAG), `tools_config jsonb`, `max_call_duration_sec`.
- `calls`: add `operator_id`, `room_name`, `sip_call_id`, `trunk_id`.

Security-definer fn `current_operator_id()` + `has_role()` (already exists) drive RLS. First registered user → `super_admin` (update existing `handle_new_user` trigger).

## Phase 2 — LiveKit edge functions

New Supabase edge functions (Deno, `verify_jwt=false` only where needed):
- `livekit-token-helper` (shared module): HS256 JWT signing via `jose` for Twirp + room tokens.
- `create-sip-trunk`, `update-sip-trunk`, `delete-sip-trunk`
- `create-dispatch-rule`, `delete-dispatch-rule`
- `get-agent-config` (bearer = `AGENT_WORKER_TOKEN`)
- `report-call` (bearer = `AGENT_WORKER_TOKEN`) — upserts `calls` by `room_name`, increments `usage_daily`, handles `transferred` event
- `livekit-webhook` (public, signature-verified) — fallback close
- `create-test-token` (auth'd user) — returns `{token, livekit_url}` for browser test

All operator-scoped endpoints check caller JWT role + `operator_id` matches.
Secrets needed (I'll request via `add_secret`):
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_SIP_HOST`, `AGENT_NAME`, `AGENT_WORKER_TOKEN`.

## Phase 3 — Super-admin area (`/admin`)

Role-aware sidebar. Pages:
- Operators list + create/edit/suspend, `max_concurrent_calls`.
- Global dashboard: active calls (5s poll), 30d minutes chart, top operators.
- Global call log.
- Worker integration docs page with copyable snippets + `AGENT_WORKER_TOKEN` reveal/regenerate.

## Phase 4 — Operator area (`/dashboard`)

- Overview (active calls, today, monthly minutes vs plan).
- **SIP Trunks** 3-step wizard: name+auth → review → success card with one-time password, copy buttons, dynamic Asterisk/FreeSWITCH/generic SBC config snippets.
- **Agents** CRUD with all new fields (Gemini voice select, transfer_number, KB textarea, max duration). "Test in browser" modal using `livekit-client` SDK (`bun add livekit-client`) → mic, mute, hangup, live state. "Routing" tab → pick trunk → `create-dispatch-rule`.
- **Clients** CRUD.
- **Call log** drawer with chat-style transcript + summary.
- **Settings** + team invites.

## Phase 5 — Polish

- i18n strings for new screens (ru default, en).
- Mobile responsive checks.
- Empty states with "what is this" copy.
- Local-tz timestamps, `mm:ss` durations.
- Concurrency soft-limit banner.

## VPS configuration steps (I'll repeat after each phase)

After Phase 2: set in `livekit.yaml` →
`webhook.urls: [https://<project>.supabase.co/functions/v1/livekit-webhook]`
`webhook.api_key: <LIVEKIT_API_KEY>`
On agent-worker env: `SUPABASE_FUNCTIONS_URL`, `AGENT_WORKER_TOKEN`, register with `agent_name="ai-support"`, read `room.metadata.agent_id`, GET `/get-agent-config`, POST lifecycle to `/report-call`.

## Technical notes

- LiveKit Twirp: `POST {LIVEKIT_URL https}/twirp/livekit.SIP/CreateSIPInboundTrunk` etc, Authorization Bearer = HS256 JWT with `{video:{roomCreate,roomAdmin:true}, sip:{admin:true}}`.
- Trunk passwords: store `auth_password_encrypted` (pgcrypto `pgp_sym_encrypt` with `ENCRYPTION_KEY` secret), return plaintext only from `create-sip-trunk` response.
- Webhook verify: LiveKit sends Authorization JWT with `sha256` claim = base64(sha256(body)) — verify with HS256 against `LIVEKIT_API_SECRET`.
- Keep existing Twilio + Gemini-Live stack untouched; LiveKit becomes a parallel inbound/outbound path. Agents get `channel` field (`twilio|livekit|both`) so existing single-tenant flow keeps working.

## What I need from you to start

1. Approve this plan.
2. Confirm the brand name (`PLATFORM_NAME`) and `AGENT_NAME` (default `ai-support`).
3. Have your LiveKit `API_KEY` / `API_SECRET` / `wss URL` / `SIP host` ready — I'll request them via the secrets form right before Phase 2 (not now).

Once approved I'll start with Phase 0 (handoff fix) + Phase 1 (schema migration) in the same turn.