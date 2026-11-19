#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# The waiter of one durable agent: it keeps the agent's handle held for a live session, so a
# message to the agent comes to that session and the office starts no run in its place.
#
#   waiter.sh <handle> <session record id> <workspace> <out file> [<env file>]
#
# WHICH WAITER TOOL IT RUNS. With MOLE_OFFICE_CHECKOUT set, the for-agents/hold-the-handle.mjs of that
# Mole Office checkout. With it unset, the hold-the-handle.mjs in this script's own folder: an installed
# office ships this kit and the waiter tool together in resources/office/for-agents/, and has no
# checkout. Neither is one person's own folder. An installed office's waiter tool runs on the install's own Node,
# because the computer may have no other: the Node the installation carries (resources/office/runtime/bin/node),
# or on Linux, where it carries none, the app's own program (mole-office, beside resources/) told to run as Node.
# The tool finds the office's address itself, from the checkout's .env or the installed office's own.
#
# <workspace> is the project this waiter's own requests name. It does not decide which messages come:
# every message is kept in the office's message centre and belongs to no project, so a message is
# handed over whichever project it was written in, and its envelope
# says where that was. A reply joins its conversation wherever it is written.
#
# It runs the waiter tool, hold-the-handle.mjs, again and again. Everything the tool prints is appended to
# <out file>. The tool's last line says why it ended:
#   exiting: delivered <ids>   a message was handed over: this script appends it, wakes the session
#                              or not as the next part says, waits, and runs the tool again. The
#                              loop goes on, so the handle stays held.
#   exiting: error: ...        the office was not answering: it tries again in 20 seconds. It
#                              writes the line once per reason, not once per try; when a run
#                              ends any other way, one line says how long the errors lasted:
#                              "=== waiter: the office was away <from>–<to>" when the reason was
#                              that it was not answering, and otherwise "=== waiter: runs ended
#                              in that error from <from> to <to>".
#   exiting: refused: ...      it appends the output. If the env file changed while that run went,
#                              it runs the tool again once with the new file (see below); otherwise
#                              it writes "=== waiter ended <time>" and stops.
#   exiting: stopped           it appends the output, writes "=== waiter ended <time>" and stops.
#   other exiting: line        it appends the output, writes "=== waiter ended <time>" and stops.
#   no exiting: line           the run was cut off or crashed, not refused or stopped. It appends
#                              the output and a loud line with its byte count, then runs the tool
#                              again in 20 seconds. Three such runs in a row end the waiter with
#                              the reason; any run with an exiting: line resets that count.
# A refusal is a sentence for a reader and must never be retried in a loop.
#
# WHY A MESSAGE CAN COME BACK, AND WHY IT IS WAITED OUT. "exiting: delivered" means the tool
# printed the message; it does NOT mean the office marked it taken. When the took request fails,
# hold-the-handle.mjs prints "MOLE OFFICE DID NOT MARK IT DELIVERED" and still ends with
# "exiting: delivered <ids>", and the delivery row stays queued, so the same message is handed
# over again on the next run. The inspector measured the unconditional one-second loop doing
# exactly that on 23 September 2026: 10 hand-overs and 21,960 bytes of out file in 10 seconds,
# about 190 MB a day. So when a hand-over brings back an id that the hand-over just before it
# already handed over, the office did not mark that message taken and it will keep coming back.
# This script then waits before running the tool again and says so in the out file. A hand-over
# that brings only new ids goes back to the one-second pause. The waits are in WAITER_REPEAT_WAITS
# (default "30 60"), read from the environment so a test can make them short.
#
# THE WAIT NEVER OUTLASTS THE OFFICE'S HOLD, AND THE CAP COMES FROM THE OFFICE'S OWN NUMBERS.
# The office sends beatEvery (how often the session must say it is still there) and lapsesAfter
# (how long a quiet hold lasts) on every hold and beat answer. hold-the-handle.mjs reads
# both and, with --kept-by-the-kit, prints one line with them just before its last line:
#   office hold timing: beatEvery=<seconds> lapsesAfter=<seconds>
# This script reads that line from each run's output and keeps the last numbers it saw. A back-off
# wait is capped at lapsesAfter - beatEvery - WAITER_START_MARGIN (default 10 seconds). The quiet
# gap is up to one whole beat interval, plus the wait, plus the tool's start: the beat is cleared
# before the hand-over and nothing beats again until the tool starts. The cap is chosen so that
# sum stays at least the start margin below the office's lapse, whatever numbers the office sends.
# With the office's defaults, 20 and 90, the cap is 60 seconds, so the ladder is still "30 60". A
# wait above the cap is clamped to it, and the out file says so. Before any timing line has been
# seen the cap is 30 seconds.
#
# WHEN THE OFFICE'S NUMBERS LEAVE A CAP UNDER THE FLOOR (5 seconds by default, WAITER_MIN_WAIT for
# a test), no back-off can keep the hold. This script writes one loud line, once, and waits the
# floor on every back-off instead:
#   === waiter: the office's hold timing (beat <B> s, lapse <L> s) leaves no room for a back-off;
#   a message that comes back is handed over every 5 s until the timing is fixed (<time>)
#
# AFTER THE SAME MESSAGE HAS COME BACK 10 TIMES IN A ROW the office is clearly not marking it
# taken. This script writes one louder line, once, and goes on waiting at the cap:
#   === waiter: message(s) <ids> came back 10 times in a row; the office is not marking them
#   taken. The handle stays held; a secretary should read GET /api/messages/<id> and the office's
#   log (<time>)
# New ids reset the step and the count.
#
# WHICH HAND-OVERS WAKE THE SESSION, AND WHEN. The session is woken by the line "=== waiter handed
# over <time>". Before 7 November 2026 this script wrote it after every hand-over, so each message in a
# group woke the agent, whoever it was for. Now the tool, with --kept-by-the-kit, prints one line just
# before its last, and this script acts on it:
#   hand-over wakes: now            a person's message, an emergency, or a message the tool could not
#                                   read. It writes the line at once.
#   hand-over wakes: nobody         only group messages that name nobody. It writes "=== waiter kept
#                                   this for the next wake <time>" and no wake line; the session reads
#                                   the hand-over at its next wake. It does not put a burst's wake off.
#   hand-over wakes: after-a-burst  anything else. It gathers: it writes the line when WAITER_BURST_QUIET
#                                   seconds (default 20) pass with no hand-over that wakes, or
#                                   WAITER_BURST_LONGEST seconds (default 90) after the first, whichever
#                                   is sooner. The clock is read in whole seconds, so the longest time
#                                   holds to within one. A hand-over that wakes now ends the gathering.
#   no such line                    an older tool. It writes the line at once, as before.
# for-agents/when-a-hand-over-wakes.mjs says which messages are which. THE GATHERING IS TIMED BY A
# TIMER IN THE BACKGROUND, in this script's process group, while the tool runs again and holds the
# handle. When this script ends while it gathers, it writes the line first: on the tool's last line,
# and when its process group is stopped, which stop-waiter.sh does. So a gathered message is never left
# without a wake. A wake can come twice for one burst only when the timer and a new hand-over meet
# within the same moment.
#
# HOW A SESSION LEARNS THAT A MESSAGE CAME. The session reads the out file. While the session is
# awake, a Monitor watches for "=== waiter handed over". At every wake, the session runs
# read-new.sh <out file>, which prints what the out file gained since its last read point. After
# it has handled every block, the session runs mark-read.sh <out file> to move the read point.
# THE SESSION NEVER STARTS THIS SCRIPT AGAIN AFTER A HAND-OVER. This script is already running and
# will run the tool again by itself. Starting a second copy fights the first one for the handle. It
# passes --kept-by-the-kit to the tool, so the hand-over says this rather than telling the session
# to start another waiter.
#
# Start it DETACHED, never as a harness background task:
#   setsid nohup waiter.sh <handle> <session> <workspace> <out> [<env>] > /dev/null 2>&1 < /dev/null & disown
# then wait 8 seconds and check BOTH that exactly one waiter.sh loop for the handle is alive and
# that GET /api/handles/<handle> says a live session answers. Between two runs of the tool, and
# during a back-off wait the office's timing allows, no hold-the-handle.mjs process is alive and
# that is normal: the office keeps the hold for lapsesAfter seconds. If no loop is alive, start
# one; if two are alive, stop both by their process groups and start one. The survivor of a pair
# does not hold the handle (16 September 2026). Stop the waiter by its process group, which is the
# group it was started in.
#
# The optional env file (mode 600) holds MOLE_AGENT_KEY=... and is read into the environment; the
# key is never printed and never passed as a flag (the tool refuses a key on the command line).
# THE ENV FILE IS READ AGAIN BEFORE EACH RUN OF THE TOOL, so a new key the agent writes into it is
# used on the next run (a new-key grant revokes the old key, and a waiter
# that read the file once went on sending the revoked key until its hold was refused). Each run
# gets the environment this script started with, plus the file as it reads now. When the file
# cannot be read before a run, the run gets the text last read from it, or none if it was never
# read, and the out file says which, once, with no part of the file's contents:
#   === waiter: could not read the env file <path>; the tool runs with the text last read from it
#   (<time>)
#   === waiter: could not read the env file <path>, and it was never read; the tool runs without it
#   (<time>)
# It says once more when the file can be read again. It does not stop: a key it read before may
# still be good, and if it is not, the office refuses the hold and the waiter ends with the office's
# sentence in the out file.
#
# A REFUSAL IS TRIED AGAIN ONCE WHEN THE ENV FILE HAS CHANGED. When a run ends with "exiting:
# refused", this script reads the env file once more. If it now holds something other than what that
# run started with, the agent may have written a new key into it, so this script writes one line
# and runs the tool again with the file as it is now:
#   === waiter: the hold was refused, and the env file has changed since this run started; holding
#   again with the env file as it is now (<time>)
# The line names no key and no part of the file. If the file is the same, or cannot be read, the
# waiter ends as on any refusal. So a key refused again with an unchanged file still stops it.
#
# THE LINES ON HOW THE HANDLE IS HELD ARE WRITTEN ONCE PER START OF THIS SCRIPT. They are the same on
# every run, and they were about 1.4 KB of every hand-over in the coordinator's out file (concise
# but traceable). So once a run has handed a message over, every later run of this start
# gets --again as well, and the tool leaves them out. A line that reports a failure still prints on
# every run.
# THIS SCRIPT DELETES NOTHING.
set -u
HANDLE="${1:?handle}"; SESSION="${2:?session record id}"; WS="${3:?workspace}"; OUT="${4:?out file}"; ENVF="${5:-}"
# THE ENV FILE IS READ AFTER THE cd BELOW, so a relative path is made whole from where this started.
case "$ENVF" in ""|/*) ;; *) ENVF="$PWD/$ENVF" ;; esac
# THE WAITER TOOL: a checkout's, when MOLE_OFFICE_CHECKOUT names one, or the one beside this script. A
# tool that is not there stops the script here, before the cd and before the out file is touched.
HERE=$(cd "$(dirname "$0")" && pwd)
NODE=node
TELL_IT_TO_RUN_AS_NODE=""
if [ -n "${MOLE_OFFICE_CHECKOUT:-}" ]; then
  CHECKOUT="$MOLE_OFFICE_CHECKOUT"
  TOOL="$CHECKOUT/for-agents/hold-the-handle.mjs"
else
  CHECKOUT="$HERE"
  TOOL="$HERE/hold-the-handle.mjs"
  if [ -x "$HERE/../runtime/bin/node" ]; then
    NODE="$HERE/../runtime/bin/node"
  # A LINUX INSTALL CARRIES NO NODE. Its office folder has a build stamp, and the app's own program is two folders up;
  # each run below tells that program to run as Node.
  elif [ -f "$HERE/../build-stamp.json" ] && [ -f "$HERE/../../../mole-office" ] && [ -x "$HERE/../../../mole-office" ]; then
    NODE="$HERE/../../../mole-office"
    TELL_IT_TO_RUN_AS_NODE=1
  fi
fi
[ -f "$TOOL" ] || { echo "waiter.sh: there is no waiter tool at $TOOL. Set MOLE_OFFICE_CHECKOUT to a Mole Office checkout, or run the waiter.sh an installed office ships. Nothing was started." >&2; exit 1; }
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; nvm use 22 >/dev/null 2>&1
# THE ENV FILE'S TEXT AS LAST READ, kept in this shell only: never printed, never on a command line.
# read_the_env_file fills it before each run, and each run's subshell reads it into its environment.
ENV_TEXT=""
# True while the env file cannot be read, so the out file says so once and not on every run.
ENV_UNREADABLE_SAID=0
# True once the env file has been read at least once, so the out file can say which case it is.
ENV_EVER_READ=0
# HOW LONG TO WAIT WHEN THE SAME MESSAGE COMES BACK, space-separated, in the order to use them.
REPEAT_WAITS="${WAITER_REPEAT_WAITS:-30 60}"
# THE ROOM A WAIT MUST LEAVE, in seconds, for the tool's start. One variable so the header and the
# code cannot drift. A test may lower it to measure the cap without a real wait.
START_MARGIN="${WAITER_START_MARGIN:-10}"
# THE FLOOR THE OFFICE'S NUMBERS MAY NOT GO BELOW, in seconds. When the cap would come out under
# this, no back-off can keep the hold; the loud line below says so and every back-off waits this.
# The default is 5. A test may lower it through WAITER_MIN_WAIT, so a test with fractional seconds
# can measure a small cap without the floor swallowing it.
WAIT_FLOOR="${WAITER_MIN_WAIT:-5}"
# HOW LONG TO WAIT AFTER A RUN THAT ENDED "exiting: error", in seconds. The default is 20. A test may
# lower it through WAITER_ERROR_WAIT, so a run of errors is measured without a real wait.
ERROR_WAIT="${WAITER_ERROR_WAIT:-20}"
# HOW LONG A BURST IS GATHERED, in seconds: until QUIET passes with no new hand-over that wakes, or
# LONGEST after the first. A test may make them short through WAITER_BURST_QUIET and WAITER_BURST_LONGEST.
BURST_QUIET="${WAITER_BURST_QUIET:-20}"
BURST_LONGEST="${WAITER_BURST_LONGEST:-90}"
# THE TIMER OF THE BURST BEING GATHERED, and the whole second its first hand-over came. Both are empty
# when nothing is being gathered.
GATHER_PID=""
GATHER_SINCE=""
# THE LAST beatEvery AND lapsesAfter THE OFFICE SENT, read from the tool's timing line. Empty until
# a run has printed one; then the cap is 30 seconds.
LAST_BEAT=""
LAST_LAPSE=""
# THE CAP the last the_cap call worked out, and whether it had to fall back to WAIT_FLOOR.
CAP=30
WAIT_IS_FLOOR=0
# True once the loud "no room" line has been written, so it is written once and not per wait.
NO_ROOM_SAID=0

# KEEP THE LAST TIMING THE OFFICE SENT, from one run's output. The line is
#   office hold timing: beatEvery=<B> lapsesAfter=<L>
# and the last one in the output wins. Nothing is read if the run printed none.
note_timing() {
  local found
  found=$(printf '%s\n' "$1" | sed -n 's/^office hold timing: beatEvery=\([^ ]*\) lapsesAfter=\(.*\)$/\1 \2/p' | tail -n 1)
  if [ -n "$found" ]; then
    LAST_BEAT="${found%% *}"
    LAST_LAPSE="${found#* }"
  fi
}

# WORK OUT THE CAP FOR A BACK-OFF WAIT, from the office's own timing. Sets CAP in this shell (not a
# subshell, so WAIT_IS_FLOOR and NO_ROOM_SAID survive) and writes the loud line once when the
# office's numbers leave no room.
the_cap() {
  WAIT_IS_FLOOR=0
  if [ -z "$LAST_BEAT" ] || [ -z "$LAST_LAPSE" ]; then
    CAP=30
    return
  fi
  CAP=$(awk -v b="$LAST_BEAT" -v l="$LAST_LAPSE" -v m="$START_MARGIN" 'BEGIN { printf "%g", l - b - m }')
  if awk -v c="$CAP" -v f="$WAIT_FLOOR" 'BEGIN { exit !(c < f) }'; then
    WAIT_IS_FLOOR=1
    if [ "$NO_ROOM_SAID" -eq 0 ]; then
      echo "=== waiter: the office's hold timing (beat $LAST_BEAT s, lapse $LAST_LAPSE s) leaves no room for a back-off; a message that comes back is handed over every $WAIT_FLOOR s until the timing is fixed ($(date '+%F %T'))" >> "$OUT"
      NO_ROOM_SAID=1
    fi
    CAP="$WAIT_FLOOR"
  fi
}

# THE IDS IN $1 THAT ALSO APPEAR IN $2, SPACE-SEPARATED. An id in both was handed over by the run
# just before, which means the office did not mark that message taken and it will come back.
repeat_ids() {
  local current="$1" previous="$2" id found=""
  for id in $current; do
    case " $previous " in
      *" $id "*) found="${found:+$found }$id" ;;
    esac
  done
  printf '%s' "$found"
}

# READ THE ENV FILE AGAIN, into ENV_TEXT. cat gets only the path, so the key is never in a process's
# arguments. When the file cannot be read, ENV_TEXT keeps what it held and the out file says so once.
read_the_env_file() {
  local text
  [ -n "$ENVF" ] || return 0
  if [ -f "$ENVF" ] && [ -r "$ENVF" ] && text=$(cat -- "$ENVF" 2>/dev/null); then
    ENV_TEXT="$text"
    ENV_EVER_READ=1
    if [ "$ENV_UNREADABLE_SAID" -eq 1 ]; then
      echo "=== waiter: the env file $ENVF can be read again; the tool runs with it ($(date '+%F %T'))" >> "$OUT"
      ENV_UNREADABLE_SAID=0
    fi
  elif [ "$ENV_UNREADABLE_SAID" -eq 0 ]; then
    if [ "$ENV_EVER_READ" -eq 1 ]; then
      echo "=== waiter: could not read the env file $ENVF; the tool runs with the text last read from it ($(date '+%F %T'))" >> "$OUT"
    else
      echo "=== waiter: could not read the env file $ENVF, and it was never read; the tool runs without it ($(date '+%F %T'))" >> "$OUT"
    fi
    ENV_UNREADABLE_SAID=1
  fi
}

# THE nTH WAIT IN $REPEAT_WAITS, OR THE LAST ONE WHEN n RUNS PAST IT.
nth_repeat_wait() {
  local n="$1" i=1 w last=""
  set -- $REPEAT_WAITS
  for w in "$@"; do
    last="$w"
    [ "$i" -ge "$n" ] && break
    i=$((i + 1))
  done
  printf '%s' "$last"
}

# WAKE THE SESSION: the line a session's Monitor watches for.
say_handed_over() {
  echo "=== waiter handed over $(date '+%F %T')" >> "$OUT"
}

# STOP THE BURST'S TIMER, if one runs. Answers 0 when nothing is owed, because no burst was being
# gathered or its timer had already woken the session, and 1 when the burst has not woken it yet.
# A cancel that reaches the timer before it has set its traps ends it with 138. That is read as owed
# too, which is right, because the timer had not woken the session.
stop_the_gathering() {
  local status
  [ -n "$GATHER_PID" ] || return 0
  kill -USR1 "$GATHER_PID" 2>/dev/null
  wait "$GATHER_PID"
  status=$?
  GATHER_PID=""
  GATHER_SINCE=""
  [ "$status" -eq 0 ]
}

# GATHER ONE HAND-OVER INTO THE BURST, starting one when none is owed a wake. The timer waits the
# quiet time, or what is left of the longest time when that is shorter, and then wakes the session. A
# cancel (USR1) ends it without a wake; a stop of the process group wakes the session first.
gather() {
  local since="$GATHER_SINCE" now delay
  now=$(date +%s)
  if stop_the_gathering; then since="$now"; fi
  delay=$(awk -v q="$BURST_QUIET" -v l="$BURST_LONGEST" -v s="$since" -v n="$now" 'BEGIN { d = s + l - n; if (d > q) d = q; if (d < 0) d = 0; printf "%g", d }')
  (
    s=""
    trap 'kill "$s" 2>/dev/null; exit 10' USR1
    trap 'kill "$s" 2>/dev/null; trap "" USR1 TERM INT HUP; say_handed_over; exit 0' TERM INT HUP
    sleep "$delay" &
    s=$!
    wait "$s"
    trap '' USR1 TERM INT HUP
    say_handed_over
    exit 0
  ) &
  GATHER_PID=$!
  GATHER_SINCE="$since"
}

# WAKE THE SESSION OR NOT, for one delivered hand-over, by the tool's "hand-over wakes:" line.
wake_for() {
  local answer
  answer=$(printf '%s\n' "$1" | sed -n 's/^hand-over wakes: //p' | tail -n 1)
  case "$answer" in
    nobody)
      echo "=== waiter kept this for the next wake $(date '+%F %T')" >> "$OUT" ;;
    after-a-burst)
      gather ;;
    *)
      stop_the_gathering
      say_handed_over ;;
  esac
}

# BEFORE THIS SCRIPT ENDS, WAKE THE SESSION FOR A BURST THAT HAS NOT WOKEN IT.
end_the_gathering() {
  stop_the_gathering || say_handed_over
}

cd "$CHECKOUT" || exit 1
mkdir -p "$(dirname "$OUT")"
# THE FIRST LINE NAMES TWO OF THE KIT'S HELPERS, as commands for this handle, so the agent finds them where it already
# reads. logins-week.py prints each login's week, which the office puts only in a secretary's inbox while this loop
# prints messages only.
# mark-seen-in-the-office.py marks a message seen in the office, in the project it is filed in; mark-read.sh only
# moves this out file's read point. %q quotes a path with a space in it, as an installed office's may have, and
# leaves a plain one as it is.
printf -v LOGINS_WEEK '%q ' python3 "$HERE/logins-week.py" "$WS" --as "$HANDLE"
printf -v MARK_SEEN '%q ' python3 "$HERE/mark-seen-in-the-office.py" --as "$HANDLE"
echo "=== waiter started $(date '+%F %T') pid $$ for $HANDLE. A secretary reads each login's week with: ${LOGINS_WEEK% }; "\
"a message is marked seen in the office with: ${MARK_SEEN}<message id> ..." >> "$OUT"
previous_ids=""
last_came_back=""
repeat_step=0
repeat_count=0
louder_said=0
incomplete_runs=0
# --again ONCE A RUN HAS HANDED A MESSAGE OVER: that run's output is in the out file, and it held the
# lines on how the handle is held.
again=""
# THE "exiting: error" LINE LAST WRITTEN, AND WHEN THE ERRORS BEGAN. Each reason is written once; a
# run that ends any other way writes how long they lasted. A new reason gets its own line.
error_said=""
error_since=""

# SAY HOW LONG THE ERRORS LASTED, once, when a run ends any other way.
say_the_errors_ended() {
  [ -n "$error_since" ] || return 0
  case "$error_said" in
    "exiting: error: Mole Office is not answering"*)
      echo "=== waiter: the office was away $error_since–$(date '+%F %T')" >> "$OUT" ;;
    *)
      echo "=== waiter: runs ended in that error from $error_since to $(date '+%F %T')" >> "$OUT" ;;
  esac
  error_said=""
  error_since=""
}

while :; do
  # --kept-by-the-kit TELLS THE TOOL THIS WAITER RUNS IT AGAIN BY ITSELF, so a hand-over says the
  # handle stays held instead of telling the session to start a second waiter, which would fight
  # this one for the handle. The tool also prints its timing line with this flag.
  # THE ENV FILE IS READ HERE, BEFORE EVERY RUN, into the run's own subshell. This shell's own
  # environment is never changed by it, so each run starts from the environment this script started
  # with and adds the file as it reads now.
  read_the_env_file
  run_text="$ENV_TEXT"
  out=$(set -a; eval "$run_text"; set +a; [ -z "$TELL_IT_TO_RUN_AS_NODE" ] || export ELECTRON_RUN_AS_NODE=1; "$NODE" "$TOOL" --agent "$HANDLE" --session "$SESSION" --workspace "$WS" --kept-by-the-kit $again 2>&1)
  note_timing "$out"
  # NO ENDING LINE MEANS THE OUTPUT WAS CUT OFF OR THE TOOL CRASHED. Command substitution
  # strips trailing newlines, so this count describes the captured text appended below.
  ending=$(printf '%s\n' "$out" | sed -n '/^exiting: /p' | tail -n 1)
  if [ -z "$ending" ]; then
    say_the_errors_ended
    printf '%s\n' "$out" >> "$OUT"
    incomplete_runs=$((incomplete_runs + 1))
    bytes=$(printf '%s' "$out" | wc -c | tr -d ' ')
    if [ "$incomplete_runs" -ge 3 ]; then
      echo "=== waiter: the tool's output ended with no exiting line ($bytes bytes); $incomplete_runs such runs in a row" >> "$OUT"
      end_the_gathering
      echo "=== waiter ended $(date '+%F %T'): the tool's output ended with no exiting line 3 runs in a row" >> "$OUT"
      break
    fi
    echo "=== waiter: the tool's output ended with no exiting line ($bytes bytes); running it again in 20 seconds" >> "$OUT"
    sleep 20
    continue
  fi
  incomplete_runs=0
  last=$(printf '%s\n' "$out" | tail -n 1)
  case "$last" in "exiting: error"*) ;; *) say_the_errors_ended ;; esac
  case "$last" in
    "exiting: delivered"*)
      printf '%s\n' "$out" >> "$OUT"
      wake_for "$out"
      again="--again"
      ids="${last#exiting: delivered }"
      came_back=$(repeat_ids "$ids" "$previous_ids")
      if [ -n "$came_back" ]; then
        # THE SAME IDS AS LAST TIME GO ON THE SAME LADDER; A DIFFERENT REPEATING MESSAGE STARTS
        # AGAIN. New ids in a hand-over mean the office marked the old messages taken, so the
        # step and the count reset below.
        if [ "$came_back" = "$last_came_back" ]; then
          repeat_step=$((repeat_step + 1))
          repeat_count=$((repeat_count + 1))
        else
          repeat_step=1
          repeat_count=1
          louder_said=0
        fi
        if [ "$repeat_count" -eq 10 ] && [ "$louder_said" -eq 0 ]; then
          echo "=== waiter: message(s) $came_back came back 10 times in a row; the office is not marking them taken. The handle stays held; a secretary should read GET /api/messages/$came_back and the office's log ($(date '+%F %T'))" >> "$OUT"
          louder_said=1
        fi
        # THE OFFICE'S OWN TIMING DECIDES THE LONGEST THIS MAY WAIT. the_cap also writes the one
        # loud "no room" line when the numbers leave no room, and says so through WAIT_IS_FLOOR.
        the_cap
        if [ "$WAIT_IS_FLOOR" -eq 1 ]; then
          # NO BACK-OFF KEEPS THE HOLD, so every back-off is the floor, whatever the ladder says.
          ladder_wait=$(nth_repeat_wait "$repeat_step")
          if awk -v w="$ladder_wait" -v f="$WAIT_FLOOR" 'BEGIN { exit !(w != f) }'; then
            echo "=== waiter: wait $ladder_wait s is below the $WAIT_FLOOR s floor the office's timing leaves; clamped to $WAIT_FLOOR s" >> "$OUT"
          fi
          wait_s="$WAIT_FLOOR"
        elif [ "$repeat_count" -ge 10 ]; then
          # AT TEN THE OFFICE HAS CLEARLY STOPPED MARKING THEM TAKEN, so wait the cap from then on.
          wait_s="$CAP"
        else
          wait_s=$(nth_repeat_wait "$repeat_step")
          if awk -v w="$wait_s" -v c="$CAP" 'BEGIN { exit !(w > c) }'; then
            echo "=== waiter: wait $wait_s s is above the $CAP s cap the office's timing leaves; clamped to $CAP s" >> "$OUT"
            wait_s="$CAP"
          fi
        fi
        echo "=== waiter: message(s) $came_back came back, so the office did not mark them taken; waiting $wait_s s before holding again ($(date '+%F %T'))" >> "$OUT"
        sleep "$wait_s"
      else
        repeat_step=0
        repeat_count=0
        louder_said=0
        sleep 1
      fi
      last_came_back="$came_back"
      previous_ids="$ids" ;;
    "exiting: error"*)
      if [ "$last" != "$error_said" ]; then
        [ -n "$error_since" ] || error_since=$(date '+%F %T')
        echo "=== waiter: $last ($(date '+%F %T')); trying again every $ERROR_WAIT s, and saying so again only if the reason changes" >> "$OUT"
        error_said="$last"
      fi
      sleep "$ERROR_WAIT" ;;
    "exiting: refused"*)
      printf '%s\n' "$out" >> "$OUT"
      # A REFUSED HOLD MAY BE A KEY THAT WAS REPLACED WHILE THE RUN WAS GOING. When the env file now
      # holds something other than what this run started with, the next run gets it. A file that
      # did not change, or cannot be read, stops the waiter as any refusal does, so a key refused
      # again with the same file still stops it.
      read_the_env_file
      if [ "$ENV_TEXT" != "$run_text" ]; then
        echo "=== waiter: the hold was refused, and the env file has changed since this run started; holding again with the env file as it is now ($(date '+%F %T'))" >> "$OUT"
        continue
      fi
      end_the_gathering
      echo "=== waiter ended $(date '+%F %T')" >> "$OUT"
      break ;;
    *)
      printf '%s\n' "$out" >> "$OUT"
      end_the_gathering
      echo "=== waiter ended $(date '+%F %T')" >> "$OUT"
      break ;;
  esac
done
