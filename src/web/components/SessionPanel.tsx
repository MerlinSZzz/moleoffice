// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Sessions: every piece the sessions page is built from.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 * A session is one agent run. Four things about it are worth interrupting someone for, and
 * they are the four this page is shaped around:
 *
 *   1. one CRASHED, and nobody will notice for you — attention.ts calls this rule 1;
 *   2. one is IDLE, i.e. alive and waiting on an answer you have not given;
 *   3. you want to pick one back up, which needs the EXACT resume command, not a description
 *      of it;
 *   4. one ENDED AND LEFT SOMETHING RUNNING — a process, a port, a container, GPU memory.
 *
 * The fourth is why this file exists at all. PRODUCT_SPEC §6.1 puts orphan cleanup in the
 * first usable version and says what motivated it: a simulation process that sat idle for
 * eleven days holding the GPU, started by a session that had ended. troubleshooting.md
 * records the same class of failure happening four times inside Mole Office itself, once producing
 * a wrong diagnosis that was written down and acted on. Nothing notices an orphan except a
 * person looking at a screen. The home page's panel carried the orphan block for that reason
 * until Home stopped drawing sessions; the orphans are in the sessions page's machine section.
 *
 * ---------------------------------------------------------------------------------------
 * ONE SURFACE
 * ---------------------------------------------------------------------------------------
 * HomePage.tsx once carried its own inline sessions panel, and later drew `SessionPanel` and then
 * `SessionPreview` from this file. Home no longer draws sessions, and wave 13y round 32 removed
 * both panels. The sessions page is the one surface built from the pieces below.
 *
 * ---------------------------------------------------------------------------------------
 * THE LIST NEVER SCROLLS INSIDE ITSELF
 * ---------------------------------------------------------------------------------------
 * There is no `overflow` box here at any width. An inner scrollbox is how a crashed session ends
 * up one wheel-click below the fold on a phone; the list grows and the PAGE scrolls, which is a
 * thing people know they can do. And one thing is true at every width, including 390px, however
 * many sessions exist: THE TALLY LINE. It carries all SIX states whether or not they have anything
 * in them. A state with a zero still gets its word — "0 crashed" is information.
 *
 * ---------------------------------------------------------------------------------------
 * STATE IS A WORD AND A SHAPE BEFORE IT IS A COLOUR
 * ---------------------------------------------------------------------------------------
 * A session state is drawn by the product's own state chip, exactly as a state word on any other
 * record: the shape comes from the word and no colour is spent on it. This file holds no map from a
 * session state to a drawing. It used to — `SESSION_CHIP` — and that map is why one session word
 * came out tinted here and as a filled black block on Home.
 *
 * THE SESSION'S OWN WORD IS ALWAYS ON THE ROW, by one route: `SessionStateChip`
 * renders `StoredState`, which prints the stored word, or the plainer word the product's one
 * display table shows in its place — "waiting for you" for `idle`, "left running" for `orphaned`.
 *
 * Six states, six words, six shapes, and no hue on any of them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS IN THIS FILE, IN THE ORDER IT APPEARS
 * ---------------------------------------------------------------------------------------
 * It has grown, so here is the map. Everything the sessions page draws is here.
 *
 *   THE CONTRACT AND THE READERS   what GET /api/sessions and the resource ledger send, and the
 *                                  defensive readers that turn either into rows or into printed
 *                                  sentences. Nothing unreadable is ever quietly dropped.
 *   ORDER                          `sortSessionViews`.
 *   THE PIECES                     the orphan block, the release confirmation, the tally, the
 *                                  printed problems and `NoSessionsNote`.
 *   WHAT WAS WRITTEN               the session RECORDS, read for one thing the sessions API cannot
 *                                  say: whether a state word was ever written, and which.
 *   GROUPING                       the eight reading groups, which one a session is in, how loudly
 *                                  a row is drawn, and the rule that says a shared explanation once.
 *   ONE SESSION, DRAWN             the row that opens into everything recorded about a run.
 *   THE MACHINE SURFACE            the sweep grouped by HOLDING PROCESS rather than by port, and
 *                                  the one-line summary of it the page draws above the runs.
 *   WHEN IT WAS READ               the stamp on a reading, and the press that reads again.
 *   TALKING TO THE SERVER          the three requests, `fetchSessionsPage`, which makes them, and
 *                                  `useMachineReading`, which keeps the last good reading.
 */

import { TieredPress } from './TieredPress.tsx'
import { endOfSentence, t } from '@shared/i18n.ts'
import { useRef, useState } from 'react'
import type { PanelRecord, SessionState } from '@shared/types.ts'
import { SESSION_STATES } from '@shared/types.ts'
import { wholeRows } from '@shared/sessions-said-once.ts'
/**
 * The placement contract, from the file that decides it.
 *
 * TYPE-ONLY, AND ERASED BEFORE THE BUNDLE IS BUILT — the same arrangement ModuleSource.tsx uses,
 * for the same reason: a VALUE import from the server would drag better-sqlite3 into the browser.
 * Naming the types there rather than declaring a second set here is the point. Where a run is filed
 * is a rule the server now runs and serves, and a page holding its own idea of that shape is how
 * two declarations of one thing start to disagree.
 */
import type {
  ActivityClock,
  ItsProcess,
  Placement,
  PlacementReading,
  ProjectClaim,
  ProjectRef,
  SessionWorkspace,
} from '../../server/lib/sessions.ts'

// Handed on rather than re-declared, so the page and its tests name the same shapes the server
// sends. A second declaration of a served shape is the defect this codebase keeps producing.
export type { ActivityClock, ItsProcess, Placement, PlacementReading, ProjectClaim, ProjectRef, SessionWorkspace }
import { localStamp, parseLocalStamp } from '@shared/time.ts'
// The contract that says what a state WORD means. `progressOf` is what turns the word written on a
// record into "the work stopped short" or "nobody has classified this", and it is the same function
// the server's attention rule asks, so this page and that list cannot disagree about one session.
import { progressOf, type Progress } from '@shared/work.ts'
// Whether the `session` kind declares a state field at all. Read rather than assumed, so "a state
// was expected here and none was written" is a fact about the published schema.
import { kindDeclaresState } from '@shared/attention.ts'
import { NO_ADAPTED_TOOL } from '@shared/words.ts'
import { api, ApiError, errorMessage, faultOf, moleOfficeRequest, type Fault } from '../api.ts'
/** What a sweep of this machine for agent runs found. Type-only, so no server code is bundled. */
import type { DiscoverReply } from '../../server/api/sessions.ts'
import { useInspect } from '../lib/mode.ts'
import { useProjectAsync } from '../lib/project-async.ts'
import { currentWorkspace } from '../lib/workspace.ts'
// The clipboard hook moved out of this file on 27 August 2026, so that components/RecordId.tsx can
// reach it without importing a panel. It is re-exported below for the surfaces that already say
// `from './SessionPanel.tsx'`.
import { useCopy } from '../lib/copy.ts'
import { waitingOnALimitUntil } from '../lib/a-long-wait.ts'
import { theNextTryOfALongWait } from '../../config/a-long-wait.mjs'
import { formatDuration, relativeToNow } from '../lib/attention.ts'
import { recordPath } from './router.tsx'
import {
  Absence,
  Btn,
  ErrorNote,
  NoStateMark,
  ScanRow,
  ServerNote,
  StateChip,
  StateDrawingGlyph,
  StateGlyph,
  StoredState,
  STATE_DRAWING_INK,
  STATE_WORDS,
  Tag,
  UnclassifiedMark,
  ageAlarm,
  shownState,
  stateDrawing,
  type AlarmLevel,
  type PanelState,
  OriginMark,
} from './ui.tsx'

// ============================================================================ the API contract
/**
 * ---------------------------------------------------------------------------------------
 * WHAT THIS VIEW READS, AND WHERE IT COMES FROM
 * ---------------------------------------------------------------------------------------
 *
 *   GET  /api/sessions                 -> { sessions, searched, counts, warning? }
 *   GET  /api/resources/orphans        -> { orphans, searched, warning? }
 *   POST /api/resources/:id/release    -> { released: true, ... }   body: { expect: <phrase> }
 *
 * Sessions and orphans are two requests, not one. They are two questions — "what ran" and "what
 * is still running that nothing owns" — answered by two parts of the server, and folding them
 * into one reply would mean a failure to read the process table blanked the session list too.
 *
 * ---------------------------------------------------------------------------------------
 * THE RELEASE CONTRACT, WHICH IS THE WHOLE REASON THE BUTTON EXISTS
 * ---------------------------------------------------------------------------------------
 * "Only expose release/kill when the server can return the exact command/process description
 *  being acted on."
 *
 * So every orphan carries `describe` (exact and specific: "node src/server/index.ts — pid
 * 3302512, group 3302496, up 10d20h") and either a `releaseAction` or null. NULL MEANS NO
 * BUTTON — not a disabled one, none — and the row says why instead. Locks are always null:
 * Mole Office does not delete lock files.
 *
 * A `releaseAction` has to be complete to be usable: verb, target, alsoAffects and confirmPhrase.
 * `readOrphansPayload` below throws away any action missing one of those and prints a line
 * saying which orphan and which field, because an action the server could not fill in honestly
 * is exactly the case this contract exists to refuse. Killing by process group kills children,
 * so `alsoAffects` is shown before the confirm, every time, including when it is empty — and
 * "nothing else is in this group" is then a stated fact rather than a silence.
 *
 * `confirmPhrase` is shown VERBATIM and sent back under `expect`. Not paraphrased and not
 * rebuilt from the fields: the point of the round trip is that the phrase on the screen is the
 * phrase the server will act on. A 400 means those two disagree, which means the screen is a
 * stale reading of the machine — the way the wrong thing gets killed. A 409 means the resource
 * changed hands since it was read. Neither is retried here; both send the reader back to a fresh
 * reading.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SERVER DISAGREED WHEN THIS WAS WRITTEN — 2026-08-08
 * ---------------------------------------------------------------------------------------
 * Tested against a server on this machine (routes ARE registered in src/server/index.ts now):
 *
 *   - GET /api/resources/orphans answers `{checkedAt, platform, orphans, stillOwned, unchecked}`
 *     and its orphan rows are the ledger's own `ResourceReport` — `type`/`key`/`detail`/`age`,
 *     with no `describe`, no `ageSeconds` and no `releaseAction`. That file belongs to another
 *     agent this phase, so nothing here chases it: this view reads the CONTRACT, and every row it
 *     cannot read becomes a printed line naming the field. A mismatch is therefore reportable
 *     evidence on the screen rather than a blank panel.
 *   - GET /api/sessions/:id/log does not exist and answers 404. This view used to link to it from
 *     every session with a log path, which was a dead link on every row. The log PATH is shown
 *     with a copy button instead, which is what a person needs to open it anyway.
 *   - Sessions carry `name`/`title`/`lastActivityAt`/`stateReason`/`recordId` and no `model` or
 *     `detail` field; the reader below is built on those names, which is what the server sends.
 */

/** One agent run, flattened for display. `null` means the server did not send the field. */
export interface SessionView {
  /** Mole Office's id for the session itself, e.g. `claude-code:6af5cdcb-…`. Always present. */
  id: string
  /** The `session` RECORD's id, when one has been filed. Null means nothing to link to. */
  recordId: string | null
  /** The record's title if a person set one, otherwise the name the tool gave the run. */
  title: string
  /**
   * How the SESSION RECORD entered the corpus — `fixture`, `authored`, or null.
   *
   * READ `recordId` FIRST. Null here means two different things: there is no record at all, so
   * nothing could have been stamped; or there is one and nobody said. 35 of 58 rows in `panelx` and
   * 35 of 91 in `greenhouse` are runs found on disk that nobody filed, and drawing "nobody recorded
   * how this got here" on one of those would be a claim about a record that does not exist.
   */
  origin: 'fixture' | 'authored' | null
  state: SessionState
  /**
   * What was observed to reach that state, in one sentence.
   *
   * Shown, never hidden: `orphaned` and `unknown` are real answers, and an answer a reader
   * cannot check is one they have to either take on faith or ignore.
   */
  stateReason: string | null
  /** One line: what this run is for. STAGES E1 calls it the session's purpose. */
  purpose: string | null
  /** What it is doing, or was doing when it stopped. The live half of the pair with `purpose`. */
  doing: string | null
  /**
   * Which agent tool, e.g. "claude-code" — a name an adapter answers to, and nothing else.
   *
   * "unrecorded" means no adapter observed this run. What the record CALLS its agent is
   * `recordedAgent`, kept apart because "claude-code (opus-5)" is an honest answer to "which agent
   * is this" and a tool name no adapter will ever match.
   */
  tool: string | null
  /** The agent named on the session record, when one is. */
  recordedAgent: string | null
  /** The working directory the agent was started in. */
  cwd: string | null
  /** Which project directory it worked in, and whether that was observed or only written down. */
  workspace: SessionWorkspace | null
  /** When it last produced output. The clock "idle for 40m" is measured against. */
  lastOutputAt: string | null
  /** Where that clock came from. Null when there is no clock at all. */
  lastActivityFrom: ActivityClock | null
  /** The exact command that picks this session back up. Copied, never retyped. */
  resumeCommand: string | null
  /** Where its log is on disk. */
  logPath: string | null
  /**
   * Which pipeline or module this run is filed under, and why — the server's answer, not this
   * page's. Never absent: unassigned, with its reason, is one of the answers.
   */
  placement: Placement
  /**
   * What the office can see of the process a hand-filed running run names, or null on every other row. The row
   * draws it beside the running chip, so a run whose process nobody can see is not drawn as plainly running.
   */
  itsProcess: ItsProcess | null
}

/**
 * The things a session can leave behind.
 *
 * This list must stay equal to `RESOURCE_TYPES` in src/server/lib/resources.ts, which is the
 * ledger's own vocabulary and therefore the authority on what kinds exist. A kind missing from
 * here is not drawn small — it is REJECTED by the reader below and printed as a problem, so
 * dropping one silently loses a whole class of orphan. `lock` is in the list for exactly that
 * reason: STAGES E6 names only four, the ledger records five. `slot` made six on 21 September 2026:
 * a seat in one of the machine's shared test pools, which the server never offers to release here.
 */
export const ORPHAN_KINDS = ['process', 'port', 'gpu', 'container', 'lock', 'slot', 'client'] as const
export type OrphanKind = (typeof ORPHAN_KINDS)[number]

/** The label on the row's tag: short, because it sits next to the resource itself. */
const ORPHAN_WORDS: Record<OrphanKind, string> = {
  get process() { return t('g6a.sessions.process') },
  get port() { return t('g6a.sessions.port') },
  get gpu() { return t('g6a.sessions.gpuMemory') },
  get container() { return t('g6a.sessions.container') },
  get lock() { return t('g6a.sessions.lockFile') },
  get slot() { return t('g6a.sessions.testSlot') },
  get client() { return t('w13t.sessions.windowOrClient') },
}

/** What may be done to a resource. `stop` is a container; everything else dies by signal. */
export const RELEASE_VERBS = ['kill', 'stop'] as const
export type ReleaseVerb = (typeof RELEASE_VERBS)[number]

/**
 * Everything the server must be able to say before a button is drawn.
 *
 * Every field is required except `signal`, which only a signalled kill has. A partial action is
 * not an action: see `readReleaseAction`.
 */
export interface ReleaseAction {
  verb: ReleaseVerb
  /** What is acted on, exactly: "process group 3302496". */
  target: string
  /** "SIGTERM". Absent for a container stop. */
  signal: string | null
  /**
   * Every OTHER process that dies with it, described the same way as `describe`.
   *
   * Killing a group kills children. An empty list is a claim the server is making — that nothing
   * else is in the group — and the row prints it as one.
   */
  alsoAffects: string[]
  /** The one sentence shown verbatim before acting, and sent back under `expect`. */
  confirmPhrase: string
}

/** Something a session started that outlived it. */
export interface Orphan {
  id: string
  kind: OrphanKind
  /** Exact and specific: "node src/server/index.ts — pid 3302512, group 3302496, up 10d20h". */
  describe: string
  /** How long it has been alive. Null when the server did not report an age. */
  ageSeconds: number | null
  /** The session that started it, when its record still exists. */
  sessionId: string | null
  sessionTitle: string | null
  /** Null means NOT releasable from here. The interface must not offer a button. */
  releaseAction: ReleaseAction | null
}

// ---------------------------------------------------------------------------- the unclaimed sweep
/**
 * SOMETHING RUNNING THAT NO SESSION CLAIMS. THE LOUDEST THING ON THIS PANEL.
 *
 * An orphan is a LEDGER ROW whose session has ended: somebody wrote it down, and Mole Office can say
 * whose it was and offer to release it. The sweep below is the other half, and it is the half
 * that matches every incident this feature was built after: a process nobody registered has no
 * row, so it can never be reported as an orphan, so three empty orphan lists read as "all clear"
 * when they may mean "nothing wrote anything down".
 *
 * "This is running and no session claims it" is therefore a WORSE statement than "no orphans",
 * not a lesser one — and it is worse in a specific way that the drawing has to carry: an orphan
 * can at least be attributed. An unclaimed process cannot. There is nobody to ask what it was
 * for, nothing that says whether leaving it was deliberate, and no ledger row to release it by,
 * which is why these rows carry the command to run by hand instead of a button.
 *
 * The shapes below mirror `UnclaimedSweep` and `UnclaimedResource` in src/server/lib/resources.ts,
 * read the same defensive way as everything else here: anything unreadable becomes a printed
 * line, never a quietly shorter list.
 */

/** What the sweep can find. Fewer kinds than the ledger: a lock file is a path, not a process. */
export const UNCLAIMED_KINDS = ['port', 'gpu', 'container'] as const
export type UnclaimedKind = (typeof UNCLAIMED_KINDS)[number]

const UNCLAIMED_WORDS: Record<UnclaimedKind, string> = {
  get port() { return t('g6a.sessions.port') },
  get gpu() { return t('g6a.sessions.gpuMemory') },
  get container() { return t('g6a.sessions.container') },
}

/** One live thing on this machine that no live ledger row claims. */
export interface Unclaimed {
  kind: UnclaimedKind
  /** The port number, the pid, or the container name — as text, like a ledger key. */
  key: string
  /** What it is, in one line: the command and where it listens, or the image and its status. */
  detail: string | null
  /** How long the holder has been up, in the server's words ("11 days"). Null when unreadable. */
  upFor: string | null
  /**
   * The same age in seconds, which is the half a machine can sort on.
   *
   * `upFor` is prose — "11 days", "40 minutes" — and sorting prose puts "4 hours" above "11 days".
   * The server sends both halves of its `Age`; this view used to keep only the words, so the one
   * ordering that matters on the machine surface (oldest first, because an eleven-day-old holder is
   * the incident this feature was built after) could not be made without re-reading the string.
   */
  upSeconds: number | null
  /** The process holding it, when this user may inspect it. */
  pid: number | null
  pgid: number | null
  /**
   * The holder's command line, as the process table gives it.
   *
   * Read so the machine surface can group by the PROCESS rather than by the port: one Zotero
   * holding three ports is one thing to deal with and one command to run, and the only way to say
   * that is to have the process's own name. `detail` carries the command too, but glued to the
   * thing being held ("… — 127.0.0.1:23119/tcp"), so it differs on every row of one group.
   */
  command: string | null
  /**
   * The server's own sentence about this row, including what to run by hand.
   *
   * Shown verbatim and never rebuilt here: it is the only thing on the row that says what Mole Office
   * can and cannot know about who started this, and a paraphrase would be this view inventing
   * confidence the server did not express.
   */
  note: string | null
}

/** The sweep, as this view reads it. */
export interface UnclaimedRead {
  /** The server's one sentence. Null when it sent none, which is itself printed as a problem. */
  summary: string | null
  resources: Unclaimed[]
  /** Alive, deliberately left out, and why — Mole Office's own server, and what it may not inspect. */
  skipped: { what: string; reason: string }[]
  /** Where the sweep looked. An empty place cannot be told from an unsearched one. */
  searched: string[]
  /** Places it could not look at all. Loud, because a partial sweep is not a clean bill. */
  unchecked: string[]
}

/**
 * A line the panel prints because something could not be read.
 *
 * The `{ text, href }` form exists so the home page can keep what its inline panel did: an
 * unreadable session RECORD is complained about AND offers a way to go and look at it.
 */
export type PanelProblem = string | { text: string; href: string } | { text: string; raw: string; toString(): string }

/**
 * A problem whose sentence carries a raw entry, with the entry kept apart so it can break anywhere.
 *
 * `toString` returns the whole sentence, so a reader that joins problems into one line still reads
 * the words rather than an object.
 */
function aProblemWithItsRawEntry(text: string, raw: string): PanelProblem {
  return { text, raw, toString: () => text }
}

export interface SessionsRead {
  sessions: SessionView[]
  /** Where the server looked, one line each, so "no sessions" is an answer and not a shrug. */
  searched: string[]
  /** The server saying its own sweep was partial. Shown at the top of the panel, never dropped. */
  warning: string | null
  /** Everything the payload contained that this view could not read. Printed, never dropped. */
  problems: PanelProblem[]
  /**
   * What the placement rule read to answer, and whether it saw the whole change log.
   *
   * The empty reading when the server sent none — either because it sent nothing usable, or, by
   * design, because this was a `?only=running` reply, which never reads the change log at all.
   * Either way this draws nothing: a page that printed "0 links were read" for a server that simply
   * did not say would be reporting a gap in its own reading as a fact about the database.
   */
  placementRead: PlacementReading
  /**
   * How many sessions are in each state, counted over EVERY session the server found — never only
   * the rows this reply carries. A `?only=running` reply still answers the true count of every
   * state; only `sessions` itself is narrowed. All-zero when the server sent nothing usable.
   */
  counts: Record<string, number>
}

/** How many sessions are in each state, or an all-zero reading when the server sent nothing usable. */
function readCounts(raw: unknown): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const state of SESSION_STATES) {
    const v = isObj(raw) ? raw[state] : undefined
    counts[state] = typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return counts
}

export interface OrphansRead {
  orphans: Orphan[]
  searched: string[]
  warning: string | null
  /**
   * What is running that no session claims, or NULL when the reply carried no sweep at all.
   *
   * Null is not "nothing unclaimed". It is "this reply does not answer that question", and the
   * page prints that difference — see `MachineSurface`. It is kept out of `problems` on purpose:
   * a missing block is a statement about the whole answer, and it belongs where the answer would
   * have been drawn rather than in the list of rows that could not be read.
   */
  unclaimed: UnclaimedRead | null
  problems: PanelProblem[]
}

/** What the server said it did, after a release. Its words, not ours. */
export interface ReleaseReport {
  /** The description of the thing acted on, as the server describes it. */
  describe: string
  /** Everything it killed. Null means the server did not list them, which the row says. */
  killed: string[] | null
  /** The server's own sentence about what happened, when it sent one. */
  outcome: string | null
}

// ============================================================================ reading the payload

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Text, or null. Blank and whitespace count as absent: a row cannot print them either. */
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * Where a sweep looked, as lines.
 *
 * Both endpoints send `searched`, and they send it differently: sessions sends objects
 * (`{tool, looksIn}`), the resource contract sends plain strings. Both are read rather than one
 * being declared correct, because the alternative is a panel that silently stops saying where it
 * looked the day the other end changes shape — and "Mole Office found nothing" without "here is where
 * it looked" is the sentence that got a wrong diagnosis written down on this project.
 */
function readSearched(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const lines: string[] = []
  for (const entry of raw) {
    const asText = str(entry)
    if (asText !== null) {
      lines.push(asText)
      continue
    }
    if (!isObj(entry)) continue
    const tool = str(entry['tool'])
    const looksIn = str(entry['looksIn'])
    if (tool !== null && looksIn !== null) lines.push(`${tool} — ${looksIn}`)
    else if (looksIn !== null) lines.push(looksIn)
  }
  return lines
}

/** A project ref, or null when the server did not send one this page can name. */
function readProjectRef(raw: unknown): ProjectRef | null {
  if (!isObj(raw)) return null
  const id = str(raw['id'])
  const title = str(raw['title'])
  const kind = str(raw['kind'])
  if (id === null || title === null || (kind !== 'pipeline' && kind !== 'module')) return null
  return { id, kind, title }
}

/**
 * One claim: the project, and the sentence the server wrote for it.
 *
 * THE SENTENCE IS THE SERVER'S AND IS NOT REBUILT HERE. It names the link word, the middle record
 * of a chain and the block a run was filed through, and every one of those is a fact this page
 * would have to be handed anyway. Quoting it is what makes the page and the API say the same thing
 * about the same run; deriving it again is how they stop.
 */
function readClaim(raw: unknown): ProjectClaim | null {
  if (!isObj(raw)) return null
  const project = readProjectRef(raw['project'])
  const sentence = str(raw['sentence'])
  const evidence = isObj(raw['evidence']) ? raw['evidence'] : null
  const how = evidence === null ? null : str(evidence['how'])
  if (project === null || sentence === null || how === null) return null
  const support = typeof raw['support'] === 'number' ? raw['support'] : 1
  return { project, sentence, support, evidence: evidence as unknown as ProjectClaim['evidence'] }
}

/**
 * Where the server says this run is filed, or the answer that it could not be read.
 *
 * A row whose placement is missing or malformed is NOT drawn as unassigned-because-nothing-links-
 * it: that would be this page inventing a finding about somebody's records out of a gap in its own
 * reading. It is drawn as "not saying either way", with a line printed under the panel naming the
 * session.
 */
function readPlacement(raw: unknown, where: string, title: string, problems: PanelProblem[]): Placement {
  const complain = (why: string): Placement => {
    problems.push(
      t('g6a.sessions.soThisRunIsShownAsUnplacedRather', { value1: (where), value2: (title), value3: (why) }),
    )
    return unreadablePlacement()
  }
  if (!isObj(raw)) return complain(t('g6a.sessions.carriesNoReadablePlacement'))

  if (raw['kind'] === 'unassigned') {
    const reason = isObj(raw['reason']) ? str(raw['reason']['why']) : null
    const sentence = str(raw['sentence'])
    if (reason === null || sentence === null) return complain(t('g6a.sessions.isUnplacedWithNoReasonAndNoSentence'))
    return {
      kind: 'unassigned',
      reason: raw['reason'] as unknown as Extract<Placement, { kind: 'unassigned' }>['reason'],
      sentence,
      howToPlace: str(raw['howToPlace']) ?? '',
    }
  }

  if (raw['kind'] !== 'in') return complain(t('g6a.sessions.hasAPlacementKindThisPageDoesNot'))
  const primary = readClaim(raw['primary'])
  if (primary === null) return complain(t('g6a.sessions.isFiledSomewhereTheAnswerDoesNotName'))
  const alsoRaw = Array.isArray(raw['also']) ? raw['also'] : []
  const also = alsoRaw.map(readClaim).filter((claim): claim is ProjectClaim => claim !== null)
  if (also.length !== alsoRaw.length) {
    // Counted rather than dropped in silence: "it also reaches 3 others" with two of them printed
    // is the arithmetic this page exists to keep honest.
    problems.push(
      t('g6a.sessions.reachesOtherPipelinesOrModulesAndOfThem', { value1: (where), value2: (title), value3: (alsoRaw.length), value4: (alsoRaw.length - also.length) }),
    )
  }
  return { kind: 'in', primary, also }
}

/** How many of a thing the server counted, or 0 when it did not say. */
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** What the placement rule read, when the server said. The empty reading when it did not. */
function readPlacementRead(raw: unknown): PlacementReading {
  if (!isObj(raw)) return NO_PLACEMENT_READ
  return {
    rule: str(raw['rule']) ?? '',
    projects: num(raw['projects']),
    blocks: num(raw['blocks']),
    links: num(raw['links']),
    changes: num(raw['changes']),
    changesCapped: raw['changesCapped'] === true,
  }
}

/** The workspace and where it came from, or null when the server did not say. */
function readWorkspace(raw: unknown): SessionWorkspace | null {
  if (!isObj(raw)) return null
  const name = str(raw['name'])
  const from = str(raw['from'])
  if (name === null || (from !== 'observed' && from !== 'recorded')) return null
  return { name, from, path: str(raw['path']) }
}

/** Which of the five clocks this row's `lastActivityAt` came from, when the server said. */
const ACTIVITY_CLOCKS: readonly ActivityClock[] = ['log', 'change-log', 'tool-use', 'stated', 'record-updated']

function readActivityClock(raw: unknown): ActivityClock | null {
  const word = str(raw)
  return word !== null && (ACTIVITY_CLOCKS as readonly string[]).includes(word) ? (word as ActivityClock) : null
}

/** What the office saw of a hand-filed running run's process. A reading this page cannot read is named as a problem. */
const PROCESS_SEEN: readonly ItsProcess['seen'][] = ['running', 'none', 'not-its-own']

function readItsProcess(raw: unknown, where: string, title: string, problems: PanelProblem[]): ItsProcess | null {
  if (raw === undefined || raw === null) return null
  const seen = isObj(raw) ? str(raw['seen']) : null
  const says = isObj(raw) ? str(raw['says']) : null
  if (seen !== null && says !== null && (PROCESS_SEEN as readonly string[]).includes(seen)) return { seen: seen as ItsProcess['seen'], says }
  problems.push(t('sessions.itsProcess.unreadable', { where, title, value: JSON.stringify(raw).slice(0, 160) }))
  return null
}

/**
 * Turn whatever the server sent into rows, and turn everything else into sentences.
 *
 * This is `parseModule`'s pattern from ModuleView.tsx, for `parseModule`'s reason: a list that
 * silently showed one fewer session because a field was spelled differently would be worse than
 * no list, because you would trust it. Every rejection below names the session and says what
 * was wrong with it, and the panel prints those lines under the rows.
 */
export function readSessionsPayload(raw: unknown): SessionsRead {
  const problems: PanelProblem[] = []
  const sessions: SessionView[] = []

  if (!isObj(raw)) {
    return {
      sessions,
      searched: [],
      warning: null,
      problems: [t('g6a.sessions.theServerRepliedWithNotAnObject', { value1: (typeof raw) })],
      placementRead: NO_PLACEMENT_READ,
      counts: readCounts(undefined),
    }
  }

  const rawSessions = raw['sessions']
  if (rawSessions === undefined) {
    problems.push(t('g6a.sessions.theReplyHasNoSessionsKeySoNo'))
  } else if (!Array.isArray(rawSessions)) {
    problems.push(t('g6a.sessions.sessionsIsPresentButIsNotAList'))
  } else {
    // A NARROWED ANSWER SAYS ONCE WHAT ITS ROWS SAY ALIKE, and each row is made whole again here,
    // before it is read, so a row that left its placement out is not read as a row without one.
    wholeRows(rawSessions, raw['saidOnce']).forEach((entry, i) => {
      const where = `sessions[${i}]`
      if (!isObj(entry)) {
        problems.push(t('g6a.sessions.isNotAnObject', { value1: (where) }))
        return
      }
      const id = str(entry['id'])
      // The record's title wins when a person has set one; `name` is what the tool called the
      // run. Either is a name for the row, and having neither means there is nothing to call it.
      const title = str(entry['title']) ?? str(entry['name'])
      if (id === null || title === null) {
        const raw = JSON.stringify(entry).slice(0, 160)
        problems.push(aProblemWithItsRawEntry(
          t('g6a.sessions.hasNoSoItCannotBeShownAs', { value1: (where), value2: (id === null ? 'id' : 'name or title'), value3: (raw) }),
          raw,
        ))
        return
      }
      const state = str(entry['state'])
      if (state === null || !(SESSION_STATES as readonly string[]).includes(state)) {
        // Same refusal, and the same wording, as readSessions() in lib/attention.ts: guessing a
        // state would hide a crashed run behind a cheerful "finished", which is the one mistake
        // this whole view exists to prevent.
        problems.push(
          state === null
            ? t('g6a.sessions.hasNoStateExpectedOneOf', { value1: (where), value2: (title), value3: (SESSION_STATES.join(', ')) })
            : t('g6a.sessions.hasStateWhichIsNotOneOf', { value1: (where), value2: (title), value3: (state), value4: (SESSION_STATES.join(', ')) }),
        )
        return
      }
      sessions.push({
        id,
        recordId: str(entry['recordId']),
        title,
        // The server's word, read rather than narrowed by a cast: a hand-edited row could hold
        // anything, and a word this reader does not know is nobody's claim about provenance.
        origin:
          entry['origin'] === 'fixture' || entry['origin'] === 'authored' ? entry['origin'] : null,
        state: state as SessionState,
        stateReason: str(entry['stateReason']),
        purpose: str(entry['purpose']),
        doing: str(entry['doing']),
        tool: str(entry['tool']),
        recordedAgent: str(entry['recordedAgent']),
        cwd: str(entry['cwd']),
        workspace: readWorkspace(entry['workspace']),
        lastOutputAt: str(entry['lastActivityAt']),
        lastActivityFrom: readActivityClock(entry['lastActivityFrom']),
        resumeCommand: str(entry['resumeCommand']),
        logPath: str(entry['logPath']),
        placement: readPlacement(entry['placement'], where, title, problems),
        itsProcess: readItsProcess(entry['itsProcess'], where, title, problems),
      })
    })
  }

  return {
    sessions,
    searched: readSearched(raw['searched']),
    warning: str(raw['warning']),
    problems,
    placementRead: readPlacementRead(raw['placementRead']),
    counts: readCounts(raw['counts']),
  }
}

/**
 * Read one `releaseAction`, or refuse it and say which field was missing.
 *
 * THE REFUSAL IS THE POINT. Returning a half-filled action would put a button on the screen that
 * cannot say what it kills, which is the one thing the contract forbids. So this returns null for
 * anything it cannot read completely, and pushes a line naming the orphan and the field — the
 * button then does not appear and the row explains itself.
 */
function readReleaseAction(
  raw: unknown,
  kind: OrphanKind,
  describe: string,
  problems: PanelProblem[],
): ReleaseAction | null {
  if (raw === null || raw === undefined) return null

  const refuse = (why: string): null => {
    problems.push(
      t('g6a.sessions.theReleaseActionForSoNoReleaseButton', { value1: (describe), value2: (why) }),
    )
    return null
  }

  // A lock is never releasable through Mole Office, whatever the server sends. This is checked before
  // the shape, because a well-formed action on a lock is not a shape problem — it is the server
  // and this view disagreeing about a rule, and that has to be visible rather than obeyed.
  if (kind === 'lock') {
    return refuse(t('g6a.sessions.isForALockFileWhichMoleOffice'))
  }

  if (!isObj(raw)) return refuse(t('g6a.sessions.isNotAnObject2', { value1: (typeof raw) }))

  const verb = str(raw['verb'])
  if (verb === null || !(RELEASE_VERBS as readonly string[]).includes(verb)) {
    return refuse(t('g6a.sessions.hasVerbWhichIsNotOneOf', { value1: (JSON.stringify(raw['verb'])), value2: (RELEASE_VERBS.join(', ')) }))
  }
  const target = str(raw['target'])
  if (target === null) return refuse(t('g6a.sessions.namesNoTargetSoNothingCouldBeSaid'))
  const confirmPhrase = str(raw['confirmPhrase'])
  if (confirmPhrase === null) return refuse(t('g6a.sessions.carriesNoConfirmphraseSoThereIsNothingTo'))

  const rawAlso = raw['alsoAffects']
  if (!Array.isArray(rawAlso)) {
    // An empty list is fine and means "nothing else". A MISSING list means the server did not
    // work out what else dies, which for a process group is the dangerous half of the answer.
    return refuse(t('g6a.sessions.doesNotListAlsoaffectsSoWhatElseWould'))
  }
  const alsoAffects: string[] = []
  for (const entry of rawAlso) {
    const line = str(entry)
    if (line === null) return refuse(t('g6a.sessions.hasAnEntryInAlsoaffectsThatIsNot'))
    alsoAffects.push(line)
  }

  return { verb: verb as ReleaseVerb, target, signal: str(raw['signal']), alsoAffects, confirmPhrase }
}

/** Lines of text out of an unknown value, dropping nothing that reads as a sentence. */
function readLines(raw: unknown, where: string, problems: PanelProblem[]): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    problems.push(t('g6a.sessions.isPresentButIsNotAListSo', { value1: (where) }))
    return []
  }
  const lines: string[] = []
  raw.forEach((entry, i) => {
    const line = str(entry)
    if (line === null) problems.push(t('g6a.sessions.isNotASentenceSoItCouldNot', { value1: (where), value2: (i) }))
    else lines.push(line)
  })
  return lines
}

/**
 * Read the unclaimed sweep, or say the reply did not carry one.
 *
 * NULL MEANS THE QUESTION WAS NOT ANSWERED, and that is drawn as its own statement. Returning an
 * empty sweep instead would put "nothing is running that nobody claims" on the screen on no
 * evidence — the same reassuring silence that the sweep exists to replace, one level up.
 */
function readUnclaimed(raw: unknown, problems: PanelProblem[]): UnclaimedRead | null {
  if (raw === undefined || raw === null) return null
  if (!isObj(raw)) {
    problems.push(
      t('g6a.sessions.theUnclaimedBlockIsNotAnObjectSo', { value1: (typeof raw) }),
    )
    return null
  }

  const summary = str(raw['summary'])
  if (summary === null) {
    problems.push(
      t('g6a.sessions.theUnclaimedSweepCarriesNoSummarySoThe'),
    )
  }

  const resources: Unclaimed[] = []
  const rawResources = raw['resources']
  if (rawResources === undefined) {
    problems.push(
      t('g6a.sessions.theUnclaimedSweepHasNoResourcesListSo'),
    )
  } else if (!Array.isArray(rawResources)) {
    problems.push(t('g6a.sessions.unclaimedResourcesIsPresentButIsNotA'))
  } else {
    rawResources.forEach((entry, i) => {
      const where = `unclaimed.resources[${i}]`
      if (!isObj(entry)) {
        problems.push(t('g6a.sessions.isNotAnObject', { value1: (where) }))
        return
      }
      const kind = str(entry['type'])
      const key = str(entry['key'])
      if (kind === null || !(UNCLAIMED_KINDS as readonly string[]).includes(kind)) {
        problems.push(
          t('g6a.sessions.hasTypeWhichIsNotOneOfIt', { value1: (where), value2: (JSON.stringify(entry['type'])), value3: (UNCLAIMED_KINDS.join(', ')) }),
        )
        return
      }
      if (key === null) {
        const raw = JSON.stringify(entry).slice(0, 200)
        problems.push(aProblemWithItsRawEntry(
          t('g6a.sessions.hasNoKeySoThereIsNothingTo', { value1: (where), value2: (raw) }),
          raw,
        ))
        return
      }

      // Everything below is missing-tolerant: a live thing that no session claims is never
      // hidden because one of its descriptive fields could not be read. What is missing is said.
      const detail = str(entry['detail'])
      if (detail === null) problems.push(t('g6a.sessions.carriesNoDetailSoWhatItIsRunning', { value1: (where), value2: (kind), value3: (key) }))
      const note = str(entry['note'])
      if (note === null) {
        problems.push(
          t('g6a.sessions.carriesNoNoteSoTheServerSaidNothing', { value1: (where), value2: (kind), value3: (key) }),
        )
      }

      const rawUpFor = entry['upFor']
      const upFor = isObj(rawUpFor) ? str(rawUpFor['human']) : null
      const holder = isObj(entry['holder']) ? entry['holder'] : null
      const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

      resources.push({
        kind: kind as UnclaimedKind,
        key,
        detail,
        upFor,
        upSeconds: isObj(rawUpFor) ? num(rawUpFor['seconds']) : null,
        pid: holder === null ? null : num(holder['pid']),
        pgid: holder === null ? null : num(holder['pgid']),
        // Not complained about when it is missing, unlike `detail` and `note`. A holder with no
        // readable command is still shown, named by its pid, and the row says the command was not
        // recorded — one more printed line per sweep would be noise about a field that only makes
        // the heading nicer.
        command: holder === null ? null : str(holder['command']),
        note,
      })
    })
  }

  const skipped: { what: string; reason: string }[] = []
  const rawSkipped = raw['skipped']
  if (rawSkipped !== undefined && !Array.isArray(rawSkipped)) {
    problems.push(t('g6a.sessions.unclaimedSkippedIsPresentButIsNotA'))
  } else if (Array.isArray(rawSkipped)) {
    rawSkipped.forEach((entry, i) => {
      const what = isObj(entry) ? str(entry['what']) : null
      const reason = isObj(entry) ? str(entry['reason']) : null
      // Both halves or neither: "something was left out" with no reason is the shape of the
      // silence this whole block exists to break.
      if (what === null || reason === null) {
        problems.push(t('g6a.sessions.unclaimedSkippedDoesNotSayBothWhatWas', { value1: (i) }))
        return
      }
      skipped.push({ what, reason })
    })
  }

  return {
    summary,
    resources,
    skipped,
    searched: readLines(raw['searched'], 'unclaimed.searched', problems),
    unchecked: readLines(raw['unchecked'], 'unclaimed.unchecked', problems),
  }
}

/** Everything still running that nothing owns, read against the release contract. */
export function readOrphansPayload(raw: unknown): OrphansRead {
  const problems: PanelProblem[] = []
  const orphans: Orphan[] = []

  if (!isObj(raw)) {
    return {
      orphans,
      searched: [],
      warning: null,
      unclaimed: null,
      problems: [t('g6a.sessions.theServerRepliedWithNotAnObject', { value1: (typeof raw) })],
    }
  }

  const rawOrphans = raw['orphans']
  if (rawOrphans === undefined) {
    problems.push(
      t('g6a.sessions.theReplyHasNoOrphansKeyNothingIs'),
    )
  } else if (!Array.isArray(rawOrphans)) {
    problems.push(t('g6a.sessions.orphansIsPresentButIsNotAList'))
  } else {
    rawOrphans.forEach((entry, i) => {
      const where = `orphans[${i}]`
      if (!isObj(entry)) {
        problems.push(t('g6a.sessions.isNotAnObject', { value1: (where) }))
        return
      }
      const id = str(entry['id'])
      const describe = str(entry['describe'])
      const kind = str(entry['kind'])
      if (id === null || describe === null) {
        const raw = JSON.stringify(entry).slice(0, 200)
        problems.push(aProblemWithItsRawEntry(
          t('g6a.sessions.hasNoSoItCannotBeNamedOn', { value1: (where), value2: (id === null ? 'id' : '`describe`'), value3: (raw) }),
          raw,
        ))
        return
      }
      if (kind === null || !(ORPHAN_KINDS as readonly string[]).includes(kind)) {
        problems.push(
          t('g6a.sessions.hasKindWhichIsNotOneOfIt', { value1: (where), value2: (describe), value3: (JSON.stringify(entry['kind'])), value4: (ORPHAN_KINDS.join(', ')) }),
        )
        return
      }

      // The age is not load-bearing for the kill decision, so a missing one does not hide a live
      // process — it is printed as missing and complained about separately.
      const rawAge = entry['ageSeconds']
      let ageSeconds: number | null = null
      if (typeof rawAge === 'number' && Number.isFinite(rawAge) && rawAge >= 0) {
        ageSeconds = rawAge
      } else if (rawAge !== undefined && rawAge !== null) {
        problems.push(t('g6a.sessions.hasAgesecondsWhichIsNotADurationIn', { value1: (where), value2: (describe), value3: (JSON.stringify(rawAge)) }))
      } else {
        problems.push(t('g6a.sessions.reportsNoAgesecondsSoHowLongItHas', { value1: (where), value2: (describe) }))
      }

      orphans.push({
        id,
        kind: kind as OrphanKind,
        describe,
        ageSeconds,
        sessionId: str(entry['sessionId']),
        sessionTitle: str(entry['sessionTitle']),
        releaseAction: readReleaseAction(entry['releaseAction'], kind as OrphanKind, describe, problems),
      })
    })
  }

  return {
    orphans,
    searched: readSearched(raw['searched']),
    warning: str(raw['warning']),
    unclaimed: readUnclaimed(raw['unclaimed'], problems),
    problems,
  }
}

/**
 * Read the reply to a release, and refuse to call it a success unless the server said so.
 *
 * A 200 with nothing usable in it is not proof that anything died. After four occurrences on this
 * project of an orphan that looked dead and was not, the only acceptable confirmation is the one
 * from the process that ran the kill, in its own words.
 */
export function readReleaseReply(raw: unknown, orphan: Orphan): ReleaseReport {
  const body = isObj(raw) ? raw : {}
  if (body['released'] !== true) {
    throw new ApiError(
      200,
      t('g6a.release.notConfirmed', {target: orphan.describe, reply: JSON.stringify(raw).slice(0, 300)}),
    )
  }
  const describe = str(body['describe']) ?? str(body['description'])
  if (describe === null) {
    throw new ApiError(
      200,
      t('g6a.release.notDescribed', {target: orphan.describe}),
    )
  }

  let killed: string[] | null = null
  const rawKilled = body['killed']
  if (Array.isArray(rawKilled)) {
    killed = rawKilled.map((k) => str(k)).filter((k): k is string => k !== null)
  }

  return { describe, killed, outcome: str(body['outcome']) }
}

// ============================================================================ order

/**
 * Crashed first, then orphaned, paused, running, idle, unknown, finished; newest output first inside each.
 *
 * `orphaned` sits next to `crashed` because it means a session ended without saying so AND left
 * something running — the failure that has cost this project the most. `unknown` is quiet: not
 * knowing is not the same as being wrong.
 *
 * The order is the one the server sorts by (OBSERVED_SESSION_STATES). It is written out here
 * because that list does not take a `SessionView`. lib/attention.ts had a third copy, `sortSessions`,
 * which nothing called; it was deleted, so this and the server's are the two left.
 */
const STATE_RANK: Record<SessionState, number> = {
  crashed: 0,
  orphaned: 1,
  paused: 2,
  running: 3,
  idle: 4,
  unknown: 5,
  finished: 6,
}

export function sortSessionViews<T extends SessionView>(sessions: readonly T[], now: number): T[] {
  return [...sessions].sort((a, b) => {
    if (STATE_RANK[a.state] !== STATE_RANK[b.state]) return STATE_RANK[a.state] - STATE_RANK[b.state]
    const at = a.lastOutputAt === null ? 0 : (stampMs(a.lastOutputAt) ?? 0)
    const bt = b.lastOutputAt === null ? 0 : (stampMs(b.lastOutputAt) ?? 0)
    if (at !== bt) return bt - at
    // A stable last resort, so two sessions with the same clock do not swap places between
    // renders and make the list look like it is moving on its own.
    return a.title.localeCompare(b.title)
  })
}

/** Parse a stored stamp to milliseconds. `now` is threaded through the view for the same
 *  reason attention.ts threads it: a component that reads the clock itself cannot be tested.
 *
 *  One line, because this used to be a hand-written copy of the same reading rule that lives in
 *  `@shared/time.ts`. It was one of seven, and a different one of the seven had drifted to UTC. */
const stampMs = parseLocalStamp

// ============================================================================ state, as a chip

/**
 * A session's state, drawn by the PRODUCT'S state chip and by nothing of this page's own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS HERE BEFORE, AND WHY IT WENT
 * ---------------------------------------------------------------------------------------
 *
 * `SESSION_CHIP` used to map the six session words onto six of the ten chips this interface
 * computes for itself, so a session state arrived on the page wearing a blue, grey, red, amber or
 * green tint and a capital letter. Home drew the same words through the record chip, as one filled
 * black block. One word, two drawings, four inches apart on two pages — which is the defect the
 * whole state pass exists to remove. So the map is deleted, and a session state is drawn exactly
 * as a state word on any other record: the shape comes from the word, through `stateDrawing`, and
 * nothing here chooses a colour.
 *
 * THE SESSION'S OWN WORD IS WHAT IS PRINTED, as it is stored. `idle` shows as "waiting for you"
 * and `orphaned` as "left running", from the product's one display table, so those two renames
 * happen once for the whole application rather than once per page.
 */
export function SessionStateChip({ state, alarm, shownAs }: { state: SessionState; alarm?: AlarmLevel; shownAs?: string }) {
  // The level is passed straight through. Without it a fortnight-old crash was drawn at the same
  // full alarm strength as one from last night, which is exactly what approved decision 2 forbids
  // -- and the row underneath it was already fading, so the chip and its own row disagreed.
  const level = alarm === undefined ? {} : { alarm }
  const words = shownAs === undefined ? {} : { shownAs }
  return <StoredState state={state} progress={progressOf(state)} kind="session" {...level} {...words} />
}

// ============================================================================ copying

export { useCopy }

export interface CommandLineProps {
  /** What the command is for, e.g. "Resume". Read out before the command itself. */
  label: string
  command: string
  /**
   * What the thing is, in the reader's words: "resume command", "log path".
   *
   * It is the noun in the mark drawn when there is no command, and it is what the copy button is
   * called to a screen reader — "copy the resume command" rather than seventy buttons all called
   * "copy" with nothing saying which one a reader has landed on.
   */
  what: string
}

/**
 * A command shown in full, in the mono face, with a copy button.
 *
 * SHOWN IN FULL, never truncated with an ellipsis. A resume command carries a session id and a
 * working directory; the half of it behind the "…" is the half that makes it the right command
 * rather than a similar one. It wraps instead, and `wrap-anywhere` is what stops a 200-character
 * path pushing the page sideways on a phone.
 */
export function CommandLine({ label, command, what }: CommandLineProps) {
  const { state, copy } = useCopy()

  if (command === '') {
    return (
      <p className="sx-cmd-missing">
        <Absence
          tier="told-apart"
          looked={false}
          word={t('g6a.sessions.no', { value1: (what) })}
          title={t('g6a.sessions.noWasRecordedForThisRunSoThere', { value1: (what) })}
        />
      </p>
    )
  }

  return (
    <div className="sx-cmd">
      <span className="sx-cmd-label">{label}</span>
      <code className="sx-cmd-text wrap-anywhere">{command}</code>
      <span className="sx-cmd-act">
        <Btn size="sm" variant="ghost" onClick={() => copy(command)} title={t('g6a.sessions.copyThe', { value1: (what), value2: (command) })}>
          {state === 'copied' ? t('g6a.sessions.copied') : state === 'failed' ? t('g6a.sessions.copyBlocked') : t('g6a.sessions.copy')}
        </Btn>
      </span>
      {state === 'failed' ? (
        <p className="sx-note-bad" role="status">
          {t('g6a.sessions.theBrowserRefusedClipboardAccessSelectTheCommand')}</p>
      ) : null}
    </div>
  )
}

// ============================================================================ orphans

/**
 * How long the thing has been alive with nothing owning it: "11d", "3h", "under a minute".
 *
 * A DURATION, not a moment — "11d" and not "11d ago". It is the chip's label, where StateChip's
 * own contract is a state "that carries a number".
 *
 * A missing age says so rather than resolving to a number. An orphan that claims to be zero
 * seconds old because the server did not send `ageSeconds` is exactly the kind of quiet nonsense
 * that gets a panel ignored.
 */
export function orphanAge(ageSeconds: number | null): string {
  if (ageSeconds === null) return t('g6a.sessions.ageUnknown')
  const elapsed = formatDuration(ageSeconds * 1000)
  return elapsed === 'just now' ? t('g6a.time.underMinute') : elapsed
}

/** Why this one has no release button. One sentence, in the row, where the button would be. */
export function whyNotReleasable(orphan: Orphan): string {
  if (orphan.kind === 'lock') {
    return (
      t('g6a.sessions.moleOfficeNeverDeletesLockFilesAndThis')
    )
  }
  return (
    t('g6a.sessions.theServerDidNotSayExactlyWhatKilling')
  )
}

/** Runs one release. Takes the phrase the reader was SHOWN, which is what gets sent as `expect`. */
export type ReleaseFn = (orphan: Orphan, expect: string) => Promise<ReleaseReport>

/**
 * What a failed release means, and whether the row is now a stale reading of the machine.
 *
 * Pulled out of the component so the policy can be tested without a browser, because it IS the
 * policy: 409 and 400 are the two answers that say "what you are looking at is not what is there
 * now", and neither is ever retried. Anything else — the server unreachable, a 500 — is reported
 * in the server's own words and also not retried, because whether the kill happened before the
 * failure is exactly what is not known.
 */
export function releaseRefusal(err: unknown): { stale: boolean; message: string } {
  const status = err instanceof ApiError ? err.status : null
  const said = errorMessage(err)
  if (status === 409) {
    return {
      stale: true,
      message:
        t('g6a.sessions.nothingWasKilledTheMachineChangedBetweenThis', { value1: (said) }),
    }
  }
  if (status === 400) {
    return {
      stale: true,
      message:
        t('g6a.sessions.nothingWasKilledTheSentenceThisPageShowed', { value1: (said) }),
    }
  }
  return { stale: false, message: said }
}

export interface ReleaseConfirmProps {
  action: ReleaseAction
  /** True while the request is in flight, so the button cannot be double-fired. */
  pending: boolean
  onConfirm: () => void | Promise<void>
}

/**
 * Everything shown before anything dies.
 *
 * THE CONFIRM PHRASE IS THE SERVER'S, VERBATIM. It is not rebuilt from the other fields and not
 * paraphrased: it is the sentence that goes back as `expect`, and the whole point of that round
 * trip is that the words on the screen are the words the server will act on.
 *
 * `alsoAffects` IS ALWAYS SHOWN, including when it is empty. Killing a process group kills its
 * children, and a person who is about to do that has to see the list first. An empty list is
 * printed as a claim — "nothing else" — because a silence there is indistinguishable from a
 * server that did not check.
 */
export function ReleaseConfirm({ action, pending, onConfirm }: ReleaseConfirmProps) {
  const affected = action.alsoAffects.length === 0
    ? t('g6a.release.onlyTarget', {target: action.target})
    : action.alsoAffects.join('\n')
  const quote = [action.confirmPhrase, [action.target, action.signal].filter(Boolean).join(' — '),
    t('g6a.release.also'), affected].join('\n\n')
  return <TieredPress tier="confirm" size="sm" disabled={pending}
    press={t('g6a.release.press')} confirm={t(action.verb === 'stop' ? 'g6a.release.stop' : 'g6a.release.kill')}
    question={t('g6a.release.question', {target: action.target})} quote={quote}
    warning={t('g6a.release.warning')} cancel={t('g6a.release.cancel')} pending={t('g6a.release.pending')}
    onPress={async () => { await onConfirm() }} />
}

export interface OrphanRowProps {
  orphan: Orphan
  onRelease: ReleaseFn
  /** Fetch the machine again. Offered after a refusal, and never called automatically. */
  onReread: () => void
}

/** Where the row is in the release sequence. Nothing destructive happens outside `working`. */
type ReleasePhase =
  | { at: 'closed' }
  | { at: 'working' }
  /** The server refused because the reading this row was built from is out of date (409/400). */
  | { at: 'stale'; message: string }
  | { at: 'failed'; message: string; fault: Fault | null }
  | { at: 'done'; report: ReleaseReport }

/**
 * One orphaned resource, with its age, and a release that asks first.
 *
 * THE AGE IS THE CHIP. It borrows the `overdue` state — a clock face, the word replaced by the
 * duration, per StateChip's own `label` contract ("for states that carry a number"). An orphan
 * IS an overdue thing: nothing is due to still be running. Putting the duration where every
 * other row in the app puts its severity is what makes "11d" catch the eye at the same instant
 * a crashed session would, and the clock silhouette says what the number is without a colour.
 *
 * The shared confirmation dialog names the target and shows the server's exact phrase and
 * affected resources. Cancel closes the question without sending a release request.
 *
 * A RESOURCE WITH NO `releaseAction` GETS NO BUTTON. Not a disabled one — none. The row says why
 * and leaves the reader with the facts to do it by hand.
 *
 * A REFUSAL IS NEVER RETRIED. 409 means the machine moved under the reading; 400 means the
 * sentence on screen is not the sentence the server would act on. Both mean this row is stale,
 * and pressing the button again against a stale row is how the wrong process gets killed. So the
 * confirmation closes and the only thing offered is a fresh read.
 */
export function OrphanRow({ orphan, onRelease, onReread }: OrphanRowProps) {
  const [phase, setPhase] = useState<ReleasePhase>({ at: 'closed' })
  const action = orphan.releaseAction
  const age = orphanAge(orphan.ageSeconds)

  if (phase.at === 'done') {
    const { report } = phase
    return (
      <li className="sx-orphan" data-done="1">
        <p className="sx-orphan-done" role="status">
          <StateGlyph state="done" /> {' '}{t('g6a.sessions.released')}{' '}{report.describe}
        </p>
        {report.outcome === null ? null : <p className="sx-orphan-meta">{report.outcome}</p>}
        {report.killed === null ? (
          <p className="sx-note-bad">
            {t('g6a.sessions.theServerDidNotListWhatElseDied')}</p>
        ) : report.killed.length === 0 ? (
          <p className="sx-orphan-meta">{t('g6a.sessions.theServerReportsNothingElseWasKilled')}</p>
        ) : (
          <ul className="sx-also-list">
            {report.killed.map((line, i) => (
              <li key={i} className="sx-also wrap-anywhere">
                {line}
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }


  return (
    <li className="sx-orphan">
      <div className="sx-orphan-head">
        <StateChip state="overdue" label={age} />
        <span className="sx-orphan-what">
          <Tag tone="warn">{ORPHAN_WORDS[orphan.kind]}</Tag>
          <code className="sx-orphan-label wrap-anywhere">{orphan.describe}</code>
        </span>
        <span className="sx-orphan-act">
          {/* No trigger at all once the server has refused. The phrase on this row is known to be
              out of date, so pressing it again would send the same stale sentence at a machine
              that has already moved — which is the retry the contract forbids. The only way on is
              a fresh read, and that is the only button left. */}
          {action === null || phase.at === 'stale' || phase.at === 'failed' ? null : (
            <ReleaseConfirm action={action} pending={phase.at === 'working'} onConfirm={async () => {
              setPhase({ at: 'working' })
              try {
                const report = await onRelease(orphan, action.confirmPhrase)
                setPhase({ at: 'done', report })
              } catch (err) {
                const refusal = releaseRefusal(err)
                setPhase(refusal.stale
                  ? { at: 'stale', message: refusal.message }
                  : { at: 'failed', message: errorMessage(err), fault: faultOf(err) })
              }
            }} />
          )}
        </span>
      </div>

      <p className="sx-orphan-meta">
        <span className="sx-orphan-from">
          {orphan.sessionTitle === null
            ? t('g6a.sessions.noSessionOnFileOwnsIt')
            : t('g6a.sessions.leftBy', { value1: (orphan.sessionTitle) })}
        </span>
      </p>

      {action === null ? <p className="sx-note-bad">{whyNotReleasable(orphan)}</p> : null}

      {phase.at === 'stale' ? (
        <div className="sx-confirm" data-stale="1">
          <p className="sx-confirm-line">{phase.message}</p>
          <div className="sx-confirm-act">
            <Btn size="sm" onClick={onReread}>
              {t('g6a.sessions.readTheMachineAgain')}</Btn>
          </div>
        </div>
      ) : null}

      {phase.at === 'failed' ? <ReleaseFailedNote message={phase.message} fault={phase.fault} onReread={onReread} /> : null}
    </li>
  )
}

/**
 * WHAT A ROW SAYS WHEN ITS RELEASE PRESS FAILED, under a label of its own (wave 13y round 142). With none it was
 * headed "Failed.", and an office that could not be reached made it say the page could not be read, under a page
 * that is drawn. Its own function, so a test draws it without pressing.
 */
export function ReleaseFailedNote({ message, fault, onReread }: { message: string; fault: Fault | null; onReread: () => void }) {
  return (
    <ErrorNote message={message} fault={fault} label={t('g6a.sessions.theReleasePressFailed')}>
      {/* No Retry button. Whether the kill happened before the failure is exactly what is not
          known here, and a second press is a second kill against an unknown machine. */}
      <Btn size="sm" onClick={onReread}>
        {t('g6a.sessions.readTheMachineAgain')}</Btn>
    </ErrorNote>
  )
}

export interface OrphanBlockProps {
  orphans: readonly Orphan[]
  onRelease: ReleaseFn
  onReread: () => void
  /** A heading that says whose orphans these are, on the page that groups them by session. */
  heading?: string
}

/**
 * Everything still running that nothing owns.
 *
 * Drawn as an alarm sub-block rather than by making the whole panel rank 0: tinting the entire
 * sessions list because one dead run left a port open would drown the running sessions in the
 * same colour, and the tint has to keep meaning "this, here".
 */
export function OrphanBlock({ orphans, onRelease, onReread, heading }: OrphanBlockProps) {
  if (orphans.length === 0) return null
  const many = orphans.length !== 1
  return (
    <section className="sx-orphans" aria-label={heading ?? t('g6a.sessions.thingsLeftRunning')}>
      <h3 data-title-is="its-label" className="sx-orphans-head">
        <StateGlyph state="overdue" />
        {heading ??
          t('g6a.sessions.orphanCount', {n: orphans.length})}
      </h3>
      <ul className="sx-orphan-list">
        {orphans.map((orphan) => (
          <OrphanRow key={orphan.id} orphan={orphan} onRelease={onRelease} onReread={onReread} />
        ))}
      </ul>
    </section>
  )
}

// ============================================================================ the tally

/**
 * All six states with their counts, above the list and never inside a scrollbox.
 *
 * This is the panel's guarantee that "is anything crashed" is answerable at 390px without
 * scrolling, no matter how many sessions there are and whatever the cap is set to. Zeros are kept
 * and drawn quieter, because "0 crashed" is a fact worth reading and a tally whose entries come
 * and go cannot be scanned in the same place twice.
 */
export function SessionTally({ sessions }: { sessions: readonly SessionView[] }) {
  return (
    <p className="sx-tally">
      {SESSION_STATES.map((state) => {
        const count = sessions.filter((s) => s.state === state).length
        return (
          <span
            key={state}
            className="sx-tally-one"
            data-zero={count === 0 ? '1' : undefined}
            // The same ink and the same shape the chips on the rows below carry, from the same two
            // tables. The tally used to borrow a state colour of its own, so the tally and the rows
            // were two drawings of one fact.
            style={{ ['--sx-tone' as string]: STATE_DRAWING_INK[stateDrawing(state)] } as React.CSSProperties}
          >
            <StateDrawingGlyph drawing={stateDrawing(state)} />
            <b>{count}</b> {shownState(state)}
          </span>
        )
      })}
    </p>
  )
}

// ============================================================================ printed problems

/** Everything a reader could not parse, printed where it belongs instead of dropped. */
export function PanelProblems({ problems }: { problems: readonly PanelProblem[] }) {
  const inspect = useInspect()
  if (problems.length === 0) return null
  if (!inspect) return <p className="sx-warning">{t('g6a.sessions.unreadableCount', {n: problems.length})}</p>
  return (
    <div className="sx-problems">
      {problems.map((problem, i) => {
        const text = typeof problem === 'string' ? problem : problem.text
        const raw = typeof problem === 'object' && 'raw' in problem ? problem.raw : null
        const href = typeof problem === 'object' && 'href' in problem ? problem.href : null
        const at = raw === null ? -1 : text.indexOf(raw)
        return (
          <p className="sx-problem" key={i}>
            <StateGlyph state="broken" />{' '}
            <span>
              {raw === null || at < 0 ? text : (
                <>
                  {text.slice(0, at)}
                  <code className="sx-raw">{raw}</code>
                  {text.slice(at + raw.length)}
                </>
              )}
            </span>
            {href === null ? null : (
              <a className="sx-all" href={`#${href}`}>
                {t('g6a.sessions.openIt')}</a>
            )}
          </p>
        )
      })}
    </div>
  )
}

/** Where the sweep looked. Folded away by default: it is the answer to a second question. */
export function SearchedNote({ searched }: { searched: readonly string[] }) {
  const inspect = useInspect()
  if (!inspect || searched.length === 0) return null
  return (
    <details className="sx-searched">
      <summary>{t('g6a.sessions.whereMoleOfficeLooked', { value1: (searched.length) })}</summary>
      <ul className="sx-searched-list">
        {searched.map((line, i) => (
          <li key={i} className="wrap-anywhere">
            {line}
          </li>
        ))}
      </ul>
    </details>
  )
}

/**
 * NOTHING ON FILE, SAID ONCE.
 *
 * Three surfaces could draw an empty sessions list — the home preview, the old home panel and
 * SessionsPage — and each used to carry its own paragraph about the same fact. Two of them
 * disagreed about what Mole Office reads (one said "records of kind session with data.state set to
 * running, idle, finished, crashed, orphaned or unknown", the other said "records of kind session"),
 * and nothing made them agree: rewording one left the other saying something else with no type
 * error, no failing test and no visible symptom. This one component took their place. The two
 * panels were removed in wave 13y round 32, and SessionsPage is the one surface that draws it.
 *
 * It says its sentence, since the empty page is the whole answer and a dash with its reason on the hover said
 * nothing a phone can read (wave 13y round 142). `searched` is taken and not drawn.
 */
export function NoSessionsNote({ searched = null }: { searched?: readonly string[] | null }) {
  return <p className="sx-empty"><Absence say title={t('g6a.sessions.none')} /></p>
}

// ============================================================================ what was WRITTEN
/**
 * ---------------------------------------------------------------------------------------
 * WHY THIS VIEW READS THE SESSION RECORDS AS WELL AS THE SESSIONS API
 * ---------------------------------------------------------------------------------------
 *
 * GET /api/sessions answers ONE question and answers it well: what is true of this session right
 * now. It re-derives the state on every request, which is why a stored `running` cannot go on
 * showing green for a run that died at 3 a.m.
 *
 * It cannot answer a second question, and this page is required to: WAS A STATE EVER WRITTEN DOWN,
 * AND WHICH WORD. Measured against the seeded workspace on 9 August 2026, GET /api/sessions returns
 * thirteen sessions in state `unknown`. Nine of them are records that carry no `state` at all —
 * nobody ever said anything — and four are records that say `unknown`, which is somebody looking
 * and reporting that they could not tell. `viewFromRecord` in src/server/lib/sessions.ts turns both
 * into the word `unknown`, and the only thing that still tells them apart is the English sentence
 * in `stateReason`. Reading that sentence to decide which is which is exactly the free-text
 * inference approved decision 4 forbids.
 *
 * So the records are read too, and ONE field is taken from them as authority: `data.state`, exactly
 * as written. Not for liveness — liveness stays with the API, and where the two disagree the row
 * shows both and says so — but for provenance: a word somebody wrote, a word nobody classified, or
 * no word at all. That is the three-way answer this page has to draw, and it comes from a stored
 * field classified by the shared contract rather than from prose.
 *
 * One more field comes along with it because it is on the record and nothing else serves it:
 * `detail`, "how it ended, in the words the exit gave you". It is the single most useful line under
 * a crashed run — "exit 137, out of memory while collating the force tables" — and until this view
 * existed no screen showed it.
 *
 * `workspace` USED TO BE READ HERE TOO AND IS NOT ANY MORE. It comes on the session row now, from
 * the server, with `from` saying whether the directory was observed in the log or only written on
 * the record — see `SessionWorkspace`. Reading it here as well would be two answers to one question
 * with nothing making them agree.
 */

/** The fields this view takes from a `session` record. Everything else comes from the API. */
export interface SessionRecordFacts {
  /** `data.state` exactly as written. Null when the record carries no state word. */
  state: string | null
  /** How it ended, in the words the exit gave you. */
  detail: string | null
  /** The next try of a wait on a usage limit more than an hour long, from `data.waitingOnALimit`. Absent when there is none. */
  waitsLongUntil?: string
}

/** Read the three fields off every `session` record, keyed by record id. */
export function readSessionRecordFacts(records: readonly PanelRecord[]): Map<string, SessionRecordFacts> {
  const facts = new Map<string, SessionRecordFacts>()
  for (const record of records) {
    if (record.kind !== 'session') continue
    const data = isObj(record.data) ? record.data : {}
    const waitsLongUntil = theNextTryOfALongWait(data)
    facts.set(record.id, { state: str(data['state']), detail: str(data['detail']), ...(waitsLongUntil === null ? {} : { waitsLongUntil }) })
  }
  return facts
}

/**
 * What was written down about this session's state — five answers, and none of them is a guess.
 *
 * `unread` is the one that is easy to leave out and must not be: when the records could not be
 * fetched, "nobody wrote a state" and "nobody asked" would otherwise be drawn identically, and this
 * page would report a gap in somebody's record that is really a gap in its own reading.
 */
export type WrittenState =
  /** A word Mole Office classifies, with what the shared contract says it means. */
  | { kind: 'classified'; word: string; progress: Progress }
  /** A word nobody has classified. A question for a person, never a verdict. */
  | { kind: 'unclassified'; word: string }
  /** A record exists and carries no state word at all. */
  | { kind: 'none' }
  /** No `session` record exists: this run was found on disk and never filed. */
  | { kind: 'no-record' }
  /** The records were not read, so nothing here can say. */
  | { kind: 'unread' }

export function writtenStateOf(recordId: string | null, facts: Map<string, SessionRecordFacts> | null): WrittenState {
  if (facts === null) return { kind: 'unread' }
  if (recordId === null) return { kind: 'no-record' }
  const found = facts.get(recordId)
  // A record id the records list does not contain. Not "no state": the record may simply not have
  // been in the answer, and saying nothing was written would be this view inventing the gap.
  if (found === undefined) return { kind: 'unread' }
  if (found.state === null) return { kind: 'none' }
  const progress = progressOf(found.state)
  if (progress === null || progress === 'unclassified') return { kind: 'unclassified', word: found.state }
  return { kind: 'classified', word: found.state, progress }
}

/** One session, as this page reads it: what is observable now, plus what was written down. */
export interface SessionLine extends SessionView {
  written: WrittenState
  /** How it ended, from the record. Null when nobody wrote it. */
  detail: string | null
  /**
   * The next try of a wait on a usage limit more than an hour long, which the row draws in place of
   * "running". Absent unless the run is observed running and its record holds such a wait.
   */
  waitsLongUntil?: string
}

/** Join the API's answer to the records. `facts` is null when the records were not read. */
export function joinSessionRecords(
  sessions: readonly SessionView[],
  facts: Map<string, SessionRecordFacts> | null,
): SessionLine[] {
  return sessions.map((session) => {
    const found = session.recordId === null ? undefined : facts?.get(session.recordId)
    const waitsLongUntil = session.state === 'running' ? found?.waitsLongUntil : undefined
    return {
      ...session,
      written: writtenStateOf(session.recordId, facts ?? null),
      detail: found?.detail ?? null,
      ...(waitsLongUntil === undefined ? {} : { waitsLongUntil }),
    }
  })
}

// ============================================================================ placing a session
/**
 * ---------------------------------------------------------------------------------------
 * WHICH PIPELINE OR MODULE A RUN BELONGS TO — THE RULE IS THE SERVER'S, AND IT IS SERVED
 * ---------------------------------------------------------------------------------------
 *
 * The sessions page used to be grouped by state alone. That answers "what died last night" and
 * nothing else: seventy-three open runs in six state groups is one long list whichever way you cut
 * it, because the state word says what happened and never says what it happened TO. So the first
 * question a group heading answers is WHICH PIECE OF WORK the run belongs to, and the state word
 * is the second question, asked inside it.
 *
 * THAT RULE USED TO LIVE HERE, and this file is where six agents had to come to read it. It
 * decides what a page shows, so a copy in a React component is a rule that no endpoint serves, no
 * schema mentions and no error message names — and an agent recording its own work through the API
 * could not find out where that work would appear without opening this file. It is in
 * `src/server/lib/sessions.ts` now, it comes back on every row of GET /api/sessions as `placement`,
 * and the rule itself comes back beside it as `placementRule`.
 *
 * WHAT THIS FILE STILL DOES: read that answer defensively, like everything else here, and draw it.
 * `readPlacement` below rejects anything it cannot read and prints a line saying so, and a row
 * whose placement could not be read is drawn as unassigned rather than as confidently placed —
 * which is the same rule this whole reader follows, applied to the one field a page cannot check.
 */

/** The empty answer: nothing was read, so nothing is claimed. */
export const NO_PLACEMENT_READ: PlacementReading = {
  rule: '',
  projects: 0,
  blocks: 0,
  links: 0,
  changes: 0,
  changesCapped: false,
}

/**
 * What a row means when the server did not send a placement it could read.
 *
 * Never a confident placement, and never silence either: the sentence says the page could not read
 * the answer, which is a different thing from the server saying the run is unplaced.
 */
function unreadablePlacement(): Placement {
  return {
    kind: 'unassigned',
    reason: { why: 'nothing-read' },
    sentence:
      t('g6a.sessions.moleOfficeCouldNotReadWhereThisRun'),
    howToPlace: '',
  }
}

/** Every placement on the rows, keyed by session id, for the grouping below. */
export function placementsOf(lines: readonly SessionLine[]): Map<string, Placement> {
  return new Map(lines.map((line) => [line.id, line.placement]))
}

// ============================================================================ grouping sessions
/**
 * ---------------------------------------------------------------------------------------
 * WHAT THE GROUPS ARE, AND WHY THESE
 * ---------------------------------------------------------------------------------------
 *
 * Sixty-six sessions drawn as sixty-six identical cards is the page this replaces: 13,914px at
 * 1440 and no shape at all, so a crashed run last night reads exactly like a run that finished a
 * fortnight ago. The groups below are not a new vocabulary — every one of them is keyed on the
 * OBSERVED state word, which is the vocabulary the server already publishes — and the heading is
 * that word written as a sentence about what it demands of you.
 *
 * The three splits that are not simply the state word are the three the data forces:
 *
 *   `finished` splits on WHO SAID SO. A record that says `finished` is a person's statement.
 *   Nothing else in this product may be folded away by default, and a run that has merely gone
 *   quiet is not a run somebody said was done — the adapter for the only tool Mole Office reads NEVER
 *   reports `finished` for exactly that reason (see src/server/lib/adapters/claude-code.ts).
 *
 *   `unknown` splits on WHETHER ANYBODY WROTE ANYTHING. Recorded as `unknown` is a judgement;
 *   no state word at all is a gap. Nine and four in the seeded workspace, and collapsing them
 *   would turn "nobody has said" into "somebody looked and could not tell".
 *
 *   `unknown` with the records unread is its own answer again, because a page that cannot make
 *   that split must say so rather than pick one.
 *
 * NOTHING HERE IS RANKED ACROSS GROUPS. A crashed run and an idle run are two different demands,
 * not two heights of the same one, and the group ordering is the order the questions get asked.
 */

export const SESSION_GROUP_KEYS = [
  'crashed',
  'orphaned',
  'paused',
  'idle',
  'running',
  'unknown-judged',
  'no-state',
  'unclassified',
  'unknown-unread',
  'finished-unwritten',
  'finished-written',
] as const
export type SessionGroupKey = (typeof SESSION_GROUP_KEYS)[number]

export interface SessionGroupSpec {
  key: SessionGroupKey
  /** The heading, as a phrase that reads after a count: "7 crashed". */
  label: string
  /**
   * A PERSON wrote down that this work is done. Exactly one group answers true.
   *
   * IT USED TO BE CALLED `folded` AND IT USED TO DECIDE THE FOLD. It does not any more — the band
   * does, see `BAND_OF` — and a field that says "folded" while nothing reads it for folding is the
   * kind of stale name that has already cost this codebase a wrong diagnosis. What it records is
   * the fact that made it the folded one, and that fact is still needed: `unknown` is a judgement
   * rather than an ending, a record with no state word is a gap somebody can close, and a tool
   * calling a run finished is not a person saying so. The `ended` band holds all four, and this is
   * what lets the fold say which of them anybody actually confirmed.
   */
  humanConfirmedFinished: boolean
}

export const SESSION_GROUPS: readonly SessionGroupSpec[] = [
  {
    key: 'crashed',
    get label() { return t('g6a.sessions.crashed') },
    humanConfirmedFinished: false,
  },
  {
    key: 'orphaned',
    get label() { return t('g6a.sessions.endedWithoutSayingSoAndLeftSomethingRunning') },
    humanConfirmedFinished: false,
  },
  {
    // Criterion W6: stopped on purpose by a shutdown of Mole Office. It does not resume by itself.
    key: 'paused',
    get label() { return t('w13t.sessions.paused') },
    humanConfirmedFinished: false,
  },
  {
    key: 'idle',
    get label() { return t('g6a.sessions.idle') },
    humanConfirmedFinished: false,
  },
  {
    key: 'running',
    get label() { return t('g6a.sessions.running') },
    humanConfirmedFinished: false,
  },
  {
    key: 'unknown-judged',
    get label() { return t('g6a.sessions.recordedAsUnknown') },
    humanConfirmedFinished: false,
  },
  {
    key: 'no-state',
    get label() { return t('g6a.sessions.withNoStateEverWritten') },
    humanConfirmedFinished: false,
  },
  {
    key: 'unclassified',
    get label() { return t('g6a.sessions.carryingAStateWordNobodyHasClassified') },
    humanConfirmedFinished: false,
  },
  {
    key: 'unknown-unread',
    get label() { return t('g6a.sessions.moleOfficeCannotPlace') },
    humanConfirmedFinished: false,
  },
  {
    key: 'finished-unwritten',
    get label() { return t('g6a.sessions.reportedFinishedWithNobodyHavingWrittenItDown') },
    humanConfirmedFinished: false,
  },
  {
    key: 'finished-written',
    // Reads after a count, AT EVERY COUNT: "28 written down as finished", and "1 written down as
    // finished". It read "N sessions somebody wrote down as finished", which is the only label here
    // carrying a noun of its own, and every group of one printed "1 sessions somebody wrote down as
    // finished" — on a group heading and on the ended fold's summary, both from this one string
    // (and in the home preview's hidden count, until wave 13y round 32 removed the preview). The
    // noun is what the count already supplies. Round 131 took out "by a person": the group takes
    // every record whose state word is finished, and an agent may write that word.
    get label() { return t('g6a.sessions.writtenDownAsFinishedByAPerson') },
    humanConfirmedFinished: true,
  },
]

/** Which group one session belongs to. Observed state first; the three splits are read from the record. */
export function sessionGroupKey(line: SessionLine): SessionGroupKey {
  switch (line.state) {
    case 'crashed':
      return 'crashed'
    case 'orphaned':
      return 'orphaned'
    case 'paused':
      return 'paused'
    case 'idle':
      return 'idle'
    case 'running':
      return 'running'
    case 'finished':
      // The record's own word, and nothing else. A `finished` that nobody wrote down stays visible.
      return line.written.kind === 'classified' && line.written.word === 'finished'
        ? 'finished-written'
        : 'finished-unwritten'
    case 'unknown':
      if (line.written.kind === 'unread') return 'unknown-unread'
      if (line.written.kind === 'unclassified') return 'unclassified'
      // No record at all is the same answer as a record with no state: nobody ever wrote one.
      if (line.written.kind === 'none' || line.written.kind === 'no-record') return 'no-state'
      return 'unknown-judged'
    default: {
      const unhandled: never = line.state
      throw new Error(`sessionGroupKey: no group for session state ${String(unhandled)}`)
    }
  }
}

export interface SessionGroup {
  spec: SessionGroupSpec
  lines: SessionLine[]
}

/**
 * Every session in exactly one group, in reading order, empty groups left out.
 *
 * An empty group is left out rather than drawn as "0 crashed", and that is not the tally's rule:
 * the tally above the list keeps every state word whether or not it has anything in it, so "0
 * crashed" is still answerable in a fixed place. A heading with nothing under it is a different
 * thing — it is a promise of content — and eight of them would be most of this page.
 */
export function groupSessions(lines: readonly SessionLine[], now: number): SessionGroup[] {
  const byKey = new Map<SessionGroupKey, SessionLine[]>()
  for (const line of lines) {
    const key = sessionGroupKey(line)
    const list = byKey.get(key)
    if (list === undefined) byKey.set(key, [line])
    else list.push(line)
  }
  return SESSION_GROUPS.filter((spec) => (byKey.get(spec.key)?.length ?? 0) > 0).map((spec) => ({
    spec,
    // Newest output first inside a group: within one demand, the run that spoke most recently is
    // the one still worth acting on. sortSessionViews already does this and is reused whole.
    lines: sortSessionViews(byKey.get(spec.key) ?? [], now),
  }))
}

// ============================================================================ the three bands
/**
 * ---------------------------------------------------------------------------------------
 * HOW PROMINENT A STATE GROUP IS, WHICH IS A DIFFERENT QUESTION FROM WHAT IT MEANS
 * ---------------------------------------------------------------------------------------
 *
 * Ten state groups drawn at one prominence is ten headings a reader has to rank for themselves,
 * every time. The three bands below do that ranking once, and they are the order the page is in:
 *
 *   `action` — it died, or it ended and left something running. Open, and first.
 *   `alive`  — it is working, or it is waiting. Open, and compact: nothing here has failed, and the
 *              page says so rather than making a reader work it out from four rows of prose.
 *   `ended`  — nothing in here is asking for anything today. Folded, with its count and the named
 *              state groups on the fold.
 *
 * `idle` IS IN `alive`, NOT IN `action`, AND THAT IS A JUDGEMENT WORTH ARGUING WITH. The shared
 * contract classifies `idle` as stopped short, and by the attention rule it therefore needs a
 * person. What it does NOT need is the same prominence as a run that died: an idle run is alive and
 * its own row carries the recorded reason it is waiting. So it sits with `running`, above the fold,
 * one press from everything — and the alarm scale still draws it at its own age.
 *
 * `ended` IS NOT "FINISHED". Three of the groups in it are records that stop without an ending —
 * `unknown`, no state word at all, a word nobody has classified — and folding them together with
 * the ones somebody wrote down as finished would be exactly the inference this page exists to
 * refuse. They are folded together and drawn apart, each with its own heading and its own count,
 * and the fold names all of them before it is opened.
 */
export const SESSION_BANDS = ['action', 'alive', 'ended'] as const
export type SessionBand = (typeof SESSION_BANDS)[number]

export const BAND_OF: Readonly<Record<SessionGroupKey, SessionBand>> = {
  crashed: 'action',
  orphaned: 'action',
  // A paused run waits for a person: it never resumes by itself (criterion W6 and question 2 of the plan).
  paused: 'action',
  idle: 'alive',
  running: 'alive',
  'unknown-judged': 'ended',
  'no-state': 'ended',
  unclassified: 'ended',
  'unknown-unread': 'ended',
  'finished-unwritten': 'ended',
  'finished-written': 'ended',
}

/**
 * The heading each band carries. Said once per band, never per row.
 *
 * THERE IS NO LONGER A SENTENCE UNDER THE HEADING. Each band used to carry a `what` paragraph and
 * only the `ended` one was ever drawn; where it was drawn, the paragraph immediately under it says
 * the same thing with this group's own numbers in it ("1 of these 4 carry the word finished on the
 * record, written by a person. The other 3 do not…"). A measured sentence and an unmeasured one
 * saying the same thing are two places that must agree with nothing making them agree, so the
 * unmeasured one went. The claim it carried — going quiet is not somebody confirming anything — is
 * open on the page above every fold, in `SessionsView`'s arithmetic.
 */
export const BAND_WORDS: Readonly<Record<SessionBand, { label: string }>> = {
  action: { get label() { return t('g6a.sessions.needYou') } },
  alive: { get label() { return t('g6a.sessions.aliveRightNow') } },
  ended: { get label() { return t('g6a.sessions.endedOrNobodyEverSaid') } },
}

export interface BandGroup {
  band: SessionBand
  groups: SessionGroup[]
  count: number
}

/** One pipeline or module, with every run placed under it, in bands and then in state groups. */
export interface ProjectSessions {
  /** Null is the unassigned group: no recorded relationship places these runs anywhere. */
  project: ProjectRef | null
  lines: SessionLine[]
  bands: BandGroup[]
  counts: Readonly<Record<SessionBand, number>>
}

/** Sum a band's rows, so a heading and a fold can never disagree about how many are inside. */
function bandCounts(bands: readonly BandGroup[]): Record<SessionBand, number> {
  const counts: Record<SessionBand, number> = { action: 0, alive: 0, ended: 0 }
  for (const band of bands) counts[band.band] = band.count
  return counts
}

/**
 * Every session under the pipeline or module it belongs to, and the rest under one honest heading.
 *
 * THE ORDER IS HOW MUCH EACH GROUP NEEDS A PERSON, and the unassigned group takes its place in that
 * order like any other. Sorting it to the bottom for being untidy would put the crashed runs of the
 * biggest group at the foot of the page, which is the one thing the prominence order forbids.
 * `Unassigned sessions` is a name, not a rank.
 */
export function projectSessions(
  lines: readonly SessionLine[],
  placements: ReadonlyMap<string, Placement>,
  now: number,
): ProjectSessions[] {
  const byProject = new Map<string, { project: ProjectRef | null; lines: SessionLine[] }>()
  for (const line of lines) {
    const placement = placements.get(line.id)
    const project = placement !== undefined && placement.kind === 'in' ? placement.primary.project : null
    const key = project === null ? '' : project.id
    const found = byProject.get(key)
    if (found === undefined) byProject.set(key, { project, lines: [line] })
    else found.lines.push(line)
  }

  const groups = [...byProject.values()].map((entry) => {
    const stateGroups = groupSessions(entry.lines, now)
    const bands: BandGroup[] = SESSION_BANDS.map((band) => {
      const inBand = stateGroups.filter((group) => BAND_OF[group.spec.key] === band)
      return { band, groups: inBand, count: inBand.reduce((sum, group) => sum + group.lines.length, 0) }
    }).filter((band) => band.count > 0)
    return { project: entry.project, lines: entry.lines, bands, counts: bandCounts(bands) }
  })

  return groups.sort((a, b) => {
    const need = b.counts.action - a.counts.action || b.counts.alive - a.counts.alive || b.lines.length - a.lines.length
    if (need !== 0) return need
    // Deterministic last resort, so two groups that need a person equally never swap places between
    // renders. The unassigned group has no title and sorts under the empty string.
    const left = a.project?.title ?? ''
    const right = b.project?.title ?? ''
    return left < right ? -1 : left > right ? 1 : 0
  })
}

/**
 * How loudly one session row is drawn — approved decision 2, through the shared alarm scale.
 *
 * `ageAlarm` is ui.tsx's and the only thing decided here is what to feed it: a session is never a
 * safety row and never has an agreed date, so the stamp of its last output is the whole input. A
 * crash from last night is `raised`, a crash from a fortnight ago is `faded`, and the number beside
 * it is what says which. A run that is working, finished or undetermined gets no level at all.
 *
 * This used to hold its own two lines of `alarmFor` call. The records list needed the same fallback
 * and would have become a second copy of them, so the fallback moved into ui.tsx beside the scale.
 */
export function sessionAlarm(line: SessionLine, now: number): AlarmLevel | undefined {
  return ageAlarm(progressOf(line.state), line.lastOutputAt, now)
}

/** One sentence several rows share, and how many of them say it. */
export interface SharedNote {
  /** One row's sentence, in full, as the example. Never rewritten and never stitched together. */
  sentence: string
  count: number
  /**
   * True when the rows sharing this sentence differ in the NUMBERS inside it.
   *
   * Said out loud when the note is printed — "with a different number in each" — because quoting
   * one row's "its log last grew 3d ago" as though it covered nine rows would be a claim about
   * eight rows that nobody made.
   */
  varies: boolean
}

/**
 * Two sentences are the same sentence with different numbers in them.
 *
 * A structural comparison and NOT a reading of the text: every run of digits becomes a `#` and the
 * rest must match exactly. It exists because the server's per-row sentence is a formula with one
 * measurement in it — "no process names this session and its log last grew 3d ago. Claude Code
 * writes no end-of-session marker, so there is no evidence it finished" — and on a real machine
 * that is thirty-seven sentences no two of which are equal and all of which are the same sentence.
 * Comparing them raw put twenty-six lines of near-identical grey text at the head of one group,
 * which is the defect this page was rebuilt to remove, moved rather than fixed.
 *
 * The measurement itself is not lost: it is on the row already, in the right-hand clock, and the
 * row's own full sentence is one press away.
 */
export function sentenceShape(sentence: string): string {
  return sentence.replace(/\d+/g, '#')
}

/**
 * THE FIX FOR THE MEASURED DEFECT: a sentence more than one row says is said once, with its count.
 *
 * The page this replaces printed the server's `stateReason` under every session. Every session in
 * the seeded workspace is filed by hand, so that paragraph — "this session was filed by hand and
 * says it is "finished". There is no log path on the record, so nothing on disk was checked" — was
 * on screen sixty-six times, with only the quoted word differing.
 *
 * IT IS NOT BOILERPLATE THE SERVER SHOULD STOP SENDING. On a machine with live logs it says
 * something different and useful on nearly every row, and this page has both kinds in it at once:
 * the seven crashed runs share one sentence, and the thirty-seven orphaned ones share three between
 * them. So it is MEASURED, not assumed and not all-or-nothing. Every sentence two or more rows
 * share is reported here with the number of rows it covers.
 *
 * IT USED TO RETURN A SECOND THING — `place`, saying whether each row should print its own sentence
 * on the row, keep silent because the head had already said it word for word, or put its own copy
 * in its fold. That existed because the row printed its reason AT REST, so two copies of one
 * sentence were possible. A row is now one line and its own sentence is always inside its own fold,
 * where it can never be a second copy of anything. The map went with the reason for it: a returned
 * value nothing reads is the next reader's wrong assumption.
 */
export function groupNotes(
  lines: readonly SessionLine[],
  read: (line: SessionLine) => string | null,
): { shared: SharedNote[] } {
  const byShape = new Map<string, { sentences: string[] }>()
  for (const line of lines) {
    const sentence = read(line)
    if (sentence === null) continue
    const shape = sentenceShape(sentence)
    const found = byShape.get(shape)
    if (found === undefined) byShape.set(shape, { sentences: [sentence] })
    else found.sentences.push(sentence)
  }
  const shared: SharedNote[] = [...byShape.values()]
    .filter((entry) => entry.sentences.length > 1)
    .map((entry) => ({
      sentence: entry.sentences[0] ?? '',
      count: entry.sentences.length,
      varies: new Set(entry.sentences).size > 1,
    }))
    // Most-said first: the sentence that covers the most rows is the one worth reading first.
    .sort((a, b) => b.count - a.count || (a.sentence < b.sentence ? -1 : 1))
  return { shared }
}

/** How many shared sentences the head prints before the rest are folded, with their count. */
export const GROUP_NOTES_SHOWN = 3

// ============================================================================ how long a group runs
/**
 * ---------------------------------------------------------------------------------------
 * A STATE GROUP MAY BE SUMMARISED AND FOLDED. THE THREE CONDITIONS THAT MAKE THAT ALLOWED
 * ---------------------------------------------------------------------------------------
 *
 * Ninety-one of the hundred and one runs on this machine are Unassigned, so the group that is
 * honest about not knowing where a run belongs is also the group that sets the length of the page:
 * thirty-seven orphaned runs under one heading is two thousand pixels of one state word.
 *
 * The standing rule in this product is that a shortened list says exactly how much it is not
 * showing, NAMES what is in the part it is not showing, and offers a way to all of it. Three
 * conditions, all three met here:
 *
 *   THE EXACT COUNT STAYS VISIBLE. The group heading above the rows carries the whole number, and
 *   the fold carries the number inside it. Neither is ever the word "more".
 *
 *   THE COMPOSITION IS NAMED. `namedTools` says which agent tools the folded rows came from, with
 *   counts that add up to the fold, and `quietSpan` says how long ago the oldest and newest of them
 *   last spoke. Both are measured off the rows themselves.
 *
 *   EVERY ROW IS REACHABLE. The fold is a native `<details>` holding the real rows, in the same
 *   order, drawn by the same component. Opening it is one press and nothing is fetched again.
 *
 * WHICH ROWS STAY OPEN. The first six in the order the group is already sorted in, which is newest
 * output first — so what stays on screen is what spoke most recently, and that is the half of "what
 * happened while I was away" a person can still act on.
 */

/**
 * How many rows one state group draws before the rest go behind a fold.
 *
 * SIX, and the reason is the page rather than taste. On this machine six rows covers the last
 * twelve days of the busiest group, which is longer than any absence this product was written for —
 * the two questions it exists to answer are "what needs me today" and "what happened while I was
 * away". Bigger, and one group starts setting the length of the page again, which is the failure
 * this constant is for. Smaller, and a fortnight away stops fitting above the fold.
 */
export const ROWS_BEFORE_FOLD = 6

/** A group split into what stays open and what goes behind the fold. */
export interface GroupFold {
  shown: SessionLine[]
  folded: SessionLine[]
}

/**
 * Split a group at the limit, keeping the order it arrived in.
 *
 * A group of exactly limit + 1 is NOT folded: hiding one row behind a control that costs a line to
 * draw saves nothing and makes a reader press something to see a single session.
 */
export function foldPastLimit(lines: readonly SessionLine[], limit: number = ROWS_BEFORE_FOLD): GroupFold {
  if (lines.length <= limit + 1) return { shown: [...lines], folded: [] }
  return { shown: lines.slice(0, limit), folded: lines.slice(limit) }
}

/**
 * Which agent tools the rows came from, with counts that add up to the list.
 *
 * The composition half of what makes a fold allowed. A tool is a stored field on the run, not a
 * reading of its title, and a run whose tool the server did not send is counted as its own answer
 * rather than dropped into the biggest bucket.
 */
export function namedTools(lines: readonly SessionLine[]): string {
  const counts = new Map<string, number>()
  let unnamed = 0
  for (const line of lines) {
    if (line.tool === null) unnamed++
    else counts.set(line.tool, (counts.get(line.tool) ?? 0) + 1)
  }
  const bits = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([tool, count]) => `${count} ${tool}`)
  if (unnamed > 0) bits.push(t('g6a.sessions.withNoToolRecorded', { value1: (unnamed) }))
  return bits.join(', ')
}

/**
 * How long ago the rows last spoke, as a span between the newest and the oldest.
 *
 * The time half of the composition. Rows with no clock are counted separately and said out loud:
 * folding a run Mole Office cannot date inside a range of dates would be this page inventing a time for
 * it, and "no clock" is one of the commonest answers on a machine full of discovered runs.
 */
export function quietSpan(lines: readonly SessionLine[], now: number): string {
  const ages: number[] = []
  let noClock = 0
  for (const line of lines) {
    const at = line.lastOutputAt === null ? null : stampMs(line.lastOutputAt)
    if (at === null) noClock++
    else ages.push(now - at)
  }
  const dated =
    ages.length === 0
      ? null
      : ages.length === 1
        ? t('g6a.sessions.itLastSpokeAgo', { value1: (formatDuration(ages[0]!)) })
        : t('g6a.sessions.theyLastSpokeBetweenAndAgo', { value1: (formatDuration(Math.min(...ages))), value2: (formatDuration(Math.max(...ages))) })
  const undated = noClock === 0 ? null : t('g6a.sessions.ofThemCarryNoClockAtAll', { value1: (noClock) })
  if (dated === null) return undated ?? t('g6a.sessions.nothingHereCarriesAClock')
  return undated === null ? dated : t('g6a.sessions.and', { value1: (dated), value2: (undated) })
}

// ============================================================================ the shape of a group
/**
 * ---------------------------------------------------------------------------------------
 * WHAT A GROUP IS MADE OF, DRAWN AS A PROPORTION RATHER THAN WRITTEN OUT AGAIN
 * ---------------------------------------------------------------------------------------
 *
 * The line under a project heading used to be prose — "91 runs — 43 need you · 10 alive right now ·
 * 38 ended, or nobody ever said" — and then every band under it repeated its own share of the same
 * numbers in its own sentence. Three statements of one arithmetic, and none of them says which
 * share is big.
 *
 * The strip is that arithmetic as a shape: one segment per state group, its width its share, in the
 * order the page is in — what needs you, what is alive, what has ended. It is the summary that makes
 * folding this group allowed, so it carries the composition rather than decorating it, and the exact
 * counts stay beside it in words for anybody who wants the number rather than the proportion.
 *
 * IT IS ONLY DRAWN WHERE THERE IS A PROPORTION. A group with one state group in it would be one
 * full-width bar of one colour, which says nothing that the heading has not already said, and a bar
 * that says nothing is the decorative chart this pass is meant to remove rather than add.
 *
 * THE INK IS NEUTRAL AND IT COMES FROM THE SAME TABLE THE CHIPS USE. `STATE_DRAWING_INK` gives each
 * drawing one of four steps, from full text colour for what is waiting on you down to a hairline
 * grey for what has ended, so the bar says how much of this group is loud. It used to take the
 * session chips' borrowed blue, grey, red, amber and green, and those tints were one of the three
 * ways one state word came out drawn differently on three pages.
 *
 * TWO GROUPS CAN SHARE A STEP, and that is why the words are not optional: the exact counts are the
 * strip's own label, its per-segment title, and every row beneath it.
 */

/** The observed state word each reading group is keyed on. The four `unknown` splits share one. */
export const GROUP_STATE: Readonly<Record<SessionGroupKey, SessionState>> = {
  crashed: 'crashed',
  orphaned: 'orphaned',
  paused: 'paused',
  idle: 'idle',
  running: 'running',
  'unknown-judged': 'unknown',
  'no-state': 'unknown',
  unclassified: 'unknown',
  'unknown-unread': 'unknown',
  'finished-unwritten': 'finished',
  'finished-written': 'finished',
}

/**
 * The strip in words: "12 crashed, 3 idle". Never a bare count.
 *
 * ONE FUNCTION FOR THREE PLACES. It is the strip's `aria-label`, it is the phrase a band head
 * prints when its state groups have no headings of their own, and it is what the `ended` fold names
 * before it is opened. It was written twice — this and a private `namedGroups` — and two copies of
 * one sentence is how this codebase has repeatedly ended up with two that disagree.
 */
export function compositionSentence(groups: readonly SessionGroup[]): string {
  return groups.map((group) => `${group.lines.length} ${group.spec.label}`).join(', ')
}

/**
 * One segment per state group, each as wide as its share. Never drawn for a single group.
 *
 * `flexGrow` is the share and it is the only number here: no width is computed, so a group of 3 and
 * a group of 300 are laid out by the same rule and neither can round to nothing — `flex-basis` is
 * held at a hairline so a segment of one row out of ninety-one is still a mark on the screen.
 */
export function CompositionStrip({ groups }: { groups: readonly SessionGroup[] }) {
  if (groups.length < 2) return null
  return (
    <span className="sx-strip" role="img" aria-label={compositionSentence(groups)}>
      {groups.map((group) => (
        <span
          key={group.spec.key}
          className="sx-strip-seg"
          title={`${group.lines.length} ${group.spec.label}`}
          style={
            {
              flexGrow: group.lines.length,
              ['--sx-tone' as string]: STATE_DRAWING_INK[stateDrawing(GROUP_STATE[group.spec.key])],
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}

// ============================================================================ one session, drawn

/**
 * THE NINE THINGS A ROW CAN OPEN ONTO, named here.
 *
 * WHY THE ROW ITSELF NO LONGER LISTS THEM. It used to: the summary read "why Mole Office says orphaned ·
 * what it was doing · how it was placed · what it was for · where it ran · the resume command · the
 * log path", which is 93 characters in a right-hand column that is sized to its content — so it
 * wrapped to two lines AND squeezed the title column until every long title wrapped to three. That
 * one string was costing about twenty-five pixels on each of ninety-one rows. Measured: the page
 * went from 7,181px to 5,072px when it came out.
 *
 * The names were said once, at the head of the page, until November 2026, when the explanations
 * were taken off the page, as decided. Each row carries the exact NUMBER of them it has.
 */
function insideRow(
  line: SessionLine,
  hasResume: boolean,
  hasLog: boolean,
  orphans: number,
  placed: boolean,
): string[] {
  const bits: string[] = []
  // `stopped_short` is the contract's word, and it is the only case where "why does it say this"
  // is a question a reader has: nothing has to explain why it is running.
  if (line.stateReason !== null || progressOf(line.state) === 'stopped_short') bits.push(t('g6a.sessions.whyMoleOfficeSays', { value1: (line.state) }))
  if (line.doing !== null) bits.push(t('g6a.sessions.whatItWasDoing'))
  if (placed) bits.push(t('g6a.sessions.howItWasPlaced'))
  if (line.purpose !== null) bits.push(t('g6a.sessions.whatItWasFor'))
  if (line.detail !== null) bits.push(t('g6a.sessions.howItEnded'))
  if (line.cwd !== null || line.workspace !== null) bits.push(t('g6a.sessions.whereItRan'))
  // Named separately from the tool tag on the scan line, because they are two different claims when
  // they differ: what observed this run, and what the record says the agent was.
  if (line.recordedAgent !== null && line.recordedAgent !== line.tool) bits.push(t('g6a.sessions.whichAgentTheRecordNames'))
  if (hasResume) bits.push(t('g6a.sessions.theResumeCommand'))
  if (hasLog) bits.push(t('g6a.sessions.theLogPath'))
  if (orphans > 0) bits.push(t('g6a.sessions.thingItLeftRunning', { n: orphans, value1: (orphans) }))
  return bits
}

export interface SessionLineRowProps {
  line: SessionLine
  now: number
  /** Where this run belongs, and how Mole Office worked it out. Drawn inside the fold. */
  placement?: Placement
  /**
   * Placement sentences the group above has already said, by shape — see `sharedPlacementNotes`.
   *
   * A row whose sentence is in here keeps silent about it. A row whose sentence is its own still
   * prints it.
   */
  groupSaidPlacement?: ReadonlySet<string>
  /** Everything this session left running, for the fold. */
  orphans?: readonly Orphan[]
  onRelease?: ReleaseFn
  onReread?: () => void
}

/**
 * One session as a row that opens into everything recorded about it.
 *
 * IT IS `ScanRow`, THE SHARED PRIMITIVE, AND NOT A ROW WITH A DISCLOSURE UNDER IT. That is the
 * change this pass made. The row used to be a `Row` whose meta cell held the state reason, the
 * `doing` line, the written-state mark and then a fold — four lines per run at rest, which at
 * seventy-three open runs is the whole page. `ScanRow` is one line closed: what it is, what is
 * wrong, how loud, how old. Everything else is inside, and the fold names it before it is opened.
 *
 * NOTHING MOVED OUT OF REACH. The reason sentence, what it was doing, what it was for, how it
 * ended, where it ran, the resume command, the log path and anything it left running are all one
 * press away and all named on the summary. The resume command is still not truncated, not
 * reformatted and not abbreviated — a command that is nearly right starts something in the wrong
 * directory and looks like it worked.
 */
export function SessionLineRow({
  line,
  now,
  placement,
  groupSaidPlacement,
  orphans = [],
  onRelease,
  onReread,
}: SessionLineRowProps) {
  const inspect = useInspect()
  const mine = orphans.filter((o) => belongsToSession(o, line))
  const hasResume = line.resumeCommand !== null
  const hasLog = line.logPath !== null
  const placed = placement !== undefined
  const inside = inspect ? insideRow(line, hasResume, hasLog, mine.length, placed)
    : [line.doing, line.purpose, line.detail].filter(value => value !== null)
  const alarm = sessionAlarm(line, now)

  return (
    <div className="sx-line" {...(line.waitsLongUntil === undefined ? {} : { 'data-waits-long': '1' })}>
      <ScanRow
        sev={<SessionStateChip state={line.state} alarm={alarm} {...(line.waitsLongUntil === undefined ? {} : { shownAs: waitingOnALimitUntil(line.waitsLongUntil) })} />}
        {...(alarm === undefined ? {} : { alarm })}
        leading={
          <>
            {inspect && line.tool !== null ? <Tag tone="quiet">{line.tool === NO_ADAPTED_TOOL ? t('g6a.sessions.noToolRecorded') : line.tool}</Tag> : null}
            {/* HOW THE SESSION RECORD GOT HERE — and NOTHING when there is no record, because a run
                found on disk that nobody filed has no record to have been stamped, and saying
                "nobody recorded how this got here" about it would be a statement about a row that
                does not exist. 35 of 58 rows in `panelx` are exactly that. */}
            {line.recordId === null ? null : <OriginMark record={line} only="exceptions" />}
          </>
        }
        title={
          <>
            {line.title}
            {/* What the RECORD says, when it says something the chip does not. It stays on the scan
                line because it is a contradiction — "the record says finished, this reading says
                crashed" — and a contradiction behind a fold is one nobody finds. */}
            <span className="sx-line-mark">
              <WrittenMark line={line} />
              {line.itsProcess === null ? null : <ItsProcessMark its={line.itsProcess} />}
            </span>
          </>
        }
        age={
          // An empty time slot is ordinary emptiness: a dimmed dash, with the words on it for hover and a screen reader
          // (wave 13y round 146). The opened row's Last activity says the gap in words.
          line.lastOutputAt === null ? <Absence title={t('g6a.sessions.noClock')} /> : relativeToNow(line.lastOutputAt, now)
        }
        // The same words on every row, with this row's own exact count beside them.
        opens={t('g6a.sessions.facts')}
        {...(inside.length === 0 ? {} : { holds: { count: inside.length, what: t(inside.length === 1 ? 'g6a.sessions.oneFact' : 'g6a.sessions.factCount') } })}
        {...(line.recordId === null ? {} : { href: `#${recordPath(line.recordId)}`, linkText: t('g6a.sessions.openRecord') })}
      >
        {inside.length === 0 ? (
          // ORDINARY EMPTINESS. A run found on disk with nothing else written about it is the
          // normal case, not a finding. The reader opened the row, so it says its one sentence there (wave 13y
          // round 142): a dash with the sentence on its hover said nothing a phone can read.
          <p className="sx-line-bare">
            <Absence say title={t('g6a.sessions.bareReason')} />
          </p>
        ) : (
          <>
            {/* APPROVED DECISION 4, THE HALF THAT IS EASY TO MISS. `idle` keeps its name and shows
                the reason recorded beside it — and where NO reason was recorded, the row says that
                out loud rather than showing a bare word. An idle session with a silent row and an
                idle session whose reason Mole Office simply did not print look identical, and one of the
                two is a session that has been waiting on an answer for four days with nothing on
                screen to say what it wants. Never inferred from a transcript: the only two things
                this line can say are the sentence that was recorded, and that there is none. */}
            {!inspect ? null : line.stateReason === null ? (
              // Only where a reason is the thing that explains a stop: idle, crashed and orphaned
              // all classify as `stopped_short`. A running session needs no reason for running, and
              // saying so on every one of them would bury the rows where it matters.
              progressOf(line.state) === 'stopped_short' ? (
                // TOLD APART, AND QUIET. "Nobody wrote a reason" has to stay legible against "the
                // reason is that there is nothing to say", which is what decision 4 is about; it
                // does not have to be a sentence. The sentence is on the mark.
                <p className="sx-line-reason" data-missing="1">
                  <Absence
                    tier="told-apart"
                    looked={false}
                    word={t('g6a.sessions.noReasonFor', { value1: (line.state) })}
                    title={t('g6a.sessions.noReasonWasRecordedForSoNothingHere', { value1: (line.state) })}
                  />
                </p>
              ) : null
            ) : (
              <p className="sx-line-reason">{line.stateReason}</p>
            )}

            {line.doing === null ? null : <p className="sx-line-doing wrap-anywhere">{line.doing}</p>}

            {/* HOW THIS RUN CAME TO BE IN THIS GROUP, on the row rather than only at the heading.
                A grouping worked out from links and a change log is a claim, and a claim a reader
                cannot check is one they have to take on faith. The middle record of a chain is named
                every time, so the reasoning can be followed back. */}
            {!inspect || placement === undefined ? null : (
              <PlacementNote placement={placement} groupSaid={groupSaidPlacement} />
            )}

            {line.purpose === null ? null : <p className="sx-purpose">{line.purpose}</p>}

            {/* How it ended, in the words the exit gave you. The most useful line under a crashed
                run — "exit 137, out of memory while collating the force tables" — and no screen in
                this product showed it before, because GET /api/sessions does not send it. */}
            {line.detail === null ? null : (
              <p className="sx-detail" data-crashed={line.state === 'crashed' ? '1' : undefined}>
                {line.detail}
              </p>
            )}

            {/* THE LABELS STAY, AND THAT IS A DECISION MEASURED RATHER THAN ASSUMED. "Where it
                ran" and "Last activity" are each drawn once per row, inside that row's own fold —
                61 times on this corpus because there are 61 rows, and none of them on screen until
                a reader opens one. A bare path and a bare timestamp under no heading are two
                strings a reader has to guess at, and the fold above them says "what was recorded",
                not which fact is which. What DID go is the sentence each of them used to print
                when the value was missing; see `Absence` below. */}
            {inspect ? <dl className="sx-facts">
              <SessionFact
                label={t('g6a.sessions.whereItRan2')}
                value={line.cwd ?? whereItRan(line.workspace)}
                // NOBODY WROTE IT DOWN, which is not the same as "it ran nowhere". Told apart, and
                // quiet: a reader does nothing about this, and the warning it used to print in
                // full — that a directory named further down may not be the one they expect —
                // is on the mark rather than on the page eleven times.
                absent={
                  <Absence
                    tier="told-apart"
                    looked={false}
                    word={t('g6a.common.notRecorded')}
                    title={t('g6a.sessions.nobodyRecordedWhereThisRunWorkedSoAny')}
                  />
                }
                mono={line.cwd !== null}
                // WHAT THE NAME IS, when no working directory was observed. It used to be a ten-word
                // parenthetical glued to the value on every such row — 13 of them on this corpus.
                after={
                  line.cwd === null && line.workspace !== null && line.workspace.from === 'recorded' ? (
                    <Absence
                      tier="told-apart"
                      looked={false}
                      word={t('g6a.sessions.noDirectoryObserved')}
                      title={t('g6a.sessions.theValueBesideThisIsTheProjectNamed')}
                    />
                  ) : null
                }
              />
              {/* WHICH CLOCK, not just the time. A hand-filed run's clock may be the newest row it
                  wrote, its newest use of a tool, the time somebody typed into `lastOutputAt`, or the
                  moment its record was last edited by anyone — and only the first three are facts
                  about the SESSION. */}
              <SessionFact
                label={t('g6a.sessions.lastActivity')}
                value={
                  line.lastOutputAt === null
                    ? null
                    : `${relativeToNow(line.lastOutputAt, now)} (${line.lastOutputAt})${clockNote(line.lastActivityFrom)}`
                }
                absent={
                  <Absence
                    tier="told-apart"
                    looked={false}
                    word={t('g6a.sessions.noClock')}
                    title={t('g6a.sessions.nobodyRecordedWhenThisRunLastProducedOutput')}
                  />
                }
              />
              {line.recordedAgent === null || line.recordedAgent === line.tool ? null : (
                <SessionFact
                  label={t('g6a.sessions.agentOnTheRecord')}
                  value={line.recordedAgent}
                  // Never drawn: this fact is left out above when no agent is on the record.
                  absent={null}
                />
              )}
            </dl> : null}

            {/* Never truncated and never reformatted: a resume command that is nearly right starts
                something in the wrong directory and looks like it worked. */}
            {!inspect ? null : hasResume ? (
              <div className="sx-cmds">
                <CommandLine label={t('g6a.sessions.resume')} command={line.resumeCommand ?? ''} what={t('g6a.sessions.resumeCommand')} />
              </div>
            ) : (
              // TWO WORDS AND THE SENTENCE ON THE MARK, in place of the sentence itself. Nobody
              // wrote a resume command down, a reader does nothing about that, and the sentence
              // was on this page ten times.
              <p className="sx-cmd-missing">
                <Absence
                  tier="told-apart"
                  looked={false}
                  word={t('g6a.sessions.noResumeCommand')}
                  title={t('g6a.sessions.noResumeCommandWasRecordedSoThisSession')}
                />
              </p>
            )}

            {!inspect ? null : hasLog ? (
              <div className="sx-cmds">
                <CommandLine label={t('g6a.sessions.log')} command={line.logPath ?? ''} what={t('g6a.sessions.logPath')} />
              </div>
            ) : (
              <p className="sx-cmd-missing">
                <Absence
                  tier="told-apart"
                  looked={false}
                  word={t('g6a.sessions.noLogPath')}
                  title={t('g6a.sessions.noLogPathWasRecordedSoThereIs')}
                />
              </p>
            )}

            {!inspect || mine.length === 0 || onRelease === undefined || onReread === undefined ? null : (
              <OrphanBlock
                orphans={mine}
                onRelease={onRelease}
                onReread={onReread}
                heading={t('g6a.sessions.thisSessionLeftRunning', { value1: t('g6a.sessions.resourceCount', {n: mine.length}) })}
              />
            )}
          </>
        )}
      </ScanRow>
    </div>
  )
}

/**
 * Where this run was placed and why, or why it could not be placed. Both are answers.
 *
 * Every sentence here is the server's own, quoted. The rule that decides them runs there now, and a
 * page that rewrote its wording would be a second voice on the same fact.
 */
function PlacementNote({ placement, groupSaid }: { placement: Placement; groupSaid?: ReadonlySet<string> }) {
  // SAID ONCE ABOVE, SO NOT AGAIN HERE. The group heading carries this exact sentence with the
  // number of rows it covers; printing it a second time inside each of those rows is the thing
  // being measured. A sentence no other row shares is not in the set and is drawn below.
  const said = groupSaid !== undefined && groupSaid.has(sentenceShape(placementSentence(placement) ?? ''))
  if (placement.kind === 'unassigned') {
    if (said) return null
    return (
      <p className="sx-place" data-missing="1">
        {placement.sentence}
      </p>
    )
  }
  return (
    <>
      {said ? null : <p className="sx-place">{placement.primary.sentence}</p>}
      {placement.also.length === 0 ? null : (
        <>
          {/* Never "and 3 others". A run that touched four modules is filed under one of them, and
              the other three are named here with their own evidence, because the one it is filed
              under is a choice this page made and the reader may disagree with it.

              WHY THE ONE ABOVE WON IS SAID ONCE, AT THE HEAD. This line used to carry "and is
              filed under the one above because that is the strongest evidence" on every row that
              reaches more than one — fourteen copies of one clause on this corpus. The rule was in
              `SessionExplanations` until November 2026; what varies, and therefore what stays here, is the number. */}
          <p className="sx-place-also">{t('g6a.sessions.alsoProjects', {n: placement.also.length})}</p>
          <ul className="sx-place-list">
            {placement.also.map((claim) => (
              <li key={claim.project.id}>{claim.sentence}</li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/**
 * The directory line when no working directory was observed.
 *
 * `data.workspace` is what an agent filing its own session writes, and it is a NAME rather than a
 * path, so it is never printed as though a directory had been read off a log.
 *
 * WHERE IT CAME FROM IS A MARK BESIDE THE VALUE, NOT A CLAUSE INSIDE IT. This used to return
 * "panelx (the project named on the record; no working directory was observed)", which put a
 * ten-word explanation inside the value on every such row — thirteen of them on this corpus, all
 * saying the same thing. The caller draws the mark; see `after` on the `SessionFact` above.
 */
function whereItRan(workspace: SessionWorkspace | null): string | null {
  if (workspace === null) return null
  return workspace.from === 'observed' ? workspace.path ?? workspace.name : workspace.name
}

/** Which of the five clocks this row's time came from, said in the words of each. */
function clockNote(from: ActivityClock | null): string {
  switch (from) {
    case 'log':
      return t('g6a.sessions.whenItsOwnLogLastGrew')
    case 'change-log':
      return t('g6a.sessions.theNewestRowItWroteWhichIsThis')
    case 'tool-use':
      return t('g6a.sessions.theNewestUseOfAToolItWrote')
    case 'stated':
      return t('g6a.sessions.theTimeWrittenOnTheRecord')
    case 'record-updated':
      return t('g6a.sessions.whenItsRecordWasLastEditedByAnyone')
    case null:
      return ''
  }
}

/**
 * One labelled fact, and one mark where the value is not there.
 *
 * THE ABSENCE IS DRAWN BY `Absence` AND THE CALLER NAMES ITS TIER. This used to take a `missing`
 * string and print it as the value, so "not recorded — anything below that names a directory may
 * not be the one you expect" was on the page eleven times and "not recorded, so how long has it
 * been quiet cannot be answered for this one" nine times. Neither is a thing a reader acts on, and
 * both had to stay tellable from "there is nothing to record" — which is the told-apart tier
 * exactly. The sentences are not gone: they are on the mark, and read out by a screen reader.
 */
function SessionFact({
  label,
  value,
  absent,
  after,
  mono,
}: {
  label: string
  value: string | null
  /** What to draw instead of the value. An `Absence` at the tier this fact's caller chose. */
  absent: React.ReactNode
  /** A mark beside the value that says something about it — how it was arrived at, for instance. */
  after?: React.ReactNode
  mono?: boolean
}) {
  return (
    <>
      <dt className="sx-fact-key">{label}</dt>
      <dd className="sx-fact-val wrap-anywhere" data-mono={mono === true && value !== null ? '1' : undefined}>
        {value ?? absent}
        {value === null ? null : after}
      </dd>
    </>
  )
}

/**
 * What the RECORD says, drawn only when it says something the chip beside it does not.
 *
 * Four of the five answers earn a mark, and the fifth is silence on purpose: a record whose written
 * word agrees with what was just observed has nothing to add, and a mark on every row would make
 * the four that matter invisible. The marks themselves are ui.tsx's, so an unclassified word looks
 * the same here as it does on the attention list.
 */
function WrittenMark({ line }: { line: SessionLine }) {
  const written = line.written
  if (written.kind === 'unread') return null
  if (written.kind === 'no-record') {
    return (
      <Tag tone="quiet" title={t('g6a.sessions.thisRunWasFoundOnDiskAndNever')}>
        {t('g6a.sessions.notFiled2')}</Tag>
    )
  }
  if (written.kind === 'none') {
    return (
      <span className="sx-row-written">
        <NoStateMark expected={kindDeclaresState('session')} />
      </span>
    )
  }
  if (written.kind === 'unclassified') {
    return (
      <span className="sx-row-written">
        <UnclassifiedMark state={written.word} />
      </span>
    )
  }
  if (written.word === line.state) return null
  // The record and the machine disagree. Both are shown; neither is picked, because which one is
  // wrong is the thing a person is here to find out.
  return (
    <span className="sx-row-written">
      <StoredState state={written.word} progress={written.progress} />
      <span className="sx-row-disagree">{t('g6a.sessions.theRecordSaysThisReadingSays', { value1: (written.word), value2: (line.state) })}</span>
    </span>
  )
}

/**
 * WHAT THE OFFICE SAW OF A HAND-FILED RUNNING RUN'S PROCESS, beside the word "running" (decided for wave 13y
 * round 30). A run whose process the office can see says so. A run whose process it cannot see says it is
 * running by its own word. Where something runs under the recorded number and is not shown to be the run's own, it
 * says that. On all three the reader's sentence is the mark's title.
 *
 * Exported because the run's own page draws the same mark beside its state. That page does not load SESSIONS_CSS, so
 * the mark brings its own stylesheet.
 */
export function ItsProcessMark({ its }: { its: ItsProcess }) {
  const title = t('sessions.itsProcess.saw', { says: its.says })
  return (
    <span className="sx-its-process">
      <style href="mole-office-its-process" precedence="default">
        {ITS_PROCESS_CSS}
      </style>
      {its.seen === 'running' ? <Tag tone="quiet" title={title}>{t('sessions.itsProcess.running')}</Tag> : null}
      {its.seen === 'none' ? <Tag tone="warn" title={title}>{t('sessions.itsProcess.none')}</Tag> : null}
      {its.seen === 'not-its-own' ? <Tag tone="warn" title={title}>{t('sessions.itsProcess.notItsOwn')}</Tag> : null}
    </span>
  )
}

/* THE MARK WRAPS INSIDE WHATEVER HOLDS IT. A tag does not wrap anywhere else, and the third mark's tag is about 330
   pixels wide: at 390 it made the Agent runs page 465 pixels wide, and at 660 it was drawn over the age column
   (wave 13y round 30). So here its words may wrap. */
const ITS_PROCESS_CSS = `
.sx-its-process { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.sx-its-process .px-tag { white-space: normal; }
`

/**
 * The one sentence a placement makes about a run, whichever kind of answer it is.
 *
 * Written here once so the row that draws it and the group that counts it are reading the same
 * string. Two readers of one field is how a group comes to say "all 35 say this" over 34 rows.
 */
export function placementSentence(placement: Placement | undefined): string | null {
  if (placement === undefined) return null
  return placement.kind === 'unassigned' ? placement.sentence : placement.primary.sentence
}

/**
 * THE PLACEMENT SENTENCE MORE THAN ONE ROW SHARES, SAID ONCE ABOVE THEM.
 *
 * MEASURED ON THE OWNER'S CORPUS, 15 August 2026: one 29-word sentence — "This run was found in an
 * agent tool's log directory and never filed as a record, so there is nothing that could carry a
 * link" — was inside 35 of the 61 rows on the panelx project and 35 of the 91 on greenhouse, and a
 * second one was inside 37 more. Every copy said the same thing about a different run.
 *
 * IT IS THE SAME RULE THIS FILE ALREADY USES FOR THE STATE REASON, and it is the same function:
 * `groupNotes` compares sentences by shape, so two that differ only in a number count as one and
 * two that name different records do not. A row whose sentence was said above keeps silent; a row
 * whose sentence is its own still prints it, in full, inside its own fold.
 *
 * The shapes it returns are what the rows are told to keep silent about, so the sentence drawn at
 * the head and the silence on the row cannot disagree about which sentence that was.
 */
export function sharedPlacementNotes(
  lines: readonly SessionLine[],
  placements: ReadonlyMap<string, Placement>,
): { shared: SharedNote[]; said: Set<string> } {
  const { shared } = groupNotes(lines, (line) => placementSentence(placements.get(line.id)))
  return { shared, said: new Set(shared.map((note) => sentenceShape(note.sentence))) }
}

/** Does this orphan belong to this session? Checked on both ids the ledger might have stored. */
export function belongsToSession(orphan: Orphan, session: Pick<SessionView, 'id' | 'recordId'>): boolean {
  if (orphan.sessionId === null) return false
  return orphan.sessionId === session.recordId || orphan.sessionId === session.id
}

// ============================================================================ one group, drawn

export interface SessionGroupBlockProps {
  group: SessionGroup
  now: number
  orphans?: readonly Orphan[]
  onRelease?: ReleaseFn
  onReread?: () => void
  /** Where each run in this group belongs, keyed by session id. Drawn inside each row's fold. */
  placements?: ReadonlyMap<string, Placement>
  /** Placement sentences the project heading above has already said — see `sharedPlacementNotes`. */
  saidPlacement?: ReadonlySet<string>
  /**
   * Draw the state word as a heading of its own.
   *
   * False inside a project group that has only one state group in its band: "3 crashed" under a
   * heading that already says "3 need you" is the same number twice, and repeating it fifteen times
   * down the page is furniture.
   */
  heading?: boolean
}

/**
 * One state group inside one project: a counted heading and the rows. Nothing else.
 *
 * WHAT MOVED OUT OF HERE, AND WHY. This used to print the group's meaning, every sentence the
 * server shares between its rows, and the counts of what carries no resume command and no log —
 * four to eight lines of prose above every group. That was right when there were eight groups on
 * the page and wrong now that there are eight groups inside each of fifteen projects: the same
 * paragraph about what `crashed` means would be on screen fifteen times.
 *
 * It was all in `SessionExplanations`, once, at the head of the page, until November 2026, when the
 * explanations were taken off the page, as decided. Each row now says its own missing resume
 * command and log path.
 */
export function SessionGroupBlock({
  group,
  now,
  orphans = [],
  onRelease,
  onReread,
  placements,
  saidPlacement,
  heading = true,
}: SessionGroupBlockProps) {
  const inspect = useInspect()
  const { spec, lines } = group
  const count = lines.length
  const { shown, folded } = foldPastLimit(lines)

  const draw = (line: SessionLine) => (
    <SessionLineRow
      key={line.id}
      line={line}
      now={now}
      orphans={orphans}
      {...(saidPlacement === undefined ? {} : { groupSaidPlacement: saidPlacement })}
      {...(placements?.get(line.id) === undefined ? {} : { placement: placements.get(line.id)! })}
      {...(onRelease === undefined ? {} : { onRelease })}
      {...(onReread === undefined ? {} : { onReread })}
    />
  )

  return (
    <section className="sx-group" aria-label={`${count} ${spec.label}`}>
      {heading ? (
        <h4 data-title-is="its-label" className="sx-group-head">
          <span className="sx-group-count num">{count}</span> {spec.label}
        </h4>
      ) : null}
      <div className="sx-lines">{shown.map(draw)}</div>
      {folded.length === 0 ? null : (
        // The exact count, the composition, and the rows themselves one press away. See
        // `foldPastLimit` for why a group is allowed to be shortened at all.
        <details className="sx-rest">
          <summary className="sx-rest-sum">
            {t('g6a.sessions.foldedRows', {hidden: folded.length, total: count, shown: shown.length})}
            {inspect ? ` ${namedTools(folded)}; ${quietSpan(folded, now)}.` : null}
          </summary>
          <div className="sx-lines">{folded.map(draw)}</div>
        </details>
      )}
    </section>
  )
}

// ============================================================================ one project, drawn

export interface ProjectBlockProps {
  entry: ProjectSessions
  now: number
  placements: ReadonlyMap<string, Placement>
  orphans?: readonly Orphan[]
  onRelease?: ReleaseFn
  onReread?: () => void
}

/** The counted line under a project heading: how many need you, how many are alive, how many ended. */
export function projectTally(entry: ProjectSessions): string {
  const bits: string[] = []
  for (const band of SESSION_BANDS) {
    if (entry.counts[band] > 0) bits.push(`${entry.counts[band]} ${BAND_WORDS[band].label}`)
  }
  return bits.join(' · ')
}

/**
 * One pipeline or module, with the runs that belong to it.
 *
 * THREE LEVELS OF PROMINENCE, AND THEY ARE THE WHOLE POINT OF THIS BLOCK:
 *
 *   the `action` band is open, and first;
 *   the `alive` band is open under it;
 *   the `ended` band is a fold carrying its exact count and the name of every state group inside.
 *
 * AND THE WHOLE PROJECT FOLDS when nothing in it is alive and nothing in it needs a person. That is
 * the historical case — a module whose last four runs finished a fortnight ago — and it is the
 * difference between a page with fifteen headings on it and a page with fifteen sections on it.
 * The fold says the count and names what is inside before it is opened, like every other fold here.
 */
export function ProjectBlock({ entry, now, placements, orphans = [], onRelease, onReread }: ProjectBlockProps) {
  const inspect = useInspect()
  const name = entry.project === null ? t('g6a.sessions.unassigned') : entry.project.title
  const live = entry.counts.action + entry.counts.alive
  const shape = entry.bands.flatMap((band) => band.groups)
  // A band heading that repeats the project heading is furniture, and with fifteen project groups
  // it is fifteen copies of it. It is drawn where it says something new — where there is a second
  // band to tell this one apart from — and left out where the heading above has already said "1
  // run — 1 alive right now" and the row's own chip says which state that is.
  const bandHeads = entry.bands.length > 1
  // WHY THESE RUNS ARE FILED HERE, SAID ONCE FOR THE WHOLE GROUP. Measured on the owner's corpus:
  // one 29-word sentence was inside 35 of the 61 rows under Unassigned, and a second inside 37
  // more. See `sharedPlacementNotes` for the rule; the rows it covers keep silent about it.
  const placementNotes = sharedPlacementNotes(entry.lines, placements)
  // THE SAME CAP THE SHARED STATE REASONS USE, for the same reason and with the same number: three
  // paragraphs above a list is a heading, and six is a wall. The photograph at 1440 showed five of
  // these stacked over the Unassigned group. What is folded says how many sentences and how many
  // rows they cover, so nothing is behind a count with no content.
  const placeHead = placementNotes.shared.slice(0, GROUP_NOTES_SHOWN)
  const placeRest = placementNotes.shared.slice(GROUP_NOTES_SHOWN)
  const placeSaid = (note: SharedNote) => (
    <>
      {/* EVERY ROW SAYING THE SAME THING IS NOT A FRACTION OF ITSELF. "2 of these 2 say the same thing"
          asks the reader to divide 2 by 2 to learn that there is no remainder, and the count is already
          in the note's own sentence. "Both" for two, "All N" for more; a note covering some of the rows
          keeps the fraction, because there the remainder is the point. A sentence whose NUMBER varies
          keeps the fraction too: "Both say the same thing" would then be false, and the page already
          says "with a different number in each" to stop one row's number standing for all of them. */}
      {note.count === entry.lines.length && !note.varies ? (
        note.count === 2
          ? t('g6a.sessions.bothSayTheSameThing')
          : t('g6a.sessions.allSayTheSameThing', { n: note.count })
      ) : (
        <>
          <b className="num">{note.count}</b> {' '}{t('g6a.sessions.ofThese')}{' '}{entry.lines.length}{' '}
          {note.varies ? t('g6a.sessions.sayThisWithADifferentNumberInEach') : t('g6a.sessions.sayTheSameThing')}
        </>
      )}
      <span className="sx-group-quote">{note.sentence}</span>
    </>
  )
  const sharedPlace =
    placementNotes.shared.length === 0 ? null : (
      <div className="sx-place-shared">
        {placeHead.map((note) => (
          <p className="sx-place-said" key={note.sentence}>
            {placeSaid(note)}
          </p>
        ))}
        {placeRest.length === 0 ? null : (
          <details className="sx-searched">
            <summary>
              {placeRest.length} {' '}{t('g6a.sessions.otherSentence', {n: placeRest.length})} {' '}{t('g6a.sessions.aboutWhereTheseRunsAreFiledCovering')}{' '}{placeRest.reduce((sum, note) => sum + note.count, 0)} {' '}{t('g6a.sessions.ofThese')}{' '}{entry.lines.length}
            </summary>
            <ul className="sx-searched-list">
              {placeRest.map((note) => (
                <li key={note.sentence} className="wrap-anywhere">
                  {placeSaid(note)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    )
  const bands = entry.bands.map((band) => {
    // Whether each state group under this band draws a heading of its own. It is the same
    // question twice: where these are drawn, the band above must NOT also list them, or "10 alive
    // right now / 7 idle, 3 running" sits directly on top of "7 idle" and "3 running".
    const groupHeads = band.groups.length > 1 || band.groups[0]?.lines.length !== band.count
    const inner = (
      <>
        {band.groups.map((group) => (
          <SessionGroupBlock
            key={group.spec.key}
            group={group}
            now={now}
            orphans={orphans}
            placements={placements}
            saidPlacement={placementNotes.said}
            heading={groupHeads}
            {...(onRelease === undefined ? {} : { onRelease })}
            {...(onReread === undefined ? {} : { onReread })}
          />
        ))}
      </>
    )
    if (band.band !== 'ended') {
      return (
        <section className="sx-band" data-band={band.band} key={band.band}>
          {bandHeads ? (
            <h4 data-title-is="its-label" className="sx-band-head">
              <span className="sx-group-count num">{band.count}</span> {BAND_WORDS[band.band].label}
              {groupHeads ? null : <span className="sx-band-groups">{compositionSentence(band.groups)}</span>}
            </h4>
          ) : null}
          {inner}
        </section>
      )
    }
    // Counted from the specs rather than written into a sentence, so the claim on screen cannot
    // drift away from which groups actually carry a person's word.
    const confirmed = band.groups.filter((group) => group.spec.humanConfirmedFinished)
    const confirmedRows = confirmed.reduce((sum, group) => sum + group.lines.length, 0)
    return (
      <details className="sx-band" data-band="ended" key={band.band}>
        <summary className="sx-band-sum">
          <span className="sx-group-count num">{band.count}</span> {BAND_WORDS.ended.label}
          <span className="sx-band-groups">{compositionSentence(band.groups)}</span>
        </summary>
        <div className="sx-band-body">
          {/* THE ARITHMETIC, AND NOT THE RULE BEHIND IT. This paragraph used to end with "and are
              drawn as their own groups below for that reason", which is the rule the head of the
              page stated in bold until November 2026 — "A run that has merely gone quiet is not a run somebody
              said was done" — and it was printed once per project group, seven times on this
              corpus. What varies is the two numbers, so the two numbers are what is left.

              ZERO IS AN ABSENCE, AND IT IS TOLD APART RATHER THAN SPELLED OUT. "Nobody wrote down
              that any of these finished" has to stay distinguishable from "these were finished",
              and a reader does nothing about it. */}
          {confirmedRows === 0 ? (
            <p className="sx-band-what">
              <Absence
                tier="told-apart"
                looked={false}
                word={t('g6a.sessions.notConfirmed', {n: band.count})}
                title={t('g6a.sessions.notConfirmed', {n: band.count})}
              />
            </p>
          ) : (
            <p className="sx-band-what">
              {t(band.count === 1 ? 'g6a.sessions.itWasWrittenDownAsFinished' : 'g6a.sessions.confirmed', {confirmed: confirmedRows, total: band.count})}
            </p>
          )}
          {inner}
        </div>
      </details>
    )
  })

  const head = (
    <>
      <span className="sx-proj-name" data-title-is={entry.project === null ? 'its-label' : undefined}>{name}</span>
      {entry.project === null ? (
        <Tag tone="quiet">{t('g6a.sessions.noProject')}</Tag>
      ) : (
        <Tag kind={entry.project.kind} tone="quiet" />
      )}
      {/* The shape of the group before its arithmetic, because "which share is big" is the
          question a proportion answers and a list of numbers does not. Nothing is drawn where
          there is only one state group; see CompositionStrip. */}
      <CompositionStrip groups={shape} />
      <span className="sx-proj-tally">
        {t('g6a.sessions.runCount', {n: entry.lines.length})} —{' '}
        {projectTally(entry)}
      </span>
    </>
  )

  if (live === 0) {
    return (
      <details className="sx-proj" data-quiet="1">
        <summary className="sx-proj-sum">{head}</summary>
        <div className="sx-proj-body">
          {inspect ? sharedPlace : null}
          {bands}
        </div>
      </details>
    )
  }

  return (
    <section className="sx-proj" aria-label={name}>
      <h3 className="sx-proj-head">{head}</h3>
      {inspect ? sharedPlace : null}
      {bands}
    </section>
  )
}

// ============================================================================ the machine surface
/**
 * ---------------------------------------------------------------------------------------
 * ONE ROW PER PROCESS, NOT ONE ROW PER PORT
 * ---------------------------------------------------------------------------------------
 *
 * The sweep answers in resources: this port, that port, that GPU allocation. A person does not act
 * on a port. They act on the PROCESS holding it, with one command, and one Zotero holding three
 * ports is one thing to decide about — measured on this machine on 9 August 2026: four unclaimed
 * resources, two holders, and three near-identical paragraphs about the same process.
 *
 * So the rows are holders. The count drops because the count was wrong, not because it was styled
 * down — that is the whole difference between grouping and hiding, and it is why the number of
 * processes an operating system happens to be running can no longer set the length of this page.
 *
 * NOTHING HERE INVENTS A COMMAND. The server writes the exact thing to run inside its own note for
 * each row, and this view neither parses that sentence nor composes a kill of its own from the pid
 * it can see. Composing one would be the browser deciding what to kill from a stale reading, which
 * is the failure the whole release contract exists to prevent. The notes are kept whole, one press
 * away, with the count and their content named on the fold.
 */

export interface HolderGroup {
  /** Stable across recomputes: the process group, else the pid, else the resource's own key. */
  key: string
  /** The holder, from the sweep's structured fields. All null for a container, which has none. */
  pid: number | null
  pgid: number | null
  command: string | null
  upFor: string | null
  upSeconds: number | null
  /** Everything this one holder is holding. Never empty. */
  resources: Unclaimed[]
}

/**
 * The sweep, grouped by what holds it, oldest holder first.
 *
 * OLDEST FIRST because the incident this feature was built after was an eleven-day-old simulation
 * sitting on the GPU, and age is the only signal here that separates "started this morning and is
 * probably yours" from "has been there since before you can remember". Ties go to the holder
 * holding more, then to the key, so the order is total and two renders cannot disagree.
 */
export function groupByHolder(resources: readonly Unclaimed[]): HolderGroup[] {
  const groups = new Map<string, HolderGroup>()
  for (const resource of resources) {
    // A process group is what a signal is sent to, so it is the identity where there is one. A
    // holder with a pid and no group is still one thing. A container has neither and is its own.
    const key =
      resource.pgid !== null
        ? `pgid:${resource.pgid}`
        : resource.pid !== null
          ? `pid:${resource.pid}`
          : `${resource.kind}:${resource.key}`
    const found = groups.get(key)
    if (found === undefined) {
      groups.set(key, {
        key,
        pid: resource.pid,
        pgid: resource.pgid,
        command: resource.command,
        upFor: resource.upFor,
        upSeconds: resource.upSeconds,
        resources: [resource],
      })
      continue
    }
    found.resources.push(resource)
    // The oldest reading in the group wins, and a reading that exists beats one that does not: two
    // rows for one process should not disagree about its age, and if they do, the older is the one
    // that describes how long this has been going on.
    if (found.upSeconds === null || (resource.upSeconds !== null && resource.upSeconds > found.upSeconds)) {
      found.upSeconds = resource.upSeconds ?? found.upSeconds
      found.upFor = resource.upFor ?? found.upFor
    }
    if (found.command === null) found.command = resource.command
  }
  return [...groups.values()].sort((a, b) => {
    const at = a.upSeconds
    const bt = b.upSeconds
    if (at !== bt) {
      if (at === null) return 1
      if (bt === null) return -1
      return bt - at
    }
    if (a.resources.length !== b.resources.length) return b.resources.length - a.resources.length
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
  })
}

/** How many holders are drawn before the rest are folded. */
export const MACHINE_HOLDERS_SHOWN = 6

/** The words for what one holder is holding: "3 ports", "1 GPU allocation and 1 port". */
export function holdsPhrase(resources: readonly Unclaimed[]): string {
  const counted = UNCLAIMED_KINDS.map((kind) => ({
    kind,
    n: resources.filter((r) => r.kind === kind).length,
  })).filter((entry) => entry.n > 0)
  const words = {port: 'g6a.sessions.ports', gpu: 'g6a.sessions.gpus', container: 'g6a.sessions.containers'} as const
  return counted.map(entry => t(words[entry.kind], {n: entry.n})).join(t('g6a.sessions.and2'))
}

/**
 * What to print for one thing a holder holds, once the holder itself has been named.
 *
 * The sweep's `detail` is "<the holder's command> — <where it listens>", and the command is already
 * the heading of the group this row is inside: printed whole, one Zotero holding three ports draws
 * the same 60-character path three times under its own name. So an EXACT leading copy of the
 * command is dropped and nothing else is touched — no parsing, no rewording, and the whole string
 * stays on the element's title. Where the detail does not begin with the command, it is printed as
 * it came.
 */
export function heldDetail(detail: string | null, command: string | null): string | null {
  if (detail === null) return null
  if (command === null || !detail.startsWith(command)) return detail
  const rest = detail.slice(command.length).replace(/^\s*[—-]\s*/, '')
  return rest === '' ? detail : rest
}

/** One holder: what it is, how long it has been there, what it holds, and the server's sentences. */
export function HolderRow({ group }: { group: HolderGroup }) {
  const many = group.resources.length !== 1
  return (
    <li className="sx-holder">
      <div className="sx-orphan-head">
        <StateChip state="broken" label={group.upFor ?? t('g6a.sessions.ageUnknown')} />
        <span className="sx-orphan-what">
          <Tag tone="warn">{holdsPhrase(group.resources)}</Tag>
          <code className="sx-orphan-label sx-unclaimed-what wrap-anywhere" title={group.command ?? undefined}>
            {group.command ?? t('g6a.sessions.theCommandLineOfThisHolderWasNot')}
          </code>
        </span>
      </div>

      <p className="sx-orphan-meta">{t('g6a.sessions.nobodyClaimsIt', { value1: (group.pid === null ? '' : t('g6a.sessions.itsPid', { pid: group.pid })), value2: (group.pgid === null ? '' : t('g6a.sessions.itsProcessGroup', { pgid: group.pgid })) })}</p>

      <ul className="sx-held-list">
        {group.resources.map((resource) => (
          <li className="sx-held" key={`${resource.kind}:${resource.key}`}>
            <span className="sx-held-kind">{UNCLAIMED_WORDS[resource.kind]}</span>
            <code className="sx-held-what wrap-anywhere" title={resource.detail ?? undefined}>
              {resource.key}
              {resource.detail === null
                ? t('g6a.sessions.whatItIsRunningWasNotRecorded')
                : ` — ${heldDetail(resource.detail, group.command) ?? resource.detail}`}
            </code>
          </li>
        ))}
      </ul>

      <details className="sx-searched">
        <summary>
          {many
            ? t('g6a.sessions.theServerSOwnSentenceForEachOf', { value1: (group.resources.length) })
            : t('g6a.sessions.theServerSOwnSentenceForThisOne')}
        </summary>
        <ul className="sx-searched-list">
          {group.resources.map((resource) => (
            <li key={`${resource.kind}:${resource.key}`} className="wrap-anywhere">
              {resource.note ??
                t('g6a.sessions.theServerSentNoNoteForThisRow2')}
            </li>
          ))}
        </ul>
      </details>
    </li>
  )
}

/**
 * Everything alive on this machine that no session claims, on its own surface.
 *
 * The explanation is written ONCE, above the rows, and it is the same sentence the old panel
 * printed under every single one of them. What stays on the row is what differs on the row.
 */
export function MachineSurface({ unclaimed }: { unclaimed: UnclaimedRead | null }) {
  if (unclaimed === null) {
    // THE ONE ABSENCE ON THIS PAGE THAT KEEPS EVERY WORD IT HAS. A reader must act on it: the
    // question "is something running that nobody wrote down" was not answered, and five incidents
    // on this project began with a machine that looked clean because nobody had looked. It is
    // drawn by `Absence` at the must-act-on tier, which is the product's one loud absence.
    return (
      <section className="sx-unclaimed" data-missing="1" aria-label={t('g6a.sessions.nothingWasSwept')}>
        <h3 data-title-is="its-label" className="sx-unclaimed-head">
          <StateGlyph state="broken" />
          {t('g6a.sessions.thisReplyDoesNotSayWhatIsRunning')}</h3>
        <Absence
          tier="must-act-on"
          sentence={
            <>
              {t('g6a.sessions.theRunningOnThisMachineListAnsweredWithout')}{' '}{t('g6a.sessions.unclaimed')}{' '}{t('g6a.sessions.sweepSoNothingHereCanTellYouWhether2')}</>
          }
        />
      </section>
    )
  }

  const { resources, skipped, searched, unchecked } = unclaimed
  const holders = groupByHolder(resources)
  const shown = holders.slice(0, MACHINE_HOLDERS_SHOWN)
  const rest = holders.slice(MACHINE_HOLDERS_SHOWN)

  const uncheckedNote =
    unchecked.length === 0 ? null : (
      <div className="sx-problems">
        {unchecked.map((line, i) => (
          <p className="sx-problem" key={i}>
            <StateGlyph state="broken" /> <span>{line}</span>
          </p>
        ))}
      </div>
    )

  const where =
    searched.length + skipped.length === 0 ? null : (
      <details className="sx-searched">
        <summary>{t('g6a.sessions.whereTheSweepLookedAndWhatItLeft', { value1: (searched.length), value2: (skipped.length) })}</summary>
        <ul className="sx-searched-list">
          {searched.map((line, i) => (
            <li key={`s${i}`} className="wrap-anywhere">
              {line}
            </li>
          ))}
          {skipped.map((entry, i) => (
            <li key={`k${i}`} className="wrap-anywhere">
              {t('g6a.sessions.leftOut')}{' '}{entry.what} — {entry.reason}
            </li>
          ))}
        </ul>
      </details>
    )

  if (resources.length === 0) {
    return (
      <section className="sx-unclaimed" data-clear="1" aria-label={t('g6a.sessions.nothingUnclaimed')}>
        {/* SOMEBODY LOOKED AND THERE IS NONE — which is a different answer from the block above,
            and the difference is the whole point of this surface. It is told apart and it is
            quiet: nothing follows from a clean sweep. It says "Nothing unclaimed" (wave 13y round 142; it was a
            dash), and the server's own sentence is on its hover, so the difference survives without paying
            sentence weight.
            Anything the sweep could NOT read is still printed at full weight underneath. */}
        <p className="sx-unclaimed-clear">
          <Absence
            looked
            word={t('g6a.sessions.nothingUnclaimed')}
            title={
              unclaimed.summary ??
              t('g6a.sessions.theSweepReadThisMachineAndFoundNothing')
            }
          />
        </p>
        {uncheckedNote}
        {where}
      </section>
    )
  }

  const many = holders.length !== 1
  return (
    <section className="sx-unclaimed" aria-label={t('g6a.sessions.runningAndNobodyClaimsIt')}>
      <h3 data-title-is="its-label" className="sx-unclaimed-head">
        <StateGlyph state="broken" />
        {t('g6a.sessions.unclaimedCount', {n: resources.length, holders: holders.length})}
      </h3>
      {/* THE SERVER'S OWN SENTENCE, VERBATIM AND NOT REBUILT, for a developer. The fold that held it, with a paragraph
          on what an unclaimed process costs, was taken off the page in November 2026, as decided. It is kept whole
          because it is the only place the sweep speaks for itself about what it left out and why. */}
      <ServerNote text={unclaimed.summary} />
      <ul className="sx-unclaimed-list">
        {shown.map((group) => (
          <HolderRow key={group.key} group={group} />
        ))}
      </ul>
      {rest.length === 0 ? null : (
        <details className="sx-fold">
          <summary className="sx-fold-sum">
            {/* The exact count and what it is made of, and that is the whole line. Why the list is
                cut — the operating system sets its length and the research does not — is the same
                argument for every fold on this surface, and it is not what a reader needs at the
                moment they decide whether to press. */}
            <span className="sx-group-count num">{rest.length}</span> {' '}{t('g6a.sessions.more')}{' '}
            {rest.length === 1 ? t('g6a.sessions.holdingProcess') : t('g6a.sessions.holdingProcesses')}{t('g6a.sessions.holding')}{' '}
            {holdsPhrase(rest.flatMap((group) => group.resources))}{endOfSentence()}
          </summary>
          <ul className="sx-unclaimed-list">
            {rest.map((group) => (
              <HolderRow key={group.key} group={group} />
            ))}
          </ul>
        </details>
      )}
      {uncheckedNote}
      {where}
    </section>
  )
}

/**
 * The machine in one line, above the runs. The whole of it is in the machine section below them.
 *
 * Approved decision 3: a compact summary where the reader is, the full grouped view on its own
 * surface. The three answers the sweep can give are still three — not swept, swept and clear, swept
 * and not clear — because an unanswered question drawn as a clean bill of health is the silence
 * this whole feature exists to break.
 *
 * NO LINK. The router reads the address bar, so an in-page `#machine` anchor would be read as a
 * page that does not exist. It took a link while the home page's preview drew it; the preview was
 * removed in wave 13y round 32.
 */
export function MachineLine({
  unclaimed,
  orphans,
}: {
  unclaimed: UnclaimedRead | null
  orphans: readonly Orphan[]
}) {
  const inspect = useInspect()
  if (!inspect) return null
  const orphanBit =
    orphans.length === 0 ? null : (
      <span className="sx-machine-bit">{t('g6a.sessions.orphanCount', {n: orphans.length})}</span>
    )

  if (unclaimed === null) {
    return (
      <p className="sx-machine-line" data-tone="bad">
        <StateGlyph state="broken" />
        <span>
          {t('g6a.sessions.thisReplyDoesNotSayWhatIsRunning2')}</span>
        {orphanBit}
      </p>
    )
  }

  const holders = groupByHolder(unclaimed.resources)
  const clear = unclaimed.resources.length === 0
  return (
    <p className="sx-machine-line" data-tone={clear && orphans.length === 0 ? 'quiet' : 'bad'}>
      <StateGlyph state={clear ? 'done' : 'broken'} />
      <span>
        {clear
          ? t('g6a.sessions.theMachineWasReadAndNothingIsRunning', { value1: (unclaimed.unchecked.length === 0 ? '' : t('g6a.sessions.uncheckedPlaces', {n: unclaimed.unchecked.length})) })
          : t('g6a.sessions.unclaimedCount', {n: unclaimed.resources.length, holders: holders.length})}
      </span>
      {orphanBit}
    </p>
  )
}

// ============================================================================ when it was read
/**
 * ---------------------------------------------------------------------------------------
 * THE SESSIONS PAGE SAYS WHEN ITS READING WAS TAKEN
 * ---------------------------------------------------------------------------------------
 *
 * Approved decision 9, resolved as SELECTIVE freshness: machine truth may refresh on its own, the
 * reader's position must never be silently disrupted, and anything that reads as current must say
 * when it was read. This block is the third of those. The home page's panel carried the first: it
 * read the machine again every 30 seconds. It was removed in wave 13y round 32, and the sessions
 * page reads again only when a person presses. The second — the ranked attention list, which never
 * reorders under a reader — was in components/AttentionPanel.tsx until wave 13k's round 19 removed
 * that list.
 *
 * WHY A READING OF THE MACHINE IS DATED. What is running on this computer is not an answer Mole
 * Office computed from records somebody wrote; it is an observation of a process table, and it is
 * wrong the instant it is drawn. A stale ranked list is a list that was right an hour ago. A stale
 * machine panel says a session is running when it died forty minutes back, and says an
 * eleven-day-old process was released when it was not. Those are not the same kind of wrong, and
 * only the second is fixed by looking again.
 *
 * WHY A FAILED RE-READ KEEPS THE LAST READING AND SAYS SO. A failed re-read leaves the last good
 * reading up, which is right, and a page that then still read as current would be lying. So the
 * stamp is the moment THIS reading was taken, always, and a failed attempt says so beside it.
 *
 * WHY THE STAMP IS THE MOMENT THE REQUEST WENT OUT and not the moment the reply came back. The
 * sweep happens somewhere between the two. Dating it by the send is the older of the two answers,
 * so this never claims a reading is fresher than it is — staleness that admits its own age is not
 * a false result, and staleness that shaves half a second off itself is a small one.
 */

/**
 * The moment a reading was taken, written the way every stamp in this product is written.
 *
 * THE WHOLE STAMP AND NOT THE TIME OF DAY. "Read at 14:32:07" on a page left open overnight is a
 * sentence that reads as four minutes ago and means eighteen hours. `localStamp` is the app's one
 * writer of a moment and it is local wall-clock, so this cannot drift to UTC the way seven
 * hand-written stamp readers in this repository once did.
 */
export function readingStamp(at: number): string {
  return localStamp(new Date(at))
}

/** What is true about the reading currently on screen, and what the last attempt did. */
export interface MachineRead {
  /** When THIS reading was taken, and not now. */
  at: number
  /** True while the next reading is in flight. What is on screen does not move meanwhile. */
  inFlight: boolean
  /**
   * True while the read in flight was started by this press. A switch of project also reads, and
   * that read is the shell's to show; the press must not glow for a wait nobody pressed for.
   */
  inFlightFromAPress: boolean
  /**
   * True when the newest read was started by this press. A switch's answer is not the press's
   * success, so it does not light the press.
   */
  theLastReadWasFromAPress: boolean
  /**
   * The last attempt that failed, or null when the last attempt came back whole.
   *
   * Not an error state for the panel: the reading above it is still a real reading, taken at `at`.
   * It is a statement that nothing NEWER has been seen since, which is a different fact from both
   * "this is current" and "this panel is broken".
   */
  failed: { at: number; message: string; fault?: Fault | null } | null
  /** Read it again now. Always offered. */
  onReadAgain: () => void
}

/**
 * WHEN THIS PANEL WAS READ, beside the panel, in every case.
 *
 * This is the line decision 9 forbids leaving out. Everything above it is an observation of a
 * machine, and an observation with no time on it is indistinguishable from a fact.
 */
export function ReadAt({ read }: { read: MachineRead }) {
  return (
    <div className="sx-read">
      {/* WHEN. The sentence "This is an observation of the machine, so it was
          already out of date when it was drawn" was the FIRST thing a person read on this page —
          an epistemological aside standing in front of the answer. The point is true and it is what
          the stamp is FOR: a reading with a time on it is already saying it is a reading. Decision 9
          requires the time, not the essay. Finding 23, 19 August 2026. */}
      <p className="sx-read-at">
        {t('g6a.sessions.checked', {at: readingStamp(read.at)})}
      </p>
      <span className="sx-read-act">
        <Btn
          size="sm"
          variant="ghost"
          onClick={read.onReadAgain}
          pending={read.inFlightFromAPress}
          disabled={read.inFlight && !read.inFlightFromAPress}
          reason={read.inFlight && !read.inFlightFromAPress ? t('g6a.sessions.readIsAlreadyOut') : undefined}
          pendingFailed={read.failed !== null}
          pendingSucceeded={read.failed === null && read.theLastReadWasFromAPress}
          title={t('g6a.sessions.checkTitle')}
        >
          {t('g6a.sessions.checkAgain')}</Btn>
      </span>
      {read.failed === null ? null : (
        // Loud, and it does not replace the panel. The rows above are a real reading of a real
        // machine; what is missing is a newer one, and saying "could not load" over the top of a
        // good reading would throw away information to report a failure.
        <p className="sx-read-failed" role="status">
          {t('g6a.sessions.readFailed', {failedAt: readingStamp(read.failed.at), message: read.failed.message})}
        </p>
      )}
    </div>
  )
}

// ============================================================================ looking for runs

/**
 * LOOK ON THIS MACHINE FOR AGENT RUNS, ON A PRESS, AND SAY WHAT THAT DID.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS CONTROL EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Sending a message to the agent already working on something was unreachable from the browser. A
 * run can only be picked up where it left off if Mole Office knows where that run's transcript is, and
 * the only thing that writes that down is a sweep of this machine's agent-tool logs. Nothing in the
 * browser ran one. So in a corpus nobody had swept, every candidate the recipient picker offered
 * answered "this cannot be picked up", and the picker was a list of agents none of which could be
 * addressed. Measured on 18 August 2026 against a copy of the real corpus: 8 candidates offered,
 * all 8 unreachable; after one press of this, 39 candidates and every one of them reachable.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS A PRESS AND NEVER A PAGE LOAD
 * ---------------------------------------------------------------------------------------
 *
 * It reads the log directories of the agent tools on this computer and files a record for each run
 * it finds. That is a deliberate act with a visible result, not something that should happen while
 * somebody is reading a page, so nothing here runs on mount and the words on the control say what
 * pressing it will do before it is pressed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT SAYS AFTERWARDS, AND WHY NOT THE SERVER'S OWN SENTENCE IN NORMAL MODE
 * ---------------------------------------------------------------------------------------
 *
 * The server's sentence is written for whoever calls the route, and it names stored fields and a
 * list by their spellings — "read stopped when off data.state", "`report.where` says which and
 * why". Those may not be put in front of a person in Normal mode. So Normal draws the counts
 * the sentence is made of, which are the same facts and nothing more, and Developer mode draws the
 * server's sentence whole underneath them. Nothing is summarised away: everything the sweep could
 * not read is listed in both.
 */
export function LookForRuns({ onFound }: { onFound: () => void }) {
  const inspect = useInspect()
  const [running, setRunning] = useState(false)
  const [found, setFound] = useState<DiscoverReply | null>(null)
  const [failed, setFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [outcome, setOutcome] = useState<'worked' | 'failed' | null>(null)

  const look = () => {
    setRunning(true)
    setFailed(null)
    setOutcome(null)
    api.discoverSessions().then(
      (reply) => {
        setRunning(false)
        setFound(reply)
        // A RESOLVED ANSWER IS NOT ALWAYS A WHOLE SWEEP. A reply can say a place could not be read or an
        // observed state could not be stored; that press proves no success, so its light ends plainly. A
        // conversation filed nowhere is a fact about its folder and not a failure of the sweep.
        setOutcome(theWholeSweepRan(reply) ? 'worked' : null)
        // The list on this page was drawn before the sweep, so it does not hold what the sweep
        // filed. Reading it again is the only way this page tells the truth after a press.
        onFound()
      },
      (err: unknown) => {
        setRunning(false)
        setFailed({ message: errorMessage(err), fault: faultOf(err) })
        setOutcome('failed')
      },
    )
  }

  return (
    <div className="sx-look">
      <span className="sx-look-act">
        <Btn
          size="sm"
          variant="secondary"
          onClick={look}
          pending={running}
          pendingFailed={outcome === 'failed'}
          pendingSucceeded={outcome === 'worked'}
          title={t('g6a.sessions.lookTitle')}
        >
          {t('g6a.sessions.look')}</Btn>
      </span>
      {failed === null ? null : <ErrorNote message={failed.message} fault={failed.fault} label={t('g6a.sessions.notFiled')} />}
      {found === null ? null : <WhatTheSweepDid reply={found} inspect={inspect} />}
    </div>
  )
}

/** How many runs the sweep filed nowhere, because no one project holds the folder it ran in. */
function notFiled(report: DiscoverReply['report']): number {
  return report.where.filter((one) => one.action === 'not filed').length
}

/** Whether the sweep's own answer says it did everything it was asked to do. */
function theWholeSweepRan(reply: DiscoverReply): boolean {
  return reply.report.unreadable.length === 0 && reply.report.stateNotStorable === 0
}

/** What one press found, in counts a person reads, with the server's own sentence for Developer. */
function WhatTheSweepDid({ reply, inspect }: { reply: DiscoverReply; inspect: boolean }) {
  const r = reply.report
  return (
    <div className="sx-look-did" role="status">
      <p className="sx-look-say">
        {t('g6a.sessions.found', {total: r.discovered, created: r.created, updated: r.updated, unchanged: r.unchanged})}
      </p>
      {/* A RUN FILED NOWHERE IS SAID, NOT SUBTRACTED (problem kDKj9iXd4Vft). Each run is filed into the project its own
          folder is in; one no single project holds is filed nowhere, and the counts above would add up to less than
          the total with nothing saying why. Developer mode lists each one below, from the server's own sentence. */}
      {notFiled(r) === 0 ? null : (
        <p className="sx-look-say">{t('g6a.sessions.notFiledCount', { n: notFiled(r) })}</p>
      )}
      {r.unreadable.length === 0 ? (
        // "Nothing could not be read" is a different answer from "nothing was found", and this is
        // the first one. It is said rather than left as silence.
        <p className="sx-look-say">{t('g6a.sessions.allReadable')}</p>
      ) : (
        <>
          <p className="sx-look-say">
            {t('g6a.sessions.discoveryIncomplete', {n: r.unreadable.length})}
          </p>
          {/* THE OPERATING SYSTEM'S OWN WORDS, KEPT. The code at the front of one of these — EACCES,
              EIO, ESTALE — is what tells a permission bit apart from a dead network mount, and it is
              the part somebody searches for. A friendlier sentence would drop it. */}
          {inspect ? <ul className="sx-look-unread">
            {r.unreadable.map((one) => (
              <li key={one.path}>{`${one.path} — ${one.reason}`}</li>
            ))}
          </ul> : null}
        </>
      )}
      {/* THE SERVER'S OWN WORDS, WHOLE, FOR A READER WHO ASKED FOR THE MACHINERY. It names stored
          fields and a request field by their spellings, which is why it is not in Normal mode. */}
      <ServerNote text={reply.note} />
    </div>
  )
}

// ============================================================================ talking to the server

/**
 * The three requests this view makes, over the app's ONE transport.
 *
 * THIS USED TO BE A COPY OF IT. src/web/api.ts belonged to another agent when this view was
 * written, so forty lines of its `request` were restated here with a docstring promising not to
 * let the two drift. They drifted the moment a request had to carry a fourth header:
 * `x-mole-office-workspace` says which PROJECT a request is about, a request that omits it is answered
 * from the stated default, and this panel would have gone on reading another project's sessions —
 * and RELEASING another project's resources — under this project's name, with nothing failing.
 *
 * So it is `moleOfficeRequest` now, which api.ts exports for exactly this. The two rules that file
 * exists to enforce still hold here because it is that file enforcing them: a failed request never
 * becomes an empty successful result, and every request says who is asking and what about.
 */
const sessionRequest = moleOfficeRequest

/**
 * Every session, already read into rows and printable problems.
 *
 * THE WHOLE POOL, ALWAYS. The door's `?only=running` narrowing is the session hook's
 * (tools/session-hook.mjs), not the browser's: nothing here asks for it. See `SESSIONS_NOTE` in
 * api/sessions.ts.
 */
export function fetchSessions(): Promise<SessionsRead> {
  return sessionRequest<unknown>('/api/sessions').then(readSessionsPayload)
}

/** Everything left running that nothing owns, read against the release contract. */
export function fetchOrphans(): Promise<OrphansRead> {
  return sessionRequest<unknown>('/api/resources/orphans').then(readOrphansPayload)
}

/** The sessions page's whole answer: what ran, what was written down about it, and the machine. */
export interface SessionsPageData {
  /** Every session, joined to its record. Each one carries the server's placement for it. */
  lines: SessionLine[]
  orphans: Orphan[]
  /** What is running that no session claims. Null when the ledger answered without a sweep. */
  unclaimed: UnclaimedRead | null
  problems: PanelProblem[]
  searched: string[]
  warnings: string[]
  /** What the placement rule read to answer, so the page can say when it read a partial log. */
  placementRead: PlacementReading
  /** How many sessions are in each state, counted over every session the server found. See `SessionsRead.counts`. */
  counts: Record<string, number>
}

/**
 * The three requests this page makes, together — and a failure on any of them is thrown.
 *
 * IT USED TO BE THIRTY-NINE. Placing the runs meant fetching every record, then one request per
 * pipeline and module for its links, then the change log — because the rule ran here and nothing
 * served it. The server answers all of that on the sessions request now, so what is left is the
 * three questions this page actually asks: what ran, what is still running that nothing owns, and
 * what was written down about each run.
 *
 * THE RECORDS ARE STILL A REQUEST OF THEIR OWN, and they answer only one question now: was a state
 * ever WRITTEN for this run, and which word. See "WHY THIS VIEW READS THE SESSION RECORDS AS WELL"
 * above — without them, a session nobody ever wrote a state for and a session somebody recorded as
 * `unknown` arrive as the same word.
 *
 * IT ASKS FOR THE NARROW, SESSION SHAPE: `kind=session` because `readSessionRecordFacts` reads only
 * session records, and `shape=session` because the two fields it reads — `state` and `detail` — are
 * the only body keys that shape keeps, and the only top-level fields are `id` and `kind`. The
 * `light` shape was 14.86 MB for the full list on their database and 1,090,413 bytes for the sessions
 * alone; `shape=session` is about 540,000 (problem dfi72F0VtyK5; see `sessionRecord` in
 * src/server/api/records.ts).
 *
 * NOTHING IS SWALLOWED. A page that showed sessions with a silently empty orphan list would be
 * saying "nothing was left running" on no evidence, and one that quietly dropped the records would
 * report a gap in the record that is really a gap in its own reading.
 */
export function fetchSessionsPage(): Promise<SessionsPageData> {
  return Promise.all([fetchSessions(), fetchOrphans(), api.listRecords('session', 'session').then((r) => r.records)]).then(
    ([sessions, orphans, records]) => buildSessionsPage(sessions, orphans, readSessionRecordFacts(records)),
  )
}

/** The page's answer, put together from its three reads. */
function buildSessionsPage(
  sessions: SessionsRead,
  orphans: OrphansRead,
  facts: Map<string, SessionRecordFacts>,
): SessionsPageData {
  return {
    lines: joinSessionRecords(sessions.sessions, facts),
    orphans: orphans.orphans,
    unclaimed: orphans.unclaimed,
    problems: [...sessions.problems, ...orphans.problems],
    searched: [...sessions.searched, ...orphans.searched],
    warnings: [sessions.warning, orphans.warning].filter((w): w is string => w !== null),
    placementRead: sessions.placementRead,
    counts: sessions.counts,
  }
}

/**
 * READ THE PROJECT'S RUNS, KEEP THE LAST GOOD READING, AND SAY WHEN IT WAS TAKEN.
 *
 * ---------------------------------------------------------------------------------------
 * A READING OF ONE PROJECT, SO IT IS ON `useProjectAsync`
 * ---------------------------------------------------------------------------------------
 * The three reads in `fetchSessionsPage` are each answered about the chosen project, so the
 * reading belongs to that project. It is read when the page opens, when a person presses "Check
 * again", and when the person switches project. Nothing here runs on a timer.
 *
 * While a read is out, the reading on screen stays where it is and `inFlight` is true. After a
 * switch, the rows on screen until the new reading comes are the previous project's. What is kept
 * then, how it is marked, and what goes if the read fails are decided in `useAsync`
 * (components/ui.tsx), which says why. This hook does not decide them again.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE ANSWERS THIS KEEPS APART — rule 5
 * ---------------------------------------------------------------------------------------
 *   `taken === null` and no failure   nobody has looked yet. The panel draws a skeleton.
 *   `taken === null` and a failure    Mole Office looked and could not read. The panel draws the error
 *                                     and NO list, because "no runs" and "could not look" are
 *                                     opposite answers. A failed read after a switch is this answer.
 *   `taken !== null` and a failure    there is a real reading, taken at `taken.at`, and nothing
 *                                     newer has been seen since. Both halves are printed.
 *
 * A "Check again" that fails NEVER clears the reading. Throwing away a true reading to report that a
 * later one did not arrive would lose the only evidence on the screen.
 */
export interface MachineReading {
  /**
   * The last reading that came back whole, and the moment it was taken. Null when none ever has.
   *
   * ONE FIELD AND NOT TWO. A reading and its stamp are one fact, and holding them apart is how a
   * surface ends up drawing a list beside a time that belongs to a different read of it.
   */
  taken: { data: SessionsPageData; at: number } | null
  /** True while a read is in flight. What is on screen does not move meanwhile. */
  inFlight: boolean
  /** True while the read in flight was started by the Check again press rather than by a switch. */
  inFlightFromAPress: boolean
  /**
   * True when the newest read was started by the Check again press, whether it is still out or has
   * answered. A switch starts a read nobody pressed, so it clears this: the press's light and its
   * success settle belong to the read the press started and not to the switch's answer.
   */
  theLastReadWasFromAPress: boolean
  /**
   * The last attempt that failed, or null when the last attempt came back whole.
   *
   * `fault` says what SORT of failure it was, so the panel that draws it can say "Mole Office cannot
   * reach its own server" rather than printing a status and a route. See `Fault` in src/web/api.ts.
   */
  failed: { at: number; message: string; fault?: Fault | null } | null
  /** Read again now. Safe to call while one is in flight; it does nothing then. */
  readAgain: () => void
}

/** The Agent runs page's reader. The comment above `MachineReading` says what it keeps and when it reads. */
export function useMachineReading(): MachineReading {
  // THE MOMENT THE LAST READ FAILED. Only the newest read writes it, so a read that a press or a
  // switch left behind cannot put its own time on a later failure.
  const started = useRef(0)
  const failedAt = useRef(0)
  const [fromAPress, setFromAPress] = useState(false)
  /**
   * TRUE WHEN THE LAST ANSWER CAME FROM THE READ THE PRESS STARTED. A switch's answer is not the
   * press's success, so its settle must not light the press. It is cleared when any read starts and
   * set again only when the press's own read is the newest one to finish.
   */
  const [thePressAnswered, setThePressAnswered] = useState(false)
  // A PRESS BELONGS TO ONE PROJECT AND ONE READ. A switch of project starts a read nobody pressed, so
  // that read must not carry the press's light. `fromThePress` says the next read is the press's;
  // `pressProject` is the project it was pressed in, so a switch that overtakes it is not mistaken for
  // it. The read clears the mark as it starts, and the light goes with it.
  const fromThePress = useRef(false)
  const pressProject = useRef<string | null>(null)
  const [state, reload] = useProjectAsync(async () => {
    const mine = ++started.current
    const thisReadIsThePress = fromThePress.current && pressProject.current === currentWorkspace()
    fromThePress.current = false
    setFromAPress(thisReadIsThePress)
    setThePressAnswered(false)
    // The moment the request goes out. See the note above `readingStamp`: the sweep happens
    // between this and the reply, so dating the reading here never claims it is newer than it is.
    const at = Date.now()
    try {
      return { data: await fetchSessionsPage(), at }
    } catch (err: unknown) {
      if (mine === started.current) failedAt.current = Date.now()
      throw err
    } finally {
      if (mine === started.current) {
        setFromAPress(false)
        setThePressAnswered(thisReadIsThePress)
      }
    }
  }, [], { saysRefreshing: true })
  const reading = state.status === 'loading' || (state.status === 'ready' && state.refreshing === true)
  // A press while a read is out does nothing, so a second press during a slow sweep cannot stack a
  // second request on the first.
  const busy = useRef(reading)
  busy.current = reading
  const readAgain = (): void => {
    if (busy.current) return
    busy.current = true
    fromThePress.current = true
    pressProject.current = currentWorkspace()
    setFromAPress(true)
    reload()
  }
  if (state.status === 'loading') return { taken: null, inFlight: true, inFlightFromAPress: fromAPress, theLastReadWasFromAPress: thePressAnswered, failed: null, readAgain }
  if (state.status === 'error') {
    return { taken: null, inFlight: false, inFlightFromAPress: false, theLastReadWasFromAPress: thePressAnswered, failed: { at: failedAt.current, message: state.message, fault: state.fault }, readAgain }
  }
  return {
    taken: state.value,
    inFlight: state.refreshing === true,
    inFlightFromAPress: state.refreshing === true && fromAPress,
    theLastReadWasFromAPress: thePressAnswered,
    failed: state.reReadError === undefined ? null : { at: failedAt.current, ...state.reReadError },
    readAgain,
  }
}

/**
 * Kill one orphaned resource, sending back the phrase the reader was shown.
 *
 * `expect` is the whole safety mechanism: the server compares it against the phrase it would
 * produce now, and a mismatch is a 400 that means this screen is describing a machine that has
 * moved on. Nothing is retried here — the caller shows the refusal and offers a fresh read.
 */
export function releaseOrphan(orphan: Orphan, expect: string): Promise<ReleaseReport> {
  return sessionRequest<unknown>(`/api/resources/${encodeURIComponent(orphan.id)}/release`, {
    method: 'POST',
    body: JSON.stringify({ expect }),
  }).then((body) => readReleaseReply(body, orphan))
}

// ============================================================================ the stylesheet
/**
 * Every value below is a token from tokens.css or a `--sx-*` local. No hex, no type size.
 *
 * It lives here rather than in styles.css because that file belongs to another agent this
 * phase. React 19 hoists `<style href precedence>` into the head and de-duplicates by href, so
 * this is one element however many times the page renders it.
 */
export const SESSIONS_CSS = `
/* ---- the tally: all six states, always, above everything ---------------------------- */
.sx-tally {
  display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut);
  margin: 0 0 var(--gut);
  padding: 0 var(--pad);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-2);
}
.sx-tally-one {
  display: inline-flex; align-items: center; gap: 5px;
  white-space: nowrap;
  color: var(--sx-tone);
}
.sx-tally-one b { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }
.sx-tally-one .px-glyph { width: var(--px-glyph); height: var(--px-glyph); flex: none; fill: none; }
/* A state with nothing in it keeps its word and goes quiet. "0 crashed" is information. */
.sx-tally-one[data-zero="1"] { color: var(--text-3); }
.sx-tally-one[data-zero="1"] b { color: var(--text-3); font-weight: 600; }

/* Navigates, so it is underlined at rest -- ui.tsx's affordance grammar. Never a box. */
.sx-all {
  color: var(--accent);
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  text-decoration: underline;
  text-underline-offset: .16em;
  white-space: nowrap;
}
.sx-all:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}

/* ---- orphans ------------------------------------------------------------------------- */
.sx-orphans {
  --px-tone: var(--st-overdue);
  --px-tone-line: var(--st-overdue-line);
  margin: 0 0 var(--gut);
  padding: var(--pad) var(--pad) 2px;
  border: var(--border-w) solid var(--px-tone-line);
  border-left: var(--rail) solid var(--px-tone);
  border-radius: var(--radius);
  background: var(--st-overdue-row);
}
.sx-orphans-head {
  display: flex; align-items: baseline; gap: 6px;
  margin: 0 0 var(--pad);
  font: var(--st-overdue-weight) var(--fs-2)/var(--lh-tight) var(--font-ui);
  color: var(--text);
}
.sx-orphans-head .px-glyph {
  width: var(--px-glyph); height: var(--px-glyph); flex: none; fill: none;
  color: var(--st-overdue); align-self: center;
}
.sx-orphan-list { list-style: none; margin: 0; padding: 0; }
.sx-orphan { padding: var(--pad) 0; }
.sx-orphan + .sx-orphan { border-top: var(--border-w) solid var(--border); }
.sx-orphan-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
/* A small basis, so the release button keeps its place on the first line at 390px instead of
   being pushed onto a line of its own by a long mono pid string. */
.sx-orphan-what { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; flex: 1 1 6em; min-width: 0; }
.sx-orphan-label { font: var(--fs-2)/var(--lh-body) var(--font-mono); color: var(--text); min-width: 0; }
.sx-orphan-act { display: inline-flex; align-items: center; gap: var(--pad); margin-left: auto; }
/* Phone: the description gets the whole width and the button drops below it. At 390 the button
   was squeezing "pid 3302512, group 3302496" into a four-line column, and the exact thing that
   is about to be killed is the last text on this page that should be hard to read. */
@media (max-width: 480px) {
  .sx-orphan-what { flex: 1 1 100%; }
  .sx-orphan-act { margin-left: 0; }
}
.sx-orphan-meta {
  display: flex; flex-wrap: wrap; gap: 2px var(--pad);
  margin: 4px 0 0;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-2);
}
.sx-orphan-from { color: var(--text-3); }
.sx-orphan-done {
  display: flex; align-items: center; gap: 6px; margin: 0;
  font: var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--st-done);
}
.sx-orphan-done .px-glyph { width: var(--px-glyph); height: var(--px-glyph); flex: none; fill: none; }

/* ---- unclaimed: the same shape as the orphan block, ranked above it -------------------
   The two blocks are deliberately siblings: same geometry, same row rhythm, so the eye reads
   them as one family and the DIFFERENCE is carried by the tone and the glyph. The broken state
   is a severed link, which is exactly what an unclaimed process is -- alive, with nothing at the
   other end of it. The orphan block's clock says "get round to this"; this says "nobody can
   even tell you whose this is". No backticks in here: this whole block is a template literal. */
.sx-unclaimed {
  --px-tone: var(--st-broken);
  --px-tone-line: var(--st-broken-line);
  margin: 0 0 var(--gut);
  padding: var(--pad) var(--pad) 2px;
  border: var(--border-w) solid var(--px-tone-line);
  border-left: var(--rail) solid var(--px-tone);
  border-radius: var(--radius);
  /* NO FILL. The rail and the border carry the hue, and the heading and the age chips carry the
     rest. A filled tint here painted six hundred pixels of the sessions page in the alarm colour
     for five processes on a developer's machine, which is neither urgent nor overdue; approved
     decision 2 spends that fill on things that are. Nothing is quieter than it was by a step
     anybody has to learn -- the shape is the same, only the fill is gone. */
}
/* Swept, and clear. No spine and no fill: a block that shouts when there is nothing to shout
   about is how a reader learns to stop looking at the one above it. */
.sx-unclaimed[data-clear="1"] {
  border: none;
  border-left: var(--border-w) solid var(--border);
  border-radius: 0;
  background: none;
  padding: 2px var(--pad);
}
.sx-unclaimed-head {
  display: flex; align-items: baseline; gap: 6px;
  margin: 0 0 var(--pad);
  font: var(--st-broken-weight) var(--fs-2)/var(--lh-tight) var(--font-ui);
  color: var(--text);
}
.sx-unclaimed-head .px-glyph {
  width: var(--px-glyph); height: var(--px-glyph); flex: none; fill: none;
  color: var(--st-broken); align-self: center;
}
.sx-unclaimed-clear {
  margin: 0;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-3);
  max-width: var(--measure-in-box);
}
/* Two lines, then it stops. A holder's command line is a DESCRIPTION -- one of these is a
   200-character Zotero path that took five wrapped lines on this machine and pushed the fourth
   unclaimed thing off the panel. It is cut by the box rather than by an ellipsis in the string,
   so nothing is rewritten: the whole line is on the element's title, and the key that identifies
   the row comes first. The kill command is NOT treated this way -- it is in the server's own
   sentence under the row, in full, because that is the text a person retypes. */
.sx-unclaimed-what {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.sx-unclaimed-list { list-style: none; margin: 0; padding: 0; }

/* ---- the confirmation ---------------------------------------------------------------- */
.sx-confirm {
  margin: var(--pad) 0 2px;
  padding: var(--pad);
  border: var(--border-w) solid var(--st-failed-line);
  border-radius: var(--radius-sm);
  background: var(--st-failed-bg);
}
/* A refusal is not the same event as a confirmation, and must not look like one: the machine
   moved, nothing died, and the only thing on offer is a fresh reading. */
.sx-confirm[data-stale="1"] {
  border-color: var(--st-overdue-line);
  background: var(--st-overdue-row);
}
.sx-confirm-line {
  margin: 0;
  font: var(--st-failed-weight) var(--fs-2)/var(--lh-body) var(--font-ui);
  color: var(--text);
}
.sx-confirm-cmd { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin: var(--pad) 0 0; }
.sx-confirm-act { margin-top: var(--pad); }
.sx-also-block { margin: var(--pad) 0 0; }
.sx-also-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.sx-also {
  padding-left: var(--pad);
  border-left: var(--border-w) solid var(--border-strong);
  font: var(--fs-1)/var(--lh-body) var(--font-mono);
  color: var(--text-2);
  min-width: 0;
}
.sx-also-none { margin: 4px 0 0; font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2); }

/* ---- commands ------------------------------------------------------------------------ */
.sx-cmd {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--pad);
  min-width: 0;
}
.sx-cmd-label {
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .06em; text-transform: uppercase; color: var(--text-3);
  white-space: nowrap;
}
.sx-cmd-text {
  flex: 1 1 16em; min-width: 0;
  padding: 4px 6px;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
  font: var(--fs-2)/var(--lh-body) var(--font-mono);
  color: var(--text);
}
.sx-cmd-act { flex: none; }
.sx-cmd-missing, .sx-note-bad {
  display: flex; align-items: flex-start; gap: 6px;
  margin: 4px 0 0;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-2);
}
.sx-cmd-missing .px-glyph, .sx-note-bad .px-glyph {
  width: var(--px-glyph); height: var(--px-glyph); flex: none; fill: none;
}
.sx-note-bad { color: var(--st-failed); }

/* INLINE CODE IN THIS PAGE'S PROSE KEEPS THE PARAGRAPH'S SIZE.

   MEASURED, and it was the only text on this page below the 13px floor. styles.css sets every
   code, kbd, samp and pre to 0.925em, which is right inside a 16px paragraph and wrong inside a
   13px one: 13 x 0.925 is 12.03px, and the UX contract's floor for a sentence is 13. One directory
   name in the placement explanation was drawn at 12.03px for that reason.

   THE GENERAL CAUSE IS NOT THIS FILE'S. Any prose in this app set at the smallest step has the
   same problem the moment it contains a code element; it is reported to whoever owns styles.css.
   This rule fixes the page. Every prose class on this surface that can hold one is named. */
.sx-empty code, .sx-band-what code, .px-empty code {
  font-size: 1em;
}

/* ---- problems, notes and empties ------------------------------------------------------ */
.sx-empty {
  margin: 0; padding: var(--pad);
  font: var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text-2);
}
.sx-note {
  margin: var(--gut) 0 0; padding: 0 var(--pad);
  font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-3);
}
.sx-warning {
  margin: 0 0 var(--gut); padding: var(--pad);
  border: var(--border-w) solid var(--st-overdue-line);
  border-left: var(--rail) solid var(--st-overdue);
  border-radius: var(--radius-sm);
  background: var(--st-overdue-row);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text);
}
/* ---- when this reading was taken ------------------------------------------------------
   QUIET, AND ALWAYS THERE. It is not a warning — a dated reading is the honest state, not a
   problem — so it takes the same tone as the other footnotes on this panel and sits at the same
   measure. The button wraps under the sentence on a phone rather than squeezing it. */
/* ---- looking on this computer for agent runs -----------------------------------------
   Same shape as the reading line above it: a sentence that wraps, a press that does not, and
   whatever the press found underneath both of them at full width. */
.sx-look {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--gut);
  margin: var(--gut) 0 0; padding: 0 var(--pad);
}
.sx-look-say {
  margin: 0; min-width: 0; flex: 1 1 18em; max-width: var(--measure-in-box);
  font: var(--fs-1)/1.72 var(--font-ui); color: var(--text-2);
  overflow-wrap: break-word;
}
.sx-look-say b { color: var(--text); font-weight: 700; font-variant-numeric: tabular-nums; }
.sx-look-act { flex: none; }
.sx-look-did { flex: 1 1 100%; display: flex; flex-direction: column; gap: 4px; }
.sx-look-did .sx-look-say { flex: none; }
.sx-look-unread {
  margin: 0; padding-left: var(--pad-lg);
  font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-2);
}

.sx-read {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--gut);
  margin: var(--gut) 0 0; padding: 0 var(--pad);
}
.sx-read-at {
  margin: 0; min-width: 0; flex: 1 1 18em; max-width: var(--measure-in-box);
  font: var(--fs-1)/1.72 var(--font-ui); color: var(--text-3);
  overflow-wrap: break-word;
}
.sx-read-at b { color: var(--text-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.sx-read-act { flex: none; }
/* A failed RE-read, under a reading that is still good. Full width of the block, because it is a
   correction to the line above it and not a second column beside it. */
.sx-read-failed {
  flex: 1 1 100%;
  margin: 0; padding: var(--pad);
  border: var(--border-w) solid var(--st-broken-line);
  border-radius: var(--radius-sm);
  background: var(--st-broken-bg);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text);
  overflow-wrap: break-word;
}

.sx-problems { display: flex; flex-direction: column; gap: 6px; margin-top: var(--gut); }
.sx-problem {
  display: flex; align-items: flex-start; flex-wrap: wrap; gap: 6px; margin: 0;
  padding: var(--pad);
  border: var(--border-w) solid var(--st-broken-line);
  border-radius: var(--radius-sm);
  background: var(--st-broken-bg);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text);
}
.sx-problem .px-glyph {
  width: var(--px-glyph); height: var(--px-glyph); flex: none; fill: none; color: var(--st-broken);
}
.sx-problem span { min-width: 0; flex: 1 1 12em; }
.sx-problem .sx-raw { overflow-wrap: anywhere; }
.sx-searched {
  margin: var(--gut) 0 0; padding: 0 var(--pad);
  font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-3);
}
.sx-searched summary { cursor: pointer; }
.sx-searched-list { list-style: none; margin: 4px 0 0; padding: 0; font-family: var(--font-mono); }

/* ---- the sessions page --------------------------------------------------------------- */
.sx-page-head { margin: 0 0 var(--gut); }
/* The same three declarations .rec-title and .qp-title carry. Written out rather than shared
   because the three live in three page stylesheets; if a fourth page wants it, move it to
   styles.css instead of writing it a fourth time. */
/* No .sx-page-lede: the page's h1 is the whole head now, so the last margin belongs to the title. */
.sx-page-title { margin: 0; font-size: var(--fs-6); font-weight: 600; line-height: var(--lh-tight); color: var(--text); }
.sx-list { display: flex; flex-direction: column; gap: var(--gut); }
.sx-card { padding: var(--pad) 0; }
.sx-card + .sx-card { border-top: var(--border-w) solid var(--border); }
.sx-card-head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--pad); min-width: 0; }
.sx-card-title {
  font: 700 var(--fs-3)/var(--lh-tight) var(--font-ui);
  color: var(--text);
  text-decoration: underline; text-underline-offset: .16em;
  min-width: 0;
}
/* A discovered session with no record has nothing to open, so its title is bare text -- the
   same grammar as a Row without an href, and the only honest way to show "not filed yet". */
.sx-card-title[data-plain="1"] { text-decoration: none; }
.sx-card-when { margin-left: auto; font: var(--fs-1)/var(--lh-tight) var(--font-ui); color: var(--text-3); white-space: nowrap; }
.sx-purpose { margin: 6px 0 0; font: var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text-2); max-width: var(--measure-in-box); }
/* Why the server says it is in that state. Quiet for a calm one; spined and tinted only when it
   crashed, so the tint keeps meaning "this one needs you" rather than "this one ended". */
.sx-detail {
  margin: 6px 0 0; padding: 6px var(--pad);
  border-left: var(--rail) solid var(--border-strong);
  background: var(--panel-2);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font: var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text-2);
}
.sx-detail[data-crashed="1"] {
  border-left-color: var(--st-crashed);
  background: var(--st-crashed-row);
  color: var(--text);
  font-weight: var(--st-crashed-weight);
}
/* The facts grid. One column on a phone; two once there is room for a label and a long path.
   The dd margin reset is not cosmetic: a browser's default dd is indented 40px, and inside a
   grid that indent is added to the column, which pushed the whole PAGE 48px sideways at 390. */
.sx-facts {
  display: grid; grid-template-columns: 1fr; gap: 4px var(--gut);
  margin: var(--pad) 0 0;
}
.sx-facts dd { margin: 0; }
.sx-facts dt { margin: 0; }
@media (min-width: 720px) { .sx-facts { grid-template-columns: max-content minmax(0, 1fr); } }
.sx-fact-key {
  font: 600 var(--fs-1)/var(--lh-body) var(--font-ui);
  letter-spacing: .06em; text-transform: uppercase; color: var(--text-3);
}
.sx-fact-val {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px;
  font: var(--fs-2)/var(--lh-body) var(--font-ui); color: var(--text); min-width: 0;
}
.sx-fact-val[data-mono="1"] { font-family: var(--font-mono); }
/* An absent value is drawn by the product's own Absence mark now, so this file has no rule for
   one. It used to have data-missing here, in italic quiet ink, which was a second convention for
   the same idea sitting beside the shared one. */
.sx-cmds { display: flex; flex-direction: column; gap: 6px; margin: var(--pad) 0 0; }

/* ---- grouped sessions -----------------------------------------------------------------
   A group is a heading, its explanation ONCE, and its rows. The heading is a plain sentence
   after a number because "7 crashed" is read in one movement and "CRASHED (7)" is read twice.
   No backticks anywhere below: this whole block is a template literal. */
.sx-groups { display: flex; flex-direction: column; gap: var(--gut); }
.sx-group + .sx-group { border-top: var(--border-w) solid var(--border); padding-top: var(--gut); }
.sx-group-head {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px;
  margin: 0 0 4px;
  font: 700 var(--fs-3)/var(--lh-tight) var(--font-ui);
  color: var(--text);
}
.sx-group-count { font-variant-numeric: tabular-nums; }
/* The server's sentence, quoted rather than restated, so it is visibly not this page's words. */
.sx-group-quote { font-style: italic; }
/* WHY THESE RUNS ARE FILED HERE, ONCE FOR THE WHOLE PROJECT GROUP, above its bands. Same ink and
   same size as the sentence a state group shares, because it is the same kind of statement: one
   sentence with the number of rows it covers. */
.sx-place-shared { margin: 0 0 var(--gut); }
.sx-place-said {
  margin: 0 0 4px;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-3);
  max-width: var(--measure-in-box);
}
.sx-lines { display: flex; flex-direction: column; }

/* ---- two levels: the pipeline or module, then the state word inside it -----------------
   The project heading is the loud one and the band under it is quieter, because the reader
   is looking for WHICH PIECE OF WORK first and WHAT HAPPENED TO IT second. No uppercase and
   no letter-spacing on either: both hold record titles, and titles here hold Chinese. */
.sx-projects { display: flex; flex-direction: column; gap: var(--gut); }
.sx-proj { margin: 0; }
.sx-proj + .sx-proj { border-top: var(--border-w) solid var(--border); padding-top: var(--gut); }
.sx-proj-head, .sx-proj-sum {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px var(--pad);
  margin: 0 0 var(--pad);
  font: var(--fs-2)/var(--lh-tight) var(--font-ui);
  color: var(--text-2);
}
.sx-proj-sum { cursor: pointer; margin: 0; }
/* A summary laid out with flex loses the browser's own disclosure triangle, so both folds draw
   their own. Without it a folded group reads as a heading with nothing under it, which is exactly
   the "something has gone missing" feeling every fold here is written to avoid. */
.sx-proj-sum::before, .sx-band-sum::before { content: "\\25B8"; flex: none; color: var(--text-3); }
details[open] > .sx-proj-sum::before, details[open] > .sx-band-sum::before { content: "\\25BE"; }
.sx-proj-sum::-webkit-details-marker, .sx-band-sum::-webkit-details-marker { display: none; }
.sx-proj-sum:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
.sx-proj-name { font: 700 var(--fs-4)/var(--lh-tight) var(--font-ui); color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.sx-proj-tally { color: var(--text-3); font-variant-numeric: tabular-nums; }
.sx-proj-body { padding-top: var(--pad); }
/* A whole project with nothing alive in it. Quieter, because it is history and says so. */
.sx-proj[data-quiet="1"] .sx-proj-name { font-weight: 600; color: var(--text-2); }

.sx-band { margin: 0 0 var(--gut); }
.sx-band:last-child { margin-bottom: 0; }
.sx-band-head, .sx-band-sum {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px var(--pad);
  margin: 0 0 4px;
  font: 600 var(--fs-2)/var(--lh-tight) var(--font-ui);
  color: var(--text-2);
}
.sx-band-sum { cursor: pointer; }
.sx-band-sum:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
/* The named state groups behind a fold, always beside the count and never replaced by it. */
.sx-band-groups { font-weight: 400; color: var(--text-3); }
.sx-band-body { padding: var(--pad) 0 0; }
.sx-band-what {
  margin: 0 0 var(--pad);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-3);
  max-width: var(--measure-in-box);
}
/* The action band carries the alarm hue on a rail, so the eye finds it without reading. */
.sx-band[data-band="action"] > .sx-band-head { color: var(--text); }
.sx-note-band { font-weight: 400; color: var(--text-3); }

/* ---- what a group is made of, as a proportion -----------------------------------------
   One segment per state group, as wide as its share, in the order the page is in. The ink is the
   drawing's own neutral step, through STATE_DRAWING_INK, so a segment and the chips on the rows
   under it cannot disagree. No backticks in here: this whole block is a template literal. */
.sx-strip {
  display: flex; align-items: stretch;
  flex: 0 1 clamp(80px, 18vw, 220px);
  gap: 1px;
  height: 8px;
  align-self: center;
  border-radius: 999px;
  overflow: hidden;
}
.sx-strip-seg {
  /* A hairline basis so a group of one row out of ninety-one is still a mark and not a rounding
     error. The share is carried entirely by flex-grow, which is set from the count. */
  flex-basis: 2px; min-width: 2px;
  background: var(--sx-tone);
}

/* ---- the rows a group did not draw ----------------------------------------------------
   The count, what is in it and the rows themselves. Quiet, because it is the tail of a group
   whose head is already on the screen. */
.sx-rest { margin: 0; }
.sx-rest-sum {
  cursor: pointer;
  padding: 4px var(--pad);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-3);
  max-width: var(--measure-in-box);
  /* The browser's own triangle sits outside the box and reads as a bullet, and this summary draws
     its own. Both the list-style and the WebKit pseudo-element are needed: engines disagree about
     which one owns the marker, and with only one of them set the row grew a second arrow. No
     backticks in here -- this whole block is a template literal. */
  list-style: none;
}
.sx-rest-sum::before { content: "\\25B8"; margin-right: 6px; color: var(--text-3); }
.sx-rest[open] > .sx-rest-sum::before { content: "\\25BE"; }
.sx-rest-sum::-webkit-details-marker { display: none; }
.sx-rest-sum:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
.sx-rest-sum .sx-group-count { color: var(--text); font-weight: 700; }

/* ---- one session row, and what it opens ----------------------------------------------- */
.sx-line + .sx-line { border-top: var(--border-w) solid var(--border); }

/* THE TOOL TAG AND THE ORIGIN PILL ARE TWO MARKS, NOT ONE WORD. They sat in the row as bare
   inline boxes, so with no whitespace between them the tool name touched the pill's glyph and
   read as one phrase. The lead is a flex line now, with the page's chip gap between its marks;
   when the line is too narrow for both, the pill wraps under the name with the same gap. */
.sx-line .px-scan-lead { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; }

/* A SESSION ROW IS ONE LINE AT REST.

   ScanRow puts what-opens in the third column UNDER the age, so every row is two lines tall.
   That is right on the attention list, where seven rows carry a sentence each. Here it is
   ninety-one rows, and the second line holds nothing a scan uses: the fold's own words and its
   count. Measured on this machine, the second line was twenty pixels of every row, which is
   about 1,300px of the sessions page.

   THIS OVERRIDES ANOTHER COMPONENT'S GRID FROM OUTSIDE IT, AND THAT IS THE WRONG HOME FOR IT.
   The right one is a density option on ScanRow itself in ui.tsx, which this pass does not own,
   so it is scoped to .sx-line and reported rather than reached into. Nothing is hidden: the
   same four cells are drawn, on one line instead of two. */
.sx-line .px-scan-sum { grid-template-columns: var(--px-col-sev) minmax(0, 1fr) auto auto; }
.sx-line .px-scan-age { grid-column: 3; grid-row: 1; align-self: center; }
.sx-line .px-scan-open { grid-column: 4; grid-row: 1; align-self: center; }
/* Phone: the same idea one step down. ui.tsx drops the severity column below 480px, which puts
   the chip, the title and the clock on three separate lines -- eighty pixels a row before
   anything is read. The chip goes back beside the title, and the clock beside what opens.

   THIS BLOCK IS WHAT MADE THE SIDEWAYS SCROLL BITE, AND IT IS NOT WHAT CAUSED IT. Measured at 390
   on 15 August 2026: the page was 421px wide in the panelx project and 423 in greenhouse, in both
   themes. The cause was in ui.tsx -- a scan row's lead cell held flex: none, so a lead made of a
   tool tag plus an origin mark stayed at its full 236px whatever it was put in. What this block
   does is put that lead in a column of about 190px instead of the full width ui.tsx gives it, so
   the row that could not shrink was asked to. The owner of ui.tsx changed the lead to shrink; with
   that in place this block measures 390 at 390 in both projects and both themes, and no fix of the
   same thing is written here. If the page ever scrolls sideways again, measure the lead's width
   before touching this block: a second copy of somebody else's fix, scoped to one page, is how two
   rules for one layout start disagreeing. */
@media (max-width: 480px) {
  .sx-line .px-scan-sum { grid-template-columns: auto minmax(0, 1fr); }
  .sx-line .px-scan-sev { grid-column: 1; grid-row: 1; align-self: center; }
  .sx-line .px-scan-main { grid-column: 2; grid-row: 1; }
  .sx-line .px-scan-age { grid-column: 1; grid-row: 2; text-align: left; }
  .sx-line .px-scan-open { grid-column: 2; grid-row: 2; justify-content: flex-start; }
  /* A LONG WAIT ON A USAGE LIMIT is the longest word a state chip holds. In the auto column it took
     the row and left the title one letter wide (photographed at 390 on 6 November 2026), so its
     column is at most 10rem and the chip's words wrap in it. */
  .sx-line[data-waits-long] .px-scan-sum { grid-template-columns: fit-content(10rem) minmax(0, 1fr); }
}
/* These sit INSIDE the row's own meta cell, so they line up with the title at every width and
   under either severity column. Nothing here indents anything; the grid does it. */
/* An absence is drawn the same way everywhere on this page: italic, in the quiet ink. See
   .sx-fact-val[data-missing] above -- one convention, so "nothing was recorded here" reads as the
   same kind of statement wherever it appears. */
.sx-line-reason[data-missing="1"] { font-style: italic; }
.sx-line-reason, .sx-line-bare, .sx-line-more {
  margin: 4px 0 0;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-3);
  max-width: var(--measure-in-box);
}
.sx-line-sum { cursor: pointer; color: var(--accent); }
.sx-line-sum:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
.sx-line-body {
  margin-top: var(--pad);
  padding: var(--pad) 0 var(--pad) var(--pad);
  border-left: var(--border-w) solid var(--border-strong);
}
.sx-row-written { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
.sx-row-disagree { color: var(--st-inferred); }
/* The record's own word sits after the title inside one text flow, so it needs its own space:
   without this "Set up GR00T" and "NOT FILED" run together into one word. It is empty on most
   rows -- see WrittenMark.
   THE SPACE IS EACH MARK'S OWN MARGIN, not the holder's. A mark is a box that narrows to the row
   when it is too wide for it, and a box counts only its own margin when it narrows. With the space on
   the holder, the third process mark narrowed to the whole row and still started 8 pixels in, so it
   ran 8 pixels past the row at 660 and 390 (wave 13y round 30). */
.sx-line-mark > * { margin-left: 8px; }
/* What the row was doing, and how Mole Office placed it. Both inside the fold; both prose, so both
   wrap at the reading measure rather than running the width of a 1440px screen. */
.sx-line-doing, .sx-place, .sx-place-also {
  margin: 4px 0 0;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-2);
  max-width: var(--measure-in-box);
}
.sx-place, .sx-place-also { color: var(--text-3); }
.sx-place[data-missing="1"] { font-style: italic; }
.sx-place-list {
  margin: 4px 0 0;
  padding-left: 1.2em;
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-3);
  max-width: var(--measure-in-box);
}

/* ---- a fold that says exactly what is in it ------------------------------------------- */
.sx-fold {
  margin: 0;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--panel-2);
}
.sx-fold-sum {
  cursor: pointer;
  padding: var(--pad);
  font: var(--fs-2)/var(--lh-body) var(--font-ui);
  color: var(--text-2);
}
.sx-fold-sum:focus-visible {
  outline: var(--focus-w) solid var(--focus);
  outline-offset: var(--focus-offset);
  border-radius: var(--radius-sm);
}
.sx-fold-body { padding: 0 var(--pad) var(--pad); }
.sx-fold .sx-unclaimed-list { padding: 0 var(--pad) var(--pad); }

/* ---- the machine surface: one row per holding process --------------------------------- */
.sx-holder { padding: var(--pad) 0; }
.sx-holder + .sx-holder { border-top: var(--border-w) solid var(--border); }
.sx-held-list { list-style: none; margin: 4px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.sx-held {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px;
  padding-left: var(--pad);
  border-left: var(--border-w) solid var(--border-strong);
  min-width: 0;
}
.sx-held-kind {
  font: 600 var(--fs-1)/var(--lh-tight) var(--font-ui);
  letter-spacing: .06em; text-transform: uppercase; color: var(--text-3);
  white-space: nowrap;
}
/* Two lines, then it stops: one holder's command line here is a 200-character Zotero path. The
   whole string is on the element title, and the key that identifies the row comes first. */
.sx-held-what {
  flex: 1 1 12em; min-width: 0;
  font: var(--fs-1)/var(--lh-body) var(--font-mono); color: var(--text-2);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}

/* ---- the machine in one line, for a surface that is not about the machine -------------- */
.sx-machine-line {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px var(--pad);
  margin: var(--gut) 0 0; padding: var(--pad);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  font: var(--fs-1)/var(--lh-body) var(--font-ui);
  color: var(--text-2);
}
/* A POINTER, NOT AN ALARM. This line is the compact summary approved decision 3 asks for on a
   surface that is not about the machine, and it says "there are five things running that nothing
   claims — the full list is over there". That is worth seeing and it is not urgent and not
   overdue, so it does not get the filled tint: on the home page it sat beside an emergency stop
   at exactly the same strength, and five processes on a developer's machine is the normal case.
   The hue stays on the glyph and on the rail, at outline weight, which is enough to find. */
.sx-machine-line[data-tone="bad"] {
  border-color: var(--border-strong);
  border-left: var(--rail) solid color-mix(in srgb, var(--st-broken) 55%, transparent);
  color: var(--text);
}
.sx-machine-line .px-glyph {
  width: var(--px-glyph); height: var(--px-glyph); flex: none; fill: none; align-self: center;
}
.sx-machine-line[data-tone="bad"] .px-glyph { color: var(--st-broken); }
.sx-machine-line[data-tone="quiet"] .px-glyph { color: var(--st-done); }
.sx-machine-line span { min-width: 0; }
.sx-machine-bit { color: var(--text-2); }

/* ---- the sessions page's own head ------------------------------------------------------ */
.sx-arithmetic {
  margin: 0 0 var(--gut); padding: 0 var(--pad);
  font: var(--fs-1)/var(--lh-body) var(--font-ui); color: var(--text-3);
  max-width: var(--measure-in-box);
}
.sx-arithmetic b { color: var(--text); font-variant-numeric: tabular-nums; }
`
