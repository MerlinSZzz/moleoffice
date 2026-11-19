// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t } from '@shared/i18n.ts'
/**
 * THE ORDERS THE GOVERNANCE QUEUE CAN BE DRAWN IN, AND THE ONE THE BROWSER REMEMBERS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Problem `Dzq7hMCIFAA6`: there are too many decisions and no order. One combined ranking is
 * needed — time, importance and the rest — putting what most needs the person first, as the
 * default; and the person must be able to sort by time, by importance and by category themselves.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFAULT ORDER IS NOT WORKED OUT HERE, AND THAT IS THE POINT
 * ---------------------------------------------------------------------------------------
 *
 * `readForks` on the server already ranks the open forks by seven facts — pinned, somebody being
 * hurt, how much work is stuck, how far that reaches, whether it is the person's to settle, how long it has
 * waited, whether it can be settled in one press — and says in a sentence on each fork which of
 * them put it where it is. THAT IS THE COMBINED RANKING THE PROBLEM ASKS FOR, and `whatNeedsYouMost` below
 * is the identity: it hands back the list in the order it arrived.
 *
 * Working it out a second time in the browser is the defect CLAUDE.md names as this repository's
 * own, and `web/components/home/decisions.ts` has the account of the day a browser re-sort put
 * convenience above consequence. So this file re-sorts only when a person asks for a different
 * order, and it says on the screen which order they are looking at.
 *
 * WHY NOT THE ATTENTION SCORE. `shared/attention.ts` is the other ranking in this product and it
 * was the other candidate. It has no idea of a pin — the owner's own mark, and the first thing they
 * asked to rank by — and it is computed from the whole corpus at once rather than per fork, so a
 * page holding a forks reply cannot ask it anything. The fork priority keys already carry the three
 * facts the owner named. Nothing here invents a third ranking.
 *
 * ---------------------------------------------------------------------------------------
 * WHY "MOST IMPORTANT" IS NOT THE SAME LIST AS THE DEFAULT
 * ---------------------------------------------------------------------------------------
 *
 * The default's seven keys are three kinds of fact: what it would cost to leave a thing alone
 * (pinned, hurt, stuck, reach, whose it is), how long it has waited, and whether it is easy to
 * settle. Importance is the first kind alone. It drops how long a fork has waited — that is the
 * separate order asked for by name — and it drops whether a fork can be settled in one press,
 * which `readForks` itself calls convenience rather than consequence.
 *
 * DROPPING THOSE TWO IS NOT ENOUGH ON ITS OWN, and this was measured rather than reasoned. The
 * importance keys are the first five of the default's seven, and sorting is stable, so a list
 * already in the default order sorted again by a PREFIX of the same keys comes back unchanged —
 * every time, whatever the data. Written that way, "Most important first" was the default list
 * under a second name: a control that does nothing while telling a reader it did something. It was
 * caught by mutating it to do nothing and watching every test still pass.
 *
 * SO IMPORTANCE FINISHES WITH THE NEWEST FIRST, and that is what makes it a different list. Where
 * the importance facts are equal, the default asks how long each has waited and this asks which is
 * newer. A question that has sat for a month and one filed this morning are equally important when
 * nothing else separates them, and the order says which is which rather than treating age as
 * importance.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT "CATEGORY" IS, ON EACH OF THE TWO LISTS
 * ---------------------------------------------------------------------------------------
 *
 * One example of a category is whether a fork holds up a block. A `block` is a step of
 * work in this product, and a fork holding one up is holding up a piece of the pipeline. So for the
 * open forks, category is THE KIND OF THING THE FORK IS HOLDING UP: steps of work first, then the
 * other kinds by name, then the forks holding nothing up.
 *
 * A decision holds nothing up and there is no kind to read on one. What a decision does carry, and
 * what its card already draws, is which of three things it is: an answer that took one of the
 * options it was offered, an answer written in the person's own words instead, or a decision filed
 * with no question in front of it. That is the category for that list, and it is named on the
 * control in those words rather than borrowed from the other one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE DECIDED LIST IS OFFERED TWO ORDERS AND NOT FOUR
 * ---------------------------------------------------------------------------------------
 *
 * IMPORTANCE IS NOT OFFERED because a decision carries no pin. `pinned` is declared on the proposal
 * kind alone: it is the person's mark on a fork still waiting on them, and there is nothing to mark on a
 * choice already made. `newestFirst` in components/home/decisions.ts says the same thing where the
 * list is built.
 *
 * AND THE COMBINED RANKING IS NOT OFFERED SEPARATELY, because with no pin, nothing blocked and no
 * one waiting on it, the combined ranking of a decided list is its time order — the same list under
 * two names. The default here IS the time order, and it says so.
 */

import { BLOCK_KIND } from '@shared/blocks.ts'

import type { Decided, Decision } from '../components/home/decisions.ts'
import { newestFirst } from '../components/home/decisions.ts'
import { readChoice, writeChoice, type StoreFault } from './store.ts'

// ============================================================ the orders the open forks can be in

/** The four orders the queue of open forks can be drawn in. The first is the default. */
export const FORK_ORDERS = ['what-needs-you-most', 'newest-first', 'most-important', 'what-it-holds-up'] as const

/** One of the four. */
export type ForkOrder = (typeof FORK_ORDERS)[number]

/** The order the queue is in when nobody has chosen: the one the server ranked. */
export const FORK_ORDER_BY_DEFAULT: ForkOrder = 'what-needs-you-most'

/**
 * WHAT EACH ORDER IS CALLED, in words a reader hears rather than the word the code uses.
 *
 * THERE IS NO PARAGRAPH BESIDE THEM, and it was written with one before it was written without.
 * `docs/UX-CONTRACT.md`: *"Do not solve confusing UX by adding more instructions. A fix that
 * amounts to 'add a sentence explaining it' is a failed fix."* The rules are in this file, where a
 * person changing one reads them, and the queue already answers the question a paragraph was
 * trying to answer: every fork carries `priority.because`, which names the fact that put THAT fork
 * where it is. A sentence over the list would be the same account, worse, and everywhere.
 */
export const FORK_ORDER_WORDS: Readonly<Record<ForkOrder, string>> = {
  get 'what-needs-you-most'() { return t('decisions.orderNeeds') },
  get 'newest-first'() { return t('decisions.orderNewest') },
  get 'most-important'() { return t('decisions.orderImportance') },
  get 'what-it-holds-up'() { return t('decisions.orderBlocking') },
}

/**
 * Put the open forks in one of the four orders.
 *
 * The list handed in is left alone; a new one comes back. Sorting is stable in every browser this
 * runs in, so forks that tie under the order asked for keep the order the server sent them in,
 * which is the combined ranking. That is the tie-break, and it is why none of these repeat it.
 */
export function orderForks(rows: readonly Decision[], order: ForkOrder): Decision[] {
  const held = [...rows]
  switch (order) {
    case 'what-needs-you-most':
      // THE ORDER IT ARRIVED IN. `readForks` ranked it and nothing here has a second opinion.
      return held
    case 'newest-first':
      return held.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    case 'most-important':
      return held.sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          Number(b.priority.safety) - Number(a.priority.safety) ||
          b.priority.blocking - a.priority.blocking ||
          b.priority.reaches - a.priority.reaches ||
          Number(b.priority.governance) - Number(a.priority.governance) ||
          // THE NEWEST OF EQUALS, and this line is what makes this a different list from the
          // default rather than the same one under another name. See the block at the top.
          b.createdAt.localeCompare(a.createdAt),
      )
    case 'what-it-holds-up':
      return held.sort((a, b) => holdsUpBefore(whatItHoldsUp(a), whatItHoldsUp(b)))
  }
}

/**
 * WHAT KIND OF THING THIS FORK IS HOLDING UP, or null because it is holding nothing up.
 *
 * A fork can block several records of several kinds. A step of work wins whenever one is there,
 * because that is the case the owner named; otherwise the first kind by name is taken, so a fork's group
 * does not depend on which order its blocked records happen to be listed in.
 */
export function whatItHoldsUp(fork: Decision): string | null {
  const kinds = fork.blocks.map((held) => held.kind)
  if (kinds.length === 0) return null
  if (kinds.includes(BLOCK_KIND)) return BLOCK_KIND
  return [...kinds].sort((a, b) => a.localeCompare(b))[0] ?? null
}

/** Steps of work first, then the other kinds by name, then whatever holds nothing up. */
function holdsUpBefore(a: string | null, b: string | null): number {
  if (a === b) return 0
  // NOTHING HELD UP GOES LAST. It is not a kind, and putting it under "b" among the kind names
  // would make an empty answer sort as though somebody had written one.
  if (a === null) return 1
  if (b === null) return -1
  if (a === BLOCK_KIND) return -1
  if (b === BLOCK_KIND) return 1
  return a.localeCompare(b)
}

// ============================================================ the orders the decided list can be in

/** The two orders the decided list can be drawn in. The first is the default. */
export const DECIDED_ORDERS = ['newest-first', 'kind-of-answer'] as const

/** One of the two. */
export type DecidedOrder = (typeof DECIDED_ORDERS)[number]

/** The order the decided list is in when nobody has chosen. */
export const DECIDED_ORDER_BY_DEFAULT: DecidedOrder = 'newest-first'

/** What each of the two is called. See the note above about there being no paragraph beside them. */
export const DECIDED_ORDER_WORDS: Readonly<Record<DecidedOrder, string>> = {
  get 'newest-first'() { return t('decisions.orderNewest') },
  get 'kind-of-answer'() { return t('decisions.orderAnswer') },
}

/**
 * WHICH OF THREE THINGS THIS DECISION IS, for the reader and for the order.
 *
 * The three are the ones the card already draws, and they are read off stored fields rather than
 * judged: a decision either names the fork it answers or does not, and `ownAnswer` is already
 * worked out where the row is built, from the option index being absent while an answer is written.
 */
export const KINDS_OF_ANSWER = ['took-an-option', 'your-own-answer', 'no-question'] as const

/** One of the three. */
export type KindOfAnswer = (typeof KINDS_OF_ANSWER)[number]

/** Which of the three this decision is. */
export function kindOfAnswer(decision: Decided): KindOfAnswer {
  if (decision.proposalId === null) return 'no-question'
  return decision.ownAnswer ? 'your-own-answer' : 'took-an-option'
}

/**
 * Put the decided list in one of the two orders.
 *
 * The list handed in is left alone. `newestFirst` is the comparator the list was built with, in
 * components/home/decisions.ts, reused rather than restated: a second newest-first here is two
 * places that could disagree about which decision is at the top.
 */
export function orderDecided(rows: readonly Decided[], order: DecidedOrder): Decided[] {
  const held = [...rows]
  switch (order) {
    case 'newest-first':
      return held.sort(newestFirst)
    case 'kind-of-answer':
      return held.sort(
        (a, b) =>
          KINDS_OF_ANSWER.indexOf(kindOfAnswer(a)) - KINDS_OF_ANSWER.indexOf(kindOfAnswer(b)) ||
          // NEWEST FIRST INSIDE A GROUP, so the two orders agree about everything they can.
          newestFirst(a, b),
      )
  }
}

// ============================================================ what this browser remembers

/**
 * WHERE EACH CHOICE IS KEPT, and why it is kept in the browser rather than on the person.
 *
 * Which order somebody wants to read a list in is about the screen in front of them, not a fact
 * about them that another agent should be able to read. `lib/following.ts` says the same thing
 * about following an agent, for the same reason.
 *
 * A BROWSER THAT REFUSES STORAGE IS NOT AN ERROR. `readChoice` wraps every read, hands back the
 * default when there is nothing stored, and writes a sentence into `faults` when the browser will
 * not remember — which the page prints rather than swallows.
 */
export const FORK_ORDER_KEY = 'mole-office.governance.forkorder'

/** Where the decided list's choice is kept in this browser. */
export const DECIDED_ORDER_KEY = 'mole-office.governance.decidedorder'

/** The order this browser last asked for the open forks in, and anything that went wrong reading it. */
export function rememberedForkOrder(): { order: ForkOrder; fault: string | null } {
  const faults: StoreFault[] = []
  const order = readChoice(FORK_ORDER_KEY, FORK_ORDERS, FORK_ORDER_BY_DEFAULT, faults)
  return { order, fault: faults[0]?.message ?? null }
}

/** The order this browser last asked for the decided list in, and anything that went wrong reading it. */
export function rememberedDecidedOrder(): { order: DecidedOrder; fault: string | null } {
  const faults: StoreFault[] = []
  const order = readChoice(DECIDED_ORDER_KEY, DECIDED_ORDERS, DECIDED_ORDER_BY_DEFAULT, faults)
  return { order, fault: faults[0]?.message ?? null }
}

/**
 * Remember an order for next time, and say when the browser would not.
 *
 * Null when it was written. When it was refused, the sentence is `store.ts`'s own — the same one a
 * refused READ produces, because it is the same fact and a second wording here would be that fact
 * written twice. The page goes on drawing the order the person asked for either way.
 */
export function rememberOrder(key: string, order: string): string | null {
  const faults: StoreFault[] = []
  writeChoice(key, order, faults)
  return faults[0]?.message ?? null
}
