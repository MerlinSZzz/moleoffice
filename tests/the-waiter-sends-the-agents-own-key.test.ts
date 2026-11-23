// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITER SENDS THE AGENT'S OWN KEY UNDER THE AGENT'S OWN HANDLE, AND REFUSES WITH NO KEY.
 *
 * `tools/hold-the-handle.mjs` builds who it asks as, and the agent's key, through `anAgentsToolHeaders`
 * in tools/sandbox-common.mjs. With MOLE_AGENT_KEY set, that key goes on x-mole-office-key and the
 * actor header names the waiter's own handle. With neither an agent key nor a run key, it asks nothing,
 * even when the office's key file is present.
 *
 * HOW IT IS SEEN. The waiter is started as a real child process and pointed at a listener of this
 * file's own. The listener writes down the headers of each hold request and hands the request to the
 * office unchanged, stamped as arriving from this machine, as a real listener stamps it. The keys are
 * compared inside this file and never printed: each assertion is on a true or false.
 *
 * MUTATION PROOF, 25 September 2026, after a green control: `theCallerHeaders` in the waiter made to
 * send the office's key always turns the first case red. The commit message names each run and its log.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { settings } from '../src/config/settings.mjs'

const WORKSPACE = 'default'
const KEY_HEADER = 'x-mole-office-key'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

let t: TestDb
let app: FastifyInstance
let door: Server
let api = ''
/** The headers of every hold request that reached this file's listener, with the status the office answered. */
const holds: { handle: string; headers: Record<string, string | string[] | undefined>; status: number }[] = []
const started: ChildProcess[] = []
const keys = new Map<string, string>()

/** The office's own key, read from the file the office made beside the database. Never printed. */
function theOfficesKey(): string {
  const held = JSON.parse(readFileSync(settings().keysPath, 'utf8')) as { office?: unknown }
  if (typeof held.office !== 'string') throw new Error('the office made no key of its own beside the database')
  return held.office
}

async function aRegisteredAgentWithASession(handle: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle),
    payload: { handle, name: `The agent ${handle}`, role: 'worker', workArea: ['src'] },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const key = (reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? ''
  expect(key, `the registration answered no key for ${handle}`).not.toBe('')
  keys.set(handle, key)
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title: `A terminal answering as ${handle}`, data: { state: 'running', runtime: 'claude-code', doing: `answering as ${handle}` } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return (filed.json() as { record: { id: string } }).record.id
}

/** Start the waiter for this handle and session; `agentKey` null means MOLE_AGENT_KEY is not set. */
function startTheWaiter(handle: string, session: string, agentKey: string | null): { said: () => string; ended: Promise<number | null> } {
  const env: Record<string, string | undefined> = { ...process.env, MOLE_OFFICE_HANDLE_BEAT_SECONDS: '1' }
  delete env.MOLE_AGENT_KEY
  delete env.MOLE_OFFICE_AGENT
  delete env.MOLE_AGENT_KEY_FILE
  delete env.MOLE_OFFICE_TOOL_CONFIGURATION
  if (agentKey !== null) env.MOLE_AGENT_KEY = agentKey
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../tools/hold-the-handle.mjs', import.meta.url)), '--agent', handle, '--session', session, '--api', api, '--workspace', WORKSPACE],
    { env },
  )
  started.push(child)
  let printed = ''
  child.stdout?.on('data', (chunk) => (printed += String(chunk)))
  child.stderr?.on('data', (chunk) => (printed += String(chunk)))
  return { said: () => printed, ended: new Promise(resolve => child.on('close', resolve)) }
}

async function until(what: () => boolean, within = 30_000): Promise<boolean> {
  const deadline = Date.now() + within
  while (Date.now() < deadline) {
    if (what()) return true
    await new Promise((go) => setTimeout(go, 100))
  }
  return false
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { stampArrival } = await import('../src/server/lib/http.ts')
  door = createServer((raw, res) => {
    const hold = /^\/api\/handles\/([^/]+)\/hold$/.exec((raw.url ?? '').split('?')[0] ?? '')
    if (raw.method === 'POST' && hold !== null) {
      const seen = { handle: decodeURIComponent(hold[1] ?? ''), headers: { ...raw.headers }, status: 0 }
      holds.push(seen)
      res.on('finish', () => (seen.status = res.statusCode))
    }
    stampArrival(raw, 'this machine', 'the caller')
    app.routing(raw, res)
  })
  await new Promise<void>((go) => door.listen(0, '127.0.0.1', go))
  api = `http://127.0.0.1:${String((door.address() as AddressInfo).port)}`
  const secretary = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' } })
  expect(secretary.statusCode, secretary.body).toBe(201)
}, 180_000)

afterAll(async () => {
  for (const child of started) {
    if (child.pid === undefined) continue
    try {
      process.kill(child.pid, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
  await new Promise<void>((go) => door.close(() => go()))
  await app.close()
  t.close()
}, 60_000)

describe('the waiter proves who it is', () => {
  it("sends MOLE_AGENT_KEY under the agent's own handle when it is set, and the hold is taken", async () => {
    const handle = 'keyed-waiter'
    const session = await aRegisteredAgentWithASession(handle)
    const waiter = startTheWaiter(handle, session, keys.get(handle) ?? null)
    const answered = (): (typeof holds)[number] | undefined => holds.find((one) => one.handle === handle && one.status !== 0)
    expect(await until(() => answered() !== undefined), waiter.said()).toBe(true)
    const seen = answered()!
    expect(seen.headers['x-mole-office-actor-id']).toBe(handle)
    expect(seen.headers['x-mole-office-actor-type']).toBe('agent')
    expect(seen.headers[KEY_HEADER] === keys.get(handle), "the hold did not carry the agent's own key").toBe(true)
    expect(seen.headers[KEY_HEADER] === theOfficesKey(), "the hold carried the office's key although the agent holds one").toBe(false)
    expect(seen.status, waiter.said()).toBe(201)
  }, 60_000)

  it('refuses without an agent or run key before asking for a hold', async () => {
    const handle = 'keyless-waiter'
    const session = await aRegisteredAgentWithASession(handle)
    const waiter = startTheWaiter(handle, session, null)
    expect(await waiter.ended).toBe(2)
    expect(waiter.said()).toContain('MOLE_AGENT_KEY_FILE')
    expect(holds.filter(one => one.handle === handle)).toEqual([])
  }, 60_000)
})
