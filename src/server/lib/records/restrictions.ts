// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RESTRICTION REACHES, AND THE FORK BEHIND IT: the kinds that carry a restriction, the
 * check on a link that forms one, the check on the fork it leaves behind, and the live fallbacks
 * about it. They were moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`. This file does not import records.ts.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { DECISION_KIND } from '@shared/decision-kind.ts'
import { RESTRICTION_KINDS } from '@shared/restriction.ts'
import { RESOLVES_PROPOSAL } from '@shared/types.ts'
import { displayWord, withArticle } from '@shared/work.ts'
import { db } from '../../db/client.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { links, records } from '../../db/schema.ts'
import { PanelError } from '../panel-error.ts'
import { PROPOSAL_KIND } from './fork-settled.ts'

/** The two kinds that carry a restriction, as the strings this file compares against. */
export const RESTRICTION_KIND_SET: readonly string[] = RESTRICTION_KINDS

/**
 * THREE KIND CLAUSES ON THE LINKS A RESTRICTION MAY BE AT EITHER END OF.
 *
 * `createLink` checks type validity, self-links, gates, existence, the project boundary, the fork
 * guard, duplicates and containment — and none of them is about kind. These three are, and they
 * are refusals about the SHAPE of the graph rather than about who is asking, so like
 * `checkBlockIds` this takes no actor.
 *
 * 1. A restriction may not resolve another restriction. A placeholder is answered by the work that
 *    supplies what was missing, not by another unresolved slot.
 * 2. A restriction's declared scope is real work, not another restriction. An `about` link from
 *    one to another would make a restriction whose severity travels through a thing that has a
 *    severity of its own, and nothing could say which reading a page was showing.
 * 3. `instead_of` is REFUSED from a `ran_instead` record, always. That type means *this happened
 *    instead of the planned state* — a statement that the PLAN was answered another way — and a
 *    fallback that ran is not a plan being answered. Writing one would put *this plan was answered
 *    another way* into the planning surface because something fell over at runtime, which is the
 *    exact failure the kind exists to stop, arriving one screen over.
 *
 *    THIS CLAUSE WAS OWED AND IS NOW PAID. It could not be written when the other two were: the
 *    link type did not exist. Rather than a design sentence nobody re-reads,
 *    `tests/a-fallback-never-writes-the-method.test.ts` asserted the type was absent, so the day it
 *    was declared the test went red and named the clause that was owed. It went red within the
 *    hour, on another agent's commit, and this is the clause.
 */
export function checkRestrictionLinks(
  from: { id: string; kind: string; title: string },
  to: { id: string; kind: string; title: string },
  type: string,
): void {
  if (type === 'resolves' && RESTRICTION_KIND_SET.includes(to.kind) && RESTRICTION_KIND_SET.includes(from.kind)) {
    throw new PanelError(
      `"${from.title}" is ${withArticle(displayWord(from.kind))}, and one of those cannot resolve ` +
        `"${to.title}". What resolves it is the work that supplied what was missing — the run, the measurement, ` +
        `the decision — so link that record to it instead. Two unresolved slots pointing at each other says ` +
        `nothing was answered.`,
      409,
    )
  }
  if (type === 'instead_of' && from.kind === 'ran_instead') {
    throw new PanelError(
      `"${from.title}" records that something ran instead of a step's canonical method at RUNTIME, and an ` +
        `"instead of" link says the PLAN was answered another way. Those are different claims, and writing this ` +
        `one would put "this plan was answered another way" on the planning surface because something fell over ` +
        `during a run. Nothing was written. If what ran turns out to be the better answer, that is four records ` +
        `and the last is the person's: a claim with what it measured, a proposal naming both methods, criticism ` +
        `on it, and the decision.`,
      409,
    )
  }
  if (type === 'about' && RESTRICTION_KIND_SET.includes(from.kind) && RESTRICTION_KIND_SET.includes(to.kind)) {
    throw new PanelError(
      `${withArticle(displayWord(from.kind))} says what a piece of real work stops the project claiming, so ` +
        `it cannot be about "${to.title}", which is ${withArticle(displayWord(to.kind))}. Point it at the step, ` +
        `claim or module whose slot is unresolved.`,
      409,
    )
  }
}

/**
 * A PLACEHOLDER MAY NOT SETTLE A FORK, AND THIS REFUSES EVERYBODY EQUALLY.
 *
 * The owner: *"If the unresolved issue is fundamentally an owner Decision, a Placeholder may say
 * 'final detector architecture not chosen'. It may link the relevant Decision. The currently-used
 * temporary option does not become canonical merely because work continued with it."* And in the
 * failure-modes list, in one line: *use Placeholder to settle human governance*.
 *
 * The fork is recorded as a `blocks` link from the proposal to the placeholder — the fork blocks
 * the slot from being filled, which is literally what `blocks` means. So marking the slot resolved
 * while nobody has answered the fork is the act that section forbids, and it is refused.
 *
 * IT TAKES NO ACTOR, deliberately. It is not a question about who is asking: a person who wants it
 * resolved writes the decision first, which takes one request. `assertMaySettleFork` beside it is
 * the guard that IS about who, and it covers a different act — pointing a decision at a proposal.
 *
 * WHAT STOPS THE OTHER FOUR PATHS is structural rather than a refusal: the `substitute` is on the
 * placeholder and on nothing else, so no read that answers *what is the method* can return it;
 * a placeholder is never a source of the governance queue; `HUMAN_ONLY_KINDS` is untouched; and an
 * agent cannot erase a person's `stops_final` restriction by dismissing its rows, which is
 * `assertMayDismissARestriction` below.
 */
export function checkTheForkBehindARestriction(
  from: { title: string },
  to: { id: string; kind: string; title: string },
  type: string,
): void {
  if (type !== 'resolves' || !RESTRICTION_KIND_SET.includes(to.kind)) return
  const blocking = db
    .select({ id: records.id, title: records.title, deletedAt: records.deletedAt })
    .from(links)
    .innerJoin(records, eq(records.id, links.fromId))
    .where(and(eq(links.toId, to.id), eq(links.type, 'blocks'), eq(records.kind, PROPOSAL_KIND)))
    .all()
    .filter((row) => row.deletedAt == null)
  if (blocking.length === 0) return
  const answered = new Set(
    db
      .select({ toId: links.toId })
      .from(links)
      .innerJoin(records, eq(records.id, links.fromId))
      .where(and(eq(links.type, RESOLVES_PROPOSAL), eq(records.kind, DECISION_KIND)))
      .all()
      .map((row) => row.toId),
  )
  const open = blocking.filter((row) => !answered.has(row.id))
  if (open.length === 0) return
  const fork = open[0]!
  throw new PanelError(
    `"${to.title}" is waiting on a fork nobody has settled — the proposal "${fork.title}" blocks it — so it ` +
      `cannot be resolved by "${from.title}". Resolving it would mark the slot filled while the choice is still ` +
      `open, and the option work happened to continue with would quietly become the canonical one. Settle the ` +
      `fork first: file the decision and point it at ${fork.id} with a ${RESOLVES_PROPOSAL} link. Nothing was written.`,
    409,
  )
}

/**
 * Every LIVE `ran_instead` record whose `about` link points at this record.
 *
 * `live` means two things and both are load-bearing. Not deleted, obviously. And NOT LIFTED: a
 * fallback is lifted by a `resolves` link into it — from the run showing the canonical method
 * worked, or from the decision that changed the canonical method — and a lifted one holds nothing
 * shut. Reading only `deleted_at` would have left the block's method person-only for ever after one
 * fallback, which is a lease, and this is deliberately not a lease.
 */
export function liveFallbacksAbout(recordId: string): { id: string; title: string }[] {
  const found = db
    .select({ id: records.id, title: records.title, deletedAt: records.deletedAt })
    .from(links)
    .innerJoin(records, eq(records.id, links.fromId))
    .where(and(eq(links.toId, recordId), eq(links.type, 'about'), eq(records.kind, 'ran_instead')))
    .all()
    .filter((row) => row.deletedAt == null)
  if (found.length === 0) return []
  // IN PIECES (src/server/db/in-pieces.ts): `found` is every fallback filed about this record, which grows with the
  // office; the answer is a set of ids, so the order of the pieces does not matter.
  const lifted = new Set(
    readInPieces(
      found.map((row) => row.id),
      (piece) =>
        db
          .select({ toId: links.toId })
          .from(links)
          .where(and(eq(links.type, 'resolves'), inArray(links.toId, piece)))
          .all(),
    ).map((row) => row.toId),
  )
  return found.filter((row) => !lifted.has(row.id)).map((row) => ({ id: row.id, title: row.title }))
}
