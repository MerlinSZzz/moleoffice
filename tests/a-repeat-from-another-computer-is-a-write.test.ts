// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A repeated card from a paired computer writes a line to the person, so its answer has no
 * nothingWritten key; the same request here writes no line and carries the exported sentence.
 * Removing the card door's remote-line condition or its no-write answer makes this case fail.
 * A repeated retirement with the same reason has the same requirements. Removing the retirement
 * door's remote-line condition or its no-write answer makes that case fail.
 */
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const here = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
let db: TestDb
let app: FastifyInstance
let otherListener: Server
let otherAddress = ''
let deviceKey = ''

async function local(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
  return app.inject({ method, url, headers: here, ...(payload === undefined ? {} : { payload }) })
}

async function remote(url: string, payload: unknown) {
  const response = await fetch(`${otherAddress}${url}`, {
    method: 'POST',
    headers: { ...here, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'made-up-device', 'x-mole-office-key': deviceKey },
    body: JSON.stringify(payload),
  })
  const text = await response.text()
  return { status: response.status, text, body: JSON.parse(text) }
}

async function lines(): Promise<string[]> {
  const { SYSTEM_LINES } = await import('../src/shared/groups.ts')
  const line = SYSTEM_LINES.anActWasMadeFromAnotherComputer('Example').line
  const response = await local('GET', '/api/records?kind=message&limit=200&shape=full')
  expect(response.statusCode, response.body).toBe(200)
  const records = response.json().records as { id: string; data: { body?: string; to?: { kind: string; id: string }[] } }[]
  return records.filter((one) => one.data.body === line && (one.data.to ?? []).some((to) => to.kind === 'person' && to.id === THE_TEST_OFFICES_OWNER.id)).map((one) => one.id)
}

async function sentence(): Promise<string> {
  const { nothingWrittenSentence } = await import('../src/server/lib/records/patching.ts')
  const value = nothingWrittenSentence({ kind: 'already-stored' })
  expect(value).toEqual(expect.any(String))
  return value
}

async function startAgent(handle: string): Promise<string> {
  const response = await local('POST', '/api/agents/started', { handle, name: handle, role: 'worker' })
  expect(response.statusCode, response.body).toBe(201)
  return String(response.json().agent.id)
}

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const { listenForOtherMachines } = await import('../src/server/index.ts')
  otherListener = await listenForOtherMachines(app, 0, '127.0.0.1')
  otherAddress = `http://127.0.0.1:${String((otherListener.address() as AddressInfo).port)}`
  const asked = await local('POST', '/api/office/visitors', { device: 'A made-up computer' })
  expect(asked.statusCode, asked.body).toBe(201)
  deviceKey = String(asked.json().token)
  const confirmed = await local('POST', `/api/office/visitors/${String(asked.json().credential.id)}/confirm`, {})
  expect(confirmed.statusCode, confirmed.body).toBe(200)
}, 60_000)

afterAll(async () => {
  if (otherListener) await new Promise<void>((done) => otherListener.close(() => done()))
  await app?.close()
  db?.close()
})

it('counts the line when the same card is given again from another computer', async () => {
  const handle = 'card-test-agent'
  await startAgent(handle)
  const path = `/api/roles/card/${handle}`
  const payload = { role: 'secretary' }
  const before = await lines()
  const first = await remote(path, payload)
  expect(first.status, first.text).toBe(201)
  const afterFirst = await lines()
  expect(afterFirst.length).toBe(before.length + 1)
  const repeat = await remote(path, payload)
  expect(repeat.status, repeat.text).toBe(first.status)
  const afterRepeat = await lines()
  expect(afterRepeat.length).toBe(afterFirst.length + 1)
  expect(repeat.body).not.toHaveProperty('nothingWritten')
  const localRepeat = await local('POST', path, payload)
  expect(localRepeat.statusCode, localRepeat.body).toBe(first.status)
  expect(await lines()).toHaveLength(afterRepeat.length)
  expect(localRepeat.json().nothingWritten).toBe(await sentence())
})

it('counts the line when the same retirement is repeated from another computer', async () => {
  const id = await startAgent('retire-test-agent')
  const path = `/api/participants/agent/${id}/retire`
  const payload = { because: 'The test no longer needs this agent.' }
  const before = await lines()
  const first = await remote(path, payload)
  expect(first.status, first.text).toBe(200)
  const afterFirst = await lines()
  expect(afterFirst.length).toBe(before.length + 1)
  const repeat = await remote(path, payload)
  expect(repeat.status, repeat.text).toBe(first.status)
  const afterRepeat = await lines()
  expect(afterRepeat.length).toBe(afterFirst.length + 1)
  expect(repeat.body).not.toHaveProperty('nothingWritten')
  const localRepeat = await local('POST', path, payload)
  expect(localRepeat.statusCode, localRepeat.body).toBe(first.status)
  expect(await lines()).toHaveLength(afterRepeat.length)
  expect(localRepeat.json().nothingWritten).toBe(await sentence())
})
