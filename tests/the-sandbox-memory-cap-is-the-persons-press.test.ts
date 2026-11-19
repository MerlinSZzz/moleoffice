// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOX MEMORY LIMIT IS THE PERSON'S PRESS, AND THE PAGE SAYS WHAT RUNS, from the owner.
 *
 * The doors are src/server/api/sandbox-memory-cap.ts. src/config/sandbox-memory-cap.mjs is replaced here by recording
 * fakes, so no case can run pkexec or systemctl, even under a mutation; what it runs is proved in
 * tests/the-sandbox-memory-cap-runs-only-its-fixed-command.test.ts with stand-in programs.
 *
 *   1. An agent is refused at both doors with the code sandboxCapOnlyThePerson, and nothing is read or pressed.
 *   2. A press inside a test world is refused with sandboxCapTestWorld before anything runs.
 *   3. The person's read carries where the limit stands, the limit, the slice and the exact commands the page shows.
 *   4. The person's press hands the fake {on} and answers its outcome; a body that is not {on: boolean} is refused.
 *
 * MUTATIONS (each after a control run; the hand-back names the runs):
 *   - the person check taken out of onlyThePerson: case 1 goes red.
 *   - the test-world check taken out: case 2 goes red (the fake is called).
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { setWordLanguage } from '../src/shared/i18n.ts'

const fake = vi.hoisted(() => ({
  read: vi.fn(async () => ({ held: 'off', bytes: null, says: 'a fake reading: off' })),
  press: vi.fn(async (_on: boolean) => ({ outcome: 'cancelled', reason: 'Request dismissed', reading: null, says: 'a fake press: cancelled' })),
}))

vi.mock('../src/config/sandbox-memory-cap.mjs', async (real) => ({
  ...(await real<typeof import('../src/config/sandbox-memory-cap.mjs')>()),
  readTheSandboxCap: fake.read,
  pressTheSandboxCap: fake.press,
}))

const ON_TEXT = '/usr/bin/pkexec /usr/bin/systemctl set-property system-molesandboxes.slice MemoryMax=60G'
const OFF_TEXT = '/usr/bin/pkexec /usr/bin/systemctl revert system-molesandboxes.slice'

let t: TestDb
let app: FastifyInstance
let workerKey = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function ask(method: 'GET' | 'POST', headers: Record<string, string>, payload?: unknown): Promise<{ code: number; said: any; text: string }> {
  const reply = await app.inject({ method, url: '/api/office/sandbox-memory-cap', headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  let said: any = null
  try {
    said = reply.json()
  } catch {
    said = null
  }
  return { code: reply.statusCode, said, text: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'a-worker', name: 'A worker', role: 'worker' },
  })
  expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
  workerKey = String((started.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(workerKey).not.toBe('')
  // A WHOLE APP IS BUILT HERE, which takes more than the ten-second default on a busy machine.
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

beforeEach(() => {
  fake.read.mockClear()
  fake.press.mockClear()
})

afterEach(() => setWordLanguage('en'))

describe('the sandbox memory limit doors', () => {
  it('1: refuses an agent at both doors with its code, and reads and presses nothing', async () => {
    const asTheWorker = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': workerKey }
    const read = await ask('GET', asTheWorker)
    expect(read.code, read.text.slice(0, 300)).toBe(403)
    expect(read.said.code).toBe('sandboxCapOnlyThePerson')
    const pressed = await ask('POST', asTheWorker, { on: true })
    expect(pressed.code, pressed.text.slice(0, 300)).toBe(403)
    expect(pressed.said.code).toBe('sandboxCapOnlyThePerson')
    expect(fake.read).not.toHaveBeenCalled()
    expect(fake.press).not.toHaveBeenCalled()
  })

  it("2: refuses the person's press inside a test world before anything runs", async () => {
    process.env.MOLE_OFFICE_WORLD_STARTED_BY = 'so'
    vi.resetModules()
    const world = (await apiApp()).app
    try {
      await world.ready()
      const refused = await world.inject({ method: 'POST', url: '/api/office/sandbox-memory-cap', headers: AS_THE_PERSON, payload: { on: true } })
      expect(refused.statusCode, refused.body.slice(0, 300)).toBe(409)
      expect((refused.json() as { code: string }).code).toBe('sandboxCapTestWorld')
    } finally {
      await world.close()
      delete process.env.MOLE_OFFICE_WORLD_STARTED_BY
    }
    expect(fake.press).not.toHaveBeenCalled()
  }, 60_000)

  it("3: the person's read says where the limit stands and the exact commands", async () => {
    const read = await ask('GET', AS_THE_PERSON)
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    expect(read.said).toMatchObject({
      held: 'off',
      bytes: null,
      says: 'a fake reading: off',
      cap: '60G',
      capBytes: 60 * 1024 ** 3,
      slice: 'system-molesandboxes.slice',
      onCommand: ON_TEXT,
      offCommand: OFF_TEXT,
    })
    expect(read.said.machineBytes).toBeGreaterThan(0)
    expect(fake.read).toHaveBeenCalledTimes(1)
  })

  it("4: the person's press hands on {on} and answers its outcome; any other body is refused", async () => {
    const pressed = await ask('POST', AS_THE_PERSON, { on: false })
    expect(pressed.code, pressed.text.slice(0, 300)).toBe(200)
    expect(pressed.said).toMatchObject({ outcome: 'cancelled', reason: 'Request dismissed', says: 'a fake press: cancelled' })
    expect(fake.press.mock.calls).toEqual([[false]])
    for (const body of [{}, { on: 'yes' }, { on: true, command: 'rm' }]) {
      const refused = await ask('POST', AS_THE_PERSON, body)
      expect(refused.code, JSON.stringify(body)).toBe(400)
    }
    expect(fake.press).toHaveBeenCalledTimes(1)
  })
})

