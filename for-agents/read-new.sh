#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# read-new.sh <out file>
#
# Print what the waiter's out file gained since the last read point, and move the read point
# forward in a way that can be undone. The script writes the size it read up to into
# <out file>.read-offset.pending. mark-read.sh <out file> then makes that pending size the read
# point in <out file>.read-offset.
#
# WHERE THE OUT FILE MAY BE. It must be an absolute path under ~/.cache/mole-office (chapter 3 of
# the office regulations: nothing an agent makes goes into the owner's home outside that folder).
# A bare name used to be taken as given, and twice it put the offset files into the owner's
# checkout. The folder holding the out file must exist, and its real path must be the cache folder
# or lie under it, so a `..` that climbs out, or a link that points outside, is refused too. A
# refusal is one line on stderr and exit 2, before anything is read or written.
#
# WHY TWO STEPS. A session reads the new blocks, handles every one, and only then marks them read.
# If a message arrives between the read and the mark, the read point stays at the size that was
# read, so the next read prints the new message instead of skipping it. The read point is the size
# read, never the size at marking.
#
# WHAT IT PRINTS. Everything the out file gained, line for line. It leaves out no line, because a
# block of words that happens to start like the tool's own chatter is still a block of words, and one
# lost message costs more than a few repeated lines. A key value is not printed: the value after
# MOLE_AGENT_KEY= is replaced with (withheld). The line itself stays, because a message may only
# name the variable and dropping that line would lose the message.
#
# THIS SCRIPT DELETES NOTHING. It reads and it writes two small files beside the out file.
set -u
OUT="${1:?give the waiter out file}"

# THE ONE PLACE THE OUT FILE'S FOLDER IS CHECKED, BEFORE ANYTHING IS READ OR WRITTEN. HOME must be
# set, $HOME/.cache/mole-office must exist, the out file must be an absolute path, and the folder
# holding it must be that cache folder or lie under it after links and `..` are resolved.
SCRIPT=read-new.sh
CACHE_NAMED='$HOME/.cache/mole-office'
CACHE_REAL=''
refuse() {
  if [ -n "$CACHE_REAL" ]; then
    WHERE="$CACHE_NAMED (the real path $CACHE_REAL)"
  else
    WHERE="$CACHE_NAMED"
  fi
  printf '%s\n' "$SCRIPT: refusing the out file \"$OUT\": it must be under $WHERE. chapter 3 of the office regulations: nothing an agent makes goes into the owner's home outside ~/.cache/mole-office. Nothing was read or written." >&2
  exit 2
}
case "${HOME:-}" in '') refuse ;; esac
CACHE_REAL=$(realpath -e "$HOME/.cache/mole-office" 2>/dev/null) || refuse
case "$OUT" in /*) ;; *) refuse ;; esac
OUT_FOLDER_REAL=$(realpath -e "$(dirname -- "$OUT")" 2>/dev/null) || refuse
case "$OUT_FOLDER_REAL" in "$CACHE_REAL"|"$CACHE_REAL"/*) ;; *) refuse ;; esac

PENDING="$OUT.read-offset.pending"
READPOINT="$OUT.read-offset"

OFFSET=0
if [ -f "$READPOINT" ]; then
  OFFSET=$(cat "$READPOINT" 2>/dev/null || printf '0')
fi
case "$OFFSET" in ''|*[!0-9]*) OFFSET=0 ;; esac

if [ ! -f "$OUT" ]; then
  printf '0\n' > "$PENDING"
  exit 0
fi

SIZE=$(wc -c < "$OUT")
ADDED=$((SIZE - OFFSET))
if [ "$ADDED" -lt 0 ]; then ADDED=0; fi

if [ "$ADDED" -gt 0 ]; then
  # FROM THE READ POINT FORWARD AND NO FURTHER THAN THE MEASURED SIZE. `tail -c "$ADDED"` prints the
  # LAST $ADDED bytes, so anything appended between the wc above and this line would push the bytes
  # after the read point out of the window and they would be lost for good. The start is fixed at the
  # read point and head stops at the size that was measured. The office secretary's review of 23 September 2026.
  #
  # A KEY VALUE IS MASKED, NEVER PRINTED AND NEVER DROPPED. Dropping the whole line would lose a
  # message whose words only name the variable. The office secretary's correction of 23 September 2026.
  tail -c "+$((OFFSET + 1))" "$OUT" | head -c "$ADDED" | sed -E 's/(MOLE_AGENT_KEY=)[^[:space:]]+/\1(withheld)/g'
fi

# THE READ POINT IS THE SIZE THAT WAS READ, WRITTEN NOW AND USED ONLY WHEN THE SESSION MARKS IT.
printf '%s\n' "$SIZE" > "$PENDING"
