// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A USE OF A TOOL IS ONE LINE ON THE RUN THAT MADE IT, AND NEVER A RECORD.
 *
 * POST /api/toolset/uses (src/server/api/toolset.ts), on the secretary's decision Vt0GdSlApWce point d: a use
 * of a tool writes one line against the calling run, and never a record of its own. Since wave 13s round 33 the
 * line is one row in `tool_uses`, keyed by the run, and the run's record does not hold it.
 *
 * What it proves:
 *   - the line {at, tool, said} lands in `tool_uses` against the run the session header names;
 *   - two uses sent at once keep two lines, at places 1 and 2;
 *   - each refusal writes nothing: no header, a header naming a record that is not a run, a header
 *     naming nothing, an unknown slug, an empty line, a line break, and a line over 300 characters;
 *   - no record is created for a use;
 *   - an ordinary write cannot set, change or drop data.toolUses: a PATCH by dataPatch or by data,
 *     and a run filed with the field, are refused and write nothing, while the door still appends and
 *     an ordinary PATCH of another field still passes.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ONLY_THE_USE_DOOR_WRITES_TOOL_USES, TOOL_USE_MOST_CHARACTERS } from '../src/shared/toolset.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'toolset-tester',
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance
let run: string
let note: string
let category: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  category = t.api.createRecord({
    workspaceId: 'default',
    kind: 'tool_category',
    title: 'Developing the office',
    data: { says: 'Builders.' },
    actor: { type: 'agent', id: 'toolset-tester' },
  }).id
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'tool',
    title: 'Data copy',
    data: { entry: 'tool', slug: 'data-copy', forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' },
    actor: { type: 'agent', id: 'toolset-tester' },
  })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  run = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The run that uses a tool',
    data: { state: 'running' },
    actor: { type: 'agent', id: 'toolset-tester' },
  }).id
  note = t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'A note, not a run',
    data: {},
    actor: { type: 'agent', id: 'toolset-tester' },
  }).id
})

async function use(body: Record<string, unknown>, session: string | null = run): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/toolset/uses',
    headers: { ...AGENT, ...(session === null ? {} : { 'x-mole-office-session': session }) },
    payload: body,
  })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/** The run's uses, in the order they were written, as `tool_uses` holds them. */
function linesOnTheRun(): { at: string; tool: string; said: string }[] {
  return t.client.sqlite.prepare('SELECT at, tool, said FROM tool_uses WHERE run_id = ? ORDER BY seq').all(run) as { at: string; tool: string; said: string }[]
}

/** What the database holds, as counts of the rows a write would add to. */
function counts(): { records: number; changes: number; revisions: number; uses: number } {
  const n = (sql: string): number => (t.client.sqlite.prepare(sql).get() as { n: number }).n
  return {
    records: n('SELECT count(*) AS n FROM records'),
    changes: n('SELECT count(*) AS n FROM changes'),
    revisions: n('SELECT count(*) AS n FROM revisions'),
    uses: n('SELECT count(*) AS n FROM tool_uses'),
  }
}

describe('POST /api/toolset/uses', () => {
  it("writes the line on the caller's run, with the office's clock", async () => {
    const done = await use({ tool: 'data-copy', said: 'make: copied /tmp/a.db' })
    expect(done.status, JSON.stringify(done.body)).toBe(201)
    expect(done.body['run']).toBe(run)
    const lines = linesOnTheRun()
    expect(lines.length).toBe(1)
    expect(lines[0]).toMatchObject({ tool: 'data-copy', said: 'make: copied /tmp/a.db' })
    expect(lines[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    // NOT IN THE RUN'S RECORD.
    expect(Object.hasOwn(t.api.getRecord(run)?.data as Record<string, unknown>, 'toolUses')).toBe(false)
  })

  it('keeps two lines for two uses sent at once, and creates no record for either', async () => {
    const before = counts()
    const [one, two] = await Promise.all([
      use({ tool: 'data-copy', said: 'make: copied the first' }),
      use({ tool: 'data-copy', said: 'open: unpacked the second' }),
    ])
    expect(one?.status, JSON.stringify(one?.body)).toBe(201)
    expect(two?.status, JSON.stringify(two?.body)).toBe(201)
    expect(linesOnTheRun().map((line) => line.said).sort()).toEqual(['make: copied the first', 'open: unpacked the second'])
    expect((t.client.sqlite.prepare('SELECT seq FROM tool_uses WHERE run_id = ? ORDER BY seq').all(run) as { seq: number }[]).map((r) => r.seq)).toEqual([1, 2])
    expect(counts().records).toBe(before.records)
  })

  it('writes nothing for each refusal', async () => {
    const refusals: { what: string; body: Record<string, unknown>; session: string | null; status: number; says: string }[] = [
      { what: 'no session header', body: { tool: 'data-copy', said: 'a line' }, session: null, status: 400, says: 'names no run' },
      { what: 'a session header naming a note', body: { tool: 'data-copy', said: 'a line' }, session: note, status: 400, says: 'not a run' },
      { what: 'a session header naming nothing', body: { tool: 'data-copy', said: 'a line' }, session: 'no-such-run', status: 400, says: 'names no run in this project' },
      { what: 'an unknown slug', body: { tool: 'no-such-tool', said: 'a line' }, session: run, status: 404, says: '"no-such-tool"' },
      { what: 'an empty line', body: { tool: 'data-copy', said: '   ' }, session: run, status: 400, says: 'empty' },
      { what: 'a line break', body: { tool: 'data-copy', said: 'one\ntwo' }, session: run, status: 400, says: 'line break' },
      {
        what: 'a line over the limit',
        body: { tool: 'data-copy', said: 'x'.repeat(TOOL_USE_MOST_CHARACTERS + 1) },
        session: run,
        status: 400,
        says: `at most ${String(TOOL_USE_MOST_CHARACTERS)}`,
      },
    ]
    for (const refusal of refusals) {
      const before = counts()
      const answer = await use(refusal.body, refusal.session)
      expect(answer.status, `${refusal.what}: ${JSON.stringify(answer.body)}`).toBe(refusal.status)
      expect(String(answer.body['error']), refusal.what).toContain(refusal.says)
      expect(counts(), refusal.what).toEqual(before)
      expect(linesOnTheRun(), refusal.what).toEqual([])
    }
    // A line of exactly the limit is taken, so the limit above is the one refused.
    const atTheLimit = await use({ tool: 'data-copy', said: 'x'.repeat(TOOL_USE_MOST_CHARACTERS) })
    expect(atTheLimit.status, JSON.stringify(atTheLimit.body)).toBe(201)
  })

  it('is the only door that writes data.toolUses: an ordinary write is refused and writes nothing', async () => {
    const first = await use({ tool: 'data-copy', said: 'make: copied the first' })
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const stored = t.api.getRecord(run)
    const patch = async (payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> => {
      const res = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: AGENT, payload })
      return { status: res.statusCode, body: res.json() as Record<string, unknown> }
    }
    const data = stored?.data as Record<string, unknown>
    const forged = [{ at: '2026-09-25 10:00:00', tool: 'data-copy', said: 'a line nobody used' }]
    const attempts: { what: string; payload: Record<string, unknown> }[] = [
      { what: 'a dataPatch that adds a line', payload: { dataPatch: { toolUses: [...linesOnTheRun(), ...forged] } } },
      { what: 'a dataPatch that sends the same lines back', payload: { dataPatch: { toolUses: linesOnTheRun() } } },
      { what: 'a dataPatch that deletes the lines', payload: { dataPatch: { toolUses: null } } },
      { what: 'a data that replaces the lines', payload: { data: { ...data, toolUses: forged } } },
    ]
    for (const attempt of attempts) {
      const before = counts()
      const answer = await patch(attempt.payload)
      expect(answer.status, `${attempt.what}: ${JSON.stringify(answer.body)}`).toBe(403)
      expect(String(answer.body['error']), attempt.what).toBe(ONLY_THE_USE_DOOR_WRITES_TOOL_USES)
      expect(String(answer.body['error']), attempt.what).toContain('POST /api/toolset/uses')
      expect(counts(), attempt.what).toEqual(before)
      expect(t.api.getRecord(run)?.data, attempt.what).toEqual(stored?.data)
      expect(linesOnTheRun().map((line) => line.said), attempt.what).toEqual(['make: copied the first'])
    }

    // A RUN FILED WITH USE LINES is refused too, and no record is created.
    const before = counts()
    const filed = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AGENT,
      payload: { kind: 'session', title: 'A run with lines nobody wrote', data: { state: 'running', toolUses: forged } },
    })
    expect(filed.statusCode, filed.body).toBe(403)
    expect(String((filed.json() as Record<string, unknown>)['error'])).toBe(ONLY_THE_USE_DOOR_WRITES_TOOL_USES)
    expect(counts()).toEqual(before)

    // AN ORDINARY PATCH OF ANOTHER FIELD still passes, and the lines stay as they were.
    const doing = await patch({ dataPatch: { doing: 'Copying the database' } })
    expect(doing.status, JSON.stringify(doing.body)).toBe(200)
    expect(linesOnTheRun().map((line) => line.said)).toEqual(['make: copied the first'])

    // AND THE DOOR STILL APPENDS.
    const second = await use({ tool: 'data-copy', said: 'open: unpacked the copy' })
    expect(second.status, JSON.stringify(second.body)).toBe(201)
    expect(linesOnTheRun().map((line) => line.said)).toEqual(['make: copied the first', 'open: unpacked the copy'])
  })
})
