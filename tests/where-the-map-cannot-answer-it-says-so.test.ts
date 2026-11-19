// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE IMPLEMENTATION MAP CANNOT ANSWER, THE REPLY SAYS SO, FROM THE FIRST DAY.
 *
 * A restriction is declared about a record. A person or an agent working in a checkout has a FILE,
 * not a record id — so the walk takes implementation entries too, and resolves each one to the
 * records that state it as theirs through the Map's own forward read, before the walk runs.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE HONEST FAILURES, EACH SAID AS ITSELF
 * ---------------------------------------------------------------------------------------
 *
 * 1. A path the scan never saw. Not the same as no record owning it: the scan skips what
 *    .gitignore names, anything beginning with an underscore, and anything that is not a source
 *    extension. The reason is copied from the Map unchanged.
 * 2. A path nothing states as theirs. It reached no work, and that is a different sentence.
 * 3. The record-to-record import graph is not built at all, so code dependencies were never
 *    walked. Every reply says this, on every read, today.
 *
 * ALL THREE ARE `couldNotCheck` ENTRIES AND NOT QUIET ZEROES. Without them, *nothing restricts
 * this file* and *nobody was able to look* are the same reply, which is the one thing this feature
 * exists to prevent.
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

async function get(url: string): Promise<any> {
  const res = await app.inject({ method: 'GET', url, headers: PERSON })
  expect(res.statusCode, res.body).toBe(200)
  return res.json()
}

describe('a file, resolved to the records that state it as theirs', () => {
  it('says the scan never saw a path, rather than answering as though nothing owned it', async () => {
    const reply = await get('/api/restrictions?repository=panelx&path=src/does/not/exist.ts')
    expect(reply.found).toEqual([])
    const said = JSON.stringify(reply.couldNotCheck)
    // A repository that is not in this project is a different sentence again, and either way the
    // reply is not allowed to look like a clean run.
    expect(reply.couldNotCheck.length).toBeGreaterThan(0)
    expect(said).toContain('src/does/not/exist.ts')
    expect(reply.note).toContain('could not be checked')
  })

  it('refuses half a file rather than guessing the other half', async () => {
    const onlyPath = await get('/api/restrictions?path=src/server/lib/records.ts')
    expect(onlyPath.found).toEqual([])
    expect(JSON.stringify(onlyPath.couldNotCheck)).toContain('one is not a file')
    const onlyRepo = await get('/api/restrictions?repository=panelx')
    expect(JSON.stringify(onlyRepo.couldNotCheck)).toContain('one is not a file')
  })

  it('refuses a request that named nothing at all, rather than answering it with an empty list', async () => {
    const nothing = await get('/api/restrictions')
    expect(nothing.found).toEqual([])
    // "Nothing restricts what you asked about" and "you asked about nothing" must never be the
    // same reply.
    expect(JSON.stringify(nothing.couldNotCheck)).toContain('named neither a record nor a scope')
  })
})

describe('code dependencies are not walked, and every reply says so', () => {
  it('says it on an ordinary record read, where a clean-looking answer would be the lie', async () => {
    const claim = await post('/api/records', {
      kind: 'claim',
      title: 'A result nothing restricts',
      data: { state: 'measured' },
    })
    const reply = await get(`/api/restrictions?record=${claim.body.record.id}`)
    expect(reply.found).toEqual([])
    // THE POINT OF THE ROW. This record really is unrestricted by every link somebody drew — and
    // the import graph rolled up to records does not exist, so a restriction on a record whose
    // code this one imports would not have been found. Saying nothing here would report a check
    // that never ran as a check that found nothing.
    const because = reply.couldNotCheck.map((c: any) => c.because).join(' ')
    expect(because).toContain('Implementation Map')
    expect(because).toContain('import graph')
  })

  it('says it beside a restriction it DID find, so the two answers are not confused', async () => {
    const block = await post('/api/records', { kind: 'module', title: 'Perception', data: {} })
    const p = await post('/api/records', {
      kind: 'placeholder',
      title: 'The intrinsics are not calibrated',
      data: {
        what: 'Never calibrated.',
        slot: 'empty',
        resolved_when: 'A calibration run.',
        allowed_uses: ['plumbing'],
        disallowed_claims: ['geometric accuracy claims'],
        severity: 'stops_final',
      },
    })
    expect((await post('/api/links', { fromId: p.body.record.id, toId: block.body.record.id, type: 'about' })).status).toBe(201)
    const reply = await get(`/api/restrictions?record=${block.body.record.id}`)
    expect(reply.found).toHaveLength(1)
    expect(reply.couldNotCheck.length).toBeGreaterThan(0)
  })
})
