// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROVIDER TABLE: ITS SHAPES, on two decisions of the owner.
 *
 * A provider is a place a program sends its model requests to: a base address and the name of the key-file entry
 * that holds its key. A row names the programs it is for. The table holds no model list, and no key's value: a row
 * names an entry of the office's key file, and a reply says only whether that entry is set.
 *
 * The rules and the writers are in src/server/lib/the-provider-table.ts, and the doors in
 * src/server/api/the-provider-table.ts. A Casting row names a row in its native `providerRow`, and only a dsh check
 * and a Codex check take their key from one so far (src/server/lib/run-models.ts, tools/the-inspector.mjs). No page
 * reads the table yet.
 */
import type { AgentRuntime } from './participants.ts'

/** A provider's id, as A_PROVIDER_ID_IS says it. A Casting row's `providerRow` is read by it too. */
export const A_PROVIDER_ID = /^[a-z0-9-]{2,40}$/u
/** A_PROVIDER_ID in words, for the provider door's rules and the Casting door's refusal of a `providerRow`. */
export const A_PROVIDER_ID_IS = 'lowercase letters, digits and dashes, 2 to 40 characters'

/** The programs a provider may be for, in the order a reply lists them. */
export const PROVIDER_PROGRAMS = ['codex', 'claude-code', 'opencode', 'dsh'] as const satisfies readonly AgentRuntime[]
export type ProviderProgram = (typeof PROVIDER_PROGRAMS)[number]

/** What a write did to a row, as its change row stores it. */
export const PROVIDER_CHANGE_KINDS = ['add', 'change', 'remove'] as const
export type ProviderChangeKind = (typeof PROVIDER_CHANGE_KINDS)[number]

/** Who wrote: the person by their id, or an agent by the registry id the one resolver answers for it. */
export interface ProviderWriter {
  kind: string
  id: string
}

/** The fields of a row a writer gives, and the before and after of a change row. */
export interface ProviderFields {
  id: string
  name: string
  programs: ProviderProgram[]
  baseAddress: string
  keyName: string
}

/** One row as a door answers it. `key` says whether the key file holds the entry `keyName` names, and never more. */
export interface ProviderRow extends ProviderFields {
  key: 'set' | 'not set'
  added: { at: string; by: ProviderWriter }
  changed: { at: string; by: ProviderWriter }
}

/** One change row, as stored. `before` is null for an add and `after` is null for a remove. */
export interface ProviderChange {
  id: number
  provider: string
  what: ProviderChangeKind
  at: string
  by: ProviderWriter
  before: ProviderFields | null
  after: ProviderFields | null
}

/** The answer of every write: the row as it now is (as it was, for a remove), and the message the person was sent. */
export interface ProviderWritten {
  provider: ProviderRow
  change: ProviderChange
  /** The id of the message the person was sent about this write, or null because none was sent. */
  told: string | null
}

export interface ProviderReading {
  providers: ProviderRow[]
}

/**
 * WHAT A CHECK IS TOLD OF THE PROVIDER ITS CASTING ROW NAMES, in the run-models answer (src/server/lib/run-models.ts):
 * the Casting row, the provider's id and the fields a check uses, and whether the key file's entry is set. Never the
 * key. `found` is false when no provider has the id the row names, and the fields are then left out.
 */
export type TheProviderACheckTakes =
  | ({ row: number; found: true; key: 'set' | 'not set' } & Omit<ProviderFields, 'name'>)
  | { row: number; found: false; id: string }

/**
 * WHERE A CHECK RECORDS EACH USE OF A PROVIDER'S KEY: a list on its own session's data.extra, one entry per start of its
 * model, holding the check, the Casting row, the provider's id, the key file's entry and when, and never the key
 * (tools/the-inspector.mjs).
 */
export const THE_PROVIDER_KEY_USES = 'providerKeyUses'
