// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DECISIONS ABOUT ONE RECORD, so somebody who opens a module meets what was already settled.
 *
 * ---------------------------------------------------------------------------------------
 * WHOSE RULE THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P37 of `design/permissions/ACCEPTANCE.md`, designed in its 3.7.7: an agent that comes in
 * later must be reminded of the decisions already made for the project. An agent
 * reading a module before working on it should meet what was already decided there. Nothing on the
 * module's page or in its context reading said anything about a decision.
 *
 * ---------------------------------------------------------------------------------------
 * TWO WAYS A DECISION IS ABOUT SOMETHING, AND THE ROW SAYS WHICH
 * ---------------------------------------------------------------------------------------
 *
 * 1. **It is linked to it.** Somebody wrote a link between the decision and this record.
 * 2. **It settled a fork that is linked to it.** The fork was filed about this module, a decision
 *    settled the fork, and the decision itself was never linked to the module. This is how nearly
 *    all of them arrive.
 *
 * Measured on a copy of their corpus on 7 September 2026: 7 decisions are linked straight to a module
 * (6 `relates_to`, 1 `about`) and 69 proposals are linked `about` a module. So a reading that took
 * only the direct links would answer almost nothing, and one that did not say which way a row got
 * there would present a decision about a fork as a decision somebody wrote about the module. Each
 * row carries `how` and, for the second way, the fork it came through.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT PART OF THE OPEN-LOOP READING AND MUST NOT BECOME ONE
 * ---------------------------------------------------------------------------------------
 *
 * `LOOP_KINDS` in `openloops.ts` is task, problem, idea, direction, obligation and unsettled
 * proposal, and its own words say why a decision is not among them: *what happened is not something
 * anybody has to finish*. A decision is settled by definition. So this is a second reading that
 * travels beside that one, and the open-loop population is untouched.
 */

import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm'
// WHICH DECISIONS A LATER ONE REPLACED: the one reading. Problem ZSWftCSVUP2r.
import { replacedDecisionIds } from './replaced-decisions.ts'

import { db } from '../db/client.ts'
import { links, records, theKindOfARowFoundById } from '../db/schema.ts'
import { RESOLVES_PROPOSAL } from '@shared/types.ts'
// WHAT A DECISION SAYS IT CONCERNS: the one reading of governs for a record.
import { decisionsGoverning } from './governs.ts'
import { type BasisEntry } from './flow-reasons.ts'
import { theBasisOf } from '../db/the-basis-of.ts'

/**
 * How a decision came to be about this record, and a row says which. The third way, `governs it`, is the decision's
 * own word: its `governs` names this record, which a decision makes what it concerns. It is
 * the strongest of the three, so a decision that both governs a record and is linked to it is listed as
 * governing it.
 */
export type HowItIsAbout = 'governs it' | 'linked to it' | 'settled a fork about it'

/** One decision about the record, with what a reader needs to open it. */
export interface DecisionAbout {
  id: string
  title: string
  /** The day, always: what the decision says, or the day it was filed when it says nothing. */
  decidedOn: string
  /** True when the day above is the day it was FILED, because nobody wrote when it was decided. */
  nobodyWroteWhen: boolean
  how: HowItIsAbout
  /** The fork this decision settled, when that is how it got here. Null when it was linked straight. */
  throughTheFork: { id: string; title: string } | null
  /** What the decision was based on, only when the reader asked for the second level. */
  basis?: BasisEntry[]
}

/** Every decision about one record, and a sentence saying what was looked at and what was not. */
export interface DecisionsAbout {
  about: string
  decisions: DecisionAbout[]
  note: string
}

/** Every live record id on the other end of a link from or to this one, of one kind. */
function neighboursOfKind(recordId: string, kind: string, workspaceId: string): { id: string; title: string }[] {
  const rows = db
    .select({ id: records.id, title: records.title, fromId: links.fromId, toId: links.toId })
    .from(links)
    .innerJoin(
      records,
      or(
        and(eq(links.fromId, recordId), eq(records.id, links.toId)),
        and(eq(links.toId, recordId), eq(records.id, links.fromId)),
      ),
    )
    .where(
      and(
        // WHICH END IS THIS RECORD IS THE JOIN'S OWN CONDITION, and it is not restated here. A row
        // whose link touches neither end joins to no record at all, so a second copy of the same
        // rule in the WHERE clause would be one more place for the two to disagree — and a mutation
        // proved it dead: removing it changed nothing.
        eq(records.kind, kind),
        eq(records.workspaceId, workspaceId),
        isNull(records.deletedAt),
        // A LINK FROM A RECORD TO ITSELF IS NOT A NEIGHBOUR. Nothing writes one, and a self-link
        // would put a record in its own list, which reads as a fact about the world rather than as
        // the shape of a query.
        ne(records.id, recordId),
      ),
    )
    .all()
  const seen = new Map<string, { id: string; title: string }>()
  for (const row of rows) seen.set(row.id, { id: row.id, title: row.title })
  return [...seen.values()]
}

/**
 * WHEN A DECISION WAS MADE, AS A DAY, and whether the day is one anybody wrote.
 *
 * `decided_on` is a date and `createdAt` is a stamp to the second, so returning whichever was there
 * put two shapes in one column — 2026-09-05 beside 2026-09-06 03:49:58 — which reads as a fault in
 * the data rather than as two facts. Both are cut to the day, and the row says which it got, so the
 * reader is told *nobody wrote when this was decided* instead of inferring it from a shape.
 */
function whenItWasDecided(row: { createdAt: string; data: unknown }): { day: string; nobodyWroteWhen: boolean } {
  const data = typeof row.data === 'object' && row.data !== null ? (row.data as Record<string, unknown>) : {}
  const said = data['decided_on']
  if (typeof said === 'string' && said.trim() !== '') return { day: said.trim().slice(0, 10), nobodyWroteWhen: false }
  return { day: row.createdAt.slice(0, 10), nobodyWroteWhen: true }
}

/**
 * The decisions about one record.
 *
 * `workspaceId` bounds it, so a module cannot be answered with a decision from another project — a
 * decision reached through a fork is still a decision in the fork's own project, and the promote
 * route files it there.
 *
 * THAT BOUND IS NOT WHAT MAKES THE ANSWER RIGHT TODAY, and saying so is honest about what is tested.
 * `createLink` already refuses a link whose two ends are in different projects (lib/records/links.ts, the
 * refusal at the boundary check), so no link this walks can leave the project and no test can reach
 * the clause: removing it turns nothing red. It stays because this function's own promise is that it
 * answers about one project, and a promise nothing in the query stood behind would be a promise the
 * day link-writing changes.
 */
export function decisionsAbout(input: { workspaceId: string; recordId: string; withBasis?: boolean }): DecisionsAbout {
  const { workspaceId, recordId } = input

  const linked = neighboursOfKind(recordId, 'decision', workspaceId)
  const forks = neighboursOfKind(recordId, 'proposal', workspaceId)

  const found = new Map<string, DecisionAbout>()

  // A DECISION A LATER ONE REPLACED IS NOT LISTED HERE (problem ZSWftCSVUP2r), and the note says how many were left
  // out. Its own page keeps it, naming its replacement.
  const replaced = replacedDecisionIds(workspaceId)
  const leftOut = new Set<string>()
  const dataOf = new Map<string, Record<string, unknown>>()
  const rowsFor = (ids: readonly string[]): { id: string; title: string; createdAt: string; data: unknown }[] =>
    ids.length === 0
      ? []
      : db
          .select({ id: records.id, title: records.title, createdAt: records.createdAt, data: records.data })
          .from(records)
          .where(and(inArray(records.id, [...ids]), theKindOfARowFoundById('decision'), isNull(records.deletedAt)))
          .all()
          .filter((row) => {
            dataOf.set(row.id, typeof row.data === 'object' && row.data !== null ? (row.data as Record<string, unknown>) : {})
            if (!replaced.has(row.id)) return true
            leftOut.add(row.id)
            return false
          })

  for (const row of rowsFor(decisionsGoverning(workspaceId, { record: recordId }).decisions.map((one) => one.id))) {
    const when = whenItWasDecided(row)
    found.set(row.id, {
      id: row.id,
      title: row.title,
      decidedOn: when.day,
      nobodyWroteWhen: when.nobodyWroteWhen,
      how: 'governs it',
      throughTheFork: null,
    })
  }

  for (const row of rowsFor(linked.map((one) => one.id))) {
    // A DECISION THAT GOVERNS THE RECORD KEEPS THAT READING: its own field says so.
    if (found.has(row.id)) continue
    const when = whenItWasDecided(row)
    found.set(row.id, {
      id: row.id,
      title: row.title,
      decidedOn: when.day,
      nobodyWroteWhen: when.nobodyWroteWhen,
      how: 'linked to it',
      throughTheFork: null,
    })
  }

  if (forks.length > 0) {
    // The decisions that settled those forks: `derived_from` FROM the decision TO the fork, which is
    // `RESOLVES_PROPOSAL` in src/shared/types.ts and the only thing that marks a fork settled.
    const settling = db
      .select({ decision: links.fromId, fork: links.toId })
      .from(links)
      .where(and(inArray(links.toId, forks.map((one) => one.id)), eq(links.type, RESOLVES_PROPOSAL)))
      .all()
    const forkTitle = new Map(forks.map((one) => [one.id, one.title]))
    const whichFork = new Map(settling.map((one) => [one.decision, one.fork]))
    for (const row of rowsFor(settling.map((one) => one.decision))) {
      // A DECISION LINKED STRAIGHT TO THE RECORD KEEPS THAT READING. It is the stronger statement:
      // somebody said this decision is about this module, rather than it being reached through a fork.
      if (found.has(row.id)) continue
      const fork = whichFork.get(row.id) ?? null
      const when = whenItWasDecided(row)
      found.set(row.id, {
        id: row.id,
        title: row.title,
        decidedOn: when.day,
        nobodyWroteWhen: when.nobodyWroteWhen,
        how: 'settled a fork about it',
        throughTheFork: fork === null ? null : { id: fork, title: forkTitle.get(fork) ?? fork },
      })
    }
  }

  const sorted = [...found.values()].sort(
    (a, b) => b.decidedOn.localeCompare(a.decidedOn) || b.id.localeCompare(a.id),
  )
  // THE BASIS IS SECOND-LEVEL CONTENT, read only when asked. The decisions' data was already read by `rowsFor`, and
  // is kept in `dataOf` for this.
  const decisions = input.withBasis === true
    ? sorted.map((one) => ({ ...one, basis: theBasisOf(dataOf.get(one.id)?.['basis'], workspaceId) }))
    : sorted

  return {
    about: recordId,
    decisions,
    note:
      (decisions.length === 0
        ? 'No decision governs this record or is linked to it, and no decision has settled a fork that is. That is not the ' +
          'same as nothing having been decided about it: a decision nobody linked here is not readable from ' +
          'here, and linking one is POST /api/links {"fromId":"<the decision>","toId":"' +
          `${recordId}","type":"about"}.`
        : `${String(decisions.length)} decision${decisions.length === 1 ? '' : 's'}, newest first. Each row says ` +
          'how it is about this: its governs names this record, it is linked to it by somebody, or it was reached ' +
          'through a fork that is linked to it. A decision that does none of these is not in this list.') +
      (leftOut.size === 0
        ? ''
        : ` ${String(leftOut.size)} decision${leftOut.size === 1 ? ' linked here was' : 's linked here were'} replaced by a later ` +
          'decision and not listed; each is on its own page, naming the one that replaced it.'),
  }
}
