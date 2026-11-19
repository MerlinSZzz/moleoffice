// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON'S LOOK AND THEIR OWN THEMES, KEPT ON THEIR ROW (migration 0347, `people.themes`).
 *
 * TWO DOORS WRITE IT, AND BOTH THROUGH `keepTheLook` BELOW. The person's own is the participant
 * change door, PATCH /api/participants/person/<id> with `themes`: a look is one of a person's own
 * settings, beside the send key and the message labels on the same row, and that door runs every
 * setter in one write, so a refusal anywhere stores nothing. The second is the look door,
 * GET and PUT /api/participants/person/<id>/look (src/server/api/the-persons-look.ts), where the
 * person, or a secretary holding the person's grant, reads and sets that person's look alone.
 *
 * WHO MAY: at the change door, that person and nobody else, by `whyTheChangeIsRefused('look', ...)`.
 * The grant is asked only at the look door, so an act it allows is written down there as done under it.
 *
 * WHAT IS KEPT: only what `readTheLook` in src/shared/own-themes.ts accepts, written back in its own
 * order. That reader is the theme reader and the one readability check, so a theme with a pair under
 * its floor is never kept, and the refusal names each fault at once.
 *
 * WHO IS GIVEN IT BACK: that person, on the roster in both shapes and in the change door's reply; and
 * at the look door, that person or a secretary holding the person's grant. No other reader is given
 * the field at all, so nobody else learns which look a person chose or what their own themes are called.
 */
import { readTheLook, type TheLook, type TheStoredLook } from '@shared/own-themes.ts'
import type { ParticipantRef } from '@shared/participants.ts'
import { whyTheChangeIsRefused } from '@shared/why-the-change-is-refused.ts'
import { sqlite } from '../db/client.ts'
import { PanelError } from './panel-error.ts'

/** Set a person's look, or clear it with null. Refuses with a sentence, and then nothing is written. */
export function setTheLook(who: ParticipantRef, look: unknown, by: ParticipantRef | null): void {
  const because = whyTheChangeIsRefused('look', who, by)
  if (because !== null) throw new PanelError(because, 403)
  keepTheLook(who, look)
}

/**
 * KEEP A LOOK, OR CLEAR IT WITH NULL, ONCE THE DOOR HAS FOUND THE CALLER MAY SET IT: the reader and the
 * one readability check, then one UPDATE. Answers what is kept now. Refuses with the reader's sentences,
 * and then nothing is written.
 */
export function keepTheLook(who: ParticipantRef, look: unknown): TheLook | null {
  const row = sqlite.prepare('SELECT id FROM people WHERE id = ?').get(who.id)
  if (row === undefined) throw new PanelError(`No person in this installation answers to "${who.id}". Nothing was written.`, 404)
  if (look === null) {
    sqlite.prepare('UPDATE people SET themes = NULL WHERE id = ?').run(who.id)
    return null
  }
  const read = readTheLook(look)
  if (!read.ok) throw new PanelError(`${read.why.join(' ')} Nothing was written.`, 400)
  sqlite.prepare('UPDATE people SET themes = ? WHERE id = ?').run(JSON.stringify(read.look), who.id)
  return read.look
}

/**
 * THE LOOK THE ROW HOLDS, read again by the same reader; null only when nobody set one. Only `keepTheLook`
 * writes the column, and only what the reader took, so a value that does not read now was written by
 * an earlier build, or the reader has become stricter since. That is unreadable, with the reader's
 * sentences, and never null: the page then draws the default look and writes nothing over it.
 */
export function theStoredLook(held: unknown): TheStoredLook {
  if (held === null || held === undefined) return null
  if (typeof held !== 'string') return { unreadable: ['The look kept for this person is not stored as text, so it cannot be read.'] }
  let parsed: unknown
  try {
    parsed = JSON.parse(held)
  } catch {
    return { unreadable: ['The look kept for this person is not written as JSON, so it cannot be read.'] }
  }
  const read = readTheLook(parsed)
  return read.ok ? read.look : { unreadable: read.why }
}

/** `{ themes }` when the reader is this person, and nothing at all for any other reader. */
export function theLookForTheReader(who: ParticipantRef, reader: ParticipantRef | null): { themes?: TheStoredLook } {
  if (who.kind !== 'person' || reader === null || reader.kind !== 'person' || reader.id !== who.id) return {}
  return { themes: theLookKeptFor(who) }
}

/** The look a person's row holds, read by `theStoredLook`. Asked only once the caller may be given it. */
export function theLookKeptFor(who: ParticipantRef): TheStoredLook {
  const row = sqlite.prepare('SELECT themes FROM people WHERE id = ?').get(who.id) as { themes: string | null } | undefined
  return theStoredLook(row?.themes)
}
