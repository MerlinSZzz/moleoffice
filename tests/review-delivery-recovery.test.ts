// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { sayTheSend } from '../src/shared/send-plan-words.ts'

const t = createI18n('en').t

describe('a review waiting for a recipient', () => {
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
