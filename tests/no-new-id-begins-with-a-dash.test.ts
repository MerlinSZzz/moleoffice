// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const dashP = vi.hoisted(() => ({ on: false }))
vi.mock('nanoid', async (original) => {
  const real = await original<typeof import('nanoid')>()
  return { ...real, nanoid: (size?: number) => (dashP.on && size === 12 ? '-p' + real.nanoid(10) : real.nanoid(size)) }
})

let t: TestDb
let app: FastifyInstance
let anOfficeId: () => string
const asThePerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
const AN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{11}$/

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  anOfficeId = (await import('../src/server/lib/ids.ts')).anOfficeId
})

afterAll(async () => {
  dashP.on = false
  await app?.close()
  t?.close()
})

describe('an id the office makes', () => {
  it('begins with a letter or a digit, in 200,000 of them, and keeps the rest of what nanoid drew', () => {
    const bad: string[] = []
    for (let n = 0; n < 200_000; n++) {
      const id = anOfficeId()
      if (!AN_ID.test(id)) bad.push(id)
    }
    expect(bad.slice(0, 5), `${bad.length} ids of the wrong shape`).toEqual([])

    dashP.on = true
    const mended = anOfficeId()
    dashP.on = false
    expect(mended).toMatch(AN_ID)
    expect(mended.slice(1, 2)).toBe('p')
  })

  it('begins with a letter or a digit for a filed record and a registered agent, even when nanoid draws a dash', async () => {
    dashP.on = true
    const filed = await app.inject({ method: 'POST', url: '/api/records', headers: asThePerson, payload: { kind: 'note', title: 'Test: a record filed while nanoid draws a dash' } })
    const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asThePerson, payload: { handle: 'dash-free-agent', name: 'Synthetic agent', role: 'worker', workArea: ['src'] } })
    dashP.on = false
    expect(filed.statusCode, filed.body).toBe(201)
    expect(started.statusCode, started.body).toBe(201)
    expect((filed.json() as { record: { id: string } }).record.id).toMatch(AN_ID)
    expect((started.json() as { agent: { id: string } }).agent.id).toMatch(AN_ID)
  })

})
