# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# Sourced by every adaptation. Problem __4iR4FkFAGS.
# Caller sets HERE, ME, titles, minutes, CRED, FILE, PREFIX, MIN and optionally LANGUAGE.
set +x +v +a
CUR=1
FROM=1
LAST=${#titles[@]}
NODE=${KEY_SETUP_NODE:-node}
LANGUAGE=${LANGUAGE:-en}
CONTACT=${KEY_SETUP_CONTACT:-the person who provided this script}
unset SECRET
SECRET=''

if [ "$LANGUAGE" = zh ]; then
  MSG_STOP='这一步没成功：'
  MSG_RESUME='接着做：'
  MSG_QUIT='好，先退出。'
  MSG_EOF='没有收到输入，先退出。'
  MSG_GO='（回车继续，q 退出）'
  MSG_YN='请输入 y 或 n。'
  MSG_REPLACE='已经有一个密钥文件了，要替换吗？'
  MSG_KEEP='保留现在的文件。'
  MSG_FROM='--from 后面要写步骤范围内的整数；--list 可以看每一步。'
  MSG_OPTION='选项无效；请用 --from N、--list 或 --help。'
  MSG_SAVE_FIRST='还没有保存密钥；先回到第 3 步保存密钥，再试跑。'
else
  MSG_STOP='This step did not work: '
  MSG_RESUME='Resume with: '
  MSG_QUIT='Stopping for now. '
  MSG_EOF='Input ended; stopping. '
  MSG_GO=' (Enter to continue, q to quit) '
  MSG_YN='Please answer y or n.'
  MSG_REPLACE='A key file already exists; replace it?'
  MSG_KEEP='Keeping the existing file.'
  MSG_FROM='Use a whole step number after --from; --list shows the steps.'
  MSG_OPTION='Invalid options; use --from N, --list or --help.'
  MSG_SAVE_FIRST='No key has been saved yet; returning to step 3 to save it before the trial.'
fi

check() { KEY_SETUP_LANG="$LANGUAGE" "$NODE" "$HERE/keycheck.mjs" "$@"; }
resume() { printf '%s' "$MSG_RESUME"; printf 'bash %q --from %s\n' "$ME" "$1"; }
stop() { printf '\n%s%s\n' "$MSG_STOP" "$2"; resume "$1"; exit 1; }
leave() { printf '\n%s' "$1"; resume "$CUR"; exit "$2"; }

read_line() {
  if ! IFS= read -r ANS; then leave "$MSG_EOF" 1; fi
  case "$ANS" in q|Q) leave "$MSG_QUIT" 0 ;; esac
}
go() {
  while :; do
    printf '%s%s' "$1" "$MSG_GO"
    read_line
    [ -z "$ANS" ] && return 0
  done
}
yes_no() {
  while :; do
    printf '%s [y/n, q] ' "$1"
    read_line
    case "$ANS" in y|Y|yes|YES|是) return 0 ;; n|N|no|NO|否) return 1 ;; esac
    printf '%s\n' "$MSG_YN"
  done
}
read_secret() {
  printf '%s: ' "$1" >&2
  if ! IFS= read -r -s SECRET; then leave "$MSG_EOF" 1; fi
  printf '\n' >&2
  case "$SECRET" in q|Q) SECRET=''; leave "$MSG_QUIT" 0 ;; esac
}
head_of() {
  CUR=$1
  local estimate=${2:-${minutes[$(($1-1))]}}
  if [ "$LANGUAGE" = zh ]; then
    printf '\n=== 第 %s 步 / 共 %s 步：%s（约 %s 分钟）===\n' "$1" "$LAST" "${titles[$(($1-1))]}" "$estimate"
  else
    # 3glux5orTv2k: one minute is "about 1 minute".
    local unit=minutes
    [ "$estimate" = 1 ] && unit=minute
    printf '\n=== Step %s of %s: %s (about %s %s) ===\n' "$1" "$LAST" "${titles[$(($1-1))]}" "$estimate" "$unit"
  fi
}
parse_options() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --from)
        [ "$#" -ge 2 ] || { printf '%s\n' "$MSG_FROM"; exit 2; }
        FROM=$2; shift 2 ;;
      --list)
        for ((i=1; i<=LAST; i++)); do printf '%s. %s (~%s min)\n' "$i" "${titles[$((i-1))]}" "${minutes[$((i-1))]}"; done
        resume 1; exit 0 ;;
      -h|--help) printf 'bash %q [--from N] [--list]\n' "$ME"; exit 0 ;;
      *) printf '%s\n' "$MSG_OPTION"; exit 2 ;;
    esac
  done
  # Compare against actual step numbers rather than doing arithmetic on untrusted input.
  for ((i=1; i<=LAST; i++)); do [ "$FROM" = "$i" ] && return 0; done
  printf '%s\n' "$MSG_FROM"; exit 2
}
save_secret() {
  local out rc
  out=$(check folder "$CRED" 2>&1) || stop "$CUR" "$out"
  if [ -e "$FILE" ] || [ -L "$FILE" ]; then
    out=$(check file "$FILE" 2>&1) || stop "$CUR" "$out"
    printf '%s\n' "$out"
    yes_no "$MSG_REPLACE" || { printf '%s\n' "$MSG_KEEP"; return 0; }
  fi
  read_secret "$1"
  out=$(builtin printf '%s\n' "$SECRET" | check write "$FILE" --prefix "$PREFIX" --min "$MIN" 2>&1); rc=$?
  SECRET=''
  [ "$rc" -eq 0 ] || stop "$CUR" "$out"
  printf '%s\n' "$out"
  out=$(check file "$FILE" 2>&1) || stop "$CUR" "$out"
  printf '%s\n' "$out"
}
run_steps() {
  # 3glux5orTv2k; PFXqjfLKEsqi: a resumed trial needs a saved key; our stale parts are cleared at start.
  if [ "$FROM" -gt 3 ] && [ ! -e "$FILE" ] && [ ! -L "$FILE" ]; then
    printf '%s\n' "$MSG_SAVE_FIRST"
    FROM=3
  fi
  resume "$FROM"
  if [ -d "$CRED" ] || [ -L "$CRED" ]; then
    local out
    out=$(check clean "$CRED" 2>&1) || stop "$FROM" "$out"
    [ -z "$out" ] || printf '%s\n' "$out"
  fi
  for ((n=FROM; n<=LAST; n++)); do "step$n"; done
}
