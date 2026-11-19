// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PLAN WRITE KEEPS ANOTHER PROGRAM OUT OF ITS MIDDLE, SO A RACE IS A REFUSAL AND NEVER A 500 (problem rpOBGf7h_3Tj).
 *
 * The office's database file is written by more than one program: a script, a second server, and in a browser test the
 * test's own server beside the one the browser talks to. Here the second program is a second SQLite connection to the
 * same file, opened by this test, with no busy wait of its own.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   1. Another program tries to write while a plan line is being filed as work, between the filing's reads and its
 *      record insert. The filing is written (201), and the other program was kept out until it finished. Before the
 *      fix the other program's write went in, and the filing's insert failed with SQLITE_BUSY_SNAPSHOT, which reached
 *      the caller as a 500 "internal error". That is what a loaded test run met on 1 October 2026.
 *   2. Another program renames a plan after a caller read it. The caller's rename, sent with the version it read, is
 *      refused with the coded refusal `planChangedSinceRead` (409), and the other program's name stays.
 *
 * WHERE THE MIDDLE IS. Case 1 needs the other program to write at one moment inside the filing. The filing makes the
 * record's id with `nanoid` inside its transaction, after it has read and before it inserts, so `nanoid` is replaced
 * here by itself plus, once, the other program's write at the first call made inside a transaction. Nothing else about
 * `nanoid` changes.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   - `oneWrite` in lib/plans.ts opening the default deferred transaction (`sqlite.transaction(...)()` in place of
 *     `.immediate()`): case 1 goes red with a 500;
 *   - `refuseStaleWrite` returning at once: case 2 goes red.
 */

import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { BuiltServer } from '../src/server/index.ts'

/**
 * What the other program does at the next `nanoid` call made inside a transaction on the server's own connection, once.
 * Calls outside one (the use ledger's id for the request, for one) are let through untouched.
 */
const between = vi.hoisted(() => ({ act: null as null | (() => void), inAWrite: (): boolean => false }))

vi.mock('nanoid', async (importOriginal) => {
  const real = await importOriginal<typeof import('nanoid')>()
  return {
    ...real,
    nanoid: (size?: number): string => {
      const act = between.act
      if (act !== null && between.inAWrite()) {
        between.act = null
        act()
      }
      return real.nanoid(size)
    },
  }
})

let t: TestDb
let app: BuiltServer
let anotherProgram: Database.Database

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  t = await freshDb()
  app = await apiApp()
  // THE SERVER'S OWN CONNECTION, the one `apiApp` writes through: freshDb loaded it and apiApp reuses that module.
  const { sqlite } = await import('../src/server/db/client.ts')
  between.inAWrite = () => sqlite.inTransaction
  await app.app.ready()
  // NO BUSY WAIT, so a write the plan write keeps out fails at once and says so, rather than waiting for a lock the
  // same thread holds.
  anotherProgram = new Database(t.file, { timeout: 0 })
  anotherProgram.exec('CREATE TABLE another_programs_notes (said TEXT NOT NULL)')
})

afterAll(async () => {
  anotherProgram?.close()
  await app?.app.close()
  t?.close()
})

describe('a plan write and another program on the same database file', () => {
  it('1: another program writing in the middle of filing a line waits; the filing is written, not a 500', async () => {
    const made = await app.app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: AS_THE_PERSON,
      payload: { title: 'Week of the footbridge', body: '# Footbridge\n\n- Re-level the footbridge' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const plan = made.json() as { plan: { id: string }; lines: { id: string; text: string }[] }
    const line = plan.lines.find((one) => one.text === '- Re-level the footbridge')
    expect(line, 'the plan has no line to file').toBeDefined()

    let theOtherWrite = 'not tried'
    between.act = () => {
      try {
        anotherProgram.prepare("INSERT INTO another_programs_notes (said) VALUES ('written in the middle')").run()
        theOtherWrite = 'written'
      } catch (err) {
        theOtherWrite = String((err as { code?: unknown }).code)
      }
    }
    const filed = await app.app.inject({
      method: 'POST',
      url: `/api/plans/${plan.plan.id}/lines/${line!.id}/file-as-work`,
      headers: AS_THE_PERSON,
      payload: { kind: 'task', workspaceId: 'default' },
    })
    expect(between.act, 'the filing never made an id, so the other program never tried').toBeNull()
    expect(filed.statusCode, filed.body).toBe(201)
    expect(theOtherWrite, 'the other program was kept out while the filing held the lock').toBe('SQLITE_BUSY')

    // AND IT CAN WRITE ONCE THE FILING IS DONE: the lock was held for the filing and not longer.
    anotherProgram.prepare("INSERT INTO another_programs_notes (said) VALUES ('written after')").run()
    expect(anotherProgram.prepare('SELECT said FROM another_programs_notes').pluck().all()).toEqual(['written after'])
  })

  it('2: a rename built on a copy another program has replaced is refused with planChangedSinceRead', async () => {
    const made = await app.app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: AS_THE_PERSON,
      payload: { title: 'Week of the harness', body: '- Build the harness' },
    })
    expect(made.statusCode, made.body).toBe(201)
    const planId = String((made.json() as { plan: { id: string } }).plan.id)
    const read = await app.app.inject({ method: 'GET', url: `/api/plans/${planId}/blocks`, headers: AS_THE_PERSON })
    expect(read.statusCode, read.body).toBe(200)
    const readVersion = String((read.json() as { version: string }).version)

    anotherProgram.prepare('UPDATE plans SET title = ? WHERE id = ?').run('Week of the harness, renamed elsewhere', planId)

    const renamed = await app.app.inject({
      method: 'PATCH',
      url: `/api/plans/${planId}`,
      headers: AS_THE_PERSON,
      payload: { title: 'Week of the harness and the sensor', ifVersion: readVersion },
    })
    expect(renamed.statusCode, renamed.body).toBe(409)
    expect((renamed.json() as { code?: string }).code).toBe('planChangedSinceRead')
    expect(anotherProgram.prepare('SELECT title FROM plans WHERE id = ?').pluck().get(planId)).toBe(
      'Week of the harness, renamed elsewhere',
    )
  })
})
