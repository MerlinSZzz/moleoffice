// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONBOARDING READ NAMES THE COLUMN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion F16 point 2: the onboarding read (F15) points a new agent at the delegation column as
 * the place its first task is. Four things hold that:
 *
 *   - `GET /api/delegation` is named as a door, and it is a route the live server really serves.
 *   - The sentence served for that door is the route's own, cut to its first sentence — not a second
 *     sentence about the route written into the list. The list holds the route name and nothing else.
 *   - That sentence tells a brand-new agent the packaged tasks are there and that its first task is
 *     there.
 *   - The read is still inside its declared budget and drops nothing, and it states its own size.
 *
 * ---------------------------------------------------------------------------------------
 * HOW EACH CASE IS PROVED BY MUTATION
 * ---------------------------------------------------------------------------------------
 *
 * Each test below is proved by breaking the one thing it is about, watching it go red, and putting
 * the file back byte for byte. The mutations and their sha256 are in the report, not in this file.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { ONBOARDING_DOORS, ONBOARDING_TOKEN_BUDGET, firstSentenceOf } from '@shared/onboarding.ts'
import { ALL_ROUTE_NOTES, type ApiRoute } from '../src/server/api/kinds.ts'

/** The door this piece adds, as `METHOD /path`. */
const DELEGATION_DOOR = 'GET /api/delegation'

let t: TestDb
let app: FastifyInstance
let listRoutes: () => readonly ApiRoute[]

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  listRoutes = built.listApiRoutes
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** What the onboarding read says about itself, as this file reads it. */
interface OnboardingBody {
  doors: { route: string; what: string }[]
  size: {
    characters: number
    bytes: number
    tokensEstimated: number
    budgetTokensEstimated: number
    fits: boolean
  }
  leftOut: unknown[]
  leftOutNote: string
}

async function onboarding(): Promise<{ body: OnboardingBody; raw: string }> {
  const res = await app.inject({ method: 'GET', url: '/api/onboarding' })
  expect(res.statusCode, `GET /api/onboarding answered ${String(res.statusCode)}: ${res.body.slice(0, 300)}`)
    .toBeLessThan(300)
  return { body: res.json() as OnboardingBody, raw: res.body }
}

/** The live route table as "METHOD /path", asked of the server. */
function liveRoutes(): Set<string> {
  return new Set(listRoutes().map((route) => `${route.method} ${route.path}`))
}

describe('the onboarding read names the delegation column', () => {
  /**
   * MUTATION that turns this red, after a control run: delete the line `'GET /api/delegation',`
   * from `ONBOARDING_DOORS` in src/shared/onboarding.ts. The door then goes missing from the read
   * and from this file's own declaration check.
   */
  it('names GET /api/delegation, and the server really serves it', async () => {
    // THE SHARED DECLARATION NAMES IT — so a door added only to the read would fail here too.
    expect(ONBOARDING_DOORS).toContain(DELEGATION_DOOR)

    // AND THE READ SERVES IT.
    const { body } = await onboarding()
    const door = body.doors.find((one) => one.route === DELEGATION_DOOR)
    expect(door, 'the onboarding read does not name GET /api/delegation').toBeDefined()

    // AND IT IS A ROUTE THE LIVE TABLE HOLDS, not a promise nobody keeps. The handler refuses to
    // serve a door the server does not have, and this says the door it does serve is real.
    expect(liveRoutes(), 'GET /api/delegation is named as a door and the server does not serve it')
      .toContain(DELEGATION_DOOR)
  })

  /**
   * MUTATION that turns this red, after a control run: in `sentenceForDoor` in
   * src/server/api/onboarding.ts, return a hand-written sentence for the delegation door instead of
   * the route's own. The read would then serve a second sentence about the route, which is the
   * thing this whole declaration exists to prevent.
   */
  it("takes that door's sentence from the route table, never a second copy", async () => {
    const { body } = await onboarding()
    const door = body.doors.find((one) => one.route === DELEGATION_DOOR)
    expect(door).toBeDefined()

    // THE ROUTE'S OWN ACCOUNT, read from the live table exactly as the handler reads it.
    const found = listRoutes().find((route) => `${route.method} ${route.path}` === DELEGATION_DOOR)
    expect(found, 'GET /api/delegation is not in the live route table').toBeDefined()
    const description = found?.note ?? ALL_ROUTE_NOTES[DELEGATION_DOOR] ?? null
    expect(description, 'the delegation route carries no sentence for the door to take').not.toBeNull()

    // THE SERVED SENTENCE IS THE FIRST SENTENCE OF THAT ACCOUNT, and a cut of it rather than a
    // paraphrase: the description begins with the served sentence.
    expect(door?.what).toBe(firstSentenceOf(description as string))
    expect((description as string).startsWith(door?.what ?? '\u0000')).toBe(true)
  })

  /**
   * MUTATION that turns this red, after a control run: change the first sentence of `DELEGATION_NOTE`
   * in src/server/api/delegation.ts to a sentence that does not name the packaged tasks or the first
   * task. The door would then be served a sentence a new agent cannot act on.
   */
  it('tells a new agent the packaged tasks are there, and its first task is there', async () => {
    const { body } = await onboarding()
    const served = body.doors.find((one) => one.route === DELEGATION_DOOR)?.what ?? ''
    expect(served, 'the delegation door is served no sentence').not.toBe('')
    expect(served).toMatch(/packaged tasks/i)
    expect(served).toMatch(/new agent/i)
    expect(served).toMatch(/first task/i)
  })

  /**
   * MUTATION that turns this red, after a control run: lower `ONBOARDING_TOKEN_BUDGET` in
   * src/shared/onboarding.ts far below the read's real size. The read then drops a rung, `leftOut`
   * stops being empty and `fits` stops being true.
   */
  it('still fits its budget and drops nothing, and says its own size', async () => {
    const { body, raw } = await onboarding()
    // THE NUMBER IS CHECKED AGAINST THE REPLY THAT WAS REALLY SENT, not against a hopeful constant.
    expect(body.size.budgetTokensEstimated).toBe(ONBOARDING_TOKEN_BUDGET)
    expect(body.size.characters).toBeLessThanOrEqual(raw.length)
    expect(body.size.bytes).toBeGreaterThan(0)
    expect(body.size.tokensEstimated).toBeLessThanOrEqual(ONBOARDING_TOKEN_BUDGET)
    expect(body.size.fits).toBe(true)
    // A REPLY THAT FITS DROPS NOTHING AND SAYS SO, which is a real answer and not an absence.
    expect(body.leftOut).toEqual([])
    expect(body.leftOutNote).toContain('Nothing was left out')
  })
})
