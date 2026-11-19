// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH MODEL LOGIN'S USE, READ, AND THE NOTICE THAT TELLS ONE SECRETARY. Since wave 13p round 29, each login's use is
 * shown where a secretary reads its inbox and on the agent page in Developer mode, and a secretary is woken once at 50%
 * and again at 80%. Since wave 13y round 136 the notice goes to the one secretary who takes usage notices.
 * Each login, and how its use is read, is declared in src/shared/logins-week.ts.
 *
 * ---------------------------------------------------------------------------------------
 * THE SANDBOXES' CLAUDE LOGIN IS READ FROM ITS OWN RATE-LIMIT EVENT
 * ---------------------------------------------------------------------------------------
 *
 * Wave 13p round E, for problem LeL0ssxi2jje. A READING ROUND is a round whose start.json command runs Claude Code with
 * `--output-format stream-json` (tools/sandbox-start.mjs writes the command there). Claude Code writes a line of type
 * `rate_limit_event` into the round's `<instance>/logs/<run>/out`. Its `rate_limit_info` says whether the login's
 * requests were allowed, and how much of the five-hour and seven-day windows was used and when each resets. Only a
 * reading round's `out` is opened. Any other round is passed over after one read of its start.json.
 *
 * THE READING IS THE NEWEST EVENT among every sandbox's reading rounds, placed by the time its round's `out` was last
 * written. It is current for 2 hours after that and stale after, and a stale reading keeps its figures behind the words
 * that say since when. An event in a shape the office does not know is unreadable: the reading names its round, shows
 * no figure, and does not use an older event in its place. Only the status, the limit's name, and each window's use and
 * reset are kept from the line. Nothing else in it or in the round is kept.
 *
 * WHAT THIS CANNOT SEE: the login's use since the newest event. A reading round that gave no event says nothing of it,
 * and the reading names the newest such round when it is newer than the event.
 *
 * ---------------------------------------------------------------------------------------
 * THE OTHER THREE LOGINS
 * ---------------------------------------------------------------------------------------
 *
 * Their use is what the runs' receipts give over the last seven days, by the one arithmetic (receiptsFromRuns), with the
 * runs that carried no receipt counted. A run is counted under a login by the tool it declared (`adaptedTool`), and the
 * host's Claude is a Claude Code run with no `sandbox` on its record, which is what that field's absence means. A run that
 * declared no tool is counted under no login, and the reading says how many there were.
 *
 * ---------------------------------------------------------------------------------------
 * THE NOTICE AT 50% AND 80% OF THE SEVEN DAYS
 * ---------------------------------------------------------------------------------------
 *
 * The one secretary who takes usage notices is told once at 50% and once at 80% of the sandboxes' Claude login's seven
 * days. Who that is, and what the notice at 80% says to do, are two settings read in lib/usage-notices.ts. A count is
 * named by that window's reset: a new reset time starts a new count. Each share is told once per count for the whole
 * office, so a secretary chosen in the middle of a count is not told a share another secretary was told. A notice is
 * owed only on a current reading whose seven-day window is given and has not reset, and never on any other login. The
 * notice names the use as the event gave it and that reset time with its zone. At 80% it says what the usage decision
 * set in the office says to do, or, with none set, asks the secretary to ask the owner. No word of the office's own
 * tells a line to slow down.
 */
import { closeSync, existsSync, fstatSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { sqlite } from '../db/client.ts'
import { STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { SANDBOXES_FOLDER } from '../../config/sandbox-folder.mjs'
import { sayInEnglish } from '@shared/i18n.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice } from '@shared/participants.ts'
import { momentOfStampInZone, stampInZone, theClockZone } from '@shared/time.ts'
import {
  A_READING_STAYS_CURRENT_MS,
  RATE_LIMIT_STATUSES,
  RATE_LIMIT_TYPES,
  THE_LAST_SEVEN_DAYS_MS,
  THE_LOGINS,
  THE_SHARES_THE_SECRETARIES_ARE_TOLD_AT,
  aUseInPercent,
  minute,
  type ALogin,
  type AWindowRead,
  type LoginKey,
  type LoginsWeek,
  type LoginWeekReading,
  type OwnEventReading,
  type RateLimitStatus,
  type RateLimitType,
} from '@shared/logins-week.ts'
import { receiptsFromRuns, theRunsFiledSince, theRunsOfSessionsFiledBefore, type ReceiptRun } from './usage-receipts.ts'
import { theSecretaries } from './secretariat.ts'
import { whatTheUsageDecisionSaysToDo, whoTakesTheNextUsageNotice } from './usage-notices.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { writeASystemLineToOne } from './groups.ts'
import type { Actor } from './records.ts'
import { THE_LAST_READ } from './the-sandboxes-login-for-the-router.ts'
import { theRoundsInTheSandboxes } from './the-sandboxes-login-for-the-router.ts'
import { drained } from './the-sandboxes-login-for-the-router.ts'
import { theOwnEventReading } from './the-sandboxes-login-for-the-router.ts'
import { theRoundsReadInSteps } from './the-sandboxes-login-for-the-router.ts'
import { theRateLimitLineReadInSteps } from './the-sandboxes-login-for-the-router.ts'
import { theSandboxesLogin } from './the-sandboxes-login-for-the-router.ts'
import { theLastRateLimitLineAmong } from './the-sandboxes-login-for-the-router.ts'

// ============================================================================ the sum over receipts

/**
 * THE USE OF SESSIONS WHOSE FIGURE IS THEIR WHOLE COST SO FAR. For each session with a figure inside the window, its
 * highest figure inside minus its highest figure before (0 when none). A session whose figure inside is lower than
 * before adds 0 and is counted.
 */
function theUseOfCumulativeSessions(inside: ReadonlyMap<string, number>, before: ReadonlyMap<string, number>): { usd: number; sessions: number; sessionsWhoseFigureFell: number } {
  let usd = 0
  let sessionsWhoseFigureFell = 0
  for (const [session, highest] of inside) {
    const earlier = before.get(session) ?? 0
    if (highest < earlier) sessionsWhoseFigureFell += 1
    else usd += highest - earlier
  }
  return { usd, sessions: inside.size, sessionsWhoseFigureFell }
}

/** The highest figure of each session among `figures`. */
function theHighestOfEach(figures: Iterable<{ session: string; usd: number }>): Map<string, number> {
  const highest = new Map<string, number>()
  for (const one of figures) highest.set(one.session, Math.max(highest.get(one.session) ?? 0, one.usd))
  return highest
}

/** The session a run's receipt belongs to: the conversation it names in `providerSession`, or null when it names none. */
function theSessionOfARun(run: ReceiptRun): string | null {
  const named = run.data['providerSession']
  return typeof named === 'string' && named !== '' ? named : null
}

/** A run's receipt cost, or null when it carried none. */
function theCostOnAReceipt(run: ReceiptRun): number | null {
  const usd = (run.data['usageReceipt'] as { costUsd?: unknown } | undefined)?.costUsd
  return typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? usd : null
}

/**
 * THE COST IN A WINDOW, FROM THE RUNS' RECEIPTS, EACH SESSION COUNTED ONCE. A receipt's cost is `total_cost_usd`, the
 * whole session's figure so far (tools/agent-worker.mjs), so a resumed session's receipt repeats its earlier rounds and
 * adding receipts counts them again. So each session is its newest figure in the window minus its figure before the
 * window, by `theUseOfCumulativeSessions`. A session is the conversation a run names in `providerSession`. A run that
 * names none cannot be joined to another, so it is counted as a session of its own, and the reading says how many.
 * Null when no receipt in the window gave a cost.
 */
export function theCostInTheReceipts(inside: readonly ReceiptRun[], before: readonly ReceiptRun[]): { usd: number | null; sessions: number; runsWithNoSession: number; sessionsWhoseFigureFell: number } {
  let runsWithNoSession = 0
  const figures = (runs: readonly ReceiptRun[], counting: boolean) =>
    runs.flatMap((run) => {
      const usd = theCostOnAReceipt(run)
      if (usd === null) return []
      const session = theSessionOfARun(run)
      if (session === null && counting) runsWithNoSession += 1
      return [{ session: session ?? `run ${run.id}`, usd }]
    })
  const counted = figures(inside, true)
  const summed = theUseOfCumulativeSessions(theHighestOfEach(counted), theHighestOfEach(figures(before, false)))
  return { usd: counted.length === 0 ? null : summed.usd, sessions: summed.sessions, runsWithNoSession, sessionsWhoseFigureFell: summed.sessionsWhoseFigureFell }
}

// ============================================================================ the rate-limit line

export { itRanClaude } from './the-sandboxes-login-for-the-router.ts'

export { itIsAReadingRound } from './the-sandboxes-login-for-the-router.ts'

export { A_READ_FROM_THE_END } from './the-sandboxes-login-for-the-router.ts'

export { THE_WORD_RATE_LIMIT_EVENT } from './the-sandboxes-login-for-the-router.ts'
export { AN_ESCAPE } from './the-sandboxes-login-for-the-router.ts'

export { theLastRateLimitLineAmong } from './the-sandboxes-login-for-the-router.ts'

/** The rate-limit line in a whole text: the answer `theRateLimitLineInTheFile` gives from the file's end. */
export function theRateLimitLineIn(text: string): string | null {
  return theLastRateLimitLineAmong(text.split('\n'))
}

/**
 * THE RATE-LIMIT LINE IN A ROUND'S OUTPUT FILE, READ FROM ITS END, with the answer `theRateLimitLineIn` gives for the
 * whole text.
 *
 * The first reading after a start read every round's `out` whole: 4,082 files and 1.8 GB on the live host on 10 October
 * 2026 (wave 13y round 17). So:
 * - IT READS FROM THE END, 64 KB at a time, and looks only at the lines each read completed, last first. It stops at the
 *   first event it finds.
 * - A STRETCH OF LINES IS DECODED ONLY WHEN IT HOLDS THE BYTES `"rate_limit_event"` OR `\u`. A JSON string that reads
 *   `rate_limit_event` is written one way or the other, so a stretch with neither cannot hold the line; a
 *   `"no_rate_limit_event"` does not hold the first. A file with no event is still read to its start, because nothing
 *   short of that shows there is none.
 * The lines are split at the newline byte, which no other UTF-8 character contains, so each line decodes as it would in
 * the whole text. A file that gives fewer bytes than its size said throws.
 */
export function theRateLimitLineInTheFile(path: string): string | null {
  return drained(theRateLimitLineReadInSteps(path))
}

export { theRateLimitLineReadInSteps } from './the-sandboxes-login-for-the-router.ts'

// ============================================================================ what one event gave

export { THE_HIGHEST_USE_READ } from './the-sandboxes-login-for-the-router.ts'

export { THE_FURTHEST_RESET_READ_MS } from './the-sandboxes-login-for-the-router.ts'

/** One window a round's event gave, with its reset in milliseconds. */
export interface AWindowGiven {
  used: number
  resetsAtMs: number
  from: AWindowRead['from']
}

/** What a reading round's `out` gave: no event, an event in a shape the office does not know, or what its event said. */
export type WhatARoundGave =
  | { event: 'none' }
  | { event: 'unreadable' }
  | { event: 'read'; status: RateLimitStatus; windowType: RateLimitType | null; resetsAtMs: number | null; sevenDays: AWindowGiven | null; fiveHours: AWindowGiven | null }

/** One reading round in a sandbox: its sandbox and folder, when its `out` was last written, and what that gave. */
export interface ASandboxRound {
  sandbox: string
  folder: string
  atMs: number
  gave: WhatARoundGave
}

export { anObject } from './the-sandboxes-login-for-the-router.ts'

export { oneOf } from './the-sandboxes-login-for-the-router.ts'

export { whatTheEventGave } from './the-sandboxes-login-for-the-router.ts'

// ============================================================================ the walk over the sandboxes

/** What was read of one round's `out`, kept until its stamp or size changes: the reading round, or null for any other round. */
export interface AReadRound {
  atMs: number
  size: number
  round: ASandboxRound | null
}

/** One instance's run folders, kept until the `logs` folder's own stamp changes, which a new or removed run changes. */
export interface AReadInstance {
  logsMs: number
  runs: string[]
}

export { THE_LAST_READ } from './the-sandboxes-login-for-the-router.ts'

export { theRoundsInTheSandboxes } from './the-sandboxes-login-for-the-router.ts'

export { drained } from './the-sandboxes-login-for-the-router.ts'

/**
 * HOW LONG ONE SLICE OF THE FIRST READING AFTER A START MAY HOLD THE THREAD before it gives it back. On the live host
 * on 10 October 2026 the first reading of 4,082 files and 1.8 GB held it for 5,148 ms in one piece (wave 13y round 19).
 */
export const A_SLICE_OF_THE_FIRST_READING_MS = 25

/**
 * THE FIRST READING OF A ROOT, IN SLICES THAT GIVE THE THREAD BACK. It reads what `theRoundsInTheSandboxes` would, and
 * keeps it as that function keeps its own reading, so the next call of that function opens only what changed since.
 * `slice` runs each slice, so the timer can name it. A root already read is not read again here. A reading of the same
 * root that ends while this one waits is newer, so this one is then dropped and not kept.
 */
export async function warmTheRoundsInTheSandboxes(
  root: string = SANDBOXES_FOLDER,
  slice: (work: () => boolean) => boolean = (work) => work(),
): Promise<void> {
  if (THE_LAST_READ.has(root)) return
  const steps = theRoundsReadInSteps(root)
  try {
    for (;;) {
      const done = slice(() => {
        const began = performance.now()
        while (performance.now() - began < A_SLICE_OF_THE_FIRST_READING_MS) if (steps.next().done === true) return true
        return false
      })
      if (done) return
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  } finally {
    // A SLICE THAT THREW LEAVES THE READING STOPPED with a file open, so it is ended here, which closes the file.
    steps.return([])
  }
}

export { theRoundsReadInSteps } from './the-sandboxes-login-for-the-router.ts'

// ============================================================================ the sandboxes' login, as its newest event said

export { THE_STATUS_SAYS } from './the-sandboxes-login-for-the-router.ts'

export { theLimitCalled } from './the-sandboxes-login-for-the-router.ts'

export { theSandboxesLogin } from './the-sandboxes-login-for-the-router.ts'

export { theOwnEventReading } from './the-sandboxes-login-for-the-router.ts'

export { theSandboxesLoginForTheRouter } from './the-sandboxes-login-for-the-router.ts'

// ============================================================================ one login's reading

/** Where the reading reads from. Each is a parameter so a test can hand in rounds and runs of its own. */
export interface WhereTheWeekIsRead {
  rounds: () => readonly ASandboxRound[]
  runsSince: (fromMs: number) => readonly ReceiptRun[]
  /** The runs filed before `beforeMs` that name one of these conversations in `providerSession`. */
  runsOfSessionsBefore: (sessions: readonly string[], beforeMs: number) => readonly ReceiptRun[]
}

const FROM_DISK_AND_RECORDS: WhereTheWeekIsRead = {
  rounds: () => theRoundsInTheSandboxes(),
  runsSince: (fromMs) => theRunsFiledSince(fromMs, null),
  runsOfSessionsBefore: (sessions, beforeMs) => theRunsOfSessionsFiledBefore(sessions, beforeMs),
}

/** A sum of US dollars, as a sentence writes it. */
function dollars(usd: number): string {
  return usd.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Whether a run belongs to a login that reads receipts, by the tool it declared and where it ran. */
function itIsThisLoginsRun(login: ALogin, data: Record<string, unknown>): boolean {
  if (login.runs === null || data['adaptedTool'] !== login.runs.tool) return false
  return login.runs.where === 'anywhere' || data['sandbox'] === undefined || data['sandbox'] === null
}

/**
 * ONE LOGIN'S READING AT `nowMs`. The one place a login's use is worked out; the inbox, the agent page and the notice
 * all read it. The one login read from its own event is the sandboxes' Claude (`theOwnEventReading`). Each other login
 * is read from the runs' receipts over the last seven days: its use, what is missing, and what it read.
 */
export function theWeekOfALogin(login: ALogin, nowMs: number, read: WhereTheWeekIsRead = FROM_DISK_AND_RECORDS): LoginWeekReading {
  if (login.readFrom === 'own-event') return theOwnEventReading(nowMs, read.rounds())
  const name = sayInEnglish(login.name)
  const zone = theClockZone()
  const fromMs = nowMs - THE_LAST_SEVEN_DAYS_MS
  const runs = read.runsSince(fromMs).filter((run) => itIsThisLoginsRun(login, run.data))
  const total = receiptsFromRuns(runs).overall
  const named = [...new Set(runs.flatMap((run) => (theSessionOfARun(run) === null || theCostOnAReceipt(run) === null ? [] : [theSessionOfARun(run)!])))]
  const before = named.length === 0 ? [] : read.runsOfSessionsBefore(named, fromMs).filter((run) => itIsThisLoginsRun(login, run.data))
  const cost = theCostInTheReceipts(runs, before)
  const usd = cost.usd
  const inputTokens = total.values.inputTokens ?? null
  const outputTokens = total.values.outputTokens ?? null
  const says =
    `${name}: ${String(runs.length)} run${runs.length === 1 ? '' : 's'} in the last seven days, ${String(total.missingReceipts)} with no receipt. ` +
    (usd === null
      ? 'No receipt gave a cost. '
      : `${String(total.supplied.costUsd)} receipt${total.supplied.costUsd === 1 ? '' : 's'} gave a cost. ` +
        `Each session is counted once, as its newest figure minus its figure before the seven days: ${dollars(usd)} US dollars over ${String(cost.sessions)} session${cost.sessions === 1 ? '' : 's'}. ` +
        (cost.runsWithNoSession === 0 ? '' : `${String(cost.runsWithNoSession)} run${cost.runsWithNoSession === 1 ? '' : 's'} named no conversation, so each was counted as a session of its own. `) +
        (cost.sessionsWhoseFigureFell === 0 ? '' : `${String(cost.sessionsWhoseFigureFell)} session${cost.sessionsWhoseFigureFell === 1 ? '' : 's'} showed a lower figure than before the seven days and ${cost.sessionsWhoseFigureFell === 1 ? 'is' : 'are'} counted as 0. `)) +
    (inputTokens === null && outputTokens === null
      ? ''
      : `The receipts give ${inputTokens === null ? 'no usable count of' : String(inputTokens)} tokens in and ${outputTokens === null ? 'no count of' : String(outputTokens)} tokens out. `) +
    'No week end and no 100% mark are recorded for this login, so its use is read over the last seven days and no share is shown.'
  return {
    readFrom: 'receipts',
    login: login.login,
    name: login.name,
    from: stampInZone(fromMs, zone),
    to: stampInZone(nowMs, zone),
    zone,
    usd,
    receipts: { runs: runs.length, runsWithNoReceipt: total.missingReceipts, costGivenBy: total.supplied.costUsd, sessions: cost.sessions, runsWithNoSession: cost.runsWithNoSession, sessionsWhoseFigureFell: cost.sessionsWhoseFigureFell, inputTokens, outputTokens },
    says,
  }
}

/** EVERY LOGIN'S READING AT `nowMs`, with the runs no login counts. */
export function theLoginsWeek(nowMs: number, read: WhereTheWeekIsRead = FROM_DISK_AND_RECORDS): LoginsWeek {
  // THE RUNS ARE READ ONCE for the three logins that read receipts, and the rounds once for the one that reads its event.
  const runs = read.runsSince(nowMs - THE_LAST_SEVEN_DAYS_MS)
  let rounds: readonly ASandboxRound[] | null = null
  const once: WhereTheWeekIsRead = { rounds: () => (rounds ??= read.rounds()), runsSince: () => runs, runsOfSessionsBefore: read.runsOfSessionsBefore }
  const logins = THE_LOGINS.map((login) => theWeekOfALogin(login, nowMs, once))
  const undeclared = runs.filter((run) => typeof run.data['adaptedTool'] !== 'string' || run.data['adaptedTool'] === '').length
  const zone = theClockZone()
  return {
    at: stampInZone(nowMs, zone),
    zone,
    logins,
    runsThatDeclaredNoTool: undeclared,
    says:
      logins.map((one) => one.says).join(' ') +
      (undeclared === 0 ? '' : ` ${String(undeclared)} run${undeclared === 1 ? '' : 's'} in the last seven days declared no tool, so no login counts ${undeclared === 1 ? 'it' : 'them'}.`),
  }
}

/**
 * THE READING FOR A SECRETARY, OR NULL FOR ANY OTHER AGENT. The inbox and the agent page show the week to and about every
 * secretary, because any secretary may be the one told at 50% and 80%. `handle` is the agent's handle; a secretary is a
 * registry row holding the secretary card (`theSecretaries`).
 */
export function theLoginsWeekForASecretary(handle: string, nowMs: number = Date.now()): LoginsWeek | null {
  const row = agentByHandle(handle)
  if (row === null || !theSecretaries().some((one) => one.id === row.id)) return null
  return theLoginsWeek(nowMs)
}

// ============================================================================ the notice

/** The mark a notice carries in its `extra` bag, so a restart reads what was already said from the messages themselves. */
interface NoticeMark {
  login: LoginKey
  /** The seven-day reset that names this count, as the reading writes it. */
  resets: string
  shares: number[]
}

/** The key of one share of one login's count, told to whichever secretary took it. */
function told(login: string, resets: string, share: number): string {
  return `${login}\u0000${resets}\u0000${String(share)}`
}

/**
 * Every share a secretary has already been told, read from the office's own notices in every project. A mark with no
 * string `resets` is passed over, as a mark of the wrong shape is: an older office named the count's start `from`, so its
 * notices do not say which seven-day count they belonged to. The read names the index of the notices
 * (`STORED_FIELDS.messageLoginsWeek`), so SQLite reads those few messages and no other.
 */
function theNoticesAlreadySent(): Set<string> {
  const rows = sqlite
    .prepare(
      "SELECT json_extract(data, '$.extra.loginsWeek') AS mark FROM records INDEXED BY records_message_logins_week_idx " +
        `WHERE kind = 'message' AND ${theWordsOfAStoredField(STORED_FIELDS.messageLoginsWeek, 'data')} IS NOT NULL ` +
        "AND deleted_at IS NULL AND json_extract(data, '$.sentBy.kind') = 'agent' AND json_extract(data, '$.sentBy.id') = ?",
    )
    .all(moleOffice().id) as { mark: unknown }[]
  const out = new Set<string>()
  for (const row of rows) {
    if (typeof row.mark !== 'string') continue
    let mark: Partial<NoticeMark>
    try {
      mark = JSON.parse(row.mark) as Partial<NoticeMark>
    } catch {
      continue
    }
    if (typeof mark.login !== 'string' || typeof mark.resets !== 'string' || !Array.isArray(mark.shares)) continue
    for (const share of mark.shares) out.add(told(mark.login, mark.resets, share))
  }
  return out
}

/**
 * THE ONE READING THE NOTICE NEEDS: the sandboxes' Claude login, read from its own event. The notice tells of no other
 * login. Reading every login (`theLoginsWeek`) also read the receipts of every run of the last seven days, each minute,
 * and held the server for that time.
 */
function theReadingTheNoticeNeeds(nowMs: number): Pick<LoginsWeek, 'logins' | 'zone'> {
  return { logins: [theWeekOfALogin(theSandboxesLogin(), nowMs)], zone: theClockZone() }
}

/**
 * TELL THE ONE SECRETARY WHO TAKES USAGE NOTICES, ONCE AT 50% AND ONCE AT 80% OF THE SANDBOXES' CLAUDE LOGIN'S SEVEN
 * DAYS. Who that is comes from `whoTakesTheNextUsageNotice`; with no secretary in the office, nobody is told. A count is
 * named by that window's reset, so a new reset starts a new count and the shares can be reached again. A notice is owed
 * only on a current own-event reading whose seven-day window is given and whose reset is still ahead of `now`; a stale,
 * missing or unreadable reading, a reading with no seven-day window, and a passed reset tell nobody, and no receipts
 * login is ever told. A share already told in this count is not told again, to this secretary or another. When two
 * shares are owed at once, after a restart for example, one notice names the higher and its mark covers both. The
 * words say the use as the reading read it and its reset. At 80% they say what the usage decision set in the office
 * says to do, or ask the secretary to ask the owner. A notice that goes to the first secretary appointed because the
 * agent chosen cannot take it ends with the reason. Answers the logins and shares said, as
 * `<login> <share>% to <secretary id>`.
 */
export function tellTheSecretaryHowMuchOfTheWeekIsUsed(workspaceId: string, now: Date, by: Actor, reading: Pick<LoginsWeek, 'logins' | 'zone'> = theReadingTheNoticeNeeds(now.getTime())): string[] {
  const sent: string[] = []
  const own = reading.logins.find((one): one is OwnEventReading => one.readFrom === 'own-event' && one.login === 'sandboxes-claude')
  if (own === undefined || own.state !== 'current' || own.sevenDays === null) return sent
  const sevenDays = own.sevenDays
  const resetMs = momentOfStampInZone(sevenDays.resetsAt, reading.zone)
  if (resetMs === null || resetMs <= now.getTime()) return sent
  const shares = THE_SHARES_THE_SECRETARIES_ARE_TOLD_AT.filter((share) => sevenDays.used * 100 >= share)
  if (shares.length === 0) return sent
  const already = theNoticesAlreadySent()
  const owed = shares.filter((share) => !already.has(told(own.login, sevenDays.resetsAt, share)))
  if (owed.length === 0) return sent
  const receiver = whoTakesTheNextUsageNotice()
  if (receiver === null) return sent
  const highest = Math.max(...owed)
  const mark: NoticeMark = { login: own.login, resets: sevenDays.resetsAt, shares: [...shares] }
  const words = SYSTEM_LINES.theLoginsWeekIsPartUsed(sayInEnglish(own.name), highest, sevenDays.used, sevenDays.resetsAt, reading.zone, whatTheUsageDecisionSaysToDo(), receiver.whyThisSecretary)
  writeASystemLineToOne(receiver.secretary, workspaceId, words, by, undefined, { loginsWeek: mark })
  sent.push(`${own.login} ${String(highest)}% to ${receiver.secretary.id}`)
  return sent
}
