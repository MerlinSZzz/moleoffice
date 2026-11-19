// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { KEY_REVOCATION_UNDO_GRACE_MS, KEY_REVOCATION_UNDO_MS } from '../src/shared/danger-tiers.ts'

const owner = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const visitor = { ...owner, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'undo-test-device' }
let db: TestDb
let app: FastifyInstance
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(() => vi.useRealTimers())
afterAll(async () => { await app.close(); db.close() })

async function device(name: string) {
  const asked = await app.inject({ method: 'POST', url: '/api/office/visitors', headers: visitor, payload: { device: name } })
  expect(asked.statusCode, asked.body).toBe(201)
  const { credential, token } = asked.json<{ credential: { id: string }; token: string }>()
  const confirmed = await app.inject({ method: 'POST', url: `/api/office/visitors/${credential.id}/confirm`, headers: owner, payload: {} })
  expect(confirmed.statusCode, confirmed.body).toBe(200)
  return { id: confirmed.json<{ deviceKey: { id: string } }>().deviceKey.id, token, credential: credential.id }
}
const row = (id: string) => db.client.sqlite.prepare('SELECT * FROM held_keys WHERE id = ?').get(id) as Record<string, unknown>
async function revoke(id: string) {
  const reply = await app.inject({ method: 'POST', url: `/api/office/held-keys/${id}/revoke`, headers: owner, payload: {} })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json<{ revokedAt: string; undoRemainingMs: number }>()
}
const undo = (id: string, revokedAt: string, headers = owner) => app.inject({ method: 'POST',
  url: `/api/office/held-keys/${id}/revoke/undo`, headers, payload: { revokedAt } })
let probe = 80
const useKey = (token: string) => app.inject({ method: 'POST', url: '/api/office/trusted-machines',
  headers: { ...visitor, 'x-mole-office-key': token }, payload: { address: `198.51.100.${++probe}` } })

it('refuses the key immediately, checks the undo before writing, and restores it within the window', async () => {
  const held = await device('undo-within-the-window')
  expect((await useKey(held.token)).statusCode).toBe(200)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'))
  const started = Date.now()
  const receipt = await revoke(held.id)
  // THE STAMP IS THE COLUMN'S OWN FORM, local wall clock to the second, as every other revocation writes it.
  expect(receipt.revokedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  expect(row(held.id)['revoked_at']).toBe(receipt.revokedAt)
  expect(receipt.undoRemainingMs).toBe(KEY_REVOCATION_UNDO_MS)
  expect((await useKey(held.token)).statusCode).toBe(403)
  const revoked = row(held.id)
  const unproved = await undo(held.id, receipt.revokedAt, visitor)
  expect(unproved.statusCode, unproved.body).toBe(403)
  expect(row(held.id)).toEqual(revoked)
  expect((await undo(held.id, 'a different revocation')).statusCode).toBe(409)
  expect(row(held.id)).toEqual(revoked)
  const missing = await undo('no-such-key', receipt.revokedAt)
  expect(missing.statusCode, missing.body).toBe(409)

  vi.setSystemTime(started + KEY_REVOCATION_UNDO_MS - 1)
  const restored = await undo(held.id, receipt.revokedAt)
  expect(restored.statusCode, restored.body).toBe(200)
  expect(row(held.id)['revoked_at']).toBeNull()
  expect(row(held.id)['revoked_because']).toBeNull()
  expect((await useKey(held.token)).statusCode).toBe(200)
  const live = row(held.id)
  expect((await undo(held.id, receipt.revokedAt)).statusCode).toBe(409)
  expect(row(held.id)).toEqual(live)

  const { revokeTheKeyNamed } = await import('../src/server/lib/keys.ts')
  revokeTheKeyNamed(held.id, 'The run ended.')
  const other = row(held.id)
  const refused = await undo(held.id, String(other['revoked_at']))
  expect(refused.statusCode, refused.body).toBe(409)
  expect(refused.json<{ error: string }>().error).toContain('Only a key revoked at the Embassy')
  expect(row(held.id)).toEqual(other)

  const ending = await device('ended-during-undo')
  const endedReceipt = await revoke(ending.id)
  const ended = await app.inject({ method: 'POST', url: `/api/office/visitors/${ending.credential}/end`, headers: owner, payload: {} })
  expect(ended.statusCode, ended.body).toBe(200)
  const beforeUndo = row(ending.id)
  expect((await undo(ending.id, endedReceipt.revokedAt)).statusCode).toBe(409)
  expect(row(ending.id)).toEqual(beforeUndo)
  expect((await useKey(ending.token)).statusCode).toBe(403)
})

/** How long an undo pressed in the bar's last moment may take to reach the server, in this test. Just under a second. */
const AN_UNDO_S_TRIP_MS = 999

it.each([0, 999])('accepts the last offered undo after its trip to the server, revoked %i ms into the second', async (fraction) => {
  const held = await device(`undo-after-travel-${fraction}`)
  vi.useFakeTimers({ toFake: ['Date'] })
  const storedSecond = new Date('2026-09-26T13:00:00.000Z').getTime()
  vi.setSystemTime(storedSecond + fraction)
  const started = Date.now()
  const receipt = await revoke(held.id)
  expect(receipt.undoRemainingMs).toBe(KEY_REVOCATION_UNDO_MS - fraction)

  // TieredPress counts from before revoke, using the smaller of these two durations.
  const lastOfferedAt = started + Math.min(KEY_REVOCATION_UNDO_MS, receipt.undoRemainingMs) - 1
  vi.setSystemTime(lastOfferedAt)
  expect((await useKey(held.token)).statusCode).toBe(403)
  // THE UNDO'S OWN TRIP, a fixed number and not the grace itself, so a grace made smaller than the trip turns this red.
  vi.setSystemTime(lastOfferedAt + AN_UNDO_S_TRIP_MS)
  expect((await useKey(held.token)).statusCode).toBe(403)
  const restored = await undo(held.id, receipt.revokedAt)
  expect(restored.statusCode, restored.body).toBe(200)
  expect(row(held.id)['revoked_at']).toBeNull()
  expect((await useKey(held.token)).statusCode).toBe(200)
})

it('refuses undo at and past the server deadline and leaves the key revoked', async () => {
  const held = await device('undo-too-late')
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-26T14:00:00.000Z'))
  const started = Date.now()
  const receipt = await revoke(held.id)
  const before = row(held.id)
  vi.setSystemTime(started + KEY_REVOCATION_UNDO_MS + KEY_REVOCATION_UNDO_GRACE_MS)
  const refused = await undo(held.id, receipt.revokedAt)
  expect(refused.statusCode, refused.body).toBe(409)
  expect(refused.json<{ error: string }>().error).toContain(`${KEY_REVOCATION_UNDO_MS / 1000} seconds`)
  expect(row(held.id)).toEqual(before)
  expect((await useKey(held.token)).statusCode).toBe(403)
  vi.setSystemTime(Date.now() + 1)
  expect((await undo(held.id, receipt.revokedAt)).statusCode).toBe(409)
  expect(row(held.id)).toEqual(before)
  expect((await useKey(held.token)).statusCode).toBe(403)
})
