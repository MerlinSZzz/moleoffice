// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BETWEEN-AGENTS LIST OFFERS NO CONVERSATION OF ONE AGENT WITH ITSELF (wave 13y round 128, item 67).
 *
 * An agent may write a message to itself. The list of conversations between agents paired its sender with every agent
 * it wrote to, the sender included, so such a message made a row whose two sides were one agent. The door to one pair
 * refuses that pair with 400, so the row could not be opened. Each side is named the way the list names a stored
 * participant, so a message stored under the agent's handle on one side and its id on the other is one agent too.
 *
 *   1. A message an agent wrote to itself makes no row; the agent's conversation with another agent is still listed.
 *   2. Stored under the agent's handle on one side and its id on the other, in either order, it makes no row either.
 *   3. Every row the list offers opens at the door to one pair.
 *   4. The door still refuses one agent named twice, as the same id twice or as its handle and its id.
 *
 * Round 129 (item 67, option (b)): a handle that a live agent and a retired agent both bear names nobody in the list's
 * reading, so the list kept that side as stored. The door reads the same handle as the live agent. So a message from the
 * live agent, stored under that handle, to its own id made a row of two sides that the door refused as one agent. The
 * list now reads a side it kept as stored with the door's own reader, `theAgentTheDoorToOnePairReads`.
 *
 *   5. That message makes no row, and every row the list offers opens at the door.
 *   6. A side the door's reader refuses with 409, a handle several retired agents bore and no live agent bears, stays
 *      as stored, and the list still answers with its row.
 *
 * Every agent and message here is made up, in a throwaway office. The handle forms are put in place by a direct write,
 * because the office stores a message's sender and addressees by registry id.
 *
 * MUTATIONS, after a control run: in `conversationsBetweenAgents` in src/server/lib/messages.ts, pair a sender with
 * itself again by removing the line that skips a pair of one participant. Cases 1, 2, 3 and 5 go red. Compare the two
 * sides as the list names them, without the door's reader, and case 5 goes red. Let the door's 409 out of the list, and
 * case 6 goes red.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

// The first case loads the server's modules cold. Once that took longer than vitest's default limit of 5 s
// for a case, and the case failed for that alone.
vi.setConfig({ testTimeout: 60_000 })

let t: TestDb
beforeEach(async () => { t = await freshDb(); twoAgents(t) })
afterEach(() => t?.close())

const lark = { kind: 'agent' as const, id: 'MadeUpLark01', handle: 'made-up-lark' }
const wren = { kind: 'agent' as const, id: 'MadeUpWren02', handle: 'made-up-wren' }
const AS_THE_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

/** Two live agents, each with an avatar of its own, written into the registry directly. */
function twoAgents(db: TestDb): void {
  const sqlite = db.client.sqlite
  const asset = sqlite.prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)')
  const agent = sqlite.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)')
  for (const one of [lark, wren]) {
    asset.run(`avatar-of-${one.id}`, 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
    agent.run(one.id, `Made-up ${one.handle}`, one.handle, `avatar-of-${one.id}`, '2026-01-01 00:00:00', 0)
  }
}

/** A retired agent bearing this handle, written into the registry directly. A handle is unique among live agents only. */
function aRetiredAgent(id: string, handle: string): void {
  const sqlite = t.client.sqlite
  sqlite.prepare('INSERT INTO assets (id, kind, origin, mime, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(`avatar-of-${id}`, 'avatar', 'default', 'image/svg+xml', '2026-01-01 00:00:00')
  sqlite.prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired, retired_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, `Made-up retired ${handle}`, handle, `avatar-of-${id}`, '2026-01-01 00:00:00', 1, '2026-01-02 00:00:00')
}

let serial = 0
/** A message written through the office by one agent to the agents named. */
function aMessage(from: { id: string }, to: readonly { kind: 'agent'; id: string }[]): string {
  serial += 1
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: `Made-up message ${serial}`,
    data: { body: `Made-up words ${serial}.`, to: to.map(one => ({ kind: one.kind, id: one.id })) },
    actor: { type: 'agent', id: from.id },
  }).id
}

/** The message's sender or its addressees, and their delivery rows, rewritten from one agent id to another string. */
function storedUnder(messageId: string, which: 'sender' | 'addressees', from: string, to: string): void {
  const sqlite = t.client.sqlite
  const row = sqlite.prepare('SELECT data FROM records WHERE id = ?').get(messageId) as { data: string }
  const data = JSON.parse(row.data) as { sentBy?: { kind: string; id: string }; to?: { kind: string; id: string }[] }
  if (which === 'sender') {
    expect(data.sentBy).toEqual({ kind: 'agent', id: from })
    data.sentBy = { kind: 'agent', id: to }
  } else {
    expect(data.to).toContainEqual({ kind: 'agent', id: from })
    data.to = (data.to ?? []).map(one => (one.kind === 'agent' && one.id === from ? { kind: 'agent', id: to } : one))
    sqlite.prepare("UPDATE message_delivery SET recipient_id = ? WHERE message_id = ? AND recipient_kind = 'agent' AND recipient_id = ?").run(to, messageId, from)
  }
  sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), messageId)
}

/** The list as the person's page reads it, each row as its two sides' ids, sorted. */
async function theListedPairs(app: Awaited<ReturnType<typeof apiApp>>['app']): Promise<string[][]> {
  const reply = await app.inject({ method: 'GET', url: '/api/messages/between-agents', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  const said = reply.json() as { conversations: { between: { kind: string; id: string }[] }[] }
  return said.conversations.map(one => one.between.map(side => side.id).sort())
}

async function withTheApp(act: (app: Awaited<ReturnType<typeof apiApp>>['app']) => Promise<void>): Promise<void> {
  const app = (await apiApp()).app
  try {
    await act(app)
  } finally {
    await app.close()
  }
}

describe('the between-agents list and one agent with itself', () => {
  it('leaves out a message an agent wrote to itself, and keeps its conversation with another agent', async () => {
    aMessage(lark, [lark])
    aMessage(lark, [wren])
    await withTheApp(async (app) => {
      expect(await theListedPairs(app)).toEqual([[lark.id, wren.id].sort()])
    })
  })

  it('leaves it out when one side is stored under the handle and the other under the id, in either order', async () => {
    aMessage(lark, [wren])
    storedUnder(aMessage(lark, [lark]), 'addressees', lark.id, lark.handle)
    storedUnder(aMessage(wren, [wren]), 'sender', wren.id, wren.handle)
    await withTheApp(async (app) => {
      expect(await theListedPairs(app)).toEqual([[lark.id, wren.id].sort()])
    })
  })

  it('offers only rows the door to one pair opens', async () => {
    aMessage(lark, [lark])
    aMessage(wren, [lark])
    storedUnder(aMessage(wren, [wren]), 'addressees', wren.id, wren.handle)
    const { pairKey } = await import('../src/server/lib/messages.ts')
    await withTheApp(async (app) => {
      const pairs = await theListedPairs(app)
      expect(pairs).toHaveLength(1)
      for (const [a, b] of pairs) {
        const url = `/api/messages/between/${encodeURIComponent(pairKey({ kind: 'agent', id: a! }, { kind: 'agent', id: b! }))}`
        const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
        expect(reply.statusCode, `${url}: ${reply.body}`).toBe(200)
      }
    })
  })

  it('still refuses one agent named twice at the door, by its id twice or by its handle and its id', async () => {
    aMessage(lark, [lark])
    const { PAIR_SEPARATOR } = await import('../src/server/lib/messages.ts')
    await withTheApp(async (app) => {
      for (const pair of [[lark.id, lark.id], [lark.handle, lark.id], [lark.id, lark.handle]]) {
        const url = `/api/messages/between/${encodeURIComponent(pair.join(PAIR_SEPARATOR))}`
        const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
        expect(reply.statusCode, `${url}: ${reply.body}`).toBe(400)
      }
    })
  })

  it('leaves out a message stored under a handle a live agent and a retired agent both bear, to the live agent itself', async () => {
    aRetiredAgent('MadeUpOldLark03', lark.handle)
    aMessage(lark, [wren])
    storedUnder(aMessage(lark, [lark]), 'sender', lark.id, lark.handle)
    const { pairKey } = await import('../src/server/lib/messages.ts')
    await withTheApp(async (app) => {
      const pairs = await theListedPairs(app)
      expect(pairs).toEqual([[lark.id, wren.id].sort()])
      for (const [a, b] of pairs) {
        const url = `/api/messages/between/${encodeURIComponent(pairKey({ kind: 'agent', id: a! }, { kind: 'agent', id: b! }))}`
        const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
        expect(reply.statusCode, `${url}: ${reply.body}`).toBe(200)
      }
    })
  })

  it('keeps a side as stored where the door refuses its handle with 409, and still answers with its row', async () => {
    const gone = 'made-up-gone'
    aRetiredAgent('MadeUpGone04', gone)
    aRetiredAgent('MadeUpGone05', gone)
    storedUnder(aMessage(wren, [lark]), 'sender', wren.id, gone)
    await withTheApp(async (app) => {
      expect(await theListedPairs(app)).toEqual([[lark.id, gone].sort()])
    })
  })
})
