#!/usr/bin/env bash
# Ежедневный дамп MySQL в /backups с ротацией по сроку хранения.
# Запускается в контейнере mysql:8.4 — mysqldump той же версии, что и сервер.
set -uo pipefail

DB="${MYSQL_DATABASE:-lifeboard}"
HOST="${MYSQL_HOST:-mysql}"
AT="${BACKUP_AT:-03:00}"
KEEP="${BACKUP_KEEP_DAYS:-14}"
DIR=/backups

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

dump() {
  local base="$DIR/${DB}-$(date '+%Y%m%d-%H%M%S').sql"
  local out="$base"
  log "дамп базы $DB"
  if command -v gzip >/dev/null 2>&1; then
    out="$base.gz"
    mysqldump --host="$HOST" --user=root --single-transaction --quick \
      --routines --triggers --events --no-tablespaces \
      --default-character-set=utf8mb4 "$DB" 2>/tmp/dump.err | gzip -9 >"$out.tmp"
  else
    mysqldump --host="$HOST" --user=root --single-transaction --quick \
      --routines --triggers --events --no-tablespaces \
      --default-character-set=utf8mb4 "$DB" 2>/tmp/dump.err >"$out.tmp"
  fi
  # ненулевой размер и отсутствие ошибок mysqldump
  if [ "${PIPESTATUS[0]}" = 0 ] && [ -s "$out.tmp" ]; then
    mv "$out.tmp" "$out"
    log "готово: $out ($(du -h "$out" | cut -f1))"
  else
    rm -f "$out.tmp"
    log "ОШИБКА: $(tail -3 /tmp/dump.err 2>/dev/null)"
    return 1
  fi
  # ротация
  find "$DIR" -maxdepth 1 -name "${DB}-*.sql*" -type f -mtime "+$KEEP" -print -delete |
    while read -r old; do log "удалена старая копия: $old"; done
}

seconds_until() {
  local target now
  now=$(date +%s)
  target=$(date -d "today $AT" +%s 2>/dev/null) || target=$((now + 86400))
  [ "$target" -le "$now" ] && target=$(date -d "tomorrow $AT" +%s)
  echo $((target - now))
}

log "старт: база=$DB хост=$HOST время=$AT хранить=$KEEP дней"
# первый дамп сразу — чтобы ошибка в настройках не выяснилась через сутки
dump || log "первый дамп не удался, попробую по расписанию"
while true; do
  s=$(seconds_until)
  log "следующий дамп через $((s / 60)) мин"
  sleep "$s"
  dump || log "дамп не удался, следующая попытка по расписанию"
done
