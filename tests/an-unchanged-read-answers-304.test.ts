// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A READ THAT ANSWERS WHAT THE CALLER ALREADY HOLDS IS ANSWERED 304, WITH NO BODY.
 *
 * This is round 17 of wave 13w, layer 1 of a decision. src/server/lib/version-tags.ts
 * says what it does and what it does not.
 *
 * WHAT THIS FILE HOLDS:
 *   1. A GET of a declared read carries an ETag and `Cache-Control: private, no-cache`. Asked again
 *      with that tag in If-None-Match, it is answered 304 with no body, and the request recorder
 *      writes the 304 with no bytes sent.
 *   2. After a write changes the answer, the old tag is answered 200 with the new body and a new tag.
 *   3. A GET whose operation is declared a write (GET /api/messages/conversation marks messages
 *      delivered) carries no tag, and a tag sent to it is answered in full.
 * MUTATION: the line in src/server/index.ts that registers `answerAnUnchangedReadWith304` is removed:
 * red on cases 1 and 2, no tag is sent and nothing is answered 304.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { desc } from 'drizzle-orm'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { apiCalls } from '../src/server/db/schema.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }

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

describe('version tags on reads', () => {
  it('answers a read the caller already holds with 304 and no body', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/records', headers: PERSON })
    expect(first.statusCode).toBe(200)
    const tag = first.headers['etag']
    expect(typeof tag, 'a read carries a version tag').toBe('string')
    expect(first.headers['cache-control']).toBe('private, no-cache')

    const again = await app.inject({ method: 'GET', url: '/api/records', headers: { ...PERSON, 'if-none-match': String(tag) } })
    expect(again.statusCode, again.body.slice(0, 300)).toBe(304)
    expect(again.body).toBe('')
    expect(again.headers['etag']).toBe(tag)
    const row = t.client.db.select().from(apiCalls).orderBy(desc(apiCalls.atMs)).all()[0]
    expect(row?.status, 'the recorder writes what the caller got').toBe(304)
    expect(row?.bytes, 'and no bytes were sent').toBe(0)
  })

  it('answers an old tag in full once a write has changed the answer', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/records', headers: PERSON })
    expect(first.headers['etag'], 'the first read carries a version tag').toBeDefined()
    const tag = String(first.headers['etag'])
    const made = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind: 'note', title: 'A note written between two reads' } })
    expect(made.statusCode, made.body.slice(0, 300)).toBe(201)
    const after = await app.inject({ method: 'GET', url: '/api/records', headers: { ...PERSON, 'if-none-match': tag } })
    expect(after.statusCode).toBe(200)
    expect(after.body).toContain('A note written between two reads')
    expect(after.headers['etag']).not.toBe(tag)
  })

  it('leaves a GET declared a write as it was', async () => {
    const agent = await app.inject({ method: 'POST', url: '/api/records', headers: PERSON, payload: { kind: 'agent', title: 'A made-up reader', data: { handle: 'made-up-reader', runtime: 'claude-code', state: 'active' } } })
    expect(agent.statusCode, agent.body.slice(0, 300)).toBe(201)
    const asked = '/api/messages/conversation?kind=agent&id=made-up-reader'
    const first = await app.inject({ method: 'GET', url: asked, headers: PERSON })
    expect(first.statusCode, first.body.slice(0, 300)).toBe(200)
    expect(first.headers['etag']).toBeUndefined()
    const again = await app.inject({ method: 'GET', url: asked, headers: { ...PERSON, 'if-none-match': '*' } })
    expect(again.statusCode).toBe(first.statusCode)
    expect(again.body.length).toBeGreaterThan(0)
  })
})
