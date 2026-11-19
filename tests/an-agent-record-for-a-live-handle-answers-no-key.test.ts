// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT RECORD FILED UNDER A LIVE AGENT'S HANDLE ANSWERS NO KEY. Keys wave, round 5.
 *
 * `POST /api/records` with kind `agent` is the second registration door. Given the handle of a live
 * agent from a second project, its write joins that agent's row and makes no new agent. Until this
 * round the door then made a key for that row if it had never held one, and answered it to the
 * caller, who proves only that it is somebody. Round 5 of wave 13m found this beside the same gap in
 * `POST /api/agents/started`. Now the door answers no key and says why, in the one sentence both
 * doors share (`whatAJoinedRowIsAnsweredInsteadOfAKey` in src/server/lib/newkey.ts).
 *
 * The setup is the one tests/a-second-project-registration-answers-no-key.test.ts uses: one scratch
 * office on a real loopback listener, with its own person key, and the window closed first.
 *
 * MUTATION (after a green control; red, then restored): drop `namedALiveAgent` from the key branch of
 * the create handler in src/server/api/records.ts, so the joined row is given a key again.
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


/** A keyed agent files an agent record under this handle from the second project. */
const fileAnAgentRecordFromTheSecondProject = (caller: string, key: string, handle: string): Promise<Reply> =>
  call('POST', '/api/records', asAgent(caller, key, SECOND), {
    kind: 'agent',
    title: `The agent ${handle}`,
    data: { handle },
  })

describe('an agent record from a second project under a live agent’s handle', () => {
  it('answers no key for a never-keyed agent, makes no key row, and says why', async () => {
    await start('never-keyed-record')
    t.client.sqlite.prepare('DELETE FROM held_keys WHERE whose_id = ?').run(idOf('never-keyed-record'))
    const before = idOf('never-keyed-record')

    const filed = await fileAnAgentRecordFromTheSecondProject('stranger', strangerKey, 'never-keyed-record')
    expect(filed.status, filed.text).toBe(201)
    expect(whatToGiveIt(filed).key, `a keyed stranger was answered the never-keyed agent's key: ${filed.text}`).toBeUndefined()
    expect(keyRowsOf('never-keyed-record'), 'a key was made for the joined row').toBe(0)
    expect(liveRowsOf('never-keyed-record')).toEqual([before])
    const says = String(filed.json['keyNotGivenBecause'])
    expect(says).toContain('"never-keyed-record" is already a live agent')
    expect(says).toContain('"newKey": true')
  })

  it('still answers a key for a new agent filed under a handle nobody bears', async () => {
    const filed = await fileAnAgentRecordFromTheSecondProject('stranger', strangerKey, 'brand-new-record')
    expect(filed.status, filed.text).toBe(201)
    expect(String(whatToGiveIt(filed).key)).toMatch(/^[0-9a-f]{64}$/)
    expect(filed.json['keyNotGivenBecause']).toBeUndefined()
  })
})
