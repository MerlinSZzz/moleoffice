// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING ONE SECRETARY'S NOTEBOOK OUT OF THE RECORDS TABLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EVERY SURFACE COMES THROUGH HERE
 * ---------------------------------------------------------------------------------------
 *
 * Four surfaces want the same notebook: the brief a starting run reads, the notebook page, the role
 * card's numbers on the citizen page, and the role card's numbers on the Role cards page. Each
 * looking the record up for itself would be four queries that can disagree about which record is
 * "the" notebook for an agent — and the numbers on the card would be counted from a different set
 * than the page draws. So the lookup is here, once, and the counting is `notebookStatistics` in
 * `src/shared/notebook.ts`, which the browser reads too.
 *
 * NOTHING HERE WRITES. The doors in `src/server/api/notebook.ts` write, and the two refusals are
 * `checkTheNotebook` in `src/server/lib/records/notebook-entries.ts`, on both write paths.
 *
 * A ROW WHOSE `entries` IS NOT A LIST OF ENTRIES READS AS NO ENTRIES, and it is not repaired here.
 * `validateData` refuses such a body on every ordinary write path, so a row like that came from a
 * restore of an older archive or from a hand-edited database; guessing what was meant would be
 * inventing content in the one record whose whole job is to be what somebody actually said.
 */

import { and, eq, isNull } from 'drizzle-orm'

import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import {
  NOTEBOOK_KIND,
  notebookStatistics,
  type NotebookEntry,
  type NotebookOnACard,
} from '@shared/notebook.ts'
import { NOTEBOOK_KINDS_RENAMED, nowSaid } from '@shared/renamed-words.ts'

/** One notebook as every reader here wants it: which record it is, and what is written in it. */
export interface TheNotebook {
  /** The record id, so a reader can link to it. */
  id: string
  /** The record's title, as a link's words. */
  title: string
  /** The handle of the agent it is kept under. */
  agent: string
  /** Its entries, in the order they are stored. Readers sort; this does not. */
  entries: NotebookEntry[]
}

/** Whether a stored value is an entry Mole Office can read. Shape only — the door does the rest. */
function anEntry(value: unknown): value is NotebookEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const said = value as Record<string, unknown>
  return (
    typeof said['id'] === 'string' &&
    (said['writtenByKind'] === 'person' || said['writtenByKind'] === 'agent') &&
    typeof said['writtenById'] === 'string' &&
    typeof said['at'] === 'string' &&
    typeof said['entryKind'] === 'string' &&
    typeof said['text'] === 'string'
  )
}

/**
 * The entries stored on a notebook record's data, or an empty list when it holds none. A kind of entry
 * stored under a word renamed since is read as the new word (`NOTEBOOK_KINDS_RENAMED`).
 */
export function entriesIn(data: unknown): NotebookEntry[] {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return []
  const said = (data as Record<string, unknown>)['entries']
  if (!Array.isArray(said)) return []
  return said.filter(anEntry).map((one) => ({ ...one, entryKind: nowSaid(NOTEBOOK_KINDS_RENAMED, one.entryKind) }))
}

/**
 * THE NOTEBOOK KEPT UNDER ONE AGENT'S HANDLE, or null when nobody has written one.
 *
 * NULL IS A REAL ANSWER and every caller says so in its own words rather than drawing an empty
 * notebook: an agent with no notebook and an agent whose notebook is empty are two different
 * states, and only one of them means somebody has started.
 */
export function theNotebookFor(workspaceId: string, handle: string): TheNotebook | null {
  for (const row of db
    .select({ id: records.id, title: records.title, data: records.data })
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, NOTEBOOK_KIND), isNull(records.deletedAt)))
    .all()) {
    const said = row.data as Record<string, unknown> | null
    if (said === null || said['agentHandle'] !== handle) continue
    return { id: row.id, title: row.title, agent: handle, entries: entriesIn(said) }
  }
  return null
}

/**
 * ONE AGENT'S NOTEBOOK AS A CARD SHOWS IT. Criterion N3.
 *
 * Counted from the record on every read and stored nowhere — criterion N3's own words, "drawn from
 * the record, not a second copy". A stored count and the entries are two accounts of one fact, and
 * the first write that forgot the count would leave a card saying something no entry supports.
 *
 * The card is drawn in two places and this is what both of them are given, so neither works a
 * number out for itself. `isThere` false with `statistics` null is the ordinary answer for an agent
 * nobody has written one for, and the card says that rather than drawing zeroes — a zero reads as
 * "counted and found none", which is not what has happened.
 */
export function theNotebookOnACardFor(workspaceId: string, handle: string): NotebookOnACard {
  const notebook = theNotebookFor(workspaceId, handle)
  if (notebook === null) return { agent: handle, isThere: false, recordId: null, statistics: null }
  return {
    agent: handle,
    isThere: true,
    recordId: notebook.id,
    statistics: notebookStatistics(notebook.entries),
  }
}
