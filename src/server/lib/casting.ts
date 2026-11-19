// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { moleOffice } from '@shared/participants.ts'
import { thePersonIsProved } from '@shared/the-person-proved.ts'
import { randomUUID } from 'node:crypto'
import { readLauncherSelection, nativeRefusalWithCode, theRowsEffortUnder } from '../../config/launcher-selection.mjs'
import { THE_PROGRAMS_THAT_TAKE_SETTINGS, WHY_CODEX_CANNOT_NAME_IT, aPartCodexCannotName, theSettingTheLauncherKeeps } from '../../config/the-launchers-own-settings.mjs'
import { readCastingNative, type CastingNativeState, type CastingNative, type CastingHold } from '@shared/casting.ts'
import { getRecord } from './records/reading.ts'
import { createRecord } from './records.ts'
import { theAgentOfARunForItsSeal } from './inspection.ts'
import { THE_OFFICE } from './the-office.ts'
import { whoIsToldOfTheRun } from './who-is-told-of-a-seal.ts'
import { THE_INSPECTOR } from '@shared/roles.ts'
import { aProviderIfThere, aProviderRefusal } from './the-provider-table.ts'
/**
 * THE CASTING TABLE (选角表): ITS ONE READER, ITS WRITERS AND ITS HISTORY, by two
 * decisions.
 *
 * The shapes and the rule for which row the tools take are in src/shared/casting.ts. This file reads
 * the `casting_rows` and `casting_row_changes` tables (migration 0190, with probability added by
 * migration 0268, and labels and Out until by migration 0349), answers the doors in
 * src/server/api/casting.ts, and gives `theModelARunGets` in lib/run-models.ts the row the tools take
 * for a role and a project, which is how a builder's model and the check's model come from this table
 * and nowhere else. The tables of migration 0189, `casting` and `casting_changes`, are kept as they
 * were and are not read.
 *
 * WHICH ROW THE TOOLS TAKE. In each scope (every project, or one project) that has any row, exactly one
 * row carries the mark. A project's own rows for a role replace the every-project rows for that role
 * as a whole: the tools take the project's marked row if the project has any row for the role, and the
 * every-project marked row if it has none. `theRowTheToolsTake` in src/shared/casting.ts applies it.
 *
 * HOW THE WRITERS KEEP EXACTLY ONE MARK. The first row added in a scope carries it. Moving it is one
 * write that takes it from the old row in the same transaction. Removing the marked row while other
 * rows remain in its scope is refused; removing the last row of a scope is allowed. A unique index in
 * the migration keeps two marks in one scope out of the table even if a writer here were wrong.
 *
 * NOTHING IS CACHED. Every answer reads the table again, so a change reaches the next run.
 *
 * A WRITE CHECKS EVERYTHING BEFORE IT WRITES ANYTHING: the role is a card that exists, the project
 * exists, the program is one the office knows, every decision named is a decision record that exists,
 * and every string is trimmed. Then the rows and their history rows are written in one transaction,
 * so a refusal leaves both tables as they were.
 */
import {
  CASTING_CELLS,
  CASTING_CHANGE_KINDS,
  CASTING_PROGRAMS,
  CASTING_LABEL_RULES,
  NOBODY_HAS_CAST_THIS_ROLE,
  anEmptyRow,
  isACastingProgram,
  normaliseCastingOutUntil,
  normaliseCastingProbability,
  readCastingLabelIds,
  readCastingProbability,
  readCastingCellSource,
  theRowTheToolsTake,
  type CastingCell,
  type CastingCellSource,
  type CastingChangeKind,
  type CastingFor,
  type CastingHistory,
  type CastingHistoryEntry,
  type CastingImage,
  type CastingLabel,
  type CastingReading,
  type CastingRoleCard,
  type CastingRow,
  type CastingStoredCell,
  type CastingWritten,
} from '@shared/casting.ts'
import { nowStamp, theClockZone } from '@shared/time.ts'
import { theLimitsOn, type CastingLimits } from '@shared/casting-roll.ts'
import { THE_WORKER } from '@shared/roles.ts'
import { sqlite } from '../db/client.ts'
import { theCastingLabels, theLabelIdsNamed, theLastNamesOf } from './casting-labels.ts'
import { theDrawsOfEachLabel, theLimitsNow } from './casting-roll.ts'
import { participantForActor } from './participant-for-actor.ts'
import { type Actor } from './records.ts'
import { PanelError } from './panel-error.ts'
import { theRoleCards } from './roles.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import { rowsOfRole } from './the-rows-in-force.ts'
import { CURRENT_IMAGE } from './the-rows-in-force.ts'
import { aCastingThatExists } from './a-casting-by-id.ts'
import { rowOf } from './a-casting-by-id.ts'
import { heldById } from './a-casting-by-id.ts'
import { stateOf } from './a-casting-by-id.ts'
import { readAnImage } from './a-casting-by-id.ts'
import { theSelectionRevisionOf } from './the-casting-in-force.ts'
import { selectionOfACasting } from './the-casting-in-force.ts'

/** One row of `casting_rows` as SQLite answers it. */
export type Held = {
  id: number
  current_image?: string | null
  role: string
  project: string
  marked: number
  changed_at: string
  changed_by_kind: string
  changed_by_id: string
  authority: string | null
} & Record<CastingCell | `${CastingCell}_from`, string | null>

/** The role cards, in the order the declaration lists them. */
function theRoles(): string[] {
  return theRoleCards().cards.map((card) => card.name)
}

function scopeWords(project: string | null): string {
  return project === null ? 'every project' : project
}

export { cellsOf } from './a-casting-by-id.ts'

export { CURRENT_IMAGE } from './the-rows-in-force.ts'
export { nativeState } from './a-casting-by-id.ts'
export { stateOf } from './a-casting-by-id.ts'
function changedNative(row: CastingNativeState, write: { native?: CastingNative | null; hold?: null }): CastingNativeState {
  if (write.native === undefined && !Object.hasOwn(row, 'native')) return {}
  return { native: write.native === undefined ? row.native : readCastingNative(write.native), selectionRevision: randomUUID(), hold: null }
}
/**
 * A ROW'S SETTINGS GO TO ITS PROGRAM, so the door refuses them where that program cannot take them: a row with no
 * program, a program outside THE_PROGRAMS_THAT_TAKE_SETTINGS, a name the launcher sets itself, or, for
 * Codex, a name with a part its -c cannot name. The launcher asks theSettingTheLauncherKeeps and aPartCodexCannotName
 * again at start (src/config/launcher-selection.mjs).
 */
function refuseSettingsTheProgramCannotTake(id: number | null, program: string | null, native: CastingNativeState['native']): void {
  const settings = native?.settings
  if (settings === undefined) return
  const row = id === null ? 'This new Casting row' : `Casting row ${String(id)}`
  if (program === null) {
    throw new PanelError(`${row} has no program, so it cannot hold settings, which go to its program. Nothing was changed.`, 400, undefined, undefined, undefined,
      id === null ? {code:'castingNewRowSettingsWithNoProgram',values:{}} : {code:'castingRowSettingsWithNoProgram',values:{id:String(id)}})
  }
  if (!THE_PROGRAMS_THAT_TAKE_SETTINGS.includes(program)) {
    throw new PanelError(`${row} runs ${program}, which takes no settings from a Casting row. Nothing was changed.`, 400, undefined, undefined, undefined,
      id === null ? {code:'castingNewRowSettingsNotForProgram',values:{program}} : {code:'castingRowSettingsNotForProgram',values:{id:String(id),program}})
  }
  const kept = theSettingTheLauncherKeeps(program, settings)
  if (kept !== null) {
    throw new PanelError(`${row} sets ${kept.name} for ${program}, which the launcher sets itself (${kept.guards}). A row may not set it. Nothing was changed.`,
      400, undefined, undefined, undefined, id === null ? {code:'castingNewRowSetsAGuardedName',values:{name:kept.name,program,guards:kept.guards}}
        : {code:'castingRowSetsAGuardedName',values:{id:String(id),name:kept.name,program,guards:kept.guards}})
  }
  if (program !== 'codex') return
  for (const setting of settings) {
    const part = aPartCodexCannotName(setting.name)
    if (part === undefined) continue
    throw new PanelError(`${row} sets ${setting.name} for codex, and Codex's -c cannot name its part "${part}". ${WHY_CODEX_CANNOT_NAME_IT} Nothing was changed.`,
      400, undefined, undefined, undefined, id === null ? {code:'castingNewRowSetsAPartCodexCannotName',values:{name:setting.name,part}}
        : {code:'castingRowSetsAPartCodexCannotName',values:{id:String(id),name:setting.name,part}})
  }
}
/**
 * A ROW'S PROVIDER GOES TO ITS PROGRAM, so the door refuses a provider-table row the row's program cannot take from it:
 * a row with no program, a provider no row of the table has, a provider not for the row's program, and every program but
 * dsh and codex, the only two that take their key from a provider so far, and only for a check. A row whose provider's key
 * is not set is stored: the key may be set later, and the check says so when it asks (src/server/lib/run-models.ts).
 */
function refuseAProviderTheRowCannotName(role: string, program: string | null, native: CastingNativeState['native']): void {
  const provider = native?.providerRow
  if (provider === undefined) return
  if (program === null) throw aProviderRefusal('castingProviderRowNoProgram', { provider })
  const held = aProviderIfThere(provider)
  if (held === null) throw aProviderRefusal('castingProviderRowNotFound', { provider })
  if (!(held.programs as readonly string[]).includes(program)) throw aProviderRefusal('castingProviderRowNotForTheProgram', { provider, program, programs: held.programs.join(', ') })
  if (program !== 'dsh' && program !== 'codex') throw aProviderRefusal('castingProviderRowNotYet', { provider, program })
  if (role !== THE_INSPECTOR) throw aProviderRefusal('castingProviderRowOnlyForTheInspector', { provider, role })
}

export { theSelectionRevisionOf } from './the-casting-in-force.ts'

/** The ids of the Casting rows whose selection names provider `provider`, in every role and scope. */
export function theCastingRowsThatNameAProvider(provider: string): number[] {
  return (sqlite.prepare(`SELECT *, ${CURRENT_IMAGE} FROM casting_rows ORDER BY id`).all() as Held[]).map(rowOf)
    .filter((row) => row.native?.providerRow === provider).map((row) => row.id)
}

export { rowOf } from './a-casting-by-id.ts'

export { ROWS_OF_ROLE } from './the-rows-in-force.ts'

export { rowsOfRole } from './the-rows-in-force.ts'

export { heldById } from './a-casting-by-id.ts'

/**
 * One role's castings, grouped by scope: every project first, then each project in the order of its id. Each row
 * carries what the office's limits say of its program now. A worker's list also carries what the roll would do for
 * work of each label, because the roll reads labels only for a worker started from a brief.
 */
function theCardOf(role: string, rows: readonly CastingRow[], labels: readonly CastingLabel[], limits: CastingLimits, now: number): CastingRoleCard {
  if (rows.length === 0) return { role, scopes: [], says: NOBODY_HAS_CAST_THIS_ROLE }
  const projects = [...new Set(rows.map((row) => row.project).filter((one): one is string => one !== null))].sort()
  const scopes = [null, ...projects]
    .map((project) => {
      const castings = rows.filter((row) => row.project === project)
      return {
        project,
        projectTitle: project === null ? null : (getWorkspace(project)?.title ?? project),
        castings: castings.map((row) => ({ ...row, officeOut: theLimitsOn(row.cells.program.value, row.cells.model.value, limits) })),
        draws: role === THE_WORKER ? theDrawsOfEachLabel(role, castings, labels, limits, now) : null,
      }
    })
    .filter((scope) => scope.castings.length > 0)
  return { role, scopes, says: null }
}

/**
 * WHAT `GET /api/casting` ANSWERS: every role card with its castings. A role the table holds that the
 * declaration no longer names is listed after the cards, rather than dropped, so nothing stored is hidden.
 */
export function theCastingTable(): CastingReading {
  const held = (sqlite.prepare(`SELECT *, ${CURRENT_IMAGE} FROM casting_rows ORDER BY id`).all() as Held[]).map(rowOf)
  const roles = theRoles()
  const others = [...new Set(held.map((row) => row.role).filter((role) => !roles.includes(role)))].sort()
  const labels = theCastingLabels()
  const now = Date.now()
  const limits = theLimitsNow(now)
  return {
    roles: [...roles, ...others].map((role) => theCardOf(role, held.filter((row) => row.role === role), labels, limits, now)),
    programs: CASTING_PROGRAMS,
    labels,
    rules: CASTING_LABEL_RULES,
    officeTimeZone: theClockZone(),
  }
}

/** A role the declaration holds, or a 404 naming the cards. */
function aRoleThatExists(role: string): string {
  const name = role.trim()
  if (!theRoles().includes(name)) {
    throw new PanelError(`There is no role card called "${role}". The cards are ${theRoles().join(', ')}. Nothing was written.`, 404)
  }
  return name
}

/** A project that exists, or null for every project, or a 404. */
function aProjectThatExists(project: string | null | undefined): string | null {
  if (project === null || project === undefined) return null
  const id = project.trim()
  if (id === '') return null
  if (getWorkspace(id) === null) throw new PanelError(`There is no project called "${project}". Nothing was written.`, 404)
  return id
}

export { aCastingThatExists } from './a-casting-by-id.ts'

export { theCastingInForce } from './the-casting-in-force.ts'

export { theRowsInForce } from './the-rows-in-force.ts'

/** WHAT `GET /api/casting/for/:role` ANSWERS: what a tool asks before it starts an agent of that role. */
export function castingFor(role: string, project: string | null | undefined): CastingFor {
  const name = aRoleThatExists(role)
  const where = aProjectThatExists(project)
  const taken = theRowTheToolsTake(rowsOfRole(name), where)
  const inWords = `${name}${where === null ? '' : ` in ${where}`}`
  if (taken === null) {
    return {
      role: name,
      project: where,
      scope: null,
      casting: null,
      program: null,
      model: null,
      effort: null,
      cells: anEmptyRow(),
      empty: [...CASTING_CELLS],
      says: `The Casting table marks no casting for ${inWords}, so the tools have no row to take.`,
    }
  }
  const { row, scope } = taken
  const cells = row.cells
  const empty = CASTING_CELLS.filter((cell) => cells[cell].value === null)
  const named = (['program', 'model', 'effort'] as const).filter((cell) => cells[cell].value !== null).map((cell) => `${cell} ${String(cells[cell].value)}`)
  const whose = scope === 'the project' ? `${where ?? ''}'s own marked casting` : 'the every-project marked casting'
  const says =
    `The tools take casting ${String(row.id)} for ${inWords}, ${whose}. ` +
    (named.length === 0 ? 'It names no program, model or effort.' : `It casts ${name} with ${named.join(', ')}.`) +
    (named.length !== 0 && named.length < 3 ? ` It names no ${(['program', 'model', 'effort'] as const).filter((cell) => cells[cell].value === null).join(', no ')}.` : '')
  return { role: name, project: where, scope, casting: row, program: cells.program.value, model: cells.model.value, effort: cells.effort.value, cells, empty, says }
}

/** One cell as a write names it: a value, or null to empty it, and the decision it comes from. */
export interface CastingCellWrite {
  value: string | null
  decision?: string | null
}

/** The cells one write names. */
export type CastingCellsWrite = Partial<Record<CastingCell, CastingCellWrite>>

/** A decision record that exists and is not deleted, with the project it is filed in; or a 400. */
function aDecisionThatExists(id: string, cell: CastingCell): { id: string; project: string } {
  const row = sqlite.prepare('SELECT id, workspace_id, kind, deleted_at FROM records WHERE id = ?').get(id) as
    | { id: string; workspace_id: string; kind: string; deleted_at: string | null }
    | undefined
  if (row === undefined) {
    throw new PanelError(`The ${cell} names the decision "${id}", and Mole Office holds no record with that id. Nothing was written.`, 400, undefined, undefined, undefined, { code: 'castingNoSuchDecision', values: { id } })
  }
  if (row.kind !== 'decision') {
    throw new PanelError(`The ${cell} names "${id}", which is a record but not a decision. Nothing was written.`, 400, undefined, undefined, undefined, { code: 'castingNotADecision', values: { id } })
  }
  if (row.deleted_at !== null) {
    throw new PanelError(`The ${cell} names the decision "${id}", which is deleted. Nothing was written.`, 400, undefined, undefined, undefined, { code: 'castingDecisionDeleted', values: { id } })
  }
  return { id: row.id, project: row.workspace_id }
}

/**
 * WHO MADE A WRITE, as the history and the row store it: the person by their id, or an agent by the registry id the one
 * resolver answers for it. A secretary writes with its own key, and the key is what the
 * resolver reads first, so the history names that agent and not a name the headers gave. Where the resolver answers
 * nobody, the name the request gave is stored as it was. The provider table (src/server/lib/the-provider-table.ts)
 * stamps its writers the same way.
 */
export function whoWrote(actor: Actor): { kind: string; id: string } {
  if (actor.type !== 'agent') return { kind: actor.type, id: actor.id }
  const me = participantForActor(actor)
  return { kind: 'agent', id: me === null ? actor.id : me.id }
}

/**
 * WHAT ALLOWED A WRITE, where it was more than the writer's own standing: the owner's authority in a test world. A raise
 * is never named here, because no raise opens a Casting door: the one gate in src/server/api/casting.ts lets in the
 * person, the owner's authority in a test world, and an agent whose own key proves a card that holds the act, and it
 * never asks whether a raise carries the request. So a raised secretary writes by its card, and nothing marks the
 * request as under the raise (problem XCvn6ypadyMT; tests/a-secretary-changes-the-casting-table.test.ts, case 8).
 */
export function authorityOf(actor: Actor): string | null {
  if (actor.theOwnersAuthority?.holds === true) return actor.theOwnersAuthority.because
  return null
}

/**
 * THE CELLS A WRITE NAMES, CHECKED AND MADE READY, ON TOP OF THE CELLS A ROW HAD. Nothing is written
 * here. A person may write what they mean: spaces around a word are taken off, and an empty string
 * empties the cell. Cells the write does not name keep their value and their source. The labels cell
 * takes label names, separated by commas, and stores their ids; Out until takes a time on the office's
 * clock or an instant, and stores the instant.
 */
function theCellsAfter(
  start: Record<CastingCell, CastingStoredCell>,
  write: CastingCellsWrite,
  at: string,
  by: { kind: string; id: string },
): { cells: Record<CastingCell, CastingStoredCell>; decisions: string[] } {
  const named = CASTING_CELLS.filter((cell) => write[cell] !== undefined)
  if (named.length === 0) throw new PanelError(`Name at least one of ${CASTING_CELLS.join(', ')} to write. Nothing was written.`, 400)
  const cells = { ...start }
  const decisions: string[] = []
  for (const cell of named) {
    const asked = write[cell] as CastingCellWrite
    let value = asked.value === null ? null : asked.value.trim() === '' ? null : asked.value.trim()
    if (cell === 'probability' && value !== null) {
      try {
        value = normaliseCastingProbability(asked.value ?? '')
      } catch (error) {
        throw new PanelError(
          error instanceof Error ? error.message : String(error),
          400,
          undefined,
          undefined,
          undefined,
          { code: 'castingNotAProbability', values: { probability: asked.value ?? '' } },
        )
      }
    }
    if (cell === 'labels' && value !== null) {
      const ids = theLabelIdsNamed(value)
      value = ids.length === 0 ? null : JSON.stringify(ids)
    }
    if (cell === 'out_until' && value !== null) {
      const instant = normaliseCastingOutUntil(value, theClockZone())
      if (instant === null) {
        const given = asked.value ?? ''
        throw new PanelError(
          `"${given}" is not a time. Give a date and time on the office's clock, such as 2026-11-18 09:00, or an instant with its offset. Nothing was written.`,
          400, undefined, undefined, undefined, { code: 'castingNotAnOutUntil', values: { value: given } },
        )
      }
      value = instant
    }
    const decisionId = asked.decision === undefined || asked.decision === null || asked.decision.trim() === '' ? null : asked.decision.trim()
    if (value === null && decisionId !== null) {
      throw new PanelError(`The ${cell} is emptied and names a decision. An empty cell names no decision. Nothing was written.`, 400, undefined, undefined, undefined, {
        code: 'castingEmptyCellNamesADecision',
        values: {},
      })
    }
    if (cell === 'program' && value !== null && !isACastingProgram(value)) {
      throw new PanelError(`"${value}" is not a program the office knows. It knows ${CASTING_PROGRAMS.join(', ')}. Nothing was written.`, 400, undefined, undefined, undefined, {
        code: 'castingNotAProgram',
        values: { program: value },
      })
    }
    const decision = decisionId === null ? null : aDecisionThatExists(decisionId, cell)
    if (decision !== null && !decisions.includes(decision.id)) decisions.push(decision.id)
    const from: CastingCellSource | null = value === null ? null : { at, by, decision, moved: false, copied: false }
    cells[cell] = { value, from }
  }
  return { cells, decisions }
}

function imageOf(cells: Record<CastingCell, CastingStoredCell>, marked: boolean, native: CastingNativeState = {}): CastingImage {
  return { cells, marked, ...stateOf(native) }
}

/** The stored form of an image: the cells by name, and the mark. */
function imageText(image: CastingImage | null): string | null {
  return image === null ? null : JSON.stringify({ ...image.cells, marked: image.marked, ...stateOf(image) })
}

function writeHistory(entry: {
  castingId: number
  role: string
  project: string | null
  what: CastingChangeKind
  at: string
  by: { kind: string; id: string }
  authority: string | null
  decisions: string[]
  note: string | null
  before: CastingImage | null
  after: CastingImage | null
}): void {
  sqlite
    .prepare(
      'INSERT INTO casting_row_changes (casting_id, role, project, what, at, by_kind, by_id, authority, decisions, note, before, after) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      entry.castingId, entry.role, entry.project ?? '', entry.what, entry.at, entry.by.kind, entry.by.id, entry.authority,
      JSON.stringify(entry.decisions), entry.note, imageText(entry.before), imageText(entry.after),
    )
}

function cellColumns(cells: Record<CastingCell, CastingStoredCell>): (string | null)[] {
  return CASTING_CELLS.flatMap((cell) => [cells[cell].value, cells[cell].from === null ? null : JSON.stringify(cells[cell].from)])
}

const CELL_COLUMN_NAMES = CASTING_CELLS.flatMap((cell) => [cell, `${cell}_from`])

/** What the add door is asked: the project (null for every project) and the cells. */
export interface CastingAdd {
  project: string | null
  cells: CastingCellsWrite
  native?: CastingNative | null
}

/**
 * ADD A CASTING. The first row of its scope carries the mark, and the answer says so; a later row does
 * not, and the answer names the row the tools still take.
 */
export function addACasting(role: string, add: CastingAdd, actor: Actor): CastingWritten {
  const name = aRoleThatExists(role)
  const project = aProjectThatExists(add.project)
  const at = nowStamp()
  const by = whoWrote(actor)
  const { cells, decisions } = theCellsAfter(anEmptyRow(), add.cells, at, by)
  const authority = authorityOf(actor)
  const inScope = rowsOfRole(name).filter((row) => row.project === project)
  const first = inScope.length === 0
  const metadata = add.native === undefined ? {} : changedNative({}, {native:add.native})
  refuseSettingsTheProgramCannotTake(null, cells.program.value, metadata.native)
  refuseAProviderTheRowCannotName(name, cells.program.value, metadata.native)
  const id = sqlite.transaction(() => {
    const added = sqlite
      .prepare(
        `INSERT INTO casting_rows (role, project, marked, ${CELL_COLUMN_NAMES.join(', ')}, changed_at, changed_by_kind, changed_by_id, authority) ` +
          `VALUES (?, ?, ?, ${CELL_COLUMN_NAMES.map(() => '?').join(', ')}, ?, ?, ?, ?)`,
      )
      .run(name, project ?? '', first ? 1 : 0, ...cellColumns(cells), at, by.kind, by.id, authority)
    const castingId = Number(added.lastInsertRowid)
    writeHistory({ castingId, role: name, project, what: 'add', at, by, authority, decisions, note: null, before: null, after: imageOf(cells, first, metadata) })
    return castingId
  })()
  const casting = aCastingThatExists(id)
  const marked = inScope.find((row) => row.marked)
  const says = first
    ? `Added casting ${String(id)} of ${name} for ${scopeWords(project)}. It is the first casting of ${name} there, so it carries the mark: the tools take this one.`
    : `Added casting ${String(id)} of ${name} for ${scopeWords(project)}. The tools still take casting ${String(marked?.id ?? '?')} there.`
  return { casting, says }
}

/** CHANGE THE CELLS A WRITE NAMES ON ONE CASTING. Its scope and its mark do not change here. */
export function changeACasting(id: number, write: CastingCellsWrite, actor: Actor, nativeWrite: {native?: CastingNative | null; hold?: null} = {}): CastingWritten {
  const was = aCastingThatExists(id)
  const at = nowStamp()
  const by = whoWrote(actor)
  const { cells, decisions } = Object.keys(write).length === 0 && (Object.hasOwn(nativeWrite,'native') || Object.hasOwn(nativeWrite,'hold')) ? {cells:was.cells,decisions:[] as string[]} : theCellsAfter(was.cells, write, at, by)
  const metadata = changedNative(was, nativeWrite)
  if (nativeWrite.native?.settings !== undefined || cells.program.value !== was.cells.program.value) refuseSettingsTheProgramCannotTake(id, cells.program.value, metadata.native)
  if (nativeWrite.native !== undefined || cells.program.value !== was.cells.program.value) refuseAProviderTheRowCannotName(was.role, cells.program.value, metadata.native)
  const authority = authorityOf(actor)
  sqlite.transaction(() => {
    sqlite
      .prepare(`UPDATE casting_rows SET ${CELL_COLUMN_NAMES.map((one) => `${one} = ?`).join(', ')}, changed_at = ?, changed_by_kind = ?, changed_by_id = ?, authority = ? WHERE id = ?`)
      .run(...cellColumns(cells), at, by.kind, by.id, authority, id)
    writeHistory({ castingId: id, role: was.role, project: was.project, what: 'change', at, by, authority, decisions, note: null, before: imageOf(was.cells, was.marked, was), after: imageOf(cells, was.marked, metadata) })
  })()
  return { casting: aCastingThatExists(id), says: `Changed casting ${String(id)} of ${was.role} for ${scopeWords(was.project)}.` }
}

/**
 * REMOVE ONE CASTING. The marked row is refused while other rows remain in its scope, because the
 * scope would then have rows and no mark. The last row of a scope may go, mark and all.
 */
export function removeACasting(id: number, actor: Actor): CastingWritten {
  const was = aCastingThatExists(id)
  const others = rowsOfRole(was.role).filter((row) => row.project === was.project && row.id !== id)
  if (was.marked && others.length > 0) {
    throw new PanelError(
      `Casting ${String(id)} carries the mark: the tools take it for ${was.role} in ${scopeWords(was.project)}, and ${String(others.length)} other ` +
        `casting${others.length === 1 ? '' : 's'} remain there. Mark another casting first, then remove this one. Nothing was written.`,
      409,
      undefined,
      undefined,
      undefined,
      { code: 'castingRemoveTheMarkedRow', values: {} },
    )
  }
  const at = nowStamp()
  const by = whoWrote(actor)
  const authority = authorityOf(actor)
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM casting_rows WHERE id = ?').run(id)
    writeHistory({ castingId: id, role: was.role, project: was.project, what: 'remove', at, by, authority, decisions: [], note: null, before: imageOf(was.cells, was.marked, was), after: null })
  })()
  const says = was.marked
    ? `Removed casting ${String(id)}, the last casting of ${was.role} for ${scopeWords(was.project)}. The table marks no casting there now.`
    : `Removed casting ${String(id)} of ${was.role} for ${scopeWords(was.project)}.`
  return { casting: was, says }
}

/**
 * MOVE THE MARK TO ONE CASTING, taking it from the row that had it, in one transaction. A row that
 * already carries the mark is answered as it is, and nothing is written.
 */
export function markACasting(id: number, actor: Actor): CastingWritten {
  const was = aCastingThatExists(id)
  if (was.marked) return { casting: was, says: `Casting ${String(id)} already carries the mark. Nothing was written.` }
  const old = rowsOfRole(was.role).find((row) => row.project === was.project && row.marked)
  const at = nowStamp()
  const by = whoWrote(actor)
  const authority = authorityOf(actor)
  sqlite.transaction(() => {
    const stamp = sqlite.prepare('UPDATE casting_rows SET marked = ?, changed_at = ?, changed_by_kind = ?, changed_by_id = ?, authority = ? WHERE id = ?')
    // THE OLD ROW FIRST, so the unique index never sees two marks in one scope.
    if (old !== undefined) {
      stamp.run(0, at, by.kind, by.id, authority, old.id)
      writeHistory({ castingId: old.id, role: old.role, project: old.project, what: 'unmark', at, by, authority, decisions: [], note: `The mark moved to casting ${String(id)}.`, before: imageOf(old.cells, true, old), after: imageOf(old.cells, false, old) })
    }
    stamp.run(1, at, by.kind, by.id, authority, id)
    writeHistory({ castingId: id, role: was.role, project: was.project, what: 'mark', at, by, authority, decisions: [], note: old === undefined ? null : `The mark moved here from casting ${String(old.id)}.`, before: imageOf(was.cells, false, was), after: imageOf(was.cells, true, was) })
  })()
  return {
    casting: aCastingThatExists(id),
    says: `Casting ${String(id)} carries the mark now: the tools take it for ${was.role} in ${scopeWords(was.project)}.` + (old === undefined ? '' : ` Casting ${String(old.id)} no longer does.`),
  }
}

export { readAnImage } from './a-casting-by-id.ts'

function isAChangeKind(value: string): value is CastingChangeKind {
  return (CASTING_CHANGE_KINDS as readonly string[]).includes(value)
}

/**
 * WHAT `GET /api/casting/:role/history` ANSWERS: every change to the role's castings, in every scope and
 * including removed ones, newest first; or, with a casting id, every change to that one casting.
 */
export function castingHistory(role: string, casting: number | null): CastingHistory {
  const name = aRoleThatExists(role)
  const held = (
    casting === null
      ? sqlite.prepare('SELECT * FROM casting_row_changes WHERE role = ? ORDER BY id DESC').all(name)
      : sqlite.prepare('SELECT * FROM casting_row_changes WHERE role = ? AND casting_id = ? ORDER BY id DESC').all(name, casting)
  ) as {
    id: number
    casting_id: number
    project: string
    what: string
    at: string
    by_kind: string
    by_id: string
    authority: string | null
    decisions: string
    note: string | null
    before: string | null
    after: string | null
  }[]
  if (casting !== null && held.length === 0) {
    const row = heldById(casting)
    if (row === undefined || row.role !== name) {
      throw new PanelError(`${name} has no casting with the id ${String(casting)}, and no change to one is recorded.`, 404, undefined, undefined, undefined, {
        code: 'castingNoSuchCasting',
        values: { id: String(casting) },
      })
    }
  }
  const changes: CastingHistoryEntry[] = held.map((row) => {
    if (!isAChangeKind(row.what)) throw new Error(`The Casting history's change ${String(row.id)} says "${row.what}", which is not a kind of change the table makes.`)
    return {
      castingId: row.casting_id,
      project: row.project === '' ? null : row.project,
      what: row.what,
      at: row.at,
      by: { kind: row.by_kind, id: row.by_id },
      authority: row.authority,
      decisions: JSON.parse(row.decisions) as string[],
      note: row.note,
      before: row.before === null ? null : readAnImage(row.before, `change ${String(row.id)}, before`),
      after: row.after === null ? null : readAnImage(row.after, `change ${String(row.id)}, after`),
    }
  })
  const named = new Set(changes.flatMap((change) => [change.before, change.after])
    .flatMap((image, n) => image === null ? [] : readCastingLabelIds(image.cells.labels.value, `the Casting history's image ${String(n)}`)))
  return { role: name, casting, changes, labelNames: theLastNamesOf(named) }
}

export { selectionOfACasting } from './the-casting-in-force.ts'
export function readACastingSelection(id: number, revision?: string) {
  const row = aCastingThatExists(id)
  if (revision !== undefined && theSelectionRevisionOf(row) !== revision) throw new PanelError(`Casting ${id} changed after it was selected. Nothing was started.`,409)
  const selection = selectionOfACasting(row)
  return selection === null ? {selection:null,legacy:true,says:'This row has no native selection data; the launcher uses its exact legacy compatibility data.'} : {selection}
}
export { aCastingById } from './a-casting-by-id.ts'
/** A native refusal is a run's evidence, never permission to change another row or clear a hold. */
export function holdACasting(id: number, input: {revision:string;run:string;refusal:CastingHold['refusal']}, actor: Actor, workspace: string) {
  if (!thePersonIsProved(actor) && actor.ownKeyRun !== input.run) throw new PanelError('Only the selected run, proved by its own run key, may report this native refusal. Nothing was written.',403)
  return sqlite.transaction(() => {
    const row = aCastingThatExists(id)
    if (theSelectionRevisionOf(row) !== input.revision) throw new PanelError('The selected Casting row changed before its native refusal was reported. Nothing was written.',409)
    const record = getRecord(input.run)
    if (record === null || record.workspaceId !== workspace || record.kind !== 'session' || record.data['state'] !== 'running') throw new PanelError('The selected run is not in this project. Nothing was written.',404)
    const selected = (record.data['extra'] as Record<string,unknown> | undefined)?.['launcherSelection']
    const expected = {runtime:row.cells.program.value,model:row.cells.model.value,native:{...row.native,effort:row.cells.effort.value},casting:{id:row.id,revision:theSelectionRevisionOf(row)}}
    const recorded = readLauncherSelection(selected)
    const rows = readLauncherSelection(expected)
    const same = JSON.stringify(recorded) === JSON.stringify(rows)
    if ((!same && theRowsEffortUnder(recorded, rows) === undefined) || record.data['runtime'] !== expected.runtime || record.data['model'] !== expected.model) throw new PanelError('The refusal does not name the exact row and native selection recorded on this run. Nothing was written.',409)
    const evidence = nativeRefusalWithCode(input.refusal.code,input.refusal.said)
    if (evidence === null || evidence.kind !== input.refusal.kind) throw new PanelError('This is not a structured native model or option refusal. Nothing was written.',400)
    if (row.hold != null) return {held:true,first:false}
    // THE HOLD KEEPS THE ROW'S OWN REVISION, which the stored image must name (nativeState), and not the provider's part.
    const at = nowStamp(), by = whoWrote(actor), hold = {...input,revision:row.selectionRevision!,refusal:{...input.refusal,said:evidence.said},at}
    writeHistory({castingId:id,role:row.role,project:row.project,what:'hold',at,by,authority:null,decisions:[],note:null,
      before:imageOf(row.cells,row.marked,row),after:imageOf(row.cells,row.marked,{...stateOf(row),hold})})
    const agent = theAgentOfARunForItsSeal(record)
    const starter = agent === null ? null : whoIsToldOfTheRun(agent)
    let notice: string | null = null
    if (starter !== null && 'to' in starter) notice = createRecord({kind:'message',title:'A Casting row is held after a native refusal',workspaceId:workspace,
      data:{sentBy:moleOffice(),body:`Run ${input.run}: Casting ${id} is held after the native program refused its selected ${evidence.kind}: ${evidence.said} A person or secretary must change or clear the row.`,to:[starter.to],aboutRun:input.run},actor:THE_OFFICE,senderIsMoleOffice:true}).id
    return {held:true,first:true,notice,...(notice === null ? {notTold:'No registered starter could be named for this run.'} : {})}
  })()
}
