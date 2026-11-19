// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * "MARK BROKEN" IS OFFERED ONLY ON AN AGENT'S REPLY TO THE PERSON'S MARKED MESSAGE.
 *
 * The server does not work out which message a reply answers (src/server/lib/intent-mark-broken.ts): the page does, by
 * `theMarkedMessageItAnswers` in src/web/components/Chat.tsx. It is the person's last message above the agent's reply,
 * and only when that message carries a mark that asks something and was given to that agent. These are its cases; the
 * browser test the-mark-beside-send-goes-with-the-message.test.ts proves the press on the page.
 *
 * Each case was proved by mutation after a control run; the runs are in the commit that added this file.
 */

import { describe, expect, it } from 'vitest'
import { theMarkedMessageItAnswers } from '../src/web/components/Chat.tsx'
import type { PoolEntry } from '../src/web/api.ts'

type One = Pick<PoolEntry, 'id' | 'sentBy' | 'intent' | 'deliveries'>

const PERSON = { kind: 'person' as const, id: 'the-person' }
const ROWAN = { kind: 'agent' as const, id: 'rowan' }
const PIKE = { kind: 'agent' as const, id: 'pike' }

function fromThePerson(id: string, intent: One['intent'], to = ROWAN): One {
  return { id, sentBy: PERSON, ...(intent === undefined ? {} : { intent }), deliveries: [{ to } as One['deliveries'][number]] }
}

function fromAgent(id: string, agent = ROWAN): One {
  return { id, sentBy: agent, deliveries: [{ to: PERSON } as One['deliveries'][number]] }
}

describe('theMarkedMessageItAnswers', () => {
  it('names the marked message an agent\'s reply stands under, with its mark', () => {
    expect(theMarkedMessageItAnswers([fromThePerson('m', 'proposal-first'), fromAgent('r')], 1)).toEqual({
      id: 'm',
      intent: 'proposal-first',
    })
    expect(theMarkedMessageItAnswers([fromThePerson('m', 'just-ask'), fromAgent('r1'), fromAgent('r2')], 2)).toEqual({
      id: 'm',
      intent: 'just-ask',
    })
  })

  it('names nothing under a message marked none or carrying no mark', () => {
    expect(theMarkedMessageItAnswers([fromThePerson('m', 'none'), fromAgent('r')], 1)).toBeNull()
    expect(theMarkedMessageItAnswers([fromThePerson('m', undefined), fromAgent('r')], 1)).toBeNull()
  })

  it('names nothing when a later unmarked message of the person stands between', () => {
    expect(theMarkedMessageItAnswers([fromThePerson('m', 'just-ask'), fromThePerson('p', 'none'), fromAgent('r')], 2)).toBeNull()
  })

  it('names nothing for the person\'s own message, or for an agent the marked message was not given to', () => {
    expect(theMarkedMessageItAnswers([fromThePerson('m', 'just-ask'), fromThePerson('p', 'just-ask')], 1)).toBeNull()
    expect(theMarkedMessageItAnswers([fromThePerson('m', 'just-ask', PIKE), fromAgent('r', ROWAN)], 1)).toBeNull()
  })

  it('names nothing for a reply with no message of the person above it', () => {
    expect(theMarkedMessageItAnswers([fromAgent('r')], 0)).toBeNull()
    expect(theMarkedMessageItAnswers([fromAgent('r')], 5)).toBeNull()
  })
})
