// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ROUND 48, ITEM 2: A GO STOP SAYS WHERE ITS RESET CAME FROM, AND EVERY PLACE THAT SHOWS THE RESET SAYS IT TOO.
 *
 * Before: when OpenCode sent no retry-after, the office took five hours from the stop, and only the run's own
 * closedBecause said so. The notice to the person and the roll's skip reason showed the reset time with no word that it
 * was assumed. Now the launcher stores `resetFrom` on the stop cause, worked out once where the Go limit is read, and
 * the notice and the skip reason carry those words as stored. A stop cause that carries no `resetFrom`, such as one a
 * Claude Code transcript gave, gets no words made up for it.
 *
 * The stops here are fixture sessions in a disposable database, in the shape the launcher writes for a Go limit. No
 * provider or launcher runs, and nothing listens on the live office port. Each test was proved by a control run, its
 * named mutation red, and the restore.
 */
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { theCastingRoll, type CastingRollRow } from '../src/shared/casting-roll.ts'

let t: TestDb
let reminders: typeof import('../src/server/lib/reminders.ts')
let limits: typeof import('../src/server/lib/casting-roll.ts')
const made: string[] = []

const HUMAN = { type: 'human', id: THE_PERSON } as const
const NAMED = 'named by the error: "retry-after: 18000"'
const ASSUMED = "assumed: five hours, Go's allowance window (the error sent no retry-after)"
/** Real now, once, so the notice's hour and the roll's week both hold the stop. */
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
  // The notice reads every live quota notice in the office, so each case takes away the one it caused.
  t.client.sqlite.prepare(
    "UPDATE records SET deleted_at = ? WHERE kind = 'message' AND deleted_at IS NULL " +
    "AND json_extract(data, '$.extra.m94.cause') = 'quota'",
  ).run(localStamp(new Date()))
})

/** A run Go's limit stopped, as the launcher writes one; `resetFrom` is left out when it is undefined. */
function aGoStop(stoppedAt: Date, resetFrom: string | undefined): { id: string; resetsAt: string } {
  const resetsAt = new Date(stoppedAt.getTime() + 5 * HOUR).toISOString()
  const id = t.api.createRecord({
    workspaceId: 'default', kind: 'session', title: `Synthetic Go stop at ${String(stoppedAt.getTime())}`, actor: HUMAN,
    data: {
      state: 'crashed', runtime: 'opencode', model: 'opencode-go/glm-5.1',
      closedAt: localStamp(stoppedAt), closedHow: 'provider-event',
      closedBecause: 'OpenCode Go stopped the run at its usage limit: "Synthetic Go usage limit."',
      stopCause: { kind: 'quota', said: 'Synthetic Go usage limit.', at: stoppedAt.toISOString(), resetsAt, ...(resetFrom === undefined ? {} : { resetFrom }) },
    },
  }).id
  made.push(id)
  return { id, resetsAt }
}

/** The one notice the office sent the person about quota stops. */
function theQuotaNotice(): string {
  const rows = t.client.sqlite.prepare(
    "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
    "AND json_extract(data, '$.sentBy.id') = (SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0) AND json_extract(data, '$.extra.m94.cause') = 'quota'",
  ).all() as { data: string }[]
  expect(rows).toHaveLength(1)
  return String((JSON.parse(rows[0]!.data) as Record<string, unknown>)['saidInFull'])
}

const rows: CastingRollRow[] = [
  { id: 23, program: 'codex', model: 'openai/gpt-6-luna', effort: 'medium', probability: 0.4, marked: false, labels: ['simple'], outUntil: null },
  { id: 24, program: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: null, probability: 0.9, marked: false, labels: ['simple'], outUntil: null },
]

// Mutation: theResetThisRunNames in src/server/lib/reminders.ts hands back the reset time alone. Red: the notice
// says when Go resets but not that the time was assumed.
it('tells the person that a Go reset was assumed, in the words the stop cause carries', () => {
  const stop = aGoStop(new Date(R0.getTime() - 10 * 60_000), ASSUMED)
  const pass = reminders.sendTheRemindersThatAreDue('default', R0, new Date(R0.getTime() - 60_000))
  expect(pass.noticesSent).toEqual(['quota'])
  const said = theQuotaNotice()
  expect(said).toContain(stop.id)
  expect(said).toContain(`It resets ${stop.resetsAt}, ${ASSUMED}.`)
})

// Mutation: theModelsLimitedAt in src/server/lib/casting-roll.ts leaves resetFrom out of the limit's sentence. Red:
// the skip reason names the run and the time but not where the time came from.
it('gives the roll a skip reason that carries where the Go reset came from', () => {
  const stop = aGoStop(new Date(R0.getTime() - HOUR), NAMED)
  const answer = theCastingRoll({
    role: 'worker', project: 'default', rows, difficulty: null, named: null, earlier: null, builderModel: null,
    limits: limits.theModelsLimitedAt(R0.getTime(), { officeZone: 'UTC' }), random: () => 0.999,
  })
  expect(answer).toMatchObject({ runtime: 'codex', rowId: 23 })
  const reasons = answer.record.skipped.find((row) => row.rowId === 24)?.reasons ?? []
  expect(reasons).toHaveLength(1)
  expect(reasons[0]).toContain(`Run ${stop.id} reports quota until `)
  expect(reasons[0]).toContain(` UTC, ${NAMED}. It covers every opencode-go model.`)
})

// Mutation: theResetThisRunNames and theModelsLimitedAt add "named by the error" to a stop cause that carries no
// resetFrom. Red: the notice and the skip reason each claim a source nobody recorded.
it('makes up no source for a reset whose stop cause names none', () => {
  const stop = aGoStop(new Date(R0.getTime() - 10 * 60_000), undefined)
  reminders.sendTheRemindersThatAreDue('default', R0, new Date(R0.getTime() - 60_000))
  expect(theQuotaNotice()).toContain(`It resets ${stop.resetsAt}.`)
  const said = limits.theModelsLimitedAt(R0.getTime(), { officeZone: 'UTC' }).limited.map((one) => one.says)
  expect(said).toHaveLength(1)
  expect(said[0]).toMatch(/ UTC\. It covers every opencode-go model\.$/)
})
