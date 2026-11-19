// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OPEN-QUESTION READINGS: what nothing is consuming, what is waiting on a record that is not there, and the decisions
 * that carry no summary. They were moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER: this one takes `DECISION_KIND` from it. That is safe for the same reason
 * as records/reading.ts: every reference this file makes to records.ts is inside a function body, so nothing of
 * records.ts is read while it is still being evaluated.
 */
import { and, eq } from 'drizzle-orm'
import type { PanelRecord } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { links, records } from '../../db/schema.ts'
import { theMessagesHiddenFrom, type AMessageReader } from '../messages.ts'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { getRecord, listRecords } from './reading.ts'

// ------------------------------------------------------- the two queries that justify links

/**
 * Results nothing is using.
 *
 * A record that produces something, with nothing consuming it, is a finding that has not
 * reached the work it should have changed. This is the query that would have surfaced the
 * clamp configuration file sitting unused for a month.
 */
/** The kinds "results nothing is using" is taken over. One list, read by the query and its count. */
const UNCONSUMED_OVER: readonly string[] = ['claim', 'module', 'idea']

export function unconsumed(workspaceId: string): PanelRecord[] {
  // Scoped on BOTH sides, and both matter. The links are this project's, so a `consumes` link in
  // another project cannot make this project's claim look used; and the records are this project's,
  // so the answer is a list about one project. Measured before either clause existed:
  // GET /api/queries/unconsumed returned 42 records over two projects, which is a claim about
  // nothing — "results nothing is using" is a statement about a body of work.
  const consumed = db
    .select({ id: links.toId })
    .from(links)
    .where(and(eq(links.type, 'consumes'), eq(links.workspaceId, workspaceId)))
    .all()
  const consumedIds = new Set(consumed.map((c) => c.id))
  return listRecords({ workspaceId })
    .filter((r) => UNCONSUMED_OVER.includes(r.kind))
    .filter((r) => !consumedIds.has(r.id))
}

/**
 * HOW MANY RECORDS THE CHECK ABOVE WAS TAKEN OVER, which is what tells its empty answer apart.
 *
 * An empty `unconsumed` means one of two things and they are not the same: everything something
 * could build on is built on, or there is nothing of the sort on file at all. The browser drew both
 * as *"Everything that can be consumed is consumed"*, in bold, and in a project with no records in
 * it that reads as good news about a corpus that does not exist. Invariant 5 is the rule: nothing is
 * there and nobody has looked are different answers.
 *
 * THE SAME THREE KINDS, from the same list, so the count cannot come to be about a different set.
 */
export function unconsumedOver(workspaceId: string): number {
  return listRecords({ workspaceId }).filter((r) => UNCONSUMED_OVER.includes(r.kind)).length
}

/** Work waiting on something that does not exist yet, or that is deleted. */
// `reader` is left out by a caller that answers no request, which reads every message.
export function unmetDependencies(workspaceId: string, reader: AMessageReader | null = null) {
  const rows = db
    .select()
    .from(links)
    .where(and(eq(links.type, 'consumes'), eq(links.workspaceId, workspaceId)))
    .all()
  // A LINK WITH A MESSAGE THIS READER MAY NOT READ AT EITHER END IS LEFT OUT, so
  // the message's title is never the missing title shown.
  const hidden = reader === null ? new Set<string>() : theMessagesHiddenFrom(reader, rows.flatMap((l) => [l.fromId, l.toId]))
  const out: { consumer: PanelRecord; missingTitle: string }[] = []
  for (const l of rows) {
    if (hidden.has(l.fromId) || hidden.has(l.toId)) continue
    const target = db.select().from(records).where(eq(records.id, l.toId)).get()
    const consumer = getRecord(l.fromId)
    if (consumer && (!target || target.deletedAt)) {
      out.push({ consumer, missingTitle: target?.title ?? '(unknown)' })
    }
  }
  return out
}

// ============================================================ a decision with no level-3 context
//
// LEVEL 3 OF THE READING LADDER IS THE RECORD'S OWN `summary`, and a decision's summary is its
// context: what happened and why the choice was made. Criterion DC3 asks for one reading that lists
// the decisions on file carrying no summary, so a secretary can write each context from the
// decision's own `because`, its sources and the owner's review files. A decision with no summary is
// incomplete, not refused (criterion DC2), and this list is where that shows up as work.
//
// NOTHING IS BACKFILLED. The reading writes nothing; it exists so a person or an agent can write
// each context by hand from what the decision already holds, and it never invents one.

/** One decision with no summary, with the fields a secretary writes its context from. */
export interface DecisionWithoutSummary {
  id: string
  title: string
  /** The day the decision was FILED, which is the newest-first order this reading uses. */
  filedAt: string
  /** Who made the choice, out of `data.decided_by`, or null when nobody said. */
  decidedBy: string | null
  /** The decision's own reasoning, beside it so the context can be written from it. */
  because: string | null
  /** Where it came from: a file, a thread, a run. */
  source: string | null
  /** The record the authority lives in, often the owner's own review note. */
  authorityReference: string | null
  /** What was taken, so the writer does not restate it as the context. */
  optionTaken: string | null
}

/** One string out of a record's `data`, or null when the key is absent or is not a string. */
function textFromData(data: Record<string, unknown>, key: string): string | null {
  const value = data[key]
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * The live decisions in this project that carry no summary, newest filed first.
 *
 * `listRecords` orders by when a record last changed; this reading orders by when the decision was
 * FILED, because a context written against one decision must not reorder the rest of the list under
 * the reader. The list is scoped to one project and never carries a deleted record.
 */
export function decisionsWithoutSummary(workspaceId: string): DecisionWithoutSummary[] {
  return listRecords({ workspaceId })
    .filter((r) => r.kind === DECISION_KIND)
    .filter((r) => r.summary === null || r.summary.trim() === '')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((r) => ({
      id: r.id,
      title: r.title,
      filedAt: r.createdAt,
      decidedBy: textFromData(r.data, 'decided_by'),
      because: textFromData(r.data, 'because'),
      source: textFromData(r.data, 'source'),
      authorityReference: textFromData(r.data, 'authority_reference'),
      optionTaken: textFromData(r.data, 'option_taken'),
    }))
}

/**
 * HOW MANY LIVE DECISIONS THE READING ABOVE LOOKED AT.
 *
 * An empty list means one of two things and they are not the same: every decision on file has a
 * summary, or there are no decisions on file at all. The browser and the report can only tell those
 * apart if the reply carries the number that was looked at, which is why it is here.
 */
export function decisionsOver(workspaceId: string): number {
  return listRecords({ workspaceId }).filter((r) => r.kind === DECISION_KIND).length
}
