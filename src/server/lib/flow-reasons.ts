// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW'S STEPS KEEP THEIR REASONS, AND A DECISION ITS BASIS, ONE LEVEL
 * DOWN.
 *
 * On a write, this file refuses what `whatTheFlowStepsLack` in src/shared/flow-steps.ts finds, each with its code and in
 * words (wave 13p round 33 moved the check there, so the flow editor runs the same one):
 *   - a flow step added or changed with no `why`;
 *   - a flow step added or changed with no `sources`;
 *   - a write that adds, changes or removes a step without adding a `step_changes` entry, or whose entry names no cause.
 * A step nobody has touched is never refused for lacking a why: the flows filed before the decision have none, and
 * their reasons are written afterwards, step by step. Each record a source, a cause or a decision's `basis` names must
 * be there. Earlier `step_changes` entries stay as they are.
 *
 * Whoever changes or removes a step is shown its why and sources first. A write that changes a step without a change
 * entry is refused, and the refusal quotes what the old steps said; the record page shows them in its edit form.
 *
 * On a read, `foldTheSecondLevel` leaves the reasons, sources, changes and basis out of what an agent is handed until
 * it asks with ?secondLevel=show, and says what it left out and how to ask.
 */
import { inArray } from 'drizzle-orm'
import type { FlowRefusalCode } from '@shared/refusal-codes.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import { idsIn, whatTheFlowStepsLack, type FlowStepsLack } from '@shared/flow-steps.ts'
import type { FlowWriteLack } from '@shared/flow-step-writes.ts'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { records } from '../db/schema.ts'
import { PanelError } from './panel-error.ts'
import { whyTheAppliesToIsUnreadable } from '@shared/flow-applies-to.ts'
import { whyTheRetiredMarkIsUnreadable } from '@shared/flow-retired.ts'
import { isAProjectOnAList } from '@shared/workspaces.ts'
import { theRoleCards } from './roles.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { foldTheSecondLevel, isObject, SECOND_LEVEL_PARAM, SECOND_LEVEL_SHOW, type Json, type SecondLevelHeld } from '@shared/second-level-fold.ts'

export { SECOND_LEVEL_PARAM, SECOND_LEVEL_SHOW }

/** The ids among these that are not a live record anywhere in the office. */
export function missingRecords(ids: readonly string[]): string[] {
  const wanted = [...new Set(ids)]
  if (wanted.length === 0) return []
  // IN PIECES (src/server/db/in-pieces.ts): the ids come from the request body, a decision's `basis` among them, and
  // nothing limits how many records a basis names. The ids go into a set, so the order of
  // the pieces does not matter.
  const live = new Set(
    readInPieces(wanted, (piece) =>
      db.select({ id: records.id, deletedAt: records.deletedAt }).from(records).where(inArray(records.id, piece)).all(),
    )
      .filter((row) => row.deletedAt === null)
      .map((row) => row.id),
  )
  return wanted.filter((id) => !live.has(id))
}

const stepName = (step: Json): string => `step ${typeof step['n'] === 'number' ? step['n'] : '?'} ("${String(step['does'] ?? '')}")`

/** What one old step said, as the refusal quotes it to whoever is changing or removing it. */
function whatItSaid(step: Json): string {
  const why = typeof step['why'] === 'string' && step['why'].trim() !== '' ? `why: ${step['why']}` : 'why: not written yet'
  const sources = idsIn(step['sources'])
  return `${stepName(step)}, ${why}; sources: ${sources.length > 0 ? sources.join(', ') : 'none written yet'}`
}

/**
 * THE SIX REFUSALS ON A FLOW, against what the record held before this write (`before` is null on a create, and on a
 * write that makes a record a flow). What is lacking is worked out by `whatTheFlowStepsLack` in src/shared/flow-steps.ts,
 * which the flow editor asks too; this refuses the first thing it finds, with its code and the English that names the
 * steps. Nothing is written when it throws.
 */
export function checkTheFlowSteps(next: unknown, before: unknown): void {
  const { lacks, gone } = whatTheFlowStepsLack(next, before, missingRecords)
  refuseTheFirstLack(lacks, gone)
}

/**
 * WHOM A FLOW IS FOR, `applies_to`, IS REFUSED WHEN THE OFFICE CANNOT STORE IT (wave 13p round 40): a role that is not a
 * card, a rung not on the tree, a special flow with no project or a general one with one, a project that is not there.
 * Asked only when the write changes it, so a write that leaves it alone never needs the role cards. Called by
 * createRecord and patchRecord BEFORE the shape check of src/server/lib/validate.ts, so a key `applies_to` does not hold
 * meets this coded refusal rather than the shape's uncoded one.
 */
export function checkWhomTheFlowIsFor(next: unknown, before: unknown): void {
  const value = isObject(next) ? next['applies_to'] : undefined
  const was = isObject(before) ? before['applies_to'] : undefined
  if (JSON.stringify(value) === JSON.stringify(was)) return
  const why = whyTheAppliesToIsUnreadable(value, {
    roles: theRoleCards().cards,
    projectIsThere: (id) => getWorkspace(id) !== null && isAProjectOnAList(id),
  })
  if (why !== null) throw aCodedFlowRefusal('flowAppliesToUnreadable', `${why} Nothing was written.`, 400)
}

/**
 * A FLOW'S RETIRED MARK, `retired`, IS REFUSED WHEN THE OFFICE CANNOT STORE IT (wave 13p round 40b): no why, no day, no
 * one who retired it, or nothing named in its place, or a record named that is not there. Asked only when the write
 * changes it, and before the shape check, as `checkWhomTheFlowIsFor` is.
 */
export function checkTheRetiredMark(next: unknown, before: unknown): void {
  const value = isObject(next) ? next['retired'] : undefined
  const was = isObject(before) ? before['retired'] : undefined
  if (JSON.stringify(value) === JSON.stringify(was)) return
  const why = whyTheRetiredMarkIsUnreadable(value, { recordIsThere: (id) => missingRecords([id]).length === 0 })
  if (why !== null) throw aCodedFlowRefusal('flowRetiredUnreadable', `${why} Nothing was written.`, 400)
}

/**
 * THE REFUSAL OF THE FIRST THING A FLOW WRITE LACKS, if it lacks anything: one of the six above, or one of what
 * `buildAFlowStageWrite` in src/shared/flow-step-writes.ts finds for the Flows page's write doors (round 34).
 */
export function refuseTheFirstLack(lacks: readonly (FlowStepsLack | FlowWriteLack)[], gone: readonly Json[]): void {
  const first = lacks[0]
  if (first === undefined) return
  // Whoever changes or removes a step is shown what it said, in whichever refusal the write meets first.
  const shown = gone.length > 0 ? ` What the steps you are changing or removing said: ${gone.map(whatItSaid).join(' | ')}.` : ''
  // The short reason the old refusals sent beside the message is still sent, read from the word list that holds it,
  // so a reader of the reply's `reason` loses nothing now that the refusal has a code (round 33b).
  throw aCodedFlowRefusal(first.code, theEnglishOf(first, shown), 400)
}

/** A refusal of a flow write with its code, its English and the short reason from the word list. */
export function aCodedFlowRefusal(code: FlowRefusalCode, english: string, status: number): PanelError {
  return new PanelError(english, status, undefined, undefined, sayInEnglish(`server.${FLOW_CODE[code]}`), { code: FLOW_CODE[code], values: {} })
}

/** The refusal codes of a flow write, one for one, read from a table the type checker holds to codes. */
const FLOW_CODE: Record<FlowRefusalCode, FlowRefusalCode> = {
  flowStepNoWhy: 'flowStepNoWhy',
  flowStepNoSources: 'flowStepNoSources',
  flowStepChangesRewritten: 'flowStepChangesRewritten',
  flowStepChangeUnrecorded: 'flowStepChangeUnrecorded',
  flowStepChangeNoCause: 'flowStepChangeNoCause',
  flowStepRecordNotThere: 'flowStepRecordNotThere',
  flowVersionStale: 'flowVersionStale',
  flowProjectNotThere: 'flowProjectNotThere',
  flowStageNotThere: 'flowStageNotThere',
  flowStagePlaceNotThere: 'flowStagePlaceNotThere',
  flowStageAlreadyThere: 'flowStageAlreadyThere',
  flowStageUnchanged: 'flowStageUnchanged',
  flowChangeNoWhy: 'flowChangeNoWhy',
  flowAppliesToUnreadable: 'flowAppliesToUnreadable',
  flowRetiredUnreadable: 'flowRetiredUnreadable',
}

/** The English refusal an agent reads, naming the steps, entries or records it is about. */
function theEnglishOf(lack: FlowStepsLack | FlowWriteLack, shown: string): string {
  switch (lack.code) {
    case 'flowStepNoWhy':
      return (
        `A flow step that is added or changed must say why it is there. ` +
        `${lack.steps.map(stepName).join('; ')} has no \`why\`. Write one or two sentences on what goes wrong without the step. ` +
        `A step left exactly as it was is not asked for one.${shown} Nothing was written.`
      )
    case 'flowStepNoSources':
      return (
        `A flow step that is added or changed must name its sources. ` +
        `${lack.steps.map(stepName).join('; ')} has no \`sources\`. Name at least one record by id: a decision, a report, a message.${shown} ` +
        `Nothing was written.`
      )
    case 'flowStepChangesRewritten':
      return (
        `A flow's \`step_changes\` may only grow at its end: this write changes or removes ${lack.earlier} earlier ` +
        `entr${lack.earlier === 1 ? 'y' : 'ies'}. Read the flow with ?secondLevel=show, keep every entry it holds, and add yours after them. ` +
        `Nothing was written.`
      )
    case 'flowStepChangeUnrecorded':
      return (
        `This write changes the flow's steps, so it must add an entry to \`step_changes\` naming the record that caused it` +
        `: {"at", "what", "why", "cause"}, after the entries already there.${shown} Nothing was written.`
      )
    case 'flowStepChangeNoCause':
      return `Each new entry in a flow's \`step_changes\` names the record that caused it, in \`cause\`; ${lack.entries} does not.${shown} Nothing was written.`
    case 'flowStepRecordNotThere':
      return (
        `A flow step's sources and a change's cause are records that are there; ${lack.ids.map((id) => `"${id}"`).join(', ')} ` +
        `${lack.ids.length === 1 ? 'is' : 'are'} not. Nothing was written.`
      )
    case 'flowStageNotThere':
      return (
        `The flow has ${lack.count === 1 ? '1 stage' : `${String(lack.count)} stages`}, so there is no stage ${String(lack.n)}. ` +
        `A stage is named by its place, counting from 1. Nothing was written.`
      )
    case 'flowStagePlaceNotThere':
      return `A stage can go at a place from 1 to ${String(lack.most)}; ${String(lack.place)} is not one. Nothing was written.`
    case 'flowStageAlreadyThere':
      return `Stage ${String(lack.n)} is already at place ${String(lack.n)}, so there is nothing to move. Nothing was written.`
    case 'flowStageUnchanged':
      return (
        `This change leaves stage ${String(lack.n)} exactly as it is: its does, evidence, why and sources are the same. ` +
        `Nothing was written, and no change entry either.`
      )
    case 'flowChangeNoWhy':
      return `A move or a removal of a stage must say why, in \`why\`; it is written into the flow's record of changes. Nothing was written.`
  }
}

/** A DECISION'S BASIS NAMES RECORDS THAT ARE THERE. Asked only when a write sends `basis`. No limit on how many. */
export function checkTheDecisionBasis(data: unknown): void {
  if (!isObject(data)) return
  const missing = missingRecords(idsIn(data['basis']))
  if (missing.length === 0) return
  throw new PanelError(
    `A decision's \`basis\` names the records it was based on, and each must be there; ${missing.map((id) => `"${id}"`).join(', ')} ` +
      `${missing.length === 1 ? 'is' : 'are'} not. Nothing was written.`,
    400,
    undefined,
    undefined,
    'A decision\'s basis names a record that is not there.',
  )
}

export { foldTheSecondLevel, type SecondLevelHeld }

/**
 * WHETHER A READ ASKED FOR THE SECOND LEVEL. Only `show` asks; any other value is refused rather than read as no, so a
 * caller that misspelt it is told instead of being handed less than it asked for.
 */
export function theSecondLevelIsAsked(query: unknown): boolean {
  const raw = isObject(query) ? query[SECOND_LEVEL_PARAM] : undefined
  if (raw === undefined) return false
  if (raw === SECOND_LEVEL_SHOW) return true
  throw new PanelError(
    `The query string is not usable: ${SECOND_LEVEL_PARAM} takes only "${SECOND_LEVEL_SHOW}", which hands back a flow's ` +
      `reasons, sources and changes and a decision's basis. Leave it out for the main content alone.`,
    400,
    undefined,
    undefined,
    `${SECOND_LEVEL_PARAM} takes only "${SECOND_LEVEL_SHOW}".`,
  )
}

/**
 * ONE RECORD A DECISION WAS BASED ON, as a reader is shown it. Its title is given only when the record is in the
 * decision's own project: a record elsewhere, a message in the message centre among them, is named by id and kind, so
 * a reply never carries the words of a record its reader may not be allowed to read.
 */
export interface BasisEntry {
  id: string
  kind: string | null
  title: string | null
  /** Why there is no title: the record is in another project, or it is not there (deleted since, or never was). */
  untitledBecause: 'another-project' | 'not-there' | null
}

export { theBasisOf } from '../db/the-basis-of.ts'
