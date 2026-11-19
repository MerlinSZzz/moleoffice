// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT `GET /api/records/my-notes` ANSWERS, worked out here so src/server/api/records.ts holds only the route and its
 * query shape. Every rule of what a note holds is in src/shared/my-notes.ts, which the page draws with too.
 *
 * THE ORDER OF THE WORK.
 *   1. A search reads only the notes the index of the records' text says could hold it, as `GET /api/search` and
 *      `GET /api/records?q=` do, and then asks `saysIt` (src/shared/search.ts), the rule those doors use, of each
 *      note's own words alone (`theWordsOfANote`). A whole note would also be searched in its part types, colours,
 *      ids and file paths, so a search for "red" or "box" would find notes that say neither.
 *   2. The choices above the list are counted over every note the search keeps.
 *   3. The chosen notes are ordered newest started first, and the weeks they were started in are counted over all of
 *      them, on the calendar of the reader's own time zone.
 *   4. Only then is the page cut.
 *
 * WHICH NOTES A READER MAY SEE is not decided here. The route hands in `read`, which reads the notes through the rules
 * the records door uses for a reader and the projects a reader may read.
 */
import { sqlite } from '../db/client.ts'
import { PanelError } from './panel-error.ts'
import { theRecordsThatMaySay } from './record-text-index.ts'
import {
  MY_NOTES_CHOICES,
  MY_NOTES_PAGE_SIZE,
  theChoiceKeeps,
  theWeekOf,
  theWordsOfANote,
  type MyNotesChoice,
  type MyNotesCounts,
  type MyNotesNote,
  type MyNotesReply,
  type MyNotesWeek,
  type NoteLastWrittenIn,
} from '@shared/my-notes.ts'
import { saysIt, theNeedle } from '@shared/search.ts'
import { parseStoredStamp, stampInZone, theClockZone } from '@shared/time.ts'
import type { PanelRecord } from '@shared/types.ts'

/** What the page asks, as the route has read it from the query. */
export interface MyNotesAsked {
  q?: string
  only?: MyNotesChoice
  zone?: string
  limit?: number
  offset?: number
}

/** The time zone the weeks are counted in: the reader's when the page sends it, and the office's clock when it does not. */
function theZoneToCountIn(zone: string | undefined): string {
  if (zone === undefined) return theClockZone()
  try {
    stampInZone(0, zone)
  } catch (error) {
    if (error instanceof RangeError) throw new PanelError(`The query string is not usable: zone "${zone}" is not a time zone this office knows.`)
    throw error
  }
  return zone
}

/** The moment a note was started. The office writes every stamp itself, so one it cannot read is a broken store. */
function theMomentItWasStarted(note: PanelRecord): number {
  const ms = parseStoredStamp(note.createdAt)
  if (ms === null) throw new Error(`The note ${note.id} has a creation stamp the office cannot read: "${note.createdAt}".`)
  return ms
}

export function myNotes(asked: MyNotesAsked, read: (ids?: readonly string[]) => PanelRecord[], now: number = Date.now()): MyNotesReply {
  const zone = theZoneToCountIn(asked.zone)
  const choice = asked.only ?? 'all'
  const limit = asked.limit ?? MY_NOTES_PAGE_SIZE
  const offset = asked.offset ?? 0
  const q = asked.q ?? null

  const searched =
    q === null
      ? read()
      : read(theRecordsThatMaySay(theNeedle(q))).filter((note) =>
          saysIt({ ...note, title: '', summary: null, data: { words: theWordsOfANote(note) } }, q),
        )

  const counts = Object.fromEntries(
    MY_NOTES_CHOICES.map((one) => [one, searched.filter((note) => theChoiceKeeps(one, note)).length]),
  ) as MyNotesCounts

  // NEWEST STARTED FIRST, and the notes started in the same second by id, A to Z, as the Reports page orders them, so
  // a note is on one page of the list and never on two.
  const chosen = searched
    .filter((note) => theChoiceKeeps(choice, note))
    .sort((a, b) => (a.createdAt !== b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const weeks = new Map<string, MyNotesWeek>()
  const weekOf = new Map<string, string>()
  for (const note of chosen) {
    const starts = theWeekOf(theMomentItWasStarted(note), zone)
    weekOf.set(note.id, starts)
    const week = weeks.get(starts)
    if (week === undefined) weeks.set(starts, { starts, count: 1 })
    else week.count += 1
  }

  const notes = chosen.slice(offset, offset + limit).map((note): MyNotesNote => ({ ...note, week: weekOf.get(note.id)! }))
  return {
    notes,
    q,
    choice,
    counts,
    weeks: [...weeks.values()],
    thisWeek: theWeekOf(now, zone),
    zone,
    matched: chosen.length,
    returned: notes.length,
    offset,
    limit,
    left: Math.max(0, chosen.length - offset - notes.length),
  }
}

/**
 * THE NOTE ADD TO NOTE GOES INTO, as `GET /api/records/my-notes/last-written-in` answers it: among `listed`, the notes
 * My notes lists for this reader, the one with the newest row in the office's change log that the reader wrote
 * themselves, by their own actor type and id, and that files the note or changes its title or what it holds. A change
 * by another person or by an agent does not count, and neither does a move to another project, a link or a delete.
 *
 * IT IS ONE READ of the change log over the listed notes' ids, and not one read per note, because the right-click menu
 * asks it each time it opens. The change log is ordered by `append_order`, the order its rows were written in, so two
 * changes in the same second are still told apart.
 *
 * THE WRITER IS WHO THE REQUEST SAYS IT IS. A program on the person's machine that sends the person's name is taken as
 * the person here, as everywhere in the office, so what it writes in a note counts as the person's writing.
 */
export function theNoteLastWrittenIn(writer: { type: string; id: string }, listed: readonly PanelRecord[]): NoteLastWrittenIn {
  const newest = sqlite
    .prepare(
      'SELECT record_id AS id, at FROM changes ' +
        'WHERE record_id IN (SELECT value FROM json_each(?)) AND actor_type = ? AND actor_id = ? ' +
        "AND (op = 'create' OR (op = 'update' AND (field = 'title' OR field = 'data' OR field LIKE 'data.%'))) " +
        'ORDER BY append_order DESC LIMIT 1',
    )
    .get(JSON.stringify(listed.map((note) => note.id)), writer.type, writer.id) as { id: string; at: string } | undefined
  if (newest === undefined) return { note: null, writtenAt: null }
  const note = listed.find((one) => one.id === newest.id)
  // THE READ ASKS ONLY THE LISTED IDS, so a row for any other note is a broken read and not an answer.
  if (note === undefined) throw new Error(`The change log answered the note ${newest.id}, which is not one of the notes it was asked about.`)
  return { note, writtenAt: newest.at }
}
