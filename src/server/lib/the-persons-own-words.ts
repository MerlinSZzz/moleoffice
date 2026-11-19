// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHICH RECORDS ARE THE PERSON'S OWN WORDS, AND WHICH DECISIONS IN THE PERSON'S NAME DO NOT STAND ON THEM. The owner's
 * decision; the shapes and the sentences are src/shared/his-own-words.ts.
 *
 * ONE READING FOR THE GUARD AND THE MARK. `assertMayDecide` asks `whoseRecordsAreThese` of the one reference a new
 * decision cites, and the Decisions page and a decision's own page ask `decisionsNotOnThePersonsOwnWords` of the stored ones,
 * which asks the same function. So the door that refuses and the mark that warns cannot disagree about a record.
 *
 * IT READS IN BATCHES, a few queries for any number of records, because the Decisions page asks it of every decision.
 *
 * WHAT COUNTS AS THE PERSON'S OWN RECORD, in this order:
 *   - a message whose `sentBy` is the person: a message the person sent;
 *   - a record whose creation the change log credits to a person: a record the person wrote, which includes a note
 *     filed by the person's own press on "File as my words". A note a secretary filed under the person's grant is
 *     credited to the secretary, so it is never the person's (`whoPressedItUnderTheGrant` below);
 *   - a report holding an answer the person sent (`data.answers[block].sent.by`);
 *   - a proposal a live decision settles through a link a person made: a proposal the person settled by pressing.
 * A message somebody else sent, a record an agent wrote, a deleted record and an id nothing answers to are not.
 *
 * AND ONLY WHILE EVERY CHANGE TO ITS WORDS WAS THE PERSON'S. Check ekidFZV6r1Yt (4 October, round 11b) refused round 11
 * because the reading stopped at who created the record: a secretary PATCHed the body of a note the person had filed
 * (200) and then cited it in a decision in the person's name (201). Now the change log is read for every change
 * somebody other than the person made to the record's words, and one such change takes the record out (`wordsChanged`).
 * Which fields are a record's words is `isAWordOf` below. A change to anything else, such as short forms, does not count,
 * and a delivery or read mark is a row in `message_delivery` that writes no change on the message at all.
 * A proposal counts by the person's press, a link only that press makes, so its words are not asked.
 */
import { isDeepStrictEqual } from 'node:util'
import { and, eq, inArray, isNull, like, ne, or, sql } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { changes, links, ONE_KIND_WRITTEN_OUT, records, STORED_FIELDS, theWordsOfAStoredField } from '../db/schema.ts'
import { THE_PERSON } from '@shared/person.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import { RESOLVES_PROPOSAL } from '@shared/types.ts'
import { ANSWERS_FIELD } from '@shared/answers.ts'
import type {
  AWaitingNote,
  FiledUnderTheGrant,
  NotOnThePersonsOwnWords,
  NotWhatTheySaidUnderTheGrant,
  PersonsOwnRecord,
  PressedUnderTheGrant,
} from '@shared/the-persons-own-words.ts'
import { SHORT_FORMS_FIELD } from '@shared/zoom.ts'
import { SYSTEM_LINES, type NoteForThePersonStands } from '@shared/groups.ts'
import { isMoleOffice, moleOffice } from '@shared/participants.ts'
import { writeASystemLineToOne } from './groups.ts'
import { participantForActor } from './participant-for-actor.ts'
import {
  assertThePersonIsProved,
  everyAgentAStoredStampCouldName,
  humanMadeThisLink,
  thePressUnderTheGrantOf,
  type Actor,
} from './records.ts'
import { PanelError } from './panel-error.ts'

const DECISION = 'decision'
const MESSAGE = 'message'
const REPORT = 'report'
const PROPOSAL = 'proposal'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Who the change log says created each record, as the type and the id it stored; absent when no row says. */
function whoCreated(ids: readonly string[]): Map<string, { type: string; id: string }> {
  const out = new Map<string, { type: string; id: string }>()
  if (ids.length === 0) return out
  // IN PIECES (src/server/db/in-pieces.ts): the Decisions page asks this of every decision in the person's name.
  // The first row of a record is kept with no ORDER BY, as before: the order is SQLite's, and all of one record's
  // rows are in one piece.
  const rows = readInPieces(ids, (piece) =>
    db
      .select({ recordId: changes.recordId, actorType: changes.actorType, actorId: changes.actorId })
      .from(changes)
      .where(and(inArray(changes.recordId, piece), eq(changes.op, 'create')))
      .all(),
  )
  for (const row of rows) if (!out.has(row.recordId)) out.set(row.recordId, { type: row.actorType, id: row.actorId })
  return out
}

/** Who the change log says created each record: 'human', 'agent', 'system', or absent when no row says. */
function creatorsOf(ids: readonly string[]): Map<string, string> {
  return new Map([...whoCreated(ids)].map(([id, who]) => [id, who.type]))
}

/** The name of the one registered agent a stored writer names, or null when no row, or more than one, answers to it. */
function theAgentsName(stored: string): string | null {
  const named = everyAgentAStoredStampCouldName(stored)
  return named.length === 1 ? (named[0]?.name ?? null) : null
}

/** Whether a message's stored sender is the person. */
function sentByThePerson(data: unknown): boolean {
  if (!isObject(data) || !isObject(data['sentBy'])) return false
  return data['sentBy']['kind'] === 'person' && data['sentBy']['id'] === THE_PERSON
}

/** Whether a report holds an answer the person sent. */
function holdsAnAnswerOfThePersons(data: unknown): boolean {
  if (!isObject(data) || !isObject(data[ANSWERS_FIELD])) return false
  return Object.values(data[ANSWERS_FIELD]).some(
    (one) => isObject(one) && isObject(one['sent']) && one['sent']['underTheGrant'] === undefined && one['sent']['by'] === THE_PERSON,
  )
}

/** The proposals among `ids` that a live decision settles through a link a person made. */
function proposalsThePersonSettled(ids: readonly string[]): Set<string> {
  const out = new Set<string>()
  if (ids.length === 0) return out
  // IN PIECES (src/server/db/in-pieces.ts): these are the proposals cited by every decision in the person's name, so the
  // list grows with the office. The answer is a set, so the order of the rows does not matter.
  const settling = readInPieces(ids, (piece) =>
    db
      .select({ fromId: links.fromId, toId: links.toId, createdByType: links.createdByType })
      .from(links)
      .innerJoin(records, eq(records.id, links.fromId))
      .where(
        and(
          inArray(links.toId, piece),
          eq(links.type, RESOLVES_PROPOSAL),
          eq(records.kind, DECISION),
          isNull(records.deletedAt),
        ),
      )
      .all(),
  )
  for (const link of settling) {
    if (out.has(link.toId)) continue
    // THE LINK ROW SAYS WHO MADE IT since migration 0193; an older row is asked of the change log, as `humanMadeThisLink`
    // asks it, which is the one reading of that question.
    if (link.createdByType === 'human') out.add(link.toId)
    else if (link.createdByType === null && humanMadeThisLink(link.fromId, RESOLVES_PROPOSAL, link.toId)) out.add(link.toId)
  }
  return out
}

// ================================================================ which fields are a record's words

/**
 * THE FIELDS THAT HOLD A RECORD'S WORDS, BY KIND. A note says what it says in `body`, a message in `body`, a report in
 * its `blocks`. The title is not counted: anybody may retitle a record, as anybody may retitle a comment (the annotation
 * rule in src/server/lib/records.ts). A kind not listed here counts every field of its `data` as its words except its
 * short forms, because this cannot tell which of them the person wrote, and a guess would count an agent's words as the
 * person's.
 */
const WORDS_OF_A_KIND: Readonly<Record<string, readonly string[]>> = {
  note: ['body'],
  message: ['body'],
  report: ['blocks'],
}

/** Whether `key`, a top-level field of `data`, holds the words of a record of this kind. */
export function isAWordOf(kind: string, key: string): boolean {
  const listed = WORDS_OF_A_KIND[kind]
  return listed !== undefined ? listed.includes(key) : key !== SHORT_FORMS_FIELD
}

/** The top-level `data` field a change row's `field` names, or null when it names no field of `data`. */
function theDataFieldOf(field: string): string | null {
  if (!field.startsWith('data.')) return null
  const key = field.slice('data.'.length).split(/[.[]/)[0]
  return key === undefined || key === '' ? null : key
}

/** A change row's stored value, read back: a `data` row stores the object as JSON. */
function asStoredObject(value: string | null): Record<string, unknown> {
  if (value === null) return {}
  try {
    const read: unknown = JSON.parse(value)
    return isObject(read) ? read : {}
  } catch {
    return {}
  }
}

/**
 * THE RECORDS AMONG `asked` WHOSE WORDS SOMEBODY OTHER THAN THE PERSON CHANGED, read from the change log in one query.
 * `isWord(id, key)` says whether a field of that record holds the words that make it the person's. Every spelling the
 * log uses for a change to `data` is read: one row per path (`data.body`, `data.blocks[#b-1].text`), and one `data` row
 * for a write that replaced the whole object, whose two values are compared field by field. A kind change moves the
 * words with rows at `data.<field>`, so it is read the same way.
 */
function wordsSomebodyElseChanged(asked: readonly string[], isWord: (id: string, key: string) => boolean): Set<string> {
  const out = new Set<string>()
  if (asked.length === 0) return out
  // IN PIECES (src/server/db/in-pieces.ts): these are the records cited by every decision in the person's name, so the
  // list grows with the office. The answer is a set, so the order of the rows does not matter.
  const rows = readInPieces(asked, (piece) =>
    db
      .select({ recordId: changes.recordId, field: changes.field, oldValue: changes.oldValue, newValue: changes.newValue })
      .from(changes)
      .where(
        and(
          inArray(changes.recordId, piece),
          eq(changes.op, 'update'),
          ne(changes.actorType, 'human'),
          or(eq(changes.field, 'data'), like(changes.field, 'data.%')),
        ),
      )
      .all(),
  )
  for (const row of rows) {
    if (out.has(row.recordId) || row.field === null) continue
    if (row.field === 'data') {
      const was = asStoredObject(row.oldValue)
      const is = asStoredObject(row.newValue)
      const moved = [...new Set([...Object.keys(was), ...Object.keys(is)])].filter((key) => !isDeepStrictEqual(was[key], is[key]))
      if (moved.some((key) => isWord(row.recordId, key))) out.add(row.recordId)
      continue
    }
    const key = theDataFieldOf(row.field)
    if (key !== null && isWord(row.recordId, key)) out.add(row.recordId)
  }
  return out
}

/** For each id, whether it is a record of the person's own words, and if not, why not. */
export function whoseRecordsAreThese(ids: readonly string[]): Map<string, PersonsOwnRecord> {
  const asked = [...new Set(ids)]
  const out = new Map<string, PersonsOwnRecord>()
  if (asked.length === 0) return out
  // IN PIECES (src/server/db/in-pieces.ts): the Decisions page asks this of what every decision in the person's
  // name cites. The rows go into a map by id, so the order of the pieces does not matter.
  const found = readInPieces(asked, (piece) =>
    db
      .select({ id: records.id, kind: records.kind, title: records.title, data: records.data, deletedAt: records.deletedAt })
      .from(records)
      .where(inArray(records.id, piece))
      .all(),
  )
  const byId = new Map(found.map((one) => [one.id, one]))
  const creators = creatorsOf(found.map((one) => one.id))
  const settled = proposalsThePersonSettled(found.filter((one) => one.kind === PROPOSAL).map((one) => one.id))
  const counted = new Map<string, PersonsOwnRecord>()
  for (const id of asked) {
    const one = byId.get(id)
    if (one === undefined) {
      counted.set(id, { own: false, because: 'noRecord', kind: null, title: null })
    } else if (one.deletedAt !== null) {
      counted.set(id, { own: false, because: 'deleted', kind: one.kind, title: one.title })
    } else if (one.kind === MESSAGE) {
      counted.set(
        id,
        sentByThePerson(one.data) ? { own: true, as: 'message' } : { own: false, because: 'agentsMessage', kind: one.kind, title: one.title },
      )
    } else if (creators.get(id) === 'human') {
      counted.set(id, { own: true, as: 'record' })
    } else if (one.kind === REPORT && holdsAnAnswerOfThePersons(one.data)) {
      counted.set(id, { own: true, as: 'answer' })
    } else if (one.kind === PROPOSAL && settled.has(id)) {
      counted.set(id, { own: true, as: 'proposal' })
    } else {
      counted.set(id, { own: false, because: 'notTheirs', kind: one.kind, title: one.title })
    }
  }
  // WHOSE WORDS THE RECORD HOLDS NOW. A message counts by its body, an answer by the answers the person gave, a record the
  // person wrote by its kind's words. A proposal counts by the person's press and is not asked.
  const wordsOf = (id: string, key: string): boolean => {
    const theirs = counted.get(id)
    const kind = byId.get(id)?.kind ?? ''
    if (theirs === undefined || !theirs.own) return false
    return theirs.as === 'answer' ? key === ANSWERS_FIELD : theirs.as === 'proposal' ? false : isAWordOf(kind, key)
  }
  const changedByAnother = wordsSomebodyElseChanged(
    asked.filter((id) => counted.get(id)?.own === true),
    wordsOf,
  )
  for (const [id, theirs] of counted) {
    const one = byId.get(id)
    out.set(id, changedByAnother.has(id) ? { own: false, because: 'wordsChanged', kind: one?.kind ?? null, title: one?.title ?? null } : theirs)
  }
  return out
}

/** A decision's `authority_reference`, trimmed, or null when it holds none. */
export function referenceOf(data: unknown): string | null {
  if (!isObject(data) || typeof data['authority_reference'] !== 'string') return null
  const said = data['authority_reference'].trim()
  return said === '' ? null : said
}

/**
 * THE MARK, FOR EACH DECISION THAT EARNS ONE: written in the person's name (`decided_by` "the owner") by somebody the
 * change log does not record as a person, citing a record that is not the person's own. A decision the person wrote
 * carries no mark, whatever it cites, because the person writing it is the person's own word.
 */
export function decisionsNotOnThePersonsOwnWords(
  decisions: readonly { id: string; data: unknown }[],
): Map<string, NotOnThePersonsOwnWords> {
  const inTheirName = decisions.filter((one) => isObject(one.data) && one.data['decided_by'] === THE_OWNER)
  const out = new Map<string, NotOnThePersonsOwnWords>()
  if (inTheirName.length === 0) return out
  const writers = whoCreated(inTheirName.map((one) => one.id))
  const notByThem = inTheirName.filter((one) => writers.get(one.id)?.type !== 'human')
  const references = whoseRecordsAreThese(notByThem.flatMap((one) => referenceOf(one.data) ?? []))
  const nothing: PersonsOwnRecord = { own: false, because: 'noRecord', kind: null, title: null }
  for (const one of notByThem) {
    const reference = referenceOf(one.data)
    const theirs: PersonsOwnRecord = reference === null ? nothing : (references.get(reference) ?? nothing)
    if (theirs.own) continue
    const writer = writers.get(one.id)
    out.set(one.id, {
      reference,
      because: theirs.because,
      kind: theirs.kind,
      // THE TITLE OF WHAT IT CITES AND THE NAME OF WHO RECORDED IT, so the page names both rather than printing ids.
      referenceTitle: theirs.title,
      writer: writer?.type === 'agent' ? 'agent' : writer !== undefined ? 'office' : 'unrecorded',
      writerName: writer?.type === 'agent' ? theAgentsName(writer.id) : null,
    })
  }
  return out
}

// ================================================================ the door for words said somewhere else

/** The field a secretary sets on a note whose body copies the person's words, and the field the press writes. */
export const FOR_THE_PERSON_TO_FILE = 'for_the_person_to_file'
export const FILED_FROM = 'filed_from'

/**
 * NOBODY BUT THE PERSON CHANGES THE WORDS OF A NOTE THE PERSON WROTE. That covers a note filed by the person's press on
 * "File as my words" and one the person wrote directly: the change log credits the creation of both to a person.
 * Asked before anything is written, of the data this write would store, so `data`, `dataPatch`, a kind change and a
 * put-back of an earlier revision are judged alike: a kind change takes the body out of `body`, which is a change.
 * The person may still change their own note, and anybody may still change what is not its words, such as its title,
 * its short forms and its links. The same rule keeps an agent off a comment the person wrote (the annotation rule in
 * src/server/lib/records.ts) and off a message the person sent (`messageNotYourWords`).
 */
export function refuseAChangeToTheWordsOfThePersonsNote(
  before: { id: string; kind: string; data: unknown },
  next: { data: unknown },
  actor: Actor,
): void {
  if (before.kind !== 'note' || actor.type === 'human') return
  const stored = isObject(before.data) ? before.data : {}
  const arriving = isObject(next.data) ? next.data : {}
  const moved = (WORDS_OF_A_KIND['note'] ?? []).filter((key) => !isDeepStrictEqual(stored[key], arriving[key]))
  if (moved.length === 0) return
  if (creatorsOf([before.id]).get(before.id) !== 'human') return
  throw new PanelError(
    `The person wrote note ${before.id}, so its words are theirs and only they may change them. You are ` +
      `${actor.type}:${actor.id}. Nothing was written. A decision in the person's name may cite this note as the ` +
      `person's own words, and words an agent put into it would stand under the person's name. ` +
      `To say something about it, write a NEW note and link it with POST /api/links ` +
      `{"fromId":"<the new one>","toId":"${before.id}","type":"relates_to"}. Its title, its short forms and its links ` +
      `may still be changed.`,
    403,
    undefined,
    undefined,
    'Only the person may change the words of a note they wrote.',
    { code: 'noteWordsAreThePersons', values: {} },
  )
}

/** Whether a stored note is words prepared for the person to file. */
export function isPreparedForThePerson(record: { kind: string; data: unknown }): boolean {
  return record.kind === 'note' && isObject(record.data) && record.data[FOR_THE_PERSON_TO_FILE] === true
}

/**
 * THE NOTE THE PERSON FILED FROM A PREPARED ONE, or null when the person has not filed it. Only a live note the person
 * wrote counts, so a note an agent writes with `filed_from` set does not make a prepared note look filed.
 */
export function theNoteFiledFrom(preparedId: string): { id: string; title: string } | null {
  const candidates = db
    .select({ id: records.id, title: records.title })
    .from(records)
    .where(
      and(
        eq(records.kind, 'note'),
        isNull(records.deletedAt),
        sql`json_extract(${records.data}, ${'$.' + FILED_FROM}) = ${preparedId}`,
      ),
    )
    .all()
  if (candidates.length === 0) return null
  const writers = creatorsOf(candidates.map((one) => one.id))
  const theirs = candidates.find((one) => writers.get(one.id) === 'human')
  return theirs === undefined ? null : { id: theirs.id, title: theirs.title }
}

// ================================================================ a secretary's press under the person's grant

/**
 * WHAT A SECRETARY'S PRESS UNDER THE PERSON'S GRANT LEAVES ON A NOTE (wave 13s round 68). The note a press on "File as my
 * words" writes holds the first, and the prepared note a press on "Not what I said" marks holds the second. Neither is
 * ever the person's: the person's own words are a note the person wrote, and the person's own mark is
 * `not_what_the_person_said`, which only the person writes.
 */
export const FILED_UNDER_THE_GRANT = 'filed_under_the_grant'
export const NOT_WHAT_THEY_SAID_UNDER_THE_GRANT = 'not_what_they_said_under_the_grant'

/** The doors that write each of the two fields, and nothing else does. */
const THE_DOORS_THAT_WRITE: Readonly<Record<string, readonly string[]>> = {
  [FILED_UNDER_THE_GRANT]: ['record.file-as-my-words', 'record.confirm-all-my-words'],
  [NOT_WHAT_THEY_SAID_UNDER_THE_GRANT]: ['record.not-what-i-said'],
}

/**
 * WHO PRESSED THIS REQUEST'S DOOR UNDER THE PERSON'S GRANT: the secretary by its registry id, the grant and the press, or
 * null when the grant carried nothing, as on the person's own press. The one place this is worked out, for the two
 * fields above, the handover's writer and the line to whoever wrote the note down. Only `aRaiseCarriesIt` marks a press
 * as under the grant, after the check said yes, so a request that never asked it gets null.
 *
 * A press the grant carried whose secretary no registry row answers to, or that has no press id, is a broken assumption,
 * and it is refused rather than stored with a gap.
 */
export function whoPressedItUnderTheGrant(actor: Actor): PressedUnderTheGrant | null {
  const grant = actor.press?.underTheGrant
  if (grant === undefined) return null
  const by = participantForActor(actor)
  const press = thePressUnderTheGrantOf(actor)
  if (by === null || by.kind !== 'agent' || press === undefined) {
    const whatIsMissing = by === null || by.kind !== 'agent' ? 'no agent in the registry answers to it' : 'the press has no id'
    throw new PanelError(
      `"${actor.id}" pressed under the person's grant, but ${whatIsMissing}. ` +
        'Nothing was written. This is a fault in Mole Office: a press under the grant names its secretary and its press.',
      500,
    )
  }
  return { by: { kind: 'agent', id: by.id }, grant, press }
}

/**
 * NOBODY WRITES, CHANGES OR TAKES OFF WHAT A PRESS UNDER THE GRANT LEFT ON A NOTE, other than that press. A field may go
 * from absent to present once, by the door that writes it, holding exactly who pressed it as `whoPressedItUnderTheGrant`
 * works it out. Asked of the data a write would store, on a create and on every change, so `data`, `dataPatch`, a kind
 * change and a put-back are judged alike, and a write that carries a field across unchanged passes. The person is refused
 * too: what the field says is that a secretary pressed, and the person's own answer has fields of its own.
 */
function refuseAWriteOfWhatThePressLeft(before: { id: string; data: unknown } | null, next: { data: unknown }, actor: Actor): void {
  for (const [field, doors] of Object.entries(THE_DOORS_THAT_WRITE)) {
    const stored = before !== null && isObject(before.data) ? before.data[field] : undefined
    const arriving = isObject(next.data) ? next.data[field] : undefined
    if (isDeepStrictEqual(stored, arriving)) continue
    const door = actor.press?.operation ?? null
    const pressed = stored === undefined && door !== null && doors.includes(door) ? whoPressedItUnderTheGrant(actor) : null
    if (
      pressed !== null &&
      isObject(arriving) &&
      isDeepStrictEqual({ by: arriving['by'], grant: arriving['grant'], press: arriving['press'] }, pressed)
    ) {
      continue
    }
    throw new PanelError(
      `The field \`${field}\` says which secretary pressed ${doors.join(' or ')} under the person's grant, and only that ` +
        `press writes it. This request came from ${actor.type}:${actor.id}${door === null ? '' : ` through ${door}`}. ` +
        'Nothing was written. Nobody changes or removes it once it is there. Send the record\'s other fields without changing it.',
      403,
    )
  }
}

/**
 * THE NOTE A SECRETARY FILED UNDER THE PERSON'S GRANT FROM A PREPARED ONE, or null when none was. The field is written
 * only by that press, so the field is the proof, whoever the change log says created the note.
 *
 * Found through `records_note_filed_under_the_grant_from_idx` (migration 0289), so the field is asked in that index's
 * words and not as a bound value, and the kind and the field being there are said as the index's WHERE says them. Those
 * words read the field only from data that is valid JSON, so a note whose data is not JSON is not found here.
 */
export function theNoteFiledUnderTheGrantFrom(preparedId: string): { id: string; title: string; filed: FiledUnderTheGrant } | null {
  const filedUnderTheGrantFrom = STORED_FIELDS.noteFiledUnderTheGrantFrom(records.data)
  const row = db
    .select({ id: records.id, title: records.title, filed: sql<string>`json_extract(${records.data}, ${'$.' + FILED_UNDER_THE_GRANT})` })
    .from(records)
    .where(
      and(
        ONE_KIND_WRITTEN_OUT.note,
        sql`${filedUnderTheGrantFrom} IS NOT NULL`,
        sql`${filedUnderTheGrantFrom} = ${preparedId}`,
        isNull(records.deletedAt),
      ),
    )
    .orderBy(records.createdAt, records.id)
    .limit(1)
    .get()
  return row === undefined ? null : { id: row.id, title: row.title, filed: JSON.parse(row.filed) as FiledUnderTheGrant }
}

/** The name a stored secretary is said by: its registered name, or the id stored when no one row answers to it. */
export function theSecretarysName(by: unknown): string {
  const id = isObject(by) && typeof by['id'] === 'string' ? by['id'] : String(by)
  return theAgentsName(id) ?? id
}

/**
 * WHY THIS NOTE DOES NOT WAIT FOR THE PERSON, or null when it waits. Asked by the three presses before they write, and by
 * the line to whoever wrote the note down, so they agree with each other and with `theNotesWaitingForThePerson` on what a
 * waiting note is. A note a secretary answered under the person's grant does not wait: the answer is the secretary's,
 * and it is said so here, by name, so a later press, the person's own among them, is told who answered it and how.
 */
export function whyThisNoteDoesNotWait(record: { id: string; kind: string; data: unknown }): string | null {
  const id = record.id
  if (!isPreparedForThePerson(record)) {
    return (
      `${id} is not a note prepared for the person to file. Only a note with for_the_person_to_file set to true ` +
      'can be filed as their own words.'
    )
  }
  const data = isObject(record.data) ? record.data : {}
  if (data[NOT_WHAT_THE_PERSON_SAID] !== undefined) {
    return `The person said the note ${id} is not what they said, at ${String(data[NOT_WHAT_THE_PERSON_SAID])}.`
  }
  const marked = data[NOT_WHAT_THEY_SAID_UNDER_THE_GRANT]
  if (marked !== undefined) {
    const at = isObject(marked) ? String(marked['at']) : String(marked)
    return (
      `The secretary "${theSecretarysName(isObject(marked) ? marked['by'] : marked)}" said under the person's grant, at ${at}, ` +
      `that the note ${id} is not what the person said.`
    )
  }
  const already = theNoteFiledFrom(id)
  if (already !== null) return `These words are already filed as the person's own, as the note ${already.id}.`
  const underTheGrant = theNoteFiledUnderTheGrantFrom(id)
  if (underTheGrant !== null) {
    return (
      `The secretary "${theSecretarysName(underTheGrant.filed.by)}" filed these words under the person's grant, as the ` +
      `note ${underTheGrant.id}. That note is the secretary's, and not the person's own words.`
    )
  }
  return null
}

// ================================================================ the page of words waiting for the person

/**
 * THE MARK THE PERSON'S PRESS ON "NOT WHAT I SAID" WRITES ON A PREPARED NOTE: when they pressed it. The note is kept, so
 * what the secretary copied stays on the record beside the person's answer that it is not what they said. A marked
 * note is no longer waiting, and it cannot be filed as the person's words, as look A of a decision
 * says.
 */
export const NOT_WHAT_THE_PERSON_SAID = 'not_what_the_person_said'

/**
 * NOBODY BUT THE PERSON WRITES, CHANGES OR TAKES OFF THE MARK THAT A NOTE IS NOT WHAT THE PERSON SAID. An agent that
 * could write it could take a note of the person's words off their page before they saw it, and an agent that could
 * take it off could put words the person refused back in front of them. Asked of the data a write would store, on a
 * create (`before` null) and on every change, so `data`, `dataPatch`, a kind change and a put-back are judged alike.
 * It fires on the value changing, so an agent's ordinary edit to a marked note that carries the mark across passes.
 * No warrant and no raise answers it: a secretary's press under the grant writes a mark of its own,
 * `not_what_they_said_under_the_grant`, and never this one.
 *
 * IT ASKS THE SAME OF WHAT A PRESS UNDER THE GRANT LEFT ON A NOTE first (`refuseAWriteOfWhatThePressLeft`), so every
 * write of a note is asked about both fields in the one place that already guards this one.
 */
export function refuseAnAgentsMarkThatTheWordsAreNotThePersons(
  before: { id: string; data: unknown } | null,
  next: { data: unknown },
  actor: Actor,
): void {
  refuseAWriteOfWhatThePressLeft(before, next, actor)
  const stored = before !== null && isObject(before.data) ? before.data[NOT_WHAT_THE_PERSON_SAID] : undefined
  const arriving = isObject(next.data) ? next.data[NOT_WHAT_THE_PERSON_SAID] : undefined
  if (isDeepStrictEqual(stored, arriving)) return
  if (actor.type === 'human') {
    assertThePersonIsProved(actor, 'Saying a note is not what you said', 'Only the person says that words are not what they said.')
    return
  }
  throw new PanelError(
    `Only the person says that a note is not what they said, and this request came from ${actor.type}:${actor.id}. ` +
      `Nothing was written. The field \`${NOT_WHAT_THE_PERSON_SAID}\` is written by the person's press, ` +
      `POST /api/records/<the note>/not-what-i-said, and by nothing else. Send the record's other fields without changing it.`,
    403,
  )
}

/**
 * THE NOTES WAITING FOR THE PERSON, ACROSS EVERY PROJECT, ONE PAGE AT A TIME, AND HOW MANY THERE ARE.
 *
 * A note waits when it is a live `note` with `for_the_person_to_file` true, nobody said it is not what the person said
 * (neither the person nor a secretary under their grant), no live note the person wrote names it in `filed_from`, and no
 * live note names it in `filed_under_the_grant`. The last two are `theNoteFiledFrom` and `theNoteFiledUnderTheGrantFrom`,
 * asked in the one statement. The ids the person's notes were filed from are read once into a list, so that part is one
 * pass over the notes and not one per note. The note filed under the grant is looked up for each prepared note through
 * `records_note_filed_under_the_grant_from_idx` (migration 0289), in that index's words: `g.kind = 'note'` written out,
 * the field said to be there, and `+r.id`, since an id compared with its column's affinity would not use an index on an
 * expression. `whyThisNoteDoesNotWait` asks the same of one note.
 *
 * Oldest first, so the person reads the words in the order they were said down. Ties are broken by id, so a page never
 * shows a note twice or skips one.
 */
export function theNotesWaitingForThePerson(page: { limit: number; offset: number }): { notes: AWaitingNote[]; total: number } {
  const filedUnderTheGrantFrom = theWordsOfAStoredField(STORED_FIELDS.noteFiledUnderTheGrantFrom, 'g.data')
  const waiting = `
    FROM records r
    WHERE r.kind = 'note' AND r.deleted_at IS NULL
      AND json_type(r.data, '$.${FOR_THE_PERSON_TO_FILE}') = 'true'
      AND json_type(r.data, '$.${NOT_WHAT_THE_PERSON_SAID}') IS NULL
      AND json_type(r.data, '$.${NOT_WHAT_THEY_SAID_UNDER_THE_GRANT}') IS NULL
      AND r.id NOT IN (
        SELECT json_extract(f.data, '$.${FILED_FROM}')
        FROM records f JOIN changes c ON c.record_id = f.id AND c.op = 'create' AND c.actor_type = 'human'
        WHERE f.kind = 'note' AND f.deleted_at IS NULL AND json_extract(f.data, '$.${FILED_FROM}') IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM records g
        WHERE g.kind = 'note' AND ${filedUnderTheGrantFrom} IS NOT NULL AND ${filedUnderTheGrantFrom} = +r.id AND g.deleted_at IS NULL
      )`
  const total = (sqlite.prepare(`SELECT COUNT(*) AS n ${waiting}`).get() as { n: number }).n
  const rows = sqlite
    .prepare(
      `SELECT r.id, r.workspace_id AS workspaceId, w.title AS project, r.title, r.created_at AS createdAt,
              json_extract(r.data, '$.body') AS body, json_extract(r.data, '$.date') AS date
       ${waiting.replace('FROM records r', 'FROM records r LEFT JOIN workspaces w ON w.id = r.workspace_id')}
       ORDER BY r.created_at, r.id LIMIT ? OFFSET ?`,
    )
    .all(page.limit, page.offset) as Array<Omit<AWaitingNote, 'preparedBy' | 'body' | 'date'> & { body: unknown; date: unknown }>
  const writers = whoCreated(rows.map((row) => row.id))
  const notes = rows.map((row): AWaitingNote => {
    const writer = writers.get(row.id)
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      project: row.project,
      title: row.title,
      body: typeof row.body === 'string' && row.body.trim() !== '' ? row.body : null,
      date: typeof row.date === 'string' ? row.date : null,
      createdAt: row.createdAt,
      preparedBy:
        writer === undefined
          ? null
          : { type: writer.type, id: writer.id, name: writer.type === 'agent' ? theAgentsName(writer.id) : null },
    }
  })
  return { notes, total }
}

// ================================================================ the line to whoever wrote the note down

/** Whether a stored note waits for the person, by the conditions `theNotesWaitingForThePerson` reads. */
export function waitsForThePerson(record: { id: string; kind: string; data: unknown }): boolean {
  return whyThisNoteDoesNotWait(record) === null
}

/**
 * ONE LINE TO THE AGENT WHO WROTE A NOTE DOWN FOR THE PERSON, saying where it stands: it waits on
 * the person's page, the person confirmed it, or the person said it is not what they said; or a secretary, under the
 * person's grant, filed it or said it is not what the person said. The kind is `aNoteForThePerson`, which wakes nobody
 * (src/server/lib/notices.ts).
 *
 * The writer is read from the change log, as the person's page reads it. Nobody is told when the log names no agent: a
 * note a person wrote down has nobody else to tell. Called inside the write it reports, so a line that cannot be written
 * undoes that write, and the refusal says why. Returns the line's id, or null when nobody was told.
 */
export function tellTheWriterOfTheNote(
  note: { id: string; title: string; workspaceId: string },
  stands: NoteForThePersonStands,
): string | null {
  const writer = whoCreated([note.id]).get(note.id)
  if (writer === undefined || writer.type !== 'agent' || isMoleOffice({ kind: 'agent', id: writer.id })) return null
  return writeASystemLineToOne(
    { kind: 'agent', id: writer.id },
    note.workspaceId,
    SYSTEM_LINES.aNoteForThePerson(note.id, note.title, stands),
    { type: 'system', id: moleOffice().id },
  ).id
}
