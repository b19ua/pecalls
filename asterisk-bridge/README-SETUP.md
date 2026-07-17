# Lunara Asterisk Bridge — установка на сервер клиента (3 шага)

Скрипт для сервера, где **Asterisk 20.x уже установлен и работает** (донастройка,
не переустановка). Ни существующие транки, ни существующие контексты диалплана
не будут затронуты — скрипт делает backup и APPEND-ит блоки с маркером
`# --- Lunara AI managed block ---`.

## Шаг 1 — скопировать папку `asterisk-bridge/` на сервер

```bash
# любым способом: git clone / scp / rsync
scp -r asterisk-bridge/ root@your-asterisk-server:/opt/lunara-bridge/
ssh root@your-asterisk-server
cd /opt/lunara-bridge

cp setup.env.example setup.env
nano setup.env    # заполните GEMINI_API_KEY и SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY` спросите у администратора платформы Lunara — этот
ключ не хранится в репозитории и не подставляется автоматически.

## Шаг 2 — запустить установщик

```bash
sudo bash setup.sh
```

Что скрипт сделает:

1. Проверит, что установлен Asterisk 20.x (иначе остановится с понятной ошибкой).
2. Проверит наличие модулей `res_audiosocket.so` / `chan_audiosocket.so` /
   `res_ari.so`. Если модули не скомпилированы — распечатает инструкцию,
   как их доустановить (пересборка Asterisk скриптом НЕ делается —
   слишком рискованно на живом сервере).
3. Включит модули в `modules.conf` (backup + APPEND), загрузит их через
   `module load` без рестарта Asterisk.
4. Допишет ARI-пользователя в `ari.conf` (backup + APPEND). Если `ARI_PASSWORD`
   в `setup.env` пуст — сгенерирует случайный.
5. Допишет контексты `[from-provider]`, `[from-lunara]`, `[lunara-outcome]` в
   `extensions.conf` (backup + APPEND), сделает `dialplan reload`.
6. Установит Docker + docker-compose-plugin, если их нет.
7. Соберёт и запустит мост через `docker compose up -d --build`.
8. Установит systemd-unit `lunara-asterisk-bridge.service` для автозапуска.

По умолчанию **сам Asterisk не рестартуется**. Если хотите полный рестарт
(например, тестовый сервер) — запустите `sudo bash setup.sh --restart`.

В конце скрипт распечатает блок **«СКОПИРУЙ ЭТО В LOVABLE»** с готовыми
значениями: ARI base URL, ARI username/password, AudioSocket host:port,
webhook secret (для post-recording скрипта).

## Шаг 3 — добавить SIP-транк и вписать значения в Lovable

### 3a. SIP-транк провайдера (вручную)

Это ваши учётные данные — скрипт их НЕ запрашивает. Добавьте в `pjsip.conf`
блок endpoint'а (пример 1-в-1 из основного `README.md`):

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

После правки: `sudo asterisk -rx "pjsip reload"`.

Имя endpoint'а (`provider-endpoint`) пойдёт в UI Lunara как **Trunk** —
Lunara подставит номер: `PJSIP/provider-endpoint/+373...`.

### 3b. UI Lovable → агент → режим Asterisk

Откройте агента в Lovable, выберите **Telephony provider = Asterisk** и
вставьте значения, распечатанные `setup.sh`:

- **ARI base URL** — например `http://10.0.0.5:8088`
- **ARI username / password** — из вывода скрипта
- **AudioSocket host:port** — например `10.0.0.5:8090`
- **Trunk** — `PJSIP/provider-endpoint` (из шага 3a)
- **Caller ID** — ваш выходной номер
- **Webhook secret** — сгенерируйте кнопкой «Сгенерировать» и вставьте в
  `/etc/lunara/webhook-secret` на сервере (используется post-hook скриптом
  загрузки MixMonitor-записей).

После этого шага звонок должен проходить сквозно — **сделайте тестовый звонок
и проверьте таблицу `calls` в Supabase** (или страницу `/calls` в Lunara).
