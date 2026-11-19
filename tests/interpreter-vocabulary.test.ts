// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORDS A READING MAY USE, AND THE CHECK THAT REFUSES ONE WHICH USES ANY OTHERS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS ABOUT
 * ---------------------------------------------------------------------------------------
 *
 * `src/shared/intent.ts` is pure: no database, no runtime, nothing that reads anybody's words. It
 * declares two dimensions, the shape a reading arrives in, and the check. So this file is about
 * five claims, and each one is a way a reading could quietly stop being about the comments it says
 * it is about:
 *
 *   TWO DIMENSIONS, NOT ONE. What somebody wants to HAPPEN and what should EXIST afterwards are
 *   separate lists, and one comment may carry several of each.
 *
 *   ONE VOCABULARY FOR ONE QUESTION. Mole Office already stores a word for what somebody wants to happen
 *   — `MESSAGE_INTENTS`, picked by a person in the composer. The reading's list contains it. Two
 *   lists for one question is the defect this repository keeps producing, and the containment is
 *   checked here rather than promised in a comment.
 *
 *   EVERY SOURCE COMMENT IS ACCOUNTED FOR. A reading that leaves one out, names one nobody handed
 *   over, or reads one twice is refused, and nothing is stored.
 *
 *   ABSENCE AND NOTHING ARE DIFFERENT ANSWERS. An empty list means Mole Office did not work it out. The
 *   word `nothing` means it looked and there is nothing to file. They must not read the same.
 *
 *   NAMING A DECISION IS NOT TAKING ONE. `decision` is the one word that carries a refusal with it,
 *   and the sentence kept beside somebody's comment says so where they will read it.
 */

import { describe, expect, it } from 'vitest'
// MESSAGE_INTENTS IS READ FROM HERE AND NOT FROM src/server/lib/agents.ts, WHICH IS WHERE IT USED
// TO LIVE. That module reaches src/server/db/client.ts, and an import runs before any test body
// does, so naming it for one constant opened the operator's real database with permission to write
// to it. `tests/no-test-opens-the-live-corpus.test.ts` is the guard that found it. The word is
// re-exported from agents.ts under the same name, so nothing that stores it had to move.
import {
  ARTEFACTS,
  ARTEFACT_WORDS,
  COMMUNICATION_INTENTS,
  INTENT_WORDS,
  MESSAGE_INTENTS,
  checkOrganised,
  keptSentence,
  saidWithOthers,
  artefactNamed,
  type OrganisedComment,
} from '../src/shared/intent.ts'
import { RECORD_KINDS } from '../src/shared/types.ts'

/** The comments a reading is checked against, in the shape the check takes them. */
const handedOver = { ids: ['c1', 'c2'], unreadable: [] as string[], hidden: [] as string[] }

/** A reading that passes, so every refusal below differs from it in exactly one way. */
function reading(over: Partial<{ comments: unknown[]; groups: unknown[] }> = {}): unknown {
  return {
    comments: [
      { commentId: 'c1', reading: 'Asks which of two numbers was measured.', intents: ['ask'], artefacts: ['nothing'] },
      { commentId: 'c2', reading: 'Says the load cell reading is wrong.', intents: ['verify'], artefacts: ['problem'] },
    ],
    groups: [],
    ...over,
  }
}

// ============================================================================ the two dimensions

describe('what somebody wants to happen, and what could exist afterwards, are two lists', () => {
  it('keeps them apart, and every word in each says what it means', () => {
    // A WORD WITH NO MEANING BESIDE IT is a word two readers will use differently.
    for (const one of COMMUNICATION_INTENTS) expect(one.means.length, one.word).toBeGreaterThan(10)
    for (const one of ARTEFACTS) expect(one.means.length, one.word).toBeGreaterThan(10)
    // THE TWO LISTS ARE NOT ONE LIST. `review` is something somebody wants to happen; `note` is
    // something that could exist. Nothing appears on both.
    expect(INTENT_WORDS.filter((word) => ARTEFACT_WORDS.includes(word))).toEqual([])
  })

  it('lets one comment carry several of each, which is the whole reason they are lists', () => {
    const both = checkOrganised(
      reading({
        comments: [
          {
            commentId: 'c1',
            reading: 'Asks for a check, and for the check to be automated next round.',
            intents: ['verify', 'change'],
            artefacts: ['problem', 'task'],
          },
          { commentId: 'c2', reading: 'Says the number is fine.', intents: ['explain'], artefacts: ['nothing'] },
        ],
      }),
      handedOver,
    )
    expect('organised' in both, JSON.stringify(both)).toBe(true)
    if (!('organised' in both)) return
    expect(both.organised.comments[0]?.intents).toEqual(['verify', 'change'])
    expect(both.organised.comments[0]?.artefacts).toEqual(['problem', 'task'])
  })

  it('names a record kind for everything that could be filed, and nothing that Mole Office has no kind for', () => {
    // WHAT A READING SAYS COULD EXIST HAS TO BE SOMETHING THIS PRODUCT CAN HOLD. A word naming a
    // kind Mole Office does not have would be a reading a person could never act on.
    for (const one of ARTEFACTS) {
      if (one.filedAs === null) continue
      expect(RECORD_KINDS as readonly string[], one.word).toContain(one.filedAs)
    }
  })
})

// ============================================================================ one vocabulary, one question

describe('the words a reading may use contain the words a person may pick', () => {
  /**
   * THE CHECK THAT STOPS TWO VOCABULARIES FOR ONE QUESTION.
   *
   * `MESSAGE_INTENTS` is what a person picks when they send a comment to an agent, and it is
   * validated on write and stored on `agent_messages.intent`. That is the same question this
   * dimension asks, answered by the person rather than by a reading. If the two lists part company
   * — a word added to one, or `start` dropped from the reading's list to match a design document —
   * Mole Office would be storing a word about somebody's intent that a reading of the same intent could
   * not say. This is the test that goes red first.
   */
  it('contains every word a person can pick in the composer', () => {
    const missing = MESSAGE_INTENTS.filter((word) => !INTENT_WORDS.includes(word))
    expect(missing, 'a word a person may pick that a reading of the same fact cannot say').toEqual([])
  })

  it('is wider than that list, and the extra words are the ones a person is never asked for', () => {
    // Not a decorative assertion: it is what makes the containment above worth having. If the two
    // lists were identical this file would be checking that a list equals itself.
    const extra = INTENT_WORDS.filter((word) => !(MESSAGE_INTENTS as readonly string[]).includes(word))
    expect(extra).toEqual(['explain', 'investigate', 'continue', 'verify'])
  })
})

// ============================================================================ every comment is accounted for

describe('a reading has to be traceable back to the comments it came from', () => {
  it('accepts one that names every comment it was given, exactly once', () => {
    const checked = checkOrganised(reading(), handedOver)
    expect('organised' in checked, JSON.stringify(checked)).toBe(true)
  })

  it('refuses one that leaves a comment out, and names the one it left out', () => {
    const checked = checkOrganised(
      reading({ comments: [{ commentId: 'c1', reading: 'x', intents: [], artefacts: [] }] }),
      handedOver,
    )
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('c2')
    expect(checked.problem).toContain('Nothing has been stored')
  })

  it('refuses one that names a comment nobody handed over', () => {
    const checked = checkOrganised(
      reading({
        comments: [
          { commentId: 'c1', reading: 'x', intents: [], artefacts: [] },
          { commentId: 'c2', reading: 'y', intents: [], artefacts: [] },
          { commentId: 'somewhere-else', reading: 'z', intents: [], artefacts: [] },
        ],
      }),
      handedOver,
    )
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('somewhere-else')
    expect(checked.problem).toContain('not one of the comments in this review')
  })

  it('refuses a second reading of one comment', () => {
    const checked = checkOrganised(
      reading({
        comments: [
          { commentId: 'c1', reading: 'x', intents: [], artefacts: [] },
          { commentId: 'c1', reading: 'a different x', intents: [], artefacts: [] },
          { commentId: 'c2', reading: 'y', intents: [], artefacts: [] },
        ],
      }),
      handedOver,
    )
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('One comment, one reading')
  })

  it('refuses a reading of a comment whose words could not be read, because nothing was handed over', () => {
    // THE INTERPRETER WAS NOT GIVEN THOSE WORDS. An answer about them is an answer about something
    // else, and storing it beside a comment nobody could read would be an invention.
    const checked = checkOrganised(
      reading({
        comments: [
          { commentId: 'c1', reading: 'x', intents: [], artefacts: [] },
          { commentId: 'c2', reading: 'y', intents: [], artefacts: [] },
          { commentId: 'c3', reading: 'invented', intents: [], artefacts: [] },
        ],
      }),
      { ids: ['c1', 'c2'], unreadable: ['c3'], hidden: [] },
    )
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('never handed over')
  })

  it('refuses an empty reading, which would look like Mole Office had read the words', () => {
    const checked = checkOrganised(
      reading({
        comments: [
          { commentId: 'c1', reading: '   ', intents: [], artefacts: [] },
          { commentId: 'c2', reading: 'y', intents: [], artefacts: [] },
        ],
      }),
      handedOver,
    )
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('says nothing')
  })
})

// ============================================================================ absence is not nothing

describe('an empty list and the word "nothing" are different answers', () => {
  it('accepts an empty list, because not working something out is a real answer', () => {
    const checked = checkOrganised(
      reading({
        comments: [
          { commentId: 'c1', reading: 'Two people talking past each other.', intents: [], artefacts: [] },
          { commentId: 'c2', reading: 'y', intents: ['ask'], artefacts: ['nothing'] },
        ],
      }),
      handedOver,
    )
    expect('organised' in checked, JSON.stringify(checked)).toBe(true)
  })

  it('says the two apart in the sentence a person reads', () => {
    const didNotWorkItOut = keptSentence(
      { commentId: 'c1', reading: 'A remark.', intents: [], artefacts: [] },
    )
    const lookedAndFoundNone = keptSentence(
      { commentId: 'c1', reading: 'A remark.', intents: ['discuss'], artefacts: ['nothing'] },
    )
    expect(didNotWorkItOut).toContain('did not work out what should exist afterwards')
    expect(lookedAndFoundNone).toContain('Nothing needs to exist afterwards')
    expect(lookedAndFoundNone).not.toContain('did not work out')
  })

  it('refuses "nothing" beside something, because those cannot both be true', () => {
    const checked = checkOrganised(
      reading({
        comments: [
          { commentId: 'c1', reading: 'x', intents: [], artefacts: ['nothing', 'task'] },
          { commentId: 'c2', reading: 'y', intents: [], artefacts: [] },
        ],
      }),
      handedOver,
    )
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('cannot both be true')
  })

  it('refuses a word nobody declared, and says which words there are', () => {
    const checked = checkOrganised(
      reading({
        comments: [
          { commentId: 'c1', reading: 'x', intents: ['complain'], artefacts: [] },
          { commentId: 'c2', reading: 'y', intents: [], artefacts: [] },
        ],
      }),
      handedOver,
    )
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('complain')
    expect(checked.problem).toContain('ask')
  })

  it('refuses a key nobody declared rather than reading half of it', () => {
    const checked = checkOrganised(
      reading({
        comments: [
          { commentId: 'c1', reading: 'x', intents: [], artefacts: [], confidence: 0.8 },
          { commentId: 'c2', reading: 'y', intents: [], artefacts: [] },
        ],
      }),
      handedOver,
    )
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('confidence')
  })
})

// ============================================================================ what is true of several at once

describe('a group is what is true of several comments at once', () => {
  it('accepts one over two comments and says it under both of them, from one place', () => {
    const checked = checkOrganised(
      reading({ groups: [{ says: 'Both are about the same load cell reading.', commentIds: ['c1', 'c2'] }] }),
      handedOver,
    )
    expect('organised' in checked, JSON.stringify(checked)).toBe(true)
    if (!('organised' in checked)) return
    const [first, second] = checked.organised.comments as [OrganisedComment, OrganisedComment]
    // WHAT IS TRUE OF SEVERAL COMMENTS IS NOT IN THE SENTENCE KEPT BESIDE ONE OF THEM, and that is
    // the fix of 19 August 2026: a person may rewrite the sentence beside their own comment, and
    // when the group was written into it that rewrite left the other member announcing a group its
    // partner had left.
    expect(keptSentence(first)).not.toContain('Said with')
    expect(keptSentence(second)).not.toContain('same load cell reading')
    // IT IS SAID UNDER BOTH OF THEM, from the one list the review stores.
    expect(saidWithOthers(checked.organised.groups, 'c1')).toEqual([
      'Said with 1 other comment: Both are about the same load cell reading.',
    ])
    expect(saidWithOthers(checked.organised.groups, 'c2')).toEqual([
      'Said with 1 other comment: Both are about the same load cell reading.',
    ])
    expect(saidWithOthers(checked.organised.groups, 'c3')).toEqual([])
  })

  it('refuses a group of one, because that is what the comment’s own reading is for', () => {
    const checked = checkOrganised(reading({ groups: [{ says: 'On its own.', commentIds: ['c1'] }] }), handedOver)
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('SEVERAL comments')
  })

  it('refuses a group naming a comment outside the review', () => {
    const checked = checkOrganised(
      reading({ groups: [{ says: 'Two of these.', commentIds: ['c1', 'elsewhere'] }] }),
      handedOver,
    )
    expect('problem' in checked).toBe(true)
    if (!('problem' in checked)) return
    expect(checked.problem).toContain('elsewhere')
  })
})

// ============================================================================ naming a decision

describe('naming a decision is not taking one', () => {
  it('is the only word that carries a refusal, and it names the kind Mole Office never writes', () => {
    const decision = artefactNamed('decision')
    expect(decision?.refused).not.toBeNull()
    expect(decision?.refused?.kind).toBe('decision')
    // AND IT IS THE ONLY ONE. A second refusal added without a sentence beside it would be a rule
    // nobody reading this file could find.
    for (const word of ARTEFACT_WORDS) {
      if (word === 'decision') continue
      expect(artefactNamed(word)?.refused, word).toBeNull()
    }
  })

  it('says so in the sentence kept beside the comment, where the person reads it', () => {
    const sentence = keptSentence(
      {
        commentId: 'c1',
        reading: 'Asks whether to keep the second gripper at all.',
        intents: ['discuss'],
        artefacts: ['decision'],
      },
    )
    expect(sentence).toContain('Mole Office never writes a decision')
    expect(sentence).toContain('proposal')
    // AND IT SAYS NOTHING WAS FILED, which is the difference between a reading and an act.
    expect(sentence).toContain('Nothing has been filed')
  })

  it('writes both dimensions into the sentence, so neither is lost for want of a column', () => {
    const sentence = keptSentence(
      {
        commentId: 'c1',
        reading: 'Wants the number checked and the check automated.',
        intents: ['verify', 'change'],
        artefacts: ['problem', 'task'],
        recipient: 'whoever ran the calibration',
      },
    )
    expect(sentence).toContain('What they want: verify and change.')
    expect(sentence).toContain('What could exist afterwards: problem and task.')
    expect(sentence).toContain('Seems to be for whoever ran the calibration.')
    // AND IT DOES NOT SAY WHETHER ANYBODY HAS BEEN CHOSEN. That is a stored decision a person makes
    // afterwards, and a frozen sentence about it went stale the moment they made one.
    expect(sentence).not.toContain('Nobody has been chosen')
  })
})
