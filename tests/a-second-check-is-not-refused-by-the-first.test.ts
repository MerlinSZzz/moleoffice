// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old finished-run helper depended on this source checkout. It now explicitly inventories historical runs; all inspector-window and recheck assertions remain. */
/** Eligibility fixture update: old checked runs omitted their checkout; worker fixtures now record a resolvable workingDirectory and a registered work area. */
/** Fixture update: the meddling inspector edits a note the worker filed, as a run's record is changed only by those who hold the run; the refusal it proves is unchanged. */
/**
 * A SECOND CHECK IS NOT REFUSED BY THE VERDICT THE FIRST ONE WROTE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `Ugp91kRzNJbd`, on run O2yheBg3XSGP. Criterion C22's guard asks what the inspector has
 * written on records the worker created, and refuses the check where it has written anything. The
 * verdict fields — `released` and `refused` — were written onto the WORKER'S run record under the
 * INSPECTOR'S name, which is exactly that shape. So the first check of a worker went through, and
 * every check afterwards by the same inspector was refused with 403 by the verdict it had itself
 * written, before a new verdict could be. The guard was reading its own paperwork as evidence.
 *
 * IT BIT THE COMMONEST CASE THERE IS. A refusal does not end a run: the worker goes back to work
 * and the same run is checked again. That second check could never be posted. Nor could any check
 * of a second run by a worker whose first run the same inspector had already released.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS DONE ABOUT IT, AND WHAT WAS NOT
 * ---------------------------------------------------------------------------------------
 *
 * The guard is NOT narrowed and no exception is carved into it. It still asks the one question C22
 * asks. What changed is the attribution: those two fields are what the office records about where a
 * run stands, not the inspector's edit of the work, and each names its author in its own `by` field
 * — so nothing is lost by the office being the one who wrote them down. It is the same fix
 * commit 61d28e35 made for the assembly write, for the same reason.
 *
 * The release and refusal MESSAGES stay the inspector's. Those really are its own words, and a
 * release has to say who released it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   - Write `released` or `refused` under `input.actor` again — the state before this fix — and the
 *     first two cases go red with the 403 this file exists for.
 *   - Take `whatTheInspectorChanged` out of the answer path and the last case goes red: an
 *     inspector that really did edit the worker's record is then released.
 */
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})

let t: TestDb
let app: FastifyInstance

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A finished run the named worker filed for itself. */
async function aFinishedRun(handle: string, title: string): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title, data: { state: 'running', servingAgent: handle, workingDirectory: process.cwd(), doing: 'the work under check' } },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  const run = (reply.json() as { record: { id: string } }).record.id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'finished') WHERE id = ?").run(run)
  // Each inspector check begins with an assembly, before any edit it must detect.
  if (handle !== 'builder-nowhere') {
    const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-one'), payload: { changes: [] } })
    expect(assembled.statusCode, assembled.body).toBe(201)
  }
  return run
}

/** The one act, through the real route, as the inspector. */
function answer(run: string, verdict: 'released' | 'refused', what: string) {
  return app.inject({
    method: 'POST',
    url: `/api/checks/${run}`,
    headers: asAgent('inspector-one'),
    payload:
      verdict === 'released'
        ? { verdict, check: what, chaptersRead: [] }
        : { verdict, check: what, missing: ['a test for the thing it built'], says: { chapter: 5 }, chaptersRead: [] },
  })
}

/** The registry id of the agent registered under this handle. A new agent's id is not its handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  // ONLY THE PERSON APPOINTS AN INSPECTOR. One inspector for the whole file, on purpose: this is
  // about the same inspector checking more than once.
  await register(AS_THE_PERSON, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a second check by the same inspector', () => {
  it('is posted after a refusal on the same run, which is the commonest case there is', async () => {
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'worker-reworking', name: 'Worker Reworking', role: 'worker', workArea: ['src'] })
    const run = await aFinishedRun('worker-reworking', 'A run refused, reworked, and checked again')

    const first = await answer(run, 'refused', 'Read the brief and the changes. A test is missing.')
    expect(first.statusCode, first.body).toBe(201)
    expect((first.json() as { verdict: string }).verdict).toBe('refused')

    // THE RUN DOES NOT END ON A REFUSAL. The worker goes back to work and the same run is checked
    // again — and until this was fixed, that second check could never be posted.
    const second = await answer(run, 'released', 'Read it again. The test is there now.')
    expect(second.statusCode, second.body).toBe(201)
    expect((second.json() as { verdict: string }).verdict).toBe('released')

    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect(read.statusCode, read.body).toBe(200)
    const stands = (read.json() as { stands: { unreleasedFinish: boolean; released: { by: { id: string } } | null } }).stands
    expect(stands.unreleasedFinish).toBe(false)
    // AND THE RELEASE STILL SAYS WHO RELEASED IT. The office wrote the field down; the inspector
    // made the decision, and the field is where that is recorded.
    expect(stands.released?.by.id).toBe(idOf('inspector-one'))
  })

  it('is posted on a second run by a worker whose first run it already released', async () => {
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'worker-twice', name: 'Worker Twice', role: 'worker', workArea: ['src'] })
    const one = await aFinishedRun('worker-twice', 'The first run of a worker checked twice')
    expect((await answer(one, 'released', 'Nothing is missing.')).statusCode).toBe(201)

    const two = await aFinishedRun('worker-twice', 'The second run of the same worker')
    const second = await answer(two, 'released', 'Nothing is missing here either.')
    expect(second.statusCode, second.body).toBe(201)
  })

  it('is still refused when the inspector really did change the worker\'s work', async () => {
    await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'worker-meddled', name: 'Worker Meddled', role: 'worker', workArea: ['src'] })
    // A note the worker files in its work. The inspector does not hold the run, so it may not change the run's own
    // record, and the record of the worker's it edits below is this one.
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: asAgent('worker-meddled'),
      payload: { kind: 'note', title: 'A note the worker wrote in its work', data: { body: 'what the worker wrote' } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const note = (filed.json() as { record: { id: string } }).record.id
    const run = await aFinishedRun('worker-meddled', 'A run whose inspector edited it')

    // The inspector edits a record the worker created. That is what C22 forbids, and it must still
    // be caught now that the office's own bookkeeping no longer looks like it.
    const meddled = await app.inject({
      method: 'PATCH',
      url: `/api/records/${note}`,
      headers: asAgent('inspector-one'),
      payload: { dataPatch: { body: 'the inspector rewrote what the worker wrote' } },
    })
    expect(meddled.statusCode, meddled.body).toBe(200)

    const refused = await answer(run, 'released', 'Nothing is missing.')
    expect(refused.statusCode).toBe(403)
    expect(refused.body).toContain('changed the work it was checking')

    const read = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_TEST_OFFICES_SECRETARY.handle) })
    expect((read.json() as { stands: { unreleasedFinish: boolean } }).stands.unreleasedFinish).toBe(true)
  })
})
