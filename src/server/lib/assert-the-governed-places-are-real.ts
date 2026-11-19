// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `assertTheGovernedPlacesAreReal` was moved byte for byte out of src/server/lib/governs.ts, with no change of behaviour.
 * `GOVERNED_KINDS` was moved byte for byte out of src/server/lib/governs.ts, with no change of behaviour.
 * `named` was moved byte for byte out of src/server/lib/governs.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { inArray } from 'drizzle-orm'
import { theGovernedPlaces } from '@shared/governs.ts'
import { kindWord } from '@shared/words.ts'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { records } from '../db/schema.ts'
import { PanelError } from './panel-error.ts'
import type { DecisionRow, ADecisionNamed } from './governs.ts'

/**
 * A WRITE'S NAMED RECORDS ARE THERE. Called on every write of a decision's data that carries `governs`, after the
 * shape check. A record that is missing, deleted, in another project or not a module, flow or pipeline is refused
 * with the reason, and nothing is written.
 */
export function assertTheGovernedPlacesAreReal(data: unknown, workspaceId: string): void {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return
  const named = theGovernedPlaces((data as Record<string, unknown>)['governs']).flatMap((place) => ('record' in place ? [place.record] : []))
  if (named.length === 0) return
  // IN PIECES (src/server/db/in-pieces.ts): `governs` comes from the request body, and nothing caps how many records it
  // names. The rows go into a map by id, so the order of the pieces does not matter.
  const found = new Map(
    readInPieces(named, (piece) =>
      db
        .select({ id: records.id, kind: records.kind, workspaceId: records.workspaceId, deletedAt: records.deletedAt })
        .from(records)
        .where(inArray(records.id, piece))
        .all(),
    ).map((row) => [row.id, row]),
  )
  const wrong: string[] = []
  for (const id of named) {
    const row = found.get(id)
    if (row === undefined) wrong.push(`"${id}" is not a record`)
    else if (row.deletedAt !== null) wrong.push(`"${id}" is deleted`)
    else if (row.workspaceId !== workspaceId) wrong.push(`"${id}" is in the project "${row.workspaceId}", not "${workspaceId}"`)
    else if (!(GOVERNED_KINDS as readonly string[]).includes(row.kind)) wrong.push(`"${id}" is a ${kindWord(row.kind).text}`)
  }
  if (wrong.length === 0) return
  throw new PanelError(
    `data.governs names records a decision cannot govern: ${wrong.join('; ')}. A record in governs is a live module, ` +
      `flow or pipeline in the same project; a file or folder goes in \`path\` instead. Nothing was written.`,
    400,
    undefined,
    undefined,
    undefined,
    { code: 'governsNamesRecordsItCannotGovern', values: {} },
  )
}
/** The kinds a decision may name in `governs[].record`. */
export const GOVERNED_KINDS = ['module', 'flow', 'pipeline'] as const
export function named(row: Pick<DecisionRow, 'id' | 'title' | 'createdAt'>): ADecisionNamed {
  return { id: row.id, title: row.title, createdAt: row.createdAt }
}
