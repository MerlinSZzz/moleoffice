// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theSelectionRevisionOf` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `theCastingInForce` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * `selectionOfACasting` was moved byte for byte out of src/server/lib/casting.ts, with no change of behaviour.
 * That file imports back what it still uses, and re-exports all three, so its export surface is unchanged.
 * They are what a run's start reads of the Casting table, in a file that does not reach the runtime cycle, so
 * src/server/lib/run-models.ts can read them without casting.ts, which writes through records.ts.
 */

import { readLauncherSelection } from '../../config/launcher-selection.mjs'
import { theRowTheToolsTake, type CastingCell, type CastingNativeState, type CastingRow, type CastingSelection, type CastingStoredCell } from '@shared/casting.ts'
import { stateOf } from './a-casting-by-id.ts'
import { PanelError } from './panel-error.ts'
import { theVersionOfAProvider } from './the-provider-a-check-takes.ts'
import { rowsOfRole } from './the-rows-in-force.ts'

/**
 * THE REVISION OF A ROW'S SELECTION, and of the provider it names: a check's start, a hold and a read of the row by its
 * revision all compare this, so a change to the provider's programs, base address or key name since the selection was
 * read refuses them as a change to the row would. A row naming no provider keeps its stored revision as it is.
 */
export function theSelectionRevisionOf(row: Pick<CastingRow, 'native' | 'selectionRevision'>): string | undefined {
  const provider = row.native?.providerRow
  return provider === undefined || row.selectionRevision === undefined ? row.selectionRevision : `${row.selectionRevision}.provider-${theVersionOfAProvider(provider)}`
}

/**
 * THE MARKED ROW FOR A ROLE AND A PROJECT, by the rule in src/shared/casting.ts: its id, whose scope it is, and its
 * cells; or null when the table marks no casting for the role there. `theModelARunGets` reads this and nothing else,
 * and names the row's id and its model's decision when the model came from it, so a tool can print them.
 */
export function theCastingInForce(
  role: string,
  project: string | null,
): { id: number; scope: 'the project' | 'every project'; cells: Record<CastingCell, CastingStoredCell> } & CastingNativeState | null {
  const taken = theRowTheToolsTake(rowsOfRole(role), project)
  return taken === null ? null : { id: taken.row.id, scope: taken.scope, cells: taken.row.cells, ...stateOf(taken.row) }
}

/** One row, never another choice. Legacy images have no native selection. */
export function selectionOfACasting(row: Pick<CastingRow, 'id' | 'cells' | 'native' | 'hold' | 'selectionRevision'>): CastingSelection | null {
  if (row.native == null) return null
  if (row.hold != null) throw new PanelError(`Casting ${row.id} is held after its native refusal: ${row.hold.refusal.said} A person or secretary must change or clear it. Nothing was started.`, 409)
  return readLauncherSelection({runtime:row.cells.program.value,model:row.cells.model.value,native:{...row.native,effort:row.cells.effort.value},casting:{id:row.id,revision:theSelectionRevisionOf(row)}})
}
