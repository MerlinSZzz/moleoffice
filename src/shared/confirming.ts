// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A QUESTION AN AGENT ASKED THE PERSON GOES TO ITS STARTER FIRST. The shape, and the words for it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A problem an agent raised was handed straight to the person, although the agent's starter could
 * have decided first whether it was really for the person or could just be closed.
 *
 * Criterion P55. Until this, an agent writing `whose_move: person` put the record straight on the person's
 * list and its starter never saw it. Whoever starts an agent answers for it, and that has to include
 * what it asks the person.
 *
 * ---------------------------------------------------------------------------------------
 * ONE FACT IS STORED AND THE REST IS WORKED OUT
 * ---------------------------------------------------------------------------------------
 *
 * The only new fact is that somebody passed the question on: `confirmed_by`, a list on the record.
 * Everything else is read at the moment it is asked — who marked the question, from the revision
 * ledger, and who started them, from the registry — because both already exist and a stored copy of
 * either would be free to fall out of step with it. That is USER.md's ninth invariant.
 *
 * This file holds the shape and the words. The reading is `src/server/lib/confirming.ts`, because it
 * needs the ledger and the registry, and the browser may not reach either.
 */

import type { ParticipantKind, ParticipantRef } from './participants.ts'
import type { WordKey, WordValues } from './i18n.ts'

/** One agent, or the person, passing a question one rung up. Written once and never rewritten. */
export interface PassedItOn {
  /** Who passed it on. */
  who: ParticipantRef
  /** When, in local wall clock, the way every stamp in this product is written. */
  at: string
}

/** The key the list is stored under, on the four kinds that carry `whose_move`. */
export const CONFIRMED_BY = 'confirmed_by'

/** The fact behind each sentence on a record about where a question is. */
export type WhereTheQuestionIsCase =
  | 'not-a-question'
  | 'asker-not-recorded'
  | 'person-wrote-it'
  | 'ambiguous-asker'
  | 'asker-not-registered'
  | 'asker-has-no-starter'
  | 'starter-chain-cannot-be-followed'
  | 'nobody-above-asker'
  | 'passed-to-person'
  | 'waiting-with-agent'

/**
 * WHERE A QUESTION IS NOW: with an agent that has to look at it, or with the person.
 *
 * `reachedThePerson` is the whole answer for the queue, and the other fields are what a screen and a
 * refusal say about it. It is true in one ordinary case — every agent between the asker and the
 * person has passed it on — and in four where the chain cannot be followed at all. Those four are
 * NOT silently the same thing, which is why `says` is on every reading: a question that reaches the person
 * because nobody is above the asker reads differently from one their secretary passed on.
 */
export interface WhereTheQuestionIs {
  /** Who wrote `whose_move: person`, from the ledger. Null when the ledger cannot say. */
  markedBy: ParticipantRef | null
  /**
   * The agent that has to pass it on before it goes further.
   *
   * Null means it is with the person: either because it was passed all the way up, or because there
   * was nobody to pass it through. `says` is what tells those apart.
   */
  with: ParticipantRef | null
  /** Everybody who has passed it on, oldest first. */
  confirmedBy: readonly PassedItOn[]
  /** True when it is on the person's list. */
  reachedThePerson: boolean
  /** Which fact the sentence below describes, so a page can say it in its own language. */
  case: WhereTheQuestionIsCase
  /** The names, times and reasons the sentence carries, so a page in another language keeps them all. */
  facts: WhereTheQuestionFacts
  /**
   * One sentence a person reads, and the same sentence a refusal prints. It is built by
   * `sayWhereTheQuestionIs` from the English words, the same function a page calls in its own
   * language, so the door, a refusal and the page say one thing (check gfJxVyLI6nvX, invariant 9).
   */
  says: string
}

/** Why the chain of starters above the asker reaches nobody. */
export type ChainBreak = 'loops' | 'unregistered' | 'no-starter' | 'no-chain'

/**
 * THE FACTS A SENTENCE ABOUT A QUESTION NAMES. Each is present on the cases that name it, and absent on
 * the others. A name is the one a reader knows: an agent's handle, or the stored string where no
 * registry row answers.
 */
export interface WhereTheQuestionFacts {
  /** The agent that said it is the person's move (asker-not-registered, asker-has-no-starter, waiting-with-agent). */
  asker?: string
  askerKind?: ParticipantKind
  /** The agent that holds the question until it passes it on (waiting-with-agent). */
  holder?: string
  holderKind?: ParticipantKind
  /** True where the holder started whoever started the asker, rather than the asker itself. */
  viaStarters?: boolean
  /** The agents one name could mean, each as "name (handle)" (ambiguous-asker). */
  candidates?: readonly string[]
  /** Who passed the question on last, and when (passed-to-person). */
  passedBy?: string
  passedByKind?: ParticipantKind
  passedAt?: string
  /** Why the chain of starters cannot be followed, and where it breaks (starter-chain-cannot-be-followed). */
  chainBreak?: ChainBreak
  chainAt?: string
  chainAtKind?: ParticipantKind
}

/** The one sentence about where a question is, in whichever language `say` speaks. */
export function sayWhereTheQuestionIs(
  say: (key: WordKey, values?: WordValues) => string,
  question: Pick<WhereTheQuestionIs, 'case' | 'facts'>,
): string {
  const f = question.facts
  // A FACT NOBODY RECORDED IS SAID TO BE MISSING, never left as an empty pair of quotes.
  const name = (value: string | undefined): string => value ?? say('record.whoseMove.question.nameNotRecorded')
  const kind = (value: ParticipantKind | undefined): string =>
    say(value === 'person' ? 'record.whoseMove.question.kind.person' : 'record.whoseMove.question.kind.agent')
  switch (question.case) {
    case 'ambiguous-asker': {
      const agents = f.candidates === undefined || f.candidates.length === 0
        ? name(undefined)
        : f.candidates.join(say('record.whoseMove.question.and'))
      return say('record.whoseMove.question.ambiguous-asker', { name: name(f.asker), agents })
    }
    case 'asker-not-registered':
    case 'asker-has-no-starter':
      return say(`record.whoseMove.question.${question.case}`, { name: name(f.asker) })
    case 'starter-chain-cannot-be-followed': {
      const chain = say(`record.whoseMove.question.chain.${f.chainBreak ?? 'no-chain'}`, { name: name(f.chainAt), kind: kind(f.chainAtKind) })
      return say('record.whoseMove.question.starter-chain-cannot-be-followed', { chain })
    }
    case 'passed-to-person':
      return say('record.whoseMove.question.passed-to-person', { kind: kind(f.passedByKind), name: name(f.passedBy), at: name(f.passedAt) })
    case 'waiting-with-agent':
      return say('record.whoseMove.question.waiting-with-agent', {
        askerKind: kind(f.askerKind),
        asker: name(f.asker),
        holderKind: kind(f.holderKind),
        holder: name(f.holder),
        via: f.viaStarters === true ? say('record.whoseMove.question.via') : '',
      })
    default:
      return say(`record.whoseMove.question.${question.case}`)
  }
}

/**
 * WHAT A SCREEN CALLS THE ACT. One word, so the button, the refusal and the row cannot drift.
 *
 * "Pass it on" and not "approve": the starter is not approving the work, it is deciding whether the
 * question is really the person's. The other two answers it has are on the record already — close
 * it, or take the question off it.
 */
export const PASS_IT_ON = 'Pass it on'

/** What the person's own row says, once somebody has. `who` is the name a reader knows them by. */
export function passedItOnToYou(who: string, at: string): string {
  return `${who} passed this on to you on ${at.split(' ')[0] ?? at}.`
}

/** What a record says while it is still with an agent. */
export function waitingToBePassedOn(who: string): string {
  return `${who} has to pass this on before it reaches the person.`
}
