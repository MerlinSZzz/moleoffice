// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Reading the server's answer to "what needs me today" — and the readers for the record kinds
 * the pages draw.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE IS NOT HERE ANY MORE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * This file used to decide what needs a person. It held six hard-coded conditions — crashed
 * session, failed item, stale `doing` item, obligation due inside 48 hours, broken link,
 * unreviewed agent write — a fixed tier order, and a cap of seven rows.
 *
 * It was measured, and it failed in a way no redrawing could fix. The corpus held exactly SEVEN
 * crashed sessions, `crashed` was the first tier, and the cap was seven. So the panel was seven
 * crashed sessions at every setting of every input; an obligation six days past its date sat at
 * row fourteen; and a software emergency stop recorded as doing nothing — filed three times, with
 * a person standing next to the arm — was excluded by name, because `open` problems were not one
 * of the six conditions.
 *
 * The rule now lives in src/shared/attention.ts, the server runs it, and `GET /api/attention`
 * serves the whole answer. The rule is:
 *
 *     A thing needs attention when it is OWED to somebody outside this project,
 *     or when its own recorded state says the work STOPPED SHORT of finishing.
 *
 * EVERY ROW CARRIES ITS OWN REASON at `row.reason`: which half of the rule selected it, who is
 * hurt as STORED, a `because` sentence in plain English, and every rank factor with its points and
 * a sentence. THE INTERFACE MUST NOT RE-DERIVE ANY OF THAT. It draws what the server sent and
 * shows the reason. A second implementation of "what needs me today" is the one piece of
 * duplication in this product that would be actively dangerous, and this file is where the last
 * one lived.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FETCH IS IN src/web/api.ts AND NOT HERE
 * ---------------------------------------------------------------------------------------
 *
 * `api.attention()`, `api.anchor()`, `api.markReadTo()` and `api.fulfilObligation()` are in
 * src/web/api.ts, where every call the browser makes lives. This file imports their reply TYPES
 * and nothing else, so it stays a pure module with no fetch, no storage and no clock of its own.
 *
 * That is not tidiness. src/server/lib/records.ts imports `parseDueStamp` from this file — a bare
 * "2026-08-03" is due at the END of the 3rd, that rule exists exactly once, and a second copy on
 * the server would be two places disagreeing about whether the same record is overdue on the same
 * day. src/web/api.ts reads `window.localStorage` while it is being evaluated, so a value import of
 * it here would take the SERVER down the moment it loaded this file. (The real fix is to move
 * `parseDueStamp` into src/shared/time.ts beside the other stamp readers. That file belongs to
 * somebody else this phase, so it is reported and not moved.)
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE DOES HOLD
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE STAMP READERS AND THE DURATION WORDING. Local time, never UTC — see below.
 *   2. THREE READERS FOR RECORD KINDS. `data` is an open JSON bag the database does not check, so
 *      something has to turn it into typed values, and it has to do that WITHOUT inventing
 *      defaults: a record that cannot be read is reported with what is wrong, never silently given
 *      a value. Home draws the pipelines reader. The sessions and obligations readers are called by
 *      scripts/seed.ts only, to check the demo data it writes; no page calls them.
 *   3. TWO PURE READINGS OVER WHAT THE SERVER SENT — which of three answers the anchor gave, and
 *      whether this machine was actually looked at. Both exist for the same reason: in each, an
 *      EMPTY answer and a MISSING answer would otherwise be drawn identically, and "nobody has
 *      looked yet" drawn as "nothing has happened" is the one mistake this product must not make.
 *
 * THREE THINGS THAT COULD HAVE LANDED HERE AND DELIBERATELY DID NOT, named so that nobody writes a
 * third copy of any of them:
 *
 *   HOW LOUDLY A ROW IS DRAWN — approved decision 2 — is `ALARM_LEVELS` and `alarmFor()` in
 *   src/web/components/ui.tsx, which reads `row.safety`, `row.reason.owed.lateMs` and the row's age
 *   straight off the reply.
 *
 *   WHAT A SHORTENED LIST SAYS ABOUT WHAT IT IS HIDING — approved decision 7 — is `HiddenCount` in
 *   the same file, which refuses to draw at all unless it is given the named groups.
 *
 *   GROUPING THE FOURTEEN KINDS INTO FIVE FAMILIES — approved decision 6 — is `KIND_FAMILIES` and
 *   `familyOf` in src/shared/work.ts, which both ends read. A family is for headings and reading
 *   order only: never a colour, and never a piece of state.
 *
 * ---------------------------------------------------------------------------------------
 * TIMESTAMPS ARE LOCAL
 * ---------------------------------------------------------------------------------------
 *
 * src/server/lib/records.ts writes "YYYY-MM-DD HH:MM:SS" built from getFullYear()/getHours(),
 * i.e. LOCAL time, deliberately, so that "today" means the operator's day. Every duration here is
 * measured with the local reading below, because the server's own clock arithmetic is local.
 *
 * This file used to carry a warning that `parseStamp` in components/ui.tsx read the same string as
 * UTC — an hour of disagreement on this machine, invisible in "3d ago" and very visible in "due in
 * 2h". That has been fixed: `parseStamp` now delegates to the one reader in src/shared/time.ts, and
 * so does `parseLocalStamp` below. The warning is removed rather than left standing, because a
 * comment describing a defect that no longer exists sends the next reader looking for it.
 */

import { DAY_MS, DUE_SOON_HOURS, HOUR_MS } from '@shared/attention.ts'
import { readPipelineBlocks, type PipelineBlockView } from '@shared/blocks.ts'
import { dayInThePageLanguage, t } from '@shared/i18n.ts'
import { isBareDateStamp, parseLocalStamp } from '@shared/time.ts'
import type { DueForm } from '@shared/deadlines.ts'
import type { Change, PanelRecord } from '@shared/types.ts'
// TYPE ONLY, and erased before this module runs. See the header: a value import of api.ts here
// would make the server load browser code that reads window.localStorage at module scope.
import type { AnchorReading, AttentionHome, AttentionReply } from '../api.ts'

// ---------------------------------------------------------------------------- constants

export const MINUTE_MS = 60_000

/**
 * An hour and a day in milliseconds, and how far ahead of its date something counts as due soon.
 *
 * RE-EXPORTED FROM src/shared/attention.ts, not declared again. All three were second copies of
 * constants the rule itself already publishes, and `DUE_SOON_HOURS` in particular is the window
 * the server uses to decide what a `late` rank factor is worth — two copies of it would be two
 * answers to "is this due soon" on the same record on the same afternoon.
 */
export { DAY_MS, DUE_SOON_HOURS, HOUR_MS }

// ---------------------------------------------------------------------------- time

/**
 * Read a stored timestamp as LOCAL time, in milliseconds. Null when it is not a timestamp,
 * which the caller has to handle — a date that cannot be read is never treated as "now".
 *
 * Accepts "2026-08-07", "2026-08-07 14:30", "2026-08-07 14:30:00" and the ISO "T" form. A bare
 * date is the START of that day; `parseDueStamp` below is the one that treats it as the end.
 *
 * RE-EXPORTED, not implemented here. This file used to hold one of seven copies of the same
 * reading rule, and one of the other six — `parseStamp` in components/ui.tsx — had drifted to UTC.
 * The rule now lives in `@shared/time.ts` beside the function that writes a stamp, so the round
 * trip can be proved in one place.
 *
 * Imported and then re-exported, rather than `export { x } from`, because the rest of this file
 * calls it: a bare re-export forwards the name without binding it in this module's scope.
 */
export { parseLocalStamp }

/** The same, for a due date: see @shared/due-stamps.ts, which the server imports too. */
import { parseDueStamp } from '@shared/due-stamps.ts'
export { parseDueStamp }

/**
 * A STORED DUE, READ FOR COUNTING: the moment it is due (`parseDueStamp`) and whether a date or a moment was stored.
 * `dueCount` in shared/deadlines.ts counts both the same way since wave 13q's round 31, from the due moment, which for a
 * date is the end of its day. Null when the stamp is not one. The work page's chip,
 * the record page's deadline and Home's late alarm read a stored due through here, so all three count it one way.
 */
export function readDueStamp(stamp: string): { ms: number; due: DueForm } | null {
  const ms = parseDueStamp(stamp)
  if (ms === null) return null
  return { ms, due: isBareDateStamp(stamp) ? 'a date' : 'a moment' }
}

/**
 * A duration as the shortest thing that is still true: "4d", "31h", "12m", "just now".
 *
 * Deliberately not "about a day": the alarm panel is read to decide what to do next, and
 * "26h" and "50h" are different decisions.
 */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms)
  if (abs < MINUTE_MS) return 'just now'
  if (abs < HOUR_MS) return `${Math.round(abs / MINUTE_MS)}m`
  // Hours run all the way to two days rather than stopping at one. Rule 4's whole window is
  // 48 hours, and "due in 2d" for something owed tomorrow morning is the sort of rounding that
  // makes a person miss it.
  if (abs < 2 * DAY_MS) return `${Math.round(abs / HOUR_MS)}h`
  return `${Math.round(abs / DAY_MS)}d`
}

/** "3d ago" / "in 31h", from a stored stamp. The empty string is never returned. */
export function relativeToNow(stamp: string, now: number): string {
  const ms = parseLocalStamp(stamp)
  if (ms === null) return `unreadable time "${stamp}"`
  const delta = now - ms
  if (Math.abs(delta) < MINUTE_MS) return 'just now'
  return delta >= 0 ? `${formatDuration(delta)} ago` : `in ${formatDuration(delta)}`
}

/**
 * A due date as a person would write it: "3 Aug 2026", or "9 Aug 2026 03:22" when the stored
 * value carries a time. The year is always there because an obligation dated "3 Aug" with no
 * year is exactly the kind of thing that gets read as next year in January.
 *
 * THE DAY IS WRITTEN IN THE PAGE'S LANGUAGE, by `dayInThePageLanguage` in src/shared/i18n.ts, the office's one
 * way of writing a day: "2026 年 8 月 3 日" on a Chinese page. It used to be built here from the browser's own
 * month name, so a Chinese page read "29 Sep 2026" (round 18's list of English left on Chinese pages).
 */
export function formatDue(stamp: string): string {
  const ms = parseLocalStamp(stamp)
  if (ms === null) return stamp
  const d = new Date(ms)
  const day = dayInThePageLanguage(d, true)
  const bare = /^\d{4}-\d{2}-\d{2}\s*$/.test(stamp)
  if (bare) return day
  return `${day} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** "2026-08-07 18:40" -> "18:40 on 7 Aug" ("8月7日 18:40" in Chinese). Used for the one line that says what "since" means. */
export function formatWhen(stamp: string): string {
  const ms = parseLocalStamp(stamp)
  if (ms === null) return stamp
  const d = new Date(ms)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return t('attention.timeOnDay', { time, day: dayInThePageLanguage(d, false) })
}

// ---------------------------------------------------------------------------- reading `data`

/** A record whose `data` does not say what this kind of record needs to say. Shown, not dropped. */
export interface RecordProblem {
  record: PanelRecord
  /**
   * What is missing, with the field names and the stored words in it.
   *
   * THIS IS NOT WHAT A PAGE PRINTS. Home printed it, in a red panel, on the default page:
   * *"block 16 of 16 (lfLve4F30JIy): its state is undefined, which is not one of todo, doing,
   * done, failed, blocked."* It is right, and it is for an agent and for Developer mode. Home keys
   * its row by it and draws its own sentence, `home.pipelineFailed`, in the page's language.
   */
  problem: string
  /** The record to open to fix it, when it is not the one named above. A step, usually. */
  openId?: string
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

// ----- sessions

/**
 * The four states an agent session can be in, and they are four for a reason.
 *
 *   running  — output in the last few minutes; it is working
 *   idle     — alive, but has said nothing for a while; usually waiting on you
 *   finished — exited cleanly
 *   crashed  — exited badly, or stopped without finishing. THIS is the one that qualifies.
 *
 * "idle" and "running" are kept apart because conflating them is how a session that has been
 * waiting forty minutes for an answer looks like a session that is busy.
 */
// Imported and re-exported, not redeclared. This file used to keep its own copy of the list,
// and adding `orphaned` and `unknown` to the real one left this behind -- which is the exact
// drift the vocabulary test was written to catch.
import { SESSION_STATES, type SessionState } from '@shared/types.ts'
export { SESSION_STATES, type SessionState }

export interface SessionInfo {
  record: PanelRecord
  state: SessionState
  /** Which agent, e.g. "claude-code". */
  agent: string | null
  /** What it is doing or was doing, in one line. */
  doing: string | null
  /** When it last produced output. The clock the "idle" reading is made against. */
  lastOutputAt: string | null
  /** Why it ended the way it did: "exit 137, out of memory". */
  detail: string | null
}

/**
 * THE SESSIONS IN A LIST OF RECORDS, and the ones that cannot be read.
 *
 * No page calls this. scripts/seed.ts does, to check that the demo data it writes can be read.
 */
export function readSessions(records: readonly PanelRecord[]): {
  sessions: SessionInfo[]
  problems: RecordProblem[]
} {
  const sessions: SessionInfo[] = []
  const problems: RecordProblem[] = []
  for (const record of records) {
    if (record.kind !== 'session') continue
    const data = isObj(record.data) ? record.data : {}
    const state = str(data['state'])
    if (state === null || !(SESSION_STATES as readonly string[]).includes(state)) {
      // A session with no readable state cannot be ranked, and guessing one would hide a
      // crashed run behind a cheerful "finished". Say what is wrong and where.
      problems.push({
        record,
        problem:
          state === null
            ? `no \`state\` in its data — expected one of ${SESSION_STATES.join(', ')}`
            : `state "${state}" is not one of ${SESSION_STATES.join(', ')}`,
      })
      continue
    }
    sessions.push({
      record,
      state: state as SessionState,
      // `runtime` FIRST AND `agent` AFTER IT: window B renamed the key on every session, and a
      // corpus restored from a backup taken before that window still holds the older spelling.
      agent: str(data['runtime'] ?? data['agent']),
      doing: str(data['doing']),
      lastOutputAt: str(data['lastOutputAt']),
      detail: str(data['detail']),
    })
  }
  return { sessions, problems }
}

// ----- obligations

export interface ObligationInfo {
  record: PanelRecord
  /** The stored due stamp, as written. */
  due: string
  /** Local milliseconds, end-of-day for a bare date. */
  dueMs: number
  /** Who it is owed to. An obligation with nobody at the other end is a task. */
  owedTo: string | null
  /** Discharged obligations stay in the record, and stop qualifying. */
  done: boolean
}

/**
 * THE OBLIGATIONS IN A LIST OF RECORDS, and the ones that cannot be read.
 *
 * No page calls this. scripts/seed.ts does, to check that the demo data it writes can be read.
 */
export function readObligations(records: readonly PanelRecord[]): {
  obligations: ObligationInfo[]
  problems: RecordProblem[]
} {
  const obligations: ObligationInfo[] = []
  const problems: RecordProblem[] = []
  for (const record of records) {
    if (record.kind !== 'obligation') continue
    const data = isObj(record.data) ? record.data : {}
    const due = str(data['due'])
    if (due === null) {
      problems.push({
        record,
        problem: 'no `due` in its data — an obligation with no date can never be owed',
      })
      continue
    }
    const dueMs = parseDueStamp(due)
    if (dueMs === null) {
      problems.push({
        record,
        problem: `\`due\` is "${due}", which is not a date Mole Office can read`,
      })
      continue
    }
    obligations.push({
      record,
      due,
      dueMs,
      owedTo: str(data['owedTo']) ?? str(data['owed_to']),
      done: data['done'] === true || str(data['state']) === 'done',
    })
  }
  return { obligations, problems }
}

// ----- pipelines

/**
 * One pipeline and its blocks, in order, for a one-line panel.
 *
 * ---------------------------------------------------------------------------------------
 * THERE IS NO SECOND `PipelineStep` INTERFACE HERE ANY MORE
 * ---------------------------------------------------------------------------------------
 *
 * This file used to declare its own `interface PipelineStep { id, name, state }` beside the one in
 * shared/types.ts, with its own way of inventing an identity when the id was missing
 * (`${record.id}-step-${i}`). It was one of FIVE readings of one stored step, three of which
 * disagreed about what a step with no id is. There is one reading now — `readPipelineBlocks` in
 * shared/blocks.ts — and it cannot invent an identity, because a block's identity is a primary key.
 */
export interface PipelineInfo {
  record: PanelRecord
  blocks: PipelineBlockView[]
}

/**
 * Every pipeline, with its blocks resolved from the records list.
 *
 * NO LINKS NEEDED, and that is the point of the pipeline owning an ordered `blockIds`: the one-line
 * home panel wants a name and a state per block, and both are on the block's own record. Only the
 * pages that draw the modules and the dependencies have to read links at all.
 *
 * A pipeline whose stored order has a hole in it — an id naming nothing, a deleted block, a record
 * of the wrong kind — is REPORTED with the reason and the position, and its readable blocks are
 * still returned. This used to discard the whole pipeline at the first bad step, which was right
 * when one bad step meant the array could not be trusted; a missing row is a smaller fact than that
 * and does not cost the other eight.
 */
export function readPipelines(records: readonly PanelRecord[]): {
  pipelines: PipelineInfo[]
  problems: RecordProblem[]
} {
  const pipelines: PipelineInfo[] = []
  const problems: RecordProblem[] = []
  for (const record of records) {
    if (record.kind !== 'pipeline') continue
    // No links: `modules` and `needs` come back empty and nothing here reads them.
    const reading = readPipelineBlocks(record, records, [])
    if (reading.undeclared) {
      problems.push({
        record,
        problem: 'no `blockIds` in its data — a pipeline is its ordered blocks',
      })
      continue
    }
    for (const problem of reading.problems) {
      problems.push({
        record,
        problem: `block ${problem.at} of ${reading.storedIds} (${problem.blockId}): ${problem.problem}`,
        // OPEN THE STEP THAT IS WRONG, NOT THE PIPELINE. The panel offered "Open it", which opened
        // the pipeline and left the reader counting to step 16 to find the one at fault.
        ...(problem.blockId === '' ? {} : { openId: problem.blockId }),
      })
    }
    if (reading.blocks.length === 0) {
      // NO READABLE BLOCK AT ALL is a pipeline this panel cannot draw a line for, whether the order
      // is empty or every id in it is broken. The reason is already on `problems` in the second
      // case; this adds the first. Drawing it as a pipeline with nought blocks would put a row on
      // the page that says the work is finished.
      if (reading.problems.length === 0) {
        problems.push({
          record,
          problem: 'its `blockIds` is empty — nobody has written down what it does yet',
        })
      }
      continue
    }
    pipelines.push({ record, blocks: reading.blocks })
  }
  return { pipelines, problems }
}

// ---------------------------------------------------------------------------- item history

/** When a checklist item was last changed, and whether that time is exact. */
export interface ItemTouch {
  /** The stored stamp the reading is based on. */
  at: string
  /**
   * False when the change log we were given does not reach far enough back to prove it. The
   * page then says "at least 5d" rather than "5d", because the honest answer to "how long has
   * this been stuck" is sometimes "longer than I can see".
   */
  exact: boolean
}

function itemSignature(data: unknown, itemId: string): string | null {
  if (!isObj(data)) return null
  const parts = data['parts']
  if (!Array.isArray(parts)) return null
  for (const part of parts) {
    if (!isObj(part)) continue
    const items = part['items']
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!isObj(item) || item['id'] !== itemId) continue
      return JSON.stringify([item['state'], item['text'], item['note'] ?? null])
    }
  }
  return null
}

function parseJson(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * The three ways a checklist item can be edited, and the change-log field each one writes.
 *
 *   1. the whole bag        field `data`                          — the old path; diff the two bags
 *   2. a merge patch        field `data.parts`                    — the array, before and after
 *   3. one item by id       field `data.parts[#p].items[#i].state` — the item endpoint
 *
 * This function is about the third. It reads the ITEM ID out of a per-path field name, so a row
 * written by PATCH /api/records/:id/checklist/:itemId can be recognised as touching this item
 * without parsing values at all — there are none to diff, the path IS the statement.
 *
 * `#` marks an id rather than an index, and an id that is not a plain word is JSON-quoted by the
 * server, so both spellings are read here. Null when the field is not an item path.
 */
const ITEM_PATH = /^data\.parts\[#(.+)\]\.items\[#(.+)\]\.([A-Za-z_][A-Za-z0-9_]*)$/

export function itemPathTouch(field: string | null): { itemId: string; key: string } | null {
  if (field === null) return null
  const m = ITEM_PATH.exec(field)
  if (!m) return null
  const raw = m[2]
  const key = m[3]
  if (raw === undefined || key === undefined) return null
  let itemId = raw
  if (raw.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'string') return null
      itemId = parsed
    } catch {
      return null
    }
  }
  return { itemId, key }
}

/**
 * Which keys count as touching an item, for the "how long has this been doing?" clock.
 *
 * Exactly the keys `itemSignature` compares, and that is not a coincidence — it is the reason
 * this list exists rather than "any key". The whole-bag path has always ignored an `hours` edit,
 * so if the per-path reader counted one, the SAME edit would date differently depending on which
 * endpoint made it, and nothing on the page would look wrong.
 */
const SIGNATURE_KEYS: readonly string[] = ['state', 'text', 'note']

/**
 * When a single checklist item last changed, read out of the change log.
 *
 * The change log stores a `data` update as the whole old and new JSON bag, so the only way to
 * date ONE item is to compare that item across the two. That is what this does, newest change
 * first, stopping at the first one where the item actually differs.
 *
 * When no change in the window touched it, the answer depends on whether the window is
 * complete. Complete: the item has been like this since the record was created, exactly.
 * Incomplete: all we can say is "since at least the oldest change we were given" — a lower
 * bound, flagged as such rather than passed off as a measurement.
 */
export function lastTouchedItem(
  changes: readonly Change[],
  record: PanelRecord,
  itemId: string,
  opts: { complete: boolean; oldestSeen: string | null },
): ItemTouch {
  for (const change of changes) {
    if (change.recordId !== record.id) continue
    if (change.op !== 'update') continue

    // (3) one item, named in the path. Nothing to diff: the server writes a row only for a key
    // that really moved, so the row's existence is the change.
    const perItem = itemPathTouch(change.field)
    if (perItem !== null) {
      if (perItem.itemId === itemId && SIGNATURE_KEYS.includes(perItem.key)) {
        return { at: change.at, exact: true }
      }
      continue
    }

    // (2) a merge patch on the array. The values are the array, so the signature is read out of
    // a bag built around it — the same comparison as (1), one level down. Without this a merge
    // patch that rewrote the checklist would date every item to the record's creation, silently.
    if (change.field === 'data.parts') {
      const before = itemSignature({ parts: parseJson(change.oldValue) }, itemId)
      const after = itemSignature({ parts: parseJson(change.newValue) }, itemId)
      if (before === after) continue
      return { at: change.at, exact: true }
    }

    // (1) the whole bag.
    if (change.field !== 'data') continue
    const before = itemSignature(parseJson(change.oldValue), itemId)
    const after = itemSignature(parseJson(change.newValue), itemId)
    if (before === after) continue
    return { at: change.at, exact: true }
  }
  if (opts.complete) return { at: record.createdAt, exact: true }
  const oldest = opts.oldestSeen
  if (oldest === null) return { at: record.createdAt, exact: false }
  // The record predates the window, so the true last touch is at or before its oldest edge.
  const createdMs = parseLocalStamp(record.createdAt)
  const oldestMs = parseLocalStamp(oldest)
  if (createdMs !== null && oldestMs !== null && createdMs >= oldestMs) {
    return { at: record.createdAt, exact: true }
  }
  return { at: oldest, exact: false }
}

// ----------------------------------------------- reading the answer GET /api/attention gave
//
// Two readings over what the server sent, and NEITHER re-derives the rule: each reads fields that
// are already on the reply. Both are here because both are a place where an empty answer and a
// missing answer would otherwise be drawn the same way.
//
// TWO OTHER READINGS OVER THIS REPLY DELIBERATELY LIVE ELSEWHERE, and they are named here so the
// next person does not write a third copy of either:
//
//   HOW LOUDLY A ROW IS DRAWN — approved decision 2, that strong alarm is reserved for genuinely
//   urgent and overdue states and an old failure must recede — is `ALARM_LEVELS` and `alarmFor()`
//   in src/web/components/ui.tsx. It reads `row.safety`, `row.reason.owed.lateMs` and the row's
//   age, all straight off the reply. A second mapping here would be two answers to "what colour
//   is this row" with nothing making them agree.
//
//   WHAT A SHORTENED LIST MUST SAY ABOUT WHAT IT IS HIDING — approved decision 7, an exact count,
//   the named groups, and a route to the whole list, never the bare word "more" — is `HiddenCount`
//   in the same file, and it refuses to draw at all when it is not given the groups.

/**
 * Which of three answers "what happened while I was away" gave.
 *
 * They are three and not two, and collapsing any pair is a lie:
 *
 *   never-looked   — no anchor is recorded for this reader. Mole Office cannot say what has changed.
 *   nothing-since  — they looked, and nothing has been written since.
 *   changes-since  — they looked, and here is what happened.
 *
 * An empty list drawn for the first reads as "nothing happened", which is the one answer that must
 * never be given by mistake. That is why the server sends `changes: null` rather than `[]` there,
 * and why this hands the null straight on instead of smoothing it into an array.
 *
 * THE SENTENCE IS THE SERVER'S OWN. It already writes a good one for each of the three cases, with
 * the counts and the stamp in it. Writing a second wording here would be two places that must agree
 * about what the reader is being told; what this adds is the machine-readable name, so a surface
 * can choose a layout without reading prose.
 */
export const ANCHOR_ANSWERS = ['never-looked', 'nothing-since', 'changes-since'] as const
export type AnchorAnswer = (typeof ANCHOR_ANSWERS)[number]

export interface AnchorState {
  answer: AnchorAnswer
  /** Rows written since the anchor. Null when there is no anchor to count from. */
  sinceAnchor: number | null
  /** The rows, newest first. NULL, not an empty array, when nobody has looked yet. */
  changes: Change[] | null
  /** True when more rows are new than came back. `sinceAnchor` is still the true number. */
  truncated: boolean
  sentence: string
}

export function anchorState(reading: AnchorReading): AnchorState {
  const carried = {
    sinceAnchor: reading.counts.sinceAnchor,
    changes: reading.changes,
    truncated: reading.truncated,
    sentence: reading.note,
  }
  if (reading.anchor === null) return { answer: 'never-looked', ...carried }
  if (reading.counts.sinceAnchor === 0) return { answer: 'nothing-since', ...carried }
  return { answer: 'changes-since', ...carried }
}

/**
 * Whether this machine was actually looked at, and what was found.
 *
 * `count: null` means NOBODY LOOKED. That is the distinction the whole thing turns on: the number
 * of processes running that no session claims is set by the operating system rather than by the
 * research, so the sweep costs a read of /proc and a question to the GPU and is asked for rather
 * than done on every page load. An empty list drawn as "nothing is running unclaimed" from a sweep
 * that never ran is the clean bill of health nobody checked — and an eleven-day-old simulator once
 * sat holding this machine's GPU.
 *
 * The sentence is the server's own, for the same reason as the anchor's.
 */
export interface MachineSummary {
  swept: boolean
  /** How many things are alive that no session claims. NULL when the machine was not swept. */
  count: number | null
  sentence: string
}

export function machineSummary(reply: Pick<AttentionReply, 'machine' | 'machineSweep'>): MachineSummary {
  if (!reply.machineSweep.swept) return { swept: false, count: null, sentence: reply.machineSweep.note }
  return { swept: true, count: reply.machine.length, sentence: reply.machineSweep.note }
}

/**
 * HOW MANY THINGS NEED A PERSON NOW — the first count on the home page, and the rail badge's number.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FUNCTION EXISTS, PROBLEMS zKalIBZccv9F AND 8woJrf898igd
 * ---------------------------------------------------------------------------------------
 *
 * The attention rule selected 1,382 rows and the home page showed 7. The rule's `total` did not
 * mean "things that need somebody today": it counted every selected row, including those picked
 * apart in `remainder` because the ranked list only holds seven at a desk width — old work that is
 * merely still open. The rail badge and the phone pill read `total` and said 1,382 over a page
 * whose list opens with 7 rows. A count of 1,380 is not one that a person can
 * act on.
 *
 * THE COUNT THAT COUNTS WHAT A PERSON CAN ACT ON is what the page lists first: `visible`, the
 * ranked rows, each one a thing to open today. This is that number, read once here so the rail's
 * badge, the phone's pill and the page's own count line cannot work it out three ways.
 *
 * THE REMAINDER IS NOT LOST. The ranked list sits over what it does not show — see
 * `hiddenCountOf`-shaped reading under approval decision 7 — and the page states the remainder in
 * one line under its list instead of holding it in the badge. A number a reader cannot act on is
 * not shown as a count; the things themselves are all on the page, exactly as the server sent them.
 */
export function needsSomebodyNow(reply: Pick<AttentionHome, 'visible'>): number {
  return reply.visible.length
}

// ------------------------------------------------------------------ which records you opened

/**
 * WHAT USED TO BE HERE, AND WHY IT IS GONE.
 *
 * This section held the "since you were away" mark as well: `VISIT_KEY` and `VISIT_SESSION_KEY` in
 * the browser's own storage, and `beginVisit()` to move them. It was wrong for one specific reason.
 * The phone is ALWAYS the second browser — it is the one the person reads on away from the desk, which is
 * the whole reason the question exists — and a mark kept in one browser's storage is one the other
 * browser can never read and never move. So the phone could never answer "what happened while I was
 * away", and the desk silently marked a night of agent work as seen on the phone's behalf.
 *
 * The mark now lives on the server, keyed by the PERSON (`human:<their id>`) and not by the browser:
 * `GET /api/anchor` and `PUT /api/anchor`, through `api.anchor()` and `api.markReadTo()`, read by
 * `anchorState()` above. Do not put it back in localStorage.
 *
 * WHAT IS STILL HERE IS NOT WIRED TO ANYTHING, AND THAT IS THE WHOLE STATUS OF IT. Which records
 * you have opened is a different thing from where you have read to. The only thing that ever read
 * it was rule 6 of the old attention rule — "an agent wrote this since your last visit and you have
 * not opened it" — and that rule is gone.
 *
 * NOTHING IN `src` CALLS `markOpened` OR `readOpened` TODAY. This note used to say the store was
 * still being written, and that stopped being true when the last caller went; a comment that sends
 * a reader looking for a writer that does not exist is worse than no comment. Only
 * `tests/attention.test.ts` exercises these functions, so the test is what keeps them compiling.
 *
 * THE DECISION IS STILL OPEN AND IT IS NOT SETTLED HERE. Either a new surface reads this, or the
 * functions and their tests are deleted together. Do not put the mark back in localStorage.
 */
export const OPENED_KEY = 'mole-office.home.opened'

/** The storage area this module touches. Injectable so the tests need no browser. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** A stored stamp in the server's format, so both sides compare the same way. */
export function stampFrom(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  )
}

/** How many opened-record stamps to keep. Enough for months of work, small enough to parse. */
export const OPENED_LIMIT = 300

export function readOpened(store: KeyValueStore): Record<string, string> {
  const raw = store.getItem(OPENED_KEY)
  if (raw === null) return {}
  let parsed: unknown = null
  try {
    parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  if (!isObj(parsed)) {
    // Corrupt is not the same as empty. Clear it and say so, rather than silently behaving as
    // though nothing has ever been opened -- which would refill the unread list with old work.
    store.removeItem(OPENED_KEY)
    console.warn(`Mole Office: ${OPENED_KEY} was unreadable and has been cleared; every record now counts as unopened.`)
    return {}
  }
  const out: Record<string, string> = {}
  for (const [id, when] of Object.entries(parsed)) {
    if (typeof when === 'string' && parseLocalStamp(when) !== null) out[id] = when
  }
  return out
}

/** Note that a record has been opened, keeping the most recent OPENED_LIMIT entries. */
export function markOpened(store: KeyValueStore, recordId: string, now: number): void {
  const current = readOpened(store)
  current[recordId] = stampFrom(now)
  const entries = Object.entries(current).sort((a, b) => b[1].localeCompare(a[1])).slice(0, OPENED_LIMIT)
  store.setItem(OPENED_KEY, JSON.stringify(Object.fromEntries(entries)))
}

/** The record id in a "#/r/<id>" address, or null when the address is not a record page. */
export function recordIdFromHash(hash: string): string | null {
  const m = /^#?\/r\/([^/?#]+)/.exec(hash)
  const id = m?.[1]
  return id === undefined ? null : decodeURIComponent(id)
}
