// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COPY CARRIES THE MODULES AND PIPELINES SOMEBODY NAMED, AND SAYS WHAT IT LEFT OUT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion B6 of `design/bundle/ACCEPTANCE.md`. It is the thirteenth name on the owner's own list
 * in register section 9 — *selected Modules and Pipelines* — and the one of the thirteen that was
 * not built. The part that draws them carried every module and every pipeline in the project and
 * there was no way to say *these two*.
 *
 * This is built rather than dropped because what a copy contains is a different axis from how detailed
 * it is.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. NAMING TWO CARRIES TWO. The other modules are not in the text.
 *   2. WHAT WAS LEFT OUT IS SAID, AND BY KIND, and it says the size of the copy had nothing to do
 *      with it — which is the difference between the reader's cut and the budget's.
 *   3. NAMING NONE OF THEM IS REFUSED, not read as "all of them". The two are opposite requests and
 *      an empty list is the one nobody means.
 *   4. AN ID THAT NAMES NO MODULE AND NO PIPELINE IS REFUSED BY NAME, rather than a copy carrying
 *      the four of five it could find and reporting success.
 *   5. A LIST SENT TO A COPY WITH NO SUCH PART IS REFUSED, for the reason a list of parts sent
 *      beside the wrong preset is: it would be ignored and the reply would still echo it.
 *   6. SAYING NOTHING STILL CARRIES ALL OF THEM.
 *
 * Proved by mutation with a control run of this file first: making the reader ignore
 * `ask.modulesAndPipelines` turns cases 1, 2 and 6 red; deleting the refusal in `resolveBundle`
 * turns cases 3, 4 and 5 red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { BUNDLE_RUNGS } from '../src/shared/bundles.ts'

const HEADERS = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance
/** Each case works in its own project, so the copy it reads carries only the records it filed. */
let caseNumber = 0
let workspaces: typeof import('../src/server/lib/workspaces.ts')

beforeAll(async () => {
  t = await freshDb()
  // The app's own module instance, imported after `freshDb` resets the module registry.
  workspaces = await import('../src/server/lib/workspaces.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  const here = `copy-named-case-${String(caseNumber)}`
  workspaces.createWorkspace({ id: here, title: `Copy case ${String(caseNumber)}` })
  HEADERS['x-mole-office-workspace'] = here
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: HEADERS })
  return { status: res.statusCode, body: res.json() }
}

async function aModule(title: string): Promise<string> {
  const made = await post('/api/records', { kind: 'module', title, summary: 'What this subsystem is for.' })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

async function aPipeline(title: string): Promise<string> {
  const made = await post('/api/records', { kind: 'pipeline', title, summary: 'A sequence of work.', data: { blockIds: [] } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

/** The part that draws the modules and the pipelines, on its own. */
function ask(named?: readonly string[]): string {
  return (
    '/api/bundles/preview?preset=custom&slots=structure' +
    (named === undefined ? '' : `&modulesAndPipelines=${named.join(',')}`)
  )
}

describe('a copy carries the modules and pipelines somebody named', () => {
  it('carries the two that were named and not the other two', async () => {
    const gripper = await aModule('The gripper')
    const vision = await aModule('The vision stack')
    await aModule('The logging shim')
    await aPipeline('Transplant v12')

    const reply = await get(ask([gripper, vision]))
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    const text = String(reply.body.text)
    expect(text).toContain('The gripper')
    expect(text).toContain('The vision stack')
    expect(text, 'a copy carried a module nobody named').not.toContain('The logging shim')
    expect(text, 'a copy carried a pipeline nobody named').not.toContain('Transplant v12')
  })

  it('says how many it left out and of what kind, and that the size had nothing to do with it', async () => {
    const gripper = await aModule('The gripper')
    await aModule('The vision stack')
    await aModule('The logging shim')
    await aPipeline('Transplant v13')

    const reply = await get(ask([gripper]))
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    const left = reply.body.leftOut as { bucket: string; count: number; says: string }[]
    const mine = left.find((one) => one.bucket === 'not_chosen')
    expect(mine, 'a copy left three of four out and said nothing about it').toBeDefined()
    expect(mine?.count).toBe(3)
    expect(mine?.says).toContain('2 module(s)')
    expect(mine?.says).toContain('1 pipeline(s)')
    // THE READER'S CUT AND THE BUDGET'S CUT ARE DIFFERENT FACTS, and this sentence is what tells
    // them apart for a reader who only has the text.
    expect(mine?.says).toContain('size of the copy had nothing to do with it')
  })

  it('refuses naming none of them, rather than reading it as all of them', async () => {
    await aModule('The gripper')
    const reply = await get(ask([]))
    expect(reply.status, JSON.stringify(reply.body)).toBe(400)
    expect(String(reply.body.error)).toContain('Name at least one')
  })

  it('refuses an id that names no module and no pipeline, by name', async () => {
    const gripper = await aModule('The gripper')
    const notOne = await post('/api/records', { kind: 'note', title: 'A note, which is neither' })
    expect(notOne.status).toBe(201)

    const reply = await get(ask([gripper, notOne.body.record.id as string, 'nothingAtAll']))
    expect(reply.status, JSON.stringify(reply.body)).toBe(400)
    expect(String(reply.body.error)).toContain('nothingAtAll')
    expect(String(reply.body.error)).toContain(String(notOne.body.record.id))
    // AND THE ONE THAT WAS FINE IS NOT REPORTED AS CARRIED. Nothing was assembled at all.
    expect(reply.body.text).toBeUndefined()
    expect(String(reply.body.error)).not.toContain(gripper)
  })

  it('refuses a list sent to a copy that has no part to put them in', async () => {
    const gripper = await aModule('The gripper')
    const reply = await get(
      `/api/bundles/preview?preset=custom&slots=objective&modulesAndPipelines=${gripper}`,
    )
    expect(reply.status, JSON.stringify(reply.body)).toBe(400)
    expect(String(reply.body.error)).toContain('no ')
    expect(String(reply.body.error)).toContain('part to put them in')
  })

  it('carries all of them when nobody says which', async () => {
    await aModule('The gripper')
    await aModule('The vision stack')
    await aPipeline('Transplant v14')

    const reply = await get(ask())
    expect(reply.status, JSON.stringify(reply.body)).toBe(200)
    const text = String(reply.body.text)
    for (const one of ['The gripper', 'The vision stack', 'Transplant v14']) expect(text).toContain(one)
    expect((reply.body.leftOut as { bucket: string }[]).some((o) => o.bucket === 'not_chosen')).toBe(false)
  })

  it('files a bundle that remembers which ones, and reads the same text back', async () => {
    const gripper = await aModule('The gripper')
    await aModule('The vision stack')

    const filed = await post('/api/records', {
      kind: 'context_bundle',
      title: 'Just the gripper',
      data: { scope: 'project', preset: 'custom', slots: ['structure'], modulesAndPipelines: [gripper] },
    })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)

    const listed = await get('/api/bundles')
    const row = (listed.body.bundles as { id: string; spec: { modulesAndPipelines?: string[] } }[]).find(
      (one) => one.id === filed.body.record.id,
    )
    expect(row?.spec.modulesAndPipelines, 'the filed bundle forgot which ones').toEqual([gripper])

    const handed = await post('/api/bundles/export', { bundleId: filed.body.record.id })
    expect(handed.status, JSON.stringify(handed.body)).toBe(200)
    expect(String(handed.body.text)).toContain('The gripper')
    expect(String(handed.body.text)).not.toContain('The vision stack')
  })

  /**
   * THE CHOICE REACHES THE CHILDREN, AND THIS CASE IS NEWER THAN THE CRITERION.
   *
   * The three longest positions of the ladder draw what is UNDER each entry — the records that say
   * they are `part_of` it — and none of them existed when B6 was built. So a module somebody had
   * taken out arrived under a module they had kept, by name, in a copy that said it carried what was
   * asked for. Measured on an isolated copy of the live corpus on 7 September 2026: asking for one
   * module at Full put "The destructive-restore proof cannot stand until the UTC stamp defaults are
   * dropped" in the text, and that record is not a module anybody chose.
   *
   * Proved by mutation with a control run of this file first: making the children filter in
   * `fillTheLadder` — `src/server/lib/continuation.ts` — accept every child turns this case red.
   */
  it('keeps the choice when it draws what is under each one, at every position that does', async () => {
    const gripper = await aModule('The gripper')
    const vision = await aModule('The vision stack')
    // THE ONE NOBODY CHOSE SAYS IT IS PART OF THE ONE THEY DID.
    const joined = await post('/api/links', { fromId: vision, toId: gripper, type: 'part_of' })
    expect(joined.status, JSON.stringify(joined.body)).toBe(201)

    // EVERY POSITION THAT DRAWS CHILDREN AT ALL, read from the declaration. It was outline, sketch
    // and full until criterion B32 on 8 September 2026, when the record itself stopped being a
    // position a copy goes to and the digest became the top.
    for (const detail of BUNDLE_RUNGS.filter((rung) => rung !== 'title' && rung !== 'gist')) {
      const reply = await get(
        `/api/bundles/preview?preset=custom&slots=structure&modulesAndPipelines=${gripper}&detail=${detail}&budgetBytes=262144`,
      )
      expect(reply.status, `at ${detail}: ${JSON.stringify(reply.body)}`).toBe(200)
      const text = String(reply.body.text)
      expect(text, `at ${detail}, the chosen one is missing`).toContain('The gripper')
      expect(text, `at ${detail}, the copy carried a module nobody chose, as a child`).not.toContain(
        'The vision stack',
      )
    }

    // AND WHEN NOBODY CHOSE, THE CHILDREN ARE ALL THERE. The filter is the choice being kept, not a
    // rule that children are never drawn.
    const all = await get('/api/bundles/preview?preset=custom&slots=structure&detail=outline&budgetBytes=262144')
    expect(String(all.body.text)).toContain('The vision stack')
  })
})
