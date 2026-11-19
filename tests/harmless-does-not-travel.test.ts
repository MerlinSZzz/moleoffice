// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HARMLESS PLACEHOLDER DOES NOT TRAVEL, AND THAT IS THE OWNER'S RULE IN BEHAVIOUR.
 *
 * The owner's line is about drawing: *"Do not make harmless Placeholders visually equivalent to
 * production-blocking ones."* A drawing rule alone would be met by a paler mark on the same page,
 * in the same place, on the same twelve records. This meets it in behaviour instead: a restriction
 * whose author said nothing rests on it does not enter the propagation walk at all, writes no
 * re-validation rows when it is resolved, and is drawn on the record it is about and nowhere else.
 * It cannot look like a production-blocking one because it is not in the same places.
 *
 * AND SEVERITY IS NOT DECORATION. The write path refuses a `harmless` restriction that forbids
 * something and a `stops_final` one that names nothing it stops. Without that, the word is a label
 * somebody picked and the behaviour above is switched on and off by a field with no meaning.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': WORKSPACE }

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
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: PERSON })
  return { status: res.statusCode, body: res.json() }
}

async function record(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const made = await post('/api/records', { kind, title, data })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return made.body.record.id as string
}

async function restrictionsOn(id: string): Promise<any> {
  const res = await app.inject({ method: 'GET', url: `/api/restrictions?record=${id}`, headers: PERSON })
  expect(res.statusCode, res.body).toBe(200)
  return res.json()
}

/** A is restricted; B produces from A; so B depends on A. */
async function twoRecordsAndOneRestriction(severity: string): Promise<{ p: string; a: string; b: string }> {
  const a = await record('claim', 'The thing that is restricted', { state: 'measured' })
  const b = await record('claim', 'The thing that rests on it', { state: 'measured' })
  const p = await record('placeholder', `A ${severity} slot`, {
    what: 'Something is deliberately unresolved here.',
    slot: 'empty',
    resolved_when: 'Somebody supplies it.',
    allowed_uses: severity === 'harmless' ? [] : ['reading the shape of the pipeline'],
    disallowed_claims: severity === 'harmless' ? [] : ['anything about the numbers'],
    severity,
  })
  expect((await post('/api/links', { fromId: p, toId: a, type: 'about' })).status).toBe(201)
  expect((await post('/api/links', { fromId: b, toId: a, type: 'derived_from' })).status).toBe(201)
  return { p, a, b }
}

describe('a harmless restriction stays where it was written', () => {
  it('is on the record it is about', async () => {
    const { p, a } = await twoRecordsAndOneRestriction('harmless')
    const found = (await restrictionsOn(a)).found
    expect(found).toHaveLength(1)
    expect(found[0].restrictionId).toBe(p)
    expect(found[0].reach.how).toBe('direct')
  })

  it('does not reach the record that rests on it, at all', async () => {
    const { b } = await twoRecordsAndOneRestriction('harmless')
    expect((await restrictionsOn(b)).found, 'a harmless restriction travelled').toHaveLength(0)
  })

  it('but a limits_claims one in the same graph does reach it, so the walk is really running', async () => {
    // THE OTHER DIRECTION. A test that only proved a harmless one is absent would pass just as well
    // if the walk were broken and nothing travelled at all.
    const { p, b } = await twoRecordsAndOneRestriction('limits_claims')
    const found = (await restrictionsOn(b)).found
    expect(found).toHaveLength(1)
    expect(found[0].restrictionId).toBe(p)
    expect(found[0].reach.how).toBe('depends')
    expect(found[0].reach.distance).toBe(1)
  })

  it('writes no re-validation row when it is resolved, and says so in the reply', async () => {
    const { p } = await twoRecordsAndOneRestriction('harmless')
    const answer = await record('note', 'Somebody supplied it', {})
    const resolved = await post('/api/links', { fromId: answer, toId: p, type: 'resolves' })
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(201)
    expect(resolved.body.revalidation.harmless).toBe(true)
    expect(resolved.body.revalidation.written).toBe(0)
    const rows = t.client.sqlite.prepare('SELECT COUNT(*) AS n FROM revalidations').get() as { n: number }
    expect(rows.n).toBe(0)
  })

  it('reads as resolved and not as active once it is answered, and never as unchecked', async () => {
    const { p, a } = await twoRecordsAndOneRestriction('harmless')
    const answer = await record('note', 'Somebody supplied it', {})
    expect((await post('/api/links', { fromId: answer, toId: p, type: 'resolves' })).status).toBe(201)
    const found = (await restrictionsOn(a)).found
    expect(found).toHaveLength(1)
    // Nothing was ever owed, so there is nothing to be unchecked about. A rule that read "no row
    // means the restriction is live" would have this reading `active` for ever.
    expect(found[0].standing.state).toBe('resolved')
  })
})

describe('severity is not decoration', () => {
  it('refuses a harmless restriction that forbids something, naming both fields', async () => {
    const made = await post('/api/records', {
      kind: 'placeholder',
      title: 'A contradiction',
      data: {
        what: 'Something unresolved.',
        slot: 'empty',
        resolved_when: 'Somebody supplies it.',
        allowed_uses: [],
        disallowed_claims: ['that the numbers are right'],
        severity: 'harmless',
      },
    })
    expect(made.status).toBe(400)
    expect(made.body.error).toContain('allowed_uses')
    expect(made.body.error).toContain('disallowed_claims')
  })

  it('refuses a stops_final restriction that names nothing it stops', async () => {
    const made = await post('/api/records', {
      kind: 'placeholder',
      title: 'A mark with nothing behind it',
      data: {
        what: 'Something unresolved.',
        slot: 'empty',
        resolved_when: 'Somebody supplies it.',
        allowed_uses: [],
        disallowed_claims: [],
        severity: 'stops_final',
      },
    })
    expect(made.status).toBe(400)
    expect(made.body.error).toContain('harmless')
  })

  it('takes an empty slot with no stand-in, because a deliberate empty slot is a real placeholder', async () => {
    // THE OTHER DIRECTION for the slot rule: the checks above must not have made the legitimate
    // case unfileable. The owner is explicit — a placeholder does NOT require a fake substitute.
    const made = await post('/api/records', {
      kind: 'placeholder',
      title: 'The detector architecture is not chosen',
      data: {
        what: 'Nobody has chosen the final detector architecture.',
        slot: 'empty',
        resolved_when: 'The decision is made.',
        allowed_uses: ['building the plumbing around it'],
        disallowed_claims: ['any comparison of detector quality'],
        severity: 'limits_claims',
      },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
  })

  it('refuses a stand-in with no value, and an empty slot that has one', async () => {
    const noValue = await post('/api/records', {
      kind: 'placeholder',
      title: 'A stand-in nobody can read',
      data: {
        what: 'Something unresolved.',
        slot: 'stand_in',
        resolved_when: 'Somebody supplies it.',
        allowed_uses: ['plumbing'],
        disallowed_claims: ['numbers'],
        severity: 'limits_claims',
      },
    })
    expect(noValue.status).toBe(400)
    expect(noValue.body.error).toContain('data.substitute')

    const bothWays = await post('/api/records', {
      kind: 'placeholder',
      title: 'An empty slot with something in it',
      data: {
        what: 'Something unresolved.',
        slot: 'empty',
        substitute: 'fx = 600',
        resolved_when: 'Somebody supplies it.',
        allowed_uses: ['plumbing'],
        disallowed_claims: ['numbers'],
        severity: 'limits_claims',
      },
    })
    expect(bothWays.status).toBe(400)
    expect(bothWays.body.error).toContain('stand_in')
  })
})
