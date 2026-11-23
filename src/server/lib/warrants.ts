// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING THE ACTS AN AGENT MADE ON THE PERSON'S OWN WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE FACT LIVES
 * ---------------------------------------------------------------------------------------
 *
 * On the revision it authorised, in `revisions.warrant`, and on the change rows of the same write in
 * `changes.warrant`. There is no table of acts and no second copy of the words: an act on somebody's
 * words IS a write, and the ledger already stores every write with who made it and when. What this
 * file adds is the reading — for one record, which of its writes were made on the person's words,
 * what each of them did, and whether it still stands.
 *
 * ---------------------------------------------------------------------------------------
 * A FORK'S ACT IS NOT ON THE FORK
 * ---------------------------------------------------------------------------------------
 *
 * Promoting a proposal writes a DECISION and links it back. Nothing at all is written to the
 * proposal — `promoteProposal` says so at length and the reply says it to the caller — so the
 * warrant is on the decision's first revision, and a reader looking only at the proposal's own
 * ledger would find nothing and say the fork was settled by an agent with no authority at all.
 *
 * So this reader follows the settling link: the acts of a proposal are its own, plus the create of
 * every decision that settles it. That is the same link `proposalResolution` reads, and it is read
 * here rather than restated.
 *
 * ---------------------------------------------------------------------------------------
 * REVOKED IS DERIVED, NEVER STORED TWICE
 * ---------------------------------------------------------------------------------------
 *
 * A person revoking an act does not change the act's row. The record is put back and THAT write is a
 * later revision carrying `revokes_seq` set to the act's `seq`. So "is this act still standing" is
 * one query over the same table, and there is no flag on the act that could disagree with the write
 * that took it back.
 */

import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { db, sqlite } from '../db/client.ts'
import { revisionsReaderOf, wholeRevisionData } from '../db/revision-stored-once.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { agentMessages, links, records, revisions } from '../db/schema.ts'
import { fieldsThatDiffer } from '@shared/fielddiff.ts'
import { THE_OWNER } from '@shared/kinds.ts'
import { THE_PERSON } from '@shared/person.ts'
import { RESOLVES_PROPOSAL } from '@shared/types.ts'
import { parseLocalStamp } from '@shared/time.ts'
import { warrantAsStored, whoActedOnThoseWords, whoRevokedIt, type Warrant } from '@shared/warrant.ts'
import { theKeyWindowSays } from '../db/the-key-window-says.ts'
import { PanelError } from './panel-error.ts'
import { replacedDecisionIds } from './replaced-decisions.ts'
import { referenceOf, whoseRecordsAreThese } from './the-persons-own-words.ts'
import { revocationOf } from '../db/revocation-of.ts'
import { said } from '../db/revocation-of.ts'
import { aCommentInAConversation } from './why-the-cited-place-may-not-be-cited.ts'
import type { ActOnTheirWords } from '../db/types/warrants.ts'

export type { ActOnTheirWords } from '../db/types/warrants.ts'

/** The columns this file reads. Written out so a `select()` change cannot silently widen it. */
const COLUMNS = {
  id: revisions.id,
  recordId: revisions.recordId,
  seq: revisions.seq,
  op: revisions.op,
  actorType: revisions.actorType,
  actorId: revisions.actorId,
  sessionId: revisions.sessionId,
  at: revisions.at,
  warrant: revisions.warrant,
  revokesSeq: revisions.revokesSeq,
  title: revisions.title,
  summary: revisions.summary,
  data: revisions.data,
  parts: revisions.parts,
  deletedAt: revisions.deletedAt,
}

/**
 * Every act made on the person's words that belongs on this record's page, newest first.
 *
 * An empty list is the ordinary answer and means nobody has acted on the person's words here. It is not the
 * same as "this record has no history".
 */
export function actsOnTheirWords(recordId: string): ActOnTheirWords[] {
  const ids = [recordId, ...decisionsThatSettle(recordId)]
  const rows = db
    .select(COLUMNS)
    .from(revisions)
    .where(and(inArray(revisions.recordId, ids), isNotNull(revisions.warrant)))
    .all()
  return rows
    .map((row) => oneAct(row))
    .filter((act): act is ActOnTheirWords => act !== null)
    .sort((a, b) => (a.at === b.at ? b.seq - a.seq : b.at.localeCompare(a.at)))
}

/**
 * One revision row, as this file reads it.
 *
 * Written out rather than inferred from `COLUMNS`, because a hand-written type is what makes a
 * column renamed in the schema a compile error here rather than a field that quietly reads
 * `undefined`.
 */
interface LedgerRow {
  id: string
  recordId: string
  seq: number
  op: string
  actorType: string
  actorId: string
  sessionId: string | null
  at: string
  warrant: string | null
  revokesSeq: number | null
  title: string
  summary: string | null
  data: Record<string, unknown>
  parts: unknown
  deletedAt: string | null
}

/** One act, or null when the stored warrant cannot be read back as one. */
function oneAct(row: LedgerRow): ActOnTheirWords | null {
  const warrant = storedWarrant(row.warrant)
  // NULL RATHER THAN A GUESS. A row whose warrant will not parse is a row this reader cannot say
  // anything true about, and inventing a shape for it would put words on the page that nobody said.
  if (warrant === null) return null
  return {
    recordId: row.recordId,
    seq: row.seq,
    op: row.op,
    actorType: row.actorType,
    actorId: row.actorId,
    sessionId: row.sessionId,
    at: row.at,
    warrant,
    said: whoActedOnThoseWords({ actorType: row.actorType, actorId: row.actorId, warrant }),
    what: whatItDid(row.recordId, row.seq, row.op),
    revoked: revocationOf(row.recordId, row.seq),
  }
}

export { theCitedPlaceExists } from '../db/the-cited-place-exists.ts'

export { whyTheCitedPlaceMayNotBeCited } from './why-the-cited-place-may-not-be-cited.ts'

/** When a cited place was written, and who wrote it with how a key proved them, or null for who. */
export interface CitedPlaceWritten {
  at: string
  /** Null when the office holds no row saying who wrote it. */
  writer: { type: string; id: string; provedBy: string | null } | null
}

export { whoWroteTheCitedPlace } from './why-the-cited-place-may-not-be-cited.ts'

/** A comment in a conversation, as `aCommentInAConversation` reads it. */
export interface ACommentInAConversation {
  at: string
  /** `type` is the row's role: 'human', 'agent' or 'system'. */
  writer: { type: string; id: string; provedBy: string | null }
  words: string
}

export { aCommentInAConversation } from './why-the-cited-place-may-not-be-cited.ts'

/** Which decision of the owner's a warrant's words stand on: its id, or why there is none. */
export type WhichDecisionOfTheOwners = { decision: string } | { decision: null; because: string }

/**
 * THE LIVE DECISION OF THE OWNER'S THAT RESTS ON THE MESSAGE A WARRANT CITES. The one check for a door where an
 * agent's act needs more than the owner's words: a decision of the owner's that rests on them. The card's words ask it
 * (lib/card-words.ts), and the chapter outlines are to ask it too. It asks two questions in this order, and `because`
 * opens by saying which one failed:
 *
 *   1. THE WORDS ARE THE PERSON'S. The warrant cites `message:<id>`, the person wrote that message, and the message
 *      holds the warrant's words exactly. A message record counts as `whoseRecordsAreThese` counts it: one the person
 *      sent, whose words nobody else has changed. A comment in a conversation counts when the person wrote it.
 *   2. A DECISION OF THE OWNER'S RESTS ON THEM. A decision in any project, not deleted and not replaced by a live one
 *      (`replacedDecisionIds`), whose `decided_by` is "the owner", whose `authority` is "the owner said so" and whose
 *      `authority_reference` is the message. When there are several, the earliest.
 *
 * It writes nothing, and it does not ask who is asking: the door decides who needs it.
 */
export function whichDecisionOfTheOwnersTheseWordsStandOn(warrant: Pick<Warrant, 'words' | 'where'>): WhichDecisionOfTheOwners {
  const where = warrant.where.trim()
  const cannotCheck = (why: string): WhichDecisionOfTheOwners => ({
    decision: null,
    because: `Mole Office cannot check that the warrant's words are the person's: ${why}`,
  })
  const notTheirs = (why: string): WhichDecisionOfTheOwners => ({
    decision: null,
    because: `The warrant's words are not the person's words: ${why}`,
  })
  if (!where.startsWith('message:')) {
    return cannotCheck(`it cites ${where}, and only a message the person wrote can be checked. Cite it as message:<id>.`)
  }
  const id = where.slice('message:'.length).trim()

  // THE WORDS THE MESSAGE HOLDS, once it is known the person wrote them.
  let text: string
  const theirs = whoseRecordsAreThese([id]).get(id)
  if (theirs !== undefined && theirs.own && theirs.as === 'message') {
    const row = db.select({ data: records.data }).from(records).where(eq(records.id, id)).get()
    const data: unknown = row?.data
    const body = typeof data === 'object' && data !== null ? (data as Record<string, unknown>)['body'] : undefined
    text = typeof body === 'string' ? body : ''
  } else if (theirs !== undefined && theirs.own) {
    return cannotCheck(`it cites ${id}, which is not a message. Cite the message the person wrote.`)
  } else if (theirs !== undefined && theirs.because !== 'noRecord') {
    if (theirs.because === 'deleted') return cannotCheck(`message ${id} is deleted.`)
    if (theirs.because === 'agentsMessage') return notTheirs(`message ${id} was sent by an agent, not by the person.`)
    if (theirs.because === 'wordsChanged') {
      return notTheirs(`somebody other than the person changed the words of message ${id} after it was written.`)
    }
    return notTheirs(`${id} is not a message, and somebody other than the person wrote it.`)
  } else {
    const comment = aCommentInAConversation(id)
    if (comment === null) return cannotCheck(`it cites message ${id}, and Mole Office holds no message with that id.`)
    if (comment.writer.type !== 'human' || comment.writer.id !== THE_PERSON) {
      return notTheirs(`message ${id} was written by the ${comment.writer.type} "${comment.writer.id}", not by the person.`)
    }
    text = comment.words
  }
  const said = warrant.words.trim()
  if (said === '' || !text.includes(said)) {
    return notTheirs(`message ${id} does not hold them. A warrant copies the person's words whole, exactly as they wrote them.`)
  }

  // THE DECISIONS THAT REST ON IT. Read in SQL by the reference, then asked again here with `referenceOf`, the one
  // reading of what a decision cites, so a stored value with spaces around the id is read the same way everywhere.
  const citing = db
    .select({ id: records.id, data: records.data })
    .from(records)
    .where(
      and(
        eq(records.kind, 'decision'),
        isNull(records.deletedAt),
        sql`trim(json_extract(${records.data}, '$.authority_reference')) = ${id}`,
      ),
    )
    .orderBy(records.createdAt, records.id)
    .all()
    .filter((one) => referenceOf(one.data) === id)
  const replaced = replacedDecisionIds()
  const theOwners = citing.find((one) => {
    const data: unknown = one.data
    if (typeof data !== 'object' || data === null || replaced.has(one.id)) return false
    const said = data as Record<string, unknown>
    return said['decided_by'] === THE_OWNER && said['authority'] === 'the owner said so'
  })
  if (theOwners !== undefined) return { decision: theOwners.id }
  const others = citing.map((one) => one.id)
  return {
    decision: null,
    because:
      `No live decision of the owner's rests on message ${id}. ` +
      (others.length === 0
        ? 'No live decision cites it. '
        : `The live decisions that cite it (${others.join(', ')}) are not the owner's on the person's words, or a later ` +
          'decision replaced them. ') +
      `A decision of the owner's rests on it when its decided_by is "${THE_OWNER}", its authority is "the owner said so" ` +
      `and its authority_reference is ${id}, in any project.`,
  }
}

export { recordWritten } from './why-the-cited-place-may-not-be-cited.ts'

export { liveRecordOfKind } from '../db/the-cited-place-exists.ts'

/** The warrant as it was stored, or null when the text is not one. One reader, in @shared/warrant.ts. */
function storedWarrant(stored: unknown): Warrant | null {
  return warrantAsStored(stored)
}

/**
 * WHICH DECISIONS SETTLE THIS RECORD, when it is a fork. Empty for everything else.
 *
 * The link type is read from the stored rows rather than restated: `derived_from` from a decision to
 * a proposal IS the settling act, and the same query `proposalResolution` makes.
 */
/** Which fork this decision settles, when it settles one. Null for a decision filed on its own. */
function forkThisSettles(decisionId: string): string | null {
  const row = db
    .select({ toId: links.toId })
    .from(links)
    .innerJoin(records, eq(records.id, links.toId))
    .where(and(eq(links.fromId, decisionId), eq(links.type, RESOLVES_PROPOSAL), eq(records.kind, 'proposal')))
    .get()
  return row?.toId ?? null
}

function decisionsThatSettle(recordId: string): string[] {
  const rows = db
    .select({ fromId: links.fromId })
    .from(links)
    .innerJoin(records, eq(records.id, links.fromId))
    .where(and(eq(links.toId, recordId), eq(links.type, RESOLVES_PROPOSAL), eq(records.kind, 'decision')))
    .all()
  return rows.map((row) => row.fromId)
}

/**
 * What the write did, in the fewest words that are still true.
 *
 * A CREATE SAYS WHAT WAS FILED. An update names the fields that moved and what each moved from and
 * to, read off this revision and the one before it — never off the change rows, because a wholesale
 * `data` write is one change row and several moved fields, and the person wants the fields.
 */
function whatItDid(recordId: string, seq: number, op: string): string {
  const now = db
    .select(COLUMNS)
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, seq)))
    .get()
  if (now === undefined) return op
  if (op === 'create') {
    // A DECISION FILED BY A PROMOTION SAYS WHAT IT DID TO THE FORK, not what it did to itself. The
    // page a person reads this on is usually the FORK's, where "filed this record" names a record
    // that is not the one in front of them.
    const settles = forkThisSettles(recordId)
    return settles === null ? 'filed this record' : `settled this fork with the decision "${now.title}"`
  }
  if (op === 'delete') return `deleted this record`
  const before = db
    .select(COLUMNS)
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, seq - 1)))
    .get()
  if (before === undefined) return op
  const read = revisionsReaderOf(sqlite)
  const moved = fieldsThatDiffer(wholeRevisionData(before, read), wholeRevisionData(now, read)).map((one) => `${one.path}: ${said(one.before)} to ${said(one.after)}`)
  if (before.title !== now.title) moved.unshift(`title: ${said(before.title)} to ${said(now.title)}`)
  if (before.summary !== now.summary) moved.unshift(`summary: ${said(before.summary)} to ${said(now.summary)}`)
  return moved.length === 0 ? op : moved.join(', ')
}

export { said } from '../db/revocation-of.ts'

export { revocationOf } from '../db/revocation-of.ts'

/**
 * Is anything on this record standing on the person's words right now?
 *
 * The one question a list row asks, so a row does not have to carry the whole act to draw the mark.
 */
export function standsOnTheirWords(recordId: string): ActOnTheirWords | null {
  return standsOnTheirWordsForEach([recordId]).get(recordId) ?? null
}

/**
 * THE SAME QUESTION FOR A WHOLE LIST, IN THREE QUERIES. Problem 9dYnSFapwm5x.
 *
 * GET /api/forks and GET /api/waiting ask it of every row. Asked one record at a time it cost two
 * queries a row and more for each act, so a list of forty forks made eighty. Here the decisions that
 * settle any of the records, the warranted revisions of all of them, and the revisions that took any
 * of those back are each read once. What the write did (`whatItDid`) is worked out only for the one
 * act a row carries.
 *
 * The answer for each record is the one `actsOnTheirWords` would give: its acts and the create of every
 * decision settling it, newest first, and the first nobody took back. Every id asked for is in the
 * map; null means nothing on it stands on the person's words.
 */
export function standsOnTheirWordsForEach(recordIds: Iterable<string>): Map<string, ActOnTheirWords | null> {
  const asked = [...new Set(recordIds)]
  const out = new Map<string, ActOnTheirWords | null>(asked.map((id) => [id, null]))
  if (asked.length === 0) return out

  // THE DECISIONS THAT SETTLE EACH RECORD, the same link `decisionsThatSettle` reads.
  // IN PIECES (src/server/db/in-pieces.ts): GET /api/forks asks for every open fork and every settled
  // fork's decision in the office. All the links of one record come back in the same piece.
  const settling = readInPieces(asked, (piece) =>
    db
      .select({ fromId: links.fromId, toId: links.toId })
      .from(links)
      .innerJoin(records, eq(records.id, links.fromId))
      .where(and(inArray(links.toId, piece), eq(links.type, RESOLVES_PROPOSAL), eq(records.kind, 'decision')))
      .all(),
  )
  const ledgerIdsOf = new Map<string, string[]>(asked.map((id) => [id, [id]]))
  for (const link of settling) ledgerIdsOf.get(link.toId)?.push(link.fromId)

  const everyLedgerId = [...new Set([...ledgerIdsOf.values()].flat())]
  // IN PIECES (src/server/db/in-pieces.ts): these are the records asked for and the decisions settling
  // them, so the list grows with the office. The rows are grouped by record and sorted below.
  const rows = readInPieces(everyLedgerId, (piece) =>
    db
      .select(COLUMNS)
      .from(revisions)
      .where(and(inArray(revisions.recordId, piece), isNotNull(revisions.warrant)))
      .all(),
  )
  if (rows.length === 0) return out

  // EVERY REVISION THAT TOOK ONE OF THESE BACK, read once. The first one met for an act is the one
  // `revocationOf` would have found.
  const withActs = [...new Set(rows.map((row) => row.recordId))]
  const takenBack = new Set<string>()
  // IN PIECES (src/server/db/in-pieces.ts): every record above that has an act on its words, so the
  // list grows with the office. The rows go into a set, so their order does not matter.
  for (const row of readInPieces(withActs, (piece) =>
    db
      .select({ recordId: revisions.recordId, revokesSeq: revisions.revokesSeq })
      .from(revisions)
      .where(and(inArray(revisions.recordId, piece), isNotNull(revisions.revokesSeq)))
      .all(),
  )) {
    takenBack.add(`${row.recordId}#${String(row.revokesSeq)}`)
  }

  const rowsOf = new Map<string, LedgerRow[]>()
  for (const row of rows) {
    const held = rowsOf.get(row.recordId)
    if (held === undefined) rowsOf.set(row.recordId, [row])
    else held.push(row)
  }
  for (const [id, ledgerIds] of ledgerIdsOf) {
    const standing = ledgerIds
      .flatMap((ledgerId) => rowsOf.get(ledgerId) ?? [])
      .filter((row) => storedWarrant(row.warrant) !== null)
      .sort((a, b) => (a.at === b.at ? b.seq - a.seq : b.at.localeCompare(a.at)))
      .find((row) => !takenBack.has(`${row.recordId}#${String(row.seq)}`))
    out.set(id, standing === undefined ? null : oneAct(standing))
  }
  return out
}
