// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A ROUND ENDED: THE OFFICE RECORDS IT, AND TELLS THE STARTER ONCE WHEN THERE WAS NO SEAL. Wave 13j round loop-1, task
 * "every round ends sealed or says why" (module HoSzb82KlTHJ), and answers two
 * decisions.
 *
 * WHY. A round whose process ended without a seal was found by its starter's own scripts, or not at all: 13k round 47b sat
 * six hours unchecked, a Codex round with no commits and no report ended orphaned with nobody asked to look, and a report
 * linked to the module and not the run left the starter waiting for ever. Now the office says it, from its own records.
 *
 * WHEN. `patchRecord` calls `recordHowARoundEndedWithoutASeal` after every write of a session, inside that write's
 * transaction. It does something only for a run started in a sandbox (its `sandbox` field), not sealed, with no account
 * yet, and only when this write is the end: the run became crashed or orphaned, or the launcher first wrote
 * `commandEnded`. So it fires once, and every path that ends a sandbox round reaches it, the session sweep's included.
 * After the ending write commits, the existing seal-read thread reads git, and a separate transaction writes the account
 * and its starter line together. If the server stops before that transaction, the incomplete account remains for recovery.
 *
 * WHAT. The reasons (./how-a-round-ended-rules.ts), what to do, and one waking line to the starter recorded on the agent
 * the run served, the same starter a seal tells (`whoIsToldOfTheRun`). Where nobody can be named, the account says why.
 * A sealed round's account is written by the record door at the seal (api/records.ts), with the hold.
 */
import { SYSTEM_LINES } from '@shared/groups.ts'
import { howTheRoundEndedAsStored, HOW_THE_ROUND_ENDED, readHowTheRoundEnded, type HowTheRoundEnded } from '@shared/how-the-round-ended.ts'
import { nowStamp } from '@shared/time.ts'
import { workerRoundStanding } from '@shared/releasing.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { enWave14c } from '@shared/words/en-wave-14c.ts'
import { isASessionState, type PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { theFactsBeforeTheSealOf, theGitFactsAskOf } from './before-the-seal.ts'
import { theRunsCommitsOf } from './before-the-seal-rules.ts'
import { readTheFinishApart } from './the-seal-read-apart.ts'
import { whenStored } from '../db/told-when-stored.ts'
import { getRevision } from './revisions.ts'
import { writeASystemLineToOne } from './groups.ts'
import { theAgentOfARunForItsSeal, whyAWorkersSupervisorIsNotTold } from './inspection.ts' // the owner's decision of 12 November 2026
import { THE_OFFICE } from './the-office.ts'
import { theOrderWritten } from '@shared/the-order-written.ts'
import { createRecordWithReport, getRecord, writeHowTheRoundEnded, writeTheEndHead, type Actor } from './records.ts'
import { theEndHeadToStore, theEndToRead, theHeadIn, theHeadReadOnTheThread, type TheHeadRead } from './a-runs-own-commits.ts'
import { PanelError } from './panel-error.ts'
import { captureGit, eachWasWrittenInPlace, theBaseARunNames, theRunsOwnMessageTo } from './sealed-tip.ts'
import { whoIsToldOfASeal, whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'
import { moleOffice, type ParticipantRef } from '@shared/participants.ts'
import { theStaleForkBases } from './the-stale-fork-bases.ts'
import { thePackagesThisRunHandedBack } from './delegation.ts'
import { inspectorAnswersRun } from './inspector-answers-lines.ts'
import { aCheckOfHandedBackPackages } from '../../config/verdict-kinds.mjs'
import {
  theHoldOfARoundWithNoCaseSays,
  theRoundNotForACheckSays,
  whatAMessageSaysAtTheSeal,
  whatTheEndSays,
  whatToDoAfterTheseReasons,
  whereTheOfficeReadAStop,
  whyTheRoundEndedWithoutASeal,
  type TheFactsAtTheEnd,
} from './how-a-round-ended-rules.ts'

const ENDS_WITHOUT_A_SEAL = new Set(['crashed', 'orphaned'])
const roundsBeingAccountedFor = new Set<string>()
/** Who writes the account on the run: the office itself, as the later-look mark is written. */
function theAccountIsWrittenBy(): Actor { return { type: 'system', id: moleOffice().id } }
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/** Whether this write ended a sandbox round with no seal, read from the data before it and the record after it. */
export function thisWriteEndedARoundWithoutASeal(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  if (!isObject(after['sandbox']) || after[HOW_THE_ROUND_ENDED] !== undefined) return false
  if (text(after['sealedTip']) !== null || after['state'] === 'finished') return false
  return thisWriteEndedTheRun(before, after)
}

/**
 * Whether this write is a run's end, in or out of a sandbox: the run became crashed or orphaned, or the launcher first
 * wrote `commandEnded`. The end commit of a run is read at the same end (./a-runs-own-commits.ts).
 */
export function thisWriteEndedTheRun(before: Record<string, unknown>, after: Record<string, unknown>): boolean {
  const becameAnEnd = !ENDS_WITHOUT_A_SEAL.has(String(before['state'])) && ENDS_WITHOUT_A_SEAL.has(String(after['state'])) &&
    !(after['state'] === 'crashed' && isObject(before['commandEnded']))
  const commandEndedNow = before['commandEnded'] === undefined && isObject(after['commandEnded'])
  return becameAnEnd || commandEndedNow
}

/** The folder the run was filed in: its first revision's `workingDirectory`. */
function theFolderItWasFiledIn(runId: string): string | null {
  const row = sqlite.prepare('SELECT data FROM revisions WHERE record_id = ? ORDER BY seq ASC LIMIT 1').get(runId) as { data: string | null } | undefined
  if (row?.data == null) return null
  try {
    const data = JSON.parse(row.data) as unknown
    return isObject(data) ? text(data['workingDirectory']) : null
  } catch {
    // A first revision that is not JSON names no folder; the reason is then not looked for, and nothing is claimed.
    return null
  }
}

/**
 * Reports this run filed (its session wrote their first revision) that are not linked about it, with what each is linked
 * to: the 25 written last, newest first, in the order written and not by their times in words. Each also says whether an
 * about link goes the other way, from the run to the report. That link does not make it a report about the run.
 */
function theReportsItFiledElsewhere(runId: string, about: readonly string[]): TheFactsAtTheEnd['reportsElsewhere'] {
  const filed = sqlite
    .prepare(
      `SELECT r.id AS id, ${theOrderWritten('r')} AS written FROM records r JOIN revisions v ON v.record_id = r.id AND v.op = 'create' ` +
        "WHERE v.session_id = ? AND r.kind = 'report' AND r.deleted_at IS NULL ORDER BY written DESC NULLS FIRST, r.rowid DESC LIMIT 25",
    )
    .all(runId) as { id: string; written: number | null }[]
  return eachWasWrittenInPlace(filed)
    .filter((one) => !about.includes(one.id))
    .map((one) => {
      const link = sqlite.prepare("SELECT to_id AS toId FROM links WHERE from_id = ? AND type = 'about' ORDER BY rowid LIMIT 1").get(one.id) as { toId: string } | undefined
      const fromTheRun = sqlite.prepare("SELECT 1 AS one FROM links WHERE from_id = ? AND to_id = ? AND type = 'about' LIMIT 1").get(runId, one.id) !== undefined
      return { report: one.id, linkedTo: link?.toId ?? null, ...(fromTheRun ? { theRunLinksToIt: true as const } : {}) }
    })
}

/** The run's fork base as a seal would read it, or null when git cannot say: a stale base is then not claimed. */
function theForkBaseOf(data: Record<string, unknown>): string | null {
  const directory = text(data['workingDirectory'])
  if (directory === null) return null
  const base = theBaseARunNames(data)
  try {
    return captureGit(directory, base, []).forkBase
  } catch {
    // Git could not be read; the commits reason already says so, and no stale base is claimed on a guess.
    return null
  }
}

/** Read every fact the rules judge. Git is read by the reminder's own reader, which says what it could not read. */
export function theFactsAtTheEndOf(run: PanelRecord, starter: ParticipantRef | null, carried?: { git: NonNullable<Parameters<typeof theFactsBeforeTheSealOf>[1]>; forkBase: string | null }): TheFactsAtTheEnd {
  const data = run.data
  // Only the commits and the reports are read here, so the code under src/ and tools/ is not read for copied test words.
  const before = theFactsBeforeTheSealOf(run, carried?.git)
  const ended = isObject(data['commandEnded']) ? data['commandEnded'] : null
  const messageId = starter === null ? null : theRunsOwnMessageTo(run.id, starter)
  const message = messageId === null ? null : getRecord(messageId)
  const reportsAboutTheRun = before.reports.map((one) => one.id)
  const staleBases = theStaleForkBases()
  return {
    runId: run.id,
    state: isASessionState(data['state']) ? data['state'] : 'unknown',
    commandEnded:
      ended === null
        ? null
        : { code: typeof ended['code'] === 'number' ? ended['code'] : null, signal: text(ended['signal']) },
    commits: 'commits' in before.git ? before.git.commits.length : { couldNotRead: before.git.couldNotRead },
    reportsAboutTheRun,
    reportsElsewhere: theReportsItFiledElsewhere(run.id, reportsAboutTheRun),
    lastMessage: message === null ? null : { id: message.id, body: typeof message.data['body'] === 'string' ? message.data['body'] : '' },
    folder: { filedIn: theFolderItWasFiledIn(run.id), now: text(data['workingDirectory']) },
    forkBase: staleBases.length === 0 ? null : carried === undefined ? theForkBaseOf(data) : carried.forkBase,
    staleBases,
    detail: text(data['detail']),
  }
}

/**
 * Write the incomplete account with the end, then queue its Git read only after the outermost transaction commits.
 */
export function recordHowARoundEndedWithoutASeal(runId: string, before: Record<string, unknown>, seq: number): void {
  const run = getRecord(runId)
  if (run === null || run.kind !== 'session' || !thisWriteEndedARoundWithoutASeal(before, run.data)) return
  try {
    sqlite.transaction(() => {
      const agent = theAgentOfARunForItsSeal(run)
      const told = agent === null ? null : whoIsToldOfASeal(agent)
      const starter = told !== null && 'to' in told ? told.to : null
      const facts = theFactsAtTheEndOf(run, starter, { git: { couldNotRead: enWave14c['roundEnd.gitPending'] }, forkBase: null })
      const reasons = whyTheRoundEndedWithoutASeal(facts).filter((reason) => reason.why !== 'commits-not-known')
      const processEnd = reasons.findIndex((reason) => reason.why !== 'the-process-died')
      reasons.splice(processEnd < 0 ? reasons.length : processEnd, 0, { why: 'git-being-read', says: enWave14c['roundEnd.gitPending'] })
      const account: HowTheRoundEnded = {
        sealed: false, at: nowStamp(), state: facts.state, reasons,
        says: whatTheEndSays(run.id, run.title, reasons),
        whatToDo: whatToDoAfterTheseReasons(run.id, reasons), starterTold: null,
      }
      writeHowTheRoundEnded(run.id, howTheRoundEndedAsStored(account), theAccountIsWrittenBy())
    })()
    whenStored(() => queueTheUnsealedEnd(runId, seq, false))
  } catch (error) {
    fileTheRoundEndProblem(run, error)
  }
}

function queueTheUnsealedEnd(runId: string, seq: number, late: boolean): void {
  if (roundsBeingAccountedFor.has(runId)) return
  roundsBeingAccountedFor.add(runId)
  setImmediate(() => { void completeTheUnsealedEnd(runId, seq, late).finally(() => roundsBeingAccountedFor.delete(runId)) })
}

/** Read git on the existing seal thread, then write the account and its one line together. */
async function completeTheUnsealedEnd(runId: string, seq: number, late: boolean): Promise<void> {
  // THE DATABASE CLOSED BEFORE THIS STEP CAME: the account keeps its git-being-read reason, and
  // finishTheRoundAccountsLeftAtAStop finishes it at the next start.
  if (!sqlite.open) return
  const run = getRecord(runId)
  if (run === null || run.kind !== 'session') return
  try {
    const initial = getRevision(runId, seq).content
    const endedRun = { ...run, title: initial.title, summary: initial.summary, data: initial.data }
    const ask = theGitFactsAskOf(endedRun, undefined, false)
    let git: NonNullable<Parameters<typeof theFactsBeforeTheSealOf>[1]> = { couldNotRead: 'the run names no working directory' }
    let forkBase: string | null = null
    // AND THE RUN'S END COMMIT, when no request read it at the end, on the same thread (./a-runs-own-commits.ts).
    const endAsk = theEndToRead(run.data)
    let endRead: TheHeadRead | null = null
    if (endAsk !== null && ask === null) endRead = await theHeadReadOnTheThread(endAsk.directory)
    if (ask !== null) {
      const seals = [{ directory: ask.directory, prior: null, named: ask.cutFrom, area: [] }]
      const read = await readTheFinishApart({ facts: [ask], seals, ...(endAsk === null ? {} : { heads: [endAsk] }) })
      if (endAsk !== null) endRead = theHeadIn(read, endAsk.directory)
      const facts = read.facts[0]?.read
      if (facts === undefined) throw new Error('The seal-read thread answered with no round-end facts.')
      if ('failed' in facts) throw new Error(facts.failed)
      git = 'couldNotRead' in facts.git ? facts.git : theRunsCommitsOf(facts.git)
      const seal = read.seals[0]?.outcome
      if (seal !== undefined && 'captured' in seal) forkBase = seal.captured.forkBase
    }
    sqlite.transaction(() => {
      const latest = getRecord(runId)
      if (latest === null || latest.kind !== 'session') return
      // Kept only when no other run was filed in the directory first (`theEndHeadToStore`).
      if (endAsk !== null && endRead !== null && theEndToRead(latest.data) !== null) {
        writeTheEndHead(runId, theEndHeadToStore(runId, endAsk.directory, endRead), theAccountIsWrittenBy())
      }
      const pending = readHowTheRoundEnded(latest.data[HOW_THE_ROUND_ENDED])
      if (pending === null || pending.sealed || !pending.reasons.some((reason) => reason.why === 'git-being-read') ||
          text(latest.data['sealedTip']) !== null || latest.data['state'] === 'finished') return
      const content = getRevision(runId, seq).content
      const accountRun = { ...latest, title: content.title, summary: content.summary, data: content.data }
      const agent = theAgentOfARunForItsSeal(accountRun)
      const told = agent === null ? { because: 'The run names no agent the office knows, so no starter was told.' } : whoIsToldOfTheRun(agent)
      const starter = 'to' in told ? told.to : null
      const history = agent === null ? null : whoIsToldOfASeal(agent)
      const historicalStarter = history !== null && 'to' in history ? history.to : null
      const facts = theFactsAtTheEndOf(accountRun, historicalStarter, { git, forkBase })
      const judged = whyTheRoundEndedWithoutASeal(facts)
      const withoutGit = pending.reasons.filter((reason) => reason.why !== 'git-being-read')
      const reasons = [
        ...withoutGit.filter((reason) => reason.why === 'the-process-died'),
        ...judged.filter((reason) => reason.why === 'no-commits' || reason.why === 'commits-not-known'),
        ...withoutGit.filter((reason) => reason.why !== 'the-process-died' && reason.why !== 'not-sealed'),
        ...judged.filter((reason) => reason.why === 'a-stale-base'),
        ...withoutGit.filter((reason) => reason.why === 'not-sealed'),
      ]
      if (reasons.length === 0) reasons.push(...judged.filter((reason) => reason.why === 'not-sealed'))
      const says = `${whatTheEndSays(accountRun.id, accountRun.title, reasons)}${late ? ` ${enWave14c['roundEnd.afterStop']}` : ''}`
      const whatToDo = whatToDoAfterTheseReasons(accountRun.id, reasons)
      const line = starter === null || pending.starterTold !== null ? null : writeASystemLineToOne(starter, accountRun.workspaceId, SYSTEM_LINES.aRoundEndedWithoutASeal(`${says} ${whatToDo}`), THE_OFFICE, { run: accountRun.id })
      const ended: HowTheRoundEnded = {
        sealed: false,
        at: pending.at,
        state: pending.state,
        reasons,
        says,
        whatToDo,
        starterTold: pending.starterTold ?? line?.id ?? null,
        ...('because' in told && pending.starterTold === null ? { notTold: told.because } : {}),
      }
      writeHowTheRoundEnded(accountRun.id, howTheRoundEndedAsStored(ended), theAccountIsWrittenBy())
    })()
  } catch (error) {
    fileTheRoundEndProblem(run, error)
  }
}

/** Keep the existing problem if either stage could not record its account. */
function fileTheRoundEndProblem(run: PanelRecord, error: unknown): void {
  const runId = run.id
  const because = error instanceof Error ? error.message : String(error)
  try {
      sqlite.transaction(() =>
        createRecordWithReport({
          kind: 'problem',
          title: `How the round ended was not recorded for run ${runId}`,
          workspaceId: run.workspaceId,
          data: {
            symptom: `The office could not record how run ${runId}'s round ended, and its starter was not told. The write failed with: ${because} The run's own write was not stopped.`,
            state: 'open',
            whose_move: 'agent',
            found_by: 'the office, while it recorded how a round ended',
          },
          links: [{ type: 'about', toId: runId }],
          actor: THE_OFFICE,
          bindCallerSession: false,
          // NEITHER LIST OF TITLES ALREADY FILED. Nothing this write gives back is kept.
          namesWhatIsAlreadyFiled: false,
        }),
      )()
  } catch {
    // The run's end stands even if the office could not file the problem either.
  }
}

/** Find incomplete accounts and their first stored snapshot in one read, once after the server starts. */
export function finishTheRoundAccountsLeftAtAStop(): number {
  const rows = sqlite.prepare(
    `SELECT r.id AS id, MIN(v.seq) AS seq FROM records r JOIN revisions v ON v.record_id = r.id ` +
    `WHERE r.kind = 'session' AND r.deleted_at IS NULL ` +
    `AND EXISTS (SELECT 1 FROM json_each(r.data, '$.howTheRoundEnded.reasons') j WHERE json_extract(j.value, '$.why') = 'git-being-read') ` +
    `AND EXISTS (SELECT 1 FROM json_each(v.data, '$.howTheRoundEnded.reasons') j WHERE json_extract(j.value, '$.why') = 'git-being-read') ` +
    `GROUP BY r.id`,
  ).all() as { id: string; seq: number }[]
  for (const row of rows) queueTheUnsealedEnd(row.id, row.seq, true)
  return rows.length
}

// ================================================================================================== a sealed round

/**
 * THE CASES OF A SANDBOX ROUND'S SEAL, in the order the office reads them; the first that holds decides. A run that says
 * it will not seal is held. A run that says not for a check is asked no check and is not queued, and its line's next
 * round is still asked. A run that handed back a package, said FEATURE READY: or was started as a repair is checked. A run
 * that did none of these is held, and its starter can release the check.
 */
export const THE_SEAL_CASES = ['it-will-not-seal', 'not-for-a-check', 'a-package', 'feature-ready', 'a-repair', 'none'] as const
export type ASealCase = (typeof THE_SEAL_CASES)[number]
const A_CHECK_IS_ASKED_IN: ReadonlySet<ASealCase> = new Set(['a-package', 'feature-ready', 'a-repair'])

/** What the office does with the check of a round that has just been sealed: ask for it, or hold it, and why. */
export type TheSealedRoundsCheck =
  | { case: 'a-package' | 'feature-ready' | 'a-repair'; hold: false; message: string | null; starter: ParticipantRef | null }
  | { case: 'not-for-a-check'; hold: false; message: string; starter: ParticipantRef; says: string }
  | { case: 'it-will-not-seal' | 'none'; hold: true; message: string | null; starter: ParticipantRef | null; says: string }

/** Whether the office asks for the check of a round at its seal: always for a round with no case, else by its case. */
export function aCheckIsAskedAtTheSeal(check: TheSealedRoundsCheck | null): boolean {
  return check === null || A_CHECK_IS_ASKED_IN.has(check.case)
}

/**
 * WHETHER A RUN WAS STARTED AS A REPAIR: a problem names it as the run of its hand-back's line (`extra.handBack.line.run`,
 * written by ./merge-state-machine.ts when it files the hand-back and when it starts a reserved repair run) or as the run
 * of its main-suite repair (`mainSuiteFix.repair.run`, written by tools/main-suite-fix-round.mjs). There are two places
 * because there are two repairs: of a feature handed back after it landed, and of a main suite that went red.
 */
function itWasStartedAsARepair(runId: string, workspaceId: string): boolean {
  return (
    sqlite
      .prepare(
        "SELECT 1 FROM records WHERE workspace_id = ? AND kind = 'problem' AND deleted_at IS NULL AND json_valid(data) AND " +
          "(json_extract(data, '$.extra.handBack.line.run') = ? OR json_extract(data, '$.mainSuiteFix.repair.run') = ?) LIMIT 1",
      )
      .get(workspaceId, runId, runId) !== undefined
  )
}

/**
 * THE CASE OF A ROUND JUST SEALED, and with it whether its check is asked, held or not asked (`THE_SEAL_CASES`). Only a
 * run started in a sandbox with no sealed account yet. The run's newest message to its starter, written since it began,
 * is read first (./how-a-round-ended-rules.ts): words in a quotation are not read, and when it says it will not seal the
 * account names the sentence that says so. A run that wrote its starter no message, or has no starter, is read by its
 * packages and repairs alone, so a silent round is held too: the office asks for a check only when a whole feature is done.
 * Null when this is not a sandbox round, or its sealed account is already written.
 */
export function theCheckOfASealedRound(run: PanelRecord): TheSealedRoundsCheck | null {
  if (!isObject(run.data['sandbox'])) return null
  const held = run.data[HOW_THE_ROUND_ENDED]
  if (isObject(held) && held['sealed'] === true) return null
  const agent = theAgentOfARunForItsSeal(run)
  const told = agent === null ? null : whoIsToldOfASeal(agent)
  const starter = told !== null && 'to' in told ? told.to : null
  const messageId = starter === null ? null : theRunsOwnMessageTo(run.id, starter)
  const message = messageId === null ? null : getRecord(messageId)
  const body = message !== null && typeof message.data['body'] === 'string' ? message.data['body'] : ''
  const said = message === null ? ({ says: 'nothing' } as const) : whatAMessageSaysAtTheSeal(body, run.id)
  if (message !== null && starter !== null && said.says === 'it-will-not-seal') {
    return {
      case: 'it-will-not-seal', hold: true, message: message.id, starter,
      says: `The run's last message to its starter, ${message.id}, says it will not seal, so the office asked for no check. ${whereTheOfficeReadAStop(said.sentence)}`,
    }
  }
  if (message !== null && starter !== null && said.says === 'not-for-a-check') {
    return { case: 'not-for-a-check', hold: false, message: message.id, starter, says: theRoundNotForACheckSays(run.id, message.id, said.line) }
  }
  if (inspectorAnswersRun(run.id, run.workspaceId) || aCheckOfHandedBackPackages(thePackagesThisRunHandedBack(run.id, run.workspaceId))) return { case: 'a-package', hold: false, message: message?.id ?? null, starter }
  if (said.says === 'feature-ready') return { case: 'feature-ready', hold: false, message: message?.id ?? null, starter }
  if (itWasStartedAsARepair(run.id, run.workspaceId)) return { case: 'a-repair', hold: false, message: message?.id ?? null, starter }
  return { case: 'none', hold: true, message: message?.id ?? null, starter, says: theHoldOfARoundWithNoCaseSays(starter !== null) }
}

/**
 * WRITE THE SEALED ROUND'S ACCOUNT, and when the check is held tell the owner once, with what to do. Called by the
 * record door after the seal's write. A failure here is answered to the caller as `notKept`; the seal stands.
 */
export function recordHowASealedRoundEnded(
  run: PanelRecord,
  check: TheSealedRoundsCheck,
  asked: boolean,
  checksOff = false,
): { kept: true; howTheRoundEnded: HowTheRoundEnded; line?: string } | { kept: false; because: string } {
  try {
    return sqlite.transaction(() => {
      const sealedTip = text(run.data['sealedTip']) ?? 'unknown'
      const workerNote = workerRoundStanding(run.data, 'inspecting')
      let line: string | undefined
      const agent = check.hold && !checksOff ? theAgentOfARunForItsSeal(run) : null
      const told = agent === null ? null : whoIsToldOfTheRun(agent)
      const owner = told !== null && 'to' in told ? told.to : null
      if (check.hold && owner !== null && whyAWorkersSupervisorIsNotTold(run, owner) === null) {
        const said =
          `Run ${run.id} ("${run.title}") was sealed, and its check is held. ${check.says} ${check.message === null ? 'If' : 'Read the message; if'} the round is ` +
          `done, release the check with POST /api/records/${run.id}/release-the-held-check {"because":"<why>"}. If it is not, ` +
          'leave it held and start the round again.'
        line = writeASystemLineToOne(owner, run.workspaceId, SYSTEM_LINES.theCheckIsHeld(said), THE_OFFICE, { run: run.id, ...(check.message === null ? {} : { message: check.message }) }).id
      }
      const ended: HowTheRoundEnded = {
        sealed: true,
        at: nowStamp(),
        sealedTip,
        theCheck: checksOff ? 'not asked' : check.hold ? 'held' : check.case === 'not-for-a-check' || workerNote !== null ? 'not asked' : asked ? 'asked' : 'not asked',
        says: checksOff && check.case !== 'not-for-a-check'
          ? sayInEnglish('chk.says.checksOffNeedsNoCheck')
          : check.hold || check.case === 'not-for-a-check'
          ? check.says
          : workerNote !== null
            ? workerNote.sentence
            : asked
              ? `Run ${run.id} was sealed, and the office asked for its check.`
              : `Run ${run.id} was sealed, and the office asked for no check: the project's review level or the run's eligibility asks none.`,
        ...(check.message === null ? {} : { message: check.message }),
      }
      writeHowTheRoundEnded(run.id, howTheRoundEndedAsStored(ended), theAccountIsWrittenBy())
      return { kept: true as const, howTheRoundEnded: ended, ...(line === undefined ? {} : { line }) }
    })()
  } catch (error) {
    return { kept: false, because: `The office could not write how run ${run.id}'s round ended: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * RELEASE A HELD CHECK: write who released it and why on the account. The caller then asks for the check, as a seal
 * does. Refused, with nothing written, when the round's check is not held or was already released.
 */
export function releaseTheHeldCheck(run: PanelRecord, by: string, because: string): HowTheRoundEnded {
  const ended = readHowTheRoundEnded(run.data[HOW_THE_ROUND_ENDED])
  if (ended === null || !ended.sealed || ended.theCheck !== 'held') {
    throw new PanelError(`The check of run ${run.id} is not held, so there is nothing to release. Nothing was written.`, 409)
  }
  if (ended.released !== undefined) {
    throw new PanelError(`The check of run ${run.id} was already released by ${ended.released.by} at ${ended.released.at}. Nothing was written.`, 409)
  }
  const released: HowTheRoundEnded = { ...ended, released: { by, at: nowStamp(), because } }
  writeHowTheRoundEnded(run.id, howTheRoundEndedAsStored(released), theAccountIsWrittenBy())
  return released
}
