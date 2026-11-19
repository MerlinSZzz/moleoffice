// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theKeyReminderFor` was moved byte for byte out of src/server/lib/message-keys.ts, with no change of behaviour.
 * `anExistingId` was moved byte for byte out of src/server/lib/message-keys.ts, with no change of behaviour.
 * `theWordsAreStoredIn` was moved byte for byte out of src/server/lib/message-keys.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { theKeyReminder, whereAMessageHoldsAKey, type AKeyReminder, type AMessagesWords, AN_ID_THAT_IS_NOT_A_KEY_SQL, theRecordIdAtTheFront } from '@shared/message-keys.ts'
import type { Actor } from './records.ts'
import { THE_OFFICE_WRITES_AS } from './the-offices-secretary-run.ts'
import { sqlite } from '../db/client.ts'

/** The reminder for a message any part of whose words seems to hold a key, or null when none does or the office writes it itself. */
export function theKeyReminderFor(words: AMessagesWords[], actor: Actor): AKeyReminder | null {
  if (actor.type === THE_OFFICE_WRITES_AS.type && actor.id === THE_OFFICE_WRITES_AS.id) return null
  const found = whereAMessageHoldsAKey(words, anExistingId, theWordsAreStoredIn)
  return found === null ? null : theKeyReminder(found, true)
}
/** Whether a key-shaped piece is an existing record's id or agent's registry id, with any punctuation after it. */
export function anExistingId(piece: string): boolean {
  const id = theRecordIdAtTheFront(piece)
  return id !== undefined && sqlite.prepare(AN_ID_THAT_IS_NOT_A_KEY_SQL).get({ id }) !== undefined
}
/**
 * Whether a quote's words are stored, as they are, in the title, summary or data of the live record it quotes. The data is
 * held as JSON, so the words are looked for as JSON writes them.
 */
export function theWordsAreStoredIn(recordId: string, words: string): boolean {
  const inJson = JSON.stringify(words).slice(1, -1)
  return (
    sqlite
      .prepare(
        'SELECT 1 FROM records WHERE id = ? AND deleted_at IS NULL AND (instr(title, ?) > 0 OR instr(coalesce(summary, \'\'), ?) > 0 OR instr(data, ?) > 0)',
      )
      .get(recordId, words, words, inJson) !== undefined
  )
}
