// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MEASUREMENT MUST NOT PUT A ROW ON THE DAILY PAGE.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE, AND WHOSE IT IS
 * ---------------------------------------------------------------------------------------
 *
 * The owner's second addendum, section 16: *"Raw lifecycle events should not flood ordinary project
 * records."* `changes` IS the daily page — its own schema comment says so — so anything written
 * through the record-patch path lands on the screen that answers *what happened while I was away*.
 * A lifecycle transition written that way would put every state change every agent makes onto it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE CAN AND CANNOT DRIVE, SAID PLAINLY RATHER THAN LEFT AS A GAP
 * ---------------------------------------------------------------------------------------
 *
 * THE TRANSITION STORE DOES NOT EXIST. There is no route, no table and no kind for an agent state
 * change in this product, so a test that "drives a transition" would be driving nothing and passing
 * for that reason. That is the shape of test this campaign has shipped before.
 *
 * SO THIS FILE HOLDS THE RULE OVER THE MEASURED WRITES THAT DO EXIST, which is the same rule about
 * the same table on the same authority. `POST /api/usage/outside-reads` is the one thing an agent
 * writes into the measurement layer. It must move `outside_reads` and must not move `changes`.
 *
 * THE MUTATION THAT TURNS IT RED IS WRITING THE MEASUREMENT AS A RECORD PATCH, which is exactly the
 * shortcut somebody will take when the transition store lands: the record path is already there, it
 * already attributes the actor, and it already works. It also writes a `changes` row.
 *
 * The day a transition route exists, the row below is copied for it. That is one line of work and
 * it is named here so it is not discovered instead.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { changes, outsideReads, apiCalls, usageChecks } from '../src/server/db/schema.ts'

const AGENT = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-lifecycle',
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

const changeRows = () => t.client.db.select().from(changes).all().length
const outsideRows = () => t.client.db.select().from(outsideReads).all().length
const callRows = () => t.client.db.select().from(apiCalls).all().length
const checkRows = () => t.client.db.select().from(usageChecks).all().length

describe('a measured write moves the measured tables and leaves the daily page alone', () => {
  it('files an outside read without putting anything on the daily page', async () => {
    const before = changeRows()
    const beforeOutside = outsideRows()
    const beforeCalls = callRows()
    const res = await app.inject({
      method: 'POST',
      url: '/api/usage/outside-reads',
      headers: AGENT,
      payload: { source: 'shell', what: 'git rev-parse HEAD', wanted: 'repo-head', verdict: 'boundary' },
    })
    expect(res.statusCode).toBe(201)
    // THE MEASURED TABLE MOVED, so this test is about a write that happened and not about a route
    // that quietly did nothing — which is how this assertion would pass for the wrong reason.
    expect(outsideRows()).toBe(beforeOutside + 1)
    expect(callRows()).toBe(beforeCalls + 1)
    // AND THE DAILY PAGE DID NOT.
    expect(changeRows(), 'a measurement put a row on the daily page').toBe(before)
  })

  it('records what a contradiction check said without putting anything on the daily page', async () => {
    const before = changeRows()
    const beforeChecks = checkRows()
    const res = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: AGENT })
    expect(res.statusCode).toBe(200)
    expect(checkRows()).toBeGreaterThan(beforeChecks)
    expect(changeRows(), 'a stored check put a row on the daily page').toBe(before)
  })

  it('still puts an ordinary record write on the daily page, so the rule above is about the table and not about writing', async () => {
    // THE OTHER DIRECTION. Without this, a bug that stopped `changes` being written at all would
    // make both assertions above pass, and the daily page would go silently blank.
    const before = changeRows()
    const res = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AGENT,
      payload: { kind: 'note', title: 'an ordinary note' },
    })
    expect(res.statusCode).toBe(201)
    expect(changeRows()).toBeGreaterThan(before)
  })
})
