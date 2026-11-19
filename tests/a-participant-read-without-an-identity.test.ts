// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The participant reads keep their public rows without giving an unproved caller the person's look. */
import { writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { forgetTheWorldsOwnAuthority } from '../src/server/lib/worldauthority.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

const personKey = 'a7'.repeat(32)
const officeKey = 'b8'.repeat(32)
const workspace = { 'x-mole-office-workspace': 'default' }
const person = { ...workspace, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey }
const look = { chosen: 'auto', own: [] }
let db: TestDb
let app: FastifyInstance
let api = ''
let agentKey = ''
let agentId = ''

async function read(path: string, headers: Record<string, string> = workspace) {
  const response = await fetch(`${api}${path}`, { headers })
  return { status: response.status, body: await response.json() as Record<string, any> }
}

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_WORLD_STARTED_BY']
  delete process.env['MOLE_OFFICE_WORLD_SECRETARIES']
  forgetTheWorldsOwnAuthority()
  db = await freshDb()
  writeFileSync(join(dirname(db.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const registered = await fetch(`${api}/api/agents/started`, {
    method: 'POST', headers: { ...person, 'content-type': 'application/json' },
    body: JSON.stringify({ ...THE_TEST_OFFICES_SECRETARY, role: 'worker' }),
  })
  expect(registered.status).toBe(201)
  const made = await registered.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
  agentId = made.agent.id
  agentKey = made.whatToGiveIt.key
  db.client.sqlite.prepare('UPDATE people SET themes = ? WHERE id = ?').run(JSON.stringify(look), THE_PERSON)
  const close = await fetch(`${api}/api/office/key-window/close`, { method: 'POST', headers: person })
  expect(close.status, await close.text()).toBe(200)
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

describe('participant reads after the key window closes', () => {
  it.each(['', '?shape=page'])('answers the roster%s to an unnamed keyless reader without the private look', async (query) => {
    const answer = await read(`/api/participants${query}`)
    expect(answer.status).toBe(200)
    const row = (answer.body['people'] as Record<string, unknown>[]).find(one => one['id'] === THE_PERSON)
    expect(row).toBeDefined()
    expect(row).not.toHaveProperty('themes')
    expect((answer.body['agents'] as Record<string, unknown>[]).some(one => one['id'] === agentId)).toBe(true)
  })

  it('answers a single person and agent to an unnamed keyless reader without the private look', async () => {
    for (const [kind, id] of [['person', THE_PERSON], ['agent', agentId]]) {
      const answer = await read(`/api/participants/${kind}/${id}`)
      expect(answer.status).toBe(200)
      expect(answer.body['participant']).toMatchObject({ id })
      expect(answer.body['participant']).not.toHaveProperty('themes')
    }
  })

  it.each(['/api/participants', '/api/participants?shape=page', `/api/participants/person/${THE_PERSON}`])('gives the look to the person and not to an agent on %s', async (path) => {
    const own = await read(path, person)
    const other = await read(path, { ...workspace, 'x-mole-office-key': agentKey })
    expect(own.status).toBe(200)
    expect(other.status).toBe(200)
    const row = (answer: Record<string, any>) => path.includes('/person/') ? answer['participant'] : answer['people'].find((one: { id: string }) => one.id === THE_PERSON)
    expect(row(own.body).themes).toEqual(look)
    expect(row(other.body)).not.toHaveProperty('themes')
  })

  it.each([
    ['human', () => THE_PERSON],
    ['agent', () => agentId],
  ])('answers a keyless %s claim without treating it as the person', async (type, id) => {
    for (const path of ['/api/participants', `/api/participants/person/${THE_PERSON}`, `/api/participants/agent/${agentId}`]) {
      const answer = await read(path, { ...workspace, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id() })
      expect(answer.status).toBe(200)
      const row = path.includes('/person/') ? answer.body['participant'] : path === '/api/participants' ? answer.body['people'].find((one: { id: string }) => one.id === THE_PERSON) : answer.body['participant']
      expect(row).not.toHaveProperty('themes')
    }
  })

  it.each(['/api/participants', `/api/participants/person/${THE_PERSON}`])('still refuses an invalid key and a conflicting identity on %s', async (path) => {
    const invalid = await read(path, { ...workspace, 'x-mole-office-key': 'c9'.repeat(32) })
    expect(invalid.status).toBe(401)
    const conflict = await read(path, { ...workspace, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': agentKey })
    expect(conflict.status).toBe(403)
  })
})
