// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FLOW REMINDERS GIVE THE THREAD BACK BETWEEN THEIR STEPS, AND SEND THE SAME REMINDERS. Wave 13y round 166.
 *
 * One minute's pass of the flow reminders (src/server/lib/reminders.ts) ran its eighteen steps in one synchronous run,
 * so the server answered nobody until the last step was done: 0.63 to 1.25 s a minute on the live server, and about
 * 100 to 135 ms on a made-up office of the live size. The timer's pass (`theMinutePass`) now runs each step as a run of
 * its own, through the run the timer gives it, and gives the thread back between two steps. The whole pass
 * (`sendTheRemindersThatAreDue`) still runs the same steps in one run, for the tests that read what it returns.
 *
 * WHAT IS PROVED
 *   1. The timer's pass runs each step as a run of its own, through the run it is given, in the order the whole pass
 *      runs them.
 *   2. Between two of those runs the thread is given back: what was queued in one run runs before the next starts.
 *   3. On the same office at the same moment, the timer's pass and the whole pass write the same records and give the
 *      same answer. A second whole pass gives the same as the first, so the comparison itself is steady.
 *   4. The server's timer runs its pass that way: each step is a run named "the flow reminders".
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   the timer's pass running every step in one run, with no turn between     → cases 1, 2 and 4
 *   the timer's pass running its steps in another order                      → case 1
 *   the timer's pass leaving out a step that writes in this office           → cases 1 and 3
 *   the timer not handing its named run to the pass                          → case 4
 *
 * WHAT THIS DOES NOT PROVE. How long a step holds the thread. A fresh test office has a few records, so the times are
 * measured on a made-up office of the live size outside the suite. No case here asserts a time.
 *
 * Every key, agent, run and record here is made up, in this file's own empty office.
 */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { PanelRecord } from '../src/shared/types.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const A_MADE_UP_OFFICE_KEY = randomBytes(32).toString('hex')
const HOUR = 3_600_000
const MINUTE = 60_000
/** The first moment of this file's office. */
const T0 = new Date('2030-05-06T06:00:00Z').getTime()

type Reminders = typeof import('../src/server/lib/reminders.ts')
type AStep = import('../src/server/lib/reminders.ts').AStepOfThePass
type ARun = <T>(work: () => T) => T
type TheTimersPass = (
  workspaceId: string,
  now: Date,
  watchingSince: Date,
  isolatedWorldsFolder: string,
  steps: AStep[],
  replyCatchUp: undefined,
  run: ARun,
) => Promise<{ did: unknown; heldMs: number }>

let t: TestDb
let app: FastifyInstance
let reminders: Reminders
let resources: typeof import('../src/server/lib/resources.ts')
let worlds: string
let at: number
const directories: string[] = []
const agents: Record<string, string> = {}

/** What one pass did: the names of its steps, the records it wrote, and its answer. */
interface APass {
  steps: string[]
  written: { kind: string; title: string; data: string }[]
  did: unknown
}
const passes: Record<string, APass> = {}
/** Of the timer's pass in case 1: how many steps each run added, and the order of its runs and turns. */
const stepsAddedByEachRun: number[] = []
const theOrder: string[] = []

const AS_THE_PERSON = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_THE_OFFICE_WORKER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-key': A_MADE_UP_OFFICE_KEY,
}
const asAgent = (id: string) => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

/** A secretary started by the person, or a worker started by `starter`, kept by its handle. */
async function anAgent(handle: string, starter?: string): Promise<void> {
  const payload = starter === undefined ? { handle, name: handle, role: 'secretary', runtime: 'claude-code' } : { handle, name: handle, role: 'worker', runtime: 'codex', workArea: ['work'] }
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: starter === undefined ? AS_THE_PERSON : asAgent(starter), payload })
  expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_PERSON })).json() as { agents: { id: string; handle: string }[] }
  agents[handle] = listed.agents.find((one) => one.handle === handle)!.id
}

/** A run of `agent` filed now, with `data` written over what the door stored. */
function aRun(agent: string, data: Record<string, unknown>): string {
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A made-up run', actor: t.api.HUMAN, data: { state: 'finished' } })
  t.client.sqlite.prepare('UPDATE records SET data = json_patch(data, ?) WHERE id = ?').run(JSON.stringify({ servingAgent: agent, servingAgentId: agents[agent], ...data }), run.id)
  return run.id
}

/** A made-up empty folder, removed after the file. */
function aFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-a-stepped-pass-'))
  directories.push(dir)
  return dir
}

/**
 * ONE PASS AT `at`, inside a savepoint that is rolled back, so every pass starts from the same office. The records it
 * wrote are kept by their kind, title and data, with each new record's id put as its place among them, because the ids
 * are drawn at random.
 */
async function aPass(name: string, way: (steps: AStep[]) => Promise<unknown> | unknown): Promise<APass> {
  vi.setSystemTime(at)
  const sqlite = t.client.sqlite
  const newest = (sqlite.prepare('SELECT coalesce(max(rowid), 0) AS n FROM records').get() as { n: number }).n
  const steps: AStep[] = []
  sqlite.exec('SAVEPOINT a_pass')
  try {
    const did = await way(steps)
    const rows = sqlite.prepare('SELECT id, kind, title, data FROM records WHERE rowid > ? ORDER BY rowid').all(newest) as { id: string; kind: string; title: string; data: string }[]
    const written = rows.map((row) => ({
      kind: row.kind,
      title: row.title,
      data: rows.reduce((data, other, place) => data.split(other.id).join(`<new record ${String(place)}>`), row.data),
    }))
    const pass = { steps: steps.map((one) => one.name), written, did: JSON.parse(JSON.stringify(did)) as unknown }
    passes[name] = pass
    return pass
  } finally {
    sqlite.exec('ROLLBACK TO a_pass; RELEASE a_pass')
  }
}

/** The timer's pass, at `at`, with `run` as the run it is given. */
function theTimersPass(steps: AStep[], run: ARun): Promise<{ did: unknown; heldMs: number }> {
  return (reminders.theMinutePass as unknown as TheTimersPass)('default', new Date(at), new Date(T0 - MINUTE), worlds, steps, undefined, run)
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: A_MADE_UP_OFFICE_KEY, providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  reminders = await import('../src/server/lib/reminders.ts')
  resources = await import('../src/server/lib/resources.ts')
  const hours = (await import('../src/server/db/env.ts')).idleReminderHours()
  worlds = aFolder()
  // THE MADE-UP CONTAINER IS SAID TO BE RUNNING, so the closer of runs whose container stopped leaves the sandbox run be.
  resources.useOsProbe(Object.assign(Object.create(resources.LINUX_PROBE), {
    containers: () => ({ available: true, containers: [{ id: 'made-up', name: 'test-row', image: 'made-up', status: 'Up' }] }),
  }))
  await anAgent('made-up-starter')
  for (const handle of ['made-up-idle-a', 'made-up-idle-b', 'made-up-late']) await anAgent(handle, 'made-up-starter')
  vi.useFakeTimers({ toFake: ['Date'] })

  // THE OFFICE AT `at`: two agents idle past their hours, a run past its expected time, and a sandbox run past 8 hours,
  // so more than one step writes in the same pass.
  vi.setSystemTime(T0)
  aRun('made-up-idle-a', { state: 'finished' })
  aRun('made-up-idle-b', { state: 'finished' })
  aRun('made-up-late', { state: 'running', expectedMinutes: 30, startedAt: localStamp(new Date(T0)), workingDirectory: aFolder() })
  const dir = aFolder()
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OFFICE_WORKER,
    payload: {
      kind: 'session',
      title: 'Synthetic long sandbox run',
      data: {
        state: 'running', runtime: 'codex', startedByMoleOffice: true, servingAgent: 'made-up-late', doing: 'a made-up round', workingDirectory: dir,
        sandbox: { template: 'test-template', container: 'test-row', folder: dir },
      },
    },
  })
  expect(filed.statusCode, filed.body.slice(0, 300)).toBe(201)
  expect((filed.json() as { record: PanelRecord }).record.id).toBeTruthy()
  at = T0 + Math.max(hours * HOUR, 8 * HOUR) + 2 * HOUR

  // THE PASSES. A whole pass first, rolled back, so whatever a first pass after a start keeps is kept before any compared.
  await aPass('settle', (steps) => reminders.sendTheRemindersThatAreDue('default', new Date(at), new Date(T0 - MINUTE), worlds, steps))
  await aPass('whole', (steps) => reminders.sendTheRemindersThatAreDue('default', new Date(at), new Date(T0 - MINUTE), worlds, steps))
  let runs = 0
  await aPass('the timer’s', async (steps) => {
    const run: ARun = (work) => {
      const before = steps.length
      const one = runs++
      theOrder.push(`run ${String(one)} starts`)
      try {
        return work()
      } finally {
        stepsAddedByEachRun.push(steps.length - before)
        setImmediate(() => theOrder.push(`the turn after run ${String(one)}`))
      }
    }
    return (await theTimersPass(steps, run)).did
  })
  await aPass('whole again', (steps) => reminders.sendTheRemindersThatAreDue('default', new Date(at), new Date(T0 - MINUTE), worlds, steps))
}, 180_000)

afterAll(async () => {
  vi.useRealTimers()
  resources?.useOsProbe(resources.LINUX_PROBE)
  await app?.close()
  t?.close()
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
})

describe('the flow reminders give the thread back between their steps', () => {
  it("1. the timer's pass runs each step as a run of its own, through the run it is given, in the whole pass's order", () => {
    const whole = passes['whole']!.steps
    expect(whole.length, 'the whole pass ran no step').toBeGreaterThan(10)
    expect(stepsAddedByEachRun, 'a run of the timer’s pass did not run exactly one step').toEqual(whole.map(() => 1))
    expect(passes['the timer’s']!.steps).toEqual(whole)
  })

  it('2. between two of those runs the thread is given back', () => {
    const runs = stepsAddedByEachRun.length
    expect(runs).toBeGreaterThan(1)
    for (let one = 0; one < runs - 1; one++) {
      const turn = theOrder.indexOf(`the turn after run ${String(one)}`)
      const next = theOrder.indexOf(`run ${String(one + 1)} starts`)
      expect(turn, `what run ${String(one)} queued had not run when run ${String(one + 1)} started: ${theOrder.join(', ')}`).toBeGreaterThanOrEqual(0)
      expect(turn, `what run ${String(one)} queued had not run when run ${String(one + 1)} started: ${theOrder.join(', ')}`).toBeLessThan(next)
    }
  })

  it("3. on the same office at the same moment, the timer's pass writes the same records and gives the same answer", () => {
    const whole = passes['whole']!
    expect(passes['whole again'], 'two whole passes on the same office differ, so this comparison shows nothing').toEqual(whole)
    const did = whole.did as Record<string, unknown[]>
    expect(did['idleReminded'], 'the idle step wrote nothing, so this office does not show it').toEqual(expect.arrayContaining(['made-up-idle-a', 'made-up-idle-b']))
    expect(did['expectedTimeReached'], 'the expected-time step wrote nothing').toHaveLength(1)
    expect(did['longSandboxRunsReminded'], 'the long-run step wrote nothing').toHaveLength(1)
    expect(whole.written.filter((one) => one.kind === 'message').length).toBeGreaterThanOrEqual(5)
    expect(passes['the timer’s']).toEqual(whole)
  })

  it('4. the server’s timer runs its pass so: each step is a run named "the flow reminders"', async () => {
    const timers = await import('../src/server/lib/named-timers.ts')
    let callback: (() => unknown) | undefined
    const interval = vi.spyOn(globalThis, 'setInterval').mockImplementation(((fn: () => unknown) => {
      callback ??= fn
      return { unref() {} } as NodeJS.Timeout
    }) as typeof setInterval)
    const logged: string[] = []
    try {
      reminders.startTheReminders('default', (line) => logged.push(line))
    } finally {
      interval.mockRestore()
    }
    expect(callback).toBeTypeOf('function')
    vi.setSystemTime(at)
    const sqlite = t.client.sqlite
    sqlite.exec('SAVEPOINT the_timer')
    try {
      timers.forgetTheNamedRuns()
      const began = performance.now()
      await callback!()
      const runs = timers.theNamedRunsAcross(began, performance.now()).filter((one) => one.name === 'the flow reminders')
      expect(logged.filter((line) => line.includes('could not finish a tick'))).toEqual([])
      expect(runs.length, 'the timer ran its pass in fewer runs than it has steps').toBeGreaterThanOrEqual(passes['whole']!.steps.length)
    } finally {
      sqlite.exec('ROLLBACK TO the_timer; RELEASE the_timer')
    }
  })
})
