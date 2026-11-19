#!/usr/bin/env bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# Neutral example; problem __4iR4FkFAGS.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ME="$HERE/setup-example.sh"
LANGUAGE=en
CRED=${KEY_SETUP_CRED_DIR:-$HOME/.config/mole-office-key-example}
FILE="$CRED/example.key"
PREFIX=example_
MIN=16
titles=('Prepare a private folder' 'Confirm the example account' 'Save the example key' 'Check the private file')
minutes=(1 1 1 1)
. "$HERE/common.sh"
parse_options "$@"

step1() {
  head_of 1
  printf 'The example key goes in %s, outside the project.\n' "$CRED"
  go 'Ready to prepare the folder?'
  out=$(check folder "$CRED" 2>&1) || stop 1 "$out"
  printf '%s\n' "$out"
}
step2() {
  head_of 2
  printf '%s\n' 'This example has no provider; use an invented key beginning with example_.'
  yes_no 'Are you ready to use an invented example key?' || stop 2 'Confirm the example account before continuing.'
}
step3() {
  head_of 3
  printf '%s\n' 'Paste only the invented key here; input is hidden.' 'Never send a key in chat or a message, store it in the database, or print it.'
  save_secret 'Example key'
}
step4() {
  head_of 4
  go 'Ready to check the file without contacting a provider?'
  out=$(KEY_SETUP_LANG="$LANGUAGE" "$NODE" "$HERE/trial.mjs" example "$FILE" "$PREFIX" "$MIN" 2>&1) || stop 4 "$out"
  printf '%s\n' "$out"
}

printf '%s\n' 'Example setup: four steps, about four minutes; q leaves at any prompt.'
run_steps
