// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S TWO SETTLEMENTS ON theCheck ARE WRITTEN ONLY BY THEIR OWN DOORS. Problem 5Sxsr68-_m8m; wave 13k round 6,
 * piece 3.
 *
 * `theCheck.superseded` is written by POST /api/checks/<run>/superseded and `theCheck.landedByHand` by POST
 * /api/checks/<run>/landed-by-hand, each after it has checked the run and git. Before this, an ordinary PATCH could
 * set, change or drop either. The guard is `refuseWhatOnlyTheSettlementDoorsWrite` in src/server/lib/records.ts.
 *
 * WHAT IS MEASURED, on a throwaway database; every record here is synthetic:
 *   · for each field, an ordinary PATCH that sets it, one that changes it and one that drops it answer 403 and write
 *     nothing; so does a dataPatch that replaces or drops the whole theCheck while the run holds the field, and a whole
 *     `data` that changes it;
 *   · a whole `data` that sends the stored value back unchanged is a round trip and passes;
 *   · a write of another key of theCheck still passes.
 * That the two doors still write is shown by their own files, tests/a-released-run-whose-entry-bounced-is-superseded
 * and tests/a-run-landed-by-hand-is-recorded, which write through the guard.
 *
 * MUTATION (wave 13k round 6): remove the call to the guard in patchRecord. Every refusal here answers 200 again.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let doors: typeof import('../src/server/lib/check-field-doors.ts')
let office: typeof import('../src/server/lib/inspection.ts')['THE_OFFICE']

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

const SETTLED = {
  superseded: { by: 'Synthetic-later', at: '2026-09-26 10:00:00', byWhom: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }, because: 'Synthetic: a later run finished it.' },
  landedByHand: {
    commit: 'a'.repeat(40),
    lane: '/synthetic/lane',
    by: { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle },
    at: '2026-09-26 10:00:00',
    because: 'Synthetic: landed by hand.',
    contains: { how: 'ancestor', laterCommit: 'a'.repeat(40), commits: [{ commit: 'a'.repeat(40), as: 'a'.repeat(40) }] },
  },
} as const
type Field = keyof typeof SETTLED

/** A run with `theCheck.askedAt`, and, when named, one settlement written the way its own door writes it. */
function aRun(settled: Field | null): string {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run',
    workspaceId: WORKSPACE,
    origin: 'fixture',
    data: { state: 'finished', theCheck: { askedAt: '2026-09-26 09:00:00', checkout: { directory: '/synthetic/worktree', cutFrom: 'main' }, says: 'Synthetic: the office asked for a check.' } },
    actor: { type: 'agent', id: 'settle-worker' },
  }).id
  if (settled !== null) {
    doors.asTheDoorOf(settled, () => t.api.patchRecord(run, { dataPatch: { theCheck: { [settled]: SETTLED[settled] } } }, office))
  }
  return run
}

async function patch(run: string, body: Record<string, unknown>): Promise<{ code: number; body: string }> {
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle), payload: body })
  return { code: reply.statusCode, body: reply.body }
}

async function expectRefused(run: string, body: Record<string, unknown>, field: Field): Promise<void> {
  const before = JSON.stringify(t.api.getRecord(run)!.data)
  const { code, body: said } = await patch(run, body)
  expect(code, said).toBe(403)
  expect(said).toContain(`writes theCheck.${field} on a run`)
  expect(JSON.stringify(t.api.getRecord(run)!.data)).toBe(before)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  doors = await import('../src/server/lib/check-field-doors.ts')
  office = (await import('../src/server/lib/inspection.ts')).THE_OFFICE
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' } })
  expect(reply.statusCode, reply.body).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('an ordinary write may not set, change or drop a run\'s settlement', () => {
  for (const field of ['superseded', 'landedByHand'] as const) {
    it(`refuses setting, changing and dropping theCheck.${field}`, async () => {
      await expectRefused(aRun(null), { dataPatch: { theCheck: { [field]: SETTLED[field] } } }, field)
      const settled = aRun(field)
      await expectRefused(settled, { dataPatch: { theCheck: { [field]: { ...SETTLED[field], because: 'Synthetic: changed by hand.' } } } }, field)
      await expectRefused(settled, { dataPatch: { theCheck: { [field]: null } } }, field)
      // THE WHOLE theCheck REPLACED OR DROPPED WHILE THE RUN HOLDS IT, and a whole `data` that changes it.
      await expectRefused(settled, { dataPatch: { theCheck: null } }, field)
      const stored = t.api.getRecord(settled)!.data
      const check = stored['theCheck'] as Record<string, unknown>
      await expectRefused(settled, { data: { ...stored, theCheck: { ...check, [field]: { ...SETTLED[field], at: '2026-09-26 11:00:00' } } } }, field)
    })

    it(`lets a whole-data round trip and another key of theCheck through, with theCheck.${field} held`, async () => {
      const settled = aRun(field)
      const stored = t.api.getRecord(settled)!.data
      const trip = await patch(settled, { data: { ...stored, title: undefined, doing: 'a round trip' } })
      expect(trip.code, trip.body).toBe(200)
      const other = await patch(settled, { dataPatch: { theCheck: { askedAt: '2026-09-26 09:30:00' } } })
      expect(other.code, other.body).toBe(200)
      expect((t.api.getRecord(settled)!.data['theCheck'] as Record<string, unknown>)[field]).toEqual(SETTLED[field])
    })
  }
})
