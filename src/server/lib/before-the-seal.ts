// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REMINDER BEFORE THE SEAL, ITS BLOCK POSITION, AND THE HARD GATE. The owner's first decision was the original office
 * flow design B: a reminder, never a gate. A later decision made a migration item the seal's own check still finds a hard
 * gate, because the merge queue renumbers a migration and a test that names one by its first digits can point at another
 * migration afterwards. Wave 13j round 50 built the reminder; wave 14a round 1 added the gate.
 * The block position also refuses a later write over a certain item the reminder named that the same finder still
 * finds. A likely item stays a reminder, and a check-also item is never judged. A fault of form is listed and never
 * refused: what a program cannot fill is listed, not refused, and a position called "remind" never blocks. The hard
 * gate's every refusal is counted as a stopped write.
 *
 * WHAT IT DOES. When a run's own key writes the patch that seals the run, the record door asks this file first. If the
 * gate is at remind or block and the run has not been reminded for this seal, nothing of the patch is written: the reply carries
 * the reminder, and the office keeps a quiet line to the run's agent saying so; both mark each item that will refuse a
 * later write. At off, the office counts one encounter when the items are not empty and goes on to the seal without a
 * reminder. At block, a later refusal counts one more encounter and one more stopped write. The same write sent again
 * at remind seals as before, whatever the reminder said — EXCEPT over an item the hard gate still finds
 * (`refuseTheSealOverAFault` below). A migration item refuses a git seal, whoever sends the write, whether or not a
 * reminder ran, and whether or not the write asked for none. A fault of form refuses nothing.
 *
 * WHY BEFORE AND NOT AFTER. The seal asks for the check at once (`theOfficeStartsTheCheck` in api/records.ts), so a
 * reminder that came after the seal would come after the inspector was already asked. A reminder must reach the run
 * while it can still act, and the only moment the office knows a run is about to end is the write that ends it. The
 * block position and hard migration check are asked at that same moment, so a refused write leaves the run as it was.
 * The hard migration check also covers filing: in the patch path it stands before
 * anything is written, and in the filing path it stands inside the filing's transaction, which its refusal rolls back
 * whole. The refused seal is counted once that transaction is taken back, so the count survives the rollback.
 *
 * WHAT IT READS: the run's own commits since its fork base (git, read here), the run's named-tests use lines, and the
 * reports linked `about` the run, all on the run as the sealing write would store it. When the added test lines have a
 * candidate, it reads tracked code under src/, tools/ and plugin src/ folders from the captured Git tip. When the write names a tip that is
 * not the working directory's HEAD, or that directory holds none of the run's own commits, it also reads the
 * repository's other worktrees (`theOtherWorktreesCarrying`, item 2x). What it cannot read it says in `notChecked`, and
 * never counts as passed. What it judges, and which items are certain, is in ./before-the-seal-rules.ts, which opens no
 * database. The gate asks the same finder on the branch as the write would seal it. Block judges only the reminder's
 * certain named items. A branch can gain a migration item after the reminder: the hard check then refuses a seal the
 * reminder never named an item for, and atTheSeal (`whatTheSealFound`) compares only the keys the reminder named, not
 * every item the gate finds.
 *
 * WHO IS REMINDED: only a request made with the run's own key (its `extra.runKeyId` row) or a supervisor's key acting
 * for the run. The launcher finishes a run after the agent's command has ended, when nobody can act on a reminder, so
 * it sends `remindBeforeTheSeal: false`, which any caller may send. Block has no finding to refuse without a reminder.
 * The hard gate does not depend on the reminder: it runs on every write that would seal, whoever sends it, and refuses
 * only a migration item of a branch seal.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet, gateMetOnceTheWriteIsTakenBack, gateLookedAgain } from './gate-counts.ts'
import { db, sqlite } from '../db/client.ts'
import { saysStillGoing } from '../../config/still-going.mjs'
import { recordIncompleteness } from '@shared/kinds.ts'
import { isARecordId } from '@shared/messages.ts'
import { readRefusal } from '@shared/releasing.ts'
import { records, STORED_FIELDS } from '../db/schema.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { moleOffice } from '@shared/participants.ts'
import {
  CHECK_ALSO,
  readCheckAlso,
  readRemindedBeforeTheSeal,
  remindedAsStored,
  REMINDED_BEFORE_THE_SEAL,
  type ANamedItem,
  type AtTheSeal,
  type RemindedBeforeTheSeal,
} from '@shared/before-the-seal.ts'
import { localStamp, momentOfAStoredStamp, momentOfStampInZone, nowStamp, stampInZone } from '@shared/time.ts'
import { eachAgentsIdentityReadOnce } from './agent-references.ts'
import { asTheDoorOf } from './check-field-doors.ts'
import { writeASystemLineToOne } from './groups.ts'
import {
  aRefusalStandsOn,
  theAgentOfARun,
  theAgentsOfTheseRuns,
  theChaptersARunsAgentMustRead,
  theDecisionsOfTheRun,
  theRecordsFiledInTheRun,
} from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import {
  theCommitsCarriedReadWith,
  theCommitsReadWith,
  theComparableItems,
  theFirstOwnCommitAmong,
  theItemsNoSealPasses,
  theOwnCommitsReadWith,
  theRuleAFaultOfFormBreaks,
  whatAnInspectorWouldMostLikelyRefuse,
  whatTheReminderSays,
  whatTheReportLacks,
  type ADecisionsAuthority,
  type AFormReading,
  type ALikelyRefusal,
  type TheEarlierRefusal,
  type WhyTheSealReadsIt,
  type AWorktreeHoldingTheRunsCommits,
  type TheFactsBeforeTheSeal,
  type TheOtherWorktrees,
  type TheRunsCommitsCarried,
  type WhatTheReportLacks,
} from './before-the-seal-rules.ts'
import { theRunsCommitsOf } from './before-the-seal-rules.ts'
import { theDecisionsOnTheScans, theMachineWideScansIn } from './machine-wide-scans.ts'
import { COPIED_NOT_READ, aCopiedWordsFinder, candidatesIn, isEligibleSource, type AddedFile } from './copied-test-literals.ts'
import type { GitSubmission } from '@shared/sealed-tip.ts'
import type { StoredToolUse } from '@shared/toolset.ts'
import type { PanelRecord } from '@shared/types.ts'
import { keepADesignReminder, whatADesignReminderWouldSay, type ADesignReminderKept } from './design-reminders.ts'
import type { FastifyRequest } from 'fastify'
import { howThisRequestProvedItself } from './keys.ts'
import { theHashOfTheKeyOnThisRequest, theHeldKeyRowWhoseHashIs } from '../db/the-key-on-this-request-was-made-for-a-run.ts'
import { readGit, readGitAsync } from './resources.ts'
import {
  getRecord,
  getRecordsWithIds,
  patchRecord,
  resolveLinks,
  whetherThisWriteFinishesTheRun,
  type RecordPatch,
} from './records.ts'
import { PanelError } from './panel-error.ts'
import { theMarkOfAUseLine } from './toolset.ts'
import { captureGit, runSubmitsWork, theBaseARunNames, theBranchASealReadsOff } from './sealed-tip.ts'
import {
  aFinishingPassRuns,
  aPartOfThisPass,
  asAStepOfThisFinish,
  checkAgainAtTheWrite,
  theChecksLeftForTheWrite,
  theGitFactsAtTheWrite,
  theGitFactsReadApart,
  theRunChangedWhileItsGitWasRead,
  timeTheFinishOf,
  type AGitReadingFor,
} from './a-finish-reads-git-apart.ts'
import type { ACarriedGitFacts, AGitFactsAsk } from './the-seal-read-apart-thread.ts'
import { versionOf } from './version.ts'
import { theAgentARunServes } from './the-agent-a-run-serves.ts'
import { delegationColumn } from './delegation.ts'
import { theseAgentsOnly } from '../db/these-agents-only.ts'
import { theFiledAliasesReadOnce } from './registry-aliases/runs.ts'
import { NEXT_ROUND, readTheNextRound } from '@shared/next-round.ts'
import { thePurposeOfARound } from './the-purpose-of-a-round.ts'
import { storedShortFormsOf, theShortFormStatesOf } from './zoom.ts'

export type { ACommitOfTheRun, ALikelyRefusal, TheFactsBeforeTheSeal } from './before-the-seal-rules.ts'
export { whatAnInspectorWouldMostLikelyRefuse } from './before-the-seal-rules.ts'

// ================================================================================================== the readers

/** Read-only git, through the office's one git reader (`readGit`), so this file starts no process of its own. */
function git(directory: string, ...args: string[]): string {
  return readGit(directory, args).toString('utf8')
}

/**
 * The run's own commits since its fork base, oldest first: those written since the run started (`whenTheRunStarted`). The
 * fork base is the seal's own reading (`captureGit`, or the seal-read thread's `capture`, which is the same). With them,
 * the HEAD they were read at, or null when git could not be read.
 */
function theCommitsOf(
  directory: string,
  cutFrom: string | null,
  startedMs: number | null,
  capture: typeof captureGit,
): { git: TheRunsCommitsCarried | { couldNotRead: string }; head: string | null } {
  // ANY GIT FAILURE IS SAID IN `notChecked` and the reminder is still given. The seal reads git again and refuses for itself.
  try {
    const { forkBase, commit: head } = capture(directory, cutFrom, [])
    return { git: theCommitsCarriedReadWith((...args) => git(directory, ...args), forkBase, head, startedMs), head }
  } catch (err) {
    return { git: { couldNotRead: err instanceof Error ? err.message : String(err) }, head: null }
  }
}

/**
 * THE GIT A RUN'S FACTS READ, AS ONE QUESTION: the run's working directory, the base it names, its start, the tip a sealing
 * write names when the office would look at the other worktrees too, and whether the copied test words are read. Null
 * when the run names no working directory, so there is no git to read.
 */
export function theGitFactsAskOf(run: PanelRecord, look: { tip: string | null } | undefined, copied: boolean): AGitFactsAsk | null {
  const directory = typeof run.data['workingDirectory'] === 'string' ? run.data['workingDirectory'] : null
  if (directory === null) return null
  return { directory, cutFrom: theBaseARunNames(run.data), startedMs: whenTheRunStarted(run), look: look ?? null, kind: theSubmissionProposedBy(run), copied }
}

/** Whether the facts of `ask` look at the other worktrees, once its commits were read as `read` holds them. */
function theFactsLookElsewhere(ask: AGitFactsAsk, read: Pick<ACarriedGitFacts, 'git' | 'head'>): boolean {
  return ask.look !== null && read.head !== null && !('couldNotRead' in read.git) && ask.kind !== 'records' && ask.kind !== 'files' &&
    theOtherWorktreesAreLookedAt(read.head, read.git.commits.length, ask.look.tip)
}

/**
 * THE FACTS' GIT, READ WHERE THIS IS CALLED: the commits, and the other worktrees when the facts look at them. The
 * seal-read thread asks it with its own `capture`, so one walk of a tree serves the facts and the seal.
 */
export function theGitFactsReadNow(ask: AGitFactsAsk, capture: typeof captureGit = captureGit): ACarriedGitFacts {
  const read = theCommitsOf(ask.directory, ask.cutFrom, ask.startedMs, capture)
  const elsewhere = theFactsLookElsewhere(ask, read) && !('couldNotRead' in read.git) && read.head !== null
    ? theOtherWorktreesCarrying(ask.directory, read.head, read.git.commits.length, ask.cutFrom, ask.startedMs, ask.look?.tip ?? null)
    : undefined
  return { ...read, ...(elsewhere === undefined ? {} : { elsewhere }) }
}

/** `theGitFactsReadNow`, and the copied test words at the tip when `ask` asks for them (`theCopiedTestLiteralsAt`). */
export async function theGitFactsReadHere(ask: AGitFactsAsk, capture: typeof captureGit = captureGit): Promise<ACarriedGitFacts> {
  const read = theGitFactsReadNow(ask, capture)
  if (!ask.copied || read.head === null || 'couldNotRead' in read.git) return read
  return { ...read, copiedTestLiterals: await theCopiedTestLiteralsAt(ask.directory, read.head, read.git.testLinesAtTheTip) }
}

/**
 * WHETHER A READING OF ONE QUESTION ANSWERS ANOTHER, and the reading as the other would have read it. The commits are the
 * same when the directory and the base are, and the start is, or both starts put the run's first own commit at the same
 * place (`theFirstOwnCommitAmong`): a run filed already finished starts when it is filed, and each pass of that write
 * files it again, a second later when a read took the write past a second. A reading with the copied words answers a
 * question without them, which leaves them out. The other worktrees are part of the answer only when the question would
 * look at them, and then only a reading that looked for the same tip from the same start answers it, because their
 * commits are read from the start too and their times are not carried.
 */
export const aGitReadingFor: AGitReadingFor = (have, read, want) => {
  if (have.directory !== want.directory || have.cutFrom !== want.cutFrom) return null
  if (have.startedMs !== want.startedMs && !theSameOwnCommitsFrom(have.startedMs, want.startedMs, read)) return null
  if (want.copied && !have.copied) return null
  const { elsewhere, copiedTestLiterals, ...commits } = read
  let looked: TheOtherWorktrees | undefined
  if (theFactsLookElsewhere(want, read)) {
    if (!theFactsLookElsewhere(have, read) || have.look?.tip !== want.look?.tip || have.startedMs !== want.startedMs) return null
    looked = elsewhere
  }
  return { ...commits, ...(looked === undefined ? {} : { elsewhere: looked }), ...(want.copied && copiedTestLiterals !== undefined ? { copiedTestLiterals } : {}) }
}

/** Whether commits read from the start `had` are the ones read from `want`: both starts, and the same first own commit. */
function theSameOwnCommitsFrom(had: number | null, want: number | null, read: ACarriedGitFacts): boolean {
  if (had === null || want === null || 'couldNotRead' in read.git) return false
  return theFirstOwnCommitAmong(read.git.authorTimes, had) === theFirstOwnCommitAmong(read.git.authorTimes, want)
}

/**
 * READ SOURCE LITERALS AT THE CAPTURED TIP, only after the run's added tests produced a candidate. Git, rather than the
 * working tree, is the authority at the seal. The bounded batch is decoded one file at a time so large word files do not
 * require a second copy of the entire source snapshot. The reading waits on git and lets the thread go after each file,
 * so the office answers other requests while it reads.
 */
export async function theCopiedTestLiteralsAt(directory: string, tip: string, lines: readonly AddedFile[] | undefined): Promise<NonNullable<TheFactsBeforeTheSeal['copiedTestLiterals']>> {
  if (lines === undefined) return { couldNotRead: COPIED_NOT_READ }
  try {
    const candidates = candidatesIn(lines)
    if (candidates.length === 0) return { findings: [] }
    const paths = (await readGitAsync(directory, ['ls-tree', '-r', '-z', tip, '--', 'src', 'tools', 'plugins'])).toString('utf8').split('\0').flatMap((entry) => {
      const tab = entry.indexOf('\t')
      const mode = entry.slice(0, 6)
      const path = tab < 0 ? '' : entry.slice(tab + 1)
      return (mode === '100644' || mode === '100755') && isEligibleSource(path) ? [path] : []
    })
    if (paths.length === 0) return { findings: [] }
    const buffer = await readGitAsync(directory, ['cat-file', '--batch', '-Z'], {
      input: paths.map((path) => `${tip}:${path}`).join('\0') + '\0',
      maxBuffer: 128 * 1024 * 1024,
    })
    const finder = aCopiedWordsFinder(candidates)
    let at = 0
    const decoder = new TextDecoder('utf-8', { fatal: true })
    for (const path of paths) {
      const end = buffer.indexOf(0, at)
      if (end < 0) throw new Error(COPIED_NOT_READ)
      const header = buffer.toString('utf8', at, end)
      const match = /^[0-9a-f]+ blob (\d+)$/u.exec(header)
      if (match === null) throw new Error(COPIED_NOT_READ)
      const size = Number(match[1])
      at = end + 1
      if (!Number.isSafeInteger(size) || size < 0 || at + size >= buffer.length || buffer[at + size] !== 0) throw new Error(COPIED_NOT_READ)
      finder.read({ path, text: decoder.decode(buffer.subarray(at, at + size)) })
      at += size + 1
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    return { findings: finder.findings() }
  } catch {
    return { couldNotRead: COPIED_NOT_READ }
  }
}

/**
 * THE OTHER WORKTREES THAT HOLD THE RUN'S OWN COMMITS (item 2x). The seal reads the record's workingDirectory and nothing
 * else, so a run that wrote its commits in another worktree would seal without them, and the reminder would judge none of
 * them. The office looks in two cases, and only in those:
 * - the write names a tip that is not the HEAD of the named worktree: the other worktrees whose HEAD is that tip;
 * - the write names no tip, or that HEAD, and the named worktree holds none of the run's own commits: every other
 *   worktree whose HEAD holds a commit written since the run started.
 * Each worktree's commits are read as the seal would read them there: its fork base off the branch the seal reads
 * (`theBranchASealReadsOff`), and its own commits in the order written (`theOwnCommitsReadWith`). Undefined when the
 * office did not look. What it could not read is answered as `couldNotLook`, which the reminder names as not checked.
 */
function theOtherWorktreesCarrying(directory: string, head: string, own: number, cutFrom: string | null, startedMs: number | null, tip: string | null): TheOtherWorktrees | undefined {
  if (!theOtherWorktreesAreLookedAt(head, own, tip)) return undefined
  const byTheTip = tip !== null && tip !== head
  if (!byTheTip && startedMs === null) {
    return { couldNotLook: 'the run gives no start that names one moment, so the office cannot tell which commits in another worktree are its own.' }
  }
  try {
    const here = realpathSync(git(directory, 'rev-parse', '--show-toplevel').trim())
    const branchOf = theBranchASealReadsOff(directory, cutFrom)
    const found = theWorktreesOf(directory)
      .filter((one) => one.path !== here && one.head !== head && (!byTheTip || one.head === tip))
      .flatMap((one): AWorktreeHoldingTheRunsCommits[] => {
        const forkBase = git(directory, 'merge-base', one.head, branchOf(one.head)).trim()
        const commits = theOwnCommitsReadWith((...args) => git(directory, ...args), forkBase, one.head, startedMs)
        return commits.length === 0 ? [] : [{ ...one, commits }]
      })
    return { named: directory, head, tip: byTheTip ? tip : null, found }
  } catch (err) {
    return { couldNotLook: err instanceof Error ? err.message : String(err) }
  }
}

/** The two cases in which the office looks at the other worktrees (`theOtherWorktreesCarrying`). */
function theOtherWorktreesAreLookedAt(head: string, own: number, tip: string | null): boolean {
  return (tip !== null && tip !== head) || own <= 0
}

/**
 * EVERY WORKTREE OF THE REPOSITORY whose folder is still there, with its HEAD and its branch (null when detached). Read
 * from the common git folder's own files, because the office's git reader runs no `git worktree`, which can also add and
 * remove one: the main worktree is the folder that holds `.git`, and each linked one is named by
 * `worktrees/<id>/gitdir`. Every HEAD is resolved in one `git rev-parse`.
 */
function theWorktreesOf(directory: string): { path: string; branch: string | null; head: string }[] {
  const common = git(directory, 'rev-parse', '--path-format=absolute', '--git-common-dir').trim()
  const listed: { path: string; ref: string; headFile: string }[] = []
  if (basename(common) === '.git') listed.push({ path: dirname(common), ref: 'main-worktree/HEAD', headFile: join(common, 'HEAD') })
  const linked = join(common, 'worktrees')
  for (const id of existsSync(linked) ? readdirSync(linked) : []) {
    const gitdir = join(linked, id, 'gitdir')
    if (existsSync(gitdir)) listed.push({ path: dirname(readFileSync(gitdir, 'utf8').trim()), ref: `worktrees/${id}/HEAD`, headFile: join(linked, id, 'HEAD') })
  }
  const there = listed.filter((one) => existsSync(one.path))
  if (there.length === 0) return []
  const heads = git(directory, 'rev-parse', ...there.map((one) => one.ref)).split('\n').filter((one) => one !== '')
  return there.map((one, at) => {
    const ref = /^ref: refs\/heads\/(.+)$/u.exec(readFileSync(one.headFile, 'utf8').trim())
    return { path: realpathSync(one.path), branch: ref?.[1] ?? null, head: heads[at]! }
  })
}

/** The run's reports: those linked `about` it, as the check reads them first (`theReportsOfARun` in ./inspection.ts). */
function theReportsOf(run: PanelRecord): PanelRecord[] {
  const ids = resolveLinks(run.id)
    .filter((link) => link.type === 'about' && link.isBacklink && !link.inferred && link.other.kind === 'report')
    .map((link) => link.other.id)
  const held = getRecordsWithIds(ids)
  return ids.map((id) => held.get(id) ?? null)
    .filter((one): one is PanelRecord => one !== null && one.deletedAt === null)
}

/** The live reports with any of these titles, in their stored order. */
function theOtherReportsCalled(reports: readonly PanelRecord[]): Record<string, string[]> {
  if (reports.length === 0) return {}
  const pairs = reports.map((one) => ({ workspace: one.workspaceId, title: one.title }))
  const rows = db
    .select({ id: records.id, title: records.title, workspaceId: records.workspaceId })
    .from(records)
    .where(and(eq(records.kind, 'report'), isNull(records.deletedAt), sql`(${records.workspaceId}, ${records.title}) IN (SELECT json_extract(value, '$.workspace'), json_extract(value, '$.title') FROM json_each(${JSON.stringify(pairs)}))`))
    .all()
  return Object.fromEntries(reports.map((report) => [report.id, rows.filter((one) => one.workspaceId === report.workspaceId && one.title === report.title && one.id !== report.id).map((one) => one.id)]))
}

/** Read the run's uses once, in their written order. */
function theNamedTestsUsedBy(run: PanelRecord): StoredToolUse[] {
  const rows = sqlite.prepare('SELECT seq, at, tool, said, actor_type AS actorType, actor_id AS actorId, moved_at AS movedAt, proof FROM tool_uses WHERE run_id = ? AND seq < ? ORDER BY seq').all(run.id, Number.MAX_SAFE_INTEGER) as { seq: number; at: string; tool: string; said: string; actorType: string | null; actorId: string | null; movedAt: string | null; proof: string | null }[]
  return rows.flatMap((one): StoredToolUse[] => {
    const proof = one.proof
    if (proof !== null && proof !== 'matches' && proof !== 'none' && proof !== 'does not match') throw new PanelError(`A use row holds the proof answer ${JSON.stringify(proof)}, which the use door never writes.`, 500)
    if (one.tool !== 'named-tests') return []
    return [{ seq: one.seq, at: one.at, tool: one.tool, said: one.said, by: one.actorType === null || one.actorId === null ? null : { type: one.actorType, id: one.actorId }, movedAt: one.movedAt, proof, mark: theMarkOfAUseLine(proof) }]
  })
}

/**
 * The named-tests lines whose proof was missing or did not match (item 2i). A line written before the use door checked
 * has proof null and is left out: nobody knows whether the tool sent it, and that is not a sign it did not.
 */
function theOnesNotFromTheTool(uses: readonly StoredToolUse[]): NonNullable<TheFactsBeforeTheSeal['testRunsNotFromTheTool']> {
  return uses.flatMap((one) => (one.proof !== null && one.proof !== 'matches' && one.mark !== null ? [{ seq: one.seq, said: one.said, mark: one.mark }] : []))
}

/**
 * The commits a seal froze, read in the seal's repository (the common git folder, which outlives the worktree). The run's
 * own are those written since it started, as `theCommitsOf` reads them.
 */
function theSealedCommitsOf(sealed: GitSubmission, startedMs: number | null): TheFactsBeforeTheSeal['git'] {
  try {
    return theCommitsReadWith((...args) => git(sealed.repository, ...args), sealed.forkBase, sealed.commit, startedMs)
  } catch (err) {
    return { couldNotRead: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * WHEN THE RUN STARTED, from which its own commits are read: `startedAt`, else when its record was filed. A start is the
 * office's local time in words, with no offset, so it is read with the instant stored beside it (`startedTime`). Words
 * with none are read as their one moment, and as none in the hour the clocks go back, which they name twice, or the hour
 * they skip. Then every commit since the fork base is judged as the run's, and the reminder says so.
 */
function whenTheRunStarted(run: PanelRecord): number | null {
  const startedAt = run.data['startedAt']
  return typeof startedAt === 'string' ? momentOfAStoredStamp(startedAt, run.data['startedTime']) : momentOfAStoredStamp(run.createdAt, null)
}

/**
 * THE DECISIONS THE RUN RECORDED, up to now, as the check finds them (`theDecisionsOfTheRun` in ./inspection.ts), read
 * once for three facts: each whose record holds no label (chapter 10 rule 3), and what each one's authority asks of it.
 */
function theDecisionsOf(run: PanelRecord): {
  ids: string[]
  withoutShortForms: NonNullable<TheFactsBeforeTheSeal['decisionsWithoutShortForms']>
  authorities: ADecisionsAuthority[]
} {
  const { decisions, decisionsComplete } = theDecisionsOfTheRun(run, run.workspaceId, theAgentOfARun(run), nowStamp())
  const references = decisions.map((one) => typeof one.authority_reference === 'string' ? one.authority_reference.trim() : '').filter(isARecordId)
  const held = getRecordsWithIds([...decisions.map((one) => one.id), ...references])
  const ids = decisions.map((one) => one.id).filter((id) => {
    const record = held.get(id)
    return record !== undefined && storedShortFormsOf(record).label === undefined
  })
  const authorities = decisions.map((one): ADecisionsAuthority => {
    const reference = typeof one.authority_reference === 'string' ? one.authority_reference.trim() : ''
    // A REFERENCE IS JUDGED ONLY WHEN IT IS SHAPED AS A RECORD ID, and then as the decision door judges one: live when a
    // record answers to it and is not deleted (`assertMayDecide` in ./records/the-persons-own-acts.ts).
    const cited = isARecordId(reference) ? held.get(reference) ?? null : undefined
    return {
      id: one.id,
      authority: typeof one.authority === 'string' ? one.authority : null,
      revisitWhen: typeof one.revisit_when === 'string' && one.revisit_when.trim() !== '',
      reference: cited === undefined ? null : { id: reference, live: cited !== null && cited.deletedAt === null },
    }
  })
  return { ids: decisions.map((one) => one.id), withoutShortForms: { ids, complete: decisionsComplete }, authorities }
}

/**
 * WHERE THE SHORT FORMS AND THE FIELDS STAND OF EACH RECORD THE SEAL ANSWERS FOR (the decision on faults of
 * form): the reports linked about the run, the records its submission carries, and the decisions it recorded, each read
 * once with every reason it is there. `readShortForms` in ./zoom.ts says which short forms are missing or out of date, and
 * `recordIncompleteness` in src/shared/kinds/incompleteness.ts which fields a record still needs. A record that cannot be read is said.
 */
function theFormsOf(run: PanelRecord, reports: readonly PanelRecord[], decisions: readonly string[]): AFormReading[] {
  const why = new Map<string, WhyTheSealReadsIt[]>()
  const add = (id: string, reason: WhyTheSealReadsIt): void => {
    const list = why.get(id) ?? []
    if (!list.includes(reason)) list.push(reason)
    why.set(id, list)
  }
  for (const report of reports) add(report.id, 'linked report')
  for (const id of theRecordsTheSubmissionCarries(run)) add(id, 'carried')
  for (const id of decisions) add(id, 'decision of the run')
  const held = getRecordsWithIds(why.keys())
  const states = theShortFormStatesOf([...held.values()].filter((record) => record.deletedAt === null))
  return [...why].map(([id, reasons]): AFormReading => {
    const record = held.get(id) ?? null
    const about = record?.kind === 'report' ? 'report' : record?.kind === 'decision' ? 'decision' : reasons.includes('decision of the run') ? 'decision' : 'record'
    if (record === null || record.deletedAt !== null) return { id, about, why: reasons, couldNotRead: record === null ? 'no record has this id' : 'the record is deleted' }
    try {
      const levels = states.get(id) ?? []
      if ('error' in levels) throw new Error(levels.error)
      const label = levels.find((one) => one.rung === 'label')
      const parts = levels.filter((one) => (BY_PART_RUNGS as readonly string[]).includes(one.rung))
      const written = [label, ...parts].filter((one) => one !== undefined)
      return {
        id,
        about,
        why: reasons,
        missing: [...(label?.state === 'none' ? ['label' as const] : []), ...(parts.some((one) => one.state === 'none') ? ['parts' as const] : [])],
        outOfDate: written.some((one) => one.state === 'out_of_date'),
        cannotCheck: written.some((one) => one.state === 'cannot_check'),
        incomplete: recordIncompleteness(record.kind, record.data, record.summary).map((one) => ({ path: one.path, message: one.message })),
      }
    } catch (err) {
      return { id, about, why: reasons, couldNotRead: err instanceof Error ? err.message : String(err) }
    }
  })
}

/** The rungs `readShortForms` reads from one stored structure of parts. */
const BY_PART_RUNGS = ['outline', 'sketch', 'digest'] as const

/** The ids a records or mixed submission the write would store carries (`data.submission.records`), as written. */
function theRecordsTheSubmissionCarries(run: PanelRecord): string[] {
  const submission = run.data['submission']
  if (typeof submission !== 'object' || submission === null || Array.isArray(submission)) return []
  const carried = (submission as Record<string, unknown>)['records']
  return Array.isArray(carried) ? carried.filter((id): id is string => typeof id === 'string') : []
}

/** The run's doing line, or null when it has none. */
function theDoingLineOf(run: PanelRecord): string | null {
  const doing = run.data['doing']
  return typeof doing === 'string' ? doing : null
}

/**
 * THE LATEST EARLIER RUN OF THE RUN'S AGENT THAT HAS ENDED, WHEN A REFUSAL STILL STANDS ON IT (the rule of every line,
 * "Link the round's run to the record that asks for its change", the coordinator, 31 October). Earlier is earlier in
 * the change log: a create row written before this run's. Ended is a state `saysStillGoing` does not name. Only that
 * one run is read; an older run's refusal is not judged. The runs read are those `theseAgentsOnly` keeps for the agent,
 * and `theAgentsOfTheseRuns` decides which of them are its. This replaced a join that read every create row of every
 * run of the project: about 114 thousand rows on the live office, and 12 to 20 seconds, before every seal.
 */
function theEarlierRefusalOf(run: PanelRecord): TheFactsBeforeTheSeal['earlierRefusal'] {
  const agent = theAgentOfARun(run)
  if (agent === null) return { couldNotRead: "the office could not tell which agent this run serves, so it could not find the agent's earlier runs." }
  const own = sqlite.prepare("SELECT append_order AS at FROM changes WHERE record_id = ? AND op = 'create'").get(run.id) as { at: number } | undefined
  const couldBeTheAgentsRuns = theseAgentsOnly([agent.id], [agent.handle], theFiledAliasesReadOnce(sqlite)).sessions(run.workspaceId)
  // A CREATE'S ROWS ARE WRITTEN IN ONE TRANSACTION, so any one of them gives the run its place in the log against
  // another run's. The position is read once for each run the read keeps, in the select, not again in the filter.
  // The outer column is named with its table because drizzle writes a select's own columns without one, and the
  // subquery's `changes` table has an `id` that would otherwise be read in its place.
  const createPosition = sql<number | null>`(SELECT c.append_order FROM changes AS c WHERE c.record_id = ${sql.raw('"records"."id"')} AND c.op = 'create' LIMIT 1)`
  const rows = db
    .select({
      id: records.id,
      workspaceId: records.workspaceId,
      at: createPosition,
      servingAgentId: sql<string | null>`${records.data} -> '$.servingAgentId'`,
      servingAgent: sql<string | null>`${records.data} -> '$.servingAgent'`,
      ranAs: sql<string | null>`${records.data} -> '$.ranAs'`,
      state: sql<string | null>`${records.data} -> '$.state'`,
    })
    .from(records)
    .where(
      and(
        eq(records.kind, 'session'),
        eq(records.workspaceId, run.workspaceId),
        isNull(records.deletedAt),
        sql`${records.id} <> ${run.id}`,
        couldBeTheAgentsRuns,
      ),
    )
    .all()
  const runs = rows.flatMap((row) => {
    if (row.at === null || (own !== undefined && row.at >= own.at)) return []
    const data: Record<string, unknown> = {}
    for (const field of ['servingAgentId', 'servingAgent', 'ranAs', 'state'] as const) if (row[field] !== null) data[field] = JSON.parse(row[field]!)
    return [{ id: row.id, workspaceId: row.workspaceId, at: row.at, data }]
  })
  // EACH ID IS READ ONCE: the earlier runs all name the one agent, and asked one by one they cost a statement each.
  const named = theAgentsOfTheseRuns(runs, undefined, eachAgentsIdentityReadOnce(sqlite))
  const latest = runs
    .filter((one) => named.get(one.id) === agent.id && !saysStillGoing(one.data['state']))
    .sort((a, b) => b.at - a.at)[0]
  const earlier = latest === undefined ? null : getRecord(latest.id)
  if (earlier === null || !aRefusalStandsOn(earlier)) return null
  const thisRunIsAbout = resolveLinks(run.id).filter((link) => link.type === 'about' && !link.isBacklink && !link.inferred).map((link) => link.other.id)
  const refusal: TheEarlierRefusal = { run: earlier.id, check: readRefusal(earlier.data['refused'])?.check ?? null, thisRunIsAbout }
  return refusal
}

/**
 * EACH REPORT FILED IN THE RUN, and whether it is linked `about` a run. Filed in the run is what the check reads: a
 * create row of the change log that carries the run (`theRecordsFiledInTheRun` in ./inspection.ts).
 */
function theReportsFiledIn(run: PanelRecord): NonNullable<TheFactsBeforeTheSeal['reportsFiled']> {
  const ids = [...theRecordsFiledInTheRun(run.id)]
  const held = getRecordsWithIds(ids)
  const about = new Set((sqlite.prepare("SELECT l.from_id AS id FROM links l JOIN records r ON r.id = l.to_id WHERE l.from_id IN (SELECT value FROM json_each(?)) AND l.type = 'about' AND l.inferred = 0 AND l.from_id <> l.to_id AND r.kind = 'session'").all(JSON.stringify(ids)) as { id: string }[]).map((row) => row.id))
  return ids.map((id) => held.get(id) ?? null)
    .filter((one): one is PanelRecord => one !== null && one.deletedAt === null && one.kind === 'report')
    .map((report) => ({
      id: report.id,
      aboutARun: about.has(report.id),
    }))
}

/**
 * THE PACKAGES THE RUN TOOK INSIDE AND HAS NOT HANDED BACK: the inside column's rows whose latest take is by the run's
 * own agent and which carry no hand-back, each with its point count and whether its latest restatement was answered
 * `aligned`. When the run serves no agent the office can name, or the column could not read a package, the fact says so
 * and names no package; it is never an empty list standing for a reading that did not happen. A package the run's own
 * next round names, while that round is wanted or starting, is left out: the next round takes it on.
 * The column is asked for the packages taken and not handed back alone, so the ones nobody holds cost the seal nothing.
 */
function thePackagesTheRunHolds(run: PanelRecord): NonNullable<TheFactsBeforeTheSeal['packagesHeld']> {
  const agent = theAgentARunServes(run.data)?.id ?? null
  if (agent === null) {
    return { couldNotRead: 'the office could not tell which agent this run serves, so it could not find the inside packages the run has taken.' }
  }
  const reading = delegationColumn(run.workspaceId, true, true)
  if (reading.couldNotRead.length > 0) {
    const named = reading.couldNotRead.map((one) => `${one.recordId} ("${one.title}"): ${one.because}`).join(' ')
    return { couldNotRead: `a package on a task could not be read: ${named}` }
  }
  const next = readTheNextRound(run.data[NEXT_ROUND])
  const takenOn = new Set(next !== null && (next.state === 'wanted' || next.state === 'starting') ? next.delegations ?? [] : [])
  return reading.rows.flatMap((row) => {
    const inside = row.inside
    if (inside === null || inside.handedBack) return []
    if (inside.takenBy?.kind !== 'agent' || inside.takenBy.id !== agent) return []
    if (takenOn.has(row.recordId)) return []
    return [{ id: row.recordId, title: row.title, points: row.pointCount, aligned: inside.alignment === 'aligned' }]
  })
}

/**
 * Read every fact the reminder judges, for one run, except the code's copied test words, which
 * `theFactsBeforeTheSealWithTheCopiedWordsOf` adds. The commits are `git` when it is given, and otherwise those of the
 * run's working directory now. The test runs are the run's named-tests rows in tool_uses, read by `theNamedTestsUsedBy`.
 * With `look`, the tip a sealing write names or null, the office also looks at the repository's other worktrees
 * (`theOtherWorktreesCarrying`) when it read the working directory itself and the run seals a branch.
 */
export function theFactsBeforeTheSealOf(run: PanelRecord, git?: TheFactsBeforeTheSeal['git'], look?: { tip: string | null }): TheFactsBeforeTheSeal {
  const ask = git === undefined ? theGitFactsAskOf(run, look, false) : null
  return theFactsWith(run, git, ask === null ? null : theGitFactsReadNow(ask))
}

/**
 * The facts `theFactsBeforeTheSealOf` reads, and the copied test words: with a test candidate, source code under src/
 * and tools/ is read from the tip it captured, by `theCopiedTestLiteralsAt`, which lets the thread go while it reads.
 */
export async function theFactsBeforeTheSealWithTheCopiedWordsOf(run: PanelRecord, look?: { tip: string | null }): Promise<TheFactsBeforeTheSeal> {
  const ask = theGitFactsAskOf(run, look, true)
  return theFactsWith(run, undefined, ask === null ? null : await theGitFactsReadHere(ask))
}

/**
 * THE FACTS WITH THEIR GIT READ ON THE SEAL-READ THREAD, for the steps of a finishing write before and after it: the
 * reminder, the block, and what the seal found (`theGitFactsReadApart` in ./a-finish-reads-git-apart.ts). The same
 * facts `theFactsBeforeTheSealOf` reads, or with `copied` those `theFactsBeforeTheSealWithTheCopiedWordsOf` reads.
 */
async function theFactsReadApart(req: FastifyRequest, run: PanelRecord, look: { tip: string | null } | undefined, copied: boolean, name: string): Promise<TheFactsBeforeTheSeal> {
  const ask = theGitFactsAskOf(run, look, copied)
  return theFactsWith(run, undefined, ask === null ? null : await theGitFactsReadApart(req, ask, name, aGitReadingFor))
}

/**
 * THE FACTS AT THE WRITE, inside a finishing write's pass: the git the thread read for the pass, and everything else read
 * here. Null outside a pass, where the caller reads them as it always did.
 */
function theFactsAtTheWrite(run: PanelRecord, look: { tip: string | null } | undefined, copied: boolean): TheFactsBeforeTheSeal | null {
  if (!aFinishingPassRuns()) return null
  const ask = theGitFactsAskOf(run, look, copied)
  return theFactsWith(run, undefined, ask === null ? null : theGitFactsAtTheWrite(ask, aGitReadingFor))
}

/**
 * Every fact the reminder judges. The commits are `git` when it is given; otherwise those `read` holds, or that the run
 * names no working directory when `read` is null.
 */
function theFactsWith(run: PanelRecord, git: TheFactsBeforeTheSeal['git'] | undefined, read: ACarriedGitFacts | null): TheFactsBeforeTheSeal {
  // A PART OF A FINISHING WRITE'S PASS, so the finish's line says what reading the facts cost in it.
  return aPartOfThisPass('the facts the reminder judges', () => theFactsReadWith(run, git, read))
}

function theFactsReadWith(run: PanelRecord, git: TheFactsBeforeTheSeal['git'] | undefined, read: ACarriedGitFacts | null): TheFactsBeforeTheSeal {
  const data = run.data
  const reports = theReportsOf(run)
  const namedTests = theNamedTestsUsedBy(run)
  const elsewhere = read?.elsewhere
  const copiedTestLiterals = read?.copiedTestLiterals
  const decisions = theDecisionsOf(run)
  return {
    runId: run.id,
    runTitle: run.title,
    testRuns: namedTests.map((one) => one.said),
    testRunsNotFromTheTool: theOnesNotFromTheTool(namedTests),
    git: git ?? (read === null ? { couldNotRead: 'the run names no working directory' } : 'couldNotRead' in read.git ? read.git : theRunsCommitsOf(read.git)),
    reports: reports.map((one) => ({ id: one.id, title: one.title, data: one.data })),
    sameTitleElsewhere: theOtherReportsCalled(reports),
    mustRead: theChaptersTheReminderWants(theChaptersARunsAgentMustRead(run)),
    checkAlso: readCheckAlso(data[CHECK_ALSO])?.items ?? [],
    decisionsWithoutShortForms: decisions.withoutShortForms,
    forms: theFormsOf(run, reports, decisions.ids),
    decisionAuthorities: decisions.authorities,
    doing: theDoingLineOf(run),
    earlierRefusal: aPartOfThisPass('the earlier refusal of the agent', () => theEarlierRefusalOf(run)),
    reportsFiled: theReportsFiledIn(run),
    packagesHeld: thePackagesTheRunHolds(run),
    ...(elsewhere === undefined ? {} : { elsewhere }),
    ...(copiedTestLiterals === undefined ? {} : { copiedTestLiterals }),
  }
}

/**
 * WHAT THE RUN'S REPORT LACKS, as the merge queue reads it before any check starts. That is part 1 of a
 * decision. The facts are the reminder's, with the commits the seal froze, so
 * the gate and the reminder judge the same files.
 */
export function whatTheReportOfARunLacks(run: PanelRecord, sealed: GitSubmission | null): WhatTheReportLacks {
  // A SEAL WITH NO GIT WORK froze no commits, so the test files the run added cannot be read from it.
  const git = sealed === null ? { couldNotRead: 'the seal froze no git commits' } : theSealedCommitsOf(sealed, whenTheRunStarted(run))
  return whatTheReportLacks({ ...theFactsBeforeTheSealOf(run, git), doing: theDoingLineOf(run) })
}

/**
 * THE CHAPTERS THE REMINDER ASKS A REPORT TO LIST: the chapters line the check reads, and the agent's card's line beside it.
 * Run IEJEGL65Pw4s (13q round 48) was a supervisor whose brief named seven chapters. The reminder would have asked for
 * those seven, and the check refused it for not listing the chapters the supervisor card names. A reminder that asks for
 * more than the check might refuse costs one line; one that asks for less let that run seal unwarned.
 */
export function theChaptersTheReminderWants(read: { chapters: { mustRead: { chapter: number }[] }; onItsCard: { chapter: number }[] }): number[] {
  return [...new Set([...read.chapters.mustRead, ...read.onItsCard].map((one) => one.chapter))].sort((a, b) => a - b)
}

// The position belongs to this sealing request, even if the saved setting changes before the next request.
const requestsWithTheGateOff = new WeakSet<FastifyRequest>()

// ================================================================================================== the reminder

/** What the record door answers in place of the seal, the first time. */
export interface TheReminderBeforeTheSeal {
  sealed: false
  says: string
  purpose: string
  items: ALikelyRefusal[]
  /**
   * EACH ITEM THAT REFUSES A LATER WRITE at this reminder's position, by key, with the rule it breaks: the migration
   * items of a branch seal, and at block every certain item the reminder names. Empty when none does.
   */
  refuses: { key: string; rule: string }[]
  notChecked: string[]
  again: string
  /** The office's quiet line to the run's agent that keeps this reminder for the next write's reading. */
  line: string
  /**
   * Whether the office kept what this reminder did on the run (`remindedBeforeTheSeal`). When it could not, `notKept` says
   * why; the reminder and the seal go ahead as before.
   */
  keptOnTheRun: boolean
  notKept?: string
  /** What a run marked as method work or GO still lacks of its reviewed design, from ./design-reminders.ts. */
  design?: ADesignReminderKept
}

/**
 * WRITE `remindedBeforeTheSeal` ON THE RUN, as the office, or say why it could not. Null when it was written. A failure is
 * answered and never thrown. Without kept items block has no reading to judge, so failing to keep them cannot refuse a seal.
 */
function keepOnTheRun(runId: string, value: RemindedBeforeTheSeal): string | null {
  try {
    asTheDoorOf(REMINDED_BEFORE_THE_SEAL, () => patchRecord(runId, { dataPatch: { [REMINDED_BEFORE_THE_SEAL]: remindedAsStored(value) } }, THE_OFFICE))
    return null
  } catch (err) {
    return `The office could not write remindedBeforeTheSeal on run ${runId}: ${err instanceof Error ? err.message : String(err)}`
  }
}

/**
 * The time in words an hour before a stored stamp, or null when the stamp is not one. A line written after the run can
 * read up to an hour earlier in words than the run: when the clocks go back, 01:10 winter time follows 01:50 summer time.
 */
function anHourBefore(stamp: string): string | null {
  const words = momentOfStampInZone(stamp, 'UTC')
  return words === null ? null : stampInZone(words - 60 * 60_000, 'UTC')
}

/** The office's line that reminded this run for its current seal, or null. Found by the line itself, as the stale check finds its own. */
function theLineThatReminded(run: PanelRecord, afterSeal: string | null): string | null {
  const from = anHourBefore(run.createdAt)
  const found = db
    .select({ id: records.id })
    .from(records)
    .where(
      and(
        // ONLY MESSAGES CHANGED SINCE THE RUN WAS FILED, through `records_updated_idx`; the `+` keeps SQLite off the other
        // indexes. The bound is an hour before the run's time in words (`anHourBefore`); a line is still its run's own by
        // the run it names below.
        from === null ? undefined : sql`${records.updatedAt} >= ${from}`,
        sql`+${records.kind} = 'message'`,
        sql`+${STORED_FIELDS.messageSentById(records.data)} = ${moleOffice().id}`,
        isNull(records.deletedAt),
        sql`json_extract(${records.data}, '$.extra.beforeTheSeal.run') = ${run.id}`,
        afterSeal === null
          ? sql`json_extract(${records.data}, '$.extra.beforeTheSeal.afterSeal') IS NULL`
          : sql`json_extract(${records.data}, '$.extra.beforeTheSeal.afterSeal') = ${afterSeal}`,
      ),
    )
    .limit(1)
    .all()
  return found[0]?.id ?? null
}

/** Whether the block position judges an item: a certain item, and never a starter's check-also item. */
function anItemBlockJudges(item: ANamedItem): boolean {
  return item.mechanical === true && item.about !== 'check also'
}

/**
 * THE REMINDER, IF ONE IS DUE: the run has not been reminded since its last seal (or ever). Writes the office's quiet
 * line that keeps it and answers what the door replies. Null when the run was already reminded for this seal, or when
 * it names no agent to keep the line for, which `notReminded` then says. With `write`, the data the sealing write would
 * store and the tip it names, the items are judged on the run as that write would leave it, as the hard gate judges it.
 * With `asked`, the request and the run's version when it was read, the git is read on the seal-read thread, and the run
 * is read again after it (`theRunIsAsItWasRead`).
 */
export async function theReminderBeforeTheSealOf(
  run: PanelRecord,
  position = 'remind',
  write?: { data: Record<string, unknown>; tip: string | null },
  asked?: { req: FastifyRequest; version: string },
): Promise<TheReminderBeforeTheSeal | { notReminded: string } | null> {
  const afterSeal = typeof run.data['sealedTip'] === 'string' ? run.data['sealedTip'] : null
  if (theLineThatReminded(run, afterSeal) !== null) return null
  // THE AGENT THE RUN SERVES, read as every reader of a run reads it: `servingAgentId`, else `servingAgent`.
  const agentId = theAgentARunServes(run.data)?.id ?? null
  if (agentId === null) {
    return { notReminded: `Run ${run.id} names no agent the office knows, so it had nowhere to keep a reminder before the seal, and sealed without one.` }
  }
  const judged = write === undefined ? run : { ...run, data: write.data }
  const look = write === undefined ? undefined : { tip: write.tip }
  let facts: TheFactsBeforeTheSeal
  if (asked === undefined) facts = await theFactsBeforeTheSealWithTheCopiedWordsOf(judged, look)
  else {
    facts = await theFactsReadApart(asked.req, judged, look, true, 'the reminder before the seal')
    theRunIsAsItWasRead(asked.req, run, asked.version, { reminded: false })
  }
  const { items, notChecked } = whatAnInspectorWouldMostLikelyRefuse(facts)
  // WHAT WILL REFUSE A LATER WRITE. A fault of form is listed, never refused. At remind only the migration items of a
  // branch seal will refuse. At block every certain item the reminder names will refuse, and so will the migration items.
  const branch = theSealSealsABranch(judged)
  const migrations = theItemsNoSealPasses(items, { branch })
  const refusing = items.filter((one) => migrations.includes(one) || (position === 'block' && anItemBlockJudges(one)))
  const refuses = refusing.map((one) => ({ key: one.key, rule: whyItRefuses(one) }))
  const says = whatTheReminderSays(items, refusing.length)
  const purpose = thePurposeOfARound(run)
  const design = whatADesignReminderWouldSay(run)
  if (items.length > 0) gateMet('before-the-seal', position)
  const line = writeASystemLineToOne(
    { kind: 'agent', id: agentId },
    run.workspaceId,
    SYSTEM_LINES.beforeTheSeal(
      `Before the seal of run ${run.id}: ${says} ` +
        // THE CERTAIN FIRST, each marked, so the agent reads first what a program decided.
        [...items.filter((one) => one.mechanical === true), ...items.filter((one) => one.mechanical !== true)]
          .map((one) => `[${one.about}, ${one.mechanical === true ? 'certain' : 'likely'}${refusing.includes(one) ? ', refuses the seal' : ''}] ${refusing.includes(one) ? theSaysWithItsRule(one) : one.says}`)
          .join(' ') +
        (notChecked.length === 0 ? '' : ` Not checked: ${notChecked.join(' ')}`) + ` ${purpose}` +
        (design === null ? '' : ` ${design.says}`),
    ),
    THE_OFFICE,
    { run: run.id },
    { beforeTheSeal: { run: run.id, afterSeal, items: items.length } },
  )
  const notKept = keepOnTheRun(run.id, {
    reminded: true,
    at: localStamp(new Date()),
    afterSeal,
    line: line.id,
    chapters: facts.mustRead,
    items,
    atTheSeal: null,
  })
  return {
    sealed: false,
    says,
    purpose,
    items,
    refuses,
    notChecked,
    again: (position === 'block'
      ? 'Send the same write again. At block, a certain item the reminder named that the same check still finds refuses the seal; a likely item stays a reminder.'
      : 'Send the same write again.') + ` ${whatRefusesALaterWrite(refusing)}`,
    line: line.id,
    keptOnTheRun: notKept === null,
    ...(notKept === null ? {} : { notKept }),
    ...(design === null ? {} : { design: keepADesignReminder(run, design, line.id) }),
  }
}

/**
 * WHAT THE SEAL FOUND OF THE ITEMS THE REMINDER NAMED: the same checks, asked again of the run as it was sealed, and each
 * named item's key looked for among what they find now. A starter's item is never judged, and nothing is judged when the
 * reminder's items were not kept or git cannot be read now, because then an item missing from what is found would say
 * nothing about the run.
 */
async function whatTheSealFound(req: FastifyRequest, run: PanelRecord, items: ANamedItem[] | null, sealedTip: string): Promise<AtTheSeal> {
  // NO TIP: the seal took the working directory's HEAD, and refused a named tip that differed from it. `sealedTip` is the
  // seal record's id, not a commit.
  return { at: localStamp(new Date()), sealedTip, ...(await whatIsFoundOfTheNamedItems(req, run, items, null, 'what the seal found')) }
}

/**
 * The comparison both block and the seal ask for, on the run each would store, with the tip each names (null for none),
 * so a worktree item is looked for as the reminder looked for it. Its git is read on the seal-read thread. It writes
 * nothing.
 */
async function whatIsFoundOfTheNamedItems(
  req: FastifyRequest,
  run: PanelRecord,
  items: ANamedItem[] | null,
  tip: string | null,
  name: string,
): Promise<Omit<AtTheSeal, 'at' | 'sealedTip'>> {
  if (items === null) return THE_NAMED_ITEMS_WERE_NOT_KEPT
  return whatIsFoundIn(await theFactsReadApart(req, run, { tip }, theNamedItemsAskForTheCopiedWords(items), name), items)
}

/** `whatIsFoundOfTheNamedItems` inside a finishing write's pass, on the git the seal reads, or null outside one. */
function whatIsFoundOfTheNamedItemsAtTheWrite(run: PanelRecord, items: ANamedItem[], tip: string | null): Omit<AtTheSeal, 'at' | 'sealedTip'> | null {
  const facts = theFactsAtTheWrite(run, { tip }, theNamedItemsAskForTheCopiedWords(items))
  return facts === null ? null : whatIsFoundIn(facts, items)
}

const THE_NAMED_ITEMS_WERE_NOT_KEPT = { stillFound: null, noLongerFound: null, notJudged: [], couldNotJudge: 'The office did not keep what the reminder named.' }

/** The code is read for copied test words only when the reminder named a copied item: only named items are compared. */
function theNamedItemsAskForTheCopiedWords(items: readonly ANamedItem[]): boolean {
  return items.some((one) => one.key.startsWith('copied:'))
}

/** Which of the named items the checks still find in `facts`. */
function whatIsFoundIn(facts: TheFactsBeforeTheSeal, items: ANamedItem[]): Omit<AtTheSeal, 'at' | 'sealedTip'> {
  if ('couldNotRead' in facts.git) {
    return { stillFound: null, noLongerFound: null, notJudged: items.map((one) => one.key), couldNotJudge: `git could not be read at the seal (${facts.git.couldNotRead}).` }
  }
  const found = new Set(whatAnInspectorWouldMostLikelyRefuse(facts).items.map((one) => one.key))
  const copiedReadable = facts.copiedTestLiterals !== undefined && !('couldNotRead' in facts.copiedTestLiterals)
  const { judged, notJudged } = theComparableItems(items, copiedReadable)
  const lines = facts.git.testLinesAtTheTip
  return {
    stillFound: judged.filter((one) => found.has(one.key)).map((one) => one.key),
    noLongerFound: judged.filter((one) => !found.has(one.key)).map((one) => one.key),
    notJudged,
    couldNotJudge: null,
    ...(lines === undefined ? {} : { machineWideScans: theDecisionsOnTheScans(items, theMachineWideScansIn(lines)) }),
  }
}

/** The certain items the reminder named that the checks still find, or none when there was no reading to judge. */
function theCertainItemsStillFound(items: readonly ANamedItem[] | null, reading: Omit<AtTheSeal, 'at' | 'sealedTip'>): ANamedItem[] {
  // No kept items or unreadable git means there is no reading to judge. Let the seal keep couldNotJudge as before.
  if (reading.couldNotJudge !== null || items === null) return []
  return items.filter((one) => anItemBlockJudges(one) && reading.stillFound!.includes(one.key))
}

/**
 * THE RUN, ITS REMINDER AND ITS KEY ARE AS THEY WERE BEFORE ITS GIT WAS READ, or the step is refused with 409 before it
 * writes or counts anything. The record door read and allowed the write before this step, and the read on the seal-read
 * thread let other requests in: the run could have been written, reminded, sealed or deleted, or its key taken back.
 * `version` is the run's (`versionOf`) when the step began; it holds every field a write can change, the seal and the
 * kept reminder with them.
 */
function theRunIsAsItWasRead(req: FastifyRequest, run: PanelRecord, version: string, was: { reminded: boolean }): void {
  const now = getRecord(run.id)
  const afterSeal = typeof run.data['sealedTip'] === 'string' ? run.data['sealedTip'] : null
  if (now === null || versionOf(now) !== version || (theLineThatReminded(run, afterSeal) !== null) !== was.reminded || !theRunsOwnRequest(req, now)) {
    throw theRunChangedWhileItsGitWasRead(run.id)
  }
}

/** Why an item refuses a later write: the rule a fault of form breaks, the migration rule, or the block setting's rule. */
function whyItRefuses(item: ANamedItem): string {
  const form = theRuleAFaultOfFormBreaks(item)
  if (form !== null) return form
  if (item.about === 'migration') return "the rule on migration items: a migration item the seal's own check still finds refuses every seal of a branch"
  return "the block position: a certain item the reminder named that the same check still finds refuses the seal"
}

/** An item's own sentence, and the rule it breaks when it refuses the seal. */
function theSaysWithItsRule(item: ANamedItem): string {
  return `${item.says} This refuses the seal. Rule: ${whyItRefuses(item)}.`
}

/** The reminder's sentence on what refuses a later write, naming each item that does. */
function whatRefusesALaterWrite(refusing: readonly ANamedItem[]): string {
  if (refusing.length === 0) {
    return "When it seals a branch, a migration item the same check still finds refuses the seal. At block, a certain item the reminder named that is still found refuses it too. This reminder found none, and every item it named remains a reminder."
  }
  return (
    `${refusing.length === 1 ? 'One item refuses' : `${refusing.length} items refuse`} a later write while the same check still finds ${refusing.length === 1 ? 'it' : 'them'}: ` +
    `${refusing.map((one) => one.key).join(', ')}. Fix ${refusing.length === 1 ? 'it' : 'each'} first: a write over one still found is refused with 409, and nothing of it is stored. ` +
    'Every other item remains a reminder.'
  )
}

/** Whether the seal this run's data proposes seals a branch: every submission but a records or files one. */
function theSealSealsABranch(run: PanelRecord): boolean {
  const kind = theSubmissionProposedBy(run)
  return kind !== 'records' && kind !== 'files'
}

/** The named certain items still found, with each item's own sentence and the action to take kept whole. */
function aCertainNamedItemRefusesTheSeal(items: readonly ANamedItem[]): PanelError {
  const found = items.length === 1 ? 'a certain item the reminder named' : `${items.length} certain items the reminder named`
  const message =
    `This run cannot seal: the same check still finds ${found}. ` +
    items.map((one) => (theRuleAFaultOfFormBreaks(one) === null ? one.says : theSaysWithItsRule(one))).join(' ') +
    ' Nothing was written: no seal was made, no check was asked for, and nothing on the run changed. Fix the item, then seal again.'
  return new PanelError(message, 409, undefined, undefined, 'A certain item the reminder named is still found and refuses this seal.')
}

// ================================================================================================== the hard gate

/**
 * THE HARD GATE BEFORE THE SEAL. One rule, one list (`theItemsNoSealPasses` in ./before-the-seal-rules.ts).
 *
 * A MIGRATION ITEM. The decision on migration items, point 1, on the coordinator's scope:
 * a migration item the seal's own check still finds on the branch refuses every git seal, whoever writes it, at every
 * position. The reason: the merge queue renumbers a migration, so a test that names one by its
 * first digits can point at another migration afterwards. A records or files submission seals no branch — `sealFinishedRun`
 * in ./sealed-tip.ts reads no git at all for those kinds — so it is not judged for a migration item.
 *
 * A FAULT OF FORM IS LISTED, NEVER REFUSED HERE. The reminder names it and marks it certain, so a run can fix it before
 * a check is spent on it, but a write over it still seals. `THE_FAULTS_OF_FORM` in ./before-the-seal-rules.ts is the
 * list.
 *
 * ONLY BLOCK REFUSES OVER A CERTAIN ITEM THE REMINDER NAMED. That is the person's own setting, and
 * `aReminderBeforeTheSealFor` above asks it. It is not part of this gate.
 *
 * EVERY REFUSAL HERE IS COUNTED. When this gate throws, it counts one stopped write of the gate before the seal, once
 * the write it refused has been taken back. The count is read at GET /api/office/gates.
 *
 * THE SAME FINDER, CALLED AGAIN, NOT COPIED. It reads the facts with `theFactsBeforeTheSealOf` and asks
 * `whatAnInspectorWouldMostLikelyRefuse`, exactly as the reminder does, on the run as the write would store it. On one
 * run the two readings agree; they part when the branch changes between them. A branch that gained an item after the
 * reminder is refused here although the reminder never named it, and atTheSeal (`whatTheSealFound`) compares only the
 * keys the reminder named, not every item found here. The caller hands the run as the write would store it, so a write
 * that changes the working directory is judged on the one it names.
 *
 * IT RUNS ON EVERY WRITE THAT WOULD SEAL: with or without a reminder, and whoever sends it. In the patch path
 * (lib/records.ts) it stands before anything of the write is stored. A run filed already finished seals inside the
 * filing's transaction, so there the gate stands after the filing has written and the refusal rolls the whole filing
 * back: no run, no key, no history and no notice. Either way no check is asked.
 *
 * GIT IT CANNOT READ REFUSES NO MIGRATION ITEM HERE. There is no reading to judge, and the seal itself refuses
 * unreadable git.
 */
export function refuseTheSealOverAFault(run: PanelRecord): void {
  // INSIDE A FINISHING WRITE (./a-finish-reads-git-apart.ts) the checks the reminder left are asked again, on the tree the
  // seal reads. The seal's own git is asked only where the seal stands, after every guard of the write.
  if (aFinishingPassRuns()) theChecksLeftForTheWrite(run)
  if (!theSealSealsABranch(run)) return
  const facts = theFactsAtTheWrite(run, undefined, false) ?? theFactsBeforeTheSealOf(run)
  const items = theItemsNoSealPasses(whatAnInspectorWouldMostLikelyRefuse(facts).items, { branch: true })
  if (items.length === 0) return
  throw gateMetOnceTheWriteIsTakenBack(aMigrationItemRefusesTheSeal(items), () => gateMet('before-the-seal', 'block'))
}

/**
 * THE KIND OF SUBMISSION THE WRITE WOULD STORE, or null when it names none: the seal reads a submission with no kind,
 * or none at all, as git (`sealFinishedRun` in ./sealed-tip.ts). A `kind` that is not a string is no kind.
 */
function theSubmissionProposedBy(run: PanelRecord): string | null {
  const submission = run.data['submission']
  if (typeof submission !== 'object' || submission === null || Array.isArray(submission)) return null
  const kind = (submission as Record<string, unknown>)['kind']
  return typeof kind === 'string' ? kind : null
}

/**
 * THE REFUSAL: what was found and that nothing was written, then each migration item's own says sentence and What to do,
 * whole. The reason is the same refusal in one short sentence, which the box on the screen draws.
 */
function aMigrationItemRefusesTheSeal(items: readonly ANamedItem[]): PanelError {
  const found = items.length === 1 ? 'a migration item in this branch' : `${items.length} migration items in this branch`
  const message =
    `This run cannot seal: the check the reminder before the seal uses still finds ${found}. ` +
    items.map((one) => one.says).join(' ') +
    ` Nothing was written: no seal was made, no check was asked for, and nothing on the run changed. Fix ${items.length === 1 ? 'the item' : 'each item'}, then seal again.`
  return new PanelError(message, 409, undefined, undefined, 'A migration item still in the branch refuses this seal.')
}

/** Why a write that sealed was not reminded, as the record door knew it. */
export interface WhyTheSealWasNotReminded {
  /** The write sent `remindBeforeTheSeal: false`, as the launcher does. */
  launcherAskedForNone: boolean
  /** The reminder was due and the run names no agent to keep it for (`notReminded`). */
  noAgent: boolean
}

/**
 * ASKED BY THE RECORD DOOR AFTER A WRITE IS STORED. When the write gave the run a new seal, the office writes on the run
 * what the reminder did before it: the items it named and which the same checks still find, or that there was no
 * reminder and why. Null when no new seal was made. Never throws: a failure is answered as `{ kept: false }`, beside a
 * seal it did not stop.
 */
export async function keepWhatTheSealDidWithTheReminder(
  req: FastifyRequest,
  before: PanelRecord,
  sealed: PanelRecord,
  why: WhyTheSealWasNotReminded,
): Promise<{ kept: true } | { kept: false; because: string } | null> {
  const sealedTip = sealed.data['sealedTip']
  const afterSeal = typeof before.data['sealedTip'] === 'string' ? before.data['sealedTip'] : null
  if (sealed.kind !== 'session' || typeof sealedTip !== 'string' || sealedTip === afterSeal) return null
  let value: RemindedBeforeTheSeal
  try {
    const held = readRemindedBeforeTheSeal(sealed.data[REMINDED_BEFORE_THE_SEAL])
    const line = held !== null && held.reminded && held.afterSeal === afterSeal ? null : theLineThatReminded(before, afterSeal)
    if (held !== null && held.reminded && held.afterSeal === afterSeal) {
      value = { ...held, atTheSeal: await whatTheSealFound(req, sealed, held.items, sealedTip) }
    } else if (line !== null) {
      // REMINDED, AND WHAT IT NAMED WAS NOT KEPT: the line is there and the field is not, or holds an earlier seal's.
      value = { reminded: true, at: getRecord(line)?.createdAt ?? 'unknown', afterSeal, line, chapters: null, items: null, atTheSeal: await whatTheSealFound(req, sealed, null, sealedTip) }
    } else {
      const because = requestsWithTheGateOff.has(req) ? 'theGateIsOff' : why.launcherAskedForNone ? 'theLauncherAskedForNone' : why.noAgent ? 'noAgent' : !theRunsOwnRequest(req, before) ? 'notTheRunsOwnKey' : 'unknown'
      value = { reminded: false, at: localStamp(new Date()), sealedTip, because }
    }
  } catch (err) {
    return { kept: false, because: `The office could not work out what to keep of the reminder on run ${sealed.id}: ${err instanceof Error ? err.message : String(err)}` }
  }
  // WHAT THE SEAL FOUND IS OF THIS SEAL ONLY. Its git was read on the seal-read thread, and a run sealed again or kept
  // again meanwhile is not written over with it.
  const now = getRecord(sealed.id)
  if (now === null || now.data['sealedTip'] !== sealedTip || !isDeepStrictEqual(now.data[REMINDED_BEFORE_THE_SEAL], sealed.data[REMINDED_BEFORE_THE_SEAL])) {
    return { kept: false, because: `Run ${sealed.id} changed while the office read what its seal found, so nothing was kept of the reminder.` }
  }
  const notKept = keepOnTheRun(sealed.id, value)
  if (notKept !== null) return { kept: false, because: notKept }
  // patchRecord announces changes too, so an outer database rollback cannot undo all of a keep.
  // Count only a judgement kept on the run. A failed count is answered beside that kept judgement.
  try {
    if (value.reminded && value.items !== null && value.items.length > 0 && value.atTheSeal?.couldNotJudge === null) {
      gateLookedAgain('before-the-seal', {ignored: value.atTheSeal.stillFound!.length, heeded: value.atTheSeal.noLongerFound!.length})
    }
  } catch (err) {
    return { kept: false, because: `The office kept the reminder's judgement on run ${sealed.id} but could not count it: ${err instanceof Error ? err.message : String(err)}` }
  }
  return { kept: true }
}

/** The row of the run's own key, as its record names it in `data.extra.runKeyId`, or null when it names none. */
function theRunsOwnKeyRow(run: PanelRecord): string | null {
  const extra = run.data['extra']
  const own = typeof extra === 'object' && extra !== null ? (extra as Record<string, unknown>)['runKeyId'] : undefined
  return typeof own === 'string' ? own : null
}

/** Whether this request carries the run's own key, or a supervisor's key acting for the run. */
export function theRunsOwnRequest(req: FastifyRequest, run: PanelRecord): boolean {
  if (howThisRequestProvedItself(req)?.actingFor?.run === run.id) return true
  const own = theRunsOwnKeyRow(run)
  if (own === null) return false
  const hash = theHashOfTheKeyOnThisRequest(req)
  const row = hash === null ? null : theHeldKeyRowWhoseHashIs(hash)
  return row !== null && row.id === own && row.revokedAt === null
}

/**
 * ASKED BY THE RECORD DOOR BEFORE A PATCH IS WRITTEN. At remind or block, answers the reminder when this write would seal a run that submits
 * work, the run's own key sent it, and the run has not been reminded for this seal; then the door writes nothing of the
 * patch. At block, later writes refuse only certain named items the same finder still finds on the proposed data.
 * Answers `{ notReminded }` when a reminder was due and the run names no agent, and null when no reminder or refusal is due.
 */
export async function aReminderBeforeTheSealFor(
  req: FastifyRequest,
  before: PanelRecord,
  patch: Pick<RecordPatch, 'kind' | 'data' | 'dataPatch'>,
): Promise<TheReminderBeforeTheSeal | { notReminded: string } | null> {
  if (before.kind !== 'session' || (patch.kind !== undefined && patch.kind !== 'session')) return null
  const { explicitlyFinishes, aVerdictClosedIt } = whetherThisWriteFinishesTheRun(before, patch)
  // THE FINISHING PATH IS TIMED FROM HERE, so the log line of a finish names this step's reads too (the record door's
  // own call after this step keeps the start).
  if (explicitlyFinishes) timeTheFinishOf(req, 'PATCH /api/records/:id')
  if (!explicitlyFinishes || aVerdictClosedIt !== undefined) return null
  // THE DATA THE WRITE WOULD STORE, as `patchRecord` hands it to `runSubmitsWork`. A null in a dataPatch deletes its key.
  const merged: Record<string, unknown> = patch.data ?? { ...before.data }
  if (patch.dataPatch !== undefined) {
    for (const [key, value] of Object.entries(patch.dataPatch)) {
      if (value === null) delete merged[key]
      else merged[key] = value
    }
  }
  if (!asAStepOfThisFinish(req, () => runSubmitsWork(before.id, merged))) return null
  if (!theRunsOwnRequest(req, before)) return null
  // THE TIP THE WRITE NAMES, as the record door hands it to `sealFinishedRun`; a tip stored earlier is not this write's.
  const named = (patch.dataPatch ?? patch.data)?.['tip']
  const tip = typeof named === 'string' ? named : null
  const afterSeal = typeof before.data['sealedTip'] === 'string' ? before.data['sealedTip'] : null
  const position = String(gatePosition('before-the-seal'))
  // THE RUN AS THIS STEP FOUND IT, before any of its git is read on the seal-read thread (`theRunIsAsItWasRead`).
  const version = versionOf(getRecord(before.id) ?? before)
  if (theLineThatReminded(before, afterSeal) !== null) {
    if (position === 'block') {
      const held = readRemindedBeforeTheSeal(before.data[REMINDED_BEFORE_THE_SEAL])
      const items = held?.reminded && held.afterSeal === afterSeal ? held.items : null
      const reading = await whatIsFoundOfTheNamedItems(req, { ...before, data: merged }, items, tip, 'the block before the seal')
      theRunIsAsItWasRead(req, before, version, { reminded: true })
      const certain = theCertainItemsStillFound(items, reading)
      if (certain.length > 0) {
        // The door has not entered patchRecord's transaction, so its refusal cannot roll this count back.
        gateMet('before-the-seal', 'block')
        throw aCertainNamedItemRefusesTheSeal(certain)
      }
      // ASKED AGAIN AT THE WRITE, on the tree the seal reads, which may have changed since this reading. A refusal there
      // is counted as this one is, once, when the write is taken back.
      if (items !== null) {
        checkAgainAtTheWrite(req, (run) => {
          const again = whatIsFoundOfTheNamedItemsAtTheWrite(run, items, tip)
          const still = again === null ? [] : theCertainItemsStillFound(items, again)
          if (still.length > 0) throw gateMetOnceTheWriteIsTakenBack(aCertainNamedItemRefusesTheSeal(still), () => gateMet('before-the-seal', 'block'))
        })
      }
    }
    return null
  }
  if (position === 'off') {
    const judged = { ...before, data: merged }
    const {items} = whatAnInspectorWouldMostLikelyRefuse(await theFactsReadApart(req, judged, { tip }, true, 'the reminder before the seal, at off'))
    theRunIsAsItWasRead(req, before, version, { reminded: false })
    // A WRITE THE HARD GATE WILL REFUSE IS COUNTED THERE, as one stopped write, so it is not counted here as well. If the
    // branch changes before the write and the hard gate then finds no migration item, that write is not counted.
    const theHardGateCountsIt = theItemsNoSealPasses(items, { branch: theSealSealsABranch(judged) }).length > 0
    if (items.length > 0 && !theHardGateCountsIt) gateMet('before-the-seal', position)
    requestsWithTheGateOff.add(req)
    return null
  }
  return await theReminderBeforeTheSealOf(before, position, { data: merged, tip }, { req, version })
}
