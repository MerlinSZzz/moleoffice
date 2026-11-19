// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHY AN ACT IS REFUSED TO A CALLER FROM ANOTHER MACHINE — ONE VOCABULARY, ONE REFUSAL SHAPE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/remote-access.md` §6.1 states authority as an AND: an act is allowed
 * when the ACTOR may perform it and the MACHINE it was asked from may perform it. The actor half
 * already exists and does not change. This file is the caller-facing half of the machine half: the
 * closed set of reasons an act may be refused for where it was asked from, and the words a person
 * reads for each.
 *
 * It invents no act. Every act named through this vocabulary already exists in the product and is
 * already refused by something: `HUMAN_ONLY_KINDS`, `assertMayRemoveAFork`, the other governance
 * guards, or a route that declares `reach: 'local'` because it acts on the machine Mole Office runs on.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE BUCKET IS A KEY AND NEVER A SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * §8.5's own rule, and the same one `src/shared/disclosure.ts` and `src/shared/words.ts` already
 * apply: the server publishes a key, the browser makes the words. A sentence composed on the server
 * rides into every projection that did not ask for it, and a Normal reader would meet
 * `reach: 'local'` on a page that has a rule against saying `local` at all.
 *
 * The `Record` below is total over the keys, so a fourth reason does not compile until somebody has
 * written what it means. That is the guard `LEFT_OUT_SENTENCES` already has one layer down.
 *
 * ---------------------------------------------------------------------------------------
 * BEING REMOTE IS A PERMISSION AND NOT A READER
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here is an `audience` value and nothing here narrows what a reader is told. A person at
 * another machine is the same person in `normal` or `developer`; an agent at another machine is an
 * agent. What changes is which ACTS may be asked from where, which is why this file holds acts and
 * reasons and holds no reader at all.
 */

/**
 * WHAT A ROUTE KEPT ON THIS MACHINE DECLARES ABOUT ITS OWN REFUSAL.
 *
 * Two things and both are required, because a published refusal needs both to be worth reading: the
 * reason, as one of three keys, and what the act IS, in the words somebody would use out loud.
 * `route()` in src/server/lib/route.ts makes them a type error to omit and `refusalOn` in
 * src/server/api/kinds.ts makes them a failed registration for a config built by hand.
 */
export interface KeptHere {
  because: WhyRefused
  /**
   * The act, in a person's words, as the start of a sentence: *Writing the durable export to disk*.
   * Capitalised, no full stop, no route and no operation key — those are both said elsewhere in the
   * same refusal and saying them here would be saying them twice.
   */
  act: string
  /**
   * THE PERSON MAY ALSO DO THIS FROM THEIR OTHER COMPUTER, by a decision. A login made on the
   * other computer once had to be set from this one, and now the settings the person is already
   * proved for there are done there too. Declared first on the doors that read and write their office keys, their
   * summons settings and the sandboxes' logins, then on the push doors, and, since wave 13u round 14 and point (d) of
   * another decision, on the terminal doors one terminal's view asks.
   *
   * AND ON THEIR DECISIONS. By a decision, the person's decisions are theirs wherever they make
   * them. So it is declared too on giving a card, raising a secretary or ending a raise,
   * retiring an agent, taking an act back, accepting a guess about code, committing and applying a plan, removing a
   * trusted machine, ending a credential, revoking a key or undoing that, and naming the owner. It is not declared on a
   * door that acts on this machine's files, ports or processes, nor on trusting a machine, confirming a credential or
   * closing the key window, which give or take away a way to be the person without a key (each door's comment says
   * why).
   * The terminal doors are not among those decisions. They act on this machine's processes, and point (d) of their own
   * decision widens them, and keeps opening a terminal and starting the holder on this
   * computer.
   * The read of their mail tool's own settings through the office is not among them either, nor their three presses on them.
   * Each asks the tool, which answers on this machine alone, for the person and keeps nothing of its answer. They are widened to
   * their other computers.
   *
   * It widens the door for ONE caller. A request from another computer reaches such a door only when it carries the
   * person's key itself, which from there is a paired device's key, and came over an encrypted door; the one-version
   * window's keyless claim never counts. Anybody else, an agent included, meets the ordinary refusal. `thePersonMayAskFromThere` in src/server/lib/reach.ts is the rule, and `GET /api/access` stops
   * listing the act as refused for the person there, so their page and the rule say one thing.
   */
  thePersonMayFromAnotherComputer?: true
}

/**
 * The reasons an act may be refused to a caller from another machine. Three, and closed.
 *
 * - `acts-on-this-machine` — the act reaches this host's processes, disk or ports. Performing it
 *   from somewhere else either does damage at a keyboard nobody is sitting at, or is simply wrong:
 *   a resource row registered from elsewhere names a pid in the wrong process table.
 * - `starts-work-on-this-machine` — the act belongs to the part of Mole Office that starts work on
 *   this computer. Most of those doors only read or record; they are kept here so that no other
 *   computer becomes a place Mole Office starts work. It is kept apart from the reason above
 *   because the design names that rule, so a reader meets that reason and not a more general one.
 * - `reserved-to-the-owner` — the product already reserves the act to the person, and the machine
 *   half is the second condition on an act that had only the first.
 */
export const WHY_REFUSED = ['acts-on-this-machine', 'starts-work-on-this-machine', 'reserved-to-the-owner'] as const

/** One of the three reasons above. */
export type WhyRefused = (typeof WHY_REFUSED)[number]

/**
 * THE CLAUSE EACH REASON PUTS AFTER AN ACT. A refusal joins it after the act, and the panel joins
 * it after "This", so the sentence a caller reads and the sentence a person reads are one fact in
 * one place.
 *
 * `satisfies` binds the three keys together, so a fourth reason with no clause does not compile.
 */
export const WHY_REFUSED_CLAUSE = {
  'acts-on-this-machine':
    'works on the computer Mole Office is running on — its files, its ports, or something it has running',
  'starts-work-on-this-machine':
    'belongs to the part of Mole Office that starts work on the computer it is running on',
  'reserved-to-the-owner': 'is one of the few things Mole Office keeps for you alone',
} as const satisfies Record<WhyRefused, string>

/**
 * WHAT EACH REASON MEANS TO A PERSON, beside the reason itself and in no networking words.
 *
 * Here rather than in the panel for the reason the keys are here: the keys are declared on the line
 * above, and a meaning kept anywhere else is a second list somebody has to remember to extend.
 * `satisfies` binds the two together, so a fourth key with no sentence does not compile.
 *
 * `machine`, `host`, `port`, `loopback`, `bind`, `tailnet` and `proxy` are all names of mechanism.
 * These sentences say *this computer* and *another computer*, which is what a person would say.
 */
export const WHY_REFUSED_MEANS = {
  'acts-on-this-machine': `This ${WHY_REFUSED_CLAUSE['acts-on-this-machine']} — so it is done there.`,
  'starts-work-on-this-machine': `This ${WHY_REFUSED_CLAUSE['starts-work-on-this-machine']}, and Mole Office never starts work for another computer.`,
  'reserved-to-the-owner': `This ${WHY_REFUSED_CLAUSE['reserved-to-the-owner']}, and it is done at the computer Mole Office is running on.`,
} as const satisfies Record<WhyRefused, string>

/**
 * ONE ACT A CALLER FROM ANOTHER MACHINE MAY NOT PERFORM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `routes` IS ON HERE, AND IT IS A REPAIR RATHER THAN AN ADDITION
 * ---------------------------------------------------------------------------------------
 *
 * `act` is the key, and §9.3's rule is that a control is NOT DRAWN rather than drawn and then
 * refused — so the browser reads this list to decide what to draw. That only works if a reader can
 * tell which control an entry is about, and the operation name alone cannot always say.
 *
 * MEASURED, not supposed: `plan.write` is declared on two `local` routes — committing an intent and
 * applying a proposal — and on SIXTEEN `remote` ones, every ordinary plan write in the product. A
 * list that published the operation alone would have had a remote browser hide every plan control
 * it has, on the strength of two routes that are nothing to do with them. That is the same defect
 * §8.5 names in the other direction, arrived at by counting.
 *
 * So an entry names the routes it covers, and a browser matches on the route it is about to call.
 * One act may cover several — `archive.write` is two — which is why this is a list and not a field.
 */
export interface RefusedAct {
  /**
   * The stable key for the act. For a route that acts on this machine it is the semantic operation
   * the route already declares for telemetry, so it is not a third naming of anything. For an act
   * the product reserves to the person it is the key on that guard's registry entry.
   */
  act: string
  /**
   * THE ACT IN A PERSON'S WORDS, because `act` above is a key and a key is not a sentence.
   *
   * A refusal a person reads has to start with what they were trying to do, and `plan.write` is not
   * what anybody was trying to do. So the words are declared beside the act — on the route by
   * whoever wrote `local`, or on the guard registry entry, which has held prose for the governance
   * queue since it was written.
   *
   * THE REASON STAYS A KEY AND THIS IS NOT A CONTRADICTION. §8.5's rule is that the browser makes
   * the words for the REASON, of which there are three and a projection may want three different
   * phrasings. The act is open-ended — one per route and one per guard — and a browser-side map over
   * it would be a second list of every act in the product with nothing keeping it in step.
   */
  inWords: string
  /** Which of the three reasons. A key, never a sentence — see the top of this file. */
  because: WhyRefused
  /**
   * Every route this act covers, as `METHOD /api/path`, sorted. Never empty: an act with no route
   * is an act nobody can ask for, and publishing one would be publishing a refusal of nothing.
   */
  routes: string[]
}

/**
 * The order acts are published in, so two readings of the same state are the same bytes.
 *
 * By reason first — the three reasons are three different arguments and a reader works through one
 * at a time — then by act. `WHY_REFUSED`'s own order is the order, so the list and the vocabulary
 * cannot drift.
 */
export function compareRefusedActs(a: RefusedAct, b: RefusedAct): number {
  const byReason = WHY_REFUSED.indexOf(a.because) - WHY_REFUSED.indexOf(b.because)
  return byReason !== 0 ? byReason : a.act.localeCompare(b.act)
}
