// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOLE OFFICE'S OWN SESSION VOCABULARY, AND THE CONTRACT ONE ADAPTER FILLS IN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A SESSION IS HERE, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * A session is ONE AGENT WORKING SESSION. Mole Office knows about it without storing a word of the
 * conversation: the agent tool already writes that to disk, and copying it in would mean two
 * copies that drift, a database that grows by megabytes an hour, and a transcript nobody reads.
 * So Mole Office stores the WAY BACK IN -- the log path and the resume command -- and reads the tail
 * of that file when someone wants to watch.
 *
 * This shape is written in Mole Office's terms, not Claude Code's. `externalId` is whatever the tool
 * calls its session; `logPath` is wherever that tool puts its transcript. An adapter's whole job
 * is to answer these questions for one tool. Adding a second tool means adding one file next to
 * this one -- nothing here, in sessions.ts or in api/sessions.ts has to learn about it beyond one
 * entry in the ADAPTERS list.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SHAPE LIVES IN THE ADAPTER DIRECTORY AND NOT IN sessions.ts
 * ---------------------------------------------------------------------------------------
 *
 * sessions.ts is the registry: it drives the adapters and talks to the database. If the shared
 * shape lived there, every adapter would have to import the registry it plugs into, and the
 * registry imports every adapter -- a cycle, and a rule ("an adapter may not touch the database")
 * that nothing enforces. With the contract in its own file the dependency only runs one way:
 * adapters import this, sessions.ts imports adapters, and an adapter physically cannot reach the
 * database because it never imports anything that can.
 *
 * ---------------------------------------------------------------------------------------
 * THE SIX STATES, AND WHY THERE ARE SIX RATHER THAN FOUR
 * ---------------------------------------------------------------------------------------
 *
 * `SESSION_STATES` in shared/types.ts started with four — running, idle, finished, crashed —
 * and now holds SIX, the same six as the list below. This paragraph used to say it held four,
 * for long enough that the sentence had become the opposite of the truth, and everything under
 * it about what "cannot be stored" read as a design rule rather than as a stale claim. The two
 * lists are pinned equal by tests/sessions.test.ts; what differs is the ORDER, and only the
 * order. Here they are ranked by who needs a human first, because that is what the sessions
 * page sorts on; there they are declared in the order a person would read them.
 *
 * The extra two are what observation from outside a process can land on, and both of them are
 * answers rather than gaps:
 *
 *   orphaned — the session is not running, it never said it had finished, and nothing has
 *              happened for a long time. Nobody is watching it. This is NOT "crashed": we did
 *              not see it die. It is not "finished" either, and calling it that is precisely the
 *              lie this module exists to refuse.
 *   unknown  — the evidence does not reach a conclusion. The process list could not be read, or
 *              the log is unreadable, or the session was last active moments ago under a process
 *              that carries no session id we can match.
 *
 * `unknown` is a first-class answer and never a placeholder. A wrong "finished" on a crashed
 * session is exactly the silence Mole Office exists to remove, so where the evidence stops, so does
 * the claim. Every state comes with `stateReason`: the sentence saying what was observed to
 * reach it, so a reader can disagree with the reasoning rather than just with the word.
 */

import { SESSION_STATES, type SessionState } from '@shared/types.ts'

// ---------------------------------------------------------------------------- states

/**
 * Every state an OBSERVER can honestly report.
 *
 * The same seven words a record may store — see `storableState` below, and the header note on why
 * this is no longer a strict superset — in a different ORDER. The order is the one the alarm
 * panel cares about: the ones that want a human first. That is the reason this is a second array
 * rather than a re-export: sorting by severity is what it is for, and severity is not the order
 * the vocabulary is declared in.
 */
export const OBSERVED_SESSION_STATES = [
  'crashed',
  'orphaned',
  // A paused run waits for a press to resume it (criterion W7), so it wants a human, after the two alarms.
  'paused',
  'running',
  'idle',
  'unknown',
  'finished',
] as const

export type ObservedSessionState = (typeof OBSERVED_SESSION_STATES)[number]

/**
 * A compile-time proof that every state a record can STORE is a state an observer can REPORT.
 *
 * The two lists live in different files for a real reason -- shared/types.ts is served to the
 * browser and pinned by tests/validate.test.ts, and it may not grow states that only a server
 * that can read /proc could ever produce. But they must not contradict each other: a storable
 * state that no observer can express would be a value the registry could read back and not
 * understand. If SESSION_STATES grows a word this list does not have, `tsc --noEmit` fails here
 * rather than a session quietly falling through to `unknown` months later.
 *
 * The reverse containment is not asserted HERE, in the compiler, because the direction that would
 * be unsound is only this one. It is asserted in tests/sessions.test.ts, which pins the two lists
 * as equal sets — so today there is no observer-only state, `storableState` below returns null for
 * nothing, and anyone adding one has to change that test on purpose and read what depends on it.
 */
type Covers<Narrow extends string, Wide extends string> = [Narrow] extends [Wide] ? true : never
const everyStorableStateIsObservable: Covers<SessionState, ObservedSessionState> = true
void everyStorableStateIsObservable // referenced so the assertion cannot be dropped as unused

/**
 * The state as a `session` record may store it in `data.state`, or null when it may not.
 *
 * AS OF TODAY IT NEVER RETURNS NULL, and that is a change in the vocabulary rather than in this
 * function: `src/shared/kinds.ts` accepts all six words, including `orphaned` and `unknown`, so
 * an observation that nobody is watching a session is now written onto the record instead of
 * being dropped for want of somewhere to put it. That is the better outcome — the sessions page
 * and the resource ledger both read `data.state`, and a session left with no state at all reads
 * as "not filled in yet" rather than as "nobody can tell".
 *
 * It is kept as a function anyway, and callers still handle the null, because it is the ONE seam
 * where the two vocabularies meet. An observer-only state added later must not be written into a
 * record — `validateData` would refuse the write, or worse, accept it and put a word on the page
 * that no reader understands. What happens to a null is decided in sessions.ts: the key is left
 * out, the record is reported incomplete, and src/web/lib/attention.ts draws a session with no
 * readable state as a problem rather than hiding it.
 */
export function storableState(state: ObservedSessionState): SessionState | null {
  return (SESSION_STATES as readonly string[]).includes(state) ? (state as SessionState) : null
}

// ---------------------------------------------------------------------------- what was touched

/**
 * The files a session worked on, and how much of the log that answer is based on.
 *
 * `complete` is here because the honest answer usually costs too much: the largest transcript on
 * this machine is 13 MB, and walking all of it on every request to a list page is not something
 * a page can do. So a bounded read reports what it found AND says it was bounded. A list of
 * files that silently omitted the first hour of a session would be worse than no list, because
 * nothing about it looks partial.
 */
export interface FilesTouched {
  /** Absolute paths, in the order they were last touched, most recent first. */
  paths: string[]
  /** True when the whole log was read. False when only the tail was. */
  complete: boolean
  /** How many bytes from the end of the log this answer was drawn from. */
  scannedBytes: number
}

// ---------------------------------------------------------------------------- the session

/**
 * One agent working session, as observed from outside it.
 *
 * Everything here is DERIVED on every read. None of it is trusted from the database, for the same
 * reason completeness is recomputed on every read in shared/kinds.ts: a stored `running` is
 * wrong the moment the process exits, and wrong silently.
 */
export interface ObservedSession {
  /**
   * Mole Office's id for this session: `<tool>:<externalId>`, e.g. `claude-code:36ffbf70-…`.
   *
   * Prefixed with the tool because two tools may both number their sessions from 1, and an id
   * that collides across tools would show one session's log under another's name.
   */
  id: string
  /** Which tool this is a session of. Matches the adapter's `tool`. */
  tool: string
  /** What the tool itself calls this session. Opaque to Mole Office. */
  externalId: string
  /** A short human-readable name. What the tool titled it, or its opening request. */
  name: string
  /**
   * THE NAME A PERSON OR THE TOOL GAVE THE SESSION ITSELF, and nothing drawn from what the session was
   * asked or said: in Claude Code, the title a person gave it or the agent's name. Absent or null when
   * the session was given none.
   *
   * A run found on disk is filed under this, or under its tool and id when there is none, and never
   * under `name`. `name` falls back on the opening request, and a title a model wrote from it, and the
   * opening request of a run the office started is the message it was handed. A record's title shows
   * wherever records show, to readers the rule on messages keeps from that message, by a
   * decision.
   */
  givenName?: string | null
  /**
   * Why the session exists, in the words it was asked in. Null when the log carries no prompt.
   *
   * Discovery never stores it. It is read from the transcript on each request, and shown only to the
   * readers who may read the transcript, because the opening request of a run the office started is the
   * message it was handed. The record's summary is a person's to write.
   */
  purpose: string | null
  /**
   * The directory the session was working in, read from the log itself.
   *
   * Null rather than guessed. Claude Code names its log directory after the working directory
   * with every `/` and `_` replaced by `-`, which cannot be inverted: `-srv-my-project`
   * is `/srv/my_project` on one machine and `/srv/my-project` on another, and
   * there is no way to tell from the name. So the directory is taken from the `cwd` the log
   * records, and when the log has no `cwd` the answer is null.
   */
  cwd: string | null
  /**
   * What it is doing, or was doing when it stopped, in one line. Null when the log says nothing.
   *
   * The live half of the pair with `purpose`: purpose is why the session was started and stays
   * as the human left it, this is what it is up to right now and is refreshed on every sweep.
   * "Crashed" on its own tells you nothing about whether to restart it; "crashed while collating
   * the force tables" does.
   */
  doing: string | null
  /** What can be honestly said about whether it is alive. See OBSERVED_SESSION_STATES. */
  state: ObservedSessionState
  /** What was observed to reach that state, in one sentence a person can argue with. */
  stateReason: string
  /** The transcript on disk. Mole Office reads the tail of this; it never copies it in. */
  logPath: string
  /** The command that puts you back in this session. Null when the tool offers no way back. */
  resumeCommand: string | null
  /** When it started, in local time (`YYYY-MM-DD HH:MM:SS`). Null when the log has no clock. */
  startedAt: string | null
  /** When the log last carried a timestamp, in local time. Null when it carries none. */
  lastActivityAt: string | null
  /** Original instant evidence when the transcript supplied an offset. Never inferred from wall time. */
  lastActivityTime?: import('../../../shared/time.ts').ClockStamp | null
  /** The files it worked on, and whether that list is the whole story. */
  filesTouched: FilesTouched
  /** The live process this session was matched to, when there is one. Null otherwise. */
  pid: number | null
  /** How the session was started, when the tool records it, e.g. "cli". */
  entryPoint: string | null
}

// ---------------------------------------------------------------------------- the environment

/** One process, as much of it as is needed to decide whether it owns a session. */
export interface ProcessInfo {
  pid: number
  /** The full command line, arguments separated by single spaces. */
  command: string
  /** Its working directory, when that can be read. Null otherwise. */
  cwd: string | null
}

/**
 * The result of trying to list the processes on this machine.
 *
 * A failure is reported, never swallowed. "I could not look" and "I looked and it is not there"
 * are opposite conclusions about a session: the first must produce `unknown` and the second may
 * produce `orphaned`. Returning an empty list on failure would collapse them and would mark
 * every running session on the machine as orphaned.
 */
export type ProcessScan =
  | { ok: true; processes: ProcessInfo[] }
  | { ok: false; reason: string }

/**
 * Everything an adapter is allowed to know about the world outside it.
 *
 * Passed in rather than reached for so that a test can describe a machine exactly: a home
 * directory holding hand-written logs, a fixed clock, and a process list with nothing in it. An
 * adapter that called `os.homedir()` or `Date.now()` itself could only be tested on the machine
 * it happened to run on, which for a module whose whole job is "is this thing still alive" would
 * mean testing nothing.
 */
export interface AdapterEnv {
  /** Where the tools keep their per-user state. Real home in production, a temp dir under test. */
  homeDir: string
  /** The moment every "how long ago" is measured against. */
  now: Date
  /**
   * The processes on this machine, or the reason they could not be listed.
   *
   * Expected to be memoised by whoever builds the env: one sweep asks about many sessions, and
   * re-reading /proc for each of them would be both slow and inconsistent, since the answer
   * would change halfway down the list.
   */
  scanProcesses(): ProcessScan
  /** Quiet for longer than this and a live session is `idle` rather than `running`. Seconds. */
  runningWithinSeconds: number
  /** Quiet for longer than this, with no process, and a session is `orphaned`. Seconds. */
  orphanAfterSeconds: number
}

// ---------------------------------------------------------------------------- what could not be read

/**
 * A place an adapter tried to look inside and could not, and why.
 *
 * The path is a field of its own rather than only a phrase inside the sentence, so a caller can
 * count the places, list them, or put one on a page next to a "fix this" button without having to
 * pick a path back out of English.
 */
export interface UnreadablePlace {
  /** The directory or file that would not open. Absolute, so a reader can go and look at it. */
  path: string
  /**
   * What the operating system said, in its own words -- "EACCES: permission denied, scandir …".
   *
   * Deliberately NOT re-worded into something friendlier. The code at the front (EACCES, EIO,
   * ESTALE) is the part a person searches for and the part that tells a permission bit apart from
   * a dead NFS mount, and a nicer sentence that dropped it would cost them the only detail that
   * identifies the problem.
   */
  reason: string
}

/**
 * A filesystem error as something to report, or null when there is genuinely nothing there.
 *
 * ENOENT is the ONE code that is not a failure, and this is where that judgement is made once
 * instead of at each call site. A directory that does not exist is a tool that has never run on
 * this machine: a real answer, quietly correct, and nothing a reader needs to be warned about.
 * EVERY OTHER CODE means the question was not answered -- the sweep looked and was refused -- and
 * an unanswered question that comes back as an empty list is the success-shaped silence this
 * project exists to remove.
 *
 * logfile.ts draws the same line for FILES, in `describeFsError`. It is a private function of that
 * module, and it answers a different question there (which of several failures happened to one
 * transcript, and does the caller need to know the file is simply gone) -- so what is shared here
 * is the RULE, stated once, not a second copy of its sentences.
 */
export function describeReadFailure(err: unknown, path: string): UnreadablePlace | null {
  if ((err as { code?: unknown }).code === 'ENOENT') return null
  return { path, reason: err instanceof Error ? err.message : String(err) }
}

/**
 * What one sweep found, AND what it could not look inside. Both halves, always.
 *
 * This is the same refusal `ProcessScan` above makes, at the other end of the same sweep: "I could
 * not look" and "I looked and there is nothing" are opposite answers, and an adapter that returned
 * an empty list for both would report an unreadable home directory as "this tool has never run
 * here". The orphan sweep was built to never make that mistake; this is the layer that feeds it.
 *
 * The shape differs from ProcessScan's `ok`/`reason` union in one way, and only because the
 * question does. There is ONE process table, so reading it either worked or it did not. A
 * discovery sweep walks many directories and routinely reads some and not others, so an
 * all-or-nothing answer would have to either throw away the sessions it did find or hide the
 * directories it could not open. It reports both instead: a partial answer that says what is
 * missing from it.
 */
export interface DiscoveryResult {
  /** Every session that could be read, freshly observed. */
  sessions: ObservedSession[]
  /**
   * Places the sweep could not open. Empty means the search was complete, not that it went well.
   *
   * Non-empty means `sessions` is a FLOOR: there may be sessions in these places that nobody can
   * see from here.
   */
  unreadable: UnreadablePlace[]
}

/**
 * How much of each transcript a discovery sweep reads.
 *
 * `full` reads what a drawn row shows: who started it, what it is doing, which files it touched.
 * `states` reads only the end of each log and the process table — the evidence a state word is
 * decided from — so a caller that will draw none of the rows does not pay for their prose. A
 * `states` row carries no name and no purpose; a caller that will draw one reads it again at
 * `full` through `observe`.
 */
export type DiscoveryDepth = 'full' | 'states'

// ---------------------------------------------------------------------------- the tail

/** One line of a session's log, as it is shown to somebody watching. */
export interface TailLine {
  /** Line number counted from the end: 1 is the last line in the file. */
  fromEnd: number
  /** When it happened, local time, when the line carries a clock. Null otherwise. */
  at: string | null
  /** What sort of line it is in the tool's own words, e.g. "user", "assistant", "system". */
  kind: string
  /** A one-line rendering a person can read. Never empty -- says so when there is nothing to say. */
  text: string
  /**
   * The raw line, so nothing is hidden behind the rendering above.
   *
   * Capped in length, with `rawTruncated` set when it was: a single assistant turn can be tens of
   * kilobytes, and fifty of them would be a response no page can draw. What is cut is said out
   * loud rather than trimmed quietly.
   */
  raw: string
  rawTruncated: boolean
  /** The line's real length in characters, before any capping. */
  rawLength: number
}

// ---------------------------------------------------------------------------- when the log last grew

/**
 * WHEN A SESSION'S TRANSCRIPT WAS LAST WRITTEN, or why that could not be read.
 *
 * Criterion M106 asks one question of a session that is holding a handle: is the session behind
 * the waiter still there? The answer may not come from the heartbeat alone, because the waiter is
 * a second process that can outlive the session it speaks for (problem `DyEIJyDCG01X`). It comes
 * from the session's own transcript, and this is that reading.
 *
 * IT IS NOT A SECOND WRAPPER AROUND A CLOCK. The adapter already decides, for the sessions page,
 * whether a log has a timestamp of its own and when that was; this hands the same fact back for
 * the one question a hold asks, so the two cannot come to different answers about one file. Where
 * the log carries no clock the file's own modification time stands in, and `from` says which of
 * the two was used rather than leaving a reader to guess.
 *
 * ABSENCE IS AN ANSWER. A transcript that is not there, or that cannot be opened, comes back
 * `read: false` with the reason — never as a write at the epoch, and never as a write now. The
 * caller decides what a missing reading means; this only refuses to invent one.
 */
export type TranscriptWrite =
  | { read: true; at: Date; from: 'its last line' | "the file's modification time" }
  | { read: false; missing: boolean; reason: string }

// ---------------------------------------------------------------------------- the adapter

/**
 * One tool's answers. Everything Mole Office knows about sessions comes through here.
 *
 * The three methods are separate because they are read at different costs and at different
 * times: `discover` sweeps a directory for a list page, `observe` re-checks one session that
 * Mole Office already has a record of (including one whose log has since been deleted), and
 * `renderLine` is the only tool-specific part of showing a tail.
 */
export interface SessionAdapter {
  /** The tool's name, as stored on the record. Must be stable: records are matched on it. */
  tool: string

  /** Where this adapter looks, in one line, so a caller finding nothing knows where it searched. */
  looksIn(env: AdapterEnv): string

  /**
   * Whether this tool's log can say "the session ended cleanly".
   *
   * Declared rather than assumed, because for Claude Code the answer is NO and that governs
   * everything: an adapter whose logs carry no ending marker must never report `finished`. See
   * claude-code.ts for the evidence behind that answer.
   */
  reportsCleanExit: boolean

  /**
   * Every session of this tool that can be found on disk, and every place that could not be read.
   *
   * Returns a DiscoveryResult rather than a bare list because "none" and "I could not look" are
   * different answers and only one of them is good news. An adapter that hits a directory it is
   * not allowed to open reports it and carries on with the rest: a partial sweep that says what it
   * missed is worth more than a whole request that fails.
   *
   * `depth` says how much of each transcript to read. `full` is everything a drawn row shows:
   * who started it, what it is doing, which files it touched. `states` reads only enough to place
   * the state word — whether a live process names the session and when its log last grew — which
   * is what a tally needs and what a caller that will draw none of these rows should pay. A row
   * discovered at `states` carries no name and no purpose; it is for counting, and a caller that
   * will draw one reads it again at `full` through `observe`.
   */
  discover(env: AdapterEnv, depth?: DiscoveryDepth): DiscoveryResult

  /**
   * THE SESSIONS `discover` FINDS OF THESE CONVERSATIONS ONLY, each built as `discover` builds it at `full` depth, and
   * every place that could not be read, as `discover` gives them.
   *
   * The places are walked as `discover` walks them, so a caller that finds nothing can still say what it could not
   * open, and only the transcripts of the conversations asked for are read. A conversation found in two places is two
   * sessions here, as it is there. The detail of one run asks this (`theSessionAnIdNames` in lib/sessions.ts).
   */
  discoverThese(externalIds: readonly string[], env: AdapterEnv): DiscoveryResult

  /**
   * Re-observe one session Mole Office already knows about, by the log path it was recorded with.
   *
   * Returns a session whatever the state of the file: a log that has been deleted comes back
   * `orphaned` with a reason saying so, because a record pointing at a file that is gone is
   * exactly the case a list built only from `discover` would drop without a word.
   */
  observe(input: { externalId: string; logPath: string }, env: AdapterEnv): ObservedSession

  /**
   * When this session's transcript was last written, or why that could not be read.
   *
   * SEPARATE FROM `observe` BECAUSE IT ASKS ONE THING AND ASKS IT CHEAPLY. `observe` derives a
   * whole session — a state word, a process match, the prose and the files — and a hold asking
   * only "is anything still writing" should not pay for all of that, nor should it start a
   * process scan that a second reader is already doing. This reads the end of the transcript and
   * nothing else. Criterion M106.
   */
  transcriptLastWrittenAt(input: { externalId: string; logPath: string }): TranscriptWrite

  /** Turn one raw log line into something readable. Never throws on a malformed line. */
  renderLine(raw: string, fromEnd: number): TailLine
}
