// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN THE WORKER STARTS GETS ITS BRIEF AFTER THE PERSON HAS CLOSED THE KEY WINDOW.
 *
 * The worker reads `GET /api/brief` for the run's agent, under that agent's name, because the brief carries the
 * agent's own notebook. Once the key window is closed, a read under an agent's name with no key is refused. So the
 * worker sends the key the office minted for that run, and never the office's own key, which is the office and never
 * somebody else (criterion N1; src/worker/index.ts, `ask`).
 *
 * This starts the real worker's pass against an office on a real listener, with the window closed, a fresh agent
 * registered by the person's key, and a message the person asked a run for. It then reads what the office answered
 * to the worker's own `/api/brief` request. Each read is recorded when it is made, so a read that got no answer
 * fails as one, and "the worker never asked" means no read was made (problem PLKXRVCdXclW).
 *
 * Three-run proof:
 *   node tools/run-named-tests.mjs tests/a-run-gets-its-brief-after-the-close.test.ts
 * Mutations, each restored with cp and checked with cmp:
 *   1. src/worker/index.ts, the brief read: `one.handle, runKey)` to `one.handle)`. The read carries no key and is
 *      refused with 403, and this goes red.
 *   2. src/worker/index.ts, `ask`: the read made for a run's agent sends the office's key again (`{ [KEY_HEADER]:
 *      init.theRunsKey }` to `{ [KEY_HEADER]: office.key ?? '' }`). The brief is answered, and the check that it did
 *      not carry the office's key goes red.
 *   3. src/worker/index.ts, the brief read: `'/api/brief', BRIEF_DEADLINE_MS,` to `'/api/brief', 1,`. The read is
 *      made and cut off before it is answered, and this goes red on "its read got no answer", not on "never asked".
 *   4. src/worker/index.ts, the brief read: `await askWithoutThrowing(settings, '/api/brief', BRIEF_DEADLINE_MS,
 *      one.handle, runKey)` to `{ ok: false, status: 0, body: null, text: '' }`. No read is made, and this goes red
 *      on "never asked".
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

/** Made-up values. Nothing here is, or was ever, a key any office issued. */
const A_MADE_UP_PERSON_KEY = randomBytes(32).toString('hex')
const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')

const THEM = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': A_MADE_UP_PERSON_KEY,
}
const AGENT = 'a-fresh-synthetic-agent'

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings

async function asThem(method: string, path: string, body?: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${api}${path}`, { method, headers: THEM, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(
    join(dirname(t.file), 'keys.json'),
    `${JSON.stringify({ person: A_MADE_UP_PERSON_KEY, office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`,
    { mode: 0o600 },
  )
  app = (await apiApp()).app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  // THE OFFICE'S FIRST BRIEF READ IS MADE HERE, BY THE PERSON, AND NOT BY THE WORKER. Problem PLKXRVCdXclW. On a
  // fresh server the first GET /api/brief took about 1.1 s at a load near 22, and sometimes went past the worker's
  // 2-second deadline. Every read after it took 13 to 31 ms. Nobody has traced why. This test is about the key the
  // worker's read carries, not about how long a fresh office takes, so the first read is paid here.
  const first = await fetch(`${api}/api/brief`, { headers: THEM })
  await first.text()
  expect(first.status, "the office's first brief read, made as the person").toBe(200)
  outputs =mkdtempSync(join(tmpdir(), 'mole-office-brief-after-close-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  vi.restoreAllMocks()
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('a run the worker starts after the close', () => {
  it("is answered its brief, because the worker sends the run's own key on that read, not the office's", async () => {
    const made = await asThem('POST', '/api/agents/started', { handle: AGENT, name: 'A fresh synthetic agent', runtime: 'claude-code' })
    expect(made.status, JSON.stringify(made.json)).toBe(201)
    const closed = await asThem('POST', '/api/office/key-window/close')
    expect(closed.status, JSON.stringify(closed.json)).toBe(200)

    const listed = await asThem('GET', '/api/participants')
    const agentId = one(
      ((listed.json['agents'] ?? []) as { id: string; handle: string }[]).filter((a) => a.handle === AGENT),
      'the registry row of the fresh agent',
    ).id
    const filed = await asThem('POST', '/api/records', {
      kind: 'message',
      title: 'A synthetic question',
      data: { body: 'What changed on the synthetic bench?', to: [{ kind: 'agent', id: agentId }] },
    })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(filed.status, JSON.stringify(filed.json)).toBe(409)
    const messageId = (filed.json['record'] as { id: string }).id
    const pressed = await asThem('POST', `/api/messages/${messageId}/start-an-agent`, {})
    expect(pressed.status, JSON.stringify(pressed.json)).toBeLessThan(300)

    // WHAT THE OFFICE ANSWERED TO THE WORKER'S OWN BRIEF READ, seen on the worker's own fetch.
    //
    // A READ IS RECORDED WHEN IT IS MADE, before its answer is waited for. Problem PLKXRVCdXclW: the worker reads the
    // brief with a deadline, and a read cut off at it throws instead of answering. When the read was recorded only
    // after its answer, a read that timed out was not recorded at all, and this test said the worker never asked.
    /** Each brief read: the key it carried or null, the status it was answered, and why it got no answer. */
    const briefs: { key: string | null; answered: number | null; noAnswer: string | null }[] = []
    const realFetch = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (new URL(url).pathname !== '/api/brief') return await realFetch(input, init)
      const read: (typeof briefs)[number] = { key: new Headers(init?.headers).get('x-mole-office-key'), answered: null, noAnswer: null }
      briefs.push(read)
      try {
        const res = await realFetch(input, init)
        read.answered = res.status
        return res
      } catch (err) {
        read.noAnswer = `${(err as Error).name}: ${(err as Error).message}`
        throw err
      }
    })
    const report = await onePass(settings, [])
    vi.restoreAllMocks()

    one(report.started, 'the run the worker started')
    expect(briefs, 'the worker never asked for the brief').toHaveLength(1)
    expect(briefs[0]!.noAnswer, 'the worker asked for the brief, and its read got no answer').toBeNull()
    expect(briefs[0]!.answered, 'the brief read for the run was refused after the close').toBe(200)
    expect(briefs[0]!.key, 'the brief read carried no key').not.toBeNull()
    expect(briefs[0]!.key, "the brief read carried the office's own key under the agent's name").not.toBe(A_MADE_UP_OFFICE_KEY)
  }, 60_000)
})
