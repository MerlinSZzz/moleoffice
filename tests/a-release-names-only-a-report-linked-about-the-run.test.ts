// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASE NOTICE NAMES ONLY A REPORT LINKED ABOUT THE RELEASED RUN.
 *
 * The bug this test pins (10 November 2026): the notice for run dlXf1MadWlgd carried another
 * run's report. That run's agent had a second run, the released run's seal named no report, and the
 * office's agent-wide fallback handed the starter the newest report the agent wrote. The notice then
 * asked the starter to confirm a report that was not this run's. A person confirming from the notice
 * alone would confirm the wrong thing.
 *
 * WHAT IS PROVED:
 *
 *   1. Two runs of one agent, where only the other run has a report. Releasing the run without one
 *      names no report, says there is none linked about the run, and asks for no confirmation of a
 *      report.
 *   2. A run with a report linked about it still names that report and still asks for its confirmation,
 *      so the fix does not turn a real report into an absence.
 *
 * Nothing here opens ./data/panelx.db: `freshDb` makes a throwaway database.
 */

import { execFileSync } from 'node:child_process'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const TIP = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const AS_THE_OWNER = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-workspace': WORKSPACE,
})

async function register(handle: string, role: string, headers: Record<string, string> = AS_THE_OWNER): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers,
    payload: {
      handle,
      name: handle,
      role,
      chapters: ['5:full'],
      // A secretary registers nothing and is limited by nothing: only a worker carries a work area.
      ...(role === 'worker' ? { workArea: ['src/server/lib'] } : {}),
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** A finished run of `handle`, as the check door reads one. */
function aRunOf(handle: string, title: string): string {
  return historicalSession(t, {
    workspaceId: WORKSPACE,
    kind: 'session',
    title,
    actor: { type: 'agent', id: handle },
    data: { state: 'finished', servingAgent: handle, cutFrom: 'main', tip: TIP, doing: 'building a check' },
  }).id
}

/** A report the worker files and links about the run, in the form a report is filed. */
async function aReportLinkedAbout(run: string, handle: string, title: string): Promise<string> {
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'report',
      title,
      summary: 'Test: a report a synthetic run files; no work was done.',
      data: { date: '2026-11-10', chaptersRead: [5], blocks: [{ id: 'b-1', type: 'text', text: 'Test: nothing.' }] },
    },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  const id = (filed.json() as { record: { id: string } }).record.id
  const linked = await app.inject({
    method: 'POST',
    url: '/api/links',
    headers: asAgent(handle),
    payload: { fromId: id, toId: run, type: 'about' },
  })
  expect(linked.statusCode, linked.body).toBe(201)
  return id
}

async function aReleasedVerdict(run: string): Promise<void> {
  // THE CHECK IS ASSEMBLED BEFORE ITS VERDICT, as every check's is.
  const assembled = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/assembled`,
    headers: asAgent('inspector-r'),
    payload: { changes: [] },
  })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}`,
    headers: asAgent('inspector-r'),
    payload: {
      verdict: 'released',
      check: 'Test: a synthetic check; no model judged work.',
      chaptersRead: ['5:full'],
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The body of the one message about this run to this agent. */
function theBodyTo(run: string, handle: string): string {
  const rows = t.client.sqlite
    .prepare(
      "SELECT data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ? ORDER BY rowid",
    )
    .all(run) as { data: string }[]
  const to = rows
    .map((row) => JSON.parse(row.data) as { body?: string; to?: { id: string }[] })
    .filter((one) => (one.to ?? []).some((who) => who.id === idOf(handle)))
  expect(to, `messages about ${run} to ${handle}`).toHaveLength(1)
  return String(to[0]!.body ?? '')
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as
    | { id: string }
    | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

beforeAll(async () => {
  t = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  await register('inspector-r', 'inspector')
  await register('submits-s', 'secretary')
  await register('hands-h', 'worker', asAgent('submits-s'))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a release notice names only a report linked about the released run', () => {
  it('names no report, and asks for no confirmation, when the run has none of its own', async () => {
    const anotherRun = aRunOf('hands-h', "hands-h, another run's session")
    await aReportLinkedAbout(anotherRun, 'hands-h', "Another run's report")
    const released = aRunOf('hands-h', 'hands-h, the released session')

    await aReleasedVerdict(released)

    const body = theBodyTo(released, 'submits-s')
    expect(body).toContain('no report linked about it')
    expect(body).not.toContain("Another run's report")
    expect(body).not.toContain('It closes when you confirm this report.')
  })

  it('still names the report linked about the run, and asks for its confirmation', async () => {
    const run = aRunOf('hands-h', 'hands-h, a run with its own report')
    await aReportLinkedAbout(run, 'hands-h', 'The report of this run')

    await aReleasedVerdict(run)

    const body = theBodyTo(run, 'submits-s')
    expect(body).toContain('The report of this run')
    expect(body).toContain('It closes when you confirm this report.')
    expect(body).not.toContain('no report linked about it')
  })
})
