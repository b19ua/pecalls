# Lunara Asterisk Bridge

On-premise мост между локальным Asterisk (chan_audiosocket) и Gemini Live.
Функциональный паритет с Twilio-режимом Lunara: приём/исходящие звонки,
запись, транскрипция, hand-off — всё через ваш Asterisk, без Twilio и без
jambonz.

Мост НЕ ходит напрямую в БД платформы. Все чтения/записи идут через
публичный REST на Lovable (`/api/public/bridge/*`), аутентификация — per-agent
webhook secret, сгенерированный в UI редактора агента. Никаких ключей уровня
платформы (типа Supabase service-role) на сервере клиента не хранится.

## Требования

* Asterisk **18+** с модулями `res_audiosocket.so` и `chan_audiosocket.so`
  (в стоке AsteriskNow / Debian-пакетах уже есть).
* Docker + docker-compose на том же хосте, что и Asterisk (или на любом
  хосте, доступном Asterisk по TCP).
* Открытый порт (по умолчанию `8090/tcp`) от Asterisk до этого сервиса.

## Быстрый старт (ручной, для одного мостa)

Проще всего использовать `setup.sh` — см. `README-SETUP.md`. Для ручного запуска:

```bash
cp .env.example .env
# заполните GEMINI_API_KEY, LOVABLE_AGENT_ID, LOVABLE_WEBHOOK_SECRET
docker compose up -d --build
docker compose logs -f
```

Сервис слушает `AUDIOSOCKET_PORT` (8090). Дальше настраиваем Asterisk.

## Конфиг Asterisk

### `pjsip.conf` (пример: транк к PSTN-провайдеру + endpoint для входящих)

```ini
;--- outbound trunk to PSTN provider ---
[provider-reg]
type=registration
outbound_auth=provider-auth
server_uri=sip:sip.provider.example
client_uri=sip:USERNAME@sip.provider.example

[provider-auth]
type=auth
auth_type=userpass
username=USERNAME
password=PASSWORD

[provider-aor]
type=aor
contact=sip:sip.provider.example

[provider-endpoint]
type=endpoint
transport=transport-udp
context=from-provider
disallow=all
allow=alaw
allow=ulaw
outbound_auth=provider-auth
aors=provider-aor
from_user=USERNAME

[provider-identify]
type=identify
endpoint=provider-endpoint
match=sip.provider.example
```

Такой endpoint используем в UI агента как `asterisk_trunk`:
`PJSIP/provider-endpoint` (Lunara подставит номер: `PJSIP/provider-endpoint/+373...`).

### `extensions.conf` (диалплан)

Единственный поддерживаемый способ — прямой `AudioSocket()` без Stasis.
ARI используется только для placement исходящего канала; медиа всегда идёт
через `AudioSocket()` в этот сервис. Оба контекста (входящие от провайдера и
исходящие, доставленные ARI) используют идентичный паттерн.

```ini
[globals]
LUNARA_BRIDGE=bridge-host:8090   ; host:port сервиса asterisk-bridge

;--- входящие от провайдера ---
[from-provider]
exten => _X.,1,NoOp(Incoming ${EXTEN} from ${CALLERID(num)})
 same => n,Answer()
 same => n,Set(LUNARA_UUID=${UNIQUEID})
 same => n,Set(LUNARA_CALLERID=${CALLERID(num)})
 same => n,MixMonitor(/var/spool/asterisk/monitor/${LUNARA_UUID}.wav,ab)
 same => n,AudioSocket(${LUNARA_UUID},${LUNARA_BRIDGE})
 same => n,Goto(lunara-outcome,s,1)

;--- контекст, куда ARI кидает исходящий канал ---
;    LUNARA_UUID приходит из ARI variables, задавать заново не нужно
[from-lunara]
exten => _X.,1,NoOp(Lunara outbound to ${EXTEN} uuid=${LUNARA_UUID})
 same => n,Answer()
 same => n,Set(LUNARA_CALLERID=${CALLERID(num)})
 same => n,MixMonitor(/var/spool/asterisk/monitor/${LUNARA_UUID}.wav,ab)
 same => n,AudioSocket(${LUNARA_UUID},${LUNARA_BRIDGE})
 same => n,Goto(lunara-outcome,s,1)
```

### Диалплан для hand-off (обязателен, если включён перевод на оператора)

Мост НЕ инициирует Dial() сам — это ненадёжно и требует держать состояние
в ARI/Stasis. Вместо этого мост:

1. Находит канал в ARI по channel-var `LUNARA_UUID`.
2. Устанавливает канал-переменную `LUNARA_HANDOFF_TARGET=<номер оператора>`.
3. Закрывает AudioSocket (0x00 TERM) — `AudioSocket()` в диалплане
   возвращается. Дальше решает **диалплан клиента** через `lunara-outcome`,
   куда оба контекста выше уже делают `Goto`:

```ini
[lunara-outcome]
exten => s,1,NoOp(Lunara outcome target='${LUNARA_HANDOFF_TARGET}')
 same => n,GotoIf($["${LUNARA_HANDOFF_TARGET}" = ""]?end)
 ; замените provider-endpoint на ваш trunk; g = вернуться в диалплан после Dial
 same => n,Dial(PJSIP/${LUNARA_HANDOFF_TARGET}@provider-endpoint,30,g)
 same => n(end),Hangup()
```

Работает даже если ARI недоступен: мост просто разорвёт AudioSocket, канал
попадёт в `lunara-outcome`, увидит пустую `LUNARA_HANDOFF_TARGET` и повесит
трубку — ни одного «зависшего» канала.

## Как это работает

1. **Исходящий**: Lunara вызывает ARI `POST /ari/channels` с endpoint
   `PJSIP/provider-endpoint/+373...` и параметрами `context="from-lunara"`,
   `extension=<набираемый номер>`, `priority=1`; каналу задаётся переменная
   `LUNARA_UUID` (наш call id). Никакого Stasis — Asterisk дозванивается и
   сразу исполняет диалплан `[from-lunara]`, где `AudioSocket()` открывает
   TCP-соединение к нашему мосту и шлёт PCM 8kHz.
2. **Входящий**: провайдер шлёт вызов в `from-provider` → тот же диалплан.
3. **Медиа**: мост принимает slin16 20ms кадры (заголовок 1+2 байта),
   ресемплит 8k→16k → Gemini Live; ответ 24k → 8k → назад в AudioSocket.
4. **Запись** (per-agent secret, НЕ общий env): в UI редактора агента
   сгенерируйте секрет кнопкой «Сгенерировать» — он показывается один раз,
   уникален для этого агента, храните на Asterisk-хосте (например в
   `/etc/lunara/webhook-secret`). Post-hook загружает файл в Lunara:

   ```bash
   curl -sSf -X POST \
     -H "X-Asterisk-Secret: $(cat /etc/lunara/webhook-secret)" \
     -F "call_uuid=${LUNARA_UUID}" \
     -F "file=@/var/spool/asterisk/monitor/${LUNARA_UUID}.wav" \
     https://lunara.now/api/public/asterisk/recording
   ```

   Настройте это в `MixMonitor(..., ab, /usr/local/bin/lunara-upload.sh ^{LUNARA_UUID})`.
   Endpoint аутентифицирует запрос ПО КОНКРЕТНОМУ АГЕНТУ (находит `calls.agent_id`
   по `call_uuid` и сверяет секрет с `agents.asterisk_webhook_secret`).
   Файл сохраняется в bucket `call-recordings` по пути
   `asterisk/${owner_id}/${call_uuid}.wav` — готов к RLS/retention.
5. **Hand-off**: DTMF, совпадающий с `handoff_dtmf_digit` агента, триггерит
   ARI-запись `LUNARA_HANDOFF_TARGET` и закрытие AudioSocket; диалплан
   (см. `lunara-outcome` выше) сам делает `Dial()`. `calls.handoff_at` /
   `handoff_to` обновляются в БД.

## Проверка

```bash
asterisk -rvvv
core show help audiosocket
module show like audiosocket
```

Оба модуля должны быть загружены.

## Безопасность

* ARI пароль и креды провайдера храните в `.env` этого сервиса, они per-owner
  (в БД `agents.asterisk_ari_*`) — не общие на всё окружение.
* Webhook-секрет — тоже per-owner (`agents.asterisk_webhook_secret`),
  генерируется/ротируется из UI Lunara; никаких общих env-переменных.
* Порт `8090` открывайте только для Asterisk-хоста (iptables / security group).
* MixMonitor-файлы удаляйте по retention policy клиента.

