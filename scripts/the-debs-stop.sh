#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# STOP EVERY MOLE OFFICE THAT RUNS FROM THE INSTALLED FOLDER, BEFORE DPKG CHANGES A FILE IN IT.
#
# The office's .deb and the office map's .deb both run this, as their before-install and before-remove scripts.
# scripts/the-debs-stop.mjs makes each script from this file: the facts below are set above it, from the places
# that decide them. An office left running across an update can load a file the update has removed, and answer
# 500 until it is started again.
#
# WHAT IS STOPPED. A process is from the folder when the program it runs is in the folder, read from
# /proc/<pid>/exe. A process that only names the folder in its arguments is not from the folder, and is left
# alone. As root this sees every user's processes; as any other user it sees that user's own.
#
# HOW. First each user's office is asked to stop with its own command, `mole-office stop`, as the user it runs as.
# It is run by the program the office's server runs on, with the environment that server started with, so it
# finds that user's office and no other. Then what still runs from the folder is stopped by its path: SIGTERM,
# and SIGKILL to what is left after a wait.
#
# A STOP THAT FAILS REFUSES. An office that does not stop when asked, or a process still there after SIGKILL,
# makes this exit 1, saying which user and which process, and what the person can do. dpkg then changes nothing.
#
# NOTHING IS STARTED AGAIN. The person opens Mole Office from the app menu after the install.
#
# WHEN IT DOES NOTHING. With nothing running from the folder, or no folder at all, as on a first install, it says
# nothing and waits for nothing. dpkg's abort-upgrade, which comes after a refusal, stops nothing either.
#
# A PROCESS IT CANNOT LOOK AT IS NAMED. As root, a process whose /proc/<pid>/exe link the system refuses to show
# cannot be told to be from the folder or not, so it is neither asked nor stopped. Root is refused another user's
# link when it lacks CAP_SYS_PTRACE, as in a container started without it. Each such process gets one line, with
# its user, saying it was not stopped and the install or removal goes on. The line is printed only where this
# exits 0, after anything it did stop. A link that is not there, as for a process that has ended, gets no line.
# As any other user nothing is named: its own processes may refuse it their link too, as ssh-agent does, and the
# processes of other users it cannot see at all.

set -u

# Each fact must be set above. The words after each name hold no apostrophe, which bash would read as a quote there.
: "${THE_FOLDER:?the folder the office is installed in}"
: "${THE_COMMAND:?the command of the office, inside the folder}"
: "${THE_SERVER:?the server of the office, inside the folder}"
: "${THE_ANSWERS_THAT_GO_ON:?the exit codes of the stop command that let the install go on}"
: "${THE_ASK_WAIT_SECONDS:?how long the stop command may take}"
: "${THE_END_WAIT_SECONDS:?how long a stopped process may take to end}"

case "${1:-}" in
  install | upgrade | remove | failed-upgrade | deconfigure) ;;
  *) exit 0 ;;
esac

# What the person was doing, and what they do after, in the words the output uses.
case "$1" in
  remove)
    doing='before Mole Office is removed'
    after='Its data folder stays where it was.'
    going='the removal'
    ;;
  *)
    doing='before this version of Mole Office is installed'
    after='It is not started again: open Mole Office from the app menu when this has finished.'
    going='the install'
    ;;
esac

[ -d "$THE_FOLDER" ] || exit 0
folder=$(readlink -f "$THE_FOLDER") || exit 0

# Each process whose program is in the folder, as "<pid> <uid>" lines. find reads each /proc/<pid>/exe link with one
# process, and its pattern holds no character a pattern would read as more than itself (theStopScript refuses one).
# The user is the real one, from /proc/<pid>/status.
the_running() {
  local exe pid key real rest
  find /proc/[0-9]*/exe -maxdepth 0 -lname "$folder/*" 2>/dev/null | while read -r exe; do
    pid=${exe#/proc/}
    pid=${pid%/exe}
    while read -r key real rest; do
      if [ "$key" = 'Uid:' ]; then
        echo "$pid $real"
        break
      fi
    done <"/proc/$pid/status" 2>/dev/null
  done
}

# Each process whose /proc/<pid>/exe link the system refused to show, by its number. find says so for each such
# link on stderr, in the C locale's words: EACCES and EPERM. A link that is not there says something else.
the_refused() {
  LC_ALL=C find /proc/[0-9]*/exe -maxdepth 0 -lname "$folder/*" 2>&1 >/dev/null |
    sed -n "s#^.*: '/proc/\([0-9]*\)/exe': \(Permission denied\|Operation not permitted\)\$#\1#p"
}

# One line for each process whose link was refused, with its user when its status says.
say_the_refused() {
  local pid key real rest user
  for pid in $refused; do
    user=''
    while read -r key real rest; do
      if [ "$key" = 'Uid:' ]; then
        user=", which runs as $(the_user "$real")"
        break
      fi
    done <"/proc/$pid/status" 2>/dev/null
    echo "Mole Office: could not look at process $pid$user, because the system refused to show which program it runs. It was not stopped, even if it is Mole Office, and $going goes on."
  done
}

# A user's name, or their number when the system has no name for it.
the_user() {
  id -nu "$1" 2>/dev/null || echo "the user numbered $1"
}

# A process's command line, as one line.
the_command_line() {
  local line
  line=$(tr '\0' ' ' <"/proc/$1/cmdline" 2>/dev/null)
  echo "${line% }"
}

# Whether a process runs the office's server: one of its arguments is the server's file in the folder.
is_the_server() {
  local argument
  while IFS= read -r -d '' argument; do
    [ "$argument" = "$folder/$THE_SERVER" ] && return 0
  done <"/proc/$1/cmdline" 2>/dev/null
  return 1
}

refuse() {
  echo "Mole Office: $1" >&2
  echo "Mole Office: nothing was changed. $2" >&2
  exit 1
}

me=$(id -u)
refused=''
[ "$me" = 0 ] && refused=$(the_refused)
running=$(the_running)
if [ -z "$running" ]; then
  say_the_refused
  exit 0
fi

users=$(echo "$running" | while read -r _ uid; do echo "$uid"; done | sort -un)

# 1. EACH OFFICE IS ASKED, by its server's own program and environment, as the user it runs as. The ask runs from /,
# which every user may enter.
cd / || exit 1
servers=$(echo "$running" | while read -r pid uid; do is_the_server "$pid" && echo "$pid $uid"; done)
for uid in $users; do
  echo "$servers" | grep -q " $uid\$" && continue
  echo "Mole Office: $(the_user "$uid") has Mole Office open with no office running, so nothing is asked, and its window is closed below."
done
while read -r server uid; do
  [ -n "$server" ] || continue
  name=$(the_user "$uid")
  # A server that ended since it was read needs no asking.
  program=$(readlink "/proc/$server/exe" 2>/dev/null) || continue
  program=${program% (deleted)}
  # Without its environment the command would look for another office, so an environment that cannot be read refuses.
  [ -r "/proc/$server/environ" ] ||
    refuse "$name's Mole Office is running (process $server), and its environment cannot be read, so it cannot be asked to stop." \
      "$name can shut it down with Shut down Mole Office, in the menu of its icon in the notification area. Then run this again."
  environment=()
  while IFS= read -r -d '' line; do environment+=("$line"); done <"/proc/$server/environ"
  gid=''
  while read -r key real rest; do
    if [ "$key" = 'Gid:' ]; then
      gid=$real
      break
    fi
  done <"/proc/$server/status"
  as=()
  if [ "$uid" != "$me" ]; then
    as=(setpriv --reuid="$uid" --regid="$gid" --clear-groups)
  fi
  echo "Mole Office: asking $name's office (process $server) to stop."
  timeout -k 5 "$THE_ASK_WAIT_SECONDS" "${as[@]}" env -i "${environment[@]}" "$program" "$folder/$THE_COMMAND" stop </dev/null
  answer=$?
  # timeout answers 124 when the command ran out of time, and 137 when it had to be killed after that.
  case "$answer" in
    124 | 137) said="it did not answer within $THE_ASK_WAIT_SECONDS seconds" ;;
    *) said="it answered $answer" ;;
  esac
  case " $THE_ANSWERS_THAT_GO_ON " in
    *" $answer "*) ;;
    *)
      refuse "$name's Mole Office is running (process $server: $(the_command_line "$server")) and did not stop when asked ($said)." \
        "$name can shut it down with Shut down Mole Office, in the menu of its icon in the notification area. Then run this again."
      ;;
  esac
done <<<"$servers"

# 2. WHAT STILL RUNS FROM THE FOLDER IS STOPPED BY ITS PATH: the windows, and anything the stop command did not end.
# Only the processes read here are signalled, each after a check that its program is still in the folder.
signal_the_running() {
  local pid owner program
  the_running | while read -r pid owner; do
    program=$(readlink "/proc/$pid/exe" 2>/dev/null) || continue
    case "${program% (deleted)}" in
      "$folder"/*) kill "-$1" "$pid" 2>/dev/null ;;
    esac
  done
}

# Wait until nothing runs from the folder, for at most a number of seconds. True when nothing does.
wait_for_none() {
  local tenths=$(($1 * 10))
  while [ "$tenths" -gt 0 ]; do
    [ -z "$(the_running)" ] && return 0
    sleep 0.1
    tenths=$((tenths - 1))
  done
  [ -z "$(the_running)" ]
}

left=$(the_running)
if [ -n "$left" ]; then
  signal_the_running TERM
  if ! wait_for_none "$THE_END_WAIT_SECONDS"; then
    signal_the_running KILL
    wait_for_none "$THE_END_WAIT_SECONDS" || true
  fi
fi

still=$(the_running)
if [ -n "$still" ]; then
  named=$(echo "$still" | while read -r pid uid; do echo "$(the_user "$uid")'s process $pid ($(the_command_line "$pid"))"; done | paste -sd ';' -)
  refuse "something still runs from $folder after it was stopped: $named." \
    "Close Mole Office, or ask the person it runs for to shut it down, then run this again."
fi

for uid in $users; do
  count=$(echo "$running" | while read -r _ owner; do [ "$owner" = "$uid" ] && echo x; done | wc -l)
  echo "Mole Office: stopped for $(the_user "$uid") $doing ($count processes from $folder). Terminals Mole Office held have ended. $after"
done
say_the_refused
exit 0
