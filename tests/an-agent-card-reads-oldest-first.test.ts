// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S COMMENT CARD DRAWS THE EXCHANGE OLDEST FIRST, WHATEVER ORDER THE ROUTE HANDS IT OVER.
 *
 * Problem BGkju6GHRqzX. `whatAgentsSaidOn` in src/web/components/agent/AgentSaidHere.tsx says its
 * list is "oldest first", and it drew the rows in the order it was given. The route it is given
 * them by, GET /api/messages/comments, answers newest first (`commentRecordsIn` in
 * src/server/lib/messages.ts sorts by updatedAt, newest first). So a card holding two turns drew
 * the second above the first, and the rule "the first thing said decides whether there is a card"
 * read the NEWEST thing said.
 *
 * The feature is that the person answers and the agent carries on. That
 * is an exchange, and an exchange is read from the top down. The problem offered three ways; the one
 * built is its first: the card sorts by when each thing was written, so the route's order cannot
 * change what a card shows. The second would leave the card trusting the route, which is the same
 * fact in two places. The third would draw it newest first on purpose, against what the feature is for.
 *
 * A STAMP IS KEPT TO THE SECOND, so a remark and the person's answer to it are often written in the
 * same second. The card broke that tie by id, which is random, and when the answer's id sorted first
 * the answer was "the first thing said" and the place got no card (wave 13y round 29). The comments
 * door now says each comment's place in the order the office keeps for every conversation: the
 * time, then the order the rows were stored in (`writtenOrder`). The card reads that place.
 *
 * Every row here is made up by this test and handed to the function directly. Nothing is stored.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { CommentOnThePage } from '../src/web/api.ts'

type Said = typeof import('../src/web/components/agent/AgentSaidHere.tsx')
let said: Said

beforeAll(async () => {
  // src/web/api.ts reads the browser's storage when it is first imported, so a stand-in is put in
  // place before the component module, which imports it, is loaded.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  said = await import('../src/web/components/agent/AgentSaidHere.tsx')
})

const RECORD = 'made-up-record'
const BLOCK = { kind: 'region', recordId: RECORD, regionId: 'data.blocks[#b-1]' }

/** One made-up message about the same block, sent by `who` at `at`, the `writtenOrder`th comment written. */
function remark(id: string, at: string, who: { kind: 'agent' | 'person'; id: string }, body: string, writtenOrder: number): CommentOnThePage {
  return {
    id,
    kind: 'message',
    title: body,
    createdAt: at,
    updatedAt: at,
    writtenOrder,
    data: { body, target: { target: BLOCK }, sentBy: who },
  } as unknown as CommentOnThePage
}

const AGENT = { kind: 'agent', id: 'made-up-agent' } as const
const PERSON = { kind: 'person', id: 'made-up-person' } as const

describe('the card beside a block an agent spoke on', () => {
  it('draws two turns of the agent in the order they were written, given newest first', () => {
    const newestFirst = [
      remark('m-2', '2026-09-30T10:00:02.000', AGENT, 'The second turn.', 2),
      remark('m-1', '2026-09-30T10:00:01.000', AGENT, 'The first turn.', 1),
    ]
    const cards = said.whatAgentsSaidOn(RECORD, newestFirst)
    expect(cards.length).toBe(1)
    expect(cards[0]?.said.map((one) => one.body), 'the card reads from the bottom up').toEqual([
      'The first turn.',
      'The second turn.',
    ])
    expect(cards[0]?.firstId, 'the card lights the newest remark instead of the first').toBe('m-1')
  })

  it("keeps the person's answer under the agent's remark, given newest first", () => {
    const newestFirst = [
      remark('m-2', '2026-09-30T10:00:02.000', PERSON, 'My answer.', 2),
      remark('m-1', '2026-09-30T10:00:01.000', AGENT, 'What I found.', 1),
    ]
    const cards = said.whatAgentsSaidOn(RECORD, newestFirst)
    expect(cards.map((one) => one.said.map((row) => row.body)), 'the answer was dropped from the card').toEqual([
      ['What I found.', 'My answer.'],
    ])
  })

  it('draws no card where the person spoke first, given newest first', () => {
    const newestFirst = [
      remark('m-2', '2026-09-30T10:00:02.000', AGENT, 'An answer to the person.', 2),
      remark('m-1', '2026-09-30T10:00:01.000', PERSON, 'A comment of my own.', 1),
    ]
    expect(said.whatAgentsSaidOn(RECORD, newestFirst), 'a card was drawn for a comment the person started').toEqual([])
  })

  it("keeps the person's answer under the agent's remark when both were written in the same second and the answer's id sorts first", () => {
    // The stamps are the same to the second, as the office keeps them. The answer's id sorts before
    // the remark's, so a tie broken by id makes the answer the first thing said.
    const newestFirst = [
      remark('A1madeUpAnsr', '2026-10-13 10:17:59', PERSON, 'My answer.', 2),
      remark('Z9madeUpRmrk', '2026-10-13 10:17:59', AGENT, 'What I found.', 1),
    ]
    const cards = said.whatAgentsSaidOn(RECORD, newestFirst)
    expect(cards.map((one) => one.said.map((row) => row.body)), 'no card, or the answer above the remark').toEqual([
      ['What I found.', 'My answer.'],
    ])
    expect(cards[0]?.firstId).toBe('Z9madeUpRmrk')
  })
})
