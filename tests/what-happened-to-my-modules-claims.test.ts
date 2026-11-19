// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON ASKING *WHAT HAPPENED TO MY MODULE'S CLAIMS?* GETS AN ANSWER.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS FILE EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Window B ran against the owner's live corpus on the morning of 26 August 2026 and wrote 181 change
 * rows and 181 revisions — 92 session renames by `agent-identity-migration` and 89 block retitles by
 * `block-identity-migration`, each with a note saying what was carried over and what was deliberately
 * not guessed. That history is real and it is findable.
 *
 * **Two of its six steps left no ledger row at all.** Measured on a `VACUUM INTO` copy the same day
 * with `tools/measure-the-history.mjs`, and by hand on the same copy:
 *
 *   - the module-claims step moved `data.claims` off **15 modules** into **152
 *     `implementation_map` rows** and wrote no change row and no revision on any of the fifteen;
 *   - the annotation-state step deleted `data.state` from **7 comments** and wrote nothing either.
 *
 * So on module `EPfgPfb_pmBJ` the whole ledger was one baseline revision from 18 August and three
 * change rows from July. A key vanished off the record that morning and the record's own history did
 * not say so — which is the same fault as a badge reading `History 1` on a page with no past, one
 * layer down.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS FIXED HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * FIXED: the module half, and without inventing anything. The 152 rows are real, dated and
 * attributed, and each carries a note saying what was carried over verbatim and what was not
 * guessed. They were simply not reachable from the page the person is on. `historyEvents` now reads
 * them, so the module's own history answers the question.
 *
 * NOT FIXED, and said here rather than left for somebody to discover: **the seven comments.** Their
 * `data.state` is gone and there is no row anywhere that says it was ever there. Nothing can be
 * surfaced because nothing was written. That is a real hole in the owner's corpus, it needs a
 * migration to fill, and both migration windows are spent — so it is filed rather than papered over.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HUMAN = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)
afterAll(async () => {
  await app.close()
  t.close()
})

/**
 * The state the owner's corpus is in this morning, built the way the migration built it: a module
 * whose `data.claims` is gone, a row in the implementation map holding what it used to say, and
 * NOTHING in `changes` or `revisions` naming the move.
 */
async function aModuleWhoseClaimsWereMoved(): Promise<{ id: string; pattern: string; mapId: string }> {
  // A row of its own per case, because the migration's ids are the real ones and would collide.
  caseNumber += 1
  const repositoryId = `repo-one-${String(caseNumber)}`
  const mapId = `map-one-${String(caseNumber)}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'module', title: 'Tray clamp', data: { context: 'The gripper subsystem', state: 'active' } },
  })
  expect(made.statusCode, made.body).toBe(201)
  const id = (made.json() as { record: { id: string } }).record.id

  const repository = t.client.sqlite
  repository
    .prepare(
      'INSERT INTO repositories (id, workspace_id, name, root, created_at, updated_at, created_by) ' +
        `VALUES ('${repositoryId}', 'default', 'panelx-case-${String(caseNumber)}', '${THE_TEST_FIXTURE_ROOT}/panelx', '2026-08-26 11:28:58', '2026-08-26 11:28:58', '${THE_TEST_OFFICES_OWNER.id}')`,
    )
    .run()
  const pattern = 'src/shared/attention.ts'
  repository
    .prepare(
      'INSERT INTO implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, note, stated_at, stated_by) ' +
        `VALUES ('${mapId}', 'default', ?, '${repositoryId}', ?, 'implements', 'declared', ?, '2026-08-26 11:28:58', 'system:module-claims-migration')`,
    )
    .run(
      id,
      pattern,
      'Carried over verbatim from `data.claims` on this module by the module-claims migration. The corpus does ' +
        'not record who wrote the string, so this row does not guess at a person.',
    )
  return { id, pattern, mapId }
}

describe('the history read answers what happened to a module’s claims', () => {
  it('names the pattern, the day and who said it, on the module’s own history', async () => {
    const { id, pattern } = await aModuleWhoseClaimsWereMoved()
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}/history`, headers: HUMAN })
    expect(read.statusCode, read.body).toBe(200)
    const events = (read.json() as {
      events: { at: string; source: { table: string; id: string }; field: string | null; who: { actorId: string } }[]
    }).events

    const moved = events.filter((event) => event.source.table === 'implementation_map')
    expect(moved, 'the module’s history says nothing about where its claims went').toHaveLength(1)
    expect(moved[0]!.field, 'the entry does not say WHICH pattern').toBe(pattern)
    expect(moved[0]!.at, 'the entry is not dated the day the migration ran').toBe('2026-08-26 11:28:58')
    expect(moved[0]!.who.actorId, 'the entry does not say who said it').toBe('system:module-claims-migration')
  })

  it('reads the row rather than inventing one — a deleted row is not history that still stands', async () => {
    const { id, mapId } = await aModuleWhoseClaimsWereMoved()
    t.client.sqlite.prepare("UPDATE implementation_map SET deleted_at = '2026-08-26 12:00:00' WHERE id = ?").run(mapId)
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}/history`, headers: HUMAN })
    const events = (read.json() as { events: { source: { table: string } }[] }).events
    expect(events.filter((event) => event.source.table === 'implementation_map')).toHaveLength(0)
  })

  it('leaves a record with no stated patterns exactly as it was', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: HUMAN,
      payload: { kind: 'note', title: 'A note about nothing in the code', data: {} },
    })
    const id = (made.json() as { record: { id: string } }).record.id
    const read = await app.inject({ method: 'GET', url: `/api/records/${id}/history`, headers: HUMAN })
    expect(read.statusCode).toBe(200)
    const events = (read.json() as { events: { source: { table: string } }[] }).events
    expect(events.length).toBeGreaterThan(0)
    for (const event of events) expect(event.source.table).not.toBe('implementation_map')
  })
})
