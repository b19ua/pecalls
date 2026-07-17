#!/usr/bin/env bash
# =============================================================================
# Lunara Asterisk Bridge — one-shot installer
# -----------------------------------------------------------------------------
# Требования на целевом сервере:
#   * Asterisk 20.x УЖЕ установлен и работает (скрипт НЕ переустанавливает)
#   * Модули res_audiosocket.so, chan_audiosocket.so, res_ari.so скомпилированы
#     (иначе скрипт распечатает инструкцию и остановится)
#   * root или sudo
#
# Что делает:
#   1) Детектит Asterisk 20 и нужные модули
#   2) Включает модули в modules.conf (backup + APPEND), module load без рестарта
#   3) APPEND-ит ARI-пользователя в ari.conf (backup, случайный пароль если нет)
#   4) APPEND-ит контексты [from-provider]/[from-lunara]/[lunara-outcome] в
#      extensions.conf (backup), dialplan reload
#   5) Ставит Docker + compose plugin если их нет
#   6) Собирает и запускает asterisk-bridge (docker compose)
#   7) Ставит systemd unit для автозапуска
#   8) Печатает готовые значения для вставки в UI Lunara
#
# Флаги:
#   --restart       Полный core restart Asterisk после правок (иначе только
#                   module load + dialplan reload — без обрыва живых звонков)
#   -h | --help     Помощь
# =============================================================================

set -euo pipefail

RESTART_ASTERISK=0
for arg in "$@"; do
  case "$arg" in
    --restart) RESTART_ASTERISK=1 ;;
    -h|--help)
      sed -n '1,40p' "$0"; exit 0 ;;
    *) echo "Unknown arg: $arg"; exit 2 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/setup.env"
BRIDGE_ENV="${SCRIPT_DIR}/.env"
MARKER_START="# --- Lunara AI managed block, do not edit below ---"
MARKER_END="# --- End Lunara AI managed block ---"
TS="$(date +%Y%m%d-%H%M%S)"

ETC_AST="/etc/asterisk"

log()  { printf "\033[1;36m[lunara]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[lunara]\033[0m %s\n" "$*" >&2; }
die()  { printf "\033[1;31m[lunara ERROR]\033[0m %s\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 0. sudo / root
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
  die "Запустите под root: sudo bash setup.sh"
fi

# ---------------------------------------------------------------------------
# 1. setup.env
# ---------------------------------------------------------------------------
[[ -f "$ENV_FILE" ]] || die "Нет $ENV_FILE. Скопируйте: cp setup.env.example setup.env && отредактируйте."
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${GEMINI_API_KEY:?GEMINI_API_KEY пуст в setup.env}"
: "${SUPABASE_URL:?SUPABASE_URL пуст в setup.env}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY пуст в setup.env (спросите у администратора Lunara)}"
ARI_USERNAME="${ARI_USERNAME:-lunara}"
AUDIOSOCKET_PORT="${AUDIOSOCKET_PORT:-8090}"

gen_hex() { head -c 32 /dev/urandom | od -An -vtx1 | tr -d ' \n'; }

if [[ -z "${ARI_PASSWORD:-}" ]]; then
  ARI_PASSWORD="$(gen_hex)"
  log "ARI_PASSWORD не задан — сгенерирован случайный."
fi
WEBHOOK_SECRET="$(gen_hex)"

# ---------------------------------------------------------------------------
# 2. Asterisk 20 detect
# ---------------------------------------------------------------------------
command -v asterisk >/dev/null || die "Asterisk не найден в PATH. Этот скрипт для сервера с уже установленным Asterisk 20.x."
AST_V="$(asterisk -V 2>/dev/null || true)"
log "Обнаружено: ${AST_V:-неизвестно}"
if ! grep -Eq 'Asterisk 20\.' <<<"$AST_V"; then
  die "Этот скрипт для Asterisk 20.x, обнаружено: '${AST_V}'. Обновите/понизьте Asterisk или запросите поддержку другой версии."
fi

# CLI helper
ast_cli() { asterisk -rx "$*" 2>/dev/null || true; }

# ---------------------------------------------------------------------------
# 3. Модули: res_audiosocket, chan_audiosocket, res_ari
# ---------------------------------------------------------------------------
missing_modules=()
for mod_pattern in "audiosocket" "res_ari"; do
  out="$(ast_cli "module show like ${mod_pattern}")"
  if ! grep -qi "${mod_pattern}" <<<"$out"; then
    missing_modules+=("$mod_pattern")
  fi
done

need_modules=(res_audiosocket.so chan_audiosocket.so res_ari.so res_ari_channels.so res_http_websocket.so)
missing_so=()
mod_show_all="$(ast_cli "module show")"
for m in "${need_modules[@]}"; do
  if ! grep -q "$m" <<<"$mod_show_all"; then
    # Не загружен, но, может, есть .so на диске?
    if ! find /usr/lib*/asterisk/modules /usr/local/lib*/asterisk/modules -maxdepth 1 -name "$m" 2>/dev/null | grep -q .; then
      missing_so+=("$m")
    fi
  fi
done

if (( ${#missing_so[@]} > 0 )); then
  cat >&2 <<EOF

[lunara ERROR] Отсутствуют скомпилированные модули Asterisk:
  ${missing_so[*]}

Скрипт НЕ пересобирает Asterisk автоматически (рискованно на живом сервере).
Как доустановить (выберите вариант, подходящий вашей установке):

  Debian/Ubuntu (пакетный Asterisk):
    apt install asterisk-modules
    # если пакетов недостаточно — потребуется пересборка из исходников
    # с опциями: menuselect → Channel Drivers → chan_audiosocket
    #                       Resource Modules → res_audiosocket, res_ari*, res_http_websocket

  Исходники (обычно /usr/src/asterisk-20*):
    cd /usr/src/asterisk-20.*.*
    make menuselect          # включить chan_audiosocket + res_audiosocket + res_ari*
    make -j\$(nproc) && make install && make samples
    systemctl restart asterisk

После установки модулей запустите этот скрипт снова.
EOF
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. modules.conf — включить load => ... (APPEND, backup)
# ---------------------------------------------------------------------------
MODULES_CONF="${ETC_AST}/modules.conf"
if [[ ! -f "$MODULES_CONF" ]]; then
  die "Не найден $MODULES_CONF — установка Asterisk выглядит неполной."
fi

if ! grep -q "$MARKER_START" "$MODULES_CONF"; then
  cp -a "$MODULES_CONF" "${MODULES_CONF}.bak-${TS}"
  log "Backup: ${MODULES_CONF}.bak-${TS}"
  cat >> "$MODULES_CONF" <<EOF

${MARKER_START}
load => res_http_websocket.so
load => res_ari.so
load => res_ari_channels.so
load => res_audiosocket.so
load => chan_audiosocket.so
${MARKER_END}
EOF
  log "modules.conf: добавлены load => для AudioSocket / ARI"
else
  log "modules.conf уже содержит Lunara-блок — пропускаю"
fi

# module load — без core restart
for m in res_http_websocket.so res_ari.so res_ari_channels.so res_audiosocket.so chan_audiosocket.so; do
  ast_cli "module load $m" >/dev/null
done
log "module load выполнен (без рестарта Asterisk)"

# ---------------------------------------------------------------------------
# 5. ari.conf — включить ARI HTTP + APPEND [lunara] user
# ---------------------------------------------------------------------------
ARI_CONF="${ETC_AST}/ari.conf"
touch "$ARI_CONF"

if ! grep -q "$MARKER_START" "$ARI_CONF"; then
  cp -a "$ARI_CONF" "${ARI_CONF}.bak-${TS}"
  log "Backup: ${ARI_CONF}.bak-${TS}"
  cat >> "$ARI_CONF" <<EOF

${MARKER_START}
[general]
enabled = yes
pretty = yes
allowed_origins = *

[${ARI_USERNAME}]
type = user
read_only = no
password = ${ARI_PASSWORD}
${MARKER_END}
EOF
  log "ari.conf: добавлен пользователь [${ARI_USERNAME}]"
else
  warn "ari.conf уже содержит Lunara-блок. Пароль/пользователя не меняю."
  warn "Если нужно ротировать — удалите блок между маркерами и перезапустите setup.sh."
fi

# http.conf — ARI требует HTTP-сервер Asterisk
HTTP_CONF="${ETC_AST}/http.conf"
touch "$HTTP_CONF"
if ! grep -q "$MARKER_START" "$HTTP_CONF"; then
  cp -a "$HTTP_CONF" "${HTTP_CONF}.bak-${TS}"
  cat >> "$HTTP_CONF" <<EOF

${MARKER_START}
[general]
enabled=yes
bindaddr=0.0.0.0
bindport=8088
${MARKER_END}
EOF
  log "http.conf: включён HTTP-сервер на 0.0.0.0:8088 (для ARI)"
fi

ast_cli "module reload res_http_websocket.so" >/dev/null
ast_cli "module reload res_ari.so" >/dev/null

# ---------------------------------------------------------------------------
# 6. extensions.conf — APPEND диалплан
# ---------------------------------------------------------------------------
EXT_CONF="${ETC_AST}/extensions.conf"
if [[ ! -f "$EXT_CONF" ]]; then
  die "Не найден $EXT_CONF"
fi

# Определим адрес моста: если Asterisk на этом же хосте — 127.0.0.1
BRIDGE_HOST_DEFAULT="127.0.0.1"
if ! grep -q "$MARKER_START" "$EXT_CONF"; then
  cp -a "$EXT_CONF" "${EXT_CONF}.bak-${TS}"
  log "Backup: ${EXT_CONF}.bak-${TS}"
  cat >> "$EXT_CONF" <<EOF

${MARKER_START}
[globals]
LUNARA_BRIDGE=${BRIDGE_HOST_DEFAULT}:${AUDIOSOCKET_PORT}

;--- входящие от провайдера ---
[from-provider]
exten => _X.,1,NoOp(Lunara incoming \${EXTEN} from \${CALLERID(num)})
 same => n,Answer()
 same => n,Set(LUNARA_UUID=\${UNIQUEID})
 same => n,MixMonitor(/var/spool/asterisk/monitor/\${LUNARA_UUID}.wav,ab)
 same => n,AudioSocket(\${LUNARA_UUID},\${LUNARA_BRIDGE})
 same => n,Goto(lunara-outcome,s,1)

;--- контекст, куда ARI кидает исходящий канал ---
[from-lunara]
exten => _X.,1,NoOp(Lunara outbound to \${EXTEN} uuid=\${LUNARA_UUID})
 same => n,Answer()
 same => n,MixMonitor(/var/spool/asterisk/monitor/\${LUNARA_UUID}.wav,ab)
 same => n,AudioSocket(\${LUNARA_UUID},\${LUNARA_BRIDGE})
 same => n,Goto(lunara-outcome,s,1)

;--- hand-off: если мост через ARI выставил LUNARA_HANDOFF_TARGET —
;    Dial() на оператора; иначе Hangup(). Замените PJSIP/... на ваш trunk.
[lunara-outcome]
exten => s,1,NoOp(Lunara outcome target='\${LUNARA_HANDOFF_TARGET}')
 same => n,GotoIf(\$["\${LUNARA_HANDOFF_TARGET}" = ""]?end)
 same => n,Dial(PJSIP/\${LUNARA_HANDOFF_TARGET},30,g)
 same => n(end),Hangup()
${MARKER_END}
EOF
  log "extensions.conf: добавлены [from-provider] / [from-lunara] / [lunara-outcome]"
else
  log "extensions.conf уже содержит Lunara-блок — пропускаю"
fi

ast_cli "dialplan reload" >/dev/null
log "dialplan reload выполнен"

# ---------------------------------------------------------------------------
# 7. Docker + compose plugin
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null; then
  log "Устанавливаю Docker..."
  curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  log "Устанавливаю docker-compose-plugin..."
  if command -v apt-get >/dev/null; then
    apt-get update -y && apt-get install -y docker-compose-plugin
  elif command -v dnf >/dev/null; then
    dnf install -y docker-compose-plugin
  else
    die "Не могу автоматически поставить docker-compose-plugin — установите вручную."
  fi
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# ---------------------------------------------------------------------------
# 8. .env для моста + docker compose up
# ---------------------------------------------------------------------------
cat > "$BRIDGE_ENV" <<EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
GEMINI_API_KEY=${GEMINI_API_KEY}
AUDIOSOCKET_PORT=${AUDIOSOCKET_PORT}
EOF
chmod 600 "$BRIDGE_ENV"
log "Записан ${BRIDGE_ENV} (chmod 600)"

log "Собираю и поднимаю asterisk-bridge (docker compose up -d --build)..."
( cd "$SCRIPT_DIR" && docker compose up -d --build )

# ---------------------------------------------------------------------------
# 9. systemd unit
# ---------------------------------------------------------------------------
UNIT=/etc/systemd/system/lunara-asterisk-bridge.service
cat > "$UNIT" <<EOF
[Unit]
Description=Lunara Asterisk Bridge (docker compose)
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${SCRIPT_DIR}
ExecStart=/usr/bin/docker compose up -d --build
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable lunara-asterisk-bridge.service >/dev/null
log "systemd: lunara-asterisk-bridge.service — enabled (автозапуск при ребуте)"

# ---------------------------------------------------------------------------
# 10. Опционально: полный рестарт Asterisk
# ---------------------------------------------------------------------------
if (( RESTART_ASTERISK == 1 )); then
  warn "Флаг --restart: делаю core restart Asterisk (оборвутся текущие живые звонки)."
  ast_cli "core restart now" >/dev/null || systemctl restart asterisk || true
else
  log "Asterisk НЕ рестартован (только module load + dialplan reload)."
  log "Если хотите полный рестарт — запустите: sudo bash setup.sh --restart"
fi

# ---------------------------------------------------------------------------
# 11. Финальный вывод
# ---------------------------------------------------------------------------
HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[[ -n "$HOST_IP" ]] || HOST_IP="<IP-этого-сервера>"

cat <<EOF

===============================================================
  СКОПИРУЙ ЭТО В LOVABLE (агент → Telephony provider = Asterisk)
===============================================================

  ARI base URL          : http://${HOST_IP}:8088
  ARI username          : ${ARI_USERNAME}
  ARI password          : ${ARI_PASSWORD}

  AudioSocket host:port : ${HOST_IP}:${AUDIOSOCKET_PORT}

  Webhook secret        : ${WEBHOOK_SECRET}
   (сохраните на сервере в /etc/lunara/webhook-secret и
    используйте в post-hook загрузки MixMonitor-записей)

  Trunk (пример)        : PJSIP/provider-endpoint
   (добавьте endpoint SIP-провайдера в pjsip.conf вручную —
    см. README-SETUP.md, шаг 3a)

===============================================================

Проверка моста:
  docker compose -f ${SCRIPT_DIR}/docker-compose.yml logs -f

Проверка Asterisk:
  asterisk -rx "module show like audiosocket"
  asterisk -rx "ari show users"
  asterisk -rx "dialplan show from-lunara"

После добавления SIP-транка провайдера сделайте тестовый звонок и
проверьте таблицу calls в Supabase (или страницу /calls в Lunara).
EOF

# Сохраним webhook secret для удобства (root-only)
mkdir -p /etc/lunara
echo "$WEBHOOK_SECRET" > /etc/lunara/webhook-secret
chmod 600 /etc/lunara/webhook-secret
log "Webhook secret также сохранён в /etc/lunara/webhook-secret (chmod 600)"
