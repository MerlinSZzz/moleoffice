// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIN WORLD'S REMINDER LIMITS, a decision of 22 September 2026: per secretary, one supervisor and two
 * workers may run on the host before the office tells the starter, once, to use a
 * sandbox. It never refuses. src/server/lib/main-world.ts holds the rules; this file runs
 * one tick of the real reminder watcher against a throwaway database.
 *
 * WHAT IS PROVED
 *   1. Two secretaries, each with a supervisor and workers under it. The third worker on the host in
 *      one secretary's tree is over its share and its starter is told, naming the run. Two workers in
 *      the other tree are within its share, and are not pushed past the total by the first tree's
 *      excess. A run in a sandbox is not counted, and neither is a run whose recorded process is gone.
 *   2. A second tick says nothing again for the same run.
 *   3. A plain number is the office's total: past it, the newest run within its share is over.
 *   4. A second supervisor on the host in one tree is over its share of one.
 *   5. A setting that is neither `x<N>` nor a number is refused with the setting's name, and a tick
 *      that meets one says so in its report and still runs every sweep after it.
 *
 * The line is a few words and the sentence is behind it (criterion M34); the waiter hands a session
 * the sentence after the line.
 *
 * MUTATION PROOF, named, after a control run. (1) In src/server/lib/main-world.ts the line
 * `const pastShare = run.secretary !== null && inItsShare > limit.perSecretary` becomes
 * `const pastShare = false`. Cases 1 to 4 go red (2 and 3 build on what 1 said). (2) In
 * src/server/lib/reminders.ts the try around `sendTheMainWorldRemindersThatAreDue` is taken out, so a
 * bad setting throws out of the tick. Case 5 goes red. Each file is restored byte for byte.
 *
 * Every record here is synthetic: agents, runs and processes are made up for this file.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'

type RemindersLib = typeof import('../src/server/lib/reminders.ts')
type MainWorldLib = typeof import('../src/server/lib/main-world.ts')

let t: TestDb
let app: FastifyInstance
let reminders: RemindersLib
let mainWorld: MainWorldLib

const WORKSPACE = 'default'
const R0 = Date.now()

function as(type: 'human' | 'agent', id: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': WORKSPACE,
    'x-mole-office-actor-type': type,
    'x-mole-office-actor-id': id,
  }
}

async function start(by: Record<string, string>, handle: string, role: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload: { handle, name: handle, role } })
  expect(reply.statusCode, `${handle}: ${reply.body.slice(0, 300)}`).toBe(201)
}

/** A synthetic running run of `agent`, started `minutes` after R0, on the host unless a sandbox is named. */
function aRun(agent: string, minutes: number, extra: Record<string, unknown> = {}): string {
  return t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `Synthetic run of ${agent}`,
    data: { state: 'running', servingAgent: agent, startedAt: localStamp(new Date(R0 + minutes * 60_000)), ...extra },
    // A RUN NEVER NAMES ITS OWN SANDBOX: its launcher writes that, as the starter (A2 of a decision, which made the
    // records door refuse it from the run's own agent). So a synthetic sandboxed run is
    // filed by the person, and every other one by its agent, as before.
    actor: extra['sandbox'] === undefined ? { type: 'agent', id: agent } : { type: 'human', id: THE_PERSON },
  }).id
}

/** The registry id of the agent bearing `handle`. Since criterion I1 a new agent's id is not its handle. */
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** Take a synthetic run off the host count. `idle` rather than `finished`, because finishing a run seals its work and these have none. */
function stop(run: string): void {
  t.api.patchRecord(run, { dataPatch: { state: 'idle' } }, { type: 'human', id: THE_PERSON })
}

/** The office's main-world lines about one run: to whom, its few words, and the sentence behind them. */
function linesAbout(run: string): { to: string; body: string; said: string }[] {
  return (
    t.client.sqlite
      .prepare(
        "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL " +
          "AND json_extract(data, '$.aboutRun') = ? AND json_extract(data, '$.extra.mainWorldOver') = 1",
      )
      .all(run) as { data: string }[]
  ).map((one) => {
    const data = JSON.parse(one.data) as { body: string; saidInFull?: string; to: { id: string }[] }
    return { to: data.to[0]!.id, body: data.body, said: data.saidInFull ?? '' }
  })
}

function tick(): string[] {
  return reminders.sendTheRemindersThatAreDue(WORKSPACE, new Date(), new Date(R0 - 86_400_000)).mainWorldOver
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_MAIN_WORLD_SUPERVISORS = 'x1'
  process.env.MOLE_OFFICE_MAIN_WORLD_WORKERS = 'x2'
  t = await freshDb()
  reminders = await import('../src/server/lib/reminders.ts')
  mainWorld = await import('../src/server/lib/main-world.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()
  // TWO SECRETARIES, each with a supervisor, and workers under the supervisors.
  await start(as('human', THE_PERSON), 'sec-a', 'secretary')
  await start(as('human', THE_PERSON), 'sec-b', 'secretary')
  await start(as('agent', 'sec-a'), 'sup-a', 'supervisor')
  await start(as('agent', 'sec-b'), 'sup-b', 'supervisor')
  for (const handle of ['wa1', 'wa2', 'wa3', 'wa4', 'wa5']) await start(as('agent', 'sup-a'), handle, 'worker')
  for (const handle of ['wb1', 'wb2']) await start(as('agent', 'sup-b'), handle, 'worker')
}, 60_000)

afterAll(async () => {
  delete process.env.MOLE_OFFICE_MAIN_WORLD_SUPERVISORS
  delete process.env.MOLE_OFFICE_MAIN_WORLD_WORKERS
  await app?.close()
  t?.close()
})

// These tests cite a decision.
describe('the main world reminds past a secretary’s share, and never refuses', () => {
  const runs: Record<string, string> = {}

  it('tells the starter of the third worker on the host in one tree, once, and nobody about the other tree, a sandboxed run or a gone one', () => {
    runs.wa1 = aRun('wa1', 1)
    runs.wa2 = aRun('wa2', 2)
    runs.wa3 = aRun('wa3', 3)
    runs.wa4 = aRun('wa4', 4, { sandbox: { template: 'mole-office-dev', container: 'synthetic-row' } })
    // A PROCESS THIS MACHINE DOES NOT HAVE: pid 2^22 - 1 is past Linux's default pid_max.
    runs.wa5 = aRun('wa5', 0, { extra: { discovered: { pid: 4_194_303, pidStartedAt: '2026-09-22T00:00:00.000Z' } } })
    runs.wb1 = aRun('wb1', 5)
    runs.wb2 = aRun('wb2', 6)
    expect(tick()).toEqual([runs.wa3])
    const said = linesAbout(runs.wa3!)
    expect(said).toHaveLength(1)
    expect(said[0]!.to).toBe(idOf('sup-a'))
    expect(said[0]!.body).toBe('Past its main-world share')
    expect(said[0]!.said).toContain(`Run ${runs.wa3} of wa3 is past it`)
    expect(said[0]!.said).toContain("3 workers are running on the host in sec-a's share, and the share is 2")
    expect(said[0]!.said).toContain('Nothing was stopped')
    for (const one of ['wa1', 'wa2', 'wa4', 'wa5', 'wb1', 'wb2']) expect(linesAbout(runs[one]!), one).toEqual([])
    // NOTHING WAS REFUSED OR STOPPED: every run still says running.
    for (const one of Object.values(runs)) expect(t.api.getRecord(one)!.data['state']).toBe('running')
  })

  it('says nothing again for the same run on the next tick', () => {
    expect(tick()).toEqual([])
    expect(linesAbout(runs.wa3!)).toHaveLength(1)
  })

  it('reads a plain number as the office’s total, and the newest run past it is over', () => {
    process.env.MOLE_OFFICE_MAIN_WORLD_WORKERS = '3'
    try {
      // Five workers on the host: wa1, wa2, wa3, wb1, wb2. The total is three and each share is two.
      // wa3 is over its share already; of the four within their shares, wb2 is the fourth.
      expect(mainWorld.theMainWorldLimit('worker', 2)).toMatchObject({ perSecretary: 2, total: 3 })
      expect(tick()).toEqual([runs.wb2])
      expect(linesAbout(runs.wb2!)[0]!.body).toBe('Past the main-world total')
      expect(linesAbout(runs.wb2!)[0]!.said).toContain('5 workers are running on the host in the whole office, and the total is 3')
      expect(linesAbout(runs.wb2!)[0]!.to).toBe(idOf('sup-b'))
    } finally {
      process.env.MOLE_OFFICE_MAIN_WORLD_WORKERS = 'x2'
    }
    for (const one of ['wa1', 'wa2', 'wa3', 'wa4', 'wa5', 'wb1', 'wb2']) stop(runs[one]!)
  })

  it('counts supervisors on their own: a second one on the host in a tree is over a share of one', () => {
    const first = aRun('sup-a', 10)
    const second = aRun('sup-a', 11)
    const other = aRun('sup-b', 12)
    expect(tick()).toEqual([second])
    expect(linesAbout(second)[0]!.to).toBe(idOf('sec-a'))
    expect(linesAbout(second)[0]!.said).toContain("2 supervisors are running on the host in sec-a's share, and the share is 1")
    expect(linesAbout(first)).toEqual([])
    expect(linesAbout(other)).toEqual([])
  })

  it('refuses a setting that is neither x and a number nor a number, naming it, and the tick still finishes', () => {
    process.env.MOLE_OFFICE_MAIN_WORLD_SUPERVISORS = 'many'
    try {
      expect(() => mainWorld.theMainWorldLimit('supervisor', 2)).toThrow('MOLE_OFFICE_MAIN_WORLD_SUPERVISORS is "many"')
      const pass = reminders.sendTheRemindersThatAreDue(WORKSPACE, new Date(), new Date(R0 - 86_400_000))
      expect(pass.mainWorldOver).toEqual([])
      expect(pass.mainWorldProblem).toContain('MOLE_OFFICE_MAIN_WORLD_SUPERVISORS is "many"')
      // THE SWEEPS AFTER IT RAN: each answered a list, even if an empty one.
      expect(Array.isArray(pass.worldHoldsClosed) && Array.isArray(pass.deadOwnRowsClosed) && Array.isArray(pass.directoryGoneRowsClosed)).toBe(true)
    } finally {
      process.env.MOLE_OFFICE_MAIN_WORLD_SUPERVISORS = 'x1'
    }
  })
})
