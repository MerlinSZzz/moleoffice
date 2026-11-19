// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DOOR A DRAWING KNOCKS ON: what restricts each of these records, answered per record.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS SHAPE AND NOT `?record=` IN A LOOP
 * ---------------------------------------------------------------------------------------
 *
 * A canvas draws nineteen cards out of a project holding hundreds of records. Asking `?record=`
 * once per card is nineteen requests for one drawing, and `loadPage` in `PipelinePage.tsx` already
 * carries a measured paragraph about where that ends. Asking `?scope=` gives one reading per
 * restriction, which answers *which restrictions are in here* — a different question from *which
 * restrictions reach THIS card*, which is what a card has to draw.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO THINGS THIS FILE IS HERE TO HOLD
 * ---------------------------------------------------------------------------------------
 *
 * 1. A KEY FOR EVERY ID ASKED ABOUT, INCLUDING THE ONES NOTHING REACHES. A card drawing no mark
 *    because nothing restricts it and a card drawing no mark because nobody looked are different
 *    facts. An absent key makes them the same one, and the caller cannot tell.
 * 2. REFUSED RATHER THAN TRUNCATED. A reply about the first 200 of 300 ids would leave a hundred
 *    cards unmarked and say nothing about it — the silent fold this product bans.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { A_HOOK_THAT_IMPORTS_THE_SERVER } from './how-long-a-test-may-take.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, A_HOOK_THAT_IMPORTS_THE_SERVER)

afterAll(async () => {
  await app.close()
  t.close()
})

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: PERSON })
  return { status: res.statusCode, body: res.json() }
}

async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: PERSON })
  return { status: res.statusCode, body: res.statusCode < 400 ? res.json() : null }
}

/** A block something is deliberately unresolved about, and a second block nothing is said about. */
async function twoBlocks(): Promise<{ restricted: string; plain: string }> {
  const pipeline = await post('/api/records', { kind: 'pipeline', title: 'Perception', data: {} })
  const id = pipeline.body.record.id as string
  const one = await post(`/api/records/${id}/blocks`, { name: 'Pixel segmentation', state: 'done' })
  const two = await post(`/api/records/${id}/blocks`, { name: 'Point-cloud projection', state: 'doing' })
  const held = await post('/api/records', {
    kind: 'placeholder',
    title: 'Wrist camera intrinsics are not calibrated',
    data: {
      what: "The wrist camera's intrinsics have never been calibrated.",
      slot: 'stand_in',
      substitute: 'fx = 600, fy = 600 — guessed from the sensor data sheet',
      resolved_when: 'A checkerboard calibration run on the wrist camera.',
      allowed_uses: ['pipeline plumbing'],
      disallowed_claims: ['geometric accuracy claims'],
      severity: 'stops_final',
    },
  })
  expect(held.status, JSON.stringify(held.body)).toBe(201)
  expect((await post('/api/links', { fromId: held.body.record.id, toId: one.body.record.id, type: 'about' })).status).toBe(
    201,
  )
  return { restricted: one.body.record.id as string, plain: two.body.record.id as string }
}

describe('what restricts each of these records', () => {
  it('answers about every id asked about, including the ones nothing reaches', async () => {
    const { restricted, plain } = await twoBlocks()
    const read = await get(`/api/restrictions?records=${restricted},${plain}`)
    expect(read.status).toBe(200)
    // NOT `toHaveProperty` on the restricted one alone. The claim is about the shape of the whole
    // reply: a caller holding the ids it asked about can look every one of them up.
    expect(Object.keys(read.body.byRecord).sort()).toEqual([restricted, plain].sort())
    expect(read.body.byRecord[restricted]).toHaveLength(1)
    expect(read.body.byRecord[restricted][0].severity).toBe('stops_final')
    expect(
      read.body.byRecord[plain],
      'a record nothing restricts came back with no key at all, so the caller cannot tell it from a record nobody looked at',
    ).toEqual([])
  })

  it('says the same thing about one record as the single-record read does', async () => {
    const { restricted } = await twoBlocks()
    const many = await get(`/api/restrictions?records=${restricted}`)
    const one = await get(`/api/restrictions?record=${restricted}`)
    // TWO DOORS, ONE ANSWER. A batched read that quietly computed something else would be a second
    // truth about the same records, which is the defect this repository keeps producing.
    expect(many.body.byRecord[restricted].map((r: any) => r.restrictionId)).toEqual(
      one.body.found.map((r: any) => r.restrictionId),
    )
  })

  it('refuses more records than it answers about, rather than answering about the first of them', async () => {
    const ids = Array.from({ length: 201 }, (_, i) => `rec${i}`).join(',')
    const read = await get(`/api/restrictions?records=${ids}`)
    expect(read.status).toBe(200)
    expect(read.body.byRecord).toEqual({})
    expect(read.body.couldNotCheck).toHaveLength(1)
    expect(read.body.couldNotCheck[0].because).toContain('201')
    expect(read.body.couldNotCheck[0].because).toContain('200')
  })

  it('refuses a question with no ids in it, rather than calling it an empty answer', async () => {
    const read = await get('/api/restrictions?records=,,')
    expect(read.status).toBe(200)
    expect(read.body.couldNotCheck).toHaveLength(1)
    expect(read.body.couldNotCheck[0].because).toContain('empty question is not an empty answer')
  })

  it('says a record it could not look at could not be looked at, and does not call it unrestricted', async () => {
    const { restricted } = await twoBlocks()
    const read = await get(`/api/restrictions?records=${restricted},no_such_record_at_all`)
    expect(read.body.byRecord).toHaveProperty('no_such_record_at_all')
    expect(read.body.couldNotCheck.map((one: any) => one.what).join(' ')).toContain('no_such_record_at_all')
  })
})
