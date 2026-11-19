#!/usr/bin/env bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
set +x +v +a
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ME="$HERE/setup-provider.sh"
NODE=${KEY_SETUP_NODE:-node}
LANGUAGE=${KEY_SETUP_LANG:-zh}
if [ "${1:-}" = --providers ]; then exec "$NODE" "$HERE/provider-command.mjs" providers; fi
PROVIDER=${1:-}
[ -n "$PROVIDER" ] || { printf '%s\n' 'Choose a provider. Use --providers to see the list.'; exit 2; }
shift
if [ "$PROVIDER" = custom ]; then
  CUSTOM_NAME=${1:-}
  [ -n "$CUSTOM_NAME" ] || { printf '%s\n' 'Give the custom key a name.'; exit 2; }
  shift
  PROVIDER="custom:$CUSTOM_NAME"
fi
field() { KEY_SETUP_LANG="$LANGUAGE" "$NODE" "$HERE/provider-command.mjs" field "$PROVIDER" "$1"; }
NAME=$(field name) || exit 1
FOLDER=$(field folder) || exit 1
FILENAME=$(field file) || exit 1
PREFIX=$(field prefix) || exit 1
MIN=$(field min) || exit 1
CRED=${KEY_SETUP_CRED_DIR:-$HOME/.config/$FOLDER}
FILE="$CRED/$FILENAME"
if [ "$LANGUAGE" = zh ]; then
  titles=('准备私有文件夹' '创建受限密钥' '隐藏输入并保存密钥' '只读试跑')
else
  titles=('Prepare a private folder' 'Create a restricted key' 'Save the hidden key' 'Run the read-only trial')
fi
minutes=(1 5 1 1)
. "$HERE/common.sh"
resume() {
  printf '%s' "$MSG_RESUME"
  if [[ "$PROVIDER" == custom:* ]]; then printf 'bash %q custom %q --from %s\n' "$ME" "${PROVIDER#custom:}" "$1"
  else printf 'bash %q %q --from %s\n' "$ME" "$PROVIDER" "$1"; fi
}
parse_options "$@"
step1() {
  head_of 1
  if [ "$LANGUAGE" = zh ]; then printf '私有文件夹：%s。\n' "$CRED"; go '按回车准备文件夹'; else printf 'The private folder is %s.\n' "$CRED"; go 'Press Enter to prepare it'; fi
  out=$(check folder "$CRED" 2>&1) || stop 1 "$out"
  printf '%s\n' "$out"
}
step2() {
  head_of 2
  if [[ "$PROVIDER" == custom:* ]]; then
    if [ "$LANGUAGE" = zh ]; then
      printf '%s\n' '请在提供商处创建密钥。自定义密钥没有提供商专属说明或远程试跑。'
      yes_no '已创建密钥吗？' || stop 2 '请先创建密钥。'
    else
      printf '%s\n' 'Create the key with your provider. This custom key has no provider-specific instructions or trial.'
      yes_no 'Have you created the key?' || stop 2 'Create the key before continuing.'
    fi
    return
  fi
  if [ "$LANGUAGE" = zh ]; then printf '在目标账号中打开 %s：%s\n' "$NAME" "$(field page)"; else printf 'Open %s in the intended account: %s\n' "$NAME" "$(field page)"; fi
  field instructions
  field otherPermissionsOff
  field expiry
  if [ "$LANGUAGE" = zh ]; then
    printf '最低权限：%s\n' "$(field scopes)"
    printf '页面名称来自文档，没有登录核对：%s；如果页面不同，请问%s。\n' "$(field documentation)" "$CONTACT"
    confirm=$(field confirm); failure=$(field confirmationFailure)
    yes_no "${confirm:-已核对账号和权限吗？}" || stop 2 "${failure:-请先核对账号和权限。}"
  else
    printf 'Minimum permissions: %s\n' "$(field scopes)"
    printf 'The page names come from documentation and have not been checked by logging in: %s\n' "$(field documentation)"
    printf 'If the page differs, ask %s.\n' "$CONTACT"
    confirm=$(field confirm); failure=$(field confirmationFailure)
    yes_no "${confirm:-Have you checked the account and permissions?}" || stop 2 "${failure:-Check the account and permissions before continuing.}"
  fi
}
step3() {
  head_of 3
  if [ "$LANGUAGE" = zh ]; then printf '%s\n' '粘贴密钥本身，输入不会显示；不要把密钥放进聊天或记录。'; else printf '%s\n' 'Paste the key itself. Input is hidden; do not put it in chat or a record.'; fi
  if [ -n "$PREFIX" ]; then
    if [ "$LANGUAGE" = zh ]; then printf '只复制以 %s 开头的密钥。\n' "$PREFIX"; else printf 'Copy only the key beginning with %s.\n' "$PREFIX"; fi
  fi
  if [ "$LANGUAGE" = zh ]; then save_secret "$NAME 密钥"; else save_secret "$NAME key"; fi
}
step4() {
  head_of 4
  field trialDescription
  if [ "$LANGUAGE" = zh ]; then go '按回车试跑'; else go 'Press Enter to run the check'; fi
  out=$(KEY_SETUP_LANG="$LANGUAGE" "$NODE" "$HERE/provider-command.mjs" trial "$PROVIDER" "$FILE" 2>&1) || stop 4 "$out"
  printf '%s\n' "$out"
}
run_steps
