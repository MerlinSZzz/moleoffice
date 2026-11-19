// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND 48, ITEM 1: THE ROLL SKIPS OPENCODE GO WHILE A RUN IS WAITING ON GO'S LIMIT.
 *
 * Before: the router learnt of a Go limit only from a run that had ended on it. OpenCode waits out the provider's
 * retry-after before it gives up, which can be five hours, so a run held on Go's limit left the router choosing Go all
 * that time. Now the launcher marks a run while OpenCode retries on Go's limit (the session field
 * `waitingOnALimit`), and the router reads that mark beside the stops: while the mark's reset has not passed, every Go
 * row is skipped, with a reason that names the run, the reset and where the reset came from.
 *
 * The marks here are fixture sessions in a disposable database, in the shape the launcher writes. No provider or
 * launcher runs, and nothing listens on the live office port. Each test was proved by a control run, its named
 * mutation red, and the restore.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theCastingRoll, type CastingRollRow } from '../src/shared/casting-roll.ts'

let t: TestDb
let limits: typeof import('../src/server/lib/casting-roll.ts')

const HUMAN = { type: 'human', id: THE_PERSON } as const
const NAMED = 'named by the error, as OpenCode\'s retry read it: "It will reset in 2 hours"'
/** Real now, once, so the roll's week holds the mark. */
const R0 = new Date()
const HOUR = 60 * 60 * 1000

beforeEach(async () => {
  t = await freshDb()
  limits = await import('../src/server/lib/casting-roll.ts')
})
afterEach(() => t.close())

/** A running OpenCode run the launcher marked as waiting on Go's limit. */
function aRunWaitingOnGo(seenAt: Date, resetsAt: Date): string {
  return t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: `Synthetic run waiting on Go at ${String(seenAt.getTime())}`, actor: HUMAN,
    data: {
      state: 'running', runtime: 'opencode', model: 'opencode-go/glm-5.1',
      waitingOnALimit: { provider: 'opencode-go', said: 'Synthetic Go usage limit. It will reset in 2 hours.', attempt: 1,
        seenAt: seenAt.toISOString(), resetsAt: resetsAt.toISOString(), resetFrom: NAMED },
    },
  }).id
}

const rows: CastingRollRow[] = [
  { id: 23, program: 'codex', model: 'openai/gpt-6-luna', effort: 'medium', probability: 0.4, marked: false, labels: ['simple'], outUntil: null },
  { id: 24, program: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: null, probability: 0.9, marked: false, labels: ['simple'], outUntil: null },
]
const theRoll = (nowMs: number) => theCastingRoll({
  role: 'worker', project: 'default', rows, difficulty: null, named: null, earlier: null, builderModel: null,
  limits: limits.theModelsLimitedAt(nowMs, { officeZone: 'UTC' }), random: () => 0.999,
})

// Mutation: theModelsLimitedAt reads no mark. Red: the roll draws the Go row.
it('skips every Go row while a run is waiting on Go’s limit, saying which run, until when, and from where', () => {
  const run = aRunWaitingOnGo(new Date(R0.getTime() - 10 * 60_000), new Date(R0.getTime() + 2 * HOUR))
  const answer = theRoll(R0.getTime())
  expect(answer).toMatchObject({ runtime: 'codex', rowId: 23 })
  const reasons = answer.record.skipped.find((row) => row.rowId === 24)?.reasons ?? []
  expect(reasons).toHaveLength(1)
  expect(reasons[0]).toContain(`Run ${run} is waiting on quota until `)
  expect(reasons[0]).toContain(` UTC, ${NAMED}. It covers every opencode-go model.`)
})

// Mutation: a mark limits Go whatever its reset says. Red: Go is still skipped after the reset.
it('lets Go be drawn again once the mark’s reset has passed', () => {
  aRunWaitingOnGo(new Date(R0.getTime() - 3 * HOUR), new Date(R0.getTime() - HOUR))
  expect(limits.theModelsLimitedAt(R0.getTime(), { officeZone: 'UTC' }).limited).toEqual([])
  expect(theRoll(R0.getTime())).toMatchObject({ runtime: 'opencode', rowId: 24 })
})
