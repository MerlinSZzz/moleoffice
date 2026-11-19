#!/usr/bin/env bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# Guided setup; prevents problem __4iR4FkFAGS.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ME="$HERE/setup-digitalocean.sh"
LANGUAGE=zh
NODE=${KEY_SETUP_NODE:-node}
field() { KEY_SETUP_LANG="$LANGUAGE" "$NODE" "$HERE/provider-command.mjs" field digitalocean "$1"; }
FOLDER=$(field folder) || exit 1
FILENAME=$(field file) || exit 1
CRED=${KEY_SETUP_CRED_DIR:-$HOME/.config/$FOLDER}
FILE="$CRED/$FILENAME"
PREFIX=$(field prefix) || exit 1
MIN=$(field min) || exit 1
titles=('建一个私有密钥文件夹' '生成有限权限、有到期日的个人令牌' '隐藏输入并保存令牌' '只读试跑：检查账号')
minutes=(1 5 1 1)
. "$HERE/common.sh"
parse_options "$@"

step1() {
  head_of 1
  printf '令牌放在 %s，文件夹权限是 700，只有你自己能进。\n' "$CRED"
  go '准备好了就按回车'
  out=$(check folder "$CRED" 2>&1) || stop 1 "$out"
  printf '%s\n' "$out"
}
step2() {
  head_of 2
  printf '在目标账号中打开：%s\n' "$(field page)"
  field instructions
  field scopes
  field otherPermissionsOff
  field expiry
  printf '页面和按钮名称来自文档，没有登录核对过：%s；页面不同时请问%s。\n' "$(field documentation)" "$CONTACT"
  yes_no "$(field confirm)" || stop 2 "$(field confirmationFailure)"
}

step3() {
  head_of 3
  printf '只复制 %s 开头的令牌本身，不带空格或引号；贴完按回车，屏幕不会显示它。\n' "$PREFIX"
  printf '%s\n' \
    '令牌不能放进聊天、消息或数据库，也不能打印出来。'
  save_secret 'DigitalOcean 个人令牌'
}
step4() {
  head_of 4
  printf '%s\n' '我只发送 GET /v2/account，把文件里的令牌放在请求头，不放进命令行或网址。' \
    '这次试跑不创建、修改或删除服务器，也不能证明所有服务器操作都已授权。'
  go '准备好了就按回车'
  out=$(KEY_SETUP_LANG="$LANGUAGE" "$NODE" "$HERE/trial.mjs" digitalocean "$FILE" "$PREFIX" "$MIN" 2>&1) || stop 4 "$out"
  printf '%s\n' "$out"
}

printf '%s\n' 'DigitalOcean 设置：共 4 步，约 8 分钟；每个提示都可以输入 q 退出，用 --from 接着做。'
run_steps
