// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IN A MESSAGE'S WORDS LOOKS LIKE A KEY (problem __4iR4FkFAGS), worked out here once. The message door reminds by it
 * (src/server/lib/message-keys.ts), a page asks its person by it before a send, and the count of stored messages that
 * already hold one reads it too, so none of them can come to disagree. The shapes themselves are the terminal's
 * (`whatLooksLikeASecret` in ./terminals.ts).
 *
 * A REMINDER, NEVER A REFUSAL. The office does not manage what its
 * users do. A message that seems to hold a key is stored as it was written, and its writer is told what was seen; a
 * person on a page is asked once, before the send, and may send it anyway.
 *
 * THE WORDS ARE EVERY FIELD THAT HOLDS WHAT A PERSON OR AN AGENT WROTE (wave 13w round 4): the title, the summary, the
 * body, `from`, `recipientHint`, `saidInFull` on a message the writer filed, the words `target`, each of `quotes` and
 * `lead` quote from a record (`span.quote`) or copied from the screen (`seen.quote`), each picture's `alt` and `caption`, the words a person typed for `chosenRecipient`, and the
 * machine and program `onlyOn` names. The ids a page or the office puts in a message's data (the send's own id, the
 * record a lead names, a run, a group, a project) are not words, and some are random, as a key is. What the office
 * writes itself is not judged: `saidInFull` on its own line, `edited`, `routed`, `carriedTo`, `summons`,
 * `deadLetterSweep`, `runWasAskedFor`, `writtenIn`, `writtenFrom`, and the sentence `chosenRecipient.why`. Nor is a
 * field's address (`span.field`, `seen.route`). A quote whose words are stored in the record its target names is let
 * through (wave 13w round 5).
 */

import { whatLooksLikeASecret, type ASecretSeen } from './terminals.ts'

/**
 * THE RECORD ID A KEY-SHAPED PIECE BEGINS WITH, when the piece is 12 id characters and then only punctuation, which no id
 * holds; otherwise undefined. Whether a record has that id is the database's answer, asked by whoever holds one.
 */
export function theRecordIdAtTheFront(piece: string): string | undefined {
  return /^([A-Za-z0-9_-]{12})[^A-Za-z0-9_-]*$/.exec(piece)?.[1]
}

/**
 * THE QUESTION THAT SAYS AN ID IS NOT A KEY, asked of the database with the id bound as `$id`. A record's id and an agent's
 * registry id are both 12 characters of letters, digits, - and _, and both are named in messages: a role request names its
 * asker by registry id (by-id-boundary's seed, wave 13n's round 40, a piece beginning "-puh"). One question for the office
 * and for the count that reads a copy, so the two cannot drift.
 */
export const AN_ID_THAT_IS_NOT_A_KEY_SQL =
  'SELECT 1 WHERE EXISTS (SELECT 1 FROM records WHERE id = $id) OR EXISTS (SELECT 1 FROM agents WHERE id = $id)'

/**
 * One part of a message's words, by where it is: `body`, `title`, `summary`, or the path of a field in its data. A quote
 * carries the id of the record it quotes, when its target names one: words already stored in that record are copied, not
 * written, and the server lets them through (src/server/lib/message-keys.ts).
 */
export type AMessagesWords = { where: string; text: string; quotesRecord?: string }

const isAnObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The words one Context quotes, with the record it is in: the span the writer selected, and the words the screen drew
 * where the writer pressed (`seen.quote`). A page copies `seen.quote`, but a writer may send any words in it, so it is
 * judged as a span is, and let through only where the words are stored in the record the target names (message
 * vjafrEk1UXk0, answer 3).
 */
function theQuotedWordsOf(context: unknown, at: string): AMessagesWords[] {
  if (!isAnObject(context)) return []
  const target = context['target']
  const recordId = isAnObject(target) && typeof target['recordId'] === 'string' ? target['recordId'] : undefined
  const inIt = recordId === undefined ? {} : { quotesRecord: recordId }
  const words: AMessagesWords[] = []
  for (const part of ['span', 'seen'] as const) {
    const one = context[part]
    if (isAnObject(one) && typeof one['quote'] === 'string') words.push({ where: `${at}.${part}.quote`, text: one['quote'], ...inIt })
  }
  return words
}

/**
 * EVERY PART OF A MESSAGE'S WORDS, the body first, from what a write would store. A part that is not a string is not words
 * and is not listed. `officeLine` is true only for a line the office's own code writes (`senderIsMoleOffice`), whose
 * `saidInFull` is the office's sentence and not the writer's.
 */
export function theWordsOfAMessage(message: { title?: unknown; summary?: unknown; data?: unknown; officeLine?: boolean }): AMessagesWords[] {
  const data = isAnObject(message.data) ? message.data : {}
  const words: AMessagesWords[] = []
  const add = (where: string, text: unknown): void => {
    if (typeof text === 'string') words.push({ where, text })
  }
  add('body', data['body'])
  if (!(typeof message.title === 'string' && aTitleCutFromTheBody(message.title, data['body']))) add('title', message.title)
  add('summary', message.summary)
  add('data.from', data['from'])
  add('data.recipientHint', data['recipientHint'])
  if (message.officeLine !== true) add('data.saidInFull', data['saidInFull'])
  words.push(...theQuotedWordsOf(data['target'], 'data.target'))
  if (Array.isArray(data['quotes'])) data['quotes'].forEach((one, i) => words.push(...theQuotedWordsOf(one, `data.quotes[${i}]`)))
  words.push(...theQuotedWordsOf(data['lead'], 'data.lead'))
  if (Array.isArray(data['pictures'])) {
    data['pictures'].forEach((one, i) => {
      if (!isAnObject(one)) return
      add(`data.pictures[${i}].alt`, one['alt'])
      add(`data.pictures[${i}].caption`, one['caption'])
    })
  }
  if (isAnObject(data['chosenRecipient'])) add('data.chosenRecipient.said', data['chosenRecipient']['said'])
  if (isAnObject(data['onlyOn'])) {
    add('data.onlyOn.machine', data['onlyOn']['machine'])
    add('data.onlyOn.program', data['onlyOn']['program'])
  }
  return words
}

/** The parts of `after` that a write changes: a part `before` holds with the same words at the same place is not asked again. */
export function theWordsAWriteChanges(before: AMessagesWords[], after: AMessagesWords[]): AMessagesWords[] {
  const held = new Set(before.map((one) => `${one.where}\u0000${one.text}`))
  return after.filter((one) => !held.has(`${one.where}\u0000${one.text}`))
}

/**
 * A TITLE CUT FROM THE BODY IS NOT JUDGED APART FROM IT. The chat and the worker make a message's title from the start of
 * its body, cut short, so a commit id across the cut would be a run of hex that is not a commit id. Everything in such a
 * title is in the body as well, whole, and is judged there.
 */
function aTitleCutFromTheBody(title: string, body: unknown): boolean {
  const start = title.replace(/\s*…$/, '')
  return typeof body === 'string' && start !== '' && body.trimStart().startsWith(start.trimStart())
}

/**
 * The first part of a message's words that seems to hold a key, in the order `theWordsOfAMessage` lists them, or null
 * when none does. `isARecordId` is the server's answer to whether a piece is an existing record's id
 * (`whatLooksLikeASecret` says why), and `isStoredIn` its answer to whether a quote's words are stored in the record the
 * quote names.
 */
export function whereAMessageHoldsAKey(
  words: AMessagesWords[],
  isARecordId?: (piece: string) => boolean,
  isStoredIn?: (recordId: string, words: string) => boolean,
): { where: string; seen: ASecretSeen } | null {
  for (const { where, text, quotesRecord } of words) {
    if (quotesRecord !== undefined && isStoredIn?.(quotesRecord, text) === true) continue
    const seen = whatLooksLikeASecret(text, isARecordId)
    if (seen !== null) return { where, seen }
  }
  return null
}

/**
 * EVERY PART OF A REPORT'S WORDS, in the list `theWordsOfAMessage` gives: the title, the summary, and every string inside
 * `data.blocks` at any depth, each by its path, such as `data.blocks[3].rows[1].cells[2]`. Nothing else in the data is
 * listed, so a report's short forms, which are written at their own door, are not.
 */
export function theWordsOfAReport(report: { title?: unknown; summary?: unknown; data?: unknown }): AMessagesWords[] {
  const words: AMessagesWords[] = []
  const add = (where: string, value: unknown): void => {
    if (typeof value === 'string') words.push({ where, text: value })
    else if (Array.isArray(value)) value.forEach((one, i) => add(`${where}[${i}]`, one))
    else if (isAnObject(value)) for (const [key, one] of Object.entries(value)) add(`${where}.${key}`, one)
  }
  if (typeof report.title === 'string') add('title', report.title)
  if (typeof report.summary === 'string') add('summary', report.summary)
  if (isAnObject(report.data)) add('data.blocks', report.data['blocks'])
  return words
}

/**
 * WHAT A WRITER IS TOLD WHEN THE WORDS SEEM TO HOLD A KEY: which shape was seen, where, the piece's first four characters
 * and its length, never the piece, so the reminder does not carry a key on. `shape` is the code a page names the shape by
 * in its own language; `says` is the English sentence an agent is shown.
 */
export interface AKeyReminder {
  shape: ASecretSeen['shape']
  what: string
  where: string
  begins: string
  n: number
  says: string
}

/** The reminder for what `whereAMessageHoldsAKey` found. `stored` says whether the message was stored or is still to be sent. */
export function theKeyReminder(found: { where: string; seen: ASecretSeen }, stored: boolean): AKeyReminder {
  const { where, seen } = found
  const begins = seen.piece.slice(0, 4)
  const n = seen.piece.length
  return {
    shape: seen.shape,
    what: seen.what,
    where,
    begins,
    n,
    says:
      `${stored ? 'This message was stored, but its' : "This message's"} ${where} seems to hold ${seen.what}: the piece beginning ` +
      `"${begins}", ${n} characters long. ` +
      (stored
        ? 'If it is a key, it is now kept in the office and in its backups, and every reader of the message can read it.'
        : 'If it is a key, it will be kept in the office and in its backups, and every reader of the message can read it.'),
  }
}
