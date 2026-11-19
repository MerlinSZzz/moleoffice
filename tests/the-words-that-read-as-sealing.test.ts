// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS THAT MAKE A RUN'S LAST MESSAGE READ AS SEALING. The rules are in
 * src/server/lib/how-a-round-ended-rules.ts, which opens no database, so this file reads them with messages and no office.
 *
 * WHAT IS PROVED.
 *   1. A message reads as sealing when it says its round is done, when it says the seal follows this message, or when it
 *      says this run seals after the message.
 *   2. A message that says "before I seal", "before sealing" or "before the seal" does not read as sealing: it says what
 *      comes first. A message that says its round is done and then asks a question does not read as sealing either, because
 *      it is waiting for an answer.
 *   3. A message that says its round is done does not read as sealing when any of its sentences speaks of the seal in words
 *      not read as sealing: it may negate the seal, or put a step before it, and the office does not try to tell which.
 *   4. Every other message in the second list keeps its exact answer: a plain refusal still says it will not seal, a round
 *      that is not done or is another run's says nothing, and a conditional plan says nothing.
 *
 * WHERE THE WORDINGS COME FROM. The four sealing wordings are from real last messages of earlier rounds. The whole
 * sentence of the first one is not known, so the test uses a sentence of that shape: "Round 71 (choice B) is done: both
 * pieces are joined and green, and the git seal follows this message." Four of the done rounds that speak of the seal in
 * other words are the ones the check read as sealing when it refused round 74: the seal does not follow, not going to
 * seal, a step before the seal, and no sealing today. Two more are the fix round's own: a contracted negation, and a step
 * put first. The question with no seal word in it keeps the asks-something guard proved, because the seal-word guard
 * also catches the question that holds "Before I seal".
 *
 * MUTATION PROOFS, RUN ON 22 OCTOBER 2026 AT THE FIX ROUND'S CODE. Each mutation was made alone, the test was run alone,
 * and the file was restored before the next. Each list below is every message the failing run named.
 *   1. The done reading removed from whatAMessageSaysAboutTheSeal: "Round 72 is done." reads as not saying it seals.
 *   2. The asks-something guard removed: "Round 74 is done. May I keep the old wording?" reads as sealing.
 *   3. The condition guard removed from itSaysItsRoundIsDone: "When round 74 is done, I will write again." reads as sealing.
 *   4. The another-run guard removed from itSaysItsRoundIsDone: "In that run, round 70 is done." reads as sealing.
 *   5. The before-the-seal rule removed: the three messages that hold "Before I seal" read as sealing.
 *   6. "The seal follows this message" removed from itSaysThisRunSeals: the three messages that say the seal follows this
 *      message read as not saying it seals. The two that also say a round is done now fall to the done reading, and the
 *      seal-word guard holds them.
 *   7. "This run seals" removed from itSaysThisRunSeals: "My run seals right after this message." reads as not saying it
 *      seals.
 *   8. The seal-word guard removed from the done reading: exactly the six done rounds that speak of the seal in other words
 *      read as sealing.
 */
import { describe, expect, it } from 'vitest'

import { whatAMessageSaysAboutTheSeal } from '../src/server/lib/how-a-round-ended-rules.ts'

/** The run whose messages are read. */
const RUN = 'synthRun0001'

describe('the words that read as sealing', () => {
  it('reads a done round, the seal following the message, and this run sealing as sealing', () => {
    const messages: [string, string][] = [
      [
        'Round 71 (choice B) is done: both pieces are joined and green, and the git seal follows this message.',
        'it-seals',
      ],
      ['Round 54 is done, and the seal follows this message.', 'it-seals'],
      ['Round 72 is done.', 'it-seals'],
      ['My run seals right after this message.', 'it-seals'],
      ['Both pieces are joined and green, and the seal follows this message.', 'it-seals'],
    ]
    const wrong = messages.filter(([message, expected]) => whatAMessageSaysAboutTheSeal(message, RUN) !== expected)
    expect(wrong).toEqual([])
  })

  it('does not read a refusal, a question, a done round that speaks of the seal in other words, another run, or a plan as sealing', () => {
    const messages: [string, string][] = [
      ['I do not seal.', 'it-will-not-seal'],
      ['I am not sealing yet.', 'it-will-not-seal'],
      ['Before I seal, one question: may I keep the old wording?', 'it-does-not-say'],
      ['Round 74 is done. Before I seal, one question: may I keep the old wording?', 'it-does-not-say'],
      ['Round 74 is done. May I keep the old wording?', 'it-does-not-say'],
      ['Round 74 is done. The seal does not follow this message.', 'it-does-not-say'],
      ['Round 74 is done. I am not going to seal.', 'it-does-not-say'],
      ['Round 74 is done. Before I seal, the check must pass.', 'it-does-not-say'],
      ['Round 74 is done. No sealing today.', 'it-does-not-say'],
      ['Round 74 is done. The branch isn’t sealed yet.', 'it-does-not-say'],
      ['Round 74 is done. The gates run first, then the seal.', 'it-does-not-say'],
      ['Round 74 is done, but I will not seal: the tests are red.', 'it-will-not-seal'],
      ['Round 74 is not done: two tests are red.', 'it-does-not-say'],
      ['When round 74 is done, I will write again.', 'it-does-not-say'],
      ['In that run, round 70 is done.', 'it-does-not-say'],
      ['My run will not seal right after this message.', 'it-does-not-say'],
      ['My run seals after your answer.', 'it-does-not-say'],
      ['The seal follows your answer.', 'it-does-not-say'],
    ]
    const wrong = messages.filter(([message, expected]) => whatAMessageSaysAboutTheSeal(message, RUN) !== expected)
    expect(wrong).toEqual([])
  })
})
