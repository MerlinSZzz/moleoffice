// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic identities in an isolated test database. No running office is used. */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { generatePixelAppearance } from '../src/shared/pixel-office.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const SELF = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'synthetic-c-appearance' }
let database: TestDb, app: FastifyInstance, id: string, otherId: string
beforeAll(async () => {
  database = await freshDb(); app = (await apiApp()).app
  for (const handle of ['synthetic-c-appearance', 'synthetic-c-other']) {
    const response = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle, name: handle, workArea: ['src/shared'] } })
    expect(response.statusCode, response.body).toBe(201)
  }
  const find = (handle: string) => (database.client.sqlite.prepare('SELECT id FROM agents WHERE handle=?').get(handle) as { id: string }).id
  id = find('synthetic-c-appearance'); otherId = find('synthetic-c-other')
  // This compatibility test represents registrations from before automatic birth appearances.
  // New-registration generation has its own API test; the old NULL state is still supported.
  database.client.sqlite.prepare('UPDATE agents SET pixel_appearance=NULL WHERE id IN (?,?)').run(id, otherId)
})
afterAll(async () => { await app?.close(); database?.close() })

describe('C whole looks and saved version-1 choices', () => {
  it('keeps both appearance versions, rejects unsupported values, and never chooses or resizes on reads', async () => {
    const stored = () => database.client.sqlite.prepare('SELECT pixel_appearance,pixel_scale FROM agents WHERE id=?').get(id) as { pixel_appearance: string | null; pixel_scale: string }
    const read = async () => {
      const response = await app.inject({ url: '/api/office/appearance/' + id, headers: SELF })
      expect(response.statusCode, response.body).toBe(200); return response.json()
    }
    const viewedAppearance = async () => {
      const response = await app.inject({ url: '/api/plugin-read/v1/people', headers: SELF })
      expect(response.statusCode, response.body).toBe(200)
      return response.json().agents.find((agent: { id: string }) => agent.id === id)
    }
    const save = (appearance: unknown, target = id) => app.inject({ method: 'PUT', url: '/api/office/appearance/' + target, headers: SELF, payload: { appearance } })
    const initial = stored(), defaultRead = await read()
    expect(initial.pixel_appearance).toBeNull()
    expect(defaultRead).toMatchObject({ chosen: false, source: 'identity-default-c', appearance: { version: 2, style: 'c-forest' } })
    expect(['bare', 'scarf']).toContain(defaultRead.appearance.lookId)
    expect((await read()).appearance).toEqual(defaultRead.appearance)
    expect((await viewedAppearance()).appearance).toEqual(defaultRead.appearance)
    // The reads change nothing: these two agent columns must remain untouched.
    expect(stored()).toEqual(initial)

    const legacy = generatePixelAppearance('synthetic-legacy-outfit-to-preserve')
    expect((await save(legacy)).statusCode).toBe(200)
    expect(await read()).toMatchObject({ chosen: true, source: 'saved-legacy', appearance: legacy, cLook: null })
    expect((await viewedAppearance()).appearance).toEqual(legacy)
    expect(JSON.parse(stored().pixel_appearance!)).toEqual(legacy)
    expect(stored().pixel_scale).toBe(initial.pixel_scale)

    const chosen = { version: 2, style: 'c-forest', lookId: 'scarf' }
    expect((await save(chosen)).statusCode).toBe(200)
    expect(await read()).toMatchObject({ chosen: true, source: 'saved-c', appearance: chosen, cLook: 'scarf' })
    expect((await viewedAppearance()).appearance).toEqual(chosen)
    expect(JSON.parse(stored().pixel_appearance!)).toEqual(chosen)
    expect(stored().pixel_scale).toBe(initial.pixel_scale)
    for (const invalid of [{ ...chosen, top: legacy.top }, { ...chosen, lookId: 'not-a-published-look' }, { ...chosen, version: 3 }]) {
      expect((await save(invalid)).statusCode).toBe(400)
      expect((await read()).appearance).toEqual(chosen)
    }
    expect((await save(chosen, otherId)).statusCode).toBe(403)
    expect((database.client.sqlite.prepare('SELECT pixel_appearance FROM agents WHERE id=?').get(otherId) as { pixel_appearance: null }).pixel_appearance).toBeNull()

    expect((await save(null)).statusCode).toBe(200)
    expect(await read()).toMatchObject({ chosen: false, source: 'identity-default-c', appearance: defaultRead.appearance })
    expect((await viewedAppearance()).appearance).toEqual(defaultRead.appearance)
    expect(stored()).toEqual(initial)
  })
})
