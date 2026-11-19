// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A CALLER FROM ANOTHER MACHINE MAY NOT DO — JOINED FROM TWO SOURCES, TYPED IN NEITHER.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE THIS FILE IS THE SERVER HALF OF
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/remote-access.md` §6.1: *an act is allowed when the actor may perform it
 * AND the machine it was asked from may perform it.* The actor half is `actorFrom` and the guards in
 * lib/records.ts and it does not change. This file answers the machine half's published question —
 * WHICH ACTS — and builds the refusal a caller reads when it asks for one.
 *
 * `src/shared/authority.ts` is the vocabulary; this is what fills it in from what the product
 * actually holds.
 *
 * ---------------------------------------------------------------------------------------
 * TWO SOURCES, AND NEITHER IS A LIST SOMEBODY TYPED
 * ---------------------------------------------------------------------------------------
 *
 * 1. **The route declarations.** Every route declaring `reach: 'local'` contributes its `operation`
 *    and the reason its author wrote beside the word. Read off the routes as they registered, so a
 *    route that changes its reach changes this answer with nothing to keep in step.
 * 2. **The guard registry**, `GOVERNANCE_GUARDS` in lib/records/governance-guards.ts, which `tests/guard-registry`
 *    already sweeps over every file under lib/ so a guard cannot be written without being in it.
 *    Every entry carrying an `actKey` contributes that key, and an entry carries a key exactly when
 *    its own body asks `actor.from` — which a test reads out of the source rather than trusting.
 *
 * **Nothing here publishes a number.** §6.7 enumerates twelve acts of its own; the list a reader
 * sees is longer or shorter as the route table and the registry move, and that is the mechanism
 * working rather than a drift. The tests assert one entry per source row, never a count.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * It is not the enforcement. `refuseAnActFromAnotherMachine` in lib/reach.ts refuses the request and
 * the guards in lib/records.ts refuse the act; both of those decide. This computes what is
 * PUBLISHED, so a browser can decline to draw a control rather than drawing one and being refused —
 * §9.3's rule and `docs/UX-CONTRACT.md`'s third option, which is forbidden.
 *
 * A published list and an enforced rule can still disagree, which is why
 * `tests/the-published-refusal-is-the-one-enforced.test.ts` binds them.
 */

import { compareRefusedActs, WHY_REFUSED_CLAUSE, type RefusedAct, type WhyRefused } from '@shared/authority.ts'
import type { ApiRoute } from '@shared/api-route.ts'
import type { Arrival } from './records.ts'

/** What this reading needs from the guard registry, and nothing more. */
export interface RegisteredAct {
  /** The stable key, or null when this guard's act is not refused for where it was asked from. */
  actKey: string | null
  /**
   * The act in a person's words. The registry has held this for the governance queue since it was
   * written, so the words a caller reads in a refusal and the words the queue draws are one string.
   */
  act: string
  /** The route or routes that perform it, as the registry writes them. */
  route: string
}

/**
 * HOW THE REGISTRY WRITES ITS ROUTES, AND WHY IT IS SPLIT RATHER THAN PARSED.
 *
 * `GovernanceGuard.route` is `'DELETE /api/records/:id · PATCH /api/records/:id'` — one string with
 * a middle dot between endpoints, which is how it is drawn on the governance queue. Splitting on
 * that separator is the whole of the reading, and it is here rather than in the registry because
 * the registry's field is prose for a person and this is the one caller that wants it as data.
 */
const REGISTRY_ROUTE_SEPARATOR = '·'

/**
 * Every act a caller from another machine may not perform, joined from the two sources above.
 *
 * ---------------------------------------------------------------------------------------
 * WHY AN ENTRY NAMES ITS ROUTES
 * ---------------------------------------------------------------------------------------
 *
 * Measured on this route table, not supposed: the operation `plan.write` is declared on two `local`
 * routes and on sixteen `remote` ones. A published list carrying the operation alone would have a
 * remote browser hide every plan control in the product on the strength of two routes that are
 * nothing to do with them. So each entry carries the routes it covers, and a browser matches on the
 * route it is about to call.
 *
 * ---------------------------------------------------------------------------------------
 * ONE ACT MAY ARRIVE FROM BOTH SOURCES, AND THAT IS A CROSS-CHECK RATHER THAN A DUPLICATE
 * ---------------------------------------------------------------------------------------
 *
 * `plan.commit` is a `reach: 'local'` route AND a registry entry with an arrival clause, because the
 * two mechanisms cover it twice on purpose — the hook refuses the request before the handler, and
 * the guard refuses the act if anything ever reaches it another way. They merge into one entry, and
 * the routes of both are carried, so nothing is lost and nothing is said twice.
 *
 * The reason is the stronger of the two: `reserved-to-the-owner` beats a machine reason, because a
 * reader who is told *this works on the computer Mole Office runs on* about an act that is actually the
 * person's alone has been told the smaller truth.
 */
export function actsRefusedFromAnotherMachine(input: {
  routes: readonly ApiRoute[]
  guards: readonly RegisteredAct[]
  /**
   * Whether the caller may act as the person from their other computer, as `theRequestMayActAsThePersonFromThere` in
   * lib/reach.ts reads it: an encrypted door and their key itself. A route that declares `thePersonMayFromAnotherComputer`
   * is not refused to such a caller. The hook is the same rule enforced, so it
   * is left off their list and stays on everybody else's. Left out, nobody is, as before.
   */
  thePersonMayAskFromThere?: boolean
}): RefusedAct[] {
  const byAct = new Map<string, { inWords: string; because: WhyRefused; routes: Set<string> }>()

  const add = (act: string, inWords: string, because: WhyRefused, routes: readonly string[]): void => {
    const held = byAct.get(act)
    if (held === undefined) {
      byAct.set(act, { inWords, because, routes: new Set(routes) })
      return
    }
    for (const one of routes) held.routes.add(one)
    // The owner's own act is the stronger statement, and its words go with its reason; see the note
    // above. Taking the reason without the words would leave a sentence that argued with itself.
    if (because === 'reserved-to-the-owner') {
      held.because = because
      held.inWords = inWords
    }
  }

  for (const one of input.routes) {
    if (one.reach !== 'local') continue
    // `because` is required on a local route and refused on a remote one, enforced at registration
    // in api/kinds.ts. A route that reached here without one came through a config built by hand
    // that the registration guard would already have thrown on, so this is unreachable rather than
    // defaulted — and it throws rather than guessing a reason, because a guessed reason is a
    // sentence a person would act on.
    if (one.keptHere === undefined) {
      throw new Error(
        `${one.method} ${one.path} is declared reach "local" and says neither why nor what the act is. ` +
          'GET /api/access publishes the refusal and cannot write it. This should have been refused at ' +
          'registration by refusalOn in api/kinds.ts, so the registration guard has a hole in it.',
      )
    }
    if (input.thePersonMayAskFromThere === true && one.keptHere.thePersonMayFromAnotherComputer === true) continue
    add(one.operation, one.keptHere.act, one.keptHere.because, [`${one.method} ${one.path}`])
  }

  for (const entry of input.guards) {
    if (entry.actKey === null) continue
    // A GUARD LETS THE PROVED PERSON THROUGH FROM ANOTHER MACHINE: each one refuses an arrival from there only when
    // `thePersonIsProved` does not hold (lib/records.ts). So for the caller that may act as them from there the guard's
    // act is not refused, and their list leaves it off. A local route behind a guard is still
    // listed above unless it declares the widening.
    if (input.thePersonMayAskFromThere === true) continue
    const routes = entry.route
      .split(REGISTRY_ROUTE_SEPARATOR)
      .map((one) => one.trim())
      .filter((one) => one !== '')
    add(entry.actKey, entry.act, 'reserved-to-the-owner', routes)
  }

  return [...byAct.entries()]
    .map(
      ([act, held]): RefusedAct => ({
        act,
        inWords: held.inWords,
        because: held.because,
        routes: [...held.routes].sort(),
      }),
    )
    .sort(compareRefusedActs)
}

/**
 * THE REFUSAL, IN ONE SHAPE, AND IT IS THE SAME SHAPE FOR BOTH PLACES THAT REFUSE.
 *
 * `remote-access.md` §6.9 names four parts in this order, and they are four because each answers a
 * question a person actually asks when a thing they wanted did not happen:
 *
 *   1. what was refused and why, naming the ACT rather than the route
 *   2. that nothing was written
 *   3. where it can be done, named as a machine and not as a URL
 *   4. which machine asked, when Mole Office could tell
 *
 * `error` is the sentence a person reads; `detail` is the same refusal with the machinery in it.
 * `readFault` in src/web/api.ts already draws both, so the browser needs nothing new to show one.
 *
 * NO NETWORKING WORDS IN `error`. Part 3 says *the computer Mole Office is running on*, not a bind
 * address, because the sentence is read by a person in Normal mode who has a rule against meeting
 * `loopback` on any screen. The address is in `detail`, which is the Developer half.
 */
export function refusalFromAnotherMachine(input: {
  /** What the caller was trying to do, in a person's words. Starts the sentence. */
  act: string
  /** Which of the three reasons, so the sentence and the published key cannot disagree. */
  because: WhyRefused
  /** `METHOD /api/path`, for `detail`. */
  route: string
  /** What the caller arrived as. Always `another machine` here; carried so `detail` can say it. */
  arrival: Arrival
  /** What the private network called the caller, or null because nothing named it. */
  client: string | null
}): { error: string; detail: string } {
  const whoAsked =
    input.client === null
      ? 'Mole Office could not tell which computer asked.'
      : `The request came from ${input.client}.`

  return {
    error:
      `${input.act} ${WHY_REFUSED_CLAUSE[input.because]}, and this request came from another computer. ` +
      'Nothing was written and nothing was changed. ' +
      'It is done at the computer Mole Office is running on. ' +
      whoAsked,
    detail:
      `${input.route} · reach: this machine · arrival: ${input.arrival} · ` +
      `because: ${input.because} · client: ${input.client ?? 'not identified'}`,
  }
}
