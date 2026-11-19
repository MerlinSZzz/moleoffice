#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# waiter-identity.sh: two functions the kit's waiter scripts share, so they read a group one way.
# Sourced by waiter-groups.sh and stop-waiter.sh; it does nothing on its own.

# what_the_group_runs <pgid>: print every process in the group, its id and its whole command line.
what_the_group_runs() {
  ps -o pid=,args= -g "$1" 2>/dev/null | sed -e 's/^ */    /'
}

# the_group_is_the_waiter <pgid> <handle>: true when the group's leader, the process whose id is the group's id and whose
# own group is that id, is a shell running a file named waiter.sh with this handle as that file's first argument. The
# arguments are read BY POSITION from /proc/<pid>/cmdline, where they are separated by NUL bytes, so words that only
# appear inside another program's text (bash -c '... waiter.sh <handle> ...') do not count (check 5PDAmYI1pxq_).
# That is what the README's wrapper leaves behind: nohup execs waiter.sh, and its first line makes the kernel run it as
# "<shell> <path>/waiter.sh <handle> ...".
the_group_is_the_waiter() {
  local group="$1" handle="$2" own
  own="$(ps -o pgid= -p "$group" 2>/dev/null | tr -d ' ')"
  [ "$own" = "$group" ] || return 1
  [ -r "/proc/$group/cmdline" ] || return 1
  local -a args=()
  mapfile -d '' args < "/proc/$group/cmdline" || return 1
  [ "${#args[@]}" -ge 3 ] || return 1
  case "$(basename -- "${args[0]}")" in
    sh|bash|dash) ;;
    *) return 1 ;;
  esac
  [ "$(basename -- "${args[1]}")" = "waiter.sh" ] || return 1
  [ "${args[2]}" = "$handle" ]
}
