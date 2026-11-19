// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A SESSION'S OWN PROCESS: THE HOOK WRITES IT DOWN, THE OFFICE ASKS WHETHER IT IS STILL THERE.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A WAITING SESSION'S PROCESS IS THE RIGHT SIGN OF LIFE
 * ---------------------------------------------------------------------------------------------
 *
 * Criterion M106: online means a session is answering and can
 * take a message now. A Claude Code session waiting in its terminal writes nothing to its
 * transcript — it is idle between turns — yet it can take a message now: the waiter hands it the
 * message and the session wakes. So a record's transcript is the wrong sign of life for a waiting
 * session, and the session's own process is the right one. Measured on 12 September 2026: a waiting agent's
 * handle read `nobody` two minutes after its last act because the only readings were a resource
 * row and the transcript.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS A `.mjs` FILE IN `src/config`
 * ---------------------------------------------------------------------------------------------
 *
 * Two callers need the same reading and they run in two different worlds:
 *
 *   · `tools/session-hook.mjs`, a plain Node script Claude Code runs. The Node on the PATH a hook
 *     is handed cannot read a `.ts` file (the hook's own header has the measurement), and this
 *     repository's plain-JavaScript modules for that caller live in `src/config`.
 *   · `src/server/lib/answering.ts`, the office's own reading, which imports `.mjs` from `src/config`
 *     in several places already (`settings.mjs`, `stopped-run-cause.mjs`, `visit-headers.mjs`).
 *
 * ONE FACT, ONE PLACE, as invariant 9 of USER.md asks. The hook records the process through
 * `theProcessBehindTheHook`; the office checks it through `theRecordedProcess`. Neither works the
 * process table out again.
 *
 * THERE IS A THIRD CALLER SINCE 24 SEPTEMBER 2026: `tools/hold-the-handle.mjs`, the waiter, which is
 * often not below the session at all and reads `theSessionProcessForTheWaiter` instead. The office's
 * door for what it finds is `src/server/lib/held-process.ts`, and that door reads this module too. `theProcessPatchFor` is the one rule for
 * what either writer puts on a record, so the hook and the door cannot write the process differently.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT READS, AND WHAT AN ABSENCE MEANS
 * ---------------------------------------------------------------------------------------------
 *
 * THIS MODULE READS NO PROCESS ITSELF. Every reading goes through the process reader for this
 * platform, `theProcessReader()` in src/config/process-reader.mjs: /proc on Linux, `ps` and `lsof`
 * on macOS. Each function below takes a reader as its last argument, so a test can hand in its own.
 *
 * A command line is the process's arguments with spaces between them. It is kept on the
 * record and read for the conversation a process names. It never decides whether a process is the
 * claude program: `isTheClaudeProgram` reads the process's own name and executable for that.
 *
 * A CODEX PROCESS IS READ BY ITS COMMAND LINE, which the claude program no longer is. `namesTheCodexProgram`
 * answers whether a command line is codex at all, and `codexThreadIn` answers which thread a
 * `codex resume <thread>` is; a bare `codex --yolo` names no thread, which is an absence and not a
 * guess. Both are used by `answering.ts` to find a codex session's rollout file.
 *
 * A start time is the moment the process began, to the second, and that is what tells a reused pid
 * number apart from the process a record really named.
 *
 * NOTHING HERE INVENTS A VALUE. A process this reader cannot see, or that is not the claude
 * program, or whose start time will not read, answers with the plain sentence saying so. The
 * caller records that absence or says it; it is never filled with a plausible value.
 */

import { theProcessReader } from './process-reader.mjs'
import { localStampOf } from './stopped-run-cause.mjs'
import { withSecretsMarked } from './secret-shapes.mjs'
import { theStartFlagsOf } from './the-way-back.mjs'

/** How much of a process command line is stored, after screening. Enough to name the program and the session it is. */
export const MOST_CHARACTERS_OF_A_COMMAND_LINE = 200

/**
 * WHAT A SESSION RECORD STORES OF THE COMMAND LINE ITS PROCESS WAS STARTED WITH (wave 13u, round 10b).
 *
 * A command line can hold a key: an --api-key, a password, a token given a value. So the whole of it is never stored.
 * `pidCommand` is its first MOST_CHARACTERS_OF_A_COMMAND_LINE characters, with every piece that looks like a key by the
 * office's secret-shape check (src/config/secret-shapes.mjs) replaced by a marker first, so a key cut in two at the end
 * is not let through. `pidFlags` is what the way back needs (src/config/the-way-back.mjs): the flags a resumed run
 * keeps, by name and value, and the names of the ones it drops, read through the same check.
 *
 * @param {string} commandLine
 * @returns {{ pidCommand: string, pidFlags: { kept: { name: string, value: string | null }[], dropped: string[] } }}
 */
export function theCommandLineStored(commandLine) {
  return {
    pidCommand: withSecretsMarked(commandLine).text.slice(0, MOST_CHARACTERS_OF_A_COMMAND_LINE),
    pidFlags: theStartFlagsOf(commandLine),
  }
}

/**
 * How far up a hook's parent chain the claude program is looked for.
 *
 * Claude Code runs a hook command through `/bin/sh -c`, so the immediate parent is a shell. A count
 * rather than a search to the top: a chain that has not reached claude within five steps is a chain
 * that is not this session, and walking further would only delay the answer.
 */
export const MOST_STEPS_UP_THE_PARENT_CHAIN = 5

/**
 * What the hook found out about the process that started it. `recorded` is true only when all three
 * fields were read; `why` says what was missing when it is not. `pidCommand` and `pidFlags` are what
 * `theCommandLineStored` keeps of the command line, never the whole of it.
 *
 * @typedef {{ recorded: boolean, pid: number | null, pidStartedAt: string | null, pidCommand: string | null, pidFlags?: ReturnType<typeof theCommandLineStored>['pidFlags'] | null, why: string | null }} HookProcess
 */

/**
 * What the office made of a record's recorded process. `trusted` is true only when every reading
 * holds; `says` is the plain sentence either way.
 *
 * @typedef {{ trusted: boolean, says: string }} RecordedProcessReading
 */

/**
 * The command line of a process, or null when no process has that number or it cannot be read.
 *
 * @param {number} pid
 * @param {ProcReads} [reads] the process reader for this platform unless a test hands in its own
 * @returns {string | null}
 */
export function commandLineOf(pid, reads = theProcessReader()) {
  return reads.commandLineOf(pid)
}

/**
 * The name the system gives a process, or null when it cannot be read: on Linux the base name of
 * the file it was started from, cut to 15 characters. A program started through a link named
 * `claude` is called `claude` here, and so is a script named `claude`.
 *
 * @param {number} pid
 * @param {ProcReads} [reads] the process reader for this platform unless a test hands in its own
 * @returns {string | null}
 */
export function nameOf(pid, reads = theProcessReader()) {
  return reads.nameOf(pid)
}

/**
 * The file a process is running, or null when it cannot be read. The system refuses this for
 * another user's process, and that is an absence here too.
 *
 * @param {number} pid
 * @param {ProcReads} [reads] the process reader for this platform unless a test hands in its own
 * @returns {string | null}
 */
export function executableOf(pid, reads = theProcessReader()) {
  return reads.executableOf(pid)
}

/**
 * WHETHER A PROCESS IS THE CLAUDE PROGRAM, read from the process itself and never from its
 * command line.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY NOT THE COMMAND LINE
 * ---------------------------------------------------------------------------------------------
 *
 * Claude Code's Bash tool runs every command inside a shell whose command line carries the whole
 * command: `/bin/bash -c source ~/.claude/shell-snapshots/… && eval '<the command>' && pwd -P …`.
 * A command with a word such as `tools/claude/x` put the word `claude` on that shell's command line.
 * The walk then took the shell for the session, and the waiter offered it to the office (problem
 * YJm0foMaxrZN, 24 September 2026: pid 684407, a bash).
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS READ, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------------
 *
 * The process is the claude program when its name (`/proc/<pid>/comm` on Linux, `ps -o ucomm=` on
 * macOS) is `claude`, or when its executable (the link `/proc/<pid>/exe` on Linux, the first `txt`
 * file `lsof` lists on macOS, `ExecutablePath` on Windows) has a path segment `claude` or is a file
 * named `claude.exe`. The path is split at '/' and at a backslash, so a Windows path has its segments too. A
 * shell is refused by the same rule: its name is `bash`, `sh`, `dash` or `zsh`, and its executable
 * is a file such as `/usr/bin/bash`, whatever its command line says.
 *
 * Measured in sandbox w11c on 24 September 2026, on this worker's own parent chain:
 *
 *   · the claude program: name `claude`, executable
 *     `/usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe`. No segment of that
 *     path is exactly `claude`, so the name `claude.exe` is part of the rule.
 *   · the Bash tool's shell: name `bash`, executable `/usr/bin/bash`. Refused.
 *
 * On the owner's machine the program is `~/.local/share/claude/versions/<version>`, started through
 * a link named `claude`. Its executable has the segment `claude`. Its name should be `claude` too,
 * because the kernel names a process after the path it was started by; that part is inferred and
 * was not measured there.
 *
 * THE STAND-INS THE TESTS MAKE PASS BY THEIR NAME. Measured here the same day: a script named
 * `claude` run by `/bin/sh` is named `claude` with executable `/usr/bin/dash`; a link named `claude`
 * to node is named `claude` with executable node; a node process that sets `process.title` to
 * `claude` is named `claude` with executable node. Each of them is taken for the claude program.
 *
 * `reads` is the process table; the default is the process reader for this platform.
 *
 * @param {number} pid
 * @param {ProcReads} [reads]
 * @returns {boolean}
 */
export function isTheClaudeProgram(pid, reads = theProcessReader()) {
  if (reads.nameOf(pid) === 'claude') return true
  const executable = reads.executableOf(pid)
  if (executable === null) return false
  // A Windows path is split at a backslash as well as at '/' (problem SR-v2H7gPdGo).
  const segments = executable.split(/[\\/]/)
  return segments.includes('claude') || segments[segments.length - 1] === 'claude.exe'
}

/**
 * Whether a command line names the codex program.
 *
 * It matches the two command lines this machine was measured running
 * on 12 September 2026: a node wrapper at `…/bin/codex` and the musl binary at
 * `…/@openai/codex-linux-x64/vendor/…/bin/codex`. A segment exactly `codex` is the program; it does
 * not match `codex-adapter` in a path or `--codex` in an argument, because neither segment is
 * exactly `codex`.
 *
 * @param {unknown} commandLine
 * @returns {boolean}
 */
export function namesTheCodexProgram(commandLine) {
  if (typeof commandLine !== 'string' || commandLine.trim() === '') return false
  return commandLine
    .split(/\s+/)
    .some((word) => word.split('/').some((segment) => segment === 'codex'))
}

/**
 * The shape both tools give a conversation: a codex thread id and a claude conversation id are the
 * same kind of string. One constant, so the two readers below cannot come to disagree about what a
 * conversation id looks like.
 */
const A_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The thread a `codex resume <thread>` command line names, or null.
 *
 * Measured on this machine: `node …/bin/codex resume 01a081bd-… --yolo`, and the thread after
 * `resume` is the codex session the process is. A bare `codex --yolo` names no thread, and this
 * answers null rather than reading the next flag as one. The id is checked against the uuid shape
 * because `codex resume --last` and `codex resume <path>` are both real, and neither is a thread id.
 *
 * @param {unknown} commandLine
 * @returns {string | null}
 */
export function codexThreadIn(commandLine) {
  if (typeof commandLine !== 'string' || commandLine.trim() === '') return null
  const tokens = commandLine.split(/\s+/)
  const i = tokens.indexOf('resume')
  if (i === -1) return null
  const value = tokens[i + 1]
  return typeof value === 'string' && A_UUID.test(value) ? value : null
}

/**
 * THE CONVERSATION A CLAUDE COMMAND LINE NAMES, or null because it names none.
 *
 * A Claude Code session that was resumed carries its conversation in its own arguments, in one of
 * three spellings: `claude --resume <id>`, `claude -r <id>` and `claude --session-id <id>`. That is
 * the one tie between a process and a conversation that Mole Office can read for itself, which is
 * why the door for a session's own process tries it first.
 *
 * A SESSION STARTED WITHOUT ONE NAMES NO CONVERSATION HERE, and this answers null rather than
 * reading the next flag as an id. Measured in this sandbox on 24 September 2026: `claude -p --model
 * opus --permission-mode bypassPermissions` is a live session whose command line names no
 * conversation at all. The id is checked against the uuid shape for the same reason `codexThreadIn`
 * checks it: `--resume` may be followed by another flag, and a flag is not a conversation.
 *
 * @param {unknown} commandLine
 * @returns {string | null}
 */
export function claudeConversationIn(commandLine) {
  if (typeof commandLine !== 'string' || commandLine.trim() === '') return null
  const tokens = commandLine.split(/\s+/)
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (token !== '--resume' && token !== '-r' && token !== '--session-id') continue
    const value = tokens[i + 1]
    if (typeof value === 'string' && A_UUID.test(value)) return value
  }
  return null
}

/**
 * THE LIVE CODEX PROCESS WHOSE ARGUMENTS NAME THIS THREAD, or null because no process does.
 *
 * Codex is started as `codex resume <thread>`, so the thread is on the process's own command line.
 * A codex record names no codex pid, so the process is found by walking every process for one whose command
 * line names the codex program and whose `resume` argument is exactly this thread. A process that
 * cannot be read, or one that is codex without naming this thread, is skipped. A reader that cannot
 * look at all throws, as every reader does; a process table that is there and cannot be listed
 * answers null, which the caller says rather than guessing.
 *
 * @param {unknown} thread
 * @param {{ everyCommandLine: import('./process-reader.mjs').ProcessReader['everyCommandLine'] }} [reads] the
 *   process reader for this platform unless a test hands in its own
 * @returns {number | null}
 */
export function theLiveCodexProcessFor(thread, reads = theProcessReader()) {
  if (typeof thread !== 'string' || thread.trim() === '') return null
  const every = reads.everyCommandLine()
  if (every === null) return null
  for (const { pid, command } of every) {
    if (!namesTheCodexProgram(command)) continue
    if (codexThreadIn(command) === thread) return pid
  }
  return null
}

/**
 * THE LIVE PROCESS A CODEX SESSION IS TIED TO, from the thread in a process's arguments or from the
 * bridge the record itself names.
 *
 * A codex session's bridge is not the session, so a live process alone is not an answer and its own
 * `state: running` is a claim. Two ties are measured instead, and either one holds:
 *
 *   1. A CODEX PROCESS WHOSE ARGUMENTS CARRY THE THREAD — `codex resume <thread>`. This is the
 *      codex session itself, running, and the thread on its command line is what ties it here.
 *   2. THE BRIDGE THE RECORD NAMES — `extra.codexBridge.pid` and the script it recorded. The pid is
 *      read from the process table and its command line has to still name that script (or the thread), so a
 *      reused pid number running an unrelated program is not mistaken for the bridge. That claim,
 *      and not the record's `state` field, is what this trusts.
 *
 * Neither tie is invented: a thread with no process, a bridge pid that is gone, and a bridge pid
 * now running something else all answer `trusted: false` with the sentence saying what was read.
 *
 * @param {unknown} thread
 * @param {unknown} bridgePid
 * @param {unknown} bridgeScript
 * @returns {{ trusted: boolean, says: string }}
 */
export function theCodexProcessTiedTo(thread, bridgePid, bridgeScript) {
  const fromArguments = theLiveCodexProcessFor(thread)
  if (fromArguments !== null) {
    return {
      trusted: true,
      says: `a live codex process ${String(fromArguments)} whose arguments name this session's thread is alive`,
    }
  }
  if (typeof bridgePid !== 'number' || !Number.isInteger(bridgePid) || bridgePid <= 0) {
    return { trusted: false, says: 'no process was recorded for it' }
  }
  const commandLine = commandLineOf(bridgePid)
  if (commandLine === null) {
    return { trusted: false, says: `its recorded bridge process ${String(bridgePid)} is not alive` }
  }
  const namesTheBridge =
    (typeof bridgeScript === 'string' && bridgeScript.trim() !== '' && commandLine.includes(bridgeScript)) ||
    (typeof thread === 'string' && thread.trim() !== '' && commandLine.includes(thread))
  if (!namesTheBridge) {
    return {
      trusted: false,
      says: `its recorded bridge process ${String(bridgePid)} is not running the bridge that was recorded`,
    }
  }
  return { trusted: true, says: `its recorded bridge process ${String(bridgePid)} is alive` }
}

/**
 * When a process began, as a Date, or null when that cannot be read.
 *
 * @param {number} pid
 * @param {ProcReads} [reads] the process reader for this platform unless a test hands in its own
 * @returns {Date | null}
 */
export function startTimeOf(pid, reads = theProcessReader()) {
  return reads.startTimeOf(pid)
}

/**
 * ONE PROCESS AS THE SERVICE LOCK NEEDS IT: is it running, when did it begin, and which process
 * group is it in.
 *
 * src/config/the-service-lock.mjs asks this about the process a lock names, and the server and the
 * `mole-office` command ask it about themselves. It reads through the process reader, so the start
 * time is worked out in one place on each platform.
 *
 * THREE ANSWERS, AND THEY ARE KEPT APART:
 *
 *   - `{ here: false }`: no process has this number, or the one that had it has ended and is only
 *     waiting to be collected by its parent (its state starts with `Z`, or is `X` on Linux). Either
 *     way it serves nothing.
 *   - `{ here: true, startedAt, pgid }` with both read.
 *   - `{ here: true, startedAt: null, pgid: null }`: a process has this number, but what it is could
 *     not be read. That is an absence, and the caller says so rather than guessing.
 *
 * `startedAt` is the moment the reader reads, written as an ISO string so it can be stored in a
 * file and compared as text. It is compared only with readings taken on the same machine.
 *
 * @param {number} pid
 * @param {{ processAt: import('./process-reader.mjs').ProcessReader['processAt'] }} [reads] the process
 *   reader for this platform unless a test hands in its own
 * @returns {{ here: false } | { here: true, startedAt: string | null, pgid: number | null }}
 */
export function theProcessAt(pid, reads = theProcessReader()) {
  return asTheLockReadsIt(reads.processAt(pid))
}

/**
 * The same answer, read without holding the thread where the reader has a way to (Windows: `readProcessAt`).
 * Elsewhere the reading is `processAt`, which does not wait on another program.
 *
 * @param {number} pid
 * @param {{ processAt: import('./process-reader.mjs').ProcessReader['processAt'],
 *   readProcessAt?: import('./process-reader.mjs').ProcessReader['readProcessAt'] }} [reads] the process
 *   reader for this platform unless a test hands in its own
 * @returns {Promise<{ here: false } | { here: true, startedAt: string | null, pgid: number | null }>}
 */
export async function readTheProcessAt(pid, reads = theProcessReader()) {
  return asTheLockReadsIt(reads.readProcessAt === undefined ? reads.processAt(pid) : await reads.readProcessAt(pid))
}

/**
 * @param {import('./process-reader.mjs').ProcessAt} at
 * @returns {{ here: false } | { here: true, startedAt: string | null, pgid: number | null }}
 */
function asTheLockReadsIt(at) {
  if (!at.here) return { here: false }
  if (at.unreadable !== undefined) return { here: true, startedAt: null, pgid: null }
  if (at.state.startsWith('Z') || at.state === 'X') return { here: false }
  return { here: true, startedAt: at.startedAt.toISOString(), pgid: at.pgid > 0 ? at.pgid : null }
}

/**
 * A WATCH ON THE PROCESS THAT STARTED THIS ONE, for `--stop-with-pid=<pid>` (problem 26r01Ohh-DqX).
 *
 * The process is read once now, and each answer afterwards says whether it is still that process: the same pid, the
 * same start time, and not a zombie. A pid alone is not an identity, because pids are given out again. Until 5 October
 * 2026 the server and the message worker asked only whether the pid was taken, and five stand-in servers a test had
 * started stayed up for days after their test runs ended.
 *
 *   - `{ state: 'gone' }`: nothing runs under the pid, it is a zombie, it was already gone when the watch began, or it
 *     now runs a process that started at another time;
 *   - `{ state: 'there' }`: the same process, or a process under the pid whose start time cannot be read, now or when
 *     the watch began, which is then answered by the pid alone, as before, because calling it gone would be a guess;
 *   - `{ state: 'unreadable', why }`: the reader could not look at all (a process table that cannot be read, or a ps
 *     that cannot run), now or when the watch began. COULD NOT LOOK IS NOT GONE (invariant 5), and the watch never
 *     throws it at its caller: the server and the worker each say so once and stop watching, as the server did before
 *     the watch existed (the inspector's refusal of run amHwZR-VRQR8).
 *
 * @param {number} pid
 * @param {{ processAt: import('./process-reader.mjs').ProcessReader['processAt'] }} [reads] the process
 *   reader for this platform unless a test hands in its own
 * @returns {() => { state: 'there' | 'gone' } | { state: 'unreadable', why: string }}
 */
export function aWatchOnTheStarter(pid, reads = theProcessReader()) {
  /** @returns {ReturnType<typeof theProcessAt> | { unreadable: string }} */
  const look = () => {
    try {
      return theProcessAt(pid, reads)
    } catch (err) {
      return { unreadable: err instanceof Error ? err.message : String(err) }
    }
  }
  const first = look()
  return () => {
    if ('unreadable' in first) return { state: 'unreadable', why: first.unreadable }
    const now = look()
    if ('unreadable' in now) return { state: 'unreadable', why: now.unreadable }
    if (!now.here || !first.here) return { state: 'gone' }
    if (first.startedAt === null || now.startedAt === null) return { state: 'there' }
    return { state: now.startedAt === first.startedAt ? 'there' : 'gone' }
  }
}

/**
 * THE PARENT OF A PROCESS, or null when that cannot be read. Pid 1's parent is 0, which is no
 * process, and this answers 0 rather than inventing one; the climb that calls it stops there.
 *
 * @param {number} pid
 * @param {ProcReads} [reads] the process reader for this platform unless a test hands in its own
 * @returns {number | null}
 */
export function parentOf(pid, reads = theProcessReader()) {
  return reads.parentOf(pid)
}

/**
 * HOW THE CLIMB SEES THE PROCESS TABLE: a process's command line, its name, its executable, its
 * parent and when it began.
 *
 * The hook has no way to hand anything to a running session, so the real reader is the process
 * reader for this platform, `theProcessReader()`. A test hands in a reader of its own instead, which
 * is the only way to measure a parent chain that is not this machine's.
 *
 * @typedef {{
 *   commandLineOf: (pid: number) => string | null,
 *   nameOf: (pid: number) => string | null,
 *   executableOf: (pid: number) => string | null,
 *   parentOf: (pid: number) => number | null,
 *   startTimeOf: (pid: number) => Date | null,
 * }} ProcReads
 */

/**
 * THE SESSION'S OWN PROCESS BEHIND THE HOOK, or why there is none to record.
 *
 * THE HOOK IS NOT ALWAYS THE SESSION'S CHILD. Claude Code runs a hook command through `/bin/sh -c`,
 * so the hook's immediate parent is a shell and the claude program is one or more steps above it.
 * This walks the parent chain, at most `MOST_STEPS_UP_THE_PARENT_CHAIN` processes and never past
 * pid 1. It steps past every process that is not the claude program, shells included, and records
 * the first one that is, by `isTheClaudeProgram`. A shell whose command line mentions claude is
 * stepped past like any other.
 *
 * A CHAIN WITH NO CLAUDE ANSWERS `recorded: false`, and the sentence names every process it looked
 * at, in order, so a reader can see how far it went and what each one was. A process whose own
 * parent cannot be read ends the walk there: the next link is unknown, and guessing it would record
 * a process that is not the session.
 *
 * `pidStartedAt` is in the office's own stamp shape, to the second, so the office can compare it
 * with the same reading taken later.
 *
 * `reads` is the process table as this walk sees it. The default is the process reader for this
 * platform; a test hands in its own
 * reader so it can measure a chain without changing this machine.
 *
 * @param {number} ppid
 * @param {ProcReads} [reads]
 * @returns {HookProcess}
 */
export function theProcessBehindTheHook(ppid, reads = theProcessReader()) {
  const first = Number(ppid)
  if (!Number.isInteger(first) || first <= 0) {
    return { recorded: false, pid: null, pidStartedAt: null, pidCommand: null, why: 'the hook has no parent process this machine can name' }
  }
  /** @type {{ pid: number, commandLine: string | null }[]} */
  const lookedAt = []
  let pid = first
  for (let step = 0; step < MOST_STEPS_UP_THE_PARENT_CHAIN; step += 1) {
    // PID 1 IS THE END OF THE CHAIN. Its parent is 0, which is no process, so the walk stops here
    // and never reads past it.
    if (pid <= 1) break
    const commandLine = reads.commandLineOf(pid)
    lookedAt.push({ pid, commandLine })
    if (commandLine !== null && isTheClaudeProgram(pid, reads)) {
      const started = reads.startTimeOf(pid)
      if (started === null) {
        return { recorded: false, pid: null, pidStartedAt: null, pidCommand: null, why: `when the process that started this hook (${String(pid)}) began could not be read` }
      }
      return {
        recorded: true,
        pid,
        pidStartedAt: localStampOf(started),
        ...theCommandLineStored(commandLine),
        why: null,
      }
    }
    // A PROCESS WHOSE PARENT CANNOT BE READ ENDS THE WALK. Continuing would mean guessing the next
    // link, and the next link is what the claude program would be.
    const parent = commandLine === null ? null : reads.parentOf(pid)
    if (parent === null || !Number.isInteger(parent) || parent <= 0) break
    pid = parent
  }
  return {
    recorded: false,
    pid: null,
    pidStartedAt: null,
    pidCommand: null,
    why:
      `the process that started this hook is not the claude program within ` +
      `${String(MOST_STEPS_UP_THE_PARENT_CHAIN)} steps up its parent chain: ${theProcessesLookedAt(lookedAt)}`,
  }
}

/**
 * The processes the climb looked at, in the order it looked at them, each named with what it was.
 *
 * A process whose command line could not be read is named too, and says so, because "the chain
 * stopped here" is the useful fact when the claude program was never reached.
 *
 * @param {{ pid: number, commandLine: string | null }[]} lookedAt
 * @returns {string}
 */
function theProcessesLookedAt(lookedAt) {
  return lookedAt
    .map((one) =>
      one.commandLine === null
        ? `${String(one.pid)} (could not be read)`
        : `${String(one.pid)}: ${theCommandLineStored(one.commandLine).pidCommand}`,
    )
    .join('; ')
}

/**
 * WHETHER THE PROCESS A RECORD NAMED IS STILL THE PROCESS THAT IS RUNNING.
 *
 * All three readings have to hold, and each is a different question:
 *
 *   · the pid is running now, so the number is not free;
 *   · it is still the claude program by `isTheClaudeProgram`, so the number was not handed to
 *     something else;
 *   · its start time still matches the recorded `pidStartedAt`, so a pid number that has been
 *     reused by an unrelated later process is not mistaken for the session.
 *
 * `trusted: false` comes with the plain sentence naming what was read, and the sentence always
 * names the pid when one was recorded.
 *
 * @param {number | null} pid
 * @param {string | null} pidStartedAt
 * @returns {RecordedProcessReading}
 */
export function theRecordedProcess(pid, pidStartedAt) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) {
    return { trusted: false, says: 'no process was recorded for it' }
  }
  const commandLine = commandLineOf(pid)
  if (commandLine === null) {
    return { trusted: false, says: `its recorded process ${String(pid)} is not alive` }
  }
  if (!isTheClaudeProgram(pid)) {
    return { trusted: false, says: `its recorded process ${String(pid)} is not the claude program` }
  }
  const started = startTimeOf(pid)
  if (started === null) {
    return { trusted: false, says: `when its recorded process ${String(pid)} began could not be read` }
  }
  if (typeof pidStartedAt !== 'string' || pidStartedAt === '' || localStampOf(started) !== pidStartedAt) {
    return { trusted: false, says: `its recorded process ${String(pid)} is not the process that was recorded` }
  }
  return { trusted: true, says: `its recorded process ${String(pid)} is the one that was recorded` }
}

/**
 * WHETHER THE PROCESS A RECORD NAMED STILL RUNS: `yes`, `no`, or `cannot-tell`, with the sentence of what was read.
 *
 *   · `yes` when `theRecordedProcess` trusts it.
 *   · `no` only when no process runs under its number now, so whatever held the number has ended.
 *   · `cannot-tell` for the rest: no process was recorded, or a process runs under the number and is not shown to be
 *     the one recorded, because it is not the claude program or its start time differs or cannot be read.
 *
 * The office's inspection (`whetherARunsProcessHasEnded` in src/server/lib/inspection.ts) and the session hook, which
 * asks it before it takes over a run that names another conversation, both read it here, so the two cannot disagree.
 *
 * @param {number | null} pid
 * @param {string | null} pidStartedAt
 * @returns {{ runs: 'yes' | 'no' | 'cannot-tell', says: string }}
 */
export function whetherTheRecordedProcessRuns(pid, pidStartedAt) {
  const reading = theRecordedProcess(pid, pidStartedAt)
  if (reading.trusted) return { runs: 'yes', says: reading.says }
  if (typeof pid === 'number' && Number.isInteger(pid) && pid > 0 && commandLineOf(pid) === null) {
    return { runs: 'no', says: reading.says }
  }
  return { runs: 'cannot-tell', says: reading.says }
}

/**
 * AN ACT THAT ASKS ABOUT MANY PROCESSES, RUN INSIDE ONE READING OF EVERY PROCESS where the reader has one: Windows.
 *
 * On Windows each question about one process is a PowerShell script of about a second, and it holds the thread. On a
 * Windows 11 machine on 7 November 2026, the hook ran 13 of them, one after another, before its first request, and its
 * walk is the only reading of a process there (wave 13t, round W45).
 * The reader's own `readEveryProcessFirst` runs one script for every process, by the way that waits, and answers the
 * act's questions from that reading while the act runs. A reading that failed is thrown at each question, and an act
 * that returns a promise is refused. Where the reader has no such reading (Linux and the Mac), the act runs at once and
 * reads as it always did.
 *
 * @template T
 * @param {() => T} act
 * @param {ProcReads & { readEveryProcessFirst?: <U>(act: () => U) => Promise<U> }} [reads]
 * @returns {Promise<T>}
 */
export async function readEveryProcessFirst(act, reads = theProcessReader()) {
  return typeof reads.readEveryProcessFirst === 'function' ? await reads.readEveryProcessFirst(act) : act()
}

/**
 * What the waiter found out about the session it holds a handle for. The fields are the hook's own,
 * with `foundBy` beside them saying which of the two readings answered.
 *
 * @typedef {HookProcess & { foundBy: 'the walk' | 'CLAUDE_PID' | null }} WaiterProcess
 */

/**
 * THE SESSION'S OWN PROCESS AS THE WAITER CAN FIND IT: the walk first, then `CLAUDE_PID`.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE WALK IS NOT ENOUGH HERE, THOUGH IT IS ENOUGH FOR THE HOOK
 * ---------------------------------------------------------------------------------------------
 *
 * The hook is spawned by the session, so the claude program is a step or two above it. The waiter
 * is not always. Measured on 24 September 2026: all three of the kit's waiters are children of
 * `systemd --user`, because the kit starts them with `setsid nohup … & disown` and the shell that
 * started them exits. From there the claude program is not above this process at all, and the walk
 * answers with the chain it looked at, which is the honest answer and not a usable one.
 *
 * SO THE SECOND READING IS `CLAUDE_PID`, which Claude Code puts in every shell it starts and which
 * survives `setsid nohup`. It is read only when the walk found nothing, and then CHECKED, never
 * trusted: the number must be a process that is running, that is the claude program by the same
 * `isTheClaudeProgram` the walk uses, and whose start time can be read. A waiter that outlived the
 * session that started it carries the old number, and that number fails these checks once the old
 * session has gone.
 *
 * A LOOP STARTED FROM THE BASH TOOL has the tool's shell as its parent while that shell lives, and
 * the shell's command line carries the loop's own command. The walk steps past that shell because
 * its name is `bash`, and reaches the claude program above it.
 *
 * WHAT NEITHER READING CAN DO IS TIE THAT PROCESS TO A CONVERSATION. Both answer *which process*,
 * and the office's own door decides whether that process is this session's — see
 * `src/server/lib/held-process.ts`. This is why a waiter may not write the pid itself.
 *
 * `env` is this process's own environment and nothing else's: reading another process's environment
 * would be reading a claim made for somebody else's session. `reads` is the process table, so a test
 * can measure a chain that is not this machine's.
 *
 * @param {number} ppid
 * @param {Record<string, string | undefined>} [env]
 * @param {ProcReads} [reads]
 * @returns {WaiterProcess}
 */
export function theSessionProcessForTheWaiter(ppid, env = process.env, reads = theProcessReader()) {
  const walked = theProcessBehindTheHook(ppid, reads)
  if (walked.recorded) return { ...walked, foundBy: 'the walk' }

  const said = env['CLAUDE_PID']
  const nothing = { recorded: false, pid: null, pidStartedAt: null, pidCommand: null, foundBy: null }
  if (typeof said !== 'string' || said.trim() === '') {
    return { ...nothing, why: `${String(walked.why)}; CLAUDE_PID is not set` }
  }
  const pid = Number(said)
  const commandLine = Number.isInteger(pid) && pid > 0 ? reads.commandLineOf(pid) : null
  if (commandLine === null || !isTheClaudeProgram(pid, reads)) {
    return { ...nothing, why: `${String(walked.why)}; CLAUDE_PID names ${said}, which is not a running claude program` }
  }
  const started = reads.startTimeOf(pid)
  if (started === null) {
    return { ...nothing, why: `${String(walked.why)}; CLAUDE_PID names ${said}, and when that process began could not be read` }
  }
  return {
    recorded: true,
    pid,
    pidStartedAt: localStampOf(started),
    ...theCommandLineStored(commandLine),
    foundBy: 'CLAUDE_PID',
    why: null,
  }
}

/**
 * THE STAMP TO WRITE WHEN A SESSION'S PROCESS IS RECORDED, or null because nothing would change.
 *
 * ONE RULE FOR THE TWO WRITERS. The hook writes the process on the record it filed; the office's own
 * door writes it for a waiter that cannot. Both put the same four fields inside the stamp that is
 * already there, and this is that rule, so the two cannot come to write it differently — the ninth
 * invariant, which the hook broke the day a second writer was proposed.
 *
 * It writes `pidFlags` too when the reading has them, and takes away the old ones when it has none.
 *
 * WHAT IT NEVER TOUCHES: `tool`, `externalId` and `logPath`. Those three name the conversation, one
 * record is one run, and a writer that could change them could move a record onto another run.
 *
 * A DIFFERENT PID IS REPLACED AND THE OLD NUMBER IS KEPT in `pidReplaced`, so a change of process is
 * on the record rather than only in a log. A reading that changes nothing answers null, and the
 * caller writes nothing at all rather than a patch that would say something happened.
 *
 * A stamp that is not there answers null too: there is nothing to write the process inside, and
 * half a stamp would say a conversation is on this machine when nobody has seen one. Both callers
 * check for the whole stamp before they ask.
 *
 * @param {Record<string, unknown> | null} existingStamp
 * @param {HookProcess} facts
 * @returns {Record<string, unknown> | null}
 */
export function theProcessPatchFor(existingStamp, facts) {
  if (existingStamp === null || !facts.recorded) return null
  /** @type {Record<string, unknown>} */
  const next = {
    ...existingStamp,
    pid: facts.pid,
    pidStartedAt: facts.pidStartedAt,
    pidCommand: facts.pidCommand,
  }
  // THE START FLAGS ARE THIS PROCESS'S OR NONE: a reading that has none leaves no other process's flags behind.
  if (facts.pidFlags === undefined || facts.pidFlags === null) delete next['pidFlags']
  else next['pidFlags'] = facts.pidFlags
  const oldPid = typeof existingStamp['pid'] === 'number' ? existingStamp['pid'] : null
  if (oldPid !== null && oldPid !== facts.pid) next['pidReplaced'] = oldPid
  if (
    existingStamp['pid'] === next['pid'] &&
    existingStamp['pidStartedAt'] === next['pidStartedAt'] &&
    existingStamp['pidCommand'] === next['pidCommand'] &&
    JSON.stringify(existingStamp['pidFlags']) === JSON.stringify(next['pidFlags']) &&
    existingStamp['pidReplaced'] === next['pidReplaced']
  ) {
    return null
  }
  return next
}
