# Lunara Asterisk Bridge

On-premise мост между локальным Asterisk (chan_audiosocket) и Gemini Live через
Supabase. Функциональный паритет с Twilio-режимом Lunara: приём/исходящие звонки,
запись, транскрипция, hand-off — всё через ваш Asterisk, без Twilio и без
jambonz.

## Требования

* Asterisk **18+** с модулями `res_audiosocket.so` и `chan_audiosocket.so`
  (в стоке AsteriskNow / Debian-пакетах уже есть).
* Docker + docker-compose на том же хосте, что и Asterisk (или на любом
  хосте, доступном Asterisk по TCP).
* Открытый порт (по умолчанию `8090/tcp`) от Asterisk до этого сервиса.

## Быстрый старт

```bash
cp .env.example .env
# заполните SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
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

```ini
[globals]
LUNARA_BRIDGE=bridge-host:8090   ; host:port сервиса asterisk-bridge

;--- входящие от провайдера ---
[from-provider]
exten => _X.,1,NoOp(Incoming ${EXTEN} from ${CALLERID(num)})
 same => n,Answer()
 same => n,Set(LUNARA_UUID=${UNIQUEID})
 same => n,MixMonitor(/var/spool/asterisk/monitor/${LUNARA_UUID}.wav,ab)
 same => n,Stasis(lunara,${LUNARA_UUID})
 same => n,Hangup()

;--- контекст, куда ARI кидает исходящий канал ---
[from-lunara]
exten => _X.,1,NoOp(Lunara outbound to ${EXTEN})
 same => n,Answer()
 same => n,MixMonitor(/var/spool/asterisk/monitor/${LUNARA_UUID}.wav,ab)
 same => n,Stasis(lunara,${LUNARA_UUID})
 same => n,Hangup()
```

Stasis-приложение `lunara` — это наш bridge (запущен как ARI-клиент? нет: в этой
схеме ARI используется только для placement, а медиа мы получаем через
`AudioSocket()`). Простейший вариант диалплана без ARI-Stasis:

```ini
[from-lunara]
exten => _X.,1,Answer()
 same => n,Set(LUNARA_UUID=${LUNARA_UUID})
 same => n,MixMonitor(/var/spool/asterisk/monitor/${LUNARA_UUID}.wav,ab)
 same => n,AudioSocket(${LUNARA_UUID},${LUNARA_BRIDGE})
 same => n,Hangup()
```

Тогда в UI Lunara вместо Stasis app просто оставьте `lunara` (значение не
используется) и убедитесь, что `LUNARA_BRIDGE` в globals указывает на этот
сервис.

## Как это работает

1. **Исходящий**: Lunara вызывает ARI `POST /ari/channels` с endpoint
   `PJSIP/provider-endpoint/+373...`, `app=lunara`, каналу задаётся переменная
   `LUNARA_UUID` (наш call id). Asterisk дозванивается → канал попадает в
   `from-lunara` → `AudioSocket()` открывает TCP-соединение к нашему мосту и
   шлёт PCM 8kHz.
2. **Входящий**: провайдер шлёт вызов в `from-provider` → тот же диалплан.
3. **Медиа**: мост принимает slin16 20ms кадры (заголовок 1+2 байта),
   ресемплит 8k→16k → Gemini Live; ответ 24k → 8k → назад в AudioSocket.
4. **Запись**: `MixMonitor` пишет `.wav` локально; post-hook загружает файл в
   Lunara через:

   ```bash
   curl -sSf -X POST \
     -H "X-Asterisk-Secret: $ASTERISK_WEBHOOK_SECRET" \
     -F "call_uuid=${LUNARA_UUID}" \
     -F "file=@/var/spool/asterisk/monitor/${LUNARA_UUID}.wav" \
     https://pecalls.lovable.app/api/public/asterisk/recording
   ```

   Настройте это в `MixMonitor(..., ab, /usr/local/bin/lunara-upload.sh ^{LUNARA_UUID})`.
5. **Hand-off**: DTMF-фрейм (тип 0x03), совпадающий с `handoff_dtmf_digit`
   агента, триггерит ARI-originate на первый номер из `handoff_numbers` в тот
   же Stasis-app; поля `calls.handoff_at` / `handoff_to` обновляются.

## Проверка

```bash
asterisk -rvvv
core show help audiosocket
module show like audiosocket
```

Оба модуля должны быть загружены.

## Безопасность

* ARI пароль и креды провайдера храните в `.env` (не в клиентском бандле).
* Порт `8090` открывайте только для Asterisk-хоста (iptables / security group).
* MixMonitor-файлы удаляйте по retention policy клиента.
