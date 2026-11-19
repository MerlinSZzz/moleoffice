// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { aSecretsMark } from '../src/config/provider-router.mjs'
import { aRouterFolderFor, theStartWhenEveryGoSlotIsUsedUp } from '../tools/provider-router-host.mjs'
import { createProviderRouter } from '../tools/provider-router.mjs'
import { removeThisTestFolder } from './a-test-folder.ts'

const slots = [
  { id: 'go-1', label: 'First Go', provider: 'opencode-go', key: 'made-up-switch-go-one' },
  { id: 'go-2', label: 'Second Go', provider: 'opencode-go', key: 'made-up-switch-go-two' },
  { id: 'ds-1', label: 'DeepSeek', provider: 'deepseek', key: 'made-up-switch-deepseek' },
]
async function listen(server: Server): Promise<string> {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
function ask(socketPath: string, token: string): Promise<number> {
  return new Promise((done, reject) => {
    const req = request({ socketPath, agent: false, path: '/opencode-go/chat/completions', method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }, (res) => { res.resume(); res.on('end', () => done(res.statusCode ?? 0)) })
    req.on('error', (error) => reject(new Error(`sandbox request ${token}: ${error.message}`))); req.end(JSON.stringify({ model: 'made-up-model' }))
  })
}

it('pins new runs, hands off on a limit, retains the pin and records the hand-off and fallback without keys', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'go-switch-'))
  const sandboxes = join(folder, 's')
  const state = join(folder, 'state')
  mkdirSync(state, { mode: 0o700 })
  const pinFile = join(state, 'go-pin.json')
  const switchLog = join(state, 'go-switches.jsonl')
  writeFileSync(pinFile, JSON.stringify({ slot: 'go-2', who: 'person', at: '2026-11-17T00:00:00Z' }), { mode: 0o600 })
  mkdirSync(join(sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
  aRouterFolderFor(join(sandboxes, '.run', 'a'))
  const seen: string[] = []
  const refused = new Set<string>()
  const office = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (part: Buffer) => chunks.push(part))
    req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { token?: string }
      res.writeHead(req.url === '/api/provider-router/admissions' ? 200 : 201, { 'content-type': 'application/json' })
        .end(JSON.stringify(req.url === '/api/provider-router/admissions' ? { admitted: true, id: 'admission', run: body.token } : {}))
    })
  })
  const vendor = createServer((req, res) => {
    const slot = slots.find((one) => req.headers.authorization === `Bearer ${one.key}`)
    seen.push(slot?.id ?? 'unknown')
    req.resume()
    if (slot && refused.has(slot.id)) res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '120' }).end(JSON.stringify({ error: { type: 'GoUsageLimitError' } }))
    else res.writeHead(200, { 'content-type': 'application/json' }).end('{}')
  })
  let router: ReturnType<typeof createProviderRouter> | undefined
  try {
    const officeUrl = await listen(office)
    const upstream = await listen(vendor)
    const options = { sandboxes, slots, office: { api: officeUrl, key: 'made-up-office-key' }, upstreams: { 'opencode-go': upstream }, log: () => {}, pinFile, switchLog }
    router = createProviderRouter(options)
    await router.start(); await router.open('a')
    const socket = join(sandboxes, '.run', 'a', 'provider-router', 'router.sock')
    expect(await ask(socket, 'run-1')).toBe(200)
    expect(await ask(socket, 'run-2')).toBe(200)
    expect(seen).toEqual(['go-2', 'go-2'])
    refused.add('go-2')
    expect(await ask(socket, 'run-3')).toBe(200)
    expect(seen.slice(-2)).toEqual(['go-2', 'go-1'])
    expect(await ask(socket, 'run-1')).toBe(200)
    expect(seen.at(-1)).toBe('go-1')
    expect(await ask(socket, 'run-4')).toBe(200)
    expect(seen.at(-1)).toBe('go-1')
    expect(JSON.parse(readFileSync(pinFile, 'utf8')).slot).toBe('go-2')
    refused.add('go-1')
    expect(await ask(socket, 'run-5')).toBe(429)
    const selection = (runtime: string) => runtime === 'opencode'
      ? { runtime, model: 'opencode-go/made-up-model', native: { provider: 'opencode-go', model: 'made-up-model' }, casting: { id: 1 } }
      : { runtime, model: 'deepseek/made-up-model', native: { provider: 'deepseek-official', model: 'made-up-model' }, casting: { id: 2 } }
    const fallback = await theStartWhenEveryGoSlotIsUsedUp({ sandboxes, agent: 'made-up-agent', runtime: 'opencode', model: 'opencode-go/made-up-model', brief: 'brief', env: { MOLE_OFFICE_PROVIDER_ROUTER: 'on' }, ask: async (path: string) => ({ status: 200, body: { selection: selection(path.includes('runtime=dsh') ? 'dsh' : 'opencode') } }) }).catch((error: Error) => { throw new Error(`fallback request: ${error.message}`) })
    expect(fallback !== null && 'dsh' in fallback ? fallback.dsh?.runtime : null).toBe('dsh')
    const bytes = readFileSync(switchLog, 'utf8')
    const lines = bytes.trim().split('\n').map((line) => JSON.parse(line)) as Record<string, any>[]
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatchObject({ event: 'hand-off', run: 'run-3', from: { id: 'go-2', label: 'Second Go', mark: aSecretsMark(slots[1]!.key) }, to: { id: 'go-1', label: 'First Go', mark: aSecretsMark(slots[0]!.key) } })
    expect(lines[1]).toMatchObject({ event: 'hand-off', run: 'run-1', from: { id: 'go-2', label: 'Second Go', mark: aSecretsMark(slots[1]!.key) }, to: { id: 'go-1', label: 'First Go', mark: aSecretsMark(slots[0]!.key) } })
    expect(lines[2]).toMatchObject({ event: 'dsh', agent: 'made-up-agent', slots: expect.arrayContaining(slots.slice(0, 2).map(({ id, label, key }) => ({ id, label, mark: aSecretsMark(key) }))) })
    for (const line of lines) expect(typeof line.at).toBe('string')
    expect(fallback !== null && 'says' in fallback ? fallback.says : null).toContain(lines[2]!.id)
    expect(statSync(switchLog).mode & 0o777).toBe(0o600)
    expect(statSync(state).mode & 0o777).toBe(0o700)
    for (const slot of slots) expect(bytes.includes(slot.key)).toBe(false)
    await router.close(); router = undefined
    refused.clear(); seen.length = 0
    router = createProviderRouter(options)
    await router.start(); await router.open('a')
    expect(await ask(socket, 'run-after-restart')).toBe(200)
    expect(seen).toEqual(['go-2'])
  } finally {
    await router?.close()
    await Promise.all([office, vendor].map((server) => new Promise<void>((done) => server.close(() => done()))))
    removeThisTestFolder(folder)
  }
}, 60_000)
