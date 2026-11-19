// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE API'S MIDDLE LEVEL: FAMILIES DERIVED FROM THE PATH, ONE LINE EACH, AND A 404 THAT NAMES THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * GET /api answers all 370 doors with one line each: 375,875 bytes, about 94,000 estimated tokens.
 * An agent that needs a door outside the fifteen GET /api/onboarding names either reads the whole
 * thing or guesses, and the 404 for a wrong path named all 370 door names and none of the reasons.
 *
 * What was decided adds a middle level and nothing else:
 *
 *   - a door's family is the first path segment after `/api`, DERIVED and never declared, so there
 *     is no second classification beside `operation` to drift from the path;
 *   - GET /api/families answers every family with its name, its door count and one line;
 *   - GET /api/families/<name> (and GET /api?family=<name>) opens one family's doors;
 *   - a 404 names the families instead of every door, and names one family's doors when the caller
 *     was close.
 *
 * Every new test here is proved by mutation after a control run; the mutations and their sha256 are
 * in the worker's report, not in this file.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import {
  FAMILY_LINES,
  apiIndex,
  discoveryRoutes,
  familyIndexOf,
  familyLineOf,
  familyOf,
  familyView,
  noSuchEndpoint,
  trackApiRoutes,
  type ApiRoute,
  type FamilyView,
} from '../src/server/api/kinds.ts'
import { ONBOARDING_DOORS, ONBOARDING_TOKEN_BUDGET } from '@shared/onboarding.ts'

// -------------------------------------------------------------------------------- helpers

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`expected ${what} to be an object, got ${JSON.stringify(value)}`)
  }
  return value as Record<string, unknown>
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`expected ${what} to be an array, got ${JSON.stringify(value)}`)
  return value
}

/** "GET /api/kinds" for every door in one family's reply. */
const doorKeys = (family: FamilyView): string[] => family.endpoints.map((door) => `${door.method} ${door.path}`)

// ============================================================ the derivation, with no database

describe('a family is the first path segment after /api, derived and never declared', () => {
  let app: FastifyInstance
  let routes: readonly ApiRoute[]

  beforeAll(async () => {
    app = Fastify()
    const listRoutes = trackApiRoutes(app)
    await app.register(discoveryRoutes, {
      prefix: '/api',
      listRoutes,
      currentWorkspace: () => ({ current: 'default', stated: false }),
    })
    await app.ready()
    routes = listRoutes()
  })

  afterAll(async () => {
    await app.close()
  })

  it('reads the segment out of the path, and gives the front door its own family', () => {
    expect(familyOf('/api')).toBe('api')
    expect(familyOf('/api/')).toBe('api')
    expect(familyOf('/api/records')).toBe('records')
    expect(familyOf('/api/records/:id')).toBe('records')
    expect(familyOf('/api/kinds/:kind/compact')).toBe('kinds')
    expect(familyOf('/api/families/:name')).toBe('families')
  })

  it('derives every route\'s family from its own path, so nothing is declared twice', () => {
    for (const route of routes) {
      const segment = route.path === '/api' ? 'api' : (route.path.split('/')[2] ?? '')
      expect(familyOf(route.path), `${route.method} ${route.path}`).toBe(segment)
    }
  })

  it('counts the doors, and no door is in two families or none', () => {
    const index = familyIndexOf(routes)
    expect(index.families.reduce((total, family) => total + family.doors, 0)).toBe(routes.length)
    expect(index.families.length).toBeGreaterThan(1)
    for (const family of index.families) expect(family.doors).toBeGreaterThan(0)
  })

  it('opens one family with the doors in the shape GET /api already uses', () => {
    const kinds = familyView(routes, 'kinds')
    expect(kinds).not.toBeNull()
    expect(kinds?.doors).toBe(kinds?.endpoints.length)
    for (const door of kinds?.endpoints ?? []) {
      expect(typeof door.method).toBe('string')
      expect(typeof door.path).toBe('string')
      expect(door.description === null || typeof door.description === 'string').toBe(true)
    }
    expect(doorKeys(kinds as FamilyView)).toContain('GET /api/kinds/:kind')
    expect(familyView(routes, 'no-such-family-at-all')).toBeNull()
  })
})

describe('every family has one line, and a new family cannot arrive undescribed', () => {
  let app: FastifyInstance
  let routes: readonly ApiRoute[]

  beforeAll(async () => {
    app = Fastify()
    const listRoutes = trackApiRoutes(app)
    await app.register(discoveryRoutes, {
      prefix: '/api',
      listRoutes,
      currentWorkspace: () => ({ current: 'default', stated: false }),
    })
    await app.ready()
    routes = listRoutes()
  })

  afterAll(async () => {
    await app.close()
  })

  it('gives the front door, a one-door family and a many-door family a line each', () => {
    const index = familyIndexOf(routes)
    for (const family of index.families) {
      expect(family.line, `${family.name} is a family of this server and has no line`).not.toBeNull()
      expect(String(family.line).length, `${family.name}'s line is a placeholder`).toBeGreaterThan(20)
    }
    const single = index.families.find((family) => family.name === 'api')
    expect(single?.doors).toBe(1)
    expect(single?.line).toContain('every endpoint this server registered')
    const many = index.families.find((family) => family.name === 'kinds')
    expect(many?.doors).toBeGreaterThan(1)
    expect(many?.line).toBe(FAMILY_LINES.kinds)
  })

  it('proves the check can fail: a new family whose only door is undescribed has no line', () => {
    const invented: ApiRoute[] = [
      ...routes,
      { method: 'GET', path: '/api/brand-new-family/a-door', operation: 'project.index', reach: 'remote' },
    ]
    const family = familyIndexOf(invented).families.find((one) => one.name === 'brand-new-family')
    expect(family, 'the invented route is not in a family of its own').toBeDefined()
    // It has one door, nobody has described it, and nothing in FAMILY_LINES holds it, so the answer
    // is null — which is what the test above would catch on the day a real family arrived this way.
    expect(family?.line).toBeNull()
    expect(FAMILY_LINES['brand-new-family']).toBeUndefined()
  })

  it('takes a one-door family\'s line from that door\'s own description, cut to its first sentence', () => {
    // No second sentence is invented here: the line is the route's own words, cut where the
    // onboarding read cuts a door's sentence.
    const api = routes.filter((route) => route.path === '/api')
    const line = familyLineOf('api', api)
    expect(line).not.toBeNull()
    expect(line).not.toContain('. ')
    expect(line).toContain('every endpoint this server registered')
  })
})

// ==================================================== the middle level served, with a database

describe('GET /api/families and GET /api/families/:name, served by the real server', () => {
  let db: TestDb
  let app: FastifyInstance
  let routes: readonly ApiRoute[]

  beforeAll(async () => {
    db = await freshDb()
    const built = await apiApp()
    app = built.app
    routes = built.listApiRoutes()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    db.close()
  })

  it('answers every family with its name, its door count and its line', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/families' })
    expect(res.statusCode).toBe(200)
    const body = asObject(res.json(), 'family index')
    const families = asArray(body.families, 'families').map((one) => asObject(one, 'family'))

    const expected = familyIndexOf(routes).families
    expect(families.map((one) => one.name)).toEqual(expected.map((one) => one.name))
    expect(families.map((one) => one.doors)).toEqual(expected.map((one) => one.doors))
    for (const family of families) {
      expect(String(family.line).length, `${String(family.name)} has no line`).toBeGreaterThan(20)
    }
    // EVERY DOOR IS IN EXACTLY ONE FAMILY, counted from the reply rather than from the route table.
    const total = families.reduce((sum, one) => sum + Number(one.doors), 0)
    expect(total).toBe(routes.length)
    expect(String(body.opening)).toContain('/api/families/')
  })

  it('is a fraction of the whole index, which is the point of it', async () => {
    // The measurement the decision rests on: the middle level is cheap where GET /api is not.
    const families = await app.inject({ method: 'GET', url: '/api/families' })
    const whole = await app.inject({ method: 'GET', url: '/api' })
    expect(families.body.length).toBeLessThan(whole.body.length / 10)
  })

  it('holds a table line for every many-door family, and for no family that is not one', () => {
    const many = familyIndexOf(routes)
      .families.filter((family) => family.doors > 1)
      .map((family) => family.name)
      .sort()
    expect(Object.keys(FAMILY_LINES).sort()).toEqual(many)
  })

  it('opens one family\'s doors, and the largest family answers all of them', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/families/planning' })
    expect(res.statusCode).toBe(200)
    const body = asObject(res.json(), 'family') as unknown as FamilyView
    expect(body.name).toBe('planning')
    expect(body.doors).toBe(body.endpoints.length)
    expect(body.line).toBe(FAMILY_LINES.planning)
    expect(doorKeys(body)).toContain('GET /api/planning/:horizon/:period')

    // Every door the reply names is a route the server really serves.
    const live = new Set(routes.map((route) => `${route.method} ${route.path}`))
    for (const key of doorKeys(body)) expect(live, `the family names ${key}`).toContain(key)
  })

  it('answers 404 with the family list when the family name is not one', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/families/recordsz' })
    expect(res.statusCode).toBe(404)
    const body = asObject(res.json(), 'unknown family')
    expect(String(body.error)).toContain('recordsz')
    expect(String(body.error)).toContain('records')
    expect(asArray(body.families, 'families').length).toBe(familyIndexOf(routes).families.length)
  })

  it('answers GET /api?family=<name> with what GET /api/families/<name> answers', async () => {
    const byParam = await app.inject({ method: 'GET', url: '/api?family=records' })
    const byPath = await app.inject({ method: 'GET', url: '/api/families/records' })
    expect(byParam.statusCode).toBe(200)
    expect(byPath.statusCode).toBe(200)
    expect(byParam.json()).toEqual(byPath.json())

    // And an unknown name is the same 404 either way.
    const unknown = await app.inject({ method: 'GET', url: '/api?family=recordsz' })
    expect(unknown.statusCode).toBe(404)
    expect(String(asObject(unknown.json(), 'unknown family').error)).toContain('recordsz')
  })

  it('leaves GET /api without the parameter exactly as it was, and points at the middle level', async () => {
    const body = asObject((await app.inject({ method: 'GET', url: '/api' })).json(), 'index')
    const endpoints = asArray(body.endpoints, 'endpoints')
    expect(endpoints.length).toBe(routes.length)
    expect(String(body.startHere)).toContain('/api/families')
    expect(String(body.startHere)).toContain('/api/kinds')
    expect(Object.hasOwn(body, 'families')).toBe(false)
  })
})

// ================================================================== the 404 that names families

describe('an /api path that matches nothing names families, not 370 doors', () => {
  const routes: ApiRoute[] = [
    { method: 'GET', path: '/api', operation: 'project.index', reach: 'remote' },
    { method: 'GET', path: '/api/kinds', operation: 'project.schema', reach: 'remote' },
    { method: 'GET', path: '/api/kinds/:kind', operation: 'project.schema', reach: 'remote' },
    { method: 'GET', path: '/api/records', operation: 'record.list', reach: 'remote' },
    { method: 'POST', path: '/api/records', operation: 'record.write', reach: 'remote' },
  ]

  it('still says what was wrong, and keeps the sentence about GET /api', () => {
    const body = noSuchEndpoint('GET', '/api/schema', routes)
    expect(body.error).toContain('No such endpoint')
    expect(body.error).toContain('/api/schema')
    expect(body.error).toContain('GET /api')
  })

  it('hands back the families instead of the door names', () => {
    const body = noSuchEndpoint('GET', '/api/schema', routes)
    expect(body.endpoints).toBeUndefined()
    expect(body.families?.map((family) => family.name)).toEqual(['api', 'kinds', 'records'])
    expect(body.families?.find((family) => family.name === 'kinds')?.doors).toBe(2)
    expect(body.opening).toContain('/api/families/')
  })

  it('names one family\'s doors when the caller was close, instead of the family list', () => {
    // The first segment IS a family, so the useful answer is the doors inside it.
    const body = noSuchEndpoint('GET', '/api/records/one/two/three', routes)
    expect(body.families).toBeUndefined()
    expect(body.endpoints).toEqual(['GET /api/records', 'POST /api/records'])
    expect(body.error).toContain('records')
  })

  it('still suggests the path a near miss was meant to be, and ignores the query string', () => {
    expect(noSuchEndpoint('GET', '/api/kindsx', routes).error).toContain('/api/kinds')
    expect(noSuchEndpoint('GET', '/api/kindsx?kind=module', routes).error).toContain('/api/kinds')
  })

  it('offers nothing when nothing is close, rather than a confident wrong guess', () => {
    expect(noSuchEndpoint('GET', '/api/completely-different-thing', routes).error).not.toMatch(/did you mean/i)
  })

  it('never names a family the route table does not hold', () => {
    const body = noSuchEndpoint('GET', '/api/completely-different-thing', routes)
    const live = new Set(routes.map((route) => familyOf(route.path)))
    for (const family of body.families ?? []) expect(live, `${family.name} is not a family`).toContain(family.name)
  })
})

// ============================================================ the middle level in the front door

describe('the onboarding read points at the middle level and still fits its budget', () => {
  let db: TestDb
  let app: FastifyInstance

  beforeAll(async () => {
    db = await freshDb()
    const built = await apiApp()
    app = built.app
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    db.close()
  })

  it('names GET /api/families among its doors, as a route the server really serves', async () => {
    expect(ONBOARDING_DOORS).toContain('GET /api/families')
    const res = await app.inject({ method: 'GET', url: '/api/onboarding' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { doors: { route: string; what: string }[] }
    const door = body.doors.find((one) => one.route === 'GET /api/families')
    expect(door, 'the onboarding read does not name GET /api/families').toBeDefined()
    expect(String(door?.what).length).toBeGreaterThan(0)
  })

  it('still fits the budget it states, and drops nothing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/onboarding' })
    const body = res.json() as {
      size: { tokensEstimated: number; budgetTokensEstimated: number; fits: boolean }
      leftOut: unknown[]
    }
    expect(body.size.budgetTokensEstimated).toBe(ONBOARDING_TOKEN_BUDGET)
    expect(body.size.tokensEstimated).toBeLessThanOrEqual(ONBOARDING_TOKEN_BUDGET)
    expect(body.size.fits).toBe(true)
    expect(body.leftOut).toEqual([])
  })
})

// ==================================================== and the front door lists the new routes

describe('the two new doors are described on GET /api like every other', () => {
  it('is true of the pure index too: a family route is a door with a sentence', () => {
    const index = apiIndex(
      [
        { method: 'GET', path: '/api', operation: 'project.index', reach: 'remote' },
        { method: 'GET', path: '/api/families', operation: 'project.index', reach: 'remote', note: 'x'.repeat(60) },
      ],
      { current: 'default', stated: false },
    )
    expect(index.endpoints.map((endpoint) => endpoint.path)).toContain('/api/families')
    expect(index.endpoints.find((endpoint) => endpoint.path === '/api/families')?.description).not.toBeNull()
  })
})
