// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S STATE MACHINE: which state follows each step the merge tool reports, on what
 * evidence, and what the office writes and says when an entry moves. Sandbox v1, piece P7, on
 * SPEC.md section 5.4 and decisions R2, R3 and R4.
 *
 * ---------------------------------------------------------------------------------------
 * THE SERVER DECIDES AND RECORDS. IT NEVER RUNS GIT AND NEVER STARTS A PROCESS.
 * ---------------------------------------------------------------------------------------
 *
 * The merge tool (tools/the-merger.mjs, piece P8) pins, rebases, runs the checkers and the tests,
 * and moves the main world. After each of those it reports ONE STEP through
 * `POST /api/merge-queue/<id>/step` with the facts it measured, and this file decides the next
 * state from those facts and from what the office already holds about the run: its seal, and the
 * inspector's release or refusal. Nothing here reads a working tree. A check the queue needs is
 * asked for the way every check is asked for — the office writes the inspector a notice and the
 * message worker starts the tool — so there is no second starting path.
 *
 * ---------------------------------------------------------------------------------------
 * H_RELEASE, ENFORCED HERE IN CODE FOR THE FIRST TIME
 * ---------------------------------------------------------------------------------------
 *
 * An entry becomes `judged` only when an INSPECTOR'S RELEASE names the entry's seal, the seal's
 * hash and, for git, the exact pinned commit. A starter's release, a scoped release, or a release
 * of another seal of the same run is not that, and the entry says so and waits. A standing refusal
 * bounces the entry. The same question is asked again when the tool takes the lane.
 *
 * A FILES ENTRY IS HELD TO ITS SEAL TOO (sandbox v1 fix of the queue). Its content is its manifest's
 * after-hashes. On a git seal every byte it lands must be among the files the seal froze, by hash. On a
 * files seal the seal's paths are the landing paths, so every byte is bound by
 * path, hash and mode in the root the run sealed, and the release must also have read the file a modify
 * replaces (whatAFilesSealDoesNotHold, whatTheReleaseDidNotReadBefore). Either way the entry bounces as
 * `unjudged` naming the path. A path the files checker hands on bounces a git-sealed entry the same way, at
 * the pin or at the integrate step, because no check can read a files entry. On a files seal the check of
 * the seal was told what the checker could not decide (A2), so a handed-on path is covered by a release
 * that names it with a line of the model's own (whatTheReleaseJudged), and bounces only when the release
 * did not, or when it is protected or generated (neverOnAReleaseAlone). A path whose content changed after
 * the verdict is bounced with that reason, and not as one the checker handed on.
 *
 * THE VERDICT FOLLOWS FILE CONTENT (decision R2). The entry remembers what the release read, path
 * by path, at its content hash — `judged`. After the tool puts the entry on top of the main world
 * it reports every changed path at its new hash, and `whatChangedSinceTheVerdict` says which paths
 * keep their verdict and which need one. A path a checker tool decided (regenerated and compared
 * byte for byte) needs no inspector. A path a checker tool handed on needs the inspector unless
 * one already judged it as handed on at that content — `handedOn` — or, on a git entry, the entry's
 * own release was handed it in `read.needsJudgment` and its content is still what that release
 * judged (judged once, a queue finding of 23 September 2026). What is left, if anything, is
 * the scope of a check again: the office files a run of the submitting agent at the integrated
 * tree, seals it, and asks for a scoped check with `--only` and `--needs-judgment`. Its release
 * widens `judged` and `handedOn`; its refusal bounces the entry.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS WRITTEN WHERE
 * ---------------------------------------------------------------------------------------
 *
 * Every state change goes through `moveEntry` in ./merge-queue.ts, which is the one writer of the
 * state and the lane. This file adds the fields the state machine owns (declared on the kind in
 * src/shared/kinds.ts) in the same write. On a bounce the submitter is told in a message that names
 * the reason, the files, the log and the next act; on merge, bounce and withdrawal the secretary
 * gets one line. On merge the receipt is written twice, on the entry and on the run that submitted
 * it (`data.integrated`), which is SPEC.md's integration receipt.
 */

import { sayInEnglish } from '../../shared/i18n.ts'

import { tellEarlyConflicts, tellRenumberedMigrations } from './merge-conflict-notices.ts'

import { realpathSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { z } from 'zod'

import { KEY_HEADER } from '../../config/key-header.mjs'
import { gateNumber } from '../../config/settings.mjs'
import { theEndOfResolving, theTimeLeftToResolve } from '@shared/merge-queue.ts'
import { BUS_ENTRIES_BOUNDS, REPO_ROOT, gatePosition, settingValue } from '../../config/settings.mjs'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { THE_LANDING_TOOL_STOPPED, eachHasAPlace, theOfficeStoppedAskingForTheLandingTool, theQueueIsHeld, theQueueIsHeldFor } from './merge-queue.ts'
import { theOrderWritten } from '@shared/the-order-written.ts'

import {
  ABSENT,
  A_TOOL_RUN_ENDED,
  INTEGRATED,
  MERGE_ENTRY_KIND,
  MERGE_STATE_SPECS,
  HOW_MUCH_A_RESOLUTION_CHECK_REPORTS,
  THE_REASON_A_RESOLUTION_BOUNCE_KEEPS,
  aMoveToTheFrontStands,
  aResolutionWaitsForItsCheck,
  occupiesTheLaneIn,
  aReleasedRunGoesInUnderANewRun,
  FIX_ROUND_MINUTES,
  theMoveAStepMakes,
  type WhatHappenedToAnEntry,
  thePathsThatNeedAPress,
  thePathsThatWaitForAPress,
  pinnedRefOf,
  resolvedRefOf,
  keptByLineSay,
  whatChangedSinceTheVerdict,
  whyItLandsAfterAPress,
  type AskedToResolve,
  type AskedToResolveMessage,
  type Bounce,
  type BounceReason,
  type ContentByPath,
  type DeclaredTestRun,
  type FileOperation,
  type FilesChangeset,
  type FixRoundAsk,
  type GitChangeset,
  type IntegrationReceipt,
  type LinesOfAFile,
  type MergeState,
  type MergeStep,
  type MovedFirst,
  type NobodyStarted,
  type OwnerContentReminders,
  type PlaceholderCommits,
  type Resolution,
  type ResolutionBounce,
  type Resolving,
  type ReturnsFirst,
  type SideOfAPlace,
  type TheMoveAStepMakes,
  type WaitsForAFixRound,
} from '@shared/merge-queue.ts'
import { NEXT_ROUND, readTheNextRound } from '@shared/next-round.ts'
import { HOW_MUCH_OF_A_RED_RUN_IS_KEPT, type TheFailureLines } from '@shared/the-failure-lines-of-a-red-run.ts'
import { participantWord, type ParticipantRef } from '@shared/participants.ts'
import { aPluginOnlyChange, type APluginOnlyChange, PLUGINS_FOLDER, type ThePluginRule, thePluginRuleOf } from '@shared/plugins.ts'
import { asTheDoorOf } from './check-field-doors.ts'
import { ENDED_WITH_ITS_MERGE_ENTRY, aRefusalHappened, howARunStands, type EndedWithItsMergeEntry, type PathThatNeedsJudgment, type Release } from '@shared/releasing.ts'
import { howAReleaseNamesThisSeal, type SealedTip } from '@shared/sealed-tip.ts'
import { THE_WORKER as THE_WORKERS_CARD } from '@shared/roles.ts'
import { clockStamp, nowStamp, stampInZone, momentOfAnInstant, momentOfAStoredStamp, type ClockStamp } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'
import { REVIEW_LEVEL_WORDS } from '@shared/workspaces.ts'
import { stateWord } from '@shared/words.ts'
import { databaseFileStatus, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { whatTheReportOfARunLacks } from './before-the-seal.ts'
import type { WhatTheReportLacks } from './before-the-seal-rules.ts'
import { addressText, theAddressThisProcessAnswersOn } from './bound-address.ts'
import { insideTheFilesArea, theFoldersThatMoved } from '../../config/files-area.mjs'
import { theAgentOfARun, theCheckAskedFor, theNameAPersonReads, theOfficeStartsTheCheck, whoHoldsTheSecretaryCard, writeAMessage, type TheCheckTheOfficeAskedFor } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import type { AnotherNoticeKind } from './notices.ts'
import { asTheMergeQueue } from './merge-entry-door.ts'
import { theLandingIn, thePushMovingMainIn } from './who-moves-main.ts'
import { aPushHoldsMain } from '@shared/emergency-push.ts'
import { THE_SECRETARYS_FOLDER, theOfficeFiledThisRunForASecretarysEntry } from './the-offices-secretary-run.ts'
import {
  maySpeakForTheSecretary,
  moveEntry,
  readMergeEntry,
  recordMergeToolEnded,
  theMergeEntriesACheckOfThisRunIsFor,
  theDirectory,
  theMergeEntry,
  whoIsInTheRunsLine,
  whoIsToldOfAnEntrysEnd,
  officeTakeBackRun,
  theAgentAndStarterOfAnEntry,
  handBackOfProblem,
  theProblemsWhere,
  whoOccupies,
  whatTheMergeToolWaitsOn,
  noInspectorWasAskedToCheck,
  theInspectorItWasAskedOf,
  type MergeEntryReading,
} from './merge-queue.ts'
import { holdsTheSecretaryCard } from './holds-the-secretary-card.ts'
import { theFilesAreaOf, type RegisteredAgent } from './participants.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theCardOfAgent } from '../db/the-card-of-agent.ts'
import { requireTheRepairReservation, askForTheNextRound, theLastSandboxRunOf, theSandboxTheOfficeVouchesFor } from './next-round.ts'
import { asTheOfficeAsking } from './the-office-asks-for-a-round.ts'
import { writeABriefIntoASandbox } from './the-office-writes-into-a-sandbox.ts'
import { readGit } from './resources.ts'
import { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'
import { theFilesOfACommit, whyTheGitWorkCouldNotBeRead } from './sealed-tip.ts'
import { busCauseEvidence, wholeSuiteRedEvidence, wholeSuiteRedAuthorizesLanding, type BusCause, type WholeSuiteRed } from '../../shared/whole-suite-red.ts'
import { DATABASE_FOLDERS, classifyRedMerge, mergeClassDecision, redMergeAuthorizesLanding, repairFact, handBackFacts, type MergeClassDecision, type WideRedDecision, type RepairFact, type RoundOpenReading, type HouseRule, houseRulesFact, onlyHouseRulesRedAuthorizesLanding, readMainHouseRules, type HouseRulesDecision, type HandBackFacts } from '../../shared/merge-class.ts'
import { mergeTestsAuthorizeLanding, fixRoundAuthorizesLanding, wholeSuiteFixRoundIsOn } from '../../config/whole-suite-red.mjs'
import { conflictResolvingIsOn } from '../../config/conflict-resolving.mjs'
import { aRaiseCarriesIt, andList, createRecord, getRecord, listRecords, patchRecord, type Actor } from './records.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { PanelError } from './panel-error.ts'
import { theAgentThatOwnsTheMergeQueue, theMergeQueueOwner } from './merge-queue-owner.ts'
import { theRegisteredStarterOf } from './claims.ts'
import { runServing } from './worker.ts'
import { theReviewLevel } from '../db/the-review-level.ts'
import { theHandBackDeadline } from '@shared/hand-back-deadline.ts'

// ============================================================================ the facts a step carries

/** A content hash as the tool spells it: git's blob hash, sha256, or the word for "no file". */
const aContentHash = z.string().regex(/^([0-9a-f]{40}|[0-9a-f]{64}|absent)$/u, {
  error: `a content hash is 40 or 64 lower-case hex characters, or the word "${ABSENT}" for a path the change deletes.`,
})
const contentByPath = z.record(z.string().min(1).max(4096), aContentHash)
const somePaths = z.array(z.string().min(1).max(4096)).max(10_000)

/**
 * A RED RUN'S FAILURE LINES, as the merge tool read them from the log a file was red in, so that the problem does not
 * depend on a log that is not kept for ever (wave 13u round 180): the file's blocks cut to the bound, or a log with no
 * FAIL line for the file, or a log it could not read.
 * Only the bound's shapes are taken, so a problem keeps at most the bound's lines of one file.
 */
const aFailureLines = z.discriminatedUnion('found', [
  z.object({
    log: z.string().min(1),
    found: z.literal('blocks'),
    blocks: z
      .array(z.object({ line: z.number().int().min(1), lines: z.array(z.string().max(HOW_MUCH_OF_A_RED_RUN_IS_KEPT.characters)).min(1).max(1 + HOW_MUCH_OF_A_RED_RUN_IS_KEPT.linesAfter), cut: z.boolean() }).strict())
      .min(1)
      .max(HOW_MUCH_OF_A_RED_RUN_IS_KEPT.blocks),
    leftOut: z.number().int().min(0),
  }).strict(),
  z.object({ log: z.string().min(1), found: z.literal('none'), lines: z.number().int().min(0) }).strict(),
  z.object({ log: z.string().min(1), found: z.literal('unread'), why: z.string().max(HOW_MUCH_OF_A_RED_RUN_IS_KEPT.why) }).strict(),
])

/**
 * WHAT A CHECKER TOOL PRINTED (tools/checks/*.mjs): what it decided and what it handed on. The tool
 * forwards the report as it stands; `checked` is the checker's own account of what it read and is
 * kept without being read here.
 */
const aCheckerReport = z
  .object({
    tool: z.string().min(1).optional(),
    checked: z.unknown().optional(),
    decided: z.array(z.object({ path: z.string().min(1), check: z.string().min(1), ok: z.boolean(), detail: z.string().optional() }).strict()).max(10_000),
    needsJudgment: z.array(z.object({ path: z.string().min(1), why: z.string().min(1) }).strict()).max(500),
  })
  .strict()
export type CheckerReport = z.infer<typeof aCheckerReport>

/** The facts each step carries. The step door refuses any other shape with 422. */
/** What a shared suite decided for one other entry, and the tree that holds for. */
const theDecidedForOne = z.object({ tree: z.string().min(1), green: z.boolean(), build: z.object({ passed: z.boolean() }).strict().optional(), redTests: somePaths.optional(), says: z.string().min(1) }).strict()

const aMigrationRenumbering = z.array(z.object({from: z.string().min(1), to: z.string().min(1)}).strict()).min(1).max(100)
/**
 * WHERE A REPLAYED ENTRY STOPPED ON A CONFLICT (wave 13v round 15): each conflicted path, with the line ranges of git's
 * conflict markers in the replayed file, or why git wrote none.
 */
const theConflictLines = z.array(z.object({ path: z.string().min(1).max(4096), ranges: z.string().min(1).optional(), why: z.string().min(1).optional() }).strict()).min(1).max(1000)
type ConflictLines = z.infer<typeof theConflictLines>
/** WHERE THE QUEUE'S REBASE, TRIED EARLY ON A SCRATCH COPY, STOPPED (wave 13v round 25): its files, its log and the words of its bounce. */
const theRebaseStoppedEarly = z.object({ files: somePaths.min(1), log: z.string().min(1), says: z.string().min(1) }).strict()
/** ONE RUN OF A TEST FILE ON A MODAL VM: the commit it ran, the runner's log and the report it wrote. */
const aModalRun = z.object({ commit: z.string().min(1), log: z.string().min(1), report: z.string().min(1) }).strict()

/**
 * WHAT THE OWNER-CONTENT GATE NAMED AND DID NOT REFUSE, as the integrated step reports it (wave 13v round 31), the shape
 * `OwnerContentReminders`. The counts must add up, and the sentence is there exactly when something was named.
 */
export const OWNER_CONTENT_REMINDERS = z
  .object({ reminded: z.number().int().nonnegative(), byPattern: z.record(z.string().regex(/^P\d{1,2}$/), z.number().int().positive()), says: z.string().min(1).optional(), log: z.string().min(1) })
  .strict()
  .refine((one) => Object.values(one.byPattern).reduce((sum, count) => sum + count, 0) === one.reminded, { message: 'byPattern does not add up to reminded' })
  .refine((one) => (one.says !== undefined) === one.reminded > 0, { message: 'says is there exactly when reminded is more than 0' })

/**
 * The part of an address after its last @, in lower case, as the commit-address gate reads it, or null when there is
 * none. The gate reads it in its own module, which the office does not import; if the two readings ever part, the step
 * door refuses what the gate carries, so they cannot part without a refusal.
 */
function theDomainOf(address: string): string | null {
  const at = address.lastIndexOf('@')
  return at < 1 || at === address.length - 1 ? null : address.slice(at + 1).toLowerCase()
}

/**
 * THE COMMITS AT THE PLACEHOLDER ADDRESS THAT THE COMMIT-ADDRESS GATE LET LAND AT REMIND (wave 13q), as the integrated
 * step carries them, the shape `PlaceholderCommits`. Each commit has its author or its committer at the stated domain,
 * and the side at another domain is null: an address at any other domain may be a person's own, so it is never kept.
 */
export const PLACEHOLDER_COMMITS = z
  .object({
    position: z.literal('remind'),
    domain: z.string().min(1),
    commits: z.array(z.object({ commit: z.string().regex(/^[0-9a-f]{40}$|^[0-9a-f]{64}$/), author: z.string().min(1).nullable(), committer: z.string().min(1).nullable() }).strict()).min(1),
    log: z.string().min(1),
  })
  .strict()
  .refine((one) => one.commits.every((commit) => commit.author !== null || commit.committer !== null), { message: 'each commit has its author or its committer at the stated domain' })
  .refine((one) => one.commits.every((commit) => [commit.author, commit.committer].every((address) => address === null || theDomainOf(address) === one.domain.toLowerCase())), { message: 'an address that is not at the stated domain is never kept' })

/**
 * ONE PLACE A RESOLUTION RESOLVED, as the merge tool's check reports it (tools/merge-tool/check-a-resolution.mjs): where
 * git left it in conflict, the four sides cut as HOW_MUCH_A_RESOLUTION_CHECK_REPORTS says with how many more, and main's commits
 * that wrote main's side, found by its lines or else by the file (`mainBy`). A cut line carries its note of how many
 * characters more, which is what the 100 beyond the cut leave room for.
 */
const aSideOfAPlace = z
  .object({ lines: z.array(z.string().max(HOW_MUCH_A_RESOLUTION_CHECK_REPORTS.characters + 100)).max(HOW_MUCH_A_RESOLUTION_CHECK_REPORTS.lines), more: z.number().int().nonnegative() })
  .strict()
const aResolvedPlace = z
  .object({
    path: z.string().min(1).max(4096),
    at: z.number().int().positive(),
    entryCommit: z.string().min(1),
    resolvedIn: z.string().min(1).nullable(),
    ancestor: aSideOfAPlace,
    main: aSideOfAPlace,
    entry: aSideOfAPlace,
    resolution: aSideOfAPlace,
    mainCommits: z.array(z.string().min(1)).max(HOW_MUCH_A_RESOLUTION_CHECK_REPORTS.mainCommits),
    mainBy: z.enum(['lines', 'file']),
    ambiguous: z.literal(true).optional(),
  })
  .strict()

const THE_FACTS_OF = {
  pinned: z
    .object({
      files: contentByPath,
      checker: aCheckerReport.optional(),
      // A DOCUMENTATION ENTRY: the tool found every path it touches to be a document that no test
      // reads, by the record of what the suite read on main's tree.
      documents: z.object({ tree: z.string().min(1), files: somePaths.min(1) }).strict().optional(),
      // THE ENTRY CANNOT JOIN MAIN (wave 13v round 15): the tool replayed its commits onto main as the rebase will, and
      // `commit` stopped on a conflict that is not only in migration files. The entry bounces at the pin.
      cannotJoin: z.object({ mainAt: z.string().min(1), commit: z.string().min(1), files: somePaths.min(1), lines: theConflictLines }).strict().optional(),
      // THE QUEUE'S REBASE STOPPED, TRIED EARLY (wave 13v round 25): the replay's conflict was only in migration or list
      // files, the tool ran the rebase with its joins on a scratch copy, and a conflict they do not resolve remained.
      rebaseStopped: theRebaseStoppedEarly.extend({ mainAt: z.string().min(1) }).strict().optional(),
      // MAIN'S CONTENT AT THE PIN (wave 13u round 96): the commit main is at, and each path the seal names as main has it
      // there. A path that lands only after a press needs one only where the entry's content differs from this.
      main: z.object({ at: z.string().min(1), files: contentByPath }).strict().optional(),
    })
    .strict(),
  integrating: z.object({ mainAt: z.string().min(1).optional() }).strict(),
  integrated: z
    .object({
      result: z.string().min(1),
      mainAt: z.string().min(1),
      clone: z.string().min(1).optional(),
      files: contentByPath,
      checker: aCheckerReport.optional(),
      // WHAT MAIN'S RECORD SAYS THE SUITE READS, for the line that says the entry is under test:
      // how many files and folders, and where the whole record is kept. Absent when main's tree has no record.
      reads: z.object({ tree: z.string().min(1), files: z.number().int().nonnegative(), folders: z.number().int().nonnegative(), record: z.string().min(1) }).strict().optional(),
      // WHAT THE TOOL FOUND OF EACH LINE FILE whose content is not what the verdict read (decision HV60rcgJlfDH): whether
      // the entry's own lines held on the joined tree, at which lines, and why not.
      lines: z.array(z.object({ path: z.string().min(1), held: z.boolean(), ranges: z.string().min(1).optional(), why: z.string().min(1).optional() }).strict()).optional(),
      renumberedMigrations: aMigrationRenumbering.optional(),
      ownerContent: OWNER_CONTENT_REMINDERS.optional(),
      placeholderCommits: PLACEHOLDER_COMMITS.optional(),
    })
    .strict(),
  conflict: z.object({ files: somePaths.min(1), mainAt: z.string().min(1).optional(), log: z.string().min(1).optional(), says: z.string().optional() }).strict(),
  'guard-failed': z.object({ renumberedMigrations: aMigrationRenumbering.optional(), guard: z.string().min(1), files: somePaths, detail: z.string().optional(), log: z.string().min(1).optional() }).strict(),
  tested: z
    .object({
      green: z.boolean(),
      wholeSuiteRed: wholeSuiteRedEvidence.optional(),
      houseRules: houseRulesFact.optional(),
      build: z.object({ passed: z.boolean() }).strict().optional(),
      mergeClass: z.record(z.string(), z.unknown()).optional(),
      repair: repairFact.optional(),
      busCause: busCauseEvidence.optional(),
      relatedOnly: z.object({
        files: z.number().int().nonnegative().max(100_000),
        related: z.number().int().nonnegative().max(100_000),
        every: z.number().int().nonnegative().max(100_000),
        leftOutSlow: z.array(z.object({ file: z.string().min(1).max(4096), seconds: z.number().finite().nonnegative().max(1_000_000_000) }).strict()).max(10_000),
        says: z.string().min(1).max(65_536),
      }).strict().optional(),
      wholeSuiteBecause: z.array(z.object({
        case: z.number().int().min(1).max(7),
        paths: z.array(z.string().min(1).max(4096)).max(20).optional(),
        says: z.string().min(1).max(65_536),
      }).strict()).min(1).max(7).optional(),
      redTests: somePaths.optional(),
      // THE RED TESTS THAT ARE RED ONLY WITH THIS ENTRY (13u round 63): each was red with the entry on main and green on main
      // without it. A run names them only when that is true of every red test, and the office may then hand the red to the
      // entry's own line instead of bouncing it (MOLE_OFFICE_RED_FIXING).
      redOnlyWithIt: somePaths.min(1).optional(),
      log: z.string().min(1),
      tip: z.string().min(1).optional(),
      ran: z.number().int().nonnegative().optional(),
      passed: z.number().int().nonnegative().optional(),
      says: z.string().optional(),
      // HOW FAST THE OFFICE ANSWERED ITS HEALTH WHILE THE SUITE RAN (message dza6Mv2og63z; acceptance finding 64).
      officeHealth: z
        .object({
          samples: z.number().int().nonnegative(),
          answered: z.number().int().nonnegative(),
          unanswered: z.number().int().nonnegative(),
          medianMs: z.number().int().nonnegative().nullable(),
          maxMs: z.number().int().nonnegative().nullable(),
          over10s: z.number().int().nonnegative(),
          everySeconds: z.number().int().positive(),
          // AND THE MACHINE BESIDE IT, read at the same moments (messages u3DdfI9rTQG8 and bbD9i0YMwvMN; the owner's
          // decision to scale the office up until the machine itself is the bottleneck): the 1-minute load
          // average, the memory new work can have (MemAvailable) in MiB, and the machine's CPU count and total memory to
          // read them against. Absent on an entry tested before 24 September 2026.
          load1Median: z.number().nonnegative().optional(),
          load1Max: z.number().nonnegative().optional(),
          availableMemoryMiBMedian: z.number().int().nonnegative().optional(),
          availableMemoryMiBLowest: z.number().int().nonnegative().optional(),
          cpus: z.number().int().positive().optional(),
          memoryMiB: z.number().int().positive().optional(),
        })
        .strict()
        .optional(),
      // TWO ENTRIES, ONE SUITE (item 4, messages jzDRLhSIXc4C and VnYjaMjoYJxK). The entry that ran the pair's
      // suite names the other, the pair's tree, and what the suite decided for the other on the tree it applies to;
      // the other borrows that result only by the same tree, and the office checks it against these facts.
      // A BUS, in wave 13p round 19. `bus` names every other entry the suite held, in landing order,
      // each with what was decided for it on the tree it will have at its own turn. `entry` and `forTheOther` stay the
      // first of them, as a pair's facts always said. It holds at most seven riders beside its driver: a bus of eight, the
      // owner's cap, four before it, read from BUS_ENTRIES_BOUNDS in src/config/settings.mjs so the two cannot
      // drift.
      testedWith: z
        .object({
          entry: z.string().min(1),
          tree: z.string().min(1),
          forTheOther: theDecidedForOne.optional(),
          collision: somePaths.optional(),
          bus: z.array(z.object({ entry: z.string().min(1), forTheOther: theDecidedForOne.optional() }).strict()).min(1).max(BUS_ENTRIES_BOUNDS.most - 1).optional(),
          // THE ENTRIES THE BUS PASSED OVER BECAUSE FILES THEIR RELEASE READ WOULD CHANGE ON ITS TREE, in the lane's order
          // (wave 13p round 27, the coordinator's JCLX21aDWs4p). The office lets each take the lane ahead of the riders marked after it.
          passedForACheck: z.array(z.string().min(1)).min(1).max(1000).optional(),
          // THE ENTRIES THE BUS PASSED OVER BECAUSE THEY ARE TESTED ALONE, in the lane's order (problem gYWdWJQcxyuZ). No bus
          // seats one, so the office lets each take the lane ahead of the riders marked after it, as above.
          passedAlone: z.array(z.string().min(1)).min(1).max(1000).optional(),
        })
        .strict()
        .optional(),
      borrowedFrom: z.object({ entry: z.string().min(1), tree: z.string().min(1) }).strict().optional(),
      // THE FILES RED HERE THAT A SECOND OPINION ON MODAL CLEARED, in wave 13v round 21. Each was red
      // alone with this entry on this machine and green on main here, then green on a Modal VM with this entry, and with
      // main too unless the entry brought or changed the file. Each is kept as a load timeout with every run's log.
      loadTimeouts: z
        .array(
          z
            .object({
              file: z.string().min(1),
              mainAt: z.string().min(1),
              here: z.object({ entryLog: z.string().min(1).optional(), mainLog: z.string().min(1).optional() }).strict(),
              modal: z.object({ entry: aModalRun, main: aModalRun.optional() }).strict(),
            })
            .strict(),
        )
        .min(1)
        .max(1000)
        .optional(),
      // THE FILES THAT CHANGED THEIR ANSWER ON ONE TREE (the flaky-test rule): red in a run and then green alone, or
      // cleared by the pair because a test passed with the entry there, each with the commit its runs were on. The list
      // changes the verdict only at block, where it bounces the entry as red even when the run was green. At remind and
      // off it changes nothing; MOLE_OFFICE_GATE_FLAKY says whether a problem is filed for each file. It is bounded as
      // `redTests` is, so a long list cannot get a run's step refused. Each file may carry the failure lines of the run it
      // was red in, which its problem keeps.
      changedTheirAnswer: z
        .array(z.object({ file: z.string().min(1), how: z.enum(['green-alone', 'green-in-the-pair']), commit: z.string().min(1), log: z.string().min(1).optional(), failureLines: aFailureLines.optional() }).strict())
        .min(1)
        .max(10_000)
        .optional(),
      // A PLUGIN-ONLY CHANGE, on plan VlQueUhVQQmi, in wave 13x round 16. The plugin whose
      // own check, secret scan and privacy gate tested the entry in place of the office's suite, and whether the change
      // touches its manifest. The office takes it only when `aPluginOnlyChange` reads the same of the paths the integrate
      // step says the result changes on top of main (problem gy40yKomK_FQ).
      plugin: z.object({ id: z.string().min(1), manifest: z.boolean() }).strict().optional(),
    })
    .strict(),
  landing: z.object({ mainAt: z.string().min(1) }).strict(),
  'main-moved': z.object({ mainAt: z.string().min(1) }).strict(),
  'main-moved-while-testing': z.object({ mainAt: z.string().min(1) }).strict(),
  'moved-past-documents': z
    .object({ mainAt: z.string().min(1), result: z.string().min(1), documents: z.array(z.string().min(1)).min(1).max(1000), files: contentByPath })
    .strict(),
  landed: z.object({ mainAfter: z.string().min(1), says: z.string().optional(), pushFailure: z.string().min(1).optional(), earlyConflicts: z.array(z.object({entry:z.string().min(1),tip:z.string().min(1),files:somePaths.min(1),commit:z.string().min(1).optional(),lines:theConflictLines.optional(),mayRenumber:z.literal(true).optional(),rebaseStopped:theRebaseStoppedEarly.optional()}).strict()).max(1000).optional() }).strict(),
  // THE SANDBOX LAUNCHER'S OWN SENTENCE when it refused with exit 75, in wave 13p round 19.
  'no-room-to-test': z.object({ says: z.string().min(1).max(2000) }).strict(),
  'no-room-to-integrate': z.object({ says: z.string().min(1).max(2000) }).strict(),
  // FILES RED ON MAIN ALONE, with the main they were run on and each one's log, and the failure lines of that log,
  // which the problem keeps (13u round 180), at item 4.
  'red-on-main': z
    .object({ mainAt: z.string().min(1), files: z.array(z.object({ file: z.string().min(1), log: z.string().min(1).optional(), failureLines: aFailureLines.optional() }).strict()).min(1).max(200) })
    .strict(),
  // THE MERGE TOOL'S CHECK OF A RESOLUTION (XHY2fVFG3Qq8, answer 1): the commit it checked, and either the ref it
  // pointed at that commit with the places, or the sentence that refuses it.
  'resolution-checked': z.discriminatedUnion('ok', [
    z
      .object({
        commit: z.string().min(1),
        ok: z.literal(true),
        ref: z.string().min(1),
        places: z.array(aResolvedPlace).max(HOW_MUCH_A_RESOLUTION_CHECK_REPORTS.places),
        morePlaces: z.number().int().positive().optional(),
        // A FIX OF RED TESTS (13u round 63) resolves no place: the check names the files the fix changes on top of its
        // replay of the entry's own commits.
        fixed: z.array(z.string().min(1).max(4096)).min(1).max(HOW_MUCH_A_RESOLUTION_CHECK_REPORTS.fixed).optional(),
      })
      .strict(),
    z.object({ commit: z.string().min(1), ok: z.literal(false), says: z.string().min(1).max(HOW_MUCH_A_RESOLUTION_CHECK_REPORTS.says) }).strict(),
  ]),
  // THE MERGER LOOKS AT AN ENTRY THAT WAITS FOR A FIX ROUND (13u round 90). It carries nothing: the office reads the
  // round from its own records.
  'fix-round-looked': z.object({}).strict(),
} as const satisfies { readonly [S in MergeStep]: z.ZodType }
type FactsOf<S extends MergeStep> = z.infer<(typeof THE_FACTS_OF)[S]>

/** The zod message, in a sentence. The same shape lib/http.ts `explain` gives a door. */
function explainTheFacts(error: z.ZodError): string {
  return error.issues.map((one) => `${one.path.length === 0 ? 'facts' : one.path.join('.')}: ${one.message}`).join('; ')
}

/**
 * The step door's reading of a step's facts, and its refusal. Exported so a test reads the door's own words for a key it
 * does not declare, which the merge tool knows by (theStepDoorDoesNotKnowTheKey in tools/merge-tool/commit-addresses.mjs).
 */
export function parseTheFacts<S extends MergeStep>(step: S, facts: unknown, accepts?: (value: FactsOf<S>) => boolean): FactsOf<S> {
  const declared: z.ZodType = THE_FACTS_OF[step]
  const schema = accepts === undefined ? declared : declared.refine(value => accepts(value as FactsOf<S>), 'Original build, complete affected tests and whole-suite red must name this exact integrated entry tree.')
  const result = schema.safeParse(facts)
  if (result.success) return result.data as FactsOf<S>
  throw new PanelError(`The facts of the step "${step}" cannot be read: ${explainTheFacts(result.error)}. Nothing was written.`, 422)
}

// ============================================================================ what the entry holds

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A stored content-by-path map, or an empty one; a value that is not a string is this file being wrong. */
export function contentHeld(value: unknown, what: string, id: string): ContentByPath {
  if (value === undefined) return {}
  if (!isObject(value)) throw new Error(`Merge entry ${id} does not hold what the state machine writes: ${what} is not an object.`)
  for (const [path, hash] of Object.entries(value)) {
    if (typeof hash !== 'string') throw new Error(`Merge entry ${id} does not hold what the state machine writes: ${what}[${path}] is not a hash.`)
  }
  return value as ContentByPath
}

/** What main's record says the suite reads, as the tool read it when it integrated the entry. */
interface ReadsOnMain { tree: string; files: number; folders: number; record: string }
/** The line files whose verdict held by line at the integrate step (decision HV60rcgJlfDH), each with its own lines there. */
interface KeptByLine { files: { path: string; ranges: string }[]; says: string }
export interface Integration { result: string; mainAt: string; clone?: string; files: ContentByPath; at: string; reads?: ReadsOnMain; lines?: LinesOfAFile[]; keptByLine?: KeptByLine; ownerContent?: OwnerContentReminders; placeholderCommits?: PlaceholderCommits }
export interface Reinspection { run: string; only: string[]; needsJudgment: PathThatNeedsJudgment[]; askedAt: string; says: string }
export interface Reinspected { run: string; only: string[]; needsJudgment: string[]; releasedAt: string }
/** What the pair's suite decided for the other entry, and the tree that holds for. */
interface ForTheOther { tree: string; green: boolean; build?: { passed: boolean }; redTests?: string[]; says: string }
/** The entry this one was tested with in one suite, on the pair's tree (item 4, as above). */
export interface TestedWith { entry: string; tree: string; forTheOther?: ForTheOther; collision?: string[]; bus?: { entry: string; forTheOther?: ForTheOther }[]; passedForACheck?: string[]; passedAlone?: string[] }
/** The entry whose pair suite this entry's result was borrowed from, by the same tree. */
interface BorrowedFrom { entry: string; tree: string }
/** How fast the office answered its health while a suite ran: the counts, the median and the slowest, in milliseconds. */
interface OfficeHealth { samples: number; answered: number; unanswered: number; medianMs: number | null; maxMs: number | null; over10s: number; everySeconds: number; load1Median?: number; load1Max?: number; availableMemoryMiBMedian?: number; availableMemoryMiBLowest?: number; cpus?: number; memoryMiB?: number }
/** One run of a test file on a Modal VM. */
interface ModalRun { commit: string; log: string; report: string }
/** A file red here that a second opinion on Modal cleared, with every run that decided it. */
interface LoadTimeout { file: string; mainAt: string; here: { entryLog?: string; mainLog?: string }; modal: { entry: ModalRun; main?: ModalRun } }
interface RelatedOnly { files: number; related: number; every: number; leftOutSlow: { file: string; seconds: number }[]; says: string }
interface WholeSuiteBecause { case: number; paths?: string[]; says: string }
export interface Tested { relatedOnly?: RelatedOnly; wholeSuiteBecause?: WholeSuiteBecause[]; green: boolean; redTests?: string[]; log: string; tip?: string; ran?: number; passed?: number; says?: string; officeHealth?: OfficeHealth; at: string; time?: ClockStamp; testedWith?: TestedWith; borrowedFrom?: BorrowedFrom; loadTimeouts?: LoadTimeout[]; plugin?: APluginOnlyChange; wholeSuiteRed?: WholeSuiteRed; busCause?: BusCause; houseRules?: HouseRulesDecision; mergeClass?: MergeClassDecision | WideRedDecision; build?: { passed: boolean }; repair?: RepairFact }

/** Read the exact integrated git object. Missing evidence or an unavailable tree never authorizes red. */
function originalRedEvidenceMatches(entry: MergeEntryReading, integration: Integration | null, tested: unknown): boolean {
  if (entry.changeset.adapter !== 'git' || integration === null || entry.machine?.['documents'] !== undefined) return false
  try {
    const tree = readGit(integration.clone ?? entry.changeset.root, ['rev-parse', '--verify', `${integration.result}^{tree}`]).toString('utf8').trim()
    return wholeSuiteRedAuthorizesLanding(tested, integration.result, tree)
  } catch { return false }
}
export interface Deletes { paths: string[]; asked: string | null; confirmed?: { by: ParticipantRef; at: string; because: string } }
/**
 * The press a git entry touching a path of LANDS_AFTER_A_PRESS needs, in part 4. It is who was
 * asked, and the press. `leftOut` is there once the pin compared the seal's paths with main's content: the paths main already had
 * with the same content at `mainAt`, which need no press. `paths` is then what differs, and may be empty.
 */
export interface Press { paths: string[]; asked: string | null; pressed?: { by: ParticipantRef; at: string; because: string }; leftOut?: { mainAt: string; paths: string[] } }
/**
 * `time` is the clock observation beside `at`: the release's own, or the office's for a verdict by rule. The merge tool
 * counts a bus's wait from it. Absent on a verdict copied from a release written before a release stored one.
 */
export interface Verdict { run: string; by: ParticipantRef; at: string; time?: ClockStamp; how: string; message: string | null }
/**
 * The merge tool runs that ended on this arrival without moving the entry. See `whatFollowsARunThatEnded`.
 * `asked` is who asked the office to try a stalled landing again, when and why, and the main it found then
 * (`askAStalledLandingAgain`).
 */
export interface Stalls { runs: number; says: string; secretary?: string | null; asked?: { by: ParticipantRef; at: string; because: string; mainAt: string } }

/** The fields this file owns, read strictly off the record. */
interface MachineFields {
  judged: ContentByPath | null
  handedOn: ContentByPath
  verdict: Verdict | null
  integration: Integration | null
  reinspection: Reinspection | null
  reinspected: Reinspected[]
  tested: Tested | null
  attempts: number
  stalls: Stalls | null
  deletes: Deletes | null
  pressToLand: Press | null
  resolving: Resolving | null
  resolution: Resolution | null
  waitsForAFixRound: WaitsForAFixRound | null
}

function machineFieldsOf(record: PanelRecord): MachineFields {
  const data = record.data
  const object = <T>(key: string): T | null => (isObject(data[key]) ? (data[key] as unknown as T) : null)
  return {
    judged: data['judged'] === undefined ? null : contentHeld(data['judged'], 'judged', record.id),
    handedOn: contentHeld(data['handedOn'], 'handedOn', record.id),
    verdict: object<Verdict>('verdict'),
    integration: object<Integration>('integration'),
    reinspection: object<Reinspection>('reinspection'),
    reinspected: Array.isArray(data['reinspected']) ? (data['reinspected'] as Reinspected[]) : [],
    tested: object<Tested>('tested'),
    attempts: typeof data['attempts'] === 'number' ? data['attempts'] : 0,
    stalls: isObject(data['stalls']) && typeof data['stalls']['runs'] === 'number' ? (data['stalls'] as unknown as Stalls) : null,
    deletes: object<Deletes>('deletes'),
    pressToLand: object<Press>('pressToLand'),
    resolving: object<Resolving>('resolving'),
    resolution: object<Resolution>('resolution'),
    waitsForAFixRound: object<WaitsForAFixRound>('waitsForAFixRound'),
  }
}

/**
 * AN ENTRY WITHOUT WHAT THE QUEUE WRITES ON THE WAY INTO ITS STATE (2zvQX2PS0BNK). Nothing writes those fields
 * back to null, so no caller can mend this by waiting or asking again: the office's own record is broken. That is a
 * 500 with words, not a 409, which would blame the request, and not a bare "internal error", which tells nobody anything.
 */
function anEntryWithoutWhatItsStateHolds(id: string, state: MergeState, missing: readonly string[], lastWords = "The entry's record is broken, so nothing was written."): PanelError {
  const where = stateWord(state).text
  return new PanelError(`Merge entry ${id} is ${where} without ${andList(missing)}, which the merge queue writes before an entry can be ${where}. ${lastWords}`, 500)
}

/**
 * The seal the entry was submitted on, read off the seal's own record and checked against the hash the entry holds; or
 * the refusal that says why it cannot be used. The pin step counts that refusal, so it is made in this one place.
 */
function theSealOrItsRefusal(entry: MergeEntryReading): SealedTip | PanelError {
  const record = getRecord(entry.seal.id)
  const seal = record?.data['seal'] as SealedTip | undefined
  if (record?.kind !== 'sealed_tip' || seal === undefined) return new PanelError(`Merge entry ${entry.id} names seal ${entry.seal.id}, which is not a seal here.`, 409)
  if (seal.hash !== entry.seal.hash) return new PanelError(`Seal ${entry.seal.id} does not hash to what merge entry ${entry.id} holds, so the entry's content cannot be trusted.`, 409)
  return seal
}

/** The seal the entry was submitted on, or its refusal thrown. */
function theSealOf(entry: MergeEntryReading): SealedTip {
  const seal = theSealOrItsRefusal(entry)
  if (seal instanceof PanelError) throw seal
  return seal
}

/**
 * WHY THE RESULT OF A PLUGIN'S OWN CHECK CANNOT STAND FOR AN ENTRY, or null when it
 * can, on plan VlQueUhVQQmi. It can when the entry's integrated result is a change to that
 * plugin's folder and nothing
 * else, read by the one rule `aPluginOnlyChange`, and the result says the same of the plugin and of its manifest.
 *
 * THE PATHS ARE THE INTEGRATE STEP'S, on top of the main the entry was integrated on, because that is the tree the
 * plugin's check tested (problem gy40yKomK_FQ). The seal counts from its fork base, so when an earlier round of the same
 * branch lands after the seal, that round's files are in the seal and not in the tested result.
 */
function whyAPluginsCheckCannotStandFor(entry: MergeEntryReading, integration: Integration | null, plugin: APluginOnlyChange): string | null {
  if (integration === null) throw anEntryWithoutWhatItsStateHolds(entry.id, 'testing', ['its integration'])
  const change = aPluginOnlyChange(Object.keys(integration.files))
  if (change === null) {
    return `Merge entry ${entry.id} changes files outside one plugin's folder on top of main ${integration.mainAt}, so the office's suite tests it, and a plugin's own check cannot stand for it (plan VlQueUhVQQmi).`
  }
  if (change.id === plugin.id && change.manifest === plugin.manifest) return null
  const said = (one: APluginOnlyChange): string => `${PLUGINS_FOLDER}/${one.id} ${one.manifest ? 'and its manifest' : 'and not its manifest'}`
  return `Merge entry ${entry.id} changes ${said(change)} on top of main ${integration.mainAt}, and the result says it changes ${said(plugin)}.`
}

/** The content an entry submitted, path by path: the seal's files for git, the manifest's after-hashes for files. */
function theSubmittedContentOf(entry: MergeEntryReading): ContentByPath {
  if (entry.changeset.adapter === 'git') {
    const git = theSealOf(entry).git
    if (git === null) throw new PanelError(`Seal ${entry.seal.id} holds no git work, so merge entry ${entry.id} has no content to pin.`, 409)
    return Object.fromEntries(git.files.map((one) => [one.path, one.hash ?? ABSENT]))
  }
  return Object.fromEntries(entry.changeset.operations.map((one) => [one.path, one.after]))
}

/** The paths a files changeset deletes. The one place that question is answered. */
function theDeletesOf(changeset: FilesChangeset): string[] {
  return changeset.operations.filter((one) => one.op === 'delete').map((one) => one.path)
}

/** Whether an operation brings bytes of its own: an add, a modify, or a rename that changes them. The one place that is said. */
function bringsNewBytes(one: FileOperation): boolean {
  return one.op === 'add' || one.op === 'modify' || (one.op === 'rename' && one.after !== one.before)
}

/** Why an entry cannot be judged, and the paths that is about: the reason of a bounce as `unjudged`. */
interface Unjudged { paths: string[]; says: string }

/**
 * H_RELEASE FOR A FILES ENTRY: IT LANDS ONLY BYTES ITS SEAL FROZE. Sandbox v1 fix of the queue
 * (INTEGRATION.md section 7, issue 4).
 *
 * A files entry's `judged` is its manifest's after-hashes, and the release it rests on names the run's
 * seal. Nothing tied the two together, so a staged folder outside the sealed tree, or a file changed
 * after the seal, would land bytes no inspector read. So every operation that brings new bytes must name
 * an after-hash that `seal.git.files` holds: the sha256 of a file the run committed, which is what a
 * release of that seal read.
 *
 * FOR A GIT SEAL THE HASH IS COMPARED, NOT THE PATH. The staged folder may sit anywhere in the sealed
 * tree, and inside a sandbox the tree's own path is not the host's, so the seal's paths cannot be mapped
 * onto the manifest's. A delete brings no bytes; a rename that keeps its bytes moves what the main world
 * holds, which its before-hash guards. Null when every byte the entry brings is sealed.
 *
 * A FILES SEAL IS BOUND BY PATH, HASH AND MODE, because its paths ARE the landing
 * paths: see whatAFilesSealDoesNotHold.
 */
function whatTheSealDoesNotHold(entry: MergeEntryReading, changeset: FilesChangeset): Unjudged | null {
  const seal = theSealOf(entry)
  if (seal.kind === 'files') return whatAFilesSealDoesNotHold(entry, seal, changeset)
  const sealed = new Set((seal.git?.files ?? []).map((one) => one.hash).filter((hash): hash is string => hash !== null))
  const missing = changeset.operations.filter((one) => bringsNewBytes(one) && !sealed.has(one.after))
  if (missing.length === 0) return null
  const named = missing.map((one) => `${one.path} (sha256 ${one.after.slice(0, 12)}…)`).join(', ')
  return {
    paths: missing.map((one) => one.path),
    says:
      seal.git === null
        ? `Seal ${entry.seal.id} froze no files at all — it sealed records only — so no inspector's release of it read the bytes this entry lands at ${named}.`
        : `The bytes this entry lands at ${named} are not among the files seal ${entry.seal.id} froze, so no inspector's release of that seal read them. ` +
          "Commit the staged files in the run's own worktree before the run finishes, so that its seal holds them, and submit again.",
  }
}

/** Whether two absolute folders are one folder on this machine: by their real paths where both exist. */
function theSameFolder(a: string, b: string): boolean {
  try {
    return realpathSync(a) === realpathSync(b)
  } catch {
    return resolve(a) === resolve(b)
  }
}

/**
 * H_RELEASE FOR AN ENTRY ON A FILES SEAL: IT LANDS ONLY A SEALED FILE, AT ITS SEALED PATH, WITH ITS
 * SEALED BYTES AND MODE, IN THE FOLDER IT WAS SEALED TO LAND IN, option A.
 *
 * A files seal's paths are relative to the folder the run said its work lands in, and the check of that
 * seal read each file at its path — as an addition, or beside the file already landed there. So an
 * operation that lands sealed bytes at any other path, or in any other folder, lands something no check
 * read in that place, and one that lands them with another mode lands a file the check did not see
 * (acceptance finding 41). A rename moves a file from a path the check never read, so it cannot rest on
 * a files seal's check. A delete brings no bytes and waits for the secretary, as every delete does.
 * An entry may land fewer files than the seal holds: each one it lands was read.
 */
function whatAFilesSealDoesNotHold(entry: MergeEntryReading, seal: SealedTip, changeset: FilesChangeset): Unjudged | null {
  const sealed = seal.files
  if (!sealed) throw new PanelError(`Seal ${entry.seal.id} is a files seal and holds no files, so merge entry ${entry.id} has no content to pin.`, 409)
  const everyPath = changeset.operations.map((one) => one.path)
  if (!theSameFolder(sealed.root, changeset.root)) {
    return {
      paths: everyPath,
      says:
        `Seal ${entry.seal.id} froze files to land in ${sealed.root}, and this entry lands in ${changeset.root}, so no check of that seal read them where they would land. ` +
        'Submit it again with the root the run sealed.',
    }
  }
  const held = new Map(sealed.files.map((one) => [one.path, one]))
  const wrong: { path: string; why: string }[] = []
  for (const one of changeset.operations) {
    if (one.op === 'rename') {
      wrong.push({ path: one.path, why: `it is a rename from ${one.from ?? 'nowhere'}, a path the check of a files seal never read — submit an add and a delete, and the delete waits for the secretary` })
      continue
    }
    if (!bringsNewBytes(one)) continue
    const file = held.get(one.path)
    const mode = one.mode ?? '100644'
    if (file === undefined) wrong.push({ path: one.path, why: `seal ${entry.seal.id} froze no file at this path` })
    else if (file.hash !== one.after) wrong.push({ path: one.path, why: `seal ${entry.seal.id} froze sha256 ${(file.hash ?? ABSENT).slice(0, 12)}… here, and this entry lands ${one.after.slice(0, 12)}…` })
    else if (file.mode !== mode) wrong.push({ path: one.path, why: `seal ${entry.seal.id} froze it with mode ${file.mode}, and this entry lands it with ${one.mode === undefined ? '100644, because it names no mode' : mode}` })
  }
  if (wrong.length === 0) return null
  return {
    paths: wrong.map((one) => one.path),
    says: `${wrong.map((one) => `${one.path}: ${one.why}`).join('; ')}. So no inspector's release of that seal read what this entry lands. Submit it again naming each sealed file at its sealed path, hash and mode.`,
  }
}

/**
 * THE BEFORE A RELEASE OF A FILES SEAL READ, HELD TO WHAT THE ENTRY REPLACES, by a decision and a review of
 * it. The check of a files seal copies whatever is landed at each sealed path and shows
 * it beside the new file, and its release names the sha256 of each such file in `read.before`. A modify must
 * replace exactly that file, and an add must land where the check saw nothing, or the release does not cover
 * the text the entry replaces. Null when every operation agrees with what the check read.
 */
function whatTheReleaseDidNotReadBefore(entry: MergeEntryReading, before: Record<string, string>): Unjudged | null {
  if (entry.changeset.adapter !== 'files') return null
  const wrong: { path: string; why: string }[] = []
  for (const one of entry.changeset.operations) {
    const saw = before[one.path]
    if (one.op === 'modify' && saw === undefined) wrong.push({ path: one.path, why: 'the check saw no file landed here, so it read no text this modify replaces' })
    else if (one.op === 'modify' && saw !== one.before) wrong.push({ path: one.path, why: `the check read the landed file at sha256 ${saw!.slice(0, 12)}…, and this modify replaces ${one.before.slice(0, 12)}…` })
    else if (one.op === 'add' && saw !== undefined) wrong.push({ path: one.path, why: `the check saw a file landed here (sha256 ${saw.slice(0, 12)}…), and this add says nothing is` })
  }
  if (wrong.length === 0) return null
  return {
    paths: wrong.map((one) => one.path),
    says:
      `${wrong.map((one) => `${one.path}: ${one.why}`).join('; ')}. So the release does not cover what this entry replaces. ` +
      'If the landed file changed after the check, the run has to be finished and checked again against it.',
  }
}

/**
 * THE PATHS A RELEASE OF A FILES SEAL JUDGED, each with a line of the model's own. A2 says "named must mean
 * judged": a path counts only when the release was told about it, in `read.needsJudgment`, and answered it,
 * in `judged`, with words. A release that repeats the list back without a line covers
 * nothing.
 */
function whatTheReleaseJudged(release: Release | null | undefined): Set<string> {
  if (release === null || release === undefined) return new Set()
  const told = new Set((release.read?.needsJudgment ?? []).map((one) => one.path))
  return new Set((release.judged ?? []).filter((one) => told.has(one.path) && one.concluded.trim() !== '').map((one) => one.path))
}

/**
 * THE CHECKER'S REPORT AS THE PIN STORED IT on the entry (`checked`), read back through the same shape
 * the step door takes, or undefined because there is none or it is not readable. The integrate step
 * writes its own report over it later, and asks its own question of it there.
 */
function theCheckerReportOf(entry: MergeEntryReading): CheckerReport | undefined {
  const held = getRecord(entry.id)?.data['checked']
  if (!isObject(held)) return undefined
  const read = aCheckerReport.safeParse({ decided: held['decided'] ?? [], needsJudgment: held['needsJudgment'] ?? [] })
  return read.success ? read.data : undefined
}

/** The release of the run that submitted this entry, as the run holds it, or null. */
/**
 * WHY A RESULT BORROWED FROM A PAIR'S SUITE IS NOT TAKEN, or null when it is (item 4, message VnYjaMjoYJxK): the
 * entry it names ran the suite in this lane, names this entry, decided something for it on exactly the tree this entry
 * now is, and decided what this entry reports. Borrowing only by the same tree is the lock: nothing is borrowed across
 * a moved main.
 */
function whyABorrowedResultIsRefused(entry: MergeEntryReading, facts: FactsOf<'tested'>): string | null {
  const from = facts.borrowedFrom!
  const record = getRecord(from.entry)
  if (record === null || record.workspaceId !== entry.workspaceId || record.kind !== MERGE_ENTRY_KIND) return `Merge entry ${from.entry} is not a merge entry in this project.`
  const other = readMergeEntry(record)
  if (other.lane !== entry.lane) return `Merge entry ${from.entry} lands in ${other.lane}, not in this entry's lane ${entry.lane}.`
  const theirs = machineFieldsOf(record).tested?.testedWith
  // IN A BUS, THIS ENTRY'S PLACE IN IT; in a pair's facts, the one other entry.
  const mine = theirs === undefined ? undefined : (theirs.bus ?? [{ entry: theirs.entry, ...(theirs.forTheOther === undefined ? {} : { forTheOther: theirs.forTheOther }) }]).find((one) => one.entry === entry.id)
  if (mine === undefined) return `Merge entry ${from.entry} did not test merge entry ${entry.id} in its suite.`
  const decided = mine.forTheOther
  if (decided === undefined) return `The suite merge entry ${from.entry} ran with this one decided nothing for it, so it runs its own.`
  if (decided.tree !== from.tree) return `That suite's result for this entry holds on tree ${decided.tree.slice(0, 12)}, and this entry is tree ${from.tree.slice(0, 12)}.`
  if (decided.build?.passed !== facts.build?.passed) return 'The borrowed build fact differs from what the shared suite recorded for this entry.'
  if (decided.green !== facts.green) return `That suite found this entry ${decided.green ? 'green' : 'red'}, and the tool reports it ${facts.green ? 'green' : 'red'}.`
  const said = [...(decided.redTests ?? [])].sort().join(', ')
  const reported = [...(facts.redTests ?? [])].sort().join(', ')
  if (!facts.green && said !== reported) return `That suite found ${said} red for this entry, and the tool reports ${reported}.`
  return null
}

/**
 * WHY A MOVE OF MAIN IS NOT ONE MADE ONLY BY DOCUMENTATION LANDINGS, or null when it is: each named entry is a
 * merged documentation entry of this repository, and their receipts join `from` to `to`, one after
 * another.
 */
function whyTheMoveIsNotOnlyDocuments(entry: MergeEntryReading, from: string, to: string, documents: readonly string[]): string | null {
  let at = from
  for (const one of documents) {
    const record = getRecord(one)
    if (record === null || record.kind !== MERGE_ENTRY_KIND) return `${one} is not a merge entry.`
    const reading = readMergeEntry(record)
    if (reading.changeset.root !== entry.changeset.root) return `Merge entry ${one} lands in ${reading.changeset.root}, not in ${entry.changeset.root}.`
    if (reading.state !== 'merged' || record.data['documents'] === undefined) return `Merge entry ${one} is not a merged documentation entry.`
    const receipt = record.data['integrated'] as IntegrationReceipt | undefined
    if (receipt === undefined || receipt.mainBefore !== at) return `Merge entry ${one} did not land on ${at.slice(0, 12)}, so its landing does not follow from the main this entry was integrated on.`
    at = receipt.mainAfter
  }
  return at === to ? null : `The documentation landings named end at ${at.slice(0, 12)}, not at the main ${to.slice(0, 12)} the entry is put on.`
}

function theReleaseOfTheRun(entry: MergeEntryReading): Release | null {
  const run = getRecord(entry.run)
  return run === null ? null : howARunStands(run.data).released
}

/** How many paths a sentence names before it counts the rest; every path is still on the bounce. */
const PATHS_NAMED_IN_A_SENTENCE = 10

/** Paths as a sentence names them: the first few, and how many more. */
function pathsInASentence(paths: readonly string[]): string {
  const named = paths.slice(0, PATHS_NAMED_IN_A_SENTENCE).join(', ')
  return paths.length > PATHS_NAMED_IN_A_SENTENCE ? `${named} and ${String(paths.length - PATHS_NAMED_IN_A_SENTENCE)} more` : named
}

/**
 * WHAT OF A FILES ENTRY WOULD LAND OUTSIDE ITS AGENT'S FILES AREA, read on real locations, or null when every path it
 * touches lands inside. Acceptance finding 52, on the design the secretary and another agent approved on 23 September 2026: asked
 * when the entry is integrated and again when the merge tool asks to land, so a link repointed after the check is
 * caught before a byte is written. A folder of the area that moved since it was registered refuses every path, and
 * its new location is never followed. The one rule of src/config/files-area.mjs, which the check reads too.
 */
function whatLandsOutsideItsFilesArea(entry: MergeEntryReading): { files: string[]; says: string } | null {
  if (entry.changeset.adapter !== 'files') return null
  const { root, operations } = entry.changeset
  const paths = [...new Set(operations.flatMap((one) => [one.path, ...(one.from === undefined ? [] : [one.from])]))].sort()
  const run = getRecord(entry.run)
  const agent = run === null ? null : theAgentOfARun(run)
  const area = agent === null || run === null ? null : theFilesAreaOf(agent.id, run.workspaceId)
  const whose = agent === null ? 'The run names no agent it serves, so it has no files area' : `The run's agent ${agent.handle} has no files area in this project`
  if (area === null || area.length === 0) {
    return {
      files: paths,
      says:
        `${whose}, and no file of a files entry lands outside one: ${pathsInASentence(paths)}. The owner, the agent's starter or a secretary ` +
        'registers one with POST /api/participants/agent/<handle>/files-area, saying why (acceptance finding 52).',
    }
  }
  const [moved] = theFoldersThatMoved(area)
  if (moved !== undefined) {
    return {
      files: paths,
      says:
        `The files area ${moved.written} resolved to ${moved.resolved} when it was registered and resolves to ${moved.now ?? 'nothing'} now, ` +
        'so no file of this entry lands until somebody registers it again; the new location is never followed (acceptance finding 52).',
    }
  }
  const outside = paths.map((path) => ({ path, read: insideTheFilesArea(root, path, area) })).filter((one) => !one.read.inside)
  if (outside.length === 0) return null
  return {
    files: outside.map((one) => one.path),
    says:
      `${String(outside.length)} of the ${String(paths.length)} paths this entry touches ${outside.length === 1 ? 'lands' : 'land'} outside the files area of ${agent!.handle} ` +
      `(${area.map((folder) => folder.resolved).join(', ')}), read on real locations with every link followed: ` +
      `${outside.slice(0, PATHS_NAMED_IN_A_SENTENCE).map((one) => one.read.says).join(' ')}${outside.length > PATHS_NAMED_IN_A_SENTENCE ? ` And ${String(outside.length - PATHS_NAMED_IN_A_SENTENCE)} more.` : ''} Nothing of it was written (acceptance finding 52).`,
  }
}

/**
 * THE PATHS AMONG THESE THAT THE CHECKER DECIDED ARE PROTECTED OR GENERATED. The files checker records
 * that as a fact, `protected` or `generated`, beside handing the path on, so this is read from its
 * decisions and never from its sentences.
 */
function theGuardedAmong(checker: CheckerReport | undefined, paths: readonly string[]): string[] {
  const guarded = new Set((checker?.decided ?? []).filter((one) => one.ok && (one.check === 'protected' || one.check === 'generated')).map((one) => one.path))
  return paths.filter((path) => guarded.has(path))
}

/**
 * A PROTECTED OR GENERATED PATH NEVER LANDS ON A MODEL'S RELEASE ALONE (condition 4 for A2),
 * however well the release judged it. Such a path goes through git, where the rules for protected
 * paths apply, or the person lands it.
 */
function neverOnAReleaseAlone(paths: readonly string[]): Unjudged {
  return {
    paths: [...paths],
    says:
      `${paths.join(', ')} ${paths.length === 1 ? 'is' : 'are'} in a protected area or written by a generator, and a files ` +
      "entry never lands such a path on a model's release alone. Carry it through git, " +
      'where the rules for protected paths apply, or ask the person.',
  }
}

/**
 * THE PATHS A CHECKER HANDED ON THAT ARE THE INSPECTOR'S TO READ: every one, except a files entry's
 * deletes. A delete in a files entry is the secretary's to confirm, not the inspector's to judge: the
 * checker hands every delete on, and the confirm door answers it, once, rather than a check that cannot read a
 * staged folder.
 */
function whatTheInspectorIsHandedOn(entry: MergeEntryReading, checker: CheckerReport | undefined): PathThatNeedsJudgment[] {
  const deletes = entry.changeset.adapter === 'files' ? new Set(theDeletesOf(entry.changeset)) : new Set<string>()
  return (checker?.needsJudgment ?? []).filter((one) => !deletes.has(one.path))
}

/**
 * NO CHECK CAN READ A FILES ENTRY YET: the inspector's tool reads git trees only (piece P7's open issue,
 * left for P12). So a path of a files entry that needs an inspector's reading — handed on by the files
 * checker, or changed since the verdict — can never be judged, and the entry is bounced as `unjudged`
 * with that said, rather than waiting in its lane for a check nobody can make. Sandbox v1 fix of the
 * queue (INTEGRATION.md section 7, issue 5). Asked at the pin and again at the integrate step.
 */
function noCheckCanReadIt(paths: PathThatNeedsJudgment[], onAFilesSeal = false): Unjudged {
  return {
    paths: paths.map((one) => one.path),
    says:
      `${paths.map((one) => `${one.path} needs an inspector's reading (${one.why})`).join('; ')}. ` +
      (onAFilesSeal
        ? "The release of this entry's run does not name it, with a line of the model's own in `judged`, among the files it was handed to judge, so nothing covers what the checker could not decide. Check the run again so that its release judges it. "
        : "No check can read a files entry yet — the inspector's tool reads git trees only — so the queue cannot get a verdict on it. ") +
      'Submit it again once the files checker decides it rather than handing it on — for example as a byte-for-byte copy of an absolute `source` file, ' +
      'or in a type the checker reads to the end — or carry it through git.',
  }
}

/**
 * A PATH OF A FILES ENTRY WHOSE CONTENT CHANGED AFTER ITS VERDICT: the integrate step reports another hash
 * than the release read. Nothing was handed on for it, so the bounce says what did happen: a files entry
 * is not checked again, and nothing covers content the release did not read.
 */
function itsContentChanged(paths: readonly string[]): Unjudged {
  return {
    paths: [...paths],
    says:
      `${paths.join(', ')}: the content the integrate step reports is not what the release read, and a files entry is not ` +
      `checked again, so nothing covers ${paths.length === 1 ? 'it' : 'them'}. Submit the run again on the content that is there.`,
  }
}

/** Every difference between two content maps, in words a person can act on. Empty when they agree. */
function whereTheyDiffer(expected: ContentByPath, found: ContentByPath, inAMessage = false): string[] {
  // IN A MESSAGE, A HASH IS SAID IN ITS FIRST 12 CHARACTERS, as the other bounce sentences say it (message
  // bDovnimMAmvu). The full value stays in the log.
  const said = (value: unknown) => (inAMessage && String(value).length > 12 ? `${String(value).slice(0, 12)}…` : String(value))
  const out: string[] = []
  for (const path of Object.keys(expected).sort()) {
    if (!Object.hasOwn(found, path)) out.push(`${path} is missing`)
    else if (found[path] !== expected[path]) out.push(`${path} is ${said(found[path])}, not ${said(expected[path])}`)
  }
  for (const path of Object.keys(found).sort()) if (!Object.hasOwn(expected, path)) out.push(`${path} is not in the submission`)
  return out
}

/** One write of the state machine's own fields, with no state move. */
function write(id: string, dataPatch: Record<string, unknown>, actor: Actor, onNothingWritten?: () => void): PanelRecord {
  const result = asTheMergeQueue(() => patchRecord(id, { dataPatch }, actor))
  if (result.nothingWritten) onNothingWritten?.()
  return result.record
}

// ============================================================================ H_RELEASE: what the verdict covers

/** What the office finds when it asks whether a verdict covers an entry's content. */
interface Coverage {
  outcome: 'covers' | 'refused' | 'waiting' | 'unjudged'
  says: string
  /** On `unjudged`: the paths the release does not cover. */
  paths?: string[]
  /** On `unjudged`: set when the release of a files seal does not cover them, which is counted where the entry is sent back. */
  ofAFilesSeal?: true
  /** On `covers`: the release, and the content it read. */
  release?: Release
  /** On `covers` with no release: the rule it rested on, as the verdict's `how`. */
  rule?: string
  run?: string
  /** On `refused`: what the refusal said is missing. */
  missing?: string[]
}

/** What a verdict of the secretary's rule says it rested on, as `how`: the rule and its decision, never a release. */
const THE_SECRETARYS_RULE =
  "the secretary's rule: a secretary's design/-only entry, on a run the office filed and sealed itself, is merged with no inspector's release"

/** What a take-back's verdict says it rested on, as `how`: the take-back rule, never a release. */
const THE_TAKE_BACK_RULE =
  "the take-back rule: an exact take-back of a landing, which the office filed and sealed itself, lands with no inspector's release"

/** What a verdict of the review level says it rested on, as `how`: the level and what happened at it, never a release. */
function theReviewLevelsRule(level: 'none' | 'light', what: string): string {
  return `the review level ${REVIEW_LEVEL_WORDS[level]}, at which ${what}, and the merge queue's own tests decide the entry`
}

/**
 * WHETHER AN ENTRY IS A SECRETARY'S design/-ONLY ENTRY, which its own rule covers in place
 * of a release. `theOfficeFiledThisRunForASecretarysEntry` in ./the-offices-secretary-run.ts is the one reading of
 * it: the office filed the entry's run with the purpose `secretary-documents`, the run still says it, the entry's
 * seal is the run's seal, and every path that seal froze is under design/. A seal that is not one, or does not
 * hash to what the entry holds, is refused by `theSealOf`.
 * Only `submitASecretarysDesignEntry` in ./merge-queue.ts files such a run.
 */
function isASecretarysDesignEntry(entry: MergeEntryReading, run: PanelRecord | null = getRecord(entry.run)): boolean {
  return theOfficeFiledThisRunForASecretarysEntry(sqlite, run, entry.seal.id, () => {
    const git = theSealOf(entry).git
    return git === null ? null : git.files.map((one) => one.path)
  })
}

/** A take-back's provenance and seal are checked by the same narrow reader as submission. */
function isATakeBack(entry: MergeEntryReading, run: PanelRecord | null = getRecord(entry.run)): boolean {
  return entry.takeBackOf !== undefined && entry.fixRound?.kind === 'takeout' && entry.fixRound.problem === entry.takeBackOf.problem && run !== null && run.data['sealedTip'] === entry.seal.id && officeTakeBackRun(run, entry.takeBackOf.problem)
}

/**
 * WHAT THE REPORT OF AN ENTRY'S RUN LACKS, read at the pin, in part 1, or null when nothing is missing or the entry is
 * not read for it. It costs no tokens: the run's records, its tool_uses rows and the commits the
 * seal froze (`whatTheReportOfARunLacks`).
 *
 * NOT READ: a secretary's design/-only entry, whose run the office filed and nobody reports on; a run released or closed
 * unchecked; and a run whose check has started already (`execution` on the check the office asked for), because the
 * gate is there to spend no tokens on a report that is not ready, and those tokens are spent.
 */
function whatTheReportOfThisEntryLacks(entry: MergeEntryReading): WhatTheReportLacks | null {
  const run = getRecord(entry.run)
  if (run === null || run.deletedAt !== null) return null
  if (isASecretarysDesignEntry(entry, run) || isATakeBack(entry, run)) return null
  const stands = howARunStands(run.data)
  if (stands.released !== null || stands.closedUnchecked !== null) return null
  if (theCheckAskedFor(run)?.execution !== undefined) return null
  const found = whatTheReportOfARunLacks(run, theSealOf(entry).git)
  return found.lacks.length === 0 ? null : found
}

/** Whether a release checked this way is one the merge queue merges on: an inspector's, or a standard change's. */
function aReleaseTheQueueMergesOn(how: string): boolean {
  return how === 'an inspector' || how === 'the standard-change rule'
}

/**
 * H_RELEASE ON THE PINNED CONTENT. A release of the submitting run that names this entry's seal,
 * its hash and its exact tip covers the content the seal froze, when an inspector wrote it or the
 * standard-change rule did. A secretary's design/-only entry and an exact take-back are covered by
 * their own rules instead (`isASecretarysDesignEntry`, `isATakeBack`). Anything else is said in
 * words, and the entry waits or bounces. The merge entry's rule H_RELEASE in src/shared/kinds.ts
 * says the same to whoever reads the kind.
 */
function theVerdictOnThePinnedContent(entry: MergeEntryReading): Coverage {
  const run = getRecord(entry.run)
  if (run === null || run.deletedAt !== null) {
    return { outcome: 'waiting', says: `Run ${entry.run}, which submitted this entry, is ${run === null ? 'not here' : 'deleted'}, so nothing can release it. Withdraw the entry, or restore the run.` }
  }
  if (howARunStands(run.data).closedUnchecked !== null) return { outcome: 'waiting', says: `Run ${run.id} was closed unchecked, so it cannot supply a verdict for this entry.` }
  if (isATakeBack(entry, run)) return { outcome: 'covers', says: 'The office filed and sealed the exact take-back; its rule asks no inspector to read it.', run: entry.run, rule: THE_TAKE_BACK_RULE }
  if (isASecretarysDesignEntry(entry, run)) {
    return {
      outcome: 'covers',
      says: `The secretary's rule covers seal ${entry.seal.id}: the office filed run ${entry.run} for a secretary's design/-only entry and sealed it, and no inspector reads such an entry.`,
      run: entry.run,
      rule: THE_SECRETARYS_RULE,
    }
  }
  const stands = howARunStands(run.data)
  if (stands.released === null) {
    if (stands.refused !== null && (stands.refused.reworked ?? null) === null) {
      return { outcome: 'refused', says: `The check refused to release run ${entry.run}: ${stands.refused.missing.join(' ')}`, run: entry.run, missing: [...stands.refused.missing] }
    }
    // BELOW FULL THE PROJECT'S REVIEW LEVEL COVERS AN UNRELEASED RUN, read now and not at the seal: at None at once, and
    // at Light once the secretary confirmed the run. No inspector reads it, and the queue's own tests decide the entry.
    const level = theReviewLevel(run.workspaceId)
    if (level === 'none') {
      const rule = theReviewLevelsRule(level, `no inspector read run ${entry.run}`)
      return { outcome: 'covers', says: `Covered by ${rule}.`, run: entry.run, rule }
    }
    if (level === 'light') {
      const confirmed = stands.confirmed
      if (confirmed === null) {
        return {
          outcome: 'waiting',
          says: `${stands.says} This project's review level is ${REVIEW_LEVEL_WORDS[level]}, so no inspector reads run ${entry.run}, and the entry waits for the secretary's confirmation of that run.`,
        }
      }
      const rule = theReviewLevelsRule(level, `${participantWord(confirmed.by.kind)} ${confirmed.by.id} confirmed run ${entry.run} at ${confirmed.at}, no inspector read it`)
      return { outcome: 'covers', says: `Covered by ${rule}.`, run: entry.run, rule }
    }
    const noInspector = noInspectorWasAskedToCheck(entry.run, theCheckAskedFor(run))
    return { outcome: 'waiting', says: noInspector === null ? stands.says : `${stands.says} ${noInspector[0]!.toUpperCase()}${noInspector.slice(1)}.` }
  }
  const release = stands.released
  // A STANDARD CHANGE'S RELEASE IS JUDGED AS AN INSPECTOR'S IS (wave 13r round F): it names the seal and the tip the
  // same way, and only the inspector step was skipped. A starter's own release is still not enough.
  if (!aReleaseTheQueueMergesOn(release.how)) {
    return {
      outcome: 'waiting',
      says:
        `Run ${entry.run} was released by ${participantWord(release.by.kind)} ${release.by.id}, checked by ${release.how}. ` +
        "The merge queue merges only on an inspector's release or a standard change's, so this entry cannot be judged on it.",
    }
  }
  const read = release.read ?? null
  if (read === null) return { outcome: 'waiting', says: `The release of run ${entry.run} does not say which seal it read, so it cannot be matched to this entry's content.` }
  if (read.only !== undefined) {
    return { outcome: 'waiting', says: `The release of run ${entry.run} is a scoped one, covering ${read.only.join(', ')} and nothing else. This entry needs a verdict on the whole submission.` }
  }
  // THE RELEASE NAMES THE ENTRY'S SEAL as it is, or as it was before migration 0154 re-hashed it
  // (`howAReleaseNamesThisSeal`); and the entry was submitted on the seal as it is.
  const sealed = getRecord(entry.seal.id)?.data['seal'] as Pick<SealedTip, 'hash' | 'reduced'> | undefined
  const theSeal = sealed !== undefined && sealed.hash === entry.seal.hash ? sealed : { hash: entry.seal.hash }
  if (howAReleaseNamesThisSeal(read, entry.seal.id, theSeal) === null) {
    return {
      outcome: 'waiting',
      says:
        `The release of run ${entry.run} read seal ${read.sealId ?? 'nobody said'}, and this entry was submitted on seal ${entry.seal.id}, so the verdict is not on this content. ` +
        'If the run finished again after the check, submit the run again; if it was submitted after the check, ask for the check again.',
    }
  }
  if (entry.changeset.adapter === 'git' && read.tip !== entry.changeset.commit) {
    return { outcome: 'waiting', says: `The release of run ${entry.run} read the tip ${read.tip ?? 'nobody said'}, and this entry pins ${entry.changeset.commit}, so the verdict is not on this content.` }
  }
  // A RELEASE OF A FILES SEAL COVERS THE AFTER AND THE BEFORE. It is the release this run will ever have
  // (a run is released once), so a before it did not read is never covered by waiting: the entry bounces.
  if (theSealOf(entry).kind === 'files') {
    const unread = whatTheReleaseDidNotReadBefore(entry, read.before ?? {})
    if (unread !== null) return { outcome: 'unjudged', says: unread.says, paths: unread.paths, run: entry.run, ofAFilesSeal: true }
    // NAMED MUST MEAN JUDGED: every path the files checker handed on at the pin is covered only by a line.
    const judged = whatTheReleaseJudged(release)
    const handedOn = whatTheInspectorIsHandedOn(entry, theCheckerReportOf(entry)).map((one) => one.path)
    const unanswered = handedOn.filter((path) => !judged.has(path))
    if (unanswered.length > 0) {
      return {
        outcome: 'unjudged',
        says:
          `The files checker handed on ${unanswered.join(', ')}, and the release of run ${entry.run} does not name ${unanswered.length === 1 ? 'it' : 'them'} ` +
          'with a line of its own in `judged`, so it does not cover what the checker could not decide. The run has to be checked again with the list.',
        paths: unanswered,
        run: entry.run,
        ofAFilesSeal: true,
      }
    }
  }
  const asAStandardChange = release.standard === undefined ? '' : ` as a standard change of the kind ${release.standard.kind}, with no inspector,`
  return { outcome: 'covers', says: `The release of run ${entry.run}${asAStandardChange} by ${participantWord(release.by.kind)} ${release.by.id} at ${release.at} names seal ${entry.seal.id} and its exact content.`, release, run: entry.run }
}

/**
 * THE VERDICT ON A CHECK AGAIN. The scoped check's release must cover exactly the scope the queue
 * asked for, at the integrated tip, or it is not the verdict the entry is waiting for.
 */
function theVerdictOnTheReinspection(entry: MergeEntryReading, held: MachineFields, asked: Reinspection): Coverage {
  const run = getRecord(asked.run)
  if (run === null || run.deletedAt !== null) return { outcome: 'waiting', says: `The check-again run ${asked.run} is ${run === null ? 'not here' : 'deleted'}, so nothing can release it.` }
  const stands = howARunStands(run.data)
  if (stands.closedUnchecked !== null) return { outcome: 'waiting', says: `Run ${run.id} was closed unchecked, so it cannot supply a verdict for this entry.` }
  if (stands.released === null) {
    if (stands.refused !== null && (stands.refused.reworked ?? null) === null) {
      return { outcome: 'refused', says: `The scoped check of ${asked.only.join(', ')} refused to release: ${stands.refused.missing.join(' ')}`, run: asked.run, missing: [...stands.refused.missing] }
    }
    return { outcome: 'waiting', says: stands.says }
  }
  const release = stands.released
  const read = release.read ?? null
  const covered = new Set(read?.only ?? [])
  const missing = asked.only.filter((path) => !covered.has(path))
  if (read === null || read.only === undefined || missing.length > 0) {
    return {
      outcome: 'waiting',
      says:
        `The release of the check-again run ${asked.run} ${read?.only === undefined ? 'names no scope' : `covers ${read.only.join(', ')}`}, and the queue asked about ${asked.only.join(', ')}` +
        (missing.length === 0 ? '' : ` — ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not covered`) +
        '. It is not the verdict this entry waits for.',
    }
  }
  if (entry.changeset.adapter === 'git' && held.integration !== null && read.tip !== held.integration.result) {
    return { outcome: 'waiting', says: `The release of the check-again run ${asked.run} read the tip ${read.tip ?? 'nobody said'}, and the entry was integrated as ${held.integration.result}.` }
  }
  return { outcome: 'covers', says: `The scoped check of ${asked.only.join(', ')} released, by ${participantWord(release.by.kind)} ${release.by.id} at ${release.at}.`, release, run: asked.run }
}

// ============================================================================ telling people

/**
 * WHAT THE REFUSAL'S OWN LINE TO THE STARTER SAYS, carried in a bounce on that refusal. The bounce notice goes to the
 * starter, so the check door writes the starter no second message (`theStarterHearsTheRefusal` in ./inspection.ts),
 * and this keeps what that message said: who refused, and the group opened about it or why there is none.
 */
function theRefusalsOwnLine(entry: MergeEntryReading, refusedRun?: string): string {
  const run = getRecord(refusedRun ?? entry.run)
  const refused = run === null ? null : howARunStands(run.data).refused
  if (refused === null) return ''
  return `${aRefusalHappened(theNameAPersonReads(refused.by), theHandleOf(entry), refused.group ?? null)}\n\n`
}

/** The handle a line about this entry names: the agent of the run that submitted it, or the submitter. */
function theHandleOf(entry: MergeEntryReading): string {
  const run = getRecord(entry.run)
  return (run === null ? null : theAgentOfARun(run)?.handle) ?? entry.submittedBy.id
}

/**
 * WHICH PATHS THE ENTRY CHANGES, as the last integrate step or the submission said.
 *
 * ONE READING, TWO CALLERS, WHICH IS WHY IT IS EXPORTED. The queue's own line for the secretary says
 * how many files an entry carried, and a counter that follows landings takes the same number as its
 * amount (criterion CT2, decision `uLV_1NVD8jeV` point 4, which asks for one function so the
 * two cannot come to different answers). `howManyFiles` below is this list's length and nothing else.
 *
 * THE ORDER OF THE THREE SOURCES IS THE ORDER OF WHAT IS KNOWN. After an integrate step the tool has
 * said what really changed on top of the main world, path by path; before one, a files changeset
 * names its own operations and a git changeset has only what its seal froze. An entry none of the
 * three can answer for changes no path anybody has recorded, and the empty list says exactly that.
 */
export function theChangedPathsOfAMergeEntry(record: PanelRecord): string[] {
  const entry = readMergeEntry(record)
  const held = machineFieldsOf(record)
  if (held.integration !== null) return Object.keys(held.integration.files)
  if (entry.changeset.adapter === 'files') return entry.changeset.operations.map((operation) => operation.path)
  const git = getRecord(entry.seal.id)?.data['seal'] as SealedTip | undefined
  return (git?.git?.files ?? []).map((file) => (typeof file === 'string' ? file : file.path))
}

/** How many paths the entry changes: the length of the one list above, and nothing else. */
function howManyFiles(record: PanelRecord): number {
  return theChangedPathsOfAMergeEntry(record).length
}

/**
 * THE ONE LINE THE SECRETARY GETS WHEN AN ENTRY ENDS. SPEC.md section 5.7: no diff, no log; the
 * secretary opens the entry when it needs more. The same shape for merged, bounced and withdrawn.
 */
export function oneLineForTheSecretary(reading: MergeEntryReading): string {
  return theSecretarysLine(reading).line
}

/**
 * THE LINE AND ITS KIND OF NOTICE, worked out in the one branch for each state, so the words and whether they wake
 * the secretary, in lib/notices.ts, cannot come apart.
 */
function theSecretarysLine(reading: MergeEntryReading): { line: string; notice: AnotherNoticeKind } {
  const record = getRecord(reading.id)
  const held = record === null ? null : machineFieldsOf(record)
  const where = basename(reading.lane)
  const handle = theHandleOf(reading)
  const files = record === null ? 0 : howManyFiles(record)
  const n = `${String(files)} ${files === 1 ? 'file' : 'files'}`
  if (reading.state === 'merged') {
    const receipt = record?.data['integrated'] as IntegrationReceipt | undefined
    // A FILES ENTRY RAN NO TESTS AND NOTHING OF IT WAS CHECKED AGAIN, so its line says where it landed and
    // stops there. It said "tests: <the merger's log>" until the sandbox v1 fix (INTEGRATION.md section 7,
    // issue 7): the log the tool names beside a files changeset's `tested` step is its own, not a suite's.
    if (reading.changeset.adapter === 'files') return { line: `merged ${where}: ${handle} #${reading.id} ${n} → ${reading.lane}`, notice: 'anEntryLanded' }
    const tests = receipt?.tests
    // NO LOG IN THE LINE (SPEC.md 5.7): a green run whose counts the tool did not report is said to be green. A plugin-only
    // change was tested by the plugin's own check and not by the office's tests, and its line says that (plan VlQueUhVQQmi).
    const testsSay =
      tests === undefined
        ? ''
        : tests.green === false
          ? held?.tested?.mergeClass?.class === 3 && redMergeAuthorizesLanding(held?.tested) ? sayInEnglish('mergeQueue.wide-red') : held?.tested?.mergeClass?.class === 2 && redMergeAuthorizesLanding(held?.tested) ? 'may land, handed back' : onlyHouseRulesRedAuthorizesLanding(held?.tested) ? 'may land, only house rules red' : wholeSuiteRedAuthorizesLanding(held?.tested) ? 'whole suite red; admitted for a fix round' : 'whole suite red'
        : tests.plugin !== undefined
          ? 'plugin check green'
          : tests.ran === undefined || tests.passed === undefined
            ? 'tests green'
            : `tests ${String(tests.passed)}/${String(tests.ran)}`
    const reinspected = `reinspected ${String(receipt?.reinspected.length ?? 0)}`
    const target = `main ${(receipt?.mainAfter ?? '').slice(0, 7)}`
    return { line: `merged ${where}: ${handle} #${reading.id} ${n} → ${target} (${[testsSay, reinspected].filter((one) => one !== '').join(', ')})`, notice: 'anEntryLanded' }
  }
  if (reading.state === 'bounced') {
    const bounce = record?.data['bounced'] as Bounce | undefined
    const reason = bounce?.reason ?? 'bounced'
    const about =
      reason === 'red'
        ? `in ${String(bounce?.redTests?.length ?? 0)} red ${bounce?.redTests?.length === 1 ? 'test' : 'tests'}`
        : reason === 'churn'
          ? typeof record?.data['attempts'] === 'number'
            ? `in main moved ${String(record.data['attempts'])} times`
            : 'in main moved, a count not recorded'
          : reason === 'stalled'
            ? held?.stalls === null || held?.stalls === undefined
              ? 'after merge tool runs not counted on the entry'
              : `after ${String(held.stalls.runs)} merge tool runs`
            : reason === 'incomplete'
              ? 'in its report'
              : // A REFUSAL OF THE WHOLE RUN NAMES NO FILE, and "in 0 files" read as if nothing had been
              // looked at (acceptance finding 10). A scoped refusal still names its files.
              reason === 'refused' && (bounce?.files.length ?? 0) === 0
              ? 'by the check'
              : `in ${String(bounce?.files.length ?? 0)} ${bounce?.files.length === 1 ? 'file' : 'files'}`
    return { line: `bounced ${where}: ${handle} #${reading.id} ${reason} ${about} → back to ${handle}`, notice: 'anEntryBouncedForTheSecretary' }
  }
  // Read the completed stop from its stored words. Today's limit cannot undo it.
  if (reading.state === 'landing' && held !== null && held.stalls !== null && theOfficeStoppedAskingForTheLandingTool(held.stalls)) {
    const then = reading.changeset.adapter === 'git' ? `, then ${theRequestToLandAgain(reading.id)}` : ''
    return { line: `landing stalled ${where}: ${handle} #${reading.id} ${n} after ${String(held.stalls.runs)} merge tool runs → a person must look${then}`, notice: 'aLandingStalled' }
  }
  if (reading.state === 'withdrawn') {
    const by = reading.withdrawn?.by
    // An agent is named by its handle, read from its row; an id no single row answers is shown as it is.
    const byName = by === undefined ? 'nobody named' : by.kind === 'agent' ? (theOneAgentAStringNames(sqlite, by.id)?.handle ?? by.id) : by.id
    return { line: `withdrawn ${where}: ${handle} #${reading.id} by ${byName}: ${reading.withdrawn?.because ?? ''}`, notice: 'anEntryWasWithdrawn' }
  }
  return { line: `${stateWord(reading.state).text.toLowerCase()} ${where}: ${handle} #${reading.id} ${n}`, notice: 'anEntryEndedInAnotherState' }
}

/**
 * THE SECRETARY HEARS ONE LINE, or nobody holds the card and that is said. Called when an entry
 * reaches `merged`, `bounced` or `withdrawn`. Returns the message id, or null with the reason.
 */
export function theSecretaryHearsOneLine(reading: MergeEntryReading, workspaceId: string, extra = ''): { message: string | null; says: string } {
  const secretary = whoHoldsTheSecretaryCard()
  const original = theSecretarysLine(reading)
  const {notice} = original
  const line = extra === '' ? original.line : `${original.line}; ${extra}`
  if (secretary === null) return { message: null, says: `Nobody holds the secretary card, so the line "${line}" reached nobody.` }
  const message = writeAMessage({ workspaceId, to: [{ kind: 'agent', id: secretary.id }], title: line, body: line, aboutRun: reading.run, actor: THE_OFFICE, onlyThem: true, notice })
  // WHO WAS TOLD IS READ FROM THE STORED LINE: a line about a run that handed back an inside package goes to the
  // supervisor that took the package instead (`aPackagesLineGoesToItsSupervisor` in lib/delegation.ts, 13y round 164).
  const told = (getRecord(message)?.data['to'] ?? []) as ParticipantRef[]
  return { message, says: `${andList(told.map(theNameAPersonReads))} was told in one line, message ${message}.` }
}

/** The entry ended by withdrawal: the secretary's line, written on the entry as `told`. Called by the withdraw door. */
export function theEntryWasWithdrawn(reading: MergeEntryReading, workspaceId: string, actor: Actor): MergeEntryReading {
  const told = theSecretaryHearsOneLine(reading, workspaceId)
  return readMergeEntry(write(reading.id, { told: { submitter: [], secretary: told.message, says: told.says } }, actor))
}

// ============================================================================ bouncing

type BounceFacts = Omit<Bounce, 'at' | 'says' | 'reason'> & { attempts?: number; runs?: number }

/** What a bounce says, in words, for its reason. */
function whyItBounced(reason: BounceReason, bounce: BounceFacts, more: string): string {
  const files = bounce.files.length === 0 ? '' : ` Files: ${bounce.files.join(', ')}.`
  switch (reason) {
    case 'conflict':
      return `It could not be put on top of the main world: a conflict the tool does not resolve.${files} ${more}`.trim()
    case 'guard':
      return `A guard refused it.${files} ${more}`.trim()
    case 'red': {
      // A RED ITS OWN LINE SAID CANNOT BE FIXED (13u round 63): the speaker's own sentence comes first, as for a conflict.
      if (bounce.cannot !== undefined) return `${more} It was handed back from fixing its red tests: ${(bounce.redTests ?? []).join(', ')}.`.trim()
      // A FILE THAT CHANGED ITS ANSWER DID NOT STAY RED, so it is left out of the sentence about staying red.
      const changed = bounce.changedTheirAnswer ?? []
      const stayed = (bounce.redTests ?? []).filter((file) => !changed.includes(file))
      return `${stayed.length === 0 ? '' : `The tests stayed red on their own: ${stayed.join(', ')}. `}${more}`.trim()
    }
    case 'refused':
      // A BOUNCE THE ENTRY'S OWN LINE ASKED FOR WITH {"cannot"} IS NOT A CHECK'S REFUSAL (message XHY2fVFG3Qq8, answer 4).
      // The speaker's own sentence comes first; the fixed sentence and the files follow only when meaning would change.
      if (bounce.cannot === undefined) return `The check refused to release it. ${more}`.trim()
      return bounce.resolution === undefined
        ? `${more} It was handed back from resolving.${files}`.trim()
        : `${more} It was handed back from resolving: keeping both sides of its conflict would change what one side meant.${files}`.trim()
    case 'churn':
      if (bounce.attempts === undefined) return `The main world's move count was not recorded. The entry is sent back rather than queued again. ${more}`.trim()
      return `The main world moved under it ${String(bounce.attempts)} times while it was tested or as it landed, so it is sent back rather than queued again. ${more}`.trim()
    case 'unjudged':
      return `No inspector's verdict can cover it.${files} ${more}`.trim()
    case 'stalled':
      if (bounce.runs === undefined) return `The merge tool's run count was not recorded. The office stopped asking for the tool.${files} ${more}`.trim()
      return `The merge tool ended ${String(bounce.runs)} times without moving it, so the office stopped asking for the tool.${files} ${more}`.trim()
    case 'incomplete':
      return `Its run's report was read before any check of the run started, and it lacks what a check needs. No check was started, so no tokens were spent.${files} ${more}`.trim()
  }
}

/**
 * WHAT THE SUBMITTER DOES NEXT, BY WHY IT BOUNCED (acceptance finding 8). It used to say "fix it in
 * your sandbox" for every reason, which sent a worker to change work that had nothing wrong with it
 * when the cause was the main world moving or the office's own merge tool failing.
 */
function whatToDoNext(reason: BounceReason, run: string, released: boolean, refusedRun?: string, cannot = false, changesWhatOneSideMeant = false): string {
  const resubmit = 'The entry itself is final; a new submission is a new entry.'
  const decide = 'keeping both sides of the conflict changes what one side meant, so somebody must decide which meaning stands.'
  const decideForAnotherReason = 'the conflict cannot be resolved, for the reason given above, so somebody must decide what happens to the change.'
  const decideOnTheRed = 'the red tests cannot be fixed, for the reason given above, so somebody must decide what happens to the change.'
  // A RUN ALREADY RELEASED CANNOT BE RELEASED ON THE NEW SEAL THESE FIVE ASK FOR (decision CVfWgqGgLf1w, acceptance
  // finding 71), so their remedy goes in under a new run. Churn and a stalled tool ask for the same seal again, which its
  // release still covers: those keep their words. A released run's entry is refused only by a reinspection, and the run
  // that check refused is the reinspection's own (part (c) of the decision, acceptance finding 76): on 24 September 2026
  // the notice told a released run to "finish the run again", which is finding 71's trap.
  if (released) {
    const newRun = aReleasedRunGoesInUnderANewRun(run)
    switch (reason) {
      case 'conflict':
        // REBASE ONTO MAIN, NEVER MERGE MAIN IN. The queue lands by rebasing, which replays each commit, so a merge
        // commit's resolution is dropped at landing and the same conflict comes back (acceptance finding 37). The words
        // said "bring main into your branch" until a note on 24 September 2026 (message Dkd2vh03I1HL).
        return `Next: rebase your branch onto main in your sandbox and resolve the conflict there. ${newRun} ${resubmit}`
      case 'guard':
        return `Next: change the files the guard names in your sandbox. ${newRun} ${resubmit}`
      case 'red':
        if (cannot) return `Next: ${decideOnTheRed} Once that is decided, make the change in your sandbox. ${newRun} ${resubmit}`
        return `Next: fix the tests named above in your sandbox. ${newRun} ${resubmit}`
      case 'unjudged':
        return `Next: ${newRun} Its check reads the whole submission. ${resubmit}`
      case 'refused': {
        if (cannot) return `Next: ${changesWhatOneSideMeant ? decide : decideForAnotherReason} Once that is decided, rebase your branch onto main in your sandbox and make the change there. ${newRun} ${resubmit}`
        const inItsPlace =
          refusedRun === undefined ? '' : ` The new run takes the place of run ${refusedRun}, the reinspection the check refused, which was cut in the merge tool's clone.`
        return `Next: read the check's refusal and answer what it names in your sandbox. ${newRun}${inItsPlace} ${resubmit}`
      }
      case 'churn':
      case 'stalled':
      // A RELEASED RUN IS NEVER READ FOR ITS REPORT AT THE PIN (`whatTheReportOfThisEntryLacks`): its check has run.
      case 'incomplete':
        break
    }
  }
  switch (reason) {
    case 'conflict':
      // Rebase, not a merge of main, for the reason given for a released run above.
      return `Next: rebase your branch onto main in your sandbox, resolve the conflict there, finish and seal the run again, and submit again with POST /api/merge-queue. ${resubmit}`
    case 'guard':
      return `Next: change the files the guard names in your sandbox, finish and seal the run again, and submit again with POST /api/merge-queue. ${resubmit}`
    case 'red':
      if (cannot) return `Next: ${decideOnTheRed} Once that is decided, make the change in your sandbox, finish and seal the run again, and submit again with POST /api/merge-queue. ${resubmit}`
      return `Next: fix the tests named above in your sandbox, finish and seal the run again, and submit again with POST /api/merge-queue. ${resubmit}`
    case 'refused':
      if (cannot) return `Next: ${changesWhatOneSideMeant ? decide : decideForAnotherReason} Once that is decided, rebase your branch onto main in your sandbox, make the change there, finish and seal the run again, and submit again with POST /api/merge-queue. ${resubmit}`
      return `Next: read the check's refusal, answer what it names, and finish the run again so it is checked again; submit again with POST /api/merge-queue once it is released. ${resubmit}`
    case 'unjudged':
      return `Next: finish the run again so a check covers these files, and submit again with POST /api/merge-queue once it is released. ${resubmit}`
    case 'churn':
      return `Next: nothing in your work is wrong. Submit the same sealed run again with POST /api/merge-queue when the main world is quieter. ${resubmit}`
    case 'stalled':
      return `Next: this is most likely the office's own trouble, not your work: read the merge tool's reason on the entry (tool.reason) and its log, and tell a secretary. Once that is put right, submit the same sealed run again with POST /api/merge-queue. ${resubmit}`
    case 'incomplete':
      return (
        'Next: write what is named above on the run and on its report. The sealed commits need not change. ' +
        `Then submit the same sealed run again with POST /api/merge-queue. Until it is submitted again, the check of the run is held and not started. ${resubmit}`
      )
  }
}

/**
 * WHAT THE SECRETARY DOES NEXT WHEN ITS design/-ONLY ENTRY BOUNCES. The office filed that
 * entry's run itself and nobody finished it, so `whatToDoNext`'s "finish and seal the run again" is not an act the
 * secretary can take. Every remedy is a new commit on the branch, or none, and the secretary's body sent again, which
 * makes the office file a new run.
 */
function whatTheSecretaryDoesNext(reason: BounceReason, entry: MergeEntryReading, cannot = false, changesWhatOneSideMeant = false): string {
  const run = getRecord(entry.run)
  const folder = run === null ? 'the working folder' : `the working folder ${String(run.data['workingDirectory'])}`
  const branch = entry.changeset.adapter === 'git' && entry.changeset.branch !== null ? `the branch ${entry.changeset.branch}` : 'the branch'
  const again =
    `submit the secretary's body again with POST /api/merge-queue ({"changeset":{"adapter":"git",…,"branch":…},"workingDirectory":…}), ` +
    'and the office files a new run for it. The entry itself is final; a new submission is a new entry.'
  switch (reason) {
    case 'conflict':
      return `Next: rebase ${branch} onto main in ${folder}, resolving each conflict as it stops, then ${again}`
    case 'guard':
      return `Next: change the files the guard names on ${branch} in ${folder} and commit them, then ${again}`
    case 'red':
      if (cannot) return `Next: the red tests cannot be fixed, for the reason given above, so tell the person, who decides what happens to the change. To send the change again, ${again}`
      return `Next: the tests named above stayed red with this entry's design/ files on top of main. Change those files on ${branch} in ${folder} so the tests pass, then ${again}`
    case 'refused':
      if (cannot) {
        return changesWhatOneSideMeant
          ? `Next: keeping both sides of the conflict changes what one side meant, so tell the person, who decides which meaning stands. To send the change again, ${again}`
          : `Next: the conflict cannot be resolved, for the reason given above, so tell the person, who decides what happens to the change. To send the change again, ${again}`
      }
      return `Next: no check is asked for a secretary's design/-only entry, so read the refusal on the entry and tell the person. To send the change again, ${again}`
    case 'unjudged':
      return `Next: the secretary's rule covers design/ files only, and the paths named above are not covered. Take them off ${branch} in ${folder}, then ${again}`
    case 'churn':
      return `Next: nothing in the change is wrong. When the main world is quieter, ${again}`
    case 'stalled':
      return `Next: this is most likely the office's own trouble, not the change: read the merge tool's reason on the entry (tool.reason) and its log. Once that is put right, ${again}`
    // NO REPORT IS READ FOR A SECRETARY'S design/-ONLY ENTRY (`whatTheReportOfThisEntryLacks`), so this bounce is the office's own fault.
    case 'incomplete':
      return `Next: a secretary's design/-only entry is not read for a report, so this bounce is the office's own fault. Tell the person. To send the change again, ${again}`
  }
}

/**
 * BOUNCE AN ENTRY: write why on the entry, tell the submitter what to do next, and give the
 * secretary one line. One transaction, so a refused message leaves no half-bounced entry.
 * `refusedRun` is the run whose check refused, when that is not the entry's own run: a reinspection's.
 */
function bounce(entry: MergeEntryReading, reason: BounceReason, facts: BounceFacts, more: string, actor: Actor, refusedRun?: string): MergeEntryReading {
  if (facts.resolution !== undefined && THE_REASON_A_RESOLUTION_BOUNCE_KEEPS[facts.resolution] !== reason) {
    throw new Error(`A bounce for "${facts.resolution}" keeps the reason ${THE_REASON_A_RESOLUTION_BOUNCE_KEEPS[facts.resolution]}, and merge entry ${entry.id} was being bounced as ${reason}.`)
  }
  const at = nowStamp()
  const says = whyItBounced(reason, facts, more)
  const stored: Bounce = { reason, at, files: [...facts.files], ...(facts.redTests === undefined ? {} : { redTests: [...facts.redTests] }), ...(facts.changedTheirAnswer === undefined ? {} : { changedTheirAnswer: [...facts.changedTheirAnswer] }), ...(facts.log === undefined ? {} : { log: facts.log }), ...(facts.mainAt === undefined ? {} : { mainAt: facts.mainAt }), ...(facts.resolution === undefined ? {} : { resolution: facts.resolution }), ...(facts.cannot === undefined ? {} : { cannot: { by: { kind: facts.cannot.by.kind, id: facts.cannot.by.id }, said: facts.cannot.said } }), says }
  const moved = sqlite.transaction(() => {
    const whom = whoIsToldOfAnEntrysEnd(entry)
    const submitter =
      whom.to.length === 0
        ? []
        : [
            writeAMessage({
              workspaceId: entry.workspaceId,
              to: whom.to,
              title: `Bounced (${reason}): merge entry ${entry.id}`,
              aboutRun: entry.run,
              actor: THE_OFFICE,
              notice: 'anEntryBounced',
              body:
                `Merge entry ${entry.id} — ${entry.title} — bounced. ${says}\n\n` +
                (entry.takeBackOf === undefined ? '' : `A person must look at hand-back problem ${entry.takeBackOf.problem}: take-back bounced ${reason}. ${says}\n`) +
                (reason === 'refused' && facts.cannot === undefined ? theRefusalsOwnLine(entry, refusedRun) : '') +
                (facts.log === undefined ? '' : `Log: ${facts.log}\n`) +
                (facts.mainAt === undefined ? '' : `The main world was at ${facts.mainAt}.\n`) +
                `\n${isASecretarysDesignEntry(entry) ? whatTheSecretaryDoesNext(reason, entry, facts.cannot !== undefined, facts.resolution !== undefined) : whatToDoNext(reason, entry.run, theReleaseOfTheRun(entry) !== null, refusedRun, facts.cannot !== undefined, facts.resolution !== undefined)}`,
            }),
          ]
    const moved = moveEntry({ id: entry.id, to: 'bounced', actor, also: { bounced: stored, ...(facts.attempts === undefined ? {} : { attempts: facts.attempts }) } })
    // The state writer clears the old arrival's stalls. Keep the count that ended it after that move.
    const counted = facts.runs === undefined ? moved : write(entry.id, { stalls: { runs: facts.runs, says } }, actor)
    const reading = readMergeEntry(counted)
    // ONE BOUNCE, ONE NOTICE TO EACH READER, on problem 2-AtvZiEfVO9. When the secretary is
    // already told in the bounce notice, as the run's starter or its submitter, the one line would say again what
    // that notice says, so it is not written, and `told.secretary` names the notice that told it.
    const secretary = whoHoldsTheSecretaryCard()
    const inTheNotice = secretary !== null && submitter.length === 1 && whom.to.some((one) => one.id === secretary.id) ? submitter[0]! : null
    const told =
      inTheNotice === null || secretary === null
        ? theSecretaryHearsOneLine(reading, entry.workspaceId)
        : { message: inTheNotice, says: `${secretary.handle} was told in the bounce notice, message ${inTheNotice}, so no second line was written.` }
    return write(entry.id, { told: { submitter, secretary: told.message, says: `${whom.says} ${told.says}` } }, actor)
  })()
  return readMergeEntry(moved)
}

/**
 * WHY AN ENTRY CANNOT JOIN MAIN, in the words of its bounce (wave 13v round 15). The tool replayed its commits onto main
 * before any suite ran, so the words say it was never tested.
 */
function whyItCannotJoin(found: { mainAt: string; commit?: string; lines: ConflictLines }): string {
  const where = found.lines.map((one) => (one.ranges !== undefined ? `${one.path} at lines ${one.ranges}` : `${one.path} (${one.why ?? 'git gave no lines'})`)).join('; ')
  return (
    `Its commits were replayed onto main ${found.mainAt.slice(0, 12)} the way the queue's rebase puts them there, and ` +
    `${found.commit === undefined ? 'one of them' : `commit ${found.commit.slice(0, 12)}`} stopped on a conflict: ${where}. ` +
    'The lines are those of the conflict markers git wrote in the replayed file. The entry was never tested: no suite ran on it.'
  )
}

/**
 * WHY THE QUEUE'S REBASE, TRIED EARLY, SENDS AN ENTRY BACK (wave 13v round 25): the words its turn would have used, the
 * rebase's own `says`, and one sentence saying it was found early.
 */
function foundEarly(stopped: { says: string }, mainAt: string): string {
  return (
    `${stopped.says} This was found early, while the entry waited: the queue's rebase, with its joins, was run on a scratch ` +
    `copy against main ${mainAt.slice(0, 12)} before the entry's turn. The entry was never tested: no suite ran on it.`
  )
}

/**
 * WHETHER A CONFLICT NO RULE JOINS GOES TO THE ENTRY'S OWN SUPERVISOR instead of bouncing, as tier 2 of a
 * decision says. See also xqGNR20SQ9vO. It is only behind the dormant setting,
 * and only for a git entry. A files entry has no
 * commits to resolve, and the merge tool's files adapter reports a `conflict` step too.
 */
function theConflictIsHandedOn(entry: MergeEntryReading): boolean {
  return entry.changeset.adapter === 'git' && conflictResolvingIsOn()
}

/**
 * THE AGENT A HANDED-ON CONFLICT ASKS FOR (Fr7xGMIidn97, way (a)): the first agent told of the entry's end, in the
 * order `whoIsToldOfAnEntrysEnd` tells them, that may hand a resolution over. A retired agent may not, and nor may an
 * agent whose card is a worker's (`whoHandsOverAResolution`). Null when none of them may.
 */
function theAgentAskedToResolve(told: readonly ParticipantRef[]): RegisteredAgent | null {
  for (const one of told) {
    const row = one.kind === 'agent' ? readParticipant(one) : null
    if (row === null || !('startedBy' in row) || row.retired === true || theCardOfAgent(row.id) === THE_WORKERS_CARD) continue
    return row
  }
  return null
}

/**
 * THE RESOLVE BRIEF, FROM ITS ONE TEMPLATE (the secretary's answer, way (a)): the entry and its files, the end of the
 * time set for resolving a conflict on the Gates panel, the clean-copy command filled in from the entry, the rule for
 * resolving, the related tests and the hand-over. A conflict met by a resolution the check passed names that
 * resolution as a help (the secretary's answer). The related tests are not listed here: the clean-copy tool works them
 * out from the paths it resolved when the replay ends, and prints the command that
 * runs them, so they are worked out in one place.
 */
function theResolveBrief(entry: MergeEntryReading, changeset: GitChangeset, resolving: Resolving, agent: RegisteredAgent, into: string, until: string): string {
  if (resolving.red !== undefined) return theFixBrief(entry, changeset, resolving, resolving.red, agent, into, until)
  const before = resolving.resolvedBefore
  const replays = resolving.replays
  const cleanCopy =
    resolving.mainAt === undefined
      ? ['The conflict did not say which main it met, so no clean-copy command can be written, and the office refuses a resolution handed over for it. Say that it cannot be resolved, as below.']
      : [
          'From the top of a checkout of Mole Office:',
          '',
          `    node tools/merge-tool/resolve-a-conflict.mjs --entry ${entry.id} --repository ${changeset.root} --ref ${replays?.ref ?? pinnedRefOf(entry.id)} --commit ${replays?.commit ?? changeset.commit} --main-at ${resolving.mainAt} --files ${resolving.files.join(',')} --into ${into}`,
          '',
          `It replays ${replays === undefined ? "the entry's own commit" : "that fix, with the entry's own commits,"} onto that main with the queue's joins, and stops where git leaves a file in conflict. Resolve the places, run \`git add\` on the files, and run it again until the replay ends:`,
          '',
          `    node tools/merge-tool/resolve-a-conflict.mjs --continue --into ${into}`,
        ]
  return [
    `# Resolve the conflict of merge entry ${entry.id}`,
    '',
    `Mole Office wrote this brief for ${agent.handle} (${agent.id}) when the merge queue handed the entry's conflict to its own supervisor instead of bouncing it.`,
    '',
    '## The entry',
    '',
    `- Merge entry: ${entry.id}, ${entry.title}`,
    `- Its run: ${entry.run}`,
    `- Its repository: ${changeset.root}`,
    `- The files to resolve: ${resolving.files.join(', ')}`,
    `- What the queue met: ${resolving.says}`,
    ...(resolving.log === undefined ? [] : [`- The merge tool's log: ${resolving.log}`]),
    '',
    '## The time to resolve',
    '',
    `Hand over a resolution, or say that the conflict cannot be resolved, before ${until} (${resolving.timeZone}). The ${resolving.minutes} minutes started when the entry's ${replays === undefined ? 'first conflict' : 'red tests'} ${replays === undefined ? 'was' : 'were'} handed on, and they are never started again. When they end with no resolution handed over, the entry bounces as "the hour ran out".`,
    ...whatTheCleanCopyReplays(changeset, replays),
    ...(before === undefined
      ? []
      : [
          '',
          '## What was resolved before',
          '',
          `A resolution of ${before.files.join(', ')}, commit ${before.commit}, passed the merge tool's check against main ${before.mainAt}, and then met main moving. ${changeset.root} still holds it at ${resolvedRefOf(entry.id)}. You may reuse what it did with those files. It is a help, not the entry's side: the clean copy below replays the entry's own commit again, and the check judges every file above again, in full, against the main this conflict met.`,
        ]),
    '',
    '## The clean copy',
    '',
    ...cleanCopy,
    '',
    '## How to resolve',
    '',
    'Keep both sides. If keeping both would change what one side meant, say so and stop:',
    '',
    `    POST /api/merge-queue/${entry.id}/resolution {"cannot": "<one sentence saying why>", "changesWhatOneSideMeant": true}`,
    '',
    'If it cannot be resolved for another reason, say why and stop:',
    '',
    `    POST /api/merge-queue/${entry.id}/resolution {"cannot": "<one sentence saying why>"}`,
    '',
    '## The related tests',
    '',
    'When the replay ends, the clean-copy tool names the test files that depend on the resolved paths, and the command that runs them. Run them in the clean copy.',
    '',
    "Declare what they did with the hand-over, as `tests`: the commit they ran at, the exit code, how many passed and failed, and the log. Declare it with your own key. The office does not run them or read the log. It shows your run, as declared, to whoever judges the resolution, and it passes or fails nothing. The merge tool refuses a resolution whose declared run is not at the resolution's commit.",
    '',
    '## The hand-over',
    '',
    `    POST /api/merge-queue/${entry.id}/resolution {"workingDirectory": "${into}", "tests": {"commit": "<the resolution's commit>", "exit": <exit>, "counts": {"passed": <n>, "failed": <n>}, "log": "${into}.tests.log"}}`,
    '',
    'The tool prints this request when the replay ends, with the commit filled in. Leave out `tests` if you ran none. Keep the HEAD of the clean copy at the resolution until the entry ends: the merge tool fetches it from there.',
    '',
  ].join('\n')
}

/**
 * THE SECTION OF A BRIEF THAT SAYS WHICH FIX THE CLEAN COPY REPLAYS (13u round 63), when a fix of the entry's red tests
 * passed its check and was then met by a red or a conflict. None when the clean copy replays the entry's pinned commit.
 */
function whatTheCleanCopyReplays(changeset: GitChangeset, replays: Resolving['replays']): string[] {
  if (replays === undefined) return []
  return [
    '',
    '## What the clean copy replays',
    '',
    `A fix of this entry's red tests, commit ${replays.commit}, passed the merge tool's check, and ${changeset.root} holds it at ${replays.ref}. The clean copy below replays that fix, with the entry's own commits under it, in place of the entry's pinned commit, and the merge tool's check replays it the same way.`,
  ]
}

/**
 * THE FIX BRIEF (13u round 63), the resolve brief's template for a test red only with its entry: the entry and its red
 * tests, the end of the time set for resolving a conflict on the Gates panel, the clean-copy command started with
 * `--red`, the rule for fixing, the command that runs the red tests and the hand-over. The clean copy replays the entry
 * with no stop, because the queue's own replay onto this main did not stop, and the fix is committed on top.
 */
function theFixBrief(entry: MergeEntryReading, changeset: GitChangeset, resolving: Resolving, red: NonNullable<Resolving['red']>, agent: RegisteredAgent, into: string, until: string): string {
  const replays = resolving.replays
  return [
    `# Fix the red tests of merge entry ${entry.id}`,
    '',
    `Mole Office wrote this brief for ${agent.handle} (${agent.id}) when the merge queue handed the entry's red tests to its own supervisor instead of bouncing it.`,
    '',
    '## The entry',
    '',
    `- Merge entry: ${entry.id}, ${entry.title}`,
    `- Its run: ${entry.run}`,
    `- Its repository: ${changeset.root}`,
    `- The red tests: ${red.tests.join(', ')}`,
    `- What the queue met: ${resolving.says}`,
    ...(resolving.log === undefined ? [] : [`- The merge tool's log: ${resolving.log}`]),
    '',
    'These tests were red with the entry on top of main, and green on main without it.',
    '',
    '## The time to fix',
    '',
    `Hand over a fix, or say that the tests cannot be fixed, before ${until} (${resolving.timeZone}). The ${resolving.minutes} minutes started when the entry's red tests were first handed on, and they are never started again. When they end with no fix handed over, or with the last fix refused by the merge tool's check, the entry bounces as "not fixed in the hour".`,
    ...whatTheCleanCopyReplays(changeset, replays),
    '',
    '## The clean copy',
    '',
    'From the top of a checkout of Mole Office:',
    '',
    `    node tools/merge-tool/resolve-a-conflict.mjs --entry ${entry.id} --repository ${changeset.root} --ref ${replays?.ref ?? pinnedRefOf(entry.id)} --commit ${replays?.commit ?? changeset.commit} --main-at ${resolving.mainAt ?? ''} --red ${red.tests.join(',')} --into ${into}`,
    '',
    `It replays ${replays === undefined ? "the entry's own commits" : "that fix, with the entry's own commits,"} onto that main with the queue's joins, the way the queue's rebase did when the tests were red. The replay does not stop: if it stops on a conflict, the tool says so, and nothing can be fixed in that copy. Commit your fix on top of the replayed commits. Do not change, reorder or squash the replayed commits: the merge tool's check compares them with its own replay.`,
    '',
    '## How to fix',
    '',
    'Make the red tests pass with a change committed on top of the replay. Do not weaken, skip or delete a test to make it pass. If the tests cannot be fixed, say why and stop:',
    '',
    `    POST /api/merge-queue/${entry.id}/resolution {"cannot": "<one sentence saying why>"}`,
    '',
    '## The red tests',
    '',
    'Run them in the clean copy:',
    '',
    `    node tools/run-named-tests.mjs ${red.tests.join(' ')}`,
    '',
    "Declare what they did with the hand-over, as `tests`: the commit they ran at, the exit code, how many passed and failed, and the log. Declare it with your own key. The office does not run them or read the log. It shows your run, as declared, to whoever judges the fix, and it passes or fails nothing. The merge tool refuses a fix whose declared run is not at the fix's commit.",
    '',
    '## The hand-over',
    '',
    `    POST /api/merge-queue/${entry.id}/resolution {"workingDirectory": "${into}", "tests": {"commit": "<the commit of your fix>", "exit": <exit>, "counts": {"passed": <n>, "failed": <n>}, "log": "${into}.tests.log"}}`,
    '',
    'The tool prints this request when the replay ends. Put the commit of your fix where it says. Leave out `tests` if you ran none. Keep the HEAD of the clean copy at your fix until the entry ends: the merge tool fetches it from there.',
    '',
  ].join('\n')
}

/**
 * THE AGENT'S LAST RUN STARTED IN A SANDBOX (./next-round.ts `theLastSandboxRunOf`), or null when it has none, or the
 * words of that door's 500 when the run has no create row in the change log (wave 13u round 105). The words are kept as
 * the queue's own note, as the seal's ask keeps them (./next-round-at-the-seal.ts), so a missing create row never stops
 * the step that asks. Only the door's own refusal is caught.
 */
function theLastSandboxRunOrWhyNot(agent: { id: string; handle: string }, workspaceId: string): { run: PanelRecord | null } | { cannot: string } {
  try {
    return { run: theLastSandboxRunOf(agent.id, agent.handle, workspaceId) }
  } catch (error) {
    if (!(error instanceof PanelError)) throw error
    return { cannot: error.message }
  }
}

/**
 * WRITE THE RESOLVE BRIEF INTO THE ASKED AGENT'S SANDBOX (Fr7xGMIidn97, way (a), on the conditions of
 * XHY2fVFG3Qq8, answer 6). The folder is that of the agent's last run in this project started in a sandbox, which is the
 * folder the next-round door reads a brief from (./next-round.ts), and the brief's clean copy goes in its worktrees
 * folder under the brief's own name. Each reason nothing was written is said in `noBrief`.
 */
function writeTheResolveBrief(entry: MergeEntryReading, resolving: Resolving, until: string): Pick<AskedToResolve, 'agent' | 'brief' | 'noBrief'> {
  const told = whoIsToldOfAnEntrysEnd(entry).to
  const agent = theAgentAskedToResolve(told)
  const red = resolving.red !== undefined
  if (agent === null) {
    return {
      noBrief:
        told.length === 0
          ? `Nobody is told of this entry's end, so no agent is asked to ${red ? 'fix its red tests' : 'resolve it'}, and no brief was written.`
          : `No agent told of this entry's end (${told.map((one) => one.id).join(', ')}) may hand a ${red ? 'fix' : 'resolution'} over: each is retired or holds a worker's card. No brief was written.`,
    }
  }
  const last = theLastSandboxRunOrWhyNot(agent, entry.workspaceId)
  if ('cannot' in last) return { agent: agent.id, noBrief: `${last.cannot} No brief was written.` }
  const run = last.run
  if (run === null) return { agent: agent.id, noBrief: `${agent.handle} has no run in this project that was started in a sandbox, so there is no sandbox folder to write the brief into. No brief was written.` }
  const sandbox = theSandboxTheOfficeVouchesFor(run)
  if (sandbox === null) {
    return { agent: agent.id, noBrief: `Run ${run.id}, the last of ${agent.handle} started in a sandbox, names a sandbox the office cannot vouch for: its folder is not one a container row of the ledger names. No brief was written.` }
  }
  const changeset = entry.changeset as GitChangeset
  const written = writeABriefIntoASandbox(sandbox.folder, `resolve-${entry.id}`, (name) => theResolveBrief(entry, changeset, resolving, agent, join(sandbox.folder, 'worktrees', name), until))
  return 'refused' in written ? { agent: agent.id, noBrief: written.refused } : { agent: agent.id, brief: written.path }
}

/**
 * THE ONE MESSAGE THAT ASKS (Fr7xGMIidn97, way (a)), written as the office to everybody told of the entry's end and
 * to the secretary. `askedToResolve` carries the five things a program reads, and for a test red only with the entry
 * (13u round 63) the red tests as well; the body says them for a person. When the agent had no run going, the office has
 * asked the next-round door itself (`round`, 13u round 90), and the body says what the door answered; a secretary is
 * asked to start the agent only when the office did not ask or the door refused it. When there is nobody to send it to,
 * `noMessage` says so.
 */
function sendTheAskingMessage(entry: MergeEntryReading, resolving: Resolving, asked: Pick<AskedToResolve, 'agent' | 'brief' | 'noBrief' | 'round'>, untilMs: number, until: string): Pick<AskedToResolve, 'message' | 'noMessage'> {
  const secretary = whoHoldsTheSecretaryCard()
  const told = whoIsToldOfAnEntrysEnd(entry).to
  const to = secretary === null || told.some((one) => one.id === secretary.id) ? told : [...told, { kind: 'agent' as const, id: secretary.id }]
  if (to.length === 0) return { noMessage: "Nobody is told of this entry's end and nobody holds the secretary card, so no message was sent." }
  const named = asked.agent === undefined ? null : readParticipant({ kind: 'agent', id: asked.agent })
  const handle = named !== null && 'handle' in named ? named.handle : (asked.agent ?? null)
  const askedToResolve: AskedToResolveMessage = { entry: entry.id, files: [...resolving.files], ...(resolving.red === undefined ? {} : { red: [...resolving.red.tests] }), brief: asked.brief ?? null, agent: asked.agent ?? null, until: new Date(untilMs).toISOString() }
  const replays = resolving.replays === undefined ? '' : `The fix of its red tests that passed the merge tool's check, commit ${resolving.replays.commit}, is held at ${resolving.replays.ref}, and the clean copy replays it with the entry's own commits.\n`
  const round = asked.round
  const startIt =
    asked.brief === undefined || handle === null
      ? `Nobody can be started on a brief, so whoever ${resolving.red === undefined ? 'resolves it' : 'fixes them'} has to be told by a person or the secretary.`
      : round?.status === 202
        ? `${handle} had no run going, so the office asked for its next round itself, on this brief. The door answered: ${round.said}`
        : `${round === undefined ? '' : `${handle} had no run going, and the next-round door refused the office's own ask (${round.status}): ${round.said} `}To start ${handle} on it, a secretary asks POST /api/agents/${handle}/next-round {"brief": "${asked.brief}"}.`
  if (resolving.red !== undefined) {
    const message = writeAMessage({
      workspaceId: entry.workspaceId,
      to,
      title: `Asked to fix red tests: merge entry ${entry.id}`,
      aboutRun: entry.run,
      actor: THE_OFFICE,
      onlyThem: true,
      notice: 'askedToResolve',
      askedToResolve,
      body:
        `Merge entry ${entry.id} — ${entry.title} — was red only with its own change, and the queue handed it to its own supervisor instead of bouncing it. ${resolving.says}\n\n` +
        `The red tests: ${resolving.red.tests.join(', ')}.\n` +
        replays +
        (handle === null ? 'No agent is asked by name.\n' : `The agent asked to fix them: ${handle}.\n`) +
        (asked.brief === undefined ? `${asked.noBrief ?? ''}\n` : `The fix brief: ${asked.brief}\n`) +
        `The ${resolving.minutes} minutes end at ${until} (${resolving.timeZone}). When they end with no fix handed over, or with the last fix refused by the merge tool's check, the entry bounces as "not fixed in the hour".\n\n` +
        startIt,
    })
    return { message }
  }
  const message = writeAMessage({
    workspaceId: entry.workspaceId,
    to,
    title: `Asked to resolve: merge entry ${entry.id}`,
    aboutRun: entry.run,
    actor: THE_OFFICE,
    onlyThem: true,
    notice: 'askedToResolve',
    askedToResolve,
    body:
      `Merge entry ${entry.id} — ${entry.title} — met a conflict no rule joins, and the queue handed it to its own supervisor instead of bouncing it. ${resolving.says}\n\n` +
      `The files to resolve: ${resolving.files.join(', ')}.\n` +
      replays +
      (resolving.resolvedBefore === undefined ? '' : `${resolving.resolvedBefore.files.join(', ')} ${resolving.resolvedBefore.files.length === 1 ? 'was' : 'were'} resolved before, in commit ${resolving.resolvedBefore.commit}, which ${resolvedRefOf(entry.id)} still holds as a help; ${resolving.resolvedBefore.files.length === 1 ? 'it is' : 'they are'} resolved and judged again.\n`) +
      (handle === null ? 'No agent is asked by name.\n' : `The agent asked to resolve it: ${handle}.\n`) +
      (asked.brief === undefined ? `${asked.noBrief ?? ''}\n` : `The resolve brief: ${asked.brief}\n`) +
      `The ${resolving.minutes} minutes end at ${until} (${resolving.timeZone}). When they end with no resolution handed over, the entry bounces as "the hour ran out".\n\n` +
      startIt,
  })
  return { message }
}

/**
 * THE REFUSAL OF A WRITE THAT FAILED AFTER THE OFFICE WROTE RESOLVE BRIEFS (see x2y70-Bc8xmi; for a landing,
 * bHtubWembovw). A brief is a file and not a row, so the write's rollback leaves it, and these words are the only place
 * that names it. `what` is the write that failed, and `nothingElse` says what its rollback took back. `aFix` says the
 * brief is a fix brief, written for a test red only with its entry (13u round 63).
 */
function theBriefsLeftBehind(briefs: readonly { entry: string; path: string }[], what: string, error: unknown, nothingElse: string, aFix = false): PanelError {
  const said = error instanceof Error ? error.message : String(error)
  const one = briefs.length === 1
  return new PanelError(
    `The office wrote the ${aFix ? 'fix' : 'resolve'} ${one ? 'brief' : 'briefs'} of ${andList(briefs.map((brief) => `merge entry ${brief.entry} at ${brief.path}`))}, and then ${what} failed: ${said.endsWith('.') ? said : `${said}.`} ` +
      `${nothingElse} ${one ? 'The brief is left at that path, and nothing names it.' : 'The briefs are left at those paths, and nothing names them.'}`,
    error instanceof PanelError ? error.status : 500,
  )
}

/**
 * HAND A CONFLICT TO THE ENTRY'S OWN SUPERVISOR. The entry leaves its lane for `resolving`, holding the conflict in
 * the words its bounce would have used and the start and duration of the supervisor's time to resolve; `also` is
 * written in the same move. The office writes the resolve brief into the asked agent's sandbox and sends one message
 * that asks (the secretary's answer, way (a)), and `resolving.asked` keeps whom it asked and what it wrote. The brief is
 * written before the move, because it is a file and not a row; the message and the move are one transaction. When the
 * time to resolve ends with no resolution handed over, the message worker's pass bounces the entry as "the hour ran
 * out" (`theHourIsOver`). It answers the brief's path as `brief`, so a caller whose own write fails after this one
 * can name the file. `theCountStands` says that a conflict count was written and kept before this call: its refusals
 * then say so. The landing caller leaves it false, because the landing's
 * transaction takes its count back when this throws.
 */
function handOnTheConflict(
  entry: MergeEntryReading,
  facts: Omit<Bounce, 'at' | 'says' | 'reason' | 'redTests'>,
  more: string,
  actor: Actor,
  also: Record<string, unknown> = {},
  theCountStands = false,
): { entry: MergeEntryReading; waits: string; brief?: string } {
  const record = getRecord(entry.id)
  if (record === null) throw new Error(`Merge entry ${entry.id} is gone while its conflict was being handed on.`)
  const held = machineFieldsOf(record)
  // A CONFLICT MET BY A RESOLUTION THE CHECK PASSED goes back to the same supervisor in the time given at the first
  // conflict, which is never started again (the secretary's answer, and a later one, which keeps it across every
  // hand-over). The check replays the entry's own commit again, so the files to resolve are the earlier ones and the
  // new ones (way (3) of the secretary's answer), and the resolution that met it is kept
  // as `resolvedBefore`, a help and never the entry's side. A CONFLICT MET BY A FIX OF RED TESTS THE CHECK PASSED (13u
  // round 63) goes back the same way, and the clean copy and the check replay that fix (`replays`): it holds the entry's
  // fix, not a side of a conflict. A conflict after a resolution of a conflict met by such a fix keeps replaying it.
  const before = held.resolution?.checked !== undefined ? held.resolving : null
  const now = clockStamp()
  const afterAFix = before?.red !== undefined
  const conflict: Resolving = {
    files: before === null ? [...facts.files] : [...new Set([...before.files, ...facts.files])],
    ...(facts.log === undefined ? {} : { log: facts.log }),
    ...(facts.mainAt === undefined ? {} : { mainAt: facts.mainAt }),
    says: whyItBounced('conflict', facts, more),
    since: before === null ? now.instant : before.since,
    timeZone: before === null ? now.timeZone : before.timeZone,
    minutes: before === null ? gateNumber('conflict-minutes') : before.minutes,
    ...(before === null
      ? {}
      : afterAFix
        ? { replays: { ref: resolvedRefOf(entry.id), commit: held.resolution!.commit } }
        : { resolvedBefore: { files: [...before.files], commit: held.resolution!.commit, mainAt: held.resolution!.mainAt }, ...(before.replays === undefined ? {} : { replays: before.replays }) }),
  }
  const { moved, hour, over, whom, written } = handItOn(entry, conflict, before, actor, also, {
    what: 'conflict',
    counted: theCountStands,
    late: (minutes, until) => `The ${minutes} minutes ended at ${until}, before this conflict was met, so nobody is asked to resolve it.`,
  })
  if (before === null) {
    return { entry: readMergeEntry(moved), waits: `It now waits for its own supervisor to resolve the conflict, within ${hour.minutes} minutes of ${now.stamp}. ${whom}`, ...written }
  }
  if (afterAFix) {
    return {
      ...written,
      entry: readMergeEntry(moved),
      waits:
        `The fix of its red tests its check passed, commit ${held.resolution!.commit.slice(0, 12)}, met this conflict, so it goes back to its own supervisor in the ${hour.minutes} minutes of its first hand-on, which are never started again: ` +
        (over ? `it ended at ${hour.until}, so the entry bounces as "the hour ran out".` : `it ends at ${hour.until}. The clean copy replays that fix with the entry's own commits. ${whom}`),
    }
  }
  return {
    ...written,
    entry: readMergeEntry(moved),
    waits:
      `The resolution its check passed, commit ${held.resolution!.commit.slice(0, 12)}, met this conflict, so it goes back to its own supervisor in the ${hour.minutes} minutes of its first conflict, which are never started again: ` +
      (over ? `it ended at ${hour.until}, so the entry bounces as "the hour ran out".` : `it ends at ${hour.until}. The files to resolve are ${conflict.files.join(', ')}, the earlier ones included, because the check replays the entry's own commit again. ${whom}`),
  }
}

/**
 * HAND A TEST RED ONLY WITH THE ENTRY TO ITS OWN SUPERVISOR (13u round 63), the way a conflict is handed on. The entry
 * leaves its lane for `resolving`, holding the red tests, the main it was integrated and tested on, the words its bounce
 * would have used, and the time to fix, which is the time set for resolving a conflict. The office writes a fix brief
 * and sends one message that asks. A red met again after a fix passed its check goes back in the minutes of the first
 * hand-on, which are never started again, and the clean copy and the check replay that fix (`replays`). The red was
 * counted before this call, so a refusal says the count is kept. When the time to fix ends with no fix handed over, or
 * with the last one refused by the check, the message worker's pass bounces the entry as "not fixed in the hour".
 */
function handOnTheRed(entry: MergeEntryReading, facts: { tests: string[]; log: string; mainAt: string }, more: string, actor: Actor): { entry: MergeEntryReading; waits: string; brief?: string } {
  const record = getRecord(entry.id)
  if (record === null) throw new Error(`Merge entry ${entry.id} is gone while its red tests were being handed on.`)
  const held = machineFieldsOf(record)
  const before = held.resolution?.checked !== undefined && held.resolving?.red !== undefined ? held.resolving : null
  const now = clockStamp()
  const red: Resolving = {
    files: [],
    red: { tests: [...facts.tests] },
    log: facts.log,
    mainAt: facts.mainAt,
    says: whyItBounced('red', { files: [], redTests: facts.tests }, more),
    since: before === null ? now.instant : before.since,
    timeZone: before === null ? now.timeZone : before.timeZone,
    minutes: before === null ? gateNumber('conflict-minutes') : before.minutes,
    ...(before === null ? {} : { replays: { ref: resolvedRefOf(entry.id), commit: held.resolution!.commit } }),
  }
  const { moved, hour, over, whom, written } = handItOn(entry, red, before, actor, {}, {
    what: 'red',
    counted: true,
    late: (minutes, until) => `The ${minutes} minutes ended at ${until}, before these tests were red, so nobody is asked to fix them.`,
  })
  if (before === null) {
    return { entry: readMergeEntry(moved), waits: `It now waits for its own supervisor to fix the red tests, within ${hour.minutes} minutes of ${now.stamp}. ${whom}`, ...written }
  }
  return {
    ...written,
    entry: readMergeEntry(moved),
    waits:
      `The fix its check passed, commit ${held.resolution!.commit.slice(0, 12)}, was red again, so it goes back to its own supervisor in the ${hour.minutes} minutes of its first hand-on, which are never started again: ` +
      (over ? `it ended at ${hour.until}, so the entry bounces as "not fixed in the hour".` : `it ends at ${hour.until}. The clean copy replays that fix with the entry's own commits. ${whom}`),
  }
}

/**
 * WHAT EVERY HAND-ON TO THE ENTRY'S OWN SUPERVISOR DOES, for a conflict and for a red alike: it reads the end of the time
 * given, writes the brief before the move, because it is a file and not a row, and then sends the message that asks and
 * moves the entry in one transaction, with `also` in the same move. A hand-on after the time given has ended asks nobody,
 * in the `late` words. A hand-on after a resolution or fix passed its check (`before`) writes every key of what it held
 * that this one does not as null, which removes it, and takes the passed resolution off. `counted` says that the gate's
 * count was written and kept before this call: its refusals then say so.
 */
function handItOn(
  entry: MergeEntryReading,
  handed: Resolving,
  before: Resolving | null,
  actor: Actor,
  also: Record<string, unknown>,
  words: { what: 'conflict' | 'red'; counted: boolean; late: (minutes: number, until: string) => string },
): { moved: PanelRecord; hour: { minutes: number; until: string }; over: boolean; whom: string; written: { brief?: string } } {
  const red = words.what === 'red'
  const hour = theEndOfResolving(handed)
  if (hour === null || hour.untilMs === null || hour.until === null) {
    throw anEntryWithoutWhatItsStateHolds(
      entry.id,
      'resolving',
      [red ? 'an end of its time to fix that can be read' : 'an end of its time to resolve that can be read'],
      words.counted
        ? `The entry's record is broken. The ${red ? 'red' : 'conflict'} was counted, and the count is kept. The office wrote no brief and sent no asking message, and the entry did not move.`
        : undefined,
    )
  }
  handed.minutes = hour.minutes
  const until = hour.until, untilMs = hour.untilMs
  const over = Date.now() >= untilMs
  // A HAND-ON AFTER ITS TIME HAS ENDED asks nobody: the entry bounces at the next pass, and a brief would ask for a
  // hand-over the door refuses.
  const lateWords = words.late(hour.minutes, until)
  const brief = over ? { noBrief: lateWords } : writeTheResolveBrief(entry, handed, until)
  const recordIt = sqlite.transaction(() => {
    // THE OFFICE ASKS FOR THE AGENT'S ROUND ITSELF WHEN IT HAS NO RUN GOING (13u round 90), in this transaction, so a write
    // that fails takes the ask back with it.
    const round = brief.brief === undefined || brief.agent === undefined || runServing(brief.agent, entry.workspaceId) !== null
      ? {} : { round: { at: nowStamp(), ...askTheDoorAsTheOffice(brief.agent, brief.brief, entry.workspaceId) } }
    const sent = over ? { noMessage: lateWords } : sendTheAskingMessage(entry, handed, { ...brief, ...round }, untilMs, until)
    const asked: AskedToResolve = { ...brief, ...round, ...sent }
    const resolving: Resolving = { ...handed, asked }
    // A WRITE MERGES INTO WHAT IS STORED, so every key of the earlier hand-on, and of whom it asked, that this one does
    // not hold is written as null, which removes it.
    const gone = (old: object | undefined) => Object.fromEntries(Object.keys(old ?? {}).map((key) => [key, null]))
    const askedNow = { ...gone(before?.asked), ...asked, ...(asked.round === undefined ? {} : { round: { ...gone(before?.asked?.round), ...asked.round } }) }
    const replaced = before === null ? { resolving } : { resolving: { ...gone(before), ...resolving, asked: askedNow }, resolution: null }
    return { moved: moveEntry({ id: entry.id, to: 'resolving', actor, also: { ...also, ...replaced } }), asked }
  })
  // THE BRIEF IS WRITTEN BEFORE THE WRITE THAT RECORDS IT, so when that write fails the file is left, and the refusal
  // names it (x2y70-Bc8xmi).
  let done: ReturnType<typeof recordIt>
  try { done = recordIt() } catch (error) {
    if (brief.brief === undefined) throw error
    throw theBriefsLeftBehind(
      [{ entry: entry.id, path: brief.brief }],
      red ? 'recording that it handed the red tests on' : 'recording that it handed the conflict on',
      error,
      words.counted
        ? `The ${red ? 'red' : 'conflict'} was counted, and the count is kept. No asking message was sent and the entry did not move.`
        : 'No message was sent and the entry did not move.',
      red,
    )
  }
  const { moved, asked } = done
  const whom =
    (asked.brief === undefined ? `${asked.noBrief ?? ''} ` : `The office wrote the ${red ? 'fix' : 'resolve'} brief at ${asked.brief}. `) +
    (asked.message === undefined ? `${asked.noMessage ?? ''}` : `It asked in message ${asked.message}.`) +
    (asked.round === undefined ? '' : asked.round.status === 202 ? ` It asked for the round itself, and the door answered: ${asked.round.said}` : ` Its own ask for the round was refused (${asked.round.status}): ${asked.round.said}`)
  return { moved, hour: { minutes: hour.minutes, until }, over, whom, written: asked.brief === undefined ? {} : { brief: asked.brief } }
}

// ============================================================================ door (a): a resolution handed over

/**
 * WHO HANDS OVER THE RESOLUTION OF A RESOLVING ENTRY'S CONFLICT (door (a) of xqGNR20SQ9vO): the entry's own line,
 * as for a submission, and never a worker. The supervisor hands it over after it has judged the worker's work, so an
 * agent whose card is a worker's is refused even when the run is its own. A row that names no role reads as a worker's.
 */
export function whoHandsOverAResolution(workspaceId: string, id: string, actor: Actor): ParticipantRef {
  const entry = readMergeEntry(theMergeEntry(id, workspaceId))
  const run = getRecord(entry.run)
  if (run === null) throw new PanelError(`Merge entry ${id} names run ${entry.run}, which is not a record here, so the office cannot tell who the entry's line is. Nothing was written.`, 500)
  const me = whoIsInTheRunsLine(run, actor, { may: `hand over the resolution of merge entry ${id}`, nobody: 'a resolution would name nobody as who handed it over' })
  if (me.kind === 'agent' && theCardOfAgent(me.id) === THE_WORKERS_CARD) {
    throw new PanelError(`Agent ${me.id} is a worker by its card, and a worker never hands over a resolution: the entry's own supervisor does, after it has judged the worker's work. Nothing was written.`, 403)
  }
  return me
}

/**
 * WHO DECLARES THE SUPERVISOR'S OWN TEST RUN with a hand-over (XHY2fVFG3Qq8, answer 3): `me`, already found in the
 * entry's own line, when it is an agent whose own key proved the name it gave. The run is recorded as that agent's
 * declaration, so a caller the office cannot name by its own key declares none: an agent that sent no key, a key acting
 * for a run its holder started (lib/acting-for.ts), or the person. Any of them may hand over the same resolution without
 * one. An agent's key under another name never gets here: lib/keyheader.ts refuses it before any handler runs.
 */
export function whoDeclaresTheSupervisorsOwnRun(id: string, me: ParticipantRef, actor: Actor): void {
  if (me.kind === 'agent' && actor.provedBy === 'an-agent-key' && actor.provedHolder === undefined) return
  throw new PanelError(
    `Only an agent of merge entry ${id}'s own line whose own key proved its name declares the supervisor's own test run with a hand-over, and ` +
      (me.kind === 'person' ? 'the person is not an agent.' : `the request of agent ${me.id} did not carry that agent's own key.`) +
      ' Hand over without "tests", or send the agent\'s own key. Nothing was written.',
    403,
  )
}

/**
 * THE HAND-OVER OF A RESOLUTION, while the entry is resolving and within its time to resolve, which is never started
 * again. The office reads the folder's HEAD itself and never takes a typed commit. The commit must stand on the main
 * the conflict met, and the files it changes against that main are recorded with their hashes, for the merge tool's
 * check (tools/merge-tool/check-a-resolution.mjs). The field is written with the queue's own mark, and the entry
 * stays resolving, now asking for the merge tool. A later hand-over within the time to resolve replaces the field, so
 * a resolution the check refuses can be tried again. A test run declared with it is recorded as declared, with who
 * and when, and a later hand-over without one drops the earlier one.
 */
export function handOverAResolution(input: { workspaceId: string; id: string; workingDirectory: string; tests?: Omit<DeclaredTestRun, 'by' | 'at'>; actor: Actor; onNothingWritten?: () => void }): { entry: MergeEntryReading; says: string } {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = readMergeEntry(record)
  const me = whoHandsOverAResolution(input.workspaceId, input.id, input.actor)
  if (input.tests !== undefined) whoDeclaresTheSupervisorsOwnRun(input.id, me, input.actor)
  const folder = theDirectory(input.workingDirectory, 'The folder the resolution is in', 400)
  if (entry.state !== 'resolving') {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text}, and a resolution is handed over only while an entry is resolving. Nothing was written.`, 409)
  }
  const held = machineFieldsOf(record)
  const resolving = held.resolving
  const hour = theEndOfResolving(resolving)
  if (resolving === null || hour === null || hour.untilMs === null || hour.until === null) {
    throw anEntryWithoutWhatItsStateHolds(input.id, 'resolving', ['an end of its time to resolve that can be read'])
  }
  // THE SAME BOUNDARY AS 13q's FIX ROUND: the time to resolve is over at its own end, not a millisecond after it.
  if (Date.now() >= hour.untilMs) {
    throw new PanelError(`The ${hour.minutes} minutes for merge entry ${input.id} ended at ${hour.until}: a resolution is handed over within ${hour.minutes} minutes of the conflict, and that time is never started again. Nothing was written.`, 409)
  }
  const mainAt = resolving.mainAt
  if (mainAt === undefined) {
    throw new PanelError(`The conflict that sent merge entry ${input.id} to resolving did not say which main it met, so the office cannot tell which files a resolution changes. Nothing was written.`, 409)
  }
  let commit: string
  try {
    commit = readGit(folder, ['rev-parse', '--verify', 'HEAD^{commit}']).toString('utf8').trim()
  } catch (error) {
    throw new PanelError(`The office could not read the HEAD of ${folder} as a git commit: ${whyGitDidNotAnswer(error)}. Nothing was written.`, 409)
  }
  try {
    readGit(folder, ['merge-base', '--is-ancestor', mainAt, commit])
  } catch (error) {
    // `--is-ancestor` exits 1 for "no" and anything else for a question git could not answer.
    if ((error as { status?: unknown }).status === 1) {
      throw new PanelError(`Commit ${commit} in ${folder} does not stand on main ${mainAt}, where merge entry ${input.id} met its conflict, so it is not a resolution of that conflict. Nothing was written.`, 409)
    }
    throw new PanelError(`The office could not tell whether commit ${commit} in ${folder} stands on main ${mainAt}: ${whyGitDidNotAnswer(error)}. Nothing was written.`, 409)
  }
  let files: Resolution['files']
  try {
    files = theFilesOfACommit(folder, mainAt, commit, false)
  } catch (error) {
    // THE SEAL'S READER REFUSED THE COMMIT in the seal's words, which are wrong at a hand-over, so they are said here as the hand-over's.
    const why = whyTheGitWorkCouldNotBeRead(error)
    if (why === null) throw error
    throw new PanelError(`The office could not read the files commit ${commit} in ${folder} changes against main ${mainAt}, so the resolution of merge entry ${input.id} was not handed over: ${why} Nothing was written.`, 409)
  }
  const at = nowStamp()
  const tests = input.tests
  const resolution: Resolution = { commit, workingDirectory: folder, mainAt, files, by: me, at, ...(tests === undefined ? {} : { tests: { ...tests, by: me, at } }) }
  const before = held.resolution
  // THE HAND-OVER ASKS FOR THE MERGE TOOL'S CHECK, by a move to the state the entry is in: the state writer reads the
  // resolution it now holds and writes the mark. A refusal of the one before is dropped with it, and so is the count of
  // check runs that gave no result, which is for one resolution, and a test run the one before declared that this one
  // does not. A null is sent only over a key that is there: a first resolution is stored whole, so a null in it would be
  // kept.
  const dropped = { ...(before?.refused === undefined ? {} : { refused: null }), ...(before?.tests === undefined || tests !== undefined ? {} : { tests: null }) }
  const written = moveEntry({ id: input.id, to: 'resolving', actor: input.actor, also: { resolution: { ...resolution, ...dropped }, stalls: null }, onNothingWritten: input.onNothingWritten })
  const count = resolution.files.length
  return {
    entry: readMergeEntry(written),
    says:
      `${participantWord(me.kind)} ${me.id} handed over the resolution of merge entry ${input.id}: commit ${commit} in ${folder}, which changes ` +
      `${String(count)} ${count === 1 ? 'file' : 'files'} against main ${mainAt.slice(0, 12)}. ` +
      (before === null ? '' : `It replaces the hand-over of commit ${before.commit.slice(0, 12)} at ${before.at}. `) +
      "The office read the commit itself and recorded each changed file's hash. " +
      (tests === undefined
        ? ''
        : `It recorded the test run ${participantWord(me.kind)} ${me.id} declared, at commit ${tests.commit.slice(0, 12)}, as declared: the office did not run it, and it passes or fails nothing. `) +
      'The entry stays resolving, and the merge tool checks the resolution next.',
  }
}

/**
 * THE ENTRY'S OWN LINE SAYS ITS CONFLICT CANNOT BE RESOLVED. The same askers and the same time to resolve as a
 * hand-over, and only while the entry is resolving. The queue bounces the entry at once as refused and keeps who said
 * it and their sentence on the bounce as `cannot`. `changesWhatOneSideMeant` says keeping both sides would change
 * what one side meant: only then do the facts carry the resolution word "changes what one side meant", and the bounce
 * says so. Without it no resolution word is stored, and the sentence is the reason. A resolution that waits for its
 * check does not stop it.
 */
export function sayTheConflictCannotBeResolved(input: { workspaceId: string; id: string; said: string; changesWhatOneSideMeant: boolean; actor: Actor }): { entry: MergeEntryReading; says: string } {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = readMergeEntry(record)
  const me = whoHandsOverAResolution(input.workspaceId, input.id, input.actor)
  if (entry.state !== 'resolving') {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text}, and a conflict is said to be one that cannot be resolved only while an entry is resolving. Nothing was written.`, 409)
  }
  const resolving = machineFieldsOf(record).resolving
  const hour = theEndOfResolving(resolving)
  if (resolving === null || hour === null || hour.untilMs === null || hour.until === null) {
    throw anEntryWithoutWhatItsStateHolds(input.id, 'resolving', ['an end of its time to resolve that can be read'])
  }
  // THE SAME BOUNDARY AS A HAND-OVER: the time to resolve is over at its own end.
  if (Date.now() >= hour.untilMs) {
    throw new PanelError(`The ${hour.minutes} minutes for merge entry ${input.id} ended at ${hour.until}: a conflict is said to be one that cannot be resolved within ${hour.minutes} minutes of it, as a resolution is handed over, and that time is never started again. Nothing was written.`, 409)
  }
  // RED TESTS THAT CANNOT BE FIXED (13u round 63) bounce the entry as red, with who said it and their sentence. A red has
  // no two sides, so "changesWhatOneSideMeant" is refused, and no resolution word is stored.
  if (resolving.red !== undefined) {
    if (input.changesWhatOneSideMeant) {
      throw new PanelError(`Merge entry ${input.id} was handed on for its red tests, not for a conflict, so there are no two sides whose meaning could change. Say why the tests cannot be fixed without "changesWhatOneSideMeant". Nothing was written.`, 422)
    }
    const red = {
      files: [],
      redTests: [...resolving.red.tests],
      ...(resolving.log === undefined ? {} : { log: resolving.log }),
      ...(resolving.mainAt === undefined ? {} : { mainAt: resolving.mainAt }),
      cannot: { by: { kind: me.kind, id: me.id }, said: input.said },
    }
    const bounced = bounce(entry, 'red', red, `${participantWord(me.kind)} ${me.id} said its red tests cannot be fixed: "${input.said}"`, input.actor)
    return { entry: bounced, says: (bounced.machine['bounced'] as Bounce).says }
  }
  const facts = {
    files: resolving.files,
    ...(resolving.log === undefined ? {} : { log: resolving.log }),
    ...(resolving.mainAt === undefined ? {} : { mainAt: resolving.mainAt }),
    ...(input.changesWhatOneSideMeant ? { resolution: 'changes what one side meant' as const } : {}),
    cannot: { by: { kind: me.kind, id: me.id }, said: input.said },
  }
  const more = `${participantWord(me.kind)} ${me.id} said its conflict cannot be resolved: "${input.said}"`
  const bounced = bounce(entry, THE_REASON_A_RESOLUTION_BOUNCE_KEEPS['changes what one side meant'], facts, more, input.actor)
  return { entry: bounced, says: (bounced.machine['bounced'] as Bounce).says }
}

// ============================================================================ the merge tool's check of a resolution

/** What a refused resolution leaves its supervisor: the time left to resolve, or none, said in one sentence. */
function theHourLeftSays(held: MachineFields, time: TimeLeft): string {
  // A FIX OF RED TESTS (13u round 63) bounces as "not fixed in the hour" when its time ends with the last fix refused.
  if (held.resolving?.red !== undefined) {
    return time.left > 0
      ? `Its own supervisor may hand over another fix until its ${time.minutes} minutes end at ${time.until}.`
      : `Its ${time.minutes} minutes ended at ${time.until}, so no other fix can be handed over, and it bounces as "not fixed in the hour".`
  }
  return time.left > 0
    ? `Its own supervisor may hand over another resolution until its ${time.minutes} minutes end at ${time.until}.`
    : `Its ${time.minutes} minutes ended at ${time.until}, so no other resolution can be handed over, and it bounces as "could not be read".`
}

type TimeLeft = NonNullable<ReturnType<typeof theTimeLeftToResolve>>

/**
 * WHOSE SENTENCE A MESSAGE ABOUT A REFUSAL GIVES (13u round 80, item 21): the check's, when its check run refused the
 * resolution, or the office's, when the office refused it because the check gave no result.
 */
export const WHOSE_REFUSAL_SENTENCE = { theCheck: 'The check said', theOffice: 'The office said' } as const

/**
 * A REFUSED RESOLUTION, OR A REFUSED FIX OF RED TESTS, IS TOLD AT ONCE (13u round 79, item 20). The refusal is written on
 * the resolution and, in the same write, one message goes as the office to the agent the office asked to resolve and to
 * whoever holds the secretary card. It says the check's sentence, the refused commit and the minutes left, read once
 * here by `theTimeLeftToResolve`, and the refusal keeps the message's id, or `noMessage` says why none was sent. The
 * write goes BY THE STATE WRITER, so a mark still standing is taken off by the one rule: a refused resolution waits for
 * nothing.
 *
 * A CHECK THAT ENDED WITH NO RESULT (13u round 80, item 21) is refused here too, by `whatFollowsARunThatEnded`. Then
 * `noResult` holds the count of its runs, written in the same move, and the message says the office refused the
 * resolution because its check gave no result, and gives the office's sentence.
 */
function writeTheRefusal(entry: MergeEntryReading, held: MachineFields, resolution: Resolution, says: string, actor: Actor, noResult?: { stalls: Stalls }): { entry: MergeEntryReading; decided: string } {
  const resolving = held.resolving
  const time = theTimeLeftToResolve(resolving, Date.now())
  if (resolving === null || time === null) throw anEntryWithoutWhatItsStateHolds(entry.id, 'resolving', ['an end of its time to resolve that can be read'])
  const red = resolving.red !== undefined
  const what = red ? 'fix of the red tests' : 'resolution'
  const hourLeft = theHourLeftSays(held, time)
  const decided = `The merge tool's check refused the ${what}, commit ${resolution.commit.slice(0, 12)}, handed over at ${resolution.at}: ${says} The entry stays resolving. ${hourLeft}`
  const asked = resolving.asked?.agent
  const secretary = whoHoldsTheSecretaryCard()
  const to: ParticipantRef[] = [...(asked === undefined ? [] : [{ kind: 'agent' as const, id: asked }]), ...(secretary === null || secretary.id === asked ? [] : [{ kind: 'agent' as const, id: secretary.id }])]
  const written = sqlite.transaction(() => {
    const told =
      to.length === 0
        ? { noMessage: 'The office asked no agent to resolve this entry and nobody holds the secretary card, so no message was sent.' }
        : {
            message: writeAMessage({
              workspaceId: entry.workspaceId,
              to,
              title: `${red ? 'Fix' : 'Resolution'} refused: merge entry ${entry.id}`,
              aboutRun: entry.run,
              actor: THE_OFFICE,
              onlyThem: true,
              notice: 'aResolutionWasRefused',
              body:
                (noResult === undefined
                  ? `The merge tool's check refused the ${what} of merge entry ${entry.id} — ${entry.title}. The entry stays resolving.\n\n` +
                    `${WHOSE_REFUSAL_SENTENCE.theCheck}: ${says}\n`
                  : `The office refused the ${what} of merge entry ${entry.id} — ${entry.title}, because the merge tool's check of it gave no result. The entry stays resolving.\n\n` +
                    `${WHOSE_REFUSAL_SENTENCE.theOffice}: ${says}\n`) +
                `The refused commit: ${resolution.commit}, handed over at ${resolution.at}.\n` +
                (time.left > 0
                  ? `The time left: ${time.left} ${time.left === 1 ? 'minute' : 'minutes'} of its ${time.minutes}, until ${time.until} (${resolving.timeZone}).\n\n`
                  : `The time left: none. Its ${time.minutes} minutes ended at ${time.until} (${resolving.timeZone}).\n\n`) +
                hourLeft,
            }),
          }
    return moveEntry({ id: entry.id, to: 'resolving', actor, also: { ...(noResult === undefined ? {} : { stalls: noResult.stalls }), resolution: { refused: { at: nowStamp(), says, ...told } } } })
  })()
  return { entry: readMergeEntry(written), decided }
}

/**
 * WHICH MERGE ENTRY LANDED EACH OF MAIN'S COMMITS, by the receipts of the repository's merged entries: an entry landed
 * the commits after its `mainBefore`, up to and with its `mainAfter`, on main's first-parent line. A commit no receipt
 * covers is left out, and the scoped check says no merge entry landed it.
 */
function whoLandedTheseCommits(root: string, mainAt: string, commits: readonly string[]): Map<string, string> {
  const landedBy = new Map<string, string>()
  const wanted = new Set(commits)
  if (wanted.size === 0) return landedBy
  const line = readGit(root, ['rev-list', '--first-parent', mainAt]).toString('utf8').split('\n').filter((one) => one !== '')
  const position = new Map(line.map((commit, n) => [commit, n]))
  const receipts = sqlite
    .prepare(
      "SELECT id, json_extract(data, '$.integrated.mainBefore') AS before, json_extract(data, '$.integrated.mainAfter') AS after FROM records " +
        "WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.state') = 'merged' AND json_extract(data, '$.changeset.root') = ? AND json_extract(data, '$.integrated.entry') = id",
    )
    .all(MERGE_ENTRY_KIND, root) as { id: string; before: unknown; after: unknown }[]
  for (const receipt of receipts) {
    if (typeof receipt.before !== 'string' || typeof receipt.after !== 'string') continue
    const newest = position.get(receipt.after)
    if (newest === undefined) continue
    const oldest = position.get(receipt.before) ?? line.length
    for (let n = newest; n < oldest; n += 1) if (wanted.has(line[n]!)) landedBy.set(line[n]!, receipt.id)
  }
  return landedBy
}

// ============================================================================ the next-round door refused the resolve brief

/** Who records that nobody started an entry's resolve brief: whoever holds the secretary card, or the person. Anybody else is refused with 403. */
export function whoRecordsThatNobodyStarted(id: string, actor: Actor): ParticipantRef {
  const me = maySpeakForTheSecretary(actor)
  if (me === null) throw new PanelError(`Only whoever holds the secretary card, or the person, records that nobody started the resolve brief of merge entry ${id}. Nothing was written.`, 403)
  return me
}

/**
 * THE NEXT-ROUND DOOR REFUSED THE RESOLVE BRIEF (message XHY2fVFG3Qq8, answer 5). The secretary's watcher asks that door
 * to start the brief, and only it sees a refusal; a merge entry is written only with the queue's own mark, so the
 * watcher, or the person, tells the queue here. Only while the entry is resolving. The queue writes who, when, the
 * status and the words into `resolving.nobodyStarted`, keeps the rest of `resolving` as it was, and the state does not
 * move. A later one replaces it.
 */
export function recordThatNobodyStarted(input: { workspaceId: string; id: string; status: number; said: string; actor: Actor; onNothingWritten?: () => void }): { entry: MergeEntryReading; says: string } {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = readMergeEntry(record)
  const me = whoRecordsThatNobodyStarted(input.id, input.actor)
  if (entry.state !== 'resolving') {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text}, and that nobody started its resolve brief is recorded only while an entry is resolving. Nothing was written.`, 409)
  }
  const resolving = machineFieldsOf(record).resolving
  if (resolving === null) throw anEntryWithoutWhatItsStateHolds(input.id, 'resolving', ['the conflict it is resolving'])
  const before = resolving.nobodyStarted
  const nobodyStarted: NobodyStarted = { by: me, at: nowStamp(), status: input.status, said: input.said }
  const written = write(input.id, { resolving: { ...resolving, nobodyStarted } }, input.actor, input.onNothingWritten)
  return {
    entry: readMergeEntry(written),
    says:
      `${participantWord(me.kind)} ${me.id} recorded that nobody started the resolve brief of merge entry ${input.id}. ` +
      `The next-round door answered ${String(input.status)}: ${input.said}` +
      (before === undefined ? '' : ` It replaces the record of ${before.at}.`),
  }
}

// ============================================================================ the end of the time to resolve

/**
 * WHERE A RESOLVING ENTRY'S TIME TO RESOLVE STANDS (the secretary's answer 2, and point 5 of the design).
 * It uses the boundary of `handOverAResolution`: the time to resolve is over at its own end, not a millisecond after.
 *
 *   `over` with no resolution          nothing was handed over in time: bounce as `conflict` with the stored word
 *                                      "the hour ran out".
 *   `over` with a resolution refused   the check refused the last resolution: bounce as `conflict` with the stored
 *                                      word "could not be read".
 *   `over` for red tests               no fix was handed over in time, or the check refused the last one: bounce as
 *                                      `red` with the stored word "not fixed in the hour" (13u round 63).
 *   `waits`                            a resolution handed over in time waits for the merge tool's check. Its
 *                                      hand-over time decides this, so the end does not bounce it. The door
 *                                      refuses a late hand-over (the secretary's answer).
 *   `over: false`                      the time to resolve has not ended yet.
 *   `cannotTell`                       the entry's end cannot be read. It is named, not bounced.
 *
 * Called only for a resolving entry: any other state is this file asking the wrong question.
 */
export function whereTheHourOfAResolvingEntryStands(
  record: PanelRecord,
): { over: false; until: string } | { over: true; until: string; resolution: 'the hour ran out' | 'could not be read' | 'not fixed in the hour' } | { waits: true; until: string; handedOverAt: string } | { cannotTell: string } {
  if (record.data['state'] !== 'resolving') {
    throw new Error(`Merge entry ${record.id} is not resolving, so the question about its time to resolve does not belong to it.`)
  }
  const held = machineFieldsOf(record)
  const resolving = held.resolving
  const hour = theEndOfResolving(resolving)
  if (resolving === null || hour === null || hour.untilMs === null || hour.until === null) {
    return { cannotTell: anEntryWithoutWhatItsStateHolds(record.id, 'resolving', ['an end of its time to resolve that can be read']).message }
  }
  if (Date.now() < hour.untilMs) return { over: false, until: hour.until }
  const resolution = held.resolution
  if (resolution !== null && aResolutionWaitsForItsCheck('resolving', resolution)) return { waits: true, until: hour.until, handedOverAt: resolution.at }
  if (resolving.red !== undefined) return { over: true, until: hour.until, resolution: 'not fixed in the hour' }
  return { over: true, until: hour.until, resolution: resolution === null ? 'the hour ran out' : 'could not be read' }
}

/**
 * THE DOOR'S ACT: SAY THAT A RESOLVING ENTRY'S TIME TO RESOLVE IS OVER, AND BOUNCE IT. The queue reads the entry with
 * `theMergeEntry` and decides from what it stores; the caller proves nothing. Each refusal writes nothing, and the
 * order is the one every door of this queue keeps: the entry in this project first, then what it stores.
 */
export function theHourIsOver(input: { workspaceId: string; id: string; actor: Actor }): { entry: MergeEntryReading; says: string } {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = readMergeEntry(record)
  if (entry.state !== 'resolving') {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text}, and only a resolving entry's time to resolve can be over. Nothing was written.`, 409)
  }
  const where = whereTheHourOfAResolvingEntryStands(record)
  const minutes = theEndOfResolving(machineFieldsOf(record).resolving)?.minutes
  if ('cannotTell' in where) throw anEntryWithoutWhatItsStateHolds(input.id, 'resolving', ['an end of its time to resolve that can be read'])
  if (minutes === undefined) throw anEntryWithoutWhatItsStateHolds(input.id, 'resolving', ['an end of its time to resolve that can be read'])
  if ('over' in where && where.over === false) {
    throw new PanelError(`The ${minutes} minutes for merge entry ${input.id} end at ${where.until}, so it is not over. Nothing was written.`, 409)
  }
  if ('waits' in where) {
    throw new PanelError(`Merge entry ${input.id} holds a resolution handed over at ${where.handedOverAt}, inside its ${minutes} minutes, which waits for the merge tool's check, so the end of that time does not bounce it. Nothing was written.`, 409)
  }
  const held = machineFieldsOf(record)
  // `where` says the time to resolve is over: the conflict and, for "could not be read", the refused resolution are
  // what the rule read off this same record. A record that changed between the two
  // readings is a broken assumption, not a guess.
  const resolving = held.resolving
  if (resolving === null) throw new Error(`Merge entry ${input.id} holds no conflict, so the end that was read as passed cannot be said.`)
  // RED TESTS NOT FIXED IN THE HOUR (13u round 63) bounce as red, with the tests, and with the last fix's refusal when
  // the check refused one.
  if (resolving.red !== undefined) {
    const red = {
      files: [],
      redTests: [...resolving.red.tests],
      ...(resolving.log === undefined ? {} : { log: resolving.log }),
      ...(resolving.mainAt === undefined ? {} : { mainAt: resolving.mainAt }),
      resolution: 'not fixed in the hour' as const,
    }
    const resolution = held.resolution
    if (resolution !== null && resolution.refused === undefined) {
      throw new Error(`Merge entry ${input.id} holds a fix that was not refused, so the end that was read as passed cannot be said.`)
    }
    const more =
      resolution === null
        ? `The ${minutes} minutes its own supervisor had to fix the red tests ended at ${where.until}, and no fix was handed over in it.`
        : `The ${minutes} minutes its own supervisor had to fix the red tests ended at ${where.until}. The merge tool's check refused the last fix handed over, commit ${resolution.commit.slice(0, 12)} at ${resolution.at}: ${resolution.refused!.says}`
    const bounced = bounce(entry, 'red', red, more, input.actor)
    gateMet('conflict-minutes', String(minutes))
    return { entry: bounced, says: (bounced.machine['bounced'] as Bounce).says }
  }
  const facts = {
    files: resolving.files,
    ...(resolving.log === undefined ? {} : { log: resolving.log }),
    ...(resolving.mainAt === undefined ? {} : { mainAt: resolving.mainAt }),
    resolution: where.resolution,
  }
  let more: string
  if (where.resolution === 'the hour ran out') {
    more = `The ${minutes} minutes its own supervisor had to resolve the conflict ended at ${where.until}, and no resolution was handed over in it.`
  } else {
    const resolution = held.resolution
    if (resolution === null || resolution.refused === undefined) {
      throw new Error(`Merge entry ${input.id} holds no refused resolution, so the end that was read as passed cannot be said.`)
    }
    more = `The ${minutes} minutes its own supervisor had to resolve the conflict ended at ${where.until}. The merge tool's check refused the last resolution handed over, commit ${resolution.commit.slice(0, 12)} at ${resolution.at}: ${resolution.refused.says}`
  }
  const bounced = bounce(entry, 'conflict', facts, more, input.actor)
  gateMet('conflict-minutes', String(minutes))
  return { entry: bounced, says: (bounced.machine['bounced'] as Bounce).says }
}

/**
 * WHICH RESOLVING ENTRIES IN A PROJECT ARE PAST THE TIME THEIR OWN SUPERVISOR HAD TO RESOLVE, for the message
 * worker's list (`GET /api/worker/merges`). One query for this project's resolving entries, oldest first, as
 * `theMergeToolWork` queries its own; the rule above is run on each. `waits` and `over: false` entries are left out;
 * an entry whose end cannot be read is named in `cannotTell` with the words of the 500 the door would answer.
 */
export function resolvingEntriesWhoseHourIsOver(
  workspaceId: string,
): { over: { entry: string; until: string; resolution: ResolutionBounce }[]; cannotTell: { entry: string; says: string }[] } {
  const rows = sqlite
    .prepare(
      `SELECT id, ${theOrderWritten('records')} AS written FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL ` +
        "AND json_extract(data, '$.state') = 'resolving' ORDER BY written, rowid",
    )
    .all(workspaceId, MERGE_ENTRY_KIND) as { id: string; written: number | null }[]
  const over: { entry: string; until: string; resolution: ResolutionBounce }[] = []
  const cannotTell: { entry: string; says: string }[] = []
  for (const row of eachHasAPlace(rows)) {
    const record = getRecord(row.id)
    if (record === null) continue
    const where = whereTheHourOfAResolvingEntryStands(record)
    if ('cannotTell' in where) {
      cannotTell.push({ entry: row.id, says: where.cannotTell })
      continue
    }
    if ('over' in where && where.over === true) over.push({ entry: row.id, until: where.until, resolution: where.resolution })
  }
  return { over, cannotTell }
}

/**
 * AFTER A LANDING, AN ENTRY STILL WAITING THAT CANNOT JOIN THE NEW MAIN IS SENT BACK (wave 13v round 15), rather than
 * keep its place until the rebase finds the same conflict. Only an entry still pinned or judged at the commit the tool
 * replayed, with lines, and not only in migration files, which the rebase may renumber; or one whose rebase the tool ran
 * with its joins on a scratch copy and saw stop (`rebaseStopped`, wave 13v round 25). Every other is told as before.
 * Each resolve brief a hand-on wrote is added to `briefs` as soon as that hand-on is recorded, so the landing can name
 * the files when its own write fails later (bHtubWembovw).
 */
function bounceWhatCannotJoin(
  workspaceId: string,
  root: string,
  main: string,
  conflicts: readonly { entry: string; tip: string; files: string[]; commit?: string; lines?: ConflictLines; mayRenumber?: true; rebaseStopped?: z.infer<typeof theRebaseStoppedEarly> }[],
  actor: Actor,
  briefs: { entry: string; path: string }[],
): { said: string[]; rest: typeof conflicts } {
  const said: string[] = []
  const rest: (typeof conflicts)[number][] = []
  const handOn = (entry: MergeEntryReading, facts: Parameters<typeof handOnTheConflict>[1], more: string): string => {
    const handed = handOnTheConflict(entry, facts, more, actor, {}, false)
    if (handed.brief !== undefined) briefs.push({ entry: entry.id, path: handed.brief })
    return handed.waits
  }
  for (const conflict of conflicts) {
    const record = getRecord(conflict.entry)
    const entry = record !== null && record.kind === 'merge_entry' && record.workspaceId === workspaceId ? readMergeEntry(record) : null
    const waiting = entry !== null && (entry.state === 'pinned' || entry.state === 'judged') && entry.changeset.adapter === 'git' && entry.changeset.root === root && entry.changeset.commit === conflict.tip
    if (entry !== null && waiting && conflict.rebaseStopped !== undefined) {
      const stopped = conflict.rebaseStopped
      const facts = { files: stopped.files, log: stopped.log, mainAt: main }
      const found = `the queue's rebase, tried early on a scratch copy, stopped in ${stopped.files.join(', ')}, and it was never tested.`
      gateMet('conflict-resolving')
      if (theConflictIsHandedOn(entry)) said.push(`Merge entry ${entry.id}: ${found} ${handOn(entry, facts, foundEarly(stopped, main))}`)
      else {
        bounce(entry, 'conflict', facts, foundEarly(stopped, main), actor)
        said.push(`Merge entry ${entry.id} was sent back: ${found}`)
      }
      continue
    }
    if (entry === null || !waiting || conflict.lines === undefined || conflict.mayRenumber === true) {
      rest.push(conflict)
      continue
    }
    const more = whyItCannotJoin({ mainAt: main, lines: conflict.lines, ...(conflict.commit === undefined ? {} : { commit: conflict.commit }) })
    const facts = { files: conflict.files, mainAt: main }
    const found = `cannot join the new main in ${conflict.files.join(', ')}, and was never tested.`
    gateMet('conflict-resolving')
    if (theConflictIsHandedOn(entry)) said.push(`Merge entry ${entry.id} ${found} ${handOn(entry, facts, more)}`)
    else {
      bounce(entry, 'conflict', facts, more, actor)
      said.push(`Merge entry ${entry.id} was sent back: it ${found}`)
    }
  }
  return { said, rest }
}

// ============================================================================ the deletes of a files entry

/**
 * ASK THE SECRETARY TO CONFIRM THE DELETES, once, when a files entry is pinned. A delete in the main world waits
 * for a secretary's confirmation. The landing step
 * is refused until `deletes.confirmed` is written by `confirmTheDeletes`.
 */
function askAboutTheDeletes(entry: MergeEntryReading, paths: string[]): Deletes {
  const secretary = whoHoldsTheSecretaryCard()
  if (secretary === null) return { paths, asked: null }
  const asked = writeAMessage({
    workspaceId: entry.workspaceId,
    to: [{ kind: 'agent', id: secretary.id }],
    title: `Confirm ${String(paths.length)} ${paths.length === 1 ? 'delete' : 'deletes'} before merge entry ${entry.id} lands`,
    aboutRun: entry.run,
    actor: THE_OFFICE,
    onlyThem: true,
    notice: 'confirmTheDeletes',
    body:
      `Merge entry ${entry.id} — ${entry.title} — deletes ${String(paths.length)} ${paths.length === 1 ? 'file' : 'files'} in ${entry.lane}:\n` +
      paths.map((one) => `- ${one}`).join('\n') +
      '\n\nA delete in the main world waits for your confirmation. The entry cannot land until you confirm: ' +
      `POST /api/merge-queue/${entry.id}/confirm-deletes with {"because":"<one sentence>"}. To refuse, withdraw the entry or tell its submitter.`,
  })
  return { paths, asked }
}

/** The secretary confirms the deletes a files entry carries. SPEC.md and a decision are the
 * rule. */
export function confirmTheDeletes(input: { workspaceId: string; id: string; because: string; actor: Actor }): { entry: MergeEntryReading; says: string } {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = readMergeEntry(record)
  const me = maySpeakForTheSecretary(input.actor)
  if (me === null) {
    throw new PanelError(`Only whoever holds the secretary card, or the person, confirms the deletes of merge entry ${input.id}. Nothing was written.`, 403)
  }
  if (MERGE_STATE_SPECS[entry.state].final) {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text}, which is final, so there is nothing left to confirm. Nothing was written.`, 409)
  }
  const held = machineFieldsOf(record)
  const paths = entry.changeset.adapter === 'files' ? theDeletesOf(entry.changeset) : []
  if (paths.length === 0) throw new PanelError(`Merge entry ${input.id} deletes nothing, so there is nothing to confirm. Nothing was written.`, 409)
  if (held.deletes?.confirmed !== undefined) {
    throw new PanelError(`The deletes of merge entry ${input.id} were already confirmed by ${participantWord(held.deletes.confirmed.by.kind)} ${held.deletes.confirmed.by.id} at ${held.deletes.confirmed.at}. Nothing was written.`, 409)
  }
  const deletes: Deletes = { paths, asked: held.deletes?.asked ?? null, confirmed: { by: me, at: nowStamp(), because: input.because } }
  const written = write(input.id, { deletes }, input.actor)
  return { entry: readMergeEntry(written), says: `${participantWord(me.kind)} ${me.id} confirmed ${String(paths.length)} ${paths.length === 1 ? 'delete' : 'deletes'}: ${input.because}` }
}

/** Why an entry may not land yet because of its deletes, or null because it may. */
function whyTheDeletesHoldIt(entry: MergeEntryReading, held: MachineFields): string | null {
  if (entry.changeset.adapter !== 'files') return null
  const paths = theDeletesOf(entry.changeset)
  if (paths.length === 0 || held.deletes?.confirmed !== undefined) return null
  return (
    `Merge entry ${entry.id} deletes ${String(paths.length)} ${paths.length === 1 ? 'file' : 'files'} (${paths.join(', ')}) and no secretary has confirmed that` +
    `. It lands once POST /api/merge-queue/${entry.id}/confirm-deletes has been pressed by whoever holds the secretary card.`
  )
}

// ============================================================================ the press a sensitive path waits for

/**
 * THE PATHS OF A GIT ENTRY THAT LAND ONLY AFTER A PRESS, in part 4, now. Only those whose
 * content differs from main's, by thePathsThatNeedAPress (wave 13u round 96). The seal is read strictly, so an entry whose
 * seal cannot be read is refused rather than let through. A files entry has none: it lands in a files area, which is
 * never inside a git working tree.
 */
function thePathsToPress(entry: MergeEntryReading, held: MachineFields): string[] {
  if (entry.changeset.adapter !== 'git') return []
  return thePathsThatNeedAPress({
    sealed: Object.keys(theSubmittedContentOf(entry)),
    pinned: held.pressToLand,
    integrated: held.integration === null ? null : Object.keys(held.integration.files),
  })
}

/**
 * WHAT THE PIN FINDS OF A GIT ENTRY'S PATHS THAT LAND ONLY AFTER A PRESS (wave 13u round 96): those whose content differs
 * from main's at the pin, and those main already has with the same content, which are left out. Without main's content
 * every such path the seal names is counted, nothing is left out, and the press says so. Null when the seal names none.
 */
function thePressAtThePin(entry: MergeEntryReading, main: { at: string; files: ContentByPath } | undefined): Pick<Press, 'paths' | 'leftOut'> | null {
  if (entry.changeset.adapter !== 'git') return null
  const submitted = theSubmittedContentOf(entry)
  const sensitive = thePathsThatWaitForAPress(Object.keys(submitted))
  if (sensitive.length === 0) return null
  if (main === undefined) return { paths: sensitive }
  const same = sensitive.filter((path) => main.files[path] === submitted[path])
  return { paths: sensitive.filter((path) => !same.includes(path)), leftOut: { mainAt: main.at, paths: same } }
}

/** The sentence for what the pin left out, or for main's content not compared, or nothing. The pin and the notice both say it. */
function whatThePinLeftOut(press: Pick<Press, 'leftOut'>): string {
  if (press.leftOut === undefined) return "Main's content was not reported at the pin, so every path the seal names that lands only after a press is counted."
  if (press.leftOut.paths.length === 0) return ''
  return `Left out, because main at ${press.leftOut.mainAt} already has the same content: ${press.leftOut.paths.join(', ')}.`
}

/** The paths in a sentence, a line each, with the reason each lands only after a press. */
function thePathsWithTheirReasons(paths: string[]): string {
  return paths.map((one) => `- ${one}: ${whyItLandsAfterAPress(one)!.why}`).join('\n')
}

/**
 * ASK THE SECRETARY TO PRESS, once, when a git entry touching such a path is pinned. The landing step is refused until
 * `pressToLand.pressed` is written by `pressTheEntryToLand`.
 */
function askForThePress(entry: MergeEntryReading, found: Pick<Press, 'paths' | 'leftOut'>): Press {
  const { paths } = found
  const secretary = whoHoldsTheSecretaryCard()
  if (secretary === null) return { ...found, asked: null }
  const leftOut = whatThePinLeftOut(found)
  const asked = writeAMessage({
    workspaceId: entry.workspaceId,
    to: [{ kind: 'agent', id: secretary.id }],
    title: `Press to land merge entry ${entry.id}: it touches ${String(paths.length)} sensitive ${paths.length === 1 ? 'path' : 'paths'}`,
    aboutRun: entry.run,
    actor: THE_OFFICE,
    onlyThem: true,
    notice: 'pressToLand',
    body:
      `Merge entry ${entry.id} — ${entry.title} — touches ${String(paths.length)} ${paths.length === 1 ? 'path that lands' : 'paths that land'} in ${entry.lane} only after a press:\n` +
      thePathsWithTheirReasons(paths) +
      (leftOut === '' ? '' : `\n\n${leftOut}`) +
      '\n\nThese paths keep a person. The entry is checked as any other, ' +
      'but the merge tool does not take its lane, test it or land it until somebody presses: ' +
      `POST /api/merge-queue/${entry.id}/press-to-land with {"because":"<one sentence>"}. The person may press it on the merge queue page instead. ` +
      'To refuse, withdraw the entry or tell its submitter.',
  })
  return { ...found, asked }
}

/** Who presses an entry to land: whoever holds the secretary card, or the person. Anybody else is refused with 403. */
export function whoPressesAnEntryToLand(id: string, actor: Actor): ParticipantRef {
  const me = maySpeakForTheSecretary(actor)
  if (me === null) throw new PanelError(`Only whoever holds the secretary card, or the person, presses merge entry ${id} to land. Nothing was written.`, 403)
  return me
}

/**
 * THE PRESS THAT LETS A SENSITIVE PATH LAND, in part 4, by whoever holds the secretary card or by the person,
 * once. It may come before the pin, because the paths are read off the seal the entry was submitted on.
 */
export function pressTheEntryToLand(input: { workspaceId: string; id: string; because: string; actor: Actor }): { entry: MergeEntryReading; says: string } {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = readMergeEntry(record)
  const me = whoPressesAnEntryToLand(input.id, input.actor)
  if (MERGE_STATE_SPECS[entry.state].final) {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text}, which is final, so there is nothing left to press. Nothing was written.`, 409)
  }
  const held = machineFieldsOf(record)
  const paths = thePathsToPress(entry, held)
  if (paths.length === 0) {
    const leftOut = held.pressToLand?.leftOut
    throw new PanelError(
      leftOut === undefined || leftOut.paths.length === 0
        ? `Merge entry ${input.id} touches no path that waits for a press, so it lands by itself. Nothing was written.`
        : `Merge entry ${input.id} needs no press, so it lands by itself. ${whatThePinLeftOut({ leftOut })} Nothing was written.`,
      409,
    )
  }
  const before = held.pressToLand?.pressed
  if (before !== undefined) {
    throw new PanelError(`Merge entry ${input.id} was already pressed by ${participantWord(before.by.kind)} ${before.by.id} at ${before.at}. Nothing was written.`, 409)
  }
  const pressToLand: Press = { ...(held.pressToLand ?? { paths, asked: null }), pressed: { by: me, at: nowStamp(), because: input.because } }
  const written = write(input.id, { pressToLand }, input.actor)
  return {
    entry: readMergeEntry(written),
    says: `${participantWord(me.kind)} ${me.id} pressed merge entry ${input.id} to land ${String(paths.length)} sensitive ${paths.length === 1 ? 'path' : 'paths'}: ${input.because}`,
  }
}

/** Why an entry may not land yet because nobody has pressed, or null because it may. */
function whyThePressHoldsIt(entry: MergeEntryReading, held: MachineFields): string | null {
  const paths = thePathsToPress(entry, held)
  if (paths.length === 0 || held.pressToLand?.pressed !== undefined) return null
  return (
    `Merge entry ${entry.id} touches ${String(paths.length)} ${paths.length === 1 ? 'path that lands' : 'paths that land'} only after a press (${paths.join(', ')}), ` +
    `and nobody has pressed it yet. It lands once whoever holds the secretary card, or the person, presses POST /api/merge-queue/${entry.id}/press-to-land.`
  )
}

/** The landing's sentence for who pressed and when, or nothing for an entry that needed no press. */
function whoPressedIt(held: MachineFields): string {
  const pressed = held.pressToLand?.pressed
  return pressed === undefined ? '' : ` It lands after the press of ${participantWord(pressed.by.kind)} ${pressed.by.id} at ${pressed.at}: ${pressed.because}`
}

// ============================================================================ a stalled landing asked again

/** The door that asks the office to try a stalled landing again, as a person or an agent would send it. */
export function theRequestToLandAgain(id: string): string {
  return `POST /api/merge-queue/${id}/land-again with the body {"because":"<one sentence>"}`
}

/**
 * WHAT A STALLED LANDING'S NOTICE SAYS ABOUT ASKING AGAIN: the door, for a git entry, and nothing for a files entry,
 * which the door always refuses. Ends with a space when it says something.
 */
function howToAskAgain(entry: MergeEntryReading): string {
  if (entry.changeset.adapter !== 'git') return ''
  return (
    `Once a person has looked, the person or whoever holds the secretary card can ask the office to try again with ${theRequestToLandAgain(entry.id)}; ` +
    'the merge tool then lands it if main is still where the entry was integrated, and otherwise sends it back to be integrated again. ' +
    'Adding "integrateAgain":true to that body sends it back to be integrated again at once, where it may also be withdrawn, ' +
    'and the office does that only while main is still where the entry was integrated. '
  )
}

/**
 * ASK THE OFFICE TO TRY A STALLED LANDING AGAIN. Decision 28Jy1SqzzZut. A landing entry whose merge tool
 * exhausted the tool-runs-in-one-place limit without landing it holds its lane. The office stops asking
 * for its tool, because the main world may already hold part of it (`whatFollowsARunThatEnded`).
 * Once a person has looked, the person or whoever holds the secretary card may ask again, with a reason.
 *
 * THE OFFICE ASKS AGAIN WHEREVER MAIN STANDS, and compares nothing itself (the decision as revised at 04:35 on
 * 26 September 2026). The tool's landing step is the compare-and-swap: resuming an entry in landing (`landGit` in
 * tools/merge-tool/land.mjs), it moves main only when main is exactly `integration.mainAt`, finishes the landing when
 * main is already at the entry's final commit (a main past it is reported as main-moved), and otherwise reports `main-moved`, after which the office sends the
 * entry back to be integrated again. The first reading refused when main had moved, and so left evSmBAPmYXu4 in its
 * lane for good once main was moved by hand under it. The office still reads the checkout's HEAD, through
 * `readGit`, the office's one read-only git reader, but only to say in its reply which of those the tool will
 * meet. The tool's landing resumes from its own state, so a backup that did not finish is run again. A files entry is
 * refused: where a files lane stands is worked out by the merge tool from its own landing plan, which the office does
 * not hold.
 *
 * Everything is checked before anything is written. Then one write clears the count, records who asked, when, why
 * and the main it found, in `stalls.asked`, and marks the entry for its tool as a fresh arrival in landing does.
 *
 * `integrateAgain` IS THE WAY OUT OF THE LANE (round 17c). A landing that fails the same way while main stands still,
 * as aKWEE_-0OCN2's migration did ten times on 10 October 2026, stalls again after every ask, and a landing entry
 * cannot be withdrawn. With `integrateAgain` the office sends the entry back to judged, as a `main-moved` step does:
 * it lets the lane go, takes the test run off it, and queues it to be integrated again on whatever main is then, or
 * to be withdrawn. The office does this only when main is exactly `integration.mainAt`, which it reads itself:
 * then main holds none of the entry, and nothing in the main world is left half landed. Anywhere else, main may
 * hold the entry's final commit, and only the tool's landing step can tell, so the ask without the flag is the door.
 */
export function askAStalledLandingAgain(input: {
  workspaceId: string
  id: string
  because: string
  actor: Actor
  integrateAgain?: boolean
}): { entry: MergeEntryReading; says: string } {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = readMergeEntry(record)
  const me = maySpeakForTheSecretary(input.actor)
  if (me === null) {
    throw new PanelError(`Only whoever holds the secretary card, or the person, asks the office to try the landing of merge entry ${input.id} again. Nothing was written.`, 403)
  }
  const held = machineFieldsOf(record)
  const runs = held.stalls?.runs ?? 0
  if (entry.state !== 'landing' || held.stalls === null || !theOfficeStoppedAskingForTheLandingTool(held.stalls)) {
    const where =
      entry.state !== 'landing'
        ? `is ${stateWord(entry.state).text}, not landing`
        : `is landing, and ${String(runs)} of ${String(gateNumber('tool-runs-in-one-place'))} merge tool runs have ended without landing it, so the office still asks for its tool itself`
    throw new PanelError(
      `Merge entry ${input.id} ${where}. Only a landing whose merge tool the office stopped asking for can be asked again. Nothing was written.`,
      409,
    )
  }
  if (entry.changeset.adapter !== 'git') {
    throw new PanelError(
      `Merge entry ${input.id} is a files entry. The office cannot read where its folder stands, because the merge tool works that out from its own landing plan, ` +
        `so the office cannot tell that the folder holds none of it. Nothing was written.`,
      409,
    )
  }
  if (held.integration === null) throw anEntryWithoutWhatItsStateHolds(input.id, 'landing', ['its integration'])
  const expected = held.integration.mainAt
  const root = entry.changeset.root
  let now: string
  try {
    now = readGit(root, ['rev-parse', '--verify', 'HEAD^{commit}']).toString('utf8').trim()
  } catch (error) {
    throw new PanelError(`The office could not read where main stands in ${root}: ${String(error)}. Nothing was written.`, 409)
  }
  const at = nowStamp()
  // AN AGENT IS NAMED BY ITS HANDLE, which is what a person reads it as; its registry id when it has none.
  const registered = readParticipant(me)
  const who = `the ${participantWord(me.kind)} ${registered !== null && 'handle' in registered ? registered.handle : me.id}`
  const because = /[.!?]$/u.test(input.because) ? input.because : `${input.because}.`
  const asked = { by: me, at, because: input.because, mainAt: now }
  if (input.integrateAgain === true) {
    if (now !== expected) {
      throw new PanelError(
        `Main in ${root} is at ${now}, not at ${expected}, where merge entry ${input.id} was integrated, so the office will not send it back to be ` +
          "integrated by itself: main may already hold the entry's final commit, and only the merge tool's landing step can tell. " +
          `Ask again without "integrateAgain"; the landing step then finishes the landing or sends it back. Nothing was written.`,
        409,
      )
    }
    const says =
      `${who[0]!.toUpperCase()}${who.slice(1)} asked the office at ${at} to send this landing back to be integrated again: ${because} ` +
      `Main in ${root} is still at ${expected}, where the entry was integrated, so main holds none of it. The entry is judged again, ` +
      `let its lane go, and queues to be integrated on main as it will be then; it may also be withdrawn. The count of ${String(runs)} ` +
      'merge tool runs ended with the landing. A migration that a landing ran on the live database before it failed is not undone by this.'
    // TWO WRITES IN ONE TRANSACTION: moveEntry takes the stall count off an entry that changes state, and the second
    // write puts back who asked, why and where main stood, on the new arrival, with its count at none.
    const moved = sqlite.transaction(() => {
      moveEntry({ id: input.id, to: 'judged', actor: input.actor, also: { tested: null } })
      const stalls: Stalls = { runs: 0, says, asked }
      return write(input.id, { stalls }, input.actor)
    })()
    return { entry: readMergeEntry(moved), says }
  }
  // WHAT THE TOOL WILL MEET, said and not decided: its own landing step compares main and moves nothing it should not.
  const whatTheToolDoes =
    now === expected
      ? `Main in ${root} is still at ${expected}, where the entry was integrated, so the merge tool's landing step lands it.`
      : `Main in ${root} is at ${now}, not at ${expected}, where the entry was integrated. The merge tool's landing step finishes the landing if main ` +
        'is already at the entry\'s final commit, and otherwise finds main moved and sends the entry back to be integrated again.'
  const says =
    `${who[0]!.toUpperCase()}${who.slice(1)} asked the office at ${at} to try this landing again: ${because} ${whatTheToolDoes} ` +
    `The office cleared the count of ${String(runs)} merge tool runs and asks for the merge tool again.`
  const stalls: Stalls = { runs: 0, says, asked }
  const moved = moveEntry({ id: input.id, to: 'landing', actor: input.actor, also: { stalls } })
  return { entry: readMergeEntry(moved), says }
}

// ============================================================================ an entry moved to the front of its lane

/** The door that moves an entry to the front of its lane, as a person or an agent would send it. */
export function theRequestToMoveFirst(id: string): string {
  return `POST /api/merge-queue/${id}/first with the body {"because":"<one sentence>"}`
}

/**
 * WHO IS MOVING MERGE ENTRY `id` TO THE FRONT, or the 403 that refuses them with nothing written. The door asks this
 * before it reads the reason, so a caller without the right is told so first, with a body or without one (see
 * qPmul3hThx3o). The door hands the answer to `moveToTheFront`, so the move asks once; a caller of `moveToTheFront`
 * that hands none (a test, or a future door) still gets the same rule asked inside it.
 */
export function whoMovesAnEntryFirst(id: string, actor: Actor): { by: ParticipantRef; underARaise?: string } {
  const me = mayMoveAnEntryFirst(actor)
  if (me !== null) return me
  throw new PanelError(
    `Only the person, proved by their key or the key window, the merge queue's owner by its own key, and a secretary the person has raised, by its own key, may move merge entry ${id} to the front of its lane. ` +
      `${actor.type === 'agent' ? `The agent "${actor.id}"` : `"${actor.id}"`} is none of these${actor.type === 'agent' && actor.provedBy !== 'an-agent-key' ? ', and sent no key of its own' : ''}. ` +
      `${theMergeQueueOwner().says} The person names the merge queue's owner on the Settings page. Nothing was written.`,
    403,
  )
}

/**
 * WHO MAY MOVE AN ENTRY TO THE FRONT, and whether a raise carried it. As the owner's decision has it, with the
 * answers lOBUitZaMl1N and EI3_Msuradr7:
 * - the person, proved (their key, or the key window);
 * - the merge queue's owner, the one agent the person names on the Settings page (`theAgentThatOwnsTheMergeQueue`),
 *   proved by its own key. Not every secretary, since one that could move its own entries could jump the queue;
 * - a secretary the person has raised, by its own key. The raised secretary holds the person's rights except three,
 *   closing the key window, changing the regulations and changing who the owner is, and this is none of
 *   them. Asked last, so the raise is named on the move only when nothing else allowed it.
 * The owner's authority in a test world does not open it: it is neither the person nor the queue's owner. Null for
 * anybody else.
 */
function mayMoveAnEntryFirst(actor: Actor): { by: ParticipantRef; underARaise?: string } | null {
  if (actor.type === 'human') {
    const me = thePersonIsProved(actor) ? participantForActor(actor) : null
    return me === null ? null : { by: me }
  }
  if (actor.type !== 'agent' || actor.provedBy !== 'an-agent-key') return null
  const me = participantForActor(actor)
  if (me === null || me.kind !== 'agent') return null
  if (theAgentThatOwnsTheMergeQueue()?.id === me.id) return { by: me }
  if (aRaiseCarriesIt(actor) && actor.elevation !== undefined) return { by: me, underARaise: actor.elevation.id }
  return null
}

/** The next turn of a move to the front: one more than every move the office holds, so moves keep their order within a second. */
function theNextTurn(): number {
  const row = sqlite
    .prepare("SELECT MAX(CAST(json_extract(data, '$.movedFirst.turn') AS INTEGER)) AS turn FROM records WHERE kind = ? AND json_extract(data, '$.movedFirst') IS NOT NULL")
    .get(MERGE_ENTRY_KIND) as { turn: number | null }
  return (row.turn ?? 0) + 1
}

/** The next turn of a return from a check: one more than every return the office holds, as `theNextTurn` counts moves. */
function theNextReturn(): number {
  const row = sqlite
    .prepare("SELECT MAX(CAST(json_extract(data, '$.returnsFirst.turn') AS INTEGER)) AS turn FROM records WHERE kind = ? AND json_extract(data, '$.returnsFirst') IS NOT NULL")
    .get(MERGE_ENTRY_KIND) as { turn: number | null }
  return (row.turn ?? 0) + 1
}

/**
 * MOVE AN ENTRY TO THE FRONT OF ITS LANE. The entry becomes the next to take its
 * lane: the lane's order puts it first (`inTheLanesOrder`), and the merge tool is not handed a judged entry of its lane
 * while it waits (`whatTheMergeToolWaitsOn`, 'a-moved-entry-goes-first'). Nothing is interrupted: the entry holding the
 * lane keeps it, whatever it is doing, and the riders of the lane's newest bus and the entries that bus passed over for
 * a check still go first (lOBUitZaMl1N). Two moved entries go in the order they were moved.
 *
 * Refused, with nothing written: anybody but the proved person, the queue's owner by its own key or a raised secretary by
 * its own key (403); an entry that
 * is final, that holds its lane now, or that was already moved (409). The door asks who before it reads the reason (400).
 */
export function moveToTheFront(input: {
  workspaceId: string
  id: string
  because: string
  actor: Actor
  /** Who may move it, when the door has already asked. Left out, this function asks the same rule itself. */
  who?: { by: ParticipantRef; underARaise?: string }
}): { entry: MergeEntryReading; says: string } {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = readMergeEntry(record)
  const me = input.who ?? whoMovesAnEntryFirst(input.id, input.actor)
  const spec = MERGE_STATE_SPECS[entry.state]
  if (spec.final) {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text}, which is final, so it is in no line to move up in. Nothing was written.`, 409)
  }
  if (occupiesTheLaneIn(entry.state, entry.returnsFirst)) {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text} and holds its lane now, so it is already first. Nothing was written.`, 409)
  }
  if (entry.movedFirst !== undefined) {
    throw new PanelError(`${entry.movedFirst.says} It cannot be moved again. Nothing was written.`, 409)
  }
  const movedFirst: MovedFirst = { by: me.by, at: nowStamp(), because: input.because, turn: theNextTurn(), ...(me.underARaise === undefined ? {} : { underARaise: me.underARaise }) }
  const written = readMergeEntry(write(input.id, { movedFirst }, input.actor))
  if (!aMoveToTheFrontStands(written)) throw new Error(`Merge entry ${input.id} was moved to the front, and the lane's order does not read the move.`)
  const holder = whoOccupies(written.lane)
  const now =
    holder === null
      ? 'Its lane is free, so it takes the lane as soon as it is judged and the merge tool is started for it.'
      : `Merge entry ${holder.entry} holds the lane and keeps it until it is done.`
  return { entry: written, says: `${written.movedFirst!.says} ${now}` }
}

// ============================================================================ the verdict arrives

/** A pinned entry the verdict now covers becomes judged; one it refused bounces; otherwise it waits. */
function judgeOrBounce(entry: MergeEntryReading, actor: Actor): { entry: MergeEntryReading; says: string } {
  const coverage = theVerdictOnThePinnedContent(entry)
  if (coverage.outcome === 'covers') {
    const release = coverage.release
    const judged = theSubmittedContentOf(entry)
    // A TAKE-BACK AND A SECRETARY'S design/-ONLY ENTRY HAVE NO RELEASE: the rule each rested on is `how`.
    let verdict: Verdict
    if (release === undefined) {
      if (coverage.rule === undefined) throw new Error(`The coverage of merge entry ${entry.id} named neither a release nor a rule, so no verdict was written.`)
      const time = clockStamp()
      verdict = { run: coverage.run!, by: { kind: 'agent', id: THE_OFFICE.id }, at: time.stamp, time, how: coverage.rule, message: null }
    } else {
      verdict = { run: coverage.run!, by: release.by, at: release.at, ...(release.time === undefined ? {} : { time: release.time }), how: release.how, message: release.check }
    }
    const moved = moveEntry({ id: entry.id, to: 'judged', actor, also: { judged, verdict } })
    return { entry: readMergeEntry(moved), says: `${coverage.says} The entry is judged: ${String(Object.keys(judged).length)} ${Object.keys(judged).length === 1 ? 'path' : 'paths'} covered.` }
  }
  if (coverage.outcome === 'refused') {
    return { entry: bounce(entry, 'refused', { files: [] }, coverage.says, actor), says: coverage.says }
  }
  if (coverage.outcome === 'unjudged') {
    const bounced = bounce(entry, 'unjudged', { files: coverage.paths ?? [] }, coverage.says, actor)
    if (coverage.ofAFilesSeal === true) gateMet('files-entry-matches-its-files-seal')
    return { entry: bounced, says: coverage.says }
  }
  return { entry, says: `${coverage.says} The entry stays ${stateWord(entry.state).text}.` }
}

/**
 * A REINSPECTING ENTRY WHOSE SCOPED CHECK RELEASED goes on to testing; one it refused bounces.
 *
 * AN ENTRY THAT LET ITS LANE GO FOR THE CHECK (wave 13u, item 53) goes on to testing only when it would take the lane now
 * as a judged entry would, and main is still the one it was integrated on. Otherwise it goes back to judged with what the
 * check read judged, and with `returnsFirst`, so it is the next to take its lane after the entries moved to the front and
 * the riders of the lane's newest bus. Its integration stays, and no attempt is counted: the merge tool integrates it
 * again on main as main is then, and only the paths whose content changed again are asked about. That check holds the
 * lane (`occupiesTheLaneIn`), so an entry lets its lane go at most once for each verdict.
 */
function testOrBounce(entry: MergeEntryReading, held: MachineFields, asked: Reinspection, actor: Actor): { entry: MergeEntryReading; says: string } {
  const coverage = theVerdictOnTheReinspection(entry, held, asked)
  if (coverage.outcome === 'covers') {
    const release = coverage.release!
    const content = held.integration?.files ?? {}
    const judged: Record<string, string> = { ...(held.judged ?? {}) }
    const handedOn: Record<string, string> = { ...held.handedOn }
    for (const path of asked.only) if (Object.hasOwn(content, path)) judged[path] = content[path]!
    for (const one of asked.needsJudgment) if (Object.hasOwn(content, one.path)) handedOn[one.path] = content[one.path]!
    const reinspected: Reinspected[] = [...held.reinspected, { run: asked.run, only: [...asked.only], needsJudgment: asked.needsJudgment.map((one) => one.path), releasedAt: release.at }]
    const back = entry.occupies === null ? whyItDoesNotTakeTheLaneBack(entry, held) : null
    if (back !== null) {
      const returnsFirst: ReturnsFirst = { run: asked.run, at: nowStamp(), turn: theNextReturn() }
      const moved = moveEntry({ id: entry.id, to: 'judged', actor, also: { judged, handedOn, reinspected, returnsFirst } })
      return {
        entry: readMergeEntry(moved),
        says:
          `${coverage.says} The verdict now covers every path, and the entry let its lane go while it was checked. ${back} ` +
          "So it is judged again, and it is the next to take its lane, after any entry moved to the front and any entry the lane's newest bus lets go first.",
      }
    }
    const moved = moveEntry({ id: entry.id, to: 'testing', actor, also: { judged, handedOn, reinspected } })
    return { entry: readMergeEntry(moved), says: `${coverage.says} The verdict now covers every path; the entry is testing.` }
  }
  if (coverage.outcome === 'refused') {
    // THE CHECK-AGAIN RUN IS ENDED WITH THE BOUNCE, in one transaction (decision yH7W1sXTRY5q,
    // Q3 (a)). Nobody works in that run, so without this it would stand in rebuttal for ever: a
    // rebuttal ends when the worker finishes again or somebody releases it. `howARunStands` reads the
    // ending as closed. A bounce that fails leaves the run unended, and an ending that fails leaves
    // the entry unbounced.
    // A REFUSAL OF A CHECK ASKED ONLY ABOUT FILES ITS SUPERVISOR RESOLVED is read as the resolution changing what one side
    // meant (round B of tier 2, part 6). A check asked about other paths too may have refused any of them, so no word is
    // written, and the bounce says why.
    // A FIX OF RED TESTS (13u round 63) has no two sides, so its refusal carries no resolution word and is not read as one.
    // A resolved file the integrated tree left as main has it was not asked about (problem PRHvQV6YyGQ1), so it is not
    // counted among the files the check was asked about.
    const resolved = held.resolving?.red === undefined ? theFilesItsSupervisorResolved(entry, held).filter((path) => asked.only.includes(path)) : []
    const others = asked.only.filter((path) => !resolved.includes(path))
    const word: { resolution?: ResolutionBounce } = resolved.length > 0 && others.length === 0 ? { resolution: 'changes what one side meant' } : {}
    const read =
      resolved.length === 0
        ? ''
        : others.length === 0
          ? ' The scoped check was asked only about the files its supervisor resolved by hand, so its refusal is read as "changes what one side meant".'
          : ` The scoped check was also asked about ${others.join(', ')}, which no conflict touched, so its refusal is not read as one about the resolution alone, and no resolution word is written.`
    const bounced = sqlite.transaction(() => {
      const moved = bounce(entry, 'refused', { files: [...asked.only], ...(held.integration === null ? {} : { mainAt: held.integration.mainAt }), ...word }, `${coverage.says}${read}`, actor, asked.run)
      const ended: EndedWithItsMergeEntry = {
        entry: entry.id,
        at: nowStamp(),
        because: `Ended with merge entry ${entry.id}, which its refusal bounced; nobody works in a check-again run.`,
      }
      asTheDoorOf(ENDED_WITH_ITS_MERGE_ENTRY, () => patchRecord(asked.run, { dataPatch: { [ENDED_WITH_ITS_MERGE_ENTRY]: ended } }, THE_OFFICE))
      return moved
    })()
    return { entry: bounced, says: coverage.says }
  }
  return { entry, says: `${coverage.says} The entry stays ${stateWord(entry.state).text}.` }
}

/**
 * WHY AN ENTRY THAT LET ITS LANE GO FOR A CHECK DOES NOT TAKE IT BACK AT ITS RELEASE, in the office's sentence, or null
 * when it does. It does not when the merge tool would not be handed it now as a judged entry back from a check, or when
 * an entry landed on the main it was integrated on after it was integrated, so its integration is no longer on top of main.
 *
 * "AFTER" IS THE CHANGE LOG'S ORDER, not a time: the landing's change to `merged` comes after the entry's last change to
 * its integration. Local stamps repeat an hour when the clocks go back, and a landing on the same main before the
 * integration is one main had already moved past, which only a main put back can show.
 */
function whyItDoesNotTakeTheLaneBack(entry: MergeEntryReading, held: MachineFields): string | null {
  const waits = whatTheMergeToolWaitsOn({ ...entry, state: 'judged', returnsFirst: { run: '', at: '', turn: Number.POSITIVE_INFINITY } })
  if (waits !== null) return waits.says
  const mainAt = held.integration?.mainAt
  if (mainAt === undefined) return null
  const landed = sqlite
    .prepare(
      'SELECT r.id AS id FROM records r JOIN changes c ON c.record_id = r.id ' +
        "WHERE r.kind = ? AND r.deleted_at IS NULL AND json_extract(r.data, '$.state') = 'merged' " +
        "AND json_extract(r.data, '$.changeset.root') = ? AND json_extract(r.data, '$.integrated.mainBefore') = ? " +
        "AND c.field = 'data.state' AND c.new_value = 'merged' AND c.append_order > (" +
        "SELECT MAX(append_order) FROM changes WHERE record_id = ? AND (field = 'data.integration' OR field LIKE 'data.integration.%')) " +
        'ORDER BY c.append_order LIMIT 1',
    )
    .get(MERGE_ENTRY_KIND, entry.changeset.root, mainAt, entry.id) as { id: string } | undefined
  return landed === undefined ? null : `Merge entry ${landed.id} landed on ${mainAt}, the main it was integrated on, after it was integrated, so its integration is not on top of main any more.`
}

/** The bounce notice `bounce` wrote on this entry, by message id, read from the entry's `told`; none when nobody was told. */
function theBounceNoticeOf(entryId: string): string[] {
  const told = getRecord(entryId)?.data['told']
  const submitter = isObject(told) && Array.isArray(told['submitter']) ? told['submitter'] : []
  return submitter.filter((one): one is string => typeof one === 'string')
}

/**
 * THE MERGE QUEUE HEARS A VERDICT. Called by the check door after a release or a refusal is written
 * on a run, and by the confirm door after a confirmation, which covers an entry at a review level
 * with no inspector: every pinned entry submitted on that run, and every reinspecting entry whose
 * check again is that run, is moved by what the verdict says. Returns what moved, in words.
 */
export function theMergeQueueHearsAVerdict(input: { runId: string; workspaceId: string; actor: Actor }): {
  /** The entries this verdict moved, and where to. */
  moved: { entry: string; state: string; says: string }[]
  /** The bounce notices this verdict wrote, by message id, so the check door tells nobody the same thing twice. */
  bounceNotices: string[]
  /** The entries that were waiting on a verdict of this run and are still waiting, and why this one is not it. */
  waiting: { entry: string; state: string; says: string }[]
  says: string
} {
  const moved: { entry: string; state: string; says: string }[] = []
  const waiting: { entry: string; state: string; says: string }[] = []
  const bounceNotices: string[] = []
  for (const record of theMergeEntriesACheckOfThisRunIsFor(input.runId, input.workspaceId)) {
    const entry = readMergeEntry(record)
    const held = machineFieldsOf(record)
    let outcome: { entry: MergeEntryReading; says: string } | null = null
    const asked = held.reinspection
    if (entry.state === 'pinned' && entry.run === input.runId) outcome = judgeOrBounce(entry, input.actor)
    else if (entry.state === 'reinspecting' && asked?.run === input.runId) outcome = testOrBounce(entry, held, asked, input.actor)
    if (outcome === null) continue
    if (outcome.entry.state !== entry.state) moved.push({ entry: entry.id, state: outcome.entry.state, says: outcome.says })
    else waiting.push({ entry: entry.id, state: entry.state, says: outcome.says })
    if (outcome.entry.state === 'bounced') bounceNotices.push(...theBounceNoticeOf(outcome.entry.id))
  }
  return {
    moved,
    bounceNotices,
    waiting,
    says:
      moved.length === 0 && waiting.length === 0
        ? 'No merge entry was waiting on this verdict.'
        : [
            ...moved.map((one) => `Merge entry ${one.entry} is now ${stateWord(one.state).text}.`),
            ...waiting.map((one) => `Merge entry ${one.entry} stays ${stateWord(one.state).text}: ${one.says}`),
          ].join(' '),
  }
}

// ============================================================================ the steps

/** The scope of a check again, worked out from what the verdict covered and what the tool reports now. */
function whatNeedsACheckAgain(
  entry: MergeEntryReading,
  held: MachineFields,
  files: ContentByPath,
  checker: CheckerReport | undefined,
  lines: readonly LinesOfAFile[] = [],
): { only: string[]; needsJudgment: PathThatNeedsJudgment[]; kept: string[]; keptByLine: LinesOfAFile[]; plugin: ThePluginRule | null; notRead: string[] } {
  if (held.judged === null) throw anEntryWithoutWhatItsStateHolds(entry.id, 'integrating', ['its judged content'])
  const { kept, changed, keptByLine } = whatChangedSinceTheVerdict(held.judged, files, lines)
  const decided = new Set((checker?.decided ?? []).filter((one) => one.ok).map((one) => one.path))
  // A GIT ENTRY'S OWN RELEASE ALREADY JUDGED A HANDED-ON PATH WHEN IT WAS TOLD ABOUT IT AND READ THESE BYTES.
  // A queue finding of 23 September 2026 (entry WOar71xCbL9D): the check of a run touching design/ was
  // handed the protected paths with --needs-judgment and released them, and the queue still asked a scoped
  // check of exactly those paths at the same content, because only a scoped release was ever matched. That
  // is a second model run for bytes a model had judged, and a wait on a check nothing starts (finding 35).
  // The verdict follows file content: a path the release named in `read.needsJudgment`, whose
  // integrated content is still the content it judged, keeps that verdict. A files entry is held to the
  // stricter rule of A2 at the integrate step instead, which also asks for the model's own line.
  const toldAtTheVerdict = entry.changeset.adapter === 'git' ? new Set((theReleaseOfTheRun(entry)?.read?.needsJudgment ?? []).map((one) => one.path)) : new Set<string>()
  // A SECRETARY'S design/-ONLY ENTRY IS COVERED BY ITS RULE FOR EVERY design/ PATH, handed on or
  // changed on top of main, so none is asked about again. A path outside design/ is not covered, and is asked as before.
  const takeBackRule = isATakeBack(entry)
  const byTheRule = isASecretarysDesignEntry(entry)
  const coveredByTheRule = (path: string): boolean => (byTheRule && path.startsWith(THE_SECRETARYS_FOLDER)) || (takeBackRule && entry.takeBackOf!.paths.includes(path))
  // A PLUGIN-ONLY ENTRY THAT LEAVES ITS MANIFEST ALONE IS NOT READ BY A CHECK, in wave 13x round 17. A file of its
  // plugin whose content changed since the verdict asks for no check again: that check would read none of
  // it. The plugin rule is read off the paths the integrate step recorded, the same base as the tested step
  // (problem gy40yKomK_FQ; message wqd6E-wVJHSr): the seal can still hold an earlier round of the same branch that
  // landed after it was cut. One that changes its manifest is read, and asks as before.
  const plugin = entry.changeset.adapter === 'git' ? thePluginRuleOf(Object.keys(files)) : null
  const notReadByThePluginRule = (path: string): boolean =>
    plugin !== null && !plugin.read && plugin.plugin !== null && path.startsWith(`${PLUGINS_FOLDER}/${plugin.plugin.id}/`)
  const handed: PathThatNeedsJudgment[] = []
  for (const one of whatTheInspectorIsHandedOn(entry, checker)) {
    if (!Object.hasOwn(files, one.path)) {
      throw new PanelError(`The checker handed on ${one.path}, which the integrate step does not list among the changed paths. Nothing was written.`, 422)
    }
    if (held.handedOn[one.path] === files[one.path]) continue
    if (toldAtTheVerdict.has(one.path) && held.judged[one.path] === files[one.path]) continue
    if (coveredByTheRule(one.path)) continue
    handed.push({ path: one.path, why: one.why })
  }
  const notRead = changed.filter((path) => !decided.has(path) && !coveredByTheRule(path) && notReadByThePluginRule(path)).sort()
  const only = [...new Set([...changed.filter((path) => !decided.has(path) && !coveredByTheRule(path) && !notReadByThePluginRule(path)), ...handed.map((one) => one.path)])].sort()
  return {
    only,
    needsJudgment: handed,
    kept,
    keptByLine: keptByLine.filter((one) => !handed.some((other) => other.path === one.path)),
    plugin: plugin === null || plugin.plugin === null ? null : plugin,
    notRead,
  }
}

/**
 * THE FILES ITS SUPERVISOR RESOLVED BY HAND, for an entry whose resolution the merge tool's check passed, and none for any
 * other entry (round B of tier 2, part 6): every file of the conflict that sent it to resolving, and every file a place
 * of the check names, since the replay can stop again on a later commit. For a fix of red tests (13u round 63), every
 * file the check found the fix changes on top of the replay.
 */
function theFilesItsSupervisorResolved(entry: MergeEntryReading, held: MachineFields): string[] {
  const checked = held.resolution?.checked
  if (checked === undefined) return []
  if (held.resolving === null) throw anEntryWithoutWhatItsStateHolds(entry.id, entry.state, ['the conflict its checked resolution resolved'])
  return [...new Set([...held.resolving.files, ...checked.places.map((one) => one.path), ...(checked.fixed ?? [])])].sort()
}

/**
 * WHAT THE SCOPED CHECK IS ASKED OF ONE FILE ITS SUPERVISOR RESOLVED (round B of tier 2, part 6; 8AJQD_oExaVt): one
 * needs-judgment item, which sets out each place of the file the check listed with the five things the inspector reads.
 * Those are the ancestor's lines, main's side with the merge entry that landed each of its commits, the entry's side,
 * the resolution, and the related tests: the supervisor's own run as it declared it with the hand-over, or that it
 * declared none. The list takes one item per path, so a file of two places is one item. A file
 * an earlier resolution resolved says so, and that it is judged again in full (jmghLKcXenGW, addition 1). A file
 * of a fix of red tests (13u round 63) has no places: the question is whether the fix keeps what the entry meant.
 */
function whatTheCheckIsAskedOfAResolvedFile(entryId: string, path: string, checked: NonNullable<Resolution['checked']>, before?: Resolving['resolvedBefore'], tests?: DeclaredTestRun, red?: NonNullable<Resolving['red']>): PathThatNeedsJudgment {
  const indented = (side: SideOfAPlace): string =>
    [...(side.lines.length === 0 && side.more === 0 ? ['(no lines)'] : side.lines), ...(side.more === 0 ? [] : [`(${String(side.more)} more ${side.more === 1 ? 'line' : 'lines'}, not carried by the check)`])]
      .map((line) => `    ${line}`)
      .join('\n')
  const landed = (one: { commit: string; entry: string | null }): string => `${one.commit.slice(0, 12)}, ${one.entry === null ? 'which no merge entry landed' : `landed by merge entry ${one.entry}`}`
  const places = checked.places.filter((one) => one.path === path)
  const more = checked.morePlaces ?? 0
  // THE SUPERVISOR'S OWN TEST RUN IS EVIDENCE ONLY (XHY2fVFG3Qq8, answer 3): it is shown as declared, and nothing
  // here or in the queue reads its exit code or its counts.
  const declared =
    tests === undefined
      ? "Related tests, the supervisor's own run, as declared: none was declared with this hand-over."
      : `Related tests, the supervisor's own run, as declared: it ran at commit ${tests.commit.slice(0, 12)}, which the merge tool's check found is the resolution's, ` +
        `exited with ${String(tests.exit)}, and counted ${String(tests.counts.passed)} passed and ${String(tests.counts.failed)} failed. Its log is at ${tests.log}. ` +
        `It was declared by ${participantWord(tests.by.kind)} ${tests.by.id} at ${tests.at}. ` +
        'The office did not run these tests or read the log. This is evidence for your judgment, never a pass or a fail.'
  if (red !== undefined) {
    return {
      path,
      why: [
        `Merge entry ${entryId} was red only with its own change in ${red.tests.join(', ')}, and its own supervisor fixed that by hand in this file, in a commit on top of the entry's own commits. ` +
          "The merge tool's check found that the fix leaves the entry's own commits as they were replayed. " +
          'It cannot tell whether the fix keeps what the entry meant and does not weaken, skip or delete a test: that is the judgment asked here. ' +
          'If it changes what the entry meant, or weakens, skips or deletes a test, refuse, and name what it changed.',
        declared,
      ].join('\n\n'),
    }
  }
  return {
    path,
    why: [
      `Merge entry ${entryId} met a conflict in this file, and its own supervisor resolved it by hand. The merge tool's check found that the resolution changes nothing outside the places git left in conflict. ` +
        'It cannot tell whether what the resolution put inside each place keeps what both sides meant: that is the judgment asked here. If keeping both sides changes what one side meant, refuse, and name the place.',
      ...(before === undefined || !before.files.includes(path)
        ? []
        : [`This file was resolved before, in commit ${before.commit.slice(0, 12)} against main ${before.mainAt.slice(0, 12)}, which the merge tool's check passed and which then met main moving. Its supervisor may have reused that resolution here. It is judged again, in full: no earlier judgment of it stands in for this one.`]),
      ...places.flatMap((place, n) => [
        `Place ${String(n + 1)} of ${String(places.length)}, from line ${String(place.at)} of the conflicted file: the conflict met the entry's commit ${place.entryCommit.slice(0, 12)}, ` +
          (place.resolvedIn === null
            ? "and no commit of the resolution resolved it. The resolution took main's side, which left that commit with no change, so git dropped it."
            : `and commit ${place.resolvedIn.slice(0, 12)} resolved it.`) +
          (place.ambiguous === true ? ' Where this place ends is a reading, not a fact: the lines between it and the next place also stand in the resolution.' : ''),
        `The ancestor's lines:\n${indented(place.ancestor)}`,
        `Main's side:\n${indented(place.main)}\n` +
          (place.mainBy === 'lines' ? "Main's commits that wrote these lines: " : "Main's commits that changed this file, because its lines could not be traced: ") +
          (place.mainCommits.length === 0 ? 'none the check could name.' : `${place.mainCommits.map(landed).join('; ')}.`),
        `The entry's side:\n${indented(place.entry)}`,
        `The resolution:\n${indented(place.resolution)}`,
      ]),
      ...(places.length === 0 ? ['The check listed no place in this file.'] : []),
      ...(more === 0 ? [] : [`The check counted ${String(more)} more ${more === 1 ? 'place' : 'places'}, in this file or another, that it did not list. The change below is the whole change of this file.`]),
      declared,
    ].join('\n\n'),
  }
}

/**
 * THE SCOPE A HAND-OVER ADDS TO A CHECK AGAIN (round B of tier 2, part 6): every file its supervisor resolved goes to the
 * scoped check before the suite at every integration, whatever content the verdict or an earlier release read. What
 * `handedOn` holds does not say which question the release that wrote it answered, and one written before the conflict
 * never asked about the resolution. A checker's own item for the same path keeps its reason, with the resolution's after
 * it. A resolved file the integrated tree leaves as main has it is `asMainHasIt`: it lands as main's own, so nothing of
 * the resolution is in it to judge, and no scoped check could read it, since a scoped check reads only paths the tree
 * changes on main (problem PRHvQV6YyGQ1: such a file used to bounce the entry as unjudged).
 */
function whatAHandOverAddsToTheScope(
  entry: MergeEntryReading,
  held: MachineFields,
  scope: { only: string[]; needsJudgment: PathThatNeedsJudgment[]; kept: string[]; keptByLine: LinesOfAFile[] },
  files: ContentByPath,
): { only: string[]; needsJudgment: PathThatNeedsJudgment[]; kept: string[]; keptByLine: LinesOfAFile[]; resolved: string[]; asMainHasIt: string[] } {
  const checked = held.resolution?.checked
  const all = theFilesItsSupervisorResolved(entry, held)
  const asMainHasIt = all.filter((path) => !Object.hasOwn(files, path))
  const resolved = all.filter((path) => Object.hasOwn(files, path))
  if (checked === undefined || resolved.length === 0) return { ...scope, resolved, asMainHasIt }
  const items = new Map(scope.needsJudgment.map((one) => [one.path, one]))
  for (const path of resolved) {
    const asked = whatTheCheckIsAskedOfAResolvedFile(entry.id, path, checked, held.resolving?.resolvedBefore, held.resolution?.tests, held.resolving?.red)
    const byTheChecker = items.get(path)
    items.set(path, byTheChecker === undefined ? asked : { path, why: `${byTheChecker.why}\n\n${asked.why}` })
  }
  return {
    only: [...new Set([...scope.only, ...resolved])].sort(),
    needsJudgment: [...items.values()],
    kept: scope.kept.filter((path) => !resolved.includes(path)),
    keptByLine: scope.keptByLine.filter((one) => !resolved.includes(one.path)),
    resolved,
    asMainHasIt,
  }
}

/**
 * WHICH WAY THE PLUGIN RULE WENT AT THE INTEGRATE STEP, for a plugin-only entry, and nothing for any other entry: the
 * changed files of its plugin it asks no check again for, and the rule's own sentence.
 */
function thePluginRuleSays(scope: { plugin: ThePluginRule | null; notRead: string[] }): string {
  if (scope.plugin === null) return ''
  const n = scope.notRead.length
  const asked = n === 0 ? '' : `${String(n)} changed ${n === 1 ? 'file asks' : 'files ask'} for no check again by the plugin rule (${scope.notRead.join(', ')}). `
  return `${asked}${scope.plugin.says} `
}

/**
 * THE OFFICE ASKS FOR A CHECK AGAIN. It files a run of the submitting agent at the integrated tree —
 * sealed at that tip against the main world it was put on — and asks for a scoped check of it the
 * way every check is asked for. The run says on its record what it is.
 */
function askForACheckAgain(entry: MergeEntryReading, facts: FactsOf<'integrated'>, scope: { only: string[]; needsJudgment: PathThatNeedsJudgment[] }, resolved: readonly string[] = []): Reinspection {
  const run = getRecord(entry.run)
  const agent = run === null ? null : theAgentOfARun(run)
  if (agent === null) {
    throw new PanelError(
      `Merge entry ${entry.id} needs a check again of ${scope.only.join(', ')}, and run ${entry.run} names no registered agent to serve it. Nothing was written.`,
      409,
    )
  }
  // A FILES ENTRY NEVER GETS HERE: the integrate step bounces it first (`noCheckCanReadIt`). Arriving here
  // with one is this file being wrong, and it says so rather than filing a check nobody can make.
  if (entry.changeset.adapter !== 'git') throw new Error(`Merge entry ${entry.id} is a files entry, and a check again is asked for git entries only.`)
  if (facts.clone === undefined) {
    throw new PanelError(`Merge entry ${entry.id} needs a check again of ${scope.only.join(', ')}, and the integrate step named no clone to check. Nothing was written.`, 422)
  }
  const n = scope.only.length
  const session = createRecord({
    kind: 'session',
    title: `Check again for merge entry ${entry.id}: ${String(n)} ${n === 1 ? 'path' : 'paths'} on top of ${facts.mainAt.slice(0, 12)}`,
    workspaceId: entry.workspaceId,
    actor: THE_OFFICE,
    data: {
      state: 'finished',
      servingAgent: agent.handle,
      // THE REGISTRY ID BESIDE THE HANDLE (criterion I7). `servingAgent` stays the handle so every
      // older reader keeps working; this is the agent's own id, which is what outlives a rename.
      servingAgentId: agent.id,
      workingDirectory: facts.clone,
      cutFrom: facts.mainAt,
      doing:
        `The merge queue's check again of merge entry ${entry.id}: the entry was put on top of the main world at ${facts.mainAt} as ${facts.result}, ` +
        (resolved.length === 0
          ? `and ${String(n)} ${n === 1 ? 'path' : 'paths'} came out with content no verdict has read (${scope.only.join(', ')}). `
          : `and ${String(n)} ${n === 1 ? 'path needs' : 'paths need'} judging (${scope.only.join(', ')}), of which its supervisor resolved ${resolved.join(', ')} by hand. `) +
        'Nobody ran this; the office filed it for the check.',
      extra: { purpose: 'reinspection', mergeEntry: entry.id },
    },
  })
  const asked = theOfficeStartsTheCheck({ runId: session.id, workspaceId: entry.workspaceId, actor: THE_OFFICE, scope })
  const askedAt = nowStamp()
  const told = tellTheSubmitterOfTheCheckAgain({ entry, run: session.id, clone: facts.clone, mainAt: facts.mainAt, scope, askedAt, asked, startedBy: agent.startedBy })
  return {
    run: session.id,
    only: [...scope.only],
    needsJudgment: scope.needsJudgment.map((one) => ({ path: one.path, why: one.why })),
    askedAt,
    says: `${asked === null ? `The office asked for no check of run ${session.id}: it did not read as an unreleased finish.` : asked.says} ${told}`,
  }
}

/** One word for a POSIX shell, in single quotes, so a path or a sentence with spaces or quotes stays one word. */
function shellWord(word: string): string {
  return /^[A-Za-z0-9_./:@=-]+$/u.test(word) ? word : `'${word.replaceAll("'", `'\\''`)}'`
}

/**
 * The headers a command sends to the office as one agent of one project, as curl words. The agent's own key
 * goes too when MOLE_AGENT_KEY holds one, the one variable an agent's tools read it from
 * (`theAgentKey` in tools/sandbox-common.mjs); an empty key header would be refused, so none is sent without it.
 */
function asAgentHeaders(workspaceId: string, handle: string): string {
  return [
    ...['content-type: application/json', `x-mole-office-workspace: ${workspaceId}`, 'x-mole-office-actor-type: agent', `x-mole-office-actor-id: ${handle}`].map((header) => `-H ${shellWord(header)}`),
    `\${MOLE_AGENT_KEY:+-H "${KEY_HEADER}: $MOLE_AGENT_KEY"}`,
  ].join(' ')
}

/**
 * THE COMMANDS THAT RUN A CHECK AGAIN BY HAND, every argument filled in (problem jaEGPrS3cVxe). They are the
 * check the secretary ran by hand on 25 September 2026 for run nEArfwWrgLaA: a session filed for the check, serving the
 * inspector, and then the check tool, in the office's own checkout so it reads the office's key there, with the
 * scope the office asked for. The tool's own usage says what each option does (tools/the-inspector.mjs).
 */
function theCommandsThatRunACheckAgain(input: {
  api: string
  workspaceId: string
  entry: string
  run: string
  clone: string
  inspector: string
  filedBy: string
  scope: { only: string[]; needsJudgment: PathThatNeedsJudgment[] }
}): string {
  const session = {
    kind: 'session',
    title: `Check again of run ${input.run} for merge entry ${input.entry}, run by hand`,
    data: {
      state: 'running',
      runtime: 'claude-code',
      servingAgent: input.inspector,
      workingDirectory: input.clone,
      doing: `checking run ${input.run} again, by hand, for merge entry ${input.entry}`,
      extra: { purpose: 'inspection', inspectionRun: input.run },
    },
  }
  const list = input.scope.needsJudgment.length === 0 ? null : JSON.stringify({ needsJudgment: input.scope.needsJudgment.map((one) => ({ path: one.path, why: one.why })) })
  return [
    `cd ${shellWord(REPO_ROOT.replace(/\/$/u, ''))}`,
    `CHECK_SESSION=$(curl -sS --fail-with-body -X POST ${shellWord(`${input.api}/api/records`)} ${asAgentHeaders(input.workspaceId, input.filedBy)} --data-binary ${shellWord(JSON.stringify(session))} | node -e ${shellWord('let s="";process.stdin.on("data",(d)=>{s+=d}).on("end",()=>{process.stdout.write(JSON.parse(s).record.id)})')})`,
    ...(list === null ? [] : [`NEEDS_JUDGMENT=$(mktemp) && printf '%s' ${shellWord(list)} > "$NEEDS_JUDGMENT"`]),
    [
      // THE DATABASE THIS SERVER OPENED, as the message worker hands it to the check tool (`envFor`,
      // src/worker/runtimes/adapter.ts): the tool finds the office's key beside it, and the check doors ask for a key.
      `MOLE_OFFICE_DB=${shellWord(databaseFileStatus().path)} node tools/the-inspector.mjs`,
      `--run ${shellWord(input.run)}`,
      `--as ${shellWord(input.inspector)}`,
      '--check "$CHECK_SESSION"',
      `--api ${shellWord(input.api)}`,
      `--workspace ${shellWord(input.workspaceId)}`,
      `--checkout ${shellWord(input.clone)}`,
      `--only ${input.scope.only.map(shellWord).join(' ')}`,
      ...(list === null ? [] : ['--needs-judgment "$NEEDS_JUDGMENT"']),
      // THE CHECK'S SESSION ENDS AS THE MESSAGE WORKER ENDS ITS OWN (`sayHowItEnded`, src/worker/index.ts):
      // finished when the tool ended well, crashed when it did not. Nothing else would end it.
      '&& ENDED=finished || ENDED=crashed',
    ].join(' '),
    `curl -sS --fail-with-body -X PATCH ${shellWord(`${input.api}/api/records/`)}"$CHECK_SESSION" ${asAgentHeaders(input.workspaceId, input.filedBy)} --data-binary "{\\"dataPatch\\":{\\"state\\":\\"$ENDED\\"}}"`,
  ].join('\n')
}

/** The command that confirms a released run, sent as one agent, with the sentence the agent puts in BECAUSE. */
function theCommandThatConfirms(input: { api: string; workspaceId: string; run: string; by: string }): string {
  return (
    `node -e ${shellWord('process.stdout.write(JSON.stringify({ because: process.argv[1] }))')} "$BECAUSE" | ` +
    `curl -sS --fail-with-body -X POST ${shellWord(`${input.api}/api/checks/${input.run}/confirm`)} ${asAgentHeaders(input.workspaceId, input.by)} --data-binary @-`
  )
}

/**
 * THE SUBMITTER IS TOLD OF THE CHECK AGAIN (problem jaEGPrS3cVxe). The office's own notice goes to the inspector
 * and the run's group, and while the message worker is off nothing starts the check: twice on 25 September 2026
 * the lane waited over an hour, and nobody who could start the check was told. So this notice goes to whoever
 * queued the entry. An agent gets the commands that run the check by hand. The person gets the words and no
 * command, because nothing that is theirs to do is a command in a terminal (chapter 10, rule 4), and whoever holds
 * the secretary card gets the same notice with the commands (the supervisor's answer PW244qlEtT62). Where the
 * office asked no inspector, or this server cannot read the address it answers on, the notice says why it gives
 * no command.
 *
 * Returns the sentence the entry's `reinspection.says` carries about it.
 */
function tellTheSubmitterOfTheCheckAgain(input: {
  entry: MergeEntryReading
  run: string
  clone: string
  mainAt: string
  scope: { only: string[]; needsJudgment: PathThatNeedsJudgment[] }
  askedAt: string
  asked: TheCheckTheOfficeAskedFor | null
  /** Who started the run's agent: the one a release of the run reports to, and so the one who confirms it. */
  startedBy: ParticipantRef | null
}): string {
  const { entry, run, asked } = input
  const n = input.scope.only.length
  const changed =
    `Putting it on top of the main world at ${input.mainAt} changed ` +
    `${String(n)} ${n === 1 ? 'path' : 'paths'} that no verdict has read: ${input.scope.only.join(', ')}. The office filed run ${run} for a scoped check of ` +
    `${n === 1 ? 'that path' : 'those paths'}, at ${input.askedAt}.`
  // AN ENTRY BACK FROM AN EARLIER CHECK HOLDS ITS LANE through this one; every other entry lets it go (wave 13u, item 53).
  const what =
    entry.returnsFirst !== undefined
      ? `Merge entry ${entry.id} holds its lane in ${stateWord('reinspecting').text}. ${changed} It let its lane go once for an earlier check, so it holds it through this one. ` +
        `Until a check of run ${run} releases or refuses it, no other entry can take the lane.`
      : `Merge entry ${entry.id} let its lane go while a check of it runs, so other entries of the lane may land meanwhile. ${changed} ` +
        `When a check of run ${run} releases it, it takes the lane back if the lane is free and main has not moved. Otherwise it is judged again, ` +
        "and it is the next to take its lane, after any entry moved to the front and any entry the lane's newest bus lets go first."
  const whoStartsIt = 'Only the message worker starts a check by itself, and only while it runs.'
  const inspector = theInspectorItWasAskedOf(asked)
  const whatTheOfficeDid =
    asked === null
      ? `The office asked nobody to check run ${run}: it did not read as an unreleased finish.`
      : inspector !== null
        ? `The office asked ${inspector} for the check${asked.message === undefined ? '' : `, in message ${asked.message}`}.`
        : `What the office did about the check: ${asked.says}`
  const at = theAddressThisProcessAnswersOn()

  /** The notice for one agent, with the commands filled in under its own name where they can be given. */
  const forAnAgent = (reader: { id: string; handle: string }): string => {
    if (inspector === null) return `${what}\n\n${whatTheOfficeDid}\n\nNo command is given here, because the office asked no inspector for this check.`
    if (at === null) return `${what}\n\n${whatTheOfficeDid}\n\n${whoStartsIt} No command is given here, because this server answers on no address it can read.`
    const api = addressText(at)
    const starter = input.startedBy === null ? null : input.startedBy.kind === 'agent' ? theOneAgentAStringNames(sqlite, input.startedBy.id) : 'the person'
    const send = (by: string): string => `Set the shell variable BECAUSE to one sentence saying what you read in the release, then send:\n\n${theCommandThatConfirms({ api, workspaceId: entry.workspaceId, run, by })}`
    const confirm =
      starter === 'the person'
        ? `After a release, run ${run} stays open until the person confirms it on its page, because the release reports to the person.`
        : starter === null && input.startedBy !== null
          ? `After a release, run ${run} stays open until whoever the release reports to confirms it. No single registered agent answers to ${input.startedBy.id}, so no command is given for it.`
          : starter === null
            ? `After a release, run ${run} stays open until somebody confirms it. The release names nobody it reports to, so any registered agent may. ${send(reader.handle)}`
            : starter.id === reader.id
              ? `After a release, run ${run} stays open until you confirm it, because the release reports to you. ${send(reader.handle)}`
              : `After a release, run ${run} stays open until ${starter.handle} confirms it, because the release reports to ${starter.handle}. The command is ${starter.handle}'s to send. ${send(starter.handle)}`
    return (
      `${what}\n\n${whatTheOfficeDid}\n\n${whoStartsIt} ` +
      `GET ${api}/api/merge-queue/${entry.id} says whether a check of run ${run} is recorded as started. ` +
      `If none is, these commands run it by hand, from a shell on this machine. The first files a session for the check. The tool line runs the check tool as ${inspector}, ` +
      `in the office's checkout, on the merge clone, with the office's key read beside the office's database. The last marks the check's session finished, or crashed when the tool failed. ` +
      `Each curl command sends your own key when MOLE_AGENT_KEY holds it:\n\n` +
      `${theCommandsThatRunACheckAgain({ api, workspaceId: entry.workspaceId, entry: entry.id, run, clone: input.clone, inspector, filedBy: reader.handle, scope: input.scope })}\n\n` +
      `${entry.returnsFirst !== undefined ? `A release that covers ${n === 1 ? 'this path' : 'these paths'} moves the entry on to ${stateWord('testing').text}` : 'A release that covers them moves the entry on as said above'}; a refusal bounces it. ${confirm}`
    )
  }
  const tell = (to: ParticipantRef, body: string): string =>
    writeAMessage({ workspaceId: entry.workspaceId, to: [to], onlyThem: true, aboutRun: run, actor: THE_OFFICE, title: `Merge entry ${entry.id} waits on a check again of ${String(n)} ${n === 1 ? 'path' : 'paths'}`, body, notice: 'anEntryWaitsOnACheckAgain' })

  const submitter = entry.submittedBy
  if (submitter.kind === 'agent') {
    const agent = theOneAgentAStringNames(sqlite, submitter.id)
    if (agent === null) return `The submitter ${submitter.id} was not told: no single registered agent answers to that name.`
    if (agent.retired) return `The submitter ${agent.handle} was not told: it is retired.`
    return `The submitter ${agent.handle} was told, in message ${tell({ kind: 'agent', id: agent.id }, forAnAgent(agent))}.`
  }
  // THE SECRETARY FIRST, so the person's notice says what was actually sent.
  const secretary = whoHoldsTheSecretaryCard()
  const toTheSecretary = secretary === null ? null : tell({ kind: 'agent', id: secretary.id }, forAnAgent(secretary))
  const theSecretarySays =
    secretary === null || toTheSecretary === null
      ? 'Nobody holds the secretary card, so nobody was sent this notice with the commands.'
      : `${secretary.handle}, who holds the secretary card, was sent this notice with the commands, in message ${toTheSecretary}.`
  const toThePerson = tell(submitter, `${what}\n\n${whatTheOfficeDid}\n\n${whoStartsIt} ${theSecretarySays}`)
  return `The person, who submitted the entry, was told, in message ${toThePerson}. ${theSecretarySays}`
}

/** The checker report as it is kept on the entry. */
function checkedFrom(checker: CheckerReport | undefined): Record<string, unknown> | null {
  if (checker === undefined) return null
  return { at: nowStamp(), ...(checker.tool === undefined ? {} : { tool: checker.tool }), decided: checker.decided, needsJudgment: checker.needsJudgment }
}

/** The decided failures of a checker report, in words, or null because there is none. */
function whatTheCheckerRefused(checker: CheckerReport | undefined): { files: string[]; says: string } | null {
  const failed = (checker?.decided ?? []).filter((one) => !one.ok)
  if (failed.length === 0) return null
  return {
    files: [...new Set(failed.map((one) => one.path))],
    says: `${checker?.tool ?? 'The checker'} decided against ${String(failed.length)} ${failed.length === 1 ? 'check' : 'checks'}: ${failed.map((one) => `${one.path} (${one.check}${one.detail === undefined ? '' : `: ${one.detail}`})`).join('; ')}.`,
  }
}

/**
 * THE MOVE TABLE'S ANSWER, AS A CASE BELOW EXPECTS IT. The table is asked after the state a step is taken
 * from was checked and the facts it needs were given, so any other answer is a broken assumption and is
 * raised as one.
 */
function aMoveTo(move: TheMoveAStepMakes, step: string): MergeState {
  if (move.move !== 'to') throw new Error(`The move table answered ${JSON.stringify(move)} for the step "${step}", where it moves the entry.`)
  return move.state
}

function aBounce(move: TheMoveAStepMakes, step: string): { reason: BounceReason } {
  if (move.move !== 'bounce') throw new Error(`The move table answered ${JSON.stringify(move)} for the step "${step}", where it bounces the entry.`)
  return move
}

function theCountOf(move: TheMoveAStepMakes, count: 'attempts' | 'runs', step: string): number {
  const value = count === 'runs' ? ('runs' in move ? move.runs : undefined) : 'attempts' in move ? move.attempts : undefined
  if (value === undefined) throw new Error(`The move table answered ${JSON.stringify(move)} for the step "${step}", with no count of ${count}.`)
  return value
}

/** How long the secretary waits between two lines about one entry waiting for room: at most one an hour. */
const ONE_LINE_ABOUT_ROOM_EVERY_MS = 60 * 60 * 1000

/**
 * THE SANDBOX LAUNCHER HAD NO ROOM, in wave 13p round 19. It refused a build or a test with exit
 * 75 before anything was filed or started, so nothing ran and nothing is red. The entry is not moved: it keeps its
 * place, and its merge tool tries again. The office keeps the launcher's sentence on the entry, and tells the
 * secretary one line when it has not told it in the last hour about this wait.
 */
function theEntryWaitsForRoom(entry: MergeEntryReading, record: PanelRecord, says: string, actor: Actor): { entry: MergeEntryReading; decided: string } {
  const clock = clockStamp()
  const at = clock.stamp
  const was = isObject(record.data['waitingForRoom']) ? record.data['waitingForRoom'] : null
  const since = typeof was?.['since'] === 'string' ? was['since'] : at
  const toldAt = typeof was?.['toldAt'] === 'string' ? was['toldAt'] : null
  const toldTime = isObject(was?.['toldTime']) ? was['toldTime'] : null
  // WHEN THE SECRETARY WAS LAST TOLD, read from `toldTime`, the clock observation written beside `toldAt`, since the
  // local stamp alone repeats an hour when the clocks go back. Null, when nobody can tell, tells the secretary again now,
  // as when nobody has been told.
  const lastTold = momentOfAStoredStamp(toldAt, toldTime)
  let message = typeof was?.['message'] === 'string' ? was['message'] : null
  let told = toldAt
  let toldClock: Record<string, unknown> | ClockStamp | null = toldTime
  let toldSays = ''
  if (lastTold === null || momentOfAnInstant(clock.instant)! - lastTold >= ONE_LINE_ABOUT_ROOM_EVERY_MS) {
    const holder = whoHoldsTheSecretaryCard()
    const line = `Merge entry ${entry.id} waits for room in the sandbox launcher, since ${since}: ${says}`
    told = at
    toldClock = clock
    if (holder === null) {
      message = null
      toldSays = `Nobody holds the secretary card, so the line "${line}" reached nobody.`
    } else {
      message = writeAMessage({ workspaceId: entry.workspaceId, to: [{ kind: 'agent', id: holder.id }], title: line, body: line, aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: 'anEntryWaitsForRoom' })
      toldSays = `${holder.handle} was told in one line, message ${message}.`
    }
  }
  const written = write(entry.id, { waitingForRoom: { since, at, says, message, toldAt: told, ...(toldClock === null ? {} : { toldTime: toldClock }) } }, actor)
  return {
    entry: readMergeEntry(written),
    decided: `The sandbox launcher had no room, so nothing ran and the entry is not red: it keeps its place, and its merge tool tries again.${toldSays === '' ? ' The secretary was told within the last hour.' : ` ${toldSays}`}`,
  }
}

/** The one reason for no round open that the office answers by asking for a fix round itself (13u round 90). */
const NO_RUN_GOING = 'the starter has no run going'

/** The starter told of this entry must be registered, live, and have an actual run going. */
export function theRoundOpenForAnEntry(entry: MergeEntryReading): RoundOpenReading {
  const { agent, starter } = theAgentAndStarterOfAnEntry(entry)
  if (starter === null) return { open: false, reason: 'no starter is recorded' }
  if (starter.kind !== 'agent') return { open: false, reason: 'the starter is not an agent' }
  const row = readParticipant({ kind: 'agent', id: starter.id }) as RegisteredAgent | null
  if (row === null) return { open: false, reason: 'the starter is not registered' }
  if (agent === null || theRegisteredStarterOf(agent) === null) return { open: false, reason: row.retired === true ? 'the starter is retired' : 'the starter is not registered' }
  const run = runServing(row.id, entry.workspaceId)
  return run === null ? { open: false, reason: NO_RUN_GOING } : { open: true, starter: row.id, run }
}

// ============================================================================ the fix round the office asks for

/**
 * THE CLASS-TWO DECISION A WAITING ENTRY'S CLASS-THREE ONE BECOMES WITH `roundOpen` (13u round 90), read again from the
 * files the tested step stored. Null when the entry would not land handed back: it is not class 2 then, the few-feature
 * gate was not at remind, or a plain house rule is red with its gate at block.
 */
function theClassTwoOfAWaitingEntry(three: WideRedDecision, roundOpen: MergeClassDecision['roundOpen']): MergeClassDecision | null {
  if (three.fewFeatureRedsPosition !== 'remind') return null
  const files = three.files.map(one => one.file)
  const list = new Map(three.files.filter(one => one.class !== undefined).map(({ file, ...rule }) => [file, rule as HouseRule]))
  const reading = classifyRedMerge({ redTests: files, list, redFiles: files, build: true, databasePaths: [], roundOpen, fewRedFiles: three.fewRedFiles })
  if (reading.class !== 2 || (reading.houseRuleFiles.length > 0 && three.houseRulesPosition === 'block')) return null
  return mergeClassDecision.parse({ ...reading, class: 2, mainAt: three.mainAt, build: true, databasePaths: [], roundOpen, fewRedFiles: three.fewRedFiles, position: three.fewFeatureRedsPosition, houseRulesPosition: three.houseRulesPosition })
}

/**
 * THE CLASS-THREE DECISION OF A RED ENTRY THAT MAY WAIT FOR A FIX ROUND, or null (13u round 90). It may wait only when the
 * one reason it is not class 2 is that its line's starter has no run going. Any other reason bounces as before.
 */
function whatAFixRoundWouldLand(tested: Tested): WideRedDecision | null {
  const three = tested.mergeClass
  if (three === undefined || three.class !== 3 || three.cause !== 8 || three.roundOpen.open || three.roundOpen.reason !== NO_RUN_GOING) return null
  // AS IF A ROUND WERE OPEN: only the files are read here, so the starter and the run are words and not records.
  return theClassTwoOfAWaitingEntry(three, { open: true, starter: 'a starter', run: 'a run' }) === null ? null : three
}

/** THE END OF A WAIT FOR A FIX ROUND: FIX_ROUND_MINUTES after `clock`, with the wall time in its zone and the moment itself. */
function theWaitForAFixRound(clock: ClockStamp): Omit<WaitsForAFixRound, 'asks' | 'opened'> {
  const due = momentOfAnInstant(clock.instant)! + FIX_ROUND_MINUTES * 60_000
  return { since: clock.stamp, time: clock, until: stampInZone(due, clock.timeZone), dueAt: clockStamp(() => new Date(due)).instant, timeZone: clock.timeZone, minutes: FIX_ROUND_MINUTES }
}

/**
 * THE FIX-ROUND BRIEF, FROM ITS ONE TEMPLATE (13u round 90): the entry and its red files, what happens while a run of the
 * round is going, and the end of the wait.
 */
function theFixRoundBrief(entry: MergeEntryReading, three: Pick<WideRedDecision, 'featureFiles' | 'files' | 'mainAt'>, tested: Tested, which: FixRoundAsk['for'], wait: { until: string; timeZone: string }): string {
  const hours = Number(settingValue('MOLE_OFFICE_HAND_BACK_HOURS'))
  const count = three.featureFiles.length === 1 ? 'one feature test file' : `${three.featureFiles.length} feature test files`
  return [
    `# Fix round: merge entry ${entry.id}`,
    '',
    `Merge entry ${entry.id} — ${entry.title} — is red in ${count}, few enough to land handed back, and its line's starter had no run going to fix them. ` +
      `So the office wrote this brief and asked for this round itself${which === 'sheriff' ? ", of the build sheriff, because the line's own supervisor could not be started" : ''}.`,
    '',
    '## The red',
    '',
    `The red test files: ${three.files.map(one => one.file).join(', ')}.`,
    `They were run at ${tested.tip ?? 'a tip that is not recorded'}, the entry integrated onto main at ${three.mainAt}. The log: ${tested.log}`,
    '',
    '## What happens',
    '',
    `The office reserves this repair before landing. After the entry lands on main, a new run starts in a new worktree cut from that landed commit or later main. The hand-back problem records the new run when it starts. ` +
      `Land a repair that names that problem within ${hours} hours of the landing. Every named file must pass alone.`,
    `The launch reservation ends at ${wait.until} (${wait.timeZone}). Before landing, a missing reservation bounces the entry as red. After landing, a failed start leaves the hand-back open and its original repair deadline unchanged.`,
    '',
    'Do not weaken, skip or delete a test to make it pass.',
    '',
  ].join('\n')
}

/**
 * ASK THE NEXT-ROUND DOOR AS THE OFFICE, IN THIS PROCESS (13u round 90), with the mark for this one agent and brief set
 * around the one call. Only the door's own refusals are caught, as its status and words.
 */
function askTheDoorAsTheOffice(agent: string, brief: string, workspaceId: string, repair?: { entry: string; dueAt: string }): { status: number; said: string; run?: string } {
  try {
    const asked = asTheOfficeAsking({ agent, brief, ...(repair === undefined ? {} : { repair }) }, () => askForTheNextRound({ agent, brief, workspaceId, actor: THE_OFFICE }))
    return { status: 202, said: asked.says, run: asked.run }
  } catch (error) {
    if (!(error instanceof PanelError)) throw error
    return { status: error.status, said: error.message }
  }
}

/**
 * ONE ASK FOR A FIX ROUND (13u round 90). The brief goes into the agent's last sandbox first, and then the door is asked.
 * Each reason the door was not asked is said with no `status`; `nobody` says why there is no agent to ask.
 */
function askForAFixRound(entry: MergeEntryReading, which: FixRoundAsk['for'], agent: { id: string; handle: string } | null, nobody: string, brief: string, dueAt: string): FixRoundAsk {
  const at = nowStamp()
  if (agent === null) return { for: which, at, said: nobody }
  const last = theLastSandboxRunOrWhyNot(agent, entry.workspaceId)
  if ('cannot' in last) return { for: which, agent: agent.id, at, said: `${last.cannot} The door was not asked.` }
  const run = last.run
  if (run === null) return { for: which, agent: agent.id, at, said: `${agent.handle} has no run in this project that was started in a sandbox, so there is no sandbox to write the fix brief into. The door was not asked.` }
  const sandbox = theSandboxTheOfficeVouchesFor(run)
  if (sandbox === null) return { for: which, agent: agent.id, at, said: `Run ${run.id}, the last of ${agent.handle} started in a sandbox, names a sandbox the office cannot vouch for. The door was not asked.` }
  const written = writeABriefIntoASandbox(sandbox.folder, `fix-round-${entry.id}`, () => brief)
  if ('refused' in written) return { for: which, agent: agent.id, at, said: `${written.refused} The door was not asked.` }
  const answered = askTheDoorAsTheOffice(agent.id, written.path, entry.workspaceId, { entry: entry.id, dueAt })
  return { for: which, agent: agent.id, at, brief: written.path, status: answered.status, said: answered.said, ...(answered.run === undefined ? {} : { holder: answered.run }) }
}

/** THE BUILD SHERIFF, as MOLE_OFFICE_BUILD_SHERIFF names it, or null when it names nobody or no one agent. */
function theBuildSheriff(): { named: string; sheriff: ReturnType<typeof theOneAgentAStringNames> } {
  const named = String(settingValue('MOLE_OFFICE_BUILD_SHERIFF') ?? '').trim()
  return { named, sheriff: named === '' ? null : theOneAgentAStringNames(sqlite, named) }
}

/** Ask for a fix round of the line's own supervisor: the first agent told of the entry's end that may be started on a brief. */
function askTheLine(entry: MergeEntryReading, three: Pick<WideRedDecision, 'featureFiles' | 'files' | 'mainAt'>, tested: Tested, wait: { until: string; timeZone: string; dueAt: string }): FixRoundAsk {
  const told = whoIsToldOfAnEntrysEnd(entry).to
  const nobody = told.length === 0
    ? "Nobody is told of this entry's end, so there is no line's supervisor to ask."
    : `No agent told of this entry's end (${told.map(one => one.id).join(', ')}) may be started on a fix round: each is retired or holds a worker's card.`
  return askForAFixRound(entry, 'line', theAgentAskedToResolve(told), nobody, theFixRoundBrief(entry, three, tested, 'line', wait), wait.dueAt)
}

/** Ask for a fix round of the build sheriff, the same way. */
function askTheSheriff(entry: MergeEntryReading, three: Pick<WideRedDecision, 'featureFiles' | 'files' | 'mainAt'>, tested: Tested, wait: { until: string; timeZone: string; dueAt: string }): FixRoundAsk {
  const { named, sheriff } = theBuildSheriff()
  const nobody = named === '' ? 'No build sheriff is named in MOLE_OFFICE_BUILD_SHERIFF.' : `MOLE_OFFICE_BUILD_SHERIFF names ${named}, which is not one registered agent.`
  return askForAFixRound(entry, 'sheriff', sheriff, nobody, theFixRoundBrief(entry, three, tested, 'sheriff', wait), wait.dueAt)
}

/** Each ask for a fix round and what it was answered, one sentence or two each, for the step's words and a bounce. */
function whatEachAskWasAnswered(asks: readonly FixRoundAsk[]): string {
  return asks.map(ask => {
    const who = `${ask.for === 'line' ? "the line's supervisor" : 'the build sheriff'}${ask.agent === undefined ? '' : `, agent ${ask.agent},`}`
    const answer = ask.status === undefined ? `${who} was not asked at the door: ${ask.said}` : `${who} was asked at ${ask.at}, and the door answered ${ask.status}: ${ask.said}`
    const after = ask.ended !== undefined ? ` The ask ended with no run at ${ask.ended.at}: ${ask.ended.says}` : ask.started !== undefined ? ` Its round started run ${ask.started.run} at ${ask.started.at}.` : ''
    return `For a fix round, ${answer}${after}`
  }).join(' ')
}

/**
 * AN ASK THE DOOR TOOK, READ AGAIN FROM THE RUN THAT HOLDS IT (13u round 90): started, ended with no run, or still
 * waiting. An ask its run no longer holds, because another replaced it, has ended.
 */
function theAskNow(ask: FixRoundAsk, at: string): FixRoundAsk {
  if (ask.status !== 202 || ask.holder === undefined || ask.ended !== undefined || ask.started !== undefined) return ask
  const holder = getRecord(ask.holder)
  const round = holder === null ? null : readTheNextRound(holder.data[NEXT_ROUND])
  if (round === null || round.brief.path !== ask.brief || round.askedBy.as !== 'the office') {
    return { ...ask, ended: { at, says: `Run ${ask.holder} no longer holds the office's ask: another ask replaced it, or it was taken off.` } }
  }
  if (round.state === 'failed') return { ...ask, ended: round.failed ?? { at, says: 'The ask failed, and its run does not say why.' } }
  if (round.state === 'started' && round.started !== undefined) return { ...ask, started: { at: round.started.at, run: round.started.run } }
  return ask
}

/**
 * THE OFFICE LOOKS AT THE FIX ROUND IT ASKED FOR (13u round 90). Each ask is read again from its holder. A valid bounded
 * repair reservation admits the hand-back landing without inventing a running repair. Launch waits for landed main.
 * A starter's actual running round can still admit the entry as before. A line's ask that was refused or ended with no run asks
 * the build sheriff. At the end of the wait, with no ask left waiting, or when the starter is no longer one a round can
 * be opened for, the entry bounces as red, naming each ask and its answer. Otherwise it keeps waiting.
 */
function lookAtTheFixRound(entry: MergeEntryReading, held: MachineFields, actor: Actor): { entry: MergeEntryReading; decided: string } {
  const waits = held.waitsForAFixRound, tested = held.tested
  const decision = tested?.mergeClass
  const three: WideRedDecision | null = decision?.class === 3 ? decision : decision?.class === 2 && waits?.reserved !== undefined
    ? { ...decision, class: 3, cause: 8, roundOpen: { open: false, reason: NO_RUN_GOING }, fewFeatureRedsPosition: decision.position } : null
  if (waits === null || waits.opened !== undefined || tested === null || three === null) {
    throw new PanelError(`Merge entry ${entry.id} waits for no fix round${waits?.opened === undefined ? '' : `: its round opened, run ${waits.opened.run}`}, so there is nothing to look at. Nothing was written.`, 409)
  }
  const at = nowStamp()
  let asks = waits.asks.map(ask => theAskNow(ask, at))
  const reading = theRoundOpenForAnEntry(entry)
  const going = reading.open ? undefined : asks.find(ask => ask.agent !== undefined && ask.started !== undefined && runServing(ask.agent, entry.workspaceId) === ask.started.run)
  const over = Date.now() >= momentOfAnInstant(waits.dueAt)!
  const accepted = !over && reading.reason === NO_RUN_GOING ? asks.find(ask => ask.status === 202 && ask.holder !== undefined && ask.agent !== undefined && ask.ended === undefined && ask.started === undefined) : undefined
  if (accepted !== undefined) {
    requireTheRepairReservation({ holder: accepted.holder!, entry: entry.id, brief: accepted.brief!, dueAt: waits.dueAt, workspaceId: entry.workspaceId })
    const reserved = { at, for: accepted.for, agent: accepted.agent!, holder: accepted.holder! }
    const roundOpen = { open: false as const, starter: theAgentAndStarterOfAnEntry(entry).starter!.id, reason: 'a repair is reserved and waits for landing on main', reserved: { holder: reserved.holder, agent: reserved.agent, as: reserved.for } }
    const two = theClassTwoOfAWaitingEntry(three!, roundOpen)
    if (two === null) throw new Error('The reserved repair no longer qualifies for a hand-back.')
    const written = sqlite.transaction(() => {
      write(entry.id, { tested: { mergeClass: null } }, actor)
      return write(entry.id, { tested: { mergeClass: two }, waitsForAFixRound: { asks, reserved } }, actor)
    })()
    return { entry: readMergeEntry(written), decided: `A repair is reserved for agent ${reserved.agent} until ${waits.until} (${waits.timeZone}). It starts in a new worktree after the entry lands on main. No repair run has started. The entry may land handed back.` }
  }
  if (reading.open || (reading.reason === NO_RUN_GOING && going !== undefined)) {
    const starter = reading.open ? reading.starter! : theAgentAndStarterOfAnEntry(entry).starter!.id
    const opened: NonNullable<WaitsForAFixRound['opened']> = reading.open ? { at, for: 'starter', agent: starter, run: reading.run! } : { at, for: going!.for, agent: going!.agent!, run: going!.started!.run }
    const roundOpen = { open: true as const, starter, run: opened.run, ...(opened.for === 'starter' ? {} : { fixRound: { agent: opened.agent, as: opened.for } }) }
    const two = theClassTwoOfAWaitingEntry(three, roundOpen)
    if (two === null) throw new Error(`Merge entry ${entry.id} waited for a fix round, and its stored red no longer reads as class 2 with the round open.`)
    // A RECURSIVE PATCH WOULD KEEP THE CLASS-THREE KEYS, so the decision is taken off before the class-two one is written.
    const written = sqlite.transaction(() => {
      write(entry.id, { tested: { mergeClass: null } }, actor)
      return write(entry.id, { tested: { mergeClass: two }, waitsForAFixRound: { asks, opened } }, actor)
    })()
    const whose = opened.for === 'starter' ? 'its starter' : opened.for === 'line' ? "the line's supervisor" : 'the build sheriff'
    return { entry: readMergeEntry(written), decided: `The fix round opened: run ${opened.run} of ${whose}, agent ${opened.agent}, is going. The entry may land, handed back: ${two.featureFiles.join(', ')}.` }
  }
  if (reading.reason === NO_RUN_GOING && !asks.some(ask => ask.for === 'sheriff') && asks.every(ask => ask.status !== 202 || ask.ended !== undefined)) {
    asks = [...asks, askTheSheriff(entry, three, tested, waits)]
  }
  const waiting = asks.some(ask => ask.status === 202 && ask.ended === undefined)
  if (reading.reason !== NO_RUN_GOING || over || !waiting) {
    const why = reading.reason !== NO_RUN_GOING ? `Its line has no round open to fix it: ${reading.reason ?? 'the office cannot say why'}.`
      : over ? `No fix round opened by ${waits.until} (${waits.timeZone}).` : 'No ask for a fix round is left waiting.'
    const more = `${why} ${whatEachAskWasAnswered(asks)}`
    return { entry: bounce(entry, 'red', { files: [], redTests: tested.redTests, log: tested.log }, more, actor), decided: `Red: ${(tested.redTests ?? []).join(', ')}. ${more}` }
  }
  const changed = JSON.stringify(asks) !== JSON.stringify(waits.asks)
  const written = changed ? write(entry.id, { waitsForAFixRound: { asks } }, actor) : null
  return { entry: written === null ? entry : readMergeEntry(written), decided: `It waits for a fix round until ${waits.until} (${waits.timeZone}). ${whatEachAskWasAnswered(asks)}` }
}

/** Link the actual fresh repair to the existing hand-back; its landing-based deadline stays as filed. */
export function theRepairRoundStarted(entryId: string, holder: string, run: string): void {
  const record = getRecord(entryId)
  if (record === null || record.kind !== 'merge_entry') return
  const entry = readMergeEntry(record), waits = machineFieldsOf(record).waitsForAFixRound
  if (entry.state !== 'merged' || waits?.reserved?.holder !== holder) return
  const reserved = waits.reserved
  write(entry.id, { waitsForAFixRound: { asks: waits.asks.map(ask => theAskNow(ask, nowStamp())), opened: { at: nowStamp(), for: reserved.for, agent: reserved.agent, run } } }, THE_OFFICE)
  const problem = handBackForEntry(entry, true)
  if (problem !== null) {
    const line = { ...problem.facts.line, run, fixRound: { agent: reserved.agent, as: reserved.for } }
    const extra = problem.problem.data.extra as { mainSuiteTrace?: unknown }
    patchRecord(problem.problem.id, { dataPatch: {
      symptom: theHandBackSymptom({ ...problem.facts, line }, extra.mainSuiteTrace === undefined ? 'landing' : 'this hand-back'),
      extra: { handBack: { line } },
    } }, THE_OFFICE)
  }
}

/** A failed launch can ask the sheriff within its wait, extended by time held only by the cap. */
export function retryTheRepairRound(entryId: string, holder: string, workspaceId: string, reason: string, effectiveDue: number | null): void {
  const record = getRecord(entryId)
  if (record === null || record.workspaceId !== workspaceId || record.kind !== 'merge_entry') {
    const run = getRecord(holder)
    if (run === null || run.workspaceId !== workspaceId) return
    const line = theAgentOfARun(run), secretary = whoHoldsTheSecretaryCard()
    const to = line === null ? [] : [{ kind: 'agent' as const, id: line.id }]
    if (secretary !== null && !to.some(one => one.id === secretary.id)) to.push({ kind: 'agent', id: secretary.id })
    if (to.length > 0) writeAMessage({ workspaceId, to, title: sayInEnglish('repairLaunch.title', { entry: entryId }), body: sayInEnglish('repairLaunch.failed', { entry: entryId, line: line?.id ?? 'unknown', reason, next: sayInEnglish('repairLaunch.unavailable') }), aboutRun: holder, actor: THE_OFFICE, onlyThem: true, notice: 'handedBack' })
    return
  }
  const entry = readMergeEntry(record), held = machineFieldsOf(record), waits = held.waitsForAFixRound
  if (waits?.reserved?.holder !== holder || waits.opened !== undefined) return
  const asks = waits.asks.map(ask => theAskNow(ask, nowStamp()))
  const line = theAgentAndStarterOfAnEntry(entry).agent
  const supervisor = asks.find(ask => ask.for === 'line')?.agent ?? theAgentAskedToResolve(whoIsToldOfAnEntrysEnd(entry).to)?.id
  const to = supervisor === undefined ? [] : [{ kind: 'agent' as const, id: supervisor }]
  const secretary = whoHoldsTheSecretaryCard()
  if (secretary !== null && !to.some(one => one.id === secretary.id)) to.push({ kind: 'agent', id: secretary.id })
  const tell = (next: string) => {
    if (to.length > 0) writeAMessage({ workspaceId, to, title: sayInEnglish('repairLaunch.title', { entry: entry.id }), body: sayInEnglish('repairLaunch.failed', { entry: entry.id, line: line?.id ?? 'unknown', reason, next }), aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: 'handedBack' })
  }
  if (entry.state !== 'merged' || held.tested?.mergeClass === undefined) {
    tell(sayInEnglish('repairLaunch.unavailable'))
    return
  }
  if (effectiveDue === null || Date.now() >= effectiveDue || asks.some(ask => ask.for === 'sheriff')) {
    write(entry.id, { waitsForAFixRound: { asks } }, THE_OFFICE)
    tell(sayInEnglish('repairLaunch.nobodyAsked'))
    return
  }
  const extended = { ...waits, dueAt: clockStamp(() => new Date(effectiveDue)).instant, until: stampInZone(effectiveDue, waits.timeZone) }
  const sheriff = askTheSheriff(entry, held.tested.mergeClass, held.tested, extended)
  const reserved = sheriff.status === 202 && sheriff.holder !== undefined && sheriff.agent !== undefined ? { at: sheriff.at, for: sheriff.for, agent: sheriff.agent, holder: sheriff.holder } : waits.reserved
  write(entry.id, { waitsForAFixRound: { asks: [...asks, sheriff], reserved, dueAt: extended.dueAt, until: extended.until } }, THE_OFFICE)
  tell(sayInEnglish(sheriff.status === 202 && sheriff.holder !== undefined && sheriff.agent !== undefined ? 'repairLaunch.sheriffAsked' : 'repairLaunch.nobodyAsked'))
}

/** One narrow read, with the landing path's historical duplicate rule kept and the trace path's open rule explicit. */
function handBackForEntry(entry: MergeEntryReading, onlyOpen: boolean) {
  const which = onlyOpen
    ? sql`json_extract(${records.data}, '$.extra.handBack.entry') = ${entry.id} AND json_extract(${records.data}, '$.state') = 'open'`
    : sql`json_extract(${records.data}, '$.extra.handBack.entry') = ${entry.id}`
  for (const problem of theProblemsWhere(entry.workspaceId, which, ['state', 'extra'])) {
    const facts = handBackOfProblem(problem)
    if (facts !== null) return { problem, facts }
  }
  return null
}
export const openHandBackForEntry = (entry: MergeEntryReading) => handBackForEntry(entry, true)

export { theHandBackDeadline }

/** The visible hand-back sentence, rebuilt from the same facts when a reserved repair starts. */
function theHandBackSymptom(facts: HandBackFacts, basis: 'landing' | 'this hand-back'): string {
  const { line, commits, deadline, timeZone, hours } = facts
  const fixRound = line.run === null ? undefined : line.fixRound
  return `Merge entry ${facts.entry} landed with feature test files red: ${facts.files.join(', ')}. Landed commits: ${commits.join(', ')}. Its line is agent ${line.agent ?? 'not recorded'}, starter ${line.starter}, ${line.run === null ? 'repair reserved, with no run started yet' : `running run ${line.run}`}.${fixRound === undefined ? '' : ` That run is the fix round the office asked for itself, of ${fixRound.as === 'line' ? "the line's supervisor" : 'the build sheriff'}, agent ${fixRound.agent}.`} Land a repair by ${deadline} (${timeZone}), ${hours} hours after ${basis}. Name this problem with fixRound kind repair; every named file must pass alone.`
}

/** Both landing and scheduled tracing use this exact problem shape and notice. */
export function fileAHandBackProblem(entry: MergeEntryReading, input: {
  files: string[]; commits: string[]; roundOpen: RoundOpenReading; landedAt: string; clock: ClockStamp
  mainSuiteTrace?: { receipt: string; with: { commit: string; exit: number; log: string }; without: { commit: string; exit: number; log: string } }
}): { problem: string; says: string } {
  const { files, commits, clock } = input
  const { hours, deadline, dueAt } = theHandBackDeadline(clock)
  const { agent } = theAgentAndStarterOfAnEntry(entry)
  const fixRound = input.roundOpen.fixRound
  const reserved = input.roundOpen.reserved
  const repair = fixRound ?? (reserved === undefined ? undefined : { agent: reserved.agent, as: reserved.as })
  const line = { agent: agent?.id ?? null, starter: input.roundOpen.starter, run: input.roundOpen.run ?? null, ...(repair === undefined ? {} : { fixRound: repair }) }
  const facts = handBackFacts.parse({ entry: entry.id, repository: entry.changeset.root, files, commits, line, landedAt: input.landedAt, deadline, timeZone: clock.timeZone, hours, dueAt })
  const basis = input.mainSuiteTrace === undefined ? 'landing' : 'this hand-back'
  const symptom = theHandBackSymptom(facts, basis)
  const problem = createRecord({ kind: 'problem', title: `Handed back: merge entry ${entry.id}`, workspaceId: entry.workspaceId, actor: THE_OFFICE,
    data: { state: 'open', whose_move: 'agent', symptom, seen_in: facts.files, found_by: `the merge queue at landing of ${entry.id}`, extra: { redOnMainFamily: true, handBack: facts, ...(input.mainSuiteTrace === undefined ? {} : { mainSuiteTrace: input.mainSuiteTrace }) } } })
  const to = whoIsToldOfAnEntrysEnd(entry).to
  // THE BUILD SHERIFF WHOSE ROUND IT IS IS TOLD TOO (13u round 90): it is not in the entry's line.
  if (repair?.as === 'sheriff' && !to.some(one => one.id === repair.agent)) to.push({ kind: 'agent', id: repair.agent })
  const secretary = whoHoldsTheSecretaryCard()
  if (secretary !== null && !to.some(one => one.id === secretary.id)) to.push({ kind: 'agent', id: secretary.id })
  if (to.length > 0) writeAMessage({ workspaceId: entry.workspaceId, to, title: problem.title, body: `Problem ${problem.id}. ${symptom}`, aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: 'handedBack' })
  return { problem: problem.id, says: `Filed Handed back problem ${problem.id} for ${facts.files.join(', ')}; repair is due ${deadline} (${clock.timeZone}). Told ${to.map(one => one.id).join(', ') || 'nobody'}.` }
}

/** One hand-back holds all feature files; plain H reminders keep their existing per-file path. */
function fileHandBackProblem(entry: MergeEntryReading, decision: MergeClassDecision, receipt: IntegrationReceipt, clone: string, clock: ClockStamp): string {
  if (gatePosition('few-feature-reds') === 'off') return 'Hand-back reminders are off; nothing was filed for the feature files.'
  const already = handBackForEntry(entry, false)
  if (already !== null) return `Hand-back problem ${already.problem.id} already holds this entry; nothing was filed again.`
  const commits = readGit(clone, ['rev-list', '--reverse', `${receipt.mainBefore}..${receipt.mainAfter}`]).toString('utf8').trim().split('\n').filter(Boolean)
  return fileAHandBackProblem(entry, { files: decision.featureFiles, commits, roundOpen: decision.roundOpen, landedAt: clock.stamp, clock }).says
}

/** One landed entry holds every red file, including plain house rules. */
function fileWideRedProblem(entry: MergeEntryReading, decision: WideRedDecision, receipt: IntegrationReceipt, clone: string): string {
  if (gatePosition('wide-red') === 'off') return sayInEnglish('wideRed.off')
  const already = theProblemsWhere(entry.workspaceId, sql`json_extract(${records.data}, '$.extra.wideRed.entry') = ${entry.id}`, [])[0]
  if (already !== undefined) return sayInEnglish('wideRed.already', { problem: already.id })
  const commits = readGit(clone, ['rev-list', '--reverse', `${receipt.mainBefore}..${receipt.mainAfter}`]).toString('utf8').trim().split('\n').filter(Boolean)
  const { sheriff } = theBuildSheriff()
  const files = decision.files.map(one => one.file)
  const wideRed = { entry: entry.id, cause: decision.cause, reason: decision.reason, files, featureFiles: decision.featureFiles,
    houseRuleFiles: decision.houseRuleFiles, databasePaths: decision.databasePaths, commits, mainBefore: receipt.mainBefore, mainAfter: receipt.mainAfter, buildSheriff: sheriff?.handle ?? null }
  const problem = createRecord({ kind: 'problem', title: sayInEnglish('wideRed.title', { title: entry.title }), workspaceId: entry.workspaceId, actor: THE_OFFICE,
    data: { state: 'open', whose_move: 'agent', seen_in: files, found_by: sayInEnglish('wideRed.foundBy', { entry: entry.id }),
      symptom: sayInEnglish('wideRed.symptom', { entry: entry.id, title: entry.title, reason: decision.reason, files: files.join(', '), commits: commits.join(', ') }),
      extra: { redOnMainFamily: true, wideRed } } })
  const line = sayInEnglish('wideRed.notice', { problem: problem.id, entry: entry.id, title: entry.title, files: files.join(', ') })
  const secretary = whoHoldsTheSecretaryCard()
  for (const recipient of [sheriff, secretary]) if (recipient !== null) writeAMessage({ workspaceId: entry.workspaceId, to: [{ kind: 'agent', id: recipient.id }], title: line, body: line, aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: 'landedWithAWideRed' })
  return [sayInEnglish('wideRed.filed', { problem: problem.id, files: files.join(', ') }),
    sheriff === null ? sayInEnglish('wideRed.noSheriff') : sayInEnglish('wideRed.toldSheriff', { handle: sheriff.handle }),
    secretary === null ? sayInEnglish('wideRed.noSecretary') : sayInEnglish('wideRed.toldSecretary', { handle: secretary.handle })].join(' ')
}

/** Only the landed repair closes its hand-back, in the landing's transaction. */
function closeHandBackProblem(entry: MergeEntryReading, receipt: IntegrationReceipt): string {
  if (entry.repairOf === undefined) return ''
  const problem = getRecord(entry.repairOf.problem)
  if (problem === null || problem.workspaceId !== entry.workspaceId || handBackOfProblem(problem) === null) throw new PanelError('The repair no longer names a hand-back problem in this project. Nothing was written.', 409)
  if (problem.data['state'] !== 'open') return `Hand-back problem ${problem.id} is already closed; nothing was changed.`
  patchRecord(problem.id, { dataPatch: { state: 'fixed', fix: `Repair merge entry ${entry.id}, landed commit ${receipt.mainAfter}.` } }, THE_OFFICE)
  const line = `Hand-back problem ${problem.id} is fixed by merge entry ${entry.id} at ${receipt.mainAfter}.`
  const secretary = whoHoldsTheSecretaryCard()
  if (secretary !== null) writeAMessage({ workspaceId: entry.workspaceId, to: [{ kind: 'agent', id: secretary.id }], title: line, body: line, aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: 'handedBack' })
  return `${line} ${secretary === null ? 'No secretary could be told.' : 'The secretary was told.'}`
}

/** Closure and the line's notice are part of the landing transaction. */
function closeTakenBackProblem(entry: MergeEntryReading, receipt: IntegrationReceipt): string {
  if (entry.takeBackOf === undefined) return ''
  const problem = getRecord(entry.takeBackOf.problem)
  if (problem === null || problem.workspaceId !== entry.workspaceId) return `Hand-back problem ${entry.takeBackOf.problem} cannot be read; nothing was closed.`
  const closed = problem.data['state'] !== 'open'
  const fix = `Taken back by merge entry ${entry.id}, landed commit ${receipt.mainAfter}.`
  if (!closed) patchRecord(problem.id, { dataPatch: { state: 'fixed', fix } }, THE_OFFICE)
  const says = closed ? `Hand-back problem ${problem.id} is already ${String(problem.data['state'])}; nothing was changed. The take-back landed after the problem was closed. ${fix}` : `Hand-back problem ${problem.id} fixed. ${fix}`
  const whom = whoIsToldOfAnEntrysEnd(entry)
  if (whom.to.length > 0) writeAMessage({ workspaceId: entry.workspaceId, to: whom.to, title: `Taken back: hand-back ${problem.id}`, body: says, aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: 'takenBack' })
  return `${says} ${whom.says}`
}

/**
 * FILES RED ON MAIN ALONE BELONG TO NO ENTRY, and go to the build sheriff, at item 4. For each
 * file with no open problem of the same title, the office files one, naming the sheriff the setting
 * MOLE_OFFICE_BUILD_SHERIFF names; a file already held by an open problem is not filed again. When anything was filed,
 * the sheriff, when there is one, and the secretary are each told one line. The entry is not moved.
 */
function openRedOnMainProblem(open: PanelRecord[], file: string): PanelRecord | undefined {
  return open.find(problem => problem.title === `Red on main, and no merge entry's: ${file}` ||
    ((problem.data['extra'] as { redOnMainFamily?: boolean } | undefined)?.redOnMainFamily === true &&
      Array.isArray(problem.data['seen_in']) && problem.data['seen_in'].includes(file)))
}

/** How many characters of a commit the symptom of a per-file problem names, red on main or changed its answer alike. */
export const HOW_MUCH_OF_A_COMMIT_A_SYMPTOM_NAMES = 12

/** The symptom of a file red on main alone, before anything it says of the file's failure lines. */
export function theRedOnMainAloneSymptom(file: string, mainAt: string, entry: string, log: string | undefined): string {
  return `${file} fails on main ${mainAt.slice(0, HOW_MUCH_OF_A_COMMIT_A_SYMPTOM_NAMES)} alone, run in the sandbox of merge entry ${entry}${log === undefined ? '' : `; its log is ${log}`}. ` +
    'No entry\'s change is in that tree, so it belongs to no entry, and the merge queue lands the entries it holds as before.'
}

/**
 * WHAT A PROBLEM SAYS OF THE FAILURE LINES IT KEEPS, after the symptom it had: the blocks and the line each stands on,
 * whether the bound cut any and how many it left out, or that the log had no FAIL line, or could not be read. A file sent
 * without lines, as by an older merge tool, says nothing more.
 */
function theFailureLinesSaid(lines: TheFailureLines | undefined): string {
  if (lines === undefined) return ''
  if (lines.found === 'none') return ` ${sayInEnglish('failureLines.none', { log: lines.log, lines: lines.lines })}`
  if (lines.found === 'unread') return ` ${sayInEnglish('failureLines.unread', { log: lines.log, why: lines.why })}`
  const { blocks, linesAfter, characters } = HOW_MUCH_OF_A_RED_RUN_IS_KEPT
  return [
    sayInEnglish('failureLines.kept', { count: lines.blocks.length, log: lines.log, lines: lines.blocks.map((one) => String(one.line)).join(', ') }),
    ...(lines.blocks.some((one) => one.cut) ? [sayInEnglish('failureLines.cut', { linesAfter, characters })] : []),
    ...(lines.leftOut > 0 ? [sayInEnglish('failureLines.leftOut', { blocks, leftOut: lines.leftOut })] : []),
  ].map((one) => ` ${one}`).join('')
}

/**
 * Both families share filing and delivery; the family alone decides which open problems hold a file. A file's failure
 * lines go into its problem's extra and are said after its symptom, in both families alike.
 */
function filePerFileProblems<T extends { file: string; log?: string; failureLines?: TheFailureLines }>(entry: MergeEntryReading, files: T[], family: {
  title: (one: T) => string
  symptom: (one: T) => string
  extra: (one: T, buildSheriff: string | null) => Record<string, unknown>
  matcher: (open: PanelRecord[], file: string) => PanelRecord | undefined
  line: (fresh: { file: string; problem: string }[], sheriff: ReturnType<typeof theOneAgentAStringNames>) => string
  notice: AnotherNoticeKind
}) {
  const at = nowStamp()
  const { named, sheriff } = theBuildSheriff()
  const open = listRecords({ workspaceId: entry.workspaceId, kind: 'problem' }).filter((one) => one.data['state'] === 'open')
  const held = [...new Map(files.map(one => [one.file, one])).values()].map((one) => {
    const already = family.matcher(open, one.file)
    const problem = already?.id ?? createRecord({
      kind: 'problem', title: family.title(one), workspaceId: entry.workspaceId, actor: THE_OFFICE,
      data: {
        symptom: `${family.symptom(one)}${theFailureLinesSaid(one.failureLines)}`, state: 'open', whose_move: 'agent', seen_in: [one.file],
        found_by: `the merge tool, while it tested merge entry ${entry.id}`,
        extra: { ...family.extra(one, sheriff?.handle ?? null), ...(one.failureLines === undefined ? {} : { failureLines: one.failureLines }) },
      },
    }).id
    return { ...one, problem, at, filed: already === undefined }
  })
  const fresh = held.filter((one) => one.filed)
  let said: string
  if (fresh.length === 0) said = 'Each file already has an open problem, so nothing was filed and nobody was told again.'
  else {
    const line = family.line(fresh, sheriff)
    const toSheriff = sheriff === null ? null : writeAMessage({ workspaceId: entry.workspaceId, to: [{ kind: 'agent', id: sheriff.id }], title: line, body: line, aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: family.notice })
    const holder = whoHoldsTheSecretaryCard()
    const toSecretary = holder === null ? null : writeAMessage({ workspaceId: entry.workspaceId, to: [{ kind: 'agent', id: holder.id }], title: line, body: line, aboutRun: entry.run, actor: THE_OFFICE, onlyThem: true, notice: family.notice })
    said =
      `Filed ${fresh.map((one) => one.problem).join(', ')}. ` +
      (sheriff === null ? (named === '' ? 'MOLE_OFFICE_BUILD_SHERIFF names nobody, so no sheriff was told. ' : `MOLE_OFFICE_BUILD_SHERIFF names ${named}, which is no one agent, so no sheriff was told. `) : `The build sheriff ${sheriff.handle} was told in message ${String(toSheriff)}. `) +
      (holder === null ? 'Nobody holds the secretary card, so no secretary was told.' : `${holder.handle} was told in message ${String(toSecretary)}.`)
  }
  return { held, said }
}

function fileRedOnMainProblems(entry: MergeEntryReading, facts: FactsOf<'red-on-main'>, actor: Actor, houseRules?: HouseRulesDecision): { entry: MergeEntryReading; decided: string } {
  const { held, said } = filePerFileProblems(entry, facts.files, {
    title: one => houseRules === undefined ? `Red on main, and no merge entry's: ${one.file}` : `Red on main after a house-rule landing: ${one.file}`,
    symptom: one => houseRules === undefined ? theRedOnMainAloneSymptom(one.file, facts.mainAt, entry.id, one.log)
      : `${one.file} is red on main ${facts.mainAt.slice(0, HOW_MUCH_OF_A_COMMIT_A_SYMPTOM_NAMES)} after merge entry ${entry.id} landed with it red. It is a plain house rule. MOLE_OFFICE_GATE_HOUSE_RULES was at ${houseRules.position} when the office admitted it; it is at ${String(gatePosition('house-rule-reds'))} on completion. Its log is ${one.log ?? 'not recorded'}.`,
    extra: (one, buildSheriff) => ({ redOnMainFamily: true, buildSheriff, mainAt: facts.mainAt, mergeEntry: entry.id, ...(one.log === undefined ? {} : { log: one.log }) }),
    matcher: openRedOnMainProblem,
    line: (fresh, sheriff) => `${houseRules === undefined ? "Red on main, and no merge entry's" : 'Red on main after a house-rule landing'}: ${fresh.map((one) => `${one.file} (problem ${one.problem})`).join(', ')}${sheriff === null ? '' : `, for the build sheriff ${sheriff.handle}`}.`,
    notice: 'redOnMain',
  })
  // THE ENTRY KEEPS WHICH FILE WAS FILED WHERE; the failure lines stay in the problem alone.
  const written = write(entry.id, { redOnMain: held.map(({ filed: _filed, failureLines: _lines, ...one }) => ({ ...one, mainAt: facts.mainAt })) }, actor)
  return { entry: readMergeEntry(written), decided: `${houseRules === undefined ? `${String(held.length)} file(s) red on main alone belong to no entry, and the entry is not moved.` : `${String(held.length)} plain house-rule file(s) red on main after merge entry ${entry.id} landed.`} ${said}` }
}

function openChangedAnswerProblem(open: PanelRecord[], file: string): PanelRecord | undefined {
  return open.find(problem => problem.title === sayInEnglish('flakyTests.title', { file }) ||
    ((problem.data['extra'] as { changedItsAnswerFamily?: boolean } | undefined)?.changedItsAnswerFamily === true &&
      Array.isArray(problem.data['seen_in']) && problem.data['seen_in'].includes(file)))
}

function fileChangedAnswerProblems(entry: MergeEntryReading, files: NonNullable<FactsOf<'tested'>['changedTheirAnswer']>, position: string): string {
  const names = [...new Set(files.map(one => one.file))]
  if (gateMet('flaky-tests', position) === 'off') return sayInEnglish('flakyTests.off', { count: names.length, files: names.join(', ') })
  // AT BLOCK THE BOUNCE IS THE ANSWER, so nothing is filed and nobody is told. The bounce's own sentence names the files
  // and the setting; this one says what the filing would have been and was not.
  if (position === 'block') return sayInEnglish('flakyTests.block', { count: names.length, files: names.join(', ') })
  return filePerFileProblems(entry, files, {
    title: one => sayInEnglish('flakyTests.title', { file: one.file }),
    symptom: one => sayInEnglish('flakyTests.symptom', { file: one.file,
      observation: sayInEnglish(one.how === 'green-alone' ? 'flakyTests.greenAlone' : 'flakyTests.greenInThePair'),
      commit: one.commit.slice(0, HOW_MUCH_OF_A_COMMIT_A_SYMPTOM_NAMES), log: one.log ?? sayInEnglish('flakyTests.noLog') }),
    extra: (one, buildSheriff) => ({ changedItsAnswerFamily: true, buildSheriff, mergeEntry: entry.id, commit: one.commit, how: one.how, ...(one.log === undefined ? {} : { log: one.log }) }),
    matcher: openChangedAnswerProblem,
    line: (fresh, sheriff) => sayInEnglish('flakyTests.noticeLine', { files: fresh.map(one => `${one.file} (problem ${one.problem})`).join(', '), sheriff: sheriff === null ? '' : sayInEnglish('flakyTests.forSheriff', { handle: sheriff.handle }) }),
    notice: 'aTestChangedItsAnswer',
  }).said
}

/**
 * ONE STEP, REPORTED BY THE MERGE TOOL, DECIDED BY THE OFFICE. SPEC.md section 5.4, every arrow.
 *
 * The step is taken only from the state `A_STEP_IS_TAKEN_FROM` names, its facts are read strictly,
 * and what follows is decided from those facts and from what the office holds. A move that needs no
 * record is the move table's (`theMoveAStepMakes` in src/shared/merge-queue.ts): which state a step is
 * taken from, and where conflict, guard-failed, tested, landing, main-moved, main-moved-while-testing
 * and landed lead. The reply says what was decided and why, and the entry's new reading.
 */
export function stepAMergeEntry(input: { workspaceId: string; id: string; step: MergeStep; facts: Record<string, unknown>; actor: Actor }): {
  entry: MergeEntryReading
  decided: string
} {
  const limits = { landingAttempts: gateNumber('landing-attempts'), toolRuns: gateNumber('tool-runs-in-one-place') }
  const { workspaceId, id, step, actor } = input
  const record = theMergeEntry(id, workspaceId)
  const entry = readMergeEntry(record)
  // THE STATE A STEP IS TAKEN FROM IS THE MOVE TABLE'S (theMoveAStepMakes in src/shared/merge-queue.ts), asked
  // here with the step alone, before its facts are read.
  const asked = theMoveAStepMakes(entry.state, { step }, limits)
  if (asked.move === 'refused' && asked.final) {
    throw new PanelError(`Merge entry ${id} is ${stateWord(entry.state).text}, which is final, so it takes no more steps. Nothing was written.`, 409)
  }
  if (asked.move === 'refused') {
    throw new PanelError(
      `The step "${step}" is reported from ${stateWord(asked.takenFrom).text}, and merge entry ${id} is ${stateWord(entry.state).text}: ${entry.means} It waits on ${entry.waitsOn}. Nothing was written.`,
      409,
    )
  }
  if (step !== 'landed' && entry.takeBackOf !== undefined) {
    const problem = getRecord(entry.takeBackOf.problem)
    if (problem === null || problem.workspaceId !== workspaceId || problem.kind !== 'problem' || problem.data['state'] !== 'open') {
      const says = `Hand-back problem ${entry.takeBackOf.problem} is ${problem === null ? 'missing' : String(problem.data['state'])}; the take-back is refused.`
      return { entry: bounce(entry, 'refused', { files: [] }, says, actor), decided: says }
    }
  }
  const held = machineFieldsOf(record)

  const requireAuthorizedTests = (landingAlreadyAuthorized = false) => {
    if (entry.takeBackOf !== undefined && held.tested?.green !== true) throw new PanelError('A take-back requires a green test run before landing. Nothing was written.', 409)
    const onlyHouseRulesRed = onlyHouseRulesRedAuthorizesLanding(held.tested, held.integration?.result) && held.tested?.houseRules?.mainAt === held.integration?.mainAt
    const position = String(gatePosition('house-rule-reds'))
    const fewPosition = String(gatePosition('few-feature-reds'))
    const widePosition = String(gatePosition('wide-red'))
    const wideRed = held.tested?.mergeClass?.class === 3 && redMergeAuthorizesLanding(held.tested, held.integration?.result) && held.tested.mergeClass.mainAt === held.integration?.mainAt
    const handedBack = held.tested?.mergeClass?.class === 2 && redMergeAuthorizesLanding(held.tested, held.integration?.result) && held.tested.mergeClass.mainAt === held.integration?.mainAt
    if (!landingAlreadyAuthorized && onlyHouseRulesRed && position === 'block') {
      throw new PanelError(`Merge entry ${id} has only plain house rules red, and MOLE_OFFICE_GATE_HOUSE_RULES is now at block, so it may not land. Nothing was written.`, 409)
    }
    if (!landingAlreadyAuthorized && handedBack && (fewPosition === 'block' || (held.tested!.mergeClass!.houseRuleFiles.length > 0 && position === 'block'))) {
      throw new PanelError(`Merge entry ${id} was admitted handed back, and ${fewPosition === 'block' ? 'MOLE_OFFICE_GATE_FEW_FEATURE_REDS' : 'MOLE_OFFICE_GATE_HOUSE_RULES'} is now at block, so it may not land. Nothing was written.`, 409)
    }
    if (!landingAlreadyAuthorized && wideRed) {
      const decision = held.tested!.mergeClass!
      const setting = widePosition === 'block' ? 'MOLE_OFFICE_GATE_WIDE_RED'
        : decision.houseRuleFiles.length > 0 && position === 'block' ? 'MOLE_OFFICE_GATE_HOUSE_RULES'
          : decision.featureFiles.length > 0 && fewPosition === 'block' ? 'MOLE_OFFICE_GATE_FEW_FEATURE_REDS' : null
      if (setting !== null) throw new PanelError(sayInEnglish('wideRed.landingRefused', { id, setting }), 409)
    }
    if (!mergeTestsAuthorizeLanding(held.tested, held.integration?.result, undefined, landingAlreadyAuthorized, position, fewPosition, widePosition) || (held.tested?.green === false && !onlyHouseRulesRed && !handedBack && !wideRed && !originalRedEvidenceMatches(entry, held.integration, held.tested))) {
      throw new PanelError(`Merge entry ${id} has no green test run recorded, so it may not land. Report the step "tested" first. Nothing was written.`, 409)
    }
  }

  switch (step) {
    case 'pinned': {
      const facts = parseTheFacts('pinned', input.facts)
      // THE SEAL IS COUNTED ONCE IN EACH PIN, where theSealOf would first refuse in this step: before the submitted
      // content of a git entry, and before the seal's kind of a files entry. theSealOf runs several times in one step,
      // so it cannot count itself.
      const askTheSeal = (): void => {
        const seal = theSealOrItsRefusal(entry)
        if (seal instanceof PanelError) throw gateMetOnceTheWriteIsTakenBack(seal, () => gateMet('the-seal-matches-the-entry'))
      }
      if (entry.changeset.adapter === 'git') askTheSeal()
      const submitted = theSubmittedContentOf(entry)
      const differences = whereTheyDiffer(submitted, facts.files)
      const refused = whatTheCheckerRefused(facts.checker)
      const also: Record<string, unknown> = {}
      const checked = checkedFrom(facts.checker)
      if (checked !== null) also['checked'] = checked
      // A DECIDED FAILURE BOUNCES THE ENTRY BEFORE ITS CONTENT IS COMPARED. A files entry whose staged
      // bytes are not what it says (a blob missing, a hash that differs) is the submitter's to fix, and
      // the checker says exactly what is wrong; the tool reports the content it really holds, so the
      // comparison would otherwise refuse the report and leave the entry submitted with nothing moving it.
      if (refused !== null) {
        write(id, also, actor)
        const more = differences.length === 0 ? refused.says : `${refused.says} The content held is not what was submitted: ${whereTheyDiffer(submitted, facts.files, true).join('; ')}.`
        return { entry: bounce(entry, 'guard', { files: refused.files }, more, actor), decided: more }
      }
      if ((facts.cannotJoin !== undefined || facts.rebaseStopped !== undefined) && entry.changeset.adapter !== 'git') {
        throw new PanelError('Only a git entry is replayed onto main at the pin; a files entry has no commits. Nothing was written.', 422)
      }
      // A CONFLICT FOUND AT THE PIN BOUNCES HERE, before the gates below, unless it goes to the entry's own supervisor.
      // Then it is handed on only after those gates pass, where the entry would have been pinned, so an entry that leaves
      // resolving has passed them (v06FDSPuiPc9, point 2).
      const conflict =
        facts.cannotJoin !== undefined
          ? { found: { files: facts.cannotJoin.files, mainAt: facts.cannotJoin.mainAt }, more: whyItCannotJoin(facts.cannotJoin) }
          : facts.rebaseStopped !== undefined
            ? { found: { files: facts.rebaseStopped.files, log: facts.rebaseStopped.log, mainAt: facts.rebaseStopped.mainAt }, more: foundEarly(facts.rebaseStopped, facts.rebaseStopped.mainAt) }
            : null
      if (conflict !== null && !theConflictIsHandedOn(entry)) {
        if (entry.changeset.adapter === 'git') gateMet('conflict-resolving', '0')
        write(id, also, actor)
        return { entry: bounce(entry, 'conflict', conflict.found, conflict.more, actor), decided: conflict.more }
      }
      if (differences.length > 0) {
        throw gateMetOnceTheWriteIsTakenBack(
          new PanelError(`The pinned content is not what merge entry ${id} was submitted on (seal ${entry.seal.id}): ${differences.join('; ')}. Nothing was written.`, 422),
          () => gateMet('pinned-content-is-the-submission'),
        )
      }
      // MAIN'S CONTENT IS REPORTED FOR EXACTLY THE SEAL'S PATHS, so the press below compares every path it counts.
      if (facts.main !== undefined) {
        const reported = facts.main.files
        const notReported = Object.keys(submitted).filter((path) => !Object.hasOwn(reported, path)).sort()
        const notInTheSeal = Object.keys(reported).filter((path) => !Object.hasOwn(submitted, path)).sort()
        if (notReported.length > 0 || notInTheSeal.length > 0) {
          throw new PanelError(
            `The pin reports main's content at ${facts.main.at} for other paths than seal ${entry.seal.id} names.` +
              (notReported.length === 0 ? '' : ` Not reported: ${notReported.join(', ')}.`) +
              (notInTheSeal.length === 0 ? '' : ` Not in the seal: ${notInTheSeal.join(', ')}.`) +
              ' Nothing was written.',
            422,
          )
        }
      }
      // A FILES ENTRY IS BOUND TO ITS SEAL, AND TO WHAT THE CHECKER COULD DECIDE, AT THE PIN: its bytes must be
      // bytes the seal froze (issue 4), and a path the checker handed on can never be read by a check (issue 5).
      // Either is known now and holds for as long as the entry does, so it bounces here rather than after the
      // inspector's release and a lane taken for nothing.
      if (entry.changeset.adapter === 'files') {
        const handedOn = whatTheInspectorIsHandedOn(entry, facts.checker)
        // AN ENTRY ON A FILES SEAL IS NOT BOUNCED FOR A PATH THE CHECKER HANDS ON (A2): the check of its seal
        // reads those files and must name each with a line, which is asked where the release is heard. A
        // protected or generated one is the exception, and bounces here.
        askTheSeal()
        const onAFilesSeal = theSealOf(entry).kind === 'files'
        const guarded = onAFilesSeal ? theGuardedAmong(facts.checker, handedOn.map((one) => one.path)) : []
        const notSealed = whatTheSealDoesNotHold(entry, entry.changeset)
        const unjudged =
          notSealed ??
          (guarded.length > 0 ? neverOnAReleaseAlone(guarded) : null) ??
          (handedOn.length === 0 || onAFilesSeal ? null : noCheckCanReadIt(handedOn))
        if (unjudged !== null) {
          write(id, also, actor)
          const bounced = bounce(entry, 'unjudged', { files: unjudged.paths }, unjudged.says, actor)
          // Bytes the seal does not hold are counted once the bounce is written: by the files seal's gate on a files
          // seal, and by the sealed-bytes gate on any other seal.
          if (notSealed !== null) {
            if (onAFilesSeal) gateMet('files-entry-matches-its-files-seal')
            else gateMet('files-entry-bytes-are-sealed')
          }
          return { entry: bounced, decided: unjudged.says }
        }
      }
      // THE REPORT IS READ BEFORE ANY CHECK STARTS, and a missing piece bounces the entry here, in part
      // 1. It comes after the gates that read the content and before the press, so nobody is
      // asked to press for it.
      const lacks = whatTheReportOfThisEntryLacks(entry)
      if (lacks !== null) {
        write(id, also, actor)
        const more = [...lacks.lacks, ...lacks.notRead.map((one) => `Not read: ${one}`)].join(' ')
        return { entry: bounce(entry, 'incomplete', { files: lacks.files }, more, actor), decided: more }
      }
      let deletes: Deletes | null = null
      if (entry.changeset.adapter === 'files') {
        const paths = theDeletesOf(entry.changeset)
        if (paths.length > 0) {
          deletes = askAboutTheDeletes(entry, paths)
          also['deletes'] = deletes
        }
      }
      // A SENSITIVE PATH ASKS THE SECRETARY FOR ITS PRESS AT THE PIN, unless somebody pressed already,
      // and only where the entry's content differs from main's at the pin (wave 13u round 96). A press made before the pin
      // is kept with what the pin found.
      const found = thePressAtThePin(entry, facts.main)
      const press: Press | null =
        found === null
          ? null
          : held.pressToLand !== null
            ? { ...found, asked: held.pressToLand.asked, ...(held.pressToLand.pressed === undefined ? {} : { pressed: held.pressToLand.pressed }) }
            : found.paths.length === 0
              ? { ...found, asked: null }
              : askForThePress(entry, found)
      // A data patch merges, and its null takes a key away, so a press kept already is patched with what the pin found.
      if (found !== null) also['pressToLand'] = held.pressToLand === null ? press : found
      // A DOCUMENTATION ENTRY IS KNOWN FROM ITS PIN STEP ON, and queues in its repository's
      // documentation lane from then on. Only a git entry can be one: a files entry has no suite to spare.
      if (facts.documents !== undefined) {
        if (entry.changeset.adapter !== 'git') throw new PanelError('Only a git entry can be a documentation entry; a files entry has no suite to spare. Nothing was written.', 422)
        also['documents'] = facts.documents
      }
      if (conflict !== null) {
        gateMet('conflict-resolving', '1')
        const handed = handOnTheConflict(entry, conflict.found, conflict.more, actor, also, true)
        return { entry: handed.entry, decided: `${conflict.more} ${handed.waits}` }
      }
      const pinned = readMergeEntry(moveEntry({ id, to: 'pinned', actor, also }))
      const outcome = judgeOrBounce(pinned, actor)
      const deletesSay =
        deletes === null
          ? ''
          : ` The entry deletes ${String(deletes.paths.length)} ${deletes.paths.length === 1 ? 'file' : 'files'}, and the secretary was ${deletes.asked === null ? 'not told: nobody holds the card' : 'asked to confirm that'}.`
      const leftOutSay = press === null ? '' : whatThePinLeftOut(press)
      const pressSay =
        press === null
          ? ''
          : (press.paths.length === 0
              ? ' It touches no path that needs a press.'
              : ` It touches ${String(press.paths.length)} ${press.paths.length === 1 ? 'path that lands' : 'paths that land'} only after a press (${press.paths.join(', ')}), and ` +
                (press.pressed !== undefined
                  ? `${participantWord(press.pressed.by.kind)} ${press.pressed.by.id} pressed already at ${press.pressed.at}.`
                  : press.asked === null
                    ? 'nobody was asked to press: nobody holds the secretary card. The person may press it on the merge queue page.'
                    : 'the secretary was asked to press.')) + (leftOutSay === '' ? '' : ` ${leftOutSay}`)
      return { entry: outcome.entry, decided: `Pinned: the content is exactly what seal ${entry.seal.id} froze. ${outcome.says}${deletesSay}${pressSay}` }
    }

    case 'integrating': {
      parseTheFacts('integrating', input.facts)
      // H_RELEASE, ASKED AGAIN AT THE MERGE STEP. The release cannot be taken back, but the run may
      // have been closed as superseded, or the entry's own record may have been pinned on a seal a
      // later finish replaced; asking again costs one read and the merge rests on the answer.
      const coverage = theVerdictOnThePinnedContent(entry)
      if (coverage.outcome !== 'covers') {
        if (coverage.outcome === 'refused') return { entry: bounce(entry, 'refused', { files: [] }, coverage.says, actor), decided: coverage.says }
        if (coverage.outcome === 'unjudged') {
          const bounced = bounce(entry, 'unjudged', { files: coverage.paths ?? [] }, coverage.says, actor)
          if (coverage.ofAFilesSeal === true) gateMet('files-entry-matches-its-files-seal')
          return { entry: bounced, decided: coverage.says }
        }
        throw new PanelError(`Merge entry ${id} cannot take its lane: ${coverage.says} Nothing was written.`, 409)
      }
      // THE QUEUE HELD (wave 13u round 93): no entry takes a lane while it is held, and one already in a lane finishes.
      if (theQueueIsHeld()) {
        throw gateMetOnceTheWriteIsTakenBack(new PanelError(`${theQueueIsHeldFor(id)} Nothing was written.`, 409), () => gateMet('queue-held', '1'))
      }
      const moved = moveEntry({ id, to: 'integrating', actor })
      return { entry: readMergeEntry(moved), decided: `Integrating: the entry holds the lane ${entry.lane}. ${coverage.says}` }
    }

    case 'integrated': {
      return sqlite.transaction(() => {
        const facts = parseTheFacts('integrated', input.facts)
        const checked = checkedFrom(facts.checker)
        const integration: Integration = {
          result: facts.result,
          mainAt: facts.mainAt,
          ...(facts.clone === undefined ? {} : { clone: facts.clone }),
          files: facts.files,
          at: nowStamp(),
          ...(facts.reads === undefined ? {} : { reads: facts.reads }),
          ...(facts.lines === undefined ? {} : { lines: facts.lines }),
          ...(facts.ownerContent === undefined ? {} : { ownerContent: facts.ownerContent }),
          ...(facts.placeholderCommits === undefined ? {} : { placeholderCommits: facts.placeholderCommits }),
        }
        const refused = whatTheCheckerRefused(facts.checker)
        if (refused !== null) {
          write(id, { integration, ...(checked === null ? {} : { checked }) }, actor)
          return { entry: bounce(entry, 'guard', { files: refused.files, mainAt: facts.mainAt }, refused.says, actor), decided: refused.says }
        }
        const outsideTheArea = whatLandsOutsideItsFilesArea(entry)
        if (outsideTheArea !== null) {
          write(id, { integration, ...(checked === null ? {} : { checked }) }, actor)
          return { entry: bounce(entry, 'guard', { files: outsideTheArea.files, mainAt: facts.mainAt }, outsideTheArea.says, actor), decided: outsideTheArea.says }
        }
        const byTheVerdict = whatNeedsACheckAgain(entry, held, facts.files, facts.checker, facts.lines)
        // A HAND-OVER GOES TO A SCOPED CHECK BEFORE THE SUITE (round B of tier 2, part 6). This is where the check is
        // asked: every file its supervisor resolved that the integrated tree changes on main is added to the scope, so an
        // entry that lands any of the resolution's own lines never takes the move straight to testing below, and the only
        // other move into testing follows a release of that check. A resolved file the tree leaves as main has it lands as
        // main's own and is said, not asked about (problem PRHvQV6YyGQ1).
        const scope = { ...byTheVerdict, ...whatAHandOverAddsToTheScope(entry, held, byTheVerdict, facts.files) }
        const asMain = scope.asMainHasIt
        const asMainSay =
          asMain.length === 0
            ? ''
            : `The ${held.resolving?.red === undefined ? 'resolution' : 'fix'} its check passed, commit ${held.resolution!.commit.slice(0, 12)}, leaves ${asMain.join(', ')} as main has ${asMain.length === 1 ? 'it' : 'them'}, so ${asMain.length === 1 ? 'it lands' : 'they land'} as main's own and no scoped check is asked about ${asMain.length === 1 ? 'it' : 'them'}. `
        const byHand =
          scope.resolved.length === 0
            ? ''
            : `The supervisor ${held.resolving?.red === undefined ? 'resolved' : 'fixed'} ${scope.resolved.join(', ')} by hand, so ${scope.resolved.length === 1 ? 'it is' : 'they are'} in the scoped check whatever content the verdict read: a hand-over reaches the suite only after one. `
        const handedOnByTheChecker = byTheVerdict.needsJudgment.length
        const renumberingNotice = tellRenumberedMigrations(workspaceId, entry, facts.renumberedMigrations ?? [])
        // A VERDICT KEPT BY LINE IS SAID WHERE A PERSON READS IT, on the entry and in the notice, with the file, its lines
        // and the decision (message cHz3hjwN4flv).
        if (scope.keptByLine.length > 0) {
          integration.keptByLine = { files: scope.keptByLine.map((one) => ({ path: one.path, ranges: one.ranges ?? 'lines' })), says: keptByLineSay(scope.keptByLine) }
        }
        const keptSay = `${String(scope.kept.length)} ${scope.kept.length === 1 ? 'path keeps' : 'paths keep'} the verdict${integration.keptByLine === undefined ? '' : ` (${integration.keptByLine.says})`}`
        // AN ENTRY ON A FILES SEAL NEEDS NO CHECK AGAIN FOR A PATH ITS RELEASE ALREADY JUDGED WITH A LINE
        // (A2): the files are the sealed bytes, so the release that read them still reads them. A protected
        // or generated one never rests on that release alone. A git entry is asked exactly as before.
        const onAFilesSeal = entry.changeset.adapter === 'files' && theSealOf(entry).kind === 'files'
        const guarded = onAFilesSeal ? theGuardedAmong(facts.checker, scope.only) : []
        const judgedByTheRelease = onAFilesSeal ? whatTheReleaseJudged(theReleaseOfTheRun(entry)) : new Set<string>()
        const stillToJudge = scope.only.filter((path) => !judgedByTheRelease.has(path))
        if (stillToJudge.length === 0 && guarded.length === 0) {
          const moved = moveEntry({ id, to: 'testing', actor, also: { integration, ...(checked === null ? {} : { checked }) } })
          const judgedSay = scope.only.length === 0 ? 'nothing needs judging again' : `the release judged ${scope.only.join(', ')}, which the files checker handed on, each with a line of its own`
          return { entry: readMergeEntry(moved), decided: `Integrated as ${facts.result} on ${facts.mainAt}: ${keptSay}, and ${judgedSay}. ${asMainSay}${thePluginRuleSays(scope)}The entry is testing. ${renumberingNotice}`.trim() }
        }
        // BELOW FULL NO CHECK AGAIN IS ASKED, for a git entry or a files entry: the project's review level, read now,
        // covers the paths that changed, no inspector reads them, and the queue's own tests decide the entry. A check
        // again asked here could never be released, so the entry stood in reinspecting for good. A protected or
        // generated path still never lands without a release, and bounces below.
        const level = theReviewLevel(workspaceId)
        if (level !== 'full' && guarded.length === 0) {
          const moved = moveEntry({ id, to: 'testing', actor, also: { integration, ...(checked === null ? {} : { checked }) } })
          return {
            entry: readMergeEntry(moved),
            decided:
              `Integrated as ${facts.result} on ${facts.mainAt}: ${keptSay}, and the verdict does not cover ${stillToJudge.join(', ')}. ` +
              `This project's review level is ${REVIEW_LEVEL_WORDS[level]}, so the level covers ${stillToJudge.length === 1 ? 'it' : 'them'}: no inspector reads ${stillToJudge.length === 1 ? 'it' : 'them'}, and the queue's own tests decide the entry. ` +
              `${asMainSay}${thePluginRuleSays(scope)}The entry is testing. ${renumberingNotice}`.trim(),
          }
        }
        // A FILES ENTRY THAT NEEDS A CHECK AGAIN IS BOUNCED, WHICH LETS ITS LANE GO. Until the sandbox v1 fix
        // this answered 409, the tool stopped, and the entry held its lane in integrating until somebody
        // withdrew it (INTEGRATION.md section 7, issue 5).
        if (entry.changeset.adapter === 'files') {
          // EACH PATH WITH ITS OWN REASON (the check of run pMPH32kY-Bld, 23 September 2026): a protected or
          // generated path never lands on a release alone (A2); any other path the files checker handed on is
          // one the release did not judge with a line; and a path whose content changed after the verdict is
          // said as that, never as one the checker handed on.
          const handed = scope.needsJudgment.filter((one) => stillToJudge.includes(one.path) && !guarded.includes(one.path))
          const changed = stillToJudge.filter((path) => !guarded.includes(path) && !handed.some((one) => one.path === path))
          const parts = [
            ...(guarded.length === 0 ? [] : [neverOnAReleaseAlone(guarded)]),
            ...(handed.length === 0 ? [] : [noCheckCanReadIt(handed, onAFilesSeal)]),
            ...(changed.length === 0 ? [] : [itsContentChanged(changed)]),
          ]
          const unjudged: Unjudged = { paths: [...new Set(parts.flatMap((one) => one.paths))], says: parts.map((one) => one.says).join(' ') }
          write(id, { integration, ...(checked === null ? {} : { checked }) }, actor)
          return { entry: bounce(entry, 'unjudged', { files: unjudged.paths, mainAt: facts.mainAt }, unjudged.says, actor), decided: unjudged.says }
        }
        const reinspection = askForACheckAgain(entry, facts, { only: scope.only, needsJudgment: scope.needsJudgment }, scope.resolved)
        const moved = moveEntry({ id, to: 'reinspecting', actor, also: { integration, reinspection, ...(checked === null ? {} : { checked }) } })
        return {
          entry: readMergeEntry(moved),
          decided:
            `Integrated as ${facts.result} on ${facts.mainAt}: ${keptSay}, and ${String(scope.only.length)} ${scope.only.length === 1 ? 'path needs' : 'paths need'} judging again ` +
            `(${scope.only.join(', ')}${handedOnByTheChecker === 0 ? '' : `; ${String(handedOnByTheChecker)} handed on by the checker`}). ` +
            `${asMainSay}${byHand}${thePluginRuleSays(scope)}The office asked for a scoped check on run ${reinspection.run}: ${reinspection.says} ${renumberingNotice}`.trim(),
        }
      })()
    }

    case 'conflict': {
      const facts = parseTheFacts('conflict', input.facts)
      const found = { files: facts.files, ...(facts.log === undefined ? {} : { log: facts.log }), ...(facts.mainAt === undefined ? {} : { mainAt: facts.mainAt }) }
      const move = theMoveAStepMakes(entry.state, { step, handsOnTheConflict: theConflictIsHandedOn(entry) }, limits)
      if (entry.changeset.adapter === 'git') gateMet('conflict-resolving', move.move === 'to' ? '1' : '0')
      if (move.move === 'to') {
        // A HANDED-ON CONFLICT KEEPS ONLY WHAT THE STEP SAID: "Resolve it in your sandbox and submit again" is a bounce's remedy.
        const handed = handOnTheConflict(entry, found, facts.says ?? '', actor, {}, true)
        return { entry: handed.entry, decided: `Conflict in ${facts.files.join(', ')}. ${handed.waits}` }
      }
      const more = facts.says ?? 'Resolve it in your sandbox and submit again.'
      return { entry: bounce(entry, aBounce(move, step).reason, found, more, actor), decided: `Conflict in ${facts.files.join(', ')}.` }
    }

    case 'guard-failed': {
      return sqlite.transaction(() => {
        const facts = parseTheFacts('guard-failed', input.facts)
        const move = aBounce(theMoveAStepMakes(entry.state, { step }, limits), step)
        const more = `The guard "${facts.guard}" refused it.${facts.detail === undefined ? '' : ` ${facts.detail}`}`
        const notice = tellRenumberedMigrations(workspaceId, entry, facts.renumberedMigrations ?? [])
        return { entry: bounce(entry, move.reason, { files: facts.files, ...(facts.log === undefined ? {} : { log: facts.log }) }, more, actor), decided: `${more} ${notice}`.trim() }
      })()
    }

    case 'tested': {
      const facts = parseTheFacts('tested', input.facts, value => value.wholeSuiteRed === undefined || originalRedEvidenceMatches(entry, held.integration, value))
      if (facts.testedWith !== undefined && facts.borrowedFrom !== undefined) {
        throw new PanelError('A test run either ran a pair\'s suite (testedWith) or borrows from one (borrowedFrom), never both. Nothing was written.', 422)
      }
      // A RUN NAMES ITS TESTS AS RED ONLY WITH THE ENTRY ONLY WHEN THAT IS TRUE OF EVERY RED TEST (13u round 63), so a red
      // handed to the entry's own line never leaves another red test behind it.
      if (facts.redOnlyWithIt !== undefined) {
        if (facts.green) throw new PanelError('A green test run has no test that is red only with the entry, so it names none in `redOnlyWithIt`. Nothing was written.', 422)
        const red = facts.redTests ?? []
        if ([...new Set(facts.redOnlyWithIt)].sort().join('\n') !== [...new Set(red)].sort().join('\n')) {
          throw new PanelError(`A red test run names in \`redOnlyWithIt\` the same tests as in \`redTests\`, and this one names ${facts.redOnlyWithIt.join(', ')} there and ${red.length === 0 ? 'none' : red.join(', ')} in \`redTests\`. Nothing was written.`, 422)
        }
      }
      if (facts.borrowedFrom !== undefined) {
        const refused = whyABorrowedResultIsRefused(entry, facts)
        if (refused !== null) throw new PanelError(`${refused} Nothing is borrowed, and nothing was written.`, 409)
      }
      if (facts.plugin !== undefined) {
        const refused = whyAPluginsCheckCannotStandFor(entry, held.integration, facts.plugin)
        if (refused !== null) throw new PanelError(`${refused} Nothing was written.`, 409)
      }
      // THE ONE READING OF THE FLAKY GATE, taken after every refusal above has thrown, so a refusal still writes nothing.
      // The filing and its count read this same position.
      const flakyPosition = String(gatePosition('flaky-tests'))
      const flakyAtBlock = facts.changedTheirAnswer !== undefined && flakyPosition === 'block'
      const flakyFiles = [...new Set((facts.changedTheirAnswer ?? []).map(one => one.file))]
      // Called only after the branch's refusals and entry writes have succeeded. The step has no outer transaction.
      const withChangedAnswers = (result: { entry: MergeEntryReading; decided: string }) => facts.changedTheirAnswer === undefined
        ? result
        : { ...result, decided: `${result.decided} ${fileChangedAnswerProblems(entry, facts.changedTheirAnswer, flakyPosition)}` }
      // THE CLOCK OBSERVATION BESIDE THE STAMP, which the queue's speed measures from: the stamp alone repeats an hour
      // when the clocks go back.
      const testedClock = clockStamp()
      const tested: Tested = {
        green: facts.green,
        ...(facts.build === undefined ? {} : { build: facts.build }),
        ...(facts.repair === undefined ? {} : { repair: facts.repair }),
        log: facts.log,
        at: testedClock.stamp,
        time: testedClock,
        ...(facts.redTests === undefined ? {} : { redTests: facts.redTests }),
        ...(facts.tip === undefined ? {} : { tip: facts.tip }),
        ...(facts.ran === undefined ? {} : { ran: facts.ran }),
        ...(facts.passed === undefined ? {} : { passed: facts.passed }),
        // THE TOOL'S OWN SENTENCE ABOUT THE RUN IS KEPT, so what it could not do as asked, a worker count its setting did
        // not name among them, is read on the entry and not only in the tool's log (message DANnbZMeDgma).
        ...(facts.says === undefined ? {} : { says: facts.says }),
        // AND HOW FAST THE OFFICE ANSWERED WHILE THE SUITE RAN, so the worker count can be weighed against the office's own
        // responsiveness on the entries themselves (message dza6Mv2og63z; acceptance finding 64).
        ...(facts.officeHealth === undefined ? {} : { officeHealth: facts.officeHealth }),
        ...(facts.testedWith === undefined ? {} : { testedWith: facts.testedWith }),
        ...(facts.borrowedFrom === undefined ? {} : { borrowedFrom: facts.borrowedFrom }),
        ...(facts.loadTimeouts === undefined ? {} : { loadTimeouts: facts.loadTimeouts }),
        ...(facts.plugin === undefined ? {} : { plugin: facts.plugin }),
        ...(facts.wholeSuiteRed === undefined ? {} : { wholeSuiteRed: facts.wholeSuiteRed }),
        ...(facts.busCause === undefined ? {} : { busCause: facts.busCause }),
        ...(facts.relatedOnly === undefined ? {} : { relatedOnly: facts.relatedOnly }),
        ...(facts.wholeSuiteBecause === undefined ? {} : { wholeSuiteBecause: facts.wholeSuiteBecause }),
      }
      // These are complete observations. A recursive patch must not retain a previous cause or admission.
      const keepTested = (value: Tested) => sqlite.transaction(() => {
        if (held.tested?.relatedOnly !== undefined || held.tested?.wholeSuiteBecause !== undefined || held.tested?.wholeSuiteRed !== undefined || held.tested?.busCause !== undefined || held.tested?.houseRules !== undefined || held.tested?.mergeClass !== undefined || held.tested?.build !== undefined || held.tested?.repair !== undefined) {
          write(id, { tested: { relatedOnly: null, wholeSuiteBecause: null, wholeSuiteRed: null, busCause: null, houseRules: null, mergeClass: null, build: null, repair: null } }, actor)
        }
        return write(id, { tested: value }, actor)
      })()
      const how =
        facts.testedWith !== undefined
          ? facts.testedWith.bus !== undefined && facts.testedWith.bus.length > 1
            ? ` It was tested in one suite with merge entries ${facts.testedWith.bus.map((one) => one.entry).join(', ')}, on the bus's tree ${facts.testedWith.tree.slice(0, 12)}.`
            : ` It was tested in one suite with merge entry ${facts.testedWith.entry}, on the pair's tree ${facts.testedWith.tree.slice(0, 12)}.`
          : facts.borrowedFrom !== undefined
            ? ` It is the result of the suite merge entry ${facts.borrowedFrom.entry} ran with it, on the same tree ${facts.borrowedFrom.tree.slice(0, 12)}; nothing was run again.`
            : facts.plugin !== undefined
              ? ` It changes only ${PLUGINS_FOLDER}/${facts.plugin.id}, so it was tested by that plugin's own check and the privacy gates, and not by the office's suite.`
              : ''
      const takeBack = isATakeBack(entry)
      const admittedForFixRound = !takeBack && !facts.green && fixRoundAuthorizesLanding(tested, held.integration?.result)
      let houseRulesSays = ''
      if (!takeBack && !facts.green && !wholeSuiteFixRoundIsOn()) {
        const integration = held.integration
        const mainAt = integration?.mainAt ?? ''
        let reading = readMainHouseRules(mainAt, facts.redTests ?? [], args => {
          if (entry.changeset.adapter !== 'git' || integration === null) throw new Error('No git integration is recorded.')
          return readGit(integration.clone ?? entry.changeset.root, args).toString('utf8')
        })
        const position = gatePosition('house-rule-reds') as HouseRulesDecision['position']
        tested.houseRules = { ...reading, position }
        if (reading.class === 1 && (facts.tip === undefined || facts.tip !== integration?.result)) {
          reading = { ...reading, class: null, reason: 'The tested tip is missing or differs from the integrated result, so the office cannot admit this red run as class 1.' }
          tested.houseRules = { ...reading, position }
        }
        if (reading.class === 1) gateMet('house-rule-reds', position)
        const differs = facts.houseRules !== undefined && (facts.houseRules.class !== reading.class || facts.houseRules.list.state !== reading.list.state || facts.houseRules.mainAt !== reading.mainAt || facts.houseRules.files.length !== reading.files.length || facts.houseRules.files.some((one, index) => {
          const own = reading.files[index]
          return own === undefined || one.file !== own.file || one.class !== own.class || one.kind !== own.kind || one.mark !== own.mark
        }))
        houseRulesSays = `${differs ? " The tool's house-rule expectation differs from the office's reading; the office's reading wins." : ''} ` +
          (reading.list.state === 'unreadable' ? `The office could not read main's house-rule list: ${reading.list.reason}.`
            : reading.class === 1 ? `Only plain house rules are red: ${reading.files.map(one => one.file).join(', ')}. MOLE_OFFICE_GATE_HOUSE_RULES is at ${position}.` : reading.reason)
      }
      if (!takeBack && !facts.green && !wholeSuiteFixRoundIsOn() && tested.houseRules?.class !== 1) {
        const integration = held.integration
        const mainAt = integration?.mainAt ?? '', result = integration?.result ?? ''
        const clone = integration?.clone ?? entry.changeset.root
        const redFiles = (facts.redTests ?? []).filter(file => {
          try { return entry.changeset.adapter === 'git' && readGit(clone, ['cat-file', '-t', `${result}:${file}`]).toString('utf8').trim() === 'blob' } catch { return false }
        })
        let databasePaths: string[] | null = null, pathsProblem: string | undefined
        try {
          if (entry.changeset.adapter !== 'git' || integration === null || mainAt === '' || result === '') throw new Error("The entry's own integration range is not recorded.")
          databasePaths = readGit(clone, ['diff', '--no-renames', '--name-only', '-z', mainAt, result]).toString('utf8').split('\0').filter(path => DATABASE_FOLDERS.some(folder => path.startsWith(folder)))
        } catch (error) { pathsProblem = error instanceof Error ? error.message : String(error) }
        const house = tested.houseRules!
        const listProblem = house.list.state === 'unreadable' ? house.list.reason : 'the list is absent'
        const list = house.list.state === 'read' ? new Map(house.files.filter(one => one.class !== undefined).map(({ file, ...rule }) => [file, rule as HouseRule])) : null
        const roundOpen = theRoundOpenForAnEntry(entry), fewRedFiles = Number(settingValue('MOLE_OFFICE_FEW_RED_FILES'))
        const reading = classifyRedMerge({ redTests: facts.redTests ?? [], list, listProblem, redFiles, build: facts.build?.passed, databasePaths, pathsProblem, roundOpen, fewRedFiles })
        const position = gatePosition('few-feature-reds') as MergeClassDecision['position']
        const houseRulesPosition = house.position
        const differs = facts.mergeClass !== undefined && (facts.mergeClass['class'] !== reading.class && facts.mergeClass['expectation'] === undefined || JSON.stringify(facts.mergeClass['databasePaths']) !== JSON.stringify(databasePaths) || JSON.stringify(facts.mergeClass['featureFiles']) !== JSON.stringify(reading.featureFiles))
        const ownWins = differs ? " The tool's merge-class expectation differs from the office's reading; the office's reading wins." : ''
        if (reading.class === 2 && facts.tip === result && roundOpen.open === true) {
          gateMet('few-feature-reds', position)
          // A CLASS-TWO ENTRY THAT HOLDS HOUSE-RULE FILES MEETS THE HOUSE-RULE GATE TOO, at the position read above, so
          // the count and the act read one value.
          if (reading.houseRuleFiles.length > 0) gateMet('house-rule-reds', houseRulesPosition)
          tested.mergeClass = { ...reading, class: 2, mainAt, build: true, databasePaths: [], roundOpen: { open: true, starter: roundOpen.starter!, run: roundOpen.run! }, fewRedFiles, position, houseRulesPosition }
          houseRulesSays = `${ownWins} ${reading.reason} MOLE_OFFICE_GATE_FEW_FEATURE_REDS is at ${position}.${reading.houseRuleFiles.length > 0 ? ` MOLE_OFFICE_GATE_HOUSE_RULES is at ${houseRulesPosition}.` : ''}`
        } else if (reading.class === 3 && [4, 5, 6, 7, 8].includes(reading.cause ?? 0) && facts.tip === result && list !== null && databasePaths !== null && Number.isSafeInteger(fewRedFiles) && fewRedFiles > 0) {
          const widePosition = gateMet('wide-red') as WideRedDecision['position']
          // A CLASS-THREE ENTRY MEETS THE HOUSE-RULE AND FEW-FEATURE GATES TOO WHEN IT HOLDS THOSE FILES, at the
          // positions read above, so each count and the act it explains read one value.
          if (reading.houseRuleFiles.length > 0) gateMet('house-rule-reds', houseRulesPosition)
          if (reading.featureFiles.length > 0) gateMet('few-feature-reds', position)
          tested.mergeClass = { class: 3, cause: reading.cause as WideRedDecision['cause'], files: reading.files, featureFiles: reading.featureFiles, houseRuleFiles: reading.houseRuleFiles, reason: reading.reason,
            mainAt, build: true, databasePaths: reading.cause === 6 ? databasePaths : [],
            roundOpen: roundOpen.open ? { open: true, starter: roundOpen.starter!, run: roundOpen.run! } : { open: false, reason: roundOpen.reason! },
            fewRedFiles, position: widePosition, houseRulesPosition, fewFeatureRedsPosition: position }
          houseRulesSays = `${ownWins} ${reading.reason} ${sayInEnglish('wideRed.position', { position: widePosition })}${reading.houseRuleFiles.length > 0 ? ` ${sayInEnglish('wideRed.housePosition', { position: houseRulesPosition })}` : ''}${reading.featureFiles.length > 0 ? ` ${sayInEnglish('wideRed.featurePosition', { position })}` : ''}`
        } else if (reading.class !== 1) {
          const houseDifference = houseRulesSays.includes('house-rule expectation differs') ? " The tool's house-rule expectation differs from the office's reading; the office's reading wins." : ''
          const featureFacts = facts.houseRules?.class === 1 ? ` Main's house-rule inventory says: ${house.reason}` : ''
          const unreadList = reading.cause !== undefined && list === null ? ` The office could not read main's house-rule list: ${listProblem}.` : ''
          const unreadPaths = reading.cause !== undefined && databasePaths === null ? ` The office could not read the changed paths for this entry's own integration: ${pathsProblem}.` : ''
          houseRulesSays = `${houseDifference}${ownWins} ${reading.class === 2 ? 'The tested tip is missing or differs from the integrated result, so the office cannot admit this red run as class 2.' : reading.reason}${featureFacts}${unreadList}${unreadPaths}`
          if (reading.class === 3) houseRulesSays += ` ${facts.tip !== result ? sayInEnglish('wideRed.wrongTip') + ' ' : ''}${!Number.isSafeInteger(fewRedFiles) || fewRedFiles < 1 ? sayInEnglish('wideRed.invalidLimit') + ' ' : ''}${sayInEnglish(reading.cause === 1 || reading.cause === 2 ? 'wideRed.buildRefusedEverywhere' : 'wideRed.refusedEverywhere')}`
        }
      }
      let repairPassed: boolean | undefined, repairSays = ''
      if (entry.repairOf !== undefined) {
        const expected = entry.repairOf, reported = facts.repair
        const exact = reported?.problem === expected.problem && reported.files.length === expected.files.length && new Set(reported.files.map(one => one.file)).size === expected.files.length && expected.files.every(file => reported.files.some(one => one.file === file))
        const failed = expected.files.filter(file => !reported?.files.some(one => one.file === file && one.passed))
        repairPassed = exact && failed.length === 0
        if (!repairPassed) repairSays = reported === undefined ? ` The tool did not report the named-file results for hand-back problem ${expected.problem}: ${expected.files.join(', ')}.`
          : ` Repair of hand-back problem ${expected.problem} did not pass its exact named files: ${(failed.length > 0 ? failed : expected.files).join(', ')}.`
      }
      const onlyHouseRulesRed = tested.houseRules?.class === 1 && tested.houseRules.position !== 'block'
      const wideRed = tested.mergeClass?.class === 3 && redMergeAuthorizesLanding(tested, held.integration?.result)
      const handedBack = tested.mergeClass?.class === 2 && redMergeAuthorizesLanding(tested, held.integration?.result)
      const happened: WhatHappenedToAnEntry = { step, green: facts.green, admittedForFixRound, onlyHouseRulesRed, handedBack, wideRed, repairPassed, flakyAtBlock, ...(takeBack ? { takeBack: true } : {}) }
      // A TEST RED ONLY WITH THE ENTRY GOES TO ITS OWN LINE FIRST (13u round 63), the way a conflict no rule joins does: only
      // for a git entry, only when the run named every red test as red only with it, and only where nothing else bounces
      // or keeps it first. A red met after a conflict's resolution passed its check is not handed on: it bounces as "not
      // green", as before. The gate counts every red that reaches the switch, and the switch decides whether it is handed on.
      const redOnly = entry.changeset.adapter === 'git' && facts.redOnlyWithIt !== undefined && !(held.resolution?.checked !== undefined && held.resolving?.red === undefined)
      const reaches = redOnly && theMoveAStepMakes(entry.state, { ...happened, handsOnTheRed: true }, limits).move === 'to'
      const handsOnTheRed = reaches && gatePosition('red-fixing') === '1'
      if (reaches) gateMet('red-fixing', handsOnTheRed ? '1' : '0')
      const move = theMoveAStepMakes(entry.state, { ...happened, handsOnTheRed }, limits)
      if (move.move === 'stays' && move.because === 'wide-red') {
        const written = keepTested(tested)
        return withChangedAnswers({ entry: readMergeEntry(written), decided: sayInEnglish('wideRed.mayLand', { files: (facts.redTests ?? []).join(', '), how, reading: houseRulesSays }) })
      }
      if (move.move === 'stays' && move.because === 'handed-back') {
        const written = keepTested(tested)
        return withChangedAnswers({ entry: readMergeEntry(written), decided: `The entry may land, handed back: ${tested.mergeClass!.featureFiles.join(', ')}.${how}${houseRulesSays}` })
      }
      if (move.move === 'stays' && move.because === 'only-house-rules-red') {
        const written = keepTested(tested)
        return withChangedAnswers({ entry: readMergeEntry(written), decided: `The entry may land, only house rules red: ${(facts.redTests ?? []).join(', ')}.${how}${houseRulesSays}` })
      }
      if (move.move === 'stays' && move.because === 'admitted-for-fix-round') {
        const written = keepTested(tested)
        return withChangedAnswers({ entry: readMergeEntry(written), decided: `Whole suite red; admitted for a fix round.${how} The entry may land.` })
      }
      if (move.move === 'stays' && move.because === 'green') {
        const written = keepTested({ ...tested, green: true })
        const holds = whyTheDeletesHoldIt(entry, held) ?? whyThePressHoldsIt(entry, held)
        return withChangedAnswers({ entry: readMergeEntry(written), decided: `Green${facts.ran === undefined || facts.passed === undefined ? '' : ` (${String(facts.passed)}/${String(facts.ran)})`}.${how} The entry may land.${holds === null ? '' : ` ${holds}`}` })
      }
      // A PAIR'S RESULT IS KEPT ON THE ENTRY THAT RAN IT EVEN WHEN IT BOUNCES, so the other can borrow what was decided
      // for it ("red on both"), and when its red is handed on. Any other red run bounces with nothing kept, as before. AT
      // BLOCK A GREEN PAIR'S RUN IS NOT KEPT: a partner borrows the decision the suite recorded for it, not the entry's own
      // green, so keeping it would let the partner borrow a green the gate had just refused.
      const keepsItsRun = (facts.relatedOnly !== undefined || facts.wholeSuiteBecause !== undefined || held.tested?.relatedOnly !== undefined || held.tested?.wholeSuiteBecause !== undefined || facts.testedWith !== undefined || held.tested?.wholeSuiteRed !== undefined || facts.busCause !== undefined) && !(flakyAtBlock && facts.green)
      // THE DEFAULT SENTENCE IS ABOUT FILES THAT STAYED RED WHEN EACH RAN ALONE: the run's own red tests, or the named
      // files of a repair that did not pass. A green run at flaky block has neither unless its repair did not pass.
      const stayedRed = facts.says ?? (repairPassed === false || (!(flakyAtBlock && facts.green) && (facts.redTests ?? []).length > 0) ? 'Each was rerun alone on the same tree and stayed red.' : '')
      const blockSays = flakyAtBlock
        ? sayInEnglish(repairPassed === false ? 'flakyTests.blockBounceRepair' : facts.green ? 'flakyTests.blockBounceGreen' : 'flakyTests.blockBounceRed', { files: flakyFiles.join(', ') })
        : ''
      const more = `${stayedRed}${how}${houseRulesSays}${repairSays}${blockSays === '' ? '' : ` ${blockSays}`}`.trim()
      // A FEW-RED ENTRY WHOSE LINE'S STARTER HAS NO RUN GOING WAITS FOR A FIX ROUND THE OFFICE ASKS FOR ITSELF (13u round
      // 90), where the move table keeps a waiting entry and that is the one reason it is not class 2. It keeps its lane
      // while it waits. When no door takes an ask, it bounces as before, and the bounce names each ask and its answer.
      let fixRoundSays = ''
      const ifItWaits = move.move === 'bounce' ? theMoveAStepMakes(entry.state, { ...happened, handsOnTheRed, waitsForAFixRound: true }, limits) : null
      const three = ifItWaits?.move === 'stays' && ifItWaits.because === 'waits-for-a-fix-round' ? whatAFixRoundWouldLand(tested) : null
      if (three !== null) {
        const wait = theWaitForAFixRound(testedClock)
        const line = askTheLine(entry, three, tested, wait)
        const asks = line.status === 202 ? [line] : [line, askTheSheriff(entry, three, tested, wait)]
        if (asks.some(ask => ask.status === 202)) {
          const waits: WaitsForAFixRound = { ...wait, asks }
          const written = sqlite.transaction(() => {
            keepTested(tested)
            if (held.waitsForAFixRound !== null) write(id, { waitsForAFixRound: null }, actor)
            return write(id, { waitsForAFixRound: waits }, actor)
          })()
          return withChangedAnswers({ entry: readMergeEntry(written), decided: `Red: ${(facts.redTests ?? []).join(', ')}.${how}${houseRulesSays} It waits for a fix round until ${wait.until} (${wait.timeZone}). ${whatEachAskWasAnswered(asks)}` })
        }
        fixRoundSays = ` ${whatEachAskWasAnswered(asks)}`
      }
      if (move.move === 'to') {
        // THE RED IS HANDED ON: the refusals above made `redTests` the tests `redOnlyWithIt` names, and the main the entry
        // was integrated and tested on is the main its fix stands on.
        const mainAt = held.integration?.mainAt
        if (mainAt === undefined) {
          throw anEntryWithoutWhatItsStateHolds(id, entry.state, ['the main it was integrated on'], "The entry's record is broken. The red was counted, and the count is kept. The office wrote no brief and sent no asking message, and the entry did not move.")
        }
        if (keepsItsRun) keepTested(tested)
        const tests = facts.redTests ?? []
        const handed = handOnTheRed(entry, { tests, log: facts.log, mainAt }, more, actor)
        return withChangedAnswers({ entry: handed.entry, decided: `Red: ${tests.join(', ')}.${how}${houseRulesSays}${repairSays} ${handed.waits}` })
      }
      const red = aBounce(move, step)
      // AT BLOCK THE FLAKY FILES JOIN THE RED TESTS, THE RUN'S OWN FIRST, EACH FILE ONCE. A repair that did not pass keeps
      // naming only its own files, as it did before.
      const redTests = repairPassed === false
        ? entry.repairOf!.files
        : flakyAtBlock ? [...new Set([...(facts.redTests ?? []), ...flakyFiles])] : facts.redTests
      if (repairPassed !== false && (redTests ?? []).length === 0) throw new PanelError('A red test run names the tests that stayed red on their own, in `redTests`. Nothing was written.', 422)
      if (keepsItsRun) keepTested(tested)
      // A HAND-OVER WHOSE SUITE IS RED BOUNCES AS "not green" (round B of tier 2, part 6): the tree that was tested holds its resolution.
      const notGreen: { resolution?: ResolutionBounce } = held.resolution?.checked === undefined || red.reason !== THE_REASON_A_RESOLUTION_BOUNCE_KEEPS['not green'] ? {} : { resolution: 'not green' }
      return withChangedAnswers({ entry: bounce(entry, red.reason, { files: [], redTests, ...(flakyAtBlock ? { changedTheirAnswer: flakyFiles } : {}), log: facts.log, ...notGreen }, `${more}${fixRoundSays}`, actor), decided: `Red: ${(redTests ?? []).join(', ')}.${how}${houseRulesSays}${repairSays}${fixRoundSays}` })
    }

    case 'no-room-to-test':
    case 'no-room-to-integrate': {
      const facts = parseTheFacts(step, input.facts)
      return { ...theEntryWaitsForRoom(entry, record, facts.says, actor) }
    }

    case 'red-on-main': {
      const facts = parseTheFacts('red-on-main', input.facts)
      return { ...fileRedOnMainProblems(entry, facts, actor) }
    }

    // THE MERGE TOOL'S CHECK OF A RESOLUTION (XHY2fVFG3Qq8, answer 1, as v06FDSPuiPc9 corrects it). A refusal is
    // written on the resolution, and the entry stays resolving, where the end of its time to resolve decides what
    // follows. A pass is read against the ref the tool pointed at it, and the entry goes to pinned and is judged there
    // as the pin step judges: judged means the inspector released exactly this content, so only a release that covers
    // it moves it on.
    case 'fix-round-looked': {
      parseTheFacts('fix-round-looked', input.facts)
      return lookAtTheFixRound(entry, held, actor)
    }

    case 'resolution-checked': {
      const facts = parseTheFacts('resolution-checked', input.facts)
      const resolution = held.resolution
      if (resolution === null || !aResolutionWaitsForItsCheck(entry.state, resolution)) {
        throw new PanelError(
          `Merge entry ${id} holds no resolution that waits for its check` +
            `${resolution?.refused === undefined ? '' : `: the check already refused commit ${resolution.commit.slice(0, 12)} at ${resolution.refused.at}`}. Nothing was written.`,
          409,
        )
      }
      if (facts.commit !== resolution.commit) {
        throw new PanelError(
          `The check was of commit ${facts.commit}, and merge entry ${id} holds the resolution commit ${resolution.commit}, handed over at ${resolution.at}: a later hand-over replaced the one checked. Nothing was written.`,
          409,
        )
      }
      // A FIX OF RED TESTS (13u round 63) is checked on top of the replay: it resolves no place, and its pass names the
      // files the fix changes on top of the replay, in `fixed`. A conflict's resolution names none.
      const red = held.resolving?.red !== undefined
      if (!facts.ok) return writeTheRefusal(entry, held, resolution, facts.says, actor)
      if (red && facts.fixed === undefined) {
        throw new PanelError(`Merge entry ${id} was handed on for its red tests, so a pass of its fix names the files the fix changes on top of the replay, in \`fixed\`. Nothing was written.`, 422)
      }
      if (red && (facts.places.length > 0 || facts.morePlaces !== undefined)) {
        throw new PanelError(`Merge entry ${id} was handed on for its red tests, and a fix resolves no conflict, so a pass of it lists no places. Nothing was written.`, 422)
      }
      if (!red && facts.fixed !== undefined) {
        throw new PanelError(`Merge entry ${id} was handed on for a conflict, and \`fixed\` names the files of a fix of red tests, so a pass of its resolution names none. Nothing was written.`, 422)
      }
      const ref = resolvedRefOf(id)
      if (facts.ref !== ref) throw new PanelError(`The check names the ref ${facts.ref}, and a resolution the check passed is held at ${ref}. Nothing was written.`, 422)
      let pointsAt: string
      try {
        pointsAt = readGit(entry.changeset.root, ['rev-parse', '--verify', `${ref}^{commit}`]).toString('utf8').trim()
      } catch (error) {
        throw new PanelError(`The office could not read ${ref} in ${entry.changeset.root}: ${whyGitDidNotAnswer(error)}. Nothing was written.`, 409)
      }
      if (pointsAt !== resolution.commit) {
        throw new PanelError(`${ref} in ${entry.changeset.root} points at ${pointsAt}, not at the resolution's commit ${resolution.commit}. Nothing was written.`, 409)
      }
      const landedBy = whoLandedTheseCommits(entry.changeset.root, resolution.mainAt, facts.places.flatMap((one) => one.mainCommits))
      const places = facts.places.map((one) => ({ ...one, mainCommits: one.mainCommits.map((commit) => ({ commit, entry: landedBy.get(commit) ?? null })) }))
      const fixed = facts.fixed === undefined ? undefined : [...new Set(facts.fixed)].sort()
      const checked = { at: nowStamp(), ref, places, ...(facts.morePlaces === undefined ? {} : { morePlaces: facts.morePlaces }), ...(fixed === undefined ? {} : { fixed }) }
      const pinned = readMergeEntry(moveEntry({ id, to: 'pinned', actor, also: { resolution: { checked } } }))
      const outcome = judgeOrBounce(pinned, actor)
      if (fixed !== undefined) {
        return {
          entry: outcome.entry,
          decided:
            `The merge tool's check passed the fix of the red tests, commit ${resolution.commit.slice(0, 12)}, which changes ${String(fixed.length)} ${fixed.length === 1 ? 'file' : 'files'} on top of the replay (${fixed.join(', ')}), and ${ref} holds it. ` +
            `The entry is pinned again, to be judged as the pin step judges. ${outcome.says}`,
        }
      }
      const count = places.length + (facts.morePlaces ?? 0)
      return {
        entry: outcome.entry,
        decided:
          `The merge tool's check passed the resolution, commit ${resolution.commit.slice(0, 12)}, which resolves ${String(count)} ${count === 1 ? 'place' : 'places'}, and ${ref} holds it. ` +
          `The entry is pinned again, to be judged as the pin step judges. ${outcome.says}`,
      }
    }

    case 'landing': {
      const facts = parseTheFacts('landing', input.facts)
      requireAuthorizedTests()
      if (held.tested?.mergeClass?.class === 2 && !held.tested.mergeClass.roundOpen.open) {
        const wait = held.waitsForAFixRound!, reservation = held.tested.mergeClass.roundOpen.reserved
        const ask = wait.asks.find(one => one.holder === reservation.holder)!
        requireTheRepairReservation({ holder: reservation.holder, entry: id, brief: ask?.brief ?? '', dueAt: wait.dueAt, workspaceId })
      }
      if (held.integration !== null && facts.mainAt !== held.integration.mainAt) {
        throw gateMetOnceTheWriteIsTakenBack(
          new PanelError(
            `The tool would land merge entry ${id} on the main world at ${facts.mainAt}, and the entry was integrated on ${held.integration.mainAt}. ` +
              'Landing is a compare-and-swap against the main world the entry was integrated on; report "main-moved" from landing, or integrate again. Nothing was written.',
            422,
          ),
          () => gateMet('landing-only-on-the-tested-main'),
        )
      }
      const holds = whyTheDeletesHoldIt(entry, held) ?? whyThePressHoldsIt(entry, held)
      if (holds !== null) throw new PanelError(`${holds} Nothing was written.`, 409)
      // ONE MOVE OF MAIN AT A TIME: a documentation entry lands in a lane of its own, so the lane
      // no longer keeps two landings of one repository apart; this does, whichever lane each is in.
      const landingNow = theLandingIn(entry.changeset.root, entry.id)
      if (landingNow !== null) {
        throw new PanelError(`Merge entry ${landingNow} lands in ${entry.changeset.root} now, and main moves one landing at a time. Ask again once it has landed. Nothing was written.`, 409)
      }
      // AND NOT WHILE AN EMERGENCY PUSH MOVES MAIN (wave 13u round 82, item 16): main has one writer at a time.
      const pushing = thePushMovingMainIn(entry.changeset.root)
      if (pushing !== null) throw new PanelError(aPushHoldsMain(pushing, entry.changeset.root), 409)
      // THE FILES AREA IS READ AGAIN HERE, the last thing before the tool writes: a link repointed since the entry
      // was integrated bounces it, and the tool, finding it not in landing, writes nothing (acceptance finding 52).
      const outsideNow = whatLandsOutsideItsFilesArea(entry)
      if (outsideNow !== null) {
        const says = `${outsideNow.says} It was read again when the merge tool asked to land.`
        return { entry: bounce(entry, 'guard', { files: outsideNow.files, mainAt: facts.mainAt }, says, actor), decided: says }
      }
      const moved = moveEntry({ id, to: aMoveTo(theMoveAStepMakes(entry.state, { step }, limits), step), actor })
      return { entry: readMergeEntry(moved), decided: `Landing on ${facts.mainAt}. The state is on disk; the tool may move the main world.${whoPressedIt(held)}` }
    }

    // A MAIN THAT MOVED WHILE THE ENTRY WAS TESTED is handled as one that moved as it landed, and counts with it:
    // the tool found it before running red files again or comparing them with main (acceptance finding 54).
    case 'main-moved':
    case 'main-moved-while-testing': {
      const facts = step === 'main-moved' ? parseTheFacts('main-moved', input.facts) : parseTheFacts('main-moved-while-testing', input.facts)
      const under = step === 'main-moved' ? 'under the entry' : 'under the entry while its tests ran, so nothing more was run on the tree it tested'
      const move = theMoveAStepMakes(entry.state, { step, attempts: held.attempts }, limits)
      // THE MERGE TOOL'S COMPARE-AND-SWAP FOUND MAIN MOVED AS A GIT ENTRY LANDED, so it landed nothing. That is counted
      // here, after the write, whichever way the entry goes. A move found while testing is not a landing, and a files
      // entry's report of a moved main is another check.
      const landedNothing = step === 'main-moved' && entry.changeset.adapter === 'git'
      if (move.move === 'bounce') {
        const attempts = theCountOf(move, 'attempts', step)
        const more = `The main world was at ${facts.mainAt} the last time. Submit again once it settles.`
        const bounced = bounce(entry, move.reason, { files: [], mainAt: facts.mainAt, attempts }, more, actor)
        gateMet('landing-attempts', String(limits.landingAttempts))
        if (landedNothing) gateMet('landing-only-on-the-tested-main')
        return { entry: bounced, decided: `The main world moved ${String(attempts)} times; the entry is bounced as churn.` }
      }
      // BACK TO JUDGED, NOT BOUNCED: the verdict still covers the content, and the lane is let go so
      // the entry queues again behind whatever moved the main world. The test run was of a tree that
      // is no longer what will land, so it is taken off the entry.
      const to = aMoveTo(move, step)
      const attempts = theCountOf(move, 'attempts', step)
      const moved = moveEntry({ id, to, actor, also: { attempts, tested: null } })
      if (landedNothing) gateMet('landing-only-on-the-tested-main')
      return { entry: readMergeEntry(moved), decided: `The main world moved to ${facts.mainAt} ${under} (attempt ${String(attempts)} of ${String(limits.landingAttempts)}). It is judged again and queues for its lane.` }
    }

    // MAIN MOVED UNDER THE ENTRY ONLY BY DOCUMENTATION LANDINGS: the tool put it on the new main
    // again. The office takes that only when the named documentation entries' landings join the entry's main to the new
    // one, link by link, and the entry's files are what was tested; then its integration and its tested tip move there,
    // with nothing to test again.
    case 'moved-past-documents': {
      const facts = parseTheFacts('moved-past-documents', input.facts)
      if (held.integration === null || held.tested?.green !== true) {
        throw new PanelError(`Merge entry ${id} holds no green test run on an integrated tree, so there is nothing to carry past documents. Nothing was written.`, 409)
      }
      const notOnlyDocuments = whyTheMoveIsNotOnlyDocuments(entry, held.integration.mainAt, facts.mainAt, facts.documents)
      if (notOnlyDocuments !== null) throw new PanelError(`${notOnlyDocuments} It is an ordinary move of main. Nothing was written.`, 409)
      const differences = whereTheyDiffer(held.integration.files, facts.files)
      if (differences.length > 0) throw new PanelError(`On the new main, the entry's files are not what was tested: ${differences.join('; ')}. Nothing was written.`, 409)
      const integration: Integration = { ...held.integration, mainAt: facts.mainAt, result: facts.result, at: nowStamp() }
      const written = write(id, { integration, tested: { ...held.tested, tip: facts.result } }, actor)
      return {
        entry: readMergeEntry(written),
        decided:
          `Main moved past documentation only, from ${held.integration.mainAt.slice(0, 12)} to ${facts.mainAt.slice(0, 12)} (merge ${facts.documents.length === 1 ? 'entry' : 'entries'} ${facts.documents.join(', ')}). ` +
          `The entry is put on it again as ${facts.result.slice(0, 12)}, with nothing to test again.`,
      }
    }

    case 'landed': {
      const facts = parseTheFacts('landed', input.facts)
      if (held.integration === null || held.tested === null || held.verdict === null) {
        const missing = [
          ...(held.integration === null ? ['its integration'] : []),
          ...(held.tested === null ? ['its test run'] : []),
          ...(held.verdict === null ? ['its verdict'] : []),
        ]
        throw anEntryWithoutWhatItsStateHolds(id, 'landing', missing)
      }
      requireAuthorizedTests(true)
      const expected = held.tested.tip ?? held.integration.result
      if (entry.changeset.adapter === 'git' && facts.mainAfter !== expected) {
        throw gateMetOnceTheWriteIsTakenBack(
          new PanelError(
            `The tool says the main world is at ${facts.mainAfter} after landing merge entry ${id}, and what was tested is ${expected}. Only what was tested may land. Nothing was written.`,
            422,
          ),
          () => gateMet('only-what-was-tested-lands'),
        )
      }
      const landingClock = clockStamp()
      const at = landingClock.stamp
      const receipt: IntegrationReceipt = {
        entry: id,
        mainBefore: held.integration.mainAt,
        mainAfter: facts.mainAfter,
        rebasedTip: entry.changeset.adapter === 'git' ? held.integration.result : null,
        sealId: entry.seal.id,
        carriedVerdict: {
          run: held.verdict.run,
          by: held.verdict.by,
          at: held.verdict.at,
          how: held.verdict.how,
          paths: Object.keys(held.judged ?? {}).length,
          says: whatTheVerdictCovered(entry, held.verdict, held.reinspected),
        },
        reinspected: held.reinspected.map((one) => ({ ...one })),
        tests: {
          log: held.tested.log,
          ...(held.tested.ran === undefined ? {} : { ran: held.tested.ran }),
          ...(held.tested.passed === undefined ? {} : { passed: held.tested.passed }),
          ...(held.tested.plugin === undefined ? {} : { plugin: held.tested.plugin }),
          ...(held.tested.wholeSuiteRed === undefined ? {} : { green: held.tested.green, wholeSuiteRed: held.tested.wholeSuiteRed }),
          ...(held.tested.busCause === undefined ? {} : { busCause: held.tested.busCause }),
          ...(held.tested.houseRules == null ? {} : { green: false, houseRules: held.tested.houseRules }),
          ...(held.tested.mergeClass == null ? {} : { green: false, mergeClass: held.tested.mergeClass }),
          ...(held.tested.build == null ? {} : { build: held.tested.build }),
          ...(held.tested.repair == null ? {} : { repair: held.tested.repair }),
        },
        ...(held.integration.ownerContent === undefined ? {} : { ownerContent: held.integration.ownerContent }),
        ...(held.integration.placeholderCommits === undefined ? {} : { placeholderCommits: held.integration.placeholderCommits }),
        at,
        time: landingClock,
      }
      // A RESOLVE BRIEF A HAND-ON WROTE INSIDE THIS WRITE is a file, so the write's rollback leaves it, and the refusal
      // names it (bHtubWembovw). The brief is not put off until after the landing commits: the asking message names
      // it, and that message is one transaction with the hand-on's move, here as at the other two places a conflict is
      // handed on.
      const briefs: { entry: string; path: string }[] = []
      let merged: PanelRecord
      let houseRulesFiled = ''
      try {
        merged = sqlite.transaction(() => {
          const moved = moveEntry({ id, to: aMoveTo(theMoveAStepMakes(entry.state, { step }, limits), step), actor, also: { integrated: receipt } })
          // THE RECEIPT ON THE RUN TOO: SPEC.md's `data.integrated`, so the run that did the work says
          // where it landed without anybody following a link.
          patchRecord(entry.run, { dataPatch: { [INTEGRATED]: receipt } }, THE_OFFICE)
          const sentBack = bounceWhatCannotJoin(workspaceId, entry.changeset.root, facts.mainAfter, facts.earlyConflicts ?? [], actor, briefs)
          const warnings = [...sentBack.said, ...tellEarlyConflicts(workspaceId, entry.changeset.root, facts.mainAfter, sentBack.rest)]
          if (onlyHouseRulesRedAuthorizesLanding(held.tested, held.integration?.result)) {
            houseRulesFiled = gatePosition('house-rule-reds') === 'off' ? 'House-rule reminders are off; nothing was filed.'
              : fileRedOnMainProblems(readMergeEntry(moved), { mainAt: facts.mainAfter, files: held.tested!.houseRules!.files.map(one => ({ file: one.file, log: held.tested!.log })) }, actor, held.tested!.houseRules).decided
          }
          if (held.tested!.mergeClass?.class === 2 && redMergeAuthorizesLanding(held.tested, held.integration?.result)) {
            const decision = held.tested!.mergeClass!
            const handed = fileHandBackProblem(readMergeEntry(moved), decision, receipt, held.integration!.clone ?? entry.changeset.root, landingClock)
            const house = decision.houseRuleFiles.length === 0 ? '' : gatePosition('house-rule-reds') === 'off' ? 'House-rule reminders are off; nothing was filed.'
              : fileRedOnMainProblems(readMergeEntry(moved), { mainAt: facts.mainAfter, files: decision.houseRuleFiles.map(file => ({ file, log: held.tested!.log })) }, actor, { ...held.tested!.houseRules!, class: 1, files: held.tested!.houseRules!.files.filter(one => decision.houseRuleFiles.includes(one.file)) }).decided
            houseRulesFiled = [handed, house].filter(Boolean).join(' ')
          }
          if (held.tested!.mergeClass?.class === 3 && redMergeAuthorizesLanding(held.tested, held.integration?.result)) {
            houseRulesFiled = fileWideRedProblem(readMergeEntry(moved), held.tested!.mergeClass, receipt, held.integration!.clone ?? entry.changeset.root)
          }
          const repaired = [closeHandBackProblem(readMergeEntry(moved), receipt), closeTakenBackProblem(readMergeEntry(moved), receipt)].filter(Boolean).join(' ')
          houseRulesFiled = [houseRulesFiled, repaired].filter(Boolean).join(' ')
          const told = theSecretaryHearsOneLine(readMergeEntry(moved), workspaceId, facts.pushFailure ?? '')
          // A PUSH THAT FAILED AFTER THE LANDING, to the GitHub copy or to the mirror, is said on the entry too (13u round 74).
          return write(id, { told: { submitter: [], secretary: told.message, says: [told.says, facts.pushFailure, ...warnings, houseRulesFiled].filter(Boolean).join(' ') } }, actor)
        })()
      } catch (error) {
        if (briefs.length === 0) throw error
        throw theBriefsLeftBehind(briefs, `recording the landing of merge entry ${id}`, error, `The landing was not recorded: merge entry ${id} is still landing, no waiting entry moved, and no message was sent.`)
      }
      return { entry: readMergeEntry(merged), decided: `Merged: the main world is at ${facts.mainAfter}. The receipt is on the entry and on run ${entry.run}.${houseRulesFiled === '' ? '' : ` ${houseRulesFiled}`}` }
    }
  }
}

/**
 * WHAT THE RECEIPT SAYS THE MERGE RESTED ON. A release, and any scoped checks after it; or, for a secretary's
 * design/-only entry, which no inspector read.
 */
function whatTheVerdictCovered(entry: MergeEntryReading, verdict: Verdict, reinspected: readonly Reinspected[]): string {
  const checks = reinspected.length === 0 ? '' : `, and ${String(reinspected.length)} scoped ${reinspected.length === 1 ? 'check' : 'checks'} covered what changed on top of the main world`
  if (isATakeBack(entry)) return `The take-back rule covered seal ${entry.seal.id}; the office checked its exact inverse tree before filing run ${entry.run}${checks}.`
  if (isASecretarysDesignEntry(entry)) {
    return `The secretary's rule covered the pinned content: run ${verdict.run} was filed and sealed by the office for a secretary's design/-only entry, and no inspector read it${checks}.`
  }
  // A VERDICT OF THE REVIEW LEVEL rests on no release, and its `how` says what it rested on.
  if (!aReleaseTheQueueMergesOn(verdict.how)) return `No release covered the pinned content of run ${verdict.run}: it rested on ${verdict.how}${checks}.`
  return `The release of run ${verdict.run} covered the pinned content${checks}.`
}

// ============================================================================ a merge tool run ended

/**
 * WHAT FOLLOWS A MERGE TOOL RUN THAT ENDED. Sandbox v1 fix of the queue, INTEGRATION.md section 7 issue 6.
 *
 * A run's start takes the entry's mark (`toolWanted`), and a move into another state where the tool acts
 * writes a new one, so an entry that ends a run still marked is started again by the mark it holds. One
 * that ends a run in a state where the tool acts and holds no mark was left where the run found it — the
 * run crashed, was stopped, never reached the ledger, or lost a race for its lane — and nothing else would
 * ever move it. So the office asks for its tool again, by moving the entry to the state it is in (the state
 * writer then writes a fresh mark, as piece P9 laid down), and counts the run in `stalls`. After
 * the tool-runs-in-one-place limit is reached on one arrival it stops asking:
 *
 *   - an entry before landing bounces as `stalled`, with the last run's own words. The main world has not
 *     moved for it, so sending it back is true.
 *   - a landing entry stays landing, holding its lane, and the secretary is told a person must look. The
 *     tool reports the landing step before it moves anything, so the main world may already hold part of
 *     the entry, and a bounce would say it went back when it may not have.
 *
 *   - a resolving entry, whose run was the check of its resolution, stays resolving with the resolution written
 *     as refused, in the words of the last run, and holds no mark. The end of its time to resolve decides what
 *     follows: it bounces as "could not be read" once that time is over (`theHourIsOver`). The refusal is
 *     written by `writeTheRefusal`, so the same one message tells the asked agent and the secretary at once, as
 *     a refusal by the check does (13u round 80, item 21).
 *
 * A state that waits on somebody else (pinned, reinspecting) and a final state need nothing; so does a resolving
 * entry with no resolution waiting for its check.
 *
 * A JUDGED ENTRY WHOSE LANE ANOTHER ENTRY HOLDS IS NOT A STALL (choice (a), message gHkP4Hd2wNnx; problem
 * jaEGPrS3cVxe). The tool's move from judged is to take the lane, and the office refuses that while another entry
 * holds it, so a run that ends there has nothing it could have done. The office decides this from its own facts at
 * the ending, the entry's state and the lane's holder, never from what the run said. It counts nothing, writes the
 * reason into `stalls.says` with the count as it was, and leaves the entry judged with a mark; `whyTheMergeToolWaits`
 * keeps that mark off the worker's list until the lane is let go.
 */
function whatFollowsARunThatEnded(entry: MergeEntryReading, actor: Actor): { entry: MergeEntryReading; says: string } {
  const limits = { landingAttempts: gateNumber('landing-attempts'), toolRuns: gateNumber('tool-runs-in-one-place') }
  const where = `The entry is ${stateWord(entry.state).text}`
  const record = getRecord(entry.id)
  if (record === null) throw new Error(`Merge entry ${entry.id} is gone while its tool run's ending was being recorded.`)
  // THE MOVE IS THE MOVE TABLE'S (theMoveAStepMakes in src/shared/merge-queue.ts). Asked without the count, it
  // answers for a state where the tool does not act; the count is read only for a state where it does. Whether a
  // resolving entry's resolution waits for its check is read off the record, by the one rule.
  const aResolutionWaits = aResolutionWaitsForItsCheck(entry.state, machineFieldsOf(record).resolution)
  const first = theMoveAStepMakes(entry.state, { step: A_TOOL_RUN_ENDED, aResolutionWaits }, limits)
  if (first.move === 'stays' && first.because === 'final') return { entry, says: `${where}, which is final, so nothing follows.` }
  if (first.move === 'stays' && first.because === 'the-tool-does-not-act-here') return { entry, says: `${where}, and it waits on ${entry.waitsOn}.` }
  const holder = entry.state === 'judged' ? whoOccupies(entry.lane) : null
  if (holder !== null && holder.entry !== entry.id) {
    const runs = machineFieldsOf(record).stalls?.runs ?? 0
    const says =
      `${where}, and the lane ${entry.lane} is held by merge entry ${holder.entry}` +
      `${holder.workspaceId === entry.workspaceId ? '' : ` in the project ${holder.workspaceId}`}, which is ${stateWord(holder.state).text}. ` +
      `So the office did not count this run toward the ${String(limits.toolRuns)} merge tool runs an entry gets in one place ` +
      `(${String(runs)} counted on this arrival). The entry keeps its mark, and the office's list of work for the merge tool leaves it off until the lane is let go.`
    const stalls: Stalls = { runs, says }
    // THE MARK: kept as it is when the run left one (it moved the entry into judged itself), and written by the state
    // writer, by a move to the state it is in, when the run's start took it.
    const kept = entry.toolWanted !== null ? write(entry.id, { stalls }, actor) : moveEntry({ id: entry.id, to: entry.state, actor, also: { stalls } })
    return { entry: readMergeEntry(kept), says }
  }
  if (entry.toolWanted !== null) return { entry, says: `${where}: the run moved it there, and the office asks for its merge tool again for that.` }
  const move = theMoveAStepMakes(entry.state, { step: A_TOOL_RUN_ENDED, aResolutionWaits, runs: machineFieldsOf(record).stalls?.runs ?? 0 }, limits)
  const runs = theCountOf(move, 'runs', A_TOOL_RUN_ENDED)
  const lastSaid = entry.tool?.reason ?? 'nobody recorded how it ended.'
  const inPlace = `${String(runs)} of ${String(limits.toolRuns)} merge tool runs on this arrival ${runs === 1 ? 'has' : 'have'} ended without moving it`
  if (move.move === 'to') {
    const says = `${where} still: ${inPlace}, so the office asks for its merge tool again. The last run said: ${lastSaid}`
    const stalls: Stalls = { runs, says }
    return { entry: readMergeEntry(moveEntry({ id: entry.id, to: move.state, actor, also: { stalls } })), says }
  }
  if (move.move === 'stays' && move.because === 'a-person-must-look') {
    const says =
      `${where} still: ${inPlace}, ${THE_LANDING_TOOL_STOPPED} It stays landing and holds its lane, ` +
      `because the main world may already hold part of it; a person must look. ${howToAskAgain(entry)}The last run said: ${lastSaid}`
    const stalled = sqlite.transaction(() => {
      const written = readMergeEntry(write(entry.id, { stalls: { runs, says } }, actor))
      const told = theSecretaryHearsOneLine(written, entry.workspaceId)
      const stalls: Stalls = { runs, says: `${says} ${told.says}`, secretary: told.message }
      return write(entry.id, { stalls }, actor)
    })()
    gateMet('tool-runs-in-one-place', String(limits.toolRuns))
    return { entry: readMergeEntry(stalled), says }
  }
  // A CHECK OF A RESOLUTION THAT NEVER GAVE A RESULT is the check refusing it, in its own words: the entry stays
  // resolving with no mark, and the end of its time to resolve decides what follows (the secretary's answer 2). The
  // refusal is written by the one refusal writer, so it is told at once, as a refusal by the check is (item 21).
  if (move.move === 'stays' && move.because === 'the-check-gave-no-result') {
    const says =
      `${where} still: ${inPlace}, so the office stopped asking for its merge tool and wrote the resolution as refused. ` +
      `The merge tool's check of a resolution ended ${String(runs)} times without a result. The last run said: ${lastSaid}`
    const held = machineFieldsOf(record)
    if (held.resolution === null) throw anEntryWithoutWhatItsStateHolds(entry.id, 'resolving', ['the resolution its check was of'])
    const refused = writeTheRefusal(entry, held, held.resolution, says, actor, { stalls: { runs, says } })
    gateMet('tool-runs-in-one-place', String(limits.toolRuns))
    return { entry: refused.entry, says }
  }
  const stalledOut = aBounce(move, A_TOOL_RUN_ENDED)
  const more = `The last run said: ${lastSaid}`
  const bounced = bounce(entry, stalledOut.reason, { files: [], runs }, more, actor)
  gateMet('tool-runs-in-one-place', String(limits.toolRuns))
  return { entry: bounced, says: whyItBounced(stalledOut.reason, { files: [], runs }, more) }
}

/**
 * A MERGE TOOL RUN ENDED: the data layer records the ending, and this decides what follows it, once — on
 * the first report of that ending. The tool reports its own end, and the worker reports it again when it
 * finds the process gone; a person's stop press reports it first when there is one. Called by the
 * tool-ended door and by the stop press (lib/worker.ts).
 */
export function theMergeToolRunEnded(input: { workspaceId: string; id: string; session: string; reason: string; actor: Actor; onAlreadyStored?: () => void }): {
  entry: MergeEntryReading
  says: string
} {
  const before = readMergeEntry(theMergeEntry(input.id, input.workspaceId))
  const endedAlready = before.tool !== null && before.tool.session === input.session && typeof before.tool.endedAt === 'string'
  const ended = recordMergeToolEnded(input)
  if (endedAlready) {
    input.onAlreadyStored?.()
    return { entry: ended, says: `The ending of merge tool run ${input.session} was already recorded, so nothing more follows from it.` }
  }
  return whatFollowsARunThatEnded(ended, input.actor)
}
