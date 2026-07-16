# Lunara Asterisk End-to-End Test Stand

Готовый docker-compose-стенд, который поднимает **Asterisk 20 + Lunara AudioSocket
bridge** локально и позволяет прогнать сквозной AI-звонок без Twilio и без PSTN.

Работает так:

1. Asterisk слушает SIP на `5060/udp` (extension `9999`, без пароля, только с
   loopback — для теста).
2. Экстеншен `9999` в диалплане выполняет
   `AudioSocket(${UNIQUEID}, bridge:8090)` → соединяется с Lunara-мостом
   (сервис `bridge` в этой же compose-сети).
3. Мост загружает первого активного агента с `telephony_provider='asterisk'`
   из Supabase, поднимает Gemini Live сессию и стримит аудио в обе стороны.
4. Транскрипт и статус пишутся в таблицу `calls` (call id = `${UNIQUEID}`).

## Требования

- Docker + docker-compose
- В Supabase уже создан агент с `telephony_provider='asterisk'` и заполнены
  `system_prompt`, `greeting`, `voice`, `model`.
- Секреты: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`.

## Запуск

```bash
cd asterisk-bridge/stand
cp .env.example .env   # заполнить креды
docker compose up -d --build
docker compose logs -f bridge
```

Проверьте, что мост слушает:

```
[lunara] AudioSocket bridge listening on :8090
```

## Тестовый звонок

Вариант A — через SIP-клиент (Zoiper / Linphone / Baresip):
- Сервер: `127.0.0.1:5060`, транспорт UDP, без auth.
- User: `test`.
- Позвонить на `9999`.

Вариант B — через ARI originate (без SIP-клиента, полностью автономно):

```bash
docker compose exec asterisk asterisk -rx \
  "channel originate Local/9999@lunara-test application Echo"
```

Смотрите логи:

```bash
docker compose logs -f asterisk bridge
```

В Supabase → таблица `calls` появится строка со статусом `in_progress` →
`completed` и транскриптом.

## Что дальше

- Заменить `Local/9999@...` на реальный PSTN-транк и указать его в UI
  агента (поле `asterisk_trunk`).
- Настроить `MixMonitor` + post-hook на webhook `POST /api/public/asterisk/recording`
  (см. `asterisk-bridge/README.md`).
- Пробросить hand-off DTMF-цифру (в UI агента: `handoff_dtmf_digit`).
