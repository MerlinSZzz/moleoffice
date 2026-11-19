// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW THAT IS RETIRED, NOT REPLACED, IS FOLDED WITH THE REPLACED ONES. Wave 13p round 40b, after check 16F5fvosL6x5
 * refused round 40 on its counts. Two old flows (LvHc59NuPUur and bZl58SvVNBva) were not replaced by a flow: what they
 * did became one line in a brief. A supersedes link needs a flow at its other end, so a flow may carry `retired`.
 *
 * What is proved, against a test office of its own:
 *   1. A flow with a retired mark is stored, left out of the current flows and the general ones, and counted in
 *      `replaced.matched` and in `replaced.retired`. `?replaced=show` hands it back with its mark and no replacer.
 *   2. A retired mark the office cannot read is refused with the code flowRetiredUnreadable and nothing is written:
 *      no why, a day that is not a day, no by, a record that is not there, a record and a file, neither, a line that is
 *      not a line, and a key it does not hold. A mark naming a file and a line is stored.
 *   3. The count, in the shape of the live office on 11 October 2026: a supersedes link inside one project folds the
 *      old flow as surely as one across projects (ArQFRd2-eT57, replaced by iuJlNRTj_ELS in release, link
 *      K4r_d7T3cGr_), and a current flow nobody classified stays with its project's own flows.
 *
 * Three-run proof: node tools/run-named-tests.mjs tests/a-retired-flow-is-folded-with-the-replaced.test.ts
 * The mutations it is proved against are written in the commit that adds it and in the round's report.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'garden', title: 'Garden' })
  createWorkspace({ id: 'kitchen', title: 'Kitchen' })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

const AS = (project: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': project,
})

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object, project = 'default'): Promise<{ status: number; body: Record<string, any> }> {
  const reply = await app.inject({ method, url, headers: AS(project), ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, any> }
}

async function read(url: string): Promise<Record<string, any>> {
  const reply = await ask('GET', url)
  expect(reply.status, JSON.stringify(reply.body)).toBe(200)
  return reply.body
}

function aRecord(title: string, workspaceId = 'default'): string {
  return t.api.createRecord({ kind: 'report', title, data: { blocks: [] }, workspaceId, actor: t.api.HUMAN }).id
}

function aFlow(title: string, workspaceId = 'default', extra: Record<string, unknown> = {}): string {
  const source = aRecord(`Test source of ${title}`, workspaceId)
  return t.api.createRecord({
    kind: 'flow',
    title,
    data: {
      declared_in: 'tools/test-kettle.mjs',
      runs: 'the office itself',
      trigger: `A test trigger for ${title}.`,
      stages: [{ n: 1, does: 'Test stage 1.', evidence: 'A test record.', why: 'Test why 1.', sources: [source] }],
      leaves_behind: 'a served kettle',
      ...extra,
    },
    workspaceId,
    actor: t.api.HUMAN,
  }).id
}

const GENERAL = { applies_to: { scope: 'general', roles: ['secretary'], rung: 2 } }
const supersede = (fromId: string, toId: string, project = 'default') => ask('POST', '/api/links', { fromId, toId, type: 'supersedes' }, project)
const retire = (id: string, retired: unknown, project = 'default') => ask('PATCH', `/api/records/${id}`, { dataPatch: { retired } }, project)
const ids = (rows: { id: string }[]) => rows.map((row) => row.id)

describe('a retired flow, round 40b', () => {
  it('1. stores a retired mark, folds the flow with the replaced ones and counts it apart', async () => {
    const started = await read('/api/flows?projects=all')
    const startedShown = await read('/api/flows?projects=all&replaced=show')
    const line = aRecord('Test: the handle line the owner asked for')
    const current = aFlow('Test: the kitchen brew', 'kitchen')
    const general = aFlow('Test: answering anyone', 'default', GENERAL)
    const handle = aFlow('Test: holding a handle', 'default', GENERAL)
    const mark = { why: 'Test: holding a handle is not a flow.', at: '2026-10-11', by: 'a test', record: line }
    const written = await retire(handle, mark)
    expect(written.status, JSON.stringify(written.body)).toBe(200)
    expect(t.api.getRecord(handle)?.data['retired']).toEqual(mark)

    const every = await read('/api/flows?projects=all')
    const startedFlows = ids(started.flows)
    expect(ids(every.flows).filter((id) => !startedFlows.includes(id)), 'a retired flow is not current').toEqual([current])
    const startedGeneral = ids(started.general.flows)
    expect(ids(every.general.flows).filter((id) => !startedGeneral.includes(id)), 'a retired general flow is retired, not general').toEqual([general])
    expect({
      matched: every.replaced.matched - started.replaced.matched,
      retired: every.replaced.retired - started.replaced.retired,
      flows: every.replaced.flows,
    }, 'counted apart').toEqual({ matched: 1, retired: 1, flows: null })

    const shown = await read('/api/flows?projects=all&replaced=show')
    const startedReplaced = ids(startedShown.replaced.flows)
    const added = shown.replaced.flows.filter((row: any) => !startedReplaced.includes(row.id))
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ id: handle, replacedBy: [], retired: mark })
  })

  it('2. refuses a retired mark it cannot read, and writes nothing', async () => {
    const line = aRecord('Test: the handle line the owner asked for')
    const flow = aFlow('Test: holding a handle')
    const good = { why: 'Test: holding a handle is not a flow.', at: '2026-10-11', by: 'a test' }
    for (const [mark, words] of [
      [{ ...good, why: ' ', record: line }, 'retired.why says in words'],
      [{ ...good, at: '2026-02-30', record: line }, 'retired.at is the day'],
      [{ ...good, by: '', record: line }, 'retired.by says who'],
      [{ ...good, record: 'test-no-record' }, '"test-no-record" is not one'],
      [{ ...good, record: line, file: 'briefs/COMMON.md', line: 12 }, 'not both'],
      [good, 'a record id in record, or a file in file and a line in line'],
      [{ ...good, file: 'briefs/COMMON.md', line: 0 }, 'retired.line is a line number'],
      [{ ...good, record: line, because: 'misspelt' }, 'it does not hold because'],
      ['retired', 'retired must be an object'],
    ] as const) {
      const refused = await retire(flow, mark)
      expect(refused.status, JSON.stringify(mark)).toBe(400)
      expect(refused.body).toMatchObject({ code: 'flowRetiredUnreadable' })
      expect(refused.body['error']).toContain(words)
      expect(refused.body['error']).toContain('Nothing was written.')
      expect(t.api.getRecord(flow)?.data['retired'], 'nothing was written').toBeUndefined()
    }
    const inAFile = { ...good, file: 'briefs/COMMON.md', line: 12 }
    expect((await retire(flow, inAFile)).status).toBe(200)
    expect(t.api.getRecord(flow)?.data['retired']).toEqual(inAFile)
  })

  it('3. counts the live shape: a link inside one project folds as one across projects does, and a flow nobody classified stays current', async () => {
    const started = await read('/api/flows?projects=all')
    const startedShown = await read('/api/flows?projects=all&replaced=show')
    const line = aRecord('Test: the handle line the owner asked for', 'kitchen')
    const general = aFlow('Test: answering anyone', 'default', GENERAL)
    const special = aFlow('Test: changing the running office', 'default', { applies_to: { scope: 'special', roles: ['supervisor'], project: 'default' } })
    const kitchen = aFlow('Test: the kitchen brew', 'kitchen')
    const unclassified = aFlow('Test: a reminder nobody classified')
    const oldAcross = aFlow('Test: the old kitchen answer', 'kitchen')
    const oldInside = aFlow('Test: the old kitchen release', 'kitchen')
    const lark = aFlow('Test: one holds its handle', 'kitchen')
    const wren = aFlow('Test: another holds its handle', 'kitchen')
    expect((await supersede(general, oldAcross)).status, 'a link across projects').toBe(201)
    expect((await supersede(kitchen, oldInside, 'kitchen')).status, 'a link inside one project, as K4r_d7T3cGr_').toBe(201)
    for (const id of [lark, wren]) {
      const written = await retire(id, { why: 'Test: holding a handle is not a flow.', at: '2026-10-11', by: 'a test', record: line }, 'kitchen')
      expect(written.status, JSON.stringify(written.body)).toBe(200)
    }

    const every = await read('/api/flows?projects=all')
    const startedGeneral = ids(started.general.flows)
    expect(ids(every.general.flows).filter((id) => !startedGeneral.includes(id))).toEqual([general])
    const startedFlows = ids(started.flows)
    expect(ids(every.flows).filter((id) => !startedFlows.includes(id)), 'the special flow, the kitchen flow and the one nobody classified').toEqual([unclassified, special, kitchen])
    expect(every.matched + every.general.matched - (started.matched + started.general.matched), 'current').toBe(4)
    expect({
      matched: every.replaced.matched - started.replaced.matched,
      retired: every.replaced.retired - started.replaced.retired,
      flows: every.replaced.flows,
    }, '2 replaced and 2 retired, folded').toEqual({ matched: 4, retired: 2, flows: null })

    const shown = await read('/api/flows?projects=all&replaced=show')
    const startedReplaced = ids(startedShown.replaced.flows)
    const added = shown.replaced.flows.filter((row: any) => !startedReplaced.includes(row.id))
    expect(ids(added)).toEqual([wren, lark, oldAcross, oldInside])
    expect(added.find((row: any) => row.id === oldInside).replacedBy.map((by: any) => by.id)).toEqual([kitchen])
  })
})
