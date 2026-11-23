// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PEOPLE DOOR STANDS EACH AGENT ONCE. In a made-up office:
 * 1. A supervisor's runs are ordered, share its packages, and hold only their own workers.
 * 2. A worker can stand under two starters on different lines, or under one and under no supervisor.
 * 3. Other cards join runs and retain each run's package; starts not recorded sort last.
 * 4. Each line and the project count agents once, with other cards ordered and totals consistent.
 * The reader is src/server/lib/project-people.ts and the answer is src/shared/project-people.ts.
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
  const agents = [
    ['supervisor', 'wave-99z-supervisor', 'supervisor'], ['other-supervisor', 'wave-99y-supervisor', 'supervisor'],
    ['shared', 'w99z-shared', 'worker'], ['split', 'w99z-split', 'worker'],
    ['inspector', 'w99z-inspector', 'inspector'], ['secretary', 'w99z-secretary', 'secretary'],
    ['uncarded', 'w99z-uncarded', null],
  ] as const
  for (const [name, handle, card] of agents) anAgent(name, handle, card)
  aPackage('taken', ['99z'], { takenInside: [anAct(1)] })
  aPackage('first', ['99z'], {})
  aPackage('second', ['99z'], {})
  const run = (name: string, agent: string, handle: string, startedAt?: string) => aRun(name, {
    state: 'running', servingAgent: handle, servingAgentId: id[agent], model: 'made-up-model', runtime: 'codex',
    ...(startedAt === undefined ? {} : { startedAt }),
  })
  const early = '2026-11-22 08:00:00'
  const late = '2026-11-22 09:00:00'
  run('supervisor-late', 'supervisor', 'wave-99z-supervisor', late)
  run('supervisor-early', 'supervisor', 'wave-99z-supervisor', early)
  run('other-supervisor-run', 'other-supervisor', 'wave-99y-supervisor', early)
  run('shared-first', 'shared', 'w99z-shared', early)
  run('shared-second', 'shared', 'w99z-shared', late)
  run('shared-third', 'shared', 'w99z-shared', late)
  run('split-started', 'split', 'w99z-split', early)
  run('split-orphan', 'split', 'w99z-split', late)
  aRun('ended-starter', { state: 'crashed', servingAgent: 'wave-99z-supervisor', servingAgentId: id['supervisor'], runtime: 'codex' })
  writeTheWorkerRun(id['ended-starter']!, id['split']!, aStartedWorker('w99z-split', id['split-orphan']!, id['ended-starter']!), t.api.HUMAN)
  run('inspector-late', 'inspector', 'w99z-inspector')
  run('inspector-early', 'inspector', 'w99z-inspector', early)
  run('secretary-run', 'secretary', 'w99z-secretary', early)
  run('uncarded-run', 'uncarded', 'w99z-uncarded', early)
  for (const [starter, worker, child] of [
    ['supervisor-early', 'shared', 'shared-first'], ['supervisor-late', 'shared', 'shared-second'],
    ['other-supervisor-run', 'shared', 'shared-third'], ['supervisor-early', 'split', 'split-started'],
  ] as const) writeTheWorkerRun(id[starter]!, id[worker]!, aStartedWorker(worker === 'shared' ? 'w99z-shared' : 'w99z-split', id[child]!, id[starter]!), t.api.HUMAN)
  for (const [runName, packageName] of [['inspector-early', 'first'], ['inspector-late', 'second']] as const) {
    writeTheWorkerPackage(id[runName]!, { task: id[packageName]!, points: [`made-up-point-${packageName}`], difficulty: 'simple', why: 'A made-up reason.', askedAt: AT }, t.api.HUMAN)
  }
  for (const key of ['supervisor-late', 'supervisor-early', 'other-supervisor-run', 'shared-first', 'shared-second', 'shared-third', 'split-started', 'split-orphan', 'inspector-late', 'inspector-early', 'secretary-run', 'uncarded-run']) aRequestFrom(id[key]!)
  const reply = await app.inject({ method: 'GET', url: '/api/projects/default/people-and-packages', headers: AS_THE_PERSON })
  expect(reply.statusCode).toBe(200)
  people = reply.json() as PeopleAndPackages
}, 120_000)

afterAll(async () => { await app?.close(); t?.close() })

describe('the people door stands each agent once', () => {
  it('joins supervisor runs in start order and keeps packages on the agent', () => {
    const entries = aLine('99z').supervisors.filter((one) => one.id === id['supervisor'])
    expect(entries).toHaveLength(1)
    const supervisor = entries[0]!
    expect(supervisor.runs.map((run) => run.id)).toEqual([id['supervisor-early'], id['supervisor-late']])
    expect(supervisor.packages.map((one) => one.id)).toEqual([id['taken']])
    expect(supervisor.runs.map((run) => run.packages)).toEqual([[], []])
    expect(ids(supervisor.runs[0]!.workers)).toEqual([id['shared'], id['split']].sort())
    expect(ids(supervisor.runs[1]!.workers)).toEqual([id['shared']])
    expect(supervisor.runs[0]!.workers.find((one) => one.id === id['shared'])!.runs.map((run) => run.id)).toEqual([id['shared-first']])
    expect(supervisor.runs[1]!.workers[0]!.runs.map((run) => run.id)).toEqual([id['shared-second']])
  })
  it('places shared and orphan runs where their starters stand', () => {
    const other = aLine('99y').supervisors[0]!.runs[0]!.workers[0]!
    expect(other.id).toBe(id['shared'])
    expect(other.runs.map((run) => run.id)).toEqual([id['shared-third']])
    const orphan = aLine('99z').workersUnderNoSupervisor.find((one) => one.id === id['split'])!
    expect(orphan.runs.map((run) => run.id)).toEqual([id['split-orphan']])
    expect(people.running.workers).toBe(2)
    expect(people.lines.reduce((sum, line) => sum + line.running.workers, 0)).toBe(3)
  })
  it('joins another card and keeps each run package, with an absent start last', () => {
    const entries = aLine('99z').supervisors.filter((one) => one.id === id['inspector'])
    expect(entries).toHaveLength(1)
    expect(entries[0]!.packages).toEqual([])
    expect(entries[0]!.runs.map((run) => [run.id, run.startedAt, run.packages[0]?.id])).toEqual([
      [id['inspector-early'], '2026-11-22 08:00:00', id['first']], [id['inspector-late'], null, id['second']],
    ])
  })
  it('counts each agent once on each line and in the project, by card', () => {
    expect(aLine('99z').running).toEqual({ all: 6, supervisors: 1, workers: 2, others: 3, otherCards: [{ card: 'inspector', count: 1 }, { card: 'secretary', count: 1 }, { card: null, count: 1 }] })
    expect(aLine('99y').running).toEqual({ all: 2, supervisors: 1, workers: 1, others: 0, otherCards: [] })
    expect(people.running).toEqual({ all: 7, supervisors: 2, workers: 2, others: 3, otherCards: [{ card: 'inspector', count: 1 }, { card: 'secretary', count: 1 }, { card: null, count: 1 }] })
    for (const counts of [...people.lines.map((line) => line.running), people.running]) {
      expect(counts.all).toBe(counts.supervisors + counts.workers + counts.others)
      expect(counts.otherCards.reduce((sum, card) => sum + card.count, 0)).toBe(counts.others)
    }
  })
})
