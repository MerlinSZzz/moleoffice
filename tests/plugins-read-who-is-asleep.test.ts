// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLUGIN MAY READ WHO IS ASLEEP NOW: each agent with an open sleep, since when, and nothing else. The office map's
 * sleeping house asks it (step 9 of the map's design), and the state was before this only inside the waiter's
 * hand-over in src/shared/handles.ts. The read is one row of `resident_sleeps`, added to the plugin-read interface
 * with 13y's yes, and the builder is `theAgentsAsleepNow` in src/server/lib/resident-sleep.ts.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office. The sleep rows are made
 * up and written through the one writer of that table, as a resident's sleep is.
 *
 * THE CASE:
 *   1. the read answers every open sleep, each as {id, since}, oldest first, and leaves out a postponed sleep and a
 *      sleep that has ended;
 *   2. the answer carries only the interface's own fields: no machine, address, host, port, path or key, and no field
 *      named like one;
 *   3. the read needs no key, and a plugin's slot may ask it (the family's own GET).
 *
 * MUTATION, after a control run: `theAgentsAsleepNow` answers the postponed and ended sleeps too, and case 1 is red;
 * it adds the agent's handle to each row, and case 2 is red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
const ids: Record<string, string> = {}

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function registered(handle: string): Promise<void> {
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle } })
  expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
  ids[handle] = String((made.json() as { agent: { id: string } }).agent.id)
}

/** Every field name in a JSON value, at any depth. */
function everyFieldName(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) everyFieldName(item, into)
  else if (value !== null && typeof value === 'object') {
    for (const [name, inner] of Object.entries(value)) {
      into.push(name)
      everyFieldName(inner, into)
    }
  }
  return into
}

/** A field name is shaped like one of these when one of its words is one of the words. camelCase and snake are split. */
const NOT_A_PLUGINS_FIELD = new Set(['key', 'keys', 'token', 'tokens', 'secret', 'secrets', 'password', 'passwords', 'credential', 'credentials', 'cookie', 'cookies', 'authorization', 'bearer', 'machine', 'machines', 'address', 'addresses', 'host', 'hosts', 'port', 'ports', 'path', 'paths'])
function namedLikeSomethingPrivate(name: string): boolean {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .some((word) => NOT_A_PLUGINS_FIELD.has(word.toLowerCase()))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['a-sleeping-secretary', 'a-second-sleeper', 'a-postponer', 'an-awake-agent']) await registered(handle)
  const { endTheOpenSleep, writeASleepRow } = await import('../src/server/lib/resident-sleep.ts')
  const aSleep = (agentId: string, at: string) =>
    writeASleepRow({ agentId, what: 'slept', because: 'Made-up: its time came.', by: { kind: 'agent', id: agentId }, sessionId: null, at })
  aSleep(ids['a-sleeping-secretary']!, '2026-11-09 01:00:00')
  aSleep(ids['a-second-sleeper']!, '2026-11-09 02:00:00')
  const ended = aSleep(ids['an-awake-agent']!, '2026-11-09 00:30:00')
  endTheOpenSleep(ended.id, '2026-11-09 03:00:00')
  writeASleepRow({ agentId: ids['a-postponer']!, what: 'postponed', because: 'Made-up: it postponed.', by: { kind: 'agent', id: ids['a-postponer']! }, sessionId: null, at: '2026-11-09 00:45:00' })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the plugin-read view of who is asleep now', () => {
  it('1. answers every open sleep, each as {id, since}, and leaves out a postponed or ended sleep', async () => {
    const answer = await app.inject({ method: 'GET', url: '/api/plugin-read/v1/asleep', headers: AS_THE_PERSON })
    expect(answer.statusCode, answer.body.slice(0, 300)).toBe(200)
    const body = answer.json() as { interface: string; view: string; agents: { id: string; since: string }[] }
    expect({ interface: body.interface, view: body.view }).toEqual({ interface: 'office-read/1', view: 'asleep' })
    expect(
      [...body.agents].sort((a, b) => a.since.localeCompare(b.since)),
    ).toEqual([
      { id: ids['a-sleeping-secretary'], since: '2026-11-09 01:00:00' },
      { id: ids['a-second-sleeper'], since: '2026-11-09 02:00:00' },
    ])
  })

  it('2. carries no machine, address, host, port, path or key, and nothing named like one', async () => {
    const answer = await app.inject({ method: 'GET', url: '/api/plugin-read/v1/asleep', headers: AS_THE_PERSON })
    const body = answer.json() as unknown
    // EACH NAME ONCE, HOWEVER MANY SLEEPERS THE ANSWER HOLDS: the case is which names are there, not how many rows.
    expect([...new Set(everyFieldName(body))]).toEqual(['interface', 'view', 'narrowedByPermission', 'agents', 'id', 'since'])
    expect(everyFieldName(body).filter(namedLikeSomethingPrivate)).toEqual([])
    expect(answer.body).not.toMatch(/[0-9a-f]{64}/)
  })

  it('3. needs no key, and a plugin may ask it', async () => {
    const withNoKey = await app.inject({ method: 'GET', url: '/api/plugin-read/v1/asleep' })
    expect(withNoKey.statusCode, withNoKey.body.slice(0, 300)).toBe(200)
    const notARead = await app.inject({ method: 'POST', url: '/api/plugin-read/v1/asleep', headers: AS_THE_PERSON, payload: {} })
    expect(notARead.statusCode).toBe(404)
  })
})
