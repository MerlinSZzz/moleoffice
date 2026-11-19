// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DECISIONS THAT NAME A FORK: `theDecisionsThatNameThisFork`, the reading that lists the live decisions an open
 * proposal page may close a fork by. It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports this name
 * from records.ts.
 *
 * THIS FILE IMPORTS records.ts FOR `DECISION_KIND`, `newestFirstBy` AND `theDecisionNamesThisFork`. Every reference it
 * makes to that file is inside its function body, so the cycle is safe and nothing of records.ts is read while it is
 * still being evaluated.
 */
import { and, desc, eq, inArray, isNull, like, ne, or, sql } from 'drizzle-orm'
import { RESOLVES_PROPOSAL, type PanelRecord } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { links, records } from '../../db/schema.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { newestFirstBy } from '@shared/newest-first-by.ts'
import { theDecisionNamesThisFork } from '../../db/the-decision-names-this-fork.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'

/**
 * THE DECISIONS THE PROPOSAL PAGE OFFERS TO CLOSE AN OPEN FORK BY: every live decision in its project that names it
 * (`theDecisionNamesThisFork`) and does not already settle it. The page could only write a new
 * decision, so closing a fork by one the person had already made asked what the new one replaced.
 *
 * The text search finds the candidates and the reading above decides, so the list and the door agree.
 */
export function theDecisionsThatNameThisFork(
  proposal: Pick<PanelRecord, 'id' | 'workspaceId'>,
): { id: string; title: string; decidedBy: string | null }[] {
  const pattern = `%${proposal.id}%`
  const linked = db
    .select({ id: links.fromId })
    .from(links)
    .where(and(eq(links.toId, proposal.id), ne(links.type, RESOLVES_PROPOSAL)))
    .all()
    .map((row) => row.id)
  const settling = new Set(
    db
      .select({ id: links.fromId })
      .from(links)
      .where(and(eq(links.toId, proposal.id), eq(links.type, RESOLVES_PROPOSAL)))
      .all()
      .map((row) => row.id),
  )
  const read = (piece: readonly string[]) =>
    db
      .select()
      .from(records)
      .where(
        and(
          eq(records.kind, DECISION_KIND),
          eq(records.workspaceId, proposal.workspaceId),
          isNull(records.deletedAt),
          or(
            like(records.title, pattern),
            like(sql`${records.data}`, pattern),
            piece.length === 0 ? sql`0` : inArray(records.id, piece),
          ),
        ),
      )
      .orderBy(desc(records.createdAt))
      .all()
  // IN PIECES (src/server/db/in-pieces.ts): `linked` is every record linked to this proposal, which grows with the
  // office; every piece also gives each decision the text search finds, so the joined rows are kept once by id and
  // sorted newest first again. With no linked record the text search is still asked, once.
  const rows =
    linked.length === 0
      ? read([])
      : newestFirstBy([...new Map(readInPieces(linked, read).map((row) => [row.id, row])).values()], (row) => row.createdAt)
  return rows
    .filter((row) => !settling.has(row.id) && theDecisionNamesThisFork(row, proposal.id))
    .map((row) => ({
      id: row.id,
      title: row.title,
      decidedBy: typeof row.data['decided_by'] === 'string' ? row.data['decided_by'] : null,
    }))
}
