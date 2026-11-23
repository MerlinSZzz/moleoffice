// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Test change: runs now stand under their agent, and counts name other cards.
// Criterion change (wave 13y round 175, as decided): a line's running agents are counted in four numbers.
// `all` counts every acting agent on the line, and `others` counts those whose card is neither supervisor nor worker,
// or who have no card. Cases 3 and 6 hold all four, and the line here has no agent of another card, so `others` is 0.
// Before, a line's running agents were two numbers, supervisors and workers, and an agent of another card was
// counted in neither.
/**
 * THE PEOPLE AND PACKAGES DOOR COUNTS EACH LINE, AND PUTS EACH WORKER UNDER THE RUN THAT STARTED IT. Wave 13u round
 * 242: the board's fourth tab and `GET /api/projects/<project>/people-and-packages`, the door it reads.
 *
 * A RUN ACTS as it does on the board: it sent the office a request within `idleReminderHours()`, one hour unless the
 * owner set MOLE_OFFICE_IDLE_REMINDER_HOURS, it has not ended, and it runs a model. Its agent is the one its
 * `servingAgentId` names, and its line is read from its handle by `theLineOfAHandle`.
 *
 * WHAT THIS FILE PROVES, in its own empty office, where every record, agent and request is made up. Line 99z has a
 * supervisor and three workers acting, and line 99y has packages and nobody acting:
 *   1. A project that is not there is the master reader's coded 404.
 *   2. Each line has all six counts, over every package that names it, ended or not, and the total counts each
 *      package once. A task whose `data.state` is `blocked` counts as blocked and nowhere else. A package on both
 *      lines counts on each. The lines come in name order, and neither line's department is filed, so each says so
 *      and names no secretary.
 *   3. A worker stands under the supervisor whose run's `workerRuns` entry started the worker's run. A worker whose
 *      starting run has ended stands under no supervisor, though that run serves the supervisor acting now and sent a
 *      request within the hour. It is filed crashed, not finished, because the office refuses a run filed finished
 *      that has nothing to seal. Each agent has the post its card gives, and the model and runtime its run names.
 *   4. A package is drawn with the state `packageStateOf` gives it and with its points. The supervisor holds the
 *      packages whose newest take names it, and not the one already accepted. A worker holds the one package its
 *      run's `workerPackage` names, with that field's points.
 *   5. A worker whose run names no package holds none. The supervisor's packages are not put there.
 *   6. A line with packages and no running agent is at rest, by `theLineIsAtRest` in src/shared/project-people.ts.
 *
 * WHERE THE RULES LIVE: src/server/lib/project-people.ts (the reading), src/server/lib/project-board.ts (which runs
 * act), src/server/lib/delegation.ts (each package's state) and src/shared/project-people.ts (the shapes and the
 * rule for a line at rest).
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { PeopleAgent, PeopleAndPackages, PeopleLine } from '../src/shared/project-people.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let people: PeopleAndPackages

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const id: Record<string, string> = {}

const AT = '2026-11-22 10:00:00'

/** One made-up request from a run, five minutes ago. */
let calls = 0
function aRequestFrom(run: string): void {
  calls += 1
  t.client.sqlite
    .prepare(
      'INSERT INTO api_calls (id, at_ms, method, status, ms, actor_type, actor_id, session_id, workspace_id, ' +
        "identity_source) VALUES (?, ?, 'GET', 200, 1, 'agent', 'made-up-agent', ?, 'default', 'none')",
    )
    .run(`made-up-call-${String(calls)}`, Date.now() - 5 * 60_000, run)
}

/** Write an agent row straight at the table, with its card and the picture row its foreign key needs. */
function anAgent(name: string, handle: string, role: string): void {
  id[name] = `made-up-agent-${name}`
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, " +
        "'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${id[name]}`, AT)
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at, role) VALUES (?, ?, ?, ?, 0, ?, ?)')
    .run(id[name], `Made-up ${name}`, handle, `avatar-default-agent-${id[name]}`, AT, role)
}

function aRun(name: string, data: Record<string, unknown>): string {
  id[name] = t.api.createRecord({ kind: 'session', title: `A made-up run, ${name}`, workspaceId: 'default', origin: 'fixture', actor: t.api.HUMAN, data }).id
  return id[name]
}

/** One act on an inside package, in order, by the made-up supervisor unless another writer is named. */
function anAct(order: number, actorId?: string) {
  return { by: { actorType: 'agent', actorId: actorId ?? id['supervisor']! }, at: AT, order }
}

/** An inside package on the lines named, with one point, and the acts given. */
function aPackage(name: string, lines: string[], acts: Record<string, unknown>, state = 'todo'): void {
  id[name] = t.api.createRecord({
    kind: 'task',
    title: `A made-up package, ${name}`,
    workspaceId: 'default',
    origin: 'fixture',
    actor: t.api.HUMAN,
    data: {
      state,
      package: {
        bundleId: 'madeUpBundle',
        forTheOutside: 'Made-up: nothing leaves.',
        acceptance: 'Made-up: nothing is judged.',
        parent: { kind: 'decision', id: 'made-up-parent' },
        lines,
        pointIds: [`made-up-point-${name}`],
        at: AT,
        by: { actorType: 'human', actorId: t.api.HUMAN.id },
        ...acts,
      },
    },
  }).id
}

/** A worker's entry on the run that started it, in the shape the office writes. */
function aStartedWorker(handle: string, run: string, startedBy: string) {
  return {
    state: 'started',
    askedAt: AT,
    askedBy: { who: { kind: 'agent', id: 'made-up-asker' }, session: startedBy },
    handle,
    brief: { path: '/made-up/sandbox/brief.md', sha256: 'a'.repeat(64), bytes: 1 },
    sandbox: { folder: '/made-up/sandbox', instance: 'made-up-instance', container: 'made-up-container' },
    started: { at: AT, run, runKeyId: 'made-up-key' },
  }
}

function aLine(name: string): PeopleLine {
  const found = people.lines.find((one) => one.line === name)
  if (found === undefined) throw new Error(`The answer has no line ${name}.`)
  return found
}

const ids = (agents: readonly PeopleAgent[]) => agents.map((one) => one.id).sort()

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_IDLE_REMINDER_HOURS']
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const { writeTheWorkerRun, writeTheWorkerPackage } = await import('../src/server/lib/records/run-writes.ts')

  anAgent('supervisor', 'wave-99z-supervisor', 'supervisor')
  anAgent('worker-one', 'w99z-worker-one', 'worker')
  anAgent('worker-two', 'w99z-worker-two', 'worker')
  anAgent('worker-three', 'w99z-worker-three', 'worker')

  // Line 99z: one package in each state, and one blocked. The one not taken is on line 99y too.
  aPackage('not-taken', ['99z', '99y'], {})
  aPackage('taken', ['99z'], { takenInside: [anAct(1)] })
  aPackage('handed-back', ['99z'], {
    takenInside: [anAct(1)],
    handedBack: [{ ...anAct(2), points: [{ pointId: 'made-up-point-handed-back', outcome: 'done', words: 'Made-up.' }] }],
  })
  aPackage('accepted', ['99z'], {
    takenInside: [anAct(1)],
    handedBack: [{ ...anAct(2), points: [{ pointId: 'made-up-point-accepted', outcome: 'done', words: 'Made-up.' }] }],
    acceptances: [{ ...anAct(3, 'made-up-maker'), points: [{ pointId: 'made-up-point-accepted', answer: 'accepted' }] }],
  })
  aPackage('blocked', ['99z'], { takenInside: [anAct(1)] }, 'blocked')
  // Line 99y: one more package, taken by an agent with no run acting.
  aPackage('on-99y', ['99y'], { takenInside: [anAct(1, 'made-up-agent-gone')] })

  // The runs. Three workers: two started by the supervisor's run, one by an earlier run of the supervisor that crashed.
  aRun('supervisor-run', { state: 'running', servingAgent: 'wave-99z-supervisor', servingAgentId: id['supervisor'], model: 'made-up-model-s', runtime: 'claude-code' })
  aRun('worker-one-run', { state: 'running', servingAgent: 'w99z-worker-one', servingAgentId: id['worker-one'], model: 'made-up-model-w', runtime: 'codex' })
  aRun('worker-two-run', { state: 'running', servingAgent: 'w99z-worker-two', servingAgentId: id['worker-two'], model: 'made-up-model-w', runtime: 'codex' })
  aRun('worker-three-run', { state: 'running', servingAgent: 'w99z-worker-three', servingAgentId: id['worker-three'], model: 'made-up-model-w', runtime: 'codex' })
  aRun('crashed-run', { state: 'crashed', servingAgent: 'wave-99z-supervisor', servingAgentId: id['supervisor'], runtime: 'claude-code' })
  writeTheWorkerRun(id['supervisor-run']!, id['worker-one']!, aStartedWorker('w99z-worker-one', id['worker-one-run']!, id['supervisor-run']!), t.api.HUMAN)
  writeTheWorkerRun(id['supervisor-run']!, id['worker-two']!, aStartedWorker('w99z-worker-two', id['worker-two-run']!, id['supervisor-run']!), t.api.HUMAN)
  writeTheWorkerRun(id['crashed-run']!, id['worker-three']!, aStartedWorker('w99z-worker-three', id['worker-three-run']!, id['crashed-run']!), t.api.HUMAN)
  writeTheWorkerPackage(
    id['worker-one-run']!,
    { task: id['handed-back']!, points: ['made-up-point-handed-back'], difficulty: 'simple', why: 'A made-up reason.', askedAt: AT },
    t.api.HUMAN,
  )
  for (const run of ['supervisor-run', 'worker-one-run', 'worker-two-run', 'worker-three-run', 'crashed-run']) aRequestFrom(id[run]!)

  const reply = await app.inject({ method: 'GET', url: '/api/projects/default/people-and-packages', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
  people = reply.json() as PeopleAndPackages
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('GET /api/projects/:project/people-and-packages', () => {
  it('1. a project that is not there is the master reader\'s coded 404', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/projects/no-such-project/people-and-packages', headers: AS_THE_PERSON })
    expect(missing.statusCode, missing.body.slice(0, 400)).toBe(404)
    expect((missing.json() as { code?: string }).code).toBe('masterPipelineNoSuchProject')
  })

  it('2. each line has all six counts, and the total counts each package once', () => {
    expect(people.project).toBe('default')
    expect(people.actingWithinHours).toBe(1)
    expect(people.at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/u)
    expect(people.lines.map((one) => one.line)).toEqual(['99y', '99z'])
    expect(aLine('99z').counts).toEqual({ all: 5, notTaken: 1, inProgress: 1, handedBack: 1, accepted: 1, blocked: 1 })
    expect(aLine('99y').counts).toEqual({ all: 2, notTaken: 1, inProgress: 1, handedBack: 0, accepted: 0, blocked: 0 })
    expect(people.total).toEqual({ all: 6, notTaken: 1, inProgress: 2, handedBack: 1, accepted: 1, blocked: 1 })
    for (const line of people.lines) {
      expect(line.department, line.line ?? 'null').toEqual({ state: 'not-held' })
      expect(line.secretary, line.line ?? 'null').toBeNull()
    }
  })

  it('3. a worker stands under the supervisor whose run started it, and one whose starter has ended under none', () => {
    const line = aLine('99z')
    expect(line.running).toEqual({ all: 4, supervisors: 1, workers: 3, others: 0, otherCards: [] })
    expect(ids(line.supervisors)).toEqual([id['supervisor']])
    const supervisor = line.supervisors[0]!
    expect(supervisor).toMatchObject({ handle: 'wave-99z-supervisor', post: 'supervisor' })
    expect(supervisor.runs[0]).toMatchObject({ model: 'made-up-model-s', runtime: 'claude-code' })
    expect(supervisor.runs[0]!.id).toBe(id['supervisor-run'])
    expect(ids(supervisor.runs[0]!.workers)).toEqual([id['worker-one'], id['worker-two']].sort())
    for (const worker of supervisor.runs[0]!.workers) {
      expect(worker).toMatchObject({ post: 'worker' })
      expect(worker.runs[0]).toMatchObject({ model: 'made-up-model-w', runtime: 'codex', workers: [] })
    }
    expect(ids(line.workersUnderNoSupervisor)).toEqual([id['worker-three']])
    expect(line.workersUnderNoSupervisor[0]!.runs[0]!.id).toBe(id['worker-three-run'])
  })

  it('4. a package is drawn with its state and its points, for the supervisor that took it and the worker its run names', () => {
    const supervisor = aLine('99z').supervisors[0]!
    const held = [...supervisor.packages].sort((a, b) => a.id.localeCompare(b.id))
    const expected = [
      { id: id['taken']!, title: 'A made-up package, taken', state: 'taken', points: ['made-up-point-taken'] },
      { id: id['handed-back']!, title: 'A made-up package, handed-back', state: 'handed_back', points: ['made-up-point-handed-back'] },
      { id: id['blocked']!, title: 'A made-up package, blocked', state: 'taken', points: ['made-up-point-blocked'] },
    ].sort((a, b) => a.id.localeCompare(b.id))
    expect(held).toEqual(expected)
    const one = supervisor.runs[0]!.workers.find((worker) => worker.id === id['worker-one'])!
    expect(one.runs[0]!.packages).toEqual([{ id: id['handed-back']!, title: 'A made-up package, handed-back', state: 'handed_back', points: ['made-up-point-handed-back'] }])
  })

  it('5. a worker whose run names no package holds none, and not its supervisor\'s', () => {
    const line = aLine('99z')
    const two = line.supervisors[0]!.runs[0]!.workers.find((worker) => worker.id === id['worker-two'])!
    expect(two.runs[0]!.packages).toEqual([])
    expect(line.workersUnderNoSupervisor[0]!.runs[0]!.packages).toEqual([])
  })

  it('6. a line with packages and no running agent is at rest', async () => {
    const { theLineIsAtRest } = await import('../src/shared/project-people.ts')
    const resting = aLine('99y')
    expect(resting.running).toEqual({ all: 0, supervisors: 0, workers: 0, others: 0, otherCards: [] })
    expect(resting.supervisors).toEqual([])
    expect(resting.workersUnderNoSupervisor).toEqual([])
    expect(theLineIsAtRest(resting)).toBe(true)
    expect(theLineIsAtRest(aLine('99z'))).toBe(false)
  })
})
