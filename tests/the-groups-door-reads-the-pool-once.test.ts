// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GROUPS DOOR READS THE MESSAGE POOL ONCE FOR THE WHOLE LIST, NOT TWICE PER GROUP.
 *
 * MEASURED FIRST, 11 September 2026, on an idle copy of the owner's database (problem 9UeL9VeVPn33):
 * `GET /api/groups` took 3.4 to 3.7 seconds, and each of its two counts per group — how many
 * unread, and whether anything is unread — read every message of every project again, 54 reads of
 * one pool for 27 groups. Read once in the route and handed down, the same door took 83 ms.
 *
 * HOW IT IS PROVED. The statements are counted at the database, as tests/the-queue-reads-the-runs-
 * and-the-pool-once-per-pass.test.ts does: the pool's delivery read asks for many message ids at
 * once. With four groups and twelve messages it is prepared once per call. CONTROL: red before the
 * change (8). MUTATION: drop the `pool` argument from either count in the route, and this is red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

async function post(path: string, body: unknown, headers: Record<string, string> = PERSON): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return reply.json() as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['group-one', 'group-two']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, workArea: ['src'] } })
    expect(made.statusCode, made.body).toBe(201)
  }
  for (let g = 0; g < 4; g++) {
    const opened = await post('/api/groups', {
      name: `group ${String(g)}`,
      because: 'to count its unread messages',
      members: [{ who: { kind: 'person', id: THE_PERSON }, because: 'the person reads it' }, { who: { kind: 'agent', id: 'group-one' }, because: 'it works here' }, { who: { kind: 'agent', id: 'group-two' }, because: 'it works here too' }],
    })
    const id = (opened['group'] as { id?: string } | undefined)?.id
    expect(id, JSON.stringify(opened).slice(0, 200)).toBeDefined()
    for (let i = 0; i < 3; i++) {
      // WRITTEN BY A MEMBER, because a message to a group comes from somebody in it.
      const filed = await post('/api/records', { kind: 'message', title: `in group ${String(g)} ${String(i)}`, data: { body: `message ${String(i)} in group ${String(g)}`, toGroup: id } }, asAgent('group-one'))
      expect((filed['record'] as { id?: string } | undefined)?.id, JSON.stringify(filed).slice(0, 200)).toBeDefined()
    }
  }
})
afterAll(async () => {
  await app.close()
  t.close()
})

/** Every statement prepared while `act` runs, by its SQL. */
async function statementsDuring(act: () => Promise<void>): Promise<string[]> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare
  const seen: string[] = []
  sqlite.prepare = function (this: unknown, sql: string) {
    seen.push(sql)
    return original.call(this, sql)
  }
  try {
    await act()
  } finally {
    sqlite.prepare = original
  }
  return seen
}

describe('GET /api/groups over four groups with three messages each', () => {
  it('lists every group with its counts, and reads the pool once', async () => {
    let body: { groups?: { name: string; unread: number; anythingUnread: boolean; pinned: boolean }[] } = {}
    const statements = await statementsDuring(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/groups', headers: PERSON })
      expect(reply.statusCode, reply.body).toBe(200)
      body = reply.json() as typeof body
    })
    // THE OFFICE KEEPS ONE STANDING GROUP of its own, the Secretariat, so the list holds the four
    // opened here plus it. Only the four opened here carry the three unread messages this file made.
    const opened = (body.groups ?? []).filter((one) => !one.pinned)
    expect(opened.length, 'the four groups opened here are listed').toBe(4)
    expect((body.groups ?? []).length, 'the office’s standing group is listed too').toBe(5)
    for (const one of opened) {
      expect(one.unread, 'three messages the person has not read, one line the office wrote').toBeGreaterThanOrEqual(3)
      expect(one.anythingUnread).toBe(true)
    }
    const poolDeliveryReads = statements.filter((sql) => /message_delivery/.test(sql) && (sql.match(/\?/g) ?? []).length >= 12).length
    expect(poolDeliveryReads, 'the pool is read once for the whole list').toBe(1)
  })
})
