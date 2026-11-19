// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION C4: A VISIT IS REGISTERED, AND ONLY ACROSS WORLDS.
 *
 * `design/messages/ACCEPTANCE.md` section 8. A citizen may visit another world, and a visit is registered
 * with what it is for. A local agent, or a program on this machine, needs no registration to act; only an
 * agent registered in another world is limited.
 *
 * Three states and no fourth, which is what the tests below are arranged around:
 *
 *   - a caller that names no home is a LOCAL. Named, never refused.
 *   - a caller whose home is this world is not checked at all.
 *   - a caller from another world needs a visit: a write is refused with a sentence naming the
 *     office, a read is answered in full with a warning header.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { freshDb, apiApp, type TestDb } from './helpers.ts'
import type { FastifyInstance } from 'fastify'
import { HOME_HEADER, VISIT_HEADER, VISIT_WARNING_HEADER } from '../src/config/visit-headers.mjs'

type VisitsLib = typeof import('../src/server/lib/visits.ts')
type WorldLib = typeof import('../src/server/lib/world.ts')

let t: TestDb
let app: FastifyInstance
let visits: VisitsLib
let world: WorldLib
/** The world this test's database is. Every case is written against it. */
let here: string

/** Each case's own far world, so an open visit another case registered does not answer for it. */
let ELSEWHERE = 'ffffffffffffffff'

/** Each case is a visitor of its own, so a live visit another case registered does not answer for it. */
let visitor = 'builder-au'
let caseNumber = 0
let WHO = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': visitor,
  'x-mole-office-workspace': 'default',
}

beforeAll(async () => {
  t = await freshDb()
  visits = await import('../src/server/lib/visits.ts')
  world = await import('../src/server/lib/world.ts')
  world.forgetTheWorld()
  app = (await apiApp()).app
  const said = world.theWorldThisDatabaseIs()
  if (said === null) throw new Error('this test database has no identity, so nothing below is about anything')
  here = said
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  visitor = `builder-au-case-${String(caseNumber)}`
  ELSEWHERE = `ffffffffffff${String(caseNumber).padStart(4, '0')}`
  WHO = { ...WHO, 'x-mole-office-actor-id': visitor }
})

describe('a caller that names no home is a local, and a caller at home is not checked', () => {
  it('lets a write through with no home header at all', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: WHO,
      payload: { kind: 'note', title: 'Written by a local', data: { body: 'nothing about worlds' } },
    })
    expect(made.statusCode).toBe(201)
    expect(made.headers[VISIT_WARNING_HEADER]).toBeUndefined()
  })

  it('lets a write through from a caller whose home is this world', async () => {
    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: here },
      payload: { kind: 'note', title: 'Written at home', data: { body: 'nothing about worlds' } },
    })
    expect(made.statusCode).toBe(201)
    expect(made.headers[VISIT_WARNING_HEADER]).toBeUndefined()
  })
})

describe('a caller from another world with no visit', () => {
  it('is refused a write, in a sentence naming the office and what to do', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: ELSEWHERE },
      payload: { kind: 'note', title: 'Written by a visitor with no visit', data: { body: 'x' } },
    })
    expect(refused.statusCode).toBe(403)
    const said = refused.json<{ error: string }>().error
    expect(said).toContain(ELSEWHERE)
    expect(said).toContain(here)
    expect(said).toContain('/api/office/visits')
  })

  it('is answered a read in full, with a warning on the reply rather than a refusal', async () => {
    const read = await app.inject({ method: 'GET', url: '/api/health', headers: { [HOME_HEADER]: ELSEWHERE } })
    expect(read.statusCode).toBe(200)
    const warning = read.headers[VISIT_WARNING_HEADER]
    expect(warning, 'a read from another world says it holds no visit').toBeDefined()
    expect(String(warning)).toContain(ELSEWHERE)
    expect(String(warning)).toContain(here)
  })

  it('may still knock on the one door that registers a visit', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/office/visits',
      headers: { ...WHO, [HOME_HEADER]: ELSEWHERE },
      payload: { fromWorld: ELSEWHERE, why: 'reading the citizens work' },
    })
    expect(registered.statusCode).toBe(201)
  })
})

describe('a caller from another world holding a visit', () => {
  it('writes, and the visit says who, from where, to where, since when and why', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/office/visits',
      headers: { ...WHO, [HOME_HEADER]: ELSEWHERE },
      payload: { fromWorld: ELSEWHERE, why: 'reading the citizens work' },
    })
    const visit = registered.json<{ visit: { id: string; why: string; since: string; visitor: unknown } }>().visit
    expect(visit.visitor).toEqual({ kind: 'agent', id: visitor })
    expect(visit.why).toBe('reading the citizens work')
    expect(visit.since).not.toBe('')

    const made = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: ELSEWHERE, [VISIT_HEADER]: visit.id },
      payload: { kind: 'note', title: 'Written by a visitor holding a visit', data: { body: 'x' } },
    })
    expect(made.statusCode).toBe(201)
  })

  it('is refused again once the visit has ended', async () => {
    const registered = await app.inject({
      method: 'POST',
      url: '/api/office/visits',
      headers: { ...WHO, [HOME_HEADER]: ELSEWHERE },
      payload: { fromWorld: ELSEWHERE, why: 'reading the citizens work' },
    })
    const id = registered.json<{ visit: { id: string } }>().visit.id
    const ended = await app.inject({ method: 'POST', url: `/api/office/visits/${id}/end`, headers: WHO })
    expect(ended.statusCode).toBe(200)

    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: ELSEWHERE, [VISIT_HEADER]: id },
      payload: { kind: 'note', title: 'After the visit ended', data: { body: 'x' } },
    })
    expect(refused.statusCode).toBe(403)
  })

  it('is refused with somebody else’s visit, because the visit names who holds it', async () => {
    const other = 'aaaaaaaaaaaaaaaa'
    const registered = await app.inject({
      method: 'POST',
      url: '/api/office/visits',
      headers: { ...WHO, [HOME_HEADER]: other },
      payload: { fromWorld: other, why: 'somebody else was here' },
    })
    const id = registered.json<{ visit: { id: string } }>().visit.id
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, [HOME_HEADER]: ELSEWHERE, [VISIT_HEADER]: id },
      payload: { kind: 'note', title: 'Holding a visit from another world', data: { body: 'x' } },
    })
    expect(refused.statusCode).toBe(403)
  })
})

describe('a visit is only ever across worlds', () => {
  it('refuses a visit to the world the visitor already lives in', () => {
    expect(() =>
      visits.registerVisitHere({ visitor: { kind: 'agent', id: visitor }, fromWorld: here, toWorld: here, why: 'x' }),
    ).toThrow(/where this citizen lives/)
  })

  it('refuses a visit that does not say what it is for, because that is the thing being registered', () => {
    expect(() =>
      visits.registerVisitHere({
        visitor: { kind: 'agent', id: visitor },
        fromWorld: ELSEWHERE,
        toWorld: here,
        why: '   ',
      }),
    ).toThrow(/what you came to do/)
  })

  it('keeps an ended visit rather than deleting it', () => {
    const visit = visits.registerVisitHere({
      visitor: { kind: 'agent', id: visitor },
      fromWorld: ELSEWHERE,
      toWorld: here,
      why: 'reading the citizens work',
    })
    visits.endVisitHere(visit.id)
    const kept = visits.visitById(visit.id)
    expect(kept?.until).not.toBeNull()
    expect(kept?.why).toBe('reading the citizens work')
    expect(visits.visitsHere().map((one) => one.id)).toContain(visit.id)
  })
})

describe('a misspelt home header is refused rather than ignored', () => {
  it('says so, because a home that goes unread makes a visitor look like a local', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { ...WHO, 'x-mole-office-hoem': ELSEWHERE },
      payload: { kind: 'note', title: 'A misspelt home', data: { body: 'x' } },
    })
    expect(refused.statusCode).toBe(400)
    expect(refused.json<{ error: string }>().error).toContain(HOME_HEADER)
  })
})
