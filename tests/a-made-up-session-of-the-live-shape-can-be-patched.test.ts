// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPEN MADE-UP RUN OF THE OFFICE AT THE LIVE SCALE CAN BE PATCHED. Wave 13s rounds 187 and 188.
 *
 * tests/the-chat-office-of-the-live-shape.ts writes its session rows straight into the table, with one to ten
 * kilobytes of made-up words in each, and tests/the-office-at-the-live-scale.ts builds on them. Those words were in a
 * top-level `notes`, which the session kind does not declare, so a merge PATCH of any made-up run was refused for the
 * unknown key "notes". Now they are in `extra`, the bag every kind declares, and nothing reads them there.
 *
 * WHICH RUNS. The office at the live scale removes the chat office's `data.agent`, and leaves its newest runs open. A
 * PATCH of one of those runs now writes. Two sorts of made-up run are still refused, and this file does not test them:
 * a run the office at the live scale closed holds `closedHow: 'made-up'`, which is not a value the kind takes, and a
 * run of the chat office alone still holds `data.agent`.
 *
 * Three-run proof: node tools/run-named-tests.mjs tests/a-made-up-session-of-the-live-shape-can-be-patched.test.ts
 *   control, before the move: red, for the unknown key "notes";
 *   after the move: green;
 *   mutation: in tests/the-chat-office-of-the-live-shape.ts, put `notes: SENTENCE` back in place of
 *   `extra: { notes: SENTENCE` and delete the ` }` that closes it: red, for the unknown key "notes". Restore the file
 *   with cp, check it with cmp, and run this file again for green.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { buildTheOfficeAtAScale, oneIn, THE_COPY_OF_5_OCTOBER } from './the-office-at-the-live-scale.ts'

/** The scale tests/the-made-up-office-builds-on-the-day-the-clocks-go-back.test.ts builds. One in 200 holds too few agents to build. */
const SCALE = oneIn(THE_COPY_OF_5_OCTOBER, 20)
const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const

let t: TestDb
let runs: { id: string; data: string }[]

beforeAll(async () => {
  t = await freshDb()
  buildTheOfficeAtAScale(t.client.sqlite, THE_TEST_OFFICES_OWNER.id, SCALE)
  runs = t.client.sqlite
    .prepare(`SELECT id, data FROM records WHERE kind = 'session' AND origin = 'fixture' AND json_extract(data, '$.closedAt') IS NULL ORDER BY id`)
    .all() as typeof runs
}, 120_000)
afterAll(() => {
  t.close()
})

describe('an open made-up run of the office at the live scale', () => {
  it('takes a merge PATCH of its doing line, and keeps every other field as it was', () => {
    expect(runs.length).toBe(SCALE.openRuns)
    for (const run of runs) {
      const before = JSON.parse(run.data) as Record<string, unknown>
      const after = t.api.patchRecord(run.id, { dataPatch: { doing: 'patched in a made-up office' } }, HUMAN).record
      expect(after.data).toEqual({ ...before, doing: 'patched in a made-up office' })
    }
  })
})
