// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RELEASE FILES THE FAULTS IT LISTS AS ONE TASK FOR THE LINE'S SUPERVISOR.
 *
 * A decision says a fault of form in a record, and a test that
 * copies a value the code defines, do not stop a landing: the check lists them for after the landing
 * instead of refusing. The release already carries that list in its check sentence, which is
 * lost as soon as the worker is released. So the release also stores the list on itself and files one
 * office record for the run's line, whose holder is the line's supervisor. The line's next round reads
 * it first and closes it when the faults are patched.
 *
 * WHAT IS PROVED:
 *
 *   1. A release that lists faults stores both lists on `released.listed`, files one task whose holder
 *      is the line's supervisor, whose state is todo, whose summary carries both lists in the check's
 *      own words, and links the task `about` the released run.
 *   2. A release that lists nothing stores no list and files no task, so an ordinary release leaves no
 *      work behind.
 *
 * Nothing here opens ./data/panelx.db: `freshDb` makes a throwaway database.
 */

import { execFileSync } from 'node:child_process'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { theListedFaultsSay } from '../src/config/verdict-kinds.mjs'
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

async function aReleasedVerdict(run: string, listed?: { nextRound: string[]; afterLanding: string[] }): Promise<void> {
  // THE CHECK IS ASSEMBLED BEFORE ITS VERDICT, as every check's is.
  const assembled = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}/assembled`,
    headers: asAgent('inspector-l'),
    payload: { changes: [] },
  })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}`,
    headers: asAgent('inspector-l'),
    payload: {
      verdict: 'released',
      check: 'Test: a synthetic check; no model judged work.',
      chaptersRead: ['5:full'],
      ...(listed === undefined ? {} : { listed }),
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as
    | { id: string }
    | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

function releasedOf(run: string): Record<string, unknown> | null {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string } | undefined
  if (row === undefined) return null
  const data = JSON.parse(row.data) as Record<string, unknown>
  return (data['released'] as Record<string, unknown> | undefined) ?? null
}

function tasks(): { id: string; title: string; summary: string | null; data: Record<string, unknown> }[] {
  const rows = t.client.sqlite
    .prepare("SELECT id, title, summary, data FROM records WHERE kind = 'task' AND deleted_at IS NULL ORDER BY rowid")
    .all() as { id: string; title: string; summary: string | null; data: string }[]
  return rows.map((row) => ({ id: row.id, title: row.title, summary: row.summary, data: JSON.parse(row.data) as Record<string, unknown> }))
}

beforeAll(async () => {
  t = await freshDb()
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  await register('inspector-l', 'inspector')
  await register('supervises-s', 'supervisor')
  await register('works-w', 'worker', asAgent('supervises-s'))
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a release files the faults it lists', () => {
  it('stores both lists on the release and files one task for the line’s supervisor', async () => {
    const run = aRunOf('works-w', 'works-w, a run with faults to patch after landing')
    const listed = {
      nextRound: ['A test must read its value from the code, not write it out a second time.'],
      afterLanding: ['A report needs its short forms, filed in the run that filed it.'],
    }

    await aReleasedVerdict(run, listed)

    expect(releasedOf(run)!['listed']).toEqual(listed)

    const filed = tasks()
    expect(filed).toHaveLength(1)
    const task = filed[0]!
    expect(task.data['holder']).toEqual({ kind: 'agent', id: idOf('supervises-s') })
    expect(task.data['state']).toBe('todo')
    // THE SUMMARY'S LIST IS BUILT BY THE ONE DECLARATION THAT WRITES IT, not copied here: the headings and
    // their order are src/config/verdict-kinds.mjs's, so a change there shows in this case without an edit.
    expect(task.summary).toContain(theListedFaultsSay(listed.nextRound, listed.afterLanding))

    const link = t.client.sqlite
      .prepare("SELECT to_id FROM links WHERE from_id = ? AND type = 'about'")
      .get(task.id) as { to_id: string } | undefined
    expect(link?.to_id).toBe(run)
  })

  it('files no task and stores no list when the release lists nothing', async () => {
    const before = tasks().length
    const run = aRunOf('works-w', 'works-w, an ordinary run with nothing listed')

    await aReleasedVerdict(run)

    expect(releasedOf(run)).not.toHaveProperty('listed')
    expect(tasks()).toHaveLength(before)
  })
})
