// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVENTS CARRY THE CHANGE, AND PRESENCE IS ANNOUNCED ONLY WHEN WHAT A PAGE DRAWS CHANGED.
 *
 * This follows option 1 of the decision of 26 September 2026, and block b-8 of
 * report VQw5RwL8gbCb. Measured against a real listener with real streams,
 * because what is proved is what a page is sent:
 *
 *   1. `message.new` carries the message exactly as a read of the open conversation reports it, and
 *      which conversation it is in;
 *   2. `delivery.changed` carries the new delivery row;
 *   3. a second page opening for somebody who already has one open announces nothing (on main it
 *      announced `presence.changed` every time a stream opened or closed, and on the person's office 90 of 95
 *      of those said the same green as before);
 *   4. when what a page draws of somebody's presence does change, each person's page is sent the
 *      reading as `GET /api/presence/:kind/:id` gives it to that person;
 *   5. the stream says which run of the server it is from, and a page naming another run is sent
 *      nothing from memory, because the ids it remembers belong to that other run.
 *
 * WHAT MAKES IT RED: `lists: whatANewMessageChanges(...)` taken off the create door in
 * src/server/lib/records.ts (case 1); `rows:` taken off `markDelivery` (case 2); `theFirstOfTheirs`
 * dropped from the stream route so every page announces (case 3); the reading left off by the
 * `announce` in `presenceMayHaveChanged` (case 4); the run line or the `fromAnotherRun` check removed
 * (case 5).
 */

import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { readTheRunLine, type ChannelEvent } from '../src/shared/events.ts'
import { localStamp } from '../src/shared/time.ts'

const OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AGENT = { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'carrier-x' }

let t: TestDb
let app: FastifyInstance
let at = ''
let agentId = ''

/** One stream, read into a list of blocks as they arrive. */
interface Stream {
  blocks: string[]
  events: () => { id: number; event: ChannelEvent }[]
  close: () => void
}

async function openStream(headers: Record<string, string>, query = '', extra: Record<string, string> = {}): Promise<Stream> {
  const stop = new AbortController()
  const res = await fetch(`${at}/api/events${query}`, { headers: { ...headers, accept: 'text/event-stream', ...extra }, signal: stop.signal })
  const blocks: string[] = []
  const reader = (res.body as ReadableStream<Uint8Array>).getReader()
  const decoder = new TextDecoder()
  let counted = false
  void (async () => {
    let kept = ''
    for (;;) {
      const next = await reader.read().catch(() => ({ done: true, value: undefined }))
      if (next.done === true) return
      kept += decoder.decode(next.value, { stream: true })
      let cut = kept.indexOf('\n\n')
      while (cut !== -1) {
        const block = kept.slice(0, cut)
        kept = kept.slice(cut + 2)
        cut = kept.indexOf('\n\n')
        if (block === ': counted') counted = true
        blocks.push(block)
      }
    }
  })()
  const until = Date.now() + 10_000
  while (!counted && Date.now() < until) await new Promise((r) => setTimeout(r, 20))
  expect(counted, 'the stream never said it was counted').toBe(true)
  return {
    blocks,
    events: () =>
      blocks
        .filter((one) => one.includes('\ndata: '))
        .map((one) => ({ id: Number(/^id: (\d+)/m.exec(one)?.[1] ?? 0), event: JSON.parse(/^data: (.+)$/m.exec(one)?.[1] ?? 'null') as ChannelEvent })),
    close: () => stop.abort(),
  }
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 300))
}

async function state(): Promise<{ lastId: number; run: string }> {
  return (await (await fetch(`${at}/api/events/state`, { headers: OWNER })).json()) as { lastId: number; run: string }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  at = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const filed = await fetch(`${at}/api/records`, {
    method: 'POST',
    headers: OWNER,
    body: JSON.stringify({ kind: 'agent', title: 'Carrier X', data: { handle: 'carrier-x', runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.text()).toBe(201)
  const registry = (await (await fetch(`${at}/api/participants`, { headers: OWNER })).json()) as { agents: { id: string; handle: string }[] }
  agentId = registry.agents.find((one) => one.handle === 'carrier-x')?.id ?? ''
  expect(agentId).not.toBe('')
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('what an event carries', () => {
  it('carries a new message as the conversation reads it, and the delivery row a mark moved', async () => {
    const page = await openStream(OWNER)
    const res = await fetch(`${at}/api/records`, {
      method: 'POST',
      headers: AGENT,
      body: JSON.stringify({ kind: 'message', title: 'hello', data: { body: 'Hello from the carrier.', to: [{ kind: 'person', id: THE_PERSON }] } }),
    })
    expect(res.status, await res.clone().text()).toBe(201)
    const id = ((await res.json()) as { record: { id: string } }).record.id
    await settle()
    const said = page.events().find((one) => one.event.name === 'message.new' && one.event.messageId === id)?.event
    expect(said?.name).toBe('message.new')
    if (said?.name !== 'message.new') return
    expect(said.lists, 'message.new carried nothing a page could apply').toBeTruthy()
    // THE CONVERSATION'S OWN READ OF THE SAME MESSAGE, before the read marks it delivered.
    const lists = said.lists as NonNullable<typeof said.lists>
    expect(lists.pairs).toEqual([[{ kind: 'agent', id: agentId }, { kind: 'person', id: THE_PERSON }]])
    expect(lists.counts).toEqual([{ who: { kind: 'person', id: THE_PERSON }, unread: 1, anythingUnread: true }])
    expect(lists.forTheReader?.reader, 'the part for this reader was not added for a person’s page').toEqual({ kind: 'person', id: THE_PERSON })
    const talk = (await (await fetch(`${at}/api/messages/conversation?kind=agent&id=${agentId}`, { headers: OWNER })).json()) as {
      messages: { id: string; deliveries: { mark: string }[] }[]
    }
    const read = talk.messages.find((one) => one.id === id)
    // The read has just marked it delivered, which is the one field the message had different then.
    expect({ ...lists.entry, deliveries: [] }).toEqual({ ...read, deliveries: [] })

    // AND THE MARK THAT READ MOVED CARRIES ITS ROW.
    await settle()
    const moved = page.events().find((one) => one.event.name === 'delivery.changed' && one.event.messageIds.includes(id))?.event
    expect(moved?.name).toBe('delivery.changed')
    if (moved?.name !== 'delivery.changed') return
    expect(moved.rows?.map((one) => [one.messageId, one.row.to, one.row.mark])).toEqual([[id, { kind: 'person', id: THE_PERSON }, 'delivered']])
    page.close()
  }, 60_000)
})

describe('presence, told only when what a page draws changed', () => {
  it('announces nothing when a second page opens for somebody who has one open, and sends each person the reading when it changes', async () => {
    const first = await openStream(OWNER)
    await settle()
    const before = (await state()).lastId
    const second = await openStream(OWNER)
    await settle()
    expect((await state()).lastId, 'a second page of the same person announced something').toBe(before)
    second.close()
    await settle()
    expect((await state()).lastId, 'closing one of two pages announced something').toBe(before)

    // WHAT A PAGE DRAWS CHANGES: the person chooses to be away. The server's once-a-minute look is
    // asked for directly rather than waited for.
    const { setParticipantPresence } = await import('../src/server/lib/participants.ts')
    const { presenceMayHaveChanged } = await import('../src/server/api/events.ts')
    setParticipantPresence({ kind: 'person', id: THE_PERSON }, 'offline', { kind: 'person', id: THE_PERSON })
    expect(presenceMayHaveChanged('everybody')).toBeGreaterThan(0)
    await settle()
    const told = first.events().filter((one) => one.event.name === 'presence.changed')
    const aboutThem = told.find((one) => one.event.name === 'presence.changed' && one.event.who.id === THE_PERSON)?.event
    expect(aboutThem?.name).toBe('presence.changed')
    if (aboutThem?.name !== 'presence.changed') return
    const door = (await (await fetch(`${at}/api/presence/person/${THE_PERSON}`, { headers: OWNER })).json()) as {
      presence: Record<string, unknown>
    }
    const { says: _a, ...carried } = aboutThem.reading ?? {}
    const { says: _b, ...fromTheDoor } = door.presence
    void _a
    void _b
    expect(carried, 'the reading the page was sent is not the one the door gives this reader').toEqual(fromTheDoor)
    expect(presenceMayHaveChanged('everybody'), 'nothing changed, and something was announced').toBe(0)
    setParticipantPresence({ kind: 'person', id: THE_PERSON }, '', { kind: 'person', id: THE_PERSON })
    first.close()
  }, 60_000)
})

describe('the reading a stream carries is the door\u2019s', () => {
  it('gives, for every participant, the reading GET /api/presence gives the same reader in the same project', async () => {
    // A RUN GOING FOR THE CARRIER AGENT, with this test's own process as its live process row, makes
    // the agent green, so a green reading is compared too. Since 27 September 2026 recent output alone
    // no longer makes an agent green (problem h1S1MLK-SQ1I); a run going does.
    const run = await fetch(`${at}/api/records`, {
      method: 'POST',
      headers: { ...OWNER, ...thePersonsKeyHeader() },
      body: JSON.stringify({
        kind: 'session',
        title: 'a run serving carrier-x',
        data: { state: 'running', runtime: 'claude-code', servingAgent: agentId, ranAs: [{ workspaceId: 'default', agentId }], lastOutputAt: localStamp(new Date()) },
      }),
    })
    expect(run.status, await run.clone().text()).toBe(201)
    const runId = ((await run.json()) as { record: { id: string } }).record.id
    const row = await fetch(`${at}/api/resources`, {
      method: 'POST',
      headers: OWNER,
      body: JSON.stringify({ type: 'process', key: String(process.pid), sessionRecordId: runId, detail: 'this test process, as the run of carrier-x', adopting: 'this test process started before the session the test filed for it' }),
    })
    expect(row.status, await row.clone().text()).toBe(201)
    const { participantPresence, everybodysPresence } = await import('../src/server/lib/presence.ts')
    const door = (await (await fetch(`${at}/api/presence`, { headers: OWNER })).json()) as { presence: ({ who: { kind: 'person' | 'agent'; id: string } } & Record<string, unknown>)[] }
    const withoutSeconds = (reading: Record<string, unknown>): Record<string, unknown> => {
      const { says: _says, ...rest } = reading
      void _says
      return rest
    }
    const reader = { kind: 'person' as const, id: THE_PERSON }
    expect(door.presence.some((one) => one.who.id === agentId && one['colour'] === 'green'), 'the fixture: a green agent').toBe(true)
    // THE TWO WAYS THE STREAM WORKS A READING OUT: one participant at a time when a page opens or
    // closes, and everybody at once in the minute look (`presenceMayHaveChanged` in src/server/api/events.ts).
    const everybody = everybodysPresence('default', new Date(), reader)
    for (const one of door.presence) {
      const single = participantPresence(one.who, 'default', new Date(), reader)
      expect(withoutSeconds(JSON.parse(JSON.stringify(single))), `one at a time, ${one.who.id}`).toEqual(withoutSeconds(one))
      const inTheLook = everybody.find((x) => x.who.kind === one.who.kind && x.who.id === one.who.id)
      expect(withoutSeconds(JSON.parse(JSON.stringify(inTheLook))), `in the minute look, ${one.who.id}`).toEqual(withoutSeconds(one))
    }
  }, 60_000)
})

describe('which run of the server a stream is from', () => {
  it('says the run and the newest id, and sends nothing from memory to a page naming another run', async () => {
    const page = await openStream(OWNER)
    const line = page.blocks.map(readTheRunLine).find((one) => one !== null)
    const now = await state()
    expect(line?.run, 'the stream did not say which run it is').toBe(now.run)
    expect(line?.at).toBeLessThanOrEqual(now.lastId)
    page.close()
    expect(now.lastId, 'there are events to remember').toBeGreaterThan(1)
    const sameRun = await openStream(OWNER, `?run=${now.run}`, { 'last-event-id': '1' })
    expect(sameRun.events().length, 'the same run sent nothing from memory').toBeGreaterThan(0)
    sameRun.close()
    const otherRun = await openStream(OWNER, '?run=another-run', { 'last-event-id': '1' })
    expect(otherRun.events(), 'a page naming another run was sent events from this run’s memory').toEqual([])
    otherRun.close()
  }, 60_000)
})
