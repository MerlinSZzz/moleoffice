#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# stop-waiter.sh <waiter.pgids file> <handle> <pgid>
#
# Stop one waiter of this handle by the process group the README's wrapper recorded, and only if that group is still
# the waiter. It prints what the group is running first. It refuses, and sends nothing, when the file does not record
# the id, when the group is not alive, or when the group is not the waiter of this handle: an id recorded long ago can
# now belong to somebody else's process group (chapter 2, rule 1).
#
# Exit 0: the signal was sent. Exit 2: refused, nothing sent.
set -u
file="${1:?usage: stop-waiter.sh <waiter.pgids file> <handle> <pgid>}"
handle="${2:?usage: stop-waiter.sh <waiter.pgids file> <handle> <pgid>}"
group="${3:?usage: stop-waiter.sh <waiter.pgids file> <handle> <pgid>}"

source "$(dirname "$0")/waiter-identity.sh"

case "$group" in *[!0-9]*|'') echo "$group is not a process-group id. Nothing was sent."; exit 2 ;; esac
if ! grep -qx -- "$group" "$file" 2>/dev/null; then
  echo "$file does not record the group $group, so it was not started as this waiter. Nothing was sent."
  exit 2
fi
if ! kill -0 -- "-$group" 2>/dev/null; then
  echo "The group $group is not alive. Nothing was sent."
  exit 2
fi
echo "The group $group runs:"
what_the_group_runs "$group"
if ! the_group_is_the_waiter "$group" "$handle"; then
  echo "The group $group is not the waiter of $handle: its leader does not run waiter.sh $handle. Nothing was sent."
  exit 2
fi
kill -TERM -- "-$group"
echo "Sent TERM to the group $group, the waiter of $handle. Check that kill -0 -- -$group fails before starting another."
