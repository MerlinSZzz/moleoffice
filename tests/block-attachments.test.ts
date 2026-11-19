// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * B7: A PROBLEM, A CLAIM, AN IDEA AND A MEASURED TIMING ATTACH TO ONE BLOCK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE IS EVIDENCE OF
 * ---------------------------------------------------------------------------------------
 *
 * This was not unbuilt. It was UNREACHABLE. `links.from_id` and `links.to_id` are foreign keys to
 * `records.id`, and a pipeline step was an object nested inside `pipeline.data.steps[]` — so there
 * was no row to point at. The stages audit measured it with three requests against the real
 * database:
 *
 *     POST /api/links {"toId":"hv2-07"}        -> 404  "Both ends of a link must exist"
 *     POST /api/links {"toId":"step:hv2-07"}   -> 404
 *     POST /api/links {"toId":"g1Q-TqSWqPZH"}  -> 201   ...the whole pipeline
 *
 * The third is the one that hurt: a problem about ONE step had to be filed against the whole
 * pipeline, so the pipeline drawing said "a `blocks` link points at the whole pipeline and cannot
 * name a step, so Mole Office cannot say which one it stops".
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS DRIVEN OVER HTTP AND NOT THROUGH THE LIBRARY
 * ---------------------------------------------------------------------------------------
 *
 * Because the 404 was an HTTP fact. The route is what an agent meets, the route is what returned
 * 404, and a test that called `createLink` directly would be proving something the audit never
 * measured. Every request below goes through `buildApp()`, which is the server the product runs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

/** The pipeline, its blocks, and the four records that attach to one of them. */
let pipelineId: string
let senseThePull: string
let closeAndHold: string

async function post(url: string, body: unknown) {
  return app.inject({ method: 'POST', url, payload: body as object, headers: { 'content-type': 'application/json' } })
}
const bodyOf = (res: { body: string }): Record<string, unknown> => JSON.parse(res.body) as Record<string, unknown>

beforeEach(async () => {
  // The graph model reaches web/api.ts, which reads window.localStorage at module scope to restore
  // who you are acting as. This is the smallest stand-in that lets it load; nothing in it is tested.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  const pipeline = await post('/api/records', { kind: 'pipeline', title: 'Transplant v2', data: { blockIds: [] } })
  pipelineId = String((bodyOf(pipeline)['record'] as Record<string, unknown>)['id'])

  const add = async (name: string, state: string) => {
    const res = await post(`/api/records/${pipelineId}/blocks`, { name, state })
    expect(res.statusCode, res.body).toBe(201)
    return String((bodyOf(res)['record'] as Record<string, unknown>)['id'])
  }
  closeAndHold = await add('Close and hold', 'doing')
  senseThePull = await add('Sense the pull', 'failed')
})

afterEach(async () => {
  await app.close()
  t.close()
})

/** File a record of some kind, and hand back its id. */
async function file(kind: string, title: string, data: Record<string, unknown> = {}): Promise<string> {
  const res = await post('/api/records', { kind, title, data })
  expect(res.statusCode, res.body).toBe(201)
  return String((bodyOf(res)['record'] as Record<string, unknown>)['id'])
}

/** The links `GET /api/records/:id` serves for a record, from both ends. */
async function linksOf(id: string) {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}` })
  expect(res.statusCode, res.body).toBe(200)
  return bodyOf(res)['links'] as { type: string; label: string; isBacklink: boolean; other: { id: string; title: string } }[]
}

describe('what can attach to one block of a pipeline', () => {
  it('a PROBLEM blocks the one block it is about, and not the whole pipeline', async () => {
    const problem = await file('problem', 'The CaP IK lands the end effector 4 mm out', { state: 'open' })

    // THE REQUEST THAT USED TO BE A 404.
    const res = await post('/api/links', { fromId: problem, toId: senseThePull, type: 'blocks', gate: { kind: 'hard' } })
    expect(res.statusCode, res.body).toBe(201)

    const onTheBlock = one(
      (await linksOf(senseThePull)).filter((link) => link.type === 'blocks'),
      'a blocks link on the block',
    )
    expect(onTheBlock.other.title).toBe('The CaP IK lands the end effector 4 mm out')
    expect(onTheBlock.label).toBe('blocked by')

    // AND NOT ON THE PIPELINE, which is the half that makes it worth doing: filing it against the
    // pipeline said that something, somewhere in nine steps, was stopped.
    expect((await linksOf(pipelineId)).filter((link) => link.type === 'blocks')).toEqual([])
  })

  it('a CLAIM measures one block, so what stands behind a result is one step of the work', async () => {
    const claim = await file('claim', 'The gel force estimate lags the pull by 180 ms', {
      state: 'measured',
      numbers: { lag_ms: 180, pressings: 40 },
      method: 'gel depth against the 50 N gauge',
    })
    const res = await post('/api/links', { fromId: claim, toId: senseThePull, type: 'measures' })
    expect(res.statusCode, res.body).toBe(201)

    const measured = one((await linksOf(senseThePull)).filter((link) => link.type === 'measures'), 'a measures link')
    expect(measured.other.title).toContain('180 ms')
  })

  it('an IDEA relates to the block it would change', async () => {
    const idea = await file('idea', 'Close on tactile contact rather than on effort', { state: 'new' })
    const res = await post('/api/links', { fromId: idea, toId: closeAndHold, type: 'relates_to' })
    expect(res.statusCode, res.body).toBe(201)
    expect((await linksOf(closeAndHold)).some((link) => link.other.title.startsWith('Close on tactile'))).toBe(true)
  })

  it('a MEASURED TIMING is stored on the block itself, in the units it was measured in', async () => {
    // The fourth attachment is not a link: what was measured ON this step is a field of the block,
    // and it always was. What changed is that it is now a field of a RECORD with its own history,
    // so "when did this number move" is answerable.
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/records/${pipelineId}/blocks/${closeAndHold}`,
      payload: { measured: 'hold 1.4 s over 6 trials — the 20-trial run has not happened' },
      headers: { 'content-type': 'application/json' },
    })
    expect(res.statusCode, res.body).toBe(200)
    const record = bodyOf(res)['record'] as { data: Record<string, unknown> }
    expect(record.data['measured']).toContain('1.4 s')

    const changes = await app.inject({ method: 'GET', url: `/api/records/${closeAndHold}` })
    const rows = bodyOf(changes)['changes'] as { field: string | null }[]
    expect(rows.map((row) => row.field)).toContain('data.measured')
  })

  it('links to a block by TYPING ITS NAME, which is what a block title now is', async () => {
    // An agent attaches a thing to a block without first looking up an id. A block's title
    // is its own name, so that name is what a caller types — and a
    // name two pipelines both use names two records, which every lookup refuses rather than
    // choosing between.
    const problem = await file('problem', 'The 20-trial hold run has never been done', { state: 'open' })
    const res = await post('/api/links', { fromId: problem, toTitle: 'Close and hold', type: 'blocks' })
    expect(res.statusCode, res.body).toBe(201)
    expect((await linksOf(closeAndHold)).some((link) => link.other.title.startsWith('The 20-trial'))).toBe(true)
  })

  it('still refuses a link to something that does not exist, in the same words as before', async () => {
    // The 404 is not gone — it was never wrong. What changed is that a block is now something that
    // EXISTS, so it stopped being the answer to a request that names one.
    const problem = await file('problem', 'A problem about nothing', { state: 'open' })
    const res = await post('/api/links', { fromId: problem, toId: 'hv2-99', type: 'blocks' })
    expect(res.statusCode).toBe(404)
    expect(String(bodyOf(res)['error'])).toContain('must exist')
  })

  it('puts the attachment on the block’s own card, which used to be hard-coded empty', async () => {
    // `flowGraph` carried `attached: []` on every step node, because nothing could be attached. It
    // is the same `attachmentsFor` a module card uses now, and this is the end-to-end proof of it:
    // the reply the drawing is built from carries the problem on the block.
    const problem = await file('problem', 'The gel lags the pull', { state: 'open' })
    await post('/api/links', { fromId: problem, toId: senseThePull, type: 'blocks', gate: { kind: 'hard' } })

    const model = await import('../src/web/components/graph/model.ts')
    const records = t.api.listRecords({ workspaceId: 'default' })
    const links = model.graphLinks(t.api.allGatedLinks('default'))
    const graph = model.buildStructureGraph({
      records,
      links,
      attention: {
        visible: [],
        remainder: [],
        total: 0,
        remainderByGroup: [],
        remainderNote: null,
        unclassified: [],
        noState: [],
        paused: [],
        machine: [],
        passedOver: [],
        counts: { candidates: 0, selected: 0, visible: 0, remainder: 0, passedOver: 0, deleted: 0 },
      } as never,
      scope: { at: 'pipeline', recordId: pipelineId },
      now: Date.parse('2026-08-10T12:00:00'),
    })
    const node = graph.nodes.find((n) => n.stepId === senseThePull)
    expect(node?.attached.map((a) => a.title)).toEqual(['The gel lags the pull'])
  })
})
