// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ASKING WHETHER SOMEBODY HAS USED THE HOLE IN RULE 3.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT RULE 3 IS AND WHERE ITS HOLE IS
 * ---------------------------------------------------------------------------------------
 *
 * An agent may not add `audience: "developers"` to a block that is already stored: that is a change
 * to somebody's writing. The rule matches BY ID, because per-block authorship is not stored and
 * there is nothing else to match on. So deleting the block and writing the same words back under a
 * new id gets the mark through, and the words leave the person's Normal-mode screen anyway.
 * `assertNoBlockIsHiddenAfterTheFact` in lib/records.ts is the rule and carries the same account.
 *
 * THE HOLE IS LEFT OPEN AND WATCHED FOR. A decision, on proposal
 * `z0P3pIc9bp4F`, says the
 * signature is written down so a real case can be recognised. This is the asking half. Criterion P40.
 *
 * ---------------------------------------------------------------------------------------
 * THE SIGNATURE HAS TWO HALVES AND ONLY ONE OF THEM IS RECORDED
 * ---------------------------------------------------------------------------------------
 *
 * THE SIGNATURE: a rule-3 refusal, followed in the same project by the same record gaining a marked
 * block with an id nothing had seen before.
 *
 * THE SECOND HALF IS IN THE REVISION LEDGER and is what this reads: every revision of every record,
 * in order, looking for a block that arrives already marked for developers with an id that appears
 * in no earlier revision of that record.
 *
 * THE FIRST HALF IS RECORDED NOWHERE. The refusal throws, so nothing about it is stored. `api_calls`
 * keeps the operation, the status and the time of every request and not which record was refused. So
 * what comes back is CANDIDATES, and the reply says so in its own words rather than leaving a reader
 * to assume a match is the signature.
 *
 * A CANDIDATE IS ORDINARY BEHAVIOUR MOST OF THE TIME. An agent writing a report may mark its own
 * machinery paragraphs as it writes them — that is the main use of the field and the reason it is
 * not human-only outright. Every one of those is a candidate here. What makes a candidate worth
 * looking at is the refusal that came first, and that is the part nobody can look up.
 */

import { and, asc, eq } from 'drizzle-orm'

import { db } from '../db/client.ts'
import { changes, revisions } from '../db/schema.ts'

/** One block that arrived already marked, with an id no earlier revision of that record held. */
export interface ACandidate {
  recordId: string
  recordTitle: string
  blockId: string
  /** The revision it arrived in. */
  seq: number
  /** Who made that write, as the change log names them, or null because nothing recorded one. */
  by: { kind: string; id: string } | null
}

export interface RuleThreeReading {
  candidates: ACandidate[]
  /** What was looked at, so an empty list is "nobody did this" and not "nobody looked". */
  looked: { records: number; revisions: number }
  says: string
  theHalfNothingRecords: string
}

/** Every block in one body, at any depth, with what it says about its reader. */
function marksIn(value: unknown, into: Map<string, string | null>): void {
  if (Array.isArray(value)) {
    for (const one of value) marksIn(one, into)
    return
  }
  if (typeof value !== 'object' || value === null) return
  const row = value as Record<string, unknown>
  const id = row['id']
  if (typeof id === 'string' && id !== '') {
    const audience = row['audience']
    into.set(id, typeof audience === 'string' ? audience : null)
  }
  for (const key of Object.keys(row)) marksIn(row[key], into)
}

/** Every block field a record kind keeps its body in. Both are read; a kind with neither has none. */
function blocksOf(data: Record<string, unknown>): Map<string, string | null> {
  const found = new Map<string, string | null>()
  marksIn(data['blocks'], found)
  marksIn(data['summaryBlocks'], found)
  return found
}

/**
 * WHO MADE THE WRITE THAT PRODUCED ONE REVISION, from the change log, or null because nothing said.
 *
 * Matched on the record and the moment rather than on a foreign key, because a revision holds no
 * reference to a change row. Null is returned when nothing matches: an invented author would be
 * exactly the false evidence this whole reading exists to avoid producing.
 */
function whoWrote(recordId: string, at: string): { kind: string; id: string } | null {
  const row = db
    .select({ kind: changes.actorType, id: changes.actorId })
    .from(changes)
    .where(and(eq(changes.recordId, recordId), eq(changes.at, at)))
    .get()
  if (row === undefined || row.kind === null || row.id === null) return null
  return { kind: String(row.kind), id: String(row.id) }
}

/** Read the ledger of one project for the second half of the signature. */
export function theRuleThreeSignature(workspaceId: string): RuleThreeReading {
  const rows = db
    .select()
    .from(revisions)
    .where(eq(revisions.workspaceId, workspaceId))
    .orderBy(asc(revisions.recordId), asc(revisions.seq))
    .all()

  const candidates: ACandidate[] = []
  const seenPerRecord = new Map<string, Set<string>>()
  const records = new Set<string>()

  for (const row of rows) {
    records.add(row.recordId)
    const seen = seenPerRecord.get(row.recordId) ?? new Set<string>()
    for (const [blockId, audience] of blocksOf(row.data)) {
      // A BLOCK WHOSE ID THIS RECORD HAS ALREADY HELD IS NOT A CANDIDATE, whatever its mark says
      // now: rule 3 refuses marking one of those, so a mark on it went through the front door.
      if (!seen.has(blockId) && audience === 'developers') {
        candidates.push({
          recordId: row.recordId,
          recordTitle: row.title,
          blockId,
          seq: row.seq,
          by: whoWrote(row.recordId, String((row as unknown as { at?: unknown }).at ?? '')),
        })
      }
      seen.add(blockId)
    }
    seenPerRecord.set(row.recordId, seen)
  }

  return {
    candidates,
    looked: { records: records.size, revisions: rows.length },
    says:
      candidates.length === 0
        ? `Nothing in this project matches the second half of the signature. ${String(rows.length)} revisions of ` +
          `${String(records.size)} records were read.`
        : `${String(candidates.length)} block${candidates.length === 1 ? '' : 's'} arrived already marked for ` +
          `developers with an id no earlier revision of the same record held, across ${String(rows.length)} ` +
          `revisions of ${String(records.size)} records. EVERY ONE OF THESE IS ORDINARY BEHAVIOUR MOST OF THE ` +
          'TIME: an agent writing a report may mark its own machinery paragraphs as it writes them, and that is ' +
          'the main use of the field.',
    theHalfNothingRecords:
      'THE FIRST HALF OF THE SIGNATURE IS RECORDED NOWHERE, so none of these is the signature. The signature is ' +
      'a rule-3 refusal followed by the same record gaining a marked block with an id nothing had seen before. ' +
      'The refusal throws, so nothing about it is stored, and the call log keeps the operation, the status and ' +
      'the time of every request but not which record was refused. What comes back above is candidates for the ' +
      'second half alone. The hole stays open.',
  }
}
