// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE MERGE TOOL RUNS AN ENTRY'S RELATED TESTS FIRST IS ONE SETTING, OFF UNTIL SOMEBODY SWITCHES IT ON. Round
 * 17c of wave 13v, on part B of a decision and on message xTBpZSUFC-Qi.
 *
 * WHAT THIS FILE PROVES, in its own empty office:
 * 1. Nobody having chosen reads as off, and the reading states the bound of 120 seconds.
 * 2. The owner switches it on with no reason, and the change is kept with who.
 * 3. A secretary proved by its own key switches it only with a reason, and the reason is kept with the change.
 * 4. Any other agent is refused, a secretary with no key among them, and nothing is changed.
 * 5. A body that is not true, false or null is refused, and nothing is changed.
 * 6. A stored value that is not 0, 1 or nothing is not read as off or on: the reading refuses it.
 *
 * WHERE THE RULES LIVE: src/server/lib/related-tests-first.ts (the one reader and writer) and
 * src/server/api/related-tests-first.ts (who may switch it).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const keyOf: Record<string, string> = {}

async function register(handle: string, role: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: handle, role } })
  expect(reply.statusCode, `registering ${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
  keyOf[handle] = String((reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key ?? '')
  expect(keyOf[handle], `${handle} was given a key`).toMatch(/^[0-9a-f]{64}$/)
}

/** The headers of an agent's request, proved by its own key unless `keyed` is false. */
function asAgent(handle: string, keyed = true): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    ...(keyed ? { 'x-mole-office-key': keyOf[handle]! } : {}),
  }
}

async function reading(): Promise<{ on: boolean; nobodyChose: boolean; leaveOutSlowerThanSeconds: number; says: string }> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/related-tests-first', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json()
}

function press(headers: Record<string, string>, payload: object) {
  return app.inject({ method: 'POST', url: '/api/office/related-tests-first', headers, payload })
}

/** The newest kept change to this setting. */
async function theLastChange(): Promise<{ by: { type: string; id: string }; to: string | null } | null> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/setting-changes', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 300)).toBe(200)
  return reply.json().settings['related-tests-first']
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register('clerk', 'secretary')
  await register('mason', 'worker')
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('whether the related tests run first', () => {
  it('1. reads as off while nobody has chosen, and states the bound', async () => {
    const read = await reading()
    expect(read).toMatchObject({ on: false, nobodyChose: true, leaveOutSlowerThanSeconds: 120 })
    expect(read.says).toContain('Off: nobody has switched it on.')
    expect(read.says).toContain('any file whose longest recorded time is over 120 seconds')
    expect(await theLastChange()).toBeNull()
  })

  it('2. the owner switches it on with no reason, and the change is kept with who', async () => {
    const pressed = await press(AS_THE_PERSON, { on: true })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(200)
    expect(pressed.json()).toMatchObject({ on: true, nobodyChose: false })
    expect((await reading()).on).toBe(true)
    const last = await theLastChange()
    expect(last?.by).toEqual({ type: 'human', id: THE_PERSON })
    expect(last?.to).toBe('true')
  })

  it('3. a secretary with its own key switches it only with a reason, and the reason is kept', async () => {
    const without = await press(asAgent('clerk'), { on: false })
    expect(without.statusCode, without.body.slice(0, 300)).toBe(400)
    expect(without.body).toContain('gives a reason, in \\"because\\". Nothing was changed.')
    expect((await reading()).on, 'nothing was changed').toBe(true)
    const pressed = await press(asAgent('clerk'), { on: false, because: 'It slowed a green entry by 9 minutes.' })
    expect(pressed.statusCode, pressed.body.slice(0, 300)).toBe(200)
    expect(pressed.json()).toMatchObject({ on: false, nobodyChose: false })
    const last = await theLastChange()
    expect(last?.by.id).not.toBe(THE_PERSON)
    expect(last?.to).toContain('It slowed a green entry by 9 minutes.')
  })

  it('4. any other agent is refused, and a secretary with no key, and nothing is changed', async () => {
    for (const headers of [asAgent('mason'), asAgent('clerk', false)]) {
      const refused = await press(headers, { on: true, because: 'faster' })
      expect(refused.statusCode, refused.body.slice(0, 300)).toBe(403)
      expect(refused.body).toContain('is switched by the owner or by a secretary with a reason')
    }
    expect((await reading()).on, 'nothing was changed').toBe(false)
  })

  it('5. a body that is not true, false or null is refused, and nothing is changed', async () => {
    for (const payload of [{ on: 'yes' }, {}, { on: true, also: 1 }]) {
      const refused = await press(AS_THE_PERSON, payload)
      expect(refused.statusCode, `${JSON.stringify(payload)}: ${refused.body.slice(0, 300)}`).toBe(400)
    }
    expect((await reading()).on, 'nothing was changed').toBe(false)
  })

  it('6. a stored value that is not 0, 1 or nothing is refused, not read as off or on', async () => {
    t.client.sqlite.prepare('UPDATE installation SET related_tests_first = 2 WHERE only_row = 1').run()
    try {
      const reply = await app.inject({ method: 'GET', url: '/api/office/related-tests-first', headers: AS_THE_PERSON })
      expect(reply.statusCode).toBe(500)
      expect(reply.body).toContain('stored as 2 in installation.related_tests_first')
    } finally {
      t.client.sqlite.prepare('UPDATE installation SET related_tests_first = NULL WHERE only_row = 1').run()
    }
    expect(await reading()).toMatchObject({ on: false, nobodyChose: true })
  })
})
