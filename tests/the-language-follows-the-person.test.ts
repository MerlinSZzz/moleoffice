// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { LANGUAGES } from '../src/shared/i18n.ts'

let db: TestDb
let app: FastifyInstance
const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const path = `/api/participants/person/${THE_PERSON}`

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => { await app?.close(); db?.close() })

it('stores only the declared languages on the person, clears to null, and refuses before changing a name', async () => {
  const original = (await app.inject({ url: path, headers })).json().participant
  expect(original.language).toBe(null)
  let lastSaved: string | null = null
  for (const language of Object.keys(LANGUAGES)) {
    const saved = await app.inject({ method: 'PATCH', url: path, headers, payload: { language } })
    expect(saved.statusCode, saved.body).toBe(200)
    expect(saved.json().participant.language).toBe(language)
    const read = await app.inject({ url: path, headers })
    expect(read.json().participant.language).toBe(language)
    lastSaved = language
  }
  for (const language of ['xx', 'fr', 'constructor', 'ZH', null]) {
    const refused = await app.inject({ method: 'PATCH', url: path, headers, payload: { language, name: 'Must not be written' } })
    expect(refused.statusCode, refused.body).toBe(400)
    if (language !== null) for (const allowed of Object.keys(LANGUAGES)) expect(refused.body).toContain(allowed)
    const unchanged = (await app.inject({ url: path, headers })).json().participant
    expect(unchanged.name).toBe(original.name)
    expect(unchanged.language, 'a refused write leaves the last language saved').toBe(lastSaved)
  }
  const cleared = await app.inject({ method: 'PATCH', url: path, headers, payload: { language: '' } })
  expect(cleared.statusCode, cleared.body).toBe(200)
  expect(cleared.json().participant.language).toBe(null)
})
