// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLAUDE CODE ADAPTER.
 *
 * Claude Code writes one JSONL file per session, at
 *
 *     ~/.claude/projects/<slug>/<session-uuid>.jsonl
 *
 * one JSON object per line, appended as the session runs. This file turns that into the
 * ObservedSession shape in ./types.ts. It touches no database and no HTTP; everything it knows
 * about the machine arrives in an AdapterEnv, so a test can hand it a directory of hand-written
 * logs and a process list with nothing in it and get a deterministic answer.
 *
 * ---------------------------------------------------------------------------------------
 * THE FINDING THAT GOVERNS THIS WHOLE FILE: THERE IS NO END MARKER
 * ---------------------------------------------------------------------------------------
 *
 * Every line type across all 35 transcripts on this machine was counted while writing this:
 *
 *     assistant 15404 · user 8231 · queue-operation 3125 · last-prompt 2118 ·
 *     permission-mode 2112 · mode 1942 · system 1882 · ai-title 1814 · attachment 1697 ·
 *     file-history-snapshot 1034 · agent-name 533 · custom-title 320 · file-history-delta 87 ·
 *     frame-link 12
 *
 * NONE of them is an ending. The last line of a finished session is whatever it happened to be
 * writing when the process went away -- `permission-mode` in 14 of those files, `system` in 10,
 * `last-prompt` in 7. Claude Code does not write "goodbye", so a clean exit and a `kill -9` leave
 * a byte-identical file.
 *
 * Therefore THIS ADAPTER NEVER REPORTS `finished`, and `reportsCleanExit` is false. Where the
 * evidence runs out the answer is `orphaned` (gone quiet long ago, nobody watching) or `unknown`
 * (cannot tell yet) -- never the cheerful word. A wrong "finished" on a session that died at
 * 3 a.m. is exactly the silence Mole Office exists to remove, and inventing one here would put that
 * silence in the one place built to catch it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT *IS* OBSERVABLE, AND HOW
 * ---------------------------------------------------------------------------------------
 *
 * ALIVE. A running session's process carries its own id on its command line:
 *
 *     …/claude/versions/2.1.223 --session-id 99be5b9a-… --fork-session
 *                               --resume …/6af5cdcb-….jsonl --effort xhigh
 *
 * so a session id found there is alive, with a pid and a `/proc/<pid>/cwd` to prove it. Note the
 * trap in that real command line, handled in `claimsSession` below: it names TWO session ids and
 * only one of them is running. `--resume` names the transcript it FORKED FROM; that older session
 * is not alive, and reading `--resume` as "this session is running" would report a dead session
 * as running for as long as its child lived.
 *
 * The obvious alternative -- find which process holds the .jsonl open -- was tried first and does
 * not work: Claude Code appends and closes, so no live process holds any transcript open. Checked
 * across every claude process on this machine, all of them reported zero open .jsonl descriptors.
 *
 * A session started as a bare `claude` with no arguments carries no id anywhere, so it cannot be
 * matched to a process at all. That session is reported `unknown` while it is warm rather than
 * `running`, because "I cannot see a process for it" is not the same as "it is running".
 *
 * DIED BADLY. An entry carrying `isApiErrorMessage`, or a `system` line with subtype `api_error`,
 * is a real failure -- but only counts as a CRASH when it is the last thing that happened. An API
 * error in the middle of a session that carried on afterwards is a bad minute, not a bad ending.
 *
 * WORKING DIRECTORY. Taken from the `cwd` the log records on every user and assistant line, and
 * never from the directory name. The directory name is a slug with every `/` and `_` flattened to
 * `-`: `-srv-my-project` is `/srv/my_project` here, but the same slug is what
 * `/srv/my-project` would produce. It cannot be inverted, so it is not guessed from.
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { clockStamp, type ClockStamp } from '@shared/time.ts'
import { withSecretsMarked, type ARunsStep } from '@shared/terminals.ts'
import type {
  AdapterEnv,
  DiscoveryDepth,
  FilesTouched,
  ObservedSession,
  ObservedSessionState,
  ProcessInfo,
  ProcessScan,
  SessionAdapter,
  TailLine,
  TranscriptWrite,
  UnreadablePlace,
} from './types.ts'
import { describeReadFailure } from './types.ts'
import { HEAD_WINDOW_BYTES, isUnreadable, modifiedAt, readHead, readTail } from './logfile.ts'
import { theClaudeWayBack } from '../../../config/the-way-back.mjs'

export const CLAUDE_CODE_TOOL = 'claude-code'

/** Where Claude Code keeps its transcripts, under whatever home directory the env names. */
export function projectsDir(env: AdapterEnv): string {
  return join(env.homeDir, '.claude', 'projects')
}

// ---------------------------------------------------------------------------- small readers

/** Parse one log line. A malformed line is null, never an exception: logs are appended to live. */
function parseLine(raw: string): Record<string, unknown> | null {
  if (raw.trim() === '') return null
  try {
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

/** A non-empty string field, or null. Anything of another type is treated as absent, not coerced. */
function str(o: Record<string, unknown>, key: string): string | null {
  const v = o[key]
  return typeof v === 'string' && v !== '' ? v : null
}

function obj(o: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const v = o[key]
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null
  return v as Record<string, unknown>
}

function arr(o: Record<string, unknown>, key: string): unknown[] | null {
  const v = o[key]
  return Array.isArray(v) ? v : null
}

/**
 * An ISO timestamp from the log, as the local `YYYY-MM-DD HH:MM:SS` the rest of Mole Office uses.
 *
 * Local, not UTC, for the reason given in lib/records.ts: the change log and the dated views
 * filter on the operator's day, and a session that ran at 01:00 British Summer Time must not be
 * filed under tomorrow. An unparseable stamp is null rather than the epoch -- a wrong date that
 * looks like a date is worse than a missing one.
 */
export function toLocalStamp(iso: string | null): string | null {
  if (iso === null) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** Keep offset-bearing source evidence; older local-only log timestamps still have no instant. */
function logClock(iso: string | null): ClockStamp | null {
  if (iso === null) return null
  try {
    return clockStamp(() => iso)
  } catch (err) {
    if (err instanceof RangeError) return null
    throw err
  }
}

/** Collapse a prompt to one readable line: no newlines, no runaway length. */
function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

/**
 * The text of a message, whether the tool wrote it as a string or as content blocks.
 *
 * Tool results and thinking blocks are skipped: they are the machine talking to itself, and a
 * tail line reading "tool_result: 4096 bytes" tells a watcher nothing about what is happening.
 */
function messageText(message: Record<string, unknown>): string | null {
  const content = message['content']
  if (typeof content === 'string') return content === '' ? null : content
  if (!Array.isArray(content)) return null
  const parts: string[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue
    const b = block as Record<string, unknown>
    if (b['type'] === 'text') {
      const t = b['text']
      if (typeof t === 'string' && t !== '') parts.push(t)
    }
  }
  return parts.length === 0 ? null : parts.join(' ')
}

/** Every tool call on one assistant line. */
function toolUses(entry: Record<string, unknown>): { name: string; input: Record<string, unknown> }[] {
  const message = obj(entry, 'message')
  if (!message) return []
  const content = arr(message, 'content')
  if (!content) return []
  const out: { name: string; input: Record<string, unknown> }[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue
    const b = block as Record<string, unknown>
    if (b['type'] !== 'tool_use') continue
    const name = str(b, 'name')
    if (name === null) continue
    out.push({ name, input: obj(b, 'input') ?? {} })
  }
  return out
}

/** The tools whose argument is a file this session worked on, and the key that argument sits in. */
const FILE_ARG_TOOLS: Record<string, string> = {
  Read: 'file_path',
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  NotebookEdit: 'notebook_path',
}

/**
 * Was this line the log of something going wrong?
 *
 * Kept separate from "was it the LAST line", because the two together are what a crash is and
 * either one alone is not. See `deriveState`.
 */
function isFailureLine(entry: Record<string, unknown>): string | null {
  if (entry['isApiErrorMessage'] === true) {
    const message = obj(entry, 'message')
    const text = message ? messageText(message) : null
    const status = entry['apiErrorStatus']
    const suffix = typeof status === 'number' || typeof status === 'string' ? ` (status ${String(status)})` : ''
    return `the log ends on an API error${suffix}: ${oneLine(text ?? 'no detail given', 160)}`
  }
  if (entry['type'] === 'system') {
    const subtype = str(entry, 'subtype')
    if (subtype === 'api_error') {
      return `the log ends on a system api_error: ${oneLine(str(entry, 'content') ?? 'no detail given', 160)}`
    }
    if (str(entry, 'level') === 'error') {
      return `the log ends on a system error: ${oneLine(str(entry, 'content') ?? 'no detail given', 160)}`
    }
  }
  return null
}

/**
 * Lines that are bookkeeping rather than something that happened.
 *
 * Claude Code appends `mode`, `permission-mode` and `last-prompt` records as side effects, and
 * they carry no clock. Judging "did anything happen" or "what is it doing" by them would answer
 * with the settings rather than the work.
 */
const BOOKKEEPING_TYPES = new Set([
  'mode',
  'permission-mode',
  'last-prompt',
  'ai-title',
  'custom-title',
  'agent-name',
  'queue-operation',
  'file-history-snapshot',
  'file-history-delta',
  'frame-link',
])

/** How many characters of a command a step keeps, and of what was said. */
const A_COMMAND_KEEPS = 400
const WORDS_KEEP = 4_000

/**
 * THE STEPS ONE CONVERSATION LINE RECORDS: what was read, run, written and said, in the order the line holds them
 * (wave 13u, round 10, way C). Thinking, tool results, what the run was told, a sub-agent's lines and bookkeeping are
 * never steps. A tool that is none of the four is `used`, with its own name, rather than filed under one of them.
 *
 * NOTHING KEY-LIKE IS SHOWN (wave 13u, round 10b). A command, a path or a sentence can hold a key, so every step's text
 * and its tool's name go through the office's secret-shape check, and a marker stands where a key-like piece was.
 */
export function theStepsOfALine(raw: string): ARunsStep[] {
  return theUnscreenedStepsOfALine(raw).map((step) => ({ ...step, tool: withSecretsMarked(step.tool).text, what: withSecretsMarked(step.what).text }))
}

function theUnscreenedStepsOfALine(raw: string): ARunsStep[] {
  const entry = parseLine(raw)
  if (entry === null || entry['type'] !== 'assistant' || entry['isSidechain'] === true) return []
  const message = obj(entry, 'message')
  const content = message === null ? null : arr(message, 'content')
  if (content === null) return []
  const at = toLocalStamp(str(entry, 'timestamp'))
  const steps: ARunsStep[] = []
  for (const block of content) {
    if (typeof block !== 'object' || block === null || Array.isArray(block)) continue
    const b = block as Record<string, unknown>
    if (b['type'] === 'text') {
      const text = str(b, 'text')
      if (text !== null && text.trim() !== '') steps.push({ at, kind: 'said', tool: '', what: text.length <= WORDS_KEEP ? text : `${text.slice(0, WORDS_KEEP - 1)}…` })
      continue
    }
    if (b['type'] !== 'tool_use') continue
    const tool = str(b, 'name')
    if (tool === null) continue
    const input = obj(b, 'input') ?? {}
    const key = FILE_ARG_TOOLS[tool]
    const file = key === undefined ? null : str(input, key)
    if (tool === 'Read' && file !== null) steps.push({ at, kind: 'read', tool, what: file })
    else if (file !== null) steps.push({ at, kind: 'wrote', tool, what: file })
    else if (tool === 'Bash' && str(input, 'command') !== null) steps.push({ at, kind: 'ran', tool, what: oneLine(str(input, 'command') ?? '', A_COMMAND_KEEPS) })
    else {
      const method = str(input, 'method')
      const path = str(input, 'path')
      const asked = str(input, 'description') ?? str(input, 'pattern') ?? (method !== null && path !== null ? `${method} ${path}` : null)
      steps.push({ at, kind: 'used', tool, what: asked === null ? '' : oneLine(asked, A_COMMAND_KEEPS) })
    }
  }
  return steps
}

// ---------------------------------------------------------------------------- reading a log

interface HeadFacts {
  sessionId: string | null
  cwd: string | null
  entryPoint: string | null
  startedAtIso: string | null
  purpose: string | null
  name: string | null
  /** The title a person gave the session or the agent's name, and never a title a model wrote. */
  givenName: string | null
}

/** What the first window of a transcript says about how the session began. */
function readHeadFacts(logPath: string): HeadFacts | { unreadable: string; missing: boolean } {
  const head = readHead(logPath, HEAD_WINDOW_BYTES)
  if (isUnreadable(head)) return { unreadable: head.reason, missing: head.missing }

  const facts: HeadFacts = {
    sessionId: null,
    cwd: null,
    entryPoint: null,
    startedAtIso: null,
    purpose: null,
    name: null,
    givenName: null,
  }

  for (const raw of head.lines) {
    const entry = parseLine(raw)
    if (!entry) continue

    facts.sessionId ??= str(entry, 'sessionId') ?? str(entry, 'session_id')
    facts.cwd ??= str(entry, 'cwd')
    facts.entryPoint ??= str(entry, 'entrypoint')

    // A title the tool or the human gave the session beats anything derived from a prompt. The
    // human's own name for it wins over the model's, because it is the one they will look for.
    const custom = str(entry, 'customTitle')
    const agent = str(entry, 'agentName')
    const ai = str(entry, 'aiTitle')
    if (custom !== null) facts.name = custom
    else if (agent !== null && facts.name === null) facts.name = agent
    else if (ai !== null && facts.name === null) facts.name = ai
    if (custom !== null) facts.givenName = custom
    else if (agent !== null && facts.givenName === null) facts.givenName = agent

    if (BOOKKEEPING_TYPES.has(String(entry['type']))) continue
    facts.startedAtIso ??= str(entry, 'timestamp')

    // The opening request, which is what the session is FOR. Slash commands, command output and
    // the caveat banner are all wrapped in angle-bracket tags and are not what anybody asked for,
    // so they are skipped rather than filed as the purpose.
    if (facts.purpose === null && entry['type'] === 'user') {
      const message = obj(entry, 'message')
      const text = message ? messageText(message) : null
      if (text !== null && !text.trimStart().startsWith('<')) {
        facts.purpose = oneLine(text, 300)
      }
    }
  }

  return facts
}

interface TailFacts {
  lastActivityIso: string | null
  doing: string | null
  name: string | null
  /** The title a person gave the session or the agent's name, and never a title a model wrote. */
  givenName: string | null
  cwd: string | null
  files: FilesTouched
  /** Set when the last thing that happened was a failure. The sentence says what. */
  endedBadly: string | null
}

/** What the last window of a transcript says about what has happened lately. */
function readTailFacts(logPath: string): TailFacts | { unreadable: string; missing: boolean } {
  const tail = readTail(logPath)
  if (isUnreadable(tail)) return { unreadable: tail.reason, missing: tail.missing }

  const facts: TailFacts = {
    lastActivityIso: null,
    doing: null,
    name: null,
    givenName: null,
    cwd: null,
    files: { paths: [], complete: tail.complete, scannedBytes: tail.bytesRead },
    endedBadly: null,
  }

  // Most recent last, so a file touched twice keeps its later position.
  const files: string[] = []
  let lastRealEntry: Record<string, unknown> | null = null

  for (const raw of tail.lines) {
    const entry = parseLine(raw)
    if (!entry) continue

    const custom = str(entry, 'customTitle')
    const agent = str(entry, 'agentName')
    const ai = str(entry, 'aiTitle')
    if (custom !== null) facts.name = custom
    else if (agent !== null) facts.name = agent
    else if (ai !== null && facts.name === null) facts.name = ai
    if (custom !== null) facts.givenName = custom
    else if (agent !== null) facts.givenName = agent

    const cwd = str(entry, 'cwd')
    if (cwd !== null) facts.cwd = cwd

    for (const use of toolUses(entry)) {
      const key = FILE_ARG_TOOLS[use.name]
      if (key === undefined) continue
      const path = str(use.input, key)
      if (path === null) continue
      const already = files.indexOf(path)
      if (already !== -1) files.splice(already, 1)
      files.push(path)
    }

    if (BOOKKEEPING_TYPES.has(String(entry['type']))) continue

    const stamp = str(entry, 'timestamp')
    if (stamp !== null) facts.lastActivityIso = stamp
    lastRealEntry = entry

    // What it is doing: prefer what it SAID, fall back to what it was running. A watcher wants
    // the sentence, and only wants the tool call when there is no sentence yet.
    const message = obj(entry, 'message')
    const text = message ? messageText(message) : null
    if (text !== null && !text.trimStart().startsWith('<')) {
      facts.doing = oneLine(text, 200)
    } else {
      const uses = toolUses(entry)
      const last = uses[uses.length - 1]
      if (last !== undefined) {
        const arg =
          str(last.input, 'file_path') ??
          str(last.input, 'notebook_path') ??
          str(last.input, 'command') ??
          str(last.input, 'description') ??
          null
        facts.doing = arg === null ? last.name : `${last.name}: ${oneLine(arg, 160)}`
      }
    }
  }

  // A crash is a failure that nothing came after. An API error in the middle of a session that
  // carried on for another hour is a bad minute, not a bad ending, and reporting it as `crashed`
  // would put a red row on the alarm panel for a session that finished its work.
  if (lastRealEntry !== null) facts.endedBadly = isFailureLine(lastRealEntry)

  facts.files.paths = files.reverse()
  return facts
}

/**
 * How much of the end of a transcript a states-depth read opens.
 *
 * The state word is decided from the process table, the log's last clock and whether the last
 * event was a failure, so the last few kilobytes are all a tally needs. 16 KB holds the last
 * handful of lines of a normal transcript; the full tail is 512 KB and is read only at `full`
 * depth, for rows somebody will draw. What this window can miss, and what happens then, is said
 * where the read happens.
 */
const STATE_TAIL_BYTES = 16 * 1024

/** What the end of a transcript says about whether the session is alive — and nothing more. */
function readStateFacts(logPath: string): {
  lastActivityIso: string | null
  endedBadly: string | null
  cwd: string | null
  bytesRead: number
  complete: boolean
} | { unreadable: string; missing: boolean } {
  const tail = readTail(logPath, STATE_TAIL_BYTES)
  if (isUnreadable(tail)) return { unreadable: tail.reason, missing: tail.missing }

  const facts = { lastActivityIso: null as string | null, endedBadly: null as string | null, cwd: null as string | null, bytesRead: tail.bytesRead, complete: tail.complete }
  let lastRealEntry: Record<string, unknown> | null = null

  for (const raw of tail.lines) {
    const entry = parseLine(raw)
    if (!entry) continue

    const cwd = str(entry, 'cwd')
    if (cwd !== null) facts.cwd = cwd

    if (BOOKKEEPING_TYPES.has(String(entry['type']))) continue

    const stamp = str(entry, 'timestamp')
    if (stamp !== null) facts.lastActivityIso = stamp
    lastRealEntry = entry
  }

  // The same rule readTailFacts applies, and from the same last entry: a failure nothing came
  // after. Two things a short window can miss, each with its own fallback already in the state
  // machine: a transcript whose last line alone is bigger than the window hands back no whole
  // line at all, and the state then rests on the file's mtime (`modifiedAt`) exactly as it does
  // for a log that carries no clock; and a failure older than the window is not seen, so such a
  // session is counted `unknown` here where a full read would count it `crashed`. Rows the
  // caller will draw are read at full depth, so only the tally can be off, and the door's own
  // description says so.
  if (lastRealEntry !== null) facts.endedBadly = isFailureLine(lastRealEntry)
  return facts
}

/**
 * WHEN THIS TRANSCRIPT WAS LAST WRITTEN, from the same end-of-file facts the state ladder uses.
 *
 * THE TIMESTAMP OF THE LAST LINE THAT HAD ONE WINS OVER THE FILE'S MODIFICATION TIME, and that
 * order is not tidiness. Measured on this machine on 12 September 2026: a 93 MB transcript whose
 * last real line was from 2026-09-09 carried an mtime of 2026-09-12 08:28, because something had
 * rewritten the file without appending to it. Reading the mtime alone would have called a session
 * that had been gone for three days "answering now", which is exactly the defect M106 exists to
 * remove. The log's own clock is the session's own statement; the file's mtime is the fallback for
 * a log that carries no clock at all, and `from` says which one was used.
 */
export function transcriptLastWrittenAt(logPath: string): TranscriptWrite {
  const state = readStateFacts(logPath)
  if ('unreadable' in state) return { read: false, missing: state.missing, reason: state.unreadable }
  if (state.lastActivityIso !== null) {
    const ms = Date.parse(state.lastActivityIso)
    if (!Number.isNaN(ms)) return { read: true, at: new Date(ms), from: 'its last line' }
  }
  const mtime = modifiedAt(logPath)
  if (mtime !== null) return { read: true, at: new Date(mtime), from: "the file's modification time" }
  return {
    read: false,
    missing: false,
    reason: `the transcript at ${logPath} carries no readable timestamp and its file could not be dated`,
  }
}

// ---------------------------------------------------------------------------- live processes

/**
 * Does this command line claim to BE the given session?
 *
 * `--session-id X` claims X. `--resume Y` claims Y only when the command carries neither
 * `--session-id` nor `--fork-session`, and that exception is the whole subtlety here. A real
 * command line observed on this machine reads
 *
 *     --session-id 99be5b9a-… --fork-session --resume …/6af5cdcb-….jsonl
 *
 * which means "start session 99be5b9a by forking the transcript of 6af5cdcb". Session 6af5cdcb
 * is NOT running. Treating every `--resume` as a claim would have reported it, and every other
 * forked-from session, as alive for as long as its child lived -- a dead session showing green.
 */
function claimsSession(command: string, externalId: string): boolean {
  const tokens = command.split(/\s+/)
  const valueAfter = (flag: string): string | null => {
    const i = tokens.indexOf(flag)
    if (i === -1) return null
    return tokens[i + 1] ?? null
  }

  const declared = valueAfter('--session-id')
  if (declared !== null) return declared === externalId

  if (tokens.includes('--fork-session')) return false

  const resumed = valueAfter('--resume')
  if (resumed === null) return false
  // `--resume` takes either a bare id or the path of the transcript.
  return resumed === externalId || resumed.endsWith(`${externalId}.jsonl`)
}

/** The live process running this session, or null. */
function findProcess(externalId: string, scan: ProcessScan): ProcessInfo | null {
  if (!scan.ok) return null
  // A command line that never names the session id cannot claim it: the rule below either matches
  // a token EQUAL to the id or one ENDING in `<id>.jsonl`, and both contain the id as a plain
  // substring. The substring test is a scan in C; the token parse is a regex split in JavaScript,
  // and one per process per session was measured at 60 ms across a sweep of 159 sessions on the owner's
  // machine — most of a states-depth walk. The rule itself stays in `claimsSession`, untouched:
  // this is only the question of which command lines are worth asking.
  const maybe = scan.processes.filter((p) => p.command.includes(externalId))
  const matches = maybe.filter((p) => claimsSession(p.command, externalId))
  if (matches.length === 0) return null
  // One session can have several processes: a pty host wrapping the agent itself. Any of them
  // proves it is alive, but the agent is the one whose cwd and pid are worth reporting.
  return matches.find((p) => !p.command.includes('bg-pty-host')) ?? matches[0] ?? null
}

// ---------------------------------------------------------------------------- state

/** How long ago, in words, for the reason sentence. */
function ago(seconds: number): string {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))}s ago`
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 172800) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}

interface StateInput {
  externalId: string
  logPath: string
  lastActivityIso: string | null
  /** The file's own mtime, used when the log carries no clock of its own. */
  modifiedMs: number | null
  endedBadly: string | null
  scan: ProcessScan
  process: ProcessInfo | null
  env: AdapterEnv
}

/**
 * THE STATE LADDER. Every branch says what it saw, and no branch guesses.
 *
 * Read in order; the first that applies wins:
 *
 *   1. A live process claims this session   -> running (recently noisy) or idle (quiet).
 *   2. The process list could not be read   -> unknown. "I could not look" is never "it is dead".
 *   3. The log's last event was a failure   -> crashed.
 *   4. Nothing is known about when it last  -> unknown.
 *      did anything
 *   5. It was active moments ago            -> unknown. It is probably alive under a process
 *                                              carrying no session id (a bare `claude`), and
 *                                              calling that orphaned would be wrong twice a day.
 *   6. It has been quiet for a long time    -> orphaned. Nobody is watching it and it never said
 *                                              it was done.
 *   7. In between                           -> unknown.
 *
 * `finished` appears nowhere. Claude Code writes no ending, so nothing here can ever earn it.
 */
function deriveState(input: StateInput): { state: ObservedSessionState; reason: string } {
  const { env, process: proc, scan } = input
  const nowMs = env.now.getTime()

  const lastMs =
    input.lastActivityIso !== null && !Number.isNaN(Date.parse(input.lastActivityIso))
      ? Date.parse(input.lastActivityIso)
      : input.modifiedMs
  const quietFor = lastMs === null ? null : Math.max(0, (nowMs - lastMs) / 1000)
  const quietly = quietFor === null ? 'at an unknown time' : ago(quietFor)

  if (proc !== null) {
    if (quietFor !== null && quietFor <= env.runningWithinSeconds) {
      return {
        state: 'running',
        reason: `process ${proc.pid} names this session on its command line, and the log grew ${quietly}.`,
      }
    }
    return {
      state: 'idle',
      reason:
        `process ${proc.pid} names this session on its command line, so it is alive, but the log last ` +
        `grew ${quietly} — it is most likely waiting on you.`,
    }
  }

  if (!scan.ok) {
    return {
      state: 'unknown',
      reason:
        `the processes on this machine could not be listed (${scan.reason}), so there is no way to tell ` +
        `whether this session is alive. The log last grew ${quietly}.`,
    }
  }

  if (input.endedBadly !== null) {
    return {
      state: 'crashed',
      reason: `no live process names this session, and ${input.endedBadly}`,
    }
  }

  if (quietFor === null) {
    return {
      state: 'unknown',
      reason:
        'the log carries no timestamp and the file could not be dated, so there is nothing to say how ' +
        'long ago this session last did anything.',
    }
  }

  if (quietFor <= env.runningWithinSeconds) {
    return {
      state: 'unknown',
      reason:
        `the log grew ${quietly}, so something is probably still working, but no process names this ` +
        `session — a session started as a bare \`claude\` carries its id nowhere a watcher can read, ` +
        `so being alive cannot be confirmed.`,
    }
  }

  if (quietFor >= env.orphanAfterSeconds) {
    return {
      state: 'orphaned',
      reason:
        `no process names this session and its log last grew ${quietly}. Claude Code writes no ` +
        `end-of-session marker, so there is no evidence it finished.`,
    }
  }

  return {
    state: 'unknown',
    reason:
      `no process names this session and its log last grew ${quietly}. That is too long to call it ` +
      `running and too recent to call it abandoned, and Claude Code writes no end-of-session marker ` +
      `to settle it either way.`,
  }
}

// ---------------------------------------------------------------------------- assembling one

function buildSession(externalId: string, logPath: string, env: AdapterEnv, depth: DiscoveryDepth = 'full'): ObservedSession {
  const scan = env.scanProcesses()
  const proc = findProcess(externalId, scan)

  // STATES DEPTH: the state word and when it last did anything, and no more. No head read, no
  // prose, no file list — a row discovered here is for counting, and one a caller will draw is
  // read again at `full` depth through `observe`.
  if (depth === 'states') {
    const state = readStateFacts(logPath)
    // An unreadable log is still a session Mole Office knows about, and the same rule as the full
    // depth applies: it stays listed, with everything that can still be said about it.
    if ('unreadable' in state) {
      const stateWord: ObservedSessionState = proc !== null ? 'running' : state.missing ? 'orphaned' : 'unknown'
      const reason =
        proc !== null
          ? `process ${proc.pid} names this session, so it is alive, but its log cannot be read: ${state.unreadable}.`
          : state.missing
            ? `the transcript this session was recorded with is no longer on disk (${state.unreadable}), so ` +
              `nothing can be read back from it and there is no evidence of how it ended.`
            : `the transcript could not be read (${state.unreadable}), so nothing can be said about this session.`
      return {
        id: `${CLAUDE_CODE_TOOL}:${externalId}`,
        tool: CLAUDE_CODE_TOOL,
        externalId,
        name: `claude-code ${externalId.slice(0, 8)}`,
        purpose: null,
        doing: null,
        cwd: proc?.cwd ?? null,
        state: stateWord,
        stateReason: reason,
        logPath,
        resumeCommand: resumeCommandFor(externalId, proc?.cwd ?? null),
        startedAt: null,
        lastActivityAt: null,
        filesTouched: { paths: [], complete: false, scannedBytes: 0 },
        pid: proc?.pid ?? null,
        entryPoint: null,
      }
    }

    const derived = deriveState({
      externalId,
      logPath,
      lastActivityIso: state.lastActivityIso,
      modifiedMs: modifiedAt(logPath),
      endedBadly: state.endedBadly,
      scan,
      process: proc,
      env,
    })
    return {
      id: `${CLAUDE_CODE_TOOL}:${externalId}`,
      tool: CLAUDE_CODE_TOOL,
      externalId,
      name: `claude-code ${externalId.slice(0, 8)}`,
      purpose: null,
      doing: null,
      cwd: state.cwd ?? proc?.cwd ?? null,
      state: derived.state,
      stateReason: derived.reason,
      logPath,
      resumeCommand: resumeCommandFor(externalId, state.cwd ?? proc?.cwd ?? null),
      startedAt: null,
      lastActivityAt: toLocalStamp(state.lastActivityIso),
      lastActivityTime: logClock(state.lastActivityIso),
      filesTouched: { paths: [], complete: state.complete, scannedBytes: state.bytesRead },
      pid: proc?.pid ?? null,
      entryPoint: null,
    }
  }

  const head = readHeadFacts(logPath)
  const tail = readTailFacts(logPath)

  // An unreadable log is still a session Mole Office knows about, and dropping it from the list would
  // be the silence this project exists to remove. It comes back with everything that can still be
  // said -- its id, its path, a live process if there is one -- and a state that says why the rest
  // is missing.
  if ('unreadable' in head || 'unreadable' in tail) {
    const problem = 'unreadable' in head ? head : (tail as { unreadable: string; missing: boolean })
    const state: ObservedSessionState = proc !== null ? 'running' : problem.missing ? 'orphaned' : 'unknown'
    const reason =
      proc !== null
        ? `process ${proc.pid} names this session, so it is alive, but its log cannot be read: ${problem.unreadable}.`
        : problem.missing
          ? `the transcript this session was recorded with is no longer on disk (${problem.unreadable}), so ` +
            `nothing can be read back from it and there is no evidence of how it ended.`
          : `the transcript could not be read (${problem.unreadable}), so nothing can be said about this session.`

    return {
      id: `${CLAUDE_CODE_TOOL}:${externalId}`,
      tool: CLAUDE_CODE_TOOL,
      externalId,
      name: `claude-code ${externalId.slice(0, 8)}`,
      purpose: null,
      doing: null,
      cwd: proc?.cwd ?? null,
      state,
      stateReason: reason,
      logPath,
      resumeCommand: resumeCommandFor(externalId, proc?.cwd ?? null),
      startedAt: null,
      lastActivityAt: null,
      filesTouched: { paths: [], complete: false, scannedBytes: 0 },
      pid: proc?.pid ?? null,
      entryPoint: null,
    }
  }

  const cwd = head.cwd ?? tail.cwd ?? proc?.cwd ?? null
  const { state, reason } = deriveState({
    externalId,
    logPath,
    lastActivityIso: tail.lastActivityIso,
    modifiedMs: modifiedAt(logPath),
    endedBadly: tail.endedBadly,
    scan,
    process: proc,
    env,
  })

  const name =
    tail.name ??
    head.name ??
    (head.purpose === null ? `claude-code ${externalId.slice(0, 8)}` : oneLine(head.purpose, 60))

  return {
    id: `${CLAUDE_CODE_TOOL}:${externalId}`,
    tool: CLAUDE_CODE_TOOL,
    externalId,
    name,
    givenName: tail.givenName ?? head.givenName,
    purpose: head.purpose,
    doing: tail.doing,
    cwd,
    state,
    stateReason: reason,
    logPath,
    resumeCommand: resumeCommandFor(externalId, cwd),
    startedAt: toLocalStamp(head.startedAtIso),
    lastActivityAt: toLocalStamp(tail.lastActivityIso) ?? toLocalStamp(head.startedAtIso),
    lastActivityTime: logClock(toLocalStamp(tail.lastActivityIso) === null ? head.startedAtIso : tail.lastActivityIso),
    filesTouched: tail.files,
    pid: proc?.pid ?? null,
    entryPoint: head.entryPoint,
  }
}

/**
 * The command that puts you back in this session.
 *
 * `claude --resume` has to be run from the directory the session belongs to, so the `cd` is part
 * of the answer rather than something a reader has to remember. When the directory is unknown the
 * `cd` is left off rather than filled in with a plausible one -- a resume command that silently
 * starts in the wrong directory is worse than one that makes you type the path yourself.
 */
export function resumeCommandFor(externalId: string, cwd: string | null): string {
  // The command's shape is src/config/the-way-back.mjs's, which the agent's page and the sandbox tool read too.
  return cwd === null ? `claude --resume ${externalId}` : theClaudeWayBack({ folder: cwd, sessionId: externalId })
}

// ---------------------------------------------------------------------------- the adapter

/**
 * Every `<uuid>.jsonl` under every project directory, and every directory that would not open.
 *
 * A MISSING directory is not an error and is not reported: no ~/.claude/projects at all means
 * Claude Code has never run here, which is a legitimate empty answer and `looksIn` says where it
 * was looked for. ANY OTHER failure is reported, one entry per place, and the sweep carries on
 * with the directories it can read.
 *
 * This used to catch everything and return `[]`, which meant a permission bit, a bad mount and a
 * home directory that had never seen Claude Code all arrived at the sessions page as the same
 * cheerful "no sessions". That is the success-shaped silence the orphan sweep upstairs is built to
 * refuse, sitting in the layer that feeds it: a machine full of running agents would have read as
 * an empty one, and nothing on the page would have looked wrong.
 */
function findLogs(env: AdapterEnv): {
  logs: { externalId: string; logPath: string }[]
  unreadable: UnreadablePlace[]
} {
  const root = projectsDir(env)
  const unreadable: UnreadablePlace[] = []

  let projects: string[]
  try {
    projects = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  } catch (err) {
    const failure = describeReadFailure(err, root)
    if (failure !== null) unreadable.push(failure)
    return { logs: [], unreadable }
  }

  const logs: { externalId: string; logPath: string }[] = []
  for (const project of projects) {
    const dir = join(root, project)
    let entries: string[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
        .map((e) => e.name)
    } catch (err) {
      // ENOENT here means the directory went away between the two reads, which is a sweep racing a
      // tidy-up rather than something a reader has to act on. Everything else is reported and the
      // remaining projects are still walked.
      const failure = describeReadFailure(err, dir)
      if (failure !== null) unreadable.push(failure)
      continue
    }
    for (const file of entries) {
      logs.push({ externalId: file.slice(0, -'.jsonl'.length), logPath: join(dir, file) })
    }
  }
  return { logs, unreadable }
}

export const claudeCodeAdapter: SessionAdapter = {
  tool: CLAUDE_CODE_TOOL,

  looksIn(env) {
    return `${projectsDir(env)}/<project>/<session-id>.jsonl`
  },

  // See the header of this file: every line type in every transcript on this machine was counted
  // and none of them is an ending. This flag is what stops `finished` being reported here.
  reportsCleanExit: false,

  discover(env, depth: DiscoveryDepth = 'full') {
    const { logs, unreadable } = findLogs(env)
    return {
      sessions: logs.map(({ externalId, logPath }) => buildSession(externalId, logPath, env, depth)),
      unreadable,
    }
  },

  discoverThese(externalIds, env) {
    const { logs, unreadable } = findLogs(env)
    const asked = new Set(externalIds)
    return {
      sessions: logs.filter(({ externalId }) => asked.has(externalId)).map(({ externalId, logPath }) => buildSession(externalId, logPath, env, 'full')),
      unreadable,
    }
  },

  observe({ externalId, logPath }, env) {
    return buildSession(externalId, logPath, env)
  },

  transcriptLastWrittenAt({ logPath }) {
    return transcriptLastWrittenAt(logPath)
  },

  renderLine(raw, fromEnd) {
    const MAX_RAW = 4000
    const line: TailLine = {
      fromEnd,
      at: null,
      kind: 'unparseable',
      text: '',
      raw: raw.length > MAX_RAW ? `${raw.slice(0, MAX_RAW)}…` : raw,
      rawTruncated: raw.length > MAX_RAW,
      rawLength: raw.length,
    }

    const entry = parseLine(raw)
    if (!entry) {
      // A half-written last line is normal in a log that is being appended to right now. It is
      // shown as what it is rather than dropped, because a watcher wondering why the newest line
      // is missing is worse served than one who can see it arriving.
      line.text = 'this line is not valid JSON — most likely it is still being written'
      return line
    }

    line.kind = str(entry, 'type') ?? 'unknown'
    line.at = toLocalStamp(str(entry, 'timestamp'))

    const message = obj(entry, 'message')
    const text = message ? messageText(message) : null
    if (text !== null) {
      line.text = oneLine(text, 400)
      return line
    }

    const uses = message ? toolUses(entry) : []
    if (uses.length > 0) {
      line.text = uses
        .map((u) => {
          const arg =
            str(u.input, 'file_path') ??
            str(u.input, 'notebook_path') ??
            str(u.input, 'command') ??
            str(u.input, 'description')
          return arg === null ? u.name : `${u.name}: ${oneLine(arg, 200)}`
        })
        .join(' · ')
      return line
    }

    const summary =
      str(entry, 'content') ??
      str(entry, 'lastPrompt') ??
      str(entry, 'aiTitle') ??
      str(entry, 'customTitle') ??
      str(entry, 'agentName') ??
      str(entry, 'subtype') ??
      str(entry, 'mode') ??
      str(entry, 'permissionMode')
    line.text = summary === null ? `(${line.kind}, nothing to show)` : oneLine(summary, 400)
    return line
  },
}
