## Проблема

`asterisk-bridge/server.ts` ходит напрямую в Supabase REST под `SERVICE_ROLE_KEY`, поэтому `setup.sh` требует его в `setup.env`. На Lovable Cloud этот ключ клиенту недоступен в принципе — платформа его не выдаёт. Значит `setup.sh` нельзя выполнить, и Asterisk не подключается.

## Решение

Мост больше не обращается к Supabase напрямую. Все чтения/записи идут через **новый публичный REST на Lovable** (`/api/public/bridge/*`), аутентификация — HMAC-подписью **per-agent webhook secret**'ом (`agents.asterisk_webhook_secret`, поле уже есть). Клиенту нужны только: `GEMINI_API_KEY` и этот webhook-secret (он уже показывается в UI агента). `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` из установки исчезают.

## Что делаем

### 1. Новые публичные роуты (все под `/api/public/bridge/*`, HMAC-Auth)

Общая схема аутентификации: заголовки `X-Bridge-Agent: <agentId>`, `X-Bridge-Timestamp: <unix>`, `X-Bridge-Signature: hex(HMAC_SHA256(secret, ts + "." + rawBody))`. `secret` = `agents.asterisk_webhook_secret`. `ts` не старше 5 минут. `timingSafeEqual`. При неуспехе — 401.

Роуты (все делают чистые операции через `supabaseAdmin`, загружаемый динамически внутри хендлера):

- `POST /api/public/bridge/context` — вход `{ agentId }`. Загружает `agents`, `data_residency_configs`, `agent_tools`, knowledge chunks (та же логика, что была в `loadContext`). Возвращает весь `ExtCtx`, кроме секретов CRM2 hmac (нельзя светить наружу): вместо `crm2Full.hmacSecret` возвращаем `crm2_hmac_configured: true`, а сам HMAC-запрос идёт через отдельный роут (см. ниже) — CRM2 secret никогда не покидает Lovable.
- `POST /api/public/bridge/call/init` — `{ callSid }` → `{ agentId }` из `calls`, апдейт `status=in_progress`, `started_at`.
- `POST /api/public/bridge/call/transcript` — `{ callSid, transcript, status? }` → PATCH `calls`.
- `POST /api/public/bridge/call/finalize` — `{ callSid, status, transcript, summary?, tokens? }` → закрывает звонок.
- `POST /api/public/bridge/call/handoff` — `{ callSid, handoffTo }` → PATCH `handoff_at/handoff_to/status`.
- `POST /api/public/bridge/objection` — вставка `objection_events`.
- `POST /api/public/bridge/crm2` — прокси на CRM2 URL owner-а: сервер сам собирает HMAC-подпись (owner-у не отправляем секрет), делает запрос к клиентскому CRM2 URL, применяет тот же circuit breaker и rate-limit "1 тикет / звонок" (состояние в памяти воркера — best-effort). Возвращает результат.
- `POST /api/public/bridge/summary` — `{ callSid, transcript }` → генерит summary через Lovable AI (Gemini) и пишет в `calls`. Убирает необходимость держать generateSummary в мосте, но оставим fallback в мосте если этот роут не ответит.

CRM1 (`get_local_system_data`) и обычные `webhook`-tools мост **вызывает сам** — это уже клиентские URL, никаких секретов Lovable не требуется. CRM2 — единственный, где HMAC-secret хранится на Lovable, поэтому именно этот вызов проксируется.

### 2. Рефактор `asterisk-bridge/server.ts`

- Удаляем `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `sb()` / `sbRpc()`.
- Новая env: `LOVABLE_BASE_URL` (default `https://pecalls.lovable.app`), `LOVABLE_AGENT_ID`, `LOVABLE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `AUDIOSOCKET_PORT`.
- Helper `bridgeCall(path, body)` — подписывает HMAC, POST-ит на `LOVABLE_BASE_URL/api/public/bridge/<path>`.
- `loadContext` → один запрос `bridge/context`.
- `persistTranscript` → `bridge/call/transcript`.
- `cleanup` → `bridge/call/finalize` (+ отдельный `bridge/summary`).
- `logObjection` / `callCrm2` → соответствующие роуты. `callCrm1` и `executeWebhookTool` — как есть (прямой fetch к клиентским URL).
- Один мост = один агент (проще HMAC). Если у клиента несколько агентов на одном Asterisk — поднимает несколько инстансов моста с разными env. Это упрощение оправдано: клиент почти всегда работает с одним AI-агентом.

### 3. `setup.env.example`

Оставляем только:
```
GEMINI_API_KEY=
LOVABLE_BASE_URL=https://pecalls.lovable.app
LOVABLE_AGENT_ID=            # UUID агента, скопировать из Lovable
LOVABLE_WEBHOOK_SECRET=      # из UI агента (кнопка «Сгенерировать секрет»)
ARI_USERNAME=lunara
ARI_PASSWORD=
AUDIOSOCKET_PORT=8090
```

### 4. `setup.sh`

Убираем проверку `SUPABASE_SERVICE_ROLE_KEY` и `SUPABASE_URL`. Добавляем проверку `LOVABLE_AGENT_ID` / `LOVABLE_WEBHOOK_SECRET`. `.env` для docker-compose пишем с новыми ключами. Финальный блок «СКОПИРУЙ В LOVABLE» — тот же список ARI/AudioSocket, но убираем упоминание service-role.

### 5. `README-SETUP.md`

Шаг 1 переписываем: клиент открывает в Lovable нужного агента, копирует `Agent ID` и генерирует Webhook secret, вставляет в `setup.env`. Никаких «спросите админа платформы» — секретов, которых у клиента нет, больше не требуется.

### 6. Проверка

- `bunx tsgo` — типы TanStack Start routes.
- Playwright headless: залогиниться под тестовым юзером (через `LOVABLE_BROWSER_SUPABASE_*`), открыть страницу агента, скопировать webhook secret из DOM, дернуть `curl` на `/api/public/bridge/context` с валидной HMAC — ожидаем 200 и полезный JSON. Дернуть с испорченной подписью — ожидаем 401.
- Локальный запуск `asterisk-bridge/server.ts` в Deno с dummy env против preview-URL: убеждаемся, что `bridge/context` возвращает контекст (без прямого доступа к БД).

## Технические детали / инварианты

- `agents.asterisk_webhook_secret` уже существует и уже используется в `/api/public/asterisk/recording`. Переиспользуем его.
- `supabaseAdmin` импортируем **динамически внутри хендлера** каждого нового роута (правило проекта: файлы `src/routes/**` — client-reachable).
- Circuit breaker CRM2 в новом роуте — Map в памяти воркера, ключ `owner_id`. При рестарте сбрасывается — приемлемо.
- CRM2 rate-limit «1 тикет на звонок» переносим в БД: уникальный индекс по `(call_sid, ticket_kind='emergency')` в таблице `tickets` уже есть — используем его как источник истины вместо in-memory Map.
- Никаких изменений схемы БД не требуется.

## Файлы

Новые:
- `src/routes/api/public/bridge/_shared.ts` — HMAC verify helper
- `src/routes/api/public/bridge/context.ts`
- `src/routes/api/public/bridge/call.init.ts`
- `src/routes/api/public/bridge/call.transcript.ts`
- `src/routes/api/public/bridge/call.finalize.ts`
- `src/routes/api/public/bridge/call.handoff.ts`
- `src/routes/api/public/bridge/objection.ts`
- `src/routes/api/public/bridge/crm2.ts`
- `src/routes/api/public/bridge/summary.ts`

Правим:
- `asterisk-bridge/server.ts` — убираем прямой Supabase, всё через HMAC-прокси
- `asterisk-bridge/setup.env.example`
- `asterisk-bridge/setup.sh`
- `asterisk-bridge/README-SETUP.md`
- `asterisk-bridge/README.md` (env-таблица)
