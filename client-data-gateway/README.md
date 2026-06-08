# Lunara — Client Data Gateway (reference implementation)

A self-hosted micro-service that receives call recordings & metadata from
Lunara's cloud and stores them entirely **on your infrastructure**.
In this mode Lunara's database keeps only the call ID and technical status;
audio and transcripts never touch Lunara's storage.

## Architecture

```
┌──────────────┐    POST /calls/ingest (HMAC-signed)
│ Lunara cloud │ ───────────────────────────────────────► ┌────────────────────────┐
└──────────────┘                                          │ Client Data Gateway    │
                                                          │  - Node API            │
                                                          │  - PostgreSQL          │
                                                          │  - MinIO (S3)          │
                                                          │  - Whisper / Gemini    │
       Lunara UI ──── GET /calls/:id  (HMAC-signed) ────► │   (your choice)        │
                                                          └────────────────────────┘
                                                                    ▲
                                                                    │ pulls MP3 from Twilio
                                                                    ▼
                                                              Twilio Recording API
```

## Endpoints

All requests are signed by Lunara with HMAC-SHA256 using
`LUNARA_HMAC_SECRET` (shared with Lunara through the **Data residency** tab):

```
x-lunara-owner:      <uuid>
x-lunara-timestamp:  <unix seconds>
x-lunara-signature:  hex(HMAC_SHA256(secret, ts \n METHOD \n PATH \n BODY))
```

Reject requests with clock skew > 5 minutes.

| Method | Path                       | Purpose                                                                  |
| ------ | -------------------------- | ------------------------------------------------------------------------ |
| GET    | `/health`                  | Liveness — returns `{ ok: true }`.                                       |
| POST   | `/calls/ingest`            | Lunara hands off a finished call. Body: `{ call_id, twilio_call_sid, recording_sid, recording_url, duration_seconds, language }`. Gateway downloads MP3, transcribes, stores. |
| GET    | `/calls/:id`               | Returns `{ audio_url, transcript[], summary }`. Used by Lunara UI.       |
| GET    | `/calls/:id/audio-url`     | Returns `{ audio_url }` — short-lived signed link to MP3.                |
| DELETE | `/calls/:id`               | Hard-delete (optional retention job).                                    |

## Deploy

```bash
cp .env.example .env   # fill LUNARA_HMAC_SECRET, TWILIO creds, GEMINI_API_KEY (or USE_LOCAL_WHISPER=1)
docker compose up -d
```

Expose `http://<host>:8080` to Lunara (public HTTPS via your reverse proxy,
or a private tunnel with a routable hostname). Paste that URL + the secret
into Lunara → **Data residency**, hit **Test connection**.

## Transcription

Two interchangeable backends, picked by env:

- `TRANSCRIBE_BACKEND=gemini` (default) — calls Google Generative Language API.
- `TRANSCRIBE_BACKEND=whisper` — calls a local Whisper service
  (`docker compose --profile whisper up`). Use this if cloud AI is forbidden.

## Storage

Audio → MinIO bucket `call-recordings`, key `<owner>/<call_id>.mp3`.
Transcripts & summaries → PostgreSQL table `calls`.

## Security checklist

- [ ] TLS in front of the gateway.
- [ ] Restrict ingress to Lunara's source IPs if known.
- [ ] Rotate `LUNARA_HMAC_SECRET` periodically (update in Lunara UI and `.env` together).
- [ ] Daily PostgreSQL backups; MinIO versioning.
- [ ] Set retention via the `RETENTION_DAYS` env (optional cron deletes older rows + objects).
