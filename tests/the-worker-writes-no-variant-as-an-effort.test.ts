// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE WORKER WRITES NO VARIANT AS AN EFFORT (wave 13n round BQ).
 *
 * The worker asked every adapter but Claude Code's, Codex's and OpenCode's for the variant it would use, and wrote the
 * answer on the run's record as the run's effort. No adapter of that kind answers today, so the line never wrote. But a
 * variant is not an effort, and a record that carried one there would say the run was given an effort nobody gave it.
 * Now the worker does not ask. A native start still writes its effort from the office's answer, which is not this line.
 *
 * WHAT IS REAL AND WHAT IS NOT. The office is the real server on a fresh test database, and the agent and the message are
 * written through its doors as the person. The runtime is the fake one (tests/fake-runtime.mjs), which calls no model.
 * For this file only, the fake adapter is given a variantItWouldUse that answers a word made up for this run, so the case
 * can see whether the worker writes it. The case first checks that the adapter the worker is given answers that word.
 *
 * THE MUTATION, AFTER A CONTROL RUN: put back the read of `variantItWouldUse` in src/worker/index.ts and the spread that
 * writes it as `effort` on the run's record, and the case is red because the record carries the made-up word; take them
 * out again and the case is green.
 */
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { FakeAdapter } from '../src/worker/runtimes/fake.ts'
import { adapterFor } from '../src/worker/runtimes/index.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
/** The variant the fake adapter answers in this file, made up for this run. */
const A_MADE_UP_VARIANT = `variant-${randomUUID()}`

let t: TestDb
let app: FastifyInstance
let api = ''
let outputs = ''
let checkout: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-no-variant-'))
  checkout = aCheckoutForATestRun()
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout,
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
  Object.defineProperty(FakeAdapter.prototype, 'variantItWouldUse', { value: () => A_MADE_UP_VARIANT, configurable: true })
}, 60_000)

afterAll(async () => {
  delete (FakeAdapter.prototype as { variantItWouldUse?: unknown }).variantItWouldUse
  for (const left of watching.splice(0, watching.length)) if (left.adapter.alive(left.handle)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
  rmSync(checkout, { recursive: true, force: true })
})

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

describe('an adapter that answers a variant', () => {
  it('starts a run whose record carries no effort from that variant', async () => {
    // THE ADAPTER THE WORKER IS GIVEN ANSWERS THE WORD, so a green case is not an adapter that said nothing.
    const adapter = adapterFor('claude-code', settings.env)
    expect(adapter?.runtime).toBe('fake')
    expect(adapter?.variantItWouldUse?.()).toBe(A_MADE_UP_VARIANT)

    await post('/api/records', {
      kind: 'agent',
      title: 'variant-runner',
      data: { handle: 'variant-runner', state: 'active', runtime: 'claude-code' },
    })
    const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
    const agentId = one((listed.agents ?? []).filter((one) => one.handle === 'variant-runner'), 'the registry row for variant-runner').id
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'something for the variant runner to answer',
      data: { body: 'Please say something.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed['record'] as { id: string }).id
    await post(`/api/messages/${messageId}/start-an-agent`, {})

    // THE RUN'S RECORD IS READ AS ITS START FILED IT. No second pass ends the run: its ending is not what is held here.
    const started = one((await onePass(settings, watching)).started.filter((run) => run.messageId === messageId), 'the run started for this message')
    const record = t.api.getRecord(started.session)
    expect(record?.data['runtime']).toBe('fake')
    expect(record?.data['effort'], 'the variant was written as the run’s effort').toBeUndefined()
    expect(JSON.stringify(record?.data), 'the variant was written on the run’s record').not.toContain(A_MADE_UP_VARIANT)
  }, 40_000)
})
