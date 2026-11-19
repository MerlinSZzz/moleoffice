// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE USE OF A TOOL IS ONE ROW, AND NOTHING ELSE IS WRITTEN (problem mR8vNPOVNQ_p, wave 13s round 33).
 *
 * Until round 33 the use door (POST /api/toolset/uses) added {at, tool, said} to data.toolUses on the calling run.
 * Each use rewrote the record and wrote a revision holding the whole list again: one made-up run of 2,000 uses wrote
 * 268,483,514 bytes of revisions. Now each use is one row in `tool_uses`, and the run's uses are read back with
 * GET /api/toolset/runs/<run>/uses. This file pins three things:
 *
 *   1. a use writes one row in `tool_uses` and nothing else: no record, no revision, no change row, and the run's
 *      record is as it was, `updated_at` included;
 *   2. GET /api/toolset/runs/<run>/uses reads the run's uses newest first, a page at a time, each page's `older`
 *      reading the next, and refuses what is not a run of this project and a page size it does not take;
 *   3. the change rows a use wrote before this round are kept, and GET /api/changes still reads them in words.
 *
 * ---------------------------------------------------------------------------------------
 * PROVED BY MUTATION (chapter 5): CONTROL green, then each mutation alone, then RESTORE green
 * ---------------------------------------------------------------------------------------
 *
 * Each file was restored byte-identical after each mutation (sha256 checked before and after each). The mutations
 * and their results are in the report of round 33.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { TOOL_USE_APPENDED_FIELD, TOOL_USES_FIELD, type StoredToolUse, type ToolUse } from '../src/shared/toolset.ts'
import { changeVerb } from '../src/shared/words.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'toolset-tester',
}
const ACTOR = { type: 'agent', id: 'toolset-tester' } as const

let t: TestDb
let app: FastifyInstance
let workspaces: typeof import('../src/server/lib/workspaces.ts')
let run: string
let workspace: string
let headers: Record<string, string>
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)
afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  // Each case files into its own project, so a tool slug and a run's place are new for it.
  caseNumber += 1
  workspace = `tool-use-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: workspace, title: `Tool use case ${String(caseNumber)}` })
  headers = { ...AGENT, 'x-mole-office-workspace': workspace }
  run = t.api.createRecord({ workspaceId: workspace, kind: 'session', title: 'A made-up run that uses a tool', data: { state: 'running' }, actor: ACTOR }).id
  const category = t.api.createRecord({ workspaceId: workspace, kind: 'tool_category', title: 'Made-up tools', data: { says: 'Made up.' }, actor: ACTOR }).id
  t.api.createRecord({
    workspaceId: workspace,
    kind: 'tool',
    title: 'Data copy',
    data: { entry: 'tool', slug: 'data-copy', forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' },
    actor: ACTOR,
  })
})

async function use(said: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'POST', url: '/api/toolset/uses', headers: { ...headers, 'x-mole-office-session': run }, payload: { tool: 'data-copy', said } })
  expect(res.statusCode, res.body).toBe(201)
  return res.json() as Record<string, unknown>
}

async function read(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'GET', url, headers })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/** Every row the database holds in the tables a write could add to, and the run's own row. */
function everything(): Record<string, unknown> {
  const n = (sql: string): number => (t.client.sqlite.prepare(sql).get() as { n: number }).n
  return {
    records: n('SELECT count(*) AS n FROM records'),
    changes: n('SELECT count(*) AS n FROM changes'),
    revisions: n('SELECT count(*) AS n FROM revisions'),
    theRun: t.client.sqlite.prepare('SELECT data, updated_at, title FROM records WHERE id = ?').get(run),
  }
}

describe('a use of a tool', () => {
  it('1. writes one row in tool_uses and nothing else', async () => {
    const before = everything()
    // A list over the whole table, and the office is shared by the file: the rows this case reads
    // are the ones that were not there when it began, which is what the two uses added.
    const idsBefore = new Set(
      (t.client.sqlite.prepare('SELECT id FROM tool_uses').all() as { id: string }[]).map((row) => row.id),
    )
    const first = await use('make: copied the first made-up file')
    const second = await use('open: unpacked the second made-up file')
    expect(everything()).toEqual(before)
    expect([first['uses'], second['uses']]).toEqual([1, 2])
    const rows = (
      t.client.sqlite
        .prepare('SELECT id, run_id AS runId, seq, tool, said, actor_type AS actorType, actor_id AS actorId, moved_at AS movedAt FROM tool_uses ORDER BY seq')
        .all() as { id: string }[]
    )
      .filter((row) => !idsBefore.has(row.id))
      .map(({ id: _id, ...row }) => row)
    expect(rows).toEqual([
      { runId: run, seq: 1, tool: 'data-copy', said: 'make: copied the first made-up file', actorType: 'agent', actorId: 'toolset-tester', movedAt: null },
      { runId: run, seq: 2, tool: 'data-copy', said: 'open: unpacked the second made-up file', actorType: 'agent', actorId: 'toolset-tester', movedAt: null },
    ])
    expect(Object.hasOwn(t.api.getRecord(run)?.data as Record<string, unknown>, TOOL_USES_FIELD)).toBe(false)
  })

  it('2. is read back newest first, a page at a time, and the read refuses what it cannot answer', async () => {
    for (const n of [1, 2, 3, 4, 5]) await use(`make: made-up use ${String(n)}`)
    const saids = (body: Record<string, unknown>): string[] => (body['uses'] as StoredToolUse[]).map((u) => u.said)

    const one = await read(`/api/toolset/runs/${run}/uses?limit=2`)
    expect(one.status, JSON.stringify(one.body)).toBe(200)
    expect(one.body['total']).toBe(5)
    expect(saids(one.body)).toEqual(['make: made-up use 5', 'make: made-up use 4'])
    expect(one.body['older']).toBe(4)
    const newest = (one.body['uses'] as StoredToolUse[])[0]
    expect(newest).toMatchObject({ seq: 5, tool: 'data-copy', by: { type: 'agent', id: 'toolset-tester' }, movedAt: null })
    expect(newest?.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

    const two = await read(`/api/toolset/runs/${run}/uses?limit=2&before=4`)
    expect(saids(two.body)).toEqual(['make: made-up use 3', 'make: made-up use 2'])
    expect(two.body['older']).toBe(2)
    const three = await read(`/api/toolset/runs/${run}/uses?limit=2&before=2`)
    expect(saids(three.body)).toEqual(['make: made-up use 1'])
    expect(three.body['older']).toBeNull()

    // With nothing said, one page of every use there is, here all five.
    const whole = await read(`/api/toolset/runs/${run}/uses`)
    expect(saids(whole.body)).toHaveLength(5)
    expect(whole.body['older']).toBeNull()

    const note = t.api.createRecord({ workspaceId: workspace, kind: 'note', title: 'A note, not a run', data: {}, actor: ACTOR }).id
    const refusals: { what: string; url: string; status: number }[] = [
      { what: 'a record that is not a run', url: `/api/toolset/runs/${note}/uses`, status: 400 },
      { what: 'nothing at all', url: '/api/toolset/runs/no-such-run/uses', status: 404 },
      { what: 'a page of none', url: `/api/toolset/runs/${run}/uses?limit=0`, status: 400 },
      { what: 'a page over the most', url: `/api/toolset/runs/${run}/uses?limit=501`, status: 400 },
      { what: 'a place that is not a number', url: `/api/toolset/runs/${run}/uses?before=x`, status: 400 },
    ]
    for (const refusal of refusals) {
      const answer = await read(refusal.url)
      expect(answer.status, `${refusal.what}: ${JSON.stringify(answer.body)}`).toBe(refusal.status)
    }
  })

  it('3. leaves the change rows written before this round as they are, still read in words', async () => {
    // A run from before this round: one use logged with the whole list, as before round 32, and one logged as the
    // line it added, as in round 32. Written straight into the table, because no door writes either shape now.
    const earlier: ToolUse[] = [
      { at: '2026-10-09 10:00:00', tool: 'data-copy', said: 'make: an earlier made-up use' },
      { at: '2026-10-09 10:00:05', tool: 'data-copy', said: 'open: a second earlier made-up use' },
    ]
    const insert = t.client.sqlite.prepare(
      "INSERT INTO changes (id, record_id, workspace_id, op, actor_type, actor_id, field, old_value, new_value, at) VALUES (?, ?, ?, 'update', 'agent', 'toolset-tester', ?, ?, ?, ?)",
    )
    insert.run('earlier-use-1', run, workspace, `data.${TOOL_USES_FIELD}`, null, JSON.stringify(earlier.slice(0, 1)), '2026-10-09 10:00:00')
    insert.run('earlier-use-2', run, workspace, TOOL_USE_APPENDED_FIELD, null, JSON.stringify(earlier[1]), '2026-10-09 10:00:05')
    await use('make: a use after the change')

    const res = await read(`/api/changes?recordId=${run}`)
    expect(res.status, JSON.stringify(res.body)).toBe(200)
    const changes = res.body['changes'] as { id: string; field: string | null; op: string; oldValue: string | null; newValue: string | null }[]
    const uses = changes.filter((c) => c.field?.startsWith(`data.${TOOL_USES_FIELD}`) === true)
    // The two old rows and no new one, newest first, as the door answers.
    expect(uses.map((c) => c.id)).toEqual(['earlier-use-2', 'earlier-use-1'])
    expect(changeVerb(uses[0]!)).toBe('added one line to tool uses in data')
    expect(changeVerb(uses[0]!, 'inspect')).toBe(`changed ${TOOL_USE_APPENDED_FIELD}`)
  })
})
