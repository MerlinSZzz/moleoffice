// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGISTRATION THAT JOINS A LIVE AGENT'S ROW ANSWERS NO KEY. Keys wave, round 5.
 *
 * `POST /api/agents/started`, given the handle of a live agent from a second project, does not make a
 * new agent: the record it writes is joined to that agent's row. Until this round the door then made
 * a key for that row if it had never held one, and answered it to the caller. After the key window
 * closes, the caller of this door holds a key, but that proves only that it is some agent. It does
 * not prove that it started the agent it names. Round 4 made a never-keyed agent's first key through
 * register-myself need a one-time secret; this door now answers no key at all to a registration that
 * joins an existing row, and its words say the row was joined and how the agent asks for its own key.
 *
 * One scratch office on a real loopback listener, with its own person key. The window is closed
 * first, as the person's key closes it, so every caller below holds a key.
 *
 * MUTATION (after a green control; red, then restored): make the key for the joined row again, that
 * is, drop the `joinedARow` guard on the key line in src/server/api/participants.ts.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let here = ''

const PERSON_KEY = randomBytes(32).toString('hex')
const OFFICE_KEY = randomBytes(32).toString('hex')
const DIR = `${THE_TEST_FIXTURE_ROOT}/test_claude/panelx`
const SECOND = 'second-project'

/** A reply shown in a failure message with every key in it replaced, so no log ever carries a key. */
const hidden = (text: string): string => text.replace(/[0-9a-f]{64}/g, '<a secret>')

const asAgent = (handle: string, key: string | undefined, workspace = 'default'): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': PERSON_KEY,
}

interface Reply {
  status: number
  json: Record<string, unknown>
  text: string
}

async function call(method: string, url: string, headers: Record<string, string>, body?: unknown): Promise<Reply> {
  const res = await fetch(`${here}${url}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: res.status, json, text: hidden(text) }
}

/** Every live registry row bearing this handle. */
function liveRowsOf(handle: string): string[] {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').all(handle) as { id: string }[]).map((row) => row.id)
}

function idOf(handle: string): string {
  const rows = liveRowsOf(handle)
  expect(rows, `live rows for ${handle}`).toHaveLength(1)
  return rows[0]!
}

/** How many key rows, live or revoked, an agent has ever held. */
function keyRowsOf(handle: string): number {
  return (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM held_keys WHERE whose_id = ?').get(idOf(handle)) as { n: number }).n
}

const whatToGiveIt = (reply: Reply): { key?: unknown; keySays?: unknown } =>
  (reply.json['whatToGiveIt'] ?? {}) as { key?: unknown; keySays?: unknown }

/** Start an agent in the default project as the person, and hand back its key. */
async function start(handle: string): Promise<string> {
  const made = await call('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: `The agent ${handle}` })
  expect(made.status, made.text).toBe(201)
  const key = String(whatToGiveIt(made).key)
  expect(key).toMatch(/^[0-9a-f]{64}$/)
  return key
}

/** A keyed agent registers this handle from the second project. */
const registerFromTheSecondProject = (caller: string, key: string, handle: string): Promise<Reply> =>
  call('POST', '/api/agents/started', asAgent(caller, key, SECOND), { handle, name: `The agent ${handle}` })

let strangerKey = ''

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: PERSON_KEY, office: OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`

  const project = await call('POST', '/api/workspaces', AS_THE_PERSON, { id: SECOND, title: 'Second project' })
  if (project.status !== 201) throw new Error(`making the second project answered ${String(project.status)}: ${project.text}`)
  strangerKey = await start('stranger')
  const closed = await call('POST', '/api/office/key-window/close', AS_THE_PERSON)
  if (closed.status !== 200) throw new Error(`closing the window answered ${String(closed.status)}: ${closed.text}`)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a registration from a second project under a live agent’s handle', () => {
  it('joins the row of a never-keyed agent, answers no key, and says how the agent asks for its own', async () => {
    await start('never-keyed')
    t.client.sqlite.prepare('DELETE FROM held_keys WHERE whose_id = ?').run(idOf('never-keyed'))
    const before = idOf('never-keyed')

    const joined = await registerFromTheSecondProject('stranger', strangerKey, 'never-keyed')
    expect(joined.status, joined.text).toBe(201)
    expect(whatToGiveIt(joined).key, `a keyed stranger was answered the never-keyed agent's key: ${joined.text}`).toBeUndefined()
    expect(keyRowsOf('never-keyed'), 'a key was made for the joined row').toBe(0)
    // THE ROW IS REUSED: one live row, the same id, and the reply names it.
    expect(liveRowsOf('never-keyed')).toEqual([before])
    expect((joined.json['agent'] as { id?: string }).id).toBe(before)
    expect(joined.json['joinedAnExistingRow']).toBe(true)
    // THE WORDS SAY WHAT THE CALLER GETS INSTEAD.
    const says = String(whatToGiveIt(joined).keySays)
    expect(says).toContain('"never-keyed" is already a live agent')
    expect(says).toContain('No key is answered')
    expect(says).toContain('"newKey": true')

    // AND THE WAY THE WORDS NAME IS OPEN: the agent's own new-key ask is filed and answered a secret.
    const asked = await call('POST', '/api/agents/register-myself', asAgent('never-keyed', undefined), {
      handle: 'never-keyed',
      name: 'The agent never-keyed',
      workingDirectory: DIR,
      newKey: true,
    })
    expect(asked.status, asked.text).toBe(202)
    expect(String(asked.json['askSecret'])).toMatch(/^[0-9a-f]{64}$/)
    expect(keyRowsOf('never-keyed')).toBe(0)
  })

  it('answers no second key for an agent that already held one, as before, with the same words', async () => {
    await start('keyed-already')
    const before = idOf('keyed-already')
    const joined = await registerFromTheSecondProject('stranger', strangerKey, 'keyed-already')
    expect(joined.status, joined.text).toBe(201)
    expect(whatToGiveIt(joined).key).toBeUndefined()
    expect(keyRowsOf('keyed-already')).toBe(1)
    expect(liveRowsOf('keyed-already')).toEqual([before])
    expect(joined.json['joinedAnExistingRow']).toBe(true)
    expect(String(whatToGiveIt(joined).keySays)).toContain('"keyed-already" is already a live agent')
  })
})

describe('a brand-new agent registered from a second project', () => {
  it('is a new row and its key is answered to its starter, as before', async () => {
    const made = await registerFromTheSecondProject('stranger', strangerKey, 'brand-new')
    expect(made.status, made.text).toBe(201)
    expect(String(whatToGiveIt(made).key)).toMatch(/^[0-9a-f]{64}$/)
    expect(String(whatToGiveIt(made).keySays)).toContain('only time this key is shown')
    expect(made.json['joinedAnExistingRow']).toBe(false)
    expect(keyRowsOf('brand-new')).toBe(1)
  })
})
