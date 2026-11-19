#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# mark-read.sh <out file>
#
# Make the size that read-new.sh read up to the new read point, in <out file>.read-offset.
# read-new.sh writes that size into <out file>.read-offset.pending. This script copies it.
#
# WHERE THE OUT FILE MAY BE. It must be an absolute path under ~/.cache/mole-office (chapter 3 of
# the office regulations: nothing an agent makes goes into the owner's home outside that folder).
# A bare name used to be taken as given, and twice it put the read point into the owner's checkout.
# The folder holding the out file must exist, and its real path must be the cache folder or lie
# under it, so a `..` that climbs out, or a link that points outside, is refused too. A refusal is
# one line on stderr and exit 2, before anything is read or written.
#
# IT MARKS NOTHING IN THE OFFICE: it moves this out file's read point and never calls the office.
# mark-seen-in-the-office.py is the one that marks a message seen in the office.
#
# WHY THE SIZE IS COPIED AND NOT RE-MEASURED. A message may arrive after read-new.sh read the file
# and before this runs. Measuring the file here would include that message and lose it. The pending
# size is the size that was read, so the new message stays unread until the next read.
#
# THIS SCRIPT DELETES NOTHING. If no read is pending, it does nothing.
set -u
OUT="${1:?give the waiter out file}"

# THE ONE PLACE THE OUT FILE'S FOLDER IS CHECKED, BEFORE ANYTHING IS READ OR WRITTEN. HOME must be
# set, $HOME/.cache/mole-office must exist, the out file must be an absolute path, and the folder
# holding it must be that cache folder or lie under it after links and `..` are resolved.
SCRIPT=mark-read.sh
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

if [ ! -f "$PENDING" ]; then
  exit 0
fi
SIZE=$(cat "$PENDING" 2>/dev/null || printf '')
case "$SIZE" in ''|*[!0-9]*) exit 0 ;; esac
printf '%s\n' "$SIZE" > "$READPOINT"
