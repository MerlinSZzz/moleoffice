// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { chmodSync, mkdirSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { aSecretsMark, theKeySlotsFile, writeTheKeySlots } from '../src/config/provider-router.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { aRouterFolderFor } from '../tools/provider-router-host.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'

const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
const slots = [
  { id: 'slot-go', label: 'Go slot', provider: 'opencode-go', key: 'made-up-usage-go-key' },
  { id: 'slot-openai', label: 'OpenAI slot', provider: 'openai', key: 'made-up-usage-openai-key' },
  { id: 'slot-anthropic', label: 'Anthropic slot', provider: 'anthropic', key: 'made-up-usage-anthropic-key' },
]
const pairs = slots.map((slot) => ({ provider: slot.provider, model: 'made-up-model' }))
let folder = ''
let db: TestDb
let app: FastifyInstance
let vendor: Server
let router: ReturnType<typeof createProviderRouter>
let socket = ''
let runs: { id: string; token: string }[] = []
const agentKeys: Record<string, string> = {}
const before: Record<string, string | undefined> = {}

function post(path: string, token: string, stream: boolean, noUsage = false): Promise<number> {
  return new Promise((done, reject) => {
    const req = request({ socketPath: socket, path, method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode ?? 0)) })
    req.on('error', reject); req.end(JSON.stringify({ model: 'made-up-model', stream, noUsage }))
  })
}

beforeAll(async () => {
  for (const name of ['HOME', 'MOLE_OFFICE_PROVIDER_ROUTER']) before[name] = process.env[name]
  folder = aTestDatabaseFolder('usage')
  process.env.HOME = join(folder, 'home')
  process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on'
  mkdirSync(join(process.env.HOME, '.config', 'mole-office'), { recursive: true, mode: 0o700 })
  chmodSync(join(process.env.HOME, '.config', 'mole-office'), 0o700)
  writeTheKeySlots(theKeySlotsFile(process.env.HOME), slots)
  db = await freshDb()
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  const office = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`
  for (const role of ['secretary', 'worker']) {
    const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle: `usage-${role}`, name: `Usage ${role}`, role, runtime: 'dsh' } })
    expect(registered.statusCode).toBe(201)
    agentKeys[role] = (registered.json() as { whatToGiveIt: { key: string } }).whatToGiveIt.key
  }
  const { createRunTokenStore } = await import('../src/server/lib/keyrouter/run-tokens.ts')
  for (let i = 0; i < 2; i++) {
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'session', title: `Usage run ${i}`, data: { state: 'running' } } })
    expect(made.statusCode).toBe(201)
    const id = (made.json() as { record: { id: string } }).record.id
    runs.push({ id, token: createRunTokenStore(db.client.sqlite).mint(id, 'casting', pairs, 0.5).token })
  }
  vendor = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (part: Buffer) => parts.push(part))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(parts).toString()) as { stream: boolean; noUsage: boolean }
      if (body.noUsage) { res.writeHead(200, { 'content-type': 'application/json' }).end('{}'); return }
      const anthropic = req.url === '/messages'
      const responses = req.url === '/responses'
      const usage = anthropic ? { input_tokens: 10, output_tokens: 4, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 }
        : responses ? { input_tokens: 10, output_tokens: 4, input_tokens_details: { cached_tokens: 2 } }
          : { prompt_tokens: 10, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 2 } }
      let answer = JSON.stringify({ usage })
      if (body.stream) {
        answer = anthropic ? `data: ${JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } } })}\n\ndata: ${JSON.stringify({ type: 'message_delta', usage: { output_tokens: 4 } })}\n\n`
          : `data: ${JSON.stringify(responses ? { type: 'response.completed', response: { usage } } : { usage })}\n\n`
      }
      res.writeHead(200, { 'content-type': body.stream ? 'text/event-stream' : 'application/json' }).end(answer)
    })
  })
  await new Promise<void>((done) => vendor.listen(0, '127.0.0.1', done))
  const upstream = `http://127.0.0.1:${(vendor.address() as AddressInfo).port}`
  const sandboxes = join(folder, 's')
  mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
  aRouterFolderFor(join(sandboxes, '.run', 'a'))
  socket = join(sandboxes, '.run', 'a', 'provider-router', 'router.sock')
  router = createProviderRouter({ sandboxes, slots, office: { api: office, key: theOfficesKeyHeader()['x-mole-office-key']! }, upstreams: Object.fromEntries(slots.map((slot) => [slot.provider, upstream])), log: () => {} })
  await router.start(); await router.open('a')
}, 60_000)
afterAll(async () => {
  await router?.close()
  if (vendor) await new Promise<void>((done) => vendor.close(() => done()))
  await app?.close(); db?.close()
  for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value
  if (folder) removeThisTestFolder(folder)
})

describe('usage totals from settled receipts', () => {
  it('adds streamed and non-streamed wire usage per slot and per run without revealing keys', async () => {
    for (const [index, run] of runs.entries()) for (const path of ['/opencode-go/chat/completions', '/openai/responses', '/anthropic/messages']) {
      expect(await post(path, run.token, index === 1)).toBe(200)
    }
    const reply = await app.inject({ method: 'GET', url: '/api/provider-router/usage', headers: person })
    expect(reply.statusCode).toBe(200)
    const body = reply.json() as { slots: { id: string; label: string; provider: string; mark: string; requests: number; inputTokens: number; cachedInputTokens: number; outputTokens: number }[]; runs: { run: string; requests: number; inputTokens: number; cachedInputTokens: number; outputTokens: number }[] }
    for (const slot of slots) expect(body.slots).toContainEqual(expect.objectContaining({ id: slot.id, label: slot.label, provider: slot.provider, mark: aSecretsMark(slot.key), requests: 2, inputTokens: slot.provider === 'anthropic' ? 30 : 20, cachedInputTokens: 4, outputTokens: 8 }))
    for (const run of runs) expect(body.runs).toContainEqual(expect.objectContaining({ run: run.id, requests: 3, inputTokens: 35, cachedInputTokens: 6, outputTokens: 12 }))
    for (const slot of slots) expect(reply.body.includes(slot.key)).toBe(false)
  })

  it('counts an answer without usage without adding tokens to its slot or run', async () => {
    const read = async () => (await app.inject({ method: 'GET', url: '/api/provider-router/usage', headers: person })).json() as {
      slots: { id: string; requests: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; withoutUsage: number; withoutCachedUsage: number }[]
      runs: { run: string; requests: number; inputTokens: number; cachedInputTokens: number; outputTokens: number; withoutUsage: number; withoutCachedUsage: number }[]
    }
    const before = await read()
    expect(await post('/opencode-go/chat/completions', runs[0]!.token, false, true)).toBe(200)
    const after = await read()
    const slotBefore = before.slots.find((one) => one.id === 'slot-go')!
    const slotAfter = after.slots.find((one) => one.id === 'slot-go')!
    const runBefore = before.runs.find((one) => one.run === runs[0]!.id)!
    const runAfter = after.runs.find((one) => one.run === runs[0]!.id)!
    for (const [earlier, later] of [[slotBefore, slotAfter], [runBefore, runAfter]] as const) {
      expect(later.requests).toBe(earlier.requests + 1)
      expect(later.withoutUsage).toBe(1)
      expect(later.inputTokens).toBe(earlier.inputTokens)
      expect(later.cachedInputTokens).toBe(earlier.cachedInputTokens)
      expect(later.outputTokens).toBe(earlier.outputTokens)
    }
    // A previously stored receipt can know its input while lacking a cached-input measurement.
    db.client.sqlite.prepare('UPDATE router_receipts SET cached_input_tokens = NULL WHERE rowid = (SELECT rowid FROM router_receipts WHERE run_id = ? AND slot = ? AND input_tokens IS NOT NULL LIMIT 1)').run(runs[0]!.id, 'slot-go')
    const missingCached = await read()
    expect(missingCached.slots.find((one) => one.id === 'slot-go')!.withoutCachedUsage).toBe(1)
    expect(missingCached.runs.find((one) => one.run === runs[0]!.id)!.withoutCachedUsage).toBe(1)
  })

  it('allows a secretary holding its own key and refuses a worker', async () => {
    const secretary = await app.inject({ method: 'GET', url: '/api/provider-router/usage', headers: { 'x-mole-office-key': agentKeys.secretary! } })
    expect(secretary.statusCode).toBe(200)
    const worker = await app.inject({ method: 'GET', url: '/api/provider-router/usage', headers: { 'x-mole-office-key': agentKeys.worker! } })
    expect(worker.statusCode).toBe(403)
  })

})
