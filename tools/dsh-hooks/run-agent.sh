#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# run-agent.sh <worktree> <brief file> <log file> <handle> <session record id> <workspace> [<run key file>] :
# one dsh agent on the office profile, in the worktree, at nice 19, stdin closed, the brief file's
# PATH as the task, which the brief-by-path overlay reads whole before the model is asked anything.
# The four things this names are the worktree, the brief, the log, and the run's identity; the
# identity is three arguments — the handle it answers as, the session record its run is filed
# under, and the project it works in — and, on the host, the run's own key, from the file
# tools/register-a-run.mjs --run-key-file wrote.
#
# A STARTED AGENT NEVER HOLDS ITS STARTER'S KEY (problem bxJ0SwInDFtW, 29 September 2026). A dsh
# supervisor started with this runner from a shell holding its starter's own MOLE_AGENT_KEY got that key passed through: the
# office rightly refused the supervisor's own name with that key, and the supervisor then filed two reports and a
# message as its starter. So on the host the agent gets the run's own key from the seventh argument and nothing else, and
# with MOLE_AGENT_KEY set and no key file this starts nothing and says why. In a sandbox the helper
# (tools/sandbox-start.mjs) has already taken the starter's key out and put the run's own in MOLE_AGENT_KEY, so that
# one is kept. THE RUN'S KEY GOES ON AS A FILE, NEVER AS ITS VALUE: with a run key file the agent is given
# MOLE_AGENT_KEY_FILE, the file's full path, and no MOLE_AGENT_KEY, so no key is in its environment, and its tools read
# the key from the file (for-agents/agent-key.mjs). That reader judges the file here before anything starts, so a file
# the agent's tools would refuse starts nothing. The file must stay where it is until the run ends. Without a run key
# file a MOLE_AGENT_KEY_FILE here is the starter's, and nothing is started, on the host or in a sandbox.
#
# THE THREE EXPORTS ARE THE WHOLE POINT OF THIS RUNNER. run-worker.sh sets no MOLE_OFFICE_* and the
# office profile mounts the hooks bridge, so without them every hook would find no identity, say so
# in one sentence and let the run go on with no message ever attached. It exports
# MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and MOLE_OFFICE_WORKSPACE from those three arguments, and
# runs `--profile office` rather than `--profile worker`.
# THE DEEPSEEK KEY: on the host it lives in ~/.cache/mole-office/dsh/env (mode 600), which this script sources and never
# prints; in a sandbox it comes from the run's own environment, which the launcher sets for a dsh run alone (problem
# epOLxauSbzd9, below).
#
# Like run-worker.sh it runs as the leader of its own process group, and prints on its first line
# the pid, the process group and the working directory it actually started in, because every dsh
# agent on this machine has the same command line and only the working directory tells them apart.
set -u
W="$1"; BRIEF="$2"; LOG="$3"; HANDLE="$4"; SESSION="$5"; WORKSPACE="$6"; RUN_KEY_FILE="${7:-}"
if [ -z "${W:-}" ] || [ -z "${BRIEF:-}" ] || [ -z "${LOG:-}" ] || [ -z "${HANDLE:-}" ] || [ -z "${SESSION:-}" ] || [ -z "${WORKSPACE:-}" ]; then
  echo "run-agent.sh needs six arguments and takes a seventh: <worktree> <brief file> <log file> <handle> <session record id> <workspace> [<run key file>]" >&2
  exit 2
fi
if [ "$(ps -o pgid= -p $$ | tr -d ' ')" != "$$" ]; then exec setsid bash "$0" "$@"; fi
# NVM ONLY WHEN IT IS THERE. On the host this has always meant ~/.nvm, and sourcing it is
# unchanged. Inside a sandbox there is no nvm at all — Node 22 is already on PATH from the
# image — and sourcing a file that does not exist printed "No such file or directory" on
# stderr for every run, since this script has no errexit to stop it there. Source it only
# when it exists.
export NVM_DIR="$HOME/.nvm"
if [ -f "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh" >/dev/null; fi
# INSIDE A SANDBOX THE HOST'S dsh FOLDER IS NOT THERE (acceptance finding 68). A round started there without the
# instance's own folder ran a path that does not exist and ended at once with exit 127, looking started. So it stops here
# and says why, before it reads a dsh env file or starts anything.
if [ -z "${MOLE_OFFICE_DSH_DIR:-}" ] && [ -n "${SANDBOX_DIR:-}" ]; then
  echo "run-agent.sh: this is a sandbox (SANDBOX_DIR=$SANDBOX_DIR) and MOLE_OFFICE_DSH_DIR is not set, so there is no dsh to run: the host's own dsh folder is not in the sandbox. Set it to the instance's dsh folder, $SANDBOX_DIR/dsh, or start the round through tools/sandbox-start.mjs, which does. Nothing was started." >&2
  exit 2
fi
# WHERE THE dsh INSTALL LIVES. The installed path under HOME is the default on the host. tools/sandbox-start.mjs sets it
# to the instance's own dsh folder for every command in a sandbox that has one (acceptance finding 68), and a test may
# point it at a scratch install holding a fake dsh, so the runner's own wiring is exercised without starting a real
# agent. A process that runs this with any other HOME sets it too, or finds no dsh and stops.
D="${MOLE_OFFICE_DSH_DIR:-$HOME/.cache/mole-office/dsh}"
export DSH_HOME=$D/home
# THE DEEPSEEK KEY COMES FROM THE RUN'S OWN ENVIRONMENT (problem epOLxauSbzd9, 28 September 2026). Every sandbox used to
# keep a copy of dsh's env file, which any run there could read, whatever its runtime. Now the launcher passes the key to
# a dsh run alone (theDeclaredSecrets in tools/sandbox-common.mjs, readBy dsh), and no copy is made. So in a sandbox this
# never reads a key file, even an older copy still there: with no key in the environment it stops and says how a dsh run
# gets one. On the host, where the key is not in the environment, the host's own env file is read as before.
if [ -z "${DEEPSEEK_API_KEY:-}" ]; then
  if [ -n "${SANDBOX_DIR:-}" ]; then
    echo "run-agent.sh: this is a sandbox (SANDBOX_DIR=$SANDBOX_DIR) and the run was given no DEEPSEEK_API_KEY, so no dsh was started. A DeepSeek worker starts only through the launcher on the host, with --runtime dsh, which gives that run the key and no other run; no key file is kept in a sandbox. A supervisor in a sandbox asks the secretary to start one." >&2
    exit 2
  fi
  if [ -f "$D/env" ]; then set -a; . "$D/env"; set +a; fi
fi
# THIS SCRIPT'S OWN DIRECTORY, where keep-the-brief.mjs and the brief-by-path overlay live.
HERE="$(cd "$(dirname "$0")" && pwd)"
# THE PERMISSIONS dsh RUNS WITH, worked out in one place (src/config/run-permissions.mjs, through
# tools/run-permissions.mjs) and not a second time here. Full, DSH_PERMISSION_MODE=danger-full-access,
# in a sandbox, where the container is the wall, or on the host when the
# main-world guard is mounted into dsh: when tools/dsh-hooks/hooks.json, which the office profile
# below mounts, names it as a PreToolUse hook.
# Otherwise dsh's own default, workspace-write with approval asked, and a danger-full-access that
# came in from the environment or the env file above is taken out. Until 22 September 2026 this line
# exported danger-full-access for every run, on the host too. A claim that cannot be read stops the
# run here, before dsh starts.
said="$(node "$HERE/../run-permissions.mjs" dsh)" || {
  echo "run-agent.sh: the permissions for this run could not be worked out (the reason is above), so dsh was not started." >&2
  exit 1
}
permissions=""
while IFS= read -r one; do
  case "$one" in
    '# '*) permissions="${one#\# }" ;;
    'export '*=*) export "${one#export }" ;;
    'unset '*) unset "${one#unset }" ;;
    '') ;;
    *) echo "run-agent.sh: tools/run-permissions.mjs printed a line this does not read: $one. dsh was not started." >&2; exit 1 ;;
  esac
done <<EOF
$said
EOF
# THE RUN'S OWN KEY, AND NEVER THE STARTER'S (problem bxJ0SwInDFtW; the header says why). Decided here, after the env
# file above is read and before anything is started, so nothing later puts another key back. The file is the one
# tools/register-a-run.mjs --run-key-file wrote: a regular file, no link, holding one key and nothing else. The key is
# never printed.
if [ -n "$RUN_KEY_FILE" ]; then
  if [ -L "$RUN_KEY_FILE" ] || [ ! -f "$RUN_KEY_FILE" ]; then
    echo "run-agent.sh: the run key file $RUN_KEY_FILE is not a regular file, so no agent was started. Give the file tools/register-a-run.mjs --run-key-file wrote." >&2
    exit 2
  fi
  the_run_key="$(head -c 256 "$RUN_KEY_FILE" | tr -d '[:space:]')"
  if [ "${#the_run_key}" -ne 64 ] || [ -n "$(printf '%s' "$the_run_key" | tr -d '0-9a-f')" ]; then
    echo "run-agent.sh: the run key file $RUN_KEY_FILE does not hold one key, so no agent was started. Give the file tools/register-a-run.mjs --run-key-file wrote." >&2
    exit 2
  fi
  unset the_run_key
  # The full path, because the agent starts in the worktree and not here.
  case "$RUN_KEY_FILE" in /*) ;; *) RUN_KEY_FILE="$PWD/$RUN_KEY_FILE" ;; esac
  # THE AGENT'S OWN READER JUDGES THE FILE, with its own rules and words: no link, a regular file of this user that
  # nobody else may read, holding one key.
  if ! MOLE_AGENT_KEY= MOLE_AGENT_KEY_FILE="$RUN_KEY_FILE" node --input-type=module -e '
const { aSecretFromTheEnvironment, THE_AGENT_KEY } = await import(process.argv[1])
try { aSecretFromTheEnvironment(THE_AGENT_KEY, process.env, "No agent was started.") } catch (why) { console.error("run-agent.sh: " + why.message); process.exit(2) }
' "$HERE/../../for-agents/agent-key.mjs"; then
    exit 2
  fi
  unset MOLE_AGENT_KEY
  export MOLE_AGENT_KEY_FILE="$RUN_KEY_FILE"
elif [ -n "${MOLE_AGENT_KEY_FILE:-}" ]; then
  echo "run-agent.sh: MOLE_AGENT_KEY_FILE is set, and it names the key file of whoever started this, not of the run it starts. A started agent never holds its starter's key. File the run with tools/register-a-run.mjs --run-key-file <a new file> and give that file as the seventh argument, or unset MOLE_AGENT_KEY_FILE to start the agent with no key. Nothing was started." >&2
  exit 2
elif [ -n "${MOLE_AGENT_KEY:-}" ] && [ -z "${SANDBOX_DIR:-}" ]; then
  echo "run-agent.sh: MOLE_AGENT_KEY is set, and on the host that is the key of whoever started this, not of the run it starts. A started agent never holds its starter's key (problem bxJ0SwInDFtW). File the run with tools/register-a-run.mjs --run-key-file <a new file> and give that file as the seventh argument, or unset MOLE_AGENT_KEY to start the agent with no key. Nothing was started." >&2
  exit 2
fi
export MOLE_OFFICE_AGENT="$HANDLE"
export MOLE_OFFICE_SESSION="$SESSION"
export MOLE_OFFICE_WORKSPACE="$WORKSPACE"
# THE BRIEF'S PATH, for the runner's own record of what the run worked from: criterion HB1 reads
# its size in bytes at the run's end, and criterion HB4 keeps the brief itself at the run's start.
export MOLE_OFFICE_BRIEF_PATH="$BRIEF"
# THE BRIEF ITSELF, KEPT ON THE OFFICE at the run's start, criterion HB4: a note about this run
# reads its brief back from the office when the scratch folder it came from is gone. One sentence
# on stderr when it could not be kept; the run starts either way.
cd "$W" || exit 1
export MOLE_OFFICE_DSH_DIR="$D"
if [ -z "${TMPDIR:-}" ]; then
  TMPDIR=$(mktemp -d) || exit 1
  export TMPDIR
  trap 'rm -rf -- "$TMPDIR"' EXIT
fi
prepared=$(node "$HERE/run-settings.mjs" "$D" "$TMPDIR") || exit 2
effort_words="${prepared%%$'\n'*}"
# Command substitution strips trailing newlines. A start sentence alone carries no settings patch.
settings_patch=""
case "$prepared" in
  *$'\n'*) settings_patch="${prepared#*$'\n'}" ;;
esac
settings_args=()
if [ -n "$settings_patch" ]; then settings_args=(--patch "$settings_patch"); fi
node "$HERE/keep-the-brief.mjs" || true
line="dsh agent pid $$ pgid $$ cwd $W handle $HANDLE session $SESSION workspace $WORKSPACE started $(date '+%F %T'); $effort_words"
echo "$line"; echo "=== $line" >> "$LOG"
echo "$permissions"; echo "=== $permissions" >> "$LOG"
# THE HARNESS'S OWN SUBAGENTS AND WORKFLOWS OFF: the patch list dsh-harness-features-off.patch.json of the checkout
# this script runs from, read from tools/harness-features-off.mjs, which names it as dsh's switch. It goes right after
# the brief-by-path patch. dsh 0.1.5-rc.2 refuses to start when it cannot read a --patch file.
features_off="$(node --input-type=module -e 'const { DSH_FEATURES_OFF } = await import(process.argv[1]); console.log(DSH_FEATURES_OFF[1])' "$HERE/../harness-features-off.mjs")" || {
  echo "run-agent.sh: tools/harness-features-off.mjs could not be read for dsh's patch list (the reason is above), so dsh was not started." >&2
  exit 1
}
nice -n 19 "$D/npm/node_modules/.bin/dsh" --profile office --patch "$HERE/brief-by-path.patch.yml" --patch "$features_off" "${settings_args[@]}" "$BRIEF" < /dev/null >> "$LOG" 2>&1
code=$?
echo "=== dsh agent end $(date '+%F %T') exit $code" >> "$LOG"
exit $code
