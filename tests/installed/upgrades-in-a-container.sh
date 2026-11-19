#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# THE LINUX .debs ACROSS AN UPDATE, UNDER A RUNNING OFFICE, AND THE ENVIRONMENT OF AN AGENT'S TERMINAL.
#
# Run as root in a fresh ubuntu:24.04 container, as run-in-a-container.sh beside this is run: no network, no Node,
# and the packages the office's .deb names in its Depends already installed. What it reads is in --in, /in unless
# named, and may be read-only:
#   older/  the office's .deb and the map's .deb of one build, at one version
#   newer/  the office's .deb and the map's .deb of a later build, at a later version
#   a-terminals-environment.mjs, from tests/installed/
# Its findings and logs go to --out, /out unless named.
#
#   bash upgrades-in-a-container.sh [--in <folder>] [--out <folder>]
#
# Each check starts from a machine with nothing of Mole Office installed, and prints a PASS or FAIL line for each
# finding, with what it saw. It exits 0 only when every finding passed, 1 when one failed, and 2 when it refused.
#
# A FINDING IT COULD NOT JUDGE gets an UNJUDGED line instead, saying what and why. A judgement that needs the
# server's process number is not made when that number could not be read, as when root lacks CAP_SYS_PTRACE and
# the system refuses it debuser's /proc/<pid>/exe links. For the same reason "nothing runs from the folder" is not
# judged when any link was refused. A FAIL is still a FAIL. With no finding failed and one or more unjudged, the
# last line says how many could not be judged, and it exits 3.
#
# BEFORE IT ASKS TO BE ROOT, it reads the four .debs and refuses in words when the newer build's version is not
# later than the older's, by dpkg --compare-versions, or when the two .debs of one build are not at one version.
#
#   1. A TERMINAL'S ENVIRONMENT. The newer office's service runs as an ordinary user, with a stand-in for Claude Code
#      first on its PATH. a-terminals-environment.mjs registers an agent and opens it in a terminal, as the person.
#      The stand-in writes the environment it started with, read from its own /proc/<pid>/environ. The finding is that
#      it has no ELECTRON_RUN_AS_NODE, and no MOLE_OFFICE_ variable but the four the office gives an agent's terminal.
#      A first install with nothing running is also timed here, and must say nothing of a stop.
#   2. THE MAP ACROSS AN UPDATE. From both older .debs installed: (a) apt-get installs the office's newer .deb alone;
#      (b) apt-get installs both newer .debs in one command. What each leaves is held against the sentences of
#      docs/beta/for-your-ai.md quoted below.
#   3. AN UPDATE UNDER A RUNNING OFFICE. The older office's service runs as an ordinary user, and nothing has asked it
#      for the plan reviews yet: the first such request loads a chunk of the server late. While apt-get installs both
#      newer .debs, a watcher writes when the server ended, when dpkg first changed a file in /opt/mole-office, every
#      answer the office gave, and the answer to the plan reviews request made as the older chunk went. It passes
#      when the server ended first and nothing answered 500. Then it says what runs from the folder, and starts the
#      newer office. When that office waits for its owner to back up and update the database, the check says so, presses
#      Back up and update as the page does and as the office's own user, and judges the press, the office serving after
#      it and the plan reviews request. When the newer office does not wait it says so and presses nothing. When the
#      start after the update says an office was already running, it fails in words naming that office and asks the
#      plan reviews request of it. 3b removes the running newer office with apt-get remove, watched in the same way,
#      and says in a FAIL line when check 3 did not get that far.
#   4. THE CHECK CAN SEE THE FAULT. The older office runs again, and the newer files are put in place with no stop:
#      dpkg-deb unpacks the newer .deb over the folder, and the older files the newer one does not hold are removed.
#      The plan reviews request must then fail with 500. When the newer .deb holds the older chunk under the same
#      name, the fault cannot appear between these two builds, and the check says so and fails: it shows nothing.

set -u
IN=/in
OUT=/out
while [ $# -gt 0 ]; do
  case "$1" in
    --in) IN=${2:-}; shift 2 ;;
    --out) OUT=${2:-}; shift 2 ;;
    *) echo "REFUSED: $1 is not an option this script takes. It takes --in <folder> and --out <folder>. Nothing was done."; exit 2 ;;
  esac
done

# WHAT THE GUIDE SAYS, in its own words, from docs/beta/for-your-ai.md. tests/the-debs-stop-a-running-office.test.ts
# checks that the guide still holds each one.
THE_GUIDE_ON_THE_OFFICE_ALONE="So installing the office's new .deb alone removes the map, and with \`-y\` that happens without a question."
THE_GUIDE_ON_BOTH="Name both new .debs in one command"
THE_GUIDE_ON_THE_MAPS_FILE="With the map, \`/opt/mole-office/resources/office/plugins/office-map/plugin.json\` exists too."
THE_GUIDE_ON_THE_STOP="Before the .deb changes any file, it stops every Mole Office running from \`/opt/mole-office\`, for every user of the computer."
THE_GUIDE_ON_AFTER="It does not start Mole Office again: when the command has finished, the person opens **Mole Office** from the app menu."
THE_GUIDE_ON_REMOVAL="This removes the office map with it, because the map needs the office."

# ---------------------------------------------------------------------------- the four .debs and their versions

# The .deb of one package in one build's folder, by the package each .deb names, and refused when there is not one.
the_deb() {
  local folder=$1 package=$2 found='' deb
  for deb in "$folder"/*.deb; do
    [ -f "$deb" ] || continue
    [ "$(dpkg-deb -f "$deb" Package 2>/dev/null)" = "$package" ] || continue
    if [ -n "$found" ]; then
      echo "REFUSED: $folder holds two .debs of $package, $(basename "$found") and $(basename "$deb"). Leave one. Nothing was done." >&2
      return 1
    fi
    found=$deb
  done
  if [ -z "$found" ]; then
    echo "REFUSED: $folder holds no .deb of $package. It needs the office's .deb and the map's .deb of one build. Nothing was done." >&2
    return 1
  fi
  echo "$found"
}

OLDER_OFFICE=$(the_deb "$IN/older" mole-office) || exit 2
OLDER_MAP=$(the_deb "$IN/older" mole-office-map) || exit 2
NEWER_OFFICE=$(the_deb "$IN/newer" mole-office) || exit 2
NEWER_MAP=$(the_deb "$IN/newer" mole-office-map) || exit 2
OLDER=$(dpkg-deb -f "$OLDER_OFFICE" Version)
NEWER=$(dpkg-deb -f "$NEWER_OFFICE" Version)
for pair in "older $OLDER_MAP $OLDER" "newer $NEWER_MAP $NEWER"; do
  read -r which map version <<<"$pair"
  if [ "$(dpkg-deb -f "$map" Version)" != "$version" ]; then
    echo "REFUSED: the $which map's .deb is version $(dpkg-deb -f "$map" Version), and the $which office's .deb is $version. The two .debs of one build must be at one version. Nothing was done."
    exit 2
  fi
done
if dpkg --compare-versions "$NEWER" eq "$OLDER"; then
  echo "REFUSED: the older and the newer .debs are both version $OLDER, so nothing here is an update. Give the newer folder a build at a later version. Nothing was done."
  exit 2
fi
if ! dpkg --compare-versions "$NEWER" gt "$OLDER"; then
  echo "REFUSED: the newer .debs are version $NEWER, which dpkg puts before the older .debs' $OLDER. Swap the two folders, or give a later build. Nothing was done."
  exit 2
fi
echo "The older build is $OLDER: $(basename "$OLDER_OFFICE") and $(basename "$OLDER_MAP")."
echo "The newer build is $NEWER: $(basename "$NEWER_OFFICE") and $(basename "$NEWER_MAP")."

if [ "$(id -u)" != 0 ]; then
  echo "REFUSED: this runs as root in a container made for it, because it installs and removes .debs. Nothing was done."
  exit 2
fi
DRIVER="$IN/a-terminals-environment.mjs"
[ -f "$DRIVER" ] || { echo "REFUSED: $DRIVER is not there; copy it from tests/installed/. Nothing was done."; exit 2; }

mkdir -p "$OUT"
chmod a+rwx "$OUT"
exec > >(tee "$OUT/upgrades.log") 2>&1
failed=0
say() { echo "== $*"; }
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; failed=1; }
note() { echo "NOTE $*"; }
unjudged=0
unjudged() { echo "UNJUDGED $*"; unjudged=$((unjudged + 1)); }

# ---------------------------------------------------------------------------- the user, the office and its folder

FOLDER=/opt/mole-office
OFFICE=$FOLDER/resources/office
PORT=18787
id debuser >/dev/null 2>&1 || useradd -m debuser
UHOME=$(getent passwd debuser | cut -d: -f6)
[ -n "$UHOME" ] || { echo "REFUSED: useradd made a user with no home folder. Nothing was done."; exit 2; }
# The plan reviews request: the first one loads the chunk that holds readPlanReviews. No plan has this id.
PLAN_ASK=/api/plans/a-plan-nobody-made/reviews
# How long each wait runs before it says what it was waiting for and what it got: the start's health check, the
# press's answer, the office serving after the press, and the watch over a dpkg command. Each is a number of tries
# half a second apart, except the press's answer, which is in seconds.
THE_START_TRIES=60
THE_SERVE_TRIES=60
THE_PRESS_WAITS=120
THE_WATCH_WAITS=300
THE_COMMAND_WAITS=600

# Stop every process of one user, read from /proc: the base image has no procps, so no pkill.
stop_user() {
  for proc in /proc/[0-9]*; do
    [ "$(stat -c %U "$proc" 2>/dev/null)" = "$1" ] && kill -9 "${proc#/proc/}" 2>/dev/null
  done
  return 0
}

# Every process whose program is in the folder, as "<pid> <program>" lines.
from_the_folder() {
  local exe program
  for exe in /proc/[0-9]*/exe; do
    program=$(readlink "$exe" 2>/dev/null) || continue
    case "$program" in "$FOLDER"/*) echo "${exe//[!0-9]/} $program" ;; esac
  done
}

# Each process whose /proc/<pid>/exe link the system refused to show, by number on one line, as the stop finds them.
the_unread() {
  LC_ALL=C find /proc/[0-9]*/exe -maxdepth 0 -lname "$FOLDER/*" 2>&1 >/dev/null |
    sed -n "s#^.*: '/proc/\([0-9]*\)/exe': \(Permission denied\|Operation not permitted\)\$#\1#p" | paste -sd ' ' -
}

# This start's own words, when they say an office was already running and nothing was started: that line, or nothing.
the_start_that_started_nothing() {
  local words=${THE_START_WORDS:-} already
  already=$(printf '%s\n' "$words" | grep -m 1 '^Mole Office is already running: ' || true)
  if [ -n "$already" ] && printf '%s\n' "$words" | grep -Fqx 'Nothing was started.'; then
    printf '%s\n' "$already"
  fi
}

# The note that the office's service started: its server's process number, or why that number could not be read.
note_the_start() {
  local what=$1 server=$2 unread=$3
  if [ -n "${server// /}" ]; then
    note "$what: the office's service started for debuser, as process ${server% }"
  elif [ -n "$unread" ]; then
    note "$what: the office's service started for debuser, and its server's process number could not be read: the programs of processes $unread could not be read, so which of them runs the server cannot be told"
  else
    note "$what: the office's service started for debuser, and its server's process number could not be read: no process from $FOLDER has $OFFICE/server.mjs among its arguments"
  fi
}

# The process that runs the office's server, read from /proc.
the_server() {
  local pid program
  while read -r pid program; do
    tr '\0' '\n' <"/proc/$pid/cmdline" 2>/dev/null | grep -qx "$OFFICE/server.mjs" && echo "$pid"
  done < <(from_the_folder)
  return 0
}

# A package's state and version, or "not installed".
installed() {
  dpkg-query -W -f='${Status} ${Version}' "$1" 2>/dev/null | sed -n 's/^install ok installed /installed at /p' | grep . || echo 'not installed'
}

# One request to the test office, in this shell, over bash's own /dev/tcp: the status code on the first line, then
# the body. "no answer" means nothing listens at the port; "no status line" means it took the request and said nothing.
# A Content-Length body is read exactly; a chunked body has its size lines taken out. Each read waits at most the
# timeout given, five seconds unless the caller gives another.
the_answer_from() {
  local method=$1 path=$2 timeout=${3:-5}
  local status line body='' length='' chunked=''
  if ! exec 3<>"/dev/tcp/127.0.0.1/$PORT"; then
    echo 'no answer'
    return
  fi 2>/dev/null
  printf '%s %s HTTP/1.1\r\nHost: 127.0.0.1:%s\r\nx-mole-office-workspace: default\r\nx-mole-office-actor-type: human\r\nx-mole-office-actor-id: owner\r\nContent-Length: 0\r\nConnection: close\r\n\r\n' "$method" "$path" "$PORT" >&3 2>/dev/null
  if ! read -r -t "$timeout" _ status _ <&3 2>/dev/null; then
    exec 3<&- 3>&- 2>/dev/null
    echo 'no status line'
    return
  fi
  while IFS= read -r -t "$timeout" line <&3 2>/dev/null; do
    line=${line%$'\r'}
    [ -z "$line" ] && break
    case "${line,,}" in
      transfer-encoding:*chunked*) chunked=1 ;;
      content-length:*) length=${line#*: }; length=${length// /} ;;
    esac
  done
  if [ -n "$length" ] && [ "$length" != 0 ]; then
    IFS= read -r -t "$timeout" -N "$length" body <&3 2>/dev/null || body=''
  elif [ -z "$length" ]; then
    while IFS= read -r -t "$timeout" line <&3 2>/dev/null; do body+="$line"$'\n'; done
    if [ -n "$chunked" ]; then
      body=$(printf '%s' "$body" | sed '/^[0-9a-fA-F][0-9a-fA-F]*$/d' | tr -d '\n')
    fi
  fi
  exec 3<&- 3>&- 2>/dev/null
  echo "$status"
  [ -z "$body" ] || printf '%s\n' "$body"
}

# The status code of an answer, which is its first line.
the_answer_line() { printf '%s\n' "$1" | sed -n '1p'; }

# The body of an answer, which is everything after its first line.
the_body_of() { printf '%s\n' "$1" | sed -n '2,$p'; }

# Whether a health answer is the reduced mode, waiting for its owner to press Back up and update.
the_answer_says_the_update_waits() { printf '%s' "$1" | grep -q '"updateWaiting":true'; }

# The update's state in an answer from the press, or empty when the answer does not name one.
the_update_state_in() { printf '%s' "$1" | sed -n 's/.*"update":{"state":"\([^"]*\)".*/\1/p'; }

# The backup path an answer names, or empty when it names none.
the_backup_named_in() { printf '%s' "$1" | sed -n 's/.*"backup":"\([^"]*\)".*/\1/p'; }

# Ask the test office for one path as the person, and print the answer's status code.
ask() { the_answer_from GET "$1" | sed -n '1p'; }

# The health check's answer, or why there was none.
the_health_answer() { the_answer_from GET /api/health; }

# One request to the office as debuser, whose answers the office accepts for the press: the office's own user.
# The request runs in a bash of its own, because this function's caller is root.
ask_as_the_user() {
  local method=$1 path=$2 seconds=${3:-5}
  as_debuser env HOME="$UHOME" PATH="$UHOME/stand-ins:/usr/bin:/bin" PORT="$PORT" \
    bash -c "$(declare -f the_answer_from)"$'\n''the_answer_from "$1" "$2" "$3"' bash "$method" "$path" "$seconds"
}

# Run a command as the user the office's service runs for.
as_debuser() {
  runuser -u debuser -- "$@"
}

# The office's command, run as the user with the environment its service starts with.
as_the_user() {
  runuser -u debuser -- env HOME="$UHOME" PATH="$UHOME/stand-ins:/usr/bin:/bin" MOLE_OFFICE_PORT=$PORT MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES=none ELECTRON_RUN_AS_NODE=1 "$FOLDER/mole-office" "$@"
}

# Start the office as the user, and wait up to 30 seconds for its health check.
# It returns 0 when the office answers 100 to 499, 2 when it is the reduced mode waiting for the press (only asked
# for with "may-wait"), and 1 when it does not. A FAIL names the last status the office answered and that answer's
# words; "did not answer" is said only when nothing answered.
# A start whose own words say an office was already running and nothing was started is judged before the health check:
# 0 when it is check 3 after the update, and 1 otherwise.
start_the_office() {
  local what=$1 take_the_update=${2:-no} tries=0 most=${THE_START_TRIES:-60} words_from=0
  local answer status body last_status='' last_body='' already=''
  [ -f "$OUT/office-starts.log" ] && words_from=$(wc -c <"$OUT/office-starts.log")
  if ! as_the_user "$OFFICE/mole-office.mjs" start >>"$OUT/office-starts.log" 2>&1; then
    fail "$what: the office's service did not start for debuser; see office-starts.log"
    return 1
  fi
  # Only the lines this start wrote, so the caller reads this start's words and not an earlier start's.
  THE_START_WORDS=$(tail -c "+$((words_from + 1))" "$OUT/office-starts.log" 2>/dev/null)
  # Check 3 after the update judges this start from these words itself, so nothing is said of it here.
  already=$(the_start_that_started_nothing)
  if [ -n "$already" ] && [ "$take_the_update" = may-wait ]; then
    return 0
  fi
  if [ -n "$already" ]; then
    fail "$what: the office's service did not start for debuser, because an office was already running and nothing was started: $already"
    return 1
  fi
  while :; do
    answer=$(the_health_answer)
    status=$(the_answer_line "$answer")
    body=$(the_body_of "$answer")
    case "$status" in
      [1-4][0-9][0-9])
        note_the_start "$what" "$(the_server | tr '\n' ' ')" "$(the_unread)"
        return 0
        ;;
      503)
        if [ "$take_the_update" = may-wait ] && the_answer_says_the_update_waits "$body"; then
          note_the_start "$what" "$(the_server | tr '\n' ' ')" "$(the_unread)"
          return 2
        fi
        last_status=$status
        last_body=$body
        ;;
      'no answer' | 'no status line') ;;
      *)
        last_status=$status
        last_body=$body
        ;;
    esac
    tries=$((tries + 1))
    if [ "$tries" -ge "$most" ]; then
      if [ -n "$last_status" ] && [ -n "$last_body" ]; then
        fail "$what: the office's service started for debuser, and its health check answered $last_status, not 100 to 499, within 30 seconds; it said: $last_body; see office-starts.log"
      elif [ -n "$last_status" ]; then
        fail "$what: the office's service started for debuser, and its health check answered $last_status, not 100 to 499, within 30 seconds; see office-starts.log"
      else
        fail "$what: the office's service started for debuser and did not answer within 30 seconds; see office-starts.log"
      fi
      return 1
    fi
    sleep 0.5
  done
}

# Ask the plan reviews request, which loads the chunk that holds readPlanReviews, and judge its answer.
the_plan_reviews_answer() {
  local what=$1 answer
  answer=$(ask "$PLAN_ASK")
  case "$answer" in
    [1-4][0-9][0-9]) pass "$what answers the plan reviews request with $answer" ;;
    *) fail "$what answers the plan reviews request with $answer" ;;
  esac
}

# Say where the backup an answer names is, and whether that file is there.
judge_the_backup_named_in() {
  local what=$1 backup
  backup=$(the_backup_named_in "$2")
  if [ -z "$backup" ]; then
    note "$what names no backup"
  elif [ -e "$backup" ]; then
    pass "$what names the backup at $backup, and that file is there"
  else
    fail "$what names the backup at $backup, and that file is not there"
  fi
}

# Wait up to 30 seconds for the office to serve after the press: its health check answers 100 to 499 and is not the
# reduced mode. A wait that runs out is a FAIL saying what it waited for and the last answer it got.
wait_for_the_office_to_serve() {
  local what=$1 tries=0 most=${THE_SERVE_TRIES:-60} answer status body last_status='' last_body=''
  while :; do
    answer=$(the_health_answer)
    status=$(the_answer_line "$answer")
    body=$(the_body_of "$answer")
    if [[ "$status" == [1-4][0-9][0-9] ]] && ! the_answer_says_the_update_waits "$body"; then
      pass "$what: the office serves after the press, and its health check answered $status"
      return 0
    fi
    last_status=$status
    last_body=$body
    tries=$((tries + 1))
    if [ "$tries" -ge "$most" ]; then
      fail "$what: the office did not serve within 30 seconds after the press; its last health answer was $last_status${last_body:+: $last_body}"
      return 1
    fi
    sleep 0.5
  done
}

# Press Back up and update as the page does: a POST as debuser, whose request the office accepts. Judge the press,
# the backup it names, the office serving afterwards, and the plan reviews request.
press_the_update() {
  local waits=${THE_PRESS_WAITS:-120} answer status body state backup after after_status after_body after_backup
  note "3: the newer office is waiting for its owner to back up and update the database. The check presses Back up and update as the page does, as debuser, whose press the office accepts."
  answer=$(ask_as_the_user POST /api/office/the-update "$waits")
  status=$(the_answer_line "$answer")
  body=$(the_body_of "$answer")
  if [ "$status" = 'no answer' ] || [ "$status" = 'no status line' ]; then
    fail "3: the press did not answer within $waits seconds"
  else
    state=$(the_update_state_in "$body")
    if [ "$status" = 200 ] && [ "$state" = done ]; then
      pass "3: the press answered 200, and the update is done"
    elif [ "$status" = 200 ] && [ "$state" = failed ]; then
      fail "3: the press answered 200, and the update failed: $body"
    elif [ "$status" = 200 ]; then
      fail "3: the press answered 200, and its update state was not done or failed: $body"
    else
      fail "3: the press answered $status, and the update is not done: $body"
    fi
    backup=$(the_backup_named_in "$body")
    [ -z "$backup" ] || judge_the_backup_named_in "3: the press's answer" "$body"
  fi
  after=$(ask_as_the_user GET /api/office/the-update 5)
  after_status=$(the_answer_line "$after")
  after_body=$(the_body_of "$after")
  if [ "$after_status" = 200 ]; then
    after_backup=$(the_backup_named_in "$after_body")
    if [ -n "$after_backup" ] && [ "$after_backup" != "${backup:-}" ]; then
      judge_the_backup_named_in "3: the reading after the press" "$after_body"
    fi
  else
    note "3: after the press, GET /api/office/the-update answered $after_status${after_body:+: $(printf '%s' "$after_body" | cut -c1-200)}"
  fi
  wait_for_the_office_to_serve 3
  the_plan_reviews_answer "3: the newer office, after the press,"
}

# What check 3 does after starting the newer office: press when it waits, and go on when it does not.
after_the_newer_start() {
  local already=''
  case "$1" in
    0)
      already=$(the_start_that_started_nothing)
      if [ -n "$already" ]; then
        fail "3: the start after the update started nothing, because an office that ran before the update was still running: $already"
        the_plan_reviews_answer "3: the office that was still running"
      else
        note "3: the newer office does not wait for its owner to back up and update the database; nothing was pressed"
        the_plan_reviews_answer "3: the newer office, started as the person would,"
      fi
      ;;
    2) press_the_update ;;
  esac
}

# Back to a machine with nothing of Mole Office installed and nothing of the user running.
from_nothing() {
  stop_user debuser
  sleep 1
  dpkg --purge mole-office-map mole-office >>"$OUT/purges.log" 2>&1
  rm -rf "$FOLDER" "$UHOME/.config/mole-office" "$UHOME/stand-ins" "$UHOME/the-terminals-environment"
  if [ "$(installed mole-office)" != 'not installed' ] || [ "$(installed mole-office-map)" != 'not installed' ] || [ -e "$FOLDER" ]; then
    fail "$1: the machine could not be put back to nothing of Mole Office; see purges.log"
    return 1
  fi
  return 0
}

# apt-get install, as the guide names it, with what it said in a log of its own. Nothing can be answered: a question
# would end it.
apt_install() {
  local log=$1
  shift
  DEBIAN_FRONTEND=noninteractive apt-get install -y "$@" </dev/null >"$OUT/$log" 2>&1
}

# The chunk of the installed server that holds readPlanReviews, which the first plan reviews request loads.
the_chunk() {
  grep -l 'function readPlanReviews(' "$OFFICE"/chunk-*.mjs 2>/dev/null | head -1
}

# The files and links a .deb puts in place, one full path a line, sorted.
the_files_of() {
  dpkg-deb --fsys-tarfile "$1" | tar -t | grep -v '/$' | sed 's|^\./|/|' | sort
}

# Whether a .deb holds a file of the office's folder by its name.
the_deb_holds() {
  the_files_of "$1" | grep -qxF "$OFFICE/$2"
}

# The inodes of the watched files, as one line. A file that is gone leaves its inode out.
the_inodes() {
  stat -c %i "$@" 2>/dev/null | tr '\n' ' '
}

# WATCH THE FOLDER AND THE OFFICE WHILE DPKG RUNS, every twentieth of a second, and write each change with its time:
# when the server's process ended, when dpkg first changed a file in the folder (a file dpkg is writing, or a
# watched file replaced or gone), every answer the office gave while its server ran, and the answer to the plan
# reviews request made as the older chunk went. It ends when the file named last is there.
watch_the_folder() {
  local server=$1 chunk=$2 record=$3 done=$4
  shift 4
  local watched=("$@") inodes chunks ended='' changed='' asked='' now started
  inodes=$(the_inodes "${watched[@]}")
  chunks=$(the_inodes "$chunk")
  started=$(date +%s)
  # With no process number, when the server ended cannot be told, so neither its end nor its answers are written.
  [ -n "$server" ] || echo 'server-unread' >>"$record"
  while [ ! -e "$done" ]; do
    now=$(date +%s.%N)
    if [ $(($(date +%s) - started)) -ge "${THE_WATCH_WAITS:-300}" ]; then
      echo "watch-timed-out $now" >>"$record"
      break
    fi
    if [ -n "$server" ] && [ -z "$ended" ] && ! readlink "/proc/$server/exe" >/dev/null 2>&1; then
      ended=$now
      echo "server-ended $now" >>"$record"
    fi
    if [ -z "$changed" ] && { [ "$(the_inodes "${watched[@]}")" != "$inodes" ] || [ -n "$(find "$FOLDER" -name '*.dpkg-new' -print -quit 2>/dev/null)" ]; }; then
      changed=$now
      echo "folder-changed $now" >>"$record"
    fi
    if [ -z "$asked" ] && [ "$(the_inodes "$chunk")" != "$chunks" ]; then
      asked=$now
      echo "asked-as-the-chunk-went $(ask "$PLAN_ASK")" >>"$record"
    fi
    [ -n "$server" ] && [ -z "$ended" ] && echo "answered $(ask /api/health)" >>"$record"
    sleep 0.05
  done
}

# Judge one watch: the server ended before the folder changed, and nothing answered 500. Every other answer is listed.
judge_the_watch() {
  local what=$1 record=$2 ended changed statuses chunk_answer timed_out
  ended=$(sed -n 's/^server-ended //p' "$record")
  changed=$(sed -n 's/^folder-changed //p' "$record")
  statuses=$(sed -n 's/^answered //p' "$record" | sort | uniq -c | sed 's/^ *\([0-9]*\) \(.*\)$/\2 (\1 times)/' | paste -sd ';' -)
  chunk_answer=$(sed -n 's/^asked-as-the-chunk-went //p' "$record")
  timed_out=$(sed -n 's/^watch-timed-out //p' "$record")
  if [ -n "$timed_out" ]; then
    fail "$what: the watch waited ${THE_WATCH_WAITS:-300} seconds for the command it watched to end, which it had not at $timed_out (the server ended at ${ended:-no time}, and the folder changed at ${changed:-no time})"
  elif grep -qx 'server-unread' "$record"; then
    unjudged "$what: could not judge whether the office's server ended before dpkg first changed a file in $FOLDER${changed:+ at $changed}, because the server's process number could not be read"
  elif [ -z "$ended" ]; then
    fail "$what: the office's server was still running when the watch ended (the folder changed at ${changed:-no time})"
  elif [ -z "$changed" ]; then
    fail "$what: no file of $FOLDER changed while the watch ran, so the order cannot be told (the server ended at $ended)"
  elif awk -v a="$ended" -v b="$changed" 'BEGIN { exit !(a < b) }'; then
    pass "$what: the office's server ended at $ended, before dpkg first changed a file in $FOLDER at $changed"
  else
    fail "$what: dpkg first changed a file in $FOLDER at $changed, before the office's server ended at $ended"
  fi
  if grep -qE '^(answered|asked-as-the-chunk-went) 500$' "$record"; then
    fail "$what: the office answered 500: $(grep -E ' 500$' "$record" | sort | uniq -c | paste -sd ';' -)"
  elif [ -n "$timed_out" ]; then
    unjudged "$what: could not judge whether anything answered 500 while the office's server ran, because the watch stopped after ${THE_WATCH_WAITS:-300} seconds. The plan reviews request made as the older chunk went: ${chunk_answer:-not made, because the chunk did not change while the watch ran}"
  elif grep -qx 'server-unread' "$record"; then
    unjudged "$what: could not judge whether anything answered 500 while the office's server ran, because its process number could not be read, so the watch could not tell when it ran. The plan reviews request made as the older chunk went: ${chunk_answer:-not made, because the chunk did not change while the watch ran}"
  else
    pass "$what: nothing answered 500. While the server ran it answered: ${statuses:-nothing}. The plan reviews request made as the older chunk went: ${chunk_answer:-not made, because the chunk did not change while the watch ran}"
  fi
}

# Run one dpkg command with the office running, under the watch, and judge it. The command's output is in its log.
under_the_watch() {
  local what=$1 log=$2 server chunk record="$OUT/$2.watch" done="$OUT/$2.done"
  shift 2
  server=$(the_server | head -1)
  chunk=$(the_chunk)
  rm -f "$record" "$done"
  watch_the_folder "$server" "$chunk" "$record" "$done" "$FOLDER/mole-office" "$OFFICE/server.mjs" "$OFFICE/mole-office.mjs" "$OFFICE/build-stamp.json" "$chunk" &
  local watcher=$! began ran
  sleep 1
  began=$(date +%s)
  DEBIAN_FRONTEND=noninteractive timeout --kill-after=10 "${THE_COMMAND_WAITS:-600}" "$@" </dev/null >"$OUT/$log" 2>&1
  ran=$?
  note "$what: $* ended with $ran after $(($(date +%s) - began)) seconds; what it said of the stop:"
  grep '^Mole Office:' "$OUT/$log" | sed 's/^/    /'
  touch "$done"
  wait "$watcher"
  judge_the_watch "$what" "$record"
  return "$ran"
}

# Judge what runs from the folder after a dpkg command: what runs, or "nothing", and the processes whose links were refused.
judge_what_runs() {
  local what=$1 after=$2 so=$3 running=$4 unread=$5
  if [ "$running" != nothing ]; then
    fail "$what: $after this runs from $FOLDER: $running"
  elif [ -n "$unread" ]; then
    unjudged "$what: could not judge whether anything runs from $FOLDER $after, because the programs of processes $unread could not be read"
  else
    pass "$what: $after nothing runs from $FOLDER$so"
  fi
}

# The last line, and the exit code: 1 when a finding failed, 3 when none failed and one or more could not be judged.
the_end() {
  if [ "$failed" != 0 ]; then
    say "Done: a finding failed$([ "$unjudged" = 0 ] || echo ", and $unjudged could not be judged")"
    exit 1
  elif [ "$unjudged" != 0 ]; then
    say "Done: no finding failed, and $unjudged could not be judged, so this run does not show that every finding passes"
    exit 3
  fi
  say 'Done: every finding passed'
  exit 0
}

# What runs from the folder now, one line, or "nothing".
what_runs() {
  local running
  running=$(from_the_folder | while read -r pid program; do echo "process $pid ($(tr '\0' ' ' <"/proc/$pid/cmdline" 2>/dev/null | cut -c1-120)) as $(stat -c %U "/proc/$pid" 2>/dev/null)"; done | paste -sd ';' -)
  echo "${running:-nothing}"
}

# ---------------------------------------------------------------------------- 1. a terminal's environment

say "1. A terminal's environment, in the newer office"
if from_nothing 1; then
  began=$(date +%s.%N)
  if apt_install 1-first-install.log "$NEWER_OFFICE"; then
    pass "1: a first install of $NEWER, with nothing running, took $(awk -v a="$began" -v b="$(date +%s.%N)" 'BEGIN { printf "%.1f", b - a }') seconds"
  else
    fail "1: apt-get install of the newer office's .deb failed; see 1-first-install.log"
  fi
  if grep -q '^Mole Office:' "$OUT/1-first-install.log"; then fail "1: the first install, with nothing running, said: $(grep '^Mole Office:' "$OUT/1-first-install.log" | head -3 | tr '\n' ' ')"; else pass "1: the first install, with nothing running, said nothing of a stop"; fi
  note "1: chrome-sandbox is $(stat -c '%a %U:%G' "$FOLDER/chrome-sandbox" 2>&1); the AppArmor profile is $(ls /etc/apparmor.d/mole-office 2>&1)"
  runuser -u debuser -- mkdir -p "$UHOME/stand-ins"
  # The stand-in for Claude Code. $$ is its own process, so what it writes is the environment it started with.
  cat >"$UHOME/stand-ins/claude" <<EOF
#!/bin/sh
cat /proc/\$\$/environ >'$UHOME/the-terminals-environment'
exec sleep 600
EOF
  chown debuser "$UHOME/stand-ins/claude"
  chmod 0755 "$UHOME/stand-ins/claude"
  if start_the_office 1; then
    runuser -u debuser -- env HOME="$UHOME" PATH=/usr/bin:/bin ELECTRON_RUN_AS_NODE=1 "$FOLDER/mole-office" "$DRIVER" \
      --api "http://127.0.0.1:$PORT" --keys "$UHOME/.config/mole-office/data/keys.json" --environ "$UHOME/the-terminals-environment" \
      | sed 's/^\(PASS\|FAIL\) /\1 1: /'
    [ "${PIPESTATUS[0]}" = 0 ] || failed=1
  fi
fi

# ---------------------------------------------------------------------------- 2. the map across an update

say "2. The map across an update"
note "2: the guide says: $THE_GUIDE_ON_BOTH; $THE_GUIDE_ON_THE_OFFICE_ALONE; $THE_GUIDE_ON_THE_MAPS_FILE"
for part in a b; do
  from_nothing "2$part" || continue
  if ! apt_install "2$part-older.log" "$OLDER_OFFICE" "$OLDER_MAP"; then
    fail "2$part: the two older .debs did not install; see 2$part-older.log"
    continue
  fi
  note "2$part: from the older build, the office is $(installed mole-office) and the map $(installed mole-office-map)"
  if [ "$part" = a ]; then
    apt_install 2a-newer-office-alone.log "$NEWER_OFFICE"
    ran=$?
    saw="apt-get install -y of the office's newer .deb alone ended with $ran; the office is $(installed mole-office), the map $(installed mole-office-map), and plugin.json is $([ -e "$OFFICE/plugins/office-map/plugin.json" ] && echo there || echo not there)"
    if [ "$ran" = 0 ] && [ "$(installed mole-office)" = "installed at $NEWER" ] && [ "$(installed mole-office-map)" = 'not installed' ] && [ ! -e "$OFFICE/plugins/office-map/plugin.json" ]; then
      pass "2a: as the guide says, the map is removed without a question: $saw"
    else
      fail "2a: not as the guide says: $saw; see 2a-newer-office-alone.log"
    fi
  else
    apt_install 2b-both-newer.log "$NEWER_OFFICE" "$NEWER_MAP"
    ran=$?
    saw="apt-get install -y of both newer .debs ended with $ran; the office is $(installed mole-office), the map $(installed mole-office-map), and plugin.json is $([ -e "$OFFICE/plugins/office-map/plugin.json" ] && echo there || echo not there)"
    if [ "$ran" = 0 ] && [ "$(installed mole-office)" = "installed at $NEWER" ] && [ "$(installed mole-office-map)" = "installed at $NEWER" ] && [ -e "$OFFICE/plugins/office-map/plugin.json" ]; then
      pass "2b: as the guide says, both are at the newer version and the map is there: $saw"
    else
      fail "2b: not as the guide says: $saw; see 2b-both-newer.log"
    fi
  fi
done

# ---------------------------------------------------------------------------- 3. an update under a running office

# Check 3b: a removal under a running office. When check 3 did not get that far, its first line is a FAIL saying
# what it was waiting for.
check_3b() {
  say "3b. A removal under a running office"
  if [ -n "$1" ]; then
    fail "3b: did not run, because $1"
    return
  fi
  under_the_watch 3b 3b-remove.log apt-get remove -y mole-office
  ran=$?
  saw="the office is $(installed mole-office), the map $(installed mole-office-map), and the user's data folder is $([ -d "$UHOME/.config/mole-office" ] && echo there || echo gone)"
  if [ "$ran" = 0 ] && [ "$(installed mole-office)" = 'not installed' ] && [ "$(installed mole-office-map)" = 'not installed' ] && [ -d "$UHOME/.config/mole-office" ]; then
    pass "3b: apt-get remove -y mole-office removed both, as the guide says ($THE_GUIDE_ON_REMOVAL): $saw"
  else
    fail "3b: apt-get remove -y mole-office ended with $ran: $saw; see 3b-remove.log"
  fi
  if grep -q '^Mole Office: stopped for debuser before Mole Office is removed' "$OUT/3b-remove.log"; then pass "3b: the removal's output says whose office it stopped"; else fail "3b: the removal's output does not say it stopped debuser's office; see 3b-remove.log"; fi
  judge_what_runs 3b 'after the removal' '' "$(what_runs)" "$(the_unread)"
}

say "3. An update under a running office"
note "3: the guide says: $THE_GUIDE_ON_THE_STOP $THE_GUIDE_ON_AFTER"
why_3b=''
if ! from_nothing 3; then
  why_3b='the machine could not be put back to nothing of Mole Office'
elif ! apt_install 3-older.log "$OLDER_OFFICE" "$OLDER_MAP"; then
  fail "3: the two older .debs did not install; see 3-older.log"
  why_3b='the two older .debs did not install'
else
  start_the_office 3
  started=$?
  if [ "$started" != 0 ]; then
    why_3b='the older office did not start for debuser'
  else
    chunk=$(the_chunk)
    if [ -z "$chunk" ]; then
      fail "3: no chunk of the older office holds readPlanReviews, so no request here loads a chunk late"
      why_3b='no chunk of the older office holds readPlanReviews'
    else
      note "3: the older office's plan reviews are in $(basename "$chunk"), which nothing has loaded yet; the newer .deb $(the_deb_holds "$NEWER_OFFICE" "$(basename "$chunk")" && echo 'holds a file of that name too, so this update would not show the fault even without a stop' || echo 'does not hold it')"
      under_the_watch 3 3-update.log apt-get install -y "$NEWER_OFFICE" "$NEWER_MAP"
      ran=$?
      if [ "$ran" = 0 ] && [ "$(installed mole-office)" = "installed at $NEWER" ]; then pass "3: the update finished: the office is $(installed mole-office) and the map $(installed mole-office-map)"; else fail "3: the update ended with $ran; the office is $(installed mole-office); see 3-update.log"; fi
      if grep -q '^Mole Office: stopped for debuser ' "$OUT/3-update.log"; then pass "3: the update's output says whose office it stopped"; else fail "3: the update's output does not say it stopped debuser's office; see 3-update.log"; fi
      judge_what_runs 3 'after the update' ', so the office is left stopped' "$(what_runs)" "$(the_unread)"
      start_the_office 3 may-wait
      newer_started=$?
      if [ "$newer_started" = 1 ]; then
        why_3b='the newer office did not start after the update'
      else
        after_the_newer_start "$newer_started"
      fi
    fi
  fi
fi
check_3b "$why_3b"

# ---------------------------------------------------------------------------- 4. the check can see the fault

say "4. The newer files under a running older office, with no stop"
if from_nothing 4 && apt_install 4-older.log "$OLDER_OFFICE" && start_the_office 4; then
  chunk=$(the_chunk)
  if [ -z "$chunk" ]; then
    fail "4: no chunk of the older office holds readPlanReviews, so no request here loads a chunk late"
  else
    the_files_of "$OLDER_OFFICE" >"$OUT/4-older-files.txt"
    the_files_of "$NEWER_OFFICE" >"$OUT/4-newer-files.txt"
    if dpkg-deb -x "$NEWER_OFFICE" /; then
      gone=0
      while read -r file; do
        rm -f "$file" && gone=$((gone + 1))
      done < <(comm -23 "$OUT/4-older-files.txt" "$OUT/4-newer-files.txt")
      note "4: the newer files are in place under the running older office, and $gone older files the newer .deb does not hold were removed"
      if [ -e "$chunk" ]; then
        fail "4: the fault cannot appear between these two builds: the newer .deb holds $(basename "$chunk") too, under the same name, so the plan reviews request still finds it. Check 3 shows nothing about the fault with these builds"
      else
        answer=$(ask "$PLAN_ASK")
        if [ "$answer" = 500 ]; then
          pass "4: with $(basename "$chunk") removed, the older office answers the plan reviews request with 500, so check 3 can see the fault"
        else
          fail "4: with $(basename "$chunk") removed, the older office answers the plan reviews request with $answer, not 500"
        fi
      fi
    else
      fail "4: dpkg-deb could not unpack the newer office's .deb over $FOLDER"
    fi
  fi
fi

from_nothing end
the_end
