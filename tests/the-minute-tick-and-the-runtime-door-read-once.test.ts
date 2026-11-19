// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MINUTE'S REMINDERS READ ONCE PER TICK, AND THE RUNTIME DOOR'S WORKER LINE READS ITS RUNS ONCE.
 *
 * MEASURED FIRST, 25 September 2026, on a copy of the owner's office in sandbox w13g (problem zo_hyUBLSAVJ).
 * One tick of `sendTheRemindersThatAreDue` held the one thread for a median of 459 ms. Part of that
 * was questions asked once per item:
 *
 *   - `tellThemOncePerCause` scanned the session records once per cause and the messages once per
 *     cause that had stopped a run: up to six scans a tick, about 74 ms on the copy.
 *   - The expected-time loop scanned the messages twice for each run it watched, about 10 ms a scan.
 *   - The idle check joined the office's lines once for each agent past its idle hour, about 13 ms
 *     an agent.
 *   - `activityPerAgent` read the session records in two passes, where one gives the same answer.
 *
 * And `workerRuns`, which GET /api/runtime draws as its worker line, read every session row twice:
 * once itself, and again inside `runsWaitingForTheNextMessage`, which it called with no rows.
 *
 * THE STEP REMINDER, since wave 14d, asks once a tick for the step reminders already sent about the running runs
 * (`theMarksSentAbout` in src/server/lib/step-reminders.ts). Its question also reads a line's run and words, as the
 * expected-time question does, so it is counted as a question of its own and left out of that one. Its answer is
 * checked as well: the question must be asked about every running run, and the larger office holds more of them. A
 * run reminded in the first tick is not reminded again in the second, at the same moment, because the question gave
 * its reminder back.
 *
 * HOW IT IS PROVED. Every statement is counted each time it RUNS, not only when it is prepared: the
 * database's `prepare` is wrapped, and so are `all`, `get`, `run` and `iterate` on each statement it
 * hands back. The tick is run twice, over a small office and then over a larger one: more agents
 * past their idle hour, more runs past their expected time, and more causes that stopped a run. Each
 * expensive question must run exactly once in both ticks. The answer is checked too, so that every
 * item really reached the question being counted.
 *
 * WHAT THE TICK SENDS IS PINNED ELSEWHERE, and this file does not repeat it:
 * tests/the-office-reminds-idle-agents-and-runs-past-their-expected-time.test.ts and
 * tests/a-stopped-run-tells-the-person-once-as-the-office.test.ts.
 *
 * THE THREE RUNS: control green; mutation (one per-item read put back) red; restore green. The
 * commands and the logs are in the commit message.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { clockStamp, localStamp } from '../src/shared/time.ts'

let t: TestDb
let reminders: typeof import('../src/server/lib/reminders.ts')
let worker: typeof import('../src/server/lib/worker.ts')
/** An empty folder of worlds, so the world sweep in the tick reads nothing of the checkout's. */
let worlds: string

const HUMAN = { type: 'human', id: THE_PERSON } as const
const R0 = new Date()
const at = (msFromR0: number): Date => new Date(R0.getTime() + msFromR0)
/** Two hours on: past the idle hour, and past the hour-long expected time the runs below carry. */
const TICK_AT = at(2 * 3_600_000 - 60_000)
const WATCHING_SINCE = new Date(R0.getTime() - 60_000)

beforeEach(async () => {
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  worker = await import('../src/server/lib/worker.ts')
  const roles = await import('../src/server/lib/roles.ts')
  const records = await import('../src/server/lib/records.ts')
  roles.readTheRoleCards({ guardActKeys: records.GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  worlds = mkdtempSync(join(tmpdir(), 'mole-office-read-once-worlds-'))
})

afterEach(() => {
  t.close()
  rmSync(worlds, { recursive: true, force: true })
})

/** Every statement's SQL, once for each time it ran while `act` did, and the values it ran with. */
function statementsRunDuring<T>(act: () => T): { ran: string[]; asked: { sql: string; values: unknown[] }[]; result: T } {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const original = sqlite.prepare
  const ran: string[] = []
  const asked: { sql: string; values: unknown[] }[] = []
  sqlite.prepare = function (this: unknown, sql: string) {
    const statement = original.call(this, sql)
    for (const method of ['all', 'get', 'run', 'iterate']) {
      const own = statement[method] as ((...args: unknown[]) => unknown) | undefined
      if (typeof own !== 'function') continue
      statement[method] = function (this: unknown, ...args: unknown[]) {
        ran.push(sql)
        asked.push({ sql, values: args })
        return own.apply(this, args)
      }
    }
    return statement
  }
  try {
    return { ran, asked, result: act() }
  } finally {
    sqlite.prepare = original
  }
}

/** One agent with one message to it now: real work arriving, which starts its idle spell now. */
function anAgentGivenWork(handle: string): string {
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: handle,
    data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' },
    actor: HUMAN,
  })
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'message',
    title: 'some work',
    data: { body: 'Please read the logs.', to: [{ kind: 'agent', id: row.id }] },
    actor: HUMAN,
  })
  return row.id
}

/** One running run for an agent, started at R0 and expected to take an hour. */
function aRunExpectedToTakeAnHour(agentId: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'answering a message',
    data: {
      state: 'running',
      runtime: 'fake',
      servingAgent: agentId,
      startedAt: localStamp(R0),
      startedTime: clockStamp(() => R0),
      deliveringMessage: 'none-here',
      expectedMinutes: 60,
    },
    actor: HUMAN,
  }).id
}

/** One run already closed for a cause the owner must act on, the way the hook leaves it. */
function aRunStoppedBy(cause: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `stopped by ${cause}`,
    data: {
      state: 'crashed',
      closedAt: localStamp(R0),
      closedBecause: `stopped: ${cause}`,
      closedHow: 'provider-event',
      stopCause: { kind: cause, said: `stopped: ${cause}`, at: null, resetsAt: null },
    },
    actor: HUMAN,
  }).id
}

/**
 * How many times the kept fields of the sessions were read (lib/session-fields.ts, wave 13y round 17). Each of the
 * tick's four callers may read once the rows that changed since the reading before, so it is at most four, however many
 * agents, runs and causes the tick judges. A row stamped in the second of the last reading is read again, so in a test
 * whose rows are all written in that second each caller reads.
 */
const THE_CALLERS_OF_THE_KEPT_FIELDS = 4
const keptFieldReadings = (ran: string[]): number => ran.filter((sql) => /AS stopCause\b/.test(sql)).length

/**
 * THE STEP REMINDERS' QUESTION, known by the one field only it reads: the mark each step reminder keeps beside its line,
 * under the key `extra.stepReminder`. That is a key of the code and not words a person reads.
 */
const THE_STEP_REMINDERS_QUESTION = /'\$\.extra\.stepReminder'\)/

/** The values the step reminders' question was asked with, which name the runs it was asked about. */
const theValuesOfTheStepRemindersQuestion = (asked: { sql: string; values: unknown[] }[]): unknown[] =>
  asked.filter((one) => THE_STEP_REMINDERS_QUESTION.test(one.sql)).flatMap((one) => one.values.flat())

/** How many times each expensive question of the tick ran. */
function questionsOfTheTick(ran: string[]): Record<string, number> {
  const count = (test: (sql: string) => boolean) => ran.filter(test).length
  return {
    'the idle lines already said': count((sql) => /message_delivery/.test(sql) && /'\$\.body'\)\s*=/.test(sql)),
    // NOT THE STEP REMINDERS' QUESTION, which reads the same two fields and is counted on its own below.
    'the lines already said about runs': count(
      (sql) => /'\$\.aboutRun'\)/.test(sql) && /'\$\.body'\)/.test(sql) && !THE_STEP_REMINDERS_QUESTION.test(sql),
    ),
    'the step reminders already sent about runs': count((sql) => THE_STEP_REMINDERS_QUESTION.test(sql)),
    // NOT THE KEPT FIELDS' READING (lib/session-fields.ts), which reads the same field and is bounded on its own below.
    'the runs each cause stopped': count((sql) => /'\$\.stopCause\.kind'\)/.test(sql) && !/AS stopCause\b/.test(sql)),
    'the last notice of each cause': count((sql) => /'\$\.extra\.m94\.cause'\)/.test(sql)),
    'the runs of each agent': count((sql) => /'\$\.servingAgent'\)/.test(sql) && /'\$\.lastOutputAt'\)/.test(sql)),
  }
}

const ONCE = {
  'the idle lines already said': 1,
  'the lines already said about runs': 1,
  'the step reminders already sent about runs': 1,
  'the runs each cause stopped': 1,
  'the last notice of each cause': 1,
  'the runs of each agent': 1,
}

describe('one tick of the minute reminders', () => {
  it('asks each expensive question once, however many agents, runs and causes it judges', () => {
    // A SMALL OFFICE: one agent past its idle hour, one run past its expected time, one cause.
    const first = anAgentGivenWork('read-once-first')
    const firstRun = aRunExpectedToTakeAnHour(first)
    aRunStoppedBy('session-limit')
    const small = statementsRunDuring(() => reminders.sendTheRemindersThatAreDue('default', TICK_AT, WATCHING_SINCE, worlds))
    expect(small.result.idleReminded).toContain('read-once-first')
    expect(small.result.expectedTimeReached).toEqual([firstRun])
    expect(small.result.noticesSent).toEqual(['session-limit'])
    expect(questionsOfTheTick(small.ran)).toEqual(ONCE)
    expect(keptFieldReadings(small.ran)).toBeLessThanOrEqual(THE_CALLERS_OF_THE_KEPT_FIELDS)
    // THE STEP REMINDER'S ANSWER, after its count. The run is two hours into its first step, past the 45 minutes.
    expect(theValuesOfTheStepRemindersQuestion(small.asked)).toEqual(expect.arrayContaining([firstRun]))
    expect(small.result.stepReminded).toEqual([firstRun])

    // A LARGER ONE: four agents past their hour, four runs past their time, three causes. The
    // first agent, its run and its cause were already told, and are judged again all the same.
    const more = ['read-once-second', 'read-once-third', 'read-once-fourth'].map((handle) => ({
      handle,
      run: aRunExpectedToTakeAnHour(anAgentGivenWork(handle)),
    }))
    aRunStoppedBy('quota')
    aRunStoppedBy('login')
    const large = statementsRunDuring(() => reminders.sendTheRemindersThatAreDue('default', TICK_AT, WATCHING_SINCE, worlds))
    expect([...large.result.idleReminded].sort()).toEqual(more.map((one) => one.handle).sort())
    expect([...large.result.expectedTimeReached].sort()).toEqual(more.map((one) => one.run).sort())
    expect([...large.result.noticesSent].sort()).toEqual(['login', 'quota'])
    expect(questionsOfTheTick(large.ran)).toEqual(ONCE)
    expect(keptFieldReadings(large.ran)).toBeLessThanOrEqual(THE_CALLERS_OF_THE_KEPT_FIELDS)
    // ASKED ABOUT ALL FOUR RUNNING RUNS IN ONE QUESTION. The first was reminded at this moment in the small tick, and
    // the question gave that reminder back, so it is not reminded again.
    expect(theValuesOfTheStepRemindersQuestion(large.asked)).toEqual(expect.arrayContaining([firstRun, ...more.map((one) => one.run)]))
    expect([...large.result.stepReminded].sort()).toEqual(more.map((one) => one.run).sort())
  })
})

describe("the runtime door's worker line", () => {
  it('reads the session rows once and counts the queued deliveries without reading them', () => {
    for (let i = 0; i < 3; i += 1) {
      t.api.createRecord({
        workspaceId: 'default',
        kind: 'session',
        title: `a run the worker filed ${String(i)}`,
        data: { state: 'running', runtime: 'fake', servingAgent: 'nobody-here', deliveringMessage: `m-${String(i)}` },
        actor: HUMAN,
      })
    }
    const read = statementsRunDuring(() => worker.workerRuns())
    expect(read.result.last).not.toBeNull()
    // THE KIND MAY BE PASSED AS A VALUE OR WRITTEN OUT. Since wave 13n round 33 the worker's read names
    // it in words, so SQLite can use an index that holds only sessions (migration 0199).
    const sessionReads = read.ran.filter(
      (sql) => /from "records"/i.test(sql) && /"records"\."kind" = (\?|'session')/.test(sql) && /order by/i.test(sql),
    )
    expect(sessionReads, 'every session row is read once for the worker line, not twice').toHaveLength(1)
    const queuedReads = read.ran.filter((sql) => /from "message_delivery"/i.test(sql) && /"mark" = \?/.test(sql))
    expect(queuedReads).toHaveLength(1)
    expect(queuedReads[0], 'the queued deliveries are counted by the database, not fetched and counted').toMatch(/count\(\*\)/)
  })
})
