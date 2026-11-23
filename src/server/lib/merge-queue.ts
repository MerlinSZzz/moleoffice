// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S DATA LAYER: submitting a changeset, withdrawing it, superseding an older one, the
 * one writer of an entry's state, and the reads. Sandbox v1, piece P6 of SPEC.md, widened by the
 * owner's decision R3 of 21 September 2026 (a changeset through a git or a files adapter).
 *
 * WHAT IS HERE AND WHAT IS NOT. Everything an entry stores is written here and nowhere else:
 * `assertMayWrite` in lib/records/may-write.ts refuses every other write to the kind, and the writes below pass
 * because they run inside `asTheMergeQueue`. Which state may follow which, the H_RELEASE comparison,
 * the reinspection of changed files, bounce messages and the secretary's one line are the state
 * machine, built in the second wave (P7) on top of `moveEntry`. Nothing here starts a process: the
 * office's message worker starts the merge tool, and the tool reports through the step door. The one
 * git read here is the secretary's door, which reads a working folder through the seal's own reader.
 *
 * WHAT A SUBMISSION IS CHECKED FOR, AND WHAT IT IS NOT. The shape is checked strictly — hashes,
 * paths, operations that agree with themselves, directories that exist on this machine — and stored
 * exactly as checked. The CONTENT is not: whether a staged file's bytes hash to what the manifest
 * says is for the merge tool when it pins the entry, and `submitted` means exactly that nobody has
 * looked yet. Mole Office stores what it can defend, and at submission that is the claim's shape.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute } from 'node:path'
import { z } from 'zod'
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import { mainSuiteFixReferenceSchema, takesOutSchema, type MainSuiteFix, type MainSuiteFixReference } from '@shared/main-suite-fix.ts'

import {
  ABSENT,
  FILE_MODES,
  FILE_OPERATIONS,
  INTEGRATED,
  MERGE_ENTRY_KIND,
  MERGE_STATES,
  MERGE_STATE_SPECS,
  MERGE_TOOL_RUNTIME,
  ON_CONFLICT,
  aMoveToTheFrontStands,
  inTheLanesOrder,
  laneOf,
  occupiesTheLaneIn,
  aReturnStands,
  pinnedRefOf,
  theMergeToolActsOn,
  thePathsThatNeedAPress,
  theSuiteReads,
  type Changeset,
  type FileOperation,
  type FilesChangeset,
  type GitChangeset,
  type MergeState,
  type MovedFirst,
  type PressToLand,
  type ReturnsFirst,
  type UnreadableEntry,
  type WhatTheSuiteReads,
} from '@shared/merge-queue.ts'
import { aReleasedRunGoesInUnderANewRun } from '@shared/merge-queue.ts'
import { participantWord, type ParticipantRef } from '@shared/participants.ts'
import { entryEndRecipients } from '@shared/entry-end-recipients.ts'
import { theAttributionLinesOf, theMessagesIn, theMessagesOfARange } from '../../config/attribution-lines.mjs'
import { MERGE_WORKERS_BOUNDS, gatePosition } from '../../config/settings.mjs'
import { asTheDoorOf } from './check-field-doors.ts'
import { howARunStands, NEEDS_NO_CHECK, type NeedsNoCheck } from '@shared/releasing.ts'
import type { GitSubmission } from '@shared/sealed-tip.ts'
import type { PanelRecord } from '@shared/types.ts'
import { handBackFacts, repairOfSchema, takeBackOfSchema, takeBackTitle, whenAHandBackIsDue, type TakeBackOf, type HandBackFacts, type RepairOf } from '../../shared/merge-class.ts'
import { clockStamp, momentOfAStoredStamp, nowStamp } from '@shared/time.ts'
import { displayWord } from '@shared/work.ts'
import { kindWord, stateWord } from '@shared/words.ts'
import { db, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { gateMet, gateMetOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { asTheMergeQueue } from './merge-entry-door.ts'
import { theAgentOfARun, theCheckAskedFor, theOfficeNameOf, whatTheCheckWouldRead, writeAMessage, type TheCheckTheOfficeAskedFor } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { participantForActor } from './participant-for-actor.ts'
import { readParticipant } from '../db/read-participant.ts'
import { assertMainSuiteFixController, authoritativeMainSuiteFix, createLink, createRecord, getRecord, listRecordsWithDataAs, mergeData, onlyTheseFieldsOf, patchRecord, recordInWorkspace, type Actor } from './records.ts'
import { toRecord } from './to-record.ts'
import { PanelError } from './panel-error.ts'
import { type Repository } from './repositories.ts'
import { listRepositories } from '../db/list-repositories.ts'
import { repositoryById } from '../db/repository-by-id.ts'
import { repositoryNamed } from '../db/repository-named.ts'
import { listResources, theProcessesAListingReads, type AProcessToRead, type ResourceReport } from './resources.ts'
import { readGit } from './resources.ts'
import { whyGitDidNotAnswer } from '@shared/why-git-did-not-answer.ts'
import { theRoleCards } from './roles.ts'
import { captureGit, readRunSeal, sealingTheArea, whatALaterSealHolds, type TheLaterSide } from './sealed-tip.ts'
import { aLaterSideForTheQueue, theLandingsAreReadBelow } from './merge-queue-same-work.ts'
import { theOfficeFiledThisRunForATakeBack, NO_CHECK_OF_A_SECRETARYS_ENTRY, SECRETARY_DOCUMENTS, THE_SECRETARYS_FOLDER } from './the-offices-secretary-run.ts'

import { takeBackAlreadyExists, whoIsToldOfATakeBack } from './take-back.ts'
import { aPersonAlreadyLooked } from '@shared/take-back-looked.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from './who-may-act.ts'
import { THE_WORKER } from '@shared/the-worker-actor.ts'
import { theReviewLevel } from '../db/the-review-level.ts'
import { REVIEW_LEVEL_WORDS } from '@shared/workspaces.ts'
import { theOrderWritten } from '@shared/the-order-written.ts'
import { theRepositoryNamed } from './the-repository-named.ts'
import { holdsTheSecretaryCard } from './holds-the-secretary-card.ts'

// ============================================================================ what a caller sends

const SHA256 = /^[0-9a-f]{64}$/

/** A path inside the root: no leading slash, no empty, `.` or `..` part, no NUL. */
function isACleanRelativePath(path: string): boolean {
  if (path.startsWith('/') || path.includes('\0')) return false
  return path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

const aHash = z.string().regex(SHA256, { error: 'a hash is 64 lower-case hex characters of sha256.' })
const aHashOrAbsent = z.union([aHash, z.literal(ABSENT)], {
  error: `a hash is 64 lower-case hex characters of sha256, or the word "${ABSENT}".`,
})
const aPathInsideTheRoot = z
  .string()
  .min(1)
  .max(4096)
  .refine(isACleanRelativePath, {
    error: 'a path is relative to the root, with no leading "/", no empty, "." or ".." part, and no NUL.',
  })

const anOperation = z
  .object({
    op: z.enum(FILE_OPERATIONS),
    path: aPathInsideTheRoot,
    from: aPathInsideTheRoot.optional(),
    before: aHashOrAbsent,
    after: aHashOrAbsent,
    mode: z.enum(FILE_MODES).optional(),
    source: z.string().trim().min(1, { error: 'every operation says where its content came from, in `source`.' }).max(2000),
    record: z.string().trim().min(1).optional(),
  })
  .strict()

const aGitChangeset = z
  .object({
    adapter: z.literal('git'),
    /** A repository this project registered, by its id or its name. */
    repository: z.string().trim().min(1),
    branch: z.string().trim().min(1).max(500).optional(),
  })
  .strict()

const aFilesChangeset = z
  .object({
    adapter: z.literal('files'),
    root: z.string().min(1),
    stagedAt: z.string().min(1),
    onConflict: z.enum(ON_CONFLICT).optional(),
    operations: z.array(anOperation).min(1).max(10_000),
  })
  .strict()

/** The body of `POST /api/merge-queue`. The commit and base of a git changeset are never sent: the seal holds them. */
export const A_SUBMISSION = z
  .object({
    run: z.string().trim().min(1),
    changeset: z.discriminatedUnion('adapter', [aGitChangeset, aFilesChangeset]),
    fixRound: mainSuiteFixReferenceSchema.optional(),
    takesOut: takesOutSchema.optional(),
    /** How many workers the merge tool's whole suite runs at for this entry alone. Only the person or the secretary (`maySpeakForTheSecretary`). */
    suiteWorkers: z
      .number()
      .int()
      .min(MERGE_WORKERS_BOUNDS.fewest, { error: `suiteWorkers is a whole number from ${String(MERGE_WORKERS_BOUNDS.fewest)} to ${String(MERGE_WORKERS_BOUNDS.most)}.` })
      .max(MERGE_WORKERS_BOUNDS.most, { error: `suiteWorkers is a whole number from ${String(MERGE_WORKERS_BOUNDS.fewest)} to ${String(MERGE_WORKERS_BOUNDS.most)}.` })
      .optional(),
  })
  .strict()
export type ASubmission = z.infer<typeof A_SUBMISSION>

/**
 * THE SECRETARY'S BODY OF `POST /api/merge-queue`, WITH NO RUN. The secretary names the git
 * changeset, with its branch, and the working folder the office seals from; the office files and seals the run itself.
 */
export const A_SECRETARY_SUBMISSION = z
  .object({
    changeset: aGitChangeset.extend({ branch: z.string().trim().min(1).max(500) }).strict(),
    workingDirectory: z.string().min(1).max(4096),
  })
  .strict()
export type ASecretarySubmission = z.infer<typeof A_SECRETARY_SUBMISSION>

// The purpose on a run the office files for a secretary's design/-only entry, and the one folder such an entry
// may change. Both live in ./the-offices-secretary-run.ts, beside the one reading of that tie.
export { SECRETARY_DOCUMENTS, THE_SECRETARYS_FOLDER }

// ============================================================================ what an entry holds

/** The fields of one stored entry, read strictly. */
interface StoredEntry {
  fixRound?: MainSuiteFixReference
  takeBackOf?: TakeBackOf
  repairOf?: RepairOf
  takesOut?: string[]
  state: MergeState
  run: string
  seal: { id: string; hash: string }
  changeset: Changeset
  submittedBy: ParticipantRef
  occupies: string | null
  withdrawn: { because: string; by: ParticipantRef; at: string } | null
  /** The entry that superseded this one, why it is the same work, and when (problem YL2A9GqoUWHd). */
  superseded: { by: string; because: string; at: string } | null
  tool: { session: string; log: string; startedAt: string; endedAt?: string; reason?: string } | null
  /** The office wants its merge tool run for this entry, since then. See `toolMarkOnArrivingIn`. */
  toolWanted: { since: string } | null
  /** Who moved it to the front of its lane, when, why and its turn; null when nobody did. */
  movedFirst: MovedFirst | null
  /** The check-again run that sent it back to judged, when and its turn (wave 13u, item 53); null when it is not back from one. */
  returnsFirst: ReturnsFirst | null
  /** The suite workers its submitter named for it, and who; null when nobody named any. */
  suiteWorkers: SuiteWorkers | null
}

/** An entry's own count of suite workers and who named it: the person or the secretary, when they submitted it. */
export interface SuiteWorkers {
  count: number
  by: ParticipantRef
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A STORED MERGE ENTRY NOT IN THE SHAPE THIS FILE WRITES, refused by `entryOf` with the entry's id and what is wrong
 * with it. Every read of the entry fails with it, as with any broken assumption. Only the queue's list catches it, and
 * only when its door asks it to (`listMergeQueue`): the list then names the entry beside the ones it can read, so one
 * entry out of shape does not hide the others.
 */
export class AnEntryTheQueueCannotRead extends Error {
  readonly entry: string

  constructor(entry: string, what: string) {
    super(`Merge entry ${entry} does not hold what the merge queue writes: ${what}.`)
    this.entry = entry
  }
}

/**
 * THE FIELDS OF AN ENTRY'S DATA THAT `entryOf` READS, and no others. The list reads these of every entry to check its
 * shape, and reads the rest only of the entries it answers (`theEntriesToCheck`). `entryOf` takes its data typed by this
 * list, so a read of a field that is not here does not type-check.
 */
const THE_FIELDS_THE_CHECK_READS = [
  'state', 'run', 'seal', 'changeset', 'submittedBy', 'occupies', 'documents', 'toolWanted', 'resolution',
  'suiteWorkers', 'withdrawn', 'superseded', 'tool', 'movedFirst', 'returnsFirst', 'fixRound', 'takeBackOf', 'repairOf', 'takesOut',
] as const
type TheFieldsTheCheckReads = { readonly [field in (typeof THE_FIELDS_THE_CHECK_READS)[number]]?: unknown }

/**
 * ONE ENTRY AS STORED, OR A LOUD FAILURE. Only this file writes an entry, so a stored entry that is
 * not in the shape written here is this file being wrong, and a read that smoothed it over would hide
 * exactly that. The one agreement checked beyond the shape is the lane: an entry whose state holds
 * its lane must hold it, and one whose state does not must not.
 *
 * ONE STATE IS READ BOTH WAYS: a reinspecting entry that is not back from a check. Until 30 October 2026 every check
 * again held the lane (wave 13u, item 53), so such an entry stored before then holds its lane, and one stored since does
 * not. Both are read as stored, and the release of either reads `occupies`. One back from a check must hold its lane.
 */
function entryOf(record: { readonly id: string; readonly kind: PanelRecord['kind']; readonly data: TheFieldsTheCheckReads }): StoredEntry {
  if (record.kind !== MERGE_ENTRY_KIND) throw new PanelError(`${record.id} is a ${kindWord(record.kind).text}, not a merge entry.`, 409)
  const data = record.data
  const state = data['state']
  const changeset = data['changeset']
  const seal = data['seal']
  const submittedBy = data['submittedBy']
  const broken = (what: string): never => {
    throw new AnEntryTheQueueCannotRead(record.id, what)
  }
  /** A field the queue writes through its schema, read through it. One out of it is refused as the rest of the shape is. */
  const throughItsSchema = <T>(field: keyof TheFieldsTheCheckReads, schema: z.ZodType<T>): T => {
    const read = schema.safeParse(data[field])
    return read.success ? read.data : broken(`its ${field} is ${JSON.stringify(data[field])}`)
  }
  if (typeof state !== 'string' || !(MERGE_STATES as readonly string[]).includes(state)) broken(`its state is ${JSON.stringify(state)}`)
  if (typeof data['run'] !== 'string') broken('it names no run')
  if (!isObject(seal) || typeof seal['id'] !== 'string' || typeof seal['hash'] !== 'string') broken('it names no seal')
  if (!isObject(changeset) || typeof changeset['root'] !== 'string' || (changeset['adapter'] !== 'git' && changeset['adapter'] !== 'files')) broken('it holds no changeset')
  if (!isObject(submittedBy) || typeof submittedBy['kind'] !== 'string' || typeof submittedBy['id'] !== 'string') broken('it names nobody as its submitter')
  const occupies = typeof data['occupies'] === 'string' ? data['occupies'] : null
  const returnsFirst = aReturnOf(record.id, data['returnsFirst'])
  const holds = occupiesTheLaneIn(state as MergeState, returnsFirst)
  const heldBeforeTheChange = state === 'reinspecting' && returnsFirst === null
  if (holds && occupies !== laneOf(changeset as unknown as Changeset, data['documents'])) broken(`it is ${String(state)} and does not hold its lane`)
  if (heldBeforeTheChange && occupies !== null && occupies !== laneOf(changeset as unknown as Changeset, data['documents'])) broken(`it is ${String(state)} and holds the lane ${occupies}, which is not its own`)
  if (!holds && !heldBeforeTheChange && occupies !== null) broken(`it is ${String(state)} and still holds the lane ${occupies}`)
  const asked = data['toolWanted']
  const toolWanted = isObject(asked) && typeof asked['since'] === 'string' ? { since: asked['since'] } : null
  if (asked !== undefined && asked !== null && toolWanted === null) broken(`its toolWanted is ${JSON.stringify(asked)}`)
  if (!theMergeToolActsOn(state as MergeState, data['resolution']) && toolWanted !== null) broken(`it is ${String(state)}, whose next move is not the merge tool's, and it still asks for the tool`)
  const workers = data['suiteWorkers']
  const suiteWorkers =
    isObject(workers) && Number.isInteger(workers['count']) && isObject(workers['by']) && typeof workers['by']['kind'] === 'string' && typeof workers['by']['id'] === 'string'
      ? { count: workers['count'] as number, by: workers['by'] as unknown as ParticipantRef }
      : null
  if (workers !== undefined && suiteWorkers === null) broken(`its suiteWorkers is ${JSON.stringify(workers)}`)
  return {
    state: state as MergeState,
    run: data['run'] as string,
    seal: { id: (seal as Record<string, string>)['id']!, hash: (seal as Record<string, string>)['hash']! },
    changeset: changeset as unknown as Changeset,
    submittedBy: submittedBy as unknown as ParticipantRef,
    occupies,
    withdrawn: isObject(data['withdrawn']) ? (data['withdrawn'] as StoredEntry['withdrawn']) : null,
    superseded: isObject(data['superseded']) ? (data['superseded'] as StoredEntry['superseded']) : null,
    tool: isObject(data['tool']) ? (data['tool'] as StoredEntry['tool']) : null,
    toolWanted,
    movedFirst: aMoveOf(record.id, data['movedFirst']),
    returnsFirst,
    suiteWorkers,
    ...(data['fixRound'] === undefined ? {} : { fixRound: throughItsSchema('fixRound', mainSuiteFixReferenceSchema) }),
    ...(data['takeBackOf'] === undefined ? {} : { takeBackOf: throughItsSchema('takeBackOf', takeBackOfSchema) }),
    ...(data['repairOf'] === undefined ? {} : { repairOf: throughItsSchema('repairOf', repairOfSchema) }),
    ...(data['takesOut'] === undefined ? {} : { takesOut: throughItsSchema('takesOut', takesOutSchema) }),
  }
}

/** A stored move to the front, read strictly: only `moveToTheFront` in merge-state-machine.ts writes it. */
function aMoveOf(id: string, stored: unknown): MovedFirst | null {
  if (stored === undefined) return null
  const by = isObject(stored) ? stored['by'] : undefined
  if (
    !isObject(stored) || !isObject(by) || typeof by['kind'] !== 'string' || typeof by['id'] !== 'string' ||
    typeof stored['at'] !== 'string' || typeof stored['because'] !== 'string' || !Number.isInteger(stored['turn']) ||
    (stored['underARaise'] !== undefined && typeof stored['underARaise'] !== 'string')
  ) {
    throw new AnEntryTheQueueCannotRead(id, `its movedFirst is ${JSON.stringify(stored)}`)
  }
  const raise = stored['underARaise']
  return {
    by: { kind: by['kind'], id: by['id'] },
    at: stored['at'],
    because: stored['because'],
    turn: stored['turn'] as number,
    ...(typeof raise === 'string' ? { underARaise: raise } : {}),
  }
}

/** A stored return from a check, read strictly: only the release of a check again in merge-state-machine.ts writes it. */
function aReturnOf(id: string, stored: unknown): ReturnsFirst | null {
  if (stored === undefined) return null
  if (!isObject(stored) || typeof stored['run'] !== 'string' || typeof stored['at'] !== 'string' || !Number.isInteger(stored['turn'])) {
    throw new AnEntryTheQueueCannotRead(id, `its returnsFirst is ${JSON.stringify(stored)}`)
  }
  return { run: stored['run'], at: stored['at'], turn: stored['turn'] as number }
}

/** Who moved an entry to the front, as a person reads it: an agent by its handle, its registry id when it has none. */
export function whoMovedIt(by: MovedFirst['by']): string {
  const registered = by.kind === 'agent' || by.kind === 'person' ? readParticipant(by as ParticipantRef) : null
  return `the ${participantWord(by.kind as ParticipantRef['kind'])} ${registered !== null && 'handle' in registered ? registered.handle : by.id}`
}

/** The sentence an entry's move to the front carries, in every state. */
function whatTheMoveSays(id: string, state: MergeState, moved: MovedFirst, returnsFirst: ReturnsFirst | null): string {
  const because = /[.!?]$/u.test(moved.because) ? moved.because : `${moved.because}.`
  const raise = moved.underARaise === undefined ? '' : `, under the raise ${moved.underARaise} the person gave it,`
  const said = `Merge entry ${id} was moved to the front of its lane by ${whoMovedIt(moved.by)}${raise} at ${moved.at}, move ${String(moved.turn)} in the office: ${because}`
  if (aMoveToTheFrontStands({ state, movedFirst: moved, returnsFirst })) return `${said} It is the next to take its lane, after any entry moved before it and any entry the lane's newest bus lets go first.`
  return MERGE_STATE_SPECS[state].final
    ? `${said} It is ${stateWord(state).text}, so the move no longer orders the lane.`
    : `${said} It holds its lane now, so the move no longer orders the lane.`
}

/** The merge entry with this id in this project: 404 for none here, 409 for a record of another kind. */
export function theMergeEntry(id: string, workspaceId: string): PanelRecord {
  const record = recordInWorkspace(id, workspaceId)
  if (record.kind !== MERGE_ENTRY_KIND) {
    throw new PanelError(`Record ${id} is a ${kindWord(record.kind).text}, not a merge entry. Nothing was written.`, 409)
  }
  return record
}

/** Which entry holds a lane now, in any project, read off the index that makes there be at most one. */
export function whoOccupies(lane: string): { entry: string; workspaceId: string; state: string } | null {
  const row = sqlite
    .prepare(
      "SELECT id, workspace_id AS workspaceId, json_extract(data, '$.state') AS state FROM records " +
        "WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.occupies') = ?",
    )
    .get(MERGE_ENTRY_KIND, lane) as { id: string; workspaceId: string; state: string } | undefined
  return row === undefined ? null : { entry: row.id, workspaceId: row.workspaceId, state: row.state }
}

/** The entries a link of type `supersedes` joins to this one, in each direction. */
function theSupersedeLinks(id: string): { supersedes: string[]; supersededBy: string | null } {
  const forward = sqlite.prepare("SELECT to_id AS id FROM links WHERE from_id = ? AND type = 'supersedes' ORDER BY to_id").all(id) as { id: string }[]
  const back = sqlite.prepare("SELECT from_id AS id FROM links WHERE to_id = ? AND type = 'supersedes' ORDER BY from_id").all(id) as { id: string }[]
  return { supersedes: forward.map((one) => one.id), supersededBy: back[0]?.id ?? null }
}

/** The check-again run of a reinspecting entry that nobody is recorded as starting, when it was asked for, and the sentence. */
export interface CheckNotRecordedAsStarted { run: string; askedAt: string; says: string }

/** One entry as every door answers it. */
export interface MergeEntryReading {
  fixRound?: MainSuiteFixReference
  takeBackOf?: TakeBackOf
  repairOf?: RepairOf
  takesOut?: string[]
  id: string
  title: string
  workspaceId: string
  state: MergeState
  /** What the state means, and what the next move waits on. SPEC.md 5.2: "the next step waits on whom". */
  means: string
  waitsOn: string
  run: string
  seal: { id: string; hash: string }
  changeset: Changeset
  /** The directory it lands in, which is its lane. */
  lane: string
  /** The lane it holds right now, or null. */
  occupies: string | null
  /** Where the merge tool pins a git entry's commit in the main repository. Absent for files. */
  pinnedRef?: string
  submittedBy: ParticipantRef
  submittedAt: string
  /**
   * THE MOMENT IT WAS SUBMITTED, as an instant with its offset, read from the clock observation `submittedTime` kept on
   * the entry, since `submittedAt` alone repeats an hour when the clocks go back. An entry submitted before that was kept
   * is read from `submittedAt` as its one moment in the office's zone. Absent when nobody can tell: such an entry
   * submitted in the hour the clocks go back or the hour they skip.
   */
  submittedInstant?: string
  withdrawn: StoredEntry['withdrawn']
  superseded: StoredEntry['superseded']
  tool: StoredEntry['tool']
  /** The office wants its merge tool run for this entry, since then; null when it does not. */
  toolWanted: StoredEntry['toolWanted']
  /**
   * WHO MOVED THE ENTRY TO THE FRONT OF ITS LANE, WHEN AND WHY, and `says`, which also says whether
   * the move still orders the lane (`aMoveToTheFrontStands`). Absent when nobody moved it.
   */
  movedFirst?: MovedFirst & { says: string }
  /**
   * THE CHECK AGAIN THAT SENT THE ENTRY BACK TO JUDGED, WHEN AND ITS TURN (wave 13u, item 53). While it is judged, it is
   * the next to take its lane after the entries moved to the front and the riders of the lane's newest bus
   * (`aReturnStands`). Absent when it is not back from a check.
   */
  returnsFirst?: ReturnsFirst
  /** The suite workers its submitter named for it, and who. Absent when nobody named any. */
  suiteWorkers?: SuiteWorkers
  supersedes: string[]
  supersededBy: string | null
  /**
   * A REINSPECTING ENTRY'S CHECK THAT NOBODY IS RECORDED AS STARTING (problem jaEGPrS3cVxe): the check-again
   * run, when the office asked for it, and the sentence. Absent in every other state, and absent once a check
   * of that run is recorded as started (`noCheckIsRecordedAsStarted`).
   */
  checkNotRecordedAsStarted?: CheckNotRecordedAsStarted
  /**
   * THE PRESS A LIVE GIT ENTRY NEEDS BEFORE IT LANDS, in part 4. The paths its seal
   * changes that land only after a press, and the press once made (`thePressItNeeds`). Absent on an entry touching none,
   * on a files entry, and on a final one.
   */
  pressToLand?: PressToLand
  /**
   * WHAT THE STATE MACHINE WROTE (piece P7, src/server/lib/merge-state-machine.ts), each key present
   * exactly when the entry holds it: `judged` and `handedOn` (the content a verdict read, path by
   * path), `verdict`, `checked`, `integration`, `reinspection`, `reinspected`, `tested`, `attempts`,
   * `deletes`, `pressToLand`, `documents`, `bounced`, `resolving`, `integrated` and `told`. The kind declaration in src/shared/kinds.ts says
   * what each holds. They are handed back as stored, because the state machine is their one reader.
   */
  machine: Record<string, unknown>
  /**
   * WHAT IS UNDER TEST, while the entry is testing, as the owner and _aRNsGwY2e2m say: the files it changes, and
   * how many files main's record says the suite reads. For seeing, not a lock. Absent in every other state.
   */
  underTest?: { since: string; files: string[]; reads: { tree: string; files: number; folders: number } | null }
  /**
   * WHY THE MERGE TOOL WAITS FOR THIS JUDGED ENTRY, and which entry goes first (`whatTheMergeToolWaitsOn`). Set only by
   * the queue's doors, never by `readMergeEntry`, whose readers include the rule itself. Absent when nothing holds it.
   */
  toolWaits?: ToolWaits
}

/** The fields the state machine owns on an entry, in the order the kind declares them. */
const THE_MACHINES_FIELDS = ['judged', 'handedOn', 'verdict', 'checked', 'integration', 'reinspection', 'reinspected', 'tested', 'attempts', 'stalls', 'deletes', 'pressToLand', 'documents', 'bounced', 'resolving', 'resolution', 'integrated', 'told', 'waitingForRoom', 'waitsForAFixRound', 'redOnMain'] as const

/**
 * WHAT THE NEXT MOVE WAITS ON, said with what the entry holds. The state's own sentence, except
 * where the state machine's fields say something more exact: a files entry whose deletes the
 * secretary has not confirmed waits on that press before it can land, and a reinspecting entry
 * names the run its scoped check is on.
 */
/**
 * THE DELETES A FILES ENTRY CARRIES THAT NO SECRETARY HAS CONFIRMED YET, as the state machine wrote them
 * at the pin (`deletes: {paths, asked, confirmed?}`), or 0 for none. Read here for the sentence below and
 * for holding the entry back from the merge tool (`theMergeToolWork`), so the two cannot disagree.
 */
function unconfirmedDeletes(data: Record<string, unknown>): number {
  const deletes = isObject(data['deletes']) ? data['deletes'] : null
  if (deletes === null || !Array.isArray(deletes['paths']) || isObject(deletes['confirmed'])) return 0
  return deletes['paths'].length
}

/**
 * THE PRESS A LIVE GIT ENTRY NEEDS BEFORE IT LANDS, in part 4, or null for an entry whose content differs from
 * main's at no path of LANDS_AFTER_A_PRESS, a files entry, or a final one. The paths are
 * worked out on every read by thePathsThatNeedAPress, from the entry's seal, what its pin found of main's content and
 * what its integration changes, so an entry pinned before the rule needs a press all the same; the press is what
 * `pressTheEntryToLand` wrote. The reading, the merge tool's list and the page read it here.
 *
 * A SEAL THAT IS NOT A SEAL HERE gives no press in this reading, which only says what an entry waits on. The state
 * machine reads the seal strictly when it pins the entry, takes a press, and lands it, and it refuses there.
 */
function thePressItNeeds(entry: StoredEntry, data: Record<string, unknown>): PressToLand | null {
  if (entry.changeset.adapter !== 'git' || MERGE_STATE_SPECS[entry.state].final) return null
  const sealed = getRecord(entry.seal.id)
  const git = sealed?.kind === 'sealed_tip' && isObject(sealed.data['seal']) ? sealed.data['seal']['git'] : null
  const files = isObject(git) && Array.isArray(git['files']) ? (git['files'] as { path: string }[]) : []
  const stored = isObject(data['pressToLand']) ? data['pressToLand'] : null
  const integration = isObject(data['integration']) && isObject(data['integration']['files']) ? data['integration']['files'] : null
  const paths = thePathsThatNeedAPress({
    sealed: files.map((one) => one.path),
    pinned: stored !== null && Array.isArray(stored['paths']) ? { paths: stored['paths'] as string[], leftOut: stored['leftOut'] } : null,
    integrated: integration === null ? null : Object.keys(integration),
  })
  if (paths.length === 0) return null
  const pressed = stored !== null && isObject(stored['pressed']) ? (stored['pressed'] as unknown as NonNullable<PressToLand['pressed']>) : null
  return { paths, pressed }
}

/** The states in which an entry still to be pressed says so in what it waits on: every live state before landing. */
const THE_PRESS_IS_SAID_IN: readonly MergeState[] = ['submitted', 'pinned', 'judged', 'integrating', 'resolving', 'reinspecting', 'testing']

/** Stored entries carry these exact words. A change to them must still read the old words. */
export const THE_LANDING_TOOL_STOPPED = 'so the office stopped asking for its merge tool.'

/** A completed stop stays true when the limit changes. The ask-again write replaces these words. */
export function theOfficeStoppedAskingForTheLandingTool(stalls: unknown): boolean {
  if (!isObject(stalls) || typeof stalls['says'] !== 'string') return false
  // Read the office's sentence, before the quoted tool reason. An ask-again sentence is not a stop.
  const officeSaid = stalls['says'].split('The last run said:', 1)[0]!
  return officeSaid.startsWith(`The entry is ${stateWord('landing').text} still: `) && officeSaid.includes(THE_LANDING_TOOL_STOPPED)
}

function whatItWaitsOn(entry: StoredEntry, data: Record<string, unknown>, id: string, unstarted: CheckNotRecordedAsStarted | null, press: PressToLand | null): string {
  const spec = MERGE_STATE_SPECS[entry.state]
  // A LANDING THE MERGE TOOL COULD NOT FINISH, as often as the office tries one (merge-state-machine.ts,
  // `whatFollowsARunThatEnded`): the office stopped asking for its tool, and only a person can say what the
  // main world holds now.
  const stalls = isObject(data['stalls']) ? data['stalls'] : null
  if (entry.state === 'landing' && entry.toolWanted === null && stalls !== null && typeof stalls['runs'] === 'number' && theOfficeStoppedAskingForTheLandingTool(stalls)) {
    return (
      `a person: its merge tool ended ${String(stalls['runs'])} times in landing without landing it, so the office stopped asking for the tool, ` +
      'and the main world may already hold part of it'
    )
  }
  // A RED ENTRY THAT WAITS FOR THE FIX ROUND THE OFFICE ASKED FOR (13u round 90) waits on that round, not on its tool.
  const fixRound = isObject(data['waitsForAFixRound']) ? data['waitsForAFixRound'] : null
  if (entry.state === 'testing' && fixRound !== null && fixRound['opened'] === undefined && fixRound['reserved'] === undefined && typeof fixRound['until'] === 'string') {
    return `a fix round the office asked for, until ${fixRound['until']} (${String(fixRound['timeZone'])}); if no round is going by then, it bounces as red`
  }
  const unconfirmed = unconfirmedDeletes(data)
  if (unconfirmed > 0 && (entry.state === 'testing' || entry.state === 'pinned' || entry.state === 'judged' || entry.state === 'integrating' || entry.state === 'reinspecting')) {
    return `${spec.waitsOn}; and before it can land, the secretary's confirmation of its ${String(unconfirmed)} ${unconfirmed === 1 ? 'delete' : 'deletes'} through POST /api/merge-queue/${id}/confirm-deletes`
  }
  const reinspection = isObject(data['reinspection']) ? data['reinspection'] : null
  const waitsOn =
    entry.state === 'reinspecting' && reinspection !== null && typeof reinspection['run'] === 'string'
      ? `${spec.waitsOn}, on run ${reinspection['run']}${unstarted === null ? '' : `; ${unstarted.says}`}`
      : entry.state === 'pinned'
        ? (whatAPinnedEntryWaitsOn(entry) ?? spec.waitsOn)
        : spec.waitsOn
  if (press === null || press.pressed !== null || !THE_PRESS_IS_SAID_IN.includes(entry.state)) return waitsOn
  return (
    `${waitsOn}; and before it can land, one press of POST /api/merge-queue/${id}/press-to-land by whoever holds the secretary card or by the person, ` +
    `because it touches ${String(press.paths.length)} ${press.paths.length === 1 ? 'path that lands' : 'paths that land'} only after a press: ${press.paths.join(', ')}`
  )
}

/**
 * WHAT A PINNED ENTRY OF AN UNRELEASED RUN WAITS ON, BY THE PROJECT'S REVIEW LEVEL, read when the entry is read. Null
 * when the state's own words say it: the run is gone, released, closed unchecked or refused and not reworked, or an
 * inspector was asked.
 * At Full it waits for an inspector's release; at Light, for the secretary's confirmation; at None, and at Light once
 * confirmed, only for the office to judge it again, which a verdict or a confirmation of the run makes it do.
 */
function whatAPinnedEntryWaitsOn(entry: StoredEntry): string | null {
  const run = getRecord(entry.run)
  if (run === null || run.deletedAt !== null) return null
  const stands = howARunStands(run.data)
  if (stands.released !== null || stands.closedUnchecked !== null || (stands.refused !== null && (stands.refused.reworked ?? null) === null)) return null
  const level = theReviewLevel(run.workspaceId)
  if (level === 'full') {
    const noInspector = noInspectorWasAskedToCheck(run.id, theCheckAskedFor(run))
    return noInspector === null ? null : `${MERGE_STATE_SPECS.pinned.waitsOn}; ${noInspector}`
  }
  if (level === 'light' && stands.confirmed === null) {
    return `the secretary's confirmation of run ${run.id} through POST /api/checks/${run.id}/confirm, because this project's review level is ${REVIEW_LEVEL_WORDS[level]} and no inspector reads the run`
  }
  return (
    `the office to judge it again, and then the queue's own tests: this project's review level is ${REVIEW_LEVEL_WORDS[level]}, so no inspector reads run ${run.id}, ` +
    'and a pinned entry is judged again when a verdict or a confirmation of its run is written'
  )
}

/**
 * THE INSPECTOR A CHECK OF A RUN WAS ASKED OF, or null when none was: below Full the office tells the secretary instead,
 * and at Full the ask can find nobody holding the inspector card, or a run that cannot be checked.
 */
export function theInspectorItWasAskedOf(asked: TheCheckTheOfficeAskedFor | null): string | null {
  return asked !== null && asked.reviewLevel === undefined && asked.eligibility?.eligible !== false ? (asked.askedOf ?? null) : null
}

/**
 * WHAT STARTS THE CHECK A RUN NEVER HAD, in words, or null when an inspector was asked to check it. A run sealed below
 * Full, or at Full with no inspector to ask, waits at Full for a release that nothing has asked for.
 */
export function noInspectorWasAskedToCheck(run: string, asked: TheCheckTheOfficeAskedFor | null): string | null {
  if (theInspectorItWasAskedOf(asked) !== null) return null
  return `no inspector was asked to check run ${run}, and POST /api/checks/${run}/ask-again asks for that check`
}

/**
 * THE CHECK A REINSPECTING ENTRY WAITS ON, WHEN NOTHING RECORDS THAT ANYBODY STARTED IT (problem jaEGPrS3cVxe:
 * twice on 25 September 2026 the lane waited over an hour on a check-again run that no process picked up).
 * Null when the entry is not reinspecting, or when the office holds any of the three records a started check
 * leaves on the check-again run: the message worker's tool start (`theCheck.execution`), an assembly the check
 * tool posted (`whatTheCheckWouldRead`), or a verdict. A check run by hand records no tool start, and the office
 * learns of it only at its assembly, so the sentence says what is recorded and never that nobody is working.
 */
function noCheckIsRecordedAsStarted(id: string, entry: StoredEntry, data: Record<string, unknown>): CheckNotRecordedAsStarted | null {
  const reinspection = isObject(data['reinspection']) ? data['reinspection'] : null
  if (entry.state !== 'reinspecting' || reinspection === null || typeof reinspection['run'] !== 'string' || typeof reinspection['askedAt'] !== 'string') return null
  const run = getRecord(reinspection['run'])
  if (run === null) throw new Error(`A reinspecting merge entry names check-again run ${reinspection['run']}, and no record ${reinspection['run']} is held.`)
  const stands = howARunStands(run.data)
  if (theCheckAskedFor(run)?.execution !== undefined || whatTheCheckWouldRead(run) !== null || stands.released !== null || stands.refused !== null) return null
  // WHAT WAITS ON THE CHECK: the lane, while the entry holds it, and only the entry once it let the lane go (item 53).
  const waits = entry.occupies === null ? `merge entry ${id} waits` : 'the lane waits'
  return {
    run: run.id,
    askedAt: reinspection['askedAt'],
    says:
      `${waits} on a check nobody is recorded as having started. The office asked for the check of run ${run.id} at ${reinspection['askedAt']}, ` +
      'and since then it has recorded no check tool starting, no check reading the changes, and no verdict',
  }
}

/** What an entry in testing has under test: the files its integration changes, and main's record of reads, if any. */
function whatIsUnderTest(data: Record<string, unknown>): NonNullable<MergeEntryReading['underTest']> {
  const integration = isObject(data['integration']) ? (data['integration'] as Record<string, unknown>) : {}
  const files = isObject(integration['files']) ? Object.keys(integration['files']).sort() : []
  const reads = isObject(integration['reads']) ? (integration['reads'] as Record<string, unknown>) : null
  return {
    since: typeof integration['at'] === 'string' ? integration['at'] : '',
    files,
    reads:
      reads === null || typeof reads['tree'] !== 'string' || typeof reads['files'] !== 'number' || typeof reads['folders'] !== 'number'
        ? null
        : { tree: reads['tree'], files: reads['files'], folders: reads['folders'] },
  }
}

export function readMergeEntry(record: PanelRecord): MergeEntryReading {
  const entry = entryOf(record)
  const spec = MERGE_STATE_SPECS[entry.state]
  const unstarted = noCheckIsRecordedAsStarted(record.id, entry, record.data)
  const press = thePressItNeeds(entry, record.data)
  const submitted = momentOfAStoredStamp(record.createdAt, record.data['submittedTime'])
  const machine: Record<string, unknown> = {}
  for (const key of THE_MACHINES_FIELDS) if (record.data[key] !== undefined) machine[key] = record.data[key]
  return {
    id: record.id,
    title: record.title,
    workspaceId: record.workspaceId,
    state: entry.state,
    means: spec.means,
    waitsOn: whatItWaitsOn(entry, record.data, record.id, unstarted, press),
    run: entry.run,
    seal: entry.seal,
    changeset: entry.changeset,
    ...(entry.fixRound === undefined ? {} : { fixRound: entry.fixRound }),
    ...(entry.takeBackOf === undefined ? {} : { takeBackOf: entry.takeBackOf }),
    ...(entry.repairOf === undefined ? {} : { repairOf: entry.repairOf }),
    ...(entry.takesOut === undefined ? {} : { takesOut: entry.takesOut }),
    lane: laneOf(entry.changeset, record.data['documents']),
    ...(entry.state === 'testing' ? { underTest: whatIsUnderTest(record.data) } : {}),
    occupies: entry.occupies,
    ...(entry.changeset.adapter === 'git' ? { pinnedRef: pinnedRefOf(record.id) } : {}),
    submittedBy: entry.submittedBy,
    submittedAt: record.createdAt,
    ...(submitted === null ? {} : { submittedInstant: clockStamp(() => new Date(submitted)).instant }),
    withdrawn: entry.withdrawn,
    superseded: entry.superseded,
    tool: entry.tool,
    toolWanted: entry.toolWanted,
    ...(entry.movedFirst === null ? {} : { movedFirst: { ...entry.movedFirst, says: whatTheMoveSays(record.id, entry.state, entry.movedFirst, entry.returnsFirst) } }),
    ...(entry.returnsFirst === null ? {} : { returnsFirst: entry.returnsFirst }),
    ...(entry.suiteWorkers === null ? {} : { suiteWorkers: entry.suiteWorkers }),
    ...theSupersedeLinks(record.id),
    ...(unstarted === null ? {} : { checkNotRecordedAsStarted: unstarted }),
    ...(press === null ? {} : { pressToLand: press }),
    machine,
  }
}

export { theOrderWritten }

/**
 * THE ROWS READ, WHEN EACH HAS A PLACE IN THE ORDER WRITTEN (`theOrderWritten`, read as `written`), or a 500 naming
 * those that have none. Such a record was written past the records door, and the queue does not guess its place from
 * the time in words.
 */
export function eachHasAPlace<T extends { readonly id: string; readonly written: number | null }>(rows: T[]): T[] {
  const unplaced = rows.filter((row) => row.written === null).map((row) => row.id)
  if (unplaced.length === 0) return rows
  const which = unplaced.length === 1 ? `Record ${unplaced.join('')} has` : `Records ${unplaced.join(', ')} have`
  throw new PanelError(
    `${which} no create row in the change log, so the order ${unplaced.length === 1 ? 'it was' : 'they were'} written in is not recorded. ` +
      'The merge queue does not order by the time in words instead, because that time repeats when the clocks go back.',
    500,
  )
}

/**
 * THE MERGE ENTRIES A CHECK OF THIS RUN IS FOR: every entry submitted on the run, and every entry whose check again
 * is the run (`reinspection.run`), oldest first. The merge queue moves these when a verdict on the run is written
 * (`theMergeQueueHearsAVerdict`), and the door that decides who may file a session serving the inspector reads their
 * submitters (`whyThisCallerMayNotFileASessionFor` in lib/records/may-write.ts). One query, so the two cannot come to disagree
 * about which entries a check is for.
 */
export function theMergeEntriesACheckOfThisRunIsFor(runId: string, workspaceId: string): PanelRecord[] {
  const rows = sqlite
    .prepare(
      `SELECT id, ${theOrderWritten('records')} AS written FROM records WHERE kind = ? AND workspace_id = ? AND deleted_at IS NULL AND ` +
        "(json_extract(data, '$.run') = ? OR json_extract(data, '$.reinspection.run') = ?) ORDER BY written, rowid",
    )
    .all(MERGE_ENTRY_KIND, workspaceId, runId, runId) as { id: string; written: number | null }[]
  return eachHasAPlace(rows).map((row) => getRecord(row.id)).filter((record): record is PanelRecord => record !== null)
}

/**
 * THE ID OF THE NEWEST MERGE ENTRY SUBMITTED ON EACH OF THESE RUNS, by run, and null for a run none was submitted on.
 * Every run asked is a key. One query for all of them: it reads every merge entry of the project with json_extract,
 * because no index serves `$.run`, so a caller with several runs asks once. Measured on a narrow copy of the office
 * with 1,152 merge entries (11.2 MB) in the project, one such query took a median of 6.3 ms.
 */
export function theNewestEntryIdsOfRuns(runIds: readonly string[], workspaceId: string): Map<string, string | null> {
  const newest = new Map<string, string | null>(runIds.map((run) => [run, null]))
  if (newest.size === 0) return newest
  const rows = sqlite
    .prepare(
      `SELECT id, json_extract(data, '$.run') AS run, ${theOrderWritten('records')} AS written FROM records WHERE kind = ? AND workspace_id = ? ` +
        "AND deleted_at IS NULL AND json_extract(data, '$.run') IN (SELECT value FROM json_each(?)) ORDER BY written DESC, rowid DESC",
    )
    .all(MERGE_ENTRY_KIND, workspaceId, JSON.stringify([...newest.keys()])) as { id: string; run: string; written: number | null }[]
  for (const row of eachHasAPlace(rows)) if (newest.get(row.run) === null) newest.set(row.run, row.id)
  return newest
}

/**
 * THE NEWEST MERGE ENTRY SUBMITTED ON A RUN, or null when none was. The hold for a run's report and the lane of a run's
 * check (lib/checks-an-hour.ts) both read this one entry. The worker's queue reads it for all its check rows at once
 * with theNewestEntryIdsOfRuns and hands it to both.
 */
export function theNewestEntryOfARun(runId: string, workspaceId: string): PanelRecord | null {
  const id = theNewestEntryIdsOfRuns([runId], workspaceId).get(runId) ?? null
  return id === null ? null : getRecord(id)
}

/**
 * WHY A CHECK OF THIS RUN IS HELD FOR ITS REPORT, or null, in part 1. The newest entry submitted
 * on the run bounced `incomplete`: the queue read the run's report before any check started and found something missing. A
 * check started now would spend tokens on that report, so the message worker holds it until the run is submitted again,
 * and the queue then reads the report again at the pin. The worker's queue hands in the entry it read for all its check
 * rows; any other caller has it read here.
 */
export function whyACheckOfThisRunWaitsForItsReport(
  runId: string,
  workspaceId: string,
  entry: PanelRecord | null = theNewestEntryOfARun(runId, workspaceId),
): string | null {
  const bounced = entry?.data['bounced']
  if (entry === null || entry.data['state'] !== 'bounced' || !isObject(bounced) || bounced['reason'] !== 'incomplete') return null
  return (
    `The check is held and not started: merge entry ${entry.id} bounced at ${String(bounced['at'])} because run ${runId}'s report lacks what a ` +
    'check needs. It stays held until the run is submitted again with POST /api/merge-queue.'
  )
}

/**
 * WHETHER A RUN WAS MERGED, and by which entry. The one reader of this fact.
 *
 * A run was merged when its own `integrated` receipt names a merge entry and that entry stands
 * `merged`. The receipt is written on the run only in the landed step of the merge state machine,
 * and the entry is read again here, so a receipt whose entry is gone or not merged does not count.
 *
 * `merged: false` carries one sentence naming what was not found.
 */
export function theMergeOfARun(run: PanelRecord): { merged: true; entry: string } | { merged: false; says: string } {
  const receipt = run.data[INTEGRATED]
  if (!isObject(receipt)) return { merged: false, says: `Run ${run.id} holds no merge receipt, so nothing records it as merged.` }
  const named = receipt['entry']
  if (typeof named !== 'string' || named === '') {
    return { merged: false, says: `Run ${run.id} holds a merge receipt that names no merge entry.` }
  }
  const entry = getRecord(named)
  if (entry === null || entry.deletedAt || entry.kind !== MERGE_ENTRY_KIND) {
    return { merged: false, says: `Run ${run.id}'s merge receipt names ${named}, and no merge entry ${named} is held.` }
  }
  const state = entryOf(entry).state
  if (state !== 'merged') {
    return { merged: false, says: `Run ${run.id}'s merge receipt names merge entry ${named}, which is ${stateWord(state).text}, not ${stateWord('merged').text}.` }
  }
  return { merged: true, entry: named }
}

/**
 * Every live merge entry of one project, oldest first: in the order they were written (`theOrderWritten`), which is the
 * order they were submitted in. Not by `id`, which is random, and not by the time in words, which repeats when the
 * clocks go back.
 */
function theEntriesOf(workspaceId: string): PanelRecord[] {
  const rows = sqlite
    .prepare(`SELECT id, ${theOrderWritten('records')} AS written FROM records WHERE workspace_id = ? AND kind = ? AND deleted_at IS NULL ORDER BY written, rowid`)
    .all(workspaceId, MERGE_ENTRY_KIND) as { id: string; written: number | null }[]
  return eachHasAPlace(rows).map((row) => getRecord(row.id)).filter((record): record is PanelRecord => record !== null)
}

/** A merge entry as the list first reads it: its id, kind and title, and its data cut to the fields the check reads. */
interface AnEntryToCheck {
  id: string
  kind: PanelRecord['kind']
  title: string
  data: TheFieldsTheCheckReads
}

/**
 * EVERY LIVE MERGE ENTRY OF ONE PROJECT, IN `theEntriesOf`'S ORDER, with only the fields its shape check reads, in one
 * statement (wave 13u round 124). The list checks every entry from these and reads whole only the ones it answers
 * (`theseEntriesWhole`). Until then it read each entry whole, one statement each, before it kept the lane and states
 * asked: about 1,346 statements for each ask on an office of the live shape.
 */
function theEntriesToCheck(workspaceId: string): AnEntryToCheck[] {
  const rows = db
    .select({
      id: records.id,
      kind: records.kind,
      title: records.title,
      data: onlyTheseFieldsOf(THE_FIELDS_THE_CHECK_READS),
      written: sql<number | null>`${sql.raw(theOrderWritten('records'))}`.as('written'),
    })
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, MERGE_ENTRY_KIND), isNull(records.deletedAt)))
    .orderBy(sql`written`, sql`rowid`)
    .all()
  return eachHasAPlace(rows).map((row) => ({ id: row.id, kind: row.kind as PanelRecord['kind'], title: row.title, data: JSON.parse(row.data) as TheFieldsTheCheckReads }))
}

/**
 * THESE RECORDS WHOLE, as `getRecord` reads each, in one statement whatever their number: their ids go in as one JSON
 * list. An id no record has is absent from the map. No order is asked for, because sorting whole rows took longer than
 * reading them; the caller has its own order.
 */
function theseEntriesWhole(ids: readonly string[]): Map<string, PanelRecord> {
  if (ids.length === 0) return new Map()
  const rows = db.select().from(records).where(sql`${records.id} IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`).all()
  return new Map(rows.map((row) => [row.id, toRecord(row)]))
}

/** One lane of the queue as `GET /api/merge-queue` answers it, with each entry whole or narrow (`?shape=`). */
export interface LaneReading<E = MergeEntryReading> {
  lane: string
  /** The entry holding the lane now, in whichever project it is, or null for a free lane. */
  occupiedBy: { entry: string; workspaceId: string; state: string } | null
  entries: E[]
}

/**
 * ONE ENTRY AS THE NARROW LIST ANSWERS IT (`?shape=narrow`, wave 13u round 123): only the fields the merge tool and the
 * timing job read, as stored, and nothing worked out. The machine holds `judged` while the entry is not final, the
 * `resolution`, the integration's `result` and `clone` while the entry is not final, the test run's `testedWith`, `build`
 * and `log`, and the landing's `mainBefore` and `mainAfter`. The merge tool reads a waiting entry's integration result for
 * the migration numbers it was given there (wave 13u round 130).
 */
export interface NarrowEntryReading {
  id: string
  state: MergeState
  lane: string
  run: string
  changeset: Changeset
  repairOf?: RepairOf
  suiteWorkers?: SuiteWorkers
  /** The move to the front as stored, without the sentence the whole entry carries. */
  movedFirst?: MovedFirst
  machine: { judged?: unknown; resolution?: unknown; integration?: { result: unknown; clone: unknown }; tested?: Record<string, unknown>; integrated?: { mainBefore: unknown; mainAfter: unknown } }
}

function theNarrowEntry(record: PanelRecord, entry: StoredEntry, lane: string): NarrowEntryReading {
  const data = record.data
  const machine: NarrowEntryReading['machine'] = {}
  // WHAT A FINAL ENTRY WAS JUDGED ON IS READ BY NOBODY: the bus reads it of a judged entry, and the rest only of one in the lane.
  if (!MERGE_STATE_SPECS[entry.state].final && data['judged'] !== undefined) machine.judged = data['judged']
  if (data['resolution'] !== undefined) machine.resolution = data['resolution']
  const integration = data['integration']
  if (!MERGE_STATE_SPECS[entry.state].final && isObject(integration)) machine.integration = { result: integration['result'], clone: integration['clone'] }
  const tested = data['tested']
  if (isObject(tested)) machine.tested = Object.fromEntries(['testedWith', 'build', 'log'].filter((key) => tested[key] !== undefined).map((key) => [key, tested[key]]))
  const integrated = data['integrated']
  if (isObject(integrated)) machine.integrated = { mainBefore: integrated['mainBefore'], mainAfter: integrated['mainAfter'] }
  return {
    id: record.id,
    state: entry.state,
    lane,
    run: entry.run,
    changeset: entry.changeset,
    ...(entry.repairOf === undefined ? {} : { repairOf: entry.repairOf }),
    ...(entry.suiteWorkers === null ? {} : { suiteWorkers: entry.suiteWorkers }),
    ...(entry.movedFirst === null ? {} : { movedFirst: entry.movedFirst }),
    machine,
  }
}

/** ONE ENTRY AS THE LIST ASKED WITH `?shape=ids` ANSWERS IT (wave 13u round 132): its id, its state and its lane. */
export interface EntryIdReading {
  id: string
  state: MergeState
  lane: string
}

/** What a list of the queue is asked for: a project, and a lane, a repository or states to narrow it to. */
interface TheListAsked {
  workspaceId: string
  lane?: string
  repository?: string
  states?: readonly MergeState[]
  namingWhatItCannotRead?: true
}

/**
 * THE QUEUE, LANE BY LANE. Narrowed by a lane, by a repository (whose checkout is the lane), or by
 * states. The entries are this project's; who holds each lane is read across every project, because a
 * lane is a directory and two projects may both land changes in it.
 *
 * AN ENTRY THE QUEUE CANNOT READ fails the list, unless `namingWhatItCannotRead` is given. Its door gives it (wave 13u
 * round 99): the list then answers the entries it can read, and names in `unreadable` each one it cannot, whatever
 * lane or states were asked for, because that entry's lane and state cannot be told. The readers inside the office act
 * on the whole queue, so they do not give it, and fail.
 */
export function listMergeQueue(input: TheListAsked): { lanes: LaneReading[]; unreadable: UnreadableEntry[]; says: string } {
  return theQueueAsListed(input, (record) => withWhatTheToolWaitsOn(readMergeEntry(record)))
}

/** THE QUEUE, LANE BY LANE, AS THE NARROW LIST ANSWERS IT: each entry in `theNarrowEntry`, and the same `says`. */
export function listMergeQueueNarrowly(input: TheListAsked): { lanes: LaneReading<NarrowEntryReading>[]; unreadable: UnreadableEntry[]; says: string } {
  return theQueueAsListed(input, theNarrowEntry)
}

/** THE QUEUE, LANE BY LANE, WITH EACH ENTRY'S ID, STATE AND LANE ONLY, and the same `says`. */
export function listMergeQueueByIds(input: TheListAsked): { lanes: LaneReading<EntryIdReading>[]; unreadable: UnreadableEntry[]; says: string } {
  return theQueueAsListed(input, (record, entry, lane) => ({ id: record.id, state: entry.state, lane }))
}

/**
 * THE LIST, WITH EACH ENTRY READ BY `read`, and only the entries asked for read (wave 13u round 123). Every entry's shape
 * is checked first, so one the queue cannot read is named whatever lane or states were asked for. An entry whose shape is
 * right and that is outside the lane or states asked is not read further. Since round 124 the check reads only the
 * fields it checks, and only the entries kept are read whole: two statements, whatever the number of entries.
 *
 * THE LANE'S ORDER AND THE SENTENCE ARE WORKED OUT FROM EACH ENTRY AS STORED, not from what `read` answers of it (wave
 * 13u round 132), so a shape that leaves out the move to the front answers the same order and the same `says`.
 */
function theQueueAsListed<E>(
  input: TheListAsked,
  read: (record: PanelRecord, entry: StoredEntry, lane: string) => E,
): { lanes: LaneReading<E>[]; unreadable: UnreadableEntry[]; says: string } {
  let lane = input.lane
  if (input.repository !== undefined) {
    const repository = theRepositoryNamed(input.repository, input.workspaceId)
    const root = theCheckoutOf(repository)
    if (lane !== undefined && lane !== root) {
      throw new PanelError(`The repository ${repository.name} lands in ${root}, which is not the lane ${lane} this request also named.`)
    }
    lane = root
  }
  const unreadable: UnreadableEntry[] = []
  // BOTH STATEMENTS IN ONE READ OF THE DATABASE, so the entries read whole are the ones the first statement checked
  // and kept, even when another connection writes between the two.
  const { asked, whole } = sqlite.transaction(() => {
    const kept = theEntriesToCheck(input.workspaceId)
      .flatMap((row) => {
        try {
          const entry = entryOf(row)
          return [{ id: row.id, entry, lane: laneOf(entry.changeset, row.data['documents']) }]
        } catch (error) {
          // ONLY THE QUEUE'S REFUSAL OF THIS ENTRY'S OWN SHAPE is named here. Any other failure fails the list.
          if (input.namingWhatItCannotRead !== true || !(error instanceof AnEntryTheQueueCannotRead) || error.entry !== row.id) throw error
          unreadable.push({ id: row.id, title: row.title, why: error.message })
          return []
        }
      })
      .filter((one) => lane === undefined || one.lane === lane)
      .filter((one) => input.states === undefined || input.states.includes(one.entry.state))
    return { asked: kept, whole: theseEntriesWhole(kept.map((one) => one.id)) }
  })()
  // EACH ENTRY ANSWERED IS READ FROM ITS WHOLE RECORD, as it was before the first statement read only the checked fields.
  const entries = asked.map((one) => {
    const record = whole.get(one.id)
    if (record === undefined) throw new Error(`Merge entry ${one.id} was checked and then not found when it was read whole, in the same read of the database.`)
    const entry = entryOf(record)
    return { id: one.id, lane: one.lane, state: entry.state, movedFirst: entry.movedFirst, returnsFirst: entry.returnsFirst, reading: read(record, entry, one.lane) }
  })
  const byLane = new Map<string, typeof entries>()
  for (const one of entries) byLane.set(one.lane, [...(byLane.get(one.lane) ?? []), one])
  if (lane !== undefined && !byLane.has(lane)) byLane.set(lane, [])
  const ordered = [...byLane.keys()].sort().map((key) => ({ lane: key, occupiedBy: whoOccupies(key), entries: inTheLanesOrder(byLane.get(key)!) }))
  const lanes = ordered.map((one) => ({ ...one, entries: one.entries.map((entry) => entry.reading) }))
  const held = lanes.filter((one) => one.occupiedBy !== null).length
  const moved = ordered.flatMap((one) => one.entries).filter(aMoveToTheFrontStands)
  const unread = unreadable.map((one) => one.id).join(', ')
  const says =
    (entries.length === 0
      ? input.states !== undefined
        ? noMergeEntriesInStates(input.states, lane, unreadable.length > 0)
        : lane === undefined
        ? unreadable.length === 0
          ? 'Nothing has been submitted to the merge queue in this project.'
          : 'Nothing the queue can read has been submitted to the merge queue in this project.'
        : `Nothing ${unreadable.length === 0 ? 'submitted' : 'the queue can read'} in this project lands in ${lane}${input.states === undefined ? '' : ` in the states asked for`}.`
      : `${String(entries.length)} ${entries.length === 1 ? 'entry' : 'entries'} in ${String(lanes.length)} ` +
        `${lanes.length === 1 ? 'lane' : 'lanes'}; ${String(held)} ${held === 1 ? 'lane is' : 'lanes are'} held right now.` +
        (moved.length === 0
          ? ''
          : ` Moved to the front of ${moved.length === 1 ? 'its lane' : 'their lanes'}: ${moved.map((one) => `merge entry ${one.id}, by ${whoMovedIt(one.movedFirst!.by)}`).join('; ')}.`)) +
    (unreadable.length === 0
      ? ''
      : ` The queue cannot read ${unreadable.length === 1 ? `merge entry ${unread}` : `merge entries ${unread}`}, so the lanes leave ` +
        `${unreadable.length === 1 ? 'it' : 'them'} out, whatever lane or states were asked for; the reply's unreadable says why.`)
  return { lanes, unreadable, says }
}

export function noMergeEntriesInStates(states: readonly string[], lane?: string, unreadable = false): string {
  return `No merge entry${unreadable ? ' the queue can read' : ''} in this project${lane === undefined ? '' : ` in ${lane}`} is in the states asked for (${states.join(', ')}).`
}

// ============================================================================ the one state writer

/**
 * THE MARK AN ENTRY HOLDS ON ARRIVING IN A STATE: `{since}` where the merge tool makes the next move,
 * and none where somebody else does. Piece P9: the office asks for its merge tool by this mark, and the
 * message worker starts the tool for a marked entry that no tool run holds (`theMergeToolWork`). In
 * resolving the tool makes the next move only while a resolution waits for its check, so the entry's
 * resolution is read beside the state (`theMergeToolActsOn`, src/shared/merge-queue.ts).
 *
 * ONE MARK PER ARRIVAL, TAKEN BY ONE START. A tool run starting takes the mark off
 * (`recordMergeToolStarted`), so a tool run that ends with the entry still where it was is not started
 * again by itself: whether it is tried again is the state machine's to decide, and it decides it when
 * the run's ending is recorded (merge-state-machine.ts, `theMergeToolRunEnded`), by moving the entry to
 * the state it is in, which writes a fresh mark — up to the tool-runs-in-one-place limit on one arrival.
 * A tool run that moves the entry on from one state where the tool acts to another leaves the new mark
 * standing; if it ends there without finishing, that mark is what starts the next run, which is how a
 * landing cut off by the restart it caused is picked up again (SPEC.md 5.4, landing).
 */
function toolMarkOnArrivingIn(state: MergeState, resolution: unknown): { since: string } | null {
  return theMergeToolActsOn(state, resolution) ? { since: nowStamp() } : null
}

/** A write the database refused because a unique index would have held two rows. */
function isAUniqueViolation(error: unknown): boolean {
  return isObject(error) && error['code'] === 'SQLITE_CONSTRAINT_UNIQUE'
}

/**
 * MOVE AN ENTRY TO A STATE, AND TAKE OR LEAVE ITS LANE WITH IT. The one writer of `state` and of
 * `occupies`, which is what keeps the two in agreement: `occupies` is worked out here from the state
 * the entry is moving to, and from whether it is back from a check (`occupiesTheLaneIn`), and from nothing else.
 *
 * IT DOES NOT DECIDE WHETHER THE MOVE IS ALLOWED. Which state may follow which is the state machine
 * (P7), which calls this after deciding. Two things are refused here because they are true of every
 * move: a final entry never moves again, and a lane already held by another entry cannot be taken —
 * the database refuses that write, and this turns the refusal into a sentence naming the holder.
 */
export function moveEntry(input: { id: string; to: MergeState; actor: Actor; also?: Record<string, unknown>; onNothingWritten?: () => void }): PanelRecord {
  const record = getRecord(input.id)
  if (record === null) throw new PanelError(`No merge entry ${input.id}.`, 404)
  const entry = entryOf(record)
  if (MERGE_STATE_SPECS[entry.state].final) {
    throw new PanelError(
      `Merge entry ${input.id} is ${stateWord(entry.state).text}, which is final, so it cannot become ${stateWord(input.to).text}. Nothing was written.`,
      409,
    )
  }
  const dataPatch: Record<string, unknown> = { ...(input.also ?? {}), state: input.to }
  // AN ENTRY BACK FROM A CHECK IS BACK UNTIL ITS RELEASE INTO TESTING (wave 13u, item 53): its next check holds the lane,
  // and once it is under test nothing orders it any more.
  if (input.to === 'testing' && entry.returnsFirst !== null) dataPatch['returnsFirst'] = null
  const returnsFirst = aReturnOf(input.id, mergeData(record.data, dataPatch).data['returnsFirst'])
  const lane = occupiesTheLaneIn(input.to, returnsFirst) ? laneOf(entry.changeset, record.data['documents']) : null
  if (lane !== null) dataPatch['occupies'] = lane
  else if (entry.occupies !== null) dataPatch['occupies'] = null
  // AND THE MARK THAT ASKS FOR THE MERGE TOOL, derived from the state here and nowhere else, as the lane is, and from the
  // resolution the entry will hold once this write is merged into it (a resolving entry's resolution waiting for its check).
  const wanted = toolMarkOnArrivingIn(input.to, mergeData(record.data, dataPatch).data['resolution'])
  if (wanted !== null) dataPatch['toolWanted'] = wanted
  else if (entry.toolWanted !== null) dataPatch['toolWanted'] = null
  // AND THE COUNT OF TOOL RUNS THAT ENDED IN PLACE IS FOR ONE ARRIVAL: an entry arriving in another state
  // starts with none. A move to the state it is already in is the office asking for its tool again, which
  // is exactly when the count must be kept (merge-state-machine.ts, `whatFollowsARunThatEnded`).
  if (input.to !== entry.state && record.data['stalls'] !== undefined && record.data['stalls'] !== null) dataPatch['stalls'] = null
  // A WAIT FOR ROOM IS FOR ONE ARRIVAL too: an entry arriving in another state no longer waits on the launcher.
  if (input.to !== entry.state && record.data['waitingForRoom'] !== undefined && record.data['waitingForRoom'] !== null) dataPatch['waitingForRoom'] = null
  // A repair reservation survives landing for launch and hand-back linkage; other arrivals end the wait.
  if (input.to !== entry.state && record.data['waitsForAFixRound'] !== undefined && record.data['waitsForAFixRound'] !== null &&
    !(['landing', 'merged'].includes(input.to) && isObject(record.data['waitsForAFixRound']) && record.data['waitsForAFixRound']['reserved'] !== undefined)) dataPatch['waitsForAFixRound'] = null
  try {
    const result = asTheMergeQueue(() => patchRecord(input.id, { dataPatch }, input.actor))
    if (result.nothingWritten) input.onNothingWritten?.()
    return result.record
  } catch (error) {
    if (lane !== null && isAUniqueViolation(error)) {
      const holder = whoOccupies(lane)
      if (holder !== null && holder.entry !== input.id) {
        throw new PanelError(
          `The lane ${lane} is held by merge entry ${holder.entry}${holder.workspaceId === record.workspaceId ? '' : ` in the project ${holder.workspaceId}`}, ` +
            `which is ${stateWord(holder.state).text}. One entry lands in a directory at a time, so ${input.id} stays ${stateWord(entry.state).text}. Nothing was written.`,
          409,
        )
      }
    }
    throw error
  }
}

// ============================================================================ submitting

export { theRepositoryNamed } from './the-repository-named.ts'

/** Where a repository's checkout is on this machine, resolved, or a refusal saying why there is none. */
function theCheckoutOf(repository: Repository): string {
  if (repository.root === null) {
    throw new PanelError(`The repository ${repository.name} has no checkout on this machine, so there is nowhere to merge into. Nothing was written.`, 409)
  }
  return theDirectory(repository.root, `the checkout of the repository ${repository.name}`, 409)
}

/** An absolute path that is a directory on this machine, resolved through any links, or a refusal naming it. */
export function theDirectory(path: string, what: string, status: number): string {
  if (!isAbsolute(path)) throw new PanelError(`${what} must be an absolute path, and "${path}" is not. Nothing was written.`, status)
  let resolved: string
  try {
    resolved = realpathSync(path)
  } catch {
    throw new PanelError(`${what}, ${path}, is not there on this machine. Nothing was written.`, status)
  }
  if (!statSync(resolved).isDirectory()) throw new PanelError(`${what}, ${path}, is not a directory. Nothing was written.`, status)
  return resolved
}

/**
 * THE OPERATIONS OF A FILES CHANGESET, EACH AGREEING WITH ITSELF AND NONE TOUCHING A PATH TWICE.
 * The hash words say what the operation is: an add has nothing before it, a delete nothing after it,
 * a modify changes the content, and a rename moves a file (and may change it) from `from` to `path`.
 */
function checkTheOperations(operations: readonly FileOperation[], workspaceId: string): void {
  const touched = new Map<string, number>()
  operations.forEach((one, index) => {
    const which = `Operation ${String(index + 1)} (${displayWord(one.op)} ${one.path})`
    const refuse = (why: string): never => {
      throw new PanelError(`${which} ${why} Nothing was written.`, 400)
    }
    if (one.op === 'rename') {
      if (one.from === undefined) refuse('is a rename and names no `from`.')
      if (one.from === one.path) refuse('renames a file to its own path.')
    } else if (one.from !== undefined) refuse('names a `from`, which only a rename has.')
    if (one.op === 'add' && (one.before !== ABSENT || one.after === ABSENT)) refuse(`is an add, so its before is "${ABSENT}" and its after is a hash.`)
    if (one.op === 'delete' && (one.before === ABSENT || one.after !== ABSENT)) refuse(`is a delete, so its before is a hash and its after is "${ABSENT}".`)
    if (one.op === 'modify' && (one.before === ABSENT || one.after === ABSENT)) refuse('is a modify, so both its hashes are hashes.')
    if (one.op === 'modify' && one.before === one.after) refuse('is a modify whose content does not change.')
    if (one.op === 'rename' && (one.before === ABSENT || one.after === ABSENT)) refuse('is a rename, so both its hashes are hashes.')
    if (one.op === 'delete' && one.mode !== undefined) refuse('is a delete, which lands no file, so it has no mode.')
    for (const path of one.from === undefined ? [one.path] : [one.path, one.from]) {
      const earlier = touched.get(path)
      if (earlier !== undefined) refuse(`touches ${path}, which operation ${String(earlier + 1)} already touches. One path, one operation.`)
      touched.set(path, index)
    }
    if (one.record !== undefined) {
      const named = getRecord(one.record)
      if (named === null || named.workspaceId !== workspaceId || named.deletedAt) refuse(`names the record ${one.record}, which this project does not hold.`)
    }
  })
}

/** The changeset as it will be stored, from what the caller sent and what the seal says. */
function theChangesetToStore(
  asked: ASubmission['changeset'],
  seal: NonNullable<ReturnType<typeof readRunSeal>>,
  workspaceId: string,
): { changeset: Changeset; interpreted: string[] } {
  if (asked.adapter === 'git') {
    const git = seal.seal.git
    if (git === null) {
      throw new PanelError(
        seal.seal.kind === 'files'
          ? `The run's seal ${seal.id} holds no git work — it sealed a folder of files, which were never in a repository — so there is no commit to merge. Submit it as a files changeset. Nothing was written.`
          : `The run's seal ${seal.id} holds no git work — it sealed records only — so there is no commit to merge. Nothing was written.`,
        409,
      )
    }
    const repository = theRepositoryNamed(asked.repository, workspaceId)
    const changeset: GitChangeset = {
      adapter: 'git',
      root: theCheckoutOf(repository),
      repository: repository.id,
      branch: asked.branch ?? null,
      commit: git.commit,
      base: git.forkBase,
    }
    return {
      changeset,
      interpreted: [
        `"${asked.repository}" is the repository ${repository.name} (${repository.id}), checked out at ${changeset.root}.`,
        `The commit ${git.commit} and the base ${git.forkBase} are the seal's.`,
        ...(asked.branch === undefined ? ['Nobody said which branch; it is stored as not said.'] : []),
      ],
    }
  }
  checkTheOperations(asked.operations, workspaceId)
  const changeset: FilesChangeset = {
    adapter: 'files',
    root: theDirectory(asked.root, 'The root a files changeset lands in', 400),
    stagedAt: theDirectory(asked.stagedAt, 'The folder its new content is staged in', 400),
    onConflict: asked.onConflict ?? 'bounce',
    operations: asked.operations.map((one) => ({ ...one })),
  }
  return {
    changeset,
    interpreted: [
      ...(changeset.root === asked.root ? [] : [`The root ${asked.root} is ${changeset.root} on this machine.`]),
      ...(changeset.stagedAt === asked.stagedAt ? [] : [`The staging folder ${asked.stagedAt} is ${changeset.stagedAt} on this machine.`]),
      ...(asked.onConflict === undefined ? ['Nobody said what a conflict should do, so a conflict bounces it back: nothing is overwritten.'] : []),
      'The staged content has not been read yet; the merge tool checks every hash when it pins this entry.',
    ],
  }
}

/**
 * THE NAME A SENTENCE GIVES ONE PARTICIPANT IT HOLDS BY ID, which a person reads: an agent's office name, read from the one
 * row the stored string names. A person, and a string no single agent row answers, are shown as stored.
 */
export function theOfficeNameOrAsStored(who: ParticipantRef): string {
  const row = who.kind === 'agent' ? theOneAgentAStringNames(sqlite, who.id) : null
  return row === null ? who.id : theOfficeNameOf(row)
}

/** The same run agent and recorded starter for the end notice and the round-open reading. */
export function theAgentAndStarterOfAnEntry(entry: Pick<MergeEntryReading, 'run'>) {
  const run = getRecord(entry.run)
  const agent = run === null ? null : theAgentOfARun(run)
  const recorded = agent?.startedBy ?? null
  const starter = recorded?.kind === 'agent' ? { kind: 'agent' as const, id: theOneAgentAStringNames(sqlite, recorded.id)?.id ?? recorded.id } : recorded
  return { agent, starter }
}

/**
 * WHO IS TOLD WHEN AN ENTRY ENDS WITHOUT LANDING: the run's agent (or its starter in a retired agent's place), the
 * starter, and the submitter. One answer for a bounce (./merge-state-machine.ts) and for a supersede below, so the two
 * notices cannot come to tell different people.
 */
export function whoIsToldOfAnEntrysEnd(entry: MergeEntryReading): { to: ParticipantRef[]; says: string } {
  if (entry.takeBackOf !== undefined) return whoIsToldOfATakeBack(entry)
  const { agent, starter } = theAgentAndStarterOfAnEntry(entry)
  const to = entryEndRecipients({ agent: agent === null ? null : { ...agent, startedBy: starter }, submittedBy: entry.submittedBy }, stored => theOneAgentAStringNames(sqlite, stored)?.id ?? stored)
  // The message goes to each agent's registry id, and the sentence names each by its office name. A stored
  // string that leads to no single agent is shown as it is.
  const says =
    to.length === 0
      ? 'Nobody could be told: the run names no live agent, no starter is recorded, and the submitter is not an agent.'
      : `Told ${to.map(theOfficeNameOrAsStored).join(', ')}.` + (agent !== null && agent.retired === true ? ` The agent ${theOfficeNameOf(agent)} is retired, so its starter is told in its place.` : '')
  return { to, says }
}

/** How the newer commit contains the older one, by the proof `whatALaterSealHolds` found, in the words of the sentence. */
export const HOW_IT_CONTAINS: Record<'ancestor' | 'same patches' | 'same changed lines', string> = {
  ancestor: 'the older commit is one of its ancestors',
  'same patches': 'each commit of the older entry is in it as a commit with the same patch',
  'same changed lines': 'each commit of the older entry has its changed lines in it',
}

/**
 * WHETHER A NEWER SUBMISSION IS THE SAME WORK AS AN OLDER ENTRY, and the sentence that says why. Problem YL2A9GqoUWHd:
 * two runs in one worktree on two branches were taken for one work, because the folder alone was compared, and entry
 * cRCa-voguDqT was superseded by SmQ1ePvlIThf, which did not hold its commit. A files entry is the same work in the same
 * lane and staging folder. A git entry is the same work in the same lane only when the newer commit contains the older
 * entry's commit: every commit of the older one is in it, by ancestry or as the same change (`whatALaterSealHolds`).
 * The folder, the branch name and the run lineage never make two git entries the same work on their own (wave 13v
 * round 16): a run that continues another may start a second line of work, and before this round it superseded the
 * first one without holding it. A repository git cannot read is said in `unread`, and the older entry is left in the
 * queue. `laterSide` is the newer commit's side of that comparison, read once for every older entry
 * (./merge-queue-same-work.ts).
 */
function theSameWork(olderId: string, older: StoredEntry, newer: Changeset, repository: string | null, laterSide: TheLaterSide | null): { same: true; because: string } | { same: false; unread?: string } {
  if (laneOf(older.changeset) !== laneOf(newer) || older.changeset.adapter !== newer.adapter) return { same: false }
  if (newer.adapter === 'files') {
    return (older.changeset as FilesChangeset).stagedAt === newer.stagedAt ? { same: true, because: `It stages its files in the same folder, ${newer.stagedAt}, in the same lane.` } : { same: false }
  }
  const was = older.changeset as GitChangeset
  if (repository === null || laterSide === null) return { same: false }
  let held: ReturnType<typeof whatALaterSealHolds>
  try { held = whatALaterSealHolds(repository, { forkBase: was.base, commit: was.commit }, { forkBase: newer.base, commit: newer.commit }, laterSide) }
  catch (error) { return { same: false, unread: `Mole Office could not tell whether merge entry ${olderId} is the same work, so it was left in the queue: ${error instanceof Error ? error.message : String(error)}` } }
  if (!held.holds) return { same: false }
  return { same: true, because: `Its commit ${newer.commit.slice(0, 12)} contains the older entry's commit ${was.commit.slice(0, 12)}: ${HOW_IT_CONTAINS[held.how]}.` }
}

/** What a newer entry's answer says of an older entry of the same work that it supersedes. */
export const IT_SUPERSEDES = (olderId: string): string => `It supersedes ${olderId}.`

/** The rule that ends the answer's words for an older entry that stays. */
export const ONLY_A_BASE_WITHOUT_ITS_COMMITS_SUPERSEDES = 'An older entry is superseded only by an entry whose base holds none of its commits.'

/** What a newer entry's answer says of an older entry that stays ahead of it, when `held` of the older entry's `own` commits are in this entry's `base`. */
export const AN_OLDER_ENTRY_STAYS_AHEAD = (olderId: string, base: string, held: number, own: number): string =>
  `Merge entry ${olderId} stays in the queue ahead of this one. This entry's base ${base.slice(0, 12)} holds ${held === own ? `every commit of ${olderId}` : `${String(held)} of the ${String(own)} commits of ${olderId}`}, ` +
  `so the merge tool can land this entry only after ${olderId} has landed. ${ONLY_A_BASE_WITHOUT_ITS_COMMITS_SUPERSEDES}`

/**
 * WHY AN OLDER GIT ENTRY OF THE SAME WORK STAYS IN THE QUEUE, or null when the newer entry supersedes it (wave 13u
 * round 157). The merge tool lands an entry only when its sealed base is on main (tools/merge-tool/integrate.mjs). A
 * newer entry cut from the older entry's commit superseded the older entry, and the merge tool then refused the newer
 * one, because its base had not landed, so neither could land. An older entry is therefore superseded only by an entry
 * whose base holds none of the older entry's own commits, from its base to its commit: a newer entry cut from the same
 * main, or carried onto a later main. Otherwise both stay, and the lane keeps them in the order they were submitted.
 * A base git cannot read is said in `unread`, and the older entry stays.
 */
function whyTheOlderEntryStays(olderId: string, was: GitChangeset, newer: GitChangeset, repository: string): { stays: string } | { unread: string } | null {
  const count = (...args: string[]): number => Number(readGit(repository, ['rev-list', '--count', ...args]).toString('utf8').trim())
  let own: number
  let outsideTheBase: number
  try {
    own = count(was.commit, `^${was.base}`)
    outsideTheBase = count(was.commit, `^${was.base}`, `^${newer.base}`)
  } catch (error) {
    return { unread: `Mole Office could not tell whether the base ${newer.base.slice(0, 12)} of this entry holds commits of merge entry ${olderId}, so ${olderId} was left in the queue: ${whyGitDidNotAnswer(error)}.` }
  }
  const held = own - outsideTheBase
  if (held === 0) return null
  return { stays: AN_OLDER_ENTRY_STAYS_AHEAD(olderId, newer.base, held, own) }
}

/**
 * THE RUN'S OWN STARTER, AS parentAttachment RECORDS IT: the session that started this run, read for
 * the agent it served. This is not the agent's registered starter (`RegisteredAgent.startedBy`,
 * written once when the agent is registered) — it is whoever actually started this particular run,
 * which can be a different agent when the run's agent was registered by somebody else. Finding 1 of
 * the sandbox v1 acceptance: a supervisor started worker runs but had not registered the worker
 * agents, so the supervisor was refused although it was the one that started the run.
 */
export function starterAgentOfARun(run: PanelRecord) {
  const parentId = run.data['parentAttachment']
  if (typeof parentId !== 'string' || parentId === '') return null
  const parent = getRecord(parentId)
  if (parent === null) return null
  return theAgentOfARun(parent)
}

/**
 * THE OFFICE SUBMITTING A SEALED ROUND OF A LINE THAT IS ON (wave 13u round 93). Set only by
 * lib/merge-queue-at-the-seal.ts, for the one submission it makes, so the office is no submitter anywhere else.
 */
let theOfficeIsQueueingAtTheSeal = false

/** Run one submission as the office queueing a sealed round. The mark is cleared whether it succeeds or throws. */
export function asTheOfficeAtTheSeal<T>(submit: () => T): T {
  const before = theOfficeIsQueueingAtTheSeal
  theOfficeIsQueueingAtTheSeal = true
  try {
    return submit()
  } finally {
    theOfficeIsQueueingAtTheSeal = before
  }
}

/**
 * Who may submit a run: its own agent, the agent that started that agent, the run's own starter, or the person. The
 * office's worker submits a take-back the office filed.
 *
 * Anybody else is the gate "who-submits-a-merge-entry" (wave 13r round Y). At block they are refused as before, and an
 * agent its own key proves is counted as stopped. At off an agent its own key proves, registered and not retired, may
 * also submit, and the entry names it as its submitter; `submitAMergeEntry` counts it in the submission's own write, so a
 * submission refused later is not counted. Any other caller gets the gate's off words, uncounted. A caller with nothing
 * registered is refused at both positions. The hand-over of a resolution asks `whoIsInTheRunsLine`, which the gate does
 * not change.
 */
function whoIsSubmitting(run: PanelRecord, actor: Actor): { by: ParticipantRef; letThroughAtOff: boolean } {
  if (actor.type === THE_WORKER.type && actor.id === THE_WORKER.id && officeTakeBackRun(run)) return { by: { kind: 'agent', id: THE_WORKER.id }, letThroughAtOff: false }
  if (theOfficeIsQueueingAtTheSeal && actor.type === THE_OFFICE.type && actor.id === THE_OFFICE.id) return { by: { kind: 'agent', id: THE_OFFICE.id }, letThroughAtOff: false }
  const act = { may: 'submit it', nobody: 'a submission would name nobody as its submitter' }
  const me = theRegisteredCaller(actor, act)
  if (isInTheRunsLine(run, me)) return { by: me, letThroughAtOff: false }
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  const position = gatePosition('who-submits-a-merge-entry')
  if (keyed && position !== 'block') return { by: me, letThroughAtOff: true }
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-submits-a-merge-entry', "submit any run's work to the merge queue")
  const refusal = notInTheRunsLine(run, me, act)
  if (!keyed) throw refusal
  throw gateMetOnceTheWriteIsTakenBack(refusal, () => gateMet('who-submits-a-merge-entry', 'block'))
}

/**
 * WHETHER WHO IS ASKING IS IN A RUN'S OWN LINE: its own agent, the agent that started that agent, the run's own starter,
 * or the person. A submission asks it, and so does the hand-over of a resolution (door (a) of xqGNR20SQ9vO);
 * `act` is what the refusal says they may do and what a nobody would leave unnamed.
 */
export function whoIsInTheRunsLine(run: PanelRecord, actor: Actor, act: { may: string; nobody: string }): ParticipantRef {
  const me = theRegisteredCaller(actor, act)
  if (isInTheRunsLine(run, me)) return me
  throw notInTheRunsLine(run, me, act)
}

/** Who is asking, as registered, or the refusal that says nothing is registered as them. */
function theRegisteredCaller(actor: Actor, act: { nobody: string }): ParticipantRef {
  const me = participantForActor(actor)
  if (me === null) {
    throw new PanelError(
      `Nothing is registered as "${actor.id}", so ${act.nobody}. Nothing was written.`,
      403,
      'Register with POST /api/agents/started first.',
    )
  }
  return me
}

/** Whether a registered caller is the person, or the run's own agent, the agent that started it, or the run's own starter. */
function isInTheRunsLine(run: PanelRecord, me: ParticipantRef): boolean {
  if (me.kind === 'person') return true
  const agent = theAgentOfARun(run)
  const started = agent?.startedBy ?? null
  const starter = starterAgentOfARun(run)
  return (
    (agent !== null && agent.id === me.id) ||
    (started !== null && started.kind === 'agent' && started.id === me.id) ||
    (starter !== null && starter.id === me.id)
  )
}

function notInTheRunsLine(run: PanelRecord, me: ParticipantRef, act: { may: string }): PanelError {
  return new PanelError(
    `Only the agent run ${run.id} served, the agent that started it, the run's own starter, or the person may ${act.may}, and ${me.id} is none of them. Nothing was written.`,
    403,
  )
}

/** The paths a changeset touches, relative to its root: both ends of each file operation, or the files its git seal holds. */
function thePathsItTouches(changeset: Changeset, seal: NonNullable<ReturnType<typeof readRunSeal>>): string[] {
  if (changeset.adapter === 'files') return [...new Set(changeset.operations.flatMap((one) => [one.path, ...(one.from === undefined ? [] : [one.from])]))].sort()
  const git = seal.seal.git
  if (git === null) throw new Error(`A git changeset was stored on seal ${seal.id}, which holds no git work.`)
  return git.files.map((one) => one.path).sort()
}

/**
 * THE RECORD OF WHAT THE SUITE READS FOR AN ENTRY, by main's tree it was integrated on: the kept
 * record and its tree, or why it cannot be read, with the status a door answers. The merge tool keeps it as
 * <folder>/reads/<tree>.json, and only such a file is read. GET /api/merge-queue/:id/reads answers it, and the change
 * door reads which files a test under way reads from it.
 */
export function theReadsRecordOf(entry: MergeEntryReading): { kept: Record<string, unknown>; tree: string } | { why: string; status: 404 | 409 } {
  const reads = (entry.machine['integration'] as { reads?: { tree: string; record: string } } | undefined)?.reads
  if (reads === undefined) return { why: `Merge entry ${entry.id} holds no record of what the suite reads: main's tree had none when it was integrated.`, status: 404 }
  if (basename(reads.record) !== `${reads.tree}.json` || basename(dirname(reads.record)) !== 'reads') {
    return { why: `Merge entry ${entry.id} names ${reads.record} as its record, which is not where the merge tool keeps one. Nothing was read.`, status: 409 }
  }
  try {
    return { kept: JSON.parse(readFileSync(reads.record, 'utf8')) as Record<string, unknown>, tree: reads.tree }
  } catch {
    return { why: `The record ${reads.record} of what the suite reads on tree ${reads.tree} is not there any more.`, status: 404 }
  }
}

/**
 * WHAT A TEST UNDER WAY HAS OF A CHANGE JUST SUBMITTED, in the sentence the submission door
 * answers. That replaced the Secretariat group's line per entry. A test under way is an entry in
 * testing, in any project, that lands in the same directory as this change; its files are the ones its reading names under test
 * (`readMergeEntry`, `underTest`), and they are compared with this change's paths. Whether this change waits for that
 * test is read off the lanes: an entry holds its lane until it lands or bounces, and a git change learns at its pin step
 * whether it goes to the documentation lane instead.
 */
function whatATestUnderWayHasOf(changeset: Changeset, paths: readonly string[]): string {
  const rows = sqlite
    .prepare(
      `SELECT id, ${theOrderWritten('records')} AS written FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.state') = 'testing' ` +
        "AND json_extract(data, '$.changeset.root') = ? ORDER BY written, rowid",
    )
    .all(MERGE_ENTRY_KIND, changeset.root) as { id: string; written: number | null }[]
  const testing = eachHasAPlace(rows).map((row) => readMergeEntry(getRecord(row.id)!))
  if (testing.length === 0) return ` No test is under way in ${changeset.root}, so none of this change's files is under test.`
  const lane = laneOf(changeset)
  return testing
    .map((one) => {
      // WHAT THE TEST READS, from the entry's record of the suite's reads: its files, and every file under the folders
      // it read whole. A record that cannot be read is said, and nothing is claimed about which files the test reads.
      const record = theReadsRecordOf(one)
      const kept = 'kept' in record ? record.kept : null
      const readable = kept !== null && Array.isArray(kept['files']) && Array.isArray(kept['folders'])
      const read = readable ? paths.filter((path) => theSuiteReads(path, kept as unknown as WhatTheSuiteReads)) : []
      const changed = one.underTest?.files ?? []
      const alsoChanged = paths.filter((path) => changed.includes(path))
      const opening = ` A test is under way in ${changeset.root}: merge entry ${one.id}.`
      const reads = !readable
        ? ` Mole Office cannot tell which files that test reads: ${'why' in record ? record.why : `its record on tree ${'tree' in record ? record.tree : ''} holds no list of files and folders.`}`
        : read.length === 0
          ? ' By its record of what the suite reads, that test reads none of the files this change touches.'
          : ` By its record of what the suite reads, that test reads ${String(read.length)} of the files this change touches: ${read.join(', ')}.`
      const changes =
        alsoChanged.length === 0
          ? ''
          : ` That entry also changes ${String(alsoChanged.length)} of them: ${alsoChanged.join(', ')}.`
      const nothing = readable && read.length === 0 && alsoChanged.length === 0 ? ' So nothing of this change is under test.' : ''
      const files = opening + reads + changes + nothing
      if (one.lane !== lane) return `${files} That entry holds the lane ${one.lane}, which is not the lane ${lane} this change queues in.`
      const waits = ` This change cannot land before that test is over: merge entry ${one.id} holds the lane ${lane} until it lands or bounces, and this change queues in the same lane.`
      return changeset.adapter === 'files'
        ? `${files}${waits}`
        : `${files}${waits} The one exception: if the merge tool finds at the pin step that every file of this change is a document no test reads, the change moves to the documentation lane and may land first.`
    })
    .join('')
}

/**
 * NO COMMIT AN ENTRY BRINGS MAY CARRY AN ATTRIBUTION LINE (wave 13u item 31). Every commit from the seal's base to its
 * commit is read before anything is written, with the merge tool's own pattern (src/config/attribution-lines.mjs). The
 * tool would test and land such an entry and then refuse to push it, so it is refused here, before it is tested, and the
 * refusal names each commit and each line. When none carries one, the answer is a sentence for `interpreted`, so that
 * commits read and found clean are told apart from commits nobody read.
 */
function noCommitCarriesAnAttributionLine(sealId: string, git: GitSubmission): string {
  let printed: string
  try {
    printed = readGit(git.repository, theMessagesOfARange(`${git.forkBase}..${git.commit}`)).toString('utf8')
  } catch (error) {
    throw new PanelError(
      `Git could not read the commit messages of seal ${sealId}, from the base ${git.forkBase} to the commit ${git.commit}, in ${git.repository}: ${whyGitDidNotAnswer(error)}. ` +
        'So nobody can tell whether one of them carries an attribution line. Nothing was written.',
      409,
    )
  }
  const commits = theMessagesIn(printed).reverse()
  const found = commits.flatMap(({ commit, message }) => {
    const lines = theAttributionLinesOf(message)
    if (lines.length === 0) return []
    return [`Commit ${commit.slice(0, 12)} ("${message.split('\n')[0] ?? ''}") has ${lines.map((line) => `the line "${line}"`).join(' and ')}.`]
  })
  if (found.length > 0) {
    throw new PanelError(
      `${found.length === 1 ? 'A commit of this work carries' : `${String(found.length)} commits of this work carry`} an attribution line, and no commit that reaches main may carry one. ` +
        `The merge tool would test and land this work and then refuse to push it. ${found.join(' ')} ` +
        'Take the line out of each of them (git rebase, and reword the commit), seal the work again, and submit it again. Nothing was written.',
      409,
    )
  }
  return commits.length === 1
    ? 'The one commit from the base to the commit carries no attribution line.'
    : `None of the ${String(commits.length)} commits from the base to the commit carries an attribution line.`
}

/**
 * TELL A SUPERSEDED ENTRY'S PEOPLE, and return what is kept on it as `told`. The notice names the entry that superseded
 * it and the run that entry came from (decision CVfWgqGgLf1w: a notice names the new run), and says that its commit is
 * contained in the newer one. It wakes its readers: its row in ./notices.ts says why.
 */
function theSupersededAreTold(entry: MergeEntryReading, by: { id: string; title: string; run: string }, because: string): { submitter: string[]; secretary: null; says: string } {
  const whom = whoIsToldOfAnEntrysEnd(entry)
  if (whom.to.length === 0) return { submitter: [], secretary: null, says: whom.says }
  const message = writeAMessage({
    workspaceId: entry.workspaceId,
    to: whom.to,
    title: `Superseded: merge entry ${entry.id}, by merge entry ${by.id}`,
    aboutRun: entry.run,
    actor: THE_OFFICE,
    notice: 'anEntryWasSuperseded',
    body:
      `Merge entry ${entry.id} — ${entry.title} — was superseded by merge entry ${by.id} — ${by.title} — submitted from run ${by.run}. ` +
      `${because} So the work of ${entry.id} is carried by ${by.id} and lands only with it; ${entry.id} is final and will not land on its own.\n\n` +
      `Next: nothing, if ${by.id} is meant to carry this work. Follow it at GET /api/merge-queue/${by.id}. If it bounces or is withdrawn, this work goes with it, so submit it again then.`,
  })
  return { submitter: [message], secretary: null, says: whom.says }
}

/**
 * SUBMIT A RUN'S CHANGESET TO THE QUEUE. SPEC.md section 5.2, the first door.
 *
 * H_SUBMIT: the run has a seal. The entry points at that seal, and a later finish of the run writes a
 * new seal without changing what this entry was submitted on. An older entry for the same work — see
 * `theSameWork` — is superseded in the same transaction, keeps `superseded` {by, because, at}, and is
 * joined to the new one by a `supersedes` link, unless it is already landing, which refuses the
 * submission; one carrying exactly this seal and this changeset refuses it as a repeat. An older git
 * entry whose commits the new entry's base holds is not superseded (`whyTheOlderEntryStays`): both
 * stay, and the answer says the older one lands first.
 */
export function submitAMergeEntry(input: { workspaceId: string; submission: ASubmission; actor: Actor }): {
  entry: MergeEntryReading
  superseded: string[]
  interpreted: string[]
  says: string
} {
  const { workspaceId, submission, actor } = input
  const run = recordInWorkspace(submission.run, workspaceId)
  if (run.kind !== 'session') throw new PanelError(`Record ${run.id} is a ${kindWord(run.kind).text}, not a run. Only a run's work can be submitted. Nothing was written.`, 409)
  if (howARunStands(run.data).closedUnchecked !== null) throw new PanelError(`Run ${run.id} was closed unchecked and cannot enter the merge queue. Nothing was written.`, 409)
  const { by: submittedBy, letThroughAtOff } = whoIsSubmitting(run, actor)
  const suiteWorkers = theSuiteWorkersNamed(submission.suiteWorkers, actor)
  const seal = readRunSeal(run.id)
  if (seal === null) {
    throw new PanelError(
      `Run ${run.id} has no seal, so there is nothing fixed to merge: a run is sealed when it finishes. Finish it, and submit again. Nothing was written.`,
      409,
    )
  }
  // A RUN RELEASED ON ANOTHER SEAL IS NEVER JUDGED ON THIS ONE, so nothing is filed that would wait for a release the
  // door will never write (decision CVfWgqGgLf1w). A submission on the seal the release read is left alone: that is what
  // a bounce for churn or a stalled tool asks for, and the release still covers it.
  const releasedOn = howARunStands(run.data).released?.read?.sealId ?? null
  if (releasedOn !== null && releasedOn !== seal.id) {
    throw new PanelError(
      `${aReleasedRunGoesInUnderANewRun(run.id)} Its release read seal ${releasedOn}, and this submission is on seal ${seal.id}. Nothing was written.`,
      409,
    )
  }
  const { changeset, interpreted } = theChangesetToStore(submission.changeset, seal, workspaceId)
  if (changeset.adapter === 'git' && seal.seal.git !== null) interpreted.push(noCommitCarriesAnAttributionLine(seal.id, seal.seal.git))

  const unread: string[] = []
  const staying: string[] = []
  // ONE LATER SIDE FOR THE WHOLE SUBMISSION: the landings on main are read once, however many entries wait.
  const repository = seal.seal.git?.repository ?? null
  const laterSide = repository !== null && changeset.adapter === 'git' ? aLaterSideForTheQueue(repository, { forkBase: changeset.base, commit: changeset.commit }) : null
  const older = theEntriesOf(workspaceId)
    .map((record) => ({ record, entry: entryOf(record) }))
    .filter(({ entry }) => !MERGE_STATE_SPECS[entry.state].final)
    .flatMap(({ record, entry }) => {
      const same = theSameWork(record.id, entry, changeset, repository, laterSide)
      if (!same.same) {
        if (same.unread !== undefined) unread.push(same.unread)
        return []
      }
      // AN OLDER ENTRY THIS ONE CANNOT LAND WITHOUT IS NOT SUPERSEDED BY IT (wave 13u round 157).
      const stays = changeset.adapter === 'git' && repository !== null ? whyTheOlderEntryStays(record.id, entry.changeset as GitChangeset, changeset, repository) : null
      if (stays === null) return [{ record, entry, because: same.because }]
      if ('unread' in stays) unread.push(stays.unread)
      else staying.push(stays.stays)
      return []
    })
  for (const { record, entry } of older) {
    if (entry.seal.id === seal.id && JSON.stringify(entry.changeset) === JSON.stringify(changeset) && entry.suiteWorkers?.count === suiteWorkers?.count) {
      throw new PanelError(`Merge entry ${record.id} already carries exactly this, and it is ${stateWord(entry.state).text}. Nothing was written.`, 409)
    }
    if (!MERGE_STATE_SPECS[entry.state].mayBeWithdrawn) {
      throw new PanelError(
        `Merge entry ${record.id} is the same work and it is ${stateWord(entry.state).text}, so it can no longer be superseded. Submit again once it has landed or bounced. Nothing was written.`,
        409,
      )
    }
  }

  const title =
    changeset.adapter === 'git'
      ? `Merge ${changeset.branch ?? 'a branch'} at ${changeset.commit.slice(0, 12)} into ${changeset.root}`
      : `Merge ${String(changeset.operations.length)} ${changeset.operations.length === 1 ? 'file' : 'files'} into ${changeset.root}`
  const pinIt = toolMarkOnArrivingIn('submitted', undefined)
  const written = asTheMergeQueue(() => {
    const submitTransaction = sqlite.transaction(() => {
      // AN AGENT THE GATE "who-submits-a-merge-entry" LET THROUGH AT OFF is counted in this write, so it is taken back
      // with a submission refused below.
      if (letThroughAtOff) gateMet('who-submits-a-merge-entry', 'off')
      const authority = validateFixRoundSubmission(submission, run, seal, changeset, actor, workspaceId)
      const entryTitle = authority !== null && 'value' in authority && submission.fixRound?.kind === 'takeout' ? mainSuiteFixTakeoutTitle(submission, authority, Date.now()) : title
      const created = createRecord({
        kind: MERGE_ENTRY_KIND,
        title: authority !== null && 'takeBack' in authority ? authority.title : entryTitle,
        data: {
          run: run.id,
          seal: { id: seal.id, hash: seal.seal.hash },
          changeset,
          state: 'submitted',
          submittedBy,
          // THE CLOCK OBSERVATION OF THE SUBMISSION, beside the record's own `createdAt`, which repeats an hour when the
          // clocks go back. The page counts how long the entry has waited from it.
          submittedTime: clockStamp(),
          ...(submission.fixRound === undefined ? {} : { fixRound: submission.fixRound }),
          ...(authority !== null && 'takeBack' in authority ? { takeBackOf: authority.takeBack } : {}),
          ...(authority !== null && 'handBack' in authority ? { repairOf: authority.handBack } : {}),
          ...(submission.takesOut === undefined ? {} : { takesOut: submission.takesOut }),
          ...(suiteWorkers === null ? {} : { suiteWorkers }),
          // A SUBMITTED ENTRY IS PINNED BY THE MERGE TOOL AT ONCE (SPEC.md 5.4), so it arrives asking for it.
          ...(pinIt === null ? {} : { toolWanted: pinIt }),
        },
        workspaceId,
        actor,
      })
      // ABOUT THE RUN AND THE SEAL, SPEC.md section 5.1: an entry is read from the run it came from and
      // the seal it was submitted on, and both are one press away from it.
      createLink({ fromId: created.id, toId: run.id, type: 'about', actor })
      createLink({ fromId: created.id, toId: seal.id, type: 'about', actor })
      for (const { record, because } of older) {
        // WHICH ENTRY SUPERSEDED IT AND WHY, kept on the older entry (problem YL2A9GqoUWHd), and WHO WAS TOLD: a
        // superseded entry is never silent (wave 13v round 16). Its run's agent, starter and submitter hear it in the
        // same transaction, so an entry is never superseded with nobody told.
        const told = theSupersededAreTold(readMergeEntry(record), { id: created.id, title: created.title, run: run.id }, because)
        moveEntry({ id: record.id, to: 'superseded', actor, also: { superseded: { by: created.id, because, at: nowStamp() }, told } })
        createLink({ fromId: created.id, toId: record.id, type: 'supersedes', actor })
      }
      return created
    })
    return submission.fixRound === undefined ? submitTransaction() : submitTransaction.immediate()
  })
  const superseded = older.map(({ record }) => record.id)
  return {
    entry: readMergeEntry(getRecord(written.id)!),
    superseded,
    interpreted: [...interpreted, ...unread],
    says:
      `Merge entry ${written.id} is queued, and it waits on ${MERGE_STATE_SPECS.submitted.waitsOn}.` +
      older.map(({ record, because }) => ` ${IT_SUPERSEDES(record.id)} ${because}`).join('') +
      staying.map((stays) => ` ${stays}`).join('') +
      (suiteWorkers === null ? '' : ` Its whole suite runs at ${String(suiteWorkers.count)} workers, and it is tested alone, never on a bus.`) +
      whatATestUnderWayHasOf(changeset, thePathsItTouches(changeset, seal)),
  }
}

/**
 * BEFORE A SUBMISSION IS JUDGED, THE LANDINGS IT WILL COMPARE ARE READ (wave 13u round 146), by git processes the
 * server does not wait for, when its run has a git seal and a git entry is still waiting, so judging it holds the server
 * only briefly. Nothing here refuses or writes: whatever is wrong with the submission is said when it is judged, in its
 * own words.
 */
export async function theLandingsASubmissionComparesAreRead(workspaceId: string, runId: string): Promise<void> {
  const run = getRecord(runId)
  if (run === null || run.kind !== 'session' || run.workspaceId !== workspaceId) return
  let git: GitSubmission | null
  try {
    git = readRunSeal(run.id)?.seal.git ?? null
  } catch (error) {
    if (error instanceof PanelError) return
    throw error
  }
  if (git === null) return
  const aGitEntryWaits = theEntriesOf(workspaceId).some(({ data }) => {
    const state = data['state']
    const changeset = data['changeset']
    return typeof state === 'string' && (MERGE_STATES as readonly string[]).includes(state) && !MERGE_STATE_SPECS[state as MergeState].final && isObject(changeset) && changeset['adapter'] === 'git'
  })
  if (aGitEntryWaits) await theLandingsAreReadBelow(git.repository, git.commit)
}

/** A problem's hand-back namespace is distinct from a main-suite fix round. */
export function handBackOfProblem(problem: Pick<PanelRecord, 'kind' | 'data'>): HandBackFacts | null {
  const extra = problem.data['extra'] as { handBack?: unknown; redOnMainFamily?: unknown } | undefined
  const parsed = handBackFacts.safeParse(extra?.handBack)
  return problem.kind === 'problem' && extra?.redOnMainFamily === true && parsed.success ? parsed.data : null
}

/**
 * THE PROJECT'S PROBLEMS THIS CONDITION HOLDS FOR, in `listRecords`' order, with only these fields
 * of each problem's data. The merges pass read every problem whole to keep a few hand-backs:
 * 3,000 problems and 3,000 whole data reads, median 64.58 ms over seven passes on a made-up office
 * (wave 13u round 58). Only six could be acted on. The SQL narrows the rows and fields returned;
 * the caller still checks every fact before acting.
 */
export function theProblemsWhere(workspaceId: string, which: SQL, fields: readonly string[]): PanelRecord[] {
  return listRecordsWithDataAs({ workspaceId, kind: 'problem', alsoWhere: which }, onlyTheseFieldsOf(fields))
}

/**
 * Candidates only: `readTakeBack` still checks complete facts, an existing take-back and the deadline. An emergency push's
 * hand-back with a deadline is read too; it is never taken back, and past its deadline it needs a person.
 */
export const THE_HAND_BACKS_THE_TAKE_BACK_PASS_READS = sql`
  json_extract(${records.data}, '$.state') = 'open'
  AND ((json_type(${records.data}, '$.extra.redOnMainFamily') = 'true' AND json_type(${records.data}, '$.extra.handBack') = 'object')
    OR json_type(${records.data}, '$.extra.emergencyPushHandBack.deadline') = 'text')
  AND json_type(${records.data}, '$.extra.takeBack.aPersonMustLook') IS NULL
`

/** The narrow submission exception reads office provenance, this problem and this exact seal. */
export function officeTakeBackRun(run: PanelRecord, problemId?: string): boolean {
  const extra = run.data['extra'] as { purpose?: unknown; problem?: unknown } | undefined
  if (extra?.purpose !== 'take-back' || typeof extra.problem !== 'string' || (problemId !== undefined && extra.problem !== problemId)) return false
  const problem = getRecord(extra.problem), hand = problem === null ? null : handBackOfProblem(problem)
  const original = hand === null ? null : getRecord(hand.entry)
  const integrated = original?.data['integrated'] as { mainBefore?: string; mainAfter?: string } | undefined
  const seal = readRunSeal(run.id)
  if (problem === null || problem.workspaceId !== run.workspaceId || hand === null || seal === null || !integrated?.mainBefore || !integrated.mainAfter) return false
  try {
    const paths = readGit(hand.repository, ['diff-tree', '-r', '--no-renames', '--name-only', '-z', integrated.mainBefore, integrated.mainAfter]).toString('utf8').split('\0').filter(Boolean)
    return theOfficeFiledThisRunForATakeBack(sqlite, run, seal.id, problem.id, paths, () => seal.seal.git?.files.map(file => file.path) ?? null)
  } catch { return false }
}

type FixRoundSubmissionAuthority = { value: MainSuiteFix; verifiedForTakeout: boolean }

/** Only validated original facts select the take-out words; ordinary titles keep their existing expression. */
function mainSuiteFixTakeoutTitle(submission: ASubmission, authority: FixRoundSubmissionAuthority, now: number): string {
  const { value, verifiedForTakeout } = authority, verification = value.verification, reason = submission.fixRound?.reason
  const eligible = reason === 'hour expired' ? value.deadlineMs !== null && now >= value.deadlineMs
    : verifiedForTakeout && (reason === 'verification unavailable' ? verification?.state === 'unavailable'
      : reason === 'repair not green' && verification?.state === 'complete' && ['red', 'build-failed', 'incomplete'].includes(verification.outcome ?? ''))
  if (!eligible) throw new PanelError('The take-out reason is not supported by the original deadline or actual repair verification. Re-read the problem; nothing was written.', reason === undefined ? 400 : 409)
  const words = reason === 'hour expired' ? "the whole suite stayed red past the fix round's hour"
    : reason === 'verification unavailable' ? 'original repair verification was unavailable'
      : verification?.outcome === 'red' ? "the repair's verification stayed red"
        : verification?.outcome === 'build-failed' ? "the repair's verification build failed" : "the repair's verification was incomplete"
  const entries = submission.takesOut!
  return `Take out merge ${entries.length === 1 ? 'entry' : 'entries'} ${entries.join(', ')}: ${words} (receipt ${value.receipt.recordId})`
}

/** Correlation is checked under the same write transaction that creates the one ordinary entry. */
function validateFixRoundSubmission(submission: ASubmission, run: PanelRecord, seal: NonNullable<ReturnType<typeof readRunSeal>>, changeset: Changeset, actor: Actor, workspaceId: string): FixRoundSubmissionAuthority | { handBack: RepairOf } | { takeBack: TakeBackOf; title: string } | null {
  const ref = submission.fixRound
  if (ref === undefined) {
    if (submission.takesOut !== undefined) throw new PanelError('takesOut requires its authoritative fixRound problem reference. Nothing was written.', 400)
    return null
  }
  const problem = recordInWorkspace(ref.problem, workspaceId)
  if ((problem.data['extra'] as { handBack?: unknown } | undefined)?.handBack !== undefined) {
    const handBack = handBackOfProblem(problem)
    if (problem.kind !== 'problem' || problem.data['state'] !== 'open' || handBack === null) {
      throw new PanelError('A hand-back repair requires an open problem in this project with complete hand-back facts. Nothing was written.', 409)
    }
    if (ref.kind === 'takeout') {
      if (actor.type !== THE_WORKER.type || actor.id !== THE_WORKER.id || ref.reason !== 'not fixed in time' || submission.takesOut !== undefined || !officeTakeBackRun(run, problem.id)) {
        throw new PanelError('A hand-back accepts ordinary repairs; a take-back is filed by the office alone with reason not fixed in time and no takesOut. Nothing was written.', 400)
      }
      const deadline = whenAHandBackIsDue(handBack)
      if (deadline === null || Date.now() <= deadline) throw new PanelError(`The hand-back deadline ${handBack.deadline} (${handBack.timeZone}) cannot be read or has not passed. Nothing was written.`, 409)
      if (takeBackAlreadyExists(workspaceId, problem.id) !== null || aPersonAlreadyLooked(problem)) throw new PanelError('This hand-back already has a take-back or a person-must-look note. Nothing was written.', 409)
      if (changeset.adapter !== 'git' || changeset.root !== handBack.repository) throw new PanelError('The take-back requires the handed-back git repository. Nothing was written.', 409)
      const original = recordInWorkspace(handBack.entry, workspaceId)
      const integrated = original.data['integrated'] as { mainBefore: string; mainAfter: string }
      const paths = readGit(handBack.repository, ['diff-tree', '-r', '--no-renames', '--name-only', '-z', integrated.mainBefore, integrated.mainAfter]).toString('utf8').split('\0').filter(Boolean)
      return { takeBack: { problem: problem.id, entry: handBack.entry, commits: handBack.commits, paths, hours: handBack.hours }, title: takeBackTitle(original.title, handBack.hours) }
    }
    if (submission.takesOut !== undefined) throw new PanelError('A hand-back repair carries no takesOut. Nothing was written.', 400)
    if (changeset.adapter !== 'git' || changeset.root !== handBack.repository) {
      throw new PanelError(`A hand-back repair requires a git changeset of the same repository: ${handBack.repository}; this submission lands in ${changeset.root}. Nothing was written.`, 409)
    }
    return { handBack: { problem: problem.id, files: [...handBack.files] } }
  }
  if (ref.reason === 'not fixed in time') throw new PanelError('The reason not fixed in time belongs only to an office-filed hand-back take-back, not a main-suite fix round. Nothing was written.', 400)
  const value = authoritativeMainSuiteFix(ref.problem, workspaceId)
  assertMainSuiteFixController(actor, value.claim, workspaceId)
  if (value.outcome !== undefined || changeset.adapter !== 'git' || changeset.root !== value.repository || howARunStands(run.data).released?.read?.sealId !== seal.id) {
    throw new PanelError('A fix-round submission requires pending authoritative work and its exact normal checked git seal. Nothing was written.', 409)
  }
  const correlation = ref.kind === 'repair' ? value.repair : value.takeout
  if (correlation?.run !== run.id || correlation.entry !== undefined) throw new PanelError('The submission run differs from the authoritative pending problem correlation. Nothing was written.', 409)
  let verifiedForTakeout = false
  if (ref.kind === 'repair') {
    if (submission.takesOut !== undefined) throw new PanelError('A repair does not carry take-out targets. Nothing was written.', 400)
  } else {
    if (value.deadlineMs === null || value.cause.length === 0 || submission.takesOut === undefined || submission.takesOut.length !== value.cause.length || value.cause.some(c => !submission.takesOut!.includes(c.entry))) {
      throw new PanelError('A take-out requires an unambiguous original deadline and every exact known causal entry once. Nothing was written.', 409)
    }
    if (value.repair?.entry !== undefined) {
      const repair = recordInWorkspace(value.repair.entry, workspaceId)
      const verification = value.verification
      const reference = repair.data['fixRound'] as { problem?:unknown; kind?:unknown } | undefined
      const landed = repair.data['integrated'] as { entry?:unknown; mainAfter?:unknown } | undefined
      verifiedForTakeout = repair.kind === MERGE_ENTRY_KIND && repair.data['state'] === 'merged' && reference?.problem === ref.problem && reference.kind === 'repair' && repair.data['run'] === value.repair.run && landed?.entry === repair.id && landed.mainAfter === verification?.repairCommit && (verification?.state === 'unavailable' || (verification?.state === 'complete' && verification.outcome !== 'green'))
      if (!verifiedForTakeout && !['withdrawn', 'bounced', 'superseded'].includes(String(repair.data['state']))) throw new PanelError('The repair is active or has no original nongreen or unavailable verification of its landed commit; re-read it before a take-out. Nothing was written.', 409)
    }
    for (const cause of value.cause) {
      const entry = recordInWorkspace(cause.entry, workspaceId)
      const landed = entry.data['integrated'] as { entry?: unknown; mainBefore?: unknown; mainAfter?: unknown } | undefined
      const changed = entry.data['changeset'] as { root?: unknown; adapter?: unknown } | undefined
      if (entry.kind !== MERGE_ENTRY_KIND || entry.data['state'] !== 'merged' || changed?.adapter !== 'git' || changed.root !== value.repository || landed?.entry !== entry.id || typeof landed.mainBefore !== 'string' || typeof landed.mainAfter !== 'string') throw new PanelError(`Causal entry ${cause.entry} has no actual matching landed commits. Nothing was written.`, 409)
      let commits: string[]
      try { commits = readGit(value.repository, ['rev-list', '--reverse', `${landed.mainBefore}..${landed.mainAfter}`], { timeoutMs: 10_000 }).toString().trim().split('\n').filter(Boolean) }
      catch { throw new PanelError(`The actual landed commits of causal entry ${cause.entry} cannot be verified. Nothing was written.`, 409) }
      if (JSON.stringify(commits) !== JSON.stringify(cause.commits)) throw new PanelError(`Causal entry ${cause.entry} differs from the pinned actual landed commits. Nothing was written.`, 409)
    }
  }
  const existing = sqlite.prepare("SELECT record_id FROM revisions WHERE workspace_id = ? AND seq = 1 AND op = 'create' AND kind = 'merge_entry' AND json_extract(data, '$.fixRound.problem') = ? AND json_extract(data, '$.fixRound.kind') = ? LIMIT 1").get(workspaceId, ref.problem, ref.kind) as { record_id: string } | undefined
  if (existing !== undefined) {
    const purpose = ref.kind === 'repair' ? 'repair' : 'take-out'
    throw new PanelError(`Merge entry ${existing.record_id} already carries this problem's ${purpose}. Reconcile that entry; nothing was written.`, 409)
  }
  return { value, verifiedForTakeout }
}

/**
 * THE SUITE WORKERS A SUBMISSION NAMES, AND WHO NAMED THEM, or null when it names none, in part
 * A. Only the person or the agent holding the secretary card may name them, so a trial of a count is the
 * coordinator's or the owner's. Anybody else is refused before anything is written.
 */
function theSuiteWorkersNamed(count: number | undefined, actor: Actor): SuiteWorkers | null {
  if (count === undefined) return null
  const by = maySpeakForTheSecretary(actor)
  if (by === null) {
    throw new PanelError(
      `Only the person or the agent holding the secretary card may name an entry's suite workers, and ${actor.id} is neither. Submit without suiteWorkers. Nothing was written.`,
      403,
    )
  }
  return { count, by }
}

// ============================================================================ a secretary's design/-only entry

export { holdsTheSecretaryCard } from './holds-the-secretary-card.ts'

/**
 * WHETHER THIS ACTOR HOLDS THE SECRETARY CARD, OR IS THE PERSON, answering who it is. The one rule for the doors that
 * the person or a secretary may press: the confirm of a files entry's deletes, land-again, and the record of a
 * hand-landing (src/server/lib/inspection.ts). Null for anybody else.
 */
export function maySpeakForTheSecretary(actor: Actor): ParticipantRef | null {
  const me = participantForActor(actor)
  if (me === null) return null
  if (me.kind === 'person') return me
  // `me.id` is already the registry id `participantForActor` resolved the caller to, and the card is read by it.
  return holdsTheSecretaryCard(me) ? me : null
}

/**
 * A SECRETARY'S design/-ONLY CHANGE, SUBMITTED WITH NO RUN, by the owner, with the secretary's 9sQNuC_N8MVX (the lane)
 * and yH7W1sXTRY5q (the run), by a decision.
 *
 * The secretary has no work area and its change is not checked, so there is no run of its own to submit. The
 * office files the run itself, already finished, the way it files a check again, and the record door seals it
 * with `design/` as the sealed area. Then the entry is filed on that run and seal by `submitAMergeEntry`, so
 * every later reader of `entry.run` and `entry.seal` works unchanged. All of it is one transaction: a refusal
 * leaves no run, no seal and no entry.
 *
 * Refused, with nothing written: any caller but the agent that holds the secretary card (403); a working folder
 * whose HEAD is not the named branch's tip, since the seal reads the folder's HEAD and not the branch (409); and
 * a change to any path outside design/, every such path named (409).
 *
 * The run is created finished, so no finish is ever declared on it through the record door, and the office asks
 * no check of it. The state machine covers its seal by the decision instead (`theVerdictOnThePinnedContent`).
 * The run's first write carries `needsNoCheck`, so `howARunStands` reads it as closed and no list counts it as
 * waiting for a check.
 */
export function submitASecretarysDesignEntry(input: { workspaceId: string; submission: ASecretarySubmission; actor: Actor }): ReturnType<typeof submitAMergeEntry> {
  const { workspaceId, submission, actor } = input
  const me = participantForActor(actor)
  if (me === null || !holdsTheSecretaryCard(me)) {
    const who = me === null ? `"${actor.id}", which nothing is registered as,` : me.kind === 'person' ? 'the person' : `agent ${me.id}`
    throw new PanelError(
      `Only the agent that holds the secretary card, and is not retired, may submit a design/ change with no run, and ${who} does not hold it. ` +
        'Everybody else submits a sealed run: {"run":"<session id>","changeset":{…}}. Nothing was written.',
      403,
    )
  }
  const folder = theDirectory(submission.workingDirectory, 'The working folder the office seals from', 400)
  const branch = submission.changeset.branch
  let tip: string | null
  try {
    tip = readGit(folder, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`]).toString('utf8').trim()
  } catch {
    tip = null
  }
  // THE BASE IS READ OFF THE REPOSITORY'S TRUNK, exactly as a run with no cutFrom is sealed; the run then records it as its cutFrom.
  const read = captureGit(folder, null, [THE_SECRETARYS_FOLDER])
  if (tip !== read.commit) {
    throw new PanelError(
      (tip === null ? `The working folder ${folder} has no branch ${branch}.` : `The working folder ${folder} is at ${read.commit}, and the branch ${branch} is at ${tip}.`) +
        " The office seals the folder's HEAD, so it must be the tip of the branch the entry names. Check the branch out in that folder, or name the branch it is on. Nothing was written.",
      409,
    )
  }
  const outside = read.files.map((one) => one.path).filter((path) => !path.startsWith(THE_SECRETARYS_FOLDER))
  if (outside.length > 0) {
    throw new PanelError(
      `The change on ${branch} touches ${String(outside.length)} ${outside.length === 1 ? 'path' : 'paths'} outside design/: ${outside.join(', ')}. ` +
        "A secretary's entry with no run carries design/ files only. Take those paths out of the branch, or submit them as a sealed run of an agent whose work area holds them. Nothing was written.",
      409,
    )
  }
  const row = readParticipant({ kind: 'agent', id: me.id })
  if (row === null || !('handle' in row)) throw new Error(`The secretary ${me.id} was read a moment ago and is gone.`)
  const needsNoCheck: NeedsNoCheck = {
    decision: NO_CHECK_OF_A_SECRETARYS_ENTRY,
    at: nowStamp(),
    because: `The office filed this run for ${theOfficeNameOf(row)}'s design/-only merge entry on ${branch}, and such an entry needs no check.`,
  }
  return sqlite.transaction(() => {
    const run = asTheDoorOf(NEEDS_NO_CHECK, () => sealingTheArea([THE_SECRETARYS_FOLDER], () =>
      createRecord({
        kind: 'session',
        title: `The office's run for a secretary's design/ entry: ${branch} at ${read.commit.slice(0, 12)}`,
        workspaceId,
        actor: THE_OFFICE,
        data: {
          state: 'finished',
          servingAgent: row.handle,
          // THE REGISTRY ID BESIDE THE HANDLE (criterion I7), as a check again's run carries it.
          servingAgentId: row.id,
          workingDirectory: folder,
          cutFrom: read.forkBase,
          doing:
            `The office filed this run for a secretary's design/-only merge entry, which needs no check: ${theOfficeNameOf(row)} submitted the branch ${branch} ` +
            `at ${read.commit} from ${folder}, and the office sealed its design/ files. Nobody ran it.`,
          extra: { purpose: SECRETARY_DOCUMENTS },
          [NEEDS_NO_CHECK]: needsNoCheck,
        },
      }),
    ))
    const seal = readRunSeal(run.id)
    if (seal === null) throw new Error(`The office filed run ${run.id} finished, and the record door did not seal it.`)
    const filed = submitAMergeEntry({ workspaceId, submission: { run: run.id, changeset: submission.changeset }, actor })
    return {
      ...filed,
      interpreted: [`The office filed run ${run.id} for this entry and sealed the design/ files of ${folder} as seal ${seal.id}. Nobody ran it.`, ...filed.interpreted],
    }
  })()
}

// ============================================================================ withdrawing

/**
 * SPEC.md section 5.2: the submitter or the person withdraws an entry, until it starts landing.
 *
 * Anybody else is the gate "who-withdraws-a-merge-entry" (wave 13r round Y). At block they are refused as before, and an
 * agent its own key proves is counted as stopped. At off an agent its own key proves, registered and not retired, may
 * also withdraw the entry, which names who withdrew it; it is counted in the withdrawal's own write. Any other caller
 * gets the gate's off words, uncounted. Which entries may be withdrawn does not change: the refusals of an entry that is
 * landing or final, and of a waiting-only withdrawal of an entry no longer waiting, hold at both positions.
 */
export function withdrawAMergeEntry(input: { workspaceId: string; id: string; because: string; waitingOnly?: true; actor: Actor }): MergeEntryReading {
  return sqlite.transaction(() => withdrawCurrentMergeEntry(input)).immediate()
}

function withdrawCurrentMergeEntry(input: { workspaceId: string; id: string; because: string; waitingOnly?: true; actor: Actor }): MergeEntryReading {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = entryOf(record)
  const me = participantForActor(input.actor)
  const isTheSubmitter = me !== null && me.kind === entry.submittedBy.kind && me.id === entry.submittedBy.id
  let letThroughAtOff = false
  if (me === null || (me.kind !== 'person' && !isTheSubmitter)) {
    const keyed = me !== null && anAgentItsOwnKeyProves(input.actor) !== null
    const position = gatePosition('who-withdraws-a-merge-entry')
    if (keyed && position !== 'block') letThroughAtOff = true
    else if (position !== 'block') throw refusedWhileTheGateIsOff(input.actor.id, 'who-withdraws-a-merge-entry', 'withdraw a merge entry it did not submit')
    else {
      const refusal = new PanelError(
        `Only whoever submitted merge entry ${input.id} (the ${participantWord(entry.submittedBy.kind)} ${entry.submittedBy.id}) or the person may withdraw it. Nothing was written.`,
        403,
      )
      if (!keyed) throw refusal
      throw gateMetOnceTheWriteIsTakenBack(refusal, () => gateMet('who-withdraws-a-merge-entry', 'block'))
    }
  }
  if (!MERGE_STATE_SPECS[entry.state].mayBeWithdrawn) {
    throw new PanelError(
      entry.state === 'landing'
        ? `Merge entry ${input.id} is landing: the office has started moving the main world, so it can no longer be withdrawn. Nothing was written.`
        : `Merge entry ${input.id} is ${stateWord(entry.state).text}, which is final, so there is nothing to withdraw. Nothing was written.`,
      409,
    )
  }
  if (input.waitingOnly === true && !(['submitted', 'pinned', 'judged', 'integrating', 'resolving', 'reinspecting'] as string[]).includes(entry.state)) {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text}, so the waiting-only withdrawal did not write anything. Read the entry again and honor its current state.`, 409)
  }
  if (letThroughAtOff) gateMet('who-withdraws-a-merge-entry', 'off')
  const moved = moveEntry({
    id: input.id,
    to: 'withdrawn',
    actor: input.actor,
    also: { withdrawn: { because: input.because, by: me, at: nowStamp() } },
  })
  return readMergeEntry(moved)
}

// ============================================================================ the merge tool's run

/**
 * WHAT THE OFFICE WANTS ITS MERGE TOOL FOR, AND WHICH MERGE TOOL RUNS IT HAS GOING. Piece P9: the one
 * reading behind `GET /api/worker/merges`, oldest submission first.
 *
 *   wanted  entries holding the mark `toolWanted` that no tool run holds and nothing holds back
 *           (`whyTheMergeToolWaits`): the worker may start one.
 *   going   entries whose last tool run has not ended, plus an ended run whose session still says
 *           running, in any state, so a restarted worker finds and closes the row left in that gap.
 *
 * READ WITH A FILTER IN THE QUERY, because the worker asks on every pass and a project's merged and
 * bounced entries only grow: an entry that asks for nothing and holds no running tool is not read.
 */
export function theMergeToolWork(workspaceId: string): { wanted: MergeEntryReading[]; going: MergeEntryReading[] } {
  const rows = sqlite
    .prepare(
      `SELECT entry.id, ${theOrderWritten('entry')} AS written FROM records AS entry WHERE entry.workspace_id = ? AND entry.kind = ? AND entry.deleted_at IS NULL AND (` +
        "json_extract(entry.data, '$.toolWanted') IS NOT NULL OR " +
        "(json_extract(entry.data, '$.tool') IS NOT NULL AND json_extract(entry.data, '$.tool.endedAt') IS NULL) OR " +
        "(json_extract(entry.data, '$.tool.endedAt') IS NOT NULL AND EXISTS (" +
        "SELECT 1 FROM records AS session WHERE session.id = json_extract(entry.data, '$.tool.session') " +
        "AND session.workspace_id = entry.workspace_id AND session.kind = 'session' AND session.deleted_at IS NULL " +
        "AND json_extract(session.data, '$.state') = 'running'))" +
        ') ORDER BY written, entry.rowid',
    )
    .all(workspaceId, MERGE_ENTRY_KIND) as { id: string; written: number | null }[]
  const entries = eachHasAPlace(rows)
    .map((row) => getRecord(row.id))
    .filter((record): record is PanelRecord => record !== null)
    .map(readMergeEntry)
  const sessionStillRunning = (sessionId: string): boolean => {
    const session = getRecord(sessionId)
    return session !== null && session.workspaceId === workspaceId && session.kind === 'session' && session.data['state'] === 'running'
  }
  const going = (one: MergeEntryReading): boolean => one.tool !== null && (!hasEnded(one.tool) || sessionStillRunning(one.tool.session))
  return {
    wanted: inTheLanesOrder(entries.filter((one) => one.toolWanted !== null && !going(one) && whyTheMergeToolWaits(one) === null)),
    going: entries.filter(going),
  }
}

/**
 * WHY A MARKED ENTRY IS NOT HANDED TO THE MERGE TOOL YET, or null because it may be. Only a judged
 * entry is held, for one of five reasons, and its mark stays standing so it is handed on once the
 * reason is gone rather than started into a refusal that would take the mark with it:
 *
 *   - another entry holds its lane. The tool's first move from judged is to take the lane, which the
 *     database refuses while another entry holds it; the lane is let go when that entry moves on.
 *   - it is a files entry whose deletes no secretary has confirmed. It could
 *     not land anyway, and taking the lane now would hold it for others while it waits.
 *   - it touches a path that lands only after a press, and nobody has pressed, in part
 *     4. It could not land either, for the same reason.
 *   - it did not ride the lane's newest bus, and an entry that rode it is still judged and may be
 *     handed on, or that bus passed over an entry for a check or one tested alone, which goes first
 *     (`aRiderGoesFirst`).
 *   - an entry of its lane moved to the front before it may be handed on (`aMovedEntryGoesFirst`).
 */
export function whyTheMergeToolWaits(entry: MergeEntryReading): string | null {
  return whatTheMergeToolWaitsOn(entry)?.says ?? null
}

/**
 * WHY THE MERGE TOOL WAITS, AS A FIXED FORM (wave 13p round 27, piece 3 of the coordinator's KIzOszMBTi87): which of the
 * reasons, the entries it names, and the office's English sentence. GET /api/merge-queue and GET /api/merge-queue/:id
 * hand it on a judged entry as `toolWaits`, so a reader learns which entry goes first and why without reading the
 * sentence; `whyTheMergeToolWaits` above is this sentence and nothing else.
 */
export type ToolWaits =
  | { because: 'the-queue-is-held'; says: string }
  | { because: 'the-lane-is-held'; holder: string; says: string }
  | { because: 'deletes-not-confirmed'; deletes: number; says: string }
  | { because: 'waits-for-a-press'; paths: string[]; says: string }
  | { because: 'a-rider-goes-first' | 'an-entry-passed-over-for-a-check-goes-first' | 'an-entry-tested-alone-goes-first'; first: string; driver: string; says: string }
  | { because: 'a-moved-entry-goes-first'; first: string; says: string }
  | { because: 'a-returning-entry-goes-first'; first: string; says: string }

/** Whether an entry touches a path that lands only after a press, and nobody has pressed yet. */
function owesAPress(entry: MergeEntryReading): boolean {
  return entry.pressToLand !== undefined && entry.pressToLand.pressed === null
}

/** Whether the merge queue is held (wave 13u round 93): while it is, no entry takes a lane. */
export function theQueueIsHeld(): boolean {
  return gatePosition('queue-held') === '1'
}

/** The office's sentence for an entry the hold keeps out of its lane: in its reading, and in the refusal of the step. */
export function theQueueIsHeldFor(id: string): string {
  return `The merge queue is held, so merge entry ${id} does not take its lane. It takes it once the hold is lifted.`
}

export function whatTheMergeToolWaitsOn(entry: MergeEntryReading): ToolWaits | null {
  if (entry.state !== 'judged') return null
  // THE QUEUE HELD COMES FIRST: while it is held no entry is handed on, whatever else it waits for.
  if (theQueueIsHeld()) return { because: 'the-queue-is-held', says: theQueueIsHeldFor(entry.id) }
  const holder = whoOccupies(entry.lane)
  if (holder !== null && holder.entry !== entry.id) {
    return {
      because: 'the-lane-is-held',
      holder: holder.entry,
      says: `The lane ${entry.lane} is held by merge entry ${holder.entry}, which is ${stateWord(holder.state).text}; merge entry ${entry.id} takes it when it is let go.`,
    }
  }
  const unconfirmed = unconfirmedDeletes(entry.machine)
  if (unconfirmed > 0) {
    return {
      because: 'deletes-not-confirmed',
      deletes: unconfirmed,
      says: `Merge entry ${entry.id} deletes ${String(unconfirmed)} ${unconfirmed === 1 ? 'file' : 'files'}, and no secretary has confirmed that yet.`,
    }
  }
  // AN ENTRY STILL TO BE PRESSED DOES NOT TAKE ITS LANE, in part 4. It could not land, and
  // holding the lane while it waits would hold every entry behind it.
  if (owesAPress(entry)) {
    const paths = entry.pressToLand!.paths
    return {
      because: 'waits-for-a-press',
      paths,
      says:
        `Merge entry ${entry.id} touches ${String(paths.length)} ${paths.length === 1 ? 'path that lands' : 'paths that land'} only after a press (${paths.join(', ')}), ` +
        `and nobody has pressed POST /api/merge-queue/${entry.id}/press-to-land yet.`,
    }
  }
  const first = aRiderGoesFirst(entry)
  if (first === null) return aMovedEntryGoesFirst(entry) ?? aReturningEntryGoesFirst(entry)
  // A MOVED ENTRY STILL WAITS FOR A RIDER, and its words say why it is not first yet (lOBUitZaMl1N).
  const moved = aMoveToTheFrontStands(entry)
    ? ` Merge entry ${entry.id} was moved to the front of its lane, and the lane's newest bus still lets ${first.first} go first.`
    : ''
  if (first.because === 'rode') {
    return {
      because: 'a-rider-goes-first',
      first: first.first,
      driver: first.driver,
      says: `Merge entry ${first.first} rode the bus merge entry ${first.driver} ran, and merge entry ${entry.id} did not, so merge entry ${entry.id} waits while ${first.first} is judged and marked for the merge tool: that bus's result holds only on a tree without merge entry ${entry.id}.${moved}`,
    }
  }
  if (first.because === 'alone') {
    return {
      because: 'an-entry-tested-alone-goes-first',
      first: first.first,
      driver: first.driver,
      says: `The bus merge entry ${first.driver} ran passed over merge entry ${first.first} because it is tested alone, so ${first.first} takes the lane ahead of every entry marked for the merge tool after it, and the next bus cannot keep passing it over; merge entry ${entry.id} waits while ${first.first} is judged and marked for the merge tool.${moved}`,
    }
  }
  return {
    because: 'an-entry-passed-over-for-a-check-goes-first',
    first: first.first,
    driver: first.driver,
    says: `The bus merge entry ${first.driver} ran passed over merge entry ${first.first} because files its release read would change on that bus's tree, so ${first.first} takes the lane first and its check starts at once; merge entry ${entry.id} waits while ${first.first} is judged and marked for the merge tool.${moved}`,
  }
}

/**
 * A MOVED ENTRY OF THE LANE THAT TAKES IT BEFORE THIS ONE, or null. Asked after every other
 * reason, so the riders of the lane's newest bus and the entries it passed over for a check still go first (see
 * lOBUitZaMl1N). A moved entry goes first only while it could be handed on itself: judged in this lane, marked for
 * the merge tool or carried by a run of it that has not ended, no delete of it waiting for a secretary, no press it
 * still needs, and no rider or passed-over entry ahead of it. So a moved entry that cannot go holds nobody, and a moved entry still waiting for
 * its check holds nobody either: the entry that takes the lane meanwhile lets it board its bus. Of two moved entries,
 * the one moved first goes first.
 */
function aMovedEntryGoesFirst(entry: MergeEntryReading): ToolWaits | null {
  const rows = sqlite
    .prepare("SELECT id FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.movedFirst') IS NOT NULL AND json_extract(data, '$.state') = 'judged'")
    .all(MERGE_ENTRY_KIND) as { id: string }[]
  const mine = aMoveToTheFrontStands(entry) ? entry.movedFirst!.turn : Number.POSITIVE_INFINITY
  const ahead = inTheLanesOrder(
    rows
      .map((row) => getRecord(row.id))
      .filter((record): record is PanelRecord => record !== null)
      .map(readMergeEntry)
      .filter((one) => one.id !== entry.id && one.lane === entry.lane && aMoveToTheFrontStands(one) && one.movedFirst!.turn < mine),
    // ITS OWN RUN TAKES ITS MARK while it goes to take the lane, so a run that has started and not ended still holds.
  ).find((one) => (one.toolWanted !== null || (one.tool !== null && !hasEnded(one.tool))) && unconfirmedDeletes(one.machine) === 0 && !owesAPress(one) && aRiderGoesFirst(one) === null)
  if (ahead === undefined) return null
  return {
    because: 'a-moved-entry-goes-first',
    first: ahead.id,
    says: `${ahead.movedFirst!.says} So merge entry ${entry.id} waits while ${ahead.id} is judged and marked for the merge tool, or carried by it.`,
  }
}

/**
 * AN ENTRY BACK FROM A CHECK THAT TAKES THE LANE BEFORE THIS ONE, or null (wave 13u, item 53). Asked after the moved
 * entries, so an entry the person, or the queue's owner, moved to the front stays ahead of a returning one, and a moved
 * entry waits for no returning one. A returning entry goes first on the same terms as a moved
 * one: only while it could be handed on itself. Of two returning entries, the one that came back first goes first.
 */
function aReturningEntryGoesFirst(entry: MergeEntryReading): ToolWaits | null {
  if (aMoveToTheFrontStands(entry)) return null
  const rows = sqlite
    .prepare("SELECT id FROM records WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.returnsFirst') IS NOT NULL AND json_extract(data, '$.state') = 'judged'")
    .all(MERGE_ENTRY_KIND) as { id: string }[]
  const mine = aReturnStands(entry) ? entry.returnsFirst!.turn : Number.POSITIVE_INFINITY
  const ahead = inTheLanesOrder(
    rows
      .map((row) => getRecord(row.id))
      .filter((record): record is PanelRecord => record !== null)
      .map(readMergeEntry)
      .filter((one) => one.id !== entry.id && one.lane === entry.lane && aReturnStands(one) && one.returnsFirst!.turn < mine),
  ).find((one) => (one.toolWanted !== null || (one.tool !== null && !hasEnded(one.tool))) && unconfirmedDeletes(one.machine) === 0 && !owesAPress(one) && aRiderGoesFirst(one) === null)
  if (ahead === undefined) return null
  return {
    because: 'a-returning-entry-goes-first',
    first: ahead.id,
    says:
      `Merge entry ${ahead.id} let its lane go while a check of it ran, and came back at ${ahead.returnsFirst!.at} to find the lane held or main moved, so it takes the lane first. ` +
      `Merge entry ${entry.id} waits while ${ahead.id} is judged and marked for the merge tool, or carried by it.`,
  }
}

/** An entry as the queue's doors answer it: with `toolWaits` when the merge tool waits for it. */
export function withWhatTheToolWaitsOn(entry: MergeEntryReading): MergeEntryReading {
  const waits = whatTheMergeToolWaitsOn(entry)
  return waits === null ? entry : { ...entry, toolWaits: waits }
}

/** The entries a tested step's bus names, in landing order, read strictly: the state machine wrote them through its schema. */
function theBusOf(record: PanelRecord): string[] {
  const tested = record.data['tested']
  const testedWith = isObject(tested) ? tested['testedWith'] : undefined
  const bus = isObject(testedWith) ? testedWith['bus'] : undefined
  if (!Array.isArray(bus) || !bus.every((one) => isObject(one) && typeof one['entry'] === 'string')) {
    throw new Error(`Merge entry ${record.id} names a bus in tested.testedWith.bus that is not the list of {entry} the state machine writes.`)
  }
  return bus.map((one) => (one as { entry: string }).entry)
}

/** The entries a tested step's bus passed over because they would need a check, in the lane's order; none when it names none. */
function passedForACheckBy(record: PanelRecord): string[] {
  const tested = record.data['tested']
  const testedWith = isObject(tested) ? tested['testedWith'] : undefined
  const ids = isObject(testedWith) ? testedWith['passedForACheck'] : undefined
  if (ids === undefined) return []
  if (!Array.isArray(ids) || !ids.every((one) => typeof one === 'string')) {
    throw new Error(`Merge entry ${record.id} names in tested.testedWith.passedForACheck something that is not the list of ids the state machine writes.`)
  }
  return ids as string[]
}

/** The entries a tested step's bus passed over because they are tested alone, in the lane's order; none when it names none. */
function passedAloneBy(record: PanelRecord): string[] {
  const tested = record.data['tested']
  const testedWith = isObject(tested) ? tested['testedWith'] : undefined
  const ids = isObject(testedWith) ? testedWith['passedAlone'] : undefined
  if (ids === undefined) return []
  if (!Array.isArray(ids) || !ids.every((one) => typeof one === 'string')) {
    throw new Error(`Merge entry ${record.id} names in tested.testedWith.passedAlone something that is not the list of ids the state machine writes.`)
  }
  return ids as string[]
}

/**
 * WHEN EACH ENTRY'S `<bag>.<leaf>` WAS WRITTEN, as the `append_order` of the change row that wrote it, read in one query
 * for all of `ids`. Two stamps are ordered this way: the mark for the merge tool (`toolWanted.since`) and a tested step's
 * time (`tested.at`). Each is local wall-clock time to the second, so it cannot order two writes in one second, and in the
 * hour the clocks go back a later write carries an earlier stamp. The changes table is only appended to, so its
 * `append_order` is the order the writes were made in. The rows of an entry that change the stamp are read oldest first:
 *
 *   data.<bag>         the object written where there was none, or taken off (no value).
 *   data.<bag>.<leaf>  the stamp written over another; its value is the stamp.
 *   data               the whole bag written at once, counted only when the stamp in it differs from the one before.
 *
 * The answer for an entry and its current stamp is the row that wrote the stamp the last of those rows left, when that
 * stamp is the current one. Otherwise it is null: nobody recorded when the stamp it holds now was written, which says
 * nothing about whether it was written first. That includes an entry still holding the stamp it was created with,
 * since its create row records the title and not the data.
 */
function theWrittenOrder(ids: string[], bag: 'toolWanted' | 'tested', leaf: 'since' | 'at'): (id: string, stamp: string) => number | null {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return () => null
  const rows = sqlite
    .prepare(
      `SELECT record_id AS id, field, old_value AS oldValue, new_value AS newValue, append_order AS seq FROM changes ` +
        `WHERE record_id IN (${unique.map(() => '?').join(', ')}) ` +
        "AND op = 'update' AND field IN ('data', ?, ?) ORDER BY append_order",
    )
    .all(...unique, `data.${bag}`, `data.${bag}.${leaf}`) as { id: string; field: string; oldValue: string | null; newValue: string | null; seq: number | null }[]
  // A row that cannot be read leaves the stamp unknown from there on, so the answer is null.
  const unreadable = Symbol('unreadable')
  const parsed = (text: string | null): unknown => {
    if (text === null) return null
    try {
      return JSON.parse(text) as unknown
    } catch {
      return unreadable
    }
  }
  const leafIn = (value: unknown): unknown => (isObject(value) ? value[leaf] : undefined)
  const stampIn = (data: unknown): unknown => (isObject(data) ? leafIn(data[bag]) : undefined)
  /** The stamp a row left, null for none, or undefined when the row did not change the stamp. */
  const leaves = (row: (typeof rows)[number]): unknown => {
    if (row.field === `data.${bag}`) {
      const value = parsed(row.newValue)
      return value === null || value === unreadable ? value : (leafIn(value) ?? unreadable)
    }
    if (row.field === `data.${bag}.${leaf}`) return row.newValue
    const [old, now] = [parsed(row.oldValue), parsed(row.newValue)]
    if (old === unreadable || now === unreadable) return unreadable
    const before = stampIn(old)
    const after = stampIn(now)
    return after === before ? undefined : (after ?? null)
  }
  return (id, stamp) => {
    let last: { stamp: unknown; seq: number | null } | null = null
    for (const row of rows) {
      if (row.id !== id) continue
      const left = leaves(row)
      if (left !== undefined) last = { stamp: left, seq: row.seq }
    }
    return last !== null && last.stamp === stamp ? last.seq : null
  }
}

/**
 * THE NEWEST BUS OF EACH LANE ASKED, in any project: the id of the entry whose tested step names a bus and was written
 * last, or null when nobody can tell which that is. A lane with no bus is not in the answer. Only the newest bus orders
 * a lane (`aRiderGoesFirst`), and the queue page draws it (`theNewestBuses` in ./merge-queue-page.ts); both read it here.
 *
 * A LANE'S BUSES ARE ORDERED BY THE CHANGE ROW THAT WROTE EACH ONE'S `tested.at` (`theWrittenOrder`), not by the stamp.
 * The stamp is local time, which repeats an hour when the clocks go back: a bus tested at 01:10 GMT would sort below
 * one tested at 01:50 BST that night, and the older bus would be taken for the newest. The tested step writes through
 * a patch, so every bus the queue tested has its row. A lane with one bus needs no order. When a lane has more and one
 * of them has no row, which is the newest is unknown: the lane's answer is null, and a warning names the entries.
 */
export function theNewestBusOfEachLane(lanes: readonly string[]): Map<string, string | null> {
  const found = new Map<string, string | null>()
  if (lanes.length === 0) return found
  const drivers = sqlite
    .prepare(
      "SELECT id, json_extract(data, '$.changeset.root') AS root, json_extract(data, '$.documents') IS NOT NULL AS documents, " +
        "json_extract(data, '$.tested.at') AS at FROM records " +
        "WHERE kind = ? AND deleted_at IS NULL AND json_extract(data, '$.tested.testedWith.bus') IS NOT NULL",
    )
    .all(MERGE_ENTRY_KIND) as { id: string; root: unknown; documents: number; at: unknown }[]
  const byLane = new Map<string, { id: string; at: unknown }[]>()
  for (const driver of drivers) {
    if (typeof driver.root !== 'string') throw new Error(`Merge entry ${driver.id} does not hold what the merge queue writes: it holds no changeset.`)
    const lane = laneOf({ root: driver.root }, driver.documents === 1 ? true : null)
    if (lanes.includes(lane)) byLane.set(lane, [...(byLane.get(lane) ?? []), driver])
  }
  const written = theWrittenOrder(
    [...byLane.values()].filter((buses) => buses.length > 1).flatMap((buses) => buses.map((one) => one.id)),
    'tested',
    'at',
  )
  for (const [lane, buses] of byLane) {
    if (buses.length === 1) {
      found.set(lane, buses[0]!.id)
      continue
    }
    const order = buses.map((one) => ({ id: one.id, seq: typeof one.at === 'string' ? written(one.id, one.at) : null }))
    const unknown = order.filter((one) => one.seq === null).map((one) => one.id)
    if (unknown.length > 0) {
      console.warn(
        `The lane ${lane} has ${String(buses.length)} buses, and no change row says when merge entry ${unknown.join(' or merge entry ')} was tested, ` +
          `so which bus is the lane's newest is unknown. No entry in the lane is held behind a bus's riders or the entries it passed over, ` +
          `and the queue page draws no bus for the lane.`,
      )
      found.set(lane, null)
      continue
    }
    found.set(lane, order.reduce((newest, one) => (one.seq! > newest.seq! ? one : newest)).id)
  }
  return found
}

/** Who goes ahead of an entry, from the lane's newest bus: one of its riders, or one it passed over for a check or as tested alone. */
interface GoesFirst {
  first: string
  driver: string
  /**
   * 'rode': `first` rode the bus and this entry did not. 'needsACheck': the bus passed `first` over for a check.
   * 'alone': the bus passed `first` over because it is tested alone.
   */
  because: 'rode' | 'needsACheck' | 'alone'
}

/**
 * WHO TAKES THE LANE BEFORE THIS ENTRY, FROM THE LANE'S NEWEST BUS, or null (wave 13p rounds 23 and 27). The merge
 * tool lets an entry ride past one that cannot board (`aBusFor` in tools/merge-tool/pairs.mjs). The bus tested each
 * rider on a tree without the one passed over, and a rider borrows that result only on exactly that tree, so the
 * riders take the lane before the entries that did not ride. The newest bus is the entry of the lane whose tested
 * step names a bus and was written last (`theNewestBusOfEachLane`); only it orders the lane, so two buses cannot each
 * hold the other's riders. When nobody can tell which bus is the newest, no entry is held here.
 * Its driver is never held. An entry goes first only while it is judged, holds the tool's mark and no delete of it
 * waits for a secretary, so one that cannot be handed on holds nobody.
 *
 * AN ENTRY THE BUS PASSED OVER BECAUSE IT WOULD NEED A CHECK (`passedForACheck`, round 27, the coordinator's JCLX21aDWs4p) takes
 * the lane ahead of every rider marked for the merge tool after it, and ahead of every entry that did not ride, so
 * its check starts at once and the next bus cannot pass it over again. A rider marked before it still goes first.
 * Riders are not held behind each other, as before.
 *
 * AN ENTRY THE BUS PASSED OVER BECAUSE IT IS TESTED ALONE (`passedAlone`, problem gYWdWJQcxyuZ) is placed the same way.
 * No bus ever seats one: a plugin-only change, one naming its own suite workers, one changing the queue's own code, or
 * one adding a migration behind the bus's newest. While riders marked after it went first, each new bus passed it over
 * again, and merge entry mSzWWkTIDzIu waited from 12:04 to 17:13 on 15 October 2026. Now the entries it waits for are
 * the ones marked before it, which is a set that only gets smaller, so its wait has an end. Of the entries a bus passed
 * over, one marked before another goes first, whichever list names it.
 *
 * The order only decides whether a rider borrows the bus's result: a rider that lands after one passed over runs its
 * own suite on its own tree, as an entry that rode no bus does.
 *
 * TWO MARKS ARE ORDERED BY THE CHANGE ROW THAT WROTE EACH, never by their stamps (`theWrittenOrder`). A mark is stamped
 * in local time to the second, so two entries marked in one second carry the same `since`, and in the hour the clocks
 * go back an entry marked at 01:10 GMT carries a stamp before one marked at 01:50 BST. The changes table is only
 * appended to, so its `append_order` is the order the marks were written in. When a row cannot be found for one of
 * the two, neither is held behind the other, the merge tool takes them in the order they were submitted, and a
 * warning says so.
 */
function aRiderGoesFirst(entry: MergeEntryReading): GoesFirst | null {
  const newest = theNewestBusOfEachLane([entry.lane]).get(entry.lane) ?? null
  if (newest === null || newest === entry.id) return null
  const driver = getRecord(newest)
  if (driver === null) return null
  /** The entry `id` when it may be handed on in this entry's lane, with the time it was marked; otherwise null. */
  const handedOn = (id: string): { since: string } | null => {
    const record = getRecord(id)
    if (record === null || record.kind !== MERGE_ENTRY_KIND) return null
    const reading = readMergeEntry(record)
    return reading.state === 'judged' && reading.lane === entry.lane && reading.toolWanted !== null && unconfirmedDeletes(reading.machine) === 0 && !owesAPress(reading)
      ? reading.toolWanted
      : null
  }
  const bus = theBusOf(driver)
  const forACheck = passedForACheckBy(driver)
  const alone = passedAloneBy(driver)
  const since = entry.toolWanted?.since ?? null
  // READ ONCE FOR THIS LOOK, and only when two marks are compared.
  let written: ((id: string, since: string) => number | null) | null = null
  const markedBefore = (id: string, other: { since: string } | null): boolean => {
    if (other === null) return false
    if (since === null) return true
    written ??= theWrittenOrder([entry.id, ...bus, ...forACheck, ...alone], 'toolWanted', 'since')
    const theirs = written(id, other.since)
    const ours = written(entry.id, since)
    if (theirs !== null && ours !== null) return theirs < ours
    const missing = [theirs === null ? id : null, ours === null ? entry.id : null].filter((one) => one !== null).join(' and merge entry ')
    console.warn(
      `Merge entries ${id} and ${entry.id} in the lane ${entry.lane} are both marked for the merge tool, and no change row ` +
        `says when the mark on merge entry ${missing} was written, so which mark came first is unknown. Neither is held behind the other; ` +
        `the merge tool takes them in the order they were submitted.`,
    )
    return false
  }
  if (bus.includes(entry.id)) {
    const first = forACheck.find((id) => markedBefore(id, handedOn(id)))
    if (first !== undefined) return { first, driver: newest, because: 'needsACheck' }
    const lone = alone.find((id) => markedBefore(id, handedOn(id)))
    return lone === undefined ? null : { first: lone, driver: newest, because: 'alone' }
  }
  if (forACheck.includes(entry.id) || alone.includes(entry.id)) {
    const before = (id: string): boolean => id !== entry.id && markedBefore(id, handedOn(id))
    const ahead = forACheck.find(before)
    if (ahead !== undefined) return { first: ahead, driver: newest, because: 'needsACheck' }
    const lone = alone.find(before)
    if (lone !== undefined) return { first: lone, driver: newest, because: 'alone' }
    const rider = bus.find(before)
    return rider === undefined ? null : { first: rider, driver: newest, because: 'rode' }
  }
  const ahead = forACheck.find((id) => handedOn(id) !== null)
  if (ahead !== undefined) return { first: ahead, driver: newest, because: 'needsACheck' }
  const lone = alone.find((id) => handedOn(id) !== null)
  if (lone !== undefined) return { first: lone, driver: newest, because: 'alone' }
  const rider = bus.find((id) => handedOn(id) !== null)
  return rider === undefined ? null : { first: rider, driver: newest, because: 'rode' }
}

/**
 * WHY A MERGE TOOL RUN STILL GOING FOR THIS ENTRY SHOULD BE STOPPED NOW, or null because it should not.
 *
 * Only an entry somebody else took out of the queue while its tool was running: withdrawn by its
 * submitter or the person, or superseded by a newer submission. Its tool has nothing left to do, and a
 * tool left running would keep the office's one merge slot, and the machine's suite lock if it holds
 * it, for nothing. An entry the tool itself finished — merged or bounced — is not stopped from outside:
 * the tool ends on its own after reporting, and a signal would cut off what it prints last.
 */
export function whyItsMergeToolShouldStop(entry: MergeEntryReading): string | null {
  if (entry.state === 'withdrawn') {
    const who = entry.withdrawn?.by ?? null
    // AN AGENT IS NAMED BY ITS HANDLE, which is what a person reads it as; its registry id when it has none.
    const registered = who === null ? null : readParticipant(who)
    const name = who === null ? '' : registered !== null && 'handle' in registered ? registered.handle : who.id
    const by = who === null ? 'somebody' : `the ${participantWord(who.kind)} ${name}`
    const because = entry.withdrawn === null ? '' : ` (${entry.withdrawn.because})`
    return `Merge entry ${entry.id} was withdrawn by ${by}${because}, so its merge tool had nothing left to do and the office stopped it by its process group.`
  }
  if (entry.state === 'superseded') {
    return `Merge entry ${entry.id} was superseded${entry.supersededBy === null ? '' : ` by ${entry.supersededBy}`}, so its merge tool had nothing left to do and the office stopped it by its process group.`
  }
  return null
}

/** Whether a tool run recorded on an entry has ended: it has a stamp for its end. */
function hasEnded(tool: NonNullable<StoredEntry['tool']>): boolean {
  return typeof tool.endedAt === 'string'
}

/** The message worker's merge tool session for this project, or a refusal. */
function theMergeToolRun(session: string, workspaceId: string): PanelRecord {
  const tool = getRecord(session)
  if (tool === null || tool.workspaceId !== workspaceId || tool.kind !== 'session' || tool.data['runtime'] !== MERGE_TOOL_RUNTIME) {
    throw new PanelError(`${session} is not a run of the office's merge tool in this project: that is a session whose runtime is ${MERGE_TOOL_RUNTIME}. Nothing was written.`, 409)
  }
  return tool
}

/**
 * THE PROCESS ROW A TOOL RUN THE OFFICE STARTED IS FOLLOWED BY, or undefined because there is none.
 *
 * The worker registers the tool's own process under the run's session with `startedByTheProduct: true`
 * (`startOne` and `startTheMergeTool` in src/worker/index.ts). The tool's own commands register rows
 * under the same session too: `tools/sandbox.mjs exec --session <run>` files one for each build, suite
 * and rerun, with `startedByTheProduct` left out. So the row is chosen by that flag, never by order.
 * On 25 September 2026 the newest live row of merge tool run W_b7Dour1ayt was its suite's, a worker
 * that picked the run up followed the suite, and it closed the run as crashed when the suite ended
 * while the tool was still running (finding 80).
 *
 * The live row first, and the released one when there is none, because a restart releases the rows
 * of processes it finds gone and the released row still names the process.
 *
 * One reader for the check tool and every run the message worker started (`runsToPickUp`), the merge
 * tool (`mergesForTheWorker`), and, through `theLastToolRunStillRuns` below, the merge entry's refusal
 * of a second tool (`recordMergeToolStarted`) and the three readers of whether a run the office started
 * is still going (`runServing`, `whyThisRunWasCutOff` and `workerRuns` in src/server/lib/worker.ts).
 * A run started with `tools/sandbox.mjs exec` registers its own process without the mark, so
 * `runServing` reads such a run by any live row instead.
 */
export function theToolsOwnProcessRow(workspaceId: string, session: string): ResourceReport | undefined {
  const own = listResources(theToolsOwnRows(workspaceId, session)).filter(
    (row) => row.type === 'process' && row.startedByTheProduct === true,
  )
  return own.find((row) => row.releasedAt === null) ?? own[0]
}

/** The processes `theToolsOwnProcessRow` reads, for `readFirst` in lib/resources.ts. */
export function theProcessesAToolsOwnRowReads(workspaceId: string, session: string): AProcessToRead[] {
  return theProcessesAListingReads(theToolsOwnRows(workspaceId, session))
}

/** The rows `theToolsOwnProcessRow` lists: every row of the session, released rows included. */
function theToolsOwnRows(workspaceId: string, session: string): Parameters<typeof listResources>[0] {
  return { workspaceId, sessionRecordId: session, includeReleased: true }
}

/**
 * WHAT THE LAST TOOL RUN'S OWN PROCESS ROW READS NOW: running, not running, or not known.
 *
 * Asked of the ledger's own reading, which compares the start time it wrote down, so a pid given to
 * another program since reads as gone. It is the reading a release of the row takes too (`livenessOf` in
 * lib/resources.ts), so the list of runs a pause would pause and the release cannot say two things of one
 * row. A released row is not asked: a restart releases only rows whose process it found gone, and a
 * person's release stops the group. A run with no row of its own is not running, as before.
 *
 * `not known` is not a polite way of saying gone. On Windows it is what a row reads when its starter has
 * ended and the starter's Job Object cannot be read, and the program may still run. The list of runs a
 * pause would pause (`theLiveRuns` in lib/pausing.ts) and the pause itself (`pauseTheRunsAtWork`) read all
 * three states. Every other reader asks `theLastToolRunStillRuns` below.
 */
export type ALastToolRunsReading =
  | { state: 'running'; row: ResourceReport; running: string }
  | { state: 'not known'; row: ResourceReport; reason: string }
  | { state: 'not running' }

export function theLastToolRunsReading(workspaceId: string, tool: { session: string } | null): ALastToolRunsReading {
  if (tool === null) return { state: 'not running' }
  const own = theToolsOwnProcessRow(workspaceId, tool.session)
  if (own === undefined || own.releasedAt !== null || own.liveness.state === 'gone') return { state: 'not running' }
  if (own.liveness.state === 'unknown') return { state: 'not known', row: own, reason: own.liveness.reason }
  return { state: 'running', row: own, running: own.liveness.detail }
}

/**
 * THE LAST TOOL RUN'S OWN PROCESS ROW, WHILE THAT PROCESS IS STILL RUNNING, or null because it is not
 * read running. A row whose reading cannot tell answers null here, as it always has.
 *
 * Read from `theLastToolRunsReading` above. `mergesForTheWorker` in src/server/lib/worker.ts leaves the
 * entry off its `wanted` list, and `recordMergeToolStarted` below refuses a start that gets past that
 * list. `theRunRowServing`, `whyThisRunWasCutOff` and `theRunsInFlight` in src/server/lib/worker.ts, and
 * `aStartersLetterToAnEndedWorker` and `checkpointPage` in src/server/lib/worker-delivery/letters.ts, ask
 * it whether a run the office started is still going.
 */
export function theLastToolRunStillRuns(workspaceId: string, tool: { session: string } | null): { row: ResourceReport; running: string } | null {
  const reading = theLastToolRunsReading(workspaceId, tool)
  return reading.state === 'running' ? { row: reading.row, running: reading.running } : null
}

/** The office started the merge tool for this entry. One tool run owns an entry until it ends. */
export function recordMergeToolStarted(input: { workspaceId: string; id: string; session: string; log: string; actor: Actor; onAlreadyStored?: () => void }): MergeEntryReading {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = entryOf(record)
  theMergeToolRun(input.session, input.workspaceId)
  if (MERGE_STATE_SPECS[entry.state].final) {
    throw new PanelError(`Merge entry ${input.id} is ${stateWord(entry.state).text}, which is final, so no merge tool runs for it. Nothing was written.`, 409)
  }
  if (entry.tool !== null && entry.tool.session === input.session) {
    input.onAlreadyStored?.()
    return readMergeEntry(record)
  }
  if (entry.tool !== null && !hasEnded(entry.tool)) {
    throw new PanelError(`The merge tool run ${entry.tool.session} still owns merge entry ${input.id}: it has not ended. Nothing was written.`, 409)
  }
  // THE LAST RUN'S OWN PROCESS MUST HAVE ENDED TOO, even when the entry records the run as ended: a
  // worker that followed the wrong process row wrote exactly that ending while the tool was still
  // running, and the second tool it started took the first one's sandbox away (finding 80).
  const alive = theLastToolRunStillRuns(input.workspaceId, entry.tool)
  if (entry.tool !== null && alive !== null) {
    throw new PanelError(
      `Merge entry ${input.id} records merge tool run ${entry.tool.session} as ended, but its own process, pid ${alive.row.key}, is still running ` +
        `(${alive.running}), so a second merge tool was not started beside it. Nothing was written. ` +
        `Wait for that process to end, or stop it from its ledger row ${alive.row.id}, and the entry can take a new run.`,
      409,
    )
  }
  // THE WHOLE OBJECT IS REPLACED, so an ending of the tool run before cannot stay on this one: a
  // merge patch keeps every key it is not told to drop, and the old keys are dropped by name.
  const started = { session: input.session, log: input.log, startedAt: nowStamp() }
  const tool = entry.tool === null ? started : { ...Object.fromEntries(Object.keys(entry.tool).map((key) => [key, null])), ...started }
  // THE START TAKES THE MARK, in the same write, so no second run is started for the same arrival.
  const dataPatch: Record<string, unknown> = { tool, ...(entry.toolWanted === null ? {} : { toolWanted: null }) }
  return readMergeEntry(asTheMergeQueue(() => patchRecord(input.id, { dataPatch }, input.actor)).record)
}

/**
 * The merge tool run for this entry ended. Recorded whatever state the entry is in, because the tool
 * ending is a fact either way; what follows from it is the state machine's to decide.
 */
export function recordMergeToolEnded(input: { workspaceId: string; id: string; session: string; reason: string; actor: Actor }): MergeEntryReading {
  const record = theMergeEntry(input.id, input.workspaceId)
  const entry = entryOf(record)
  if (entry.tool === null || entry.tool.session !== input.session) {
    throw new PanelError(`The merge tool run ${input.session} was not recorded as started for merge entry ${input.id}. Nothing was written.`, 409)
  }
  if (hasEnded(entry.tool)) return readMergeEntry(record)
  const tool = { endedAt: nowStamp(), reason: input.reason }
  return readMergeEntry(asTheMergeQueue(() => patchRecord(input.id, { dataPatch: { tool } }, input.actor)).record)
}
