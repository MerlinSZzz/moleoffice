// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * A QUEUED CHECK THAT NOTHING IN THE OFFICE WILL START SAYS SO, AND ITS RUN'S STARTER IS TOLD ONCE. Wave 13n round DP,
 * problem eVSnbh86YQgi.
 *
 * In merges-only mode the message worker starts a queued check only when the checks switch is on for the check's
 * project. With the switch never set, off, or on for other projects only, the check stayed queued, the run said "Its run
 * and log will appear here when it starts", and nobody was told. The one reading is `whetherAnOfficeWouldStartACheck` in
 * src/shared/whether-a-check-would-start.ts; the office reads it at the ask (`theOfficeStartsTheCheck` in
 * src/server/lib/inspection.ts) and at the minute pass's tick (src/server/lib/a-check-nothing-starts.ts, called from
 * `sendTheRemindersThatAreDue` in src/server/lib/reminders.ts).
 *
 *   1-5. What the run stores at the ask, for each answer of the reading, and the mark it keeps when nothing starts it.
 *   6.   The starter is told once, an hour after the ask, with why and who can start it.
 *   7.   Nobody is told where the check started, the run has its verdict, the ask was replaced or answered, the run was
 *        deleted, or something would start the check at the tick.
 *   8.   A run asked before the mark existed tells nobody.
 *   9.   The tick finds the due marks through the index of migration 0329, in one statement.
 *   10.  The minute pass calls the step.
 *
 * Case 7 builds each state through the office's own writer: the tool start as the worker's door records it, a verdict
 * as its door writes it (`writeAVerdictAsItsDoorWould` in ./helpers.ts), a close as the person's. Only the deletion is
 * written into the table, because the tick reads the column. Every name and value in this file is made up.
 *
 * THE WORDS ARE READ FROM THE CODE THAT DEFINES THEM (src/shared/whether-a-check-would-start.ts), and so is the hour
 * before the starter is told. Each case compares with the sentence function the right answer calls, given the parts it
 * should be given, and checks that the parts it is about are in the stored words.
 */
import type { FastifyInstance } from 'fastify'
import { execFileSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_TEST_OFFICES_OWNER, THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, writeAVerdictAsItsDoorWould, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { howARunStands } from '../src/shared/releasing.ts'
import { localStamp } from '../src/shared/time.ts'
import {
  A_CHECK_NOTHING_STARTS,
  A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS,
  A_MARK_IS_LET_GO_BECAUSE,
  CHECKS_ARE_SWITCHED_OFF,
  NOBODY_CHOSE_TO_RUN_CHECKS,
  THE_MESSAGE_WORKER_IS_OFF,
  THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON,
  WHOEVER_RUNS_THE_OFFICE_CAN_TURN_THE_WORKER_ON,
  aCheckNothingStartsSays,
  aCheckThatWillStartSays,
  checksAreOnForOtherProjects,
  theOfficeStartedNoCheckOf,
  theOfficeStartedNoCheckSays,
} from '../src/shared/whether-a-check-would-start.ts'

const fixtureTip = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const WORKSPACE = 'default'
const SWITCH = '/api/office/checks-in-merges-only'
const MINUTE = 60_000
const as = (type: 'agent' | 'human', id: string): Record<string, string> => ({
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
  'x-mole-office-workspace': WORKSPACE,
})
const person = as('human', THE_PERSON)

let t: TestDb
let app: FastifyInstance
let inspection: typeof import('../src/server/lib/inspection.ts')
let starts: typeof import('../src/server/lib/a-check-nothing-starts.ts')
let reminders: typeof import('../src/server/lib/reminders.ts')
let counts: typeof import('../src/server/lib/slow-requests.ts')
let theSecretary: string

interface TheCheck {
  askedAt: string
  askedOf?: string
  message?: string
  execution?: unknown
  says: string
}
interface TheMark {
  message: string
  askedAt: string
  inspector: string
  because: string
  tellAfterMs: number
  told?: { at: string; message: string }
  notTold?: { at: string; because: string }
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload: Record<string, unknown> | undefined, headers: Record<string, string>) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

async function theSwitch(payload: Record<string, unknown>): Promise<void> {
  const set = await call('POST', SWITCH, { ...payload, because: 'Made up: the test sets the checks switch.' }, person)
  expect(set.status, set.raw).toBe(200)
}

/** A run of the worker that says it is finished, so the office asks the inspector to check it. */
async function aFinishedRun(title: string): Promise<{ run: string; check: TheCheck }> {
  const filed = await call('POST', '/api/records', {
    kind: 'session', title, data: { state: 'running', servingAgent: 'the-worker', cutFrom: 'main', tip: fixtureTip, doing: 'made-up work under check' },
  }, as('agent', 'the-worker'))
  expect(filed.status, filed.raw).toBe(201)
  const run = (filed.body['record'] as { id: string }).id
  t.client.sqlite.prepare('INSERT INTO legacy_unsealed_runs VALUES (?)').run(run)
  const finished = await call('PATCH', `/api/records/${run}`, { dataPatch: { state: 'finished', doing: 'the made-up work is done' } }, as('agent', 'the-worker'))
  expect(finished.status, finished.raw).toBe(200)
  const check = finished.body['theCheck'] as TheCheck | undefined
  expect(check?.askedOf, finished.raw).toBe('inspector-one')
  return { run, check: check! }
}

function theMarkOf(run: string): TheMark | undefined {
  return t.api.getRecord(run)!.data[A_CHECK_NOTHING_STARTS] as TheMark | undefined
}

/** The lines the office wrote about `run` under the notice of this round. */
function theLinesAbout(run: string): { id: string; title: string; body: string; to: { kind: string; id: string }[] }[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, title, data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.notice') = 'theOfficeStartedNoCheck' ORDER BY rowid")
    .all(run) as { id: string; title: string; data: string }[]
  return rows.map((row) => {
    const data = JSON.parse(row.data) as { body: string; to: { kind: string; id: string }[] }
    return { id: row.id, title: row.title, body: data.body, to: data.to }
  })
}

/** The check tool started for `run`'s ask, as the worker's door records it. */
function theToolStarted(run: string): void {
  const check = t.api.getRecord(run)!.data['theCheck'] as TheCheck
  const tool = t.api.createRecord({
    workspaceId: WORKSPACE, kind: 'session', title: 'A made-up check tool run', origin: 'fixture', actor: { type: 'agent', id: 'mole-office/the-api-server' },
    data: { state: 'running', runtime: 'inspection-tool', servingAgent: 'inspector-one', deliveringMessage: check.message },
  }).id
  inspection.recordCheckToolStarted({ run, session: tool, log: '/made/up/check.log', model: 'a-made-up-model', minutes: 30, workspaceId: WORKSPACE })
}

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'merges-only')
  t = await freshDb()
  inspection = await import('../src/server/lib/inspection.ts')
  starts = await import('../src/server/lib/a-check-nothing-starts.ts')
  reminders = await import('../src/server/lib/reminders.ts')
  counts = await import('../src/server/lib/slow-requests.ts')
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'second', title: 'A made-up second project' })
  for (const [headers, payload] of [
    [person, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' }],
    [as('agent', THE_TEST_OFFICES_SECRETARY.handle), { handle: 'the-worker', name: 'The Worker', role: 'worker', workArea: ['src'] }],
    [person, { handle: 'inspector-one', name: 'Inspector One', role: 'inspector' }],
  ] as const) {
    const registered = await call('POST', '/api/agents/started', payload, headers)
    expect(registered.status, registered.raw).toBe(201)
  }
  theSecretary = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(THE_TEST_OFFICES_SECRETARY.handle) as { id: string }).id
})

afterAll(async () => {
  vi.unstubAllEnvs()
  await app?.close()
  t?.close()
})

/** THE ORDER OF THE CASES IS PART OF THE TEST: "nobody chose" holds only until the first case sets the switch. */
describe('what a run stores when the office queues its check', () => {
  it('1. merges-only, and nobody has switched checks on: it says nothing would start it, when, and who can, and keeps a mark', async () => {
    const before = Date.now()
    const { run, check } = await aFinishedRun('A made-up run asked while nobody chose')
    const after = Date.now()
    expect(check.says).toBe(aCheckNothingStartsSays('Inspector One', check.askedAt, { because: NOBODY_CHOSE_TO_RUN_CHECKS, whoCanStartIt: THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON }))
    for (const part of [check.askedAt, NOBODY_CHOSE_TO_RUN_CHECKS, THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON]) expect(check.says).toContain(part)
    const mark = theMarkOf(run)
    expect(mark).toEqual({ message: check.message, askedAt: check.askedAt, inspector: 'inspector-one', because: NOBODY_CHOSE_TO_RUN_CHECKS, tellAfterMs: mark?.tellAfterMs })
    expect(mark!.tellAfterMs).toBeGreaterThanOrEqual(before + A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS)
    expect(mark!.tellAfterMs).toBeLessThanOrEqual(after + A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS)
    // THE NOTICE TO THE INSPECTOR SAYS WHAT THE RUN SAYS, not that the office will run a check nothing would start.
    expect((t.api.getRecord(check.message!)!.data as { body: string }).body).toBe(check.says)
  })

  it('2. merges-only, and checks are switched off: it says they are off', async () => {
    await theSwitch({ on: false })
    const { run, check } = await aFinishedRun('A made-up run asked while checks are off')
    expect(check.says).toBe(aCheckNothingStartsSays('Inspector One', check.askedAt, { because: CHECKS_ARE_SWITCHED_OFF, whoCanStartIt: THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON }))
    expect(theMarkOf(run)?.because).toBe(CHECKS_ARE_SWITCHED_OFF)
  })

  it('3. merges-only, and checks are on for another project only: it names that project and this one', async () => {
    await theSwitch({ on: true, projects: ['second'] })
    const { run, check } = await aFinishedRun('A made-up run asked while checks are on for another project')
    const because = checksAreOnForOtherProjects(['second'], WORKSPACE)
    for (const project of ['second', WORKSPACE]) expect(because).toContain(project)
    expect(check.says).toBe(aCheckNothingStartsSays('Inspector One', check.askedAt, { because, whoCanStartIt: THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON }))
    expect(theMarkOf(run)?.because).toBe(because)
  })

  it('4. where something would start it, the sentence of a check that will start, and no mark', async () => {
    const TODAY = aCheckThatWillStartSays('Inspector One')
    await theSwitch({ on: true })
    const inMergesOnly = await aFinishedRun('A made-up run asked while checks are on for this project')
    expect(inMergesOnly.check.says).toBe(TODAY)
    expect(theMarkOf(inMergesOnly.run)).toBeUndefined()

    vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'on')
    await theSwitch({ on: false })
    try {
      const inOn = await aFinishedRun('A made-up run asked while the worker is on')
      expect(inOn.check.says).toBe(TODAY)
      expect(theMarkOf(inOn.run)).toBeUndefined()
    } finally {
      vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'merges-only')
    }
  })

  it('5. the message worker is off: it says so, and who can turn it on', async () => {
    vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
    try {
      const { run, check } = await aFinishedRun('A made-up run asked while the worker is off')
      expect(check.says).toBe(aCheckNothingStartsSays('Inspector One', check.askedAt, { because: THE_MESSAGE_WORKER_IS_OFF, whoCanStartIt: WHOEVER_RUNS_THE_OFFICE_CAN_TURN_THE_WORKER_ON }))
      expect(theMarkOf(run)?.because).toBe(THE_MESSAGE_WORKER_IS_OFF)
    } finally {
      vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'merges-only')
    }
  })
})

describe("the run's starter is told once, A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS after the ask", () => {
  it('6. nothing a minute before; one line a minute after, with why and who can start it; nothing on the next tick', async () => {
    await theSwitch({ on: false })
    const { run, check } = await aFinishedRun('A made-up run whose starter is told')
    const mark = theMarkOf(run)!
    const asked = mark.tellAfterMs - A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS

    expect(starts.tellTheStartersOfChecksNothingStarts(new Date(asked + A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS - MINUTE))).not.toContain(run)
    expect(theLinesAbout(run)).toEqual([])
    expect(theMarkOf(run)).toEqual(mark)

    const at = new Date(asked + A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS + MINUTE)
    expect(starts.tellTheStartersOfChecksNothingStarts(at)).toContain(run)
    const lines = theLinesAbout(run)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.title).toBe(theOfficeStartedNoCheckOf(run))
    expect(lines[0]!.body).toBe(
      theOfficeStartedNoCheckSays(run, 'inspector-one', check.askedAt, localStamp(at), { because: CHECKS_ARE_SWITCHED_OFF, whoCanStartIt: THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON }),
    )
    for (const part of [run, check.askedAt, localStamp(at), CHECKS_ARE_SWITCHED_OFF, THE_OWNER_OR_A_SECRETARY_CAN_SWITCH_CHECKS_ON]) expect(lines[0]!.body).toContain(part)
    // THE STARTER RECORDED ON THE AGENT THE RUN SERVES: the secretary registered the worker.
    expect(lines[0]!.to).toEqual([{ kind: 'agent', id: theSecretary }])
    expect(theMarkOf(run)).toEqual({ ...mark, told: { at: localStamp(at), message: lines[0]!.id } })

    expect(starts.tellTheStartersOfChecksNothingStarts(new Date(asked + A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS + 2 * MINUTE))).not.toContain(run)
    expect(theLinesAbout(run)).toHaveLength(1)
  })
})

describe('nobody is told where the check no longer waits on nothing', () => {
  it('7. started, released, refused, replaced, answered, deleted, or something would start it at the tick: no line, and why', async () => {
    await theSwitch({ on: false })
    const started = (await aFinishedRun('A made-up run whose check started')).run
    theToolStarted(started)

    const released = (await aFinishedRun('A made-up run its starter released')).run
    writeAVerdictAsItsDoorWould(t, released, { released: { by: { kind: 'agent', id: theSecretary }, how: 'its starter', at: localStamp(new Date()) } })

    const refused = (await aFinishedRun('A made-up run the inspector refused')).run
    writeAVerdictAsItsDoorWould(t, refused, { refused: { by: { kind: 'agent', id: 'inspector-one' }, at: localStamp(new Date()), missing: ['a made-up missing thing'] } })

    // A NEWER ASK THAT SOMETHING WOULD START writes no mark of its own, so the old mark is the one the tick reads.
    const replaced = (await aFinishedRun('A made-up run asked again')).run
    const firstAsk = theMarkOf(replaced)!.message
    await theSwitch({ on: true })
    const again = await call('POST', `/api/checks/${replaced}/ask-again`, {}, person)
    expect(again.status, again.raw).toBe(200)
    expect((t.api.getRecord(replaced)!.data['theCheck'] as TheCheck).message).not.toBe(firstAsk)
    await theSwitch({ on: false })

    const answered = (await aFinishedRun('A made-up run closed unchecked')).run
    inspection.closeARunUnchecked({
      runId: answered, workspaceId: WORKSPACE, because: 'A made-up reason to close it unchecked.',
      actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id, provedBy: 'the-person-key' },
    })

    const deleted = (await aFinishedRun('A made-up run that was deleted')).run
    t.client.sqlite.prepare('UPDATE records SET deleted_at = ? WHERE id = ?').run(localStamp(new Date()), deleted)

    const switchedOn = (await aFinishedRun('A made-up run whose checks were switched on')).run
    const marks = new Map([started, released, refused, replaced, answered, deleted, switchedOn].map((run) => [run, theMarkOf(run)!]))
    await theSwitch({ on: true })

    const at = new Date(Math.max(...[...marks.values()].map((mark) => mark.tellAfterMs)) + MINUTE)
    const told = starts.tellTheStartersOfChecksNothingStarts(at)
    const because = (run: string): string | undefined => theMarkOf(run)?.notTold?.because
    for (const run of marks.keys()) {
      expect(told, run).not.toContain(run)
      expect(theLinesAbout(run), run).toEqual([])
      expect(theMarkOf(run)?.told, run).toBeUndefined()
    }
    expect(because(started)).toBe(A_MARK_IS_LET_GO_BECAUSE.theCheckStarted)
    expect(because(released)).toBe(A_MARK_IS_LET_GO_BECAUSE.theRunHasItsVerdict('released'))
    expect(because(refused)).toBe(A_MARK_IS_LET_GO_BECAUSE.theRunHasItsVerdict('refused'))
    expect(because(replaced)).toBe(A_MARK_IS_LET_GO_BECAUSE.aNewerAskReplacedIt)
    expect(because(answered)).toBe(A_MARK_IS_LET_GO_BECAUSE.theAskWasAnsweredWithoutACheck(howARunStands(t.api.getRecord(answered)!.data).says))
    expect(because(switchedOn)).toBe(A_MARK_IS_LET_GO_BECAUSE.theOfficeWouldStartItNow)
    // A DELETED RUN IS NOT READ, so its mark stays as the ask left it.
    expect(theMarkOf(deleted)).toEqual(marks.get(deleted))
    expect(theMarkOf(started)?.notTold?.at).toBe(localStamp(at))
    await theSwitch({ on: false })
  })
})

describe('the runs asked before the mark existed', () => {
  it('8. a run whose check was queued with no mark tells nobody', async () => {
    const { run } = await aFinishedRun('A made-up run asked before this round')
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.aCheckNothingStarts') WHERE id = ?").run(run)
    const at = new Date(Date.now() + 2 * A_CHECK_NOTHING_STARTS_IS_TOLD_AFTER_MS)
    expect(starts.tellTheStartersOfChecksNothingStarts(at)).not.toContain(run)
    expect(theLinesAbout(run)).toEqual([])
    expect(theMarkOf(run)).toBeUndefined()
  })
})

describe('the cost of a tick', () => {
  it('9. one statement, through the index of migration 0329, that reads no run when none is due', async () => {
    // THE FIELD THE INDEX HOLDS IS THE ONE THE OFFICE WRITES: src/server/db/schema.ts writes the name out.
    const { STORED_FIELDS, theWordsOfAStoredField } = await import('../src/server/db/schema.ts')
    expect(theWordsOfAStoredField(STORED_FIELDS.sessionTellsOfACheckNothingStartsAfter, 'data')).toContain(`'$.${A_CHECK_NOTHING_STARTS}.tellAfterMs'`)

    // 300 RUNS ASKED BEFORE THE MARK, and three marks not yet due.
    const old = await aFinishedRun('A made-up run asked long ago')
    t.client.sqlite.prepare("UPDATE records SET data = json_remove(data, '$.aCheckNothingStarts') WHERE id = ?").run(old.run)
    // EVERY COLUMN BUT THE ID IS COPIED, so a column the records table gains later needs no change here.
    const columns = (t.client.sqlite.prepare('PRAGMA table_info(records)').all() as { name: string }[]).map((column) => column.name).filter((name) => name !== 'id').join(', ')
    const copy = t.client.sqlite.prepare(`INSERT INTO records (id, ${columns}) SELECT ?, ${columns} FROM records WHERE id = ?`)
    for (let n = 0; n < 300; n += 1) copy.run(`made-up-old-run-${String(n)}`, old.run)
    for (let n = 0; n < 3; n += 1) await aFinishedRun(`A made-up run not yet due, ${String(n)}`)

    const ran: { sql: string; values: unknown[] }[] = []
    const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
    const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
      const statement = prepare(source)
      for (const method of ['all', 'get', 'iterate', 'run'] as const) {
        const real = statement[method].bind(statement) as (...values: unknown[]) => unknown
        ;(statement as unknown as Record<string, unknown>)[method] = (...values: unknown[]) => {
          ran.push({ sql: source, values })
          return real(...values)
        }
      }
      return statement
    }) as never)
    const did = counts.aFreshCount()
    let told: string[]
    try {
      told = counts.countedApart(did, () => starts.tellTheStartersOfChecksNothingStarts(new Date()))
    } finally {
      spy.mockRestore()
    }
    expect(told).toEqual([])
    expect({ statements: did.statements, rows: did.rows }).toEqual({ statements: 1, rows: 0 })
    expect(ran).toHaveLength(1)
    const plan = (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${ran[0]!.sql}`).all(...ran[0]!.values) as { detail: string }[]).map((step) => step.detail)
    expect(plan.join('\n')).toMatch(/^SEARCH records USING INDEX records_session_check_nothing_starts_idx /m)
    expect(plan.filter((step) => /\bSCAN records\b/.test(step))).toEqual([])
  })
})

describe('the minute pass', () => {
  it('10. calls the step, and its report names the run whose starter it told', async () => {
    await theSwitch({ on: false })
    const { run } = await aFinishedRun('A made-up run the minute pass tells of')
    const now = new Date(theMarkOf(run)!.tellAfterMs + MINUTE)
    const steps: { name: string }[] = []
    const pass = reminders.sendTheRemindersThatAreDue(WORKSPACE, now, new Date(now.getTime() - MINUTE), undefined, steps as never)
    expect(pass.checksNothingStartsTold).toContain(run)
    expect(steps.map((step) => step.name)).toContain('the checks nothing starts')
    expect(theLinesAbout(run)).toHaveLength(1)
  })
})


describe('a reminder after ownership changes', () => {
  it('tells the current owner when a check remains unstarted', async () => {
    const newSecretary = await call('POST', '/api/agents/started', { handle: 'another-reminder-secretary', name: 'Another reminder secretary', role: 'secretary' }, person)
    expect(newSecretary.status).toBe(201)
    const ownerId = (newSecretary.body['agent'] as { id: string }).id
    const worker = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get('the-worker') as { id: string }
    setFixtureOwner(t.client.sqlite, ownerId, worker.id, 'id')
    try {
      await theSwitch({ on: false })
      const { run } = await aFinishedRun('A made-up run whose owner is told')
      const mark = theMarkOf(run)!
      expect(starts.tellTheStartersOfChecksNothingStarts(new Date(mark.tellAfterMs + MINUTE))).toContain(run)
      expect(theLinesAbout(run).map((line) => line.to)).toEqual([[{ kind: 'agent', id: ownerId }]])
    } finally {
      setFixtureOwner(t.client.sqlite, theSecretary, worker.id, 'id')
    }
  })
})
