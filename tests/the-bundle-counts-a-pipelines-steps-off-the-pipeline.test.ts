// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BUNDLE COUNTS A PIPELINE'S STEPS OFF THE PIPELINE, THROUGH THE READER THE PIPELINE PAGE USES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `xxpYGbmxEDiW`. The bundle's campaign part counted a pipeline's steps by walking the
 * pipeline's links and keeping the ones whose other end is a record of kind `block`. No such link
 * is ever written: a pipeline's steps are the ids in its own `data.blockIds`, and `implements` and
 * `blocks` are the only link types a block carries. So the count was always nought, and every
 * bundle printed "0 of 0 step(s) done" for every pipeline. Measured on the live server on
 * 6 September 2026 against pipeline `q9ILnZPACd95`, which holds 16 blocks, and `2UX1aJCkR_7S`,
 * which holds 6.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE COUNT. Three blocks with one of them done reads "1 of 3 step(s) done".
 *   2. IT IS ONE READER AND NOT A SECOND ONE. The part names `readOnePipelinesBlocks`, which is
 *      `readPipelineBlocks` in shared/blocks.ts with the loading round it — the same reader
 *      `GET /api/records/<pipeline>` answers from, so the bundle and the pipeline page cannot
 *      disagree about how far a pipeline has got. This is asserted by comparing the two answers
 *      rather than by reading the reader's name, because a name is a string and an answer is not.
 *   3. A PIPELINE NOBODY HAS BROKEN DOWN SAYS SO, rather than reading "0 of 0", which claims
 *      somebody wrote the steps down and got nowhere on all of them.
 *   4. AN UNREADABLE STEP IS NAMED, NOT SILENTLY DROPPED FROM THE COUNT. Criterion B3: "What could
 *      not be read is said, not counted as absent. A stored id naming nothing, a deleted block or a
 *      record that is not a block is named and counted." A dangling id in `data.blockIds` — which
 *      reaches the array through an import or a row written before the write door checked it, never
 *      through the route that adds a block — makes the campaign part say how many of the stored
 *      steps could not be read, so the count above is not silently short.
 *
 * Proved by mutation with a control run of this file first: restoring the link-walk in
 * `src/server/lib/continuation.ts` turns cases 1 and 2 red with "0 of 0 step(s) done"; commenting
 * out the "what could not be read" sentence in the same file's campaign reader turns case 4 red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb, writeDataBypassingTheGate } from './helpers.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)
afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

/** A pipeline with an empty order, which is the only way to file one that can be given blocks. */
async function aPipeline(title: string): Promise<string> {
  const made = await post('/api/records', {
    kind: 'pipeline',
    title,
    summary: 'Three steps, one of them finished.',
    data: { blockIds: [] },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** One block, added through the only route that may write a pipeline's order. */
async function aBlock(pipelineId: string, name: string, state: string): Promise<string> {
  const made = await post(`/api/records/${pipelineId}/blocks`, { name, state })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** The campaign part of a bundle, as text. `custom` is the preset that lets one part be asked for. */
async function theCampaignPart(scopeId: string): Promise<string> {
  const preview = await get(`/api/bundles/preview?scope=${scopeId}&preset=custom&slots=campaign`)
  expect(preview.status, JSON.stringify(preview.body)).toBe(200)
  return String(preview.body.text)
}

describe('the bundle says how far a pipeline has got', () => {
  it('counts three blocks with one done as 1 of 3', async () => {
    const pipeline = await aPipeline('Transplant v2')
    await aBlock(pipeline, 'Calibrate the clamp', 'done')
    await aBlock(pipeline, 'Record the transplant set', 'doing')
    await aBlock(pipeline, 'Close and hold', 'todo')

    const text = await theCampaignPart(pipeline)
    // THE HEAD LINE IS A REFERENCE — `title (kind, id) — what it means here` — since criterion B18,
    // so the count is asserted where it now sits rather than against the shape it had before.
    expect(text, 'the bundle counted a pipeline\'s steps as nought').toContain(
      `Transplant v2 (pipeline, ${pipeline}) — 1 of 3 step(s) done`,
    )
  })

  it('agrees with what the pipeline\'s own page is told, block for block', async () => {
    // ONE READER, PROVED BY THE TWO ANSWERS RATHER THAN BY THE READER'S NAME. `GET /api/records/<a
    // pipeline>` answers from `readOnePipelinesBlocks`, and so does the bundle. A second reading
    // that agreed today would be free to disagree tomorrow; these two cannot.
    const pipeline = await aPipeline('Transplant v3')
    await aBlock(pipeline, 'Calibrate the clamp', 'done')
    await aBlock(pipeline, 'Record the transplant set', 'done')
    await aBlock(pipeline, 'Close and hold', 'blocked')
    await aBlock(pipeline, 'Write up what it showed', 'todo')

    const page = await get(`/api/records/${pipeline}`)
    expect(page.status, JSON.stringify(page.body)).toBe(200)
    const blocks = page.body.blocks.blocks as { state: string }[]
    const done = blocks.filter((one) => one.state === 'done').length

    const text = await theCampaignPart(pipeline)
    expect(text).toContain(
      `Transplant v3 (pipeline, ${pipeline}) — ${String(done)} of ${String(blocks.length)} step(s) done`,
    )
    expect(done, 'the fixture must have some done and some not, or the count proves nothing').toBe(2)
    expect(blocks.length).toBe(4)
  })

  it('says nobody has written the steps down, rather than 0 of 0', async () => {
    // "0 of 0 step(s) done" about a pipeline with no steps claims somebody broke the work down and
    // finished none of it. Nobody has broken it down, and that is a different sentence.
    const pipeline = await aPipeline('Transplant v4')
    const text = await theCampaignPart(pipeline)
    const { COPY_SAYS } = await import('../src/server/lib/continuation.ts')
    expect(text).toContain(`Transplant v4 (pipeline, ${pipeline}) — ${COPY_SAYS.noSteps}`)
    expect(text).not.toContain('0 of 0 step(s) done')
  })

  it('names what could not be read, rather than silently dropping it from the count', async () => {
    const pipeline = await aPipeline('Transplant v5')
    const good = await aBlock(pipeline, 'Calibrate the clamp', 'done')
    // A DANGLING ID, the way `readPipelineBlocks`'s own comment says one reaches `blockIds`: through
    // an import or a row written before the write door checked it — never through the route that
    // adds a block, so this is written straight into the table on purpose.
    writeDataBypassingTheGate(t, pipeline, { blockIds: [good, 'NOT-A-REAL-BLOCK-ID'] })

    const text = await theCampaignPart(pipeline)
    expect(text, 'the unreadable id must not be counted as a step').toContain(
      `Transplant v5 (pipeline, ${pipeline}) — 1 of 1 step(s) done`,
    )
    expect(text, 'the campaign part must say a step could not be read, not drop it silently').toContain(
      '1 of the 2 steps this pipeline lists could not be read',
    )

    // AND THE PIPELINE'S OWN PAGE AGREES: this is the same reader, so what it could read is the
    // same one block either way.
    const page = await get(`/api/records/${pipeline}`)
    const blocks = page.body.blocks.blocks as { state: string }[]
    expect(blocks.length, 'the pipeline page must agree with the bundle about what could be read').toBe(1)
  })
})
