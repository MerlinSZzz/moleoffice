// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** A worker in a copied world holds its original queue and dispatches messages added there later. */
import type { AddressInfo } from 'node:net'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { environmentForTheWorld, writeTheWorldsInheritedDeliveryIds } from '../tools/isolated-mole-office.mjs'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const HANDLE = 'copy-world-builder'
const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
let api: string
let settings: WorkerSettings
let outputRoot: string
let agentId = ''
let inheritedMessage = ''
let messageAddedInTheWorld = ''
let undoEnvironment: (() => void) | null = null
const watching: Parameters<typeof onePass>[1] = []

async function post(path: string, body: unknown): Promise<{ status: number; text: string; json: Record<string, unknown> }> {
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify(body),
  })
  const text = await response.text()
  return { status: response.status, text, json: JSON.parse(text || '{}') as Record<string, unknown> }
}

async function delivery(messageId: string): Promise<{ mark: string; because: string | null; run: string | null }> {
  const response = await fetch(`${api}/api/messages/${messageId}`, { headers: AS_THE_OWNER })
  const body = (await response.json()) as {
    message?: { deliveries?: { mark: string; because: string | null; run: string | null }[] }
  }
  const found = body.message?.deliveries?.[0]
  if (found === undefined) throw new Error(`The test office has no delivery row for ${messageId}.`)
  return found
}

function setEnvironment(values: Record<string, string>): () => void {
  const before = new Map(Object.keys(values).map((key) => [key, process.env[key]]))
  Object.assign(process.env, values)
  return () => {
    for (const [key, value] of before) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
  }
}

beforeAll(async () => {
  t = await freshDb()
  t.api.createRecord({
    kind: 'agent',
    title: HANDLE,
    data: { handle: HANDLE, state: 'active', runtime: 'claude-code' },
    workspaceId: 'default',
    actor: t.api.HUMAN,
    origin: 'fixture',
  })
  agentId = (
    t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(HANDLE) as { id: string }
  ).id
  const inherited = t.api.createRecord({
    kind: 'message',
    title: 'Message already queued in the copy',
    data: { body: 'This test message was waiting in the copied database.', to: [{ kind: 'agent', id: agentId }] },
    workspaceId: 'default',
    actor: t.api.HUMAN,
    origin: 'fixture',
  })
  inheritedMessage = inherited.id

  // The old message already had the person's press in the copied database. Without the copy hold,
  // the worker can start it, which is the duplicate run this test is meant to catch.
  const workerLibrary = await import('../src/server/lib/worker.ts')
  workerLibrary.askForARunFor(inheritedMessage, 'default', THE_PERSON, t.api.HUMAN)

  const place = join(dirname(t.file), 'world')
  mkdirSync(place, { recursive: true })
  const inheritedIds = await writeTheWorldsInheritedDeliveryIds(t.file, place)
  const deliveryRow = t.client.sqlite
    .prepare("SELECT id FROM message_delivery WHERE message_id = ? AND mark = 'queued'")
    .get(inheritedMessage) as { id: string } | undefined
  expect(deliveryRow).toBeDefined()
  expect(inheritedIds).toContain(deliveryRow?.id)

  const worldEnv = environmentForTheWorld({
    base: { ...withoutInheritedEffort() },
    db: t.file,
    apiPort: 40003,
    webPort: 40004,
    withMessageWorker: true,
    authority: { startedBy: null, secretaries: [] },
    purpose: 'delivery test world',
    handback: null,
    otherHost: null,
    place,
    workspace: 'default',
  }) as Record<string, string>
  undoEnvironment = setEnvironment(worldEnv)

  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputRoot = mkdtempSync(join(tmpdir(), 'mole-office-world-worker-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot,
    env: { ...worldEnv, MOLE_OFFICE_API: api, MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }

  const filed = await post('/api/records', {
    kind: 'message',
    title: 'Message queued after the world started',
    data: { body: 'This test message was added inside the world.', to: [{ kind: 'agent', id: agentId }] },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.status, filed.text).toBe(409)
  messageAddedInTheWorld = (filed.json['record'] as { id: string }).id
  const press = await post(`/api/messages/${messageAddedInTheWorld}/start-an-agent`, {})
  expect(press.status, press.text).toBe(200)
}, 60_000)

afterAll(async () => {
  if (app !== undefined && settings !== undefined) {
    const deadline = Date.now() + 20_000
    while (watching.length > 0 && Date.now() < deadline) {
      await onePass(settings, watching)
      if (watching.length > 0) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await app.close()
  }
  t?.close()
  if (outputRoot !== undefined) rmSync(outputRoot, { recursive: true, force: true })
  undoEnvironment?.()
})

describe('a-worlds-worker-holds-what-the-copy-brought', () => {
  it('holds copied deliveries with the required reason and dispatches a later world message', async () => {
    const response = await fetch(`${api}/api/worker/queue`, { headers: AS_THE_OWNER })
    const queue = (await response.json()) as { queue?: { messageId: string; inheritedFromCopy?: boolean }[] }
    const oldRow = queue.queue?.find((row) => row.messageId === inheritedMessage)
    const newRow = queue.queue?.find((row) => row.messageId === messageAddedInTheWorld)
    expect(oldRow?.inheritedFromCopy).toBe(true)
    expect(newRow?.inheritedFromCopy).toBeUndefined()

    const report = await onePass(settings, watching)
    expect(report.started.map((one) => one.messageId)).toEqual([messageAddedInTheWorld])
    expect(report.held).toContainEqual({ messageId: inheritedMessage, because: 'inherited from the copy' })

    const oldDelivery = await delivery(inheritedMessage)
    expect(oldDelivery.mark).toBe('queued')
    expect(oldDelivery.because).toBe('inherited from the copy')
    expect(oldDelivery.run).toBeNull()

    const newDelivery = await delivery(messageAddedInTheWorld)
    expect(newDelivery.mark).toBe('delivered')
    expect(newDelivery.run).toBe(report.started[0]?.session)
  })
})
