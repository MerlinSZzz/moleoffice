// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S OWN RECORD IS LOOKED UP FROM THE AGENT, NOT BY WALKING THE PROJECT. Wave 13j, item 0.
 *
 * MEASURED FIRST, 18 October 2026, on a made-up office of the live shape (20,005 live records in the default project,
 * 75 agent records): one `GET /api/participants/agent/:id/profile` asks `recordForAgentIn` six times, and each ask
 * took 9 to 10 ms, 59 ms of the 655. Its join left the order to SQLite, and with no statistics to read SQLite walked
 * every live record of the project by records_live_idx and looked each one up in agent_records. Started from the
 * agent's own rows in agent_records, the same question took 0.01 ms and gave the same id.
 *
 * WHAT THIS HOLDS:
 *   1. the statement starts from agent_records by the agent's id and walks no record of the project, in an office of
 *      10 other records and in one of 300. The plan has no statistics to read, so it must be the same at both sizes;
 *   2. the answer is the one it was: the newest record in the project, never one in another project, never a deleted
 *      one, null for an agent with none here, and the same id the roster's one-query reader gives.
 *
 * CONTROL: case 1 is red before the change, because the plan's first step searched records by records_live_idx. Case 2
 * is a guard and passes before and after. It goes red if a change to the join changes which record wins.
 *
 * MUTATION: put `JOIN` back for `CROSS JOIN` in `theRecordForAgentStatement` (src/server/lib/participants.ts). Case 1
 * goes red at both sizes. The commit that added this file names the logs.
 *
 * The records here are made up for this file and stand for nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

type Participants = typeof import('../src/server/lib/participants.ts')

const HUMAN = { type: 'human', id: THE_PERSON } as const
const HERE = 'panelx'
const THERE = 'default'

/** Each reading statement `work` ran, with its query plan in SQLite's words for the values it was given. */
function thePlansDuring(t: TestDb, work: () => unknown): { sql: string; plan: string[] }[] {
  // THE PROTOTYPE AND NOT `prepare`, because the statement is prepared once per database handle and kept: it may have
  // been prepared before this looks, and every statement shares the prototype.
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, (...values: unknown[]) => unknown>
  const ran: { sql: string; values: unknown[] }[] = []
  const kept = { get: proto['get']!, all: proto['all']! }
  for (const method of ['get', 'all'] as const) {
    const real = kept[method]
    proto[method] = function (this: { source: string }, ...values: unknown[]) {
      ran.push({ sql: this.source, values })
      return real.apply(this, values)
    }
  }
  try {
    work()
  } finally {
    proto['get'] = kept.get
    proto['all'] = kept.all
  }
  return ran
    .filter((one) => /^\s*select/i.test(one.sql))
    .map((one) => ({
      sql: one.sql,
      plan: (t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[]).map((step) => step.detail),
    }))
}

/** A made-up agent filed in this project, and its registry id. */
function anAgent(t: TestDb, handle: string, workspaceId: string): { id: string; record: string } {
  const record = t.api.createRecord({ workspaceId, kind: 'agent', title: `Made-up agent ${handle}`, data: { handle, runtime: 'claude-code', state: 'active' }, actor: HUMAN }).id
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `the registry holds ${handle}`).toBeDefined()
  return { id: row!.id, record }
}

/** Another record of this agent in that project, joined to it as a registration joins one. */
function anotherRecordOf(t: TestDb, agentId: string, workspaceId: string, title: string): string {
  const id = t.api.createRecord({ workspaceId, kind: 'note', title, data: { body: 'Made up for this test.' }, actor: HUMAN }).id
  t.client.sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(id, agentId)
  return id
}

describe.each([{ others: 10 }, { others: 300 }])('an office with $others other records in the project', ({ others }) => {
  let t: TestDb
  let participants: Participants
  const made = { newest: '', older: '', elsewhere: '', kept: '', deleted: '' }
  let several: { id: string; record: string }
  let onlyThere: { id: string; record: string }
  let oneDeleted: { id: string; record: string }

  beforeAll(async () => {
    t = await freshDb()
    participants = await import('../src/server/lib/participants.ts')
    several = anAgent(t, 'made-up-several', HERE)
    onlyThere = anAgent(t, 'made-up-only-there', THERE)
    oneDeleted = anAgent(t, 'made-up-one-deleted', HERE)
    for (let i = 0; i < others; i++) {
      t.api.createRecord({ workspaceId: HERE, kind: 'note', title: `Made-up note ${String(i)}`, data: { body: 'Made up for this test.' }, actor: HUMAN })
    }
    made.older = anotherRecordOf(t, several.id, HERE, 'An older record of made-up-several')
    made.newest = anotherRecordOf(t, several.id, HERE, 'The newest record of made-up-several')
    made.elsewhere = anotherRecordOf(t, several.id, THERE, 'A record of made-up-several in the other project')
    made.kept = anotherRecordOf(t, oneDeleted.id, HERE, 'A record of made-up-one-deleted that stays')
    made.deleted = anotherRecordOf(t, oneDeleted.id, HERE, 'The newest record of made-up-one-deleted, then deleted')
    t.api.deleteRecord(made.deleted, HUMAN)
  }, 120_000)

  afterAll(() => {
    t?.close()
  })

  it('1. starts from the agent’s own rows in agent_records and walks no record of the project', () => {
    const plans = thePlansDuring(t, () => participants.recordForAgentIn(several.id, HERE))
    expect(plans.map((one) => one.sql), 'recordForAgentIn asks one question').toHaveLength(1)
    const [one] = plans
    expect(one!.plan[0], one!.plan.join(' | ')).toMatch(/^SEARCH m USING (COVERING )?INDEX agent_records_agent_idx \(agent_id=\?\)/)
    expect(one!.plan.join(' | ')).not.toContain('records_live_idx')
    expect(one!.plan.join(' | ')).toMatch(/SEARCH r USING INDEX sqlite_autoindex_records_1 \(id=\?\)/)
  })

  it('2. answers the newest record here, never another project’s or a deleted one, and what the roster answers', () => {
    expect(participants.recordForAgentIn(several.id, HERE)).toBe(made.newest)
    expect(participants.recordForAgentIn(several.id, THERE)).toBe(made.elsewhere)
    expect(participants.recordForAgentIn(onlyThere.id, HERE), 'an agent with no record in this project').toBeNull()
    expect(participants.recordForAgentIn(onlyThere.id, THERE)).toBe(onlyThere.record)
    expect(participants.recordForAgentIn(oneDeleted.id, HERE), 'the newest is deleted, so the one before it').toBe(made.kept)
    expect(participants.recordForAgentIn('no-such-agent', HERE)).toBeNull()
    const roster = participants.recordsForAgentsIn(HERE)
    for (const agent of [several, onlyThere, oneDeleted]) {
      expect(participants.recordForAgentIn(agent.id, HERE), agent.id).toBe(roster.get(agent.id) ?? null)
    }
  })
})
