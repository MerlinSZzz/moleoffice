// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER-CONTENT REMINDERS THE OFFICE KEEPS (wave 13v round 31). The merge tool's gate reports what it named and did not
 * refuse on the integrated step, as `ownerContent`; the office keeps it on the entry's integration and, at landing, on
 * `data.integrated`. The office takes only reminders that hold together: the counts by pattern add up to the count, the
 * sentence is there exactly when something was named, and nothing else is in them. The way through the step door to
 * `data.integrated` is driven end to end in tests/the-merger.test.ts.
 *
 * Every value here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let machine: typeof import('../src/server/lib/merge-state-machine.ts')

beforeAll(async () => {
  t = await freshDb()
  machine = await import('../src/server/lib/merge-state-machine.ts')
})
afterAll(() => t?.close())

const LOG = '/synthetic/checks/owner-content.json'
const SAYS = 'Owner-content reminders, which never refuse: 2 on lines this entry adds to what ships. Made up.'

describe('the owner-content reminders the office keeps', () => {
  it('takes reminders whose counts add up, with the sentence when something was named and without it when nothing was', () => {
    expect(machine.OWNER_CONTENT_REMINDERS.safeParse({ reminded: 2, byPattern: { P6: 1, P10: 1 }, says: SAYS, log: LOG }).success).toBe(true)
    expect(machine.OWNER_CONTENT_REMINDERS.safeParse({ reminded: 0, byPattern: {}, log: LOG }).success).toBe(true)
  })

  it.each([
    ['counts that do not add up', { reminded: 3, byPattern: { P6: 1, P10: 1 }, says: SAYS, log: LOG }, 'byPattern does not add up to reminded'],
    ['a sentence when nothing was named', { reminded: 0, byPattern: {}, says: SAYS, log: LOG }, 'says is there exactly when reminded is more than 0'],
    ['no sentence when something was named', { reminded: 2, byPattern: { P6: 2 }, log: LOG }, 'says is there exactly when reminded is more than 0'],
    ['a pattern that is not a pattern id', { reminded: 1, byPattern: { agents: 1 }, says: SAYS, log: LOG }, 'Invalid'],
    ['a field it does not know', { reminded: 0, byPattern: {}, log: LOG, hits: [] }, 'Unrecognized key'],
    ['no log', { reminded: 0, byPattern: {} }, 'expected string, received undefined'],
  ])('refuses %s', (_, reminders, why) => {
    const parsed = machine.OWNER_CONTENT_REMINDERS.safeParse(reminders)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.message).join('; ')).toContain(why)
  })
})
