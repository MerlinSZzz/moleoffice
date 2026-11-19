// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Held` was moved out of src/server/lib/the-provider-table.ts byte for byte but for the word `export`, with no change of behaviour.
 * `refused` was moved out of src/server/lib/the-provider-table.ts byte for byte but for the word `export`, with no change of behaviour.
 * `aProviderRefusal` was moved byte for byte out of src/server/lib/the-provider-table.ts, with no change of behaviour.
 * `theFieldsOf` was moved out of src/server/lib/the-provider-table.ts byte for byte but for the word `export`, with no change of behaviour.
 * `aRowOf` was moved out of src/server/lib/the-provider-table.ts byte for byte but for the word `export`, with no change of behaviour.
 * `theHeld` was moved out of src/server/lib/the-provider-table.ts byte for byte but for the word `export`, with no change of behaviour.
 * `aProviderIfThere` was moved byte for byte out of src/server/lib/the-provider-table.ts, with no change of behaviour.
 * `theVersionOfAProvider` was moved byte for byte out of src/server/lib/the-provider-table.ts, with no change of behaviour.
 * `theProviderACheckTakes` was moved byte for byte out of src/server/lib/the-provider-table.ts, with no change of behaviour.
 * That file imports back what it still uses, and re-exports what it exported, so its export surface is unchanged.
 * They are what a check's start reads of a provider row, in a file that does not reach the runtime cycle, so
 * src/server/lib/run-models.ts and src/server/lib/the-casting-in-force.ts can read them without the provider table.
 */

import type { ProviderFields, ProviderProgram, ProviderRow, TheProviderACheckTakes } from '@shared/the-provider-table.ts'
import { sayInEnglish } from '@shared/i18n.ts'
import type { ProviderTableRefusalCode, RefusalValues } from '@shared/refusal-codes.ts'
import { createHash } from 'node:crypto'
import { sqlite } from '../db/client.ts'
import { aProviderSecretIsSet } from './a-provider-secret-is-set.ts'
import { PanelError } from './panel-error.ts'

/** One row of `providers` as SQLite answers it. */
export type Held = {
  id: string
  name: string
  programs: string
  base_address: string
  key_name: string
  added_at: string
  added_by_kind: string
  added_by_id: string
  changed_at: string
  changed_by_kind: string
  changed_by_id: string
}

/** A coded refusal, its English read from the same word the page draws, so the two cannot differ. */
export function refused<C extends ProviderTableRefusalCode>(code: C, values: RefusalValues<C>, status = 400): PanelError {
  return new PanelError(sayInEnglish(`server.${code}`, values as Record<string, string>), status, undefined, undefined, undefined, { code, values } as never)
}

/** The same coded refusal, for the Casting door (src/server/lib/casting.ts) and a check's start (src/server/lib/run-models.ts). */
export function aProviderRefusal<C extends ProviderTableRefusalCode>(code: C, values: RefusalValues<C>, status = 400): PanelError {
  return refused(code, values, status)
}

export function theFieldsOf(held: Held): ProviderFields {
  return { id: held.id, name: held.name, programs: JSON.parse(held.programs) as ProviderProgram[], baseAddress: held.base_address, keyName: held.key_name }
}

export function aRowOf(held: Held): ProviderRow {
  return {
    ...theFieldsOf(held),
    key: aProviderSecretIsSet(held.key_name) ? 'set' : 'not set',
    added: { at: held.added_at, by: { kind: held.added_by_kind, id: held.added_by_id } },
    changed: { at: held.changed_at, by: { kind: held.changed_by_kind, id: held.changed_by_id } },
  }
}

export function theHeld(id: string): Held | undefined {
  return sqlite.prepare('SELECT * FROM providers WHERE id = ?').get(id) as Held | undefined
}

/** One row's fields and whether its key is set, or null because no row has this id. A Casting row's id is never refused here. */
export function aProviderIfThere(id: string): ProviderRow | null {
  const held = theHeld(id)
  return held === undefined ? null : aRowOf(held)
}

/**
 * THE VERSION OF THE PROVIDER A CASTING ROW NAMES, for the row's selection revision (theSelectionRevisionOf in
 * src/server/lib/casting.ts): a hash of the fields a check uses, its programs, base address and key name, or `gone`.
 * The name is left out, since a check does not use it, and no key's value is read.
 */
export function theVersionOfAProvider(id: string): string {
  const held = theHeld(id)
  if (held === undefined) return 'gone'
  const { programs, baseAddress, keyName } = theFieldsOf(held)
  return createHash('sha256').update(JSON.stringify({ id: held.id, programs, baseAddress, keyName })).digest('hex').slice(0, 16)
}

/** What a check is told of the provider Casting row `row` names. */
export function theProviderACheckTakes(row: number, id: string): TheProviderACheckTakes {
  const provider = aProviderIfThere(id)
  if (provider === null) return { row, found: false, id }
  return { row, found: true, id: provider.id, programs: provider.programs, baseAddress: provider.baseAddress, keyName: provider.keyName, key: provider.key }
}
