// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Test change: running counts name other cards, and workers stand under the starting run.
// Test change (wave 13y round 175, as decided): a new file. It holds the two counts the people and packages door
// gains for Home's progress card: `others` on each line, and `running` for the whole project.
// Before, no test held an acting agent whose card is neither supervisor nor worker, or who has no card, and the
// door answered no count of running agents for the whole project.
/**
 * THE PEOPLE AND PACKAGES DOOR COUNTS EVERY ACTING AGENT ON ITS LINE, AND ONCE FOR THE WHOLE PROJECT. Wave 13y round
 * 175: Home's progress card draws one row for each line, with the line's running agents in one cell, and a total row.
 *
 * A RUN ACTS as it does on the board: it sent the office a request within `idleReminderHours()`, one hour unless the
 * owner set MOLE_OFFICE_IDLE_REMINDER_HOURS, it has not ended, and it runs a model. Its agent is the one its
 * `servingAgentId` names, and its line is read from its handle by `theLineOfAHandle`.
 *
 * WHAT THIS FILE PROVES, in its own empty office, where every record, agent and request is made up:
 *   1. On line 98x, a supervisor acts with three workers its run started, and an agent whose card is inspector acts
 *      too. The line's `running` is 5 in all: 1 supervisor, 3 workers and 1 other.
 *   2. On line 98w, an agent with no card acts. The line's `running` is 1 in all, and that 1 is an other.
 *   3. The third worker's handle names line 98w, and the run that started it is the 98x supervisor's. It is counted
 *      on 98x, under that supervisor, and not on 98w.
 *   4. The whole project's `running` counts each acting agent once: 6 in all, 1 supervisor, 3 workers and 2 others.
 *      In this office, where no agent stands on two lines, each number is the sum over the lines.
 *   5. `all` is the sum of the other three, on each line and for the whole project.
 *
 * WHERE THE RULES LIVE: src/server/lib/project-people.ts (the reading), src/server/lib/project-board.ts (which runs
 * act) and src/shared/project-people.ts (the shapes).
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

/** The four counts of running agents, in the order the door names them. */
const FOUR = ['all', 'supervisors', 'workers', 'others'] as const

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

/** Write an agent row straight at the table, with its card or none, and the picture row its foreign key needs. */
function anAgent(name: string, handle: string, role: string | null): void {
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

/** One running run of the agent named, as its handle serves it. */
function aRun(name: string, agent: string, handle: string): string {
  id[name] = t.api.createRecord({
    kind: 'session',
    title: `A made-up run, ${name}`,
    workspaceId: 'default',
    origin: 'fixture',
    actor: t.api.HUMAN,
    data: { state: 'running', servingAgent: handle, servingAgentId: id[agent], model: 'made-up-model', runtime: 'claude-code' },
  }).id
  return id[name]
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
  const { writeTheWorkerRun } = await import('../src/server/lib/records/run-writes.ts')

  anAgent('supervisor', 'wave-98x-supervisor', 'supervisor')
  anAgent('worker-one', 'w98x-worker-one', 'worker')
  anAgent('worker-two', 'w98x-worker-two', 'worker')
  // THE THIRD WORKER'S HANDLE NAMES ANOTHER LINE, and the 98x supervisor's run starts it.
  anAgent('worker-three', 'w98w-worker-three', 'worker')
  // AN AGENT WHOSE CARD IS NEITHER SUPERVISOR NOR WORKER, and one with no card at all.
  anAgent('inspector', 'w98x-inspector', 'inspector')
  anAgent('no-card', 'w98w-no-card', null)

  aRun('supervisor-run', 'supervisor', 'wave-98x-supervisor')
  aRun('worker-one-run', 'worker-one', 'w98x-worker-one')
  aRun('worker-two-run', 'worker-two', 'w98x-worker-two')
  aRun('worker-three-run', 'worker-three', 'w98w-worker-three')
  aRun('inspector-run', 'inspector', 'w98x-inspector')
  aRun('no-card-run', 'no-card', 'w98w-no-card')
  for (const worker of ['worker-one', 'worker-two', 'worker-three']) {
    const handle = worker === 'worker-three' ? 'w98w-worker-three' : `w98x-${worker}`
    writeTheWorkerRun(id['supervisor-run']!, id[worker]!, aStartedWorker(handle, id[`${worker}-run`]!, id['supervisor-run']!), t.api.HUMAN)
  }
  for (const run of ['supervisor-run', 'worker-one-run', 'worker-two-run', 'worker-three-run', 'inspector-run', 'no-card-run']) aRequestFrom(id[run]!)

  const reply = await app.inject({ method: 'GET', url: '/api/projects/default/people-and-packages', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
  people = reply.json() as PeopleAndPackages
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('GET /api/projects/:project/people-and-packages counts other agents and the whole project', () => {
  it('1. a line counts its supervisor, its three workers and the agent of another card', () => {
    expect(people.lines.map((one) => one.line)).toEqual(['98w', '98x'])
    const line = aLine('98x')
    expect(line.running).toEqual({ all: 5, supervisors: 1, workers: 3, others: 1, otherCards: [{ card: 'inspector', count: 1 }] })
    expect(ids(line.supervisors)).toContain(id['inspector'])
  })

  it('2. a line counts the agent with no card as an other', () => {
    const line = aLine('98w')
    expect(line.running).toEqual({ all: 1, supervisors: 0, workers: 0, others: 1, otherCards: [{ card: null, count: 1 }] })
    expect(ids(line.supervisors)).toEqual([id['no-card']])
  })

  it('3. a worker started from another line is counted on its starter\'s line, and not on its own', () => {
    const supervisor = aLine('98x').supervisors.find((one) => one.id === id['supervisor'])!
    expect(ids(supervisor.runs[0]!.workers)).toEqual([id['worker-one'], id['worker-two'], id['worker-three']].sort())
    expect(aLine('98w').workersUnderNoSupervisor).toEqual([])
    expect(aLine('98w').running.workers).toBe(0)
  })

  it('4. the whole project counts each acting agent once, and each number is the sum over the lines in this office, where no agent stands on two lines', () => {
    expect(people.running).toEqual({ all: 6, supervisors: 1, workers: 3, others: 2, otherCards: [{ card: 'inspector', count: 1 }, { card: null, count: 1 }] })
    for (const one of FOUR) {
      const summed = people.lines.reduce((sum, line) => sum + line.running[one], 0)
      expect(people.running[one], `the whole project's ${one}`).toBe(summed)
    }
  })

  it('5. all is the sum of the other three, on each line and for the whole project', () => {
    for (const running of [...people.lines.map((line) => line.running), people.running]) {
      expect(running.all).toBe(running.supervisors + running.workers + running.others)
    }
  })
})
