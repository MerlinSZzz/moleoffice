// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE WHOSE WORDS SEEM TO HOLD A KEY IS STORED, AND ITS WRITER IS REMINDED (problem __4iR4FkFAGS). A decision
 * , of 7 October 2026, ended the refusal this door gave before.
 *
 * A message is kept in the database, in every backup and in every conversation that reads it, so a key pasted into one is
 * a key kept in plain text in all of them. But the office does not manage what its users do, and a shape is not a key: a
 * reminder lets the writer decide, where a refusal decided for them, and often wrongly. Its words are judged by the
 * shapes the terminal uses (`whatLooksLikeASecret` in src/shared/terminals.ts), never by a second list, so the two
 * cannot drift. Which words are asked, and in which order, is src/shared/message-keys.ts.
 *
 * STORED AS WRITTEN, NEVER WITH THE KEY TAKEN OUT. A message with a piece cut from it would be stored as words its writer
 * did not write. The answer to the write carries the reminder (`keyReminder`): which shape was seen, where, and the
 * piece's first four characters and its length, never the piece, so the answer does not carry the key on.
 *
 * WHAT A PERSON OR AN AGENT WRITES IS JUDGED, AND WHAT THE OFFICE WRITES ITSELF IS NOT (message bDovnimMAmvu).
 * The API server writing as itself composes a bounce, the secretary's line or a notice from facts it holds, such as a
 * file's full hash or a folder's path, which can have a key's shape and are not keys. The other messages it writes, a
 * dead-letter copy or a quote, copy words that were judged when they were first written. Above all, the office's own
 * work is not reminded of facts it holds itself. The message worker is judged, because what it files is an agent's reply,
 * in the agent's words.
 *
 * AN EXISTING RECORD'S ID IS NOT A KEY (problem __4iR4FkFAGS, message oA4sCtt5CeIZ). About 1 in 4,096 ids begins
 * with -p, and the office writes lines naming a run or a seal under the name of the agent whose write caused them (the
 * run-sealed notice did, and failed the finish when this door refused). An agent quoting such an id is not quoting a key
 * either. The id may be
 * followed by punctuation, which no id holds, so the id is read from the front of the piece.
 *
 * A QUOTE OF WORDS STORED IN THE RECORD IT QUOTES IS NOT JUDGED (wave 13w round 4). A comment on a report quotes the
 * report's own words, and a report may hold a file's full hash. Those words are already stored, and a reminder about them
 * would remind its writer of words somebody else wrote. A quote that is not in the record it names is the writer's own,
 * and is judged.
 */

import { AN_ID_THAT_IS_NOT_A_KEY_SQL, theKeyReminder, theRecordIdAtTheFront, theWordsOfAMessage, theWordsOfAReport, whereAMessageHoldsAKey, type AKeyReminder, type AMessagesWords } from '@shared/message-keys.ts'
import { sqlite } from '../db/client.ts'
import { piecesOf } from '../db/in-pieces.ts'
import { onlyTheMessagesThisReaderMayRead, type AMessageReader } from './messages.ts'
import type { Actor } from './records.ts'
import { THE_OFFICE_WRITES_AS } from './the-offices-secretary-run.ts'

export { anExistingId } from './the-key-reminder-for.ts'

export { theWordsAreStoredIn } from './the-key-reminder-for.ts'

export { theKeyReminderFor } from './the-key-reminder-for.ts'

/**
 * THE RECORDS A WRITE'S WORDS NAME, each with its kind and title, so a writer who put a wrong id in a message or a report
 * sees it at once. Nothing is refused for what the list shows.
 *
 * A message's words are `theWordsOfAMessage` and a report's are `theWordsOfAReport`. Each part is split at every
 * character no id holds, so an id inside a path such as /api/records/<id> is read, and each piece is read by
 * `theRecordIdAtTheFront`. A word that names no record is not listed, and nor is an agent's registry id, which names no
 * record. The ids a write puts in its data by design, such as `to`, `toGroup` and `target`, are not words.
 *
 * A RECORD THIS WRITER MAY NOT READ NAMES NOTHING, by the check GET /api/records makes (`onlyTheMessagesThisReaderMayRead`
 * in lib/messages.ts), so no title reaches a writer who could not read the record. A record in another project is listed:
 * the record door's refusal of such a record already gives its title (`recordInWorkspace` in lib/records.ts).
 */
export interface ARecordNamed {
  id: string
  kind: string
  title: string
  /** The first part of the words that names it, written as the key reminder writes it: `body`, `title`, `summary` or a path. */
  where: string
  deleted?: true
}

/** The read of the records among some ids, with the ids bound in brackets after it. */
export const THE_READ_OF_THE_RECORDS_NAMED = 'SELECT id, kind, title, deleted_at AS deletedAt FROM records WHERE id IN '

/** The records these words name, each once, in the order they are first named, read 500 ids at a time (`piecesOf`). */
export function theRecordsTheseWordsName(words: AMessagesWords[], reader: AMessageReader): ARecordNamed[] {
  const firstNamedAt = new Map<string, string>()
  for (const { where, text } of words) {
    for (const piece of text.split(/[^A-Za-z0-9_-]+/)) {
      const id = theRecordIdAtTheFront(piece)
      if (id !== undefined && !firstNamedAt.has(id)) firstNamedAt.set(id, where)
    }
  }
  const rows: { id: string; kind: string; title: string; deletedAt: string | null }[] = []
  for (const piece of piecesOf(firstNamedAt.keys())) {
    rows.push(...(sqlite.prepare(`${THE_READ_OF_THE_RECORDS_NAMED}(${piece.map(() => '?').join(', ')})`).all(...piece) as typeof rows))
  }
  const readable = new Map(onlyTheMessagesThisReaderMayRead(reader, rows).map((row) => [row.id, row]))
  return [...firstNamedAt].flatMap(([id, where]) => {
    const row = readable.get(id)
    return row === undefined ? [] : [{ id, kind: row.kind, title: row.title, where, ...(row.deletedAt === null ? {} : { deleted: true as const }) }]
  })
}

/** What the answer says when the records a write names could not be read. The write is stored, and stands. */
export function theRecordsNamedWereNotRead(kind: string, error: unknown): string {
  return `The ${kind} is stored, but the records its words name could not be read: ${error instanceof Error ? error.message : String(error)}`
}

/**
 * THE LIST FOR THE ANSWER TO A WRITE OF A MESSAGE OR A REPORT, asked after the write is stored, and null for any other
 * kind. If the read fails, the list is null and `recordsNamedNotRead` says why, because an empty list would say the
 * words name no record. A message is read as the record door stores one: no line of the office's own is written or
 * changed there, so its `saidInFull` is the writer's words.
 */
export function theRecordsAWriteNames(
  record: { kind: string; title: string; summary: string | null; data: unknown },
  reader: AMessageReader,
): { recordsNamed: ARecordNamed[] } | { recordsNamed: null; recordsNamedNotRead: string } | null {
  const words = record.kind === 'message' ? theWordsOfAMessage(record) : record.kind === 'report' ? theWordsOfAReport(record) : null
  if (words === null) return null
  try {
    return { recordsNamed: theRecordsTheseWordsName(words, reader) }
  } catch (error) {
    return { recordsNamed: null, recordsNamedNotRead: theRecordsNamedWereNotRead(record.kind, error) }
  }
}
