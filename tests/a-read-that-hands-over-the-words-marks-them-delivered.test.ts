// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READ THAT HANDS AN AGENT ITS MESSAGES' WORDS MAY MARK THEM DELIVERED, IN THE SAME CALL (wave 13u round 24).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A worker read its messages at GET /api/messages?only=waiting-for-me and never marked them. Every delivery stayed
 * `queued`, and the dead-letter sweep counted those messages as never delivered, though their words had been read and
 * acted on. Measured on a throwaway office before the change: none of twelve reads moved a mark. The twelve were the
 * waiter's door, waiting-for-me with and without a page, `narrow` and `leads`, the whole pool, addressed-to-me-or-nobody,
 * one message, one record, the records of kind message, the conversation with the person and the agent inbox. After
 * each read the sweep still listed every letter.
 *
 * WHY THE MARK IS ASKED FOR, AND NOT MADE BY EVERY READ. The hook after a Claude Code step reads this same door for a
 * count alone, and the person's offers panel reads it too. A read that marked whatever it listed would mark messages
 * whose words reached nobody. The waiter, which looks only for `queued`, would then never hand them over, which is
 * what criterion M127 was written against. So `?markDelivered=1` is the reader's own say that this read hands it the
 * words. It moves only the page returned, only the reader's own rows, and only to `delivered`. `seen` is the
 * recipient's mark, one message at a time.
 *
 * THE LETTERS ARE MADE UP, written by the person while both readers are held, then set eight days back. Both holds are
 * released before their idle runs are filed, so the sweep reads them as unable to receive. The later letter is sent
 * while its reader is unheld.
 *
 * MUTATIONS, each after a green control, and restored after (logs named in the round's report): `handedOver` marking
 * nothing turns cases 2 and 3 red; the two refinements of the query taken out turns case 5 red; the answer keeping the
 * marks it had before the read turns case 2 red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

let reader = ''
let other = ''
/** Three letters to the reader alone, and one to the reader and the other agent. */
const toTheReader: string[] = []
let toBoth = ''

interface Entry {
  id: string
  body?: string
  deliveries: { to: { kind: string; id: string }; mark: string }[]
}
interface Answer {
  messages: Entry[]
  markedDelivered?: string[]
  error?: string
}

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, body?: object): Promise<{ status: number; json: Answer & Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(body === undefined ? {} : { payload: JSON.stringify(body) }) })
  return { status: reply.statusCode, json: reply.json() }
}

async function register(handle: string, by: Record<string, string>, role: string): Promise<string> {
  const said = await ask('POST', '/api/agents/started', by, { handle, name: handle, role })
  expect(said.status, JSON.stringify(said.json)).toBe(201)
  return String((said.json['agent'] as { id: string }).id)
}

async function letter(to: string[], n: number, held = false): Promise<string> {
  const sent = await ask('POST', '/api/records', AS_THE_PERSON, {
    kind: 'message', title: `Made-up letter ${String(n)}`,
    data: { body: `Made-up words of letter ${String(n)}.`, to: to.map((id) => ({ kind: 'agent', id })) },
  })
  // The setup letters have held readers; the later letter has an unheld reader and still answers with the conflict.
  expect(sent.status, JSON.stringify(sent.json)).toBe(held ? 201 : 409)
  const id = String((sent.json['record'] as { id: string }).id)
  const old = localStamp(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000))
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(old, id)
  t.client.sqlite.prepare('UPDATE message_delivery SET at = ? WHERE message_id = ?').run(old, id)
  return id
}

function markOf(messageId: string, agentId: string): string | undefined {
  const row = t.client.sqlite
    .prepare("SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_kind = 'agent' AND recipient_id = ?")
    .get(messageId, agentId) as { mark: string } | undefined
  return row?.mark
}

/** The letters of this file that the sweep reads as never delivered to the reader, in the order they were written. */
async function sweptForTheReader(): Promise<string[]> {
  const { deadLettersNow } = await import('../src/server/lib/deadletters.ts')
  const swept = new Set(deadLettersNow(new Date()).filter((one) => one.to.id === reader).map((one) => one.messageId))
  return [...toTheReader, toBoth].filter((id) => swept.has(id))
}

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const secretary = await register('made-up-secretary', AS_THE_PERSON, 'secretary')
  reader = await register('made-up-reader', asAgent(secretary), 'worker')
  other = await register('made-up-other', asAgent(secretary), 'worker')
  // THE OFFICE'S OWN NOTES ON REGISTERING are marked seen by each agent first, so each list holds this file's letters.
  for (const id of [reader, other]) {
    const notes = await ask('GET', '/api/messages?only=waiting-for-me&limit=25', asAgent(id))
    for (const one of notes.json.messages) {
      const marked = await ask('POST', `/api/messages/${one.id}/mark`, asAgent(id), { mark: 'seen' })
      expect(marked.status, JSON.stringify(marked.json)).toBe(200)
    }
  }
  const readers = [[reader, 'made-up-reader'], [other, 'made-up-other']] as const
  const { registerResource } = await import('../src/server/lib/resources.ts')
  const holds: { handle: string; session: string }[] = []
  for (const [, handle] of readers) {
    const session = t.api.createRecord({ kind: 'session', title: 'A synthetic holder', workspaceId: 'default', actor: t.api.HUMAN,
      data: { state: 'running', runtime: 'claude-code' } }).id
    registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(process.pid), actor: t.api.HUMAN })
    const held = await ask('POST', `/api/handles/${encodeURIComponent(handle)}/hold`, AS_THE_PERSON,
      { session, machine: 'a-synthetic-machine', runtime: 'claude-code' })
    expect(held.status, JSON.stringify(held.json)).toBe(201)
    holds.push({ handle, session })
  }
  for (let n = 0; n < 3; n++) toTheReader.push(await letter([reader], n, true))
  toBoth = await letter([reader, other], 3, true)
  for (const { handle, session } of holds) {
    const released = await ask('POST', `/api/handles/${encodeURIComponent(handle)}/release`, AS_THE_PERSON,
      { session, because: 'The synthetic letters are filed.' })
    expect(released.status, JSON.stringify(released.json)).toBe(200)
  }
  for (const [id, handle] of readers) {
    t.api.createRecord({
      workspaceId: 'default', kind: 'session', title: `Made-up run of ${handle}`,
      data: { state: 'idle', servingAgentId: id, servingAgent: handle, lastOutputAt: '2020-01-01 00:00:00' },
      actor: { type: 'agent', id },
    })
  }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  vi.unstubAllEnvs()
})

describe('a read that hands over the words', () => {
  it('1. a plain read hands over the words and marks nothing, so the sweep still counts every letter', async () => {
    expect(await sweptForTheReader()).toEqual([...toTheReader, toBoth])
    for (const url of ['/api/messages?only=waiting-for-me', '/api/messages?only=waiting-for-me&limit=25', '/api/messages?only=waiting-for-me&narrow=1']) {
      const read = await ask('GET', url, asAgent(reader))
      expect(read.status, JSON.stringify(read.json)).toBe(200)
      expect(read.json.markedDelivered, url).toBeUndefined()
    }
    for (const id of [...toTheReader, toBoth]) expect(markOf(id, reader)).toBe('queued')
    expect(await sweptForTheReader()).toEqual([...toTheReader, toBoth])
  })

  it('2. ?markDelivered=1 marks delivered only the page it hands over; a letter nobody was handed is still swept', async () => {
    const all = await ask('GET', '/api/messages?only=waiting-for-me&limit=25', asAgent(reader))
    const order = all.json.messages.map((one) => one.id)
    const first = order[0]!
    const page = await ask('GET', '/api/messages?only=waiting-for-me&limit=1&markDelivered=1', asAgent(reader))
    expect(page.status, JSON.stringify(page.json)).toBe(200)
    expect(page.json.messages.map((one) => one.id)).toEqual([first])
    expect(page.json.messages[0]!.body, 'the words were handed over').toMatch(/^Made-up words of letter \d\.$/)
    expect(page.json.markedDelivered).toEqual([first])
    // THE ANSWER SHOWS THE MARK AS IT IS NOW, and the store holds the same: delivered, not seen.
    expect(page.json.messages[0]!.deliveries.find((d) => d.to.id === reader)?.mark).toBe('delivered')
    expect(markOf(first, reader)).toBe('delivered')
    for (const id of order.slice(1)) expect(markOf(id, reader), 'a letter not on the page').toBe('queued')
    // THE SWEEP no longer counts the one handed over, and still counts every one nobody was handed.
    const swept = await sweptForTheReader()
    expect(swept).not.toContain(first)
    expect(swept).toEqual([...toTheReader, toBoth].filter((id) => id !== first))
    // DELIVERED IS NOT SEEN: the letter is still waiting for the reader, so it is still listed.
    const again = await ask('GET', '/api/messages?only=waiting-for-me&limit=25', asAgent(reader))
    expect(again.json.messages.map((one) => one.id)).toContain(first)
  })

  it('3. only the reader’s own row moves, and a second read moves nothing more', async () => {
    const stillQueued = [...toTheReader, toBoth].filter((id) => markOf(id, reader) === 'queued')
    expect(stillQueued.length).toBe(3)
    const read = await ask('GET', '/api/messages?only=waiting-for-me&markDelivered=1', asAgent(reader))
    expect(read.status, JSON.stringify(read.json)).toBe(200)
    expect(new Set(read.json.markedDelivered), 'only the rows still queued move').toEqual(new Set(stillQueued))
    for (const id of [...toTheReader, toBoth]) expect(markOf(id, reader)).toBe('delivered')
    expect(markOf(toBoth, other), 'the other recipient was handed nothing').toBe('queued')
    expect(await sweptForTheReader()).toEqual([])
    const twice = await ask('GET', '/api/messages?only=waiting-for-me&markDelivered=1', asAgent(reader))
    expect(twice.json.markedDelivered).toEqual([])
    expect(twice.json.messages.length).toBe(4)
  })

  it('4. the other recipient’s plain read leaves its own row queued', async () => {
    const read = await ask('GET', '/api/messages?only=waiting-for-me', asAgent(other))
    expect(read.json.messages.map((one) => one.id)).toEqual([toBoth])
    expect(markOf(toBoth, other)).toBe('queued')
  })

  it('5. the mark is refused where no words are handed over, and nothing is read or marked', async () => {
    const fresh = await letter([other], 4)
    for (const url of [
      '/api/messages?markDelivered=1',
      '/api/messages?only=addressed-to-me-or-nobody&markDelivered=1',
      '/api/messages?only=waiting-for-me&narrow=1&markDelivered=1',
      '/api/messages?only=waiting-for-me&markDelivered=yes',
    ]) {
      const refused = await ask('GET', url, asAgent(other))
      expect(refused.status, `${url}: ${JSON.stringify(refused.json)}`).toBe(400)
      expect(String(refused.json.error), url).toContain('markDelivered')
    }
    expect(markOf(fresh, other)).toBe('queued')
    expect(markOf(toBoth, other)).toBe('queued')
  })
})
