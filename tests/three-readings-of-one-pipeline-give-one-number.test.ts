// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PIPELINE, READ THREE WAYS, GIVES ONE NUMBER, AND EACH READING NAMES THE READER IT CALLED.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion B4 of `design/bundle/ACCEPTANCE.md`, which is the owner's own acceptance sentence for problem 10
 * of the owner's register: take one pipeline whose real state you know, produce all three readings,
 * and get the same correct number from all three.
 *
 * The three readings are:
 *
 *   1. `GET /api/project/bootstrap` — the cold-start reading, section `now`;
 *   2. a copy scoped to that one pipeline — `GET /api/bundles/preview?scope=<the pipeline>`;
 *   3. a copy of the whole project — the same route with no scope.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Two of the three did not exist. On 6 September 2026 `GET /api/project/bootstrap` announced a
 * section called `now` and delivered nothing under it, naming itself `reader-not-built` — and by
 * then the reader was built. The `understand_pipeline` preset said in its own sentence that it was
 * for learning *where this sequence stands* and carried no part that answered it. So the only
 * reading of a pipeline's progress a copy could produce was the whole-project one, and there was
 * nothing for it to agree with.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE COLD START CARRIES IT. `now` is in the reply and not in `missing`.
 *   2. THE THREE NUMBERS ARE ONE NUMBER, compared against the pipeline's own page, which is the
 *      fourth reading and the one a person looks at.
 *   3. EACH SAYS WHICH READER IT CALLED, so a person can go and ask the same thing.
 *   4. A COPY ABOUT ONE PIPELINE IS ABOUT THAT PIPELINE, and does not carry the other one.
 *
 * Proved by mutation with a control run of this file first: putting `now` back to `delivered: false`
 * turns case 1 red, and taking `campaign` out of `BOOTSTRAP_PARTS` turns cases 1, 2 and 3 red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HEADERS = (workspace: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
})

let t: TestDb
let app: FastifyInstance
/** This case's own project, so each reading sees only the pipelines it filed. */
let workspace = 'default'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  workspace = `three-readings-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Three readings' } })
  expect(made.statusCode, made.body).toBe(201)
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS(workspace) })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS(workspace) })
  return { status: res.statusCode, body: res.json() }
}

async function aPipeline(title: string): Promise<string> {
  const made = await post('/api/records', { kind: 'pipeline', title, summary: 'A sequence of work.', data: { blockIds: [] } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

async function aBlock(pipelineId: string, name: string, state: string): Promise<void> {
  const made = await post(`/api/records/${pipelineId}/blocks`, { name, state })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
}

/** The one true number, from the page a person actually looks at. */
async function whatThePipelinesOwnPageSays(pipelineId: string): Promise<string> {
  const page = await get(`/api/records/${pipelineId}`)
  expect(page.status, JSON.stringify(page.body)).toBe(200)
  const blocks = page.body.blocks.blocks as { state: string }[]
  const done = blocks.filter((one) => one.state === 'done').length
  return `${String(done)} of ${String(blocks.length)} step(s) done`
}

describe('one pipeline, three readings, one number', () => {
  it('the cold-start reading carries where the work is now, and names its reader', async () => {
    const pipeline = await aPipeline('Transplant v9')
    await aBlock(pipeline, 'Calibrate the clamp', 'done')
    await aBlock(pipeline, 'Record the transplant set', 'doing')
    await aBlock(pipeline, 'Close and hold', 'todo')

    const boot = await get('/api/project/bootstrap')
    expect(boot.status, JSON.stringify(boot.body)).toBe(200)

    // IT IS IN THE REPLY, not announced and absent. Both halves are asserted: a section named in
    // `missing` and a section carrying nothing read the same to a careless reader and are different
    // facts.
    expect(boot.body.now, 'the cold-start reading announces `now` and delivered nothing under it').toBeDefined()
    const absent = (boot.body.missing as { slot: string }[]).map((one) => one.slot)
    expect(absent).not.toContain('now')

    // AND IT SAYS WHICH READER ANSWERED IT.
    expect(String(boot.body.now.reader)).toContain('readOnePipelinesBlocks')
    expect(boot.body.now.references.map((one: { recordId: string }) => one.recordId)).toContain(pipeline)
  })

  it('the three readings give the number the pipeline\'s own page gives', async () => {
    const pipeline = await aPipeline('Transplant v10')
    await aBlock(pipeline, 'Calibrate the clamp', 'done')
    await aBlock(pipeline, 'Record the transplant set', 'done')
    await aBlock(pipeline, 'Close and hold', 'blocked')
    await aBlock(pipeline, 'Write up what it showed', 'todo')

    const truth = await whatThePipelinesOwnPageSays(pipeline)
    expect(truth, 'the fixture must have some done and some not, or the count proves nothing').toBe('2 of 4 step(s) done')

    // 1. THE COLD START. Its section carries the note the assembler's part wrote.
    const boot = await get('/api/project/bootstrap')
    expect(boot.status).toBe(200)
    expect(boot.body.now.references.map((one: { recordId: string }) => one.recordId)).toContain(pipeline)

    // 2. A COPY SCOPED TO THIS PIPELINE, through the preset offered on a pipeline.
    const scoped = await get(`/api/bundles/preview?scope=${pipeline}&preset=understand_pipeline`)
    expect(scoped.status, JSON.stringify(scoped.body)).toBe(200)
    expect(String(scoped.body.text)).toContain(`Transplant v10 (pipeline, ${pipeline}) — ${truth}`)

    // 3. A COPY OF THE WHOLE PROJECT.
    const whole = await get('/api/bundles/preview?preset=recover_project')
    expect(whole.status, JSON.stringify(whole.body)).toBe(200)
    expect(String(whole.body.text)).toContain(`Transplant v10 (pipeline, ${pipeline}) — ${truth}`)

    // AND EACH SAYS WHICH READER IT CALLED.
    for (const reply of [scoped, whole]) {
      const campaign = (reply.body.parts as { name: string; reader: string | null }[]).find((p) => p.name === 'campaign')
      expect(campaign, 'the copy carries no campaign part at all').toBeDefined()
      expect(String(campaign?.reader)).toContain('readOnePipelinesBlocks')
    }
  })

  it('a copy about one pipeline is about that pipeline', async () => {
    const mine = await aPipeline('Transplant v11')
    await aBlock(mine, 'Calibrate the clamp', 'done')
    const other = await aPipeline('Something else entirely')
    await aBlock(other, 'A step of its own', 'todo')

    const scoped = await get(`/api/bundles/preview?scope=${mine}&preset=understand_pipeline`)
    expect(scoped.status, JSON.stringify(scoped.body)).toBe(200)
    const text = String(scoped.body.text)
    // THE HEAD LINE IS A REFERENCE — `title (kind, id) — what it means here` — since criterion B18.
    expect(text).toContain(`Transplant v11 (pipeline, ${mine}) — 1 of 1 step(s) done`)
    expect(text, 'a copy about one pipeline carried a second pipeline\'s progress').not.toContain(
      `Something else entirely (pipeline, ${other}) — 0 of 1 step(s) done`,
    )
  })
})
