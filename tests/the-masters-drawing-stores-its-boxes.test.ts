// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MASTER PIPELINE'S DRAWING HAS A NODE FOR EVERY BOX OF THE BIG MAP, SO ITS LANES CAN PLACE THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The master's Boxes level draws the boxes of the big map: the steps of the pipelines hung `part_of` on
 * the master's steps. Its stored lanes are meant to place them. But the presentation store checked a
 * block against the pipeline whose drawing it is, so every box on the master's drawing was refused as
 * "a block of another pipeline", and no lane could hold one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, in an empty test office with a made-up master of two steps, a block pipeline hung on
 * each step, and one pipeline hung on nothing
 * ---------------------------------------------------------------------------------------
 *
 *   1. on the master's drawing a box is a node: a whole write puts it in a lane, a one-node write stores
 *      another, and the read honours both;
 *   2. a block pipeline's own drawing still refuses a box of another block pipeline, with today's words;
 *   3. the master's drawing still refuses a block that is neither its own nor a box, with today's words;
 *   4. with no master marked, the master's old drawing refuses the box again.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Each in src/server/lib/presentation.ts, copied first and restored with cp and checked with cmp:
 *   read no boxes at all → case 1 goes red.
 *   read the master's boxes on every pipeline's drawing, not only the master's → case 2 goes red.
 *   leave the read's check of a stored node as it was → case 1 goes red: the box is reported as no longer
 *     one of this pipeline's blocks.
 *   read the boxes hung on whichever pipeline's drawing it is, marked or not → case 4 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LANE_ARRANGEMENTS, pipelineScope, type NodeIntent, type ScopeIntent } from '../src/shared/presentation.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { freshDb, type TestDb } from './helpers.ts'

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** What GET /api/presentation/:scope answers, the parts read here. */
interface Stored {
  intent: ScopeIntent
  report: { honoured: string[]; unhonoured: { target: string; reason: string }[] }
}

describe("the master pipeline's drawing and the boxes of the big map", () => {
  let t: TestDb
  let app: FastifyInstance
  let mark: (pipeline: string | null) => unknown
  const id: Record<string, string> = {}

  beforeEach(async () => {
    t = await freshDb()
    const Fastify = (await import('fastify')).default
    const { installErrorHandling } = await import('../src/server/lib/http.ts')
    const { presentationRoutes } = await import('../src/server/api/presentation.ts')
    const { markTheMasterPipeline } = await import('../src/server/lib/master-pipeline.ts')
    app = Fastify({ logger: false })
    installErrorHandling(app)
    await app.register(presentationRoutes, { prefix: '/api' })
    await app.ready()
    mark = (pipeline) => markTheMasterPipeline('default', pipeline)

    const pipeline = (name: string) =>
      (id[name] = t.api.createRecord({
        kind: 'pipeline',
        title: `Made-up pipeline ${name}`,
        workspaceId: 'default',
        origin: 'fixture',
        actor: t.api.HUMAN,
        data: { blockIds: [] },
      }).id)
    const step = (of: string, name: string) =>
      (id[name] = t.blocks.addBlock(id[of]!, { name: `made-up step ${name}`, state: 'done' }, t.api.HUMAN).block.id)
    const hang = (from: string, on: string) => t.api.createLink({ fromId: id[from]!, toId: id[on]!, type: 'part_of', actor: t.api.HUMAN })

    pipeline('master')
    step('master', 'first block')
    step('master', 'second block')
    pipeline('upper')
    hang('upper', 'first block')
    step('upper', 'door')
    pipeline('lower')
    hang('lower', 'second block')
    step('lower', 'store')
    pipeline('loose')
    step('loose', 'stray')
    mark(id['master']!)
  })

  afterEach(async () => {
    await app?.close()
    t?.close()
  })

  function put(scopeOf: string, intent: ScopeIntent | NodeIntent, node?: string) {
    const scope = encodeURIComponent(pipelineScope(id[scopeOf]!))
    return app.inject({
      method: 'PUT',
      url: node === undefined ? `/api/presentation/${scope}` : `/api/presentation/${scope}/nodes/${encodeURIComponent(id[node]!)}`,
      headers: { ...AS_THE_PERSON, 'content-type': 'application/json' },
      payload: { intent },
    })
  }

  async function read(scopeOf: string): Promise<Stored> {
    const said = await app.inject({
      method: 'GET',
      url: `/api/presentation/${encodeURIComponent(pipelineScope(id[scopeOf]!))}`,
      headers: AS_THE_PERSON,
    })
    expect(said.statusCode, said.body.slice(0, 300)).toBe(200)
    return said.json()
  }

  const TODAYS_WORDS = 'is a block of another pipeline, so this drawing has no node for it and nothing was stored'

  it("1. on the master's drawing, a box is a node: its lane is stored and the read honours it", async () => {
    const lanes = [{ name: 'Ways in', arrange: LANE_ARRANGEMENTS[0] }]
    const whole = await put('master', { lanes, nodes: { [id['door']!]: { lane: 'Ways in' }, [id['first block']!]: { order: 1 } } })
    expect(whole.statusCode, whole.body.slice(0, 400)).toBe(200)
    const one = await put('master', { emphasis: 'active' }, 'store')
    expect(one.statusCode, one.body.slice(0, 400)).toBe(200)

    const stored = await read('master')
    expect(stored.intent.lanes, 'the lanes are stored').toEqual(lanes)
    expect(stored.intent.nodes?.[id['door']!], 'the box is in its lane').toEqual({ lane: 'Ways in' })
    expect(stored.intent.nodes?.[id['store']!], 'the other box keeps its one-node write').toEqual({ emphasis: 'active' })
    const unhonoured = stored.report.unhonoured.filter((one) => one.target === id['door'] || one.target === id['store'])
    expect(unhonoured, 'and the read does not call either box a node this drawing lacks').toEqual([])
  })

  it("2. a block pipeline's own drawing still refuses a box of another block pipeline", async () => {
    const said = await put('upper', { emphasis: 'active' }, 'store')
    expect(said.statusCode, said.body.slice(0, 400)).toBe(400)
    expect(said.body, 'with the words it has today').toContain(TODAYS_WORDS)
  })

  it("3. the master's drawing still refuses a block that is neither its own nor a box", async () => {
    const said = await put('master', { emphasis: 'active' }, 'stray')
    expect(said.statusCode, said.body.slice(0, 400)).toBe(400)
    expect(said.body, 'with the words it has today').toContain(TODAYS_WORDS)
  })

  it('4. with no master marked, the same pipeline refuses the box again', async () => {
    mark(null)
    const said = await put('master', { emphasis: 'active' }, 'door')
    expect(said.statusCode, said.body.slice(0, 400)).toBe(400)
    expect(said.body, 'with the words it has today').toContain(TODAYS_WORDS)
  })
})
