// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING A PIPELINE'S SHAPE IN ONE REQUEST.
 *
 * ---------------------------------------------------------------------------------------
 * THE MEASUREMENT THIS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/records/<a pipeline>` answered with `data.blockIds` and nothing else: an ordered array
 * of nanoids. No titles, no states, no order labels. Asking where a pipeline had got to therefore
 * cost one request for the pipeline and one more for every block it holds. Filed in the corpus as
 * problem `Bfrh5gi1SBwI` and re-measured on 2026-08-12 against the campaign's own pipeline, which
 * is ten blocks: eleven requests to answer "which wave is Mole Office in".
 *
 * That last case is why this is worth a test rather than a convenience. The development campaign is
 * recorded AS a pipeline precisely so that an agent arriving with no transcript can ask the product
 * what stage the work is in. An answer of ten opaque ids does not answer it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING CHECKED, AND WHAT DELIBERATELY IS NOT
 * ---------------------------------------------------------------------------------------
 *
 * NOT a new reading of a pipeline. `readPipelineBlocks` in src/shared/blocks.ts is THE reader and
 * says so in its own header: five files once held five readings of one stored step, two of which
 * invented an identity when the id was missing. The route serves that reader's answer. So the
 * assertions below are about the answer REACHING an HTTP caller, and about the three things a
 * derived reading must never blur:
 *
 *   - a pipeline with no blocks and a record that is not a pipeline are different, and the reply
 *     says which by carrying the key or not carrying it;
 *   - a pipeline that stores no `blockIds` KEY is a stub, not an empty pipeline;
 *   - a listed id that cannot be read is REPORTED, never quietly dropped, because a hole in an
 *     ordered list is a fact about the archive.
 *
 * The provenance assertion at the end is not decoration either: an attention row could not say
 * whether a record was fixture or authored, and the first thing a reader meets here is a block.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'
import { pipelinePosition } from '../src/shared/blocks.ts'
import type { PipelineBlockReading } from '../src/shared/blocks.ts'

interface Harness {
  db: TestDb
  app: FastifyInstance
}

async function freshApp(): Promise<Harness> {
  const db = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')

  const app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.ready()
  return { db, app }
}

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  const h = await freshApp()
  t = h.db
  app = h.app
})

afterEach(async () => {
  await app.close()
  t.close()
})

/** The reply body of a record read, as an object. */
async function read(id: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}` })
  expect(res.statusCode).toBe(200)
  const parsed: unknown = JSON.parse(res.body)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`expected a JSON object, got ${res.body.slice(0, 200)}`)
  }
  return parsed as Record<string, unknown>
}

/** The `blocks` key of a record read, insisted upon. */
async function blocksOf(id: string): Promise<PipelineBlockReading> {
  const body = await read(id)
  const blocks = body['blocks']
  if (blocks === undefined) {
    throw new Error(`GET /api/records/${id} carried no "blocks" key; it has ${Object.keys(body).join(', ')}`)
  }
  return blocks as PipelineBlockReading
}

/** A pipeline with three named blocks, in order, and the ids they were given. */
function threeBlockPipeline(): { pipelineId: string; ids: string[] } {
  const pipeline = t.api.createRecord({
    kind: 'pipeline',
    title: 'Close the loop',
    data: { blockIds: [] },
    actor: AGENT,
    workspaceId: 'default',
  })
  const ids = ['Plan the approach', 'Run it', 'Write it up'].map(
    (name, i) =>
      t.blocks.addBlock(pipeline.id, { name, state: i === 0 ? 'done' : i === 1 ? 'doing' : 'todo' }, AGENT).block.id,
  )
  return { pipelineId: pipeline.id, ids }
}

describe('a pipeline answers with its blocks, not with a list of nanoids', () => {
  it('carries every block with its name, title, state and stored order, in one request', async () => {
    const { pipelineId, ids } = threeBlockPipeline()

    const reading = await blocksOf(pipelineId)

    // THE ASSERTION THIS FILE EXISTS FOR. One request, and the reader can say what the pipeline
    // holds and where each part has got to.
    expect(reading.blocks.map((b) => b.name)).toEqual(['Plan the approach', 'Run it', 'Write it up'])
    expect(reading.blocks.map((b) => b.state)).toEqual(['done', 'doing', 'todo'])
    // In the pipeline's OWN stored order, which is the fact `blockIds` exists to hold — not the
    // order the rows happen to come back in.
    expect(reading.blocks.map((b) => b.id)).toEqual(ids)
    // And the title, which since a decision is the block's own name and nothing
    // else.
    expect(reading.blocks.map((b) => b.title)).toEqual(['Plan the approach', 'Run it', 'Write it up'])
    expect(reading.storedIds).toBe(3)
    expect(reading.undeclared).toBe(false)
    expect(reading.problems).toEqual([])
  })

  it('answers "where has this got to" from the one reply, with no second request', async () => {
    const { pipelineId } = threeBlockPipeline()

    const reading = await blocksOf(pipelineId)

    // `pipelinePosition` is the product's own answer to that question and it takes the blocks. If
    // the reply carries them, the caller runs it; before this, the caller had three more requests
    // to make before it could.
    const at = pipelinePosition(reading.blocks)
    expect(at?.name).toBe('Run it')
  })

  it('reports a listed block it cannot read rather than dropping it out of the order', async () => {
    // THE HOLE IS PLANTED IN THE ROW, and that is the only honest way in, because every write path
    // now refuses to make one. `checkBlockIds` runs on create and on patch; deleting a listed block
    // is refused and sends you to `DELETE /api/records/:id/blocks/:blockId`, which removes it from
    // that pipeline's order. In the same transaction it deletes the block only if no other live
    // pipeline lists it; otherwise it stays live and the answer says `deleted` and `stillListedBy`.
    //
    // A STORED HOLE IS STILL REACHABLE, which is why the reading has to report one. Two ways, both
    // real: rows written before the create-side check existed — the live corpus has them, because
    // `POST /api/records` answered 201 to four ids nothing held until 2026-08-12 — and an import,
    // which restores rows rather than replaying the write path and calls `checkBlockIds` nowhere.
    const notABlock = t.api.createRecord({
      kind: 'module',
      title: 'A module somebody listed as a block',
      data: {},
      actor: AGENT,
      workspaceId: 'default',
    })
    const pipeline = t.api.createRecord({
      kind: 'pipeline',
      title: 'Holes in the order',
      data: { blockIds: [] },
      actor: AGENT,
      workspaceId: 'default',
    })
    const real = t.blocks.addBlock(pipeline.id, { name: 'The one real block', state: 'doing' }, AGENT).block
    t.client.sqlite
      .prepare('update records set data = ? where id = ?')
      .run(JSON.stringify({ blockIds: ['a-block-id-nothing-answers-to', notABlock.id, real.id] }), pipeline.id)

    const reading = await blocksOf(pipeline.id)

    // One readable block and TWO named holes, each at its stored position. A reply of one block
    // with no problems would say this pipeline has one step, which is a different pipeline.
    expect(reading.blocks.map((b) => b.id)).toEqual([real.id])
    expect(reading.storedIds).toBe(3)
    expect(reading.problems.map((p) => p.at)).toEqual([1, 2])
    expect(reading.problems.map((p) => p.blockId)).toEqual(['a-block-id-nothing-answers-to', notABlock.id])
  })

  it('tells a pipeline nobody has written blocks into from one that has none', async () => {
    // A stub: created without the key at all.
    const stub = t.api.createRecord({
      kind: 'pipeline',
      title: 'Not written down yet',
      data: {},
      actor: AGENT,
      workspaceId: 'default',
    })
    // Declared, and empty on purpose.
    const empty = t.api.createRecord({
      kind: 'pipeline',
      title: 'Deliberately empty',
      data: { blockIds: [] },
      actor: AGENT,
      workspaceId: 'default',
    })

    const stubReading = await blocksOf(stub.id)
    const emptyReading = await blocksOf(empty.id)

    expect(stubReading.undeclared).toBe(true)
    expect(emptyReading.undeclared).toBe(false)
    // Both hold no blocks, and they are not the same answer: one says nobody has said, the other
    // says somebody said none. That is rule 5, on the one key that can carry it.
    expect(stubReading.blocks).toEqual([])
    expect(emptyReading.blocks).toEqual([])
  })

  it('leaves the key off a record that is not a pipeline, rather than sending an empty reading', async () => {
    const module = t.api.createRecord({
      kind: 'module',
      title: 'A module, which holds no blocks',
      data: {},
      actor: AGENT,
      workspaceId: 'default',
    })

    const body = await read(module.id)

    // ABSENT, not `{blocks: [], problems: [], storedIds: 0, undeclared: true}`. An empty reading on
    // a module would be an answer to a question nobody asked, and `undeclared: true` on it would
    // read as a module that has not written its blocks down.
    expect(body).not.toHaveProperty('blocks')
  })

  it('names every stored entry that is not a readable block, at its stored position', async () => {
    // FOUND BY AN AGENT ASKED TO BREAK THIS, hours after it shipped. It imported an archive holding
    // a mixed order and measured what came back: six entries stored, `storedIds: 4`, three blocks
    // and ONE problem. The number and the empty string were named nowhere, and the id that names
    // nothing — stored third — was reported at position two, because every position was counted
    // over an array that had already had the unusable entries filtered out of it.
    //
    // So a five-step pipeline read as three steps and one hole, and the hole was in the wrong place.
    const pipeline = t.api.createRecord({
      kind: 'pipeline',
      title: 'An order with everything wrong in it',
      data: { blockIds: [] },
      actor: AGENT,
      workspaceId: 'default',
    })
    const real = t.blocks.addBlock(pipeline.id, { name: 'The one real block', state: 'doing' }, AGENT).block
    t.client.sqlite
      .prepare('update records set data = ? where id = ?')
      .run(
        JSON.stringify({ blockIds: [real.id, 99999, 'names-nothing', '', real.id, null] }),
        pipeline.id,
      )

    const reading = await blocksOf(pipeline.id)

    // Six entries stored, and the reading says six.
    expect(reading.storedIds).toBe(6)
    expect(reading.blocks.map((b) => b.id)).toEqual([real.id])
    // Five holes, each at the position it is really at — 2 through 6.
    expect(reading.problems.map((p) => p.at)).toEqual([2, 3, 4, 5, 6])
    expect(reading.problems[0]?.problem).toContain('99999')
    expect(reading.problems[1]?.blockId).toBe('names-nothing')
    // The repeat is named as a repeat and says where the first one is, rather than being drawn as a
    // second live step carrying the same key.
    expect(reading.problems[3]?.problem).toContain('already at position 1')
  })

  it('tells a stored blockIds that is not an array from a pipeline nobody has written yet', async () => {
    // `undeclared` is the one key that separates "nobody has said" from "somebody said none", and it
    // tested `Array.isArray` — so a `blockIds` holding a bare string answered `undeclared: true`,
    // which is that distinction said backwards about a pipeline that stores a value.
    const pipeline = t.api.createRecord({
      kind: 'pipeline',
      title: 'A pipeline whose order is a string',
      data: { blockIds: [] },
      actor: AGENT,
      workspaceId: 'default',
    })
    t.client.sqlite
      .prepare('update records set data = ? where id = ?')
      .run(JSON.stringify({ blockIds: 'omSaZ8GnA6Si' }), pipeline.id)

    const reading = await blocksOf(pipeline.id)

    expect(reading.undeclared).toBe(false)
    expect(reading.blocks).toEqual([])
    expect(reading.storedIds).toBe(0)
  })

  it('carries each block record whole, so its provenance travels with it', async () => {
    const { pipelineId } = threeBlockPipeline()

    const reading = await blocksOf(pipelineId)

    // The block is the first thing a reader of a pipeline meets. `origin` says how the row entered
    // the corpus — `authored` for real work, `fixture` for the generated seed — and it is never
    // inferred. A derived row that drops it is how a fabricated record reads as a real one.
    for (const block of reading.blocks) {
      expect(block.record.origin).toBe('authored')
    }
  })
})
