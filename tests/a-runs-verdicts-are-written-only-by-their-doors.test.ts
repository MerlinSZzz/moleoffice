// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S THREE VERDICTS ARE WRITTEN ONLY BY THEIR OWN DOORS. Problem SeAFAnQ145mV; wave 13k round 7, piece 1.
 *
 * `released` is written by the check door (POST /api/checks/<run>), `refused` by the check door and by the office when
 * the worker finishes again after a refusal, and `confirmed` by the confirm door (POST /api/checks/<run>/confirm).
 * The queue's verdict, the superseded door's proofs, the confirm, the landed-by-hand door and the run's standing all
 * take these fields as the check's own word. Measured on main on 26 September 2026: the person, a secretary, the run's
 * own agent and another agent could each set, change and drop all three with an ordinary PATCH, and file a new run
 * already carrying them. The guard is `refuseWhatOnlyTheVerdictDoorsWrite` in src/server/lib/records.ts, and the
 * create door's refusal beside it.
 *
 * WHAT IS MEASURED, on a throwaway database; every record here is synthetic:
 *   · for each field and each of the four callers, a PATCH that sets it, one that changes it, one that drops it and a
 *     whole `data` that carries it answer 403 and write nothing; so does filing a run that carries it;
 *   · a whole `data` that sends the stored value back unchanged is a round trip and passes;
 *   · a run is not filed carrying either settlement on theCheck either (round 6 guarded only the patch door);
 *   · a write under the field's own door mark passes, which is how the doors write.
 * That the doors themselves still write is shown by their own files, run in the same sweep: the check door's release
 * and refusal (tests/a-whole-check-reaches-its-verdict.test.ts), the office's
 * rework mark and a new check (tests/a-second-check-is-not-refused-by-the-first.test.ts), and the confirm door
 * (tests/a-release-names-its-seal-as-it-was-before-0154.test.ts).
 *
 * MUTATIONS (wave 13k round 7), one per field, each after a control run: leave the field out of both guards. That
 * field's case goes red and the other two stay green.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const as = (type: 'human' | 'agent', id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': type, 'x-mole-office-actor-id': id })

const CALLERS: Record<string, Record<string, string>> = {
  'the person': as('human', THE_PERSON),
  'a secretary': as('agent', THE_TEST_OFFICES_SECRETARY.handle),
  "the run's own agent": as('agent', 'verdict-worker'),
  'another agent': as('agent', 'verdict-stranger'),
}

const VERDICTS = {
  released: {
    by: { kind: 'agent', id: 'verdict-inspector' },
    at: '2026-09-26 10:00:00',
    how: 'an inspector',
    read: { sealId: 'SyntheticSeal', sealHash: 'f'.repeat(64), worktree: '/synthetic/worktree', tip: 'a'.repeat(40), ofItsOwn: true, says: 'Synthetic: a release nobody checked.' },
  },
  refused: { by: { kind: 'agent', id: 'verdict-inspector' }, at: '2026-09-26 10:00:00', missing: ['Synthetic: a refusal nobody checked.'], chapter: 5, group: 'synthetic-group' },
  confirmed: { by: { kind: 'person', id: THE_PERSON }, at: '2026-09-26 10:00:00', because: 'Synthetic: a confirmation nobody pressed.' },
} as const
type Field = keyof typeof VERDICTS

/** A finished run of the worker (or a running one), holding `field` when named, written the way its own door writes it. */
function aRun(holding: Field | null = null, state: 'finished' | 'running' = 'finished'): string {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run',
    workspaceId: WORKSPACE,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'verdict-worker', doing: 'synthetic work' },
    actor: { type: 'agent', id: 'verdict-worker' },
  }).id
  // FINISHED WITHOUT A SEAL, straight into the table: the guard reads no seal, and sealing needs a work area on disk.
  if (state === 'finished') writeDataBypassingTheGate(t, run, { ...t.api.getRecord(run)!.data, state: 'finished' })
  if (holding !== null) writeAVerdictAsItsDoorWould(t, run, { [holding]: VERDICTS[holding] })
  return run
}

async function refused(run: string, headers: Record<string, string>, body: Record<string, unknown>, field: Field, how: string): Promise<void> {
  const before = JSON.stringify(t.api.getRecord(run)!.data)
  const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers, payload: body })
  expect(reply.statusCode, `${how}: ${reply.body}`).toBe(403)
  expect(reply.body, how).toContain(`writes ${field} on a run; an ordinary write may not set, change or drop it`)
  expect(JSON.stringify(t.api.getRecord(run)!.data), how).toBe(before)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [headers, payload] of [
    [CALLERS['the person'], { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
    [CALLERS['a secretary'], { handle: 'verdict-worker', name: 'Verdict worker', role: 'worker' }],
    [CALLERS['the person'], { handle: 'verdict-stranger', name: 'Verdict stranger' }],
  ] as const) {
    const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: headers!, payload })
    expect(reply.statusCode, reply.body).toBe(201)
  }
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('an ordinary write may not set, change or drop a run’s verdict', () => {
  for (const field of Object.keys(VERDICTS) as Field[]) {
    it(`refuses ${field} to the person, a secretary, the run’s own agent and another agent, on every body and at filing`, async () => {
      for (const [caller, headers] of Object.entries(CALLERS)) {
        await refused(aRun(), headers, { dataPatch: { [field]: VERDICTS[field] } }, field, `${caller} sets it`)
        const held = aRun(field)
        await refused(held, headers, { dataPatch: { [field]: { ...VERDICTS[field], at: '2026-09-26 11:00:00' } } }, field, `${caller} changes it`)
        await refused(held, headers, { dataPatch: { [field]: null } }, field, `${caller} drops it`)
        const stored = t.api.getRecord(held)!.data
        await refused(held, headers, { data: { ...stored, [field]: { ...VERDICTS[field], at: '2026-09-26 12:00:00' } } }, field, `${caller} replaces the whole data`)
        const bare = aRun()
        await refused(bare, headers, { data: { ...t.api.getRecord(bare)!.data, [field]: VERDICTS[field] } }, field, `${caller} adds it in the whole data`)

        const runsBefore = t.api.listRecords({ workspaceId: WORKSPACE, kind: 'session' }).length
        const filed = await app.inject({
          method: 'POST',
          url: '/api/records',
          headers,
          payload: { kind: 'session', title: 'Synthetic run filed with a verdict', data: { state: 'running', servingAgent: 'verdict-worker', [field]: VERDICTS[field] } },
        })
        expect(filed.statusCode, `${caller} files a run carrying it: ${filed.body}`).toBe(403)
        expect(filed.body).toContain(`writes ${field} on a run`)
        expect(t.api.listRecords({ workspaceId: WORKSPACE, kind: 'session' })).toHaveLength(runsBefore)
      }
    })
  }

  it('lets a whole-data round trip through, and a write under the field’s own door mark', async () => {
    // A RUNNING RUN, so a whole `data` that says `finished` does not ask for a finish nobody meant.
    const run = aRun('released', 'running')
    writeAVerdictAsItsDoorWould(t, run, { confirmed: VERDICTS.confirmed })
    const stored = t.api.getRecord(run)!.data
    const trip = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: CALLERS['a secretary'], payload: { data: { ...stored, doing: 'a round trip' } } })
    expect(trip.statusCode, trip.body).toBe(200)
    const after = t.api.getRecord(run)!.data
    expect(after['released']).toEqual(VERDICTS.released)
    expect(after['confirmed']).toEqual(VERDICTS.confirmed)
    expect(after['doing']).toBe('a round trip')
  })
})

describe('a run is not filed carrying a settlement either', () => {
  for (const field of ['superseded', 'landedByHand'] as const) {
    it(`refuses a run filed with theCheck.${field}`, async () => {
      const runsBefore = t.api.listRecords({ workspaceId: WORKSPACE, kind: 'session' }).length
      const filed = await app.inject({
        method: 'POST',
        url: '/api/records',
        headers: CALLERS['a secretary'],
        payload: {
          kind: 'session',
          title: 'Synthetic run filed already settled',
          data: { state: 'running', servingAgent: 'verdict-worker', theCheck: { [field]: { by: 'SyntheticLater', at: '2026-09-26 10:00:00', because: 'Synthetic.' } } },
        },
      })
      expect(filed.statusCode, filed.body).toBe(403)
      expect(filed.body).toContain(`writes theCheck.${field} on a run`)
      expect(t.api.listRecords({ workspaceId: WORKSPACE, kind: 'session' })).toHaveLength(runsBefore)
    })
  }
})
