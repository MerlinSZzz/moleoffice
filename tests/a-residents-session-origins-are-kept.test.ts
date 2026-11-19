// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESIDENT'S SESSION-ORIGIN FILE: WHERE, HOW AND ON WHICH MACHINE EACH OF ITS SESSIONS STARTED.
 *
 * Item 4 of a decision says a resident's folder keeps a file of where, how and on which
 * machine each session started, so it can be found again. The file is
 * `session-origins.jsonl` at the root of the space, written by src/server/lib/session-origins.ts.
 *
 * WHAT IS PROVED HERE (every name, path and value is made up):
 *   1. the confirm writes the first line, from the agent's most recent session, with each field the record carries and
 *      the missing ones named in `unknown`;
 *   2. a later session is appended when the resident is read, and when the watcher ticks; the lines already written
 *      are never rewritten, and a session filed before the newest one named is not added;
 *   3. a resident with no session on record gets an empty file, and the confirm says so;
 *   4. a key-shaped value in a session record, and the value of a secret in the environment, never reach the file.
 *
 * MUTATIONS (each after a green control run, then restored), named in the commit that added this file.
 */

import type { FastifyInstance } from 'fastify'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/** A secret this process was "given", under a name that says it is one. Made up, and not key-shaped on purpose. */
const PLANTED_NAME = 'MOLE_TEST_PLANTED_API_KEY'
const PLANTED_VALUE = 'zq-planted-secret-value-17'
/** A key-shaped value, as an office key is: 64 hex characters. Made up. */
const KEY_SHAPED = 'ab'.repeat(32)
let previous: string | undefined

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string, key: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
})

async function inject(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; json: Record<string, any>; text: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  let json: Record<string, any> = {}
  try {
    json = reply.json() as Record<string, any>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

const agents = new Map<string, { id: string; key: string }>()
async function started(handle: string, role: string): Promise<void> {
  const reply = await inject('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
  expect(reply.status, reply.text).toBe(201)
  agents.set(handle, { id: String(reply.json['agent'].id), key: String(reply.json['whatToGiveIt'].key) })
}

function aSession(createdAt: string, data: Record<string, unknown>): string {
  const id = `ses-${Math.random().toString(36).slice(2, 12)}`
  t.client.sqlite
    .prepare(
      "INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data) VALUES (?, 'default', ?, ?, ?, 'session', ?, NULL, ?)",
    )
    .run(id, THE_PERSON, createdAt, createdAt, `a made-up run ${id}`, JSON.stringify(data))
  return id
}

function theFileOf(handle: string): string {
  return join(dirname(t.file), 'personal-spaces', agents.get(handle)!.id, 'session-origins.jsonl')
}

async function confirm(handle: string): Promise<Record<string, any>> {
  const secretary = agents.get('sec-origins')!
  const proposed = await inject('POST', '/api/residents/proposals', asAgent('sec-origins', secretary.key), { agentId: handle, because: 'A made-up reason.' })
  expect(proposed.status, proposed.text).toBe(201)
  const confirmed = await inject('POST', `/api/residents/proposals/${String(proposed.json['proposal'].id)}/confirm`, AS_THE_PERSON)
  expect(confirmed.status, confirmed.text).toBe(200)
  return confirmed.json
}

const lines = (handle: string): Record<string, any>[] =>
  readFileSync(theFileOf(handle), 'utf8')
    .split('\n')
    .filter((one) => one !== '')
    .map((one) => JSON.parse(one) as Record<string, any>)

beforeAll(async () => {
  previous = process.env[PLANTED_NAME]
  process.env[PLANTED_NAME] = PLANTED_VALUE
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await started('sec-origins', 'secretary')
  await started('origin-one', 'worker')
  await started('origin-two', 'worker')
  await started('origin-three', 'worker')
})

afterAll(async () => {
  await app.close()
  t.close()
  if (previous === undefined) delete process.env[PLANTED_NAME]
  else process.env[PLANTED_NAME] = previous
})

describe('the session-origin file', () => {
  it('1: the confirm writes the first line, from the most recent session, and names what nobody recorded', async () => {
    const id = agents.get('origin-one')!.id
    aSession('2026-09-01 09:00:00', { servingAgentId: id, runtime: 'codex', workingDirectory: '/made/up/older' })
    const newest = aSession('2026-09-02 09:00:00', {
      servingAgentId: id,
      runtime: 'claude-code',
      model: 'claude-opus-5-5',
      machine: 'made-up-host',
      workingDirectory: '/made/up/checkout',
      cutFrom: 'main',
      providerSession: '3dea5df5-87ba-492f-82e7-454e48c9bd0e',
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId: '3dea5df5-87ba-492f-82e7-454e48c9bd0e',
          logPath: '/made/up/transcript.jsonl',
          resumeCommand: 'claude --resume 3dea5df5-87ba-492f-82e7-454e48c9bd0e',
          entryPoint: 'cli',
        },
      },
    })
    const confirmed = await confirm('origin-one')
    expect(confirmed['firstOrigin']).toBe(newest)
    const [first, ...rest] = lines('origin-one')
    expect(rest).toEqual([])
    expect(first).toMatchObject({
      sessionRecordId: newest,
      runtime: 'claude-code',
      model: 'claude-opus-5-5',
      host: 'made-up-host',
      cwd: '/made/up/checkout',
      checkout: { cutFrom: 'main' },
      resumeCommand: 'claude --resume 3dea5df5-87ba-492f-82e7-454e48c9bd0e',
      how: { entryPoint: 'cli', startedByMoleOffice: null, sandbox: null, terminal: null },
      withheld: [],
    })
    expect(first!['unknown']).toEqual(['startedAt', 'how.startedByMoleOffice', 'how.sandbox', 'how.terminal'])
  })

  it('2: a later session is appended, nothing written is rewritten, and an older one is not added', async () => {
    const id = agents.get('origin-one')!.id
    const before = readFileSync(theFileOf('origin-one'), 'utf8')
    aSession('2026-09-01 12:00:00', { servingAgentId: id, runtime: 'codex' })
    const later = aSession('2099-01-01 09:00:00', { servingAgent: 'origin-one', runtime: 'dsh', model: 'deepseek-v4.1-flash' })
    const read = await inject('GET', '/api/residents/origin-one', AS_THE_PERSON)
    expect(read.status, read.text).toBe(200)
    expect(read.json['space'].sessionOrigins).toEqual({ upToDate: true, appended: 1 })
    const after = readFileSync(theFileOf('origin-one'), 'utf8')
    expect(after.startsWith(before)).toBe(true)
    expect(lines('origin-one').map((one) => one['sessionRecordId'])).toEqual([lines('origin-one')[0]!['sessionRecordId'], later])
    // AND THE WATCHER, the server's minute timer, adds the next one without anybody reading.
    const { startTheOriginWatcher } = await import('../src/server/lib/residents.ts')
    const next = aSession('2099-01-02 09:00:00', { servingAgentId: id, runtime: 'claude-code' })
    const watch = startTheOriginWatcher(() => {}, 20)
    try {
      await new Promise((done) => setTimeout(done, 150))
    } finally {
      clearInterval(watch)
    }
    expect(lines('origin-one').map((one) => one['sessionRecordId']).at(-1)).toBe(next)
    expect(readFileSync(theFileOf('origin-one'), 'utf8').startsWith(after)).toBe(true)
  })

  it('2b: a session filed in the same second as the newest one the file names is still added', async () => {
    // RECORD TIMES ARE KEPT TO THE SECOND, so two sessions can share one. The file already says which sessions
    // it names, so a session it does not name is added even when its second is the newest one's.
    const id = agents.get('origin-one')!.id
    // The newest session the file names was filed at 2099-01-02 09:00:00, in case 2.
    const sameSecond = aSession('2099-01-02 09:00:00', { servingAgentId: id, runtime: 'codex' })
    const read = await inject('GET', '/api/residents/origin-one', AS_THE_PERSON)
    expect(read.status, read.text).toBe(200)
    expect(read.json['space'].sessionOrigins).toEqual({ upToDate: true, appended: 1 })
    expect(lines('origin-one').map((one) => one['sessionRecordId']).at(-1)).toBe(sameSecond)
  })

  it('3: a resident with no session on record gets an empty file, and the confirm says so', async () => {
    const confirmed = await confirm('origin-two')
    expect(confirmed['firstOrigin']).toBeNull()
    expect(String(confirmed['said'])).toContain('No session of origin-two was on record')
    expect(readFileSync(theFileOf('origin-two'), 'utf8')).toBe('')
  })

  it('4: a key-shaped value in a session, and a secret in the environment, never reach the file', async () => {
    const id = agents.get('origin-three')!.id
    aSession('2026-09-05 09:00:00', {
      servingAgentId: id,
      runtime: 'claude-code',
      model: KEY_SHAPED,
      workingDirectory: `/made/up/${PLANTED_VALUE}/checkout`,
      providerSession: 'sk-madeup0123456789abcdefghij',
      machine: 'made-up-host',
    })
    await confirm('origin-three')
    const text = readFileSync(theFileOf('origin-three'), 'utf8')
    expect(text).not.toContain(KEY_SHAPED)
    expect(text).not.toContain(PLANTED_VALUE)
    expect(text).not.toContain('sk-madeup0123456789abcdefghij')
    const [line] = lines('origin-three')
    expect(line!['withheld']).toEqual(['model', 'cwd', 'providerSession'])
    expect(line!['host']).toBe('made-up-host')
  })
})
