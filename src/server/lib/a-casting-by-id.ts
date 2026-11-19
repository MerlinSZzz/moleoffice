// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `aCastingById` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `aCastingThatExists` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `rowOf` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `cellsOf` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `heldById` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `stateOf` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `readAnImage` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `nativeState` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { type CastingRow, type CastingNativeState, CASTING_CELLS, anEmptyRow, readCastingProbability, readCastingCellSource, readCastingLabelIds, readCastingOutUntil, type CastingCell, type CastingStoredCell, type CastingImage, readCastingNative, type CastingHold } from '@shared/casting.ts'
import { PanelError } from './panel-error.ts'
import { getWorkspace } from '../db/get-workspace.ts'
import type { Held } from './casting.ts'
import { sqlite } from '../db/client.ts'
import { CURRENT_IMAGE } from './the-rows-in-force.ts'

export function aCastingById(id: number) { return aCastingThatExists(id) }
/** A casting row that exists, or a 404 the page can draw. */
export function aCastingThatExists(id: number): CastingRow {
  const held = heldById(id)
  if (held === undefined) {
    throw new PanelError(`There is no casting with the id ${String(id)}. Nothing was written.`, 404, undefined, undefined, undefined, {
      code: 'castingNoSuchCasting',
      values: { id: String(id) },
    })
  }
  return rowOf(held)
}
export function rowOf(held: Held): CastingRow {
  const project = held.project === '' ? null : held.project
  let native: CastingNativeState = {}
  if (held.current_image != null) {
    try { native = stateOf(readAnImage(held.current_image, `latest image of casting ${held.id}`)) }
    catch { throw new PanelError(`The Casting latest image of row ${held.id} is unreadable or incomplete. No native selection was supplied.`,500) }
  }
  return {
    ...native,
    id: held.id,
    role: held.role,
    project,
    projectTitle: project === null ? null : (getWorkspace(project)?.title ?? project),
    marked: held.marked === 1,
    cells: cellsOf(held),
    lastChange: { at: held.changed_at, by: { kind: held.changed_by_kind, id: held.changed_by_id }, authority: held.authority },
  }
}
/** The cells of one stored row, each read strictly. */
export function cellsOf(held: Held): Record<CastingCell, CastingStoredCell> {
  const where = (cell: CastingCell) => `casting ${String(held.id)} (${held.role}${held.project === '' ? '' : ` in ${held.project}`}), ${cell}`
  const out = anEmptyRow()
  for (const cell of CASTING_CELLS) {
    const value = held[cell]
    const fromText = held[`${cell}_from`]
    const from = readCastingCellSource(fromText === null ? null : JSON.parse(fromText), where(cell))
    if (cell === 'probability') readCastingProbability(value)
    if (cell === 'labels') readCastingLabelIds(value, where(cell))
    if (cell === 'out_until') readCastingOutUntil(value, where(cell))
    if ((value === null) !== (from === null)) {
      throw new Error(`The Casting table's cell ${where(cell)} has ${value === null ? 'a source and no value' : 'a value and no source'}.`)
    }
    out[cell] = { value, from }
  }
  return out
}
export function heldById(id: number): Held | undefined {
  return sqlite.prepare(`SELECT *, ${CURRENT_IMAGE} FROM casting_rows WHERE id = ?`).get(id) as Held | undefined
}
export function stateOf(row: CastingNativeState): CastingNativeState {
  return Object.hasOwn(row, 'native') ? { native: row.native, selectionRevision: row.selectionRevision, hold: row.hold } : {}
}
/**
 * A stored row image in the history, read as strictly as the table. An image written before
 * migration 0190 has only program, model, effort and why, and no mark; one written before migration
 * 0268 has no probability; one written before migration 0349 has no labels and no Out until. Those
 * missing cells read as empty, and the old mark reads as null.
 *
 * AN IMAGE WRITTEN FROM MIGRATION 0318 UNTIL 0349 HOLDS A WORK GROUP, a cell rows no longer have. It is
 * read into `workGroup`, as strictly as 0318's CHECK held it: hard, simple or empty, and anything else throws.
 */
export function readAnImage(text: string, where: string): CastingImage {
  const parsed = JSON.parse(text) as unknown
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error(`The Casting history's ${where} is not an object.`)
  const bag = parsed as Record<string, unknown>
  const cells = anEmptyRow()
  const before0190 = bag['marked'] === undefined
  for (const cell of CASTING_CELLS) {
    const one = bag[cell]
    if (one === undefined && (cell === 'probability' || cell === 'labels' || cell === 'out_until' || (before0190 && (cell === 'difficulty' || cell === 'quota' || cell === 'cost')))) continue
    if (typeof one !== 'object' || one === null) throw new Error(`The Casting history's ${where} has no ${cell}.`)
    const value = (one as Record<string, unknown>)['value']
    if (value !== null && typeof value !== 'string') throw new Error(`The Casting history's ${where} holds a ${cell} that is not text.`)
    if (cell === 'probability') readCastingProbability(value)
    if (cell === 'labels') readCastingLabelIds(value, where)
    if (cell === 'out_until') readCastingOutUntil(value, where)
    cells[cell] = { value, from: readCastingCellSource((one as Record<string, unknown>)['from'], `${where}, ${cell}`) }
  }
  const marked = bag['marked']
  if (marked !== undefined && typeof marked !== 'boolean') throw new Error(`The Casting history's ${where} holds a mark that is not true or false.`)
  const group = bag['work_group']
  return { cells, marked: marked === undefined ? null : marked, ...(group === undefined ? {} : { workGroup: anOldWorkGroup(group, where) }), ...nativeState(bag) }
}

/** The work group an image written before migration 0349 holds, read as 0318's CHECK held it. */
function anOldWorkGroup(stored: unknown, where: string): CastingStoredCell {
  if (typeof stored !== 'object' || stored === null) throw new Error(`The Casting history's ${where} has a work group that is not a cell.`)
  const value = (stored as Record<string, unknown>)['value']
  if (value !== null && value !== 'hard' && value !== 'simple') {
    throw new Error(`The Casting history's ${where} holds the work group "${String(value)}", which is not hard, simple or empty.`)
  }
  return { value, from: readCastingCellSource((stored as Record<string, unknown>)['from'], `${where}, work group`) }
}
export function nativeState(image: Record<string, unknown>): CastingNativeState {
  if (!Object.hasOwn(image, 'native')) {
    if (Object.hasOwn(image, 'selectionRevision') || Object.hasOwn(image, 'hold')) throw new Error('The Casting native selection image is incomplete.')
    return {}
  }
  const native = readCastingNative(image['native'])
  const selectionRevision = image['selectionRevision']
  const hold = image['hold'] as CastingHold | null
  if (typeof selectionRevision !== 'string' || selectionRevision.trim() === '' || hold === undefined ||
    (hold !== null && (typeof hold !== 'object' || hold.revision !== selectionRevision || typeof hold.run !== 'string' ||
      typeof hold.at !== 'string' || !hold.refusal || !['model','option'].includes(hold.refusal.kind) || typeof hold.refusal.code !== 'string' || typeof hold.refusal.said !== 'string'))) {
    throw new Error('The Casting native selection revision or refusal hold is unreadable.')
  }
  return { native, selectionRevision, hold }
}
