// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND 49, ITEM 3: A STOP CAUSE OR A WAIT MARK THAT AN OLDER RUN KEPT IN `extra` IS STILL READ.
 *
 * Before: the session hook and the launcher wrote a run's stop cause at `extra.stopCause`, and the launcher wrote its
 * mark of waiting on Go's limit at `extra.waitingOnALimit`. The sweep's notice and the casting roll queried both
 * there, while the kind said nothing reads `extra`. Now both are session fields, `stopCause` and `waitingOnALimit`,
 * and the writers write only the fields. A run filed before the change still holds its copy in `extra`, and nothing
 * rewrites it. So every reader takes the field first, and the old copy when the run has no field, and a stop filed
 * today goes on limiting Go and being told to the person.
 *
 * The runs here are fixture sessions in a disposable database, written in the older shape. No provider or launcher
 * runs, and nothing listens on the live office port. Each test was proved by a control run, its named mutation red,
 * and the restore.
 */
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { KIND_SPECS, SHAPE_SPECS } from '../src/shared/kinds.ts'
import { THE_CAUSES_THEY_MUST_ACT_ON } from '../src/config/stopped-run-cause.mjs'
import { theCastingRoll, type CastingRollRow } from '../src/shared/casting-roll.ts'

let t: TestDb
let reminders: typeof import('../src/server/lib/reminders.ts')
let limits: typeof import('../src/server/lib/casting-roll.ts')
const made: string[] = []

const HUMAN = { type: 'human', id: THE_PERSON } as const
const ASSUMED = "assumed: five hours, Go's allowance window (the error sent no retry-after)"
const NAMED = 'named by the error, as OpenCode\'s retry read it: "It will reset in 2 hours"'
/** Real now, once, so the notice's hour and the roll's week both hold the run. */
const R0 = new Date()
const HOUR = 60 * 60 * 1000

beforeAll(async () => {
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  limits = await import('../src/server/lib/casting-roll.ts')
  const roles = await import('../src/server/lib/roles.ts')
  const records = await import('../src/server/lib/records.ts')
  roles.readTheRoleCards({ guardActKeys: records.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
}, 60_000)
afterAll(() => t.close())
afterEach(() => {
  for (const id of made.splice(0)) t.api.deleteRecord(id, HUMAN)
})

/** A run Go's limit stopped, as the launcher wrote one before the stop cause was a field. */
function anOlderGoStop(stoppedAt: Date): { id: string; resetsAt: string } {
  const resetsAt = new Date(stoppedAt.getTime() + 5 * HOUR).toISOString()
  const id = t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: `Synthetic older Go stop at ${String(stoppedAt.getTime())}`, actor: HUMAN,
    data: {
      state: 'crashed', runtime: 'opencode', model: 'opencode-go/glm-5.1',
      closedAt: localStamp(stoppedAt), closedHow: 'provider-event',
      closedBecause: 'The run ended, in the words of its close.',
      extra: { stopCause: { kind: 'quota', said: 'Synthetic older Go usage limit.', at: stoppedAt.toISOString(), resetsAt, resetFrom: ASSUMED } },
    },
  }).id
  made.push(id)
  return { id, resetsAt }
}

/** A running OpenCode run the launcher marked as waiting on Go's limit before the mark was a field. */
function anOlderRunWaitingOnGo(seenAt: Date, resetsAt: Date): string {
  const id = t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: `Synthetic older run waiting on Go at ${String(seenAt.getTime())}`, actor: HUMAN,
    data: {
      state: 'running', runtime: 'opencode', model: 'opencode-go/glm-5.1',
      extra: { waitingOnALimit: { provider: 'opencode-go', said: 'Synthetic Go usage limit. It will reset in 2 hours.', attempt: 1,
        seenAt: seenAt.toISOString(), resetsAt: resetsAt.toISOString(), resetFrom: NAMED } },
    },
  }).id
  made.push(id)
  return id
}

const rows: CastingRollRow[] = [
  { id: 23, program: 'codex', model: 'openai/gpt-6-luna', effort: 'medium', probability: 0.4, marked: false, labels: ['simple'], outUntil: null },
  { id: 24, program: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: null, probability: 0.9, marked: false, labels: ['simple'], outUntil: null },
]
const theGoRowsReasons = (): string[] => theCastingRoll({
  role: 'worker', project: 'default', rows, difficulty: null, named: null, earlier: null, builderModel: null,
  limits: limits.theModelsLimitedAt(R0.getTime(), { officeZone: 'UTC' }), random: () => 0.999,
}).record.skipped.find((row) => row.rowId === 24)?.reasons ?? []

// Mutation: the stop cause is read only from the field, in STOP_CAUSE_KIND_IN_SQL and theStopCauseOf
// (src/config/stopped-run-cause.mjs). Red: the older run limits nothing, and the roll draws the Go row.
it('limits Go from a stop cause that an older run kept in extra', () => {
  const stop = anOlderGoStop(new Date(R0.getTime() - HOUR))
  const reasons = theGoRowsReasons()
  expect(reasons).toHaveLength(1)
  expect(reasons[0]).toContain(`Run ${stop.id} reports quota until `)
  expect(reasons[0]).toContain(` UTC, ${ASSUMED}. It covers every opencode-go model.`)
})

// Mutation: the mark is read only from the field, in WAITS_ON_A_LIMIT_IN_SQL and theWaitOnALimitOf
// (src/config/stopped-run-cause.mjs). Red: the older run limits nothing, and the roll draws the Go row.
it('limits Go from a wait mark that an older run kept in extra', () => {
  const run = anOlderRunWaitingOnGo(new Date(R0.getTime() - 10 * 60_000), new Date(R0.getTime() + 2 * HOUR))
  const reasons = theGoRowsReasons()
  expect(reasons).toHaveLength(1)
  expect(reasons[0]).toContain(`Run ${run} is waiting on quota until `)
  expect(reasons[0]).toContain(` UTC, ${NAMED}. It covers every opencode-go model.`)
})

// Mutation: the same as the first. Red: the sweep finds no run stopped for a cause, and sends no notice.
it('tells the person of a stop that an older run kept in extra, in the words and with the reset it carries', () => {
  const stop = anOlderGoStop(new Date(R0.getTime() - 10 * 60_000))
  const pass = reminders.sendTheRemindersThatAreDue('default', R0, new Date(R0.getTime() - 60_000))
  expect(pass.noticesSent).toEqual(['quota'])
  const notices = t.client.sqlite.prepare(
    "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
    "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) AND json_extract(data, '$.extra.m94.cause') = 'quota'",
  ).all() as { data: string }[]
  expect(notices).toHaveLength(1)
  const said = String((JSON.parse(notices[0]!.data) as Record<string, unknown>)['saidInFull'])
  expect(said).toContain(stop.id)
  // The cause's own words come from the old copy, not from the close sentence the reader falls back to.
  expect(said).toContain('“Synthetic older Go usage limit.”')
  expect(said).toContain(`It resets ${stop.resetsAt}, ${ASSUMED}.`)
})

// Mutation: take the sentence about the old copies out of the session kind's description of `extra`
// (src/shared/kinds.ts). Red: the kind says nothing of the copies the office still reads there.
// Mutation: add a fourth cause to THE_CAUSES_THEY_MUST_ACT_ON (src/config/stopped-run-cause.mjs). Red: the stop cause's
// kind no longer lists the causes the office reads.
it('declares both as session fields, and says on extra that an older run keeps them there', () => {
  const fields = KIND_SPECS.session.fields
  expect(fields.find((field) => field.key === 'stopCause')?.type).toBe('StopCause')
  expect(fields.find((field) => field.key === 'waitingOnALimit')?.type).toBe('WaitOnALimit')
  const extra = fields.find((field) => field.key === 'extra')?.description ?? ''
  expect(extra).not.toContain('nothing reads')
  expect(extra).toContain('`stopCause`')
  expect(extra).toContain('`waitingOnALimit`')
  // The cause words are written in the kind and where the causes are read, which the web cannot import, so the two
  // are held to agree here.
  expect(SHAPE_SPECS['StopCause']?.fields.find((field) => field.key === 'kind')?.type)
    .toBe(THE_CAUSES_THEY_MUST_ACT_ON.map((cause) => `'${cause}'`).join(' | '))
})
