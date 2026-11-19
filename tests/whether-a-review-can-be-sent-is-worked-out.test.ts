// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A REVIEW CAN BE SENT IS WORKED OUT AT READ, AND ONE COMMENT THAT WENT TO TWO AGENTS IS
 * COUNTED RATHER THAN SUMMARISED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UNDER TEST, AND WHY NONE OF IT IS STORED
 * ---------------------------------------------------------------------------------------
 *
 * `readinessOf` in src/server/lib/reviews.ts answers one of five words from FOUR STORED FACTS, and
 * hands all four back beside the answer. A stored "ready" flag would be a fifth place where the same
 * thing is written down, and this repository has measured that defect four times: a comment's own
 * `state` said it had gone out while `agent_messages` said it had not.
 *
 * `deliveryWordOf` in src/shared/states.ts projects one of the six stored delivery words into the
 * word the owner reads, with a mark and a sentence. It writes no readings of its own — `STATE_WORDS`
 * in src/shared/words.ts is the one table and this reads it through `stateWord`.
 *
 * `howManyDealtWith` answers `1 / 2 dealt with`. A review's send writes one message per recipient,
 * so a comment sent to two agents is two rows that move independently: drawing the worst of them
 * says a comment is waiting when half of it is answered, drawing the best says it is dealt with
 * when nobody has read it, and drawing one is the defect this repository keeps finding.
 *
 * Every failing case here was proved by mutation, with a control run of this file first.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import { readinessOf } from '../src/shared/readiness.ts'
import type { FoundMember, ReviewMember, ReviewState, ReviewView } from '../src/server/lib/reviews.ts'
import { deliveryWordOf, howManyDealtWith, tellsApart } from '../src/shared/states.ts'

const CONTEXT = { target: { kind: 'record', recordId: 'JgwUmrzxIqkn', workspaceId: 'panelx' } } as never

function review(over: Partial<ReviewView> = {}): ReviewView {
  return {
    id: 'wdCLe2jmzo1h',
    workspaceId: 'panelx',
    entry: CONTEXT,
    state: 'collecting',
    started: '2026-08-26 09:40:00',
    startedBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    collectedAt: null,
    membershipFrozen: false,
    fromThreadId: null,
    sentAt: null,
    threadId: null,
    reach: 'local',
    startedByAgent: null,
    ...over,
  }
}

function member(over: Partial<FoundMember> = {}): FoundMember {
  return {
    found: true,
    source: 'annotation',
    id: 'n1',
    body: 'This does not match the run log.',
    context: CONTEXT,
    reading: { state: 'there', says: 'It is still there.' } as never,
    state: 'queued',
    created: '2026-08-26 09:41:00',
    createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    key: 'record/JgwUmrzxIqkn/panelx',
    interpretation: null,
    chosen: null,
    restrictions: null,
    ...over,
  }
}

/** A member with somewhere to go. `canSend` is the send's own answer, so this is what a send obeys. */
function addressed(over: Partial<FoundMember> = {}): FoundMember {
  return member({
    chosen: { recipient: { kind: 'agent', agentId: 'a1' } as never, canSend: true, says: 'To the mount agent.' },
    ...over,
  })
}

// ============================================================================ the five answers

describe('whether a review can be sent, from four stored facts and nothing else', () => {
  it('says it is still collecting, and how many are in it so far', () => {
    const answer = readinessOf(review(), [member(), member({ id: 'n2' })])
    expect(answer.word).toBe('collecting')
    expect(answer.says).toContain('2 comments so far')
    expect(answer.from.state).toBe('collecting')
    expect(answer.from.members).toBe(2)
  })

  it('says how many have nowhere to go, because a number is the difference between knowing and guessing', () => {
    const answer = readinessOf(review({ state: 'collected', membershipFrozen: true }), [
      addressed(),
      member({ id: 'n2' }),
      member({ id: 'n3' }),
    ])
    expect(answer.word).toBe('nowhereToSend')
    expect(answer.says).toContain('2 comments have nowhere to go')
    expect(answer.from.withNowhereToGo).toBe(2)
  })

  it('counts a chosen recipient that cannot be sent to as nowhere to go, which is what a send does', () => {
    const cannot = member({
      chosen: { recipient: { kind: 'agent', agentId: 'a1' } as never, canSend: false, says: 'That agent is gone.' },
    })
    expect(readinessOf(review({ state: 'collected', membershipFrozen: true }), [cannot]).word).toBe('nowhereToSend')
  })

  it('says it is ready when collecting has finished and every comment has somewhere to go', () => {
    const answer = readinessOf(review({ state: 'organised', membershipFrozen: true }), [
      addressed(),
      addressed({ id: 'n2' }),
    ])
    expect(answer.word).toBe('readyToSend')
    expect(answer.says).toContain('2 comments ready to go')
    expect(answer.says).toContain('Nothing has been sent')
  })

  it('says every comment has already gone rather than offering to say it twice', () => {
    const answer = readinessOf(review({ state: 'sent', membershipFrozen: true }), [
      addressed({ state: 'delivered' }),
      addressed({ id: 'n2', state: 'handled' }),
    ])
    expect(answer.word).toBe('alreadyGone')
    expect(answer.from.alreadyGone).toBe(2)
  })

  it('says an ended review is ended, and that its comments are untouched', () => {
    const answer = readinessOf(review({ state: 'abandoned' }), [member()])
    expect(answer.word).toBe('ended')
    expect(answer.says).toContain('exactly as it was')
  })

  it('does not call an empty finished review already gone, because nothing went', () => {
    // `alreadyGone === found.length` is true of zero and zero. An empty review is not a sent one.
    const answer = readinessOf(review({ state: 'collected', membershipFrozen: true }), [])
    expect(answer.word).toBe('readyToSend')
  })

  it('hands back all four facts, so a screen can say which one is in the way', () => {
    const missing: ReviewMember[] = [{ found: false, source: 'annotation', id: 'gone', says: 'not here now' }]
    const answer = readinessOf(review({ state: 'collected', membershipFrozen: true }), [addressed(), ...missing])
    expect(answer.from).toEqual({
      state: 'collected',
      membershipFrozen: true,
      withNowhereToGo: 0,
      alreadyGone: 0,
      members: 2,
    })
  })

  it.each(['collecting', 'collected', 'organised', 'sent', 'abandoned'] as ReviewState[])(
    'answers something for a review in state %s rather than falling through',
    (state) => {
      const answer = readinessOf(review({ state }), [addressed()])
      expect(answer.word).not.toBe('')
      expect(answer.says.length).toBeGreaterThan(20)
    },
  )
})

// ============================================================================ the six words

describe('where a comment got to, in the words the owner reads', () => {
  it('reads the three that read badly as machine words', () => {
    expect(deliveryWordOf('queued').word).toBe('waiting')
    expect(deliveryWordOf('picked_up').word).toBe('picked up')
    expect(deliveryWordOf('handled').word).toBe('dealt with')
  })

  it('leaves the three that are already English alone', () => {
    expect(deliveryWordOf('sent').word).toBe('sent')
    expect(deliveryWordOf('delivered').word).toBe('delivered')
    expect(deliveryWordOf('failed').word).toBe('failed')
  })

  it('never hands back a stored word it has no reading for', () => {
    const odd = deliveryWordOf('chasing')
    expect(odd.word).not.toBe('chasing')
    expect(odd.word).toContain('unknown')
    expect(odd.detail).toContain('nothing is claimed')
  })

  it('says nothing is recorded rather than printing an empty word', () => {
    expect(deliveryWordOf(null).word).not.toBe('')
    expect(deliveryWordOf(null).detail).toContain('Nothing is recorded')
  })

  it('tells all six apart with the colour gone', () => {
    const six = ['queued', 'sent', 'delivered', 'picked_up', 'handled', 'failed'].map(deliveryWordOf)
    for (let i = 0; i < six.length; i += 1) {
      for (let j = i + 1; j < six.length; j += 1) {
        const one = six[i] as (typeof six)[number]
        const other = six[j] as (typeof six)[number]
        expect(tellsApart(one, other), `${String(one.word)} and ${String(other.word)} look the same`).toBe(true)
      }
    }
  })

  it('carries a sentence for every one of the six, and no sentence prints a stored word', () => {
    // THE SENTENCE IS THE OTHER CHANNEL A MACHINE WORD REACHES A PERSON THROUGH. A title or a fold
    // that reads "picked_up" is the same defect as a label that does, with a longer run-up.
    for (const word of ['queued', 'sent', 'delivered', 'picked_up', 'handled', 'failed']) {
      const drawn = deliveryWordOf(word)
      expect(drawn.detail.length).toBeGreaterThan(20)
      expect(drawn.detail, `the sentence for ${word} prints the stored word`).not.toContain('picked_up')
      expect(drawn.detail).not.toContain('queued')
    }
  })
})

// ============================================================================ one comment, two agents

describe('one comment that went to two agents is counted, not summarised', () => {
  it('says 1 / 2 dealt with', () => {
    const count = howManyDealtWith(['handled', 'delivered'])
    expect(count?.says).toBe('1 / 2 dealt with')
    expect(count?.done).toBe(1)
    expect(count?.of).toBe(2)
    expect(count?.all).toBe(false)
  })

  it('says 2 / 2 when both agents have', () => {
    const count = howManyDealtWith(['handled', 'handled'])
    expect(count?.says).toBe('2 / 2 dealt with')
    expect(count?.all).toBe(true)
  })

  it('says 0 / 2 when neither has, rather than saying nothing', () => {
    expect(howManyDealtWith(['queued', 'sent'])?.says).toBe('0 / 2 dealt with')
  })

  it('answers nothing at all when nothing carries the words, rather than 0 / 0', () => {
    // "0 / 0" is a number about nothing standing where a fact goes.
    expect(howManyDealtWith([])).toBeNull()
  })

  it('counts a word it has no reading for as not dealt with, and still counts it', () => {
    const count = howManyDealtWith(['handled', 'chasing'])
    expect(count?.done).toBe(1)
    expect(count?.of).toBe(2)
  })
})
