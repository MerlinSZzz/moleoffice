// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { deliveryReasonKey } from '../src/shared/review-pane-words.ts'
import { sayTheSend, type SendPlanLineKey } from '../src/shared/send-plan-words.ts'

const t = createI18n('en').t

describe('a review waiting for a recipient', () => {
  it('explains each recipient failure the send plan can return', () => {
    const cases: [SendPlanLineKey, string][] = [
      ['nobodyChosen', 'no recipient'], ['savedWithNobody', 'no recipient'],
      ['unresolvedWhy', 'could not be identified'], ['unresolvedNothingKept', 'no recipient'],
      ['unresolvedSaid', 'did not identify'], ['unresolvedSaidWhy', 'did not identify'],
      ['agentNotSaid', 'no recipient'], ['agentGone', 'no longer available'],
      ['agentElsewhere', 'another project'], ['agentInAnotherProject', 'another project'],
      ['agentNotAnAgent', 'not an agent'], ['cannotReach', 'retired'],
      ['runNotSaid', 'no recipient'], ['runGone', 'unavailable'],
      ['runElsewhere', 'another project'], ['runInAnotherProject', 'another project'],
      ['runNotARun', 'not a run'], ['runCannotBePickedUp', 'cannot be resumed'],
    ]
    for (const [code, expected] of cases) {
      const key = deliveryReasonKey(code)
      expect(key, code).not.toBeNull()
      expect(t(key!, { title: 'An agent', where: 'another project', said: 'Someone', why: 'no match' }), code).toContain(expected)
    }
    expect(deliveryReasonKey('sentWithThisReview')).toBeNull()
  })

  it('says a held comment is waiting even if the stored review state says sent', () => {
    const text = sayTheSend({
      dispatch: { total: 1, alreadyGone: 0, agents: 0, shares: [], held: [
        { quotedBody: 'Check this', messageId: 'comment', sentence: { key: 'agentNotSaid' } },
      ] },
      yours: [], askedFor: null, notAskedFor: 0, reviewSent: true,
    }, t)
    expect(text).toContain('No comments were sent.')
    expect(text).toContain('waiting for the comments that stayed behind')
    expect(text).not.toContain('Nothing is left waiting')
  })
})
