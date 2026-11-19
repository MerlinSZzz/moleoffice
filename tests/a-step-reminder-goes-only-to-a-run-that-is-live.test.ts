// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STEP REMINDER GOES ONLY TO A RUN THAT IS LIVE (wave 14d, round 2, clauses RF-1 to RF-3).
 *
 * The step "the step reminder" of the minute pass (src/server/lib/step-reminders.ts) reads every running run that names
 * the agent it serves, and reminds one only when both of these hold:
 *   - the newest step of the run's own flow run does not close the run. The office's steps for a run confirmed (in
 *     either sentence the office has written for it), closed unchecked and closed as superseded close it. "The run
 *     ended." does not: a running run whose newest step it is was set running again after it ended.
 *   - the run showed a sign of life within the orphan time, MOLE_OFFICE_ORPHAN_AFTER, counted back from the pass's
 *     clock: its record changed, a step was recorded on one of its flow runs, its log grew, or the conversation file of
 *     a sandboxed Claude Code run changed. The office's own reminder lines about it are not a sign of life.
 * The pass changes no record.
 *
 * WHAT THIS HOLDS.
 *   (a) For each closing step: no reminder by time, and no reminder of a new step when the closing step is the new one.
 *   (b) A run whose newest own step is sealed, released or landed by hand is still reminded. A closing step on a flow
 *       the run entered does not stop its reminders. A run set running again after "The run ended." is reminded while
 *       it shows a sign of life, and not once it has been quiet for longer than the orphan time.
 *   (c) A run quiet for longer than the orphan time is not reminded. Quiet for less, it is reminded at M minutes, and a
 *       minute before the orphan time.
 *   (d) Each sign of life alone brings a quiet run back, at once, on the next pass: its record changed, a step on its
 *       own flow run, its log grew (lastOutputAt, and lastOutputTime), and its conversation file changed.
 *   (e) A run reminded at M and 2M minutes with no other sign is not reminded at 3M minutes or later.
 *   (f) After the passes, the run's record, its state and its updatedAt are what they were, and no change was written.
 *   (g) With MOLE_OFFICE_ORPHAN_AFTER set to another value in the office, the line moves with it.
 * And the time of the step in the minute pass, on an office of 50 made-up running runs, is printed.
 *
 * M is the setting MOLE_OFFICE_STEP_REMINDER_MINUTES and the orphan time is ORPHAN_AFTER_SECONDS, each read where the
 * code defines it. (c) and (e) hold their minutes only while 2M is less than the orphan time and 3M more, and say so.
 *
 * MADE UP. Every agent, run, flow, step and conversation file here is made up for this test, in fresh test databases.
 * No live office is read. R0 is the real time a case's run was filed, and each pass is given a clock of its own, minutes
 * after it. A sign of life at a made-up time is written with the office's clock set to that time, so what the office
 * stamps is that time. The log's times are written on the record by hand with the clock left at R0, as the record's
 * change would be a sign of its own. The sandboxes folder of this file is a temporary folder of its own, and the
 * conversation file of (d) is made up there.
 *
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN:
 *   1. The closing steps are not read. (a) goes red: each closed run is reminded.
 *   2. The once-written sentence for a confirmed run is left out of the closing steps. (a) goes red at that sentence.
 *   3. The closing steps are read on the newest step of any flow run. (b) goes red at the entered flow.
 *   4. Sealed, released and landed by hand close a run. (b) goes red.
 *   5. "The run ended." closes a run. (b) goes red at the run set running again.
 *   6. No sign of life is asked for. (c), (d) and (e) go red.
 *   7. The record's updatedAt is not a sign. (d) goes red at the record changed.
 *   8. A step is not a sign. (d) goes red at the step.
 *   9. The log is not a sign. (d) goes red at lastOutputAt and lastOutputTime.
 *  10. The conversation file is not a sign. (d) goes red at the conversation file.
 *  11. The office's own reminder lines are a sign. (e) goes red at 3M minutes.
 *  12. The pass marks a quiet run orphaned. (f) goes red.
 *  13. The orphan time is the default whatever the setting says. (g) goes red.
 */
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { ENTERED_STEP_DOES, OFFICE_STEP_DOES, OFFICE_STEP_SENTENCES_ONCE_WRITTEN } from '../src/shared/flow-run.ts'
import type { FlowRunStep } from '../src/server/lib/flow-runs.ts'
import { clockStamp, localStamp, parseAnyStamp } from '../src/shared/time.ts'
import type { StepReminderMark } from '../src/server/lib/step-reminders.ts'
import { theTranscriptFolder } from '../src/config/claude-code-served.mjs'
import { SANDBOXES_FOLDER } from '../src/config/sandbox-folder.mjs'

// THE SANDBOXES FOLDER IS A TEMPORARY FOLDER OF THIS FILE, so the made-up sandbox of (d) is the only one there.
vi.mock('../src/config/sandbox-folder.mjs', async (importOriginal) => {
  const { mkdtempSync: aFolder } = await import('node:fs')
  const { tmpdir: theTemporaryFolder } = await import('node:os')
  const { join: joined } = await import('node:path')
  return { ...(await importOriginal<typeof import('../src/config/sandbox-folder.mjs')>()), SANDBOXES_FOLDER: aFolder(joined(theTemporaryFolder(), 'live-step-reminder-sandboxes-')) }
})

const WORKSPACE = 'default'
const OWNER = { type: 'human', id: THE_TEST_OFFICES_OWNER.id, stated: true } as const
const asAgent = (handle: string, session: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-session': session,
})
const THE_LINE = SYSTEM_LINES.aStepReminder('').line
/** Before every record of this file, so every step here is recorded while the office watches, but in (a). */
const WATCHING_SINCE = new Date(Date.now() - 60_000)

/** The steps that close a run, by the sentences the office writes for them. */
const CLOSING = [OFFICE_STEP_DOES.confirmed, OFFICE_STEP_SENTENCES_ONCE_WRITTEN.confirmed, OFFICE_STEP_DOES.closedUnchecked, OFFICE_STEP_DOES.superseded]
/** The office's steps after which a run is still at work. */
const NOT_CLOSING = [OFFICE_STEP_DOES.sealed, OFFICE_STEP_DOES.released, OFFICE_STEP_DOES.landedByHand]

let t: TestDb
let app: Awaited<ReturnType<typeof apiApp>>
let stepReminders: typeof import('../src/server/lib/step-reminders.ts')
let reminders: typeof import('../src/server/lib/reminders.ts')
let flowRuns: typeof import('../src/server/lib/flow-runs.ts')
let adapters: typeof import('../src/server/lib/adapters/index.ts')
let env: typeof import('../src/server/db/env.ts')
let noWorlds: string

/** A made-up office, with the role cards read as the server reads them when it starts. */
async function openAnOffice(): Promise<void> {
  t = await freshDb()
  app = await apiApp()
  await app.app.ready()
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
  stepReminders = await import('../src/server/lib/step-reminders.ts')
  reminders = await import('../src/server/lib/reminders.ts')
  flowRuns = await import('../src/server/lib/flow-runs.ts')
  adapters = await import('../src/server/lib/adapters/index.ts')
  env = await import('../src/server/db/env.ts')
}

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  await openAnOffice()
  noWorlds = mkdtempSync(join(tmpdir(), 'no-isolated-worlds-'))
}, 60_000)

afterAll(async () => {
  await app?.app.close()
  t?.close()
  vi.unstubAllEnvs()
  rmSync(noWorlds, { recursive: true, force: true })
  rmSync(SANDBOXES_FOLDER, { recursive: true, force: true })
})

const M = (): number => env.stepReminderMinutes()
const ORPHAN_MINUTES = (): number => adapters.ORPHAN_AFTER_SECONDS / 60

/** One made-up agent of the worker card with one made-up running run, and more on the run. */
function aRun(handle: string, more: Record<string, unknown> = {}): { run: string; flowRun: string; at: (minutes: number) => Date } {
  t.api.createRecord({ workspaceId: WORKSPACE, kind: 'agent', title: handle, data: { handle, runtime: 'claude-code', state: 'active', role: 'worker' }, actor: OWNER })
  const { id: agent } = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }
  const filed = new Date()
  const run = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a made-up run',
    data: { state: 'running', runtime: 'fake', servingAgent: agent, startedAt: localStamp(filed), startedTime: clockStamp(() => filed), deliveringMessage: 'none-here', doing: 'A made-up piece of work', ...more },
    actor: OWNER,
  }).id
  const { id: flowRun } = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").get(run) as { id: string }
  const r0 = new Date()
  return { run, flowRun, at: (minutes) => new Date(r0.getTime() + minutes * 60_000) }
}

/** One write made with the office's clock at a made-up time, so what the office stamps is that time. */
async function atTheClock<T>(when: Date, write: () => T | Promise<T>): Promise<T> {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(when)
    return await write()
  } finally {
    vi.useRealTimers()
  }
}

/** One of the office's own steps on a run's own flow run, as its writers record one, at the office's clock. */
function anOfficeStep(run: string, does: string): void {
  const at = localStamp(new Date())
  const step: FlowRunStep = { does, startedAt: at, endedAt: at, how: 'by the office', outcome: 'done', evidence: 'a made-up mark on the run' }
  expect(flowRuns.appendSteps(run, [step]).written).toBe(true)
}

/** A step through the hand-step door, as the agent the run serves. */
async function aHandStep(handle: string, run: string, does: string): Promise<void> {
  const added = await app.app.inject({ method: 'POST', url: `/api/sessions/${run}/flow-run/steps`, headers: asAgent(handle, run), payload: { does, how: 'by an agent', outcome: 'done' } })
  expect(added.statusCode, added.body).toBe(201)
}

/** One pass of the step, as the minute pass runs it, and which of these runs it reminded. */
function aPass(run: string, now: Date, watchingSince: Date = WATCHING_SINCE): string[] {
  return stepReminders.sendTheStepRemindersThatAreDue(WORKSPACE, now, watchingSince).filter((one) => one === run)
}

/** Every step reminder about a run, oldest first. */
function theRemindersAbout(run: string): StepReminderMark[] {
  return (t.client.sqlite
    .prepare("SELECT json_extract(data, '$.extra.stepReminder') AS mark FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.body') = ? ORDER BY created_at, rowid")
    .all(run, THE_LINE) as { mark: string }[]).map((row) => JSON.parse(row.mark) as StepReminderMark)
}

function dataOf(id: string): Record<string, any> {
  return JSON.parse((t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }).data) as Record<string, any>
}

/** When a record last changed, in milliseconds, read from the office's own stamp. */
function theRecordChangedAt(id: string): number {
  const { updated_at: stamp } = t.client.sqlite.prepare('SELECT updated_at FROM records WHERE id = ?').get(id) as { updated_at: string }
  return parseAnyStamp(stamp)!.getTime()
}

/** The office's clock waits for the next second: its stamps are whole seconds. */
async function theNextSecond(): Promise<Date> {
  await new Promise((resolve) => setTimeout(resolve, 1_005 - (Date.now() % 1_000)))
  return new Date()
}

describe('the step in the minute pass, on an office of 50 made-up running runs', () => {
  it('is timed, and its time is printed', () => {
    const runs = Array.from({ length: 50 }, (_, n) => aRun(`one-of-fifty-${n}`))
    const counted = (t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'session' AND deleted_at IS NULL AND json_extract(data, '$.state') = 'running'").get() as { n: number }).n
    expect(counted).toBe(50)
    const steps: import('../src/server/lib/reminders.ts').AStepOfThePass[] = []
    const did = reminders.sendTheRemindersThatAreDue(WORKSPACE, runs[49]!.at(M()), WATCHING_SINCE, noWorlds, steps)
    expect(did.stepReminded.filter((run) => runs.some((one) => one.run === run))).toHaveLength(50)
    const timed = steps.filter((one) => one.name === 'the step reminder')
    expect(timed).toHaveLength(1)
    console.log(`[the step reminder took ${timed[0]!.ms.toFixed(1)} ms, ${timed[0]!.sqliteMs.toFixed(1)} ms of it in SQLite, ${timed[0]!.statements} statements, on a test office of ${counted} running runs, each reminded]`)
    // The fifty stop here, so the cases below are passes over their own runs. Crashed, because a finished run declares
    // what it submits, and these submit nothing.
    for (const { run } of runs) t.api.patchRecord(run, { dataPatch: { state: 'crashed' } }, OWNER)
  })
})

describe('(a) a closing step', () => {
  it('stops every reminder by time', async () => {
    const closed = CLOSING.map((does, n) => {
      const one = aRun(`closed-before-the-watch-${n}`)
      anOfficeStep(one.run, does)
      return one
    })
    // The same, with a step after which a run is still at work. The passes below read it too, as they read every running
    // run in the office, so it shows they are passes that would remind.
    const atWork = aRun('sealed-before-the-watch')
    anOfficeStep(atWork.run, OFFICE_STEP_DOES.sealed)
    // Recorded before the office started watching, so no closing step is a new step here.
    const since = await theNextSecond()
    for (const { run, at } of closed) {
      expect(aPass(run, at(M()), since), dataOf(run)['state']).toEqual([])
      expect(aPass(run, at(2 * M()), since)).toEqual([])
    }
    // Read after all the passes: each pass reads every running run, so a pass for one run can remind another.
    for (const { run } of closed) expect(theRemindersAbout(run)).toEqual([])
    expect(theRemindersAbout(atWork.run).map((one) => one.why)).toContain('minutes')
  })

  it('stops the reminder of a new step when the closing step is the new step', () => {
    for (const [n, does] of CLOSING.entries()) {
      const { run, flowRun, at } = aRun(`closed-by-its-new-step-${n}`)
      expect(aPass(run, at(M()))).toEqual([run])
      anOfficeStep(run, does)
      expect(dataOf(flowRun)['stepsTaken'].at(-1).does).toBe(does)
      expect(aPass(run, at(M() + 1))).toEqual([])
      expect(aPass(run, at(2 * M() + 1))).toEqual([])
      expect(theRemindersAbout(run).map((one) => one.why)).toEqual(['minutes'])
    }
  })
})

describe('(b) a step that does not close the run', () => {
  it('sealed, released or landed by hand: the run is still reminded', () => {
    for (const [n, does] of NOT_CLOSING.entries()) {
      const { run, at } = aRun(`still-at-work-${n}`)
      anOfficeStep(run, does)
      expect(aPass(run, at(1))).toEqual([run])
      expect(aPass(run, at(1 + M()))).toEqual([run])
      expect(theRemindersAbout(run).map((one) => one.why)).toEqual(['a new step', 'minutes'])
    }
  })

  it('a closing step on a flow the run entered: the run is still reminded', async () => {
    const { asTheFlowRunWriter } = await import('../src/server/lib/flow-run-door.ts')
    const { THE_OFFICE } = await import('../src/server/lib/the-office.ts')
    for (const [n, does] of CLOSING.entries()) {
      const handle = `closed-on-an-entered-flow-${n}`
      const { run, at } = aRun(handle)
      const make = (kind: 'report' | 'flow' | 'note', title: string, data: Record<string, unknown>): string => t.api.createRecord({ workspaceId: WORKSPACE, kind, title, data, actor: OWNER }).id
      const source = make('report', 'A made-up source of a flow', { blocks: [] })
      const flow = make('flow', `A made-up flow ${n}`, {
        declared_in: 'a made-up flow of this test',
        runs: 'a made-up worker',
        trigger: 'A made-up piece of work is asked for.',
        stages: [{ n: 1, does: 'The made-up worker does the work.', evidence: 'a made-up commit', why: 'Without it the work is not done.', sources: [source] }],
        leaves_behind: 'a made-up commit',
        governed_by: 'this test file',
        reviewed_at: '2026-11-17',
      })
      const about = make('note', 'A made-up note the flow is about', { body: 'Made up.' })
      const entered = await app.app.inject({ method: 'POST', url: `/api/flows/${flow}/enter`, headers: asAgent(handle, run), payload: { about } })
      expect(entered.statusCode, entered.body).toBe(201)
      const enteredRun = (entered.json() as { flowRun: string }).flowRun
      expect(dataOf(enteredRun)['stepsTaken'].at(-1).does).toBe(ENTERED_STEP_DOES.entered)
      expect(aPass(run, at(1))).toEqual([run])
      const at2 = localStamp(new Date())
      const closing: FlowRunStep = { does, startedAt: at2, endedAt: at2, how: 'by the office', outcome: 'done', evidence: 'a made-up mark on the entered flow' }
      asTheFlowRunWriter(() => t.api.patchRecord(enteredRun, { dataPatch: { stepsTaken: [...dataOf(enteredRun)['stepsTaken'], closing] } }, THE_OFFICE))
      expect(dataOf(enteredRun)['ended'] ?? null).toBeNull()
      expect(aPass(run, at(2))).toEqual([run])
      expect(aPass(run, at(2 + M()))).toEqual([run])
      expect(theRemindersAbout(run).map((one) => one.why)).toEqual(['a new step', 'a new step', 'minutes'])
    }
  })

  it('"The run ended.", and the run set running again: reminded while it shows a sign of life, and not once quiet past the orphan time', async () => {
    const handle = 'set-running-again'
    const { run, flowRun, at } = aRun(handle)
    for (const state of ['crashed', 'running']) {
      const wrote = await app.app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: asAgent(handle, run), payload: { dataPatch: { state } } })
      expect(wrote.statusCode, wrote.body).toBe(200)
    }
    expect(dataOf(run)['state']).toBe('running')
    expect(dataOf(flowRun)['stepsTaken'].at(-1).does).toBe(OFFICE_STEP_DOES.ended)
    expect(aPass(run, at(1))).toEqual([run])
    expect(aPass(run, at(1 + M()))).toEqual([run])
    expect(aPass(run, at(ORPHAN_MINUTES() + 1))).toEqual([])
    expect(theRemindersAbout(run).map((one) => one.why)).toEqual(['a new step', 'minutes'])
  })
})

describe('(c) a quiet run', () => {
  it('is not reminded once it has been quiet for longer than the orphan time', () => {
    const { run, at } = aRun('quiet-past-the-orphan-time')
    expect(aPass(run, at(ORPHAN_MINUTES() + 1))).toEqual([])
    expect(theRemindersAbout(run)).toEqual([])
  })

  it('quiet for less is still reminded, at M minutes and a minute before the orphan time', () => {
    const early = aRun('quiet-for-m-minutes')
    expect(aPass(early.run, early.at(M()))).toEqual([early.run])
    const late = aRun('quiet-for-nearly-the-orphan-time')
    expect(aPass(late.run, late.at(ORPHAN_MINUTES() - 1))).toEqual([late.run])
  })
})

describe('(d) each sign of life alone', () => {
  const conversation = 'made-up-conversation'
  const cwd = '/made-up/checkout'
  const anAnswer = (id: string, atMs: number) =>
    `${JSON.stringify({ type: 'assistant', timestamp: new Date(atMs).toISOString(), message: { id, model: 'made-up-model', usage: { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 } } })}\n`

  /** A run reminded at M minutes, then quiet past the orphan time; the sign comes after that, and the next pass reminds it. */
  async function broughtBack(handle: string, more: Record<string, unknown>, sign: (run: string, when: Date) => Promise<void> | void, recordStaysQuiet: boolean): Promise<void> {
    const { run, at } = aRun(handle, more)
    expect(aPass(run, at(M()))).toEqual([run])
    expect(aPass(run, at(ORPHAN_MINUTES() + 1))).toEqual([])
    await sign(run, at(ORPHAN_MINUTES() + 2))
    const next = at(ORPHAN_MINUTES() + 3)
    // Alone: the record's own change is older than the orphan time at the next pass, but where it is the sign.
    if (recordStaysQuiet) expect(next.getTime() - theRecordChangedAt(run)).toBeGreaterThan(adapters.ORPHAN_AFTER_SECONDS * 1_000)
    expect(aPass(run, next)).toEqual([run])
    expect(theRemindersAbout(run)).toHaveLength(2)
  }

  it('its record changed', async () => {
    await broughtBack('back-by-its-record', {}, (run, when) => atTheClock(when, () => {
      t.api.patchRecord(run, { dataPatch: { doing: 'A made-up new line of work' } }, OWNER)
    }), false)
  })

  it('a step recorded on its own flow run', async () => {
    const handle = 'back-by-a-step'
    await broughtBack(handle, {}, (run, when) => atTheClock(when, () => aHandStep(handle, run, 'A made-up step after a long quiet.')), true)
  })

  it('its log grew, by lastOutputAt', async () => {
    await broughtBack('back-by-last-output-at', {}, (run, when) => {
      t.api.patchRecord(run, { dataPatch: { lastOutputAt: localStamp(when) } }, OWNER)
    }, true)
  })

  it('its log grew, by lastOutputTime', async () => {
    await broughtBack('back-by-last-output-time', {}, (run, when) => {
      t.api.patchRecord(run, { dataPatch: { lastOutputTime: clockStamp(() => when), lastOutputTimeSource: 'output-file-mtime' } }, OWNER)
    }, true)
  })

  it('its conversation file changed, for a sandboxed Claude Code run', async () => {
    const sandbox = join(SANDBOXES_FOLDER, 'a-made-up-sandbox')
    const folder = theTranscriptFolder({ HOME: join(sandbox, 'home') }, cwd)!
    mkdirSync(folder, { recursive: true })
    const file = join(folder, `${conversation}.jsonl`)
    writeFileSync(file, anAnswer('msg_1', Date.now()))
    const inASandbox = { runtime: 'claude-code', sandbox: { template: 'made-up', container: 'made-up', folder: sandbox }, workingDirectory: cwd, providerSession: conversation }
    await broughtBack('back-by-its-conversation', inASandbox, (_run, when) => {
      appendFileSync(file, anAnswer('msg_2', when.getTime()))
      utimesSync(file, when, when)
    }, true)
  })
})

describe('(e) the office’s own reminders', () => {
  it('are no sign of life: reminded at M and 2M minutes, a run with no other sign is not reminded at 3M or later', () => {
    // These minutes hold what they say only while 2M is less than the orphan time and 3M more.
    expect(2 * M()).toBeLessThan(ORPHAN_MINUTES())
    expect(3 * M()).toBeGreaterThan(ORPHAN_MINUTES())
    const { run, at } = aRun('reminded-and-quiet')
    expect(aPass(run, at(M()))).toEqual([run])
    expect(aPass(run, at(2 * M()))).toEqual([run])
    for (const minutes of [3 * M(), 3 * M() + 1, 4 * M(), 24 * 60]) expect(aPass(run, at(minutes))).toEqual([])
    expect(theRemindersAbout(run).map((one) => one.why)).toEqual(['minutes', 'minutes'])
  })
})

describe('(f) the pass', () => {
  it('changes no record: the run, its state and its updatedAt are what they were', () => {
    const { run, flowRun, at } = aRun('left-as-it-was')
    const row = (id: string) => t.client.sqlite.prepare('SELECT * FROM records WHERE id = ?').get(id)
    const changes = (id: string) => (t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
    const before = { run: row(run), flowRun: row(flowRun), runChanges: changes(run), flowRunChanges: changes(flowRun) }
    expect(aPass(run, at(M()))).toEqual([run])
    expect(aPass(run, at(2 * M()))).toEqual([run])
    for (const minutes of [ORPHAN_MINUTES() + 1, 24 * 60]) expect(aPass(run, at(minutes))).toEqual([])
    expect({ run: row(run), flowRun: row(flowRun), runChanges: changes(run), flowRunChanges: changes(flowRun) }).toEqual(before)
    expect(dataOf(run)['state']).toBe('running')
  })
})

describe('(g) another orphan time', () => {
  const ANOTHER = '3h'
  let theDefault: { seconds: number; written: string }

  beforeAll(async () => {
    // The office this file opened read no setting, so its orphan time is the default.
    expect(adapters.THRESHOLDS.orphanConfigured).toBe(false)
    expect(adapters.THRESHOLDS.orphanAfter).toBe(adapters.DEFAULT_ORPHAN_AFTER)
    theDefault = { seconds: adapters.ORPHAN_AFTER_SECONDS, written: adapters.DEFAULT_ORPHAN_AFTER }
    await app.app.close()
    t.close()
    vi.stubEnv(adapters.ORPHAN_AFTER_VAR, ANOTHER)
    await openAnOffice()
  }, 60_000)

  it('moves the line with it', () => {
    expect(adapters.THRESHOLDS.orphanConfigured).toBe(true)
    expect(adapters.ORPHAN_AFTER_SECONDS).toBe(adapters.parseDuration(ANOTHER, adapters.ORPHAN_AFTER_VAR))
    expect(adapters.ORPHAN_AFTER_SECONDS).toBeGreaterThan(theDefault.seconds + 30 * 60)
    // Quiet for longer than the default orphan time and less than this one: reminded.
    const between = aRun('quiet-between-the-two-times')
    expect(aPass(between.run, between.at(theDefault.seconds / 60 + 30))).toEqual([between.run])
    const past = aRun('quiet-past-the-other-time')
    expect(aPass(past.run, past.at(ORPHAN_MINUTES() + 1))).toEqual([])
  })
})
