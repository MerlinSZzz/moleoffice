// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RECORDS THE ATTENTION RULE READS, KEPT ON THE ATTENTION THREAD BETWEEN ASKS, AND READ AGAIN ONLY WHERE THEY
 * CHANGED (wave 13y round 167).
 *
 * ---------------------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------------------
 *
 * Every attention reading read every record of its project, and made each into a record, before the rule ran. On a
 * made-up office of the live shape that read was about 600 ms of a Home read of about 1.1 s, and nearly every record
 * it made was the same as at the ask before.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT KNOWS WHAT CHANGED
 * ---------------------------------------------------------------------------------------
 *
 * Every write to the records table that a request can reach writes a change row in the same transaction.
 * tests/the-kept-attention-records-are-the-whole-read.test.ts lists those writes, fails on a new one until it is
 * listed, and checks after each one that this file gives what the whole read gives. A change row's place in the log,
 * `append_order`, is the largest place so far plus one. So at each ask this file reads the change rows past the place
 * it read up to, forgets the records they name, and reads those again with any record it does not hold.
 *
 * WHICH RECORDS ARE IN THE PROJECT, AND IN WHAT ORDER, IS STILL READ WHOLE AT EVERY ASK, by the same condition and
 * order as the whole read (`idsForTheAttentionRule`). So a record that comes into the project's view with no change
 * row of its own, as a comment does when what it is about moves here, is read too. A record is made the same way in
 * both reads (`theAttentionRuleRecordsOf`).
 *
 * THE RECORDS KEPT ARE SHARED BY EVERY READING AFTER, so nothing that reads them may change them. The rule and the
 * shapes change none: the test above reads them frozen.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN IT READS EVERY RECORD AGAIN, and says why in the server's log
 * ---------------------------------------------------------------------------------------
 *
 * - The thread has just started, or this project has not been read on it yet.
 * - The change log was empty at the last read, so there is no place to read on from.
 * - SQLite's schema counter (PRAGMA schema_version) moved. The archive import writes records with no change rows of
 *   its own, and moves the counter, because it drops its triggers and makes them again in its own transaction. A
 *   migration that changes the schema moves it too. A data step that only writes rows does not. The test above holds
 *   that an import moves it.
 * - The change log does not reach back to the place read up to: the row at that place is gone, or is another row.
 * - Somebody asked, by POST /api/attention/read-everything-again.
 *
 * THE WEAK POINT: A WRITE MADE STRAIGHT INTO THE DATABASE FILE, by a program other than this server, writes no change
 * row, so a record changed that way is not read again until one of the above, or until its next write through the
 * server. In normal running nothing writes the file outside the server while it runs. Two programs can, when they are
 * run by hand on a file a server is serving:
 * - `npm run db:migrate`, when one of the data steps under src/server/db/ that write records with no change row has
 *   not run yet, and nothing in the same run changes the schema. The server never runs those steps itself, because it
 *   refuses to serve a file a migration would still write to, and the stable upgrade stops the server before it
 *   migrates. When the migrate is run just before a merge, as chapter 1 asks for a migration, the restart on the
 *   merge closes it.
 * - `npm run db:seed -- --include-fixture`, which dates and stamps records with no change row. Without the flag it
 *   refuses a file that holds anything but fixture records.
 * After either, POST /api/attention/read-everything-again or a restart brings Home back to what the file holds, and a
 * record's next write through the server brings that record back. troubleshooting.md says so under the symptom.
 */

import { inArray } from 'drizzle-orm'
import type { PanelRecord } from '@shared/types.ts'
import { sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { records } from '../db/schema.ts'
import { idsForTheAttentionRule, listRecordsForTheAttentionRule, theAttentionRuleRecordsOf } from './records/reading.ts'

/** Why every record of a project was read again, as the server's log says it. */
export const WHY_EVERY_RECORD_WAS_READ = {
  started: 'the attention thread has just started',
  notKept: 'this project had not been read on the attention thread yet',
  noPlace: 'the change log was empty at the last read, so there was no place to read on from',
  schemaMoved: "SQLite's schema counter moved, as it does at an import or a migration that changes the schema",
  logGone: 'the change log no longer reaches back to the place read up to',
  asked: 'somebody asked for every record to be read again',
} as const

export type WhyEveryRecordWasRead = keyof typeof WHY_EVERY_RECORD_WAS_READ

/** A place in the change log: the row with the largest `append_order` when the records were read. */
interface Place {
  order: number
  id: string
}

interface OneProject {
  place: Place | null
  schemaVersion: number
  byId: Map<string, PanelRecord>
}

export interface KeptAttentionRecords {
  /** The records `listRecordsForTheAttentionRule` gives for this project, in its order, read again only where they changed. */
  read: (workspaceId: string) => PanelRecord[]
  /** Read every record of every project again at the next read, with the reason `asked`. */
  readEverythingAgain: () => void
}

/**
 * THE RECORDS BY THEIR IDS, put into the map one by one. Made from a list of id and record pairs, the map had a second
 * list of every record beside the first while it was built, and the pairs are no longer made.
 */
function byTheirIds(all: readonly PanelRecord[]): Map<string, PanelRecord> {
  const byId = new Map<string, PanelRecord>()
  for (const one of all) byId.set(one.id, one)
  return byId
}

/**
 * RECORDS KEPT FROM ONE READ TO THE NEXT, on this thread's connection. `say` is given one line each time every record
 * of a project is read again, naming the project and the reason.
 */
export function keptAttentionRecords(say: (line: string) => void): KeptAttentionRecords {
  const projects = new Map<string, OneProject>()
  let started = false
  /** The projects kept when somebody asked for every record to be read again, each until it is read. */
  let askedFor = new Set<string>()
  const lastPlace = sqlite.prepare('SELECT append_order AS "order", id FROM changes ORDER BY append_order DESC LIMIT 1')
  const atThePlace = sqlite.prepare('SELECT id FROM changes WHERE append_order = ?').pluck()
  const changedSince = sqlite.prepare('SELECT DISTINCT record_id FROM changes WHERE append_order > ?').pluck()
  const schemaVersion = (): number => sqlite.pragma('schema_version', { simple: true }) as number

  /** Why every record of this project is read again, or what is kept of it and the place to read on from. */
  const why = (workspaceId: string, version: number): WhyEveryRecordWasRead | { kept: OneProject; from: Place } => {
    const kept = projects.get(workspaceId)
    if (!started) return 'started'
    if (kept === undefined) return 'notKept'
    if (askedFor.has(workspaceId)) return 'asked'
    if (kept.schemaVersion !== version) return 'schemaMoved'
    if (kept.place === null) return 'noPlace'
    if (atThePlace.get(kept.place.order) !== kept.place.id) return 'logGone'
    return { kept, from: kept.place }
  }

  // ONE READ TRANSACTION, so the place, the change rows, the ids and the records are of one moment. Inside the
  // thread's own read transaction this is a savepoint of it, and of the same moment.
  const readKept = sqlite.transaction((workspaceId: string): PanelRecord[] => {
    const version = schemaVersion()
    const place = (lastPlace.get() as Place | undefined) ?? null
    const because = why(workspaceId, version)
    if (typeof because === 'string') {
      const startedAt = performance.now()
      const all = listRecordsForTheAttentionRule(workspaceId)
      projects.set(workspaceId, { place, schemaVersion: version, byId: byTheirIds(all) })
      started = true
      askedFor.delete(workspaceId)
      say(
        `The attention thread read every record of project ${workspaceId} again, because ${WHY_EVERY_RECORD_WAS_READ[because]}: ` +
          `${String(all.length)} records in ${String(Math.round(performance.now() - startedAt))} ms.`,
      )
      return all
    }
    const { kept, from } = because
    const { byId } = kept
    for (const id of changedSince.all(from.order) as string[]) byId.delete(id)
    const ids = idsForTheAttentionRule(workspaceId)
    const missing = ids.filter((id) => !byId.has(id))
    for (const one of readInPieces(missing, (piece) => theAttentionRuleRecordsOf(inArray(records.id, piece), 'in any order'))) byId.set(one.id, one)
    const all = ids.map((id) => {
      const one = byId.get(id)
      if (one === undefined) throw new Error(`The record ${id} is in the project's view but could not be read in the same transaction, so the attention reading was not worked out.`)
      return one
    })
    // A RECORD THAT LEFT THE VIEW is forgotten too, so what is kept is never more than one project's records.
    kept.byId = byId.size > all.length ? byTheirIds(all) : byId
    kept.place = place
    return all
  })

  return {
    read: (workspaceId) => readKept(workspaceId),
    readEverythingAgain: () => {
      askedFor = new Set(projects.keys())
    },
  }
}
