#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# waiter-groups.sh <waiter.pgids file> <handle>
#
# Say, for each process group recorded in the waiter.pgids file, whether it is alive, what it is running, and whether it
# is still the waiter of this handle. The file is only ever appended to, so an id written for a waiter that ended long ago
# can later be the id of somebody else's process group (chapter 2, rule 1: print what matched before signalling).
#
# A GROUP IS THE WAITER OF THIS HANDLE when its leader, the process whose id is the group's id, runs a file named
# waiter.sh with this handle as its first argument. That is what the README's wrapper leaves behind: it records its own
# process id, which setsid made the group's id, and then replaces itself with the waiter.
#
# THIS SCRIPT SENDS NO SIGNAL AND DELETES NOTHING. It reads the file and the process table.
set -u
file="${1:?usage: waiter-groups.sh <waiter.pgids file> <handle>}"
handle="${2:?usage: waiter-groups.sh <waiter.pgids file> <handle>}"
[ -f "$file" ] || { echo "No file $file: no waiter of $handle was ever recorded there."; exit 0; }

source "$(dirname "$0")/waiter-identity.sh"

waiters=0
while read -r group; do
  [ -n "$group" ] || continue
  case "$group" in *[!0-9]*) echo "$group: not a process-group id; skipped."; continue ;; esac
  if ! kill -0 -- "-$group" 2>/dev/null; then
    echo "$group: not alive."
    continue
  fi
  if the_group_is_the_waiter "$group" "$handle"; then
    waiters=$((waiters + 1))
    echo "$group: alive, the waiter of $handle."
  else
    echo "$group: alive, NOT the waiter of $handle. Leave it alone."
  fi
  what_the_group_runs "$group"
done < "$file"
if [ "$waiters" -eq 1 ]; then
  echo "1 recorded group is the waiter of $handle."
else
  echo "$waiters recorded groups are the waiter of $handle. Exactly one should be."
fi
