// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const handle = `test-${randomBytes(8).toString('hex')}`
const person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': 'default' }
let t: TestDb
let app: FastifyInstance
let agentId: string
let waitersHeld: typeof import('../src/server/lib/waiting-hold.ts').waitersHeld

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  ;({ waitersHeld } = await import('../src/server/lib/waiting-hold.ts'))
  const registered = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
    kind: 'agent', title: 'An agent receiving letters', data: { handle, runtime: 'claude-code', state: 'active' },
  } })
  expect(registered.statusCode, registered.body).toBe(201)
  const participants = await app.inject({ method: 'GET', url: '/api/participants', headers: person })
  agentId = (participants.json().agents as { id: string; handle: string }[]).find((a) => a.handle === handle)!.id
}, 60_000)

afterAll(async () => { await app.close(); t.close() })

it('keeps the request held after a refusal and wakes it for a stored delivery', async () => {
  let answered = false
  const pending = app.inject({ method: 'GET', url: `/api/handles/${encodeURIComponent(handle)}/waiting?wait=20`, headers: person })
    .then((response) => { answered = true; return response })
  try {
    const deadline = Date.now() + 5_000
    while (waitersHeld() === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
    expect(waitersHeld()).toBe(1)

    const title = 'A letter concerning the trial'
    const body = { kind: 'message', title, data: { body: 'A trial needs attention.', to: [{ kind: 'agent', id: agentId }] } }
    const refused = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
      ...body, shortForms: { forms: { label: 'A letter concerning' } },
    } })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.json().error).toContain('opening of')
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(answered).toBe(false)
    expect(waitersHeld()).toBe(1)

    const stored = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: body })
    expect(stored.statusCode, stored.body).toBe(201)
    const answer = await pending
    expect(answer.statusCode, answer.body).toBe(200)
    expect(answered).toBe(true)
  } finally {
    // A failed assertion must still release the held request before the app closes.
    if (!answered && waitersHeld() > 0) {
      await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: {
        kind: 'message', title: 'A delivery to release the wait', data: { body: 'The wait can close.', to: [{ kind: 'agent', id: agentId }] },
      } })
      await pending
    }
  }
})

it('does not print a routed notice for a note whose forms are refused', async () => {
  const retired = await app.inject({ method: 'POST', url: `/api/participants/agent/${agentId}/retire`, headers: person,
    payload: { because: 'The assigned work is complete.' } })
  expect(retired.statusCode, retired.body).toBe(200)
  const author = { ...person, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': agentId }
  const { FOR_THE_PERSON_TO_FILE } = await import('../src/server/lib/the-persons-own-words.ts')
  const printed = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    const body = { kind: 'note', title: 'A note concerning the trial', data: { body: 'The trial needs attention.', [FOR_THE_PERSON_TO_FILE]: true } }
    const control = await app.inject({ method: 'POST', url: '/api/records', headers: author, payload: body })
    expect(control.statusCode, control.body).toBe(201)
    expect(printed.mock.calls.length).toBeGreaterThan(0)
    printed.mockClear()
    const refused = await app.inject({ method: 'POST', url: '/api/records', headers: author,
      payload: { ...body, shortForms: { forms: { label: 'A note concerning' } } } })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.json().error).toContain('opening of')
    expect(printed).not.toHaveBeenCalled()
  } finally {
    printed.mockRestore()
  }
})
