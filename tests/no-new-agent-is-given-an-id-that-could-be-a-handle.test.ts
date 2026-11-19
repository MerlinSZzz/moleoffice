// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO NEW AGENT ROW IS GIVEN AN ID THAT COULD BE A HANDLE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROTECTS
 * ---------------------------------------------------------------------------------------
 *
 * The re-mint reads every agents row's id and sorts it (`whereTheIdCameFrom` in
 * src/server/lib/registry-aliases/remint-map.ts). An id that is the row's handle, or that could be
 * a handle at any length, is legacy; an id that could be a handle and is not 12 characters long
 * makes a row the map reads as legacy; and a 12-character id a handle could also be reads as
 * uncertain, which stops the whole re-mint until a person sorts it. Every new row therefore needs
 * an id that could not be a handle. This file holds the three places that can make one:
 *
 *   1. the seed's own row for the office (src/server/db/participants-migration.ts);
 *   2. step 3 of the same file, for a durable agent record no registry row bears;
 *   3. the registration door (src/server/lib/participants.ts), through `newParticipantId`.
 *
 * The handle rule itself is read from the product (`couldBeAHandle` in src/shared/participants.ts),
 * never copied here, so the test and the re-mint cannot drift apart.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE RANDOM SOURCE IS MOCKED AND NOT THE ID FUNCTION
 * ---------------------------------------------------------------------------------------
 *
 * One draw in about 734 is 12 characters that a handle could also be, so a case cannot leave that
 * chance to decide it. Mocking `anOfficeId` in src/server/lib/ids.ts would not work: `anIdForAnAgent`
 * lives in that same module and calls `anOfficeId` through its own local binding, so replacing the
 * export cannot change the call the real loop makes. The mock is put under both functions instead,
 * on `nanoid`, which `anOfficeId` draws from. While a case has armed it, the next N draws are
 * distinct 12-character ids that a handle could be; then the real `nanoid` answers. Code that takes
 * one `anOfficeId()` gets a handle-shaped id; the real `anIdForAnAgent()` keeps drawing until the
 * armed draws run out and the real draw gives an id no handle could be. Each case checks that the
 * mock really handed out handle-shaped ids during its action, so a case cannot pass because the
 * mock never ran.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS
 * ---------------------------------------------------------------------------------------
 *
 *   mut-seed:        the seed takes `anOfficeId()` for the office's row. Case 1 goes red.
 *   mut-seed-handle: the seed writes `id = MOLE_OFFICE_HANDLE`, as before. Case 1 goes red.
 *   mut-step3:       step 3 takes `anOfficeId()`. Case 2 goes red.
 *   mut-door:        `newParticipantId()` returns `anOfficeId()`. Case 3 goes red.
 *   mut-once:        `anIdForAnAgent()` returns its first draw. Cases 1 to 3 go red.
 *   mut-map:         the map's own loop no longer checks `couldBeAHandle(drawn)`. The re-mint map's
 *                    own test files are run for that one; this file does not reach the loop.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'

/**
 * The armed draws, shared with the mock factory and the cases. `armed` is how many handle-shaped
 * ids the next draws give; `handedOut` is every one given, so a case can prove the mock ran.
 */
const draws = { armed: 0, handedOut: [] as string[] }

/** Twelve characters a handle could be: lowercase letters and digits, starting with a letter and ending with a digit. */
function aHandleShapedId(n: number): string {
  return 'a' + n.toString(36).padStart(10, '0') + '0'
}

/**
 * Put the mock under `nanoid` before any of the product's modules are imported. `freshDb` resets
 * the module registry, so the modules it loads after this see the mocked random source.
 */
beforeAll(() => {
  vi.doMock('nanoid', async (importOriginal) => {
    const actual = await importOriginal<typeof import('nanoid')>()
    return {
      ...actual,
      nanoid: (size?: number) => {
        if (size === 12 && draws.armed > 0) {
          draws.armed -= 1
          const id = aHandleShapedId(draws.handedOut.length)
          draws.handedOut.push(id)
          return id
        }
        return actual.nanoid(size)
      },
    }
  })
})

afterAll(() => {
  vi.doUnmock('nanoid')
})

/** The registry row and mapping a record was given, read straight from the tables. */
function theRowOfARecord(t: TestDb, recordId: string): { id: string; handle: string; avatar: string } {
  const row = t.client.sqlite
    .prepare(
      'SELECT a.id, a.handle, a.avatar_asset_id AS avatar FROM agents a JOIN agent_records r ON r.agent_id = a.id WHERE r.record_id = ?',
    )
    .get(recordId) as { id: string; handle: string; avatar: string } | undefined
  expect(row, `no registry row is mapped to record ${recordId}`).toBeDefined()
  return row as { id: string; handle: string; avatar: string }
}

describe('no new agent row is given an id that could be a handle', () => {
  it('1: the fresh office’s own row has an id no handle could be, and the picture drawn from that id', async () => {
    draws.armed = 256
    const before = draws.handedOut.length
    const t = await freshDb()
    try {
      const shared = await import('../src/shared/participants.ts')
      const row = t.client.sqlite
        .prepare('SELECT id, avatar_asset_id AS avatar FROM agents WHERE handle = ? AND retired = 0')
        .get(shared.MOLE_OFFICE_HANDLE) as { id: string; avatar: string } | undefined
      expect(row, 'the fresh office has no live row for its own handle').toBeDefined()
      const fresh = draws.handedOut.slice(before)
      expect(fresh.length, 'the mock handed out no id during the migration, so the action never drew').toBeGreaterThan(0)
      expect(
        fresh.some((id) => shared.couldBeAHandle(id)),
        'the mock handed out no handle-shaped id during the migration',
      ).toBe(true)
      expect(shared.couldBeAHandle(row!.id), `the office row's id ${row!.id} could be a handle`).toBe(false)
      expect(row!.avatar).toBe(shared.defaultAvatarAssetId({ kind: 'agent', id: row!.id }))
    } finally {
      t.close()
    }
  }, 60_000)

  it('2: an agent record no registry row bears gets an id no handle could be, and is mapped onto it', async () => {
    const t = await freshDb()
    try {
      // The record is written straight at the table, without the door, because the door registers an
      // agent as it writes the record and this case is about step 3 of the migration.
      t.client.sqlite
        .prepare(
          'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, origin) ' +
            "VALUES (?, 'default', ?, ?, ?, 'agent', ?, NULL, ?, 'authored')",
        )
        .run(
          'rec-step-three',
          t.api.HUMAN.id,
          '2026-08-01 09:00:00',
          '2026-08-01 09:00:00',
          'Step three builder',
          JSON.stringify({ handle: 'step-three-builder', state: 'active' }),
        )

      draws.armed = 256
      const before = draws.handedOut.length
      const migration = await import('../src/server/db/participants-migration.ts')
      const report = migration.migrateParticipants(t.client.sqlite)
      expect(report.agentsWritten).toBe(1)

      const shared = await import('../src/shared/participants.ts')
      const row = theRowOfARecord(t, 'rec-step-three')
      const fresh = draws.handedOut.slice(before)
      expect(fresh.length, 'the mock handed out no id during step 3, so the action never drew').toBeGreaterThan(0)
      expect(
        fresh.some((id) => shared.couldBeAHandle(id)),
        'the mock handed out no handle-shaped id during step 3',
      ).toBe(true)
      expect(row.handle).toBe('step-three-builder')
      expect(shared.couldBeAHandle(row.id), `the row's id ${row.id} could be a handle`).toBe(false)
      expect(row.avatar).toBe(shared.defaultAvatarAssetId({ kind: 'agent', id: row.id }))
    } finally {
      t.close()
    }
  }, 60_000)

  it('3: an agent registered through the door gets an id no handle could be', async () => {
    const t = await freshDb()
    try {
      draws.armed = 256
      const before = draws.handedOut.length
      const made = t.api.createRecord({
        workspaceId: 'default',
        kind: 'agent',
        title: 'Door builder',
        data: { handle: 'door-builder', runtime: 'claude-code', state: 'active' },
        actor: t.api.HUMAN,
      })

      const shared = await import('../src/shared/participants.ts')
      const row = theRowOfARecord(t, made.id)
      const fresh = draws.handedOut.slice(before)
      expect(fresh.length, 'the mock handed out no id during the registration, so the action never drew').toBeGreaterThan(0)
      expect(
        fresh.some((id) => shared.couldBeAHandle(id)),
        'the mock handed out no handle-shaped id during the registration',
      ).toBe(true)
      expect(row.handle).toBe('door-builder')
      expect(shared.couldBeAHandle(row.id), `the row's id ${row.id} could be a handle`).toBe(false)
    } finally {
      t.close()
    }
  }, 60_000)
})
