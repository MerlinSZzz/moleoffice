// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND 47, ITEM 1: THE ROUTER SKIPS AN OPENCODE GO ROW ONLY WHILE THE OFFICE KNOWS GO IS LIMITED.
 *
 * Before: every OpenCode Go DeepSeek row was skipped with "cannot start in a sandbox yet", limited or not. Now a Go row
 * is a candidate unless a crashed run on a Go model carries a quota stop whose window is still open. One such stop
 * covers every Go model, because Go is one allowance. The stops here are fixture sessions in a disposable database, in
 * the shape the launcher writes for a Go limit: the stop and its reset as instants with their offsets. No provider or
 * launcher runs. Each test was proved by a control run, its named mutation red, and the restore.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theCastingRoll, type CastingRollRow } from '../src/shared/casting-roll.ts'

let t: TestDb
let reader: typeof import('../src/server/lib/casting-roll.ts')
const stoppedAt = Date.parse('2026-10-14T08:12:00Z')
const resetsAt = Date.parse('2026-10-14T13:12:00Z')
const rows: CastingRollRow[] = [
  { id: 23, program: 'codex', model: 'openai/gpt-6-luna', effort: 'medium', probability: 0.4, marked: false, labels: ['simple'], outUntil: null },
  { id: 24, program: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: null, probability: 0.9, marked: false, labels: ['simple'], outUntil: null },
  { id: 25, program: 'opencode', model: 'opencode-go/gpt-6-luna', effort: 'high', probability: 0, marked: false, labels: [], outUntil: null },
]
// The draw falls on the last candidate, which is the Go row whenever it is one.
const rollAt = (nowMs: number) => theCastingRoll({
  role: 'worker', project: 'default', rows, difficulty: 'simple', named: null, earlier: null, builderModel: null,
  limits: reader.theModelsLimitedAt(nowMs, { officeZone: 'UTC' }), random: () => 0.999,
})

/** A run stopped by Go's limit on another Go model than the row's, written as the launcher writes one. */
function aGoStop(id: string): void {
  const data = {
    state: 'crashed', closedHow: 'provider-event', runtime: 'opencode', model: 'opencode-go/glm-5.1',
    stopCause: { kind: 'quota', said: 'Synthetic Go usage limit.', at: '2026-10-14T09:12:00.000+01:00', resetsAt: '2026-10-14T14:12:00.000+01:00' },
  }
  t.client.sqlite.prepare('INSERT INTO records (owner_id, id, workspace_id, kind, title, summary, data, created_at, updated_at, origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(THE_TEST_OFFICES_OWNER.id, id, 'default', 'session', `Synthetic Go stop ${id}`, 'Fixture only.', JSON.stringify(data), '2026-10-14 09:12:00', '2026-10-14 09:12:00', 'fixture')
}

beforeAll(async () => {
  t = await freshDb()
  reader = await import('../src/server/lib/casting-roll.ts')
}, 90_000)
afterAll(() => t?.close())

// Mutation: keep the blanket skip of OpenCode Go DeepSeek rows in reasonsFor. Red: the roll chooses row 23.
it('rolls an OpenCode Go row when nothing says Go is limited', () => {
  const answer = rollAt(stoppedAt)
  expect(answer).toMatchObject({ runtime: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', rowId: 24 })
  expect(answer.record.candidates.map(row => row.rowId)).toEqual([23, 24])
  expect(answer.record.skipped.map(row => row.rowId)).toEqual([25])
})

// Mutation: reasonsFor leaves out the limits on a row. Red: row 24 is a candidate and is chosen.
// Second mutation, in its own run: a limit is keyed by the model alone. Red: the stop on another Go model leaves row 24 in.
it('skips every OpenCode Go row with the limit and its run while the window is open', () => {
  aGoStop('go-limited-open')
  const answer = rollAt(stoppedAt + 60 * 60 * 1000)
  expect(answer).toMatchObject({ runtime: 'codex', rowId: 23 })
  expect(answer.record.candidates.map(row => row.rowId)).toEqual([23])
  const reasons = answer.record.skipped.find(row => row.rowId === 24)?.reasons.join(' ')
  expect(reasons).toMatch(/Run go-limited-open reports quota until 2026-10-14 13:12:00 UTC/)
  expect(reasons).toContain('every opencode-go model')
  // Row 25 is still the Luna fallback first, whatever Go's state.
  expect(answer.record.skipped.find(row => row.rowId === 25)?.reasons[0]).toContain('only the launcher fallback')
})

// Mutation: a limit whose window has passed is still counted. Red: row 24 stays skipped.
it('rolls the OpenCode Go row again once the window has passed', () => {
  aGoStop('go-limited-over')
  const answer = rollAt(resetsAt + 60 * 1000)
  expect(answer).toMatchObject({ runtime: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', rowId: 24 })
  expect(answer.record.skipped.map(row => row.rowId)).toEqual([25])
})
