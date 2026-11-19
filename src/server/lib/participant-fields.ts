// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FIELD THAT HOLDS A PARTICIPANT NAMES SOMEBODY THE REGISTRIES HOLD. Wave 13s round 142, with the watch kind.
 *
 * `PARTICIPANT_FIELDS` in src/shared/sections.ts lists the fields the record page draws as a participant's name. A
 * value written there that no registry row answers to would be drawn as an id nobody has, so a write giving one of
 * those fields such a value is refused with 400, naming the id sent and where the registry ids are listed. The usual
 * cause is a handle sent where the registry id belongs.
 *
 * AN AGENT MAY BE NAMED BY AN OLD ID FILED AS ITS ALIAS, as a writer that kept it while the office was closed for the
 * re-mint names it. The value is stored as it was sent.
 *
 * ONLY A VALUE THE WRITE CHANGES IS ASKED ABOUT. A stored id that no row answers to any more, such as an agent's old
 * id once it has a new one, does not stop a change of another field.
 *
 * A value that is not a `{kind, id}` reference is left to the shape check, which the write asks first.
 */
import { isDeepStrictEqual } from 'node:util'

import { PARTICIPANT_FIELDS } from '@shared/sections.ts'
import type { RecordKind } from '@shared/types.ts'
import { theAgentRowAnIdNames } from './the-agent-row-an-id-names.ts'
import { readParticipant } from '../db/read-participant.ts'
import { PanelError } from './panel-error.ts'

/** The `{kind, id}` a stored value holds, or null when it is not that shape. */
function aReference(value: unknown): { kind: 'person' | 'agent'; id: string } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const { kind, id } = value as Record<string, unknown>
  return (kind === 'person' || kind === 'agent') && typeof id === 'string' && id !== '' ? { kind, id } : null
}

/**
 * Refuses the write when a participant field of this kind is given a reference no registry row answers to. `before` is
 * the stored data of a record of the same kind, or null when every value in `data` is new: a create, or a change of
 * kind.
 */
export function checkTheParticipantsNamed(kind: RecordKind, data: unknown, before: unknown): void {
  const fields = PARTICIPANT_FIELDS[kind]
  if (fields === undefined || typeof data !== 'object' || data === null) return
  const stored = typeof before === 'object' && before !== null ? (before as Record<string, unknown>) : {}
  for (const key of fields) {
    const value = (data as Record<string, unknown>)[key]
    if (isDeepStrictEqual(value, stored[key])) continue
    const named = aReference(value)
    if (named === null || (named.kind === 'agent' ? theAgentRowAnIdNames(named.id) : readParticipant(named)) !== null) continue
    const who = named.kind === 'agent' ? { word: 'agent', one: 'an agent' } : { word: 'person', one: 'a person' }
    throw new PanelError(
      `data.${key} names the ${who.word} "${named.id}", and no ${who.word} has that registry id. Name ${who.one} ` +
        'by kind and registry id, never by a handle: GET ' +
        '/api/participants lists every registry id. Nothing was written.',
      400,
    )
  }
}
