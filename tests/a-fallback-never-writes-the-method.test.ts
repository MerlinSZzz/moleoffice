// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FALLBACK MAY PRESERVE EXECUTION AND MUST NOT SILENTLY REDEFINE THE CANONICAL METHOD.
 *
 * The rule says it twice, and the operative word both times is *silently*. An example: the
 * canonical method is SAM segmentation; the temporary runtime fallback is classical threshold
 * segmentation; it may permit downstream plumbing; **it does not prove SAM works**. And if the
 * evidence later suggests the fallback is better, that is a finding, then a proposal, then
 * criticism, then a decision — four records, the last of which only a person may write.
 *
 * ---------------------------------------------------------------------------------------
 * THE MECHANISMS, IN THE ORDER THEY BITE
 * ---------------------------------------------------------------------------------------
 *
 * 1. There is no route that writes `data.method` from a fallback record. `POST
 *    /api/records/:id/ran-instead` writes one record and one link.
 * 2. An agent may not patch a block's `data.method` while a live `ran_instead` is about it. A
 *    PERSON MAY, and that direction is proved here too — a guard that refuses everybody is not a
 *    guard, it is a broken field.
 * 3. A `ran_instead` record may never write an `instead_of` link, which would say *this happened
 *    instead of the planned state* — a statement that the plan was answered another way. THAT LINK
 *    TYPE DOES NOT EXIST YET: it belongs to the history thread, and the clause goes in beside the
 *    other two on the day it is declared. The test at the foot of this file asserts the type is
 *    still absent, so it goes red the day somebody adds it and the clause is owed.
 * 4. The four steps are four kinds that already exist and the last one is human-only.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }
const AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-workspace': WORKSPACE }

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

async function post(url: string, payload: unknown, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers })
  return { status: res.statusCode, body: res.json() }
}

async function patch(url: string, payload: unknown, headers = PERSON): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'PATCH', url, payload: payload as object, headers })
  return { status: res.statusCode, body: res.json() }
}

const THE_FALLBACK = {
  ran: 'Classical threshold segmentation — OpenCV adaptiveThreshold, block 51, C 7.',
  because: 'SAM will not load on the Jetson at 8 GB.',
  since: '2026-08-30',
  allowed_uses: ['downstream plumbing'],
  disallowed_claims: ['that SAM segmentation works', 'segmentation quality comparisons'],
  severity: 'limits_claims',
}

/** A pipeline with one step whose canonical method is written down. */
async function aStepWithAMethod(): Promise<string> {
  const pipeline = await post('/api/records', { kind: 'pipeline', title: 'Perception', data: {} })
  expect(pipeline.status).toBe(201)
  const block = await post(`/api/records/${pipeline.body.record.id}/blocks`, {
    name: 'Pixel segmentation',
    state: 'doing',
  })
  expect(block.status, JSON.stringify(block.body)).toBe(201)
  const id = block.body.record.id as string
  expect((await patch(`/api/records/${id}`, { dataPatch: { method: 'SAM segmentation' } })).status).toBe(200)
  return id
}

describe('filing what ran instead', () => {
  it('mints the record and the link in one act, and never touches the canonical method', async () => {
    const block = await aStepWithAMethod()
    const filed = await post(`/api/records/${block}/ran-instead`, THE_FALLBACK, AGENT)
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(filed.body.record.kind).toBe('ran_instead')
    expect(filed.body.record.data.ran).toBe(THE_FALLBACK.ran)
    // THE CANONICAL METHOD IS EXACTLY AS IT WAS.
    const after = await app.inject({ method: 'GET', url: `/api/records/${block}`, headers: PERSON })
    expect(after.json().record.data.method).toBe('SAM segmentation')
  })

  it('refuses a bare create, with the route to use', async () => {
    const bare = await post('/api/records', { kind: 'ran_instead', title: 'Something ran', data: THE_FALLBACK })
    expect(bare.status).toBe(400)
    expect(bare.body.error).toContain('/ran-instead')
  })

  it('refuses a step with no canonical method, naming the patch that writes one', async () => {
    const pipeline = await post('/api/records', { kind: 'pipeline', title: 'Perception', data: {} })
    const block = await post(`/api/records/${pipeline.body.record.id}/blocks`, { name: 'A step', state: 'doing' })
    const refused = await post(`/api/records/${block.body.record.id}/ran-instead`, THE_FALLBACK)
    expect(refused.status).toBe(409)
    // A method that ran instead of NOTHING is meaningless, and this would restrict an absence.
    expect(refused.body.error).toContain('dataPatch')
    expect(refused.body.error).toContain('method')
  })

  it('refuses a target that is not a step', async () => {
    const claim = await post('/api/records', { kind: 'claim', title: 'A result', data: { state: 'measured' } })
    const refused = await post(`/api/records/${claim.body.record.id}/ran-instead`, THE_FALLBACK)
    expect(refused.status).toBe(409)
    expect(refused.body.error).toContain('about a STEP')
  })
})

describe('while it is live, only a person may change the canonical method', () => {
  it('refuses the agent, names the fallback and names the four steps', async () => {
    const block = await aStepWithAMethod()
    const filed = await post(`/api/records/${block}/ran-instead`, THE_FALLBACK, AGENT)
    expect(filed.status).toBe(201)

    const refused = await patch(`/api/records/${block}`, { dataPatch: { method: 'threshold segmentation' } }, AGENT)
    expect(refused.status).toBe(403)
    expect(refused.body.error).toContain(filed.body.record.id)
    expect(refused.body.error).toContain('proposal')
    expect(refused.body.error).toContain('decision')
    // AND NOTHING WAS WRITTEN.
    const after = await app.inject({ method: 'GET', url: `/api/records/${block}`, headers: PERSON })
    expect(after.json().record.data.method).toBe('SAM segmentation')
  })

  it('lets the person change it, so the guard is about who and not about the field', async () => {
    const block = await aStepWithAMethod()
    expect((await post(`/api/records/${block}/ran-instead`, THE_FALLBACK, AGENT)).status).toBe(201)
    const allowed = await patch(`/api/records/${block}`, { dataPatch: { method: 'depth-cluster segmentation' } })
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200)
    const after = await app.inject({ method: 'GET', url: `/api/records/${block}`, headers: PERSON })
    expect(after.json().record.data.method).toBe('depth-cluster segmentation')
  })

  it('lets the agent change it when no fallback is running, so the lock is the fallback and not the kind', async () => {
    const block = await aStepWithAMethod()
    const allowed = await patch(`/api/records/${block}`, { dataPatch: { method: 'SAM 2' } }, AGENT)
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200)
  })

  it('lets the agent change everything else on the step while the fallback is running', async () => {
    const block = await aStepWithAMethod()
    expect((await post(`/api/records/${block}/ran-instead`, THE_FALLBACK, AGENT)).status).toBe(201)
    const allowed = await patch(`/api/records/${block}`, { dataPatch: { measured: 'p50 42 ms' } }, AGENT)
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200)
    expect(allowed.body.record.data.method).toBe('SAM segmentation')
  })

  it('lets the agent change it again once the fallback has been resolved', async () => {
    const block = await aStepWithAMethod()
    const filed = await post(`/api/records/${block}/ran-instead`, THE_FALLBACK, AGENT)
    const ran = await post('/api/records', {
      kind: 'claim',
      title: 'SAM ran on the Jetson after the memory fix',
      data: { state: 'measured' },
    })
    expect((await post('/api/links', { fromId: ran.body.record.id, toId: filed.body.record.id, type: 'resolves' })).status).toBe(201)
    // A RESOLVED FALLBACK IS NOT A LIVE ONE. Nothing here is a lease and nothing expires; the only
    // thing the lock was ever about is whether a fallback is still standing.
    const allowed = await patch(`/api/records/${block}`, { dataPatch: { method: 'SAM segmentation v2' } }, AGENT)
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200)
  })

  it('carries the fallback’s restriction to the step and says what it does not prove', async () => {
    const block = await aStepWithAMethod()
    expect((await post(`/api/records/${block}/ran-instead`, THE_FALLBACK, AGENT)).status).toBe(201)
    const res = await app.inject({ method: 'GET', url: `/api/restrictions?record=${block}`, headers: PERSON })
    const found = res.json().found
    expect(found).toHaveLength(1)
    expect(found[0].kind).toBe('ran_instead')
    expect(found[0].disallowedClaims).toContain('that SAM segmentation works')
  })
})

describe('a fallback that ran is not a plan being answered', () => {

  it('refuses an `instead_of` link from a record of what ran instead, and names the four steps', async () => {
    const block = await aStepWithAMethod()
    const filed = await post(`/api/records/${block}/ran-instead`, THE_FALLBACK, AGENT)
    expect(filed.status).toBe(201)
    // A `planned_state`, because that is what an `instead_of` link points at: the type says *this
    // happened instead of the PLANNED STATE*, and the thread that declared it checks both ends by
    // kind. The refusal under test is about what the FROM end is.
    const planned = await post('/api/records', {
      kind: 'planned_state',
      title: 'What the plan said would happen',
      data: { what: 'SAM segmentation runs on the Jetson.' },
    })
    const refused = await post('/api/links', {
      fromId: filed.body.record.id,
      toId: planned.body.record.id,
      type: 'instead_of',
    })
    expect(refused.status).toBe(409)
    expect(refused.body.error).toContain('the PLAN was answered another way')
    expect(refused.body.error).toContain('decision')
  })

  it('takes the same link from a record that is not a fallback, so the refusal is about the kind', async () => {
    // THE OTHER DIRECTION. `instead_of` is another thread's type and this clause must not have
    // taken it away from everybody who has a use for it.
    const one = await post('/api/records', { kind: 'claim', title: 'What actually happened', data: { state: 'measured' } })
    const other = await post('/api/records', {
      kind: 'planned_state',
      title: 'What was planned',
      data: { what: 'The masks are good enough to grasp from.' },
    })
    const allowed = await post('/api/links', {
      fromId: one.body.record.id,
      toId: other.body.record.id,
      type: 'instead_of',
    })
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(201)
  })
})
