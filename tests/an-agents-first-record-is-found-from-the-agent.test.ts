// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S FIRST-FILED RECORD, IN ANY PROJECT, IS FOUND FROM THE AGENT'S OWN ROWS, NOT BY WALKING EVERY AGENT RECORD.
 *
 * Wave 13s round 144, item 39 (b). `anyRecordForAgent` (src/server/lib/elevation.ts) is asked once for each agent when
 * the broadcast schedules are brought into step, which an agent's start does: 1,460 times in one start on the made-up
 * office of 22 October. Its join left the order to SQLite, and with no statistics to read SQLite walked every agent
 * record by records_kind_idx and looked each one up in agent_records: 0.21 ms a call. Started from the agent's own rows
 * in agent_records, as `recordForAgentIn` in src/server/lib/participants.ts is (wave 13j, item 0), it gives the same
 * record.
 *
 * WHAT THIS HOLDS, in an office of 10 other agents' records and in one of 300:
 *   1. the statement starts from agent_records by the agent's id, finds each record by its id, and reads no record by
 *      its kind. The plan has no statistics to read, so it must be the same at both sizes;
 *   2. the answer is the one it was: the first-filed live agent record in any project, with its project; a tie in time
 *      broken by the order of writing; never a deleted record, nor a record of another kind, nor another agent's; a
 *      deleted record named as if live counts; a record named as if deleted is left out; null for an agent with none.
 *
 * CONTROL: case 1 is red before the change, because the plan's first step searched records by records_kind_idx. Case 2
 * is a guard and passes before and after. tests/an-agents-other-records-meet-the-guards-on-restore-and-delete.test.ts
 * holds what the restore and delete doors answer from it.
 *
 * MUTATIONS, each after a control run, each put back from the commit:
 *   1. Put back `JOIN` for `CROSS JOIN`. Case 1 goes red at both sizes.
 *   2. Order by `r.created_at DESC`. Case 2 goes red: the latest record comes first.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb`), never the live office. The agents, their records and the rows
 * joining them are written straight into the tables and are made up; every title begins with "Made-up".
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

type Elevation = typeof import('../src/server/lib/elevation.ts')

const HERE = 'panelx'
const THERE = 'default'

/** Each reading statement `work` ran, with its query plan in SQLite's words for the values it was given. */
function thePlansDuring(t: TestDb, work: () => unknown): { sql: string; plan: string[] }[] {
  // THE PROTOTYPE AND NOT `prepare`, so a statement prepared before this looks is seen too.
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

/** A made-up agent in the registry, with no record of its own yet. */
function anAgent(t: TestDb, id: string): void {
  const at = '2026-10-20 09:00:00'
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated')",
    )
    .run(`avatar-default-agent-${id}`, at)
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, ?, ?, ?, 0, ?)')
    .run(id, `made-up-${id}`, `made-up-${id}`, `avatar-default-agent-${id}`, at)
}

/** A made-up record of that agent, written straight into the table and joined to it as a registration joins one. */
function aRecordOf(t: TestDb, agentId: string, id: string, opts: { at: string; workspace?: string; kind?: string; deleted?: boolean }): void {
  t.client.sqlite
    .prepare(
      `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
       values (?, ?, 'owner', ?, ?, ?, ?, null, ?, ?, 'fixture')`,
    )
    .run(
      id,
      opts.workspace ?? HERE,
      opts.at,
      opts.at,
      opts.kind ?? 'agent',
      `Made-up record ${id}`,
      JSON.stringify(opts.kind === undefined || opts.kind === 'agent' ? { handle: `made-up-${agentId}`, runtime: 'claude-code', state: 'active' } : { body: 'Made up for this test.' }),
      opts.deleted === true ? opts.at : null,
    )
  t.client.sqlite.prepare('INSERT INTO agent_records (record_id, agent_id) VALUES (?, ?)').run(id, agentId)
}

describe.each([{ others: 10 }, { others: 300 }])('an office with $others other agents’ records', ({ others }) => {
  let t: TestDb
  let elevation: Elevation

  beforeAll(async () => {
    t = await freshDb()
    elevation = await import('../src/server/lib/elevation.ts')
    for (let i = 0; i < others; i++) {
      const id = `r144-other-${String(i)}`
      anAgent(t, id)
      aRecordOf(t, id, `r144-other-${String(i)}-record`, { at: '2026-10-20 07:00:00' })
    }
    anAgent(t, 'r144-several')
    // OLDER THAN THE ONE THAT WINS, AND EACH LEFT OUT FOR ITS OWN REASON: deleted, and of another kind.
    aRecordOf(t, 'r144-several', 'sev-deleted', { at: '2026-10-21 08:00:00', deleted: true })
    aRecordOf(t, 'r144-several', 'sev-note', { at: '2026-10-21 09:00:00', kind: 'note' })
    aRecordOf(t, 'r144-several', 'sev-first', { at: '2026-10-21 10:00:00' })
    // A TIE IN TIME, in the other project: the one written first comes first, though its id sorts last.
    aRecordOf(t, 'r144-several', 'sev-tie-z', { at: '2026-10-21 11:00:00', workspace: THERE })
    aRecordOf(t, 'r144-several', 'sev-tie-a', { at: '2026-10-21 11:00:00', workspace: THERE })
    anAgent(t, 'r144-none')
  }, 120_000)

  afterAll(() => {
    t?.close()
  })

  it('1. starts from the agent’s own rows in agent_records and reads no record by its kind', () => {
    const plans = thePlansDuring(t, () => elevation.anyRecordForAgent('r144-several'))
    expect(plans.map((one) => one.sql), 'anyRecordForAgent asks one question').toHaveLength(1)
    const [one] = plans
    expect(one!.plan[0], one!.plan.join(' | ')).toMatch(/^SEARCH m USING (COVERING )?INDEX agent_records_agent_idx \(agent_id=\?\)/)
    expect(one!.plan.join(' | ')).not.toContain('records_kind_idx')
    expect(one!.plan.join(' | ')).toMatch(/SEARCH r USING INDEX sqlite_autoindex_records_1 \(id=\?\)/)
  })

  it('2. answers the first-filed live agent record in any project, as it did', () => {
    expect(elevation.anyRecordForAgent('r144-several')).toEqual({ record: 'sev-first', workspaceId: HERE })
    expect(elevation.anyRecordForAgent('r144-several', 'sev-deleted'), 'the deleted one named as if live').toEqual({ record: 'sev-deleted', workspaceId: HERE })
    expect(elevation.anyRecordForAgent('r144-several', undefined, 'sev-first'), 'the first named as if deleted').toEqual({ record: 'sev-tie-z', workspaceId: THERE })
    expect(elevation.anyRecordForAgent('r144-several', 'sev-note'), 'a record of another kind named as if live').toEqual({ record: 'sev-first', workspaceId: HERE })
    expect(elevation.anyRecordForAgent('r144-none'), 'an agent with no record').toBeNull()
    expect(elevation.anyRecordForAgent('no-such-agent')).toBeNull()
    expect(elevation.anyRecordForAgent('r144-other-0')).toEqual({ record: 'r144-other-0-record', workspaceId: HERE })
  })
})
