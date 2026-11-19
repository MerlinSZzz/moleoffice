// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A `feeds` LINK IS WRITTEN AT THE LINK DOOR, BETWEEN TWO STEPS ONLY, AND ONLY IT MAY SAY WHAT MOVES. Wave 13u round
 * 216, package BV: the big map draws the stored step links, and until now
 * nothing but a test could write one.
 *
 * WHAT THIS FILE PROVES, in its own empty office, through POST /api/links:
 *   1. a `feeds` link between two blocks is written with what moves, and the pipeline's own reader reads it back as a
 *      move out of the first step, in the writer's words;
 *   2. a `feeds` link with a module at one end is refused, and nothing is written;
 *   3. `carries` on any other link type is refused, and so are an empty list and a far end named by its title;
 *   4. the same link again answers with the same id, with the same `carries` or with none, and a different `carries`
 *      is refused 409 and leaves the stored words as they were.
 *
 * WHERE THE RULES LIVE: `checkLinkKinds` and `createLink` in src/server/lib/records.ts, and the body's shape in
 * src/server/api/links.ts.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp:
 *   1. in `checkLinkKinds`, delete the `feeds` rule: case 2 goes red;
 *   2. in `createLink`, drop the refusal of `carries` on a link that is not `feeds`: case 3 goes red;
 *   3. in `createLink`, answer a stored link's id whatever `carries` says: case 4 goes red;
 *   4. in `createLink`, leave `carries` out of the insert: case 1 goes red, and case 4, which sends the same words
 *      again to the stored link, is refused 409.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BlockLinkRow } from '../src/shared/blocks.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function link(payload: object) {
  return app.inject({ method: 'POST', url: '/api/links', headers: AS_THE_PERSON, payload })
}

/** How many links of this type are stored between these two records. */
function stored(fromId: string, toId: string, type: string): { id: string; carries: string | null }[] {
  return t.client.sqlite
    .prepare('SELECT id, carries FROM links WHERE from_id = ? AND to_id = ? AND type = ?')
    .all(fromId, toId, type) as { id: string; carries: string | null }[]
}

// One made-up pipeline of three steps, and one made-up module.
let pipeline: string
let steps: string[]
let aModule: string
const WHAT_MOVES = [{ out: 'made-up frames', in: 'images' }]

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  pipeline = t.api.createRecord({ kind: 'pipeline', title: 'A made-up pipeline', workspaceId: 'default', origin: 'fixture', actor: t.api.HUMAN, data: { blockIds: [] } }).id
  steps = ['First made-up step', 'Second made-up step', 'Third made-up step'].map(
    (name) => t.blocks.addBlock(pipeline, { name, state: 'todo' }, t.api.HUMAN).block.id,
  )
  aModule = t.api.createRecord({ kind: 'module', title: 'A made-up module', workspaceId: 'default', origin: 'fixture', actor: t.api.HUMAN, data: {} }).id
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a feeds link', () => {
  it('1. is written between two steps with what moves, and the pipeline reads it as a move', async () => {
    const written = await link({ fromId: steps[0], toId: steps[1], type: 'feeds', carries: WHAT_MOVES })
    expect(written.statusCode, written.body.slice(0, 300)).toBe(201)
    expect(stored(steps[0]!, steps[1]!, 'feeds')).toEqual([{ id: written.json().id, carries: JSON.stringify(WHAT_MOVES) }])
    const { readPipelineBlocks } = await import('../src/shared/blocks.ts')
    const records = t.api.listRecords({ workspaceId: 'default' })
    const rows = (
      t.client.sqlite
        .prepare('SELECT id, from_id AS fromId, to_id AS toId, type, gate, gate_up_to AS upTo, carries, inferred FROM links')
        .all() as (Omit<BlockLinkRow, 'inferred'> & { inferred: number })[]
    ).map((row): BlockLinkRow => ({ ...row, inferred: row.inferred === 1 }))
    const view = readPipelineBlocks(records.find((one) => one.id === pipeline)!, records, rows)
    expect(view.blocks.find((one) => one.id === steps[0])?.moves).toEqual([{ blockId: steps[1], linkId: written.json().id, carries: WHAT_MOVES }])
  })

  it('2. with a module at one end is refused, and nothing is written', async () => {
    const refused = await link({ fromId: aModule, toId: steps[2], type: 'feeds' })
    expect(refused.statusCode).toBe(400)
    expect(refused.json().error).toContain('It joins two blocks and nothing else')
    expect(stored(aModule, steps[2]!, 'feeds')).toEqual([])
  })

  it('3. carries is refused on another type, empty, or with a far end named by its title', async () => {
    const onBlocks = await link({ fromId: steps[1], toId: steps[2], type: 'blocks', carries: WHAT_MOVES })
    expect(onBlocks.statusCode).toBe(400)
    expect(onBlocks.json().error).toContain('Only a "feeds" link may carry')
    expect(stored(steps[1]!, steps[2]!, 'blocks')).toEqual([])
    const empty = await link({ fromId: steps[1], toId: steps[2], type: 'feeds', carries: [] })
    expect(empty.statusCode).toBe(400)
    const byTitle = await link({ fromId: steps[1], toTitle: 'Third made-up step', type: 'feeds', carries: WHAT_MOVES })
    expect(byTitle.statusCode).toBe(400)
    expect(stored(steps[1]!, steps[2]!, 'feeds')).toEqual([])
  })

  it('4. again answers the same id, and different words for what moves are refused 409', async () => {
    const first = stored(steps[0]!, steps[1]!, 'feeds')
    for (const payload of [{ carries: WHAT_MOVES }, {}]) {
      const again = await link({ fromId: steps[0], toId: steps[1], type: 'feeds', ...payload })
      expect(again.statusCode, again.body.slice(0, 300)).toBe(201)
      expect(again.json().id).toBe(first[0]!.id)
    }
    const other = await link({ fromId: steps[0], toId: steps[1], type: 'feeds', carries: [{ out: 'made-up masks' }] })
    expect(other.statusCode).toBe(409)
    expect(stored(steps[0]!, steps[1]!, 'feeds')).toEqual(first)
  })
})
