// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A limit-refused Go slot hands the request to the next slot without changing the slots file.
 * The shipped router reads a real temporary slots file and carries the request through a Unix socket;
 * the office and Go vendor are loopback stand-ins, and all keys are made up.
 * Mutation: the slots reader also appends to the file. The before-and-after SHA-256 check fails.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { readTheKeySlots, writeTheKeySlots } from '../src/config/provider-router.mjs'
import { aRouterFolderFor } from '../tools/provider-router-host.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { removeThisTestFolder } from './a-test-folder.ts'

const folder = mkdtempSync(join(tmpdir(), 'go-handoff-'))
const slotsFile = join(folder, 'key-slots.json')
const slots = [
  { id: 'go-1', label: 'First', provider: 'opencode-go', key: 'made-up-handoff-key-one' },
  { id: 'go-2', label: 'Second', provider: 'opencode-go', key: 'made-up-handoff-key-two' },
]
let office: Server
let vendor: Server
let router: ReturnType<typeof createProviderRouter>

function digest(): string { return createHash('sha256').update(readFileSync(slotsFile)).digest('hex') }
async function listen(server: Server): Promise<string> {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
function ask(socketPath: string): Promise<number> {
  return new Promise((done, reject) => {
    const req = request({ socketPath, path: '/opencode-go/chat/completions', method: 'POST', headers: { authorization: 'Bearer made-up-run-token', 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode ?? 0)) })
    req.on('error', reject); req.end(JSON.stringify({ model: 'made-up-model' }))
  })
}
afterAll(async () => {
  await router?.close()
  for (const server of [office, vendor]) if (server) await new Promise<void>((done) => server.close(() => done()))
  removeThisTestFolder(folder)
})

it('leaves the slots file byte-for-byte unchanged while a request hands off', async () => {
  writeTheKeySlots(slotsFile, slots)
  const before = digest()
  const seen: string[] = []
  office = createServer((req, res) => {
    req.resume()
    res.writeHead(req.url === '/api/provider-router/admissions' ? 200 : 201, { 'content-type': 'application/json' })
      .end(JSON.stringify(req.url === '/api/provider-router/admissions' ? { admitted: true, id: 'admission', run: 'made-up-run' } : {}))
  })
  vendor = createServer((req, res) => {
    const slot = slots.find((one) => req.headers.authorization === `Bearer ${one.key}`)
    seen.push(slot?.id ?? 'unknown')
    req.resume()
    if (slot?.id === 'go-1') res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '120' }).end(JSON.stringify({ error: { type: 'GoUsageLimitError' } }))
    else res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  })
  const officeUrl = await listen(office)
  const upstream = await listen(vendor)
  const sandboxes = join(folder, 's')
  mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
  aRouterFolderFor(join(sandboxes, '.run', 'a'))
  router = createProviderRouter({ sandboxes, slots: () => readTheKeySlots(slotsFile), office: { api: officeUrl, key: 'made-up-office-key' }, upstreams: { 'opencode-go': upstream }, log: () => {} })
  await router.start(); await router.open('a')
  expect(await ask(join(sandboxes, '.run', 'a', 'provider-router', 'router.sock'))).toBe(200)
  expect(seen).toEqual(['go-1', 'go-2'])
  expect(digest()).toBe(before)
}, 60_000)
