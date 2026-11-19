// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { chmodSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { aSecretsMark, theKeySlotsFile, writeTheKeySlots } from '../src/config/provider-router.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
const slots = [
  { id: 'go-1', label: 'First Go', provider: 'opencode-go', key: 'made-up-pin-key-one' },
  { id: 'go-2', label: 'Second Go', provider: 'opencode-go', key: 'made-up-pin-key-two' },
  { id: 'ds-1', label: 'DeepSeek', provider: 'deepseek', key: 'made-up-pin-key-three' },
]
let folder = ''
let app: FastifyInstance
let db: TestDb
const keys: Record<string, string> = {}
const before: Record<string, string | undefined> = {}

beforeAll(async () => {
  for (const name of ['HOME', 'MOLE_OFFICE_PROVIDER_ROUTER']) before[name] = process.env[name]
  folder = aTestDatabaseFolder('pin')
  process.env.HOME = join(folder, 'home')
  process.env.MOLE_OFFICE_PROVIDER_ROUTER = 'on'
  mkdirSync(join(process.env.HOME, '.config', 'mole-office'), { recursive: true, mode: 0o700 })
  chmodSync(join(process.env.HOME, '.config', 'mole-office'), 0o700)
  writeTheKeySlots(theKeySlotsFile(process.env.HOME), slots)
  db = await freshDb(); app = (await apiApp()).app
  for (const role of ['secretary', 'worker']) {
    const created = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle: `pin-${role}`, name: `Pin ${role}`, role, runtime: 'dsh' } })
    expect(created.statusCode).toBe(201)
    keys[role] = (created.json() as { whatToGiveIt: { key: string } }).whatToGiveIt.key
  }
}, 60_000)
afterAll(async () => {
  await app?.close(); db?.close()
  for (const [name, value] of Object.entries(before)) if (value === undefined) delete process.env[name]; else process.env[name] = value
  if (folder) removeThisTestFolder(folder)
})

it('allows the person and a secretary to set or clear a Go pin but refuses a worker', async () => {
  const pin = (headers: Record<string, string>, id: string | null) => app.inject({ method: 'POST', url: '/api/provider-router/pin', headers, payload: { id } })
  const secretary = { 'x-mole-office-key': keys.secretary! }
  const worker = { 'x-mole-office-key': keys.worker! }
  expect((await pin(worker, 'go-2')).statusCode).toBe(403)
  expect((await pin(person, 'ds-1')).statusCode).toBe(400)
  expect((await pin(person, 'go-2')).statusCode).toBe(200)
  let reading = await app.inject({ method: 'GET', url: '/api/provider-router/key-slots', headers: person })
  expect(reading.statusCode).toBe(200)
  expect(reading.json().pin).toMatchObject({ slot: 'go-2' })
  const file = join(process.env.HOME!, '.config', 'mole-office', 'go-pin.json')
  const written = readFileSync(file, 'utf8')
  expect(statSync(file).mode & 0o777).toBe(0o600)
  expect(JSON.parse(written)).toMatchObject({ slot: 'go-2', who: expect.any(String), at: expect.any(String) })
  for (const slot of slots) expect(written.includes(slot.key)).toBe(false)
  expect((await pin(secretary, 'go-1')).statusCode).toBe(200)
  reading = await app.inject({ method: 'GET', url: '/api/provider-router/key-slots', headers: person })
  expect(reading.json().pin).toMatchObject({ slot: 'go-1' })
  expect(reading.json().slots).toContainEqual(expect.objectContaining({ id: 'go-1', mark: aSecretsMark(slots[0]!.key) }))
  expect((await pin(worker, null)).statusCode).toBe(403)
  expect((await pin(secretary, null)).statusCode).toBe(200)
  reading = await app.inject({ method: 'GET', url: '/api/provider-router/key-slots', headers: person })
  expect(reading.json().pin).toBeNull()
}, 60_000)
