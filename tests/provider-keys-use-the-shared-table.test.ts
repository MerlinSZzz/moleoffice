// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createProviderKeySetup, keyFileFor } from '../src/server/lib/provider-key-setup.ts'
import providerRows from '../src/config/provider-setup/providers.json'

const roots: string[] = []
const secret = 'demo_FAKE_ONLY_83174_VALUE'
function fixture(url: string | null = null) {
  const home = mkdtempSync(join(tmpdir(), 'provider-service-'))
  roots.push(home)
  const row = { id: 'demo', name: 'Demonstration', folder: 'demonstration', file: 'key', prefix: 'demo_', min: 12,
    page: 'https://example.invalid', documentation: 'https://example.invalid/docs', instructions: 'Choose read access.', scopes: 'read',
    trial: url === null ? null : { method: 'GET', url }, trialDescription: 'Read only.' }
  return { home, row, service: createProviderKeySetup({ home, providers: [row] }) }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('offers a new provider row and saves its value without returning it', () => {
  const f = fixture()
  expect(f.service.list().some((row) => row.id === f.row.id)).toBe(true)
  const reply = f.service.save({ provider: f.row.id, value: secret })
  expect(JSON.stringify(reply).includes(secret)).toBe(false)
  expect(readFileSync(keyFileFor(f.home, f.row), 'utf8') === secret).toBe(true)
  expect(() => f.service.save({ provider: f.row.id, value: secret })).toThrow()
  expect(() => f.service.save({ provider: f.row.id, value: secret, replace: true })).not.toThrow()
})

it('checks custom and provider key shapes without returning the value', () => {
  const f = fixture(), bad = 'wrong_FAKE_ONLY_38123'
  let error = ''
  try { f.service.save({ provider: f.row.id, value: bad }) } catch (caught) { error = String(caught) }
  expect(error.length).toBeGreaterThan(0)
  expect(error.includes(bad)).toBe(false)
  expect(() => f.service.save({ provider: 'custom', customName: '../escape', prefix: 'demo_', min: 12, value: secret })).toThrow()
  const result = f.service.save({ provider: 'custom', customName: 'mine', prefix: 'demo_', min: 12, value: secret })
  expect(JSON.stringify(result).includes(secret)).toBe(false)
})

it('uses only a read-only request to a stand-in and refuses redirects', async () => {
  let requests = 0, received = false, redirected = 0
  const server = createServer((req, res) => {
    requests++
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/target' }); res.end(); return }
    if (req.url === '/target') redirected++
    received = req.method === 'GET' && req.headers.authorization === `Bearer ${secret}` && !req.url?.includes(secret)
    res.writeHead(200); res.end(secret)
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  try {
    const addr = server.address(); if (!addr || typeof addr === 'string') throw new Error('No server')
    const f = fixture(`http://127.0.0.1:${addr.port}/read`)
    f.service.save({ provider: f.row.id, value: secret })
    const result = await f.service.trial(f.row.id)
    expect(received).toBe(true)
    expect(JSON.stringify(result).includes(secret)).toBe(false)
    f.row.trial = { method: 'GET', url: `http://127.0.0.1:${addr.port}/redirect` }
    await expect(f.service.trial(f.row.id)).rejects.toThrow()
    expect(redirected).toBe(0)
    expect(requests).toBe(2)
  } finally { await new Promise<void>((ok) => server.close(() => ok())) }
}, 15000)

it('says what to leave off once in each guide: the scopes sentence does not say it again', () => {
  // Two long words in a row that both sentences use, such as a permission's name, mean the guide says it twice.
  const pairs = (text: string) => {
    const words = text.toLowerCase().match(/[\p{L}-]+/gu) ?? []
    return new Set(words.slice(1).map((word, at) => [words[at]!, word]).filter((pair) => pair.every((word) => word.length > 3)).map((pair) => pair.join(' ')))
  }
  const twice = providerRows.flatMap((row) => {
    if (typeof row.scopes !== 'string' || typeof row.otherPermissionsOff !== 'string') return []
    const off = pairs(row.otherPermissionsOff)
    return [...pairs(row.scopes)].filter((pair) => off.has(pair)).map((pair) => `${row.id}: ${pair}`)
  })
  expect(twice).toEqual([])
})

it('says plainly that the provider refuses this request, in each trial that passes on a refusal', () => {
  // A PASS BY REFUSAL IS THE OPPOSITE OF WHAT A PERSON EXPECTS, so the trial's paragraph says that the provider refuses
  // this very request, and that this refusal is the pass.
  const rows = providerRows.filter((row) => row.trial?.answers?.some((answer) => answer.means === 'passed' && answer.status >= 400))
  expect(rows.length).toBeGreaterThan(0)
  const unclear = rows.filter((row) => !['refuses this request', 'that refusal passes the trial'].every((words) => row.trialDescription?.includes(words)))
  expect(unclear.map((row) => row.id)).toEqual([])
})
