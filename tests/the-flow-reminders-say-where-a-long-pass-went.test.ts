// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LONG PASS OF THE FLOW REMINDERS SAYS EACH STEP'S TIME, AND WHAT EACH DID INSIDE SQLITE. Wave 13y round 19.
 *
 * From 15:26 on 10 October 2026 the live server wrote "the timer the flow reminders held the server for" 656 to 777 ms
 * once a minute, and nothing said which part of the pass it was. `sendTheRemindersThatAreDue` (src/server/lib/
 * reminders.ts) now times each step and counts its statements and rows apart (`countedApart`, src/server/lib/
 * slow-requests.ts), and the tick writes `sayTheStepsOfAPass` for a pass over `A_LONG_RUN_MS`.
 *
 * MUTATION PROOF, after a control run, each restored byte-identical (the round's report names the logs):
 *   unsorted   — `sayTheStepsOfAPass` keeps the steps in the order they ran: the first test goes red.
 *   uncounted  — the pass's `step` runs its work without `countedApart`: the second test goes red.
 *   not-passed — `countedApart` gives nothing on to the count around it: the third test goes red.
 */

import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let folder: string

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
  folder = mkdtempSync(join(tmpdir(), 'mole-office-test-worlds-'))
})

afterEach(() => {
  t?.close()
  rmSync(folder, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

it('names every step, slowest first, with its time inside SQLite, statements and rows', async () => {
  const { sayTheStepsOfAPass } = await import('../src/server/lib/reminders.ts')
  const line = sayTheStepsOfAPass(700, [
    { name: 'the drafts', ms: 40, sqliteMs: 30, statements: 12, rows: 340 },
    { name: 'the own rows', ms: 600, sqliteMs: 5.25, statements: 3, rows: 9 },
  ])
  expect(line).toBe(
    "the flow reminders' pass took 700 ms, 60 ms of it outside its steps. Its steps, slowest first: " +
      'the own rows 600 ms (5.3 ms inside SQLite, 3 statements, 9 rows); the drafts 40 ms (30 ms inside SQLite, 12 statements, 340 rows).',
  )
})

it('gives each step of a real pass its own count of statements and rows', async () => {
  const { sqlite } = await import('../src/server/db/client.ts')
  const { measureTheStatementsOf } = await import('../src/server/lib/slow-requests.ts')
  measureTheStatementsOf(sqlite)
  const { sendTheRemindersThatAreDue } = await import('../src/server/lib/reminders.ts')
  const steps: import('../src/server/lib/reminders.ts').AStepOfThePass[] = []
  sendTheRemindersThatAreDue('default', new Date(), new Date(Date.now() - 3_600_000), folder, steps)
  const names = steps.map((one) => one.name)
  for (const always of ['the idle reminder', 'the expected time', 'the drafts', 'the checklists', 'the broadcasts', 'the own rows']) {
    expect(names).toContain(always)
  }
  expect(steps.reduce((sum, one) => sum + one.statements, 0), 'no step counted a statement').toBeGreaterThan(0)
  expect(steps.reduce((sum, one) => sum + one.rows, 0), 'no step counted a row').toBeGreaterThan(0)
  expect(steps.every((one) => one.ms >= one.sqliteMs)).toBe(true)
})

it('still counts a part to the request that ran it', async () => {
  const { sqlite } = await import('../src/server/db/client.ts')
  const slow = await import('../src/server/lib/slow-requests.ts')
  slow.measureTheStatementsOf(sqlite)
  const outer = slow.aFreshCount()
  const part = slow.aFreshCount()
  slow.countedTo(outer, () => {
    sqlite.prepare('SELECT 1').get()
    slow.countedApart(part, () => {
      sqlite.prepare('SELECT 1 UNION ALL SELECT 2').all()
      sqlite.prepare('SELECT 3').get()
    })
  })
  expect({ statements: part.statements, rows: part.rows }).toEqual({ statements: 2, rows: 3 })
  expect({ statements: outer.statements, rows: outer.rows }).toEqual({ statements: 3, rows: 4 })
  expect(outer.slowest).toHaveLength(3)
})
