// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S RUNS ARE READ FROM THE SESSIONS THAT NAME IT, NOT FROM EVERY SESSION OF THE PROJECT. Wave 13j, item 0.
 *
 * MEASURED FIRST, 18 October 2026, on a made-up office of the live shape: one `GET /api/participants/agent/:id/profile`
 * spent 126 to 140 ms of its 655 in `theAgentsRuns`. It read every live session of the project and parsed the data of
 * each one in JavaScript, to keep the few whose `ranAs` names the agent's record. Most sessions are other agents' runs.
 *
 * WHAT THIS HOLDS:
 *   1. reading one agent's runs parses no more JSON when the project holds three times as many sessions of other agents.
 *      Before the change each session of the project was parsed once, so the count grew with them;
 *   2. the runs are the ones they were, newest first: the sessions whose `ranAs` entry for this project names the
 *      agent's record. Never a run bound to another agent, never a run whose entry naming this agent is for another
 *      project, never one that names the agent by its registry id or its handle instead, never a deleted session, never
 *      a session of another project, and nothing for an agent with no record in this project. They are also the runs a
 *      plain reading of every session gives through `ranAsIn`, the one place that reads the binding.
 *
 * CONTROL: case 1 is red before the change. Case 2 is a guard and passes before and after. It goes red if the narrowing
 * drops a run `ranAsIn` keeps, or if a change keeps a run `ranAsIn` does not.
 *
 * MUTATION: take the narrowing out of the statement in `theAgentsRuns` (src/server/lib/agent-runs.ts), so it reads every
 * session again. Case 1 goes red. The commit that added this file names the logs.
 *
 * The agents and sessions here are made up for this file and stand for nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type AgentRuns = typeof import('../src/server/lib/agent-runs.ts')
type Participants = typeof import('../src/server/lib/participants.ts')
type Attachments = typeof import('../src/shared/ran-as.ts')

const HUMAN = { type: 'human', id: THE_PERSON } as const
const HERE = 'default'
const THERE = 'panelx'

/** Sessions of other agents at the smaller size, and how many more are added for the larger one. */
const OTHERS = 25
const MORE = 50

let t: TestDb
let agentRuns: AgentRuns
let participants: Participants
let attachments: Attachments

const runner = { id: '', handle: 'made-up-runner', record: '' }
const other = { id: '', handle: 'made-up-other', record: '' }
const elsewhere = { id: '', handle: 'made-up-elsewhere', record: '' }
/** The runner's runs, in the order they are expected: newest first. */
let runnersRuns: string[] = []
let othersRuns: string[] = []

/** A made-up agent with a record in that project, its registry id and its record id. */
function anAgent(into: { id: string; handle: string; record: string }, workspaceId: string): void {
  into.record = t.api.createRecord({ workspaceId, kind: 'agent', title: `Made-up agent ${into.handle}`, data: { handle: into.handle, runtime: 'claude-code', state: 'active' }, actor: HUMAN }).id
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(into.handle) as { id?: unknown } | undefined
  expect(typeof row?.id, `the registry holds ${into.handle}`).toBe('string')
  into.id = String(row!.id)
}

/** A finished session of that project, with the data given. */
function aSession(workspaceId: string, title: string, data: Record<string, unknown>): string {
  return historicalSession(t, { workspaceId, actor: HUMAN, kind: 'session', title, data: { state: 'finished', ...data } }).id
}

/** A run bound in this project to that agent record. */
const boundTo = (record: string): { ranAs: { workspaceId: string; agentId: string }[] } => ({ ranAs: [{ workspaceId: HERE, agentId: record }] })

function sessionsOfTheOtherAgent(count: number): void {
  for (let i = 0; i < count; i++) othersRuns.push(aSession(HERE, `A made-up run ${String(i)} of the other agent`, { ...boundTo(other.record), model: 'made-up-model' }))
}

/** How many times JSON.parse runs while one agent's runs are read. */
function parsesWhileReading(record: string): number {
  const real = JSON.parse
  let counted = 0
  JSON.parse = function (this: unknown, ...values: Parameters<typeof JSON.parse>) {
    counted++
    return real.apply(JSON, values)
  } as typeof JSON.parse
  try {
    agentRuns.theAgentsRuns(record, HERE)
  } finally {
    JSON.parse = real
  }
  return counted
}

/** The runs a plain reading of every live session of the project gives, kept by `ranAsIn` alone, newest first. */
function everySessionReadThroughRanAsIn(record: string): string[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'session' AND workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC")
    .all(HERE) as { id: string; data: string }[]
  return rows.filter((row) => attachments.ranAsIn({ data: JSON.parse(row.data) as Record<string, unknown> }, HERE) === record).map((row) => row.id)
}

beforeAll(async () => {
  t = await freshDb()
  agentRuns = await import('../src/server/lib/agent-runs.ts')
  participants = await import('../src/server/lib/participants.ts')
  attachments = await import('../src/shared/ran-as.ts')
  anAgent(runner, HERE)
  anAgent(other, HERE)
  anAgent(elsewhere, THERE)

  // THE RUNNER'S OWN RUNS, filed oldest first. One carries an entry for another project before this project's, so the
  // entry for this project is the one that counts. One is moved to an older time than all the rest although it was filed
  // last, so the order is by time first and by filing only between runs filed in the same second.
  const first = aSession(HERE, 'The runner’s first run', boundTo(runner.record))
  const second = aSession(HERE, 'The runner’s second run', { ranAs: [{ workspaceId: THERE, agentId: other.record }, { workspaceId: HERE, agentId: runner.record }] })
  const third = aSession(HERE, 'The runner’s third run', { ...boundTo(runner.record), model: 'made-up-model', effort: 'high' })
  const oldest = aSession(HERE, 'The runner’s run moved back in time', boundTo(runner.record))
  const stamp = (t.client.sqlite.prepare('SELECT created_at AS at FROM records WHERE id = ?').get(oldest) as { at: string }).at
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(`2020${stamp.slice(4)}`, oldest)
  runnersRuns = [third, second, first, oldest]

  // THE SESSIONS THAT NAME THE RUNNER BUT ARE NOT ITS RUNS IN THIS PROJECT.
  aSession(HERE, 'A run whose entry naming the runner is for another project', { ranAs: [{ workspaceId: THERE, agentId: runner.record }] })
  // THIS ONE IS THE OTHER AGENT'S RUN, which its entry for this project says.
  othersRuns.push(aSession(HERE, 'A run whose entry for this project names the other agent', { ranAs: [{ workspaceId: THERE, agentId: runner.record }, { workspaceId: HERE, agentId: other.record }] }))
  aSession(HERE, 'A run that names the runner by its registry id', boundTo(runner.id))
  aSession(HERE, 'A run that names the runner by its handle', { ...boundTo(runner.handle), servingAgent: runner.handle, servingAgentId: runner.id })
  aSession(HERE, 'A run that only says whom it served', { servingAgent: runner.handle, servingAgentId: runner.id })
  aSession(THERE, 'A run of the runner in another project', { ranAs: [{ workspaceId: HERE, agentId: runner.record }, { workspaceId: THERE, agentId: runner.record }] })
  const deleted = aSession(HERE, 'A run of the runner that was deleted', boundTo(runner.record))
  t.api.deleteRecord(deleted, HUMAN)
  aSession(HERE, 'A run of the agent with no record here', boundTo(elsewhere.record))

  sessionsOfTheOtherAgent(OTHERS)
}, 120_000)

afterAll(() => {
  t?.close()
})

describe('the runs on an agent’s profile', () => {
  it('1. are read with no more JSON parsed when the project holds three times as many sessions of other agents', () => {
    // ONE READ FIRST, so what a first read keeps for the rest of the process is not counted at the smaller size only.
    parsesWhileReading(runner.record)
    const smaller = parsesWhileReading(runner.record)
    sessionsOfTheOtherAgent(MORE)
    const larger = parsesWhileReading(runner.record)
    // THE RUNNER'S OWN RUNS ARE PARSED, so a count of nothing would mean the reading is not where this looks.
    expect(smaller, 'no JSON.parse while the runner’s runs were read').toBeGreaterThan(0)
    expect(larger, `JSON.parse calls with ${String(MORE)} more sessions of another agent`).toBe(smaller)
  }, 120_000)

  it('2. are the sessions whose entry for this project names the agent’s record, newest first, and nothing else', () => {
    const read = agentRuns.theAgentsRuns(runner.record, HERE)
    expect(read.looked).toBe(true)
    expect(read.runs.map((run) => run.title)).toEqual(runnersRuns.map((id) => t.api.getRecord(id)!.title))
    expect(read.runs.map((run) => run.id)).toEqual(runnersRuns)
    expect(read.runs.map((run) => run.id)).toEqual(everySessionReadThroughRanAsIn(runner.record))
    // THE OTHER AGENT'S RUNS, every one of them, newest first, which at one second apart is the reverse of filing.
    const others = agentRuns.theAgentsRuns(other.record, HERE)
    expect(others.runs.map((run) => run.id)).toEqual(everySessionReadThroughRanAsIn(other.record))
    expect(new Set(others.runs.map((run) => run.id))).toEqual(new Set(othersRuns))
    // AN AGENT WITH NO RECORD IN THIS PROJECT has none of its runs looked for, though a session here names its record.
    const where = participants.recordForAgentIn(elsewhere.id, HERE)
    expect(where).toBeNull()
    const none = agentRuns.theAgentsRuns(where, HERE)
    expect(none.looked).toBe(false)
    expect(none.runs).toEqual([])
    // AN AGENT RECORD NO SESSION NAMES has looked and found none.
    const nobody = agentRuns.theAgentsRuns(elsewhere.record, THERE)
    expect(nobody.looked).toBe(true)
    expect(nobody.runs).toEqual([])
  })
})
