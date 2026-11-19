// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILE RECORDS UNDER A DIFFERENT PROJECT: `fileRecordsInWorkspace`, the one write that changes `records.workspace_id`.
 * It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports this name from
 * records.ts.
 *
 * THIS FILE IMPORTS records.ts FOR `assertMayWrite`, `logChange`, `resolveSessionRef`, `saveRevision` AND THE `Actor`
 * TYPE. Every reference it makes to that file is inside a function body, and the type import is erased, so the cycle is
 * safe and nothing of records.ts is read while it is still being evaluated.
 */
import { inArray } from 'drizzle-orm'
import { now } from '@shared/now.ts'
import { db, sqlite } from '../../db/client.ts'
import { piecesOf, readInPieces } from '../../db/in-pieces.ts'
import { records } from '../../db/schema.ts'
import { PanelError } from '../panel-error.ts'
import { assertMayWrite, saveRevision, type Actor } from '../records.ts'
import { logChange } from '../log-change.ts'
import { resolveSessionRef } from '../resolve-session-ref.ts'

/**
 * FILE RECORDS UNDER A DIFFERENT PROJECT — the one write that changes `records.workspace_id`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS HERE AND NOT IN lib/move.ts, WHERE THE REST OF A MOVE LIVES
 * ---------------------------------------------------------------------------------------
 *
 * `tests/guard-human-only.test.ts` reads this file's source, finds every query-builder write to the
 * `records` table, and fails if one appears anywhere else in `src` or `scripts`: lib/records.ts is
 * the one door, and a write outside it is outside the human-only guard AND outside the change log,
 * which is the same defect twice. The move verb was first written with its own update of that table
 * in lib/move.ts, and the scan caught it on the first run — which is exactly what it is for.
 *
 * So the JUDGEMENT stays in lib/move.ts — what has to come with a record, what the refusals are,
 * what the report says — and the WRITE is here, beside every other write, asking the same guard and
 * writing its own change rows.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT CHECK, SAID PLAINLY
 * ---------------------------------------------------------------------------------------
 *
 * It does not check that `to` exists, that nothing is left linked across the boundary, or that the
 * destination is free of a clashing title. All three are `moveRecordToWorkspace` in lib/move.ts,
 * which is the only caller and the only thing a route reaches. This is deliberately not a second
 * place stating those rules — but it does mean this function is not a way in on its own, and
 * nothing but the move verb may call it.
 *
 * WHO MAY, asked per record. A move carries companions, so an agent naming an ordinary note can
 * reach a `decision` joined to it; the guard is asked about every row rather than about the one the
 * request mentioned, or the human-only rule would have a side door.
 *
 * ONE CHANGE ROW PER RECORD, written AFTER the row moves, so `logChange` reads the destination off
 * the record — the same derivation every other change row uses, which is why it takes no workspace
 * parameter. The move therefore lands in the destination's log, beside the rest of that record's
 * history, which this write has just moved there with it.
 */
export function fileRecordsInWorkspace(
  ids: readonly string[],
  to: string,
  actor: Actor,
): { id: string; kind: string; title: string; from: string }[] {
  if (ids.length === 0) {
    throw new PanelError('fileRecordsInWorkspace was given no records, so there is nothing to file.')
  }
  // IN PIECES (src/server/db/in-pieces.ts): a move carries every companion of its record, so the list grows with the
  // office; each id is in one piece only, so the joined rows count the same as one statement's rows did.
  const rows = readInPieces(ids, (piece) => db.select().from(records).where(inArray(records.id, piece)).all())
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((r) => r.id))
    throw new PanelError(`No record with id ${ids.filter((id) => !found.has(id)).join(', ')}`, 404)
  }

  // EVERY GUARD BEFORE THE FIRST WRITE. A move is one transaction, so a refusal partway through
  // would roll back — but the caller would have been told a permission answer that depended on
  // which record happened to be updated first.
  for (const row of rows) assertMayWrite(row.kind, 'move', actor, row.id, undefined, to)

  const moved = rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, from: r.workspaceId }))

  // WHO WROTE THIS ROW, WORKED OUT WHERE THEY ARE WORKING — the one write where that is not the
  // same place as the row lands.
  //
  // `logChange` resolves the caller's session reference in the project of the RECORD, which is the
  // caller's own project for every other write in the server. This one moves the record out of it,
  // so the row is filed at the destination while the run that made it is still a session of the
  // source. Resolved after the update, the caller's run name would answer to nothing at the
  // destination and the row would keep a bare word instead of naming a session. Resolved here, the
  // row carries that session's record id — which is true from anywhere, and which a reader at the
  // destination is told is a session of "${row.from}" rather than a name nobody ever filed. Moving
  // a record never moves the session that wrote its history; see lib/move.ts for why.
  const wroteIt = (from: string): Actor => {
    const sent = actor.sessionId
    if (sent === undefined || sent === null || sent === '') return actor
    const ref = resolveSessionRef(sent, from)
    return ref.recordId === null ? actor : { ...actor, sessionId: ref.recordId }
  }
  const attribution = new Map(moved.map((row) => [row.id, wroteIt(row.from)]))

  // ONE TRANSACTION. `moveRecordToWorkspace` in lib/move.ts already calls this inside one — better-
  // sqlite3 nests it as a savepoint — and it is declared here as well so the rule does not depend on
  // who the caller is.
  sqlite.transaction(() => {
    // IN PIECES (src/server/db/in-pieces.ts): the same ids as the read above, one UPDATE per piece inside this one
    // transaction, every piece with the one stamp the single statement wrote.
    const movedAt = now()
    for (const piece of piecesOf(ids)) {
      db.update(records)
        .set({ workspaceId: to, updatedAt: movedAt })
        .where(inArray(records.id, piece))
        .run()
    }
    // A run's uses and their file results follow its project in this same transaction, including
    // callers below lib/move.ts. The use id, run id and observation values stay as they were.
    for (const piece of piecesOf(ids)) {
      const slots = piece.map(() => '?').join(', ')
      sqlite.prepare(`UPDATE test_file_runs SET workspace_id = ? WHERE use_id IN (SELECT id FROM tool_uses WHERE run_id IN (${slots}))`).run(to, ...piece)
      sqlite.prepare(`UPDATE tool_uses SET workspace_id = ? WHERE run_id IN (${slots})`).run(to, ...piece)
    }
    for (const row of moved) {
      logChange(row.id, 'update', attribution.get(row.id) ?? actor, 'workspaceId', row.from, to)
      // A REVISION WHOSE CONTENT IS IDENTICAL TO THE ONE BEFORE IT, ON PURPOSE. A move changes the
      // record's project and none of the five things `versionOf` hashes, so this row's
      // `content_hash` equals its predecessor's. A ledger that skipped the writes it judged
      // uninteresting would have gaps that nothing explains, and "the content did not change" is a
      // reading of the ledger rather than a reason not to write to it.
      saveRevision(row.id, 'update', attribution.get(row.id) ?? actor)
    }
  })()
  return moved
}
