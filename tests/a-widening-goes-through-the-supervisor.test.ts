// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WIDENING GOES THROUGH THE SUPERVISOR AND IS RECORDED — CRITERION P94.
 *
 * Before work starts, the secretary agrees the scope with the supervisor, the supervisor marks out and hands out
 * each work area, and a worker that needs it widened asks the supervisor. The office already lets the owner, the starter and a
 * secretary change an area (P85). This file holds the two things P94 adds to that write: a widening
 * re-validates the WHOLE area under the rule, so an old area moves to the new grain the next time
 * somebody touches it; and the change records which of the three granted it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · an old area holding a file may not be widened by adding a folder: the whole area is judged,
 *     so the stored file is what refuses it;
 *   · the same widening without the old file goes through;
 *   · the change carries the grantor — how, by, when and why — read off the agent's own record.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree.
 *
 *   · judge only the paths a widening adds, instead of the whole area, in `changeWorkArea` in
 *     src/server/lib/participants.ts → the first case goes red, because the stored file is no
 *     longer judged.
 *   · drop the `extra: { … workAreaChange: … }` write in the same function → the third case goes
 *     red, because the record no longer says who granted the widening.
 *
 * src/server/lib/participants.ts was restored byte-identical after each mutation (sha256 before and
 * after).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

let t: TestDb
let app: FastifyInstance

async function ask(
  path: string,
  body: unknown,
  headers: Record<string, string> = AS_THE_PERSON,
  method: 'POST' | 'GET' = 'POST',
): Promise<{ status: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method, url: path, headers, payload: body as Record<string, unknown> })
  return { status: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

/** The agent record this registry row keeps its work area on, read off the participant reply. */
async function recordIdOf(handle: string): Promise<string> {
  const read = await ask(`/api/participants/agent/${handle}`, undefined, AS_THE_PERSON, 'GET')
  expect(read.status, JSON.stringify(read.said)).toBe(200)
  return String((read.said['participant'] as { record: string }).record)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const supervisor = await ask('/api/agents/started', {
    handle: 'p94-sup',
    name: 'P94 supervisor',
    role: 'supervisor',
    runtime: 'claude-code',
    workArea: ['src'],
  })
  expect(supervisor.status, JSON.stringify(supervisor.said)).toBe(201)
  const worker = await ask(
    '/api/agents/started',
    { handle: 'p94-worker', name: 'P94 worker', role: 'worker', runtime: 'claude-code', workArea: ['src/a'] },
    asAgent('p94-sup'),
  )
  expect(worker.status, JSON.stringify(worker.said)).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a widening re-validates the whole area', () => {
  it('refuses a widening that would keep an old file, and accepts the same edge as a folder', async () => {
    // AN OLD AREA WRITTEN STRAIGHT INTO THE REGISTRY, the way every area stored before the rule was
    // written: a file, which the new grain refuses. It is not widened through the door, because the
    // door would have refused it; this is what the corpus already holds.
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title: 'An area stored before the rule',
      data: { handle: 'p94-old', runtime: 'claude-code', state: 'active', workArea: ['src/old.ts'] },
      actor: { type: 'human', id: THE_PERSON },
    })

    const kept = await ask('/api/participants/agent/p94-old/work-area', {
      workArea: ['src/old.ts', 'src/new'],
      because: 'The supervisor widened the scope for the next part of the work.',
    })
    expect(kept.status, JSON.stringify(kept.said)).toBe(400)

    // AND THE WIDENING THAT DROPS THE OLD FILE GOES THROUGH, so the refusal is the file and not the
    // act of widening.
    const dropped = await ask('/api/participants/agent/p94-old/work-area', {
      workArea: ['src/new'],
      because: 'The supervisor moved the whole area to the new grain.',
    })
    expect(dropped.status, JSON.stringify(dropped.said)).toBe(200)
    expect((dropped.said['agent'] as { workArea: string[] }).workArea).toEqual(['src/new'])
  })
})

describe('a widening records who granted it', () => {
  it('carries how, by, when and why on the agent’s own record', async () => {
    const changed = await ask(
      '/api/participants/agent/p94-worker/work-area',
      { workArea: ['src/b'], because: 'The supervisor agreed a wider scope for the next step.' },
      asAgent('p94-sup'),
    )
    expect(changed.status, JSON.stringify(changed.said)).toBe(200)
    const said = changed.said['agent'] as { workArea: string[] }
    expect(said.workArea).toEqual(['src/b'])

    const recordId = await recordIdOf('p94-worker')
    const record = await ask(`/api/records/${recordId}`, undefined, AS_THE_PERSON, 'GET')
    const data = (record.said['record'] as { data: { extra: { workAreaChange: Record<string, unknown> } } }).data
    const mark = data.extra.workAreaChange
    // WHO GRANTED IT IS STORED BY REGISTRY ID, which for an agent registered since the mint is not its handle.
    const sup = await ask('/api/participants/agent/p94-sup', undefined, AS_THE_PERSON, 'GET')
    expect(mark).toMatchObject({
      how: 'a-starter',
      by: { type: 'agent', id: (sup.said['participant'] as { id: string }).id },
      because: 'The supervisor agreed a wider scope for the next step.',
      before: ['src/a'],
      after: ['src/b'],
    })
    expect(Number.isFinite(Date.parse(String(mark['at'])))).toBe(true)
  })

  it('keeps only the last change as a mark, and every one in the record’s revisions', async () => {
    const first = await ask(
      '/api/participants/agent/p94-worker/work-area',
      { workArea: ['src/c'], because: 'The supervisor widened it once.' },
      asAgent('p94-sup'),
    )
    expect(first.status, JSON.stringify(first.said)).toBe(200)
    const recordId = await recordIdOf('p94-worker')
    const before = await ask(`/api/records/${recordId}/revisions`, undefined, AS_THE_PERSON, 'GET')
    const revisionsBefore = Number(before.said['count'])
    const second = await ask(
      '/api/participants/agent/p94-worker/work-area',
      { workArea: ['src/d'], because: 'The supervisor widened it again.' },
      asAgent('p94-sup'),
    )
    expect(second.status, JSON.stringify(second.said)).toBe(200)
    const record = await ask(`/api/records/${recordId}`, undefined, AS_THE_PERSON, 'GET')
    const mark = ((record.said['record'] as { data: { extra: { workAreaChange: Record<string, unknown> } } }).data.extra)
      .workAreaChange
    // THE MARK IS THE LAST ONE ONLY, and the history is the record's own revisions — no second store.
    expect(mark['because']).toBe('The supervisor widened it again.')
    expect(mark['before']).toEqual(['src/c'])
    expect(mark['after']).toEqual(['src/d'])
    const after = await ask(`/api/records/${recordId}/revisions`, undefined, AS_THE_PERSON, 'GET')
    expect(Number(after.said['count'])).toBeGreaterThan(revisionsBefore)
  })
})
