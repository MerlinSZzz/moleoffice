// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DECISION THAT A LATER ONE CHANGED OR REPLACED LEAVES NORMAL CONTENT BY ITSELF. Problem ZSWftCSVUP2r, and item 1
 * of the owner's decision, 29 September 2026: when a decision is changed or replaced, the
 * office itself takes the old one out of normal content at that moment, so nobody has to check or remember. Not
 * depending on an agent's or a person's memory is a core function of the office.
 *
 * ---------------------------------------------------------------------------------------
 * THREE PARTS, ONE FILE
 * ---------------------------------------------------------------------------------------
 *
 * 1. RECORDING ASKS. A decision says, in `data.replaces`, which earlier decisions it changes or replaces: a list of
 *    ids, which may be empty. `whatThisDecisionReplaces` reads it, checks it, and refuses a write that does not say,
 *    naming the field and listing the earlier decisions on the same subjects as candidates. A decision that changes
 *    only part of an earlier one names it too, and restates what stays, so the earlier one can leave normal content
 *    whole. A decision, which replaced the earlier one on 29
 *    September 2026, is the example.
 *
 * 2. THE OFFICE LINKS. Every id in `replaces` becomes a `supersedes` link from the new decision to the old one, in the
 *    same write (lib/records.ts, createRecordWithReport). The link is what every reader asks; the field is what the
 *    writer said.
 *
 * 3. READERS LEAVE A REPLACED ONE OUT. `replacedDecisionIds` is the one reading of which decisions are replaced: those
 *    a live decision supersedes. Every reader of decisions for normal use leaves them out and says how many it left
 *    out; the archive (the record itself, its page, history, export) keeps them whole, marked replaced and naming
 *    the decision that stands in their place (`whatSupersedes`, below).
 *
 * WHICH DOORS MUST SAY. Every door a decision is made through answers the question, and each says how:
 * POST /api/records must send `replaces`; choosing again replaces the old decision by definition; confirming a tool
 * category replaces none, because a category is confirmed once; promoting a proposal takes what the press said, and
 * when it said nothing and no earlier decision shares a subject with the fork, it records that none was found, and when
 * one does, it refuses and names it. A write nobody asked (a test's fixture, an archive import) is not refused here:
 * the doors are.
 */

import { and, eq, inArray, isNull, or } from 'drizzle-orm'

import { kindWord } from '@shared/words.ts'
import { DECISION_REPLACES_UNSAID_WITH_CANDIDATES } from '@shared/refusal-codes.ts'

import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { keptStatement } from '../db/kept-statement.ts'
import { links, records } from '../db/schema.ts'
// PanelError, SO THE SENTENCE REACHES WHOEVER ASKED. Built only when something throws, never at import.
import { PanelError } from './panel-error.ts'

/** The field a decision says what it replaces in. */
export const REPLACES_FIELD = 'replaces'

/** How many candidates a refusal lists at most. A longer list is not read. */
const MOST_CANDIDATES = 10

/** One earlier decision a refusal offers as a candidate. */
export interface ACandidate {
  id: string
  title: string
  /** The subject it shares with the new decision: a record both are linked to. */
  sharedSubject: string
}

/** A `supersedes` link from a live decision, which is what makes the decision it points to replaced. */
const A_LIVE_DECISION_SUPERSEDES = and(eq(links.type, 'supersedes'), eq(records.kind, 'decision'), isNull(records.deletedAt))

/**
 * EVERY DECISION A LIVE DECISION SUPERSEDES, in one project or in every project. The one reading of "replaced".
 *
 * A supersedes link from a deleted decision does not replace anything: its maker is gone, so the old one stands again.
 */
export function replacedDecisionIds(workspaceId?: string): Set<string> {
  const newer = db
    .select({ earlier: links.toId, laterKind: records.kind, laterWorkspace: records.workspaceId })
    .from(links)
    .innerJoin(records, eq(links.fromId, records.id))
    .where(A_LIVE_DECISION_SUPERSEDES)
    .all()
  const out = new Set<string>()
  for (const row of newer) {
    if (workspaceId !== undefined && row.laterWorkspace !== workspaceId) continue
    out.add(row.earlier)
  }
  return out
}

/** One decision in a line of replacements: a live decision that replaced the one before it, and when it was filed. */
export interface AReplacement {
  id: string
  title: string
  createdAt: string
}

/**
 * EVERY LIVE DECISION THAT SUPERSEDES ANOTHER, with the decision it supersedes, filed first first: by when each was
 * filed, then by id. Read on the same condition as `replacedDecisionIds`, so the two cannot disagree about which
 * decisions are replaced. Read whole and once, because one request asks about many decisions: every reading of the
 * forks asks for each decision that settles a fork, and a list asks for each replaced decision on it (wave 13s round
 * 144, item 39). It was read one decision at a time, and a line one step at a time.
 */
const everyLiveDecisionThatSupersedes = keptStatement(() =>
  db
    .select({ replaced: links.toId, id: records.id, title: records.title, createdAt: records.createdAt })
    .from(links)
    .innerJoin(records, eq(links.fromId, records.id))
    .where(A_LIVE_DECISION_SUPERSEDES)
    .orderBy(records.createdAt, records.id)
    .prepare(),
)

/**
 * WHICH LIVE DECISIONS SUPERSEDE EACH REPLACED DECISION, filed first first. The line below takes the first of a
 * decision's list and the page's list of direct replacements takes them all, so the first of that list is always the
 * next decision in the line (wave 13s round 104, item 15). A decision no live decision supersedes is not a key.
 */
export type TheReplacements = ReadonlyMap<string, readonly AReplacement[]>

/**
 * THE REPLACEMENTS, read once. A request that asks about many decisions reads this once and passes it to each question
 * below; a question asked alone reads it for itself.
 */
export function readTheReplacements(): TheReplacements {
  const out = new Map<string, AReplacement[]>()
  for (const { replaced, ...one } of everyLiveDecisionThatSupersedes().all()) {
    const those = out.get(replaced)
    if (those === undefined) out.set(replaced, [one])
    else those.push(one)
  }
  return out
}

/**
 * THE LINE OF DECISIONS THAT REPLACED THIS ONE, in order: the live decision filed first among those that supersede it,
 * then the one filed first among those that supersede that one, and so on to the one that stands. Empty when no live
 * decision replaced it. A line that comes back to a decision already in it stops there.
 */
export function theLineOfReplacements(decisionId: string, replacements: TheReplacements = readTheReplacements()): AReplacement[] {
  const line: AReplacement[] = []
  const passed = new Set([decisionId])
  for (let next = replacements.get(decisionId)?.[0]; next !== undefined && !passed.has(next.id); ) {
    line.push({ id: next.id, title: next.title, createdAt: next.createdAt })
    passed.add(next.id)
    next = replacements.get(next.id)?.[0]
  }
  return line
}

/**
 * THE DECISION THAT STANDS IN PLACE OF THIS ONE: the last of its line of replacements, or null because no live decision
 * replaced it. The one answer to "which decision replaced this one" (wave 13s round 102, item 13). Every reader asks it:
 * the decision's own page and the list of decisions (src/server/api/records.ts), the decisions that settle a fork and
 * choosing again (lib/records.ts), the decision a choice's answer stands on (lib/answers.ts), a secretary's duties
 * (lib/grant/secretary-duties.ts), and what a decision governs and the nightly check (lib/governs.ts). A reader that
 * asks about many decisions passes one `readTheReplacements` to each question.
 */
export function whatSupersedes(decisionId: string, replacements: TheReplacements = readTheReplacements()): { id: string; title: string } | null {
  const stands = theLineOfReplacements(decisionId, replacements).at(-1)
  return stands === undefined ? null : { id: stands.id, title: stands.title }
}

/**
 * THE DECISIONS THAT REPLACED THIS ONE DIRECTLY: every live decision that supersedes it, filed first first, or none. The
 * first is the next decision in its line, so where only one replaced it and nothing replaced that one, it is also the
 * decision that stands. A decision's page names these beside the one that stands, so a reader is told why its links
 * name a decision its mark does not (wave 13s round 104, item 15).
 */
export function theDecisionsThatReplacedThisDirectly(decisionId: string, replacements: TheReplacements = readTheReplacements()): { id: string; title: string }[] {
  return (replacements.get(decisionId) ?? []).map(({ id, title }) => ({ id, title }))
}

/** Whether this decision is replaced by a live one. */
export function isReplaced(decisionId: string): boolean {
  return replacedDecisionIds().has(decisionId)
}

/**
 * THE RECORDS A FORK IS LINKED TO, itself included: the fork, every record a link points at from it, and every record a
 * link points at it from, each once. These are the subjects a decision made from the fork shares with it.
 *
 * The promote door's candidate reading was this query before the open fork's own record read needed it too. It lives
 * here so the card the Decisions page draws and the refusal the promote door gives ask one question, not two copies of
 * one.
 */
export function theSubjectsAForkIsLinkedTo(recordId: string): string[] {
  const rows = db
    .select({ fromId: links.fromId, toId: links.toId })
    .from(links)
    .where(or(eq(links.fromId, recordId), eq(links.toId, recordId)))
    .all()
  return [...new Set([recordId, ...rows.map((row) => (row.fromId === recordId ? row.toId : row.fromId))])]
}

/**
 * THE EARLIER DECISIONS ON THE SAME SUBJECTS: live, not already replaced, in the same project, and linked to one of the
 * records the new decision is linked to (or linked from it: a decision may be the subject). Newest first.
 */
export function candidatesOnTheSameSubjects(workspaceId: string, subjectIds: readonly string[], leaveOut: readonly string[] = []): ACandidate[] {
  if (subjectIds.length === 0) return []
  const replaced = replacedDecisionIds(workspaceId)
  const found = new Map<string, ACandidate & { at: string }>()
  const consider = (decision: { id: string; title: string; createdAt: string; workspaceId: string; deletedAt: string | null; kind: string }, subject: string): void => {
    if (decision.kind !== 'decision' || decision.deletedAt !== null || decision.workspaceId !== workspaceId) return
    if (replaced.has(decision.id) || leaveOut.includes(decision.id) || found.has(decision.id)) return
    found.set(decision.id, { id: decision.id, title: decision.title, sharedSubject: subject, at: decision.createdAt })
  }
  // IN PIECES (src/server/db/in-pieces.ts): the subjects are every record a write links to, or every record linked to a
  // fork, and nothing caps either. The three reads have no ORDER BY, so which subject a decision is first found by was
  // SQLite's choice before and is the pieces' order now; `found` drops the repeats, and the newest-first sort and the
  // cut at MOST_CANDIDATES are made below, after every piece is read.
  const from = readInPieces(subjectIds, (piece) =>
    db
      .select({ record: records, subject: links.toId })
      .from(links)
      .innerJoin(records, eq(links.fromId, records.id))
      .where(inArray(links.toId, piece))
      .all(),
  )
  for (const row of from) consider(row.record, row.subject)
  const to = readInPieces(subjectIds, (piece) =>
    db
      .select({ record: records, subject: links.fromId })
      .from(links)
      .innerJoin(records, eq(links.toId, records.id))
      .where(inArray(links.fromId, piece))
      .all(),
  )
  for (const row of to) consider(row.record, row.subject)
  // A SUBJECT THAT IS ITSELF AN EARLIER DECISION is the plainest candidate of all.
  const themselves = readInPieces(subjectIds, (piece) => db.select().from(records).where(inArray(records.id, piece)).all())
  for (const one of themselves) consider(one, one.id)
  return [...found.values()]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, MOST_CANDIDATES)
    .map(({ at: _at, ...rest }) => rest)
}

/**
 * THE EARLIER DECISIONS A DECISION MADE FROM THIS FORK MAY REPLACE: the candidates on the fork's own subjects.
 *
 * This is the same reading the promote door refuses with (`whatThisDecisionReplaces` asks
 * `candidatesOnTheSameSubjects` on `theSubjectsAForkIsLinkedTo(fork.id)`), asked on the fork's own record read so the
 * card on the Decisions page can offer what the refusal would name. An empty list means none.
 */
export function replaceCandidatesForTheFork(fork: { id: string; workspaceId: string }): ACandidate[] {
  return candidatesOnTheSameSubjects(fork.workspaceId, theSubjectsAForkIsLinkedTo(fork.id))
}

function theCandidatesInWords(candidates: readonly ACandidate[]): string {
  if (candidates.length === 0) {
    return 'No earlier decision in this project is linked to the same records as this one, so if it replaces none, send "replaces": [].'
  }
  return (
    `These earlier decisions are linked to the same records: ${candidates
      .map((one) => `${one.id} ("${one.title}", through ${one.sharedSubject})`)
      .join('; ')}. Name the ones this decision changes or replaces, or send "replaces": [] if it replaces none of them.`
  )
}

/**
 * WHAT THIS DECISION SAYS IT REPLACES, checked, or a refusal. The one reading of `data.replaces`.
 *
 * `mustSay` is true at every door a decision is made through: a write that does not say is refused, with a sentence
 * naming the field and the candidates. It is false only for a write nobody asked (a fixture, an import), which is read
 * when it says and left alone when it does not.
 *
 * Each id must be a live decision of the same project, not this one, and not already replaced: a decision that is
 * already replaced has a successor, and replacing it again would leave two answers with nothing saying which stands.
 */
export function whatThisDecisionReplaces(opts: {
  data: Record<string, unknown>
  workspaceId: string
  /** The records the new decision is linked to in the same write: the subjects its candidates are found by. */
  subjectIds: readonly string[]
  mustSay: boolean
  /** The door, in words, for the refusal: "POST /api/records". */
  door: string
}): string[] | null {
  const said = opts.data[REPLACES_FIELD]
  if (said === undefined) {
    if (!opts.mustSay) return null
    const candidates = candidatesOnTheSameSubjects(opts.workspaceId, opts.subjectIds)
    const unsaid =
      `A decision must say which earlier decisions it changes or replaces, in data.${REPLACES_FIELD}: a list of their ` +
      `ids, which may be empty. Nothing was written. ${theCandidatesInWords(candidates)} ` +
      'A decision that changes only part of an earlier one names it too, and restates what stays, so the earlier one can ' +
      `leave normal content whole. The office links each one it names as replaced (${opts.door}).`
    const short = `Say which earlier decisions this replaces, in data.${REPLACES_FIELD} (it may be an empty list).`
    // A CODE, because the Decisions page draws this refusal when the person's press on a fork meets it: the page says it in its
    // own language, and the English above, with the candidates, stays on the reply. Two, because the page says whether
    // earlier decisions on the same subjects were found.
    if (candidates.length === 0) {
      throw new PanelError(unsaid, 400, undefined, undefined, short, { code: 'decisionReplacesUnsaid', values: {} })
    }
    throw new PanelError(unsaid, 400, undefined, undefined, short, { code: DECISION_REPLACES_UNSAID_WITH_CANDIDATES, values: {} })
  }
  if (!Array.isArray(said) || !said.every((one) => typeof one === 'string' && one.trim() !== '')) {
    throw new PanelError(
      `data.${REPLACES_FIELD} must be a list of decision ids, and it is ${JSON.stringify(said)}. Nothing was written.`,
      400,
    )
  }
  const ids = [...new Set(said.map((one) => one.trim()))]
  if (ids.length === 0) return []
  // IN PIECES (src/server/db/in-pieces.ts): `data.replaces` comes from the request body, and nothing caps its length.
  // Each row is found by its id below, so the order of the pieces does not matter.
  const rows = readInPieces(ids, (piece) => db.select().from(records).where(inArray(records.id, piece)).all())
  const replaced = replacedDecisionIds()
  for (const id of ids) {
    const row = rows.find((one) => one.id === id)
    if (row === undefined) {
      throw new PanelError(`data.${REPLACES_FIELD} names ${id}, and no record has that id. Nothing was written.`, 400)
    }
    if (row.kind !== 'decision') {
      throw new PanelError(
        `data.${REPLACES_FIELD} names ${id}, which is a ${kindWord(row.kind).text} ("${row.title}"), and only a decision is replaced. Nothing was written.`,
        400,
      )
    }
    if (row.deletedAt !== null) {
      throw new PanelError(`data.${REPLACES_FIELD} names ${id} ("${row.title}"), which was deleted. Nothing was written.`, 400)
    }
    if (row.workspaceId !== opts.workspaceId) {
      throw new PanelError(
        `data.${REPLACES_FIELD} names ${id} ("${row.title}"), which is a decision of another project. A link cannot cross ` +
          'projects, so it cannot be replaced from here. Nothing was written.',
        400,
      )
    }
    if (replaced.has(id)) {
      throw new PanelError(
        `data.${REPLACES_FIELD} names ${id} ("${row.title}"), which a later decision has already replaced. Name the one ` +
          'that stands instead. Nothing was written.',
        409,
      )
    }
  }
  return ids
}
