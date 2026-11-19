// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A KEY AND A HEADER THAT NAME TWO AGENTS ARE REFUSED, ON EVERY DOOR. Criterion P83 point 5, closed by
 * A request whose key proves agent A while
 * its header names agent B is refused, and the refusal names both. The secretary's message F4KyroEu2Pp3 adds
 * an agent's key under the person's header; message tP7jF3nErGyY keeps the office's key under an
 * agent's name working.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE DOORS
 * ---------------------------------------------------------------------------------------
 *
 * The rule is "every door the key reaches", so it is one hook and not a line in `actorFrom`. The
 * doors below are chosen to show that: a write that calls `actorFrom`; `GET /api/kinds`, whose route
 * file never calls it; a handle door; the events stream; and the conversation door, which is a read
 * that marks the person's messages delivered when the caller is the person.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A REAL SOCKET
 * ---------------------------------------------------------------------------------------
 *
 * The rule is about what a caller proves on the wire, so this listens and drives it with `fetch`, as
 * tests/the-row-says-who-the-key-proved.test.ts does. Every key here is made up or minted by this
 * test's own server, and none is printed.
 */

import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')

let t: TestDb
let app: FastifyInstance
let door = ''
/** Agent A. Its key is minted by this test's own registration door. */
let quillKey = ''
let quillId = ''
/** Agent B. Its key is minted the same way and used only to send it a message as itself. */
let wrenKey = ''

const AS = (key: string, type: string, id: string): Record<string, string> => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
  'x-mole-office-key': key,
})

async function ask(
  path: string,
  method: 'POST' | 'GET',
  headers: Record<string, string>,
  body?: unknown,
): Promise<{ status: number; said: Record<string, unknown> }> {
  const res = await fetch(`${door}${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  let said: Record<string, unknown> = {}
  try {
    said = JSON.parse(text) as Record<string, unknown>
  } catch {
    said = { text }
  }
  return { status: res.status, said }
}

async function register(handle: string, name: string): Promise<{ key: string; id: string }> {
  const said = await ask(
    '/api/agents/started',
    'POST',
    { 'x-mole-office-workspace': 'default', 'x-mole-office-key': A_MADE_UP_PERSON_KEY },
    { handle, name, role: 'worker', runtime: 'dsh' },
  )
  expect(said.status, JSON.stringify(said.said)).toBe(201)
  const key = String((said.said['whatToGiveIt'] as { key?: string } | undefined)?.key ?? '')
  const id = String((said.said['agent'] as { id?: string } | undefined)?.id ?? '')
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  expect(id, 'the registration answered no registry id').not.toBe('')
  return { key, id }
}

function recordsTitled(title: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM records WHERE title = ?').get(title) as { n: number }).n
}

function changeOn(recordId: string): { type: string; id: string; proved: unknown } | undefined {
  const row = t.client.sqlite
    .prepare(
      'SELECT actor_type AS type, actor_id AS id, proved_holder AS proved FROM changes ' +
        'WHERE record_id = ? ORDER BY rowid DESC LIMIT 1',
    )
    .get(recordId) as { type: string; id: string; proved: string | null } | undefined
  if (row === undefined) return undefined
  return { type: row.type, id: row.id, proved: row.proved === null ? null : JSON.parse(row.proved) }
}

const NOTE = (title: string): Record<string, unknown> => ({ kind: 'note', title, data: { body: `For "${title}".` } })

/** The refusal names Quill by its name and handle, and Wren the same way. */
function expectItNamesBoth(said: Record<string, unknown>): void {
  const error = String(said['error'] ?? '')
  expect(error).toContain('This request carries the key of Quill ("quill") and its header names Wren ("wren").')
  expect(error).toContain('Nothing was done.')
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  door = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const quill = await register('quill', 'Quill')
  quillKey = quill.key
  quillId = quill.id
  wrenKey = (await register('wren', 'Wren')).key
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('agent A’s key with agent B’s name is refused on every door, naming both', () => {
  it('a write: refused, and nothing was written', async () => {
    const said = await ask('/api/records', 'POST', AS(quillKey, 'agent', 'wren'), NOTE('quill as wren'))
    expect(said.status, JSON.stringify(said.said)).toBe(403)
    expectItNamesBoth(said.said)
    expect(recordsTitled('quill as wren')).toBe(0)
  })

  it('a plain read whose route file never asks who is calling (GET /api/kinds)', async () => {
    const control = await ask('/api/kinds', 'GET', AS(quillKey, 'agent', 'quill'))
    expect(control.status).toBe(200)
    const said = await ask('/api/kinds', 'GET', AS(quillKey, 'agent', 'wren'))
    expect(said.status, JSON.stringify(said.said)).toBe(403)
    expectItNamesBoth(said.said)
  })

  it('a handle door (GET /api/handles/wren/waiting)', async () => {
    const said = await ask('/api/handles/wren/waiting', 'GET', AS(quillKey, 'agent', 'wren'))
    expect(said.status, JSON.stringify(said.said)).toBe(403)
    expectItNamesBoth(said.said)
  })

  it('the events stream', async () => {
    const said = await ask('/api/events', 'GET', AS(quillKey, 'agent', 'wren'))
    expect(said.status, JSON.stringify(said.said)).toBe(403)
    expectItNamesBoth(said.said)
  })
})

describe('agent A’s key with the person’s header is refused, naming A and the person', () => {
  it('a write is refused and nothing was written', async () => {
    const said = await ask('/api/records', 'POST', AS(quillKey, 'human', THE_PERSON), NOTE('quill as the person'))
    expect(said.status, JSON.stringify(said.said)).toBe(403)
    const error = String(said.said['error'] ?? '')
    expect(error).toContain('This request carries the key of Quill ("quill") and its header names the person')
    expect(error).toContain('Nothing was done.')
    expect(recordsTitled('quill as the person')).toBe(0)
  })

  /**
   * THE CONVERSATION DOOR MARKS THE PERSON'S MESSAGES DELIVERED WHEN THE PERSON READS. So an agent's
   * key under the person's header used to move the person's delivery marks on a GET. The last step
   * reads it with the person's own key, to show the mark really does move on this door.
   */
  it('a read with a side effect (GET /api/messages/conversation) moves nothing', async () => {
    const sent = await ask('/api/records', 'POST', AS(wrenKey, 'agent', 'wren'), {
      kind: 'message',
      title: 'wren to the person',
      data: { body: 'A message for the person.', to: [{ kind: 'person', id: THE_PERSON }] },
    })
    expect(sent.status, JSON.stringify(sent.said)).toBe(201)
    const messageId = String((sent.said['record'] as { id?: string }).id)
    const mark = (): string =>
      (
        t.client.sqlite
          .prepare('SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_kind = ? AND recipient_id = ?')
          .get(messageId, 'person', THE_PERSON) as { mark: string }
      ).mark
    expect(mark()).toBe('queued')

    const said = await ask('/api/messages/conversation?kind=agent&id=wren', 'GET', AS(quillKey, 'human', THE_PERSON))
    expect(said.status, JSON.stringify(said.said)).toBe(403)
    expect(String(said.said['error'] ?? '')).toContain('Nothing was done.')
    expect(mark()).toBe('queued')

    const theperson = await ask('/api/messages/conversation?kind=agent&id=wren', 'GET', AS(A_MADE_UP_PERSON_KEY, 'human', THE_PERSON))
    expect(theperson.status, JSON.stringify(theperson.said)).toBe(200)
    expect(mark()).toBe('delivered')
  })
})

describe('what still goes through', () => {
  it('A’s key under A’s handle, and under A’s registry id', async () => {
    const byHandle = await ask('/api/records', 'POST', AS(quillKey, 'agent', 'quill'), NOTE('quill by handle'))
    expect(byHandle.status, JSON.stringify(byHandle.said)).toBe(201)
    const byId = await ask('/api/records', 'POST', AS(quillKey, 'agent', quillId), NOTE('quill by id'))
    expect(byId.status, JSON.stringify(byId.said)).toBe(201)
    expect(changeOn(String((byId.said['record'] as { id?: string }).id))?.proved).toBeNull()
  })

  it('A’s key with no actor header is A', async () => {
    const said = await ask(
      '/api/records',
      'POST',
      { 'x-mole-office-workspace': 'default', 'x-mole-office-key': quillKey },
      NOTE('quill with no header'),
    )
    expect(said.status, JSON.stringify(said.said)).toBe(201)
    expect(changeOn(String((said.said['record'] as { id?: string }).id))).toMatchObject({ type: 'agent', id: quillId })
  })

  /**
   * THE OFFICE'S OWN KEY UNDER AN AGENT'S NAME IS NOT AN AGENT'S KEY. The secretary's message tP7jF3nErGyY:
   * six of the office's own processes send it on every request. It goes through, and the row still
   * records the office as the one who proved it.
   */
  it('the office’s key under an agent’s name goes through and records the office as the prover', async () => {
    const said = await ask('/api/records', 'POST', AS(A_MADE_UP_OFFICE_KEY, 'agent', 'wren'), NOTE('office as wren'))
    expect(said.status, JSON.stringify(said.said)).toBe(201)
    expect(changeOn(String((said.said['record'] as { id?: string }).id))).toEqual({
      type: 'agent',
      id: 'wren',
      proved: { id: theOfficesOwnId(t), how: 'the-office-key', claimed: 'wren' },
    })
    const read = await ask('/api/kinds', 'GET', AS(A_MADE_UP_OFFICE_KEY, 'agent', 'wren'))
    expect(read.status).toBe(200)
  })

  it('the person’s key under an agent’s name makes the caller the person', async () => {
    const said = await ask('/api/records', 'POST', AS(A_MADE_UP_PERSON_KEY, 'agent', 'wren'), NOTE('person as wren'))
    expect(said.status, JSON.stringify(said.said)).toBe(201)
    expect(changeOn(String((said.said['record'] as { id?: string }).id))).toEqual({
      type: 'human',
      id: THE_PERSON,
      proved: { id: THE_PERSON, how: 'the-person-key', claimed: 'wren' },
    })
  })
})
