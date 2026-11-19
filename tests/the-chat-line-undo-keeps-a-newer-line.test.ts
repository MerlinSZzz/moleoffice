// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { buildTheFirstOfficeInAHook, apiApp, freshDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

// The first office of this process is built in a hook, so no case below pays for it (wave 13t round 34).
buildTheFirstOfficeInAHook()

it('restores a matching line, refuses a newer line before any write, and keeps an ordinary state write working', async () => {
  const db = await freshDb()
  const { app } = await apiApp()
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
  try {
    await app.ready()
    const made = await app.inject({ method: 'POST', url: '/api/records', headers,
      payload: { kind: 'agent', title: 'Fern Test', data: { handle: 'fern-undo-test', runtime: 'codex', state: 'active' } } })
    expect(made.statusCode, made.body).toBe(201)
    const path = '/api/participants/agent/fern-undo-test'
    const write = (payload: Record<string, unknown>) => app.inject({ method: 'PATCH', url: path, headers, payload })
    expect((await write({ state: 'Checking the test shelf' })).statusCode).toBe(200)
    expect((await write({ state: '', stateWas: 'Checking the test shelf' })).statusCode).toBe(200)
    const restored = await write({ state: 'Checking the test shelf', stateWas: null })
    expect(restored.statusCode, restored.body).toBe(200)
    expect(restored.json().participant.state).toBe('Checking the test shelf')
    expect(restored.json().participant.stateBy).toEqual({ kind: 'person', id: THE_PERSON })
    expect((await write({ state: 'A newer test line' })).statusCode).toBe(200)
    const refused = await write({ name: 'Should not be written', state: 'Old words', stateWas: null })
    expect(refused.statusCode, refused.body).toBe(409)
    expect(refused.json().error).toContain('The line changed')
    const kept = (await app.inject({ method: 'GET', url: path, headers })).json().participant
    expect(kept.name).toBe('Fern Test')
    expect(kept.state).toBe('A newer test line')
    expect((await write({ state: 'An ordinary replacement' })).statusCode).toBe(200)
    expect((await write({ stateWas: null, name: 'Still not written' })).statusCode).toBe(400)
  } finally { await app.close(); db.close() }
}, 60_000)
