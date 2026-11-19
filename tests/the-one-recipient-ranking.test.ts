// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE RANKING OF AGENTS A COMMENT COULD GO TO, in its order, as item 5 of a decision says.
 * design/round-ten/design/review.md §5.4.
 *
 * The agent that started the review comes first, then the agent that filed the record, then the
 * agents that wrote to it. The composer preselects the first entry, and the review pane lists them in
 * this order, so a wrong order here would address a comment to the wrong agent on both screens.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import {
  AGENT_RECIPIENT_RUNGS,
  rankAgentRecipients,
  theAgentToPreselect,
  type AgentRecipientOnTheWire,
  type AgentRecipientReason,
} from '../src/shared/recipient-ranking.ts'
import { RECIPIENT_GROUNDS } from '../src/shared/types.ts'

const reason = (agentId: string, rung: AgentRecipientReason['rung'], support = 1, latest = '2026-09-30T10:00:00'): AgentRecipientReason => ({
  agentId,
  rung,
  support,
  latest,
})

describe('the order', () => {
  it('puts the review’s starter first, then who filed the record, then who wrote to it', () => {
    // Given in the opposite order, and with the writer holding more evidence, so only the rungs decide.
    const ranked = rankAgentRecipients([
      reason('writer', 'wrote-to-this-record', 9, '2026-09-30T12:00:00'),
      reason('filer', 'filed-this-record'),
      reason('starter', 'started-this-review'),
    ])
    expect(ranked.map((one) => [one.agentId, one.rung])).toEqual([
      ['starter', 'started-this-review'],
      ['filer', 'filed-this-record'],
      ['writer', 'wrote-to-this-record'],
    ])
  })

  it('is the existing run ranking with one rung above it, not a second order', () => {
    expect(AGENT_RECIPIENT_RUNGS).toEqual(['started-this-review', ...RECIPIENT_GROUNDS])
  })

  it('names each agent once, on its strongest rung, and keeps the weaker ones beside it', () => {
    const ranked = rankAgentRecipients([
      reason(THE_TEST_OFFICES_SECRETARY.handle, 'wrote-to-this-record', 3),
      reason(THE_TEST_OFFICES_SECRETARY.handle, 'filed-this-record'),
      reason('vela', 'wrote-to-this-record', 1),
    ])
    expect(ranked.map((one) => one.agentId)).toEqual([THE_TEST_OFFICES_SECRETARY.handle, 'vela'])
    expect(ranked[0]?.rung).toBe('filed-this-record')
    expect(ranked[0]?.alsoRungs).toEqual(['wrote-to-this-record'])
  })

  it('orders two writers by how much they wrote, then by the newer, then by id', () => {
    const ranked = rankAgentRecipients([
      reason('b-older', 'wrote-to-this-record', 2, '2026-09-01T00:00:00'),
      reason('c-more', 'wrote-to-this-record', 5, '2026-08-01T00:00:00'),
      reason('a-newer', 'wrote-to-this-record', 2, '2026-09-20T00:00:00'),
      reason('d-same', 'wrote-to-this-record', 2, '2026-09-01T00:00:00'),
    ])
    expect(ranked.map((one) => one.agentId)).toEqual(['c-more', 'a-newer', 'b-older', 'd-same'])
  })

  it('answers an empty ranking when nothing connects an agent', () => {
    expect(rankAgentRecipients([])).toEqual([])
  })
})

describe('what the composer chooses', () => {
  const onTheWire = (agentId: string, cannotReceive: string | null): AgentRecipientOnTheWire => ({
    ...reason(agentId, 'filed-this-record'),
    alsoRungs: [],
    cannotReceive,
  })

  it('chooses the first entry', () => {
    expect(theAgentToPreselect([onTheWire(THE_TEST_OFFICES_SECRETARY.handle, null), onTheWire('vela', null)])?.agentId).toBe(THE_TEST_OFFICES_SECRETARY.handle)
  })

  it('chooses nobody when the ranking is empty', () => {
    expect(theAgentToPreselect([])).toBeNull()
  })

  it('chooses nobody, rather than the second, when the first cannot be written to', () => {
    expect(theAgentToPreselect([onTheWire(THE_TEST_OFFICES_SECRETARY.handle, `${THE_TEST_OFFICES_SECRETARY.handle} is retired.`), onTheWire('vela', null)])).toBeNull()
  })
})
