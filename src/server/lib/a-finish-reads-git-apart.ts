// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITE THAT FINISHES A RUN READS ITS GIT ON THE SEAL-READ THREAD (item 2o of the requirement list, the finish).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WENT WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A write that seals a run read the run's git on the request thread up to four times: the reminder before the seal, the
 * hard gate (`refuseTheSealOverAFault`), the seal itself (`theGitOfASeal`), and what the seal found of the
 * reminder's items (`keepWhatTheSealDidWithTheReminder`). Each read walks the whole worktree to find the files outside
 * the commit, which took about 275 ms on the server's own repository, and no other request was read meanwhile.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOES
 * ---------------------------------------------------------------------------------------
 *
 * THE WRITE RUNS IN PASSES. Each pass is the write as it was, one synchronous act, so every guard runs in its order and
 * no transaction is held across an await. When the gate or the seal asks for git the pass has no reading of, the ask is
 * noted and `AReadingIsNeeded` is thrown. Then every ask noted so far is read on the seal-read thread at once
 * (`readTheFinishApart`), and the write runs again with that reading. A finish usually runs three passes: the first stops
 * at the gate, the second at the seal, and the third writes.
 *
 * EACH GIT IS READ WHERE IT WAS READ BEFORE, IN THE ORDER OF THE GUARDS. The gate's git is asked by the gate, after the
 * door's own refusals, who may end the run (`assertMayEndARun`, for a write that ends it) and who may change a record of
 * the kind (`assertMayWrite`), as the gate asked it before on the request thread. Who may change the run's other fields
 * (`assertMayChangeARun`) is asked after the gate, last before the write, as it always was, so that a write another rule
 * refuses is told that rule's words; a caller it refuses has had the gate's git read, as before. The seal's git is asked
 * only by the seal, so only a pass that got past that guard and every other one asks for it. The reminder before the
 * seal is asked before the write and only of the run's own key (`theRunsOwnRequest`), as before.
 *
 * A PASS THAT NEEDS A READING LEAVES NOTHING. Each pass runs inside one transaction of its own, opened by `transaction`,
 * so `whenStored` holds what it would tell (src/server/db/told-when-stored.ts). A pass that ends in `AReadingIsNeeded` is
 * rolled back whole: its rows, its revisions and changes, its gate counts, the held drafts it sent, the keys it took
 * back, and every announcement and look it asked for. A pass that ends any other way is committed, and its answer or its
 * refusal is handed on as the write gave it, so a refused write keeps what it kept before. A count a refusal hands to
 * `gateMetOnceTheWriteIsTakenBack` outside the write's own transactions is then made by the error handler, as it
 * already was for a run's own finish, which sends its held drafts in a transaction of its own (lib/turn-drafts.ts).
 *
 * THE SAME READ. The thread runs the same `theGitOfASeal`, the same `captureGit` and the same readers of the facts, with
 * the same arguments, and the request thread rebuilds what they returned or throws what they threw, with every field of
 * the PanelError. The thread walks a tree once for a facts question and a seal question that ask the same thing.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS READ AGAIN, AND WHAT IS NOT SEEN
 * ---------------------------------------------------------------------------------------
 *
 * The run, its key and the run's seal are read again by the next pass, because the pass is the whole write. The tree is
 * not: a reading made before the write would be sealed as if the tree had not changed since. So the thread stamps each
 * worktree before it reads and checks every path of the stamp after (./a-worktree-stamp.ts), and a pass uses a reading
 * only when that check held, the check ended at most `THE_MOST_A_READING_IS_USED_AFTER_ITS_CHECK_MS` before the pass
 * started, and git's own files (HEAD, the index, the refs) are as the stamp found them when the pass starts. Otherwise
 * the pass asks again. A write that would need more than `THE_MOST_READS` reads is refused with 409, and nothing of it
 * is stored.
 *
 * NOT SEEN: an edit to a working file, not staged, made within that bound after the thread's last check. A full check
 * on the request thread would see it, and it is the cost this file removes: 21 ms for 9,847 files, measured. So a seal is
 * of the tree as it stood at most that bound before the write. A busy office can wait longer than the bound to start a
 * pass, and a tree that changes on every read is never sealed: both are refused after four reads, and the write sent
 * again is read again.
 */
import type { FastifyRequest } from 'fastify'
import type { GitSubmission } from '@shared/sealed-tip.ts'
import type { PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { theGitFilesHold } from './the-git-files-hold.ts'
import { PanelError } from './panel-error.ts'
import { readTheFinishApart } from './the-seal-read-apart.ts'
import { theRefusalAgain } from './the-refusal-again.ts'
import { thePartsOf, type ThePartsOfADoor } from './the-parts-of-a-check-door.ts'
import type { ACarriedGitFacts, ACommitsPastTheCutAsk, AFinishReading, AGitFactsAsk, ASealGitAsk, TheCommitsPastTheCut } from './the-seal-read-apart-thread.ts'
import type { AnOwnCommitsAsk, TheRunsOwnCommits } from './a-runs-own-commits.ts'

/**
 * The most times a finishing write reads its git on the thread, and the most reads of the facts the reminder asks for,
 * before a 409. A finish reads twice, for the gate and then for the seal, so a write may read twice more.
 */
export const THE_MOST_READS = 4

/** How long after the thread's last check of the tree a pass may still start with its reading. */
export const THE_MOST_A_READING_IS_USED_AFTER_ITS_CHECK_MS = 250

/** What one request asked of git, and the reading it has. */
interface TheReadings {
  facts: AGitFactsAsk[]
  seals: ASealGitAsk[]
  reading: AFinishReading | null
  /** Whether this pass may use `reading`, decided when the pass starts. */
  usable: boolean
  /** Checks the reminder left for the write, asked by the gate with the run as the write would store it. */
  again: ((run: PanelRecord) => void)[]
  parts: ThePartsOfADoor
  /** The commits past a run's cut a records seal asked for. */
  commits: ACommitsPastTheCutAsk[]
  /** The run's own commits a seal asked for (./a-runs-own-commits.ts). */
  own: AnOwnCommitsAsk[]
  /** Why the pass that runs now, or the last one, did not check the commits past the run's cut, for the answer alone. */
  notChecked: string | null
  /**
   * The revisions the check's facts read of each run in this request, by the run's id (`theRevisionsTheCheckReads` in
   * ./inspection.ts). A pass that is rolled back leaves its rows here, and the next ask finds the newest kept row no
   * longer stored under its number, and reads every row again.
   */
  revisions: Map<string, TheRevisionsTheCheckRead>
}

/** One revision as the check's facts read it, with who wrote it, or `unreadable` where JSON.parse could not read it. */
export type ARevisionTheCheckRead = { snapshot: unknown; writer: { type: string | null; id: string | null } } | { unreadable: true }

/** The revisions of one run the check's facts read, in order, and the newest row read, by its number and its id. */
export interface TheRevisionsTheCheckRead {
  read: readonly ARevisionTheCheckRead[]
  newest: { seq: number; id: string }
}

const THE_READINGS = new WeakMap<FastifyRequest, TheReadings>()

/** The readings of the pass that runs now, or null outside a finishing write: then every reader reads where it is. */
let current: TheReadings | null = null

/** The readings of the step of a finishing write that runs now before its passes (`asAStepOfThisFinish`), or null. */
let aStepBeforeThePasses: TheReadings | null = null

const UNTIMED: ThePartsOfADoor = { part: (_name, work) => work(), waited: (_name, waiting) => waiting() }

/**
 * Whether a reading of the facts' git answers another question of them, and the reading as that question would have read
 * it (`aGitReadingFor` in ./before-the-seal.ts), or null.
 */
export type AGitReadingFor = (have: AGitFactsAsk, read: ACarriedGitFacts, want: AGitFactsAsk) => ACarriedGitFacts | null

/** Thrown inside a pass that asked for git its reading does not hold. Only the pass loop of its own request catches it. */
export class AReadingIsNeeded extends Error {
  constructor(readonly readings: object) {
    super('A finishing write asked for git that was not read yet. The write is meant to be run by aFinishReadsItsGitApart, which reads it and runs the write again.')
  }
}

function theReadingsOf(req: FastifyRequest): TheReadings {
  let readings = THE_READINGS.get(req)
  if (readings === undefined) {
    readings = { facts: [], seals: [], reading: null, usable: false, again: [], parts: UNTIMED, commits: [], own: [], notChecked: null, revisions: new Map() }
    THE_READINGS.set(req, readings)
  }
  return readings
}

/**
 * Time this request's finishing path from here, and say its parts in the log when it is answered
 * (`sayThePartsOfTheCheckDoors`). A path timed already keeps its first start: the reminder before the seal starts it,
 * and the write's own call after the reminder then times on.
 */
export function timeTheFinishOf(req: FastifyRequest, door: string): void {
  const readings = theReadingsOf(req)
  if (readings.parts === UNTIMED) readings.parts = thePartsOf(req, door, 'finishParts')
}

/** How a write hands its synchronous act to be run as one pass. A write that finishes nothing runs it as it is. */
export type InOnePass = <U>(act: () => U) => U

/**
 * RUN A FINISHING WRITE IN PASSES. `write` runs the write as it was and hands its synchronous act to `inside`, which runs
 * it as one pass. An `AReadingIsNeeded` of this request's own is caught here and nothing else is.
 */
export async function aFinishReadsItsGitApart<T>(req: FastifyRequest, write: (inside: InOnePass) => Promise<T> | T): Promise<T> {
  const readings = theReadingsOf(req)
  for (let pass = 1, reads = 0; ; pass += 1) {
    try {
      return await write((act) => readings.parts.part(`the write, pass ${pass}`, () => during(readings, act)))
    } catch (err) {
      if (!(err instanceof AReadingIsNeeded) || err.readings !== readings) throw err
      if (reads === THE_MOST_READS) throw theGitKeptChanging(reads, 'the write')
      reads += 1
      // THE SEAL'S QUESTION ALONE, when the pass that stopped at the seal could use its reading and that reading holds every
      // question of the facts noted, none failed and none git could not read: the facts are not read a second time.
      const before = readings.reading
      if (before !== null && readings.usable && (readings.seals.length > 0 || readings.commits.length > 0 || readings.own.length > 0) && theFactsAreAllIn(before, readings.facts)) {
        const alone = await readings.parts.waited(`the git read apart after pass ${pass}, for 0 of the facts and ${String(readings.seals.length)} of the seal${andTheCommits(readings)}`, () =>
          readTheFinishApart({ facts: [], seals: readings.seals, commits: readings.commits, own: readings.own }),
          (read) => ({ asksAhead: read.asksAhead, threadWaitMs: read.threadWaitMs, gitReadMs: read.gitReadMs }),
        )
        readings.reading = theTwoReadingsJoined(before, alone)
        continue
      }
      // THE PART SAYS WHAT WAS READ, so the log shows which questions each read held: the seal's comes only after a pass
      // that reached the seal.
      const asked = `${String(readings.facts.length)} of the facts and ${String(readings.seals.length)} of the seal${andTheCommits(readings)}`
      readings.reading = await readings.parts.waited(`the git read apart after pass ${pass}, for ${asked}`, () =>
        readTheFinishApart({ facts: readings.facts, seals: readings.seals, commits: readings.commits, own: readings.own }),
        (read) => ({ asksAhead: read.asksAhead, threadWaitMs: read.threadWaitMs, gitReadMs: read.gitReadMs }),
      )
    }
  }
}

function during<U>(readings: TheReadings, act: () => U): U {
  const outer = current
  current = readings
  // EACH PASS SAYS AGAIN WHAT IT DID NOT CHECK, so a pass that is rolled back leaves nothing in the answer.
  readings.notChecked = null
  try {
    const reading = readings.reading
    readings.usable =
      reading !== null &&
      reading.held &&
      performance.timeOrigin + performance.now() - reading.checkedAt <= THE_MOST_A_READING_IS_USED_AFTER_ITS_CHECK_MS &&
      reading.stamps.every((stamp) => 'notMade' in stamp || theGitFilesHold(stamp))
    const ended = sqlite.transaction((): { gave: U } | { threw: unknown } => {
      try {
        return { gave: act() }
      } catch (err) {
        if (err instanceof AReadingIsNeeded && err.readings === readings) throw err
        return { threw: err }
      }
    })()
    if ('threw' in ended) throw ended.threw
    return ended.gave
  } finally {
    current = outer
  }
}

/** The part's words for the commits past the cut a read asked for, said only when it asked for some. */
function andTheCommits(readings: TheReadings): string {
  return (readings.commits.length === 0 ? '' : `, and ${String(readings.commits.length)} of the commits past the cut`) +
    (readings.own.length === 0 ? '' : `, and ${String(readings.own.length)} of the run's own commits`)
}

/** Whether `reading` holds a reading of every question in `asks`, none failed and none git could not read. */
function theFactsAreAllIn(reading: AFinishReading, asks: AGitFactsAsk[]): boolean {
  return asks.every((ask) => reading.facts.some((one) => JSON.stringify(one.ask) === JSON.stringify(ask) && !('failed' in one.read) && !('couldNotRead' in one.read.git)))
}

/**
 * THE FACTS OF `facts` AND THE REST OF `seal`, when `seal` held and stamped every tree `facts` stamped as `facts` did: then
 * both read one tree, and `seal` checked it last. Otherwise `seal` alone, so the next pass finds no facts and has
 * everything read again.
 */
function theTwoReadingsJoined(facts: AFinishReading, seal: AFinishReading): AFinishReading {
  const said = new Map(seal.stamps.flatMap((stamp) => ('notMade' in stamp ? [] : [[stamp.directory, stamp.said] as const])))
  const sameTree = seal.held && facts.stamps.length > 0 && facts.stamps.every((stamp) => !('notMade' in stamp) && said.get(stamp.directory) === stamp.said)
  return sameTree ? { ...seal, facts: facts.facts } : seal
}

/** Whether `reading` stamped `directory`: a reading of a tree with no stamp cannot say it did not change. */
function stamped(reading: AFinishReading, directory: string): boolean {
  return reading.stamps.some((stamp) => stamp.directory === directory && !('notMade' in stamp))
}

function note(readings: TheReadings, ask: { facts: AGitFactsAsk } | { seal: ASealGitAsk }): void {
  if ('facts' in ask) {
    if (!readings.facts.some((one) => JSON.stringify(one) === JSON.stringify(ask.facts))) readings.facts.push(ask.facts)
  } else if (!readings.seals.some((one) => JSON.stringify(one) === JSON.stringify(ask.seal))) readings.seals.push(ask.seal)
}

function need(readings: TheReadings, ask: { facts: AGitFactsAsk } | { seal: ASealGitAsk }): never {
  note(readings, ask)
  throw new AReadingIsNeeded(readings)
}

/**
 * THE SEAL'S GIT INSIDE A PASS, as `theGitOfASeal` read it on the thread, or null outside a finishing write. A refusal is
 * thrown again with its fields. Throws `AReadingIsNeeded` when the pass's reading does not hold it.
 */
export function theGitOfASealAtTheWrite(ask: ASealGitAsk): GitSubmission | null {
  const readings = current
  if (readings === null) return null
  const reading = readings.usable ? readings.reading : null
  const found = reading?.seals.find((one) => JSON.stringify(one.ask) === JSON.stringify(ask))
  if (reading === null || reading === undefined || found === undefined) return need(readings, { seal: ask })
  const { outcome } = found
  if ('refused' in outcome) throw theRefusalAgain(outcome.refused)
  if ('failed' in outcome) throw new Error(outcome.failed)
  if (!stamped(reading, ask.directory)) return need(readings, { seal: ask })
  return outcome.captured
}

/**
 * THE COMMITS PAST A RUN'S CUT INSIDE A PASS, as `theCommitsPastTheCut` read them on the thread, or null outside a finishing
 * write. A reading git could not make is used with no stamp, as the facts' is. Throws `AReadingIsNeeded` when the pass's
 * reading does not hold it.
 */
export function theCommitsPastTheCutAtTheWrite(ask: ACommitsPastTheCutAsk): TheCommitsPastTheCut | null {
  const readings = current
  if (readings === null) return null
  const reading = readings.usable ? readings.reading : null
  const found = reading?.commits.find((one) => JSON.stringify(one.ask) === JSON.stringify(ask))
  if (reading === null || reading === undefined || found === undefined) return needTheCommits(readings, ask)
  if ('failed' in found.read) throw new Error(found.read.failed)
  if (!('couldNotRead' in found.read) && !stamped(reading, ask.directory)) return needTheCommits(readings, ask)
  return found.read
}

function needTheCommits(readings: TheReadings, ask: ACommitsPastTheCutAsk): never {
  if (!readings.commits.some((one) => JSON.stringify(one) === JSON.stringify(ask))) readings.commits.push(ask)
  throw new AReadingIsNeeded(readings)
}

/**
 * A RUN'S OWN COMMITS INSIDE A PASS, as `theRunsOwnCommitsRead` read them on the thread, or null outside a finishing
 * write. A directory git could not read is used with no stamp, as the commits past the cut are. An `unread` that holds a
 * head needs the stamp, as every answer that holds a head does. Throws `AReadingIsNeeded` when the pass's reading does
 * not hold it.
 *
 * `seal` IS THE SEAL'S GIT THE SAME WRITE ASKS NEXT, or null for a seal that reads none. A read the own commits need asks
 * for it too, so a finish reads its own commits and its seal's git in one read apart, under one stamp, and not in two.
 */
export function theRunsOwnCommitsAtTheWrite(ask: AnOwnCommitsAsk, seal: ASealGitAsk | null): TheRunsOwnCommits | null {
  const readings = current
  if (readings === null) return null
  const reading = readings.usable ? readings.reading : null
  const found = reading?.own.find((one) => JSON.stringify(one.ask) === JSON.stringify(ask))
  if (reading === null || reading === undefined || found === undefined) return needTheOwnCommits(readings, ask, seal)
  if ('failed' in found.read) throw new Error(found.read.failed)
  if (!('unread' in found.read && found.read.head === undefined) && !stamped(reading, ask.directory)) return needTheOwnCommits(readings, ask, seal)
  return found.read
}

function needTheOwnCommits(readings: TheReadings, ask: AnOwnCommitsAsk, seal: ASealGitAsk | null): never {
  if (!readings.own.some((one) => JSON.stringify(one) === JSON.stringify(ask))) readings.own.push(ask)
  if (seal !== null) note(readings, { seal })
  throw new AReadingIsNeeded(readings)
}

/** Say in this finishing write's answer, and nowhere else, why the commits past the run's cut were not checked. */
export function sayTheCommitsWereNotChecked(sentence: string): void {
  if (current !== null) current.notChecked = sentence
}

/** The answer's key saying why the commits past the run's cut were not checked, from the pass that wrote, or nothing. */
export function theCommitsNotCheckedFor(req: FastifyRequest): { commitsPastTheCutNotChecked?: string } {
  const sentence = THE_READINGS.get(req)?.notChecked ?? null
  return sentence === null ? {} : { commitsPastTheCutNotChecked: sentence }
}

/** The reading of the facts `reading` holds for `ask`, as `ask` would have read it, a failure, or undefined. */
function theFactsFor(reading: AFinishReading, ask: AGitFactsAsk, readingFor: AGitReadingFor): ACarriedGitFacts | { failed: string } | undefined {
  for (const one of reading.facts) {
    if ('failed' in one.read) {
      if (JSON.stringify(one.ask) === JSON.stringify(ask)) return one.read
      continue
    }
    const read = readingFor(one.ask, one.read, ask)
    if (read !== null) return read
  }
  return undefined
}

/**
 * THE FACTS' GIT INSIDE A PASS, as the thread read it, or null outside a finishing write. `readingFor` says whether a
 * reading of one question answers another. Throws `AReadingIsNeeded` when the pass's reading does not hold it.
 */
export function theGitFactsAtTheWrite(ask: AGitFactsAsk, readingFor: AGitReadingFor): ACarriedGitFacts | null {
  const readings = current
  if (readings === null) return null
  const reading = readings.usable ? readings.reading : null
  const found = reading === null ? undefined : theFactsFor(reading, ask, readingFor)
  if (reading === null || found === undefined) return need(readings, { facts: ask })
  if ('failed' in found) throw new Error(found.failed)
  if (!('couldNotRead' in found.git) && !stamped(reading, ask.directory)) return need(readings, { facts: ask })
  return found
}

/** Whether a finishing write's pass runs now. */
export function aFinishingPassRuns(): boolean {
  return current !== null
}

/**
 * Run `work`, a synchronous step of the finishing write of `req` before its passes, so the revisions the check's facts
 * read in it are kept for the passes. The reminder before the seal asks those facts here.
 */
export function asAStepOfThisFinish<T>(req: FastifyRequest, work: () => T): T {
  const outer = aStepBeforeThePasses
  aStepBeforeThePasses = theReadingsOf(req)
  try {
    return work()
  } finally {
    aStepBeforeThePasses = outer
  }
}

/**
 * The revisions the check's facts kept in the finishing write that runs now, by run, or null outside a pass and outside
 * a step `asAStepOfThisFinish` runs: then the facts read every revision as they always did. They are the request's own,
 * and go with it.
 */
export function theRevisionsKeptForThisFinish(): Map<string, TheRevisionsTheCheckRead> | null {
  return (current ?? aStepBeforeThePasses)?.revisions ?? null
}

/**
 * Run `work` as the part `name` of the pass that runs now, so the finish's line says what that work cost inside the pass.
 * Outside a finishing write's pass, it runs as it is.
 */
export function aPartOfThisPass<T>(name: string, work: () => T): T {
  return (current?.parts ?? UNTIMED).part(name, work)
}

/** Leave a check for the write: the gate asks it inside each pass, with the pass's reading. */
export function checkAgainAtTheWrite(req: FastifyRequest, check: (run: PanelRecord) => void): void {
  theReadingsOf(req).again.push(check)
}

/** Ask the checks the reminder left, inside the pass that runs now, of the run as the write would store it. */
export function theChecksLeftForTheWrite(run: PanelRecord): void {
  for (const check of current?.again ?? []) check(run)
}

/**
 * THE FACTS' GIT, READ ON THE THREAD FOR A STEP BEFORE OR AFTER THE WRITE: the reminder, and what the seal found of it.
 * Read again while the tree changed during the read, up to `THE_MOST_READS` reads; then 409. When the write's own
 * reading answers it, that reading is used, because it is the tree the seal read.
 */
export async function theGitFactsReadApart(req: FastifyRequest, ask: AGitFactsAsk, name: string, readingFor: AGitReadingFor): Promise<ACarriedGitFacts> {
  const readings = theReadingsOf(req)
  const sealed = readings.reading === null ? undefined : theFactsFor(readings.reading, ask, readingFor)
  if (sealed !== undefined && !('failed' in sealed)) return sealed
  for (let read = 1; ; read += 1) {
    const reading = await readings.parts.waited(read === 1 ? name : `${name}, read ${read}`, () => readTheFinishApart({ facts: [ask], seals: [] }))
    const one = reading.facts[0]
    if (one === undefined) throw new Error('The seal-read thread answered a facts question with no facts.')
    if ('failed' in one.read) throw new Error(one.read.failed)
    if (reading.held) return one.read
    if (read === THE_MOST_READS) throw theGitKeptChanging(read, name)
  }
}

/**
 * THE REFUSAL OF A STEP WHOSE RUN CHANGED WHILE ITS GIT WAS READ ON THE THREAD: written, reminded, sealed or deleted
 * meanwhile, or its key taken back. The step was allowed on the run as it was, so it writes nothing on the run as it is.
 */
export function theRunChangedWhileItsGitWasRead(runId: string): PanelError {
  return new PanelError(
    `Run ${runId} changed while the office read its git for the reminder before the seal, so this write was not taken: ` +
      'nothing was written, no reminder was given and nothing was counted. Read the run again, then send the write again.',
    409,
  )
}

/** The refusal of a finishing write whose git could not be read still, or not soon enough before the write. */
function theGitKeptChanging(reads: number, step: string): PanelError {
  return new PanelError(
    `The office read this run's git on a thread of its own ${String(reads)} times for ${step}, the most it reads, and had no reading it could use. ` +
      'A reading cannot be used when the worktree changed while it was read, or when the write could not start within ' +
      `${String(THE_MOST_A_READING_IS_USED_AFTER_ITS_CHECK_MS)} ms of it because the office was busy. ` +
      'Nothing was written: no seal, no reminder and no change to the run. Send the same write again once nothing is changing the worktree.',
    409,
  )
}
