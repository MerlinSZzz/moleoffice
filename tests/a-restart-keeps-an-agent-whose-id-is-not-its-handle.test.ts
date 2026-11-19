// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESTART KEEPS AN AGENT WHOSE ID IS NOT ITS HANDLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * Since criterion I1 of design/agents/IDENTITY-ACCEPTANCE.md, the registration door gives a new
 * agent an id of its own (`newParticipantId()`), not its handle. The participants step of every
 * migration (`migrateParticipants` in src/server/db/participants-migration.ts) runs on every start.
 * It used to insert an `agents` row with `id = handle` for every agent record, guarded only by
 * `ON CONFLICT(id)`. For a minted agent that insert does not conflict on the id. It hits the unique
 * index on `agents.handle`, the whole data step rolls back, and the start-up gate refuses the
 * database. On the owner's office that would stop the server at the first restart.
 *
 * Criterion I4 says the migration changes no stored value. So the cases below also check that a
 * re-run leaves both registries and the picture table exactly as the door left them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 * ---------------------------------------------------------------------------------------
 *
 *   Put back the plain insert in migrateParticipants (no skip for a handle whose records are all
 *   mapped, no mapping onto the row that already bears the handle), and all three cases go red on
 *   the unique index on `agents.handle`.
 *
 *   Take out only the skip (`if (agent.unmappedRecordIds.length === 0) continue`) and the third case
 *   goes red alone, because the re-run writes a new row for the old handle. The mapping onto the row
 *   that bears the handle still catches the first two.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 60_000)

afterAll(() => {
  t.close()
})

const AS_THE_PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

/** Register an agent through the record door, and hand back the registry id it was given. */
function register(handle: string): string {
  const made = t.api.createRecord({
    workspaceId: 'default',
    actor: AS_THE_PERSON,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active' },
  })
  const row = t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(made.id) as
    | { id: string }
    | undefined
  expect(row, 'the door mapped the record to no registry row').toBeDefined()
  return (row as { id: string }).id
}

/** Every row of the tables the participants step writes into, in a fixed order. */
function registries(sqlite: TestDb['client']['sqlite']): Record<'people' | 'agents' | 'agent_records' | 'assets', string[]> {
  const rows = (table: string): string[] =>
    (sqlite.prepare(`SELECT * FROM ${table}`).all() as unknown[]).map((r) => JSON.stringify(r)).sort()
  return { people: rows('people'), agents: rows('agents'), agent_records: rows('agent_records'), assets: rows('assets') }
}

/** The registry rows bearing one handle. */
function rowsBearing(sqlite: TestDb['client']['sqlite'], handle: string): { id: string }[] {
  return sqlite.prepare('SELECT id FROM agents WHERE handle = ?').all(handle) as { id: string }[]
}

describe('the start-up gate accepts a database holding an agent whose id was minted', () => {
  it('serves the database, and the agent keeps its one row under its minted id', async () => {
    const Database = (await import('better-sqlite3')).default
    const { prepareToServe } = await import('../src/server/db/migrate.ts')
    const id = register('minted-builder')
    // THE CASE THIS FILE IS ABOUT. If the door still set the id to the handle, nothing here would test anything.
    expect(id, 'the mint is not in place, so this test proves nothing').not.toBe('minted-builder')
    const before = registries(t.client.sqlite)

    const serving = new Database(t.file)
    serving.pragma('journal_mode = WAL')
    const decision = prepareToServe(serving)
    const after = registries(serving)
    const rows = rowsBearing(serving, 'minted-builder')
    serving.close()

    expect(decision.serve, decision.serve ? '' : decision.refusal).toBe(true)
    expect(rows).toEqual([{ id }])
    expect(after, 'the re-run changed a row of the registries').toEqual(before)
  })
})

describe('a second record under the same handle, found at a re-run', () => {
  it('is mapped onto the minted row, and no other row is written', async () => {
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    const id = register('shared-builder')
    expect(id, 'the mint is not in place, so this test proves nothing').not.toBe('shared-builder')
    createWorkspace({ id: 'restart-second', title: 'Other' })
    // WRITTEN STRAIGHT INTO THE TABLE, past the door, so the migration is the first thing to see it.
    // A record filed through the door would already be mapped and leave the migration nothing to do.
    t.client.sqlite
      .prepare(
        'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
          `VALUES ('rec-second', 'restart-second', '${THE_TEST_OFFICES_OWNER.id}', '2026-09-25 09:00:00', '2026-09-25 09:00:00', 'agent', ` +
          "'shared-builder', NULL, ?, 'authored')",
      )
      .run(JSON.stringify({ handle: 'shared-builder', state: 'active' }))
    const before = registries(t.client.sqlite)

    const outcome = migrateInPlace(t.client.sqlite)

    expect(outcome.participants.agentsWritten).toBe(0)
    expect(outcome.participants.avatarsWritten).toBe(0)
    expect(outcome.participants.recordsMapped).toBe(1)
    const mapped = t.client.sqlite.prepare("SELECT agent_id AS id FROM agent_records WHERE record_id = 'rec-second'").get()
    expect(mapped).toEqual({ id })
    expect(rowsBearing(t.client.sqlite, 'shared-builder')).toEqual([{ id }])
    // AND THE ONE NEW MAPPING IS THE ONLY CHANGE. Every other row of the four tables is as it was.
    const after = registries(t.client.sqlite)
    expect(after.agent_records.filter((r) => !before.agent_records.includes(r))).toEqual([
      JSON.stringify({ record_id: 'rec-second', agent_id: id }),
    ])
    expect({ ...after, agent_records: before.agent_records }).toEqual(before)
  })
})

describe('a record already mapped is left alone, even when no row bears its handle any more', () => {
  it('writes no new row for the old handle after a shared row was renamed through another record', async () => {
    const { migrateInPlace } = await import('../src/server/db/migrate.ts')
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    // TWO RECORDS, ONE AGENT. The door maps the second project's record onto the row the first made.
    const first = t.api.createRecord({
      workspaceId: 'default',
      actor: AS_THE_PERSON,
      kind: 'agent',
      title: 'old-name',
      data: { handle: 'old-name', state: 'active' },
    })
    createWorkspace({ id: 'restart-third', title: 'Other' })
    const second = t.api.createRecord({
      workspaceId: 'restart-third',
      actor: AS_THE_PERSON,
      kind: 'agent',
      title: 'old-name',
      data: { handle: 'old-name', state: 'active' },
    })
    const mappedTo = (recordId: string): unknown =>
      t.client.sqlite.prepare('SELECT agent_id AS id FROM agent_records WHERE record_id = ?').get(recordId)
    expect(mappedTo(second.id)).toEqual(mappedTo(first.id))
    // THE FIRST RECORD TAKES A NEW HANDLE, and the row follows it. The second record still says the
    // old handle and is still mapped to that row, so no row bears the old handle now.
    t.api.patchRecord(first.id, { dataPatch: { handle: 'new-name' } }, AS_THE_PERSON)
    expect(rowsBearing(t.client.sqlite, 'old-name'), 'the row did not follow the handle, so this case is not set up').toEqual([])
    const before = registries(t.client.sqlite)

    const outcome = migrateInPlace(t.client.sqlite)

    expect(outcome.participants.agentsWritten).toBe(0)
    expect(outcome.participants.recordsMapped).toBe(0)
    expect(rowsBearing(t.client.sqlite, 'old-name'), 'the re-run made a second agent for the old handle').toEqual([])
    expect(registries(t.client.sqlite)).toEqual(before)
  })
})
