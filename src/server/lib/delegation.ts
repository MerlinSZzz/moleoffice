// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { z } from 'zod'
/**
 * PACKAGES: WHO IS RESPONSIBLE FOR ONE, AND THE ROW THE DELEGATION COLUMN DRAWS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16 points 7 and 8. A task can be packaged (its `package` field carries a context
 * bundle and the words for an outside reader), taken by an agent or a person, returned from outside
 * and confirmed. This file answers two questions about that, and nothing else in the product
 * answers either:
 *
 *   1. WHO IS RESPONSIBLE for a task, and the sentence saying how that was worked out. The secretary's
 *      ruling, and the owner's to reopen.
 *
 *   2. THE ROWS the delegation column is drawn from. The column is a reading of the records — the
 *      task's own package field, the live claims on it, the export list on its bundle, its returns
 *      and its completion — and there is no second store behind it. Criterion F16 point 8.
 *
 * The packaging act itself lives here too, because it is one transaction over three writes and a
 * route should not be the place that knows the order of them.
 */

import { and, eq, sql } from 'drizzle-orm'
import { existsSync } from 'node:fs'
import { db, sqlite } from '../db/client.ts'
import { changes, records } from '../db/schema.ts'
import { nowStamp } from '@shared/time.ts'
import {
  PACKAGE_SUIT_WORDS,
  actorTypeWord,
  kindWord,
  packageSuitWord,
} from '@shared/words.ts'
import { THE_PERSON } from '@shared/person.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import type { PanelRecord } from '@shared/types.ts'
import {
  aRaiseCarriesIt,
  assertThePersonIsProved,
  createLink,
  createRecord,
  getRecord,
  getRecordsWithIds,
  listRecords,
  listRecordsWithDataAs,
  onlyTheseFieldsOf,
  patchRecord,
  recordInWorkspace,
  ACROSS_WORKSPACES,
  type Actor,
} from './records.ts'
import { PanelError } from './panel-error.ts'
import { A_PACKAGE_NEEDS_A_MODULE, theLastRequirementsUpdate, UPDATE_MODULE_REQUIREMENTS_FIRST } from './module-requirements.ts'
import { liveClaimsForColumn } from './claims.ts'
import { gatePosition } from '../../config/settings.mjs'
import { gateMet, gateMetAgainOnceTheWriteIsTakenBack } from './gate-counts.ts'
import { anAgentItsOwnKeyProves, refusedWhileTheGateIsOff } from './who-may-act.ts'
import { type AStarter, type RegisteredAgent } from './participants.ts'
import { participantForActor, theActorsReadOnce } from './participant-for-actor.ts'
import { theChainUpWith } from '@shared/the-chain-up-with.ts'
import { theStarterEachStringNames } from './the-starter-each-string-names.ts'
import { agentByHandle } from '../db/agent-by-handle.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { packageInspectionOf } from '@shared/workspaces.ts'
import { readParticipant } from '../db/read-participant.ts'
import { theOneAgentAStringNames } from './agent-references.ts'
import { theInspectorCardHeldBy, theInspectorOfTheRun, theNameAPersonReads, whoHoldsTheSecretaryCard, writeAMessage } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import type { AnotherNoticeKind, NoticeKind } from './notices.ts'
import { aJudgedPoint } from '@shared/the-verdict-door.ts'
import { MAP_COLUMNS, statedFor, toStated } from '../db/stated-for.ts'
import type { MapRow, StatedRelationship } from './implementation.ts'
import { listParticipants } from '../db/list-participants.ts'
import { theAgentAStoredReferenceNamesIn } from './the-agent-a-stored-reference-names-in.ts'
import { RECORD_KINDS_THAT_OWN_CODE } from '@shared/record-kinds-that-own-code.ts'
import { BUNDLE_PRESET_NAMES } from '@shared/bundles.ts'
import { writeASystemLineToOne } from './groups.ts'
import { SYSTEM_LINES } from '@shared/groups.ts'
import { BLOCK_KIND } from '@shared/blocks.ts'
import { sayInEnglish } from '@shared/i18n.ts'
// WHERE A RETURNED PICTURE AND A RETURNED ZIP ACTUALLY LAND, so the return door can tell a path one
// of those doors handed back from a path somebody made up. Both are read from the doors themselves
// rather than restated here: the directory a door writes into IS what "a path it produced" means.
import { inside } from '@shared/path-inside.ts'
import { messagePictureDirectory } from './messagepictures.ts'
import { returnedFileDirectory } from './returnedfiles.ts'
import {
  NOTHING_WAS_BROUGHT_BACK,
  NO_MODULE_IS_NAMED,
  PACKAGE_SUITS,
  PACKAGE_OLD_CHECK_JUDGMENTS,
  THE_PERSON_MAY_ALWAYS_CONFIRM,
  isPackageSuit,
  packageStateOf,
  thePackageFilesSentence,
  type DelegationRow,
  type PackageModuleFiles,
  type PackageState,
  type PackageSuit,
  type ReturnForm,
  type PackageParent, type PackageMaterial, type InsideTake, type PackageRestatement, type PackageAlignmentAnswer, type PackagePointOutcome, type PackageHandback, type PackageCheck, type PackageCheckPoint,
  type PackageAcceptance, type PackageAcceptedPoint, type PackageActs,
  type PackagePlanShape, type PlanHint, type StoredPlan,
  PLAN_HINT_CODES, PLAN_HINT_WORD_KEYS, readAStoredPlan,
  theAlignmentOf, theAnswerToTheNewest, theNextOrderOf,
} from '@shared/delegation.ts'
import { thePlansHints } from './package-plan-hints.ts'

// ============================================================================ who is responsible

/** Who answers for a task, and the sentence saying how that was worked out. */
export interface Responsibility {
  /** The responsible participant, or null when the change log cannot say. */
  who: ParticipantRef | null
  /** One sentence, in the reader's words, naming which rule answered. */
  why: string
}

const THE_PERSON_REF: ParticipantRef = { kind: 'person', id: THE_PERSON }

/** One line of the change log that filed this record, or null because there is none. */
function theCreateRow(recordId: string): { actorType: string; actorId: string; sessionId: string | null } | null {
  const row = db
    .select({ actorType: changes.actorType, actorId: changes.actorId, sessionId: changes.sessionId })
    .from(changes)
    .where(and(eq(changes.recordId, recordId), eq(changes.op, 'create')))
    .orderBy(changes.at)
    .get()
  return row ?? null
}

/**
 * THE REGISTRY ROW A LIVE AGENT ANSWERS TO, read with the stored reader the caller made, or null.
 *
 * THE STORED READER'S THREE-WAY RULE. An EXACT ID first, and it settles it alone, because an id is
 * never reused; failing that, the ONE agent bearing the string as a handle; and NONE where more than
 * one bears it, because picking one of two would name the wrong agent in silence. It used to be
 * `one.id === handle || one.handle === handle`, which takes whichever row the scan reaches first and
 * answers with an agent the string does not surely name. Until wave 13u round 43 this rule was done
 * here a second time, over every agent read into memory; the caller now hands it the reader of the
 * rows each string names (`theStarterEachStringNames`), and the row it names is read by its id.
 *
 * A RETIRED ROW IS NOT LIVE and returns null either way: this function's callers ask who answers for
 * the work now.
 */
function aLiveAgent(handle: string, theAgentThisNames: (id: string) => AStarter | null): RegisteredAgent | null {
  const named = theAgentThisNames(handle)
  if (named === null) return null
  const row = readParticipant({ kind: 'agent', id: named.id }) as RegisteredAgent | null
  return row === null || row.retired === true ? null : row
}

/**
 * WHO IS RESPONSIBLE FOR ONE TASK, AND HOW THAT WAS WORKED OUT. Criterion F16 point 8.
 *
 * THE RULE, which is the coordinator's ruling and is the owner's to reopen:
 *
 *   1. THE CREATOR. There is no creator field: `ownerId` is always the installation's owner. The
 *      author is the `changes` row with `op = 'create'`, which carries the actor and the session.
 *   2. If the creator is the person, the person is responsible.
 *   3. If the creator is an agent that is still live, that agent is responsible.
 *   4. If the creator is an agent that has retired or whose record is gone, walk up its starter
 *      chain to the first live agent, and that one is responsible.
 *   5. If the chain reaches no live agent, the secretary is responsible.
 *   6. The person may always confirm, whoever else is responsible.
 *
 * AN UNKNOWN ANSWER IS A REAL ANSWER. When the change log has no create row this says so rather
 * than guessing, and `who` is null. The sentence names which of the rules answered every time.
 *
 * THE CHAIN WALK IS THE ONE THAT ALREADY EXISTS, `theChainUpWith`, with its own cycle guard, so
 * this file does not hold a second copy of it. It reads the rows each string on the chain names, not
 * every agent; the secretary of rule 5 is still found among every agent (`whoHoldsTheSecretaryCard`).
 */
interface ResponsibilityReaders {
  create: ReturnType<typeof theCreateRow>
  agent: (id: string) => RegisteredAgent | null
  secretary: () => RegisteredAgent | null
}

export function responsibleFor(recordId: string, readers?: ResponsibilityReaders): Responsibility {
  const create = readers === undefined ? theCreateRow(recordId) : readers.create
  const personNote = ` ${THE_PERSON_MAY_ALWAYS_CONFIRM}`

  if (create === null) {
    return {
      who: null,
      why:
        'The change log has no create row for this task, so its creator is not recorded. Mole Office names no ' +
        'responsible person or agent rather than guess.' + personNote,
    }
  }

  if (create.actorType === 'human') {
    return {
      who: { kind: 'person', id: create.actorId },
      why:
        `The person "${create.actorId}" created this task, so the person is responsible for it to the end ` +
        `(rule 2).` + personNote,
    }
  }

  if (create.actorType === 'agent') {
    const theAgentThisNames = readers?.agent ?? theStarterEachStringNames()
    const live = readers === undefined ? (id: string) => aLiveAgent(id, theAgentThisNames) : (id: string) => {
      const agent = readers.agent(id)
      return agent === null || agent.retired === true ? null : agent
    }
    const creator = live(create.actorId)
    if (creator !== null) {
      return {
        who: { kind: 'agent', id: creator.id },
        why:
          `The agent "${creator.handle}" created this task and is still live, so it is responsible for it to ` +
          `the end (rule 3).` + personNote,
      }
    }

    // RULE 4. The creator is retired or its registry row is gone, so responsibility walks up the
    // starter chain. `theChainUpWith` includes the creator itself and stops honestly at a loop, a
    // missing row, or a row whose starter nobody recorded.
    const chain = theChainUpWith({ kind: 'agent', id: create.actorId }, theAgentThisNames)
    const above = chain.chain
      .map((at) => (at.kind === 'agent' ? live(at.id) : null))
      .find((row) => row !== null)
    if (above !== undefined && above !== null) {
      return {
        who: { kind: 'agent', id: above.id },
        why:
          `The agent "${create.actorId}" created this task and is retired or gone, so responsibility passes ` +
          `up its starter chain to "${above.handle}", the first live agent above it (rule 4).` + personNote,
      }
    }

    // RULE 5.
    const secretary = readers === undefined ? whoHoldsTheSecretaryCard() : readers.secretary()
    if (secretary !== null) {
      return {
        who: { kind: 'agent', id: secretary.id },
        why:
          `The agent "${create.actorId}" created this task and the chain of starters above it reaches no live ` +
          `agent, so the secretary "${secretary.handle}" is responsible (rule 5).` + personNote,
      }
    }
    return {
      who: null,
      why:
        `The agent "${create.actorId}" created this task, the chain of starters above it reaches no live agent, ` +
        `and no agent holds the secretary card today, so no agent answers for it (rule 5, with no secretary to ` +
        `fall to).` + personNote,
    }
  }

  // THE CREATOR IS NEITHER THE PERSON NOR AN AGENT. A `system` write is the office's own hand, and
  // the honest answer is the same one rule 5 gives when the chain reaches nobody: the secretary.
  const secretary = readers === undefined ? whoHoldsTheSecretaryCard() : readers.secretary()
  if (secretary !== null) {
    return {
      who: { kind: 'agent', id: secretary.id },
      why:
        `The create row names a ${actorTypeWord(create.actorType).text} write ("${create.actorId}"), which is ` +
        `neither the person nor an agent, so the secretary "${secretary.handle}" is responsible (rule 5).` +
        personNote,
    }
  }
  return {
    who: null,
    why:
      `The create row names a ${actorTypeWord(create.actorType).text} write ("${create.actorId}"), which is ` +
      'neither the person nor an agent, and no agent holds the secretary card today, so no agent answers for it.' +
      personNote,
  }
}

// ============================================================================ reading a stored package

/** The package a task carries, as the door stored it. */
export interface StoredPackage {
  bundleId: string
  forTheOutside: string
  suits: PackageSuit
  /**
   * The modules the packager said the work is in. ABSENT when nobody named any, which is a real
   * answer — an empty list and a missing key mean the same, and nothing is inferred from elsewhere.
   */
  moduleIds: string[]
  acceptance: string
  acceptanceSource: { file: string; criterion: string; commit: string }
  parent?: PackageParent
  lines?: string[]
  pointIds?: string[]
  materials?: PackageMaterial[]
  takenInside?: InsideTake[]
  alignments?: PackageRestatement[]
  alignmentAnswers?: PackageAlignmentAnswer[]
  handedBack?: PackageHandback[]
  checks?: PackageCheck[]
  acceptances?: PackageAcceptance[]
  at: string
  by: { actorType: string; actorId: string }
}

/**
 * THE PACKAGE ON A TASK, READ BACK OUT OF ITS `data`.
 *
 * Returns null when the field is absent or is not an object, which is the ordinary answer for a task
 * nobody has packaged. A package that is present but unreadable is reported through `whyThePackageCannotBeRead`
 * instead, so the column can say so rather than dropping the task.
 */
const authorSchema = z.object({ actorType: z.enum(['human', 'agent', 'system']), actorId: z.string() })
const entrySchema = z.object({ by: authorSchema, at: z.string(), order: z.number().int().positive().optional() })
const pointSchema = z.object({ pointId: z.string(), outcome: z.enum(['done', 'part', 'not']), words: z.string() }).strict()
const anAcceptedPoint = z.object({ pointId: z.string(), answer: z.enum(['accepted', 'returned']), words: z.string().optional() }).strict()
const packageSchema = z.object({
  bundleId: z.string().refine(value => value.trim() !== ''), forTheOutside: z.string().refine(value => value.trim() !== ''),
  suits: z.enum(PACKAGE_SUITS).optional(), moduleIds: z.array(z.string()).optional(),
  acceptance: z.string().refine(value => value.trim() !== ''), acceptanceSource: z.object({ file: z.string(), criterion: z.string(), commit: z.string() }).optional(),
  parent: z.object({ kind: z.enum(['decision', 'task']), id: z.string() }).optional(),
  lines: z.array(z.string()).optional(), pointIds: z.array(z.string()).optional(),
  materials: z.array(z.object({ kind: z.enum(['decision', 'point', 'bundle', 'task']), ref: z.string(), says: z.string() })).optional(),
  takenInside: z.array(entrySchema).optional(),
  alignments: z.array(entrySchema.extend({
    restated: z.string(), plan: z.unknown(), goOnWhy: z.string().optional(),
    hints: z.array(z.object({ code: z.enum(PLAN_HINT_CODES), values: z.record(z.string(), z.union([z.string(), z.number()])) })).optional(),
  })).optional(),
  alignmentAnswers: z.array(entrySchema.extend({ answer: z.enum(['aligned', 'differs']), words: z.string() })).optional(),
  handedBack: z.array(entrySchema.extend({ points: z.array(pointSchema), run: z.string().optional() })).optional(),
  checks: z.array(entrySchema.extend({
    answer: z.enum(['holds', 'refused']), words: z.string(),
    run: z.string().optional(), points: z.array(aJudgedPoint.extend({ outcome: z.enum(['done', 'part', 'not']) }).strict().or(
      z.object({ pointId: z.string().min(1), judged: z.enum(PACKAGE_OLD_CHECK_JUDGMENTS), holds: z.boolean(), why: z.string().trim().min(1), outcome: z.enum(['done', 'part', 'not']) }).strict(),
    )).optional(),
  })).optional(),
  acceptances: z.array(entrySchema.extend({ points: z.array(anAcceptedPoint) })).optional(),
  at: z.string().refine(value => value.trim() !== ''), by: z.object({ actorType: z.string(), actorId: z.string() }),
}).passthrough()
export function packageOf(data: unknown): StoredPackage | null {
  const parsed = packageSchema.safeParse(asBag(data)['package'])
  if (!parsed.success) return null
  const pkg = parsed.data
  const inside = pkg.parent !== undefined || pkg.lines !== undefined || pkg.pointIds !== undefined || pkg.takenInside !== undefined || pkg.alignments !== undefined || pkg.alignmentAnswers !== undefined || pkg.handedBack !== undefined || pkg.checks !== undefined || pkg.acceptances !== undefined
  if (inside ? !pkg.parent || !pkg.lines?.length || !pkg.pointIds?.length : !pkg.suits || !pkg.acceptanceSource) return null
  // Only outside packages require these fields; inside packages never export them.
  return { ...pkg, moduleIds: pkg.moduleIds ?? [] } as StoredPackage
}

/** True when the task carries a `package` key at all, readable or not. */
export function hasAPackageKey(data: unknown): boolean {
  return Object.hasOwn(asBag(data), 'package')
}

/** A list stored under one key of a task's `data`, oldest first, with unreadable entries dropped. */
function listOf(data: unknown, key: string): Record<string, unknown>[] {
  const held = asBag(data)[key]
  if (!Array.isArray(held)) return []
  return held.filter((one): one is Record<string, unknown> => isBag(one))
}

/** One take, as the column reads it. */
interface StoredTake {
  who: string
  at: string
}

/** Every take on a task, oldest first. */
function takesOf(data: unknown): StoredTake[] {
  return listOf(data, 'takenOutside')
    .filter((one) => typeof one['who'] === 'string')
    .map((one) => ({ who: one['who'] as string, at: typeof one['at'] === 'string' ? one['at'] : '' }))
}

/** One return, as the column reads it. */
interface StoredReturn {
  at: string
  fromOutside: string
  form: string
}

/** Every return on a task, oldest first. */
function returnsOf(data: unknown): StoredReturn[] {
  return listOf(data, 'returns')
    .filter((one) => typeof one['at'] === 'string')
    .map((one) => ({
      at: one['at'] as string,
      fromOutside: typeof one['fromOutside'] === 'string' ? one['fromOutside'] : '',
      form: typeof one['form'] === 'string' ? one['form'] : '',
    }))
}

/** When the task was confirmed complete and by whom, or null. */
function completionOf(data: unknown): { at: string; by: { actorType: string; actorId: string } } | null {
  const held = asBag(data)['completed']
  if (!isBag(held) || typeof held['at'] !== 'string') return null
  const by = held['by']
  if (!isBag(by) || typeof by['actorType'] !== 'string' || typeof by['actorId'] !== 'string') return null
  return { at: held['at'], by: { actorType: by['actorType'], actorId: by['actorId'] } }
}

/** How many exports a bundle record lists. Anything unreadable contributes none. */
function exportsCountOf(data: unknown): number {
  const held = asBag(data)['exports']
  return Array.isArray(held) ? held.length : 0
}

/** The files a package's named modules carry, and the one sentence saying whose files they are. */
export interface ModuleFilesReading {
  modules: PackageModuleFiles[]
  namedModuleCount: number
  statedCodeFromModules: number
  modulesWithNoStatedCode: string[]
  filesSays: string
}

/**
 * THE FILES OF THE NAMED MODULES, read through `statedFor` of each one.
 *
 * THE ONLY READER OF A PACKAGE'S MODULES: the column, the packaging door and the outside export all
 * draw from this, and nothing else answers the question. An id that names nothing in this project —
 * deleted between packaging and this read, or written before the door refused one — is answered with
 * a null title and no stated code, and the sentence names it, because dropping it silently would
 * make the list the packager sent look like a list somebody tidied.
 */
export function filesOfModules(moduleIds: string[], workspaceId: string, reading?: {
  records: ReadonlyMap<string, PanelRecord>
  stated: ReadonlyMap<string, StatedRelationship[]>
}): ModuleFilesReading {
  const modules: PackageModuleFiles[] = []
  const modulesWithNoStatedCode: string[] = []
  for (const id of moduleIds) {
    const module = reading === undefined ? getRecord(id) : (reading.records.get(id) ?? null)
    const inThisProject = module !== null && module.workspaceId === workspaceId
    const stated = inThisProject ? (reading === undefined ? statedFor(id, workspaceId) : (reading.stated.get(id) ?? [])) : []
    for (const row of stated) {
      modules.push({
        recordId: id,
        title: module?.title ?? null,
        repositoryId: row.repositoryId,
        pattern: row.pattern,
        relation: row.relation,
        authority: row.authority,
      })
    }
    if (stated.length === 0) modulesWithNoStatedCode.push(inThisProject ? (module?.title ?? id) : id)
  }
  const namedModuleCount = moduleIds.length
  const statedCodeFromModules = modules.length
  return {
    modules,
    namedModuleCount,
    statedCodeFromModules,
    modulesWithNoStatedCode,
    filesSays: thePackageFilesSentence({ namedModuleCount, modulesWithNoStatedCode }),
  }
}

// ============================================================================ the row a package draws

/**
 * THE ONE SENTENCE A ROW NEEDS BEYOND ITS TAG AND FACTS: that no module is named.
 *
 * The title, the state word, the holder and the outside name are each drawn on the row already, so
 * the sentence no longer says them again. The whole sentence about the files is written once in
 * `thePackageFilesSentence` and carried by the row's own `filesSays` field; this one only says the
 * head of it. When modules are named the row needs no sentence, and the answer is null.
 */
function rowSentence(row: { namedModuleCount: number }): string | null {
  return row.namedModuleCount === 0 ? NO_MODULE_IS_NAMED : null
}

/** What one row of the column carries, plus the two facts that only the list reply needs. */
export interface DelegationReading {
  rows: DelegationRow[]
  /** A task whose `package` key is there but cannot be read, named rather than dropped. */
  couldNotRead: { recordId: string; title: string; because: string }[]
  workspaceId: string
}

/** What the progress read needs from a package, and nothing a delegation card carries. */
export interface DelegationProgressReading {
  rows: { state: PackageState; inside: { check: NonNullable<DelegationRow['inside']>['check'] } | null }[]
  couldNotRead: DelegationReading['couldNotRead']
  workspaceId: string
}

/**
 * EVERY PACKAGED TASK IN ONE PROJECT, newest package first. Criterion F16 point 8.
 *
 * READ FROM THE RECORDS AND NOTHING ELSE: the task's own `data`
 * gives its package, its takes, its returns and its completion, the live claims give who is
 * holding it, and the bundle record gives the export count. There is no table of delegation rows
 * and no cached state, so a take or a return shows up the moment it is written.
 *
 * A task whose package key is unreadable is not silently dropped: the reply names it in
 * `couldNotRead`, with the reason.
 * With `onlyTakenAndNotHandedBack`, the rows are only the inside packages taken and not handed back.
 */
export function delegationColumn(workspaceId: string, inside = false, onlyTakenAndNotHandedBack = false): DelegationReading {
  const read = readDelegationColumn(workspaceId, inside, onlyTakenAndNotHandedBack, false)
  return { rows: read.rows, couldNotRead: read.couldNotRead, workspaceId }
}

/** The same packages, narrowed to the state and check the progress card counts. Claims are read once for all of them. */
export function delegationProgressColumn(workspaceId: string): DelegationProgressReading {
  const read = readDelegationColumn(workspaceId, true, false, true)
  return { rows: read.progressRows, couldNotRead: read.couldNotRead, workspaceId }
}

function readDelegationColumn(workspaceId: string, inside: boolean, onlyTakenAndNotHandedBack: boolean, progressOnly: boolean): DelegationReading & { progressRows: DelegationProgressReading['rows'] } {
  const rows: DelegationRow[] = []
  const progressRows: DelegationProgressReading['rows'] = []
  const couldNotRead: DelegationReading['couldNotRead'] = []
  const tasks = listRecordsWithDataAs({
    workspaceId, kind: 'task', alsoWhere: sql`json_type(${records.data}, '$.package') is not null`,
  }, onlyTheseFieldsOf(['package', 'takenOutside', 'returns', 'completed']))

  // ONE CHOICE OF ROWS. Which tasks reach a row is decided here, once, and the batch reads below and the loop after
  // them both go over this list, so they cannot disagree about it. An unreadable package is named here, on the
  // seal's narrowed read too, because it is named before the held filter.
  const chosen: { task: PanelRecord; held: StoredPackage }[] = []
  for (const task of tasks) {
    if (!hasAPackageKey(task.data)) continue
    const rawPackage = asBag(asBag(task.data)['package'])
    const markedInside = ['parent', 'lines', 'pointIds', 'takenInside', 'alignments', 'alignmentAnswers', 'handedBack', 'checks', 'acceptances'].some(key => Object.hasOwn(rawPackage, key))
    if (markedInside !== inside) continue
    const held = packageOf(task.data)
    if (held === null) {
      couldNotRead.push({
        recordId: task.id,
        title: task.title,
        because:
          "This task's package is missing a required part or names a kind of outside work Mole Office does not " +
          'know. The record is unchanged.',
      })
      continue
    }
    if (Boolean(held.parent) !== inside) continue
    // A seal asks for held packages alone, after an unreadable package has been named.
    if (onlyTakenAndNotHandedBack && ((held.takenInside ?? []).at(-1) === undefined || (held.handedBack ?? []).at(-1) !== undefined)) continue
    chosen.push({ task, held })
  }

  // WHAT EACH FULL ROW READS, read once for every chosen task. The progress card draws no full row, so it reads none.
  const full: typeof chosen = progressOnly ? [] : chosen
  const ids = full.map(({ task }) => task.id)
  const idsJson = JSON.stringify(ids)
  const related = getRecordsWithIds(full.flatMap(({ held }) => [held.bundleId, ...held.moduleIds]))
  const stated = new Map<string, StatedRelationship[]>()
  const blocks = new Map<string, Set<string>>()
  const creators = new Map<string, NonNullable<ReturnType<typeof theCreateRow>>>()
  if (ids.length > 0) {
    const subjects = JSON.stringify([...new Set([...ids, ...full.flatMap(({ held }) => held.moduleIds)])])
    const mappings = sqlite.prepare(`SELECT ${MAP_COLUMNS} FROM implementation_map WHERE workspace_id = ? AND record_id IN (SELECT value FROM json_each(?)) AND deleted_at IS NULL ORDER BY repository_id, pattern`).all(workspaceId, subjects) as MapRow[]
    for (const mapping of mappings) {
      const item = toStated(mapping)
      const list = stated.get(item.recordId) ?? []
      list.push(item)
      stated.set(item.recordId, list)
    }
    const linked = sqlite.prepare(`SELECT l.from_id AS task, r.id AS block FROM links l JOIN records r ON r.id = l.to_id
      WHERE l.type = 'relates_to' AND l.inferred = 0 AND l.from_id IN (SELECT value FROM json_each(?)) AND r.kind = ? AND r.deleted_at IS NULL
      UNION ALL SELECT l.to_id AS task, r.id AS block FROM links l JOIN records r ON r.id = l.from_id
      WHERE l.type = 'relates_to' AND l.inferred = 0 AND l.to_id IN (SELECT value FROM json_each(?)) AND r.kind = ? AND r.deleted_at IS NULL`)
      .all(idsJson, BLOCK_KIND, idsJson, BLOCK_KIND) as { task: string; block: string }[]
    for (const link of linked) {
      const list = blocks.get(link.task) ?? new Set<string>()
      list.add(link.block)
      blocks.set(link.task, list)
    }
    const creationRows = sqlite.prepare(`SELECT record_id AS recordId, actor_type AS actorType, actor_id AS actorId, session_id AS sessionId
      FROM changes WHERE record_id IN (SELECT value FROM json_each(?)) AND op = 'create' ORDER BY at`).all(idsJson) as (NonNullable<ReturnType<typeof theCreateRow>> & { recordId: string })[]
    for (const create of creationRows) if (!creators.has(create.recordId)) creators.set(create.recordId, create)
  }
  // ONE ENTRY FOR EACH TASK THE READS WERE MADE FOR, empty values included: a task with no stated code, no plan block
  // or no create row has an entry that says so. A full row is drawn only from its task's entry.
  const read = new Map(ids.map((id) => [id, {
    statedCodeCount: stated.get(id)?.length ?? 0,
    planBlocks: [...(blocks.get(id) ?? [])].sort(),
    create: creators.get(id) ?? null,
  }]))
  let claimByRecord: Map<string, ReturnType<typeof liveClaimsForColumn>> | undefined
  const claimsOn = (recordId: string) => {
    if (claimByRecord === undefined) {
      claimByRecord = new Map()
      for (const claim of liveClaimsForColumn(workspaceId)) {
        for (const id of new Set(claim.things.filter((thing) => thing.what === 'record').map((thing) => thing.id))) {
          const list = claimByRecord.get(id) ?? []
          list.push(claim)
          claimByRecord.set(id, list)
        }
      }
    }
    return claimByRecord.get(recordId) ?? []
  }
  let agents: ReturnType<typeof listParticipants>['agents'] | undefined
  let agentReader: ReturnType<typeof theAgentAStoredReferenceNamesIn> | undefined
  const agent = (id: string) => (agentReader ??= theAgentAStoredReferenceNamesIn(agents ??= listParticipants().agents))(id)
  let secretary: RegisteredAgent | null | undefined
  const secretaryOnce = () => secretary === undefined ? (secretary = whoHoldsTheSecretaryCard()) : secretary
  const actors = theActorsReadOnce()

  for (const { task, held } of chosen) {
    const takesInside = held.takenInside ?? []
    const alignments = held.alignments ?? []
    const answers = held.alignmentAnswers ?? []
    const handbacks = held.handedBack ?? []
    // AN INSPECTOR'S CHECK IS NOT THE PARENT'S ANSWER (`anInspectorsCheck`): the column's check, its words and its checked
    // state come from the other checks alone, so a package only the inspector has judged still waits for the parent.
    const checks = (held.checks ?? []).filter((check) => !anInspectorsCheck(check))
    const latestTake = takesInside.at(-1)
    const latestHandback = handbacks.at(-1)
    const latestCheck = checks.at(-1)
    const alignment = theAlignmentOf({ alignments, alignmentAnswers: answers })
    const claims = claimsOn(task.id)
    const heldBy = claims[0]?.claimant ?? null
    const takes = takesOf(task.data)
    const returns = returnsOf(task.data)
    const completed = completionOf(task.data)
    const outsideName = takes.length === 0 ? null : (takes[takes.length - 1]?.who ?? null)
    const state = packageStateOf({
      completed: completed !== null,
      returned: returns.length > 0,
      outside: takes.length > 0,
      claimed: claims.length > 0,
      inside: !inside ? undefined : theActsOf(held),
    })
    const check = latestCheck?.answer ?? 'none'
    if (progressOnly) {
      progressRows.push({ state, inside: { check } })
      continue
    }
    const reads = read.get(task.id)
    if (reads === undefined) {
      throw new PanelError(
        `Task ${task.id} reached a full row of the delegation column, but the column read nothing for it, so its row ` +
          'would have no bundle, no stated code, no plan blocks and nobody responsible. Nothing was drawn.',
        500,
      )
    }
    const bundle = related.get(held.bundleId) ?? null
    const exportCount = bundle !== null && bundle.kind === 'context_bundle' ? exportsCountOf(bundle.data) : 0
    const statedCodeCount = reads.statedCodeCount
    const moduleFiles = filesOfModules(held.moduleIds, workspaceId, { records: related, stated })
    const responsibility = responsibleFor(task.id, { create: reads.create, agent, secretary: secretaryOnce })

    rows.push({
      recordId: task.id,
      title: task.title,
      suits: held.suits ?? null,
      parent: held.parent ?? null,
      lines: held.lines ?? [], pointIds: held.pointIds ?? [], materials: held.materials ?? [],
      pointCount: held.pointIds?.length ?? 0,
      inside: !inside ? null : {
        waiting: !latestTake,
        takenBy: latestTake ? participantForActor({ type: latestTake.by.actorType, id: latestTake.by.actorId }, actors) : null,
        takenAt: latestTake?.at ?? null, alignment,
        handedBack: !!latestHandback, handedBackAt: latestHandback?.at ?? null,
        check, checkWords: latestCheck?.words ?? null,
      },
      state,
      planBlocks: reads.planBlocks,
      heldBy,
      outsideName,
      responsible: responsibility.who,
      responsibleWhy: responsibility.why,
      packagedAt: held.at,
      bundleId: held.bundleId,
      statedCodeCount,
      modules: moduleFiles.modules,
      namedModuleCount: moduleFiles.namedModuleCount,
      statedCodeFromModules: moduleFiles.statedCodeFromModules,
      modulesWithNoStatedCode: moduleFiles.modulesWithNoStatedCode,
      filesSays: moduleFiles.filesSays,
      exportCount,
      returnCount: returns.length,
      confirmedAt: completed?.at ?? null,
      says: rowSentence({ namedModuleCount: moduleFiles.namedModuleCount }),
    })
  }

  // NEWEST PACKAGE FIRST. The record id breaks a tie, because two packages written in the same
  // second would otherwise come back in whatever order the store gave.
  rows.sort((a, b) => b.packagedAt.localeCompare(a.packagedAt) || b.recordId.localeCompare(a.recordId))
  return { rows, progressRows, couldNotRead, workspaceId }
}

// ============================================================================ making a package

/** What the packaging door takes. The shape check happens at the route; this is what it hands over. */
export interface MakePackageInput {
  taskId: string
  workspaceId: string
  forTheOutside: string
  suits: string
  /** The record ids of the modules the work is in. Undefined and an empty list mean the same. */
  moduleIds?: unknown
  parent?: unknown
  line?: unknown
  lines?: unknown
  pointIds?: unknown
  acceptance: string
  acceptanceSource: { file?: unknown; criterion?: unknown; commit?: unknown }
  preset?: string
  detail?: string
  actor: Actor
}

/** What the packaging door did, in one object. */
export interface MadePackage {
  task: PanelRecord
  package: StoredPackage
  bundle: PanelRecord
  linkId: string
  /** The bundle this package replaced, or null because this task had no package before. */
  replacedBundleId: string | null
  statedCodeCount: number
  /** The files of the modules the package names, worked out the same way the column works them out. */
  modules: PackageModuleFiles[]
  namedModuleCount: number
  statedCodeFromModules: number
  modulesWithNoStatedCode: string[]
  filesSays: string
}

function assertModulesReadyForPackage(moduleIds: string[], decisionId: string | undefined, workspaceId: string): void {
  if (moduleIds.length === 0 || moduleIds.some(id => id.trim() === '')) throw new PanelError(A_PACKAGE_NEEDS_A_MODULE, 400)
  const decision = decisionId === undefined ? null : sqlite.prepare(
    "SELECT append_order AS appendOrder FROM changes WHERE record_id = ? AND op = 'create' AND field IS NULL ORDER BY append_order ASC LIMIT 1",
  ).get(decisionId) as { appendOrder: number | null } | undefined
  for (const id of moduleIds) {
    const module = recordInWorkspace(id, workspaceId)
    if (module.kind !== 'module') throw new PanelError(`The package needs a module, and ${id} is not a module. Name a module in moduleIds. Nothing was written.`, 400)
    const update = theLastRequirementsUpdate(id)
    if (update?.appendOrder == null || (decisionId !== undefined && (decision?.appendOrder == null || update.appendOrder <= decision.appendOrder))) {
      throw new PanelError(`${UPDATE_MODULE_REQUIREMENTS_FIRST} POST /api/records/${id}/requirements`, 400)
    }
  }
}

/**
 * PACKAGE A TASK: FILE A BUNDLE, LINK IT, WRITE THE PACKAGE — ONE TRANSACTION.
 *
 * Criterion F16 point 1 and the shape of clause (8). Three writes, and all three or none: a half
 * made package cannot exist. If any part fails the transaction rolls back, so a refusal from the
 * link or the patch leaves neither a bundle record nor a package field behind.
 *
 * PACKAGING AGAIN REPLACES THE FIELD AND FILES A NEW BUNDLE. The old bundle record is not touched,
 * so what already left the building is still answerable; the reply names the old bundle so a caller
 * can tell the two apart.
 *
 * THE FILES COME FROM THE MODULES, criterion F16 point 1 as corrected by decision 5fIvP6qTPzgM.
 * The packager names the modules the work is in, and each named id is refused unless it is a record
 * of one of the three kinds the implementation map accepts — read from that map's own declaration
 * (`RECORD_KINDS_THAT_OWN_CODE`) and never restated here, so the two refusals cannot drift apart.
 * The files stated for those modules are read back for the reply through `statedFor`, the same
 * reading the column takes, and the reply's sentence about them is drawn from
 * `thePackageFilesSentence`, the one place that sentence is written. Zero named modules is not a
 * refusal: the package is filed and says it carries no file list.
 */
export function makeThePackage(input: MakePackageInput): MadePackage {
  const task = recordInWorkspace(input.taskId, input.workspaceId)
  if (task.kind !== 'task') {
    throw new PanelError(
      `"${task.title}" is a ${kindWord(task.kind).text}, and only a task can be packaged. Nothing was written. ` +
        'File the work as a task and package that.',
      400,
    )
  }

  if (input.moduleIds === undefined || (Array.isArray(input.moduleIds) && input.moduleIds.length === 0)) {
    throw new PanelError(A_PACKAGE_NEEDS_A_MODULE, 400)
  }

  const forTheOutside = input.forTheOutside.trim()
  if (forTheOutside === '') {
    throw new PanelError(
      '`forTheOutside` is empty, and it is the only part of a package written for a reader who cannot reach Mole ' +
        'Office. It says what may be changed, what is to be returned and in which form. Nothing was written. ' +
        'Write it, or do not package this task.',
      400,
    )
  }

  const isInside = [input.parent, input.line, input.lines, input.pointIds].some((value) => value !== undefined)
  if (!isInside && !isPackageSuit(input.suits)) {
    throw new PanelError(
      `"${input.suits}" is not one of the three kinds of outside work a package suits, so nothing was written. ` +
        `The three are: ${PACKAGE_SUITS.join(', ')}.`,
      400,
    )
  }

  const acceptance = input.acceptance.trim()
  if (acceptance === '') {
    throw new PanelError(
      '`acceptance` is empty, and a package a reader cannot be judged against is not ready to leave. Write the ' +
        'acceptance criteria in full as prose, with `acceptanceSource` saying where they were copied from. ' +
        'Nothing was written.',
      400,
    )
  }

  const source = input.acceptanceSource
  const missing: string[] = []
  if (typeof source['file'] !== 'string' || source['file'].trim() === '') missing.push('file')
  if (typeof source['criterion'] !== 'string' || source['criterion'].trim() === '') missing.push('criterion')
  if (typeof source['commit'] !== 'string' || source['commit'].trim() === '') missing.push('commit')
  if (!isInside && missing.length > 0) {
    throw new PanelError(
      `\`acceptanceSource\` is missing ${missing.join(', ')}, so a reader could not tell this copy from its ` +
        'source. All three of file, criterion and commit are required, the way a bundle export names the version ' +
        'each record held. Nothing was written.',
      400,
    )
  }

  let parent: PackageParent | undefined
  let parentRecord: PanelRecord | undefined
  let points: PanelRecord[] = []
  let lines: string[] | undefined
  let decisionId: string | undefined
  if (isInside) {
    const raw = input.parent
    if (!isBag(raw) || (raw['kind'] !== 'decision' && raw['kind'] !== 'task') || typeof raw['id'] !== 'string' || !raw['id'].trim())
      throw new PanelError(`parent ${JSON.stringify(raw)} must name a decision or task and its id. Nothing was written.`, 400)
    parent = { kind: raw['kind'], id: raw['id'] }
    parentRecord = recordInWorkspace(parent.id, input.workspaceId)
    if (parentRecord.kind !== parent.kind) throw new PanelError(`parent ${parent.id} is ${kindWord(parentRecord.kind).text}, not ${kindWord(parent.kind).text}. Nothing was written.`, 400)
    if (!Array.isArray(input.pointIds) || !input.pointIds.length || !input.pointIds.every(id => typeof id === 'string' && id.trim()))
      throw new PanelError('pointIds must name at least one backlog item. Nothing was written.', 400)
    if (new Set(input.pointIds).size !== input.pointIds.length) throw new PanelError('pointIds contains a duplicate point. Nothing was written.', 400)
    points = input.pointIds.map(id => recordInWorkspace(id, input.workspaceId))
    for (const point of points) if (point.kind !== 'backlog_item') throw new PanelError(`point ${point.id} is ${kindWord(point.kind).text}, not a backlog item. Nothing was written.`, 400)
    if (input.line !== undefined && input.lines !== undefined) throw new PanelError('Send line or lines, not both. Nothing was written.', 400)
    if (input.line !== undefined) {
      if (typeof input.line !== 'string' || !input.line.trim()) throw new PanelError('line must be a non-empty string. Nothing was written.', 400)
      lines = [input.line.trim()]
    } else if (input.lines !== undefined) {
      if (!Array.isArray(input.lines) || !input.lines.length || !input.lines.every(x => typeof x === 'string' && x.trim())) throw new PanelError('lines must be a non-empty list of lines. Nothing was written.', 400)
      lines = input.lines.map(x => x.trim())
      if (new Set(lines).size !== lines.length) throw new PanelError('lines contains a duplicate. Nothing was written.', 400)
    } else {
      const named = points.map(point => asBag(point.data)['line'])
      if (!named.every(x => typeof x === 'string' && x.trim()) || new Set(named).size !== 1) throw new PanelError('The points do not name one line; name the line. Nothing was written.', 400)
      lines = [named[0] as string]
    }
    let current: PackageParent | undefined = parent
    const visited = new Set<string>()
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      if (current.kind === 'decision') { decisionId = current.id; break }
      const above = recordInWorkspace(current.id, input.workspaceId)
      current = packageOf(above.data)?.parent
    }
  }

  const preset = input.preset ?? 'continue'
  if (!(BUNDLE_PRESET_NAMES as readonly string[]).includes(preset)) {
    throw new PanelError(
      `"${preset}" is not a preset the product declares, so nothing was written. The presets are: ` +
        `${BUNDLE_PRESET_NAMES.join(', ')}.`,
      400,
    )
  }
  const detail = input.detail ?? 'gist'

  // THE MODULES THE WORK IS IN, criterion F16 point 1 as corrected by decision 5fIvP6qTPzgM.
  //
  // AN EMPTY LIST SENT EXPLICITLY IS TREATED AS ABSENCE, and that is a choice worth writing down.
  // It is not "all of them": a package whose file scope is every module in the project is a scope
  // no packager has ever said, and answering an empty list with the whole project would hand an
  // outside reader an owner for files nobody gave them. It is the same answer as leaving the key
  // out: nobody named any module, which is a real answer and not a gap to fill by inference.
  const rawModuleIds = input.moduleIds
  const moduleIds =
    rawModuleIds === undefined
      ? []
      : Array.isArray(rawModuleIds) && rawModuleIds.every((one) => typeof one === 'string')
        ? (rawModuleIds as string[])
        : null
  if (moduleIds === null) {
    throw new PanelError(
      '`moduleIds` is not a list of record ids, so nothing was written. Send the record ids of the modules the ' +
        'work is in, one string each, or leave the key out when nobody has named a module.',
      400,
    )
  }
  for (const id of moduleIds) {
    // THE SAME THREE KINDS THE IMPLEMENTATION MAP USES, read from its own declaration and never
    // restated here, so the two refusals cannot drift apart: a relationship to code is about a
    // module, a block or a pipeline, which is what the implementation door itself already says.
    const module = recordInWorkspace(id, input.workspaceId)
    if (!(RECORD_KINDS_THAT_OWN_CODE as readonly string[]).includes(module.kind)) {
      // THE KIND WORD IS READ FROM THE TABLE, never interpolated as the stored token.
      const kindSaid = kindWord(module.kind).text
      throw new PanelError(
        `"${id}" names "${module.title}", a ${kindSaid}, and the package cannot take its files: a relationship ` +
          'to code is about a module, a block or a pipeline, and a ' +
          `${kindSaid} does not own code. Name the module the work is in — if this ${kindSaid} is ABOUT some ` +
          'code, its module record is the one to name. Nothing was written.',
        400,
      )
    }
  }

  assertModulesReadyForPackage(moduleIds, decisionId, input.workspaceId)

  const already = packageOf(task.data)
  const replacedBundleId = already?.bundleId ?? null
  const actor = input.actor
  const at = nowStamp()

  return sqlite.transaction((): MadePackage => {
    const bundle = createRecord({
      kind: 'context_bundle',
      title: `Package of ${task.title}`,
      data: { scope: 'record', scopeRecordId: task.id, preset, detail },
      workspaceId: input.workspaceId,
      actor,
    })
    const link = createLink({ fromId: bundle.id, toId: task.id, type: 'about', actor })
    const packageValue = {
      bundleId: bundle.id,
      forTheOutside,
      ...(!isInside ? { suits: input.suits as PackageSuit } : {}),
      moduleIds,
      acceptance,
      ...(!isInside ? { acceptanceSource: {
        file: String(source['file']).trim(), criterion: String(source['criterion']).trim(), commit: String(source['commit']).trim(),
      } } : {}),
      ...(isInside ? { parent, lines, pointIds: points.map(p => p.id) } : {}),
      materials: [
        { kind: 'bundle', ref: bundle.id, says: 'The bundle this package was made from.' },
        ...(parent && parentRecord ? [{ kind: parent.kind, ref: parent.id, says: parentRecord.title }] : []),
        ...points.map(point => ({ kind: 'point' as const, ref: point.id, says: point.title })),
      ],
      at,
      by: { actorType: actor.type, actorId: actor.id },
    } as StoredPackage
    for (const point of points) {
      const data = asBag(point.data)
      const count = typeof data['briefsCarried'] === 'number' ? data['briefsCarried'] : 0
      const increment = data['briefId'] !== task.id && data['state'] !== 'done' && data['state'] !== 'dropped'
      patchRecord(point.id, { dataPatch: { briefId: task.id, ...(decisionId ? { fromDecision: decisionId } : {}), ...(increment ? { briefsCarried: count + 1 } : {}) } }, actor)
    }
    const updated = patchRecord(task.id, { dataPatch: { package: packageValue } }, actor)
    const moduleFiles = filesOfModules(moduleIds, input.workspaceId)
    return {
      task: updated.record,
      package: packageValue,
      bundle,
      linkId: link.id,
      replacedBundleId,
      statedCodeCount: statedFor(task.id, input.workspaceId).length,
      modules: moduleFiles.modules,
      namedModuleCount: moduleFiles.namedModuleCount,
      statedCodeFromModules: moduleFiles.statedCodeFromModules,
      modulesWithNoStatedCode: moduleFiles.modulesWithNoStatedCode,
      filesSays: moduleFiles.filesSays,
    }
  })()
}

// ============================================================================ a person's take

/** What the person's take door needs, before validation. Each of the three body fields may be anything a caller sent. */
export interface TakePackageOutsideInput {
  taskId: string
  workspaceId: string
  who?: unknown
  comesBack?: unknown
  byWhen?: unknown
  actor: Actor
}

/** One entry as it is stored on the task's `takenOutside` list. */
export interface TakenOutsideEntry {
  who: string
  comesBack: string
  byWhen: string
  at: string
  takenBy: { actorType: string; actorId: string }
}

/** What a person's take wrote, who is responsible for the task, and whether that one could be told. */
export interface TookPackageOutside {
  task: PanelRecord
  entry: TakenOutsideEntry
  responsible: Responsibility
  /** The message record sent to the responsible one, or null because nobody could be told. */
  toldId: string | null
}

/**
 * A PERSON TAKES A PACKAGE OUT OF THE OFFICE. Criterion F16 points 3 and 4; ruling 3 of
 * 18:55 on supervisor SX's plan (report cCqfoTlkr10J): a person's take is a state on the package
 * and is never a claim, and it is allowed wherever the caller is proved to be the person — the
 * same proof every one of their other acts already uses.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT A CLAIM, AND NO NEW CLAIM CODE IS WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * `fileAClaim` in lib/claims.ts refuses unless the caller names a live `session` record, and a
 * person sitting at a keyboard has none. That is exactly right for a REGISTERED AGENT, which is
 * why an agent's take needs no new door at all: it takes the package with the claim it already
 * has, through POST /api/claims, and `GET /api/delegation` already draws a live claim as `taken`
 * with `heldBy` naming the claimant — nothing in this file's reading of the column changes for
 * that case. A person's take is a different fact — a promise to bring the work back from outside
 * the office — and it is written onto the task's own append-only `takenOutside` list, never into
 * the claims table. A secretary holding the person's grant may take it for them where this office's
 * list of what the grant carries says so. ANY OTHER AGENT IS REFUSED OUTRIGHT AT THIS DOOR, before
 * anything else is asked, with a sentence pointing at the door that is actually its.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE PROOF, FOUND WHERE IT ALREADY LIVES
 * ---------------------------------------------------------------------------------------
 *
 * `assertThePersonIsProved` in lib/records/the-persons-own-acts.ts is the one function every one of the person's other
 * acts already calls: the person's key, or the one-version window while it is open. This door asks
 * that question and no other. Chapter 8's third rule is not papered over: Mole Office cannot tell
 * the person from a program on their machine that sends their name, so the entry below stores the
 * actor exactly as the request carried it, and the sentence a reader is given says who Mole Office
 * was TOLD took it — never more than that.
 *
 * ---------------------------------------------------------------------------------------
 * THE FORM IS FRICTION ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * Whoever takes a task fills in a form, which keeps anybody from taking one casually. All
 * three fields are required — who will do it, what will come back and in which form, and by when —
 * and a missing one is refused BY NAME, every missing one at once rather than only the first.
 */
export function takePackageOutside(input: TakePackageOutsideInput): TookPackageOutside {
  const task = recordInWorkspace(input.taskId, input.workspaceId)
  if (task.kind !== 'task') {
    throw new PanelError(
      `"${task.title}" is a ${kindWord(task.kind).text}, and only a task can be taken outside the office. Nothing ` +
        'was written.',
      400,
    )
  }
  if (packageOf(task.data) === null) {
    throw new PanelError(
      `"${task.title}" has not been packaged yet, so there is nothing here for anybody outside the office to ` +
        `take. Package it first: POST /api/delegation/${task.id}/package. Nothing was written.`,
      400,
    )
  }

  // A SECRETARY HOLDING THE PERSON'S GRANT MAY PRESS THIS FOR THEM, where this office's list of what the grant carries
  // says it does. The grant is asked before the old refusal, so an office that changed nothing behaves as before: the
  // secretary card keeps this door. The task and the entry are the person's; the entry names the secretary as the one
  // who took it, and the change row and the press row name the grant.
  const carried = input.actor.type === 'agent' && aRaiseCarriesIt(input.actor)
  // ANY OTHER AGENT IS REFUSED HERE OUTRIGHT, before the caller's identity is even asked to prove itself.
  // An agent has a door of its own, and this sentence points at it rather than leaving an agent to
  // guess why a form it will never fill in refused it.
  if (!carried && input.actor.type === 'agent') {
    throw new PanelError(
      'An agent takes a package with the claim it already has, through POST /api/claims — not through this door. ' +
        'This door is a person\'s own act: a claim needs a live session record, and a person has none. Nothing ' +
        'was written.',
      403,
    )
  }
  if (!carried) assertThePersonIsProved(input.actor, 'Taking a package outside the office')

  const who = typeof input.who === 'string' ? input.who.trim() : ''
  const comesBack = typeof input.comesBack === 'string' ? input.comesBack.trim() : ''
  const byWhen = typeof input.byWhen === 'string' ? input.byWhen.trim() : ''
  const missing: string[] = []
  if (who === '') missing.push('who')
  if (comesBack === '') missing.push('comesBack')
  if (byWhen === '') missing.push('byWhen')
  if (missing.length > 0) {
    throw new PanelError(
      `${missing.map((field) => `\`${field}\``).join(' and ')} ${missing.length === 1 ? 'is' : 'are'} empty. ` +
        'Taking a package outside the office needs all three, every time: `who` will do the work (an outside ' +
        'chat by name, or a person), `comesBack` says what will come back and in which form, and `byWhen` says ' +
        'when it is expected, in local wall clock. This is the form that stops a package being taken casually. ' +
        'Nothing was written.',
      400,
    )
  }

  const actor = input.actor
  const entry: TakenOutsideEntry = {
    who,
    comesBack,
    byWhen,
    at: nowStamp(),
    takenBy: { actorType: actor.type, actorId: actor.id },
  }
  // APPEND, NEVER REPLACE. `listOf` already drops anything unreadable rather than throwing, and an
  // entry once written here is never the thing this door changes again — see the field's own
  // declaration in shared/kinds.ts.
  const already = listOf(task.data, 'takenOutside')
  const updated = patchRecord(task.id, { dataPatch: { takenOutside: [...already, entry] } }, actor)

  // A TAKE OPENS A CONVERSATION WITH THE ONE RESPONSIBLE. Criterion F16 point 4. `responsibleFor`
  // is the one place this product answers who that is, and an honest "nobody" is a real answer:
  // the take still happens, and nobody here pretends a message went somewhere it did not.
  const responsible = responsibleFor(task.id)
  const toldId =
    responsible.who === null
      ? null
      : writeASystemLineToOne(
          responsible.who,
          input.workspaceId,
          SYSTEM_LINES.packageTakenOutside(task.title, who, comesBack, byWhen),
          actor,
          undefined,
          undefined,
          { target: { kind: 'record', recordId: task.id, workspaceId: input.workspaceId } },
        ).id

  return {
    task: updated.record,
    entry,
    responsible,
    toldId,
  }
}

// ============================================================================ an outside return

/**
 * ONE THING BROUGHT BACK FROM OUTSIDE, as it is stored on the task's append-only `returns` list.
 *
 * `saysItIsFromOutside` is ALWAYS TRUE and the type says so, which is the whole of invariant 3 here.
 * A return is somebody else's words, carried back by the person and attributed to the outside chat
 * or person by name. It is never a `finding`, never a `stopping_point`, never a measurement and
 * never anything a later reader could take as Mole Office's own observation. The field is set by
 * `recordTheReturn` below and by nothing else, and it is required by the `ReturnedFromOutside` shape
 * in src/shared/kinds/task.ts, so an entry without it cannot be stored. The words are drawn wherever they
 * are drawn through `ReturnedFromOutside` in src/web/components/TaskPackagePanel.tsx, which labels
 * them with their outside author in the same place every time.
 */
export interface ReturnedFromOutsideEntry {
  at: string
  broughtBackBy: { actorType: string; actorId: string }
  fromOutside: string
  form: ReturnForm
  words?: string
  pictures?: string[]
  file?: string
  saysItIsFromOutside: true
}

/** What the return door takes. Each body field may be anything a caller sent; the rules are below. */
export interface ReturnFromOutsideInput {
  taskId: string
  workspaceId: string
  fromOutside?: unknown
  words?: unknown
  pictures?: unknown
  file?: unknown
  actor: Actor
}

/** What the return door wrote. */
export interface ReturnedFromOutside {
  task: PanelRecord
  entry: ReturnedFromOutsideEntry
}

/**
 * WHETHER A PATH IS ONE A STORING DOOR HANDED BACK, and nothing else.
 *
 * The pictures door writes every file it accepts into `messagePictureDirectory()` and the
 * returned-files door writes every file it accepts into `returnedFileDirectory()`. So a path that
 * is inside one of those directories and exists is a path one of them produced, and a path outside
 * both — or inside one and not there — is a path a caller made up. The rule reads the directories
 * from the doors rather than restating the naming scheme, so the check cannot fall behind a door
 * that changes how it names a file.
 */
function aStoringDoorProducedThisPath(path: string, directory: string): boolean {
  return path !== directory && inside(path, directory) && existsSync(path)
}

/**
 * A PERSON PUTS SOMETHING BACK THAT CAME FROM OUTSIDE THE OFFICE. Criterion F16 point 5.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS DOOR TAKES, AND WHAT IT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * It takes PATHS that the pictures door and the returned-files door already handed back. It never
 * takes bytes, it never writes a file, and it has no store of its own: text is words in the entry,
 * pictures are the paths `POST /api/messages/pictures` returned, and a zip is the path
 * `POST /api/returned-files` returned. The entry is appended to the task's own `returns` list and
 * an entry once written is never changed or removed.
 *
 * ---------------------------------------------------------------------------------------
 * AN AGENT IS REFUSED, AND IT IS TOLD WHAT IT DOES INSTEAD
 * ---------------------------------------------------------------------------------------
 *
 * An agent's return is the ordinary acceptance exactly as it stands today: the run's standing, the
 * review, and the merge. This door adds the one step after that — a person setting down what
 * somebody outside the office sent — and an agent has no reason of its own to come through it. The
 * one agent let through is a secretary holding the person's grant, pressing it for them where this
 * office's list of what the grant carries says so.
 *
 * ---------------------------------------------------------------------------------------
 * IT REFUSES BY NAME, WITH NOTHING WRITTEN
 * ---------------------------------------------------------------------------------------
 *
 * A record that is not a task, a task with no package, an agent the person's grant does not carry
 * there, a caller who cannot be proved to be the person, a return that carries nothing at all, two
 * forms at once, and a path no storing door produced are each refused with a sentence naming what
 * is wrong. Every refusal is thrown before `patchRecord`, so nothing is written.
 */
export function recordTheReturn(input: ReturnFromOutsideInput): ReturnedFromOutside {
  const task = recordInWorkspace(input.taskId, input.workspaceId)
  if (task.kind !== 'task') {
    throw new PanelError(
      `"${task.title}" is a ${kindWord(task.kind).text}, and only a task can carry something back from outside ` +
        'the office. Nothing was written.',
      400,
    )
  }
  if (packageOf(task.data) === null) {
    throw new PanelError(
      `"${task.title}" has not been packaged yet, so there is nothing outside the office for this to belong to. ` +
        `Package it first: POST /api/delegation/${task.id}/package. Nothing was written.`,
      400,
    )
  }

  // A SECRETARY HOLDING THE PERSON'S GRANT MAY PRESS THIS FOR THEM, where this office's list of what the grant carries
  // says it does. The grant is asked before the old refusal, so an office that changed nothing behaves as before: the
  // secretary card keeps this door. The return is the person's; the entry names the secretary as the one who brought it
  // back, and the change row and the press row name the grant.
  const carried = input.actor.type === 'agent' && aRaiseCarriesIt(input.actor)
  // ANY OTHER AGENT IS REFUSED BEFORE ITS IDENTITY IS ASKED TO PROVE ANYTHING. An agent's return is the
  // ordinary acceptance as it stands today, and the sentence says so rather than leaving an agent
  // to wonder why the person's door refused it.
  if (!carried && input.actor.type === 'agent') {
    throw new PanelError(
      'An agent\'s return is the ordinary acceptance exactly as it stands today: the run\'s standing, the review ' +
        'and the merge. This door is a person setting down what an outside chat or person sent, so it is the ' +
        'person\'s. A secretary holding the person\'s grant may press it where this office\'s list of what the grant ' +
        'carries says so. Any other agent is refused. Bring the work back through the ordinary acceptance and let the ' +
        'one responsible confirm it finished. Nothing was written.',
      403,
    )
  }
  if (!carried) assertThePersonIsProved(input.actor, 'Returning something from outside the office')

  const fromOutside = typeof input.fromOutside === 'string' ? input.fromOutside.trim() : ''
  if (fromOutside === '') {
    throw new PanelError(
      'The outside chat or person is not named, and a return must say where it came from. Nothing was written.',
      400,
    )
  }

  const words = typeof input.words === 'string' ? input.words.trim() : ''
  const rawPictures = input.pictures
  const pictures =
    rawPictures === undefined
      ? []
      : Array.isArray(rawPictures) && rawPictures.every((one) => typeof one === 'string')
        ? (rawPictures as string[]).map((one) => one.trim()).filter((one) => one !== '')
        : null
  if (pictures === null) {
    throw new PanelError(
      '`pictures` is not a list of paths, so nothing was written. Send the paths the pictures door handed back, one ' +
        'string each, or leave the key out when no picture came back.',
      400,
    )
  }
  const file = typeof input.file === 'string' ? input.file.trim() : ''

  // NOTHING AT ALL WAS BROUGHT BACK. A return that carries no words, no picture and no file is not a
  // return, and storing one would put an empty entry on the task that a later reader would have to
  // interpret.
  if (words === '' && pictures.length === 0 && file === '') {
    throw new PanelError(
      NOTHING_WAS_BROUGHT_BACK,
      400,
    )
  }

  // ONE FORM AT A TIME. `form` says which of the entry's three content keys to read, so a return
  // carrying both pictures and a zip would have no honest answer for it.
  const hasFile = file !== ''
  const hasPictures = pictures.length > 0
  if (hasFile && hasPictures) {
    throw new PanelError(
      'This return carries both pictures and a zip, and a return is one form: words, pictures or a zip. Send ' +
        'one of them, and put anything written in the words. Nothing was written.',
      400,
    )
  }

  // A PATH A STORING DOOR DID NOT PRODUCE IS REFUSED, so nothing on a task ever points at a file the
  // office did not accept through one of its own doors.
  for (const path of pictures) {
    if (!aStoringDoorProducedThisPath(path, messagePictureDirectory())) {
      throw new PanelError(
        `"${path}" is not a picture the pictures door produced. Pictures go through POST ` +
          '/api/messages/pictures, which writes the file and hands back its path; send that path rather than one ' +
          'made up here. Nothing was written.',
        400,
      )
    }
  }
  if (hasFile && !aStoringDoorProducedThisPath(file, returnedFileDirectory())) {
    throw new PanelError(
      `"${file}" is not a zip the returned-files door produced. A zip goes through POST /api/returned-files, which ` +
        'writes the file and hands back its path; send that path rather than one made up here. Nothing was written.',
      400,
    )
  }

  const form: ReturnForm = hasFile ? 'zip' : hasPictures ? 'pictures' : 'text'
  const entry: ReturnedFromOutsideEntry = {
    at: nowStamp(),
    broughtBackBy: { actorType: input.actor.type, actorId: input.actor.id },
    fromOutside,
    form,
    ...(words === '' ? {} : { words }),
    ...(hasPictures ? { pictures } : {}),
    ...(hasFile ? { file } : {}),
    // THE WHOLE OF INVARIANT 3 IN ONE FIELD. Every stored return says, on its own face, that it is
    // somebody outside the office's words and not this office's observation. See the comment on the
    // interface above and the `ReturnedFromOutside` shape in src/shared/kinds/task.ts.
    saysItIsFromOutside: true,
  }
  // APPEND, NEVER REPLACE. Anything unreadable on the existing list is kept as it stands by `listOf`,
  // and an entry once written here is never the thing this door changes again.
  const already = listOf(task.data, 'returns')
  const updated = patchRecord(task.id, { dataPatch: { returns: [...already, entry] } }, input.actor)
  return { task: updated.record, entry }
}

// ============================================================================ the confirmation

/** What the confirm door takes. */
export interface ConfirmPackageInput {
  taskId: string
  workspaceId: string
  actor: Actor
}

/** What a confirmation wrote, and who was responsible when it did. */
export interface ConfirmedPackage {
  task: PanelRecord
  completed: { by: { actorType: string; actorId: string }; at: string }
  responsible: Responsibility
}

/**
 * WHO MAY SAY A PACKAGE'S TASK IS FINISHED: THE ONE RESPONSIBLE, AND THE PERSON.
 *
 * `responsibleFor` is called here and is the only reading of that fact — this guard does not work
 * out responsibility a second way. An agent is allowed exactly when it IS the responsible one, which
 * is what lets the same rule serve the person's press and an agent's door call without a second
 * reading. A record whose responsible one cannot be worked out is refused to every agent and allowed
 * to the person, which is the honest answer `responsibleFor` itself gives when it returns null.
 *
 * THE PROBE IN lib/waiting.ts IS AN AGENT THAT IS NOT THE RESPONSIBLE ONE, so it is refused here
 * and a returned task reaches the person's list. The guard is registered in GOVERNANCE_GUARDS in
 * lib/records/governance-guards.ts and its `pendingWhen` is the returned task nobody has confirmed.
 */
export function assertMayConfirmPackage(task: { id: string; title: string }, actor: Actor): void {
  const responsible = responsibleFor(task.id)

  if (actor.type === 'human') {
    assertThePersonIsProved(actor, 'Confirming a task finished')
    return
  }
  if (
    actor.type === 'agent' &&
    responsible.who !== null &&
    responsible.who.kind === 'agent' &&
    participantForActor(actor)?.id === responsible.who.id
  ) {
    return
  }
  // AND A SECRETARY THEY HAVE RAISED, for any task, as they may. By a decision, a raised secretary holds their acts
  // but a few, and this is not one of them. Asked last, so the grant is named on the
  // confirmation only when nothing else allowed it; the confirmation is a record write, whose revision names it.
  // Asked only while the gate below is at block, so at off nothing is written under the grant.
  const position = gatePosition('who-confirms-a-packaged-task-finished')
  if (position === 'block' && aRaiseCarriesIt(actor)) return
  // AND INSIDE A TEST WORLD, ITS STARTER AND THE SECRETARY, who hold their authority there (criterion P84, rule 5 of
  // chapter 8, problem aRP8Co6BB_Hv). The confirmation is still filed as the agent that made it.
  if (actor.theOwnersAuthority?.holds === true) return
  // AT OFF, AN AGENT ITS OWN KEY PROVES CONFIRMS IT TOO, and the confirmation names it (wave 13r round U). Any other
  // caller is refused in the off words, the probe of lib/waiting.ts among them, so a returned task still reaches the
  // person's list. At block that agent is counted as stopped.
  const keyed = anAgentItsOwnKeyProves(actor) !== null
  if (keyed && gateMet('who-confirms-a-packaged-task-finished', position!) !== 'block') return
  if (!keyed && position !== 'block') throw refusedWhileTheGateIsOff(actor.id, 'who-confirms-a-packaged-task-finished', 'confirm a packaged task finished')

  const whoMay =
    responsible.who === null
      ? 'the person, because the change log names no responsible one'
      : responsible.who.kind === 'person'
        ? `the person, who is responsible for it${` ("${responsible.who.id}")`}`
        : `"${theOneAgentAStringNames(sqlite, responsible.who.id)?.handle ?? responsible.who.id}", the agent responsible for it, or the person`
  const refusal = new PanelError(
    `Only ${whoMay} may confirm a task finished, and this caller is a ${actor.type} "${actor.id}". ` +
      `${responsible.why} Nothing was written.`,
    403,
  )
  if (!keyed) throw refusal
  throw gateMetAgainOnceTheWriteIsTakenBack(refusal, () => gateMet('who-confirms-a-packaged-task-finished', 'block'))
}

/**
 * THE RESPONSIBLE ONE, OR THE PERSON, SAYS THE TASK IS FINISHED. Criterion F16 point 5.
 *
 * It writes `completed` — who confirmed and when — once. A task already confirmed is refused rather
 * than rewritten, because the shape says the field is written once and never rewritten: reopening a
 * finished task is a new piece of work and not an edit to this.
 *
 * IT RELEASES NOTHING. A claim on a record is ended by `releaseAClaim` and by nothing else, and a
 * confirmation is not a release: confirming first and releasing after is the order, because
 * releasing a claim retires the agents started for the record and ends its elevations, and a
 * confirmation that released first would retire the worker before its work was confirmed. This
 * function calls no release and writes no claim.
 */
export function confirmThePackage(input: ConfirmPackageInput): ConfirmedPackage {
  const task = recordInWorkspace(input.taskId, input.workspaceId)
  if (task.kind !== 'task') {
    throw new PanelError(
      `"${task.title}" is a ${kindWord(task.kind).text}, and only a task can be confirmed finished. Nothing was ` +
        'written.',
      400,
    )
  }
  if (completionOf(task.data) !== null) {
    throw new PanelError(
      `"${task.title}" is already confirmed complete, and a confirmation is written once and never rewritten. ` +
        'Reopening finished work is a new task, not an edit to this one. Nothing was written.',
      409,
    )
  }
  assertMayConfirmPackage(task, input.actor)

  const at = nowStamp()
  const completed = { by: { actorType: input.actor.type, actorId: input.actor.id }, at }
  const updated = patchRecord(task.id, { dataPatch: { completed } }, input.actor)
  return { task: updated.record, completed, responsible: responsibleFor(task.id) }
}

/**
 * EVERY PACKAGED TASK THAT HAS SOMETHING BACK AND NOBODY HAS CONFIRMED, across every project.
 *
 * This is the one reading the waiting queue's `confirm-return` act is pending on. It is written
 * here, beside the state words, rather than in lib/waiting.ts so that "a return nobody has
 * confirmed" is worked out in the same file as `packageStateOf` and the column. `since` is the
 * moment the most recent return arrived, and it is the honest date a row has: when it started
 * waiting for a confirmation.
 */
export interface PackageWaitingToBeConfirmed {
  id: string
  workspaceId: string
  title: string
  since: string
}

export function packagedTasksWaitingToBeConfirmed(): PackageWaitingToBeConfirmed[] {
  const waiting: PackageWaitingToBeConfirmed[] = []
  for (const task of listRecords({ workspaceId: ACROSS_WORKSPACES, kind: 'task' })) {
    if (!hasAPackageKey(task.data)) continue
    const returns = returnsOf(task.data)
    if (returns.length === 0) continue
    if (completionOf(task.data) !== null) continue
    waiting.push({
      id: task.id,
      workspaceId: task.workspaceId,
      title: task.title,
      since: returns[returns.length - 1]?.at ?? '',
    })
  }
  return waiting.sort((a, b) => a.since.localeCompare(b.since) || a.id.localeCompare(b.id))
}

// ============================================================================ small readers

function isBag(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asBag(value: unknown): Record<string, unknown> {
  return isBag(value) ? value : {}
}

/**
 * The words for the three kinds of outside work, for a caller that wants them without a record.
 *
 * Exported so the route can name the three in a refusal and the page can draw them without a second
 * table. It reads `PACKAGE_SUIT_WORDS`, which is the one table of readings.
 */
export function theSuitsInWords(): { stored: PackageSuit; says: string }[] {
  return PACKAGE_SUITS.map((stored) => ({ stored, says: packageSuitWord(stored).text }))
}

/** The word a person reads for one kind of outside work. Kept here for callers that hold a row. */
export function suitInWords(suit: PackageSuit): string {
  return PACKAGE_SUIT_WORDS[suit]
}

// Inside-work entries are kept on the package, in the order in which the doors write them.
type InsideInput = { taskId: string; workspaceId: string; actor: Actor }
function insidePackage(input: InsideInput): { task: PanelRecord; pkg: StoredPackage } {
  const task = recordInWorkspace(input.taskId, input.workspaceId)
  const pkg = packageOf(task.data)
  if (task.kind !== 'task' || !pkg || !pkg.parent || !pkg.lines || !pkg.pointIds) {
    throw new PanelError(`"${task.title}" has no readable inside package. Nothing was written.`, 400)
  }
  return { task, pkg }
}
function whoWrote(actor: Actor) { return { actorType: actor.type, actorId: actor.id } }
function sameWriter(by: { actorType: string; actorId: string }, actor: Actor): boolean {
  return by.actorType === actor.type && by.actorId === actor.id
}
function assertTaker(pkg: StoredPackage, actor: Actor): void {
  const take = pkg.takenInside?.at(-1)
  if (!take || !sameWriter(take.by, actor)) throw new PanelError('Only the latest inside taker may do this. Nothing was written.', 403)
}
/** The latest taker's refusal at the answer and check doors. Asked before anything else there, inspector or not. */
export const THE_TAKER_MAY_NOT_CHECK = 'The taker may not answer or check their own work. Nothing was written.'
/** The refusal of a caller who is neither the person nor the package maker, nor the run's inspector. */
export const ONLY_THE_MAKER_MAY_ANSWER = 'Only the person or the package maker may answer. Nothing was written.'
function refuseTheTaker(pkg: StoredPackage, actor: Actor): void {
  const take = pkg.takenInside?.at(-1)
  if (take && sameWriter(take.by, actor)) throw new PanelError(THE_TAKER_MAY_NOT_CHECK, 403)
}
function assertTheMakerMayAnswer(pkg: StoredPackage, actor: Actor): void {
  refuseTheTaker(pkg, actor)
  if (actor.type === 'human') { assertThePersonIsProved(actor, 'Answering an inside package'); return }
  if (isTheMaker(pkg, actor)) return
  throw new PanelError(ONLY_THE_MAKER_MAY_ANSWER, 403)
}
function requiredWords(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new PanelError(`${name} must be non-empty words. Nothing was written.`, 400)
  return value.trim()
}
function optionalWords(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new PanelError(`${name} must be words. Nothing was written.`, 400)
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}
function appendInside(task: PanelRecord, pkg: StoredPackage, key: 'takenInside' | 'alignments' | 'alignmentAnswers' | 'handedBack' | 'checks' | 'acceptances', entry: object, actor: Actor): PanelRecord {
  return patchRecord(task.id, { dataPatch: { package: { ...pkg, [key]: [...(pkg[key] ?? []), entry] } } }, actor).record
}
/**
 * THE NEXT ACT ON A PACKAGE, WITH ITS ORDER NUMBER: one more than the acts the package holds in all its lists. Two acts
 * written in the same second keep their order by it, and `packageStateOf` reads the acts in that order.
 */
function anAct<E extends object>(pkg: StoredPackage, entry: E): E & { order: number } {
  return { ...entry, order: theNextOrderOf([pkg.takenInside, pkg.alignments, pkg.alignmentAnswers, pkg.handedBack, pkg.checks, pkg.acceptances]) }
}
/**
 * THE PACKAGE DOORS REFUSE NO JUDGEMENT CALL. Whether to take a package again, restate it again, answer again, hand it
 * back before its plan was aligned or check a hand-back again is the judgement of the one who does it, and the office
 * cannot tell a mistake from a change of mind. So the door records the act, the reading shows the newest, the other
 * side is told, and the reply carries a reminder of what came before. A door refuses only a fault of the request: a
 * missing or unreadable field, an id that names nothing it can act on, the wrong caller, or a run key that proves nothing.
 */
function withTheReminder(body: string, reminder: string | undefined): string {
  return reminder === undefined ? body : `${body} ${reminder}`
}
/** The name a person reads for whoever wrote a stored act. */
function whoWroteIt(by: { actorType: string; actorId: string }): string {
  return theNameAPersonReads(theParticipantAWriterNames(by) ?? { kind: 'agent', id: by.actorId })
}
const sameParticipant = (a: ParticipantRef | null, b: ParticipantRef | null): boolean => a !== null && b !== null && a.kind === b.kind && a.id === b.id
export function takeThePackageInside(input: InsideInput) {
  const { task, pkg } = insidePackage(input)
  // A TAKE OF A PACKAGE SOMEBODY ALREADY TOOK IS RECORDED, and the newest taker is the one who restates and hands back.
  // Whether the work moves to another agent is the maker's to see and settle, so the earlier taker is told.
  const earlier = pkg.takenInside?.at(-1)
  const reminder = earlier === undefined ? undefined : sayInEnglish('delegation.reminder.takenAgain', { who: whoWroteIt(earlier.by), at: earlier.at })
  const taken = anAct(pkg, { by: whoWrote(input.actor), at: nowStamp() })
  return sqlite.transaction(() => {
    const written = appendInside(task, pkg, 'takenInside', taken, input.actor)
    const maker = theMakerOf(pkg)
    tellAboutThePackage(task, maker, input.actor.ownKeyRun ?? null, 'packageTaken' satisfies AnotherNoticeKind,
      sayInEnglish('delegation.notice.takenTitle', { title: task.title }),
      withTheReminder(sayInEnglish('delegation.notice.takenBody', { who: whoActed(input.actor), title: task.title, task: task.id }), reminder))
    const first = earlier === undefined ? null : theTakerOf(pkg)
    if (first !== null && !sameParticipant(first, participantForActor(input.actor)) && !sameParticipant(first, maker)) {
      tellAboutThePackage(task, first, input.actor.ownKeyRun ?? null, 'packageTaken' satisfies AnotherNoticeKind,
        sayInEnglish('delegation.notice.takenAfterYouTitle', { title: task.title }),
        withTheReminder(sayInEnglish('delegation.notice.takenAfterYouBody', { who: whoActed(input.actor), title: task.title, task: task.id }), reminder))
    }
    return { task: written, taken, ...(reminder === undefined ? {} : { reminder }) }
  })()
}
/** The refusal when the `plan` sent with an alignment is neither the older free text nor the fixed shape. */
export const THE_PLANS_SHAPE =
  'A plan is either the older free text or the fixed shape {workers, waves, waits}. Each worker names worker, outcome, ' +
  'points, files, difficulty, difficultyWhy, model and modelWhy. There is no field for a worker’s own steps. Nothing was written.'

/** The shape's plan in the office's words, for the notice the maker reads. */
function thePlanSaidInEnglish(plan: PackagePlanShape): string {
  const workers = plan.workers.map(worker => {
    const said = [sayInEnglish('delegation.plan.worker', {
      worker: worker.worker, outcome: worker.outcome, points: worker.points.join(', '), files: worker.files.join(', '),
    })]
    if (worker.difficulty === '') said.push(sayInEnglish('delegation.plan.difficultyMissing'))
    else if (worker.difficultyWhy === '') said.push(sayInEnglish('delegation.plan.difficultyNoReason', { difficulty: worker.difficulty }))
    else said.push(sayInEnglish('delegation.plan.difficulty', { difficulty: worker.difficulty, why: worker.difficultyWhy }))
    if (worker.modelWhy === '') said.push(sayInEnglish('delegation.plan.modelNoReason', { model: worker.model }))
    else said.push(sayInEnglish('delegation.plan.model', { model: worker.model, why: worker.modelWhy }))
    return said.join(' ')
  })
  const waves = [sayInEnglish('delegation.plan.waves', { n: plan.waves })]
  for (let wave = 2; wave <= plan.waves; wave += 1) {
    const why = plan.waits[wave - 2] ?? ''
    waves.push(why === ''
      ? sayInEnglish('delegation.plan.waitMissing', { wave })
      : sayInEnglish('delegation.plan.wait', { wave, why }))
  }
  return [...workers, ...waves].join(' ')
}

/** The hints in the office's words, for the align reply and the notice the maker reads. */
function theHintsSaidInEnglish(hints: readonly PlanHint[]): string {
  if (hints.length === 0) return sayInEnglish('delegation.notice.noHints')
  return hints.map(hint => sayInEnglish(PLAN_HINT_WORD_KEYS[hint.code], hint.values)).join(' ')
}

export function restateThePackage(input: InsideInput & { restated?: unknown; plan?: unknown; goOnWhy?: unknown }) {
  const { task, pkg } = insidePackage(input)
  assertTaker(pkg, input.actor)
  const restated = requiredWords(input.restated, 'restated')
  // THE PLAN IS CHECKED AS DATA. The older free text is taken as it was; the fixed shape is read by the one
  // reading the page reads, so the two cannot disagree about what a plan is.
  const plan: StoredPlan | null = readAStoredPlan(input.plan)
  if (plan === null) throw new PanelError(THE_PLANS_SHAPE, 400)
  const goOnWhy = optionalWords(input.goOnWhy, 'goOnWhy')
  // HINTS NEVER REFUSE. They are worked out once, here, from the shape and the Casting rows for the package's project,
  // and stored on the alignment beside the act; an older free-text plan cannot be compared, so it stores no hint and is
  // shown as the words it was. The page reads what is stored rather than working them out again.
  const hints = plan.kind === 'shape' ? thePlansHints(plan.plan, pkg.pointIds ?? [], task.workspaceId) : []
  // A RESTATEMENT WHILE ONE WAITS, OR AFTER ONE WAS ALIGNED, IS RECORDED as the newest, and an answer now answers it.
  const standing = theAlignmentOf(theActsOf(pkg))
  const newest = pkg.alignments?.at(-1)
  const reminder = newest === undefined || standing === 'differs' ? undefined
    : sayInEnglish(standing === 'aligned' ? 'delegation.reminder.restatedAfterAligned' : 'delegation.reminder.restatedWhileWaiting', { at: newest.at })
  const restatement = anAct(pkg, {
    by: whoWrote(input.actor), at: nowStamp(), restated,
    plan: plan.kind === 'shape' ? plan.plan : plan.text,
    hints,
    ...(goOnWhy === undefined ? {} : { goOnWhy }),
  })
  return sqlite.transaction(() => {
    const written = appendInside(task, pkg, 'alignments', restatement, input.actor)
    const body = plan.kind === 'shape'
      ? withTheReminder(
        sayInEnglish('delegation.notice.alignedBodyShape', {
          who: whoActed(input.actor), title: task.title, task: task.id, restated,
          plan: thePlanSaidInEnglish(plan.plan), hints: theHintsSaidInEnglish(hints),
        }) + (goOnWhy === undefined ? '' : ` ${sayInEnglish('delegation.notice.goOnWithHints', { why: goOnWhy })}`),
        reminder,
      )
      : withTheReminder(sayInEnglish('delegation.notice.alignedBody', {
        who: whoActed(input.actor), title: task.title, task: task.id, restated, plan: plan.text,
      }), reminder)
    tellAboutThePackage(task, theMakerOf(pkg), input.actor.ownKeyRun ?? null, 'packageAligned' satisfies AnotherNoticeKind,
      sayInEnglish('delegation.notice.alignedTitle', { title: task.title }), body)
    return { task: written, restatement, hints, ...(reminder === undefined ? {} : { reminder }) }
  })()
}
/** The answer door's refusal when nobody restated the package, so the answer answers nothing. */
export const NOBODY_HAS_RESTATED_IT = 'Nobody has restated this package, so there is no restatement to answer. Nothing was written.'
export function answerThePackageAlignment(input: InsideInput & { answer?: unknown; words?: unknown }) {
  const { task, pkg } = insidePackage(input)
  if (input.answer !== 'aligned' && input.answer !== 'differs') throw new PanelError('answer must be aligned or differs. Nothing was written.', 400)
  const words = requiredWords(input.words, 'words')
  assertTheMakerMayAnswer(pkg, input.actor)
  // AN ANSWER TO NO RESTATEMENT ANSWERS NOTHING, a fault of the request. A second answer to the newest restatement is
  // recorded as the newest, and it is the one that counts.
  if (!pkg.alignments?.length) throw new PanelError(NOBODY_HAS_RESTATED_IT, 409)
  const earlier = theAnswerToTheNewest(theActsOf(pkg))
  const reminder = earlier === undefined ? undefined : sayInEnglish('delegation.reminder.answeredAgain', { at: earlier.at })
  const answer = anAct(pkg, { by: whoWrote(input.actor), at: nowStamp(), answer: input.answer, words })
  // THE ANSWER IS ABOUT NO RUN: neither the take nor the restatement it answers records one.
  return sqlite.transaction(() => {
    const written = appendInside(task, pkg, 'alignmentAnswers', answer, input.actor)
    tellAboutThePackage(task, theTakerOf(pkg), null, 'packageAlignAnswered' satisfies AnotherNoticeKind,
      sayInEnglish('delegation.notice.answeredTitle', { title: task.title }),
      withTheReminder(sayInEnglish('delegation.notice.answeredBody', { who: whoActed(input.actor), title: task.title, task: task.id, answer: answer.answer, words }), reminder))
    return { task: written, answer, ...(reminder === undefined ? {} : { reminder }) }
  })()
}
/** The hand-back door's refusal of a request that no run key proved. Asked after the taker's, before anything is read from the body. */
export const A_HAND_BACK_NEEDS_ITS_RUNS_KEY =
  'A hand-back must come from the run that did the work, sent with that run’s own key. No key on this request proves which run sent it, so nothing was written.'
export function handBackThePackage(input: InsideInput & { points?: unknown }) {
  const { task, pkg } = insidePackage(input)
  assertTaker(pkg, input.actor)
  // THE RUN THAT WROTE IT, FROM THE RUN KEY ON THE REQUEST (`ownKeyRun`), never from a header: the inspector of that
  // run's check is who may judge it, and a landing marks the points of the run it lands. A request no run key proved is
  // refused, so every hand-back stored from now on names its run.
  const run = input.actor.ownKeyRun
  if (run === undefined) throw new PanelError(A_HAND_BACK_NEEDS_ITS_RUNS_KEY, 403)
  // A HAND-BACK BEFORE THE PLAN WAS ALIGNED IS RECORDED: the maker decides whether to accept its points.
  const reminder = gatePosition('package-alignment-answer') !== '1' || theAlignmentOf(theActsOf(pkg)) === 'aligned' ? undefined : sayInEnglish('delegation.reminder.handedBackUnaligned')
  const parsed = z.array(pointSchema.extend({ words: z.string().trim().min(1) })).safeParse(input.points)
  if (!parsed.success) throw new PanelError('points must give each pointId, outcome and non-empty words. Nothing was written.', 400)
  if (whatThePointsLack(pkg.pointIds!, parsed.data.map(point => point.pointId)) !== null) throw new PanelError('points must name every package point exactly once, with no strangers or duplicates. Nothing was written.', 400)
  const handback = anAct(pkg, { by: whoWrote(input.actor), at: nowStamp(), points: parsed.data, run })
  return sqlite.transaction(() => {
    const written = appendInside(task, pkg, 'handedBack', handback, input.actor)
    tellAboutThePackage(task, theMakerOf(pkg), run, 'packageHandedBack' satisfies AnotherNoticeKind,
      sayInEnglish('delegation.notice.handedBackTitle', { title: task.title }),
      withTheReminder(sayInEnglish('delegation.notice.handedBackBody', {
        who: whoActed(input.actor), title: task.title, task: task.id,
        points: parsed.data.map((point) => sayInEnglish('delegation.notice.handedBackPoint', {
          point: point.pointId, outcome: sayInEnglish(`delegation.notice.outcome.${point.outcome}`), words: point.words,
        })).join(' '),
      }), reminder))
    return { task: written, handback, ...(reminder === undefined ? {} : { reminder }) }
  })()
}

/** The accept door's refusal of an agent that did not make the package. The person may always answer. */
export const ONLY_THE_MAKER_MAY_ACCEPT = 'Only the maker of the package or the person may accept or return its points. Nothing was written.'
/**
 * THE MAKER'S ANSWER TO A HAND-BACK, point by point or whole. The maker of the package or the person answers each point it
 * names: accepted, or returned with words that say why. The taker never answers its own work, and a landing answers
 * nothing. An accepted point is done, and the acceptance on the package keeps who answered and when. A returned point
 * goes back to the taker with its words, and is not done until a later answer accepts it. When the package's state is
 * done after the answer, its task and the plan blocks linked to it are done; when an answer returns a point of a
 * package that was done, they are doing again. The taker is told in one notice.
 */
export function acceptThePackage(input: InsideInput & { points?: unknown }) {
  const { task, pkg } = insidePackage(input)
  refuseTheTaker(pkg, input.actor)
  if (input.actor.type === 'human') assertThePersonIsProved(input.actor, 'Accepting the points of an inside package')
  else if (!isTheMaker(pkg, input.actor)) throw new PanelError(ONLY_THE_MAKER_MAY_ACCEPT, 403)
  const latest = pkg.handedBack?.at(-1)
  if (latest === undefined) throw new PanelError('Nothing has been handed back, so no point can be accepted or returned. Nothing was written.', 409)
  const parsed = z.array(anAcceptedPoint).min(1).safeParse(input.points)
  if (!parsed.success) throw new PanelError('points must give at least one pointId, each with the answer accepted or returned. Nothing was written.', 400)
  const lack = whatThePointsLack(pkg.pointIds!, parsed.data.map((point) => point.pointId))
  if (lack !== null && lack.strangers.length + lack.twice.length > 0) {
    throw new PanelError(`points must name points of the package, each once: ${thePointsLackSays({ ...lack, leftOut: [] })}. Nothing was written.`, 400)
  }
  if (parsed.data.some((point) => point.answer === 'returned' && !point.words?.trim())) throw new PanelError('A returned point needs words that say why. Nothing was written.', 400)
  const points: PackageAcceptedPoint[] = parsed.data.map((point) => ({ pointId: point.pointId, answer: point.answer, ...(point.words?.trim() ? { words: point.words.trim() } : {}) }))
  const acceptance = anAct(pkg, { by: whoWrote(input.actor), at: nowStamp(), points })
  const doneBefore = theStateOfTheActs(pkg) === 'done'
  const doneAfter = theStateOfTheActs({ ...pkg, acceptances: [...(pkg.acceptances ?? []), acceptance] }) === 'done'
  const returned = points.filter((point) => point.answer === 'returned')
  return sqlite.transaction(() => {
    let written = appendInside(task, pkg, 'acceptances', acceptance, input.actor)
    for (const point of points) {
      const state = getRecord(point.pointId)?.data['state']
      if (point.answer === 'accepted' && state !== 'done') patchRecord(point.pointId, { dataPatch: { state: 'done' } }, input.actor)
      if (point.answer === 'returned' && state === 'done') patchRecord(point.pointId, { dataPatch: { state: 'doing' } }, input.actor)
    }
    if (doneAfter !== doneBefore) {
      const state = doneAfter ? 'done' : 'doing'
      written = patchRecord(task.id, { dataPatch: { state } }, input.actor).record
      for (const block of theBlocksLinkedTo(task.id)) patchRecord(block, { dataPatch: { state } }, input.actor)
    }
    const waiting = pkg.pointIds!.filter((pointId) => !doneAfter && !points.some((point) => point.pointId === pointId && point.answer === 'accepted'))
    const standing = doneAfter ? sayInEnglish('delegation.notice.everyPointAccepted')
      : returned.length > 0 ? sayInEnglish('delegation.notice.handTheReturnedBack', { task: task.id })
        : sayInEnglish('delegation.notice.pointsWait', { n: waiting.length })
    tellAboutThePackage(task, theTakerOf(pkg), latest.run ?? null, returned.length > 0 ? 'packageReturned' : 'packageAccepted',
      sayInEnglish(returned.length > 0 ? 'delegation.notice.returnedTitle' : 'delegation.notice.acceptedTitle', { title: task.title }),
      sayInEnglish('delegation.notice.acceptanceBody', {
        who: whoActed(input.actor), title: task.title, task: task.id, standing,
        points: points.map((point) => point.answer === 'accepted'
          ? sayInEnglish('delegation.notice.acceptedPoint', { point: point.pointId })
          : sayInEnglish('delegation.notice.returnedPoint', { point: point.pointId, words: point.words ?? '' })).join(' '),
      }))
    return { task: written, acceptance }
  })()
}
/** True when the caller is the participant that made the package. */
function isTheMaker(pkg: StoredPackage, actor: Actor): boolean {
  const maker = theParticipantAWriterNames(pkg.by)
  const caller = participantForActor(actor)
  return maker !== null && caller !== null && maker.kind === caller.kind && maker.id === caller.id
}
/** The acts on an inside package, as `packageStateOf` reads them. */
function theActsOf(pkg: StoredPackage): PackageActs {
  return {
    pointIds: pkg.pointIds ?? [], takenInside: pkg.takenInside ?? [], alignments: pkg.alignments ?? [],
    alignmentAnswers: pkg.alignmentAnswers ?? [], handedBack: pkg.handedBack ?? [], acceptances: pkg.acceptances ?? [],
  }
}
/** The state the acts on an inside package give, with no claim, no outside take and no completion beside them. */
function theStateOfTheActs(pkg: StoredPackage): PackageState {
  return packageStateOf({ completed: false, returned: false, outside: false, claimed: false, inside: theActsOf(pkg) })
}

/** The maker of a package, whom its notices are for. Refused when the stored maker names no one agent, so no door writes without its notice. */
function theMakerOf(pkg: StoredPackage): ParticipantRef {
  const maker = theParticipantAWriterNames(pkg.by)
  if (maker === null) throw new PanelError(sayInEnglish('delegation.notice.noMaker', { who: pkg.by.actorId }), 409)
  return maker
}
/** The latest one that took a package inside, whom the answer to its restatement is for. Refused when that names no one agent. */
function theTakerOf(pkg: StoredPackage): ParticipantRef {
  const take = pkg.takenInside!.at(-1)!
  const taker = theParticipantAWriterNames(take.by)
  if (taker === null) throw new PanelError(sayInEnglish('delegation.notice.noTaker', { who: take.by.actorId }), 409)
  return taker
}
/** Who acted at a door, by the name a sentence gives them. */
function whoActed(actor: Actor): string {
  return theNameAPersonReads(theParticipantAWriterNames(whoWrote(actor)) ?? { kind: 'agent', id: actor.id })
}
/**
 * One notice from a package's door, written by the office to that one reader alone, in the door's own transaction. Each
 * caller names its kind with `satisfies AnotherNoticeKind`, the shape the table of notices reads as written.
 */
function tellAboutThePackage(task: PanelRecord, to: ParticipantRef, aboutRun: string | null, notice: 'packageTaken' | 'packageAligned' | 'packageAlignAnswered' | 'packageHandedBack' | 'packageAccepted' | 'packageReturned', title: string, body: string): void {
  writeAMessage({ workspaceId: task.workspaceId, to: [to], onlyThem: true, aboutRun, actor: THE_OFFICE, notice, title, body })
}

/**
 * WHAT A LIST OF POINT IDS LACKS AGAINST THE PACKAGE'S POINTS: the points it leaves out, the ids that are not the
 * package's, and the ids it names twice; null when it names every point exactly once. The hand-back, the inspector's
 * check and the verdict door each ask this one reading.
 */
export function whatThePointsLack(pointIds: readonly string[], ids: readonly string[]): { leftOut: string[]; strangers: string[]; twice: string[] } | null {
  const leftOut = pointIds.filter((id) => !ids.includes(id))
  const strangers = [...new Set(ids.filter((id) => !pointIds.includes(id)))]
  const twice = [...new Set(ids.filter((id, at) => ids.indexOf(id) !== at))]
  return leftOut.length + strangers.length + twice.length === 0 ? null : { leftOut, strangers, twice }
}

/** What a judgement of one package's points lacks, in words, for the check door's refusal and the verdict door's. */
export function thePointsLackSays(lack: { leftOut: string[]; strangers: string[]; twice: string[] }): string {
  return [
    ...(lack.leftOut.length === 0 ? [] : [`it leaves out ${lack.leftOut.join(', ')}`]),
    ...(lack.strangers.length === 0 ? [] : [`${lack.strangers.join(', ')} ${lack.strangers.length === 1 ? 'is' : 'are'} not in the package`]),
    ...(lack.twice.length === 0 ? [] : [`it names ${lack.twice.join(', ')} twice`]),
  ].join('; ')
}

/**
 * WHETHER THE LATEST HAND-BACK WAITS FOR A CHECK, counting only the checks `counts` takes. Seconds can tie, so the first
 * revision carrying the latest counted check says how many hand-backs it saw; only a later hand-back waits.
 */
function theLatestHandBackWaits(task: PanelRecord, pkg: StoredPackage, counts: (check: PackageCheck) => boolean): 'none' | 'checked' | 'waits' {
  const handbackCount = pkg.handedBack?.length ?? 0
  if (!handbackCount) return 'none'
  const checks = pkg.checks ?? []
  let latest = checks.length - 1
  while (latest >= 0 && !counts(checks[latest]!)) latest--
  if (latest < 0) return 'waits'
  const row = sqlite.prepare(`SELECT data FROM revisions WHERE record_id = ?
    AND json_extract(data, '$.package.bundleId') = ?
    AND json_array_length(json_extract(data, '$.package.checks')) = ? ORDER BY seq ASC LIMIT 1`)
    .get(task.id, pkg.bundleId, latest + 1) as { data: string } | undefined
  const atCheck = row ? packageOf(JSON.parse(row.data) as unknown) : null
  return !atCheck || handbackCount <= (atCheck.handedBack?.length ?? 0) ? 'checked' : 'waits'
}
/**
 * A CHECK OF NOTHING HANDED BACK CHECKS NOTHING, a fault of the request. A second check of a hand-back already checked
 * is recorded as the newest, with a reminder of the check before it, among the checks `counts` takes.
 */
function aSecondCheckIsReminded(pkg: StoredPackage, waits: 'none' | 'checked' | 'waits', counts: (check: PackageCheck) => boolean): string | undefined {
  if (waits === 'none') throw new PanelError('Nothing has been handed back, so there is nothing to check. Nothing was written.', 409)
  if (waits === 'waits') return undefined
  return sayInEnglish('delegation.reminder.checkedAgain', { at: (pkg.checks ?? []).filter(counts).at(-1)!.at })
}
/** An inspector's check: it carries the points it judged. The parent's answer is counted apart from it. */
const anInspectorsCheck = (check: PackageCheck): boolean => check.points !== undefined
const anyCheck = (): boolean => true

/** How a point's outcome and judged state are said to a person. */
export const A_POINTS_STATE_IN_WORDS: Readonly<Record<PackagePointOutcome['outcome'], string>> = { done: 'done', part: 'partly done', not: 'not done' }

/** Whether a judgment describes a point handed back as done. */
function theJudgementIsDone(judged: PackageCheckPoint['judged']): boolean {
  return judged === 'done' || judged === 'off_target' || judged === 'more_than_asked'
}
function theJudgementInWords(judged: PackageCheckPoint['judged']): string {
  return judged === 'part' || judged === 'not' ? A_POINTS_STATE_IN_WORDS[judged] : sayInEnglish(`delegation.inspection.sentence.${judged}`)
}
/** Keep the handed-back outcome when it holds; otherwise the point is not done. */
export function thePointsOutcomeAfterTheCheck(point: { holds: boolean }, claimed: PackagePointOutcome['outcome']): PackagePointOutcome['outcome'] {
  return point.holds ? claimed : 'not'
}

/** The words of an inspector's check, built from its points alone. */
export function theInspectorsCheckSays(points: readonly { pointId: string; judged: PackageCheckPoint['judged']; holds: boolean; why: string }[]): string {
  const held = points.filter((one) => one.holds).length
  return `The inspector of the run that handed it back judged ${points.length} ${points.length === 1 ? 'point' : 'points'}: ` +
    `${held} ${held === 1 ? 'holds' : 'hold'} and ${points.length - held} ${points.length - held === 1 ? 'does' : 'do'} not. ` +
    points.map((one) => `${one.pointId} is ${theJudgementInWords(one.judged)} and ${one.holds ? 'holds' : 'does not hold'}: ${one.why}`).join(' ')
}

/**
 * THE ONE SENTENCE FOR A POINT THAT DOES NOT HOLD, listed under "To fix in the line's next round" in the check's text: the
 * package, the point, what the hand-back claimed and what the inspector found.
 */
export function aPointThatDoesNotHoldSays(one: {
  task: string; title: string; pointId: string; says: string | null
  claimed: PackagePointOutcome['outcome']; claimedWords: string; judged: PackageCheckPoint['judged']; why: string
}): string {
  return `In the inside package "${one.title}" (${one.task}), point ${one.pointId}${one.says === null ? '' : ` ("${one.says}")`} was handed back as ` +
    `${A_POINTS_STATE_IN_WORDS[one.claimed]}, with the words "${one.claimedWords}". The inspector found it ${theJudgementInWords(one.judged)}: ${one.why}`
}

/** A point said to hold whose judgment does not match the handed-back outcome group. */
export interface AClaimThatCannotHold { pointId: string; claimed: PackagePointOutcome['outcome']; judged: PackageCheckPoint['judged'] }

/**
 * A DONE JUDGMENT can hold only when the point was handed back as done. A narrower or unfinished judgment can hold only
 * when the point was handed back as part or not. A point that does not hold may have any judgment. The check and the
 * verdict both ask this reading; `whatThePointsLack` finds points that are not the package's.
 */
export function theClaimsThatCannotHold(
  handedBack: readonly { pointId: string; outcome: PackagePointOutcome['outcome'] }[],
  judged: readonly { pointId: string; judged: PackageCheckPoint['judged']; holds: boolean }[],
): AClaimThatCannotHold[] {
  const cannot: AClaimThatCannotHold[] = []
  for (const point of judged) {
    const claimed = handedBack.find((one) => one.pointId === point.pointId)?.outcome
    if (point.holds && claimed !== undefined && (claimed === 'done') !== theJudgementIsDone(point.judged)) cannot.push({ pointId: point.pointId, claimed, judged: point.judged })
  }
  return cannot
}

/** The claims that cannot hold, in words, for the check door's refusal and the verdict door's. */
export function theClaimsThatCannotHoldSay(cannot: readonly AClaimThatCannotHold[]): string {
  return cannot.map((one) =>
    `${one.pointId} was handed back as ${A_POINTS_STATE_IN_WORDS[one.claimed]} and found ${theJudgementInWords(one.judged)}, so it cannot hold`).join('; ')
}

/** The refusals of the inspector's check, each its own sentence. */
export const ONLY_THE_INSPECTOR_SENDS_POINTS =
  'points are for the inspector of the run that handed the package back. The person and the package maker answer with answer and words. Nothing was written.'
export const THE_INSPECTOR_SENDS_POINTS_ALONE =
  'The inspector of the run that handed the package back answers with points alone; the answer and its words are worked out from them. Nothing was written.'
export const A_HAND_BACK_WITH_NO_RUN =
  'The latest hand-back names no run that wrote it, because no run key proved one, so no inspector can check it. The person or the package maker may. Nothing was written.'
export const THE_INSPECTORS_POINTS_ARE_UNREADABLE =
  sayInEnglish('delegation.inspection.unreadablePoints')
export function noCheckOfTheRunIsRecorded(run: string): string {
  return `No check of run ${run} by this inspector is recorded, so nothing the office stores says this caller is its inspector. Nothing was written.`
}
export function theInspectorOfAnotherRun(run: string): string {
  return `This is the inspector of another check, not of a check of run ${run}, which handed the package back. Only the inspector of that run's check may check it. Nothing was written.`
}
export function theInspectorsPointsLack(title: string, lack: { leftOut: string[]; strangers: string[]; twice: string[] }): string {
  return `The judgement of "${title}" must name every package point exactly once: ${thePointsLackSays(lack)}. Nothing was written.`
}
export function theInspectorsClaimsCannotHold(title: string, cannot: readonly AClaimThatCannotHold[]): string {
  return sayInEnglish('delegation.inspection.claimsCannotHold', { title, claims: theClaimsThatCannotHoldSay(cannot) })
}

/**
 * WHETHER THIS INSPECTOR, IN THIS SESSION, MAY CHECK WHAT THIS RUN HANDED BACK. Refused unless a check of the run is
 * recorded in the caller's session (`theInspectorOfTheRun`). The verdict door asks it once before it writes anything.
 */
export function assertTheInspectorOfTheRun(run: string, workspaceId: string, inspector: RegisteredAgent, actor: Actor): void {
  const which = theInspectorOfTheRun(run, workspaceId, inspector, actor.sessionId ?? null)
  if (which === 'no check recorded') throw new PanelError(noCheckOfTheRunIsRecorded(run), 409)
  if (which === 'another check') throw new PanelError(theInspectorOfAnotherRun(run), 403)
}
/**
 * THE CHECK OF A HAND-BACK. The latest taker is refused first, whoever else it is. The person and the package maker
 * answer with answer and words, as before, and an inspector's check does not count against their answer, so the maker
 * still sees it and may answer it. The inspector of the run that wrote the latest unchecked hand-back judges each point;
 * any other caller is refused, and an inspector of a different run with a sentence of its own.
 */
export function checkThePackage(input: InsideInput & { answer?: unknown; words?: unknown; points?: unknown }) {
  const { task, pkg } = insidePackage(input)
  refuseTheTaker(pkg, input.actor)
  if (input.actor.type === 'human' || isTheMaker(pkg, input.actor)) {
    if (input.points !== undefined) throw new PanelError(ONLY_THE_INSPECTOR_SENDS_POINTS, 400)
    if (input.answer !== 'holds' && input.answer !== 'refused') throw new PanelError('answer must be holds or refused. Nothing was written.', 400)
    const words = requiredWords(input.words, 'words')
    assertTheMakerMayAnswer(pkg, input.actor)
    const theParentsOwn = (check: PackageCheck): boolean => !anInspectorsCheck(check)
    const reminder = aSecondCheckIsReminded(pkg, theLatestHandBackWaits(task, pkg, theParentsOwn), theParentsOwn)
    const check = anAct(pkg, { by: whoWrote(input.actor), at: nowStamp(), answer: input.answer, words })
    return { task: appendInside(task, pkg, 'checks', check, input.actor), check, ...(reminder === undefined ? {} : { reminder }) }
  }
  const inspector = theInspectorCardHeldBy(input.actor)
  if (inspector === null) {
    // ANY OTHER CALLER is refused as before, after the same two readings of its body.
    if (input.answer !== 'holds' && input.answer !== 'refused') throw new PanelError('answer must be holds or refused. Nothing was written.', 400)
    requiredWords(input.words, 'words')
    throw new PanelError(ONLY_THE_MAKER_MAY_ANSWER, 403)
  }
  if (input.answer !== undefined || input.words !== undefined) throw new PanelError(THE_INSPECTOR_SENDS_POINTS_ALONE, 400)
  const reminder = aSecondCheckIsReminded(pkg, theLatestHandBackWaits(task, pkg, anyCheck), anyCheck)
  // ONLY A HAND-BACK STORED BEFORE THE HAND-BACK DOOR ASKED FOR A RUN KEY NAMES NO RUN.
  const run = pkg.handedBack!.at(-1)!.run
  if (run === undefined) throw new PanelError(A_HAND_BACK_WITH_NO_RUN, 409)
  assertTheInspectorOfTheRun(run, input.workspaceId, inspector, input.actor)
  const parsed = z.array(aJudgedPoint).safeParse(input.points)
  if (!parsed.success) throw new PanelError(THE_INSPECTORS_POINTS_ARE_UNREADABLE, 400)
  const lack = whatThePointsLack(pkg.pointIds!, parsed.data.map((point) => point.pointId))
  if (lack !== null) throw new PanelError(theInspectorsPointsLack(task.title, lack), 400)
  const cannot = theClaimsThatCannotHold(pkg.handedBack!.at(-1)!.points, parsed.data)
  if (cannot.length > 0) throw new PanelError(theInspectorsClaimsCannotHold(task.title, cannot), 400)
  const handback = pkg.handedBack!.at(-1)!
  const points = parsed.data.map((point) => ({ ...point, outcome: thePointsOutcomeAfterTheCheck(point, handback.points.find((one) => one.pointId === point.pointId)!.outcome) }))
  const check = anAct(pkg, {
    by: whoWrote(input.actor), at: nowStamp(), run,
    answer: points.every((point) => point.holds) ? 'holds' as const : 'refused' as const,
    words: theInspectorsCheckSays(points), points,
  })
  return { task: appendInside(task, pkg, 'checks', check, input.actor), check, ...(reminder === undefined ? {} : { reminder }) }
}

/** One point of a package the run handed back, as the inspector is shown it. `says` is null when its backlog item cannot be read. */
export interface APointToJudge { pointId: string; says: string | null; outcome: PackagePointOutcome['outcome']; words: string }
/** One inside package whose latest hand-back the run wrote and that no check has answered since. */
export interface APackageToJudge { task: string; title: string; points: APointToJudge[] }
/** The packages a run handed back that wait for a check, and the tasks whose package the office could not read. */
export interface ThePackagesARunHandedBack { packages: APackageToJudge[]; unread: { task: string; title: string }[] }

/**
 * THE INSIDE PACKAGES THIS RUN HANDED BACK THAT WAIT FOR A CHECK: each task whose latest hand-back names this run and that
 * no check has answered since (`theLatestHandBackWaits`, the check door's own reading). The prompt lists them, and the
 * verdict door asks the verdict to judge each.
 */
export function thePackagesThisRunHandedBack(runId: string, workspaceId: string): ThePackagesARunHandedBack {
  if (!packageInspectionOf(getWorkspace(workspaceId)!.packageInspection)) return { packages: [], unread: [] }
  const rows = sqlite.prepare(`SELECT id FROM records WHERE workspace_id = ? AND kind = 'task' AND deleted_at IS NULL
    AND json_valid(data) AND json_extract(data, '$.package.handedBack[#-1].run') = ? ORDER BY id`).all(workspaceId, runId) as { id: string }[]
  const packages: APackageToJudge[] = []
  const unread: { task: string; title: string }[] = []
  for (const { id } of rows) {
    const task = getRecord(id)
    if (task === null) continue
    const pkg = packageOf(task.data)
    const latest = pkg?.handedBack?.at(-1)
    if (pkg === null || !pkg.pointIds || latest === undefined) { unread.push({ task: task.id, title: task.title }); continue }
    if (theLatestHandBackWaits(task, pkg, anyCheck) !== 'waits') continue
    packages.push({
      task: task.id,
      title: task.title,
      points: latest.points.map((point) => {
        const item = getRecord(point.pointId)
        return { pointId: point.pointId, says: item === null ? null : item.title, outcome: point.outcome, words: point.words }
      }),
    })
  }
  return { packages, unread }
}

/** The judgement a verdict gives of one package, as the verdict door takes it. */
export type AVerdictsPackage = { task: string; points: z.infer<typeof aJudgedPoint>[] }

/**
 * WHAT A VERDICT'S PACKAGES LACK: each package the run handed back that it leaves out, each it names that the run did
 * not hand back or names twice, each point a package's judgement leaves out, names twice or names though it is not one
 * of the package's points, and each point said to hold whose judgment does not match its handed-back outcome group
 * (`theClaimsThatCannotHold`). Empty when every package and point is judged once and the hold rule is kept.
 */
export function whatAVerdictsPackagesLack(waiting: readonly APackageToJudge[], given: readonly AVerdictsPackage[]): string[] {
  const lacks: string[] = []
  const tasks = given.map((one) => one.task)
  for (const one of waiting) if (!tasks.includes(one.task)) lacks.push(`it leaves out the package of "${one.title}" (${one.task})`)
  for (const task of new Set(tasks)) {
    const held = waiting.find((one) => one.task === task)
    if (held === undefined) { lacks.push(`${task} is not a package this run handed back that waits for a check`); continue }
    if (tasks.filter((one) => one === task).length > 1) { lacks.push(`it names the package of "${held.title}" (${task}) twice`); continue }
    const judged = given.find((one) => one.task === task)!.points
    const lack = whatThePointsLack(held.points.map((point) => point.pointId), judged.map((point) => point.pointId))
    if (lack !== null) lacks.push(`for "${held.title}" (${task}), ${thePointsLackSays(lack)}`)
    const cannot = theClaimsThatCannotHold(held.points, judged)
    if (cannot.length > 0) lacks.push(`for "${held.title}" (${task}), ${theClaimsThatCannotHoldSay(cannot)}`)
  }
  return lacks
}
export function theVerdictsPackagesLack(lacks: readonly string[]): string {
  return sayInEnglish('delegation.inspection.verdictClaimsCannotHold', { lacks: lacks.join('; ') })
}
export const ONLY_THE_INSPECTOR_JUDGES_PACKAGES =
  'Only the inspector judges the inside packages a run handed back; a starter’s release carries no packages. Nothing was written.'

/**
 * THE SENTENCES FOR EVERY POINT A VERDICT FINDS DOES NOT HOLD, in the order the verdict gives them. The verdict door
 * lists them under "To fix in the line's next round" with the check's other listed faults.
 */
export function thePointsThatDoNotHold(waiting: readonly APackageToJudge[], given: readonly AVerdictsPackage[]): string[] {
  const sentences: string[] = []
  for (const one of given) {
    const held = waiting.find((pkg) => pkg.task === one.task)
    if (held === undefined) continue
    for (const point of one.points) {
      if (point.holds) continue
      const claimed = held.points.find((p) => p.pointId === point.pointId)
      if (claimed === undefined) continue
      sentences.push(aPointThatDoesNotHoldSays({
        task: held.task, title: held.title, pointId: point.pointId, says: claimed.says,
        claimed: claimed.outcome, claimedWords: claimed.words, judged: point.judged, why: point.why,
      }))
    }
  }
  return sentences
}

// ============================================================================ who a stored writer is, and the blocks of a task

/** The participant a stored writer names: the person, or the one agent its string names. Null when it names no one agent. */
function theParticipantAWriterNames(by: { actorType: string; actorId: string }): ParticipantRef | null {
  if (by.actorType === 'human') return { kind: 'person', id: by.actorId }
  const agent = by.actorType === 'agent' ? theOneAgentAStringNames(sqlite, by.actorId) : null
  return agent === null ? null : { kind: 'agent', id: agent.id }
}

/**
 * THE PLAN BLOCKS LINKED TO A TASK BY `relates_to`, from either end, sorted by id. A link Mole Office worked out itself
 * (`inferred`) is not counted, because nobody said the block and the task are one piece of work.
 */
function theBlocksLinkedTo(taskId: string): string[] {
  const rows = sqlite.prepare(`SELECT r.id AS id FROM links l JOIN records r ON r.id = CASE WHEN l.from_id = ? THEN l.to_id ELSE l.from_id END
    WHERE l.type = 'relates_to' AND l.inferred = 0 AND (l.from_id = ? OR l.to_id = ?) AND r.kind = ? AND r.deleted_at IS NULL`)
    .all(taskId, taskId, taskId, BLOCK_KIND) as { id: string }[]
  return [...new Set(rows.map((row) => row.id))].sort()
}

// ============================================================================ whom a package's lines go to

/**
 * THE NOTICES THAT STAY WITH THEIR ADDRESSEE, though the run they are about handed back a package. The rule: an ask
 * stays with its addressee when only that addressee may do what it asks. Each row says why.
 */
export const A_PACKAGES_NOTICES_THAT_STAY: readonly NoticeKind[] = [
  // Only the run's starter may check the run when no inspector is appointed.
  'noInspectorCheckItYourself',
  // Only the secretary may act when a run finishes in a project with no inspector.
  'noInspectorTellTheSecretary',
  // Only the secretary may confirm the deletes an entry makes before it lands.
  'confirmTheDeletes',
  // Only the secretary may press to land an entry that touches a sensitive path.
  'pressToLand',
  // Only a person may look at an overdue hand-back before anything is taken back.
  'takeBackNeedsAPerson',
  // Only a person may look at a landing that stalled.
  'aLandingStalled',
  // Only the run's starter may confirm the report before the run closes. The check does not mark this line, so it stays anyway.
  'checkedAndReleased',
  // The take is told to the package's maker, who made the package.
  'packageTaken',
  // Only the package's maker may answer the restatement.
  'packageAligned',
  // The answer is told to the one that took the package, who wrote the restatement.
  'packageAlignAnswered',
  // The hand-back is told to the package's maker, who made the package.
  'packageHandedBack',
  // The maker's acceptance is told to the one that took the package, who handed it back.
  'packageAccepted',
  // The points the maker returned go back to the one that took the package, who must hand them back again.
  'packageReturned',
]

/** The same participant, an agent read by the one row its string names. */
function theSameParticipant(one: unknown, other: ParticipantRef): boolean {
  if (!isBag(one) || one['kind'] !== other.kind || typeof one['id'] !== 'string') return false
  if (other.kind !== 'agent') return one['id'] === other.id
  return one['id'] === other.id || theOneAgentAStringNames(sqlite, one['id'])?.id === other.id
}

/**
 * A PACKAGE'S LINES GO TO THE SUPERVISOR THAT TOOK IT, not to the secretary that made it (13y round 164, package 1). The
 * record door (`createRecordWithReport` in lib/records.ts) asks this for a message Mole Office writes itself and for one
 * of the check's own lines (`theChecksOwnLine`), after the reach check and before the routing. A message an agent or
 * the person writes is never asked about.
 *
 * It looks for a package only when the message names `aboutRun`. When the latest hand-back of an inside package names
 * that run and the message is addressed to the package's maker, the maker is replaced in `to` by the latest one that
 * took the package inside, named once, and `extra.forThePackage` says which package moved it. The first such package by
 * task id counts. A notice in `A_PACKAGES_NOTICES_THAT_STAY` is left as it is addressed.
 *
 * A RETIRED SUPERVISOR. One of the check's own lines is left with the maker, because the reach check passed on the maker
 * and would have refused the retired supervisor. The office's own line moves, and the routing then sends it up the
 * retired supervisor's own chain of starters, as it does for any office line to a retired agent.
 *
 * It changes `data` in place.
 */
export function aPackagesLineGoesToItsSupervisor(data: Record<string, unknown>, theChecksOwnLine: boolean): void {
  const run = data['aboutRun']
  const to = data['to']
  if (typeof run !== 'string' || !Array.isArray(to)) return
  if (A_PACKAGES_NOTICES_THAT_STAY.includes(data['notice'] as NoticeKind)) return
  const moves = thePackageALineMovesFor(run, to)
  if (moves === null) return
  const { task, maker, supervisor } = moves
  if (theChecksOwnLine && (readParticipant(supervisor) as RegisteredAgent | null)?.retired === true) return
  // THE SUPERVISOR IS NAMED ONCE: the office adds a run's own agent to a line about the run, and the record door
  // refuses an agent named twice.
  const moved = to.map((one) => theSameParticipant(one, maker) ? supervisor : one)
  const first = moved.findIndex((one) => theSameParticipant(one, supervisor))
  data['to'] = moved.filter((one, at) => at === first || !theSameParticipant(one, supervisor))
  data['extra'] = { ...asBag(data['extra']), forThePackage: { task, maker: maker.id, supervisor: supervisor.id } }
}

/**
 * THE PACKAGE A LINE ABOUT A RUN MOVES FOR: the first inside package by task id whose latest hand-back names the run,
 * whose maker and latest taker are two agents, and whose maker the line is addressed to. Null when there is none. The
 * redirect above and the seal's starter below both ask it, so the two cannot disagree about which line moves.
 */
function thePackageALineMovesFor(run: string, to: readonly unknown[]): { task: string; title: string; maker: ParticipantRef; supervisor: ParticipantRef } | null {
  const rows = sqlite.prepare(`SELECT id FROM records WHERE kind = 'task' AND deleted_at IS NULL
    AND json_valid(data) AND json_extract(data, '$.package.handedBack[#-1].run') = ? ORDER BY id`).all(run) as { id: string }[]
  for (const { id } of rows) {
    const task = getRecord(id)
    const pkg = task === null ? null : packageOf(task.data)
    const take = pkg?.takenInside?.at(-1)
    if (task === null || pkg === null || take === undefined) continue
    const maker = theParticipantAWriterNames(pkg.by)
    const supervisor = theParticipantAWriterNames(take.by)
    if (maker?.kind !== 'agent' || supervisor?.kind !== 'agent' || maker.id === supervisor.id) continue
    if (!to.some((one) => theSameParticipant(one, maker))) continue
    return { task: task.id, title: task.title, maker, supervisor }
  }
  return null
}

/** Who the starter's line of a seal goes to, or why it goes to nobody: the shape `whoIsToldOfASeal` in lib/sealed-tip.ts answers. */
type WhoIsToldOfASeal = { to: ParticipantRef } | { because: string }

/**
 * THE SEAL LINE IS WRITTEN TO NOBODY WHEN ITS RUN'S OWN AGENT WOULD BE HANDED IT. The line that says a run was sealed
 * is written for the run's starter: it says the run's own message was sent to the reader before the seal. When the run
 * handed back an inside package and the one that took the package is the run's own agent, the redirect above would hand
 * the line to that agent, for whom those words are false. So nobody is told, and the seal stores why. Only this line,
 * and only then; `whoIsToldOfASeal` itself is unchanged. lib/sealed-tip.ts asks this where it writes the seal.
 */
export function whoIsToldOfASealOnceAPackageMoves(run: string, agent: { id: string; handle: string }, told: WhoIsToldOfASeal): WhoIsToldOfASeal {
  if (!('to' in told)) return told
  const moves = thePackageALineMovesFor(run, [told.to])
  if (moves === null || moves.supervisor.id !== agent.id) return told
  return { because: sayInEnglish('delegation.seal.nobodyTold', { title: moves.title, task: moves.task, agent: agent.handle }) }
}
